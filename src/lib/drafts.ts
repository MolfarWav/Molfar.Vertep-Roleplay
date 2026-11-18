import type { ID } from './types'

/** Unsent composer text lives under a per-chat key so a reload, rebuild, or
 *  chat switch never eats a half-written thought. */
export const draftKey = (chatId: ID) => `chrysalis.roleplay.draft.${chatId}`

/** The draft is saved a moment after the last key, not on every key (Molfar.Vertep#418). In the app frame each
 *  localStorage write is posted to the shell, which parses and rewrites the app's whole storage, and the frame rewrites
 *  a copy of that storage into its own address: with a large storage that cost about 0.4 s per letter on a desktop
 *  browser, and a phone is slower. Typing waits for nothing now; the text is written when you stop, leave the box,
 *  switch chat, send, hide the page, or before the app reloads itself. */
export const DRAFT_SAVE_DELAY_MS = 600

let pending: { chatId: ID; text: string } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function commitDraft(chatId: ID, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(chatId), text)
    else localStorage.removeItem(draftKey(chatId))
  } catch { /* storage unavailable */ }
}

/** Write what is waiting, now. Safe to call at any time. */
export function flushDraft(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  const p = pending
  pending = null
  if (p) commitDraft(p.chatId, p.text)
}

/** Save a chat's draft: an empty one at once (a sent or cleared box must not leave the old text behind), text after a pause. */
export function saveDraft(chatId: ID, text: string): void {
  if (pending && pending.chatId !== chatId) flushDraft()
  if (!text) {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = null
    commitDraft(chatId, '')
    return
  }
  pending = { chatId, text }
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(flushDraft, DRAFT_SAVE_DELAY_MS)
}

/** Forget a chat's draft, saved or waiting. */
export function discardDraft(chatId: ID): void {
  saveDraft(chatId, '')
}

export const readDraft = (chatId: ID): string => {
  if (pending && pending.chatId === chatId) return pending.text
  try { return localStorage.getItem(draftKey(chatId)) ?? '' } catch { return '' }
}

// Whatever leaves the page keeps the text: a hidden tab may be dropped without another event.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', flushDraft)
  window.addEventListener('beforeunload', flushDraft)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft() })
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
