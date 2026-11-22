// The member picker of "New group" (src/components/chat/create-group-dialog.tsx): which characters show for the
// search, the All / Favourites / Recent segment, the tag chips and the sort. Pure, so it is tested without a browser.

import type { Character } from './types'

export type PickerScope = 'all' | 'fav' | 'recent'
export type PickerSort = 'name' | 'recent' | 'chats'

/** "Recent" = the characters last chatted with, newest first, up to this many. */
export const RECENT_COUNT = 12

export interface PickerQuery {
  query: string
  scope: PickerScope
  tags: string[]
  sort: PickerSort
}

/** Solo characters only (a group cannot be a member of a group). */
export const soloCharacters = (all: Character[]): Character[] => all.filter((c) => !c.isGroup)

/** The tags of these characters with how many of them carry each, most used first (ties by name). */
export function tagCounts(chars: Character[]): { tag: string; n: number }[] {
  const counts = new Map<string, number>()
  for (const c of chars) for (const raw of c.tags ?? []) {
    const tag = raw.trim()
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
}

/** `chatCounts`: how many chats each character has (by id). */
export function pickCharacters(chars: Character[], q: PickerQuery, chatCounts: Map<string, number>): Character[] {
  const needle = q.query.trim().toLowerCase()
  let list = chars
  if (q.scope === 'fav') list = list.filter((c) => c.favorite)
  if (q.scope === 'recent') list = [...list].filter((c) => (c.lastChatAt ?? 0) > 0).sort((a, b) => (b.lastChatAt ?? 0) - (a.lastChatAt ?? 0)).slice(0, RECENT_COUNT)
  if (needle) list = list.filter((c) => c.name.toLowerCase().includes(needle) || (c.tags ?? []).some((t) => t.toLowerCase().includes(needle)))
  if (q.tags.length) list = list.filter((c) => q.tags.every((t) => (c.tags ?? []).includes(t)))
  const byName = (a: Character, b: Character) => a.name.localeCompare(b.name)
  return [...list].sort(
    q.sort === 'recent' ? (a, b) => (b.lastChatAt ?? 0) - (a.lastChatAt ?? 0) || byName(a, b)
      : q.sort === 'chats' ? (a, b) => (chatCounts.get(b.id) ?? 0) - (chatCounts.get(a.id) ?? 0) || byName(a, b)
        : byName,
  )
}

/** A move of one member in the speaking order by one step; out of range = unchanged. */
export function moveInOrder(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const next = [...ids]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** The group's name when the field is blank: the first three members. */
export function autoGroupName(chosen: Character[]): string {
  return `Group: ${chosen.map((c) => c.name).slice(0, 3).join(', ')}`
}
