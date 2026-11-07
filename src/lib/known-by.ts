// Who-knows names of a Library fact (`knownBy`). An entry is a person's name, or a group token
// "group:<slug>" (for example "group:guild-of-ravens") that means every member of that group.
// The client never shows the raw token: it turns the slug into words and adds "(group)".
// The raw token is what is stored and sent.

import type { MsgKey, Vars } from '@/lib/i18n'

type T = (key: MsgKey, vars?: Vars) => string

/** A group token, as the engine stores it. */
export const isGroupToken = (n: string): boolean => /^group:\S/i.test(n.trim())

/** "group:guild-of-ravens" -> "Guild of ravens" (the client does not know the group's real name). */
export function groupWords(token: string): string {
  const words = token.trim().slice('group:'.length).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One entry as the user reads it: a name stays, a token becomes "Guild of ravens (group)". */
export function knownName(n: string, t: T): string {
  return isGroupToken(n) ? t('lit.groupLabel', { name: groupWords(n) }) : n
}

/** The entries as one line: "Mira, Guild of ravens (group)". */
export function knownNames(list: string[], t: T): string {
  return list.map((n) => knownName(n, t)).join(', ')
}

/** One entry as typed in the editor: a token is shown the way it is typed, "group: Guild of ravens". */
export const knownEditorName = (n: string): string => (isGroupToken(n) ? `group: ${groupWords(n)}` : n)

/**
 * The editor's comma-separated text back to entries. An entry that is the unchanged editor form of
 * a token the fact already has goes back as that token, so saving never rewrites a group's slug;
 * anything else is sent as typed ("group: Guild of Ravens" is turned into a token by the engine).
 */
export function parseKnownInput(input: string, original: string[] | 'all' | undefined): string[] {
  const back = new Map<string, string>()
  if (Array.isArray(original)) for (const n of original) if (isGroupToken(n)) back.set(knownEditorName(n).toLowerCase(), n)
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => back.get(s.toLowerCase()) ?? s)
}
