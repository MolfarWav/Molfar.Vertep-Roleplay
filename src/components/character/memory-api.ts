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
export interface MemSummary {
  /** The record has a chapter to write it from. */
  can: boolean
  state: 'idle' | 'working' | 'done' | 'failed'
  text: string
  tokens: number
  /** The record changed after the text was written. */
  stale: boolean
  error: string
  at: number
}
export interface MemPreview {
  chat: { id: string; title: string }
  /** The id of the source when this chat was imported already. */
  already: string | null
  arc: { text: string; tokens: number } | null
  /** The model-written summary of this chat (#113); null = the chat has no record. */
  summary: MemSummary | null
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

export const summarizeChat = (chatId: string, op: 'start' | 'cancel') =>
  j<{ summary: MemSummary }>('/litopys/story-summary', { method: 'POST', body: JSON.stringify({ chatId, op }) })

export const importCardMemory = (body: { cardId: string; chatId: string; arc: boolean; arcText?: string; facts: string[]; notes: string[]; said: string[]; habits: string[] }) =>
  j<CardMemoryView>('/litopys/card-memory/import', { method: 'POST', body: JSON.stringify(body) })

export const MEM_MIN_TOKENS = 100
export const MEM_MAX_TOKENS = 1500
export const HABITS_MIN_TOKENS = 50
export const HABITS_MAX_TOKENS = 800

// ---- any owner of a long memory: a card, a persona or a saved World DM world (#99)

export type MemoryKind = 'card' | 'persona' | 'world'
/** Whose memory it is. The card keeps its own routes (`/litopys/card-memory*`); the others use `/litopys/memory*`. */
export interface MemoryOwner { kind: MemoryKind; id: string; name: string }

/** The answer for any owner. A persona's or world's view has no habits, so those fields are optional. */
export interface MemoryView extends Omit<CardMemoryView, 'cardId' | 'habitsTokens' | 'habitsBudget'> {
  kind?: MemoryKind
  cardId?: string
  ownerId?: string
  name?: string
  habitsTokens?: number
  habitsBudget?: number
}

/** The patch a persona's or world's memory takes: stories with arc and facts lines, and the room. */
export type MemoryPatch = { source?: { id: string; on?: boolean; line?: MemLinePatch }; inject?: { enabled?: boolean; maxTokens?: number } }

const sharedBody = (o: MemoryOwner, rest: object) => JSON.stringify({ kind: o.kind, id: o.id, ...rest })

export const fetchMemory = (o: MemoryOwner): Promise<MemoryView> =>
  o.kind === 'card' ? fetchCardMemory(o.id) : j<MemoryView>(`/litopys/memory?kind=${q(o.kind)}&id=${q(o.id)}`)

export const putMemory = (o: MemoryOwner, patch: MemoryPatch | Parameters<typeof putCardMemory>[1]): Promise<MemoryView> =>
  o.kind === 'card' ? putCardMemory(o.id, patch as Parameters<typeof putCardMemory>[1]) : j<MemoryView>('/litopys/memory', { method: 'PUT', body: sharedBody(o, patch) })

export const deleteMemorySource = (o: MemoryOwner, sourceId: string): Promise<MemoryView> =>
  o.kind === 'card' ? deleteCardMemorySource(o.id, sourceId) : j<MemoryView>(`/litopys/memory?kind=${q(o.kind)}&id=${q(o.id)}&sourceId=${q(sourceId)}`, { method: 'DELETE' })

export const previewMemory = (o: MemoryOwner, chatId: string): Promise<MemPreview> =>
  o.kind === 'card' ? previewCardMemory(o.id, chatId) : j<MemPreview>('/litopys/memory/preview', { method: 'POST', body: sharedBody(o, { chatId }) })

/** Notes, said lines and habits only exist on a card; for the others they are sent empty. */
export const importMemory = (o: MemoryOwner, body: { chatId: string; arc: boolean; arcText?: string; facts: string[]; notes: string[]; said: string[]; habits: string[] }): Promise<MemoryView> =>
  o.kind === 'card'
    ? importCardMemory({ cardId: o.id, ...body })
    : j<MemoryView>('/litopys/memory/import', { method: 'POST', body: sharedBody(o, { ...body, notes: [], said: [], habits: [] }) })

// ---- how a character changed (#396): the living portrait, characters/<id>/growth.json, served by the agents plugin (/agents/growth)

export type GrowthSection = 'background' | 'relationships' | 'personality' | 'behaviors' | 'goals' | 'trauma' | 'sexuality' | 'other'
export type GrowthKind = 'changed' | 'added'

/** One block of the portrait, written like the card's own text. An agent proposes; nothing is used until the user accepts. */
export interface GrowthEntry {
  id: string
  section: GrowthSection
  /** changed = updates what the card says; added = something new. */
  kind: GrowthKind
  title?: string
  text: string
  /** A few words: what in the card this replaces. */
  basis?: string
  /** A card that voices several characters keeps a portrait of each: the one this block is about. None = the card as a whole (#450). */
  of?: string
  /** Older texts of this block, newest first (up to 3). */
  prev?: string[]
  /** A proposal that revises this accepted block: accepting it merges into that block. */
  revises?: string
  on: boolean
  state: 'proposed' | 'accepted'
  origin: 'agent' | 'user'
  agent?: string
  from?: { chatId: string; title: string; at: number }
  /** Where the block acts (#450): 'story' = the chat it came from, the chats that continue it and the ones in `chats`; none = every chat of the card. */
  scope?: 'story'
  /** A story block: chats the user added to it. */
  chats?: string[]
  /** Chats where the block is switched off, whatever its scope. */
  skip?: string[]
  /** A story block: the chats that continue the chat it came from (the server reads the chat links). */
  continues?: string[]
  at: number
}

/** Why a block acts in a chat, or not (#450). */
export type GrowthReach = 'card' | 'source' | 'continues' | 'chosen' | 'skipped' | 'none'

export interface GrowthView {
  growth: { v: 2; next: number; entries: GrowthEntry[]; inject: { enabled: boolean; maxTokens: number; remind?: boolean } }
  /** The section names in the order the portrait shows them. */
  sections: GrowthSection[]
  /** The characters this card voices (its souls), when it voices several; absent for a card that is one character (#450). */
  cast?: string[]
  /** What the portrait costs in a prompt now: tokens used of the room, blocks sent / left out for lack of room / live (accepted and on). */
  tokens: { used: number; room: number; sent: number; omitted: number; live: number }
  /** The part exactly as the prompt gets it ('' when nothing would be sent). With a chat asked for: as that chat gets it. */
  text?: string
  /** Only when a chat was asked for: why each block acts there or not, by block id (#450). */
  reach?: Record<string, GrowthReach>
}

/** The fields of a block the user writes or edits. */
export interface GrowthFields { section: GrowthSection; kind: GrowthKind; title?: string; text: string; basis?: string; of?: string }

export type GrowthPatch =
  | ({ op: 'add' } & GrowthFields)
  | { op: 'accept'; id: string }
  | ({ op: 'edit'; id: string } & Partial<GrowthFields>)
  | { op: 'on'; id: string; on: boolean }
  | { op: 'delete'; id: string }
  | { op: 'revert'; id: string }
  | { op: 'scope'; id: string; scope: 'card' | 'story' }
  | { op: 'chat'; id: string; chatId: string; apply: boolean }
  | { op: 'inject'; enabled?: boolean; maxTokens?: number; remind?: boolean }

export const GROWTH_TEXT_MAX = 1200
export const GROWTH_TITLE_MAX = 80
export const GROWTH_BASIS_MAX = 120
export const GROWTH_MIN_TOKENS = 100
export const GROWTH_MAX_TOKENS = 8000

/** The portrait of a card; with a chat, the numbers and `text` are what THAT chat is sent and `reach` says why (#450). */
export const loadGrowth = (cardId: string, chatId?: string) => j<GrowthView>(`/agents/growth?cardId=${q(cardId)}${chatId ? `&chatId=${q(chatId)}` : ''}`)

export const putGrowth = (cardId: string, patch: GrowthPatch, forChat?: string) =>
  j<GrowthView>('/agents/growth', { method: 'PUT', body: JSON.stringify({ cardId, ...(forChat ? { forChat } : {}), ...patch }) })

/** Why a block acts in a chat, from the block alone (the server's `continues` list stands for the chat links). Mirrors the plugin's `growthReach`. */
export function growthReach(e: Pick<GrowthEntry, 'scope' | 'from' | 'chats' | 'skip' | 'continues'>, chatId: string): GrowthReach {
  if (e.skip?.includes(chatId)) return 'skipped'
  if (e.scope !== 'story' || !e.from?.chatId) return 'card'
  if (e.from.chatId === chatId) return 'source'
  if (e.continues?.includes(chatId)) return 'continues'
  if (e.chats?.includes(chatId)) return 'chosen'
  return 'none'
}
export const growthActs = (r: GrowthReach) => r !== 'skipped' && r !== 'none'

/** The hand button: one bigger look at a chat of this card; up to 4 blocks come back as proposals. `added` is how many were stored. */
export const updateGrowthFromStory = (cardId: string, chatId: string) =>
  j<GrowthView & { added: number; refused: string[] }>('/agents/growth/update', { method: 'POST', body: JSON.stringify({ cardId, chatId }) })
