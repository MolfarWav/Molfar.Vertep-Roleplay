// Which chats follow which agent set, and which set a character's next chat should start from. Pure: the chat list
// already carries each chat's agent binding (`Chat.agents`), and the agents panel keeps the plugin's resolved list for
// every chat opened this session (`live`), which is newer than the list read at start, so it wins.

import type { ChatAgents } from './agents'
import type { Chat } from './types'

type ChatLike = Pick<Chat, 'id' | 'agents'> & Partial<Pick<Chat, 'characterId' | 'updatedAt' | 'createdAt'>>

export interface Follow {
  /** the set the chat uses, or started from when it has its own copy; null = none (no default either) */
  setId: string | null
  /** the chat has its own copy of the agents: a change to the set no longer reaches it */
  own: boolean
  /** the copy is empty: the person took every agent out */
  empty: boolean
}

/** What one chat follows right now. `defaultSet` is the set a chat with no binding follows. */
export function followOf(chat: ChatLike, live: ChatAgents | undefined, defaultSet: string | null): Follow {
  if (live) return { setId: live.presetId, own: !live.followsPreset, empty: !live.followsPreset && live.items.length === 0 }
  const b = chat.agents
  return { setId: b?.preset ?? defaultSet, own: !!b?.own, empty: !!b?.own && b.own.length === 0 }
}

/** For each set: how many chats follow it live. A chat with its own copy is not counted: editing or deleting the set does not touch it. */
export function usageBySet(chats: ChatLike[], live: Record<string, ChatAgents>, defaultSet: string | null): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of chats) {
    const f = followOf(c, live[c.id], defaultSet)
    if (f.setId && !f.own) out.set(f.setId, (out.get(f.setId) ?? 0) + 1)
  }
  return out
}

/** What the New chat step's set select shows: the default, no agents, or a set's id. */
export type SetPick = 'default' | 'none' | string

/**
 * The set the next chat with this character starts from: the one its newest chat used. `from` is that chat's id, only
 * when the answer differs from the default (otherwise there is nothing to explain). A set that is gone falls back to the default.
 */
export function lastSetFor(
  chats: ChatLike[], live: Record<string, ChatAgents>, charId: string, defaultSet: string | null, setIds: Set<string>,
): { pick: SetPick; from: string | null } {
  let last: ChatLike | null = null
  for (const c of chats) {
    if (c.characterId !== charId) continue
    if (!last || (c.updatedAt ?? c.createdAt ?? 0) > (last.updatedAt ?? last.createdAt ?? 0)) last = c
  }
  if (!last) return { pick: 'default', from: null }
  const f = followOf(last, live[last.id], defaultSet)
  if (f.empty) return { pick: 'none', from: last.id }
  if (!f.setId || !setIds.has(f.setId) || f.setId === defaultSet) return { pick: 'default', from: null }
  return { pick: f.setId, from: last.id }
}
