// Tags marked "folder" in the tag manager (Tag.asFolder) show as a strip above the character list.
// A card can carry several folder tags, so it sits in several folders; "All" hides nothing.

import type { Tag } from './types'

/** The tags the user marked as folders, in the tag manager's order. */
export function folderTags(tags: readonly Tag[]): Tag[] {
  return tags.filter((t) => t.asFolder && t.name.trim()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/** The chosen folder if its tag is still a folder, else null (= All): an unmarked or renamed tag resets the choice. */
export function resolveFolder(active: string | null, folders: readonly Pick<Tag, 'name'>[]): string | null {
  return active !== null && folders.some((f) => f.name === active) ? active : null
}

/** Whether a card shows under the chosen folder (null = All: every card). */
export function inFolder(card: { tags: readonly string[] }, folder: string | null): boolean {
  return folder === null || card.tags.includes(folder)
}

/** How many cards carry each folder's tag. */
export function folderCounts(cards: readonly { tags: readonly string[] }[], folders: readonly Pick<Tag, 'name'>[]): Map<string, number> {
  const counts = new Map(folders.map((f) => [f.name, 0]))
  for (const c of cards) for (const name of new Set(c.tags)) if (counts.has(name)) counts.set(name, counts.get(name)! + 1)
  return counts
}

/** A card with no folder tag: it shows only under "No folder". */
export function noFolder(card: { tags: readonly string[] }, folders: readonly Pick<Tag, 'name'>[]): boolean {
  return !card.tags.some((t) => folders.some((f) => f.name === t))
}

/** The card's tags after a move to a folder. A folder is added and the others stay (a card can sit in several);
 *  null is "No folder" and takes every folder tag off. A tag already there is not doubled. */
export function moveToFolder(tags: readonly string[], folder: string | null, folders: readonly Pick<Tag, 'name'>[]): string[] {
  if (folder === null) return tags.filter((t) => !folders.some((f) => f.name === t))
  return tags.includes(folder) ? [...tags] : [...tags, folder]
}

/** The card's tags without one folder's tag (the card stays in its other folders). */
export function removeFromFolder(tags: readonly string[], folder: string): string[] {
  return tags.filter((t) => t !== folder)
}
