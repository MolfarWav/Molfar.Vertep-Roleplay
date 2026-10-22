// The structured card (contract: docs/DATA-FORMATS.md, "Profile"). Pure module:
// no React, no store. A profile lives on the card at `extensions.molfar_profile`
// and is the editing form only: saving it COMPILES `description` and
// `personality`, which stay the fields the prompt, presets and every export use.
// Empty fields never reach the text. Unknown keys survive every pass here.

import type { Character, Persona } from '@/lib/types'

export const PROFILE_VERSION = 1

export type ProfileText = Record<string, string>

export interface Relationship { name: string; relation: string; notes: string }

export interface Profile {
  v?: number
  identity?: { first?: string; family?: string; title?: string; occupation?: string; nicknames?: string[]; age?: string; birthday?: string; gender?: string; pronouns?: string; comment?: string }
  appearance?: ProfileText
  lists?: Record<string, string[]>
  behaviors?: ProfileText
  goals?: ProfileText
  /** origin fields (BACKGROUND), the circles (CIRCLES, `affiliations` a list) and the backstory */
  background?: { affiliations?: string[]; summary?: string; [field: string]: string | string[] | undefined }
  trauma?: { experiences?: string[]; triggers?: string[]; coping?: string }
  relationships?: Relationship[]
  sexuality?: {
    /** the old switch (v1); `sections.sexuality` wins when set */
    enabled?: boolean
    orientation?: string; romantic?: string; relationshipStyle?: string; libido?: string; position?: string; experience?: string
    turnOns?: string[]; turnOffs?: string[]; kinks?: string[]; boundaries?: string; notes?: string
  }
  /** section switches: an off section keeps its fields but writes nothing (`sectionOn`) */
  sections?: Partial<Record<SectionId, boolean>>
  /** free text that fits no field; compiled after the structured lines */
  notes?: { description?: string; personality?: string }
  /** Free write: the profile is kept but no longer writes the card */
  free?: boolean
  compiled?: { at?: number; hash?: string }
  /** More characters on the same card (a narrator card's cast): each one the same
   *  fields as the profile itself, compiled after it under its own name. The
   *  profile's own fields are the first character; its `notes` are the card's shared text. */
  cast?: Profile[]
  [unknown: string]: unknown
}

/** Field ids and their labels, in compile order. The labels are what the model reads. */
export const APPEARANCE: readonly (readonly [string, string])[] = [
  ['face', 'Face'], ['eyes', 'Eyes'], ['hair', 'Hair'], ['body', 'Body'], ['height', 'Height'], ['weight', 'Weight'],
  ['measurements', 'Measurements'], ['skin', 'Skin'],
  ['marks', 'Marks and scars'], ['attire', 'Attire'], ['voice', 'Voice'], ['scent', 'Scent'], ['other', 'Other'],
]
export const LISTS: readonly (readonly [string, string])[] = [
  ['strengths', 'Strengths'], ['flaws', 'Flaws'], ['traits', 'Traits'], ['values', 'Values'],
  ['fears', 'Fears'], ['wishes', 'Wishes'], ['secrets', 'Secrets'],
  ['petPeeves', 'Pet peeves'], ['guiltyPleasures', 'Guilty pleasures'], ['coreBeliefs', 'Core beliefs'],
]
export const BEHAVIORS: readonly (readonly [string, string])[] = [
  ['speech', 'Speech'], ['quirks', 'Quirks'], ['habits', 'Habits'], ['motivations', 'Motivations'], ['social', 'Socially'],
  ['underStress', 'Under stress'], ['bodyLanguage', 'Body language'], ['hobbies', 'Hobbies'],
]
export const GOALS: readonly (readonly [string, string])[] = [
  ['life', 'Life goal'], ['shortTerm', 'Short-term goal'], ['career', 'Career goal'], ['growth', 'Wants to grow'],
  ['relationships', 'Relationship goal'], ['unfinished', 'Unfinished business'],
]
/** Origin: where they come from and how they live now. */
export const BACKGROUND: readonly (readonly [string, string])[] = [
  ['birthplace', 'Birthplace'], ['nationality', 'Nationality'], ['ethnicity', 'Ethnicity'], ['culture', 'Culture'],
  ['socialClass', 'Social class'], ['location', 'Lives in'], ['living', 'Living conditions'], ['neighborhood', 'Neighborhood'],
]
/** Circles: what they belong to and believe in (stored in `background`; `affiliations` is a list). */
export const CIRCLES: readonly (readonly [string, string])[] = [
  ['circle', 'Social circle'], ['politics', 'Political views'], ['religion', 'Religious beliefs'],
]
export const SEXUALITY: readonly (readonly [string, string])[] = [
  ['orientation', 'Orientation'], ['romantic', 'Romantic orientation'], ['relationshipStyle', 'Relationship style'],
  ['libido', 'Libido'], ['position', 'Position'], ['experience', 'Experience'],
]

/** The sections a switch turns off, in the order the form shows them (identity has none). */
export const SECTION_IDS = ['appearance', 'personality', 'behaviors', 'goals', 'background', 'circles', 'trauma', 'relationships', 'sexuality'] as const
export type SectionId = (typeof SECTION_IDS)[number]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const filled = (v: unknown): string => s(v).trim()
const joined = (v: unknown): string => list(v).map((x) => x.trim()).filter(Boolean).join(', ')

