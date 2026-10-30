// Backgrounds of a world: file names, tags, quick styles, the pick by scene, the WebP conversion of the
// existing library. Pure helpers and small fetches; the store is passed in, never imported (the store
// calls `applySceneBackground`).

import { j } from '@/lib/engine'
import { backgroundBlob, storeBackground } from '@/lib/webp'
import type { BackgroundItem, Chat, ID } from '@/lib/types'

/** Quick styles for a set's direction: a chip adds its words to the field (English: they go to the image model). */
export const STYLE_CHIPS = [
  { id: 'painterly', words: 'painterly, visible brush strokes' },
  { id: 'anime', words: 'anime background art' },
  { id: 'photo', words: 'photorealistic photograph' },
  { id: 'watercolour', words: 'soft watercolour' },
  { id: 'darkfantasy', words: 'dark fantasy, moody' },
  { id: 'pixel', words: 'pixel art' },
] as const

/** Places a player often wants besides the world's own: label key suffix = id, the English words go to the planner. */
export const PLACE_CHIPS = [
  { id: 'tavern', words: 'tavern' },
  { id: 'castle', words: 'castle' },
  { id: 'house', words: 'modern house' },
  { id: 'school', words: 'school' },
] as const

/** Add words to a direction field once, comma-separated. */
export function addWords(field: string, words: string): string {
  const cur = field.trim()
  if (cur.toLowerCase().includes(words.toLowerCase())) return field
  return cur ? `${cur.replace(/[,\s]+$/, '')}, ${words}` : words
}

/** An English snake_case file name: lower case, letters and digits, single underscores. */
export function toSnake(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export const isSnake = (name: string) => /^[a-z0-9]+(_[a-z0-9]+)*$/.test(name)

/** `name`, or `name_2`, `name_3`... when taken (case-insensitive). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((n) => n.toLowerCase()))
  if (!set.has(name.toLowerCase())) return name
  for (let i = 2; i < 1000; i++) if (!set.has(`${name}_${i}`.toLowerCase())) return `${name}_${i}`
  return `${name}_${Date.now()}`
}

/** Tags from a comma field: lower case, no repeats, at most 8. */
export function parseTags(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(',')) {
    const t = raw.trim().toLowerCase().slice(0, 40)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 8)
}

/** The most tags a picture keeps. */
export const MAX_TAGS = 8

/** `first` then `rest`: lower case, no repeats, at most 8. */
export function mergeTags(first: string[], rest: string[] = []): string[] {
  const out: string[] = []
  for (const raw of [...first, ...rest]) {
    const t = raw.trim().toLowerCase().slice(0, 40)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, MAX_TAGS)
}

/** A place's name and aliases as tags, so the Dashboard's tag match finds a picture made or bound for it. */
export const placeTags = (name: string, aliases: string[] = []): string[] => mergeTags([name], aliases)

/** The library image a place record's `background` names: null when none is set or the picture is gone (deleted). */
export function pictureOf(id: string | null | undefined, backgrounds: BackgroundItem[]): BackgroundItem | null {
  if (!id) return null
  const b = backgrounds.find((x) => x.id === id)
  return b && b.type === 'image' ? b : null
}

/** The picture bound to the scene's place (`GET /world/here` `background`), when it is still in the library. */
export function sceneBackgroundId(here: { background?: string | null } | null, backgrounds: BackgroundItem[]): string | null {
  return pictureOf(here?.background, backgrounds)?.id ?? null
}

/** Names that are not snake_case look unnamed ("IMG_2031", "Screenshot 12"): the vision pass offers them first. */
export const looksUnnamed = (name: string) => !isSnake(name)

/** The background of this folder with this name (case-insensitive). */
export function findByName(backgrounds: BackgroundItem[], folderId: ID, name: string): BackgroundItem | undefined {
  const n = name.trim().toLowerCase()
  return n ? backgrounds.find((b) => b.folderId === folderId && b.name.trim().toLowerCase() === n) : undefined
}

/**
 * The Dashboard sensor named an image of the chat's folder: make it the chat's background. Called after
 * each Dashboard update; nothing else changes the background by itself. A picture bound to the scene's place
 * (World > Places) wins and needs no folder; else the newest snapshot with a `background` that is in the
 * folder; no pick or an unknown name changes nothing. A bound picture that left the library is ignored.
 */
