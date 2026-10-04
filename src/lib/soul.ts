// Souls for the relationship dashboard (contract: docs/SOUL.md). Pure module:
// no React, no store. A soul lives on the card at
// `extensions.molfar_soul = { v: 1, characters: { <name>: soul } }` and is
// written only by the editor's Soul tab. Unknown keys survive every pass here.

import type { Character } from '@/lib/types'
import { ASK_MOLFAR_MAX } from '@/lib/shell-bridge'

export const SOUL_VERSION = 1

export type SoulClass = 'romantic' | 'ally' | 'neutral' | 'hostile'
export type Pronouns = 'she' | 'he' | 'they'
export type DispositionStat = 'trust' | 'comfort' | 'attraction' | 'respect' | 'affection'
export type PulseStat = 'excitement' | 'arousal'
export type Stat = DispositionStat | PulseStat | 'hostility'
export type TraitId = 'dominance' | 'confidence' | 'shyness' | 'patience' | 'curiosity'
export type SpectrumId =
  | 'introvert_extrovert' | 'cautious_reckless' | 'reserved_emotional'
  | 'lawful_rebellious' | 'suspicious_trusting' | 'pessimist_optimist'
export type RatedBy = 'auto' | 'molfar' | 'user'

export interface SoulRule { cue: string; event: string; stat: string; x: number }

export interface Soul {
  class?: SoulClass
  pronouns?: Pronouns
  aliases?: string[]
  start?: Partial<Record<DispositionStat | 'hostility', number>>
  traits?: Partial<Record<TraitId, number>>
  spectra?: Partial<Record<SpectrumId, number>>
  triggers?: SoulRule[]
  values?: SoulRule[]
  coping?: string
  pulseBase?: { arousal?: number }
  locked?: boolean
  ratedBy?: RatedBy
  [unknown: string]: unknown
}

export type SoulMap = Record<string, Soul>

/** A proposal file (data/dashboard/soul-drafts/<characterId>.json). */
export interface SoulDraft {
  v?: number
  at?: number
  by?: 'auto' | 'molfar'
  model?: string
  note?: string
  error?: string
  dismissedAt?: number
  /** names seen in play that the rating judged minor (no soul) */
  minor?: string[]
  /** the rating's guess of the card's kind */
  cardType?: string
  characters: SoulMap
}

export const DISPOSITION: readonly DispositionStat[] = ['trust', 'comfort', 'attraction', 'respect', 'affection']
export const PULSE: readonly PulseStat[] = ['excitement', 'arousal']
/** The eight stats a trigger or value may name. */
export const STATS: readonly Stat[] = [...DISPOSITION, ...PULSE, 'hostility']
export const TRAITS: readonly TraitId[] = ['dominance', 'confidence', 'shyness', 'patience', 'curiosity']
/** [id, leftKey, rightKey]: 0 = the left word, 100 = the right word. */
export const SPECTRA: readonly (readonly [SpectrumId, string, string])[] = [
  ['introvert_extrovert', 'introvert', 'extrovert'],
  ['cautious_reckless', 'cautious', 'reckless'],
  ['reserved_emotional', 'reserved', 'emotional'],
  ['lawful_rebellious', 'lawful', 'rebellious'],
  ['suspicious_trusting', 'suspicious', 'trusting'],
  ['pessimist_optimist', 'pessimist', 'optimist'],
]
export const CLASSES: readonly SoulClass[] = ['romantic', 'ally', 'neutral', 'hostile']
export const PRONOUNS: readonly Pronouns[] = ['she', 'he', 'they']
export const STAT_COLORS: Record<Stat, string> = {
  trust: '#5f93c9',
  comfort: '#5fae86',
  attraction: '#d4577f',
  respect: '#a07bc9',
  affection: '#e083a3',
  excitement: '#e0a44a',
  arousal: '#c9545a',
  hostility: '#b8483f', // the contract names no colour for it; a darker red than arousal
}

