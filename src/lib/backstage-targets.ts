// Which Backstage places the curtain lists for one chat (#448, T3). Pure, no store: a test reads it without rendering.

export type BackstageKey = 'card' | 'preset' | 'book' | 'library' | 'world' | 'fired'

export interface BackstageTarget {
  /** Unique within the menu (a lorebook carries its id). */
  id: string
  key: BackstageKey
  /** The object the drawer opens on, when there is one. */
  objectId?: string
  objectName?: string
}

/** At most this many lorebooks get a row of their own; the rest are one click away in the Lorebooks section. */
export const MAX_BOOK_ROWS = 3

export interface TargetInput {
  character: { id: string; name: string; embeddedLorebookId?: string | null; linkedLorebookIds?: string[] }
  preset: { id: string; name: string } | null | undefined
  lorebooks: { id: string; name: string }[]
}

/** What the curtain lists for one chat, in the order a maker reaches for them. The card and the preset always show;
 *  a lorebook row only for a book that exists; Library, World and What fired are about this chat itself. */
export function backstageTargets({ character, preset, lorebooks }: TargetInput): BackstageTarget[] {
  const out: BackstageTarget[] = [{ id: 'card', key: 'card', objectId: character.id, objectName: character.name }]
  if (preset) out.push({ id: 'preset', key: 'preset', objectId: preset.id, objectName: preset.name })
  const ids = [character.embeddedLorebookId, ...(character.linkedLorebookIds ?? [])].filter((x): x is string => !!x)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id) || seen.size >= MAX_BOOK_ROWS) continue
    const book = lorebooks.find((b) => b.id === id)
    if (!book) continue
    seen.add(id)
    out.push({ id: `book:${id}`, key: 'book', objectId: id, objectName: book.name })
  }
  out.push({ id: 'fired', key: 'fired' }, { id: 'library', key: 'library' }, { id: 'world', key: 'world' })
  return out
}
