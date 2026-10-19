// The World DM (plugins/world, #52) as the app sees it: the run after a reply and the
// live state the DM sheet reads. An app without the plugin answers 404 and stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

/** A chat's own world book (`ownerChatId`) stays out of the app: the engine scans it for that chat only. */
export function libraryBooks<T extends Record<string, unknown>>(items: T[]): T[] {
  return items.filter((b) => !(typeof b.ownerChatId === 'string' && b.ownerChatId))
}

export type WorldLevel = 'off' | 'chronicler' | 'living' | 'director' | 'antagonist' | 'chaos'

/** Where a model in force comes from: the World's own setting, the Dashboard sensor's, Litopys's, the chat's, the app's default. */
export type WorldModelFrom = 'world' | 'sensor' | 'litopys' | 'chat' | 'default'
export interface WorldModelPick { model: string; from: WorldModelFrom }

export interface WorldUsage { input: number; output: number; cost: number }
/** The reply limit a call went out with; fromModel = it came from the model's parameter block in API connections. */
export interface WorldLimit { max: number; block: string | null; fromModel: boolean }

export type WorldErrorCode = 'thinking' | 'thinking-block' | 'reasoning-off' | 'rate' | 'context' | 'auth' | 'model' | 'not-json' | 'empty' | 'other'
export interface WorldError { at: number; code: WorldErrorCode; message: string; details?: string; limit?: WorldLimit }

/** One run of the history (GET /world/runs, newest first). summary can spoil: ask before showing it. */
export interface WorldRun {
  at: number
  reason: string
  changes: number
  fronts: number
  summary: string
  model: string
  ms: number
  usage: WorldUsage | null
  limit: WorldLimit | null
  /** unread messages left after this run (catch-up) */
  behind: number
  retried: boolean
  error?: WorldErrorCode
}

/** GET /world/state: what the sheet shows. The records themselves are not sent: the world is the DM's. */
export interface WorldView {
  /** profile: the player's own profile on this level ("" = the level's built-in one) */
  settings: { level: WorldLevel; everyN: number; stagnation: number; onTransition: boolean; insert: boolean; profile: string }
  ready: WorldLevel[]
  /** the profile in force: a level's id or an own profile's id; null when off */
  profile: string | null
  records: number
  retired: number
  dueIn: number
  lastRunAt: number | null
  lastSummary: string
  lastError: WorldError | null
  model: string
  /** the scene direction the DM goes by (the Dashboard's, else its own), null when unknown */
  direction: string | null
  /** the Dashboard has read this chat: stagnation and time skips can trigger */
  sensor: boolean
  fronts: number
  eventWaiting: boolean
  /** the play model in force for this chat */
  play: WorldModelPick | null
  lastRun: WorldRun | null
  /** the chat's total so far */
  usage: WorldUsage & { runs: number }
  /** unread text one run cannot read: "Read the whole chat" takes `runs` runs */
  behind: { messages: number; runs: number }
}

interface WorldReply extends Partial<WorldView> { ok?: boolean; error?: string; code?: WorldErrorCode; skipped?: string; changes?: number }

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

/** patch.profile picks a profile (a level id or an own one); the plugin sets the level from it. */
export async function saveWorldSettings(chatId: string, patch: Partial<WorldView['settings']>): Promise<WorldView> {
  const v = await j<WorldView>('/world/settings', { method: 'PUT', body: JSON.stringify({ chatId, ...patch }) })
  keepView(chatId, v)
  return v
}

export type WorldKind = 'person' | 'place' | 'group' | 'thing' | 'fact'
/** by: 'player' = written or changed by hand in the Records tab */
export interface WorldRecord { id: string; kind: WorldKind; name: string; aliases: string[]; text: string; status: 'active' | 'past'; at: number; by?: 'player' }

export type WorldRecordOp = 'add' | 'update' | 'retire' | 'restore' | 'delete'

/** Edit the world book by hand; returns the records as peek does. 409 = the name is taken. */
export async function editWorldRecord(chatId: string, op: WorldRecordOp, record: Partial<WorldRecord>): Promise<WorldRecord[]> {
  return (await j<{ records: WorldRecord[] }>('/world/records', { method: 'PUT', body: JSON.stringify({ chatId, op, record }) })).records
}

export type WorldBlockKey = 'keeper' | 'level' | 'shared' | 'event'
export interface WorldProfileBlock { key: WorldBlockKey; text: string; default: string; changed: boolean }
export interface WorldProfileDefaults { everyN: number; stagnation: number; onTransition: boolean; insert: boolean }
/** clocks: who ticks the fronts' clocks ('code' = every clockEvery replies read); eventByClock: news worded by the clock's stage */
export interface WorldProfileOptions { clocks: 'model' | 'code'; clockEvery: number; eventByClock: boolean }
/** A DM profile: built-in = one of the levels (name and description come from i18n by id); own = on a base level. */
export interface WorldProfile {
  id: string
  builtIn: boolean
  base: Exclude<WorldLevel, 'off'>
  name: string
  description: string
  defaults: WorldProfileDefaults
  options: WorldProfileOptions
  blocks: WorldProfileBlock[]
  /** the locked reply format, read-only */
  output: string
  changed: boolean
  /** chats on this profile */
  chats: number
}