/** Where a list lives: section bag -> its list fields. Every other known
 *  field of those bags is one text. */
const LIST_FIELDS: Record<string, readonly string[]> = {
  identity: ['nicknames'],
  lists: LISTS.map(([k]) => k),
  background: ['affiliations'],
  trauma: ['experiences', 'triggers'],
  sexuality: ['turnOns', 'turnOffs', 'kinks'],
}
const TEXT_FIELDS: Record<string, readonly string[]> = {
  identity: ['first', 'family', 'title', 'occupation', 'age', 'birthday', 'gender', 'pronouns', 'comment'],
  appearance: APPEARANCE.map(([k]) => k),
  behaviors: BEHAVIORS.map(([k]) => k),
  goals: GOALS.map(([k]) => k),
  background: [...BACKGROUND.map(([k]) => k), ...CIRCLES.map(([k]) => k), 'summary'],
  trauma: ['coping'],
  sexuality: [...SEXUALITY.map(([k]) => k), 'boundaries', 'notes'],
  notes: ['description', 'personality'],
}

/** A hand- or model-written list: one string ("brave, kind") splits, numbers stay. */
function asList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === 'string' ? [x] : typeof x === 'number' ? [String(x)] : []))
  if (typeof v === 'string') return v.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean)
  if (typeof v === 'number') return [String(v)]
  return undefined
}

/** A text field written as a number or a list reads as text; anything else is dropped. */
function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return asList(v)?.join(', ')
  return undefined
}

/** A tolerant read: the form must never meet a wrong type (a list as one
 *  string, a number for an age, an object for a text: what an agent or another
 *  tool may write), so known fields are coerced or dropped; unknown keys stay. */
