
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { PaperPlaneRight, Square, ArrowsClockwise, CaretDoubleRight, User, FolderOpen, Paperclip, X, FileText, Plus, Image as ImageIcon, Lightning, ArrowsOut, UserCircle, Check, Trash, MagicWand, CircleNotch, ChatCenteredText } from '@phosphor-icons/react'
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { ManageChatsDialog } from "@/components/chat/manage-chats-dialog"
import { QuickReplyBar } from "@/components/chat/qr-bar"
import { StoryNudgeButton, StoryNudgeChip } from "@/components/chat/story-nudge"
import { useDashMaybe } from "@/components/dashboard/dash-context"
import { ExpandedEditor } from "@/components/chat/expanded-editor"
import { ImageGenDialog, type ImageGenStart } from "@/components/chat/image-gen-dialog"
import { GalleryDialog } from "@/components/chat/gallery-dialog"
import { IMAGE_MODES, buildImagePrompt, describeForImage, generateImage, parseImagineArg } from "@/lib/image-gen"
import {
  AutocompletePopup, detectTrigger, fuzzy, getSlashCommands, MACROS,
  type AcItem, type Trigger,
} from "@/components/chat/composer-autocomplete"
import { useApp } from "@/lib/store"
import { useFinePointer, useLastPointer, useTouchUi } from "@/hooks/use-touch-ui"
import { uid } from "@/lib/tokens"
import { fileToRawDataUrl } from "@/lib/engine"
import { cn } from "@/lib/utils"
import type { ID, Message, QuickReply } from "@/lib/types"
import { toast } from "sonner"
import { DEFAULT_AVATAR } from '../../lib/utils'

type Attachment = NonNullable<Message["attachments"]>[number]

/** Unsent composer text lives under a per-chat key so a reload, rebuild, or
 *  chat switch never eats a half-written thought. Attachments stay in memory
 *  only — data-URL bytes would blow the storage quota. */
const draftKey = (chatId: ID) => `chrysalis.roleplay.draft.${chatId}`
const readDraft = (chatId: ID): string => {
  try { return localStorage.getItem(draftKey(chatId)) ?? "" } catch { return "" }
}

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
  const touchUi = useTouchUi()
  const finePointer = useFinePointer()
  const lastPointer = useLastPointer()
  const sendMessage = useApp((s) => s.sendMessage)
  const stopStreaming = useApp((s) => s.stopStreaming)
  const regenerate = useApp((s) => s.regenerate)
  const continueReply = useApp((s) => s.continueReply)
  const impersonate = useApp((s) => s.impersonate)
  const addSwipe = useApp((s) => s.addSwipe)
  const sendOnEnter = useApp((s) => s.settings.sendOnEnter)
  const upArrowEditLast = useApp((s) => s.settings.upArrowEditLast)
  const chatWidth = useApp((s) => s.settings.chatWidth)
  const pushInputHistory = useApp((s) => s.pushInputHistory)
  const inputHistory = useApp((s) => s.inputHistory)
  const composerDraft = useApp((s) => s.composerDraft)
  const setComposerDraft = useApp((s) => s.setComposerDraft)
  const qrSets = useApp((s) => s.qrSets)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const updateChat = useApp((s) => s.updateChat)
  const setView = useApp((s) => s.setView)
  const setDeleteMode = useApp((s) => s.setDeleteMode)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const setHelpOpen = useApp((s) => s.setHelpOpen)
  const imageGen = useApp((s) => s.settings.imageGen)
  const postPicture = useApp((s) => s.postPicture)
  const chatModel = useApp((s) => s.model)
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const characterId = chat?.characterId ?? null
  const activePersonaId = chat?.personaId ?? personas.find((p) => p.isDefault)?.id ?? null
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
  const [manageOpen, setManageOpen] = useState(false)
  const [expandOpen, setExpandOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [acIndex, setAcIndex] = useState(0)
  const [acDismissed, setAcDismissed] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [imgStart, setImgStart] = useState<ImageGenStart>({ mode: 'scene' })
  const [imgBusy, setImgBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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
  useLayoutEffect(autoFit, [value])

  // Consume drafts pushed by impersonate
  useEffect(() => {
    if (composerDraft != null) {
      setValue(composerDraft)
      setComposerDraft(null)
      textareaRef.current?.focus()
    }
  }, [composerDraft, setComposerDraft, setValue])

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
      const subject = "text" in start ? start.text : await describeForImage(chatId, start.mode, chatModel)
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
    sendMessage(chatId, text, { attachments, ...(!text && nudgeArmed ? { noEmptySend: true } : {}) })
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

      <StoryNudgeChip chatId={chatId} />

      {/* Menu · input · "Story, move" (only with the dashboard plugin) · send. */}
      <div className="flex items-end gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Message options">
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
            {/* Personas are listed inline so switching is one hop, rather than
                toggling an extra row above the composer. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserCircle className="size-4" /> Speak as…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                {personas.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      updateChat(chatId, { personaId: p.id })
                      toast.success(`Speaking as ${p.name}`)
                    }}
                  >
                    <img src={p.avatar || DEFAULT_AVATAR} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.id === activePersonaId && <Check className="size-3.5 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("personas")}>
                  <User className="size-4" /> Manage personas
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* Dictate (STT) and draft translation need engine-side services
                that don't exist yet — the menu doesn't offer them rather than
                fake them. */}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {characterId && (
              <DropdownMenuItem onClick={() => void startChatAndOpen(characterId)} disabled={isStreaming}>
                <ChatCenteredText className="size-4" /> Start new chat
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setDeleteMode(true)} disabled={isStreaming}>
              <Trash className="size-4" /> Delete messages…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setManageOpen(true)}>
              <FolderOpen className="size-4" /> Manage chat files
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {characterId && (
          <>
            <ManageChatsDialog open={manageOpen} onOpenChange={setManageOpen} characterId={characterId} currentChatId={chatId} />
            <GalleryDialog
              open={galleryOpen}
              onOpenChange={setGalleryOpen}
              characterId={characterId}
              onAttach={(item) => setAttachments((prev) => [...prev, { id: uid('att'), ...item }])}
            />
          </>
        )}

        <div className="relative min-w-0 flex-1">
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
