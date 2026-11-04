// Voice colours of one chat (plugins/relations, GET/POST /dashboard/voices): one colour per person of the chat's
// entity registry (docs/ENTITY-REGISTRY.md), kept in the chat. The plugin decides who is a person and which colour is
// free; this file only reads and changes them and turns the people into the voices a message is painted by.
// An app without the Dashboard plugin answers 404: no voices, silently.

import { useEffect } from 'react'
import { create } from 'zustand'
import { j } from './engine'
import { useDashLive } from './dash-live'
import { voiceMatcher, type DialogueVoice, type VoiceMatcher } from './dialogue-voices'

export interface VoicePerson {
  id: string
  name: string
  aliases: string[]
  /** '' while the chat does not use voice colours */
  color: string
  /** picked by the user: a spread leaves it alone */
  hand: boolean
}

export interface ChatVoices {
  mode: 'auto' | 'on' | 'off'
  /** false: the chat does not paint voices (a one-person chat until the user turns it on) */
  active: boolean
  people: VoicePerson[]
}

export type VoiceOp =
  | { op: 'on' | 'off' | 'auto' | 'spread'; all?: boolean }
  | { op: 'set'; id: string; color: string }
  | { op: 'unset'; id: string }

interface Store {
  byChat: Record<string, ChatVoices | null>
}
export const useChatVoices = create<Store>(() => ({ byChat: {} }))

const put = (chatId: string, v: ChatVoices | null) => useChatVoices.setState((s) => ({ byChat: { ...s.byChat, [chatId]: v } }))

/** Read the chat's voices from the plugin; null when the app has none. */
export async function loadChatVoices(chatId: string): Promise<ChatVoices | null> {
  try {
    const v = await j<ChatVoices>(`/dashboard/voices?chatId=${encodeURIComponent(chatId)}`)
    put(chatId, v && Array.isArray(v.people) ? v : null)
    return useChatVoices.getState().byChat[chatId] ?? null
  } catch {
    put(chatId, null)
    return null
  }
}

/** Change the chat's voices; throws the route's reason when it refuses. */
export async function changeChatVoices(chatId: string, op: VoiceOp): Promise<ChatVoices> {
  const v = await j<ChatVoices>('/dashboard/voices', { method: 'POST', body: JSON.stringify({ chatId, ...op }) })
  put(chatId, v)
  return v
}

/** Keeps an open chat's voices current: read when the chat opens and after each Dashboard update (new people come with it). */
export function useLoadChatVoices(chatId: string): void {
  const lastAt = useDashLive((s) => s.last[chatId]?.at)
  useEffect(() => {
    if (chatId) void loadChatVoices(chatId)
  }, [chatId, lastAt])
}

/** One matcher over all the spellings of a person: the first place any of them is said. */
function anyOf(names: string[]): VoiceMatcher | null {
  const ms = names.map((n) => voiceMatcher(n)).filter((m): m is VoiceMatcher => !!m)
  if (!ms.length) return null
  const exec = (text: string) => {
    let best: { index: number } | null = null
    for (const m of ms) {
      const r = m.exec(text)
      if (r && (!best || r.index < best.index)) best = r
    }
    return best
  }
  return { exec, test: (text) => exec(text) !== null }
}

/** The voices a chat paints its messages by: its people, each with the colour kept for them; empty when the chat uses none. */
export function peopleVoices(v: ChatVoices | null | undefined): DialogueVoice[] {
  if (!v?.active) return []
  const out: DialogueVoice[] = []
  for (const p of v.people) {
    if (!p.color) continue
    const match = anyOf([p.name, ...p.aliases])
    if (match) out.push({ name: p.name, color: p.color, match })
  }
  return out
}
