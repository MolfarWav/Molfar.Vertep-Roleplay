/** What a chat carries into the prompt besides the history (#107): the helper behind the chip strip under the
 *  chat header and the "What this chat carries" panel. Pure: it turns the two answers (Litopys' /carries and
 *  the Dashboard's view) plus the chat's switches into the list of parts, so it is easy to test. */

export interface CarriesAnswer {
  chatId: string
  /** The chat's meta.promptBoard.off keys. */
  off: string[]
  litopys: { tokens: number; facts: number; chapters: number }
  backstory: { from: string; title: string; tokens: number; facts: number; chapters: number; text: string } | null
  /** #113: the chat continues an earlier one but opens with the card's greeting (the first message is that greeting). */
  opening?: { messageId: string; title: string } | null
  cardMemory: { cardId: string; name: string; tokens: number; dupes: number; sources: string[]; text: string } | null
  /** The card's habits (#106): null when the card has none, or when they are off for the chat (so an off chip cannot be told from no habits). */
  cardHabits?: { cardId: string; name: string; tokens: number; dupes: number; habits: string[]; text: string } | null
  /** The memory of the persona the chat is played with (#99): null = the chat has none, or it is gone. `taken` = the chat opted in;
   *  `stories` = how many of its stories are on; `tokens` and `text` are what it says now (0 and "" when not taken). */
  personaMemory?: SharedMemoryAnswer | null
  /** The same for the saved world the chat was started in. */
  worldMemory?: SharedMemoryAnswer | null
  /** The chat's World DM: null when it is off for the chat. */
  world?: { level: WorldLevel; insert: boolean; waiting: boolean; tokens: number; text: string } | null
}

export interface SharedMemoryAnswer { id: string; name: string; taken: boolean; stories: number; tokens: number; dupes: number; sources: string[]; text: string }

export type WorldLevel = 'chronicler' | 'living' | 'director' | 'antagonist' | 'chaos'

/** What the Dashboard says about this chat; null when it has no view (no chip then). */
export interface DashCarries {
  tokens: number
  saidTokens: number
  /** The earlier chat whose end state this Dashboard carries, when it carries one. */
  inherit?: { title?: string; from?: string; on?: boolean } | null
}

/** 'world' is the World DM; the saved world's memory is 'worldmem' and the persona's is 'personamem'. */
export type CarryKind = 'memory' | 'habits' | 'personamem' | 'worldmem' | 'backstory' | 'litopys' | 'dashboard' | 'said' | 'world' | 'note'
/** Every kind, in strip order. */
export const CARRY_KINDS: readonly CarryKind[] = ['memory', 'habits', 'personamem', 'worldmem', 'backstory', 'litopys', 'dashboard', 'said', 'world', 'note']
export type CarrySwitch = 'plugin:cardmemory' | 'plugin:cardhabits' | 'plugin:personamemory' | 'plugin:worldmemory' | 'plugin:litopys' | 'plugin:relations' | 'plugin:said' | 'plugin:world'

export interface CarryPart {
  key: CarryKind
  kind: CarryKind
  label: string
  tokens: number
  off: boolean
  /** The prompt-board key that turns this part off for the chat; null = no switch here. */
  switchKey: CarrySwitch | null
  /** The Author's note chip with nothing written in it. */
  empty?: boolean
  /** A persona's or a world's memory: the chat takes it in only when it opted in. Its switch flips that opt-in
   *  (and clears the Prompt board mute), it is not the board's off list. `taken` = the chat opted in. */
  optIn?: { owner: 'persona' | 'world'; taken: boolean }
}

export interface CarriesLabels {
  memory: (name: string) => string
  habits: (name: string) => string
  personaMemory: (name: string) => string
  worldMemory: (name: string) => string
  backstory: (title: string) => string
  litopys: string
  dashboard: string
  said: string
  world: (level: WorldLevel) => string
  note: string
}

export interface CarriesInput {
  carries: CarriesAnswer | null
  dash: DashCarries | null
  noteText: string
  /** The app's token estimate. */
  estimate: (text: string) => number
  labels: CarriesLabels
}

export interface CarriesResult {
  /** The chips, in order; empty when the strip should not show. */
  parts: CarryPart[]
  /** Tokens of the parts that are on. */
  total: number
  visible: boolean
}

/** Parts in order: card memory, card habits, persona memory, world memory, backstory, Litopys' own record, Dashboard, Said, Author's note. A part that does
 *  not exist is left out, but one the user switched off stays so it can be switched back on. */
