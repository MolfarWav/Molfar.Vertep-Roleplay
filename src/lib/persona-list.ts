// The Personas overview, as plain functions: the one-line summary, how filled the
// profile is, sorting, filtering and tag counts. No React, no store: the view and
// the tests share these.

import { estimateTokens } from './tokens'
import { inFolder } from './character-folders'
import { SECTION_FIELDS, SECTION_IDS, answersOf, normalizeProfile, type Profile } from './profile'
import type { Persona, Tag } from './types'

export type PersonaSort = 'recent' | 'name' | 'used' | 'tokens'
export const PERSONA_SORTS: readonly PersonaSort[] = ['recent', 'name', 'used', 'tokens']

/** The strip's "No folder" choice: a persona with none of the folder tags. */
export const NO_FOLDER = '\u0000no-folder'

const filled = (v: unknown): boolean => (Array.isArray(v) ? v.some((x) => typeof x === 'string' && x.trim() !== '') : typeof v === 'string' && v.trim() !== '')

/** A persona's tags as a clean list (a hand-written file may hold anything there). */
export function tagsOf(p: Pick<Persona, 'tags'>): string[] {
  return cleanTags(p.tags) ?? []
}

/** Tag names from untrusted JSON: strings only, trimmed, no empties, no repeats; undefined when there is no list. */
export function cleanTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))]
}

/** "Occupation · age" from the profile, else the title, else nothing. */
export function personaLine(p: Pick<Persona, 'name' | 'pronouns' | 'profile' | 'title'>): string {
  const a = answersOf(p)
  const line = [a.occupation.trim(), a.age.trim()].filter(Boolean).join(' · ')
  return line || (p.title ?? '').trim()
}

/** The persona's description in tokens: what a chat adds to every prompt. */
export function personaTokens(p: Pick<Persona, 'description'>): number {
  return estimateTokens(p.description)
}

/** How many of the profile form's nine sections have something filled in
 *  (a section counts once one of its fields does, as the form's check mark does). */
export function profileFill(p: Pick<Persona, 'profile'>): { filled: number; total: number; label: string } {
  const total = SECTION_IDS.length
  if (!p.profile) return { filled: 0, total, label: `0/${total}` }
  const profile: Profile = normalizeProfile(p.profile)
  let n = 0
  for (const id of SECTION_IDS) {
    if (id === 'relationships') {
      if ((profile.relationships ?? []).some((r) => r.name.trim())) n++
      continue
    }
    const { key, fields } = SECTION_FIELDS[id]
    const bag = profile[key]
    if (bag && typeof bag === 'object' && fields.some((f) => filled((bag as Record<string, unknown>)[f]))) n++
  }
  return { filled: n, total, label: `${n}/${total}` }
}

/** A new array, in the order asked for. `usage` is chats per persona id, `tokens` the description size per id; a missing id counts 0. */
export function sortPersonas<T extends Pick<Persona, 'id' | 'name' | 'createdAt'>>(
  list: readonly T[], sort: PersonaSort, usage: ReadonlyMap<string, number>, tokens: ReadonlyMap<string, number>,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  const out = [...list]
  switch (sort) {
    case 'name': return out.sort(byName)
    case 'used': return out.sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || byName(a, b))
    case 'tokens': return out.sort((a, b) => (tokens.get(b.id) ?? 0) - (tokens.get(a.id) ?? 0) || byName(a, b))
    default: return out.sort((a, b) => b.createdAt - a.createdAt || byName(a, b))
  }
}

export interface PersonaFilter {
  query: string
  /** every tag listed must be on the persona */
  tags: readonly string[]
  /** a folder tag's name, NO_FOLDER, or null for All */
  folder: string | null
  /** the folder tags' names (needed for NO_FOLDER) */
  folderNames?: readonly string[]
}

export function filterPersonas<T extends Pick<Persona, 'name' | 'title' | 'tags' | 'profile' | 'pronouns'>>(list: readonly T[], f: PersonaFilter): T[] {
  const q = f.query.trim().toLowerCase()
  const folders = new Set(f.folderNames ?? [])
  return list.filter((p) => {
    const tags = tagsOf(p)
    if (f.folder === NO_FOLDER) { if (tags.some((t) => folders.has(t))) return false }
    else if (!inFolder({ tags }, f.folder)) return false
    if (!f.tags.every((t) => tags.includes(t))) return false
    if (!q) return true
    return p.name.toLowerCase().includes(q) || personaLine(p).toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q) || tags.some((t) => t.toLowerCase().includes(q))
  })
}

/** Personas per tag name. */
export function personaTagCounts(list: readonly Pick<Persona, 'tags'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of list) for (const t of tagsOf(p)) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

/** Personas with none of the folder tags. */
export function noFolderCount(list: readonly Pick<Persona, 'tags'>[], folders: readonly Pick<Tag, 'name'>[]): number {
  const names = new Set(folders.map((f) => f.name))
  return list.filter((p) => !tagsOf(p).some((t) => names.has(t))).length
}

/** The names of the folders a persona sits in, in the folder strip's order. */
export function folderNamesOf(p: Pick<Persona, 'tags'>, folders: readonly Pick<Tag, 'name'>[]): string[] {
  const own = new Set(tagsOf(p))
  return folders.filter((f) => own.has(f.name)).map((f) => f.name)
}

/** The tag chips for the filter row: tags in use, the manager's order first (hidden ones left out), the rest A-Z. */
export function personaTagChips(list: readonly Pick<Persona, 'tags'>[], registry: readonly Tag[]): { name: string; tag: Tag | undefined }[] {
  const meta = new Map(registry.map((t) => [t.name, t]))
  return [...personaTagCounts(list).keys()]
    .filter((name) => meta.get(name)?.visible !== false)
    .sort((a, b) => {
      const oa = meta.get(a)?.order ?? Number.MAX_SAFE_INTEGER
      const ob = meta.get(b)?.order ?? Number.MAX_SAFE_INTEGER
      return oa !== ob ? oa - ob : a.localeCompare(b)
    })
    .map((name) => ({ name, tag: meta.get(name) }))
}

/** A persona with a tag added or taken away (a copy of the list; nothing when it is already so). */
export function withTag(p: Pick<Persona, 'tags'>, name: string, on: boolean): string[] | null {
  const tags = tagsOf(p)
  if (on === tags.includes(name)) return null
  return on ? [...tags, name] : tags.filter((t) => t !== name)
}

/** The tags after a move to a folder: the other folders' tags go, the target's tag comes (null = no folder). */
export function moveToFolder(p: Pick<Persona, 'tags'>, target: string | null, folders: readonly Pick<Tag, 'name'>[]): string[] {
  const names = new Set(folders.map((f) => f.name))
  const rest = tagsOf(p).filter((t) => !names.has(t))
  return target ? [...rest, target] : rest
}
