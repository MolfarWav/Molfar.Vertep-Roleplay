
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MagnifyingGlass, Note, BookOpenText, GitBranch, GearSix, X, CaretUp, CaretDown, BookmarkSimple, Brain, UserPlus, DotsThreeVertical, ImageSquare, Trash, Lightning, Storefront, ArrowRight } from '@phosphor-icons/react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ModelMark } from '@/components/model-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { estimateTokens, formatCost, knownCost } from '@/lib/tokens'
import { fileToRawDataUrl, fetchWIStatus, type WIStatus } from '@/lib/engine'
import { useApp, useChat, useCharacter } from '@/lib/store'
import { speakText, voiceFor } from '@/lib/tts'
import { ChatQuickSwitch } from '@/components/chat/chat-quick-bar'
import { ChatsView } from '@/components/views/chats-view'
import { sectionsFor } from '@/components/shell/sections'
import { useT } from '@/hooks/use-t'
import { cleanPreview } from '@/lib/preview'
import type { ID } from '@/lib/types'
import { DEFAULT_AVATAR, cn, readableNameColor, shortModel } from '@/lib/utils'
import { cssAttrValue, scopeCss } from '@/lib/scope-css'
import { toast } from 'sonner'
import { MessageRow } from './message-row'
import { Composer } from './composer'
import { GroupMemberBar } from './group-member-bar'
import { MemoryPanel } from './memory-panel'
import { HelpDialog } from './help-dialog'
import { ExpressionPanel } from './expression-panel'
import { ConvertToGroupDialog } from './convert-to-group-dialog'
import { FieldVariantPicker } from './field-variant-picker'

/** The mobile chat's section bar. The desktop header's quick switch has no
 *  place here: presets, personas and connections are each one tap away, and
 *  using one from its drawer applies it to the open chat. Shortcuts and
 *  Marketplace ride in the chat menu to keep the icons at a thumb's width. */
const CHAT_BAR_SECTIONS = sectionsFor(['characters', 'personas', 'lorebooks', 'presets', 'connections', 'extensions', 'settings'])

/** Where the reader is: the topmost message still in view and how far its top
 *  sits above the fold. The log is measured from the top and opts out of the
 *  browser's own scroll anchoring, so anything that inserts or resizes rows
 *  ABOVE the reader — entering selection mode, the pagination window sliding
 *  back over older messages, a deletion — slides the page under them unless
 *  the offset is restored by hand. */
interface ScrollAnchor {
  id: ID
  offset: number
}

/** One find hit: the message and which of its occurrences (0-based). */
interface FindMatch {
  id: ID
  n: number
}

/** Rendered hits of `needle` (lowercased) in a message's reply text, in
 *  reading order. Thinking blocks are skipped: find counts the reply only. */
function findRanges(msgEl: HTMLElement, needle: string): Range[] {
  const out: Range[] = []
  for (const box of msgEl.querySelectorAll<HTMLElement>('.mes_text')) {
    if (box.closest('.think-text') || box.parentElement?.closest('.mes_text')) continue
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.nodeValue ?? '').toLowerCase()
      for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + needle.length)
        out.push(range)
      }
    }
  }
  return out
}

/** `doomed` ids are about to be removed; anchoring to one would restore
 *  nothing, so the first survivor in view takes the anchor instead. */
function captureAnchor(el: HTMLElement | null, doomed?: Set<ID>): ScrollAnchor | null {
  if (!el) return null
  const fold = el.getBoundingClientRect().top
  for (const row of el.querySelectorAll<HTMLElement>('[id^="msg-"]')) {
    const box = row.getBoundingClientRect()
    if (box.bottom <= fold) continue
    const id = row.id.slice(4)
    if (doomed?.has(id)) continue
    return { id, offset: box.top - fold }
  }
  return null
}

