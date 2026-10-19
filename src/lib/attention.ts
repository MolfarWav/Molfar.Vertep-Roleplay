// What waits on the player (#55): one source for the rail badge, the chat list badge and the
// "needs you" toast. Today it carries Litopys proposals (facts the Library suggests to pin,
// merge, rewrite or retire); soul proposals keep their own check in store.ts and share only
// the per-kind switch (settings.attention).
//
// Failures are a third kind (`failed`): background jobs that stopped with an error (the World
// DM, the Library's worker, the dashboard sensor of the open chat, a soul rating). They are
// listed in the inbox until the source stops reporting them or the player dismisses them, and
// each new one is toasted once (key `worker:ref:at`, in the same seen list).
//
// The counts come from GET /litopys/chats (pending proposals per chat), polled while the page
// is visible. A proposal is toasted once: its `chatId:id` goes into a seen list in localStorage
// (memory when storage is unavailable). Everything waiting at the first poll after a load is
// toasted too, batched into one toast, so a pile the player never saw still gets said once.

import { create } from 'zustand'
import { toast } from 'sonner'
import { acceptLitProposal, rejectLitProposal, fetchLitChat, fetchLitChats, isPinLimit, type LitChatItem } from '@/components/library/litopys-api'
import { t, type Lang } from '@/lib/i18n'
import { listWorldChats } from '@/lib/world'
import {
  failKey, failReason, litCounts, litopysFailures, soulFailures, takeNew, takeNewFailures, toastPlan, waitingOf, worldFailures, workerName,
  type FailedItem, type SoulWaiting, type WaitingProposal,
} from './attention-core'

export * from './attention-core'

interface AttentionState {
  /** pending Litopys proposals per chat id (only chats with some) */
  litopys: Record<string, number>
  /** the Library's name for each of those chats (a fallback when the app has not loaded the chat) */
  litNames: Record<string, string>
  /** cards with souls proposed or a failed rating, newest first */
  soul: SoulWaiting[]
  /** background failures by source (soul failures ride in `soul`) */
  failedBy: Partial<Record<'world' | 'litopys' | 'dashboard', FailedItem[]>>
  /** all of them, dismissed ones left out */
  failed: FailedItem[]
  /** failure keys the player dismissed */
  dismissed: Set<string>
}

export const useAttention = create<AttentionState>(() => ({
  litopys: {}, litNames: {}, soul: [], failedBy: {}, failed: [], dismissed: new Set(),
}))

const mergeFailed = (by: AttentionState['failedBy'], dismissed: Set<string>) =>
  Object.values(by).flat().filter((f) => !dismissed.has(failKey(f)))

/** One source reports its failures (an empty list clears them). */
export function setFailed(worker: 'world' | 'litopys' | 'dashboard', items: FailedItem[]) {
  const st = useAttention.getState()
  const failedBy = { ...st.failedBy, [worker]: items }
  useAttention.setState({ failedBy, failed: mergeFailed(failedBy, st.dismissed) })
}

/** "Dismiss" on a failure row: gone until that job fails again (a new `at`). */
export function dismissFailure(key: string) {
  const st = useAttention.getState()
  const dismissed = new Set(st.dismissed).add(key)
  writeDismissed(dismissed)
  useAttention.setState({ dismissed, failed: mergeFailed(st.failedBy, dismissed) })
}

const namesOf = (items: Pick<LitChatItem, 'id' | 'name' | 'proposals'>[]) =>
  Object.fromEntries(items.filter((it) => it.proposals > 0 && it.name).map((it) => [it.id, it.name]))

/** The Library view already polls the list: it hands the counts over so the badge follows at once. */
export function setLitCounts(items: Pick<LitChatItem, 'id' | 'name' | 'proposals'>[], on = true) {
  useAttention.setState({ litopys: on ? litCounts(items) : {}, litNames: on ? namesOf(items) : {} })
}

/** The soul poll (store.ts, which owns the engine helper) hands its list over here. */
export function setSoulWaiting(list: SoulWaiting[]) {
  useAttention.setState({ soul: list })
}

// ---------- dismissed failures ----------
const DISMISSED_KEY = 'rp.attention.dismissed'
let dismissedMem: string[] = []

function readDismissed(): Set<string> {
  let list = dismissedMem
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (raw) list = JSON.parse(raw) as string[]
  } catch {
    // storage unavailable: memory only
  }
  return new Set(Array.isArray(list) ? list : [])
}

function writeDismissed(set: Set<string>) {
  dismissedMem = [...set].slice(-400)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedMem))
  } catch {
    // storage unavailable: memory only
  }
}

