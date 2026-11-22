// Direction (plugins/direction, Molfar.Vertep #496) as the app sees it: the director's report after a reply, the chat's switch
// and lock, and the one model for every chat. An app without the plugin answers 404; everything here then stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

export const DIRECTION_TAGS = ['lesson', 'break', 'lunch', 'club', 'commute', 'group_out', 'date', 'alone_moment', 'at_home', 'event'] as const
export type DirectionTag = (typeof DIRECTION_TAGS)[number]

export interface DirectionReport {
  key: string
  at: number
  tag: DirectionTag | null
  /** member (card) ids in the scene */
  present: string[]
  sceneNew: boolean
  model: string
  ms: number
  usage?: { input: number; output: number }
}

export interface DirectionLogEntry {
  at: number
  kind: 'report' | 'error' | 'on' | 'off' | 'lock' | 'release' | string
  key?: string
  tag?: DirectionTag | null
  present?: string[]
  ids?: string[]
  sceneNew?: boolean
  model?: string
  ms?: number
  usage?: { input: number; output: number }
  reason?: string
  message?: string
  retried?: boolean
}

export interface DirectionScene {
  /** where the cast comes from: the player's lock, the director, the Dashboard, or nothing known */
  source: 'lock' | 'director' | 'dashboard' | 'none'
  present: string[]
  tag: DirectionTag | null
}

export interface DirectionState {
  config: { model: string }
  chat: { on: boolean; lock: { ids: string[]; at: number } | null; returning: { ids: string[]; after: string; at: number } | null }
  scene: DirectionScene
  report: DirectionReport | null
  members: { id: string; name: string }[]
  log: DirectionLogEntry[]
  usage: { input: number; output: number; runs: number }
}

export interface DirectionRun {
  ok: boolean
  report?: DirectionReport
  reason?: string
  message?: string
}

/** Bumped when a report, the switch or the lock changed: an open bar reads again. `running` names the chat the director reads now. */
export const useDirectionLive = create<{ stamp: number; running: string | null }>(() => ({ stamp: 0, running: null }))
const bump = () => useDirectionLive.setState((s) => ({ stamp: s.stamp + 1 }))

export async function loadDirection(chatId: string): Promise<DirectionState | null> {
  try {
    return await j<DirectionState>(`/direction/state?chatId=${encodeURIComponent(chatId)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

let modelCache: { model: string; at: number } | null = null
const CACHE_MS = 10 * 60 * 1000

/** The director's model ("" = none picked), remembered ten minutes and at once when the bar changes it. */
export async function directionModel(): Promise<string> {
  if (!modelCache || Date.now() - modelCache.at > CACHE_MS) {
    try {
      const r = await j<{ config: { model: string } }>('/direction/config')
      modelCache = { model: r.config.model, at: Date.now() }
    } catch {
      modelCache = { model: '', at: Date.now() }
    }
  }
  return modelCache.model
}

export async function saveDirectionModel(model: string): Promise<string> {
  const r = await j<{ config: { model: string } }>('/direction/config', { method: 'PUT', body: JSON.stringify({ model }) })
  modelCache = { model: r.config.model, at: Date.now() }
  bump()
  return r.config.model
}

/** This chat's switch and lock. `lock: null` releases it (the others come back on the next reply). */
export async function setDirectionChat(chatId: string, patch: { on?: boolean; lock?: { ids: string[] } | null }): Promise<DirectionState['chat']> {
  const r = await j<{ chat: DirectionState['chat'] }>('/direction/chat', { method: 'PUT', body: JSON.stringify({ chatId, ...patch }) })
  bump()
  return r.chat
}

export async function runDirection(chatId: string, force = false): Promise<DirectionRun> {
  useDirectionLive.setState({ running: chatId })
  try {
    const r = await j<DirectionRun>('/direction/run', { method: 'POST', body: JSON.stringify({ chatId, ...(force ? { force } : {}) }) })
    return r
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { ok: false, reason: 'no-plugin' }
    return { ok: false, reason: 'error', message: String((e as Error)?.message ?? e) }
  } finally {
    useDirectionLive.setState((s) => ({ running: s.running === chatId ? null : s.running, stamp: s.stamp + 1 }))
  }
}

const running = new Set<string>()

/**
 * The director after a reply in a group chat, before the Dashboard (one model call at a time). Without a model it makes no
 * call at all; a chat with the switch off answers "off" from the plugin without a model call.
 */
export async function triggerDirection(chatId: string, isGroup: boolean, busy: () => boolean): Promise<void> {
  if (!isGroup || busy() || running.has(chatId)) return
  running.add(chatId)
  try {
    if (!(await directionModel())) return
    await runDirection(chatId)
  } finally {
    running.delete(chatId)
  }
}

/** A new group chat starts with Direction on when a model is picked (owner, 2026-11-22); older chats are not touched. */
export async function directionOnForNewChat(chatId: string, wanted = true): Promise<void> {
  try {
    if (wanted && (await directionModel())) await setDirectionChat(chatId, { on: true })
  } catch {
    /* an app without the plugin: nothing to switch on */
  }
}

/** For tests: forget the remembered model. */
export function resetDirectionCache(): void {
  modelCache = null
  running.clear()
}
