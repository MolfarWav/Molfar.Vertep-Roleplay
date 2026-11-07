// Folders on a book's Entries tab. A folder is only a label: the entry's optional `folder` string, a path of up to three
// names joined by "/" ("Places/Taverns"). Nothing else knows about it: not the prompt engine, not the order of the
// entries, not their `group` (one entry fires per group). A folder exists while an entry carries its path (or a path
// below it), or while the book's optional `folders` list names it (so a new folder can start empty). A parent folder
// exists as soon as one below it does. There are no ids to keep in step: the path is the folder.
import type { LoreEntry } from './types'
import { estimateTokens } from './tokens'

/** One level's name: at most 60 characters. */
export const FOLDER_NAME_MAX = 60
export const FOLDER_SEP = '/'
/** How many levels a folder path may have. */
export const FOLDER_DEPTH_MAX = 3
/** The longest whole path (what a text box takes). */
export const FOLDER_PATH_MAX = FOLDER_NAME_MAX * FOLDER_DEPTH_MAX + FOLDER_DEPTH_MAX - 1

/** A folder path the way it is stored: levels joined by "/" (a backslash counts as a slash), each level one line of at
 *  most 60 characters, empty levels dropped, at most three levels. Empty means "no folder". */
export function cleanFolder(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name
    .split(/[\\/]+/)
    .map((part) => part.replace(/\s+/g, ' ').trim().slice(0, FOLDER_NAME_MAX).trim())
    .filter(Boolean)
    .slice(0, FOLDER_DEPTH_MAX)
    .join(FOLDER_SEP)
}

/** The last level of a path: what a folder's head shows. */
export const folderLeaf = (name: string): string => name.slice(name.lastIndexOf(FOLDER_SEP) + 1)
/** The path one level up; '' for a top folder. */
export const folderParent = (name: string): string => (name.includes(FOLDER_SEP) ? name.slice(0, name.lastIndexOf(FOLDER_SEP)) : '')
/** How many levels above a folder: 0 for a top folder. */
export const folderDepth = (name: string): number => (name ? name.split(FOLDER_SEP).length - 1 : 0)
/** Every path above a folder, the top one first: "A/B/C" gives ["A", "A/B"]. */
export function folderAncestors(name: string): string[] {
  const parts = name.split(FOLDER_SEP)
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join(FOLDER_SEP))
}
/** Whether `name` is `folder` or lies below it. */
export const inFolder = (name: string, folder: string): boolean => name === folder || name.startsWith(folder + FOLDER_SEP)
/** `name` after the folder `from` became `to` (a path below `from` follows it); other names are returned as they were. */
export const renamePath = (name: string, from: string, to: string): string =>
  name === from ? to : name.startsWith(from + FOLDER_SEP) ? cleanFolder(to ? to + name.slice(from.length) : name.slice(from.length + 1)) : name

/** The folder an entry sits in; '' = none. */
export const folderOf = (e: Pick<LoreEntry, 'folder'>): string => cleanFolder(e.folder)

const byLevel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
/** Level by level, so a folder sits right before the ones below it ("A", "A/x", "A2", not "A", "A2", "A/x"). */
const byName = (a: string, b: string) => {
  const x = a.split(FOLDER_SEP)
  const y = b.split(FOLDER_SEP)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = byLevel(x[i]!, y[i]!)
    if (c) return c
  }
  return x.length - y.length
}

/** Whether the book has a folder, an empty one included: only then does the Entries tab become a tree. */
export const hasFolders = (entries: readonly Pick<LoreEntry, 'folder'>[], listed: readonly string[] = []): boolean =>
  listed.some((n) => cleanFolder(n) !== '') || entries.some((e) => folderOf(e) !== '')

/** The book's `folders` list as it is stored: clean names, no repeats, a name that differs only in letter case from an
 *  earlier one dropped. */
export function cleanFolderList(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of list) {
    const name = cleanFolder(n)
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name) }
  }
  return out
}

/** The list with a folder added (nothing changes when it is there). */
export const addToFolderList = (list: readonly string[], name: string): string[] => cleanFolderList([...list, name])

/** The list after a rename; a folder below the renamed one follows it, and a new name an existing folder has joins the two. '' drops the name. */
export const renameInFolderList = (list: readonly string[], from: string, to: string): string[] =>
  cleanFolderList(list.map((n) => renamePath(n, from, to)))

/** The colours a folder may wear: the app's tone names (`ui/tone.ts`). A folder with none is amber (the default, so it is not listed). */
export const FOLDER_TONES = ['sky', 'emerald', 'violet', 'pink', 'teal', 'slate'] as const
export type FolderTone = (typeof FOLDER_TONES)[number]
export const isFolderTone = (v: unknown): v is FolderTone => typeof v === 'string' && (FOLDER_TONES as readonly string[]).includes(v)

/** The book's `folderTones` as it is stored: clean folder names, known tones only, a name that differs only in letter
 *  case from an earlier one dropped. */
