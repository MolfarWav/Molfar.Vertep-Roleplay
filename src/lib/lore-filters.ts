import type { Character, Lorebook, LoreEntry } from '@/lib/types'
import { bookKind, type BookKind } from '@/lib/lore-usage'

/** The entry chips on a book's Entries tab, in the order they show. Counts come from `entryFilterCounts`. */
export const ENTRY_FILTERS = ['all', 'on', 'off', 'constant', 'keyed', 'vector', 'nokeys'] as const
export type EntryFilter = (typeof ENTRY_FILTERS)[number]

export function matchesEntryFilter(e: LoreEntry, f: EntryFilter): boolean {
  switch (f) {
    case 'on': return e.enabled
    case 'off': return !e.enabled
    case 'constant': return e.status === 'constant'
    case 'keyed': return e.status === 'normal'
    case 'vector': return e.status === 'vectorized'
    case 'nokeys': return needsKeys(e)
    default: return true
  }
}

/** A keyed entry with no keys never fires: the warning shown on its row. */
export function needsKeys(e: Pick<LoreEntry, 'status' | 'keys'>): boolean {
  return e.status === 'normal' && e.keys.length === 0
}

export function entryFilterCounts(entries: LoreEntry[]): Record<EntryFilter, number> {
  const out = {} as Record<EntryFilter, number>
  for (const f of ENTRY_FILTERS) out[f] = entries.filter((e) => matchesEntryFilter(e, f)).length
  return out
}

/** The book chips above the list. Global is its own flag; the others are how cards tie to the book. */
export const BOOK_FILTERS = ['all', 'global', 'own', 'shared', 'unlinked'] as const
export type BookFilter = (typeof BOOK_FILTERS)[number]

export function matchesBookFilter(book: Pick<Lorebook, 'globalActive'>, kind: BookKind, f: BookFilter): boolean {
  if (f === 'all') return true
  if (f === 'global') return book.globalActive
  return kind === f
}

export function bookFilterCounts(books: Pick<Lorebook, 'id' | 'globalActive'>[], characters: Character[]): Record<BookFilter, number> {
  const out = { all: books.length, global: 0, own: 0, shared: 0, unlinked: 0 } as Record<BookFilter, number>
  for (const b of books) {
    if (b.globalActive) out.global++
    const kind = bookKind(characters, b.id)
    out[kind]++
  }
  return out
}
