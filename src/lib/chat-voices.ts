// Voice colours of one chat (plugins/relations, GET/POST /dashboard/voices): one colour per person of the chat's
// entity registry (docs/ENTITY-REGISTRY.md), kept in the chat. The plugin decides who is a person and which colour is
// free; this file only reads and changes them and turns the people into the voices a message is painted by.
// An app without the Dashboard plugin answers 404: no voices, silently.

import { useEffect } from 'react'
import { create } from 'zustand'
import { j } from './engine'
import { useDashLive } from './dash-live'
import type { ChatVoices, VoiceOp } from './chat-voices-core'

export { leavesVoicesAlone, peopleVoices } from './chat-voices-core'
export type { ChatVoices, VoicePerson, VoiceOp } from './chat-voices-core'

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
