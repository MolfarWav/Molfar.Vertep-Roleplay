
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { PaperPlaneRight, Square, ArrowsClockwise, CaretDoubleRight, User, Paperclip, X, FileText, Plus, Image as ImageIcon, Lightning, ArrowsOut, MagicWand, CircleNotch, ChatTeardropText, Sparkle } from '@phosphor-icons/react'
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { QuickReplyBar } from "@/components/chat/qr-bar"
import { StoryNudgeButton, StoryNudgeChip } from "@/components/chat/story-nudge"
import { useDashMaybe } from "@/components/dashboard/dash-context"
import { ExpandedEditor } from "@/components/chat/expanded-editor"
import { ImageGenDialog, type ImageGenStart } from "@/components/chat/image-gen-dialog"
import { GalleryDialog } from "@/components/chat/gallery-dialog"
import { IMAGE_MODES, buildImagePrompt, describeForImage, generateImage, parseImagineArg, resolvePromptStyle } from "@/lib/image-gen"
import {
  AutocompletePopup, detectTrigger, fuzzy, getSlashCommands, MACROS,
  type AcItem, type Trigger,
} from "@/components/chat/composer-autocomplete"
import { useT } from '@/hooks/use-t'
import { RegenerateHintDialog } from '@/components/chat/regenerate-hint-dialog'
import { useApp } from "@/lib/store"
import { useFinePointer, useLastPointer, useTouchUi } from "@/hooks/use-touch-ui"
import { uid } from "@/lib/tokens"
import { fileToRawDataUrl } from "@/lib/engine"
import { cn } from "@/lib/utils"
import type { ID, Message, QuickReply } from "@/lib/types"
import { toast } from "sonner"
import { useGuidePlace } from '@/components/guide/place'
import { DEFAULT_AVATAR } from '../../lib/utils'
import { draftKey, fillAction, readDraft, unsavedKeys } from '@/lib/drafts'

type Attachment = NonNullable<Message["attachments"]>[number]

// Unsent text is saved per chat (lib/drafts). Attachments stay in memory
// only — data-URL bytes would blow the storage quota.

// Touch devices (phones, tablets): Enter inserts a newline — sending is the
// send button, the mobile chat convention; "send on Enter" stays a desktop
// behavior where a hardware Enter key exists. Live-subscribed so DevTools
// device emulation toggled after load switches too, and the last real pointer
// overrules the media queries: a phone whose build advertises a fine pointer
// reports a desktop, but a finger tap says otherwise.

/**
 * Minimal composer: one menu button, the input, one send button.
 * Everything else (regenerate / continue / impersonate / images / persona /
 * quick replies / chat files) lives inside the menu so the row never clutters.
 */