export function cleanFolderTones(map: unknown): Record<string, FolderTone> {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {}
  const seen = new Set<string>()
  const out: Record<string, FolderTone> = {}
  for (const [k, v] of Object.entries(map)) {
    const name = cleanFolder(k)
    if (!name || !isFolderTone(v) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out[name] = v
  }
  return out
}

/** The colours after a folder is renamed and/or recoloured. `tone` is the colour the folder should have now (undefined =
 *  the default). The old name's colour goes; a new name an existing folder has takes `tone` too. */
export function setFolderTone(map: Readonly<Record<string, FolderTone>>, from: string, to: string, tone: FolderTone | undefined): Record<string, FolderTone> {
  // the folders below `from` keep their colour and follow it; the folder itself gets `tone`
  const moved = Object.entries(map).filter(([k]) => k !== from).map(([k, v]) => [renamePath(k, from, to), v] as const)
  // a colour is dropped only for a folder that is given a new one (a rename into an existing folder, or a removal that
  // hands the entries to the parent, leaves the target's own colour alone)
  const rest = Object.fromEntries(moved.filter(([k]) => !(to && tone && k.toLowerCase() === to.toLowerCase())))
  return cleanFolderTones(to && tone ? { ...rest, [to]: tone } : rest)
}

export interface FolderInfo {
  /** the folder's whole path ("Places/Taverns") */
  name: string
  /** every entry in the folder and in the folders below it */
  total: number
  /** how many of them are switched on */
  on: number
  tokens: number
}

/** The folders of a book, "00 - Core" before "05 - Characters" (numbers inside a name sort as numbers), a folder right
 *  before the ones below it. `listed` is the book's `folders`: those exist even with no entry in them. A folder that
 *  only has folders below it exists too. The counts include the folders below. */
export function listFolders(entries: readonly LoreEntry[], listed: readonly string[] = []): FolderInfo[] {
  const map = new Map<string, FolderInfo>()
  const get = (name: string): FolderInfo => {
    let f = map.get(name)
    if (!f) { f = { name, total: 0, on: 0, tokens: 0 }; map.set(name, f) }
    return f
  }
  for (const n of cleanFolderList(listed)) { get(n); for (const up of folderAncestors(n)) get(up) }
  for (const e of entries) {
    const name = folderOf(e)
    if (!name) continue
    const tokens = estimateTokens(e.content)
    for (const path of [...folderAncestors(name), name]) {
      const f = get(path)
      f.total++
      if (e.enabled) f.on++
      f.tokens += tokens
    }
  }
  return [...map.values()].sort((a, b) => byName(a.name, b.name))
}

export interface FolderGroup extends FolderInfo {
  /** the entries of this folder itself (not the folders below) that pass the search and filter, in the order they were given */
  entries: LoreEntry[]
}

export interface FolderTree {
  /** every folder to show, a parent before its children: the ones with a shown entry (or below them) and the listed empty ones */
  folders: FolderGroup[]
  /** shown entries with no folder */
  loose: LoreEntry[]
}

/** Splits the shown entries by folder. `all` is the whole book (the totals and tokens of a folder count every entry,
 *  not only the ones a search lets through); `shown` is what the search, filter and sort left, already in order.
 *  `empty` names the listed folders to show even with no shown entry (pass none while a search or filter is on). */
export function buildTree(all: readonly LoreEntry[], shown: readonly LoreEntry[], empty: readonly string[] = []): FolderTree {
  const info = new Map(listFolders(all, empty).map((f) => [f.name, f]))
  const by = new Map<string, LoreEntry[]>()
  // a parent shows when anything below it does
  const keep = (name: string, list: LoreEntry[]) => { by.set(name, list); for (const up of folderAncestors(name)) if (!by.has(up)) by.set(up, []) }
  for (const n of cleanFolderList(empty)) keep(n, [])
  const loose: LoreEntry[] = []
  for (const e of shown) {
    const name = folderOf(e)
    if (!name) { loose.push(e); continue }
    const list = by.get(name)
    if (list) list.push(e)
    else keep(name, [e])
  }
  const folders = [...by.entries()]
    .map(([name, entries]) => ({ ...(info.get(name) ?? { name, total: entries.length, on: 0, tokens: 0 }), entries }))
    .sort((a, b) => byName(a.name, b.name))
  return { folders, loose }
}

/** The entries (by id) put into a folder; '' takes them out of any folder. The array keeps its order. */
export function moveToFolder(entries: readonly LoreEntry[], ids: readonly string[], folder: string): LoreEntry[] {
  const name = cleanFolder(folder)
  const set = new Set(ids)
  return entries.map((e) => (set.has(e.id) ? withFolder(e, name) : e))
}

/** A folder renamed. A name another folder already has merges the two. */
export function renameFolder(entries: readonly LoreEntry[], from: string, to: string): LoreEntry[] {
  const name = cleanFolder(to)
  return entries.map((e) => (inFolder(folderOf(e), from) ? withFolder(e, renamePath(folderOf(e), from, name)) : e))
}

/** A folder taken away: its entries and the folders below it move up one level (a top folder's go to no folder). */
export const removeFolder = (entries: readonly LoreEntry[], name: string): LoreEntry[] => renameFolder(entries, name, folderParent(name))

/** Every entry of a folder, and of the folders below it, switched on or off. */
export function setFolderEnabled(entries: readonly LoreEntry[], name: string, enabled: boolean): LoreEntry[] {
  return entries.map((e) => (inFolder(folderOf(e), name) && e.enabled !== enabled ? { ...e, enabled } : e))
}

function withFolder(e: LoreEntry, name: string): LoreEntry {
  if (folderOf(e) === name && (e.folder ?? '') === name) return e
  const { folder: _old, ...rest } = e
  return name ? { ...rest, folder: name } : rest
}

/** A typed folder path as it is stored: a name an existing folder has (any letter case) is that folder, so typing
 *  "characters" files the entry under "Characters" instead of starting a second one; "characters/npc" goes under it. */
export function resolveFolderName(typed: string, existing: readonly string[]): string {
  const parts = cleanFolder(typed).split(FOLDER_SEP).filter(Boolean)
  const known = new Set<string>()
  for (const n of existing) { known.add(n); for (const up of folderAncestors(n)) known.add(up) }
  // level by level: a path that starts with a folder's name in another letter case goes under that folder
  let path = ''
  for (const part of parts) {
    const want = (path ? path + FOLDER_SEP : '') + part
    const hit = [...known].find((n) => n.toLowerCase() === want.toLowerCase())
    path = hit ?? want
  }
  return path
}
