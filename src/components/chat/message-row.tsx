
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cleanPreview } from '@/lib/preview'
import { CaretDown, PencilSimple, Copy, Trash, ArrowsClockwise, Translate, SpeakerHigh, Ghost, GitBranch, BookmarkSimple, Eye, CaretLeft, CaretRight, Info, Scan, Brain, DotsThree, CircleNotch, Square, ArrowsOut, Wrench, ArrowUp, ArrowDown } from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RichText } from '@/components/rich-blocks'
import { Markdown } from '@/components/markdown'
import { detectExpressionLabels, resolveExpressionSprite } from '@/lib/expressions'
import { AttachmentGallery } from '@/components/chat/attachment-gallery'
import { PromptPeekDialog } from '@/components/chat/prompt-peek-dialog'
import { ModelMark } from '@/components/model-mark'
import { CardKindBadge } from '@/components/dashboard/card-kind'
import { cardTypeOf } from '@/lib/soul'
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
      <div className="mt-1 flex items-start gap-1">
        <CollapsibleTrigger
          render={
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              <Brain className="size-3" aria-hidden="true" />
              {ms != null && ms > 0
                ? `Thought for ${(ms / 1000) < 10 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)}s`
                : live
                  ? 'Thinking…'
                  : 'Thought'}
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
  const compactChat = useApp((s) => s.compactChat)
  const undoCompaction = useApp((s) => s.undoCompaction)
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
  const rawDisplayed = isStreamingThis ? balanceStreamingMarkdown(hideStateTag(rawContent, true)) : hideStateTag(rawContent)
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
  const partTexts = useDisplayTexts(parts ? parts.filter((p) => p.type === 'text').map((p) => hideStateTag(p.text)) : [], displayScripts)
  const liveTexts = useDisplayTexts(liveTimeline ? liveTimeline.filter((n) => n.type === 'text').map((n) => hideStateTag(n.text, true)) : [], displayScripts)
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
  const speakerKind = isUser ? null : cardTypeOf(characters.find((c) => c.id === (message.characterId ?? chat.characterId)) ?? {})
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
  const isCutoff = chat.memoryCutoffMessageId === message.id

  const mode = settings.displayMode

  const startEdit = () => {
    setDraft(swipe?.content ?? '')
    setEditing(true)
  }

  // 'rect' is the tall rounded-rectangle portrait crop — a shape, not a
  // corner radius, so it carries its own box + fixed rounding (percent radii
  // go elliptical on non-square boxes). The other three are radii on a
  // square crop.
  const isRect = settings.avatarShape === 'rect'
  const avatarShape = settings.avatarShape === 'circle' ? 'rounded-full' : settings.avatarShape === 'square' ? 'rounded-none' : 'rounded-[20%]'
  const isPortrait = settings.avatarStyle === 'portrait'
  // Portrait avatars render tall; the thumb style keeps a square/round crop.
  const avatarSize = isPortrait || isRect ? 'h-[4.5rem] w-14' : 'size-10'
  const spacing = settings.messageSpacing
  const rowPad = spacing === 'compact' ? 'px-2 py-1.5' : spacing === 'cozy' ? 'px-3 py-2.5' : 'px-3.5 py-3'
  const rowGap = spacing === 'compact' ? 'gap-2' : spacing === 'cozy' ? 'gap-2.5' : 'gap-3'

  const copyBody = () => { void copyText(content).then(ok => { if (ok) toast.success('Copied'); else toast.error('Copy failed') }) }
  const moreMenu = (
<DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <DotsThree aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={copyBody}>
            <Copy className="size-4" aria-hidden="true" />
            Copy text
          </DropdownMenuItem>
          {!isUser && (
            <DropdownMenuItem onClick={() => regenerate(chat.id)}>
              <ArrowsClockwise className="size-4" aria-hidden="true" />
              Regenerate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => toggleBookmark(chat.id, message.id, `Bookmark at #${index}`)}>
            <BookmarkSimple className="size-4" aria-hidden="true" />
            {message.bookmarked ? 'Remove bookmark' : 'Bookmark'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { void forkAndOpen(chat.id, message.id); toast.success('Branched from here') }}>
            <GitBranch className="size-4" aria-hidden="true" />
            Fork here
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => message.translation ? setMessageTranslation(chat.id, message.id, null) : void translate()}>
            <Translate className="size-4" aria-hidden="true" />
            {translateBusy ? 'Translating…' : message.translation ? 'Remove translation' : `Translate to ${settings.translation.targetLanguage}`}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={speak}>
            {isSpeaking ? <Square weight="fill" className="size-4" aria-hidden="true" /> : <SpeakerHigh className="size-4" aria-hidden="true" />}
            {isSpeaking ? 'Stop speaking' : 'Speak'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleHidden(chat.id, message.id)}>
            {message.hidden ? <Eye className="size-4" aria-hidden="true" /> : <Ghost className="size-4" aria-hidden="true" />}
            {message.hidden ? 'Unhide from AI' : 'Hide from AI'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPeekOpen(true)}>
            <Scan className="size-4" aria-hidden="true" />
            Prompt peek
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setGenOpen(true)}>
            <Info className="size-4" aria-hidden="true" />
            Generation data
          </DropdownMenuItem>
          {isCutoff && chat.compactions > 0 ? (
            <DropdownMenuItem onClick={() => {
              void undoCompaction(chat.id)
                .then(() => toast.success('Summary restored to before the last compaction'))
                .catch((e) => toast.error(String((e as Error).message ?? e)))
            }}>
              <Brain className="size-4" aria-hidden="true" />
              Undo last summary
            </DropdownMenuItem>
          ) : !isCutoff && index > 0 && (
            <DropdownMenuItem onClick={() => {
              const t = toast.loading('Summarizing…')
              void compactChat(chat.id, { upTo: message.id })
                .then((r) => toast.success(`${r.covered} messages folded into the summary`, { id: t }))
                .catch((e) => toast.error(String((e as Error).message ?? e), { id: t }))
            }}>
              <Brain className="size-4" aria-hidden="true" />
              Summarize everything above
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => moveMessage(chat.id, message.id, -1)}>
            <ArrowUp className="size-4" aria-hidden="true" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => moveMessage(chat.id, message.id, 1)}>
            <ArrowDown className="size-4" aria-hidden="true" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => deleteMessage(chat.id, message.id, 'this')}>
            <Trash className="size-4" aria-hidden="true" />
            Delete this
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => deleteMessage(chat.id, message.id, 'below')}>Delete below</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <div className="group/msg" id={`msg-${message.id}`}>
      {isCutoff && (
        <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground" role="separator" aria-label="Summary cutoff">
          <div className="h-px flex-1 bg-border" />
          Summarized above. The model reads the summary instead.
          <div className="h-px flex-1 bg-border" />
        </div>
      )}
      <div
        ref={rowRef}
        data-message-id={message.id}
        data-char-id={!isUser ? (message.characterId ?? chat.characterId) : undefined}
        style={slidePhase === 'out' && lockH > 0
          ? { height: lockH }
          : settings.messageTint && !isUser && character.colors.bubble ? { backgroundColor: character.colors.bubble + '26' } : undefined}
        className={cn(
          'relative flex rounded-lg transition-colors',
          rowGap,
          rowPad,
          slidePhase === 'out' && 'swipe-out',
          slidePhase === 'in' && 'swipe-in',
          mode === 'bubbles' && (isUser ? 'bg-secondary/70' : 'bg-card/80') + ' border border-border/60',
          mode === 'flat' && 'border-b border-border/40 rounded-none',
          mode === 'minimal' && cn('border-l-2 rounded-none pl-3', isUser ? 'border-primary/60' : 'border-muted-foreground/40'),
          mode === 'document' && 'px-0',
          message.hidden && !message.picture && 'opacity-50',
          summarized && !message.hidden && 'opacity-70',
        )}
      >
        {!settings.hideAvatars && mode !== 'document' && (
          <div className="flex shrink-0 flex-col items-center gap-0.5 self-start" style={{ zoom: 'var(--avatar-scale, 1)' }}>
          <Popover open={avatarOpen} onOpenChange={setAvatarOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="shrink-0 rounded-md ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`View ${name} avatar`}
                >
                  {/* Tall portrait crops get a subtle rounding — rounded-md read
                      as pill-like on a 56px-wide crop (user feedback). The
                      rectangle shape pins its own radius. */}
                  <Avatar className={cn(avatarSize, isRect ? 'rounded-lg' : isPortrait ? 'rounded-sm' : avatarShape)}>
                    <AvatarImage src={shownAvatar || DEFAULT_AVATAR} alt="" className="object-cover" />
                    <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <PopoverContent align="start" className="w-60 p-0">
              <button
                type="button"
                className="relative block w-full"
                aria-label={`Enlarge ${name} portrait`}
                onClick={() => { setAvatarOpen(false); setLightboxOpen(true) }}
              >
                <img
                  src={shownAvatar || DEFAULT_AVATAR}
                  alt={`${name} portrait`}
                  className="h-56 w-full rounded-t-md object-cover"
                />
                <span className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1 text-foreground backdrop-blur">
                  <ArrowsOut className="size-3.5" aria-hidden="true" />
                </span>
              </button>
              <div className="flex flex-col gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {speakerKind ? (
                    <CardKindBadge type={speakerKind} className="mt-0.5" />
                  ) : (
                    <p className="text-xs text-muted-foreground">{isUser ? 'Your persona' : 'Character'}</p>
                  )}
                </div>
                {!isUser && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setAvatarOpen(false); setView('characters') }}
                  >
                    Open character
                  </Button>
                )}
                {isUser && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setAvatarOpen(false); setView('personas') }}
                  >
                    Open persona
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {/* Full-size portrait view: uncropped, click the popover image or the
              expand badge to open. */}
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent className="w-full max-w-[min(92vw,720px)] gap-0 border-border/40 bg-black/85 p-2 backdrop-blur">
              <img
                src={shownAvatar || DEFAULT_AVATAR}
                alt={`${name} portrait`}
                className="max-h-[80dvh] w-full rounded-md object-contain"
              />
              <p className="pt-2 pb-1 text-center text-sm font-medium">{name}</p>
              <p className="pb-1 text-center text-xs text-muted-foreground">{isUser ? 'Your persona' : 'Character'}</p>
            </DialogContent>
          </Dialog>
          {/* per-message stats UNDER the profile: id → seconds → tokens
              (greeting/manual turns have no seconds; cached read joins the
              name line with the time and model badge). All hidden while THIS
              message generates a new swipe — they belong to the outgoing
              swipe, and the incoming one reports its own when it commits) */}
          <div className="flex flex-col items-center font-mono text-[9px] leading-tight text-muted-foreground">
            {settings.showMessageIds && <span>#{index}</span>}
            {settings.showGenTimer && !isUser && !isStreamingThis && swipe && swipe.genTimeMs > 0 && (
              <span>{(swipe.genTimeMs / 1000).toFixed(1)}s</span>
            )}
            {settings.showTokens && !isStreamingThis && <span>{realUsage ? realUsage.output : tokens}t</span>}
            {settings.showCost && !isStreamingThis && msgCost != null && <span>{formatCost(msgCost)}</span>}
          </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {mode !== 'document' && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-semibold" style={{ color: !isUser ? readableNameColor(character.colors.name) : undefined }}>
                {name}
              </span>
              {settings.showTimestamps && (
                <span className="text-muted-foreground">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {settings.hideAvatars && settings.showMessageIds && <span className="text-muted-foreground">#{index}</span>}
              {/* no model chip for model-less turns (greetings, hand-written
                  messages) — an empty bordered box reads as a broken badge.
                  Icon only: hover (title) or tap reveals the model name.
                  Cached read sits LEFT of the badge (user-requested order). */}
              {settings.showCache && !isStreamingThis && realUsage && (realUsage.cacheRead ?? 0) > 0 && (
                <span className="text-muted-foreground">{formatTokens(realUsage.cacheRead ?? 0)} cached</span>
              )}
              {settings.showModelIcons && !isUser && !!(swipe?.model || (isStreamingThis ? activeModel : '')) && (
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        title={shortModel(swipe?.model || activeModel || '')}
                        aria-label={`Model: ${shortModel(swipe?.model || activeModel || '')}`}
                        className="-mx-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                      >
                        <ModelMark model={swipe?.model || activeModel || ''} className="size-4" />
                      </button>
                    }
                  />
                  <PopoverContent className="w-auto p-2 font-mono text-[10px]">{shortModel(swipe?.model || activeModel || '')}</PopoverContent>
                </Popover>
              )}
              {settings.hideAvatars && settings.showGenTimer && !isUser && !isStreamingThis && swipe && swipe.genTimeMs > 0 && (
                <span className="text-muted-foreground">{(swipe.genTimeMs / 1000).toFixed(1)}s</span>
              )}
              {settings.hideAvatars && settings.showTokens && !isStreamingThis && <span className="text-muted-foreground">{realUsage ? realUsage.output : tokens}t</span>}
              {settings.hideAvatars && settings.showCost && !isStreamingThis && msgCost != null && <span className="text-muted-foreground">{formatCost(msgCost)}</span>}
              {settings.showEdited && message.edited && <span className="text-muted-foreground italic">edited</span>}
              {message.hidden && !message.picture && (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Ghost className="size-3" aria-hidden="true" />
                  hidden from AI
                </span>
              )}
              {message.bookmarked && <BookmarkSimple weight="fill" className="size-3 text-primary" aria-hidden="true" />}
            </div>
          )}

          {/* LIVE thinking while the model streams: watch the
              reasoning grow, then the reply starts below it */}
          {!isUser && isStreamingThis && streamingThinking && !streamingMarks?.length && presetSamplers.reasoning.display !== 'hidden' && (
            <Collapsible open={thinkOpen[0] ?? settings.reasoningAutoExpand} onOpenChange={(o) => thinkToggle(0, o)}>
              <CollapsibleTrigger
                render={
                  <button type="button" className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                    {streamingFull ? (
                      `Thought for ${((streamingThinkMs ?? 0) / 1000) < 10 ? ((streamingThinkMs ?? 0) / 1000).toFixed(1) : Math.round((streamingThinkMs ?? 0) / 1000)}s`
                    ) : (
                      <>
                        <CircleNotch className="size-3 animate-spin" aria-hidden="true" />
                        Thinking…
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
              <div className="mt-1 flex items-start gap-1">
                <CollapsibleTrigger
                  render={
                    <button type="button" className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                      <Brain className="size-3" aria-hidden="true" />
                      {swipe.reasoningTime != null
                        ? `Thought for ${swipe.reasoningTime < 10 ? swipe.reasoningTime.toFixed(1) : Math.round(swipe.reasoningTime)}s`
                        : 'Thought'}
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
                  <div ref={trapWheel} className="think-text mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs italic text-muted-foreground">
                    <Markdown content={swipe.reasoning} />
                    <div className="mt-1 flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { void copyText(swipe.reasoning ?? '').then(ok => { if (ok) toast.success('Reasoning copied'); else toast.error('Copy failed') }) }}>Copy</Button>
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
              className={cn('relative mt-0.5', message.hidden && 'line-through decoration-muted-foreground/50', settings.italicNarration && 'narration-italic')}
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

          {/* Swipes on last assistant message */}
          {!isUser && (isLast || settings.swipeCountAllMessages) && message.swipes.length >= 1 && !isStreamingThis && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous swipe"
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
                aria-label="Next swipe or generate new"
                onClick={() => {
                  if (message.activeSwipe < message.swipes.length - 1) setSwipe(chat.id, message.id, message.activeSwipe + 1)
                  else if (isLast) regenerate(chat.id)
                }}
              >
                <CaretRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        {/* Balances the avatar block so the text column sits clear of the
            avatar; the RIGHT gap runs about half the left one — the reply
            gets more room to run long lines, without hugging the wall. */}
        {!settings.hideAvatars && mode !== 'document' && (
          <div aria-hidden className="shrink-0" style={{ width: isPortrait || isRect ? '1.75rem' : '1.25rem', zoom: 'var(--avatar-scale, 1)' }} />
        )}

        {/* Message toolbar — hidden while a swipe transition runs (the row is
            mid-slide; floating controls would ride along and read as a glitch).
            Invisible MUST mean unclickable: the bar floats over row corners,
            and an opacity-0 strip that still catches clicks turns stray corner
            clicks into accidental actions. Desktop reveals the full bar on
            hover; touch shows a minimal always-on bar — more menu + edit, the
            reference layout — so two small icons don't eat the screen */}
        {!editing && !isStreamingThis && !slidePhase && (
          <div className={cn(
            'absolute -top-3 right-2 flex items-center rounded-md border border-border bg-popover shadow-sm',
            settings.expandMessageActions || coarsePointer
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
          )}>
            {coarsePointer && moreMenu}
            {coarsePointer && <ToolbarBtn label="Edit" onClick={startEdit}><PencilSimple aria-hidden="true" /></ToolbarBtn>}
            {!coarsePointer && isSpeaking && (
              <ToolbarBtn label="Stop TTS" onClick={stopSpeaking}>
                <Square weight="fill" className="size-3" aria-hidden="true" />
              </ToolbarBtn>
            )}
            {!coarsePointer && <ToolbarBtn label="Edit" onClick={startEdit}><PencilSimple aria-hidden="true" /></ToolbarBtn>}
            {!coarsePointer && <ToolbarBtn label="Copy" onClick={copyBody}><Copy aria-hidden="true" /></ToolbarBtn>}
            {!coarsePointer && !isUser && <ToolbarBtn label="Regenerate" onClick={() => regenerate(chat.id)}><ArrowsClockwise aria-hidden="true" /></ToolbarBtn>}
            {!coarsePointer && moreMenu}
          </div>
        )}

      </div>

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

function ToolbarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