export function Composer({ chatId }: { chatId: ID }) {
  useGuidePlace('chat') // the composer tour starts here
  const touchUi = useTouchUi()
  const finePointer = useFinePointer()
  const lastPointer = useLastPointer()
  const sendMessage = useApp((s) => s.sendMessage)
  const stopStreaming = useApp((s) => s.stopStreaming)
  const regenerate = useApp((s) => s.regenerate)
  const continueReply = useApp((s) => s.continueReply)
  const impersonate = useApp((s) => s.impersonate)
  const polishDraft = useApp((s) => s.polishDraft)
  const addSwipe = useApp((s) => s.addSwipe)
  const sendOnEnter = useApp((s) => s.settings.sendOnEnter)
  const upArrowEditLast = useApp((s) => s.settings.upArrowEditLast)
  const chatWidth = useApp((s) => s.settings.chatWidth)
  const pushInputHistory = useApp((s) => s.pushInputHistory)
  const inputHistory = useApp((s) => s.inputHistory)
  const fill = useApp((s) => s.composerDrafts[chatId])
  const dropComposerDraft = useApp((s) => s.dropComposerDraft)
  const qrSets = useApp((s) => s.qrSets)
  const characters = useApp((s) => s.characters)
  const setHelpOpen = useApp((s) => s.setHelpOpen)
  const imageGen = useApp((s) => s.settings.imageGen)
  const postPicture = useApp((s) => s.postPicture)
  const chatModel = useApp((s) => s.modelFor(chatId))
  const t = useT()
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const characterId = chat?.characterId ?? null
  const character = characters.find((c) => c.id === characterId)
  const isGroup = !!character?.isGroup

  const [draft, setDraft] = useState(() => ({ chatId, text: readDraft(chatId) }))
  const value = draft.chatId === chatId ? draft.text : readDraft(chatId)
  const setValue = useCallback((text: string) => {
    try {
      if (text) localStorage.setItem(draftKey(chatId), text)
      else localStorage.removeItem(draftKey(chatId))
    } catch { /* storage unavailable */ }
    setDraft({ chatId, text })
  }, [chatId])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [expandOpen, setExpandOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  // a hint regenerates the newest reply, so there must be one
  const hasReply = !!chat?.messages.some((m) => m.role === 'assistant' && !m.picture)
  const [qrOpen, setQrOpen] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [acIndex, setAcIndex] = useState(0)
  const [acDismissed, setAcDismissed] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [imgStart, setImgStart] = useState<ImageGenStart>({ mode: 'scene' })
  const [imgBusy, setImgBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // A draft that wrapped gets the whole row and the buttons move under it:
  // beside it they left about four words per line on a phone and empty
  // columns down both sides on desktop (GitHub #20).
  // It goes back only when the box is empty: the wider box would fit the text
  // on fewer lines and flip the layout back and forth while typing.
  const [wide, setWide] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const isStreaming = useApp((s) => s.streaming?.chatId === chatId)
  // An empty box sends too (it becomes a bare continue turn), so
  // the send button stays live even with nothing typed.
  const canSend = !isStreaming
  const dashCtx = useDashMaybe()
  const nudgeArmed = !!(dashCtx?.view?.nudge ?? dashCtx?.data?.nudge)

  /**
   * Auto-fit: collapse to 1px so `scrollHeight`
   * reports the true content height, then grow to exactly that, capped at 50dvh
   * by CSS. The chat log is scroll-compensated by the same delta the box grew,
   * so the message you were reading never slides behind the composer
   * (user: "when it expands up it has to move the chat up with it").
   */
  const autoFit = () => {
    const el = textareaRef.current
    if (!el) return
    const before = el.offsetHeight
    el.style.height = '1px'
    el.style.height = `${el.scrollHeight}px`
    const after = el.offsetHeight
    if (!el.value) setWide(false)
    else if (after > 44) setWide(true)
    // Most keystrokes do not change the box height at all; when nothing moved
    // there is nothing to compensate, and the chat log is never measured.
    if (after === before) return
    // The log's own content height is unchanged — only its viewport grew or
    // shrank — so shifting the scroll by the same delta keeps the line you
    // were reading in place instead of sliding it behind the composer.
    const log = document.querySelector<HTMLElement>('[data-chat-log]')
    if (log) log.scrollTop += after - before
  }

  // Re-fit whenever the text changes from anywhere (typing, drafts, slash
  // insertions, quick replies, clearing after send). Layout effect, not a
  // passive one: resizing after paint shows a frame at the old height.
  useLayoutEffect(autoFit, [value, wide])

  // Text waiting for this chat: a "Write for me" result, or a message that was
  // not sent. It goes in only while the draft still reads what it read when the
  // request started; text typed since is never overwritten, the fill is offered
  // instead (GitHub #29, #30). A replaced draft is kept for one Undo.
  useEffect(() => {
    if (!fill) return
    dropComposerDraft(chatId, fill.id)
    const now = readDraft(chatId)
    const put = () => {
      const before = readDraft(chatId)
      setValue(fill.text)
      if (fill.attachments?.length) setAttachments((prev) => [...prev, ...fill.attachments!])
      textareaRef.current?.focus()
      if (before.trim() && before !== fill.text) {
        toast(t('composer.draftReplaced'), { action: { label: t('composer.undo'), onClick: () => setValue(before) } })
      }
    }
    if (fillAction(fill.base, now) === 'put') {
      put()
      if (fill.kind === 'unsent') toast(t('composer.unsentBack'))
    } else {
      toast(t(fill.kind === 'unsent' ? 'composer.unsentOffer' : fill.kind === 'polish' ? 'composer.polishOffer' : 'composer.writeForMeOffer'), {
        duration: 20000,
        action: { label: t('composer.putIn'), onClick: put },
      })
    }
  }, [fill, chatId, dropComposerDraft, setValue, t])
  const writeForMe = () => {
    void impersonate(chatId)
  }
  const canPolish = !!value.trim()
  const polish = () => {
    if (canPolish) polishDraft(chatId, value)
  }

  // The shell refused to store this chat's draft (its storage is full): the
  // text is still here, but a reload of the whole page would lose it (GitHub #27).
  const [unsavedList, setUnsavedList] = useState<string[]>(() => unsavedKeys())
  useEffect(() => {
    const on = () => setUnsavedList(unsavedKeys())
    window.addEventListener('chrysalis:storage', on)
    return () => window.removeEventListener('chrysalis:storage', on)
  }, [])
  const draftUnsaved = !!value && unsavedList.includes(draftKey(chatId))
  const copyDraft = () => {
    void navigator.clipboard?.writeText(value).then(
      () => toast.success(t('composer.copied')),
      () => toast.error(t('composer.copyFailed')),
    )
  }

  const dropDraft = () => {
    try { localStorage.removeItem(draftKey(chatId)) } catch { /* storage unavailable */ }
  }

  // ── Autocomplete ──
  const caret = textareaRef.current?.selectionStart ?? value.length
  const trigger: Trigger | null = acDismissed || expandOpen ? null : detectTrigger(value, caret, isGroup)

  const acItems: AcItem[] = useMemo(() => {
    if (!trigger) return []
    let pool: AcItem[] = []
    if (trigger.type === "slash") pool = getSlashCommands(qrSets, !!imageGen?.enabled)
    else if (trigger.type === "macro") pool = MACROS.map((m) => ({
      key: m.name, label: `{{${m.name}}}`, insert: `{{${m.name}}}`, hint: m.hint, kind: "macro" as const,
    }))
    else if (trigger.type === "mention" && character?.members) pool = character.members
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ key: c.id, label: `@${c.name}`, insert: `@${c.name} `, hint: "Address this member", kind: "slash" as const }))
    return pool
      .map((item) => ({ item, score: fuzzy(trigger.query, item.label) }))
      .filter((x): x is { item: AcItem; score: number } => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((x) => x.item)
  }, [trigger, qrSets, character, characters])

  useEffect(() => { setAcIndex(0) }, [trigger?.type, trigger?.query])
  useEffect(() => { setAcDismissed(false) }, [value])

  const runQuickReply = (r: QuickReply) => {
    if (r.mode === "insert") {
      insertAtCaret(r.message)
      return
    }
    executeSlashOrSend(r.message)
  }

  /**
   * `/imagine` with nothing or a mode word (you, me, face, scene, background)
   * has the chat model describe the picture; any other text is the
   * description itself. Interactive mode previews in a dialog first;
   * otherwise the picture is drawn and posted in one go.
   */
  const startImageGen = async (arg = "") => {
    if (!imageGen?.enabled) {
      toast.error("Image generation is off", { description: "Turn it on in Tools → Image Generation." })
      return
    }
    const start = parseImagineArg(arg)
    if (imageGen.interactive) {
      setImgStart(start)
      setImgOpen(true)
      return
    }
    setImgBusy(true)
    const toastId = toast.loading("mode" in start ? "Reading the chat…" : "Drawing…")
    try {
      const subject = "text" in start ? start.text : await describeForImage(chatId, start.mode, chatModel, resolvePromptStyle(imageGen), imageGen?.modelInstructions)
      toast.loading("Drawing…", { id: toastId })
      const img = await generateImage({
        prompt: buildImagePrompt(imageGen, subject),
        negativePrompt: imageGen.negativePrompt,
        model: imageGen.model || undefined,
      })
      await postPicture(chatId, img)
      toast.success("Picture posted", { id: toastId })
    } catch (err) {
      toast.error("Image generation failed", { id: toastId, description: (err as Error).message })
    } finally {
      setImgBusy(false)
    }
  }

  /** Runs a slash command, or sends plain text. Returns false for an
   *  unknown command so the caller can keep the typed text. */
  const executeSlashOrSend = (text: string): boolean => {
    const t = text.trim()
    if (t === "/continue") { void continueReply(chatId); return true }
    if (t === "/impersonate") { void impersonate(chatId); return true }
    if (t === "/regenerate" || t === "/regen") { void regenerate(chatId); return true }
    if (t === "/swipe") { void addSwipe(chatId); return true }
    // /help and /gallery open UI only — never sent to the model
    if (t === "/help") { setHelpOpen(true); return true }
    if (t === "/gallery") { setGalleryOpen(true); return true }
    // `/imagine` reads the chat; `/imagine <words>` draws exactly those words
    const imagine = t.match(/^\/(?:imagine|image|gen)\b\s*(.*)$/s)
    if (imagine) { void startImageGen(imagine[1]); return true }
    if (t.startsWith("/")) {
      toast.error(`Unknown command: ${t.split(/\s/)[0]}`, { description: "/help lists every command." })
      return false
    }
    if (!isStreaming) sendMessage(chatId, t)
    return true
  }

  const insertAtCaret = (text: string) => {
    const el = textareaRef.current
    const pos = el?.selectionStart ?? value.length
    const next = value.slice(0, pos) + text + value.slice(pos)
    setValue(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos + text.length, pos + text.length)
    })
  }

  const applyAcItem = (item: AcItem) => {
    if (!trigger) return
    // Argument-taking commands are typed out and left for the user to finish;
    // everything else fires the moment it is picked.
    if (trigger.type === "slash" && item.takesArgs) {
      const next = `${item.label} `
      setValue(next)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(next.length, next.length)
      })
      return
    }
    if (trigger.type === "slash" && item.action && item.action !== "send" && item.insert === "") {
      setValue("")
      executeSlashOrSend(item.label)
      return
    }
    if (trigger.type === "slash" && item.action === "send") {
      setValue("")
      executeSlashOrSend(item.insert)
      return
    }
    const before = value.slice(0, trigger.start)
    const after = value.slice(caret)
    const insert = item.insert || item.label
    const next = before + insert + after
    setValue(next)
    const newPos = before.length + insert.length
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newPos, newPos)
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    // attachments persist on the engine's message records — read them as
    // data URLs so they survive reloads (object URLs die with the page)
    const next: Attachment[] = []
    for (const f of Array.from(files)) {
      if (f.size > 2 * 1024 * 1024) {
        toast.error(`${f.name} is too large`, { description: 'Attachments are capped at 2 MB.' })
        continue
      }
      try {
        next.push({ id: uid('att'), name: f.name, type: f.type || 'application/octet-stream', url: await fileToRawDataUrl(f) })
      } catch {
        toast.error(`Could not read ${f.name}`)
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }

  const handleSend = () => {
    const text = value.trim()
    if (isStreaming) return
    // An empty send submits LITERALLY empty text — the reply is generated with
    // no user turn added, and no hidden "[Continue the story naturally.]"
    // nudge is ever written into the message body.
    if (text.startsWith("/")) {
      const handled = executeSlashOrSend(text)
      if (handled) {
        setValue("")
        dropDraft()
        setExpandOpen(false)
      }
      return
    }
    // an armed "Story, move" with an empty box: the character carries on with no user turn at
    // all, even when the preset turns an empty send into text (a send_if_empty of "..." left a
    // "..." turn the nudge then had nothing to stand on)
    const sentAttachments = attachments
    void sendMessage(chatId, text, { attachments, ...(!text && nudgeArmed ? { noEmptySend: true } : {}) }).then((outcome) => {
      // not in the chat: the text and attachments come back (to an empty box, else offered)
      if (outcome !== 'not-sent' || (!text && !sentAttachments.length)) return
      useApp.setState((s) => ({ composerDrafts: { ...s.composerDrafts, [chatId]: { id: uid('fill'), chatId, text, base: '', kind: 'unsent', attachments: sentAttachments } } }))
    })
    if (text) pushInputHistory(text)
    setValue("")
    dropDraft()
    setAttachments([])
    setHistoryIdx(-1)
    setExpandOpen(false)
    // Tapping send blurs the input, so refocusing here would reopen the
    // on-screen keyboard on touch — leave focus where it is on touch, keep
    // the desktop flow (cursor back in the box) as-is.
    if (!touchUi) textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    // Shift+Tab opens the full-height writing surface.
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault()
      setExpandOpen(true)
      return
    }
    if (trigger && acItems.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAcIndex((i) => (i + 1) % acItems.length); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setAcIndex((i) => (i - 1 + acItems.length) % acItems.length); return }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); applyAcItem(acItems[acIndex] ?? acItems[0]!); return }
      if (e.key === "Escape") { e.preventDefault(); setAcDismissed(true); return }
    }
    if (e.key === "Enter" && !e.shiftKey && sendOnEnter && lastPointer !== "touch" && (!touchUi || finePointer)) {
      e.preventDefault()
      handleSend()
    } else if (e.key === "ArrowUp" && value === "" && inputHistory.length > 0 && upArrowEditLast) {
      e.preventDefault()
      const idx = historyIdx < 0 ? inputHistory.length - 1 : Math.max(0, historyIdx - 1)
      setHistoryIdx(idx)
      setValue(inputHistory[idx] ?? "")
    }
  }

  const spanFull = chatWidth === 'full'

  return (
    // Full width: the classic edge-to-edge bar. Narrower chat styles: the bar
    // is a floating card that matches the chat column, with rounded edges
    // (user feedback: the bar should end where the chat ends).
    <div
      className={
        spanFull
          ? 'border-t border-border bg-card/80 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm'
          : 'px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      }
    >
      <div className={cn('chat-column', !spanFull && 'rounded-xl border border-border bg-card/80 px-2 py-2 shadow-sm backdrop-blur-sm')}>
      {/* Quick replies are opt-in from the menu so the default view stays clean. */}
      {qrOpen && (
        <div className="mb-1.5">
          <QuickReplyBar onRun={runQuickReply} onClose={() => setQrOpen(false)} />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background p-1 pr-1.5">
              {a.type.startsWith("image/") && a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url || DEFAULT_AVATAR} alt={a.name} className="size-10 rounded object-cover" />
              ) : (
                <FileText className="size-5 text-muted-foreground" aria-hidden />
              )}
              <span className="max-w-32 truncate text-[11px]">{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                aria-label={`Remove attachment ${a.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {draftUnsaved && (
        <div role="status" className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-foreground">
          <span className="min-w-0 flex-1">{t('composer.unsaved')}</span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" onClick={copyDraft}>
            {t('composer.copyDraft')}
          </Button>
        </div>
      )}

      <StoryNudgeChip chatId={chatId} />

      {/* Menu · input · "Story, move" (only with the dashboard plugin) · send. */}
      <div className="flex flex-wrap items-end gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button data-guide="composer.options" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Message options">
                <Plus className="size-4.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Generate</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => regenerate(chatId)} disabled={isStreaming}>
                <ArrowsClockwise className="size-4" /> Regenerate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHintOpen(true)} disabled={isStreaming || !hasReply}>
                <ChatTeardropText className="size-4" /> {t('regen.hint.menu')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => continueReply(chatId)} disabled={isStreaming}>
                <CaretDoubleRight className="size-4" /> Continue
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => impersonate(chatId)} disabled={isStreaming}>
                <User className="size-4" /> Impersonate
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
            <DropdownMenuLabel>Compose</DropdownMenuLabel>
            <DropdownMenuItem onClick={polish} disabled={isStreaming || !canPolish}>
              <Sparkle className="size-4" /> {t('composer.polish')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setExpandOpen(true)}>
              <ArrowsOut className="size-4" /> Expand editor
              <span className="ml-auto text-[10px] text-muted-foreground">⇧Tab</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => imageRef.current?.click()}>
              <ImageIcon className="size-4" /> Send image
            </DropdownMenuItem>
            {/* Only offered once the extension is switched on, so the menu does
                not advertise a feature that would just error. */}
            {imageGen?.enabled && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={imgBusy}>
                  {imgBusy ? <CircleNotch className="size-4 animate-spin" /> : <MagicWand className="size-4" />}
                  Generate image
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {IMAGE_MODES.map((m) => (
                    <DropdownMenuItem key={m.mode} onClick={() => void startImageGen(m.words[0])}>
                      {m.label}
                      <span className="ml-auto text-[10px] text-muted-foreground">/imagine {m.words[0]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" /> Attach files
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQrOpen((v) => !v)}>
              <Lightning className="size-4" /> {qrOpen ? "Hide shortcuts" : "Shortcuts"}
            </DropdownMenuItem>
            {/* Dictate (STT) and draft translation need engine-side services
                that don't exist yet — the menu doesn't offer them rather than
                fake them. */}
            </DropdownMenuGroup>
            {/* Start a new chat, delete messages, manage chat files and the
                persona live in the chat menu: this menu keeps the quick
                actions on the message being written or the next reply. */}
          </DropdownMenuContent>
        </DropdownMenu>

        {characterId && (
          <>
            <GalleryDialog
              open={galleryOpen}
              onOpenChange={setGalleryOpen}
              characterId={characterId}
              onAttach={(item) => setAttachments((prev) => [...prev, { id: uid('att'), ...item }])}
            />
          </>
        )}

        <div className={cn("relative min-w-0 flex-1", wide && "order-first basis-full")}>
          {trigger && acItems.length > 0 && (
            <AutocompletePopup items={acItems} activeIndex={acIndex} onSelect={applyAcItem} onHover={setAcIndex} />
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message…"
            aria-label="Message input"
            data-guide="composer.input"
            aria-keyshortcuts="Shift+Tab"
            // mobile keyboards compose/highlight the word being typed and
            // fight asterisks/quotes/macros — off keeps plain text entry plain
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            // `block` is load-bearing: as an inline-block the textarea sits on
            // the text baseline, leaving ~6px of descender space beneath it in
            // the wrapper, which pushed the send button lower than the input
            // ("the send button is not aligned with the text box").
            // `h-9` matches the 36px buttons so the row lines up at rest;
            // `autoFit` overwrites the inline height as content grows, capped
            // at half the viewport. `leading-5`/`py-2` keep one line at 36px.
            className="block h-9 max-h-[50dvh] w-full resize-none overflow-y-auto rounded-md border border-border bg-background px-3 py-2 text-base leading-5 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring sm:text-sm"
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.pdf,.json"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = "" }}
        />
        <input
          ref={imageRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = "" }}
        />

        {/* in the two-row layout the space between "+" and send holds the moves
            people use most, out of the "+" menu; this pair sits at the right end.
            On a phone only Write for me and the big editor: Continue and Another
            stay in the "+" menu, so the composer keeps to two rows */}
        {wide && !isStreaming && (
          <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Quick moves">
            <Button variant="outline" size="sm" className="h-9 gap-1 max-sm:hidden border-primary/50 bg-primary/15 px-2.5 text-xs font-semibold text-primary hover:bg-primary/25 hover:text-primary" onClick={() => continueReply(chatId)} title="Continue the last reply">
              <CaretDoubleRight className="size-4" aria-hidden="true" /><span className="max-[380px]:sr-only">Continue</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1 border-group/50 bg-group/15 px-2.5 text-xs font-semibold text-group hover:bg-group/25 hover:text-group" onClick={writeForMe} title="Write your next message for you (your draft can be brought back)">
              <User className="size-4" aria-hidden="true" /><span className="max-[380px]:sr-only">Write for me</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1 border-teal-500/50 bg-teal-500/15 px-2.5 text-xs font-semibold text-teal-700 hover:bg-teal-500/25 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-300" onClick={polish} disabled={!canPolish} title={t('composer.polishTitle')}>
              <Sparkle className="size-4" aria-hidden="true" /><span className="max-[380px]:sr-only">{t('composer.polish')}</span>
            </Button>
            {hasReply && (
              <Button variant="outline" size="sm" className="h-9 gap-1 max-sm:hidden border-amber-500/50 bg-amber-500/15 px-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/25 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300" onClick={() => regenerate(chatId)} title="Another version of the last reply">
                <ArrowsClockwise className="size-4" aria-hidden="true" /><span className="max-[380px]:sr-only">Another</span>
              </Button>
            )}
            <Button variant="outline" size="icon" className="size-9 shrink-0" onClick={() => setExpandOpen(true)} aria-label="Bigger editor (Shift+Tab)" title="Bigger editor (Shift+Tab)">
              <ArrowsOut className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
        {wide && <span aria-hidden className="flex-1" />}
        <StoryNudgeButton chatId={chatId} isStreaming={isStreaming} />

        {isStreaming ? (
          <Button variant="destructive" size="icon" className="size-9 shrink-0" onClick={stopStreaming} aria-label="Stop generating">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-9 shrink-0"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            data-guide="composer.send"
          >
            <PaperPlaneRight className="size-4" />
          </Button>
        )}
      </div>
      </div>

      <ExpandedEditor
        open={expandOpen}
        onOpenChange={setExpandOpen}
        value={value}
        onChange={setValue}
        onSend={handleSend}
        canSend={canSend}
        placeholder="Write as much as you like. Shift+Tab collapses, Ctrl+Enter sends."
      />
      <RegenerateHintDialog chatId={chatId} open={hintOpen} onOpenChange={setHintOpen} />

      {imageGen?.enabled && (
        <ImageGenDialog
          open={imgOpen}
          onOpenChange={setImgOpen}
          settings={imageGen}
          chatId={chatId}
          chatModel={chatModel}
          start={imgStart}
          onAccept={(img) => postPicture(chatId, img)}
        />
      )}
    </div>
  )
}