useAttention.setState({ dismissed: readDismissed() })

// ---------- seen list ----------
const SEEN_KEY = 'rp.attention.seen'
const SEEN_MAX = 400
let seenMem: string[] = []

function readSeen(): Set<string> {
  let list = seenMem
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (raw) list = JSON.parse(raw) as string[]
  } catch {
    // storage unavailable: memory only
  }
  return new Set(Array.isArray(list) ? list : [])
}

function writeSeen(seen: Set<string>) {
  seenMem = [...seen].slice(-SEEN_MAX)
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenMem))
  } catch {
    // storage unavailable: memory only
  }
}

// ---------- the toast ----------
/** Typing in a field: wait until the keys rest, so the toast never lands mid-word. */
let lastKey = 0
if (typeof window !== 'undefined') window.addEventListener('keydown', () => { lastKey = Date.now() }, true)
function whenIdle(fn: () => void, tries = 10) {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  const typing = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || (el as HTMLElement).isContentEditable)
  if (tries > 0 && typing && Date.now() - lastKey < 2500) {
    setTimeout(() => whenIdle(fn, tries - 1), 2500)
    return
  }
  fn()
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
/** 40 px targets on phones; the class lands on sonner's own buttons. */
const BTN = 'max-md:!h-10 max-md:!px-3'

export interface AttentionDeps {
  lang: Lang
  on: boolean
  /** the "failed" switch */
  failedOn: boolean
  openLibrary: (chatId: string) => void
  /** where a failure is fixed: the World section, the Library, the chat, the card's Soul tab */
  openFailure: (f: FailedItem) => void
  openInbox: () => void
  /** the chat's or card's name for a toast; '' when unknown */
  nameOf: (f: FailedItem) => string
  /** the player is looking at the place where this is fixed */
  isLooking: (f: FailedItem) => boolean
}

/** The place the player is looking at, reported by the views (the World section on a chat, the Library on a chat). */
const looking: { world: string | null; litopys: string | null } = { world: null, litopys: null }
export function setLooking(place: 'world' | 'litopys', chatId: string | null) {
  looking[place] = chatId
}
export const lookingAt = (place: 'world' | 'litopys') => looking[place]

/** True the first time a failure key is claimed: the other toast path (an open chat's soul notice) uses it too. */
export function claimFailure(key: string): boolean {
  const seen = readSeen()
  if (seen.has(key)) return false
  seen.add(key)
  writeSeen(seen)
  return true
}

let lastDeps: AttentionDeps | null = null
/** worker + code -> when it was last toasted: the same one again within 10 minutes stays in the inbox only */
const lastToasted = new Map<string, number>()
const REPEAT_MS = 10 * 60_000
const FAIL_TOAST_MS = 15_000

/** Toast the failures that are new: one each, or one for the lot when several arrive together. */
const STALE_MS = 24 * 60 * 60_000

export function announceFailures(deps: AttentionDeps | null = lastDeps) {
  if (!deps?.failedOn) return
  const st = useAttention.getState()
  const all = [...st.failed, ...soulFailures(st.soul)]
  if (!all.length) return
  const seen = readSeen()
  const fresh = takeNewFailures(all, seen, st.dismissed)
  if (!fresh.length) return
  writeSeen(seen)
  const now = Date.now()
  const loud = fresh.filter((f) => {
    if (deps.isLooking(f)) return false
    // an old failure still saved in a state file stays in the inbox, but a toast about it would read as new
    if (f.at && now - f.at > STALE_MS) return false
    const k = `${f.worker}:${f.code || f.message.slice(0, 40)}`
    const prev = lastToasted.get(k)
    if (prev !== undefined && now - prev < REPEAT_MS) return false
    return true
  })
  if (!loud.length) return
  for (const f of loud) lastToasted.set(`${f.worker}:${f.code || f.message.slice(0, 40)}`, now)
  whenIdle(() => {
    const { lang } = deps
    const position = isPhone() ? ('bottom-center' as const) : undefined
    if (loud.length > 1) {
      toast.error(t('attn.failed.many', lang, { n: loud.length }), {
        id: 'attention-failed',
        duration: FAIL_TOAST_MS,
        position,
        action: { label: t('attn.failed.openInbox', lang), onClick: deps.openInbox },
        classNames: { actionButton: BTN },
      })
      return
    }
    const f = loud[0]!
    toast.error(t('attn.failed.title', lang, { worker: workerName(f.worker, lang), chat: deps.nameOf(f) || '…' }), {
      id: `attention-failed-${failKey(f)}`,
      description: failReason(f, lang),
      duration: FAIL_TOAST_MS,
      position,
      action: { label: t('attn.open', lang), onClick: () => deps.openFailure(f) },
      classNames: { actionButton: BTN },
    })
  })
}

