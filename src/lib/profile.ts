// The structured card (contract: docs/DATA-FORMATS.md, "Profile"). Pure module:
// no React, no store. A profile lives on the card at `extensions.molfar_profile`
// and is the editing form only: saving it COMPILES `description` and
// `personality`, which stay the fields the prompt, presets and every export use.
// Empty fields never reach the text. Unknown keys survive every pass here.

import type { Character } from '@/lib/types'

export const PROFILE_VERSION = 1

export type ProfileText = Record<string, string>

export interface Relationship { name: string; relation: string; notes: string }

export interface Profile {
  v?: number
  identity?: { first?: string; family?: string; title?: string; nicknames?: string[]; age?: string; gender?: string; pronouns?: string; comment?: string }
  appearance?: ProfileText
  lists?: Record<string, string[]>
  behaviors?: ProfileText
  goals?: ProfileText
  background?: { birthplace?: string; location?: string; socialClass?: string; culture?: string; affiliations?: string[]; circle?: string; summary?: string }
  relationships?: Relationship[]
  sexuality?: { enabled?: boolean; orientation?: string; experience?: string; turnOns?: string[]; turnOffs?: string[]; kinks?: string[]; boundaries?: string }
  /** free text that fits no field; compiled after the structured lines */
  notes?: { description?: string; personality?: string }
  /** Free write: the profile is kept but no longer writes the card */
  free?: boolean
  compiled?: { at?: number; hash?: string }
  [unknown: string]: unknown
}

/** Field ids and their labels, in compile order. The labels are what the model reads. */
export const APPEARANCE: readonly (readonly [string, string])[] = [
  ['face', 'Face'], ['eyes', 'Eyes'], ['hair', 'Hair'], ['body', 'Body'], ['height', 'Height'], ['skin', 'Skin'],
  ['marks', 'Marks and scars'], ['attire', 'Attire'], ['voice', 'Voice'], ['scent', 'Scent'], ['other', 'Other'],
]
export const LISTS: readonly (readonly [string, string])[] = [
  ['strengths', 'Strengths'], ['flaws', 'Flaws'], ['traits', 'Traits'], ['values', 'Values'],
  ['fears', 'Fears'], ['wishes', 'Wishes'], ['secrets', 'Secrets'],
]
export const BEHAVIORS: readonly (readonly [string, string])[] = [
  ['speech', 'Speech'], ['quirks', 'Quirks'], ['habits', 'Habits'], ['underStress', 'Under stress'], ['bodyLanguage', 'Body language'],
]
export const GOALS: readonly (readonly [string, string])[] = [['life', 'Life goal'], ['shortTerm', 'Short-term goal']]
export const BACKGROUND: readonly (readonly [string, string])[] = [
  ['birthplace', 'Birthplace'], ['location', 'Lives in'], ['socialClass', 'Social class'], ['culture', 'Culture'], ['circle', 'Social circle'],
]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const filled = (v: unknown): string => s(v).trim()
const joined = (v: unknown): string => list(v).map((x) => x.trim()).filter(Boolean).join(', ')

/** A tolerant read: wrong types become empty, unknown keys stay. */
export function normalizeProfile(raw: unknown): Profile {
  const p: Profile = isObj(raw) ? { ...raw } : {}
  for (const k of ['identity', 'appearance', 'lists', 'behaviors', 'goals', 'background', 'sexuality', 'notes', 'compiled'] as const) {
    if (k in p && !isObj(p[k])) delete p[k]
  }
  if ('relationships' in p) {
    p.relationships = (Array.isArray(p.relationships) ? p.relationships : [])
      .filter(isObj)
      .map((r) => ({ ...r, name: s(r.name), relation: s(r.relation), notes: s(r.notes) }))
  }
  return p
}

/** The profile saved on a card, or null when it has none. */
export function profileOf(c: Pick<Character, 'cardExtras'>): Profile | null {
  const ext = c.cardExtras?.extensions
  const raw = isObj(ext) ? ext.molfar_profile : undefined
  return isObj(raw) ? normalizeProfile(raw) : null
}

function lines(rows: readonly (readonly [string, string])[], bag: unknown, value: (v: unknown) => string): string[] {
  const b = isObj(bag) ? bag : {}
  return rows.map(([id, label]) => [label, value(b[id])] as const).filter(([, v]) => v).map(([label, v]) => `${label}: ${v}`)
}

const block = (...groups: string[][]): string => groups.map((g) => g.join('\n')).filter(Boolean).join('\n\n')

/** What the profile writes into `description` (who and what they are) and
 *  `personality` (how they think and act). Labeled lines, empty fields skipped. */
