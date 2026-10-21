// The pure part of "needs you" (#55): no network, no DOM, so tests import it directly.
import type { LitChat, LitChatItem, LitProposal } from '@/components/library/litopys-api'
import { t, type Lang, type MsgKey } from '@/lib/i18n'

export type AttentionKind = 'litopys' | 'soul' | 'failed'

/** settings.attention: a kind is on unless set to false. */
export type AttentionSettings = Partial<Record<AttentionKind, boolean>>

export const attentionOn = (s: AttentionSettings | undefined, kind: AttentionKind) => s?.[kind] !== false

/** One waiting Litopys proposal, as the toast says it. */
export interface WaitingProposal {
  chatId: string
  /** the character's or group's name, '' when unknown */
  name: string
  id: string
  op: LitProposal['op']
  /** the line the player decides on: the fact for pin/retire, the new text for merge/rewrite */
  text: string
}

/** Counts per chat from the Library's chat list; chats with none are left out. */
export function litCounts(items: Pick<LitChatItem, 'id' | 'proposals'>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) if (it.proposals > 0) out[it.id] = it.proposals
  return out
}

export const totalOf = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0)

/** The pending proposals of a chat as one-line items, newest first. */
export function waitingOf(chat: Pick<LitChat, 'chatId' | 'name' | 'facts' | 'proposals'>): WaitingProposal[] {
  const factText = (id: string | undefined) => chat.facts.find((f) => f.id === id)?.text ?? ''
  return chat.proposals
    .filter((p) => p.status === 'pending')
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .map((p) => ({
      chatId: chat.chatId,
      name: chat.name,
      id: p.id,
      op: p.op,
      text: (p.op === 'merge' || p.op === 'rewrite' ? p.text : factText(p.targets[0])) ?? '',
    }))
}

export const seenKey = (p: Pick<WaitingProposal, 'chatId' | 'id'>) => `${p.chatId}:${p.id}`

/** The items not toasted yet; marks them seen. Pure apart from the seen set it is given. */
export function takeNew(items: WaitingProposal[], seen: Set<string>): WaitingProposal[] {
  const fresh = items.filter((p) => !seen.has(seenKey(p)))
  for (const p of fresh) seen.add(seenKey(p))
  return fresh
}

const OP_KEYS = { pin: 'attn.lit.pin', merge: 'attn.lit.merge', rewrite: 'attn.lit.rewrite', retire: 'attn.lit.retire' } as const

/** What the toast says: one proposal gets its line and, when short, Accept / Reject in place. */
export function toastPlan(items: WaitingProposal[], lang: Lang) {
  const chats = [...new Set(items.map((p) => p.chatId))]
  if (items.length === 1) {
    const p = items[0]!
    const line = p.text.replace(/\s+/g, ' ').trim()
    return {
      title: t(OP_KEYS[p.op] ?? 'attn.lit.pin', lang, { name: p.name || '…' }),
      description: line.length > 160 ? `${line.slice(0, 159)}…` : line,
      inline: line !== '' && line.length <= 160,
      chatId: p.chatId,
    }
  }
  const names = [...new Set(items.map((p) => p.name).filter(Boolean))]
  return {
    title: t('attn.lit.many', lang, { n: items.length }),
    description: names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''),
    inline: false,
    chatId: chats[0]!,
  }
}


// ---------- the inbox: everything that waits on the player, in one list ----------

/** One card with souls proposed (or a failed rating), as GET /dashboard/soul-drafts lists it. */
export interface SoulWaiting {
  characterId: string
  at: number
  n: number
  failed: boolean
}

/** Tolerant read of the soul-drafts body: anything unusable is dropped, newest first. */
export function soulWaitingOf(body: unknown): SoulWaiting[] {
  const list = (body as { drafts?: unknown } | null)?.drafts
  if (!Array.isArray(list)) return []
  const out: SoulWaiting[] = []
  for (const d of list) {
    const r = d as Partial<SoulWaiting> | null
    if (!r || typeof r.characterId !== 'string' || !r.characterId) continue
    const failed = r.failed === true
    const n = Number(r.n) || 0
    if (!failed && n <= 0) continue
    out.push({ characterId: r.characterId, at: Number(r.at) || 0, n, failed })
  }
  return out.sort((a, b) => b.at - a.at)
}

