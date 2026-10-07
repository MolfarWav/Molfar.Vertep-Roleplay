
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cleanPreview } from '@/lib/preview'
import { CaretDown, PencilSimple, Copy, Trash, ArrowsClockwise, Translate, SpeakerHigh, Ghost, Eye, GitBranch, BookmarkSimple, CaretLeft, CaretRight, Info, Scan, Brain, DotsThree, CircleNotch, Square, Wrench, ArrowUp, ArrowDown, ArrowLineDown } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RichText } from '@/components/rich-blocks'
import { Markdown } from '@/components/markdown'
import { detectExpressionLabels, resolveExpressionSprite } from '@/lib/expressions'
import { AttachmentGallery } from '@/components/chat/attachment-gallery'
import { PromptPeekDialog } from '@/components/chat/prompt-peek-dialog'
import { ModelMark } from '@/components/model-mark'
import { AvatarMenu } from '@/components/chat/avatar-menu'
import { messageActions, type MessageActionId } from '@/lib/message-actions'
import { hideEchoedName } from '@/lib/echo-name'
import { useT } from '@/hooks/use-t'
import { useTouchUi } from '@/hooks/use-touch-ui'
import { useApp } from '@/lib/store'
import { useDisplayTexts, type DisplayScript } from '@/hooks/use-display-texts'
import { cssAttrValue } from '@/lib/scope-css'
import { balanceStreamingMarkdown } from '@/lib/rich-parts'
import { hideStateTag } from '@/lib/state-tag'
import { j } from '@/lib/engine'
import { speakText, stopSpeaking, useSpeakingKey, voiceFor } from '@/lib/tts'
import type { Chat, Character, Message, RegexScript, ToolPart } from '@/lib/types'
import { estimateTokens, formatCost, formatTokens, knownCost } from '@/lib/tokens'
import { DEFAULT_AVATAR, cn, copyText, readableNameColor, shortModel } from '@/lib/utils'
import { toast } from 'sonner'

const ACTION_ICONS: Record<MessageActionId, typeof Copy> = {
  copy: Copy, translate: Translate, speak: SpeakerHigh, bookmark: BookmarkSimple, fork: GitBranch, genData: Info, peek: Scan,
  hide: Ghost, moveUp: ArrowUp, moveDown: ArrowDown, delete: Trash, deleteBelow: ArrowLineDown,
}

// claim the wheel ALWAYS while the cursor is over the box: scrolling inside
// a thinking block never moves the page, even at its top/bottom boundaries
// (the position just clamps). The page only scrolls once the cursor leaves.
// A native non-passive listener — React's synthetic wheel is passive.
function trapWheel(el: HTMLElement | null): void {
  if (!el || (el as { __wheelTrap?: boolean }).__wheelTrap) return
  ;(el as { __wheelTrap?: boolean }).__wheelTrap = true
  el.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault()
    const box = e.currentTarget as HTMLElement
    box.scrollTop += e.deltaY
  }, { passive: false })
}