export function compileProfile(p: Profile): { description: string; personality: string } {
  const id = isObj(p.identity) ? p.identity : {}
  const name = [filled(id.title), filled(id.first), filled(id.family)].filter(Boolean).join(' ')
  const gender = [filled(id.gender), filled(id.pronouns) && `(${filled(id.pronouns)})`].filter(Boolean).join(' ')
  const identity = [
    name && `Full name: ${name}`,
    joined(id.nicknames) && `Also called: ${joined(id.nicknames)}`,
    filled(id.age) && `Age: ${filled(id.age)}`,
    gender && `Gender: ${gender}`,
  ].filter(Boolean)
  const bg = isObj(p.background) ? p.background : {}
  const background = [
    ...lines(BACKGROUND, bg, filled),
    joined(bg.affiliations) && `Affiliations: ${joined(bg.affiliations)}`,
    filled(bg.summary) && `Backstory: ${filled(bg.summary)}`,
  ].filter(Boolean)
  const rel = (p.relationships ?? [])
    .filter((r) => r.name.trim())
    .map((r) => `- ${r.name.trim()}${r.relation.trim() ? ` (${r.relation.trim()})` : ''}${r.notes.trim() ? `: ${r.notes.trim()}` : ''}`)
  const sx = isObj(p.sexuality) ? p.sexuality : {}
  const sexuality = sx.enabled === true
    ? [
        filled(sx.orientation) && `Orientation: ${filled(sx.orientation)}`,
        filled(sx.experience) && `Experience: ${filled(sx.experience)}`,
        joined(sx.turnOns) && `Turn-ons: ${joined(sx.turnOns)}`,
        joined(sx.turnOffs) && `Turn-offs: ${joined(sx.turnOffs)}`,
        joined(sx.kinks) && `Kinks: ${joined(sx.kinks)}`,
        filled(sx.boundaries) && `Boundaries: ${filled(sx.boundaries)}`,
      ].filter(Boolean)
    : []
  const notes = isObj(p.notes) ? p.notes : {}
  return {
    description: block(identity, lines(APPEARANCE, p.appearance, filled), background, rel.length ? ['Relationships:', ...rel] : [], [filled(notes.description)].filter(Boolean)),
    personality: block(lines(LISTS, p.lists, joined), lines(BEHAVIORS, p.behaviors, filled), lines(GOALS, p.goals, filled), sexuality, [filled(notes.personality)].filter(Boolean)),
  }
}

/** One text for a persona: both halves of the profile. */
export function compileProfileText(p: Profile): string {
  const { description, personality } = compileProfile(p)
  return [description, personality].filter(Boolean).join('\n\n')
}

/** FNV-1a over both texts: tells a hand edit of the compiled fields apart. */
export function textHash(description: string, personality: string): string {
  let h = 0x811c9dc5
  const t = `${description}\u0000${personality}`
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The card's fields were edited by hand since the profile last wrote them. */
export function profileOutOfDate(c: Pick<Character, 'cardExtras' | 'description' | 'personality'>): boolean {
  const p = profileOf(c)
  if (!p || p.free) return false
  return p.compiled?.hash !== textHash(c.description, c.personality)
}

/** The `cardExtras` patch that stores `profile` (null removes it); every other
 *  key of `extensions` stays. `extensions` stays as `{}` when the profile was all it
 *  held: the engine merges a saved card into the old file, a left-out key comes back. */
export function withProfile(c: Pick<Character, 'cardExtras'>, profile: Profile | null): Pick<Character, 'cardExtras'> {
  const extras: Record<string, unknown> = { ...(c.cardExtras ?? {}) }
  const hadExt = isObj(extras.extensions)
  const ext: Record<string, unknown> = hadExt ? { ...(extras.extensions as Record<string, unknown>) } : {}
  const had = 'molfar_profile' in ext
  if (profile) ext.molfar_profile = { ...profile, v: PROFILE_VERSION }
  else delete ext.molfar_profile
  if (Object.keys(ext).length || had || hadExt) extras.extensions = ext
  return { cardExtras: Object.keys(extras).length ? extras : undefined }
}

/** The whole patch for a profile edit: the profile, and (unless Free write is on)
 *  the compiled `description` / `personality` with their hash. */
export function applyProfile(c: Pick<Character, 'cardExtras'>, profile: Profile, now = Date.now()): Partial<Character> {
  if (profile.free) return withProfile(c, profile)
  const { description, personality } = compileProfile(profile)
  const next: Profile = { ...profile, compiled: { at: now, hash: textHash(description, personality) } }
  return { ...withProfile(c, next), description, personality }
}

/** A first profile for a card that has none: the card's current text moves into
 *  the notes, so compiling it changes nothing until fields are filled. */
export function startProfile(c: Pick<Character, 'description' | 'personality'>): Profile {
  return { v: PROFILE_VERSION, notes: { description: c.description.trim(), personality: c.personality.trim() } }
}

/** Keep text added by hand AFTER the compiled lines: it becomes the notes and the
 *  profile writes again. null when the compiled lines themselves were changed
 *  (the caller offers Free write instead: guessing which field an edit meant loses data). */
export function adoptHandEdits(p: Profile, c: Pick<Character, 'description' | 'personality'>): Profile | null {
  const compiled = compileProfile({ ...p, notes: {} })
  // the compiled lines, then nothing or a line break: "Ann" must not match "Anna"
  const tail = (text: string, head: string): string | null => {
    if (!text.startsWith(head)) return null
    const rest = text.slice(head.length)
    return !head || !rest || rest.startsWith('\n') ? rest.trim() : null
  }
  const description = tail(c.description, compiled.description)
  const personality = tail(c.personality, compiled.personality)
  if (description === null || personality === null) return null
  return { ...p, free: false, notes: { description, personality } }
}
