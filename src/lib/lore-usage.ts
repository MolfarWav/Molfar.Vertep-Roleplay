import type { Character, ID } from '@/lib/types'

/** Which cards attach a book. Links live ONLY on the card: `embeddedLorebookId`
 *  (its own book) and `linkedLorebookIds` (more books). */
export interface BookUsage {
  /** cards that hold the book as their own */
  owners: Character[]
  /** every card that uses it, own or linked */
  users: Character[]
}

export function bookUsage(characters: Character[], bookId: ID): BookUsage {
  const owners = characters.filter((c) => c.embeddedLorebookId === bookId)
  const users = characters.filter((c) => c.embeddedLorebookId === bookId || c.linkedLorebookIds.includes(bookId))
  return { owners, users }
}

/** The own book of exactly one card that nobody else uses: it may be deleted with the card. */
export function ownBookOnlyFor(characters: Character[], characterId: ID): ID | null {
  const own = characters.find((c) => c.id === characterId)?.embeddedLorebookId ?? null
  if (!own) return null
  const { users } = bookUsage(characters, own)
  return users.every((c) => c.id === characterId) ? own : null
}

/** How a book is tied to cards, for the icon in the list and the filter: the own book of one card, a book several
 *  cards use (or one card links), or one no card uses. Global is a separate flag on the book (it can also be on a card). */
export type BookKind = 'own' | 'shared' | 'unlinked'
export function bookKind(characters: Character[], bookId: ID): BookKind {
  const { owners, users } = bookUsage(characters, bookId)
  if (users.length === 0) return 'unlinked'
  return owners.length === 1 && users.length === 1 ? 'own' : 'shared'
}

/** The short line that says who uses a book: its own card, a count of cards, or none. `key` is an i18n key. */
export function bookUsageLabel(characters: Character[], bookId: ID): { key: 'lore.use.none' | 'lore.use.own' | 'lore.use.cardsOne' | 'lore.use.cards'; vars: Record<string, string | number>; muted: boolean } {
  const { owners, users } = bookUsage(characters, bookId)
  if (users.length === 0) return { key: 'lore.use.none', vars: {}, muted: true }
  if (owners.length === 1 && users.length === 1) return { key: 'lore.use.own', vars: { name: owners[0]!.name }, muted: false }
  return { key: users.length === 1 ? 'lore.use.cardsOne' : 'lore.use.cards', vars: { n: users.length }, muted: false }
}

/** The cards on the Used by tab: every card that holds the book as its own or links it. */
export function usedByRows(characters: Character[], bookId: ID): { id: ID; name: string; own: boolean }[] {
  return bookUsage(characters, bookId).users.map((c) => ({ id: c.id, name: c.name, own: c.embeddedLorebookId === bookId }))
}