// one agent-style activity row: what the model called, with what, and what
// came back. Running state spins while the engine executes the tool.
function ToolRow({ name, args, result, running, isError }: {
  name: string
  args?: Record<string, unknown>
  result?: string
  running?: boolean
  isError?: boolean
}) {
  // one line until opened: a search or fetch result can run to pages
  const [open, setOpen] = useState(false)
  const argText = Object.entries(args ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(', ')
  const firstLine = result?.split('\n').find((l) => l.trim()) ?? ''
  return (
    <div className="my-1.5 rounded-md border border-border bg-muted/25 font-mono text-[11px] leading-relaxed text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={result == null}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left"
      >
        {running
          ? <CircleNotch className="size-3 shrink-0 animate-spin text-primary/70" aria-hidden="true" />
          : <Wrench className="size-3 shrink-0 text-primary/70" aria-hidden="true" />}
        <span className="shrink-0 text-foreground/80">{name}</span>
        {!!argText && <span className="min-w-0 truncate text-muted-foreground/70">({argText})</span>}
        {result != null && !open && (
          <span className={cn('min-w-0 flex-1 truncate', isError && 'text-destructive')}>→ {firstLine}</span>
        )}
        {result != null && <CaretDown className={cn('ml-auto size-3 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />}
      </button>
      {open && result != null && (
        <div className={cn('max-h-80 overflow-y-auto whitespace-pre-wrap break-words border-t border-border px-2 py-1.5', isError && 'text-destructive')}>{result}</div>
      )}
    </div>
  )
}

// live timeline node: a text slice, a thinking block, or a tool row — each
// anchored where it interrupted the stream. A think node with ms is FINISHED
// (text or a tool call followed it) and relabels mid-stream.
type LiveNode =
  | { type: 'text'; text: string }
  | { type: 'think'; text: string; ms?: number }
  | { type: 'tool'; name: string; args: Record<string, unknown>; done?: boolean; resultText?: string; isError?: boolean }

// one thinking segment, in sequence: renders where the thinking happened
// (before a tool call, between tool and text, wherever) instead of hoisted
// above the whole message. While live it sticks to the newest line unless
// the user scrolled up out of the safe range (same pin rule as chat
// streaming); open state is caller-owned — untouched segments follow the
// Auto-expand Thinking setting (off = start closed), so the streaming→commit
// swap keeps exactly what the user was looking at.
function ThinkBlock({ text, ms, live, open, onOpenChange, onEdit }: {
  text: string
  /** measured span for this segment (kernel-reported) */
  ms?: number
  live?: boolean
  /** caller-owned open state (null falls back to open) */
  open: boolean | null
  onOpenChange?: (open: boolean) => void
  /** present on committed segments: the thinking is editable on its own */
  onEdit?: (text: string) => void
}) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  // auto-pin only while STILL thinking — a finished segment (ms set) no
  // longer grows, so the user's scroll position is theirs
  useEffect(() => {
    if (!live || ms != null) return
    const el = boxRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [text, live, ms])
  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }
  const isOpen = editing ? true : open != null ? open : true
  return (
    <Collapsible open={isOpen} onOpenChange={(o) => { if (!editing) onOpenChange?.(o) }}>
      <div className="flex items-start gap-1">
        <CollapsibleTrigger
          render={
            <button type="button" className="ls-chip">
              <Brain className="size-3" aria-hidden="true" />
              {ms != null && ms > 0
                ? t('msg.thoughtFor', { s: (ms / 1000) < 10 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000) })
                : live
                  ? t('msg.thinking')
                  : t('msg.thought')}
            </button>
          }
        />
        {onEdit && !editing && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 text-muted-foreground"
            aria-label="Edit thinking"
            onClick={() => { setDraft(text); setEditing(true) }}
          >
            <PencilSimple className="size-3" aria-hidden="true" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              aria-label="Edit thinking"
              // field-sizing auto-grows the box; the cap turns that into
              // internal scrolling past ~10 lines instead of an unbounded box
              className="max-h-64 overflow-y-auto text-xs"
            />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 px-2 text-xs" onClick={() => { onEdit?.(draft); setEditing(false) }}>Save</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div
            ref={(el) => { boxRef.current = el; trapWheel(el) }}
            onScroll={onScroll}
            className="think-text mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs italic text-muted-foreground"
          >
            <Markdown content={text} />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// memoized: parent re-renders (pinned toggles, list refreshes) skip rows
// whose props are unchanged — Markdown re-parses only when text really changed

/** stable fallback: a fresh {} would make every render a new value */
const EMPTY_THINK_OPEN: Record<number, boolean> = {}

export const MessageRow = memo(function MessageRow({
  chat, message, index, character, isLast, slidePhase, onSwipeFx, summarized = false,
}: {
  chat: Chat
  message: Message
  index: number
  character: Character
  isLast: boolean
  /** above the chat's summary cutoff: shown, but no longer in the prompt */
  summarized?: boolean
  /** swipe transition phase for this row: 'out'/'in' while this row or one
   *  above it is mid-swipe (rows below a swipe slide along with it), else null */
  slidePhase?: 'out' | 'in' | null
  /** row asking the chat view to run the swipe phase clock (dir: -1 = next
   *  swipe / exits left, +1 = previous / exits right; range = px to travel) */
  onSwipeFx?: (index: number, dir: 1 | -1, range: number) => void
}) {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const activeModel = useApp((s) => s.model)
  const characters = useApp((s) => s.characters)
  const setSwipe = useApp((s) => s.setSwipe)
  const sendMessage = useApp((s) => s.sendMessage)
  const regenerate = useApp((s) => s.regenerate)
  const editMessage = useApp((s) => s.editMessage)
  const deleteMessage = useApp((s) => s.deleteMessage)
  const toggleHidden = useApp((s) => s.toggleHidden)
  const toggleBookmark = useApp((s) => s.toggleBookmark)
  const moveMessage = useApp((s) => s.moveMessage)
  const forkAndOpen = useApp((s) => s.forkAndOpen)
  const personas = useApp((s) => s.personas)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [peekOpen, setPeekOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [swipesOpen, setSwipesOpen] = useState(false)
  // touch has no hover: the toolbar is always shown there, but minimal
  // (edit + more menu) so it doesn't eat the screen. Subscribed live so
  // DevTools device emulation toggled after load switches too
  const coarsePointer = useTouchUi()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // per-thinking-segment open state keyed by occurrence (first think, second
  // think...). It is STORE state, not row state: a staged reply commits under
  // a new id, which unmounts this row, and a box the user closed mid-stream
  // would spring back open the moment the reply landed.
  const thinkOpen = useApp((s) => s.thinkOpen[message.id]) ?? EMPTY_THINK_OPEN
  const setThinkOpen = useApp((s) => s.setThinkOpen)
  const thinkToggle = (n: number, o: boolean) => setThinkOpen(message.id, n, o)
  const [translateBusy, setTranslateBusy] = useState(false)
  // thinking-block editing (separate from the reply text)
  const editReasoning = useApp((s) => s.editReasoning)
  const editThinkPart = useApp((s) => s.editThinkPart)
  const [reasonEditing, setReasonEditing] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const setView = useApp((s) => s.setView)
  const presets = useApp((s) => s.presets)
  const setMessageTranslation = useApp((s) => s.setMessageTranslation)
  const presetSamplers = (presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0])!.samplers

  /** The translation renders INLINE under the original text and
   *  persists on the message. */
  const translate = async () => {
    if (message.translation || translateBusy) return
    setTranslateBusy(true)
    try {
      const r = await j<{ text: string }>('/translate', {
        method: 'POST',
        body: JSON.stringify({ text: rawContent, target: settings.translation.targetLanguage, provider: settings.translation.provider, deeplKey: settings.translation.deeplKey }),
      })
      setMessageTranslation(chat.id, message.id, r.text)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally { setTranslateBusy(false) }
  }

  /** TTS honoring Settings → Sound, with the SPEAKER's per-character voice
   *  overriding when the card has one (Engine edge/endpoint or system).
   *  While this message is the one talking, the same controls STOP it —
   *  the speaker control becomes a stop square mid-playback. */
  const speakKey = `${chat.id}:${message.id}`
  const isSpeaking = useSpeakingKey() === speakKey
  const speak = () => {
    if (isSpeaking) { stopSpeaking(); return }
    const charVoice = !isUser && speaker && 'voiceProvider' in speaker ? speaker : null
    speakText(rawContent, voiceFor(settings.tts, charVoice), speakKey)
      .then((played) => {
        if (!played) toast.info('Pick a TTS provider in Settings → Sound. “System (Web Speech)” uses the browser’s built-in voices')
      })
      .catch((e: Error) => toast.error(`TTS failed: ${e.message}`))
  }

  const swipe = message.swipes[message.activeSwipe]
  // narrow streaming subscription: primitives only, so a tick for ONE
  // message re-renders just that row (the whole-object selector re-rendered
  // every mounted row 30-60x/s during generation — the scroll jank)
  const streamingShown = useApp((s) => (s.streaming?.messageId === message.id ? s.streaming.shown : -1))
  const streamingFull = useApp((s) => (s.streaming?.messageId === message.id ? s.streaming.full : ''))
  const streamingMarks = useApp((s) => (s.streaming?.messageId === message.id ? s.streaming.marks : undefined))
  const streamingThinking = useApp((s) => (s.streaming?.messageId === message.id ? s.streaming.thinking : undefined))
  const streamingThinkMs = useApp((s) => (s.streaming?.messageId === message.id ? s.streaming.thinkingMs : undefined))
  // the live box, the timeline blocks and the committed block all read one
  // per-occurrence map, so a close during streaming can never reopen on commit
  const thinkBoxRef = useRef<HTMLDivElement | null>(null)
  const thinkPinnedRef = useRef(true)
  // live thinking auto-scrolls to the newest line only while the user is at
  // its bottom — reading older reasoning must not yank them around
  useEffect(() => {
    const el = thinkBoxRef.current
    if (el && thinkPinnedRef.current) el.scrollTop = el.scrollHeight
  }, [streamingThinking, streamingMarks, settings.reasoningAutoExpand])
  const onThinkScroll = () => {
    const el = thinkBoxRef.current
    if (!el) return
    thinkPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }
  const isStreamingThis = streamingShown >= 0
  // Swipe transition (out → swap → in): the row renders `shownSwipe`, which
  // lags the store's activeSwipe by exactly one animation. The chat view owns
  // the phase clock and echoes it back through `slidePhase`; content swaps the
  // instant the in-phase starts, so the outgoing text never coexists with the
  // incoming one.
  const [shownSwipe, setShownSwipe] = useState(message.activeSwipe)
  const [lockH, setLockH] = useState(0)
  const prevTarget = useRef(message.activeSwipe)
  const rowRef = useRef<HTMLDivElement>(null)
  const swipeFxSkip = useApp((s) => s.swipeFxSkip)
  const consumeSwipeFxSkip = useApp((s) => s.consumeSwipeFxSkip)
  const inRecord = summarized
  useEffect(() => {
    if (prevTarget.current === message.activeSwipe) return
    const target = message.activeSwipe
    // a cancelled regen lands on its frozen swipe with the animation
    // suppressed — the screen keeps what it had, no slide
    if (swipeFxSkip === `${message.id}:${target}`) {
      prevTarget.current = target
      setShownSwipe(target)
      setLockH(0)
      consumeSwipeFxSkip(swipeFxSkip)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const el = rowRef.current
    if (reduced || isStreamingThis || !el || !onSwipeFx) {
      prevTarget.current = target
      setShownSwipe(target)
      return
    }
    // freeze the row's height for the out-phase so a shorter/longer incoming
    // swipe can't reflow the chat mid-slide; released when content swaps
    const rect = el.getBoundingClientRect()
    setLockH(rect.height)
    // next swipe exits left, previous swipe exits right (carousel semantics)
    const dir = target > prevTarget.current ? -1 : 1
    prevTarget.current = target
    onSwipeFx(index, dir, rect.width + 30)
  }, [message.activeSwipe, isStreamingThis, index, onSwipeFx, swipeFxSkip, consumeSwipeFxSkip])
  // Swapping a swipe (or the streaming bubble committing) changes the row's
  // height, and the chat log runs with native scroll anchoring OFF so the
  // streaming follow stays deterministic. Compensation is the chat-log rule:
  //   reading at the bottom → the row's bottom stays on the viewport's bottom
  //     edge, so a longer reply grows UPWARD and stays fully in view
  //   reading further up → nothing moves; the row grows downward like any
  //     other content and everything above it keeps its exact position
  const scrollerOf = () => rowRef.current?.closest<HTMLElement>('[data-chat-log]') ?? null
  // the log publishes the pin; measuring it here would read a scrollTop that
  // is one frame behind the stream that is still growing the row
  const readerAtBottom = () => scrollerOf()?.dataset.pinned === 'true'
  const keepRowInView = () => {
    const row = rowRef.current
    const scroller = scrollerOf()
    if (!row || !scroller) return
    if (isLast) { scroller.scrollTop = scroller.scrollHeight; return }
    scroller.scrollTop += row.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom
  }
  const pinAtSwapRef = useRef(false)
  // the in-phase is the swap point; the height lock dies with it
  useEffect(() => {
    if (slidePhase === 'in') {
      pinAtSwapRef.current = readerAtBottom()
      setShownSwipe(message.activeSwipe); setLockH(0)
    }
  }, [slidePhase, message.activeSwipe]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!pinAtSwapRef.current) return
    pinAtSwapRef.current = false
    keepRowInView()
  }, [shownSwipe, lockH]) // eslint-disable-line react-hooks/exhaustive-deps
  // streaming→commit swaps the row's content source (live bubble → committed
  // rendering) — the same rule, measured on the last streamed frame
  const pinAtCommitRef = useRef(false)
  const wasStreamingRef = useRef(false)
  useLayoutEffect(() => {
    if (wasStreamingRef.current && !isStreamingThis && pinAtCommitRef.current) keepRowInView()
    wasStreamingRef.current = isStreamingThis
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (isStreamingThis) pinAtCommitRef.current = readerAtBottom()
  })
  const speakerName = characters.find((c) => c.id === (message.characterId ?? chat.characterId))?.name ?? character.name
  const rawContent = isStreamingThis ? streamingFull.slice(0, streamingShown) : message.swipes[shownSwipe]?.content ?? ''
  // Display-only regex runs CLIENT-SIDE on the rendered text; the saved
  // message is never touched. Saved-text scripts ran engine-side when the
  // message was stored, prompt-only ones at assembly.
  // Scoped scripts fire only in their scope: this chat, this character
  // (group members count), or the chat's active preset.
  const regexScripts = useApp((s) => s.regexScripts)
  const displayScripts = useMemo<DisplayScript[]>(() => {
    // Regex scripts arrive from arbitrary import zips — a hostile pattern
    // ((a+)+b) backtracks catastrophically, and RegExp can't be interrupted.
    // Every script runs in the regex worker off the render path, where a
    // timeout can kill it; capping the pattern length bounds what ships.
    const MAX_PATTERN = 500
    const inScope = (r: RegexScript): boolean => {
      if (r.scope === 'global') return true
      if (!r.scopeTargetId) return false
      if (r.scope === 'chat') return r.scopeTargetId === chat.id
      if (r.scope === 'character') return r.scopeTargetId === chat.characterId || (!!character.isGroup && (character.members ?? []).includes(r.scopeTargetId))
      if (r.scope === 'preset') return r.scopeTargetId === chat.presetId
      return true
    }
    // depth = distance from the chat's end; scripts bound to a window only
    // apply inside it (same count the engine uses at assembly)
    const depth = chat.messages.length - 1 - index
    // global first, then preset-bound, then scoped — same order the engine runs
    const rank = (r: RegexScript) => (r.scope === 'global' ? 0 : r.scope === 'preset' ? 1 : 2)
    const persona = personas.find((p) => p.id === chat.personaId) ?? personas.find((p) => p.isDefault)
    const userName = persona?.name ?? 'User'
    // replacement macros use the chat's global names — only the trim pass is
    // speaker-aware in the source format, keep the same split here
    const charName = character.name
    const subMacros = (t: string) => t.replace(/\{\{(user|char)\}\}/gi, (_, k: string) => (k.toLowerCase() === 'user' ? userName : charName))
    const escapeLiteral = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const resolved: DisplayScript[] = []
    for (const r of [...regexScripts].sort((a, b) => rank(a) - rank(b) || a.order - b.order)) {
      // display-stage scripts only: saved-text scripts already ran when the
      // message was stored, prompt-only ones never touch what is shown
      if (!r.enabled || !r.markdownOnly || !r.find || r.find.length > MAX_PATTERN) continue
      if (!(message.role === 'user' ? r.placements.userInput : r.placements.aiOutput)) continue
      if (!inScope(r)) continue
      if (r.minDepth != null && depth < r.minDepth) continue
      if (r.maxDepth != null && depth > r.maxDepth) continue
      // same replace semantics as the engine: {{match}} is the whole
      // (trimmed) match, $n / $<name> pull captured groups, missing groups
      // vanish, trims erase from each, macros substitute (user/char names)
      let find = r.find
      if (r.macroMode === 'raw') find = subMacros(find)
      else if (r.macroMode === 'escaped') {
        find = find.replace(/\{\{(user|char)\}\}/gi, (_, k: string) => escapeLiteral(k.toLowerCase() === 'user' ? userName : charName))
      }
      resolved.push({ find, flags: r.flags || 'g', replace: r.replace, trims: r.trimStrings.filter(Boolean), macros: { user: userName, char: charName } })
    }
    return resolved
  }, [regexScripts, message.role, personas, chat, character, index])
  // while streaming, unclosed emphasis/fence markers get synthetic closers
  // so each tick renders as finished markdown (never committed)
  // the dashboard's fast-mode state tag never shows, streaming or saved
  // a leading echo of the speaker's own name ("Aria:") is cut on display: replies saved before the engine did it still carry it
  const echoOf = (text: string) => (message.role === 'assistant' ? hideEchoedName(text, speakerName) : text)
  const rawDisplayed = isStreamingThis ? balanceStreamingMarkdown(echoOf(hideStateTag(rawContent, true))) : echoOf(hideStateTag(rawContent))
  const content = useDisplayTexts([rawDisplayed], displayScripts)[0] ?? rawDisplayed
  const activeSwipeData = message.swipes[shownSwipe]
  // committed segments: messages whose generation used tools render thinking,
  // text and tool rows interleaved (same message, same id, agent-style top to
  // bottom, in the exact order the model produced them)
  const parts: ToolPart[] | null = !isStreamingThis && activeSwipeData?.parts?.length ? activeSwipeData.parts : null
  // live timeline: the stream split at each mark's anchor — thinking blocks
  // and tool rows appear exactly where they interrupted the text
  const liveTimeline = useMemo<LiveNode[] | null>(() => {
    if (!isStreamingThis || !streamingMarks?.length) return null
    const shown = Math.min(streamingShown, streamingFull.length)
    const anchors = [...new Set(streamingMarks.map((m) => m.at).filter((a) => a <= shown))].sort((a, b) => a - b)
    const nodes: LiveNode[] = []
    let prev = 0
    for (const a of anchors) {
      if (a > prev) nodes.push({ type: 'text', text: streamingFull.slice(prev, a) })
      for (const m of streamingMarks) {
        if (m.at !== a) continue
        if (m.kind === 'think') nodes.push({ type: 'think', text: m.text, ...(m.ms != null ? { ms: m.ms } : {}) })
        else nodes.push({ type: 'tool', name: m.name, args: m.args, done: m.done, resultText: m.resultText, isError: m.isError })
      }
      prev = a
    }
    if (shown > prev) nodes.push({ type: 'text', text: streamingFull.slice(prev, shown) })
    return nodes
  }, [isStreamingThis, streamingMarks, streamingShown, streamingFull])
  // text segments of both timelines run through the same worker-backed pass
  const partTexts = useDisplayTexts(parts ? parts.filter((p) => p.type === 'text').map((p, k) => (k === 0 ? echoOf(hideStateTag(p.text)) : hideStateTag(p.text))) : [], displayScripts)
  const liveTexts = useDisplayTexts(liveTimeline ? liveTimeline.filter((n) => n.type === 'text').map((n, k) => (k === 0 ? echoOf(hideStateTag(n.text, true)) : hideStateTag(n.text, true))) : [], displayScripts)
  const isUser = message.role === 'user'
  // per-message <style> blocks are rewritten under this row's own boundary,
  // so one message cannot restyle another's text
  const cssScope = `[data-message-id="${cssAttrValue(message.id)}"]`
  // user messages keep the persona they were SENT under: match the stored
  // author name first so mid-chat persona switches never repaint history
  const currentPersona = personas.find((p) => p.id === chat.personaId) ?? personas.find((p) => p.isDefault)
  const authorPersona = !isUser ? null
    : (message.personaId ? personas.find((p) => p.id === message.personaId) : undefined)
      ?? (message.authorName ? personas.find((p) => p.name === message.authorName) : undefined)
      ?? null
  const speaker = isUser
    ? authorPersona ?? currentPersona
    : characters.find((c) => c.id === (message.characterId ?? chat.characterId))
  const name = isUser ? (message.authorName ?? currentPersona?.name ?? 'You') : (speaker?.name ?? character.name)
  const avatar = isUser ? ((authorPersona ?? currentPersona)?.avatar ?? DEFAULT_AVATAR) : (speaker && 'avatar' in speaker ? speaker.avatar : character.avatar)
  // expression sprites: the reply's own words pick the sprite (keyword
  // classifier + synonym resolution against the card's sprite set). Memoized:
  // every rule is a regex over the whole message, and a streaming tick
  // re-renders every mounted row.
  const sprites = !isUser && speaker && 'expressions' in speaker ? speaker.expressions : undefined
  const spriteDefault = !isUser && speaker && 'defaultExpression' in speaker ? speaker.defaultExpression : undefined
  const spriteAvatar = useMemo(
    () =>
      settings.showExpressionSprites && sprites?.length
        ? (resolveExpressionSprite(detectExpressionLabels(content), sprites, spriteDefault)?.url ?? null)
        : null,
    [settings.showExpressionSprites, sprites, spriteDefault, content],
  )
  const shownAvatar = spriteAvatar || avatar
  // Without provider-reported usage (stopped generations keep their partial
  // but no usage), the size estimate covers what was actually produced —
  // thinking blocks count as content there.
  const thinkText = useMemo(
    () => [
      swipe?.reasoning ?? '',
      ...(activeSwipeData?.parts ?? []).filter((p) => p.type === 'thinking').map((p) => p.text),
    ].filter(Boolean).join('\n'),
    [swipe?.reasoning, activeSwipeData?.parts],
  )
  const tokens = useMemo(() => estimateTokens(content + thinkText), [content, thinkText])
  // REAL usage when the engine reported it (generated swipes carry the
  // provider's own numbers — tokens and cost). No client-side price guessing:
  // messages generated before usage tracking simply have no cost to show.
  const realUsage = !isUser ? swipe?.usage : undefined
  const msgCost = knownCost(realUsage)

  const startEdit = () => {
    setDraft(swipe?.content ?? '')
    setEditing(true)
  }

  const spacing = settings.messageSpacing
  const rowPad = spacing === 'compact' ? 'py-1' : spacing === 'cozy' ? 'py-2' : 'py-3'
  const showPortrait = !isUser && !settings.hideAvatars
  const speakerId = speaker && 'id' in speaker ? speaker.id : (message.characterId ?? chat.characterId)
  const speakerColors = speaker && 'colors' in speaker ? speaker.colors : character.colors
  const nameColor = isUser ? 'var(--tap-quotes)' : readableNameColor(speakerColors.name)
  const modelId = swipe?.model || (isStreamingThis ? activeModel : '') || ''

  const copyBody = () => { void copyText(content).then(ok => { if (ok) toast.success(t('msg.copied')); else toast.error(t('msg.copyFailed')) }) }

  // what is on the right of the name line (hover only, never on a phone): each part only when its setting is on and the value is known
  const meta: { k: string; node: ReactNode }[] = []
  if (!isUser && settings.showModelIcons && modelId) {
    meta.push({ k: "model", node: <span className="inline-flex items-center gap-1" title={modelId}><ModelMark model={modelId} className="size-3.5" />{shortModel(modelId)}</span> })
  }
  if (settings.showGenTimer && !isUser && !isStreamingThis && swipe && swipe.genTimeMs > 0) meta.push({ k: "time", node: <span>{(swipe.genTimeMs / 1000).toFixed(1)}s</span> })
  if (settings.showTokens && !isStreamingThis) meta.push({ k: "tokens", node: <span>{realUsage ? realUsage.output : tokens}t</span> })
  if (settings.showCost && !isStreamingThis && msgCost != null) meta.push({ k: "cost", node: <span>{formatCost(msgCost)}</span> })
  if (settings.showMessageIds) meta.push({ k: "id", node: <span>#{index}</span> })

  const canAct = !editing && !isStreamingThis && !slidePhase
  const showSwipes = !isUser && (isLast || settings.swipeCountAllMessages) && message.swipes.length >= 1 && !isStreamingThis
  const pinned = settings.expandMessageActions || coarsePointer

  const runAction = (id: MessageActionId) => {
    switch (id) {
      case 'copy': copyBody(); break
      case 'translate': if (message.translation) setMessageTranslation(chat.id, message.id, null); else void translate(); break
      case 'speak': speak(); break
      case 'bookmark': toggleBookmark(chat.id, message.id, t('msg.bookmarkAt', { n: index })); break
      case 'fork': void forkAndOpen(chat.id, message.id); toast.success(t('msg.branched')); break
      case 'genData': setGenOpen(true); break
      case 'peek': setPeekOpen(true); break
      case 'hide': toggleHidden(chat.id, message.id); break
      case 'moveUp': moveMessage(chat.id, message.id, -1); break
      case 'moveDown': moveMessage(chat.id, message.id, 1); break
      case 'delete': deleteMessage(chat.id, message.id, 'this'); break
      case 'deleteBelow': deleteMessage(chat.id, message.id, 'below'); break
    }
  }
  const actionGroups = messageActions({
    isUser, index, count: chat.messages.length,
    hidden: !!message.hidden, bookmarked: !!message.bookmarked,
    translated: !!message.translation, translating: translateBusy, speaking: isSpeaking,
  })

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="ls-act" aria-label={t('msg.more')}>
            <DotsThree aria-hidden="true" />
            <span className="ls-act-label">{t('msg.more')}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        {actionGroups.map((group, gi) => (
          <Fragment key={group.id}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(group.labelKey)}</DropdownMenuLabel>
              {group.items.map((item) => {
                const Icon = item.id === 'hide' && message.hidden ? Eye : ACTION_ICONS[item.id]
                return (
                  <DropdownMenuItem
                    key={item.id}
                    variant={item.danger ? 'destructive' : 'default'}
                    disabled={item.disabled}
                    onClick={() => runAction(item.id)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(item.labelKey, { lang: settings.translation.targetLanguage })}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const portrait = (
    <div className="ls-arch">
      <img
        src={shownAvatar || DEFAULT_AVATAR}
        alt=""
        draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR }}
      />
    </div>
  )

  return (
    <div className="group/msg" id={`msg-${message.id}`}>
      <div
        ref={rowRef}
        data-message-id={message.id}
        data-char-id={!isUser ? (message.characterId ?? chat.characterId) : undefined}
        title={inRecord ? t('lit.inRecord') : undefined}
        style={slidePhase === 'out' && lockH > 0 ? { height: lockH } : undefined}
        className={cn(
          'ls-row',
          isUser && 'is-user',
          !isUser && !showPortrait && 'no-av',
          rowPad,
          slidePhase === 'out' && 'swipe-out',
          slidePhase === 'in' && 'swipe-in',
          message.hidden && !message.picture && 'opacity-50',
          summarized && !message.hidden && 'opacity-70',
        )}
      >
        {showPortrait && (
          <div className="ls-av">
            <AvatarMenu characterId={speakerId} onViewPortrait={() => setLightboxOpen(true)} align="start">
              <button
                type="button"
                className="ls-av-btn"
                aria-label={t('avatar.menu', { name })}
              >
                {portrait}
              </button>
            </AvatarMenu>
          </div>
        )}
        <div className="ls-col">
          <div className="ls-head">
            {isUser ? (
              <Popover open={avatarOpen} onOpenChange={setAvatarOpen}>
                <PopoverTrigger render={<button type="button" className="ls-name ls-name-btn" style={{ color: nameColor }}>{name}</button>} />
                <PopoverContent align="start" className="w-56">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">{t('msg.yourPersona')}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAvatarOpen(false); setView('personas') }}>
                    {t('msg.openPersona')}
                  </Button>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="ls-name" style={{ color: nameColor }}>{name}</span>
            )}
            {settings.showTimestamps && (
              <span className="ls-time">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {settings.showCache && !isStreamingThis && realUsage && (realUsage.cacheRead ?? 0) > 0 && (
              <span className="ls-time">{t('msg.cached', { n: formatTokens(realUsage.cacheRead ?? 0) })}</span>
            )}
            {settings.showEdited && message.edited && <span className="ls-time italic">{t('msg.edited')}</span>}
            {message.hidden && !message.picture && (
              <span className="ls-time inline-flex items-center gap-0.5">
                <Ghost className="size-3" aria-hidden="true" />
                {t('msg.hiddenFromAi')}
              </span>
            )}
            {message.bookmarked && <BookmarkSimple weight="fill" className="size-3 self-center text-primary" aria-hidden="true" />}
            {meta.length > 0 && (
              <span className="ls-meta">
                {meta.map((m, i) => (
                  <Fragment key={m.k}>{i > 0 && <span aria-hidden="true"> · </span>}{m.node}</Fragment>
                ))}
              </span>
            )}
          </div>

          {/* LIVE thinking while the model streams: watch the
              reasoning grow, then the reply starts below it */}
          {!isUser && isStreamingThis && streamingThinking && !streamingMarks?.length && presetSamplers.reasoning.display !== 'hidden' && (
            <Collapsible open={thinkOpen[0] ?? settings.reasoningAutoExpand} onOpenChange={(o) => thinkToggle(0, o)}>
              <CollapsibleTrigger
                render={
                  <button type="button" className="ls-chip">
                    {streamingFull ? (
                      t('msg.thoughtFor', { s: ((streamingThinkMs ?? 0) / 1000) < 10 ? ((streamingThinkMs ?? 0) / 1000).toFixed(1) : Math.round((streamingThinkMs ?? 0) / 1000) })
                    ) : (
                      <>
                        <CircleNotch className="size-3 animate-spin" aria-hidden="true" />
                        {t('msg.thinking')}
                      </>
                    )}
                  </button>
                }
              />
              <CollapsibleContent>
                <div
                  ref={(el) => { thinkBoxRef.current = el; trapWheel(el) }}
                  onScroll={onThinkScroll}
                  className="think-text mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs italic text-muted-foreground"
                >
                  <Markdown content={streamingThinking} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Reasoning block — real thinking from the provider, measured span,
              collapse behavior from the preset's reasoning.display setting.
              Editable on its own, separate from the reply text. */}
          {!isUser && swipe?.reasoning && !isStreamingThis && !parts && presetSamplers.reasoning.display !== 'hidden' && (
            <Collapsible
              open={reasonEditing ? true : (thinkOpen[0] ?? (settings.reasoningAutoExpand || presetSamplers.reasoning.display === 'expanded'))}
              onOpenChange={(o) => { if (!reasonEditing) thinkToggle(0, o) }}
            >
              <div className="flex items-start gap-1">
                <CollapsibleTrigger
                  render={
                    <button type="button" className="ls-chip">
                      <Brain className="size-3" aria-hidden="true" />
                      {swipe.reasoningTime != null
                        ? t('msg.thoughtFor', { s: swipe.reasoningTime < 10 ? swipe.reasoningTime.toFixed(1) : Math.round(swipe.reasoningTime) })
                        : t('msg.thought')}
                    </button>
                  }
                />
                {!reasonEditing && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground"
                    aria-label="Edit thinking"
                    onClick={() => { setReasonDraft(swipe.reasoning ?? ''); setReasonEditing(true) }}
                  >
                    <PencilSimple className="size-3" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <CollapsibleContent>
                {reasonEditing ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <Textarea
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      rows={6}
                      aria-label="Edit thinking"
                      className="max-h-64 overflow-y-auto text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={() => { editReasoning(chat.id, message.id, reasonDraft); setReasonEditing(false) }}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setReasonEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div ref={trapWheel} className="think-text mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs italic text-muted-foreground">
                    <Markdown content={swipe.reasoning} />
                    <div className="mt-1 flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { void copyText(swipe.reasoning ?? '').then(ok => { if (ok) toast.success('Reasoning copied'); else toast.error(t('msg.copyFailed')) }) }}>{t('msg.copy')}</Button>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Body */}
          {editing ? (
            <div className="mt-1 flex flex-col gap-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} aria-label="Edit message" className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { editMessage(chat.id, message.id, draft); setEditing(false) }}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div
              className={cn('relative', message.hidden && 'line-through decoration-muted-foreground/50', settings.italicNarration && 'narration-italic')}
              // Narration (*asterisks*) picks up a muted wash of the speaker's
              // own name colour, so actions read as belonging to whoever is
              // talking. `color-mix` keeps it dim enough to stay secondary to
              // dialogue; without a character colour it falls back to the
              // theme's italics colour via the CSS variable default.
              style={
                !isUser && character?.colors.name
                  ? ({ '--tap-italics': `color-mix(in oklab, ${character.colors.name} 55%, var(--muted-foreground))` } as React.CSSProperties)
                  : undefined
              }
            >
              <div key={`${message.id}-${shownSwipe}`}>
                {parts ? (
                  // committed tool-using reply: thinking, text and tool rows
                  // interleaved in the order the model produced them
                  <div className="flex flex-col">
                    {(() => {
                      let thinkN = 0
                      let textN = 0
                      return parts.map((p, i) => {
                        if (p.type === 'text') return <RichText key={i} content={partTexts[textN++] ?? p.text} scope={cssScope} />
                        if (p.type === 'thinking') {
                          const n = thinkN++
                          return (
                            <div key={i}>
                              <ThinkBlock
                                text={p.text}
                                ms={p.ms}
                                open={thinkOpen[n] ?? settings.reasoningAutoExpand}
                                onOpenChange={(o) => thinkToggle(n, o)}
                                onEdit={(t) => editThinkPart(chat.id, message.id, i, t)}
                              />
                            </div>
                          )
                        }
                        return <ToolRow key={i} name={p.name} args={p.args} result={p.resultText} isError={p.isError} />
                      })
                    })()}
                  </div>
                ) : liveTimeline ? (
                  // mid-generation timeline: text pauses where the model
                  // thought or reached for a tool; blocks and rows run
                  // inline, the next text keeps streaming below
                  <div className="flex flex-col">
                    {(() => {
                      let thinkN = 0
                      let textN = 0
                      return liveTimeline.map((n, i) => {
                        if (n.type === 'text') return n.text ? <RichText key={i} content={liveTexts[textN++] ?? n.text} scope={cssScope} /> : null
                        if (n.type === 'think') {
                          const k = thinkN++
                          return (
                            <div key={i}>
                              <ThinkBlock live text={n.text} ms={n.ms} open={thinkOpen[k] ?? settings.reasoningAutoExpand} onOpenChange={(o) => thinkToggle(k, o)} />
                            </div>
                          )
                        }
                        return <ToolRow key={i} name={n.name} args={n.args} result={n.done ? n.resultText : undefined} running={!n.done} isError={n.isError} />
                      })
                    })()}
                  </div>
                ) : message.picture && !content ? null : (
                  <RichText
                    content={content || '…'}
                    scope={cssScope}
                    onChoice={!isUser && !isStreamingThis ? (choice) => { void sendMessage(chat.id, choice) } : undefined}
                  />
                )}
                {message.translation && (
                  <div className="mt-1.5 border-t border-dashed border-border pt-1.5">
                    <RichText content={message.translation} scope={cssScope} />
                    <Badge variant="outline" className="mt-1 text-[10px]">{settings.translation.targetLanguage}</Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attachments */}
          <AttachmentGallery attachments={message.attachments} picture={message.picture === true} />

          {/* Under the text: swipe arrows (always visible on the newest reply), then the actions.
              The actions fade in on row hover / focus; touch and "Expand Message Actions" pin them.
              Hidden while editing, streaming and mid-swipe, as before. */}
          {(showSwipes || canAct || (isSpeaking && !slidePhase)) && (
            <div className="ls-tools">
              {showSwipes && (
                <div className="ls-swipes">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('msg.prevSwipe')}
                    disabled={message.activeSwipe === 0}
                    onClick={() => setSwipe(chat.id, message.id, message.activeSwipe - 1)}
                  >
                    <CaretLeft aria-hidden="true" />
                  </Button>
                  <button type="button" className="tabular-nums hover:text-foreground" onClick={() => setSwipesOpen(true)}>
                    {message.activeSwipe + 1} / {message.swipes.length}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('msg.nextSwipe')}
                    onClick={() => {
                      if (message.activeSwipe < message.swipes.length - 1) setSwipe(chat.id, message.id, message.activeSwipe + 1)
                      else if (isLast) regenerate(chat.id)
                    }}
                  >
                    <CaretRight aria-hidden="true" />
                  </Button>
                </div>
              )}
              {isSpeaking && !slidePhase && (
                <Button variant="ghost" size="sm" className="ls-act" aria-label={t('msg.stopTts')} onClick={stopSpeaking}>
                  <Square weight="fill" className="size-3" aria-hidden="true" />
                  <span className="ls-act-label">{t('msg.stopTts')}</span>
                </Button>
              )}
              {canAct && (
                <div className={cn('ls-acts', pinned && 'is-pinned', coarsePointer && 'is-touch')}>
                  <Button variant="ghost" size="sm" className="ls-act" aria-label={t('msg.edit')} onClick={startEdit}>
                    <PencilSimple aria-hidden="true" />
                    <span className="ls-act-label">{t('msg.edit')}</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="ls-act" aria-label={t('msg.copy')} onClick={copyBody}>
                    <Copy aria-hidden="true" />
                    <span className="ls-act-label">{t('msg.copy')}</span>
                  </Button>
                  {!isUser && (
                    <Button variant="ghost" size="sm" className="ls-act" aria-label={t('msg.regenerate')} onClick={() => regenerate(chat.id)}>
                      <ArrowsClockwise aria-hidden="true" />
                      <span className="ls-act-label">{t('msg.regenerate')}</span>
                    </Button>
                  )}
                  {moreMenu}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-size portrait view: uncropped; opened from the avatar menu's "View portrait". */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="w-full max-w-[min(92vw,720px)] gap-0 border-border/40 bg-black/85 p-2 backdrop-blur">
          <img
            src={shownAvatar || DEFAULT_AVATAR}
            alt={`${name} portrait`}
            className="max-h-[80dvh] w-full rounded-md object-contain"
          />
          <p className="pt-2 pb-1 text-center text-sm font-medium">{name}</p>
          <p className="pb-1 text-center text-xs text-muted-foreground">{t('msg.character')}</p>
        </DialogContent>
      </Dialog>

      {/* Swipe picker */}
      <Dialog open={swipesOpen} onOpenChange={setSwipesOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Swipes ({message.swipes.length})</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {message.swipes.map((sw, i) => (
              <SwipeCard key={sw.id} chatId={chat.id} messageId={message.id} index={i} active={i === message.activeSwipe} content={sw.content} model={sw.model} onPick={() => { setSwipe(chat.id, message.id, i); setSwipesOpen(false) }} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Prompt peek — the real assembled prompt from the engine, scoped to
          this message: the prompt as it existed here, not the chat's tail */}
      <PromptPeekDialog
        open={peekOpen}
        onOpenChange={setPeekOpen}
        chatId={chat.id}
        messageId={message.id}
        title={`Prompt peek: message #${index}`}
      />

      {/* Generation data */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generation data</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Model</dt>
            <dd>{swipe?.model ? shortModel(swipe.model) : <span className="text-muted-foreground">Not recorded</span>}</dd>
            {realUsage ? (
              <>
                <dt className="text-muted-foreground">Tokens (usage)</dt>
                <dd>{realUsage.input.toLocaleString()} in · {realUsage.output.toLocaleString()} out{(realUsage.cacheRead ?? 0) > 0 || (realUsage.cacheWrite ?? 0) > 0 ? ` · cache ${realUsage.cacheRead ?? 0}r/${realUsage.cacheWrite ?? 0}w` : ''}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Tokens (est.)</dt><dd>{tokens}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Cost</dt>
            <dd>
              {msgCost != null ? (
                formatCost(msgCost)
              ) : (
                <span className="text-muted-foreground">No usage data for this message</span>
              )}
            </dd>
            {swipe && swipe.genTimeMs > 0 && (<><dt className="text-muted-foreground">Gen time</dt><dd>{(swipe.genTimeMs / 1000).toFixed(1)}s</dd></>) }
            {swipe?.tools?.length ? (
              <>
                <dt className="text-muted-foreground">Tool calls</dt>
                <dd className="col-span-1 flex flex-col gap-1 font-mono text-xs">
                  {swipe.tools.map((t, i) => (
                    <span key={i} className={t.isError ? 'text-destructive' : undefined}>
                      {t.name}({Object.entries(t.args).map(([k, v]) => `${k}=${String(v)}`).join(', ')}) → {t.resultText}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {(() => {
              // prefer the snapshot taken at generation time; the live preset
              // is only a fallback and says so
              const p = (swipe?.params ?? {}) as { temperature?: number; max_tokens?: number; params?: Record<string, number> }
              const src = swipe?.params ? 'at generation' : 'current preset'
              const topP = p.params?.top_p
              return (
                <>
                  <dt className="text-muted-foreground">Temperature <span className="text-[10px]">({src})</span></dt><dd>{p.temperature ?? presetSamplers.temperature.value}</dd>
                  {topP != null && (<><dt className="text-muted-foreground">Top-P</dt><dd>{topP}</dd></>)}
                  {topP == null && (<><dt className="text-muted-foreground">Top-P <span className="text-[10px]">({src})</span></dt><dd>{presetSamplers.top_p.value}</dd></>)}
                </>
              )
            })()}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  )
})

function SwipeCard({ chatId, messageId, index, active, content, model, onPick }: {
  chatId: string; messageId: string; index: number; active: boolean; content: string; model: string; onPick: () => void
}) {
  const deleteSwipe = useApp((s) => s.deleteSwipe)
  const forkAndOpen = useApp((s) => s.forkAndOpen)
  return (
    <div className={cn('rounded-md border p-2.5', active ? 'border-primary/60 bg-accent/50' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Swipe {index + 1}
        {model && <Badge variant="outline">{shortModel(model)}</Badge>}
        {active && <Badge variant="secondary">active</Badge>}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onPick}>Use</Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { void forkAndOpen(chatId, messageId); toast.success('Branched from swipe') }}>Branch</Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => deleteSwipe(chatId, messageId, index)}>Delete</Button>
        </div>
      </div>
      <p className="mt-1 line-clamp-3 text-xs">{cleanPreview(content)}</p>
    </div>
  )
}
