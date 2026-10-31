// "New persona" without a blank page: the pure parts. A file becomes a persona (or several), a picked draft and
// the answers become the brief a model structures, and the detail level says which fields get a second pass.

import { emptyFields, normalizeProfile } from './profile'

/** The biggest file the dialog reads, and the longest description a file may give a persona. */
export const MAX_FILE_BYTES = 200 * 1024
export const MAX_TEXT_CHARS = 12000

export type DetailLevel = 'quick' | 'full' | 'deep'
export const DETAIL_LEVELS: readonly DetailLevel[] = ['quick', 'full', 'deep']

/** One of the three drafts the model proposes (cleaned by the plugin: `cleanIdeas`). */
export interface IdeaDraft {
  angle: string
  name: string
  pronouns?: string
  summary: string
  traits: string[]
  detail: string
}
export interface IdeaQuestion { q: string; options: string[] }
export interface IdeaAnswer { q: string; a: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export type FileKind = 'personas' | 'json' | 'text'
export interface ParsedFile {
  kind: FileKind
  /** the persona's name: a `name` field, else the file name without its extension */
  name: string
  /** the description text, capped at MAX_TEXT_CHARS */
  text: string
  /** the text was longer than the cap and was cut */
  cut: boolean
  /** kind 'personas': the records for the existing import */
  personas?: Record<string, unknown>[]
}

/** The file name without its extension ("Ada Lovelace.notes.txt" -> "Ada Lovelace.notes"). */
export function baseName(file: string): string {
  const leaf = file.split(/[\\/]/).pop() ?? file
  const dot = leaf.lastIndexOf('.')
  return (dot > 0 ? leaf.slice(0, dot) : leaf).trim()
}

const capText = (s: string): { text: string; cut: boolean } => (s.length > MAX_TEXT_CHARS ? { text: s.slice(0, MAX_TEXT_CHARS), cut: true } : { text: s, cut: false })

/** What a picked file is. Persona-shaped JSON (a backup array, one object with `name` and `description`, a
 *  `{ name: description }` object) is imported as it is; any other JSON is shown as pretty text; text is text. */
export function parsePersonaFile(file: string, raw: string): ParsedFile {
  const fallback = baseName(file) || 'Persona'
  const trimmed = raw.replace(/^﻿/, '').trim()
  let json: unknown
  if (/^[[{]/.test(trimmed)) {
    try { json = JSON.parse(trimmed) } catch { json = undefined }
  }
  if (json !== undefined) {
    if (Array.isArray(json)) {
      const personas = json.filter((x): x is Record<string, unknown> => isObj(x) && typeof x.name === 'string' && x.name.trim() !== '')
      if (personas.length > 0 && personas.length === json.length) return { kind: 'personas', name: String(personas[0]?.name ?? fallback), text: '', cut: false, personas }
    } else if (isObj(json)) {
      if (typeof json.name === 'string' && json.name.trim() && typeof json.description === 'string') return { kind: 'personas', name: json.name.trim(), text: '', cut: false, personas: [json] }
      const entries = Object.entries(json)
      if (entries.length > 0 && !('name' in json) && entries.every(([, v]) => typeof v === 'string')) {
        return { kind: 'personas', name: entries[0]?.[0] ?? fallback, text: '', cut: false, personas: entries.map(([name, description]) => ({ name, description })) }
      }
    }
    const name = isObj(json) && typeof json.name === 'string' && json.name.trim() ? json.name.trim() : fallback
    return { kind: 'json', name, ...capText(JSON.stringify(json, null, 2)) }
  }
  return { kind: 'text', name: fallback, ...capText(raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()) }
}

/** The plain text a model structures into a profile: the draft the user picked, what they answered, their wish. */
export function composeBrief(draft: IdeaDraft, answers: readonly IdeaAnswer[], wish: string): string {
  const lines = [`Name: ${draft.name}`]
  if (draft.pronouns?.trim()) lines.push(`Pronouns: ${draft.pronouns.trim()}`)
  lines.push(draft.summary.trim())
  if (draft.detail.trim()) lines.push(draft.detail.trim())
  if (draft.traits.length) lines.push(`Traits: ${draft.traits.join(', ')}`)
  for (const a of answers) if (a.q.trim() && a.a.trim()) lines.push(`${a.q.trim()}: ${a.a.trim()}`)
  if (wish.trim()) lines.push(`Wish: ${wish.trim()}`)
  return lines.filter(Boolean).join('\n')
}

/** The sections a Full portrait fills after Structure it: looks, personality, goals. */
const FULL_SECTIONS: readonly string[] = ['appearance', 'lists', 'goals']

/** The empty fields a second pass asks a model for, by profile key: none for a Quick sketch, looks, personality and
 *  goals for a Full portrait, every empty field for a Deep dive. `profile` is what the structure draft proposed. */
export function fieldsFor(detail: DetailLevel, profile: unknown): Record<string, string[]> {
  if (detail === 'quick') return {}
  const empty = emptyFields(normalizeProfile(profile))
  if (detail === 'deep') return empty
  return Object.fromEntries(Object.entries(empty).filter(([key]) => FULL_SECTIONS.includes(key)))
}