export function normalizeProfile(raw: unknown): Profile {
  const p: Profile = isObj(raw) ? { ...raw } : {}
  for (const k of ['identity', 'appearance', 'lists', 'behaviors', 'goals', 'background', 'trauma', 'sexuality', 'sections', 'notes', 'compiled'] as const) {
    if (k in p && !isObj(p[k])) delete p[k]
  }
  for (const k of new Set([...Object.keys(LIST_FIELDS), ...Object.keys(TEXT_FIELDS)])) {
    if (!isObj(p[k])) continue
    const bag: Record<string, unknown> = { ...(p[k] as Record<string, unknown>) }
    for (const f of LIST_FIELDS[k] ?? []) {
      if (!(f in bag)) continue
      const v = asList(bag[f])
      if (v) bag[f] = v
      else delete bag[f]
    }
    for (const f of TEXT_FIELDS[k] ?? []) {
      if (!(f in bag)) continue
      const v = asText(bag[f])
      if (v !== undefined) bag[f] = v
      else delete bag[f]
    }
    p[k] = bag
  }
  if (isObj(p.sections)) p.sections = Object.fromEntries(Object.entries(p.sections).filter(([, v]) => typeof v === 'boolean'))
  if ('free' in p && typeof p.free !== 'boolean') p.free = !!p.free
  if ('relationships' in p) {
    // an object keyed by name ({ "Mira": "sister" }) is a list of relationships too
    const rows: unknown[] = Array.isArray(p.relationships)
      ? p.relationships
      : isObj(p.relationships)
        ? Object.entries(p.relationships).map(([name, r]) => (isObj(r) ? { name, ...r } : { name, relation: asText(r) ?? '' }))
        : []
    p.relationships = rows
      .filter(isObj)
      .map((r) => ({ ...r, name: asText(r.name) ?? '', relation: asText(r.relation) ?? '', notes: asText(r.notes) ?? '' }))
  }
  if ('cast' in p) {
    // one level only: a member has no cast, no Free write and no compile stamp of its own
    p.cast = (Array.isArray(p.cast) ? p.cast : []).filter(isObj).map((m) => {
      const { cast: _c, free: _f, compiled: _d, v: _v, ...rest } = m as Profile
      return normalizeProfile(rest)
    })
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

const hasAny = (bag: unknown, keys: readonly string[]): boolean => {
  const b = isObj(bag) ? bag : {}
  return keys.some((k) => (Array.isArray(b[k]) ? joined(b[k]) : filled(b[k])) !== '')
}
const CIRCLE_KEYS = ['affiliations', ...CIRCLES.map(([k]) => k)]

/** Whether a section writes into the text. Its own switch wins; without one,
 *  sexuality follows its old `enabled`, trauma and circles are on only once
 *  something is filled, and the rest are on. */
export function sectionOn(p: Profile, id: SectionId): boolean {
  const set = isObj(p.sections) ? p.sections[id] : undefined
  if (typeof set === 'boolean') return set
  if (id === 'sexuality') return isObj(p.sexuality) && p.sexuality.enabled === true
  if (id === 'trauma') return hasAny(p.trauma, ['experiences', 'triggers', 'coping'])
  if (id === 'circles') return hasAny(p.background, CIRCLE_KEYS)
  return true
}

/** The name a profile goes by: title, first and family name, else the first
 *  nickname, else "Character <n>" (n counts from 1). */
export function profileName(p: Profile, index = 0): string {
  const id = isObj(p.identity) ? p.identity : {}
  const name = [filled(id.title), filled(id.first), filled(id.family)].filter(Boolean).join(' ')
  return name || list(id.nicknames).map((x) => x.trim()).find(Boolean) || `Character ${index + 1}`
}

/** The name written in the Identity fields (first and family name); "" while there is none. `profileName` falls back to "Character n". */
export function personName(p: Profile): string {
  const id = isObj(p.identity) ? p.identity : {}
  return [filled(id.first), filled(id.family)].filter(Boolean).join(' ')
}

/** The card's other characters, as saved (see `Profile.cast`). */
export function castOf(p: Profile): Profile[] {
  return Array.isArray(p.cast) ? p.cast.filter(isObj) : []
}

/** What the profile writes into `description` (who and what they are) and
 *  `personality` (how they think and act). Labeled lines, empty fields skipped.
 *  With a cast, every character that writes something gets its own `### Name`
 *  part, the first character's part first; the profile's notes follow them all.
 *  Members that write nothing are left out, so one character reads as before. */
export function compileProfile(p: Profile): { description: string; personality: string } {
  const cast = castOf(p)
    .map((m, i) => ({ name: profileName(m, i + 1), ...compileOne(m) }))
    .filter((m) => m.description || m.personality)
  if (!cast.length) return compileOne(p)
  const all = [{ name: profileName(p), ...compileOne({ ...p, notes: {} }) }, ...cast]
  const notes = isObj(p.notes) ? p.notes : {}
  const join = (key: 'description' | 'personality') =>
    [...all.filter((m) => m[key]).map((m) => `### ${m.name}\n${m[key]}`), filled(notes[key])].filter(Boolean).join('\n\n')
  return { description: join('description'), personality: join('personality') }
}

/** One run of lines under a heading: the unit the text is built from and the unit the export marks. */
interface Part { title: string; lines: string[] }

/** What one character writes, in order: the parts of `description` and the parts of `personality`. The
 *  titles are the Profile tab's sections; an empty part writes nothing. */
function partsOf(p: Profile): { description: Part[]; personality: Part[] } {
  const id = isObj(p.identity) ? p.identity : {}
  const name = [filled(id.title), filled(id.first), filled(id.family)].filter(Boolean).join(' ')
  const gender = [filled(id.gender), filled(id.pronouns) && `(${filled(id.pronouns)})`].filter(Boolean).join(' ')
  const identity = [
    name && `Full name: ${name}`,
    joined(id.nicknames) && `Also called: ${joined(id.nicknames)}`,
    filled(id.occupation) && `Occupation: ${filled(id.occupation)}`,
    filled(id.age) && `Age: ${filled(id.age)}`,
    filled(id.birthday) && `Birthday: ${filled(id.birthday)}`,
    gender && `Gender: ${gender}`,
  ].filter(Boolean)
  const on = (id: SectionId) => sectionOn(p, id)
  const bg = isObj(p.background) ? p.background : {}
  const background = on('background')
    ? [...lines(BACKGROUND, bg, filled), filled(bg.summary) && `Backstory: ${filled(bg.summary)}`].filter(Boolean)
    : []
  const circles = on('circles')
    ? [joined(bg.affiliations) && `Affiliations: ${joined(bg.affiliations)}`, ...lines(CIRCLES, bg, filled)].filter(Boolean)
    : []
  const tr = isObj(p.trauma) ? p.trauma : {}
  const trauma = on('trauma')
    ? [
        joined(tr.experiences) && `Trauma: ${joined(tr.experiences)}`,
        joined(tr.triggers) && `Triggered by: ${joined(tr.triggers)}`,
        filled(tr.coping) && `Copes by: ${filled(tr.coping)}`,
      ].filter(Boolean)
    : []
  const rel = !on('relationships') ? [] : (p.relationships ?? [])
    .filter((r) => r.name.trim())
    .map((r) => `- ${r.name.trim()}${r.relation.trim() ? ` (${r.relation.trim()})` : ''}${r.notes.trim() ? `: ${r.notes.trim()}` : ''}`)
  const sx = isObj(p.sexuality) ? p.sexuality : {}
  const sexuality = on('sexuality')
    ? [
        ...lines(SEXUALITY, sx, filled),
        joined(sx.turnOns) && `Turn-ons: ${joined(sx.turnOns)}`,
        joined(sx.turnOffs) && `Turn-offs: ${joined(sx.turnOffs)}`,
        joined(sx.kinks) && `Kinks: ${joined(sx.kinks)}`,
        filled(sx.boundaries) && `Boundaries: ${filled(sx.boundaries)}`,
        filled(sx.notes) && `Intimacy notes: ${filled(sx.notes)}`,
      ].filter(Boolean)
    : []
  const notes = isObj(p.notes) ? p.notes : {}
  const part = (id: SectionId, rows: readonly (readonly [string, string])[], bag: unknown, value: (v: unknown) => string) => (on(id) ? lines(rows, bag, value) : [])
  return {
    description: [
      { title: 'Identity', lines: identity },
      { title: 'Appearance', lines: part('appearance', APPEARANCE, p.appearance, filled) },
      { title: 'Background', lines: background },
      { title: 'Circles', lines: circles },
      { title: 'Relationships', lines: rel.length ? ['Relationships:', ...rel] : [] },
      { title: 'Notes', lines: [filled(notes.description)].filter(Boolean) },
    ],
    personality: [
      { title: 'Personality', lines: part('personality', LISTS, p.lists, joined) },
      { title: 'Behaviors', lines: part('behaviors', BEHAVIORS, p.behaviors, filled) },
      { title: 'Goals', lines: part('goals', GOALS, p.goals, filled) },
      { title: 'Trauma', lines: trauma },
      { title: 'Sexuality', lines: sexuality },
      { title: 'Notes', lines: [filled(notes.personality)].filter(Boolean) },
    ],
  }
}

const plain = (parts: Part[]): string => block(...parts.map((x) => x.lines))
const marked = (parts: Part[], level: number): string =>
  parts.filter((x) => x.lines.length).map((x) => `${'#'.repeat(level)} ${x.title}\n${x.lines.join('\n')}`).join('\n\n')

function compileOne(p: Profile): { description: string; personality: string } {
  const parts = partsOf(p)
  return { description: plain(parts.description), personality: plain(parts.personality) }
}

/**
 * The same text with a heading in front of each section's lines (GitHub #105), for the exported card only:
 * the live `description` and `personality` stay as they are. One character: `## Identity`, `## Appearance`,
 * `## Background`, `## Circles`, `## Relationships`, `## Notes` in the description; `## Personality`,
 * `## Behaviors`, `## Goals`, `## Trauma`, `## Sexuality`, `## Notes` in the personality. A cast keeps its
 * `### <name>` parts and puts the headings inside each at `####`, the shared notes last at `##`.
 * Taking the heading lines out gives `compileProfile` exactly.
 */
export function compileProfileMarked(p: Profile): { description: string; personality: string } {
  const cast = castOf(p)
    .map((m, i) => ({ name: profileName(m, i + 1), parts: partsOf(m) }))
    .filter((m) => m.parts.description.some((x) => x.lines.length) || m.parts.personality.some((x) => x.lines.length))
  if (!cast.length) {
    const parts = partsOf(p)
    return { description: marked(parts.description, 2), personality: marked(parts.personality, 2) }
  }
  const all = [{ name: profileName(p), parts: partsOf({ ...p, notes: {} }) }, ...cast]
  const notes = isObj(p.notes) ? p.notes : {}
  const join = (key: 'description' | 'personality') => [
    ...all.filter((m) => m.parts[key].some((x) => x.lines.length)).map((m) => `### ${m.name}\n${marked(m.parts[key], 4)}`),
    filled(notes[key]) && `## Notes\n${filled(notes[key])}`,
  ].filter(Boolean).join('\n\n')
  return { description: join('description'), personality: join('personality') }
}

/** The texts an export writes for a profiled card, with the section headings; null when the card has no
 *  profile that wrote its text (Free write, a hand edit since, nothing to write), so it exports as it is. */
export function markedExport(c: Pick<Character, 'cardExtras' | 'description' | 'personality'>): { description: string; personality: string } | null {
  const p = profileOf(c)
  if (!p || p.free || profileOutOfDate(c)) return null
  const m = compileProfileMarked(p)
  return m.description || m.personality ? m : null
}

const MARK_TITLES = ['Identity', 'Appearance', 'Background', 'Circles', 'Relationships', 'Personality', 'Behaviors', 'Goals', 'Trauma', 'Sexuality', 'Notes']
const MARK = new RegExp(`^#{2,4} (?:${MARK_TITLES.join('|')})[ \\t]*$`)

/** Whether the text carries one of the section headings the export writes. */
export function hasMarks(text: string): boolean {
  return text.split('\n').some((l) => MARK.test(l))
}

/** The text without the section headings (the export's marks), so it reads as the profile compiled it. */
export function unmarkText(text: string): string {
  return text.split('\n').filter((l) => !MARK.test(l)).join('\n')
}

type Fields = Record<string, string>

/** Reads `Label: value` lines against a table of labels; a line with no known label continues the previous
 *  value. Null when a line fits nowhere (the section was not written by the profile). */
function readLabeled(body: string[], labels: Record<string, string>): Fields | null {
  const out: Fields = {}
  let last = ''
  for (const line of body) {
    const m = /^([^:]{1,40}): (.*)$/.exec(line)
    const id = m && Object.prototype.hasOwnProperty.call(labels, m[1]!) ? labels[m[1]!] : undefined
    if (m && id) {
      if (id in out) return null
      out[id] = m[2]!
      last = id
    } else if (last) out[last] += `\n${line}`
    else return null
  }
  return out
}

const toLabels = (rows: readonly (readonly [string, string])[], extra: Record<string, string> = {}): Record<string, string> =>
  ({ ...Object.fromEntries(rows.map(([id, label]) => [label, id])), ...extra })
const items = (v: string): string[] => v.split(', ').map((x) => x.trim()).filter(Boolean)

/** The sections of one text, by title, or null when it has text outside a section or a heading twice. */
function sectionsOf(text: string): Map<string, string[]> | null {
  const out = new Map<string, string[]>()
  let at: string[] | null = null
  for (const line of text.split('\n')) {
    if (MARK.test(line)) {
      const title = line.replace(/^#+ /, '').trim()
      if (out.has(title)) return null
      at = []
      out.set(title, at)
    } else if (at) at.push(line)
    else if (line.trim()) return null
  }
  // blank lines between sections belong to no one
  for (const body of out.values()) while (body.length && !body[body.length - 1]!.trim()) body.pop()
  return out
}

/**
 * Rebuilds the profile an export wrote its headings from (GitHub #105): for a card whose description and
 * personality carry the section headings and whose profile is gone (another client, a stripped extension).
 * Null when the text does not read back as what the profile writes, line for line, or when a cast is in it.
 */
export function profileFromMarked(description: string, personality: string): Profile | null {
  if (/^### /m.test(description) || /^### /m.test(personality)) return null
  const d = sectionsOf(description)
  const pe = sectionsOf(personality)
  if (!d || !pe || (!d.size && !pe.size)) return null
  const p: Profile = {}
  const sections: Partial<Record<SectionId, boolean>> = {}
  const id = d.get('Identity')
  if (id) {
    const f = readLabeled(id, { 'Full name': 'first', 'Also called': 'nicknames', Occupation: 'occupation', Age: 'age', Birthday: 'birthday', Gender: 'gender' })
    if (!f) return null
    const g = f.gender !== undefined ? /^(.*?)(?: ?\(([^()]*)\))?$/.exec(f.gender) : null
    p.identity = {
      ...(f.first !== undefined ? { first: f.first } : {}),
      ...(f.nicknames !== undefined ? { nicknames: items(f.nicknames) } : {}),
      ...(f.occupation !== undefined ? { occupation: f.occupation } : {}),
      ...(f.age !== undefined ? { age: f.age } : {}),
      ...(f.birthday !== undefined ? { birthday: f.birthday } : {}),
      ...(g ? { gender: g[1] ?? '', ...(g[2] ? { pronouns: g[2] } : {}) } : {}),
    }
  }
  const ap = d.get('Appearance')
  if (ap) { const f = readLabeled(ap, toLabels(APPEARANCE)); if (!f) return null; p.appearance = f }
  const bgFields: Record<string, string | string[]> = {}
  const bgRead = d.get('Background')
  if (bgRead) { const f = readLabeled(bgRead, toLabels(BACKGROUND, { Backstory: 'summary' })); if (!f) return null; Object.assign(bgFields, f) }
  const ci = d.get('Circles')
  if (ci) {
    const f = readLabeled(ci, toLabels(CIRCLES, { Affiliations: 'affiliations' }))
    if (!f) return null
    const { affiliations, ...rest } = f
    Object.assign(bgFields, rest)
    if (affiliations !== undefined) bgFields.affiliations = items(affiliations)
    sections.circles = true
  }
  if (Object.keys(bgFields).length) p.background = bgFields as Profile['background']
  const rl = d.get('Relationships')
  if (rl) {
    if (rl[0] !== 'Relationships:') return null
    const rows: Relationship[] = []
    for (const line of rl.slice(1)) {
      const m = /^- (.+?)(?: \((.*?)\))?(?:: (.*))?$/.exec(line)
      if (!m) return null
      rows.push({ name: m[1]!, relation: m[2] ?? '', notes: m[3] ?? '' })
    }
    p.relationships = rows
  }
  const lists = pe.get('Personality')
  if (lists) {
    const f = readLabeled(lists, toLabels(LISTS))
    if (!f) return null
    p.lists = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, items(v)]))
  }
  const bh = pe.get('Behaviors')
  if (bh) { const f = readLabeled(bh, toLabels(BEHAVIORS)); if (!f) return null; p.behaviors = f }
  const gl = pe.get('Goals')
  if (gl) { const f = readLabeled(gl, toLabels(GOALS)); if (!f) return null; p.goals = f }
  const tr = pe.get('Trauma')
  if (tr) {
    const f = readLabeled(tr, { Trauma: 'experiences', 'Triggered by': 'triggers', 'Copes by': 'coping' })
    if (!f) return null
    p.trauma = {
      ...(f.experiences !== undefined ? { experiences: items(f.experiences) } : {}),
      ...(f.triggers !== undefined ? { triggers: items(f.triggers) } : {}),
      ...(f.coping !== undefined ? { coping: f.coping } : {}),
    }
    sections.trauma = true
  }
  const sx = pe.get('Sexuality')
  if (sx) {
    const f = readLabeled(sx, toLabels(SEXUALITY, { 'Turn-ons': 'turnOns', 'Turn-offs': 'turnOffs', Kinks: 'kinks', Boundaries: 'boundaries', 'Intimacy notes': 'notes' }))
    if (!f) return null
    const { turnOns, turnOffs, kinks, ...rest } = f
    p.sexuality = {
      ...rest,
      ...(turnOns !== undefined ? { turnOns: items(turnOns) } : {}),
      ...(turnOffs !== undefined ? { turnOffs: items(turnOffs) } : {}),
      ...(kinks !== undefined ? { kinks: items(kinks) } : {}),
    }
    sections.sexuality = true
  }
  const nd = d.get('Notes')
  const np = pe.get('Notes')
  if (nd || np) p.notes = { ...(nd ? { description: nd.join('\n') } : {}), ...(np ? { personality: np.join('\n') } : {}) }
  if (Object.keys(sections).length) p.sections = sections
  return p
}

/**
 * The patch that takes the section headings out of a card that came with them (an import of an export
 * with "Mark the profile sections" on), or null when the card is left alone. With the profile still on the
 * card, the headings go when the text without them is what the profile wrote. Without it, the profile is
 * rebuilt from the headings, but only when it compiles back to exactly the text under them: a card that
 * merely uses headings like these (many community cards do) is never touched.
 */
export function adoptMarkedSections(c: Pick<Character, 'cardExtras' | 'description' | 'personality'>, now = Date.now()): Partial<Character> | null {
  if (!hasMarks(c.description) && !hasMarks(c.personality)) return null
  const description = unmarkText(c.description)
  const personality = unmarkText(c.personality)
  const had = profileOf(c)
  if (had) return !had.free && had.compiled?.hash === textHash(description, personality) ? { description, personality } : null
  const built = profileFromMarked(c.description, c.personality)
  if (!built) return null
  const back = compileProfile(built)
  if (back.description !== description || back.personality !== personality) return null
  return applyProfile(c, built, now)
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

/** A profile written outside the Profile tab (Molfar, a hand edit) leaves `compiled` out: the app
 *  then writes `description` / `personality` from it on the next load. Returns that patch, or null
 *  when there is nothing to do (no profile, Free write, already compiled, or it would write nothing). */
export function compileIfWrittenElsewhere(c: Pick<Character, 'cardExtras'>, now = Date.now()): Partial<Character> | null {
  const p = profileOf(c)
  if (!p || p.free || p.compiled) return null
  const { description, personality } = compileProfile(p)
  if (!description.trim() && !personality.trim()) return null
  return applyProfile(c, p, now)
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

/** What "Structure it" files (plugins/profile): proposed fields and the text that fit none. */
export interface ProfileDraft {
  v?: number
  /** "fill": only empty fields, merged by `mergeFill`; otherwise a Structure it split */
  kind?: 'structure' | 'fill'
  /** a fill from "Read from picture": its values replace filled fields too */
  replace?: boolean
  at?: number
  model?: string
  note?: string
  profile: Profile
  /** Structure it on a narrator card: the card's other characters, one profile each (`Profile.cast`) */
  cast?: Profile[]
  /** a fill for one of the card's other characters: its place in the cast, 1 = the first */
  member?: number
  leftover?: { description?: string; personality?: string }
}

const SECTIONS = ['identity', 'appearance', 'lists', 'behaviors', 'goals', 'background', 'trauma', 'relationships', 'sexuality'] as const

/** Accepting a draft: the card's whole text was split again, so the draft's sections
 *  replace the old ones (a section the draft lacks is dropped, or its text would show
 *  twice) and the leftover becomes the notes. The private comment and unknown keys stay.
 *  The text before goes into the version history: one click back. */
export function acceptDraft(c: Pick<Character, 'cardExtras' | 'versions'> & Record<VersionField, string>, draft: ProfileDraft, now = Date.now()): Partial<Character> {
  const prev = profileOf(c) ?? {}
  const next: Profile = { ...prev }
  for (const k of SECTIONS) delete next[k]
  Object.assign(next, normalizeProfile(draft.profile))
  for (const k of ['notes', 'free', 'compiled', 'v'] as const) delete next[k]
  const comment = prev.identity?.comment
  if (comment) next.identity = { ...next.identity, comment }
  next.notes = { description: draft.leftover?.description ?? '', personality: draft.leftover?.personality ?? '' }
  // a narrator card: the other characters come with it (the old cast was blank, or Structure it was not offered)
  if (draft.cast?.length) next.cast = normalizeProfile({ cast: draft.cast }).cast
  return { ...applyProfile(c, next, now), versions: [versionOf(c, 'Before Structure it', now), ...c.versions] }
}

/** Where each form section keeps its fields: the profile key and the field ids. */
export const SECTION_FIELDS: Record<'identity' | Exclude<SectionId, 'relationships'>, { key: 'identity' | 'appearance' | 'lists' | 'behaviors' | 'goals' | 'background' | 'trauma' | 'sexuality'; fields: readonly string[] }> = {
  identity: { key: 'identity', fields: ['first', 'family', 'title', 'occupation', 'age', 'birthday', 'gender', 'pronouns', 'nicknames'] },
  appearance: { key: 'appearance', fields: APPEARANCE.map(([k]) => k) },
  personality: { key: 'lists', fields: LISTS.map(([k]) => k) },
  behaviors: { key: 'behaviors', fields: BEHAVIORS.map(([k]) => k) },
  goals: { key: 'goals', fields: GOALS.map(([k]) => k) },
  background: { key: 'background', fields: [...BACKGROUND.map(([k]) => k), 'summary'] },
  circles: { key: 'background', fields: ['affiliations', ...CIRCLES.map(([k]) => k)] },
  trauma: { key: 'trauma', fields: ['experiences', 'triggers', 'coping'] },
  sexuality: { key: 'sexuality', fields: [...SEXUALITY.map(([k]) => k), 'turnOns', 'turnOffs', 'kinks', 'boundaries', 'notes'] },
}

// a word at the start of Gender ("male", "man, 34", "чоловік") or, without one, the pronouns
const MALE = /^(m|male|man|boy|guy|чоловік\S*|чол|хлопець|хлопчик|юнак|мужчина|парень|мужской)(\b|$|[\s,.(/])/iu
const HE = /^(he|him|він|его|он)(\b|$|[\s,./])/iu

/** The profile says the character is male: fields that do not apply (measurements) are not offered. */
export function isMale(p: Profile): boolean {
  const gender = filled(p.identity?.gender).toLowerCase()
  if (gender) return MALE.test(gender)
  return HE.test(filled(p.identity?.pronouns).toLowerCase())
}

/** Fields that do not apply to this character; still shown when someone filled them. */
export function skippedFields(p: Profile): Set<string> {
  return new Set(isMale(p) ? ['measurements'] : [])
}

/** The empty fields "Fill empty" asks the model for, by profile key: one section
 *  (`only`), or every section that is switched on. Relationships are never
 *  invented: a made-up person changes the story's world. */
export function emptyFields(p: Profile, only?: keyof typeof SECTION_FIELDS): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [id, { key, fields }] of Object.entries(SECTION_FIELDS) as [keyof typeof SECTION_FIELDS, (typeof SECTION_FIELDS)[keyof typeof SECTION_FIELDS]][]) {
    if (only ? id !== only : id !== 'identity' && !sectionOn(p, id)) continue
    const bag = isObj(p[key]) ? (p[key] as Record<string, unknown>) : {}
    const skip = skippedFields(p)
    const empty = fields.filter((f) => !skip.has(f) && (Array.isArray(bag[f]) ? !joined(bag[f]) : !filled(bag[f])))
    if (empty.length) out[key] = [...(out[key] ?? []), ...empty]
  }
  return out
}

/** "Fill empty": the draft's fields go only where the profile has nothing yet;
 *  a field already filled, by hand or before, is never overwritten. */
export function mergeFill(prev: Profile, fill: Profile, replace = false): Profile {
  const next: Profile = { ...prev }
  const f = normalizeProfile(fill)
  for (const k of ['identity', 'appearance', 'lists', 'behaviors', 'goals', 'background', 'trauma', 'sexuality'] as const) {
    const add = f[k]
    if (!isObj(add)) continue
    const have: Record<string, unknown> = isObj(prev[k]) ? { ...(prev[k] as Record<string, unknown>) } : {}
    for (const [field, v] of Object.entries(add)) {
      if (field === 'enabled' || field === 'comment') continue
      const empty = Array.isArray(have[field]) ? !joined(have[field]) : !filled(have[field])
      const value = Array.isArray(v) ? list(v).map((x) => x.trim()).filter(Boolean) : filled(v)
      if ((empty || replace) && (Array.isArray(value) ? value.length : value)) have[field] = value
    }
    ;(next as Record<string, unknown>)[k] = have
  }
  return next
}

const versionOf = (c: Record<VersionField, string>, label: string, now: number) => ({
  id: `v_${now.toString(36)}`,
  label: `${label}: ${new Date(now).toLocaleString()}`,
  savedAt: now,
  snapshot: Object.fromEntries(VERSION_FIELDS.map((f) => [f, c[f]])) as Partial<Character>,
})

/** Accepting a "Fill empty" draft on a card: empty fields filled, the text before in Versions. */
export function acceptFill(c: Pick<Character, 'cardExtras' | 'versions' | 'description' | 'personality'> & Record<VersionField, string>, draft: ProfileDraft, now = Date.now()): Partial<Character> {
  const prev = profileOf(c) ?? startProfile(c)
  const label = draft.replace ? 'Before Read from picture' : 'Before Fill empty'
  const at = typeof draft.member === 'number' && draft.member >= 1 ? draft.member - 1 : -1
  const cast = castOf(prev)
  // a fill for another character of the card goes to that one; one whose place is gone is dropped, not put on the first
  const next = at < 0 ? mergeFill(prev, draft.profile, draft.replace === true) : at < cast.length ? { ...prev, cast: cast.map((m, i) => (i === at ? mergeFill(m, draft.profile) : m)) } : prev
  return { ...applyProfile(c, next, now), versions: [versionOf(c, label, now), ...c.versions] }
}

/** A profile with nothing in it: no field, no relationship, no note (a character just added, still unnamed). */
export function isBlankProfile(p: Profile): boolean {
  const empty = (v: unknown): boolean =>
    Array.isArray(v) ? v.every(empty) : isObj(v) ? Object.entries(v).every(([k, x]) => k === 'v' || k === 'enabled' || empty(x)) : typeof v === 'string' ? !v.trim() : v == null || v === false
  return empty(p)
}

/** The fields a version snapshot holds (as the editor's "Save current as version"). */
export const VERSION_FIELDS = ['description', 'personality', 'scenario', 'firstMessage', 'exampleDialogue', 'systemPromptOverride', 'postHistoryInstructions'] as const
type VersionField = (typeof VERSION_FIELDS)[number]

// ── The user's persona ──────────────────────────────────────────────────────
// A persona keeps the same profile shape at `persona.profile` and one text,
// `description`, compiled from all of it. The questionnaire fills a few fields.

export interface PersonaAnswers {
  first: string; family: string; nicknames: string
  age: string; gender: string; pronouns: string
  hair: string; eyes: string; body: string; attire: string
  traits: string; flaws: string
  occupation: string; summary: string
  /** what they want from stories: private, never compiled */
  wants: string
}

const words = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean)

/** The questionnaire's starting values: what the persona already says. */
export function answersOf(p: Pick<Persona, 'name' | 'pronouns' | 'profile'>): PersonaAnswers {
  const pr = p.profile ? normalizeProfile(p.profile) : {}
  const id = pr.identity ?? {}
  const ap = pr.appearance ?? {}
  return {
    first: id.first ?? (pr.identity ? '' : p.name), family: id.family ?? '', nicknames: (id.nicknames ?? []).join(', '),
    age: id.age ?? '', gender: id.gender ?? '', pronouns: id.pronouns ?? p.pronouns,
    hair: ap.hair ?? '', eyes: ap.eyes ?? '', body: ap.body ?? '', attire: ap.attire ?? '',
    traits: (pr.lists?.traits ?? []).join(', '), flaws: (pr.lists?.flaws ?? []).join(', '),
    occupation: id.occupation ?? '', summary: pr.background?.summary ?? '', wants: id.comment ?? '',
  }
}

/** The persona's text was edited by hand since the profile last wrote it. */
export function personaEdited(p: Pick<Persona, 'description' | 'profile'>): boolean {
  if (!p.profile) return false
  return normalizeProfile(p.profile).compiled?.hash !== textHash(p.description, '')
}

/** Text added by hand AFTER the persona's compiled text (trimmed; "" when none);
 *  null when the compiled text itself was edited, which saving answers would lose. */
export function personaAdditions(p: Pick<Persona, 'description' | 'profile'>): string | null {
  if (!p.profile) return ''
  const head = compileProfileText(normalizeProfile(p.profile))
  if (!p.description.startsWith(head)) return null
  const rest = p.description.slice(head.length)
  return !head || !rest || rest.startsWith('\n') ? rest.trim() : null
}

/** The persona patch for saved answers. Fields the questionnaire does not ask
 *  about stay. A persona without a profile keeps its old text as notes, and text
 *  added by hand after the compiled lines joins the notes. An edit INSIDE the
 *  compiled lines is replaced: the caller asks first (`personaAdditions` is null). */
export function applyAnswers(p: Pick<Persona, 'name' | 'description' | 'profile'>, a: PersonaAnswers, now = Date.now()): Partial<Persona> {
  const prev: Profile = p.profile ? normalizeProfile(p.profile) : { notes: { description: p.description.trim() } }
  const added = p.profile ? personaAdditions(p) : ''
  const base: Profile = added ? { ...prev, notes: { ...prev.notes, description: [prev.notes?.description?.trim() ?? '', added].filter(Boolean).join('\n\n') } } : prev
  const t = (v: string) => v.trim()
  const next: Profile = {
    ...base,
    v: PROFILE_VERSION,
    identity: {
      ...base.identity,
      first: t(a.first), family: t(a.family), nicknames: words(a.nicknames),
      age: t(a.age), gender: t(a.gender), pronouns: t(a.pronouns), occupation: t(a.occupation), comment: t(a.wants),
    },
    appearance: { ...base.appearance, hair: t(a.hair), eyes: t(a.eyes), body: t(a.body), attire: t(a.attire) },
    lists: { ...base.lists, traits: words(a.traits), flaws: words(a.flaws) },
    background: { ...base.background, summary: t(a.summary) },
  }
  return { ...writePersona(p, next, now), pronouns: t(a.pronouns) }
}

/** The persona patch for a profile: one compiled text, the hash, and the name and
 *  pronouns the profile gives (the name is {{user}} in every prompt). Free write
 *  keeps the profile and leaves the text alone. */
export function writePersona(p: Pick<Persona, 'name'>, profile: Profile, now = Date.now()): Partial<Persona> {
  const id = profile.identity ?? {}
  const who = { name: filled(id.first) || p.name, ...(filled(id.pronouns) ? { pronouns: filled(id.pronouns) } : {}) }
  if (profile.free) return { profile: { ...profile, v: PROFILE_VERSION }, ...who }
  const description = compileProfileText(profile)
  return { profile: { ...profile, v: PROFILE_VERSION, compiled: { at: now, hash: textHash(description, '') } }, description, ...who }
}

/** A persona's profile to edit: its own, or one holding its text as notes. */
export function personaProfile(p: Pick<Persona, 'name' | 'pronouns' | 'description' | 'profile'>): Profile {
  if (p.profile) return normalizeProfile(p.profile)
  return { v: PROFILE_VERSION, identity: { first: p.name, ...(p.pronouns ? { pronouns: p.pronouns } : {}) }, notes: { description: p.description.trim() } }
}

/** "Structure it" on a persona: the draft's sections replace the old ones, both
 *  leftovers become the notes (a persona has one text). */
export function acceptPersonaDraft(p: Pick<Persona, 'name' | 'profile'>, draft: ProfileDraft, now = Date.now()): Partial<Persona> {
  const prev: Profile = p.profile ? normalizeProfile(p.profile) : {}
  const next: Profile = { ...prev }
  for (const k of SECTIONS) delete next[k]
  Object.assign(next, normalizeProfile(draft.profile))
  for (const k of ['notes', 'free', 'compiled', 'v'] as const) delete next[k]
  const comment = prev.identity?.comment
  if (comment) next.identity = { ...next.identity, comment }
  next.notes = { description: [draft.leftover?.description ?? '', draft.leftover?.personality ?? ''].map((x) => x.trim()).filter(Boolean).join('\n\n') }
  return writePersona(p, next, now)
}

/** "Fill empty" on a persona. */
export function acceptPersonaFill(p: Pick<Persona, 'name' | 'pronouns' | 'description' | 'profile'>, draft: ProfileDraft, now = Date.now()): Partial<Persona> {
  return writePersona(p, mergeFill(personaProfile(p), draft.profile, draft.replace === true), now)
}
