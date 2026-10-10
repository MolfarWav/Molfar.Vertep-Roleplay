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
