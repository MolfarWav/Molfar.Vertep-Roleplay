/** What a chat carries into the prompt besides the history (#107): the helper behind the chip strip under the
 *  chat header and the "What this chat carries" panel. Pure: it turns the two answers (Litopys' /carries and
 *  the Dashboard's view) plus the chat's switches into the list of parts, so it is easy to test. */

export interface CarriesAnswer {
  chatId: string
  /** The chat's meta.promptBoard.off keys. */
  off: string[]
  litopys: { tokens: number; facts: number; chapters: number }
  backstory: { from: string; title: string; tokens: number; facts: number; chapters: number; text: string } | null
  cardMemory: { cardId: string; name: string; tokens: number; dupes: number; sources: string[]; text: string } | null
  /** The chat's World DM: null when it is off for the chat. */
  world?: { level: WorldLevel; insert: boolean; waiting: boolean; tokens: number; text: string } | null
}

export type WorldLevel = 'chronicler' | 'living' | 'director' | 'antagonist' | 'chaos'

/** What the Dashboard says about this chat; null when it has no view (no chip then). */
export interface DashCarries {
  tokens: number
  saidTokens: number
  /** The earlier chat whose end state this Dashboard carries, when it carries one. */
  inherit?: { title?: string; from?: string; on?: boolean } | null
}

export type CarryKind = 'memory' | 'backstory' | 'litopys' | 'dashboard' | 'said' | 'world' | 'note'
/** Every kind, in strip order. */
export const CARRY_KINDS: readonly CarryKind[] = ['memory', 'backstory', 'litopys', 'dashboard', 'said', 'world', 'note']
export type CarrySwitch = 'plugin:cardmemory' | 'plugin:litopys' | 'plugin:relations' | 'plugin:said' | 'plugin:world'

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
}

export interface CarriesLabels {
  memory: (name: string) => string
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

/** Parts in order: card memory, backstory, Litopys' own record, Dashboard, Said, Author's note. A part that does
 *  not exist is left out, but one the user switched off stays so it can be switched back on. */
export function buildCarries({ carries, dash, noteText, estimate, labels }: CarriesInput): CarriesResult {
  const offKeys = carries?.off ?? []
  const isOff = (k: CarrySwitch) => offKeys.includes(k)
  const parts: CarryPart[] = []

  const cm = carries?.cardMemory
  if (cm) parts.push({ key: 'memory', kind: 'memory', label: labels.memory(cm.name), tokens: cm.tokens, off: isOff('plugin:cardmemory'), switchKey: 'plugin:cardmemory' })

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

/** Chip kinds a viewer hid in the strip (a viewer choice, kept in localStorage); never throws. */
export const HIDDEN_KEY = 'rp.carries.hidden'
export function parseHidden(raw: string | null | undefined): CarryKind[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((k): k is CarryKind => (CARRY_KINDS as readonly unknown[]).includes(k)) : []
  } catch {
    return []
  }
}

/** The chat's `promptBoard.off` list with one key flipped. */
export function flipOff(off: readonly string[], key: string): string[] {
  return off.includes(key) ? off.filter((k) => k !== key) : [...off, key]
}
