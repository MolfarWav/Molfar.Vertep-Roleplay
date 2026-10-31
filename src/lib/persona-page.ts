// The one-persona page, as plain functions: its sections and their tones, the gallery list and
// the portrait prompt built from the profile. No React, no store: the page and the tests share these.

import { normalizeProfile } from './profile'
import type { Persona } from './types'

export const PERSONA_SECTIONS = ['core', 'profile', 'bindings', 'lorebooks', 'memory', 'colours', 'gallery'] as const
export type PersonaSection = (typeof PERSONA_SECTIONS)[number]

export const isSection = (v: unknown): v is PersonaSection => (PERSONA_SECTIONS as readonly unknown[]).includes(v)

/** The tinted border and fill of each tab (as the character editor's strip), and the dot colour on the phone's list. */
export const SECTION_TINT: Record<PersonaSection, string> = {
  core: 'border-sky-500/30 bg-sky-500/10 data-active:bg-sky-500/25',
  profile: 'border-emerald-500/30 bg-emerald-500/10 data-active:bg-emerald-500/25',
  bindings: 'border-amber-500/30 bg-amber-500/10 data-active:bg-amber-500/25',
  lorebooks: 'border-violet-500/30 bg-violet-500/10 data-active:bg-violet-500/25',
  memory: 'border-pink-500/30 bg-pink-500/10 data-active:bg-pink-500/25',
  colours: 'border-slate-500/30 bg-slate-500/10 data-active:bg-slate-500/25',
  gallery: 'border-slate-500/30 bg-slate-500/10 data-active:bg-slate-500/25',
}
export const SECTION_DOT: Record<PersonaSection, string> = {
  core: 'bg-sky-500', profile: 'bg-emerald-500', bindings: 'bg-amber-500', lorebooks: 'bg-violet-500',
  memory: 'bg-pink-500', colours: 'bg-slate-500', gallery: 'bg-slate-500',
}

/** The portraits after one is added (a url already there moves to the end, never twice). */
export function addGallery(list: readonly string[] | undefined, url: string): string[] {
  return [...(list ?? []).filter((u) => u !== url), url]
}

/** The portraits without one. */
export function removeGallery(list: readonly string[] | undefined, url: string): string[] {
  return (list ?? []).filter((u) => u !== url)
}

/** What a picture style adds to the end of every portrait prompt. */
export const PORTRAIT_STYLE = 'portrait, upper body, detailed face, soft lighting, high quality'

/** The first draft of a portrait prompt: name, age, gender and the Appearance fields, then the style. */
export function portraitPrompt(p: Pick<Persona, 'name' | 'pronouns' | 'profile'>, style = PORTRAIT_STYLE): string {
  const pr = p.profile ? normalizeProfile(p.profile) : {}
  const id = pr.identity ?? {}
  const ap = pr.appearance ?? {}
  const t = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  const age = t(id.age)
  const who = [t(id.first) || p.name.trim(), age && /^\d+$/.test(age) ? `${age} years old` : age, t(id.gender)].filter(Boolean).join(', ')
  const parts = [
    who,
    t(ap.face) && `${t(ap.face)} face`,
    t(ap.eyes) && `${t(ap.eyes)} eyes`,
    t(ap.hair) && `${t(ap.hair)} hair`,
    t(ap.skin) && `${t(ap.skin)} skin`,
    t(ap.body) && `${t(ap.body)} build`,
    t(ap.attire) && `wearing ${t(ap.attire)}`,
    style.trim(),
  ]
  return parts.filter(Boolean).join(', ')
}
