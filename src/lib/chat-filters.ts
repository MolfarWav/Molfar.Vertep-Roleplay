// Persona and character filters for chat lists (Home, Chats). Pure: they only
// need the fields below, so the list code and the tests share one definition.

export const ALL = 'all'

export interface FilterChat { characterId: string; personaId: string | null }
export interface FilterCharacter { id: string; name: string; isGroup?: boolean; members?: string[] }
export interface FilterPersona { id: string; name: string }

export interface ChatFilter {
  /** a persona id, or ALL */
  personaId: string
  /** a character id, or ALL */
  characterId: string
}

export const NO_FILTER: ChatFilter = { personaId: ALL, characterId: ALL }

export const isFiltering = (f: ChatFilter): boolean => f.personaId !== ALL || f.characterId !== ALL

/** Does the chat belong to this character? A group chat belongs to every member. */
export function chatHasCharacter(chat: FilterChat, characters: FilterCharacter[], characterId: string): boolean {
  if (characterId === ALL || chat.characterId === characterId) return true
  const owner = characters.find((c) => c.id === chat.characterId)
  return !!owner?.isGroup && (owner.members ?? []).includes(characterId)
}

export function chatMatches(chat: FilterChat, characters: FilterCharacter[], f: ChatFilter): boolean {
  if (f.personaId !== ALL && chat.personaId !== f.personaId) return false
  return chatHasCharacter(chat, characters, f.characterId)
}

export function filterChats<T extends FilterChat>(chats: T[], characters: FilterCharacter[], f: ChatFilter): T[] {
  return isFiltering(f) ? chats.filter((c) => chatMatches(c, characters, f)) : chats
}

/** The personas that have at least one chat, in the personas list's order. */
export function personaOptions<P extends FilterPersona>(chats: FilterChat[], personas: P[]): P[] {
  const used = new Set(chats.map((c) => c.personaId).filter((x): x is string => !!x))
  return personas.filter((p) => used.has(p.id))
}

/** The single (non-group) characters that have at least one chat, directly or as a group member. */
export function characterOptions<C extends FilterCharacter>(chats: FilterChat[], characters: C[]): C[] {
  return characters.filter((c) => !c.isGroup && chats.some((chat) => chatHasCharacter(chat, characters, c.id)))
}