export async function applySceneBackground(
  chatId: ID,
  s: { chats: Chat[]; backgrounds: BackgroundItem[]; updateChat: (id: ID, patch: Partial<Chat>) => void },
): Promise<void> {
  const chat = s.chats.find((c) => c.id === chatId)
  const auto = chat?.autoBackground
  if (!chat || !auto?.on) return
  try {
    const id = sceneBackgroundId(await j<{ background?: string | null }>(`/world/here?chatId=${encodeURIComponent(chatId)}`), s.backgrounds)
    if (id) {
      if (chat.backgroundId !== id) s.updateChat(chatId, { backgroundId: id })
      return
    }
  } catch {
    // no World DM or no answer: the sensor's pick below
  }
  if (!auto.folderId) return
  let name = ''
  try {
    const r = await j<{ state: { snapshots?: Record<string, { background?: unknown }> } | null; current: string | null }>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}`)
    const b = r.current ? r.state?.snapshots?.[r.current]?.background : null
    name = typeof b === 'string' ? b : ''
  } catch {
    return
  }
  const bg = findByName(s.backgrounds, auto.folderId, name)
  if (bg && chat.backgroundId !== bg.id) s.updateChat(chatId, { backgroundId: bg.id })
}

/** A picture scaled so its longest side is `max`, as base64 JPEG, for the vision model. */
export async function downscaleForVision(blob: Blob, max = 768): Promise<{ data: string; mimeType: string }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const url = canvas.toDataURL('image/jpeg', 0.8)
  return { data: url.slice(url.indexOf(',') + 1), mimeType: 'image/jpeg' }
}

/** Backgrounds a "Convert to WebP" would look at: data URLs that are not WebP or GIF (stored assets are already WebP or were kept as they are). */
export function convertCandidates(backgrounds: BackgroundItem[]): BackgroundItem[] {
  return backgrounds.filter((b) => {
    if (b.type !== 'image' || !b.url) return false
    return b.url.startsWith('data:') && !/^data:image\/(webp|gif)/i.test(b.url)
  })
}

export interface ConvertReport { converted: number; kept: number; failed: number; saved: number }

/** One image: stored again as WebP when that is smaller. Returns the bytes saved, or null when kept as it is. */
export async function convertOne(b: BackgroundItem): Promise<{ url: string; saved: number } | null> {
  const blob = await backgroundBlob(b.url)
  if (blob.type === 'image/webp' || blob.type === 'image/gif') return null
  const r = await storeBackground(blob, b.name)
  if (!r.converted) return null
  return { url: r.url, saved: Math.max(0, blob.size - r.size) }
}

export const formatBytes = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** A group of pictures from one folder (or from none) offered by "Add from existing". */
export interface ExistingGroup { folderId: ID | null; name: string; items: BackgroundItem[] }

/**
 * The pictures a folder could take from elsewhere: every image of the other folders (and the ones in no
 * folder), minus those whose file is already in the target folder, grouped by folder (named folders by
 * name, "no folder" last), narrowed by a search over name and tags. Empty groups are dropped.
 */
export function existingGroups(
  backgrounds: BackgroundItem[],
  folders: { id: ID; name: string; scope?: string }[],
  targetFolderId: ID,
  query: string,
  noFolderName: string,
): ExistingGroup[] {
  const here = new Set(backgrounds.filter((b) => b.folderId === targetFolderId).map((b) => b.url))
  const q = query.trim().toLowerCase()
  const match = (b: BackgroundItem) => !q || b.name.toLowerCase().includes(q) || (b.tags ?? []).some((t) => t.toLowerCase().includes(q))
  const usable = backgrounds.filter((b) => b.type === 'image' && b.folderId !== targetFolderId && !here.has(b.url) && match(b))
  const named = folders
    .filter((f) => f.id !== targetFolderId && (f.scope === undefined || f.scope === 'backgrounds'))
    .map((f) => ({ folderId: f.id as ID | null, name: f.name, items: usable.filter((b) => b.folderId === f.id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const loose = { folderId: null as ID | null, name: noFolderName, items: usable.filter((b) => !b.folderId || !folders.some((f) => f.id === b.folderId)) }
  return [...named, loose].filter((g) => g.items.length > 0)
}

/** What copying pictures into a folder creates: the same file under a name that is free there, tags and fitting kept. */
export function copiesInto(
  picked: BackgroundItem[],
  backgrounds: BackgroundItem[],
  targetFolderId: ID,
): { name: string; url: string; tags?: string[]; fitting: BackgroundItem['fitting'] }[] {
  const taken = new Set(backgrounds.filter((b) => b.folderId === targetFolderId).map((b) => b.name))
  const seenUrls = new Set(backgrounds.filter((b) => b.folderId === targetFolderId).map((b) => b.url))
  const out: { name: string; url: string; tags?: string[]; fitting: BackgroundItem['fitting'] }[] = []
  for (const b of picked) {
    if (seenUrls.has(b.url)) continue
    const name = uniqueName(b.name, taken)
    taken.add(name)
    seenUrls.add(b.url)
    out.push({ name, url: b.url, ...(b.tags?.length ? { tags: [...b.tags] } : {}), fitting: b.fitting })
  }
  return out
}

/**
 * Does a picture answer a search? Every word of the query has to appear in its name, one of its tags or the
 * name of its folder (a chat's or a world's folder carries that name), case-insensitive.
 */
export function backgroundMatches(b: BackgroundItem, folderName: string | undefined, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [b.name, folderName ?? '', ...(b.tags ?? [])].map((s) => s.toLowerCase())
  return words.every((w) => hay.some((h) => h.includes(w)))
}

/** Pictures of every folder (and of none) that answer a search, in library order. */
export function searchBackgrounds(backgrounds: BackgroundItem[], folders: { id: ID; name: string }[], query: string): BackgroundItem[] {
  const nameOf = new Map(folders.map((f) => [f.id, f.name]))
  return backgrounds.filter((b) => backgroundMatches(b, b.folderId ? nameOf.get(b.folderId) : undefined, query))
}

/**
 * The picker's groups for binding a picture to a place: the world's own folder first, then the other folders
 * (named ones by name, pictures in no folder last), every group narrowed by a search over name, tags and folder.
 * A file that is in the world's folder is not offered a second time from another one.
 */
export function pickerGroups(
  backgrounds: BackgroundItem[],
  folders: { id: ID; name: string; scope?: string }[],
  ownFolderId: ID | null,
  ownName: string,
  query: string,
  noFolderName: string,
): ExistingGroup[] {
  const own: ExistingGroup[] = []
  if (ownFolderId) {
    const items = backgrounds.filter((b) => b.type === 'image' && b.folderId === ownFolderId && backgroundMatches(b, ownName, query))
    if (items.length) own.push({ folderId: ownFolderId, name: ownName, items })
  }
  return [...own, ...existingGroups(backgrounds, folders, ownFolderId ?? '', query, noFolderName)]
}
