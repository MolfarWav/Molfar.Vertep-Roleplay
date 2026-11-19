import { BookLinks } from '@/components/lore/book-links'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { bookUsage } from '@/lib/lore-usage'
import type { Character } from '@/lib/types'

/** The Lorebook tab of a card: its own book, the extra books it links, and a picker for more. Links live ONLY on the card
 *  (`embeddedLorebookId`, `linkedLorebookIds`). The list itself is `BookLinks`, shared with the persona page. */
export function CharacterBooks({ c }: { c: Character }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const updateCharacter = useApp((s) => s.updateCharacter)
  return (
    <BookLinks
      value={{ ownId: c.embeddedLorebookId ?? null, linkedIds: c.linkedLorebookIds }}
      onChange={(next) => updateCharacter(c.id, { embeddedLorebookId: next.ownId, linkedLorebookIds: next.linkedIds })}
      ownerName={c.name}
      usedElsewhere={(id) => bookUsage(characters, id).users.filter((u) => u.id !== c.id).length}
      allowOwn
      testId="character-books"
      title={t('lore.cb.title')}
      empty={t('lore.cb.empty')}
    />
  )
}
