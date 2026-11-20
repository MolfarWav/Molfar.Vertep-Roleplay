// Meanwhile (plugins/meanwhile, #449) as the app sees it: the pass after a reply and the state the World DM sheet's card reads.
// An app without the plugin answers 404; everything here then stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

export type MeanwhileSpoilers = 'none' | 'hints' | 'all'
export type MeanwhileModelFrom = 'meanwhile' | 'world' | 'sensor' | 'litopys' | 'chat' | 'default' | 'none'

export interface MeanwhileConfig {
  enabled: boolean
  model: string
  k: number
  clockHours: number
  minReplies: number
  spoilers: MeanwhileSpoilers
  offCards: string[]
}

/** An event as the panel may see it: `none` has no names, `hints` no text, `all` everything. */
export interface MeanwhileEvent {
  id: string
  visibility: 'secret' | 'local' | 'public'
  status: string
  who?: string[]
  where?: string
  when?: string
  what?: string
  witnesses?: string[]
}

export interface MeanwhileLogEntry {
  at: number
  reason: 'scene' | 'clock' | 'manual' | string
  model: string
  ms: number
  offered: number
  kept: number
  dropped: string[]
  events?: { id: string; who?: string[]; visibility: string }[]
  usage?: { input: number; output: number; cost: number }
  retried?: boolean
  error?: string
}

export interface MeanwhileState {
  config: MeanwhileConfig
  model: { model: string; from: MeanwhileModelFrom }
  due: { due: boolean; reason: string; replies: number; spanMinutes: number }
  events: MeanwhileEvent[]
  log: MeanwhileLogEntry[]
  usage: { input: number; output: number; cost: number; runs: number }
}

export interface MeanwhileRun {
  ok: boolean
  kept?: number
  offered?: number
  dropped?: number
  reason?: string
  message?: string
  error?: string
}

/** Bumped when a pass finished: an open card reads again. */
export const useMeanwhileLive = create<{ stamp: number }>(() => ({ stamp: 0 }))

export async function loadMeanwhile(chatId: string): Promise<MeanwhileState | null> {
  try {
    return await j<MeanwhileState>(`/meanwhile/state?chatId=${encodeURIComponent(chatId)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

let enabledCache: { on: boolean; at: number } | null = null
const CACHE_MS = 10 * 60 * 1000

export async function saveMeanwhileConfig(patch: Partial<MeanwhileConfig>): Promise<MeanwhileConfig> {
  const r = await j<{ config: MeanwhileConfig }>('/meanwhile/config', { method: 'PUT', body: JSON.stringify(patch) })
  enabledCache = { on: r.config.enabled, at: Date.now() }
  return r.config
}

export async function runMeanwhile(chatId: string, force = false): Promise<MeanwhileRun> {
  try {
    const r = await j<MeanwhileRun>('/meanwhile/run', { method: 'POST', body: JSON.stringify({ chatId, ...(force ? { force } : {}) }) })
    if (r.ok) useMeanwhileLive.setState((s) => ({ stamp: s.stamp + 1 }))
    return r
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { ok: false, reason: 'no-plugin' }
    return { ok: false, reason: 'error', message: String((e as Error)?.message ?? e) }
  }
}

const running = new Set<string>()

/**
 * The pass after a reply. The plugin costs a call even when it answers "off", so the switch is remembered here (ten minutes, and at
 * once when the card changes it) and a chat with the switch off makes no call at all. One pass at a time per chat.
 */
export async function triggerMeanwhile(chatId: string, busy: () => boolean): Promise<void> {
  if (busy() || running.has(chatId)) return
  // taken before the first await, or two replies in a row would both pass the check
  running.add(chatId)
  try {
    if (!enabledCache || Date.now() - enabledCache.at > CACHE_MS) {
      try {
        const r = await j<{ config: MeanwhileConfig }>('/meanwhile/config')
        enabledCache = { on: r.config.enabled, at: Date.now() }
      } catch {
        enabledCache = { on: false, at: Date.now() }
      }
    }
    if (!enabledCache.on) return
    await runMeanwhile(chatId)
  } finally {
    running.delete(chatId)
  }
}

/** For tests: forget the remembered switch. */
export function resetMeanwhileCache(): void {
  enabledCache = null
  running.clear()
}