// ---------- background failures ----------

/** Which background job failed. */
export type FailWorker = 'world' | 'litopys' | 'dashboard' | 'soul'

/** One failed background job, for one chat (a card for the soul rating). */
export interface FailedItem {
  worker: FailWorker
  /** the chat id; the card id for 'soul' */
  ref: string
  /** what the source calls the place (the chat's title, the card's name); '' when unknown */
  title: string
  /** world: the plugin's error code; other workers: '' */
  code: string
  /** the source's own words, shown when there is no plain message for the code */
  message: string
  /** when it failed (epoch ms); a new failure of the same job has a new `at` */
  at: number
}

export const failKey = (f: Pick<FailedItem, 'worker' | 'ref' | 'at'>) => `${f.worker}:${f.ref}:${f.at}`

const KNOWN_CAUSES: [RegExp, string][] = [
  [/thinking|reasoning/i, 'thinking'],
  [/\b429\b|rate.?limit|too many requests/i, 'rate'],
  [/\b401\b|\b403\b|unauthori[sz]ed|invalid.*key|api key/i, 'auth'],
  [/model.*(not found|does not exist|unknown)|no such model|no endpoints/i, 'model'],
]
const WORLD_CODES = ['thinking', 'thinking-block', 'reasoning-off', 'rate', 'context', 'auth', 'model', 'not-json', 'empty']

/** The plain one-line reason: the World DM's code in words, the others' own message trimmed. */
export function failReason(f: FailedItem, lang: Lang): string {
  if (f.worker === 'world') {
    if (f.code === 'thinking-block') return t('world.err.thinking', lang)
    if (WORLD_CODES.includes(f.code)) return t(`world.err.${f.code}` as MsgKey, lang)
    return t('world.err.other', lang, { message: f.message || f.code })
  }
  if (f.worker === 'soul') return t('inbox.soulFailed', lang)
  const raw = f.message.replace(/\s+/g, ' ').trim()
  // other workers report in English; the common causes get the app's own wording
  const known = KNOWN_CAUSES.find(([re]) => re.test(raw))
  if (known) return t(`world.err.${known[1]}` as MsgKey, lang)
  return raw.length > 140 ? `${raw.slice(0, 139)}…` : raw || t('inbox.failedUnknown', lang)
}

const WORKER_KEYS = { world: 'inbox.worker.world', litopys: 'inbox.worker.litopys', dashboard: 'inbox.worker.dashboard', soul: 'inbox.worker.soul' } as const
export const workerName = (w: FailWorker, lang: Lang) => t(WORKER_KEYS[w], lang)

/** The World DM rows of GET /world/chats that carry an error. */
export function worldFailures(rows: { chatId: string; title: string; error: string | null; errorAt?: number | null }[]): FailedItem[] {
  return rows
    .filter((r) => !!r.error)
    .map((r) => ({ worker: 'world' as const, ref: r.chatId, title: r.title, code: r.error!, message: '', at: Number(r.errorAt) || 0 }))
}

/** The Litopys chats whose worker's last try failed. */
export function litopysFailures(items: Pick<LitChatItem, 'id' | 'title' | 'name' | 'worker'>[]): FailedItem[] {
  const out: FailedItem[] = []
  for (const it of items) {
    const w = it.worker
    if (!w || w.ok !== false || !w.error) continue
    out.push({ worker: 'litopys', ref: it.id, title: it.title || it.name, code: '', message: w.error, at: Number(w.lastRunAt) || 0 })
  }
  return out
}

/** A failed soul rating, as a failure item. */
export const soulFailures = (list: SoulWaiting[]): FailedItem[] =>
  list.filter((d) => d.failed).map((d) => ({ worker: 'soul' as const, ref: d.characterId, title: '', code: '', message: '', at: d.at }))

