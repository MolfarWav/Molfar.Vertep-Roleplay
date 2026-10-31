// The calls the "New persona" dialog makes to the profile plugin (plugins/profile): three drafts from an idea, then
// Structure it and Fill empty on the persona just made. The draft is filed by the plugin; the persona page loads it.

import { ApiError, j } from '@/lib/engine'
import type { IdeaDraft, IdeaQuestion } from '@/lib/persona-new'
import type { ProfileDraft } from '@/lib/profile'

export type Picture = { data: string; mimeType: string }
export type IdeasReply =
  | { ok: true; drafts: IdeaDraft[]; questions: IdeaQuestion[] }
  | { ok: false; error: string; code?: 'no-model' }

const message = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : String(e))

/** Three drafts (and up to two questions) from an idea and/or a picture. Never throws: a failure is `{ ok: false }`. */
export async function fetchIdeas(body: { idea?: string; image?: Picture; wish?: string }, signal?: AbortSignal): Promise<IdeasReply> {
  try {
    return await j<IdeasReply>('/profile/persona-ideas', { method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { ok: false, error: message(e) }
  }
}

/** A new persona is written by the app and read by the plugin from disk: wait until the engine has the file. */
export async function waitForPersona(id: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    try { await j(`/personas/${encodeURIComponent(id)}`); return } catch { await new Promise((r) => setTimeout(r, 250)) }
  }
}

type DraftReply = { ok?: boolean; draft?: ProfileDraft; error?: string }

/** Structure it on a persona, whole (a persona is read in one call). Files the draft; returns it. */
export async function structurePersona(personaId: string, signal?: AbortSignal): Promise<{ ok: true; draft: ProfileDraft } | { ok: false; error: string }> {
  try {
    const r = await j<DraftReply>('/profile/structure', { method: 'POST', body: JSON.stringify({ personaId }), ...(signal ? { signal } : {}) })
    return r.ok && r.draft ? { ok: true, draft: r.draft } : { ok: false, error: r.error ?? 'no answer' }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { ok: false, error: message(e) }
  }
}

/** Fill empty on a persona; `merge` joins the structure draft already filed, so the user reviews one proposal. */
export async function fillPersona(personaId: string, fields: Record<string, string[]>, signal?: AbortSignal): Promise<{ ok: true; draft: ProfileDraft } | { ok: false; error: string }> {
  try {
    const r = await j<DraftReply>('/profile/fill', { method: 'POST', body: JSON.stringify({ personaId, fields, merge: true }), ...(signal ? { signal } : {}) })
    return r.ok && r.draft ? { ok: true, draft: r.draft } : { ok: false, error: r.error ?? 'no answer' }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { ok: false, error: message(e) }
  }
}
