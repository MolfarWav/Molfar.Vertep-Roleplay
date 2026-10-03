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
export const MAX_ALIASES = 8
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

/** The `cardExtras` patch that stores `souls`: merged into the existing
 *  `extensions`, every other key kept (also inside `molfar_soul`). No souls
 *  removes `molfar_soul`, and `extensions` too when it held nothing else. */
export function withSouls(c: Pick<Character, 'cardExtras'>, souls: SoulMap): Pick<Character, 'cardExtras'> {
  const extras: Record<string, unknown> = { ...(c.cardExtras ?? {}) }
  const hadExt = isObj(extras.extensions)
  const hadMol = hadExt && 'molfar_soul' in (extras.extensions as object)
  const ext: Record<string, unknown> = hadExt ? { ...(extras.extensions as Record<string, unknown>) } : {}
  const prev = isObj(ext.molfar_soul) ? ext.molfar_soul : {}
  if (Object.keys(souls).length) {
    ext.molfar_soul = { ...prev, v: SOUL_VERSION, characters: souls }
  } else {
    const others = Object.keys(prev).filter((k) => k !== 'v' && k !== 'characters')
    if (others.length) ext.molfar_soul = { ...prev, v: SOUL_VERSION, characters: {} } // somebody's extra keys stay
    else delete ext.molfar_soul
  }
  if (Object.keys(ext).length) extras.extensions = ext
  else if (hadMol) delete extras.extensions
  else if (hadExt) extras.extensions = ext
  return { cardExtras: Object.keys(extras).length ? extras : undefined }
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
