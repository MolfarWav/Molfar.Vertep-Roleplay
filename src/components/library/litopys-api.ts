// Types and fetchers for the Litopys view (plugin routes
// GET /litopys/chats and GET /litopys/chat?chatId=, plus config and rebuild).
import { j } from '@/lib/engine'

export interface LitWorker {
  lastRunAt: number
  ok: boolean
  /** The message ids of the last scene; the numbers are 1-based, 0 = no longer in the chat. */
  lastScene?: { from: string; to: string; fromNo?: number; toNo?: number }
  error?: string
  ms?: number
  /** After a failure: epoch ms before which the worker does not try this chat again. */
  retryAt?: number
}

export interface LitChatItem {
  id: string
  title: string
  /** The character's or the group's name; '' when unknown. */
  name: string
  updatedAt: number
  hasData: boolean
  chapters: number
  /** Active facts only. */
  facts: number
  /** Pending proposals only. */
  proposals: number
  worker: LitWorker | null
}

export interface LitChapter {
  id: string
  label: string
  text: string
  kind: 'scene' | 'part' | 'merged'
  /** How many messages it covers. */
  count: number
  /** 1-based message numbers of the range; 0 when the messages are gone. */
  fromNo: number
  toNo: number
  place?: string
  at: number
  stale: boolean
  edited: boolean
}

export type LitFactType = 'event' | 'trait' | 'change' | 'relation' | 'world' | 'plan'
export type LitFactWeight = 'everyday' | 'important' | 'key'
export type LitFactStatus = 'active' | 'retired' | 'superseded'

export interface LitFact {
  id: string
  text: string
  subject: string
  knownBy: string[] | 'all'
  type: LitFactType
  weight: LitFactWeight
  pinned: boolean
  pinProposed?: boolean
  status: LitFactStatus
  supersedes?: string
  origin?: string
  at: number
  updatedAt: number
}

export interface LitProposal {
  id: string
  op: 'merge' | 'retire' | 'rewrite' | 'pin'
  targets: string[]
  text?: string
  reason?: string
  status: string
  at?: number
}

export interface LitChat {
  chatId: string
  title: string
  name: string
  /** Messages on the chat's active line. */
  messages: number
  hasData: boolean
  migrated: boolean
  chapters: LitChapter[]
  facts: LitFact[]
  proposals: LitProposal[]
  /** The scene in progress (never compressed); sceneFromNo is 1-based, 0 = unknown. */
  scene: { openFrom: string | null; label?: string }
  sceneFromNo: number
  worker: LitWorker & { facts?: { got: number; added: number; skipped: number } } | null
  cut: { count: number; upTo: string | null }
  lastInsert: { at: number; tokens: number; facts: number; chapters: number; cut: number } | null
  rebuildScenes: number
  rebuilding: { chapters: number; startedAt: number } | null
}

export interface LitConfig {
  enabled: boolean
  model: string
  recentMessages: number
  scene: { minMessages: number; maxMessages: number }
  pinLimit: number
  insert: boolean
  budget: number
  chapter: string
}

export const fetchLitChats = () => j<{ items: LitChatItem[]; total: number }>('/litopys/chats')
export const fetchLitChat = (chatId: string) => j<LitChat>(`/litopys/chat?chatId=${encodeURIComponent(chatId)}`)
export const fetchLitConfig = () => j<LitConfig>('/litopys/config')
export const putLitConfig = (patch: Record<string, unknown>) => j<LitConfig>('/litopys/config', { method: 'PUT', body: JSON.stringify(patch) })
export const deleteLitPrompts = () => j<{ ok: boolean }>('/litopys/config/prompts', { method: 'DELETE' })
export const rebuildLitChat = (chatId: string) => j<{ scenes: number }>('/litopys/rebuild', { method: 'POST', body: JSON.stringify({ chatId }) })