export const MAX_TRIGGERS = 12
export const MAX_ALIASES = 16
export const MAX_COPING = 300
export const START_LIMIT = 20
export const RULE_X: readonly number[] = [1.5, 2]
/** Keys that must never become a soul name (prototype pollution). */
const FORBIDDEN_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function validSoulName(name: string): boolean {
  const n = name.trim()
  return n.length > 0 && n.length <= 60 && !FORBIDDEN_NAMES.has(n)
}

/** The souls saved on a card. Tolerant: anything that is not an object is skipped. */
export function soulsOf(c: Pick<Character, 'cardExtras'>): SoulMap {
  const ext = c.cardExtras?.extensions
  const mol = isObj(ext) ? ext.molfar_soul : undefined
  const chars = isObj(mol) ? mol.characters : undefined
  const out: SoulMap = {}
  if (!isObj(chars)) return out
  for (const [name, soul] of Object.entries(chars)) {
    if (FORBIDDEN_NAMES.has(name) || !isObj(soul)) continue
    out[name] = soul as Soul
  }
  return out
}

/** The card's kind (`extensions.molfar_card_type`), shown as a badge. */
export const CARD_TYPES = ['narrator', 'single', 'group', 'assistant', 'other'] as const
export type CardType = (typeof CARD_TYPES)[number]

export const isCardType = (v: unknown): v is CardType => typeof v === 'string' && (CARD_TYPES as readonly string[]).includes(v)

/** The kind the card says it is; null = not set. */
export function cardTypeOf(c: Pick<Character, 'cardExtras'>): CardType | null {
  const ext = c.cardExtras?.extensions
  const v = isObj(ext) ? ext.molfar_card_type : undefined
  return isCardType(v) ? v : null
}

/** The `cardExtras` patch that sets (or, with null, clears) the card's kind; every other
 *  key of `extensions` stays, and `extensions` goes when it held nothing else. */
export function withCardType(c: Pick<Character, 'cardExtras'>, type: CardType | null): Pick<Character, 'cardExtras'> {
  const extras: Record<string, unknown> = { ...(c.cardExtras ?? {}) }
  const hadExt = isObj(extras.extensions)
  const ext: Record<string, unknown> = hadExt ? { ...(extras.extensions as Record<string, unknown>) } : {}
  const hadType = 'molfar_card_type' in ext
  if (type) ext.molfar_card_type = type
  else delete ext.molfar_card_type
  if (Object.keys(ext).length) extras.extensions = ext
  else if (hadType) delete extras.extensions
  else if (hadExt) extras.extensions = ext
  return { cardExtras: Object.keys(extras).length ? extras : undefined }
}

export const MAX_MINOR = 64

/** Names kept as minor: trimmed, unique case-insensitively, at most 64. */
export function cleanNames(list: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of Array.isArray(list) ? list : []) {
    if (typeof n !== 'string') continue
    const name = n.trim()
    if (!validSoulName(name) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
    if (out.length >= MAX_MINOR) break
  }
  return out
}

/** The names the card keeps without a soul on purpose (`molfar_soul.minor`). */
export function minorOf(c: Pick<Character, 'cardExtras'>): string[] {
  const ext = c.cardExtras?.extensions
  const mol = isObj(ext) ? ext.molfar_soul : undefined
  return cleanNames(isObj(mol) ? mol.minor : undefined)
}

/** Rewrites the `molfar_soul` bag of a card and nothing else: `edit` gets a copy of
 *  the bag and returns the next one, or null to remove it. `extensions` goes too when
 *  the bag was all it held. */
function patchBag(c: Pick<Character, 'cardExtras'>, edit: (bag: Record<string, unknown>) => Record<string, unknown> | null): Pick<Character, 'cardExtras'> {
  const extras: Record<string, unknown> = { ...(c.cardExtras ?? {}) }
  const hadExt = isObj(extras.extensions)
  const hadMol = hadExt && 'molfar_soul' in (extras.extensions as object)
  const ext: Record<string, unknown> = hadExt ? { ...(extras.extensions as Record<string, unknown>) } : {}
  const prev = isObj(ext.molfar_soul) ? ext.molfar_soul : {}
  const next = edit({ ...prev })
  if (next) ext.molfar_soul = next
  else delete ext.molfar_soul
  if (Object.keys(ext).length) extras.extensions = ext
  else if (hadMol) delete extras.extensions
  else if (hadExt) extras.extensions = ext
  return { cardExtras: Object.keys(extras).length ? extras : undefined }
}

