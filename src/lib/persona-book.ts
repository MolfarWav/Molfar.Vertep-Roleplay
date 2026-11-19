// A persona's own book (Molfar.Vertep#463). The persona links books by id (`lorebookIds`), and an id means nothing on another
// machine: a persona imported before its book kept the id and showed nothing. The own book travels inside the persona file instead,
// the way a card's `character_book` does: export writes it inline as `lorebook`, import makes it a book of the library again, under a
// new id and a name that does not clash, and links it. The persona keeps `ownLorebookId` for the one book that is its own; that id is
// also in `lorebookIds`, so the prompt engine, which reads `lorebookIds`, is unchanged.

import { isNativeBook, j, lorebookToEngine, nativeBookToEngine } from './engine'
import { useApp } from './store'
import type { Lorebook, Persona } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The own book of a persona, or null when it has none (or the id names a book the library does not have). */
export function ownBookOf(p: Pick<Persona, 'ownLorebookId'>, books: readonly Lorebook[]): Lorebook | null {
  return p.ownLorebookId ? books.find((b) => b.id === p.ownLorebookId) ?? null : null
}

/** The persona's books as the tab shows them: the own book (when the persona has one) and every other linked id. */
export function bookSetOf(p: Pick<Persona, 'ownLorebookId' | 'lorebookIds'>): { ownId: string | null; linkedIds: string[] } {
  const ownId = p.ownLorebookId && p.lorebookIds.includes(p.ownLorebookId) ? p.ownLorebookId : null
  return { ownId, linkedIds: p.lorebookIds.filter((id) => id !== ownId) }
}

/** What a change made on the tab writes back: the own id, and `lorebookIds` with the own book first and no id twice. */
export function bookPatchOf(next: { ownId: string | null; linkedIds: string[] }): Pick<Persona, 'ownLorebookId' | 'lorebookIds'> {
  const ids = [...new Set([...(next.ownId ? [next.ownId] : []), ...next.linkedIds])]
  return { ownLorebookId: next.ownId, lorebookIds: ids }
}

/** A persona as a file: the persona itself, and its own book inline when it has one and the library has it. `loadBook` gives the
 *  whole book (the start-up list holds summaries only). */
export async function personaForExport(p: Persona, loadBook: (id: string) => Promise<Lorebook | null>): Promise<Record<string, unknown>> {
  if (!p.ownLorebookId) return { ...p }
  const book = await loadBook(p.ownLorebookId)
  if (!book || book.stub) return { ...p }
  const { id: _id, ...engine } = lorebookToEngine(book) as unknown as Record<string, unknown>
  return { ...p, lorebook: engine }
}

/** `name`, or `name (2)`, `name (3)` ... when the library has a book of that name. */
export function freeBookName(name: string, taken: readonly string[]): string {
  const have = new Set(taken.map((n) => n.trim().toLowerCase()))
  const base = name.trim() || 'Book'
  if (!have.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!have.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`
}

/** An imported persona record with its own book inline: the record without the inline book, and the book ready to be stored under
 *  `newId` (named so it does not clash with `takenNames`). A record without a usable inline book comes back as it is, `book` null. */
export function adoptInlineBook(record: Record<string, unknown>, newId: string, takenNames: readonly string[]): { record: Record<string, unknown>; book: ReturnType<typeof nativeBookToEngine> | null } {
  const { lorebook, ...rest } = record
  if (!isObj(lorebook) || !isNativeBook(lorebook)) {
    // keep a stray `lorebook` that is not ours out of the stored persona, and an own id that points at nothing
    const { ownLorebookId: _own, ...plain } = rest
    return { record: lorebook === undefined ? { ...record } : plain, book: null }
  }
  const oldOwn = typeof rest.ownLorebookId === 'string' ? rest.ownLorebookId : ''
  const ids = Array.isArray(rest.lorebookIds) ? rest.lorebookIds.filter((x): x is string => typeof x === 'string' && x !== oldOwn) : []
  const book = nativeBookToEngine({ ...lorebook, name: freeBookName(typeof lorebook.name === 'string' ? lorebook.name : '', takenNames) }, newId)
  return { record: { ...rest, ownLorebookId: newId, lorebookIds: [newId, ...ids] }, book }
}

/** Saves an adopted book to the library (the engine stores it as is) and refreshes the list, so the persona that links it finds it. */
export async function storeInlineBook(id: string, book: NonNullable<ReturnType<typeof adoptInlineBook>['book']>): Promise<void> {
  await j(`/lorebooks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(book) })
  await useApp.getState().refreshLorebooks()
}