export function buildCarries({ carries, dash, noteText, estimate, labels }: CarriesInput): CarriesResult {
  const offKeys = carries?.off ?? []
  const isOff = (k: CarrySwitch) => offKeys.includes(k)
  const parts: CarryPart[] = []

  const cm = carries?.cardMemory
  if (cm) parts.push({ key: 'memory', kind: 'memory', label: labels.memory(cm.name), tokens: cm.tokens, off: isOff('plugin:cardmemory'), switchKey: 'plugin:cardmemory' })

  const sk = carries?.cardHabits
  if (sk) parts.push({ key: 'habits', kind: 'habits', label: labels.habits(sk.name), tokens: sk.tokens, off: isOff('plugin:cardhabits'), switchKey: 'plugin:cardhabits' })

  // a persona's or a world's memory: shown when it has a story on; off until the chat took it in, and off while muted on the board
  const shared = (m: SharedMemoryAnswer | null | undefined, kind: 'personamem' | 'worldmem', owner: 'persona' | 'world', switchKey: CarrySwitch, label: string) => {
    if (!m || m.stories <= 0) return
    parts.push({ key: kind, kind, label, tokens: m.taken ? m.tokens : 0, off: !m.taken || isOff(switchKey), switchKey, optIn: { owner, taken: m.taken } })
  }
  shared(carries?.personaMemory, 'personamem', 'persona', 'plugin:personamemory', carries?.personaMemory ? labels.personaMemory(carries.personaMemory.name) : '')
  shared(carries?.worldMemory, 'worldmem', 'world', 'plugin:worldmemory', carries?.worldMemory ? labels.worldMemory(carries.worldMemory.name) : '')

  const bs = carries?.backstory
  if (bs) parts.push({ key: 'backstory', kind: 'backstory', label: labels.backstory(bs.title), tokens: bs.tokens, off: isOff('plugin:litopys'), switchKey: 'plugin:litopys' })

  const lit = carries?.litopys
  if (lit && (lit.tokens > 0 || (isOff('plugin:litopys') && !bs))) {
    parts.push({ key: 'litopys', kind: 'litopys', label: labels.litopys, tokens: lit.tokens, off: isOff('plugin:litopys'), switchKey: 'plugin:litopys' })
  }

  if (dash) parts.push({ key: 'dashboard', kind: 'dashboard', label: labels.dashboard, tokens: dash.tokens, off: isOff('plugin:relations'), switchKey: 'plugin:relations' })

  if (dash && (dash.saidTokens > 0 || isOff('plugin:said'))) {
    parts.push({ key: 'said', kind: 'said', label: labels.said, tokens: dash.saidTokens, off: isOff('plugin:said'), switchKey: 'plugin:said' })
  }

  const w = carries?.world
  if (w) parts.push({ key: 'world', kind: 'world', label: labels.world(w.level), tokens: w.tokens, off: isOff('plugin:world'), switchKey: 'plugin:world' })

  const note = noteText.trim()
  const noteTokens = note ? estimate(noteText) : 0
  const notePart: CarryPart = { key: 'note', kind: 'note', label: labels.note, tokens: noteTokens, off: false, switchKey: null, ...(note ? {} : { empty: true }) }

  // a plain chat shows nothing: the strip needs at least one part besides an empty note
  if (parts.length === 0 && notePart.empty) return { parts: [], total: 0, visible: false }
  parts.push(notePart)
  return { parts, total: parts.reduce((sum, p) => sum + (p.off ? 0 : p.tokens), 0), visible: true }
}

/** The chat's `promptBoard.off` list with one key flipped. */
export function flipOff(off: readonly string[], key: string): string[] {
  return off.includes(key) ? off.filter((k) => k !== key) : [...off, key]
}

/** The chats whose story this chat already carries by itself: the chat and its backstory chain (the server stops after three links). */
export function ownStoryChats(chatId: string, links: Record<string, { from: string } | undefined>): Set<string> {
  const out = new Set([chatId])
  for (let cur = links[chatId]?.from; cur && !out.has(cur) && out.size <= 3; cur = links[cur]?.from) out.add(cur)
  return out
}

export interface StoryRow { id: string; chatId: string; title: string; on: boolean; canon: 'main' | 'separate' }
export interface StoryChoice extends StoryRow {
  /** the chat already has this story itself (its own record or its backstory): no switch */
  own: boolean
  /** switched off on the card: this chat cannot let it in */
  cardOff: boolean
  /** what this chat does with it now */
  checked: boolean
}

/** One line per story with what this chat does with it: an override wins, else the default of the story (on, and canon main). */
export function storyChoices(sources: StoryRow[], chatId: string, links: Record<string, { from: string } | undefined>, overrides: Record<string, boolean> | null): StoryChoice[] {
  const mine = ownStoryChats(chatId, links)
  return sources.map((s) => ({
    ...s,
    own: !!s.chatId && mine.has(s.chatId),
    cardOff: !s.on,
    checked: s.on && (overrides?.[s.id] ?? s.canon !== 'separate'),
  }))
}

/** The overrides after the user sets one story; a value equal to the default of the story is not stored. null = nothing left. */
export function withStoryChoice(overrides: Record<string, boolean> | null, story: Pick<StoryRow, 'id' | 'canon'>, value: boolean): Record<string, boolean> | null {
  const next = { ...(overrides ?? {}) }
  if (value === (story.canon !== 'separate')) delete next[story.id]
  else next[story.id] = value
  return Object.keys(next).length ? next : null
}
