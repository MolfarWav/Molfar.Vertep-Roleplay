// The chat's one switch for the notes of all its agents (DESIGN 17.5): which agents it reaches and which state it shows.
// Pure, so a test can hold it.

import type { AgentInfo, ChatAgentItem } from './agents'

/** The place that keeps a note out of the chat: it is only in the log line under the reply. */
export const QUIET_PLACE = 'log'

/**
 * The agents of the chat whose notes the switch moves: those that make notes. An agent that also offers choices is left alone,
 * because the chat's place moves ALL of an agent's results and its choices would vanish from the bar.
 */
export function noteAgentIds(items: ChatAgentItem[], infos: AgentInfo[] | null | undefined): string[] {
  const info = new Map((infos ?? []).map((a) => [a.id, a]))
  return items.filter((it) => {
    const places = info.get(it.agent)?.places ?? []
    return places.includes('note') && !places.includes('bottom')
  }).map((it) => it.agent)
}

export type NotesMode = 'loud' | 'quiet' | 'mixed'

/** `quiet` = every note agent is set to the log; `loud` = none is; `mixed` = some are (the person set them one by one). */
export function notesMode(items: ChatAgentItem[], ids: string[]): NotesMode {
  const quiet = ids.filter((id) => items.find((it) => it.agent === id)?.show === QUIET_PLACE).length
  return quiet === 0 ? 'loud' : quiet === ids.length ? 'quiet' : 'mixed'
}
