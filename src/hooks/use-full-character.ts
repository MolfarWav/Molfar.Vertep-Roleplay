import { useEffect } from 'react'
import { useApp, useCharacter } from '@/lib/store'
import type { Character, ID } from '@/lib/types'

/** A character for a screen that shows or edits the whole card: the start-up list holds only a
 *  summary (`stub`), so this loads the card. `loading` stays true until it is whole. */
export function useFullCharacter(charId: ID | null): { character: Character | null; loading: boolean } {
  const character = useCharacter(charId)
  const loadCharacter = useApp((s) => s.loadCharacter)
  const stub = !!character?.stub && !character.isGroup
  useEffect(() => {
    if (charId && stub) void loadCharacter(charId)
  }, [charId, stub, loadCharacter])
  return { character, loading: stub }
}
