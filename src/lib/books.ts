// Snapshot books (#184): a story saved on the Data Bank shelf. Built by the Litopys plugin from a chat's record
// (`/litopys/book`), listed and edited through the shelf's own routes (`/databank`). Pure types and thin calls.
import { j } from '@/lib/engine'

export interface BookRef {
  id: string
  name: string
  family: string
  version: number
  enabled: boolean
  takenAt: number
  readers: string[]
}

/** What saving a chat as a book would hold, and the books already made from it. */
export interface BookPreview {
  chatId: string
  title: string
  chapters: number
  arcs: number
  facts: number
  /** a rough size in tokens (four characters a token) */
  tokens: number
  /** the record was longer than a book holds, the rest was left out */
  capped: boolean
  /** the chats that continue this one: offered as readers first */
  readers: string[]
  books: BookRef[]
}

export interface BookPassage {
  i: number
  kind: 'arc' | 'chapter' | 'fact'
  ref: string
  text: string
  knownBy?: 'all' | string[]
  cast?: string[]
}

export const loadBookPreview = (chatId: string): Promise<BookPreview> => j<BookPreview>(`/litopys/book?chatId=${encodeURIComponent(chatId)}`)

export const saveBook = (body: { chatId: string; readers: string[]; name?: string; update?: string }): Promise<{ id: string; name: string; version: number; chunks: number; books: BookRef[] }> =>
  j('/litopys/book', { method: 'POST', body: JSON.stringify(body) })

export const loadBookPassages = (id: string): Promise<{ file: { id: string; name: string; chunks: BookPassage[] } }> => j(`/databank/${encodeURIComponent(id)}`)

const patch = (id: string, body: Record<string, unknown>) => j<{ ok: boolean }>(`/databank/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
export const editPassage = (id: string, i: number, text: string) => patch(id, { chunk: { i, text } })
export const dropPassage = (id: string, i: number) => patch(id, { chunk: { i, drop: true } })
export const setBookReaders = (id: string, scopeChatIds: string[]) => patch(id, { scopeChatIds })

/** Who a book's passage is for, as one short line: the names, or "everyone". */
export function passageWho(p: BookPassage): string[] | 'all' {
  const list = p.kind === 'fact' ? p.knownBy : p.cast
  return Array.isArray(list) && list.length ? list : 'all'
}