export function ChatView() {
  const activeChatId = useApp((s) => s.activeChatId)
  const chat = useChat(activeChatId)
  const character = useCharacter(chat?.characterId ?? null)
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const closeChat = useApp((s) => s.closeChat)
  // primitives only: subscribing to the streaming OBJECT re-rendered this
  // whole view (and every visible row with it) on every token
  const isStreaming = useApp((s) => s.streaming !== null)
  const streamingMessageId = useApp((s) => s.streaming?.messageId ?? null)
  const tickStream = useApp((s) => s.tickStream)
  const settings = useApp((s) => s.settings)
  const updateChat = useApp((s) => s.updateChat)
  const openChat = useApp((s) => s.openChat)
  const backgrounds = useApp((s) => s.backgrounds)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const addBackground = useApp((s) => s.addBackground)
  const updateBackground = useApp((s) => s.updateBackground)
  const drawer = useApp((s) => s.drawer)
  const setView = useApp((s) => s.setView)
  const closeDrawer = useApp((s) => s.closeDrawer)
  const t = useT()
  const bgFileRef = useRef<HTMLInputElement>(null)

  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const [loreOpen, setLoreOpen] = useState(false)
  const [branchesOpen, setBranchesOpen] = useState(false)
  // Home's "Branches" button opens the chat and asks for its tree
  const branchTreeFor = useApp((s) => s.branchTreeFor)
  useEffect(() => {
    if (branchTreeFor && branchTreeFor === chat?.id) {
      setBranchesOpen(true)
      useApp.setState({ branchTreeFor: null })
    }
  }, [branchTreeFor, chat?.id])
  const [displayOpen, setDisplayOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  // group auto mode: keep the scene moving while this chat is open — a bare
  // send (continue) fires every N seconds when nothing is generating and the
  // user isn't typing; any activity re-arms the timer
  const autoMode = chat?.groupSettings?.autoMode ?? false
  const autoDelaySec = Math.max(2, chat?.groupSettings?.autoDelaySec ?? 5)
  const msgCount = chat?.messages.length ?? 0
  const sendMessage = useApp((s) => s.sendMessage)
  useEffect(() => {
    if (!autoMode || !chat || isStreaming) return
    const t = setTimeout(() => {
      const el = document.activeElement
      const typing = el instanceof HTMLElement && !!el.closest('textarea, input[type="text"], [contenteditable="true"]')
      if (!typing) sendMessage(chat.id, '')
    }, autoDelaySec * 1000)
    return () => clearTimeout(t)
  }, [autoMode, autoDelaySec, isStreaming, msgCount, chat, sendMessage])
  const pageSize = Math.max(10, settings.messagesToLoad || 50)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  // Message-deletion mode (entered from the composer's plus menu).
  const deleteMode = useApp((s) => s.deleteMode)
  const setDeleteMode = useApp((s) => s.setDeleteMode)
  const deleteMessages = useApp((s) => s.deleteMessages)
  // Deleting from the middle of a chat is a *truncation*, not a pick-and-choose:
  // an LLM reply is conditioned on everything before it, so removing message N
  // while keeping N+1 leaves the tail talking about events that no longer
  // happened. Selection is therefore a single cutoff index — choosing a message
  // marks it and EVERYTHING BELOW it for deletion.
  const [cutoffId, setCutoffId] = useState<ID | null>(null)
  const cutoffIdx = cutoffId ? chat?.messages.findIndex((m) => m.id === cutoffId) ?? -1 : -1
  const selectedIds = useMemo(
    () => (cutoffIdx < 0 || !chat ? [] : chat.messages.slice(cutoffIdx).map((m) => m.id)),
    [chat, cutoffIdx],
  )
  // Clicking the current cutoff clears it; clicking anything else moves it.
  const toggleSelected = (id: ID) => setCutoffId((prev) => (prev === id ? null : id))
  // Leaving the mode must never leave a stale selection behind.
  useEffect(() => { if (!deleteMode) setCutoffId(null) }, [deleteMode])
  // Switching chats invalidates any cutoff held from the previous one.
  useEffect(() => { setCutoffId(null) }, [activeChatId])
  // Exiting the chat should also exit delete mode.
  useEffect(() => () => setDeleteMode(false), [setDeleteMode])
  const pinnedRef = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Rows compensate their own height changes (swipe swaps, streaming commits)
  // and need to know whether the reader is following the bottom. Measuring it
  // themselves mid-stream reads a scrollTop that is one frame behind, so the
  // pin is published here, where it is actually decided.
  const setPinned = (v: boolean) => {
    pinnedRef.current = v
    if (scrollRef.current) scrollRef.current.dataset.pinned = String(v)
  }
  const presets = useApp((s) => s.presets)

  // ── swipe transition clock ──
  // One clock for the whole chat: the swiped row AND every row below it slide
  // out (0 → ±range), the content swaps, then everything slides back in from
  // the opposite side (±range → 0). Rapid consecutive swipes accelerate with
  // a sigmoid falloff — spamming through greetings gets progressively snappier.
  const [swipeFx, setSwipeFx] = useState<{ index: number; dir: 1 | -1; range: number; dur: number; phase: 'out' | 'in' } | null>(null)
  const swipeStats = useRef({ now: 0, dir: 0, count: 0 })
  const swipeTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const onSwipeFx = useCallback((index: number, dir: 1 | -1, range: number) => {
    const stats = swipeStats.current
    const base = 125
    const now = performance.now()
    if (now - stats.now >= base * 2 + 300 || dir !== stats.dir) stats.count = 0
    stats.now = now
    stats.dir = dir
    stats.count++
    const dur = Math.round(base / (1 + Math.exp(stats.count - 4)))
    for (const t of swipeTimers.current) clearTimeout(t)
    swipeTimers.current = []
    if (dur <= 50) {
      // too fast to read as motion — land the swap instantly
      setSwipeFx({ index, dir, range, dur: 0, phase: 'in' })
      swipeTimers.current.push(setTimeout(() => setSwipeFx(null), 40))
      return
    }
    setSwipeFx({ index, dir, range, dur, phase: 'out' })
    swipeTimers.current.push(
      setTimeout(() => setSwipeFx((f) => (f ? { ...f, phase: 'in' } : null)), dur),
      setTimeout(() => setSwipeFx(null), dur * 2),
    )
  }, [])
  useEffect(() => () => { for (const t of swipeTimers.current) clearTimeout(t) }, [])

  // reset pagination + pinning when switching chats
  useEffect(() => { setVisibleCount(pageSize); setPinned(true) }, [activeChatId, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // streaming typewriter tick
  useEffect(() => {
    if (!isStreaming) return
    const iv = setInterval(tickStream, Math.max(16, 1000 / settings.streamingFps))
    return () => clearInterval(iv)
  }, [isStreaming, tickStream, settings.streamingFps])

  // ── sticky-bottom following ──
  // A pinned ref + a 5px at-bottom threshold: programmatic scrolls land at
  // exactly 0px offset, so the FIRST pixel of user scrolling up un-pins and
  // the next stream tick stops yanking — no threshold to fight through. A
  // wider threshold lets gentle drags stay "at bottom" while every tick
  // snaps back, which is the mobile rubber-band. Scroll writes are
  // coalesced to one per animation frame so rapid tokens never thrash
  // layout.
  const scrollRaf = useRef<number | null>(null)
  const scrollToBottom = (waitForFrame = true) => {
    if (!useApp.getState().settings.autoScroll) return
    // a queued callback must NOT be cancelled and rescheduled: fast streams
    // tick faster than frames render, and the perpetual cancel starved the
    // write entirely — the reply grew away below the viewport instead of
    // being followed. One write per frame, never starved.
    if (scrollRaf.current !== null) return
    const doScroll = () => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      scrollRaf.current = null
    }
    if (!waitForFrame) { doScroll(); return }
    scrollRaf.current = requestAnimationFrame(doScroll)
  }
  useEffect(() => () => { if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current) }, [])

  // ── keeping the reader's place ──
  // Taken in the handler that is about to change the layout, spent on the
  // very next commit. A reader following the bottom wants the bottom, not
  // the message that happened to be at the top of the fold.
  const anchorRef = useRef<ScrollAnchor | null>(null)
  const keepPlace = (doomed?: Set<ID>) => { anchorRef.current = captureAnchor(scrollRef.current, doomed) }
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchorRef.current = null
    const el = scrollRef.current
    if (!el) return
    // the bottom is a place too, and it is the one a pinned reader is in.
    // Written straight rather than through scrollToBottom: the auto-scroll
    // setting governs following a stream, not holding your position.
    if (pinnedRef.current) { el.scrollTop = el.scrollHeight; return }
    const row = document.getElementById(`msg-${anchor.id}`)
    if (!row) return
    el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset
  })
  // Selection mode rebuilds every row (checkbox column) and swaps the composer
  // for the bulk bar. The store update lands before React re-renders, so this
  // is the last look at the layout the reader is actually looking at.
  useEffect(() => useApp.subscribe((s, prev) => {
    if (s.deleteMode !== prev.deleteMode && !anchorRef.current) keepPlace()
  }), [])

  // a committed turn lands: follow it while pinned
  useEffect(() => {
    if (pinnedRef.current) scrollToBottom(true)
  }, [chat?.messages.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // Stream growth follows through a STORE subscription rather than a render
  // dependency: a token delta then costs one scrollTop write instead of a
  // re-render of the header, the composer and every visible row. Thinking
  // growth pins too (the pending bubble must stay in view while the model
  // reasons), and so do tool marks — a tool row or a second think block grows
  // the message while the text counter stands still.
  const followScrollRef = useRef(scrollToBottom)
  followScrollRef.current = scrollToBottom
  useEffect(() => useApp.subscribe((s, prev) => {
    const now = s.streaming
    const was = prev.streaming
    if (now === was) return
    if (now?.shown === was?.shown && now?.thinking?.length === was?.thinking?.length && now?.marks === was?.marks) return
    if (pinnedRef.current) followScrollRef.current(true)
  }), [])

  // TTS auto-play: speak each NEW assistant message once (not while streaming),
  // in the voice of whoever spoke it — a group turn is a different card than
  // the chat's own, and a per-character voice has to hold here too
  const spokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!settings.tts.autoPlay || settings.tts.provider === 'None' || isStreaming || !chat) return
    const last = chat.messages[chat.messages.length - 1]
    if (!last || last.role !== 'assistant' || spokenRef.current === last.id) return
    spokenRef.current = last.id
    const speaker = characters.find((c) => c.id === (last.characterId ?? chat.characterId))
    speakText(last.swipes[last.activeSwipe]?.content ?? '', voiceFor(settings.tts, speaker), `${chat.id}:${last.id}`)
      .catch((e: Error) => toast.error(`TTS failed: ${e.message}`))
  }, [chat, characters, isStreaming, settings.tts])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 5
    if (atBottom !== pinnedRef.current) setPinned(atBottom)
  }

  // A generation START or a fresh user turn re-arms following (and scrolls —
  // the user asked for that reply), until they scroll away again. Completion
  // must NOT re-arm: the streaming key falling back to the user-turn key is
  // not a "new" anchor, or a reader scrolled up mid-generation gets yanked to
  // the bottom the moment the reply commits. Also covers switching chats.
  const lastUserMsgId = chat ? ([...chat.messages].reverse().find((m) => m.role === 'user')?.id ?? null) : null
  const followRef = useRef<string | null>(null)
  const followedUserRef = useRef<string | null>(null)
  useEffect(() => {
    if (streamingMessageId) {
      if (followRef.current !== streamingMessageId) {
        followRef.current = streamingMessageId
        setPinned(true)
        scrollToBottom(true)
      }
      // the user turn that started this generation is already followed —
      // its key must not re-fire as new when streaming ends
      followedUserRef.current = lastUserMsgId
      return
    }
    if (lastUserMsgId && lastUserMsgId !== followedUserRef.current) {
      followedUserRef.current = lastUserMsgId
      followRef.current = lastUserMsgId
      setPinned(true)
      scrollToBottom(true)
    }
  }, [streamingMessageId, lastUserMsgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const charChats = useMemo(
    () => chats.filter((c) => c.characterId === chat?.characterId).sort((a, b) => a.createdAt - b.createdAt),
    [chats, chat?.characterId],
  )
  const chatIndex = charChats.findIndex((c) => c.id === chat?.id)

  // every occurrence, not every message: the counter and the arrows step
  // word by word the way browser find does
  const matches = useMemo(() => {
    if (!chat || !findQuery.trim()) return []
    const q = findQuery.toLowerCase()
    const out: FindMatch[] = []
    for (const m of chat.messages) {
      const text = m.swipes[m.activeSwipe]?.content.toLowerCase() ?? ''
      for (let at = text.indexOf(q), n = 0; at !== -1; at = text.indexOf(q, at + q.length), n++) out.push({ id: m.id, n })
    }
    return out
  }, [chat, findQuery])

  // ── find navigation ──
  // Stepping through matches must BRING the match into view. A match above
  // the pagination window isn't mounted at all, so the window grows to cover
  // it first and the scroll rides the next render.
  const pendingMatch = useRef<FindMatch | null>(null)
  // Centers the match's rendered word. The count comes from the raw text,
  // which markdown can render with fewer hits (a match split across styling),
  // so the index clamps; with no rendered hit (collapsed) the message centers.
  const scrollToMatch = (msgEl: HTMLElement, q: string, n: number) => {
    const ranges = findRanges(msgEl, q.toLowerCase())
    const range = ranges[Math.min(n, ranges.length - 1)]
    const scroller = scrollRef.current
    if (range && scroller) {
      scroller.scrollTop += range.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight / 2
      return
    }
    msgEl.scrollIntoView({ block: 'center' })
  }
  useEffect(() => {
    const match = matches[findIndex]
    if (!match || !chat) { pendingMatch.current = null; return }
    const el = document.getElementById(`msg-${match.id}`)
    if (el) { pendingMatch.current = null; scrollToMatch(el, findQuery, match.n); return }
    const idx = chat.messages.findIndex((m) => m.id === match.id)
    if (idx >= 0) { pendingMatch.current = match; setVisibleCount((c) => Math.max(c, chat.messages.length - idx)) }
  }, [findIndex, matches, chat, findQuery])
  useEffect(() => {
    const match = pendingMatch.current
    if (!match) return
    const el = document.getElementById(`msg-${match.id}`)
    if (el) { pendingMatch.current = null; scrollToMatch(el, findQuery, match.n) }
  }, [visibleCount, findQuery])

  // Paints every rendered hit, and the current one brighter, as CSS custom
  // highlights: ranges over the text, so the markdown DOM is never rewritten.
  // Repaints whenever the log's text changes (pagination, streaming, a block
  // expanding) so the marks never point at stale nodes.
  useEffect(() => {
    const scroller = scrollRef.current
    const registry = typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : null
    if (!findOpen || !scroller || !registry) return
    const needle = findQuery.toLowerCase()
    const current = matches[findIndex]
    let frame = 0
    const paint = () => {
      frame = 0
      const all: Range[] = []
      let cur: Range | undefined
      if (needle.trim()) {
        for (const el of scroller.querySelectorAll<HTMLElement>('[id^="msg-"]')) {
          const ranges = findRanges(el, needle)
          all.push(...ranges)
          if (current && el.id === `msg-${current.id}`) cur = ranges[Math.min(current.n, ranges.length - 1)]
        }
      }
      registry.set('chat-find', new Highlight(...all))
      if (cur) {
        const hl = new Highlight(cur)
        hl.priority = 1
        registry.set('chat-find-current', hl)
      } else registry.delete('chat-find-current')
    }
    paint()
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(paint) })
    observer.observe(scroller, { subtree: true, childList: true, characterData: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      registry.delete('chat-find')
      registry.delete('chat-find-current')
    }
  }, [findOpen, findQuery, matches, findIndex])

  // Ctrl+F / Cmd+F toggles the find bar while a chat is open — the label
  // on the header button promises it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Real world-info activation for this chat — the same activation path a
  // generation runs (constants + key matches over recent messages with the
  // context-scaled budget), fetched from the engine when the sheet opens.
  // Never a client-side approximation: budget cuts and recursion change what
  // actually fires.
  const [wiStatus, setWiStatus] = useState<WIStatus | null>(null)
  useEffect(() => {
    if (!loreOpen || !chat) { setWiStatus(null); return }
    let alive = true
    fetchWIStatus(chat.id)
      .then((s) => { if (alive) setWiStatus(s) })
      .catch(() => { if (alive) setWiStatus(null) })
    return () => { alive = false }
  }, [loreOpen, chat])

  // 'none' = the user explicitly picked None for THIS chat — it must beat the
  // global active background (plain null just means "never chose": global wins)
  const bg = chat?.backgroundId === 'none'
    ? undefined
    : backgrounds.find((b) => b.id === (chat?.backgroundId ?? settings.activeBackgroundId))

  // memory cutoff: walk from newest message backwards, accumulate token estimate against the preset's context size
  const cutoffIndex = useMemo(() => {
    if (!chat) return -1
    const preset = presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0]
    const budget = (preset?.samplers.contextSize ?? 8192) - (preset?.samplers.maxTokens ?? 512) - 800 // reserve for system/response
    let used = 0
    // messages above the summary cutoff already left the prompt; the summary
    // covers them, so only the stretch below can fall out of context
    const summaryCut = chat.memoryCutoffMessageId ? chat.messages.findIndex((m) => m.id === chat.memoryCutoffMessageId) : -1
    used += estimateTokens(chat.summary)
    for (let i = chat.messages.length - 1; i >= Math.max(0, summaryCut); i--) {
      const m = chat.messages[i]
      if (!m || m.hidden) continue
      used += estimateTokens(m.swipes[m.activeSwipe]?.content) + 8
      if (used > budget) return i // messages at index <= i are out of context
    }
    return -1
  }, [chat, presets])

  // Actual spend: sum the REAL per-generation costs the engine reported on
  // each swipe. No pricing table is guessed client-side — messages generated
  // before usage tracking simply don't contribute, and if nothing reported
  // cost the badge stays hidden rather than claiming "free".
  const defaultModel = useApp((s) => s.model)
  const { chatCost, costMsgs, chatModel } = useMemo(() => {
    if (!chat) return { chatCost: null as number | null, costMsgs: 0, chatModel: '' }
    // the ACTIVE swipe of the last reply — swipes can come from different
    // models, so the first swipe's model would mislabel the badge
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant')
    const lastModel = lastAssistant?.swipes[lastAssistant.activeSwipe]?.model ?? ''
    let cost = 0
    let n = 0
    for (const m of chat.messages) {
      const c = knownCost(m.swipes[m.activeSwipe]?.usage)
      if (c != null) { cost += c; n++ }
    }
    return { chatCost: n > 0 ? cost : null, costMsgs: n, chatModel: lastModel }
  }, [chat])

  const startIdx = chat ? Math.max(0, chat.messages.length - visibleCount) : 0
  // the newest real turn owns the swipe controls; a picture posted after a
  // reply does not take them over
  const lastReplyIndex = chat ? chat.messages.reduce((at, m, i) => (m.picture ? at : i), -1) : -1
  const summaryCutIndex = chat?.memoryCutoffMessageId ? chat.messages.findIndex((m) => m.id === chat.memoryCutoffMessageId) : -1

  // A dead 'chat' state (stale persisted id, the chat deleted from another
  // client mid-view) used to dead-end on "No chat selected" — fall back to
  // the chat list instead: show it immediately, and fix the actual view so
  // the shell/nav treat this as the list (mobile tab bar included).
  useEffect(() => {
    if (!chat || !character) closeChat()
  }, [chat, character, closeChat])

  if (!chat || !character) {
    return <ChatsView />
  }

  // One shared column width for the log AND the composer, so a narrower chat
  // stays centred in the pane instead of hugging a screen corner. The
  // spans the window; here the boundary is centred at every width setting.
  const chatMax =
    settings.chatWidth === 'full' ? '100%' :
    settings.chatWidth === 'comfortable' ? '48rem' :
    settings.chatWidth === 'compact' ? '36rem' :
    `${settings.chatWidthCustom}px`

  // one set of chat tools for the desktop kebab and the mobile chat menu
  const chatTools = (
    <>
      <DropdownMenuItem onClick={() => setNotesOpen(true)}>
        <Note className="size-4" aria-hidden="true" /> Author&apos;s note
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setLoreOpen(true)}>
        <BookOpenText className="size-4" aria-hidden="true" /> Lorebook activity{wiStatus ? ` (${wiStatus.fired.length})` : ''}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setSummaryOpen(true)}>
        <Brain className="size-4" aria-hidden="true" /> Memory
      </DropdownMenuItem>
      {!character.isGroup && (
        <DropdownMenuItem onClick={() => setConvertOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" /> Convert to group
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => setBranchesOpen(true)}>
        <GitBranch className="size-4" aria-hidden="true" /> Branches
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setBookmarksOpen(true)}>
        <BookmarkSimple className="size-4" aria-hidden="true" /> Bookmarks
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setDisplayOpen(true)}>
        <GearSix className="size-4" aria-hidden="true" /> Display settings
      </DropdownMenuItem>
    </>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col" style={{ '--chat-max': chatMax } as React.CSSProperties}>
      {bg && (
        <div
          aria-hidden="true"
          className="chat-bg-layer"
          style={{
            backgroundImage: `url(${bg.url})`,
            backgroundSize: bg.fitting === 'stretch' ? '100% 100%' : bg.fitting,
            opacity: settings.backgroundOpacity / 100,
          }}
        />
      )}

      {/* Header + group bar PINNED above the message log — the one view where
          the top row stays visible at all times (back, name, search, preset
          switcher are crucial chrome). `text-sm` & co are rem-based, so the
          log's fontScale doesn't resize them. */}
      <header className="relative z-10 hidden h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:flex">
          <Button variant="ghost" size="icon-sm" onClick={closeChat} aria-label="Back to chats">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Avatar className="size-8 rounded-md">
            <AvatarImage src={character.avatar || DEFAULT_AVATAR} alt="" />
            <AvatarFallback>{character.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight" style={{ color: readableNameColor(character.colors.name) }}>
              {character.name}
            </p>
            <p className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
              <span className="min-w-0 truncate">{chat.title}</span>
              <span>·</span>
              <button
                type="button"
                className="shrink-0 whitespace-nowrap hover:text-foreground"
                onClick={() => {
                  const next = charChats[(chatIndex + 1) % charChats.length]
                  if (next) openChat(next.id)
                }}
              >
                chat {chatIndex + 1} of {charChats.length}
              </button>
            </p>
          </div>
          {settings.showModelIcons && (
            <Badge variant="outline" className="ml-1 hidden shrink-0 gap-1 font-mono text-[11px] sm:inline-flex">
              <ModelMark model={chatModel || defaultModel || ''} className="size-3.5" />
              {shortModel(chatModel || defaultModel || '') || 'no model'}
            </Badge>
          )}
          {settings.showCost && chatCost !== null && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
                    {formatCost(chatCost)}
                  </Badge>
                }
              />
              <TooltipContent>
                Actual spend across {costMsgs} generated message{costMsgs === 1 ? '' : 's'} (engine-reported)
              </TooltipContent>
            </Tooltip>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <ChatQuickSwitch chatId={chat.id} />
            <HeaderIcon label="Find in chat (Ctrl+F)" onClick={() => setFindOpen((o) => !o)}>
              <MagnifyingGlass aria-hidden="true" />
            </HeaderIcon>
            {/* All chat tools behind one kebab, every width */}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Chat tools">
                      <DotsThreeVertical aria-hidden="true" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {chatTools}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
      </header>

      {/* Mobile: one row of sections instead of the header. Each opens as a
          drawer over the chat, just below this bar, and tapping it again
          closes it; who and which chat moves into the chat menu. Its height
          is the drawer's top offset in SectionDrawer (top-11). */}
      <nav aria-label="Sections" className="relative z-10 flex h-11 shrink-0 items-center border-b border-border bg-card px-1 md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => { closeDrawer(); closeChat() }} aria-label="Back to chats">
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-around overflow-x-auto">
          {CHAT_BAR_SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => (drawer === item.key ? closeDrawer() : setView(item.key))}
              aria-label={t(item.labelKey)}
              aria-pressed={drawer === item.key}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md transition-colors',
                drawer === item.key ? 'bg-accent text-cta' : 'text-muted-foreground active:bg-accent',
              )}
            >
              <item.icon className="size-4.5" aria-hidden="true" />
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Chat menu">
                <DotsThreeVertical aria-hidden="true" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm text-foreground" style={{ color: readableNameColor(character.colors.name) }}>{character.name}</span>
              <span className="truncate font-normal">
                {chat.title} · chat {chatIndex + 1} of {charChats.length}
                {settings.showCost && chatCost !== null ? ` · ${formatCost(chatCost)}` : ''}
              </span>
            </DropdownMenuLabel>
            {charChats.length > 1 && (
              <DropdownMenuItem
                onClick={() => {
                  const next = charChats[(chatIndex + 1) % charChats.length]
                  if (next) openChat(next.id)
                }}
              >
                <ArrowRight className="size-4" aria-hidden="true" /> Next chat
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setFindOpen((o) => !o)}>
              <MagnifyingGlass className="size-4" aria-hidden="true" /> Find in chat
            </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {chatTools}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView('quickreplies')}>
              <Lightning className="size-4" aria-hidden="true" /> Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView('marketplace')}>
              <Storefront className="size-4" aria-hidden="true" /> Marketplace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Find bar */}
      {findOpen && (
        <div className="relative z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
          <MagnifyingGlass className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={findQuery}
            onChange={(e) => { setFindQuery(e.target.value); setFindIndex(0) }}
            placeholder="Find in chat…"
            className="h-7 max-w-xs text-sm"
            aria-label="Find in chat"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setFindIndex((i) => (i + (e.shiftKey ? -1 : 1) + matches.length) % Math.max(1, matches.length))
              if (e.key === 'Escape') setFindOpen(false)
            }}
          />
          <span className="text-xs text-muted-foreground">
            {matches.length > 0 ? `${findIndex + 1}/${matches.length}` : findQuery ? '0 matches' : ''}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Previous match" onClick={() => setFindIndex((i) => (i - 1 + matches.length) % Math.max(1, matches.length))}>
            <CaretUp aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next match" onClick={() => setFindIndex((i) => (i + 1) % Math.max(1, matches.length))}>
            <CaretDown aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close find" onClick={() => setFindOpen(false)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* per-character CSS — mounted only while this character's chat is open,
          scoped to this character's own message rows so a card cannot restyle
          the user's messages or the surrounding app chrome */}
      {character.css?.trim() ? <style dangerouslySetInnerHTML={{ __html: scopeCss(character.css, `[data-char-id="${cssAttrValue(character.id)}"]`) }} /> : null}

      {/* Group member bar */}
      {character.isGroup && <GroupMemberBar chat={chat} group={character} />}

      {/* `data-chat-log` lets the composer scroll-compensate this pane as the
          textarea grows upward, so the message you're reading stays put. */}
      <div ref={scrollRef} data-chat-log data-pinned="true" onScroll={onScroll} className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none] [-webkit-overflow-scrolling:touch]" style={{ fontSize: `${settings.fontScale}%` }}>
        <div
          className="chat-column flex flex-col gap-1 px-2 py-3 sm:px-4"
          style={swipeFx ? ({
            '--swipe-out-x': `${swipeFx.dir * swipeFx.range}px`,
            '--swipe-in-x': `${-swipeFx.dir * swipeFx.range}px`,
            '--swipe-dur': `${swipeFx.dur}ms`,
          }) as React.CSSProperties : undefined}
        >
          {startIdx > 0 && (
            <button
              type="button"
              onClick={() => { keepPlace(); setVisibleCount((c) => c + pageSize) }}
              className="mx-auto mb-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Load earlier messages ({startIdx} earlier)
            </button>
          )}
          {chat.messages.slice(startIdx).map((msg, sliceIdx) => {
            const i = startIdx + sliceIdx
            const prev = i > 0 ? chat.messages[i - 1] : null
            const showDay = settings.dayDividers && (!prev || new Date(prev.timestamp).toDateString() !== new Date(msg.timestamp).toDateString())
            return (
              <div key={msg.id} className="contents">
                {showDay && (
                  <div className="my-3 flex items-center gap-3" aria-hidden="true">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {formatDay(msg.timestamp)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                {cutoffIndex >= 0 && i === cutoffIndex + 1 && i > 0 && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-destructive/40" />
                    <span className="rounded-full border border-destructive/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                      Out of context, messages above are forgotten
                    </span>
                    <div className="h-px flex-1 bg-destructive/40" />
                  </div>
                )}
                {deleteMode ? (
                  // Delete mode: the whole row is a target so tapping anywhere
                  // sets the cutoff (message actions are suppressed while
                  // selecting). Everything from the cutoff down reads as doomed.
                  (() => {
                    const doomed = cutoffIdx >= 0 && i >= cutoffIdx
                    const isCutoff = i === cutoffIdx
                    return (
                      // The row handles the tap itself: a label's default
                      // forwards the click to its checkbox, which takes focus
                      // and the browser scrolls it (the top of the message)
                      // into view. Selecting must leave the reader in place.
                      <label
                        onClick={(e) => { e.preventDefault(); toggleSelected(msg.id) }}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 px-1 py-0.5 transition-colors',
                          doomed
                            ? 'bg-destructive/10 ring-1 ring-destructive/40'
                            : 'rounded-lg hover:bg-accent/40',
                          // The run of doomed rows reads as one block: only the
                          // first gets a top radius, only the last a bottom one.
                          doomed && (isCutoff ? 'rounded-t-lg' : 'rounded-none'),
                          doomed && i === chat.messages.length - 1 && 'rounded-b-lg',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={doomed}
                          readOnly
                          className="mt-3 size-4 shrink-0 accent-[var(--destructive)]"
                          aria-label={
                            isCutoff
                              ? `Message ${i + 1} is the delete cutoff, clear selection`
                              : `Delete message ${i + 1} and everything below it`
                          }
                        />
                        <div className="pointer-events-none min-w-0 flex-1 opacity-95">
                          <MessageRow chat={chat} message={msg} index={i} character={character} isLast={false} />
                        </div>
                      </label>
                    )
                  })()
                ) : (
                  <MessageRow
                    chat={chat}
                    message={msg}
                    index={i}
                    character={character}
                    isLast={i === lastReplyIndex}
                    summarized={i < summaryCutIndex}
                    slidePhase={swipeFx && i >= swipeFx.index ? swipeFx.phase : null}
                    onSwipeFx={onSwipeFx}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Composer — replaced by the bulk bar while selecting messages. */}
      <div className="relative z-10">
        {/* While selecting, `chat-column` keeps the bulk bar inset to the
            message column so it lines up with the composer it replaces. */}
        {deleteMode ? (
          <div className="chat-column mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <span className="text-sm font-medium">
              {selectedIds.length === 0
                ? 'Pick where to cut'
                : `${selectedIds.length} message${selectedIds.length === 1 ? '' : 's'} from here down`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCutoffId(cutoffIdx === 0 ? null : (chat.messages[0]?.id ?? null))
              }
              disabled={chat.messages.length === 0}
            >
              {cutoffIdx === 0 ? 'Clear' : 'Select all'}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteMode(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  const n = selectedIds.length
                  keepPlace(new Set(selectedIds))
                  deleteMessages(chat.id, selectedIds)
                  setDeleteMode(false)
                  toast.success(`Deleted ${n} message${n === 1 ? '' : 's'}`)
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash className="size-4" aria-hidden="true" />
                Delete{selectedIds.length > 0 ? ` ${selectedIds.length}` : ''}
              </Button>
            </div>
          </div>
        ) : (
          <Composer chatId={chat.id} />
        )}
      </div>

      {/* Author's note sheet */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{"Author's note"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="an-text">Note ({estimateTokens(chat.authorNote.text)} tokens)</FieldLabel>
                <Textarea
                  id="an-text"
                  rows={5}
                  value={chat.authorNote.text}
                  onChange={(e) => updateChat(chat.id, { authorNote: { ...chat.authorNote, text: e.target.value } })}
                  placeholder="Steer the narrative from behind the curtain…"
                />
              </Field>
              <Field>
                <FieldLabel>Position</FieldLabel>
                <Select
                  value={chat.authorNote.position}
                  onValueChange={(v) => v && updateChat(chat.id, { authorNote: { ...chat.authorNote, position: v as never } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="before-system">Before system prompt</SelectItem>
                      <SelectItem value="after-system">After system prompt</SelectItem>
                      <SelectItem value="in-chat">In-chat @ depth</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {chat.authorNote.position === 'in-chat' && (
                <>
                  <Field>
                    <FieldLabel>Depth: {chat.authorNote.depth}</FieldLabel>
                    <Slider
                      value={[chat.authorNote.depth]}
                      min={0}
                      max={20}
                      step={1}
                      onValueChange={(v) => updateChat(chat.id, { authorNote: { ...chat.authorNote, depth: (Array.isArray(v) ? v[0] : (v as number)) } })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Injected {chat.authorNote.depth} message{chat.authorNote.depth === 1 ? '' : 's'} from the end of the chat.
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <Select
                      value={chat.authorNote.role}
                      onValueChange={(v) => v && updateChat(chat.id, { authorNote: { ...chat.authorNote, role: v as never } })}
                    >
                      <SelectTrigger aria-label="Author's note role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="system">System</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="assistant">Assistant</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel>Insertion frequency (every N messages): {chat.authorNote.frequency}</FieldLabel>
                <Slider
                  value={[chat.authorNote.frequency]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={(v) => updateChat(chat.id, { authorNote: { ...chat.authorNote, frequency: (Array.isArray(v) ? v[0] : (v as number)) } })}
                />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Include in World Info scan
                  <span className="block text-[11px] text-muted-foreground">Let the note text trigger lorebook entries.</span>
                </span>
                <Switch
                  checked={chat.authorNote.includeInWIScan}
                  onCheckedChange={(v) => updateChat(chat.id, { authorNote: { ...chat.authorNote, includeInWIScan: v } })}
                  aria-label="Include author's note in World Info scan"
                />
              </label>
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-sm font-medium">Card variants for this chat</p>
                <FieldVariantPicker chat={chat} character={character} />
              </div>
              <Field>
                <FieldLabel htmlFor="an-char">Character-private note: {character.name}</FieldLabel>
                <Textarea
                  id="an-char"
                  rows={3}
                  value={character.depthPrompt.text}
                  onChange={(e) => updateCharacter(character.id, { depthPrompt: { ...character.depthPrompt, text: e.target.value } })}
                  placeholder="Travels with the character card, not the chat…"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">@ depth</span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={character.depthPrompt.depth}
                    onChange={(e) => updateCharacter(character.id, { depthPrompt: { ...character.depthPrompt, depth: Number(e.target.value) || 0 } })}
                    className="h-7 w-16"
                    aria-label="Character note depth"
                  />
                  <Select
                    value={character.depthPrompt.role}
                    onValueChange={(v) => v && updateCharacter(character.id, { depthPrompt: { ...character.depthPrompt, role: v as never } })}
                  >
                    <SelectTrigger className="h-7 w-32" aria-label="Character note role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
            </FieldGroup>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lore activity sheet */}
      <Sheet open={loreOpen} onOpenChange={setLoreOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>World info activity</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
            {!wiStatus ? (
              <p className="text-sm text-muted-foreground">Checking what actually fires…</p>
            ) : wiStatus.fired.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing fires for this chat right now. Entries need their keys in the recent
                messages, or Constant status.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {(wiStatus.usedChars / 4 | 0).toLocaleString()}t used of ~{(wiStatus.budgetChars / 4 | 0).toLocaleString()}t WI budget
                  · context {wiStatus.contextTokens.toLocaleString()}t
                </p>
                <ul className="flex flex-col gap-2">
                  {wiStatus.fired.map((r, i) => (
                    <li key={`${r.book}-${r.uid}-${i}`} className="rounded-md border border-primary/40 bg-primary/5 p-2.5">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">{r.constant ? 'constant' : 'keyed'}</Badge>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.book} · {Math.ceil(r.chars / 4)}t
                      </p>
                    </li>
                  ))}
                </ul>
                {wiStatus.skipped.length > 0 && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">Cut by budget ({wiStatus.skipped.length})</p>
                    <ul className="flex flex-col gap-1.5">
                      {wiStatus.skipped.map((r, i) => (
                        <li key={`skip-${r.book}-${r.uid}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">{r.title}</span>
                          <span className="shrink-0 text-[10px]">{r.book}</span>
                          <span className="shrink-0 text-[11px]">+{Math.ceil(r.chars / 4)}t over</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Branch tree */}
      <Sheet open={branchesOpen} onOpenChange={setBranchesOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Branch tree</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            <div className="rounded-md border border-primary/60 bg-accent p-2.5 text-sm">
              <span className="font-medium">{chat.title}</span>
              <Badge variant="secondary" className="ml-2">current</Badge>
              <p className="text-xs text-muted-foreground">{chat.messages.length} messages</p>
            </div>
            {/* the current chat's branch neighborhood: its forks, its sibling
                branches (same fork point), and the chat it forked from */}
            {charChats
              .filter((c) =>
                c.parentChatId === chat.id ||
                (!!chat.parentChatId && (c.id === chat.parentChatId || (c.parentChatId === chat.parentChatId && c.id !== chat.id))),
              )
              .slice(0, 12)
              .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { openChat(c.id); setBranchesOpen(false) }}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border p-2.5 text-left text-sm hover:bg-accent',
                  c.parentChatId && 'ml-6',
                )}
              >
                {c.parentChatId && <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="text-xs text-muted-foreground">{c.messages.length > 0 ? c.messages.length : c.messageCount ?? 0} msgs</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Bookmarks */}
      <Dialog open={bookmarksOpen} onOpenChange={setBookmarksOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bookmarks</DialogTitle>
          </DialogHeader>
          {chat.messages.filter((m) => m.bookmarked).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookmarks yet. Use the bookmark action on any message.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {chat.messages.filter((m) => m.bookmarked).map((m) => (
                <li key={m.id} className="rounded-md border border-border p-2.5">
                  <p className="text-sm font-medium">{m.bookmarkLabel ?? 'Bookmark'}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{cleanPreview(m.swipes[m.activeSwipe]?.content ?? '')}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Display settings */}
      <Sheet open={displayOpen} onOpenChange={setDisplayOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Chat display</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Chat background</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => bgFileRef.current?.click()}
              >
                <ImageSquare className="size-3.5" aria-hidden="true" />
                Upload
              </Button>
            </div>
            <input
              ref={bgFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                // data URL, not an object URL — it persists to the library and
                // must survive reloads (object URLs die with the page)
                const url = await fileToRawDataUrl(file)
                const id = addBackground(file.name.replace(/\.[^.]+$/, ''), url)
                updateChat(chat.id, { backgroundId: id })
                toast.success('Background added to your library')
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => updateChat(chat.id, { backgroundId: 'none' })}
                className={cn(
                  'flex aspect-video items-center justify-center rounded-md border text-[10px] text-muted-foreground',
                  chat.backgroundId === 'none' ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground',
                )}
              >
                None
              </button>
              {backgrounds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => updateChat(chat.id, { backgroundId: b.id })}
                  className={cn(
                    'aspect-video overflow-hidden rounded-md border bg-cover bg-center',
                    chat.backgroundId === b.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground',
                  )}
                  style={{ backgroundImage: `url(${b.url})` }}
                  aria-label={`Use background ${b.name}`}
                  title={b.name}
                />
              ))}
            </div>
            {bg && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Fit</span>
                <Select value={bg.fitting} onValueChange={(v) => v && updateBackground(bg.id, { fitting: v as never })}>
                  <SelectTrigger className="h-7 flex-1" aria-label="Background fitting"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="cover">Cover</SelectItem>
                      <SelectItem value="contain">Contain</SelectItem>
                      <SelectItem value="stretch">Stretch</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DisplaySettings />
        </SheetContent>
      </Sheet>

      {/* Memory & summary */}
      <MemoryPanel chat={chat} open={summaryOpen} onOpenChange={setSummaryOpen} />

      {/* /help — commands + macros reference (UI only) */}
      <HelpDialog />

      {/* expression sprite for the latest speaker (emotion-detected) */}
      <ExpressionPanel chat={chat} />

      {/* Convert solo chat to group */}
      {!character.isGroup && (
        <ConvertToGroupDialog chat={chat} character={character} open={convertOpen} onOpenChange={setConvertOpen} />
      )}
    </div>
  )
}

function formatDay(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function HeaderIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
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

function DisplaySettings() {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const setSettingsSection = useApp((s) => s.setSettingsSection)
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      <FieldGroup>
        <Field>
          <FieldLabel>Display mode</FieldLabel>
          <Select value={settings.displayMode} onValueChange={(v) => v && updateSettings({ displayMode: v as never })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="bubbles">Bubbles</SelectItem>
                <SelectItem value="flat">Flat</SelectItem>
                <SelectItem value="minimal">Minimal (accent bars)</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Chat width</FieldLabel>
          <Select value={settings.chatWidth} onValueChange={(v) => v && updateSettings({ chatWidth: v as never })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Font scale: {settings.fontScale}%</FieldLabel>
          <Slider value={[settings.fontScale]} min={75} max={150} step={5} onValueChange={(v) => updateSettings({ fontScale: (Array.isArray(v) ? v[0] : (v as number)) })} />
        </Field>
        <Field>
          <FieldLabel>Background opacity: {settings.backgroundOpacity}%</FieldLabel>
          <Slider value={[settings.backgroundOpacity]} min={0} max={100} step={2} onValueChange={(v) => updateSettings({ backgroundOpacity: (Array.isArray(v) ? v[0] : (v as number)) })} />
        </Field>
        <Field>
          <FieldLabel>Streaming FPS: {settings.streamingFps}</FieldLabel>
          <Slider value={[settings.streamingFps]} min={5} max={60} step={5} onValueChange={(v) => updateSettings({ streamingFps: (Array.isArray(v) ? v[0] : (v as number)) })} />
        </Field>
      </FieldGroup>
      <Button variant="outline" size="sm" onClick={() => setSettingsSection('appearance')}>
        Open full appearance settings
      </Button>
    </div>
  )
}
