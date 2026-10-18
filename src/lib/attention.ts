// What waits on the player (#55): one source for the rail badge, the chat list badge and the
// "needs you" toast. Today it carries Litopys proposals (facts the Library suggests to pin,
// merge, rewrite or retire); soul proposals keep their own check in store.ts and share only
// the per-kind switch (settings.attention).
//
// The counts come from GET /litopys/chats (pending proposals per chat), polled while the page
// is visible. A proposal is toasted once: its `chatId:id` goes into a seen list in localStorage
// (memory when storage is unavailable). Everything waiting at the first poll after a load is
// toasted too, batched into one toast, so a pile the player never saw still gets said once.

import { create } from 'zustand'
import { toast } from 'sonner'
import { acceptLitProposal, rejectLitProposal, fetchLitChat, fetchLitChats, isPinLimit, type LitChatItem } from '@/components/library/litopys-api'
import { t, type Lang } from '@/lib/i18n'
import { litCounts, takeNew, toastPlan, waitingOf, type SoulWaiting, type WaitingProposal } from './attention-core'

export * from './attention-core'

interface AttentionState {
  /** pending Litopys proposals per chat id (only chats with some) */
  litopys: Record<string, number>
  /** the Library's name for each of those chats (a fallback when the app has not loaded the chat) */
  litNames: Record<string, string>
  /** cards with souls proposed or a failed rating, newest first */
  soul: SoulWaiting[]
}

export const useAttention = create<AttentionState>(() => ({ litopys: {}, litNames: {}, soul: [] }))

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
  openLibrary: (chatId: string) => void
}

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
    toast(plan.title, { ...base, action: open })
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
  toast(plan.title, {
    ...base,
    action: { label: t('attn.accept', lang), onClick: () => void settle(true) },
    cancel: { label: t('attn.reject', lang), onClick: () => void settle(false) },
  })
}

let polling = false
/** the counts the last round read proposals for: a chat is read again only when its count moves */
let fetched: Record<string, number> = {}
/** One round: refresh the counts, toast what is new. Silent when the Litopys plugin is missing. */
export async function pollAttention(deps: AttentionDeps) {
  if (polling) return
  polling = true
  try {
    if (!deps.on) {
      useAttention.setState({ litopys: {}, litNames: {} })
      toast.dismiss('attention-litopys')
      return
    }
    const { items } = await fetchLitChats()
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
  } catch {
    // no Litopys plugin, or the engine is away: the badge keeps its last counts
  } finally {
    polling = false
  }
}