export async function listWorldProfiles(): Promise<WorldProfile[]> {
  return (await j<{ profiles: WorldProfile[] }>('/world/profiles')).profiles
}

/** Change a profile (blocks: a string replaces, null resets to the default) or make one (no id, with base). */
export async function saveWorldProfile(patch: { id?: string; name?: string; description?: string; base?: WorldProfile['base']; blocks?: Partial<Record<WorldBlockKey, string | null>>; defaults?: Partial<WorldProfileDefaults>; options?: Partial<WorldProfileOptions> }): Promise<{ id: string; profiles: WorldProfile[] }> {
  return j('/world/profiles', { method: 'PUT', body: JSON.stringify(patch) })
}

export async function deleteWorldProfile(id: string): Promise<WorldProfile[]> {
  return (await j<{ profiles: WorldProfile[] }>(`/world/profiles?id=${encodeURIComponent(id)}`, { method: 'DELETE' })).profiles
}

/** The world book's records, for the player who asked to look (fronts and events are not sent). */
export async function peekWorld(chatId: string): Promise<WorldRecord[]> {
  return (await j<{ records: WorldRecord[] }>(`/world/peek?chatId=${encodeURIComponent(chatId)}`)).records
}

/** All chats: the play model (runs after replies) and the build model (makes worlds); empty = the fallback in `play`/`build`. */
export interface WorldConfig { model: string; buildModel: string; maxTokens: number; play: WorldModelPick; build: WorldModelPick }

const chatQuery = (chatId?: string) => (chatId ? `?chatId=${encodeURIComponent(chatId)}` : '')

export async function loadWorldConfig(chatId?: string): Promise<WorldConfig> {
  return j(`/world/config${chatQuery(chatId)}`)
}

export async function saveWorldConfig(patch: { model?: string; buildModel?: string; maxTokens?: number }, chatId?: string): Promise<WorldConfig> {
  return j(`/world/config${chatQuery(chatId)}`, { method: 'PUT', body: JSON.stringify(patch) })
}

/** A row of the World section's list. */
export interface WorldChat {
  chatId: string
  title: string
  characterId: string | null
  groupId: string | null
  cards: string[]
  level: WorldLevel
  lastRunAt: number | null
  error: WorldErrorCode | null
  /** when that error happened (epoch ms); null when there is none */
  errorAt?: number | null
  records: number
  fronts: number
  usage: WorldUsage & { runs: number }
}

export async function listWorldChats(): Promise<WorldChat[] | null> {
  try {
    return (await j<{ chats: WorldChat[] }>('/world/chats')).chats
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function loadWorldRuns(chatId: string): Promise<{ runs: WorldRun[]; usage: WorldUsage & { runs: number }; lastError: WorldError | null }> {
  return j(`/world/runs?chatId=${encodeURIComponent(chatId)}`)
}

export interface WorldTest { ok: boolean; which: 'play' | 'build'; model: string; from: WorldModelFrom; ms: number; limit?: WorldLimit; thinks?: boolean; code?: WorldErrorCode; message?: string; details?: string }

/** "Test the model": one tiny call to the play (or build) model, for this chat when given. */
export async function testWorldModel(which: 'play' | 'build', chatId?: string): Promise<WorldTest> {
  return j('/world/test', { method: 'POST', body: JSON.stringify({ which, ...(chatId ? { chatId } : {}) }) })
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

/**
 * "Read the whole chat": runs one after another until nothing is left unread, an error, or `stop()`.
 * Each run reads the oldest unread part and sends no event. Returns how many runs went.
 */
export async function readWholeChat(chatId: string, onRun: (left: number, done: number) => void, stop: () => boolean): Promise<{ runs: number; error?: string }> {
  let done = 0
  for (let i = 0; i < 200; i++) {
    if (stop()) break
    const r = await runWorld(chatId, false)
    if (!r) break
    if (r.ok === false) return { runs: done, error: r.error }
    if (r.skipped) break
    done++
    const left = r.behind?.messages ?? 0
    onRun(left, done)
    if (!left) break
  }
  return { runs: done }
}

/** After a reply (once the dashboard has read it): a DM run if this chat's DM is due. `busy` = the next reply is already being written. */
export async function triggerWorldUpdate(chatId: string, busy: () => boolean): Promise<void> {
  if (busy()) return
  await runWorld(chatId, true)
}