/** The failures to toast: not yet seen, not dismissed. Marks them seen. */
export function takeNewFailures(items: FailedItem[], seen: Set<string>, dismissed: Set<string>): FailedItem[] {
  const fresh = items.filter((f) => !seen.has(failKey(f)) && !dismissed.has(failKey(f)))
  for (const f of fresh) seen.add(failKey(f))
  return fresh
}

export type InboxRow =
  | { kind: 'failed'; key: string; item: FailedItem; name: string; reason: string }
  | { kind: 'litopys'; key: string; chatId: string; name: string; count: number }
  | { kind: 'soul'; key: string; characterId: string; name: string; count: number; at: number }

/** A Library row hidden from the inbox: gone until that chat's pending count changes. */
export const litDismissKey = (chatId: string, count: number) => `lit:${chatId}:${count}`

/** The local key a row is dismissed by, or null for a Soul review (its proposal is dismissed in the engine). */
export function rowDismissKey(row: InboxRow): string | null {
  return row.kind === 'failed' ? failKey(row.item) : row.kind === 'litopys' ? litDismissKey(row.chatId, row.count) : null
}

export interface InboxInput {
  settings: AttentionSettings | undefined
  /** pending Library proposals per chat id */
  litopys: Record<string, number>
  soul: SoulWaiting[]
  /** background failures from every source, soul ones included only through `soul` */
  failed?: FailedItem[]
  /** failure keys the player dismissed */
  dismissed?: Set<string>
  lang?: Lang
  /** the name a chat shows under (its character or group), '' when unknown */
  chatName: (chatId: string) => string
  cardName: (characterId: string) => string
}

/**
 * The rows of the inbox and the number on its badge. A kind switched off (settings.attention)
 * is neither listed nor counted. Failures come first (newest first), then Library rows (the chat
 * with the most waiting at the top), then soul rows (newest first). The total counts every Library
 * proposal, every failure and every card with souls waiting (a card is one item, however many
 * souls it proposes). `failures` tells the badge to turn red.
 */
export function inboxRows(input: InboxInput): { rows: InboxRow[]; total: number; failures: number } {
  const rows: InboxRow[] = []
  const lang = input.lang ?? 'en'
  if (attentionOn(input.settings, 'failed')) {
    const all = [...(input.failed ?? []), ...soulFailures(input.soul)]
      .filter((f) => !input.dismissed?.has(failKey(f)))
      .sort((a, b) => b.at - a.at)
    for (const f of all) {
      const name = f.worker === 'soul' ? input.cardName(f.ref) : input.chatName(f.ref) || f.title
      rows.push({ kind: 'failed', key: `failed:${failKey(f)}`, item: f, name, reason: failReason(f, lang) })
    }
  }
  if (attentionOn(input.settings, 'litopys')) {
    const chats = Object.entries(input.litopys).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    for (const [chatId, count] of chats) if (!input.dismissed?.has(litDismissKey(chatId, count))) rows.push({ kind: 'litopys', key: `lit:${chatId}`, chatId, name: input.chatName(chatId), count })
  }
  if (attentionOn(input.settings, 'soul')) {
    for (const d of input.soul) {
      if (d.failed) continue
      rows.push({ kind: 'soul', key: `soul:${d.characterId}`, characterId: d.characterId, name: input.cardName(d.characterId), count: d.n, at: d.at })
    }
  }
  const failures = rows.filter((r) => r.kind === 'failed').length
  const total = rows.reduce((a, r) => a + (r.kind === 'litopys' ? r.count : 1), 0)
  return { rows, total, failures }
}

/**
 * Moving to another section closes the inbox: the page you asked for is the one to see. The rail button
 * closes the open section just before it opens the inbox (drawer -> none, same view); that is not a move,
 * and treating it as one made the inbox open and shut in the same tick.
 */
export function inboxClosesOn(was: { view: unknown; drawer: unknown }, now: { view: unknown; drawer: unknown }): boolean {
  if (was.view === now.view && was.drawer === now.drawer) return false
  return !(was.view === now.view && now.drawer === null)
}
