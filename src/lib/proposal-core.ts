// What the story's agents propose and the player has not answered yet, for the open chat (the pure part: no network,
// no DOM). Three kinds live outside the Library's fact list: a block of a character's portrait ("How they changed"),
// a habit a character showed, and a quest the story wants to open or close. Each gets the colour its block has in the
// interface, so a toast in the chat and the block it points to read as one thing: portrait = sky, habits = violet,
// quests = amber; the Library's facts keep their own toast (attention.ts) and take emerald.
import type { GrowthEntry } from '@/components/character/memory-api'
import type { LitHabit } from '@/components/library/litopys-api'
import type { QuestProposal } from '@/lib/dashboard'
import { t, type Lang } from '@/lib/i18n'

export type ProposalKind = 'growth' | 'habits' | 'quests'

/** The hue of each kind, the same as its block in the card, the Library and the Dashboard; `litopys` is the facts toast. */
export const PROPOSAL_TONE: Record<ProposalKind | 'litopys', 'sky' | 'violet' | 'amber' | 'emerald'> = { growth: 'sky', habits: 'violet', quests: 'amber', litopys: 'emerald' }

/** One thing that waits on an answer. */
export interface ProposalItem {
  kind: ProposalKind
  /** the chat it was found for */
  chatId: string
  /** growth: the card the block belongs to; habits: the card of the character who showed it ('' when unknown) */
  cardId: string
  /** the proposal's own id inside its store */
  id: string
  /** the character's name ('' when unknown) */
  name: string
  /** the line the player decides on */
  text: string
  /** quests only: closing an old one (`close`), or opening one that has no room (`open`) */
  op?: 'open' | 'close'
}

export const proposalKey = (p: Pick<ProposalItem, 'kind' | 'chatId' | 'cardId' | 'id'>) => `${p.kind}:${p.chatId}:${p.cardId}:${p.id}`

/** The blocks of one card's portrait that wait for a yes (a block that only revises an accepted one counts too). */
export function growthItems(chatId: string, cardId: string, name: string, entries: readonly GrowthEntry[] | undefined): ProposalItem[] {
  return (entries ?? [])
    .filter((e) => e.state === 'proposed')
    .sort((a, b) => b.at - a.at)
    .map((e) => ({ kind: 'growth' as const, chatId, cardId, id: e.id, name, text: e.title ? `${e.title}: ${e.text}` : e.text }))
}

/** The habits of a chat that were proposed and not yet earned; `nameOf` turns the habit's `who` into the shown name. */
export function habitItems(chatId: string, habits: readonly LitHabit[] | undefined): ProposalItem[] {
  return (habits ?? [])
    .filter((h) => h.status === 'proposed')
    .map((h) => ({ kind: 'habits' as const, chatId, cardId: '', id: h.id, name: h.who, text: h.name }))
}

/** The quest proposals of a chat's Dashboard. */
export function questItems(chatId: string, proposals: readonly QuestProposal[] | undefined): ProposalItem[] {
  return (proposals ?? []).map((p) => ({ kind: 'quests' as const, chatId, cardId: '', id: p.id, name: '', text: p.text, op: p.type }))
}

/** The items not told about yet; marks them seen in the set it is given. */
export function takeNewItems(items: readonly ProposalItem[], seen: Set<string>): ProposalItem[] {
  const fresh = items.filter((p) => !seen.has(proposalKey(p)))
  for (const p of fresh) seen.add(proposalKey(p))
  return fresh
}

/** Items split by kind, in the order growth, habits, quests; a kind with none is left out. */
export function byKind(items: readonly ProposalItem[]): { kind: ProposalKind; items: ProposalItem[] }[] {
  const order: ProposalKind[] = ['growth', 'habits', 'quests']
  return order.map((kind) => ({ kind, items: items.filter((p) => p.kind === kind) })).filter((g) => g.items.length > 0)
}

const INLINE_MAX = 160

/** What one colour's toast says: one proposal gets its line (and Accept / Reject in place when it is short and needs no choice), several get a count. */
export function proposalPlan(kind: ProposalKind, items: readonly ProposalItem[], lang: Lang) {
  if (items.length === 1) {
    const p = items[0]!
    const line = p.text.replace(/\s+/g, ' ').trim()
    const title =
      kind === 'growth' ? t('attn.growth.one', lang, { name: p.name || '…' })
      : kind === 'habits' ? t('attn.habits.one', lang, { name: p.name || '…' })
      : p.op === 'close' ? t('attn.quests.close', lang)
      : t('attn.quests.open', lang)
    // a new quest that has no room needs the player to say which open quest it replaces: that is answered in the Dashboard
    const needsChoice = kind === 'quests' && p.op !== 'close'
    return {
      title,
      description: line.length > INLINE_MAX ? `${line.slice(0, INLINE_MAX - 1)}…` : line,
      inline: line !== '' && line.length <= INLINE_MAX && !needsChoice,
    }
  }
  const names = [...new Set(items.map((p) => p.name).filter(Boolean))]
  return {
    title: t(kind === 'growth' ? 'attn.growth.many' : kind === 'habits' ? 'attn.habits.many' : 'attn.quests.many', lang, { n: items.length }),
    description: names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''),
    inline: false,
  }
}
