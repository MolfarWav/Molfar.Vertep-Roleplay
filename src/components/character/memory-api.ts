// Types and fetchers for a card's long memory (the Litopys plugin's /litopys/card-memory routes).
import { j } from '@/lib/engine'

export interface MemFact { text: string; subject: string }
export interface MemNote { who: string; how: string; text: string }
export interface MemSaid { who: string; text: string; kind: string }

/** One imported story: a copy of what the user chose to keep from a chat. */
export interface MemSource {
  id: string
  chatId: string
  title: string
  importedAt: number
  on: boolean
  canon: 'main' | 'separate'
  /** The summary of the story ('' when it was not taken). */
  arc: string
  facts: MemFact[]
  notes: MemNote[]
  said: MemSaid[]
}

/** One habit of a card: a short rule for how the character acts. A proposal is not used until the user accepts it. */
export interface MemHabit {
  id: string
  name: string
  /** 1 to 6 lines joined by a newline. */
  rule: string
  /** One optional line: when this applies. */
  when: string
  on: boolean
  origin: 'user' | 'molfar' | 'story'
  state: 'accepted' | 'proposed'
  from?: { chatId: string; title: string; at: number }
}

/** The fields a habit call may carry; no id creates one. */
export interface MemHabitPatch { id?: string; name?: string; rule?: string; when?: string; on?: boolean; state?: 'accepted' }

export interface MemChat {
  id: string
  title: string
  updatedAt: number
  /** The id of the source this chat was imported as, null when it is not in memory. */
  imported: string | null
}

export interface CardMemoryView {
  cardId: string
  memory: {
    v: number
    next: number
    sources: MemSource[]
    inject: { enabled: boolean; maxTokens: number; habitsMaxTokens: number }
    habits: MemHabit[]
  }
  /** The card's chats still on disk, newest first. A source whose chatId is not here lost its chat. */
  chats: MemChat[]
  /** What the memory costs in a prompt now, and the room it is given. */
  tokens: number
  budget: number
  /** What the habits cost in a prompt now, and the room they are given. */
  habitsTokens: number
  habitsBudget: number
  /** Only on the answer to an import: how many ticked habits went to the card and how many did not fit. */
  imported?: { habits: number; habitsLeft: number }
}

export interface MemPreviewLine { id: string; text: string; dup: 'memory' | null; checked: boolean }
export interface MemPreview {
  chat: { id: string; title: string }
  /** The id of the source when this chat was imported already. */
  already: string | null
  arc: { text: string; tokens: number } | null
  facts: (MemPreviewLine & { subject: string; weight: string })[]
  notes: (MemPreviewLine & { who: string; how: string })[]
  said: (MemPreviewLine & { who: string; kind: string })[]
  /** Habits this chat earned for the character (#113); `dup` = the card keeps this rule already. */
  habits: { id: string; who: string; name: string; rule: string; when: string; dup: 'memory' | null; checked: boolean }[]
}

const q = (s: string) => encodeURIComponent(s)

export const fetchCardMemory = (cardId: string) => j<CardMemoryView>(`/litopys/card-memory?cardId=${q(cardId)}`)

/** One line of a story: edit by index (text), remove by index, or add. 'arc' has no index: text replaces, remove clears. */
export interface MemLinePatch { list: 'arc' | 'facts' | 'notes' | 'said'; index?: number; text?: string; remove?: boolean; add?: boolean; who?: string; kind?: string; subject?: string; how?: string }

export const putCardMemory = (cardId: string, patch: { source?: { id: string; on?: boolean; canon?: 'main' | 'separate'; line?: MemLinePatch }; habit?: MemHabitPatch; inject?: { enabled?: boolean; maxTokens?: number; habitsMaxTokens?: number } }) =>
  j<CardMemoryView>('/litopys/card-memory', { method: 'PUT', body: JSON.stringify({ cardId, ...patch }) })

export const deleteCardMemorySource = (cardId: string, sourceId: string) =>
  j<CardMemoryView>(`/litopys/card-memory?cardId=${q(cardId)}&sourceId=${q(sourceId)}`, { method: 'DELETE' })

export const deleteCardMemoryHabit = (cardId: string, habitId: string) =>
  j<CardMemoryView>(`/litopys/card-memory?cardId=${q(cardId)}&habitId=${q(habitId)}`, { method: 'DELETE' })

export const previewCardMemory = (cardId: string, chatId: string) =>
  j<MemPreview>('/litopys/card-memory/preview', { method: 'POST', body: JSON.stringify({ cardId, chatId }) })

export const importCardMemory = (body: { cardId: string; chatId: string; arc: boolean; facts: string[]; notes: string[]; said: string[]; habits: string[] }) =>
  j<CardMemoryView>('/litopys/card-memory/import', { method: 'POST', body: JSON.stringify(body) })

export const MEM_MIN_TOKENS = 100
export const MEM_MAX_TOKENS = 1500
export const HABITS_MIN_TOKENS = 50
export const HABITS_MAX_TOKENS = 800