/** The dashboard sensor of the open chat reports its last error (null when it has none). */
export function setDashFailure(chatId: string, title: string, err: { at: number; message: string } | null, deps?: AttentionDeps) {
  setFailed('dashboard', err ? [{ worker: 'dashboard', ref: chatId, title, code: '', message: err.message, at: err.at }] : [])
  if (err) announceFailures(deps ?? lastDeps)
}

/** The inbox drawer: one open flag for the rail (desktop) and the More sheet (phone), and the chip picked. */
export type InboxFilter = 'all' | 'failed' | 'litopys' | 'soul' | 'new'
export const useInbox = create<{ open: boolean; filter: InboxFilter; setOpen: (open: boolean) => void; setFilter: (f: InboxFilter) => void }>((set) => ({
  open: false,
  filter: 'all',
  setOpen: (open) => set({ open }),
  setFilter: (filter) => set({ filter }),
}))

function showToast(items: WaitingProposal[], deps: AttentionDeps) {
  const { lang, openLibrary } = deps
  const plan = toastPlan(items, lang)
  const open = { label: t('attn.open', lang), onClick: () => openLibrary(plan.chatId) }
  const base = {
    id: 'attention-litopys',
    description: plan.description,
    duration: 20_000,
    position: isPhone() ? ('bottom-center' as const) : undefined,
    classNames: { actionButton: BTN, cancelButton: BTN },
  }
  if (!plan.inline) {
    toast.info(plan.title, { ...base, action: open })
    return
  }
  const p = items[0]!
  const settle = async (accept: boolean) => {
    try {
      if (accept) await acceptLitProposal(p.chatId, p.id)
      else await rejectLitProposal(p.chatId, p.id)
      toast.success(t(accept ? 'attn.accepted' : 'attn.rejected', lang), { duration: 3000 })
      void pollAttention(deps)
    } catch (e) {
      // the pin limit and anything else the Library explains better: open it there
      const msg = isPinLimit(e) ? t('attn.pinLimit', lang) : e instanceof Error ? e.message : String(e)
      toast.error(msg, { action: open, duration: 10_000 })
    }
  }
  toast.info(plan.title, {
    ...base,
    action: { label: t('attn.accept', lang), onClick: () => void settle(true) },
    cancel: { label: t('attn.reject', lang), onClick: () => void settle(false) },
  })
}

let polling = false
/** the counts the last round read proposals for: a chat is read again only when its count moves */
let fetched: Record<string, number> = {}

/** The Library half of a round: the failed workers, the counts, and the toast for new proposals. */
async function litopysRound(deps: AttentionDeps) {
  if (!deps.on && !deps.failedOn) {
    useAttention.setState({ litopys: {}, litNames: {} })
    setFailed('litopys', [])
    toast.dismiss('attention-litopys')
    return
  }
  const { items } = await fetchLitChats()
  setFailed('litopys', deps.failedOn ? litopysFailures(items) : [])
  if (!deps.on) {
    useAttention.setState({ litopys: {}, litNames: {} })
    toast.dismiss('attention-litopys')
    return
  }
  const counts = litCounts(items)
  useAttention.setState({ litopys: counts, litNames: namesOf(items) })
  const seen = readSeen()
  const fresh: WaitingProposal[] = []
  for (const chatId of Object.keys(counts)) {
    if (fetched[chatId] === counts[chatId]) continue
    const chat = await fetchLitChat(chatId)
    fresh.push(...takeNew(waitingOf(chat), seen))
  }
  fetched = counts
  if (!fresh.length) return
  writeSeen(seen)
  whenIdle(() => showToast(fresh, deps))
}

/** The World DM half: chats whose last run failed. Silent when the plugin is missing. */
async function worldRound(deps: AttentionDeps) {
  if (!deps.failedOn) {
    setFailed('world', [])
    return
  }
  const rows = await listWorldChats()
  setFailed('world', rows ? worldFailures(rows) : [])
}

/** One round: refresh the counts and failures, toast what is new. Each source is silent when its plugin is missing. */
export async function pollAttention(deps: AttentionDeps) {
  if (polling) return
  polling = true
  lastDeps = deps
  try {
    await Promise.all([
      litopysRound(deps).catch(() => { /* no Litopys plugin, or the engine is away: the badge keeps its last counts */ }),
      worldRound(deps).catch(() => { /* no World plugin: nothing to say */ }),
    ])
  } finally {
    polling = false
  }
  announceFailures(deps)
}
