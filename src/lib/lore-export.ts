// Exporting lorebooks: one book as a JSON file, or every book in one zip (a book per JSON file, the shape the import
// reads back). A book listed as a summary (`stub`) is loaded first: its entries are not in the list.
import { strToU8, zipSync } from 'fflate'
import { saveFile } from './export'
import { downloadJson } from './interop'
import type { Lorebook } from './types'

/** What a book file carries: the book itself, without its revision and with no link to this install's cards or chats. */
export function bookExportShape(book: Lorebook) {
  const { rev: _rev, stub: _stub, ...rest } = book as Lorebook & { stub?: true }
  return { ...rest, linkedCharacterIds: [], isEmbedded: false, globalActive: false }
}

export function exportOneBook(book: Lorebook) {
  downloadJson(bookExportShape(book), book.name || 'lorebook')
}

/** File names for the zip: safe characters, one per book, a repeated name gets -2, -3... */
export function zipNames(books: Pick<Lorebook, 'name'>[]): string[] {
  const seen = new Map<string, number>()
  return books.map((b) => {
    const base = (b.name || 'lorebook').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'lorebook'
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1
    seen.set(base.toLowerCase(), n)
    return `${n > 1 ? `${base}-${n}` : base}.json`
  })
}

/** The zip's bytes for these (fully loaded) books. */
export function zipBooks(books: Lorebook[]): Uint8Array {
  const names = zipNames(books)
  const files: Record<string, Uint8Array> = {}
  books.forEach((b, i) => { files[names[i]!] = strToU8(JSON.stringify(bookExportShape(b), null, 2)) })
  return zipSync(files, { level: 6 })
}

/**
 * Every book in one zip. `load` returns a book with its entries (null: it could not be read, and it is skipped and
 * counted). Resolves with how many books went in and how many could not be read.
 */
export async function exportAllBooks(books: Lorebook[], load: (id: string) => Promise<Lorebook | null>): Promise<{ saved: number; skipped: number }> {
  const full: Lorebook[] = []
  let skipped = 0
  for (const b of books) {
    const book = b.stub ? await load(b.id).catch(() => null) : b
    if (book && !book.stub) full.push(book)
    else skipped++
  }
  if (full.length) saveFile(new Blob([zipBooks(full) as BlobPart], { type: 'application/zip' }), 'lorebooks.zip')
  return { saved: full.length, skipped }
}
