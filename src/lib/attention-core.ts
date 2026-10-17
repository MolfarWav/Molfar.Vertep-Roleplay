// The pure part of "needs you" (#55): no network, no DOM, so tests import it directly.
import type { LitChat, LitChatItem, LitProposal } from '@/components/library/litopys-api'
import { t, type Lang } from '@/lib/i18n'

export type AttentionKind = 'litopys' | 'soul'

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

