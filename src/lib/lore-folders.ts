// Folders on a book's Entries tab. A folder is only a label: the entry's optional `folder` string (one level). Nothing
// else knows about it: not the prompt engine, not the order of the entries, not their `group` (one entry fires per
// group). A folder exists while an entry carries its name, or while the book's optional `folders` list names it (so
// a new folder can start empty). There are no ids to keep in step: the name is the folder.
import type { LoreEntry } from './types'
import { estimateTokens } from './tokens'

export const FOLDER_NAME_MAX = 60

/** A name the way it is stored: one line, no slash (a later nested folder may use it as the path separator), at most
 *  60 characters. Empty means "no folder". */
export function cleanFolder(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name.replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, FOLDER_NAME_MAX).trim()
}

/** The folder an entry sits in; '' = none. */
export const folderOf = (e: Pick<LoreEntry, 'folder'>): string => cleanFolder(e.folder)

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

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

/** The list after a rename; a new name an existing folder has joins the two. '' drops the name. */
export const renameInFolderList = (list: readonly string[], from: string, to: string): string[] =>
  cleanFolderList(list.map((n) => (n === from ? to : n)))

export interface FolderInfo {
  name: string
  /** every entry in the folder */
  total: number
  /** how many of them are switched on */
  on: number
  tokens: number
}

/** The folders of a book, "00 - Core" before "05 - Characters" (numbers inside a name sort as numbers). `listed` is
 *  the book's `folders`: those exist even with no entry in them. */
export function listFolders(entries: readonly LoreEntry[], listed: readonly string[] = []): FolderInfo[] {
  const map = new Map<string, FolderInfo>()
  for (const n of cleanFolderList(listed)) map.set(n, { name: n, total: 0, on: 0, tokens: 0 })
  for (const e of entries) {
    const name = folderOf(e)
    if (!name) continue
    const f = map.get(name) ?? { name, total: 0, on: 0, tokens: 0 }
    f.total++
    if (e.enabled) f.on++
    f.tokens += estimateTokens(e.content)
    map.set(name, f)
  }
  return [...map.values()].sort((a, b) => byName(a.name, b.name))
}

export interface FolderGroup extends FolderInfo {
  /** the entries that pass the search and filter, in the order they were given */
  entries: LoreEntry[]
}

export interface FolderTree {
  /** folders that have at least one shown entry */
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
  for (const n of cleanFolderList(empty)) by.set(n, [])
  const loose: LoreEntry[] = []
  for (const e of shown) {
    const name = folderOf(e)
    if (!name) { loose.push(e); continue }
    const list = by.get(name)
    if (list) list.push(e)
    else by.set(name, [e])
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
  return entries.map((e) => (folderOf(e) === from ? withFolder(e, name) : e))
}

/** A folder taken away: its entries stay, without a folder. */
export const removeFolder = (entries: readonly LoreEntry[], name: string): LoreEntry[] => renameFolder(entries, name, '')

/** Every entry of a folder switched on or off. */
export function setFolderEnabled(entries: readonly LoreEntry[], name: string, enabled: boolean): LoreEntry[] {
  return entries.map((e) => (folderOf(e) === name && e.enabled !== enabled ? { ...e, enabled } : e))
}

function withFolder(e: LoreEntry, name: string): LoreEntry {
  if (folderOf(e) === name && (e.folder ?? '') === name) return e
  const { folder: _old, ...rest } = e
  return name ? { ...rest, folder: name } : rest
}

/** A typed folder name as it is stored: a name an existing folder has (any letter case) is that folder, so typing
 *  "characters" files the entry under "Characters" instead of starting a second one. */
export function resolveFolderName(typed: string, existing: readonly string[]): string {
  const name = cleanFolder(typed)
  const low = name.toLowerCase()
  return existing.find((n) => n.toLowerCase() === low) ?? name
}
