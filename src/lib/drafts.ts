import type { ID } from './types'

/** Unsent composer text lives under a per-chat key so a reload, rebuild, or
 *  chat switch never eats a half-written thought. */
export const draftKey = (chatId: ID) => `chrysalis.roleplay.draft.${chatId}`

export const readDraft = (chatId: ID): string => {
  try { return localStorage.getItem(draftKey(chatId)) ?? '' } catch { return '' }
}

/** Keys the shell refused to store (its storage is full): the engine bridge
 *  lists them (window.chrysalisStorage, 1.0.9+) and fires "chrysalis:storage". */
export function unsavedKeys(): string[] {
  try {
    const api = (window as { chrysalisStorage?: { unsaved?: () => Array<{ key: string }> } }).chrysalisStorage
    return api?.unsaved ? api.unsaved().map((u) => u.key) : []
  } catch {
    return []
  }
}

/** A waiting fill goes straight into the box only while the draft still reads what it read when
 *  the request started; anything typed since wins and the fill is offered instead. */
export const fillAction = (base: string, current: string): 'put' | 'offer' => (current === base ? 'put' : 'offer')

/** Unsent attachments of a chat. Only small handles are kept (name, type and the engine asset's URL):
 *  the bytes sit in the engine's asset store, so a reload or a rebuild no longer drops them (#31). */
type DraftAttachment = { id: ID; name: string; type: string; url?: string }
export const attachmentsKey = (chatId: ID) => `chrysalis.roleplay.attachments.${chatId}`
/** Eight is what a message carries (the engine plugin cuts the rest). */
export const MAX_DRAFT_ATTACHMENTS = 8
const ASSET_URL = /^\/v1\/assets\/[a-f0-9]{64}$/i

export function readAttachmentDraft(chatId: ID): DraftAttachment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(attachmentsKey(chatId)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((a): a is DraftAttachment => !!a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.type === 'string' && typeof a.url === 'string' && ASSET_URL.test(a.url))
      .slice(0, MAX_DRAFT_ATTACHMENTS)
  } catch {
    return []
  }
}

/** Saves the ones that live in the asset store; a data-URL attachment (the upload failed) stays in memory only. */
export function writeAttachmentDraft(chatId: ID, list: DraftAttachment[]): void {
  try {
    const keep = list
      .filter((a) => typeof a.url === 'string' && ASSET_URL.test(a.url))
      .slice(0, MAX_DRAFT_ATTACHMENTS)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, url: a.url }))
    if (keep.length) localStorage.setItem(attachmentsKey(chatId), JSON.stringify(keep))
    else localStorage.removeItem(attachmentsKey(chatId))
  } catch { /* storage unavailable */ }
}

/** Drops the handles whose asset the engine no longer has (404); an unreachable engine keeps them. A GET, because the app bridge allows no HEAD. */
export async function liveAttachments(list: DraftAttachment[], head: (url: string) => Promise<{ status: number }> = (u) => fetch(u).then((r) => { void r.body?.cancel(); return r })): Promise<DraftAttachment[]> {
  const gone = await Promise.all(list.map(async (a) => {
    try { return (await head(a.url ?? '')).status === 404 } catch { return false }
  }))
  return list.filter((_, i) => !gone[i])
}
