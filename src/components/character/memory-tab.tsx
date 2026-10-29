import type { Character } from '@/lib/types'
import { MemoryPanel } from './memory-panel'

/** The Memory tab of the card editor: the stories the character remembers, importing a chat into
 *  that memory, and how much room the memory takes in new chats. Changes act at once (like the
 *  favourite star and the Soul tab); this tab has no draft and no Save. The body is `MemoryPanel`,
 *  which a persona and a saved world use too. */
export function MemoryTab({ c }: { c: Character }) {
  return <MemoryPanel owner={{ kind: 'card', id: c.id, name: c.name }} card={c} />
}
