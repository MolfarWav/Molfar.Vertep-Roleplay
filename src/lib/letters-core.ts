// Letters from cards (#72): the pure part, no network and no DOM, so tests import it directly.
// The plugin (plugins/letters) owns the data, the limits and the model call; this file decides who is due.
import type { Character, Chat } from '@/lib/types'
import { cardTypeOf } from '@/lib/soul'

export type LetterWhy = 'idle' | 'unplayed' | 'nosoul'

/** One unread letter, as GET /letters lists it. */
export interface Letter {
  id: string
  characterId: string
  chatId?: string
  why: LetterWhy
  text: string
  at: number
  model?: string
}

export interface LettersConfig {
  enabled: boolean
  idleDays: number
  perDay: number
  perCardDays: number
  model: string
}

export const DEFAULT_LETTERS_CONFIG: LettersConfig = { enabled: false, idleDays: 14, perDay: 3, perCardDays: 30, model: '' }

/** One card the pass may ask the plugin about; `chatId` is set for an idle chat. */
export interface LetterCandidate {
  characterId: string
  chatId?: string
  why: LetterWhy
}

const DAY_MS = 24 * 60 * 60 * 1000
/** A card that was played last this long ago is no longer "mid-play" for the Soul nudge. */
const SOUL_QUIET_DAYS = 3

const isWriter = (c: Pick<Character, 'isGroup' | 'cardExtras'>) => !c.isGroup && cardTypeOf(c) !== 'assistant'

/** Tolerant read of GET /letters: anything unusable is dropped, newest first. */
export function lettersOf(body: unknown): Letter[] {
  const list = (body as { letters?: unknown } | null)?.letters
  if (!Array.isArray(list)) return []
  const out: Letter[] = []
  for (const l of list) {
    const r = l as Partial<Letter> | null
    if (!r || typeof r.id !== 'string' || typeof r.characterId !== 'string' || typeof r.text !== 'string' || !r.text.trim()) continue
    const why: LetterWhy = r.why === 'unplayed' || r.why === 'nosoul' ? r.why : 'idle'
    out.push({ id: r.id, characterId: r.characterId, ...(typeof r.chatId === 'string' && r.chatId ? { chatId: r.chatId } : {}), why, text: r.text.trim(), at: Number(r.at) || 0, ...(typeof r.model === 'string' ? { model: r.model } : {}) })
  }
  return out.sort((a, b) => b.at - a.at)
}

export interface PassInput {
  characters: Pick<Character, 'id' | 'isGroup' | 'cardExtras' | 'createdAt' | 'lastChatAt'>[]
  chats: Pick<Chat, 'id' | 'characterId' | 'updatedAt'>[]
  now: number
  config: Pick<LettersConfig, 'idleDays'>
  /** cards that must not write (muted, or already writing: an unread letter) */
  skip: ReadonlySet<string>
  /** true when the app already knows the card has a Soul (a card the list holds only as a summary says false: the plugin checks) */
  hasSoul?: (characterId: string) => boolean
}

/**
 * Who is due, most deserving first: chats left idle (the longest idle first), then cards never played (the oldest
 * first), then cards that have been played but have no Soul. At most one entry per card. The plugin checks the
 * limits and the facts the app cannot see (a Soul, the chat's messages) and may refuse an entry.
 */
export function candidatesFor(input: PassInput): LetterCandidate[] {
  const idleMs = input.config.idleDays * DAY_MS
  const byCard = new Map<string, Pick<Chat, 'id' | 'characterId' | 'updatedAt'>>()
  for (const c of input.chats) {
    const cur = byCard.get(c.characterId)
    if (!cur || c.updatedAt > cur.updatedAt) byCard.set(c.characterId, c)
  }
  const idle: { at: number; cand: LetterCandidate }[] = []
  const unplayed: { at: number; cand: LetterCandidate }[] = []
  const nosoul: { at: number; cand: LetterCandidate }[] = []
  for (const ch of input.characters) {
    if (!isWriter(ch) || input.skip.has(ch.id)) continue
    const last = byCard.get(ch.id)
    if (last) {
      const quiet = input.now - last.updatedAt
      if (quiet >= idleMs) idle.push({ at: last.updatedAt, cand: { characterId: ch.id, chatId: last.id, why: 'idle' } })
      else if (quiet >= SOUL_QUIET_DAYS * DAY_MS && !input.hasSoul?.(ch.id)) nosoul.push({ at: last.updatedAt, cand: { characterId: ch.id, why: 'nosoul' } })
    } else if (!(ch.lastChatAt > 0) && ch.createdAt > 0 && input.now - ch.createdAt >= idleMs) {
      unplayed.push({ at: ch.createdAt, cand: { characterId: ch.id, why: 'unplayed' } })
    }
  }
  const oldest = (a: { at: number }, b: { at: number }) => a.at - b.at
  return [...idle.sort(oldest), ...unplayed.sort(oldest), ...nosoul.sort(oldest)].map((x) => x.cand)
}

/** A refusal that ends the pass (every other card would be refused the same way). */
export const STOPS_PASS = new Set(['off', 'daily', 'no-model', 'error'])

/** A refusal about the card itself: it is not asked again for a day (the plugin said no for a fact that will not change soon). */
export const CARD_REFUSALS = new Set(['muted', 'cooldown', 'waiting', 'no-card', 'has-soul', 'no-chat', 'bad-reply'])

/** The number of ms between two passes while the app is open, and the delay of the first after start. */
export const PASS_EVERY_MS = 2.5 * 60 * 60 * 1000
export const PASS_FIRST_MS = 20_000
/** Cards asked in one pass at most (each ask may cost a model call). */
export const PASS_MAX_ASKS = 6
