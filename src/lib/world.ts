// The World DM (plugins/world, #52) as the app sees it: the run after a reply and the
// live state the DM sheet reads. An app without the plugin answers 404 and stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

/** A chat's own world book (`ownerChatId`) stays out of the app: the engine scans it for that chat only. */
export function libraryBooks<T extends Record<string, unknown>>(items: T[]): T[] {
  return items.filter((b) => !(typeof b.ownerChatId === 'string' && b.ownerChatId))
}

export type WorldLevel = 'off' | 'chronicler' | 'living' | 'director' | 'antagonist' | 'chaos'

/** GET /world/state: what the sheet shows. The records themselves are not sent: the world is the DM's. */
export interface WorldView {
  settings: { level: WorldLevel; everyN: number; stagnation: number; onTransition: boolean; insert: boolean }
  ready: WorldLevel[]
  records: number
  retired: number
  dueIn: number
  lastRunAt: number | null
  lastSummary: string
  lastError: { at: number; message: string } | null
  model: string
  /** the scene direction the DM goes by (the Dashboard's, else its own), null when unknown */
  direction: string | null
  /** the Dashboard has read this chat: stagnation and time skips can trigger */
  sensor: boolean
  fronts: number
  eventWaiting: boolean
}

interface WorldReply extends Partial<WorldView> { ok?: boolean; error?: string; skipped?: string; changes?: number }

interface WorldLiveState {
  running: Record<string, true>
  /** the newest view per chat, from a run or a read */
  views: Record<string, WorldView>
}

export const useWorldLive = create<WorldLiveState>(() => ({ running: {}, views: {} }))

function setRunning(chatId: string, on: boolean) {
  useWorldLive.setState((s) => {
    const running = { ...s.running }
    if (on) running[chatId] = true
    else delete running[chatId]
    return { running }
  })
}

function keepView(chatId: string, v: Partial<WorldView> | null | undefined) {
  if (!v || !v.settings) return
  useWorldLive.setState((s) => ({ views: { ...s.views, [chatId]: v as WorldView } }))
}

/** Read the chat's DM state; null when the app has no World DM. */
export async function loadWorld(chatId: string): Promise<WorldView | null> {
  try {
    const v = await j<WorldView>(`/world/state?chatId=${encodeURIComponent(chatId)}`)
    keepView(chatId, v)
    return v
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function saveWorldSettings(chatId: string, patch: Partial<WorldView['settings']>): Promise<WorldView> {
  const v = await j<WorldView>('/world/settings', { method: 'PUT', body: JSON.stringify({ chatId, ...patch }) })
  keepView(chatId, v)
  return v
}

export interface WorldRecord { id: string; kind: string; name: string; aliases: string[]; text: string; status: 'active' | 'past'; at: number }

/** The world book's records, for the player who asked to look (fronts and events are not sent). */
export async function peekWorld(chatId: string): Promise<WorldRecord[]> {
  return (await j<{ records: WorldRecord[] }>(`/world/peek?chatId=${encodeURIComponent(chatId)}`)).records
}

export async function loadWorldConfig(): Promise<{ model: string; maxTokens: number }> {
  return j('/world/config')
}

export async function saveWorldConfig(patch: { model?: string; maxTokens?: number }): Promise<{ model: string; maxTokens: number }> {
  return j('/world/config', { method: 'PUT', body: JSON.stringify(patch) })
}

const inFlight = new Set<string>()

/**
 * One DM run. `auto` = after a reply: the plugin runs only when every-N says so. Without it
 * ("World turn") it always runs. Returns the plugin's answer, or null when there is no plugin
 * or a run for this chat is already going.
 */
export async function runWorld(chatId: string, auto: boolean): Promise<WorldReply | null> {
  if (inFlight.has(chatId)) return null
  inFlight.add(chatId)
  setRunning(chatId, true)
  try {
    const r = await j<WorldReply>('/world/update', { method: 'POST', body: JSON.stringify({ chatId, auto }) })
    if (r?.settings) keepView(chatId, r)
    else if (r?.ok === false || r?.skipped !== 'off') void loadWorld(chatId).catch(() => {})
    return r
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    return { ok: false, error: String((e as Error)?.message ?? e) }
  } finally {
    inFlight.delete(chatId)
    setRunning(chatId, false)
  }
}

/** After a reply (once the dashboard has read it): a DM run if this chat's DM is due. `busy` = the next reply is already being written. */
export async function triggerWorldUpdate(chatId: string, busy: () => boolean): Promise<void> {
  if (busy()) return
  await runWorld(chatId, true)
}