/** The `cardExtras` patch that stores `souls`: merged into the existing
 *  `extensions`, every other key kept (also inside `molfar_soul`, `minor` among them).
 *  No souls removes `molfar_soul` unless it holds more than `v` and `characters`,
 *  and `extensions` too when it held nothing else. */
export function withSouls(c: Pick<Character, 'cardExtras'>, souls: SoulMap): Pick<Character, 'cardExtras'> {
  return patchBag(c, (bag) => {
    if (Object.keys(souls).length) return { ...bag, v: SOUL_VERSION, characters: souls }
    const others = Object.keys(bag).filter((k) => k !== 'v' && k !== 'characters')
    return others.length ? { ...bag, v: SOUL_VERSION, characters: {} } : null // somebody's extra keys stay
  })
}

/** The `cardExtras` patch that stores the minor names; `characters` and every other key stay.
 *  An empty list drops `minor`, and the bag too when nothing else is in it. */
export function withMinor(c: Pick<Character, 'cardExtras'>, list: string[]): Pick<Character, 'cardExtras'> {
  const names = cleanNames(list)
  return patchBag(c, (bag) => {
    const next = { ...bag }
    if (names.length) next.minor = names
    else delete next.minor
    const chars = isObj(next.characters) ? next.characters : {}
    const others = Object.keys(next).filter((k) => k !== 'v' && k !== 'characters')
    if (!Object.keys(chars).length && !others.length) return null
    return { ...next, v: SOUL_VERSION, characters: chars }
  })
}

const clampInt = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return undefined
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function clampNumbers<K extends string>(src: unknown, keys: readonly K[], lo: number, hi: number, limits?: Partial<Record<K, [number, number]>>): Record<string, unknown> | undefined {
  if (!isObj(src)) return undefined
  const out: Record<string, unknown> = { ...src } // unknown keys survive
  for (const k of Object.keys(out)) {
    if (!(keys as readonly string[]).includes(k)) continue
    const [a, b] = limits?.[k as K] ?? [lo, hi]
    const n = clampInt(out[k], a, b)
    if (n === undefined) delete out[k]
    else out[k] = n
  }
  return out
}

function clampRules(src: unknown): SoulRule[] | undefined {
  if (!Array.isArray(src)) return undefined
  const out: SoulRule[] = []
  for (const r of src) {
    if (!isObj(r) || typeof r.cue !== 'string') continue
    const cue = r.cue.trim()
    if (!cue) continue
    const x = typeof r.x === 'number' && Number.isFinite(r.x) ? Math.min(3, Math.max(1, r.x)) : 1.5
    out.push({ ...r, cue, event: typeof r.event === 'string' ? r.event : '', stat: typeof r.stat === 'string' ? r.stat : 'trust', x })
    if (out.length >= MAX_TRIGGERS) break
  }
  return out
}

/** A soul with every field inside the contract's ranges. Unknown keys stay;
 *  rules without a cue and non-finite numbers are dropped. */
export function clampSoul(s: Soul): Soul {
  const out: Soul = { ...s }
  if (out.class !== undefined && !CLASSES.includes(out.class)) delete out.class
  if (out.pronouns !== undefined && !PRONOUNS.includes(out.pronouns)) delete out.pronouns
  if (out.aliases !== undefined) {
    const seen = new Set<string>()
    const list = (Array.isArray(out.aliases) ? out.aliases : [])
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.trim())
      .filter((a) => a && !seen.has(a.toLowerCase()) && !!seen.add(a.toLowerCase()))
      .slice(0, MAX_ALIASES)
    if (list.length) out.aliases = list
    else delete out.aliases
  }
  if (out.start !== undefined) {
    const start = clampNumbers(out.start, [...DISPOSITION, 'hostility'] as const, -START_LIMIT, START_LIMIT, { hostility: [0, 100] })
    if (start && out.class !== 'hostile') delete start.hostility
    if (start) out.start = start as Soul['start']
    else delete out.start
  }
  if (out.traits !== undefined) {
    const traits = clampNumbers(out.traits, TRAITS, 0, 100)
    if (traits) out.traits = traits as Soul['traits']
    else delete out.traits
  }
  if (out.spectra !== undefined) {
    const spectra = clampNumbers(out.spectra, SPECTRA.map((s) => s[0]), 0, 100)
    if (spectra) out.spectra = spectra as Soul['spectra']
    else delete out.spectra
  }
  for (const key of ['triggers', 'values'] as const) {
    if (out[key] === undefined) continue
    const rules = clampRules(out[key])
    if (rules) out[key] = rules
    else delete out[key]
  }
  if (out.coping !== undefined) {
    if (typeof out.coping === 'string') out.coping = out.coping.slice(0, MAX_COPING)
    else delete out.coping
  }
  if (out.pulseBase !== undefined) {
    const pb = clampNumbers(out.pulseBase, ['arousal'] as const, 0, 100)
    if (pb) out.pulseBase = pb as Soul['pulseBase']
    else delete out.pulseBase
  }
  return out
}

export type SpectrumBand = 'farLeft' | 'left' | 'middle' | 'right' | 'farRight'

export function spectrumBand(v: number): SpectrumBand {
  if (v < 25) return 'farLeft'
  if (v < 45) return 'left'
  if (v <= 55) return 'middle'
  if (v <= 75) return 'right'
  return 'farRight'
}

/** The English draft that "Rate with Molfar" opens (or copies). Never longer than
 *  ASK_MOLFAR_MAX; it ends in a space so the user can keep typing. */
export function molfarDraftText(o: { character: Pick<Character, 'id' | 'name'>; names: string[]; lorebookIds: string[]; chatIds: string[] }): string {
  const build = (names: string[], books: string[], chats: string[]) => {
    const who = names.length ? names.join(', ') : 'its main characters'
    const lore = books.length ? `lorebooks ${books.join(', ')} (data/lorebooks/<id>.json)` : 'no lorebooks'
    const chat = chats.length ? `chats ${chats.join(', ')}` : 'no chats'
    return `Rate the characters of the Roleplay card "${o.character.name}" (id ${o.character.id}) for the relationship dashboard. `
      + `Characters: ${who}. `
      + 'Read docs/SOUL.md in the roleplay app for the format and the scales. '
      + `Sources: data/characters/${o.character.id}/card.json; ${lore}; recent messages of ${chat} (data/chats/) only when nothing else describes someone. `
      + 'Rate only main characters, never minor ones. '
      + 'Key each soul by the spelling the chats use; other spellings go to "aliases", and seen names that deserve no soul go to "minor". '
      + `Write your proposal ONLY to data/dashboard/soul-drafts/${o.character.id}.json with "by": "molfar"; never edit card.json or src/. `
      + 'Then tell me in a few lines what you chose and why; I review it in the card\'s Soul tab. '
  }
  let names = o.names.slice(0, 30)
  let books = o.lorebookIds.slice(0, 20)
  let chats = o.chatIds.slice(0, 3)
  let text = build(names, books, chats)
  while (text.length > ASK_MOLFAR_MAX && names.length > 0) { names = names.slice(0, -1); text = build(names, books, chats) }
  while (text.length > ASK_MOLFAR_MAX && books.length > 0) { books = books.slice(0, -1); text = build(names, books, chats) }
  while (text.length > ASK_MOLFAR_MAX && chats.length > 0) { chats = chats.slice(0, -1); text = build(names, books, chats) }
  return text.length > ASK_MOLFAR_MAX ? text.slice(0, ASK_MOLFAR_MAX) : text
}

/** Stable JSON (sorted keys) for comparing a working copy with the saved souls. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (isObj(v)) {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}
