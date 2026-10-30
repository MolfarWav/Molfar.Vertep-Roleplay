// The World DM (plugins/world, #52) as the app sees it: the run after a reply and the
// live state the DM sheet reads. An app without the plugin answers 404 and stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

/** A chat's own world book (`ownerChatId`) stays out of the app: the engine scans it for that chat only. */
export function libraryBooks<T extends Record<string, unknown>>(items: T[]): T[] {
  return items.filter((b) => !(typeof b.ownerChatId === 'string' && b.ownerChatId))
}

/** Where a character's outfit and what is in the hands come from: the Dashboard sensor (default, cheapest) or the World DM's own lists. */
export type WorldCarrySource = 'sensor' | 'dm'

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
  settings: { level: WorldLevel; carrySource: WorldCarrySource; everyN: number; recordsEveryN: number; stagnation: number; onTransition: boolean; onPlace: boolean; insert: boolean; textMax: number; changesMax: number; profile: string; dice: WorldDiceMode | ''; diceStat: WorldDiceStat | ''; diceChance: number; diceTilt: WorldDiceTilt | ''; diceLife: number; diceShow: boolean }
  /** the dice in force: this chat's own setting over the profile's option; null when the DM is off */
  dice: { mode: WorldDiceMode; stat: WorldDiceStat; chance: number; tilt: WorldDiceTilt; life: number } | null
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
  /** a Start in progress or waiting to be accepted */
  draft: WorldDraft | null
  /** cards left in the events deck (their text stays the DM's) */
  deck: number
  origin: WorldOrigin | null
  /** the world's backgrounds: a folder of the Backgrounds library */
  backgroundFolderId: string | null
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
export interface WorldRecord {
  id: string; kind: WorldKind; name: string; aliases: string[]; text: string; status: 'active' | 'past'; at: number; by?: 'player'; pinned?: boolean
  /** a place: 'spot' = a room or corner of the place named by `inside`; absent = a whole place */
  size?: 'spot' | ''
  inside?: string
  /** a thing: held by a person or lying in a place, never both (names) */
  holder?: string
  place?: string
  /** a place: how many times the story came to it */
  visits?: number
  /** a place: the id of a picture in the Backgrounds library, shown when the story is here ('' clears it when saving) */
  background?: string
}

/** What a character wears and carries now (kept by the DM). */
export interface WorldCarry { wearing: string[]; carried: { what: string; where?: string }[]; nearby: string[]; /** the sensor's `holding` text (a carry that comes from the sensor) */ hands?: string; at: number }

/** GET /world/here: the Dashboard's "Here" and "Outfit and things". Records are the same shape as peek's, text and ids included. */
export interface WorldHere {
  /** false while the chat's DM is off */
  on: boolean
  /** the place as the Dashboard sensor wrote it (free text) */
  scenePlace: string
  place: WorldRecord | null
  parent: WorldRecord | null
  spots: WorldRecord[]
  /** things lying in this place, its parent or its spots */
  things: WorldRecord[]
  /** things held by a person in the scene (`who` = the holder) */
  held: (WorldRecord & { who: string })[]
  /** things elsewhere: in other places or held by people who are not in the scene */
  asleep: WorldRecord[]
  /** by character name, from the chat's carry source */
  carry: Record<string, WorldCarry>
  carrySource: WorldCarrySource
  /** what the Dashboard sensor says each character wears and holds, whatever the source (to compare with the DM's lists) */
  sensor: Record<string, WorldCarry>
  present: string[]
  /** what the last DM run changed: record ids and the characters whose carry moved */
  changed: { at: number; ids: string[]; carry: string[] }
  /** the picture bound to the scene's place (a spot without one takes its place's), or null */
  background: string | null
}

export async function loadWorldHere(chatId: string): Promise<WorldHere | null> {
  try {
    return await j<WorldHere>(`/world/here?chatId=${encodeURIComponent(chatId)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export type WorldRecordOp = 'add' | 'update' | 'retire' | 'restore' | 'delete'

/** Edit the world book by hand; returns the records as peek does. 409 = the name is taken. */
export async function editWorldRecord(chatId: string, op: WorldRecordOp, record: Partial<WorldRecord>): Promise<WorldRecord[]> {
  return (await j<{ records: WorldRecord[] }>('/world/records', { method: 'PUT', body: JSON.stringify({ chatId, op, record }) })).records
}

/** The build model writes keys for the living records that have none (one call); changed = records given keys. */
export async function fillWorldKeys(chatId: string): Promise<{ ok: boolean; changed?: number; error?: string; code?: WorldErrorCode }> {
  const r = await j<{ ok: boolean; changed?: number; error?: string; code?: WorldErrorCode }>('/world/records/keys', { method: 'POST', body: JSON.stringify({ chatId }) })
  void loadWorld(chatId).catch(() => {})
  return r
}

export type WorldBlockKey = 'keeper' | 'level' | 'shared' | 'event'
export interface WorldProfileBlock { key: WorldBlockKey; text: string; default: string; changed: boolean }
export interface WorldProfileDefaults { everyN: number; stagnation: number; onTransition: boolean; insert: boolean }
/** clocks: who ticks the fronts' clocks ('code' = every clockEvery replies read); eventByClock: news worded by the clock's stage */
/** deck: events come only from the chat's events deck (built at start; "New deck" when used up) */
/** dice: code rolls 2d6 + one Dashboard number before a reply ('flavour' = a nudge the model may soften, 'strict' = binding); diceStat: which number; diceChance: percent of replies that get a roll */
export type WorldDiceMode = 'off' | 'flavour' | 'strict'
/** how kind the dice are: the limits between miss / no but / yes but / full success move by one */
export const WORLD_DICE_TILTS = ['kind', 'even', 'harsh'] as const
export type WorldDiceTilt = (typeof WORLD_DICE_TILTS)[number]
export const WORLD_DICE_STATS = ['trust', 'comfort', 'attraction', 'respect', 'affection'] as const
/** 'auto' = the model takes the stat the attempted action leans on */
export const WORLD_DICE_STAT_CHOICES = ['auto', ...WORLD_DICE_STATS] as const
export type WorldDiceStat = (typeof WORLD_DICE_STAT_CHOICES)[number]
export interface WorldProfileOptions { clocks: 'model' | 'code'; clockEvery: number; eventByClock: boolean; deck: boolean; dice: WorldDiceMode; diceStat: WorldDiceStat; diceChance: number; diceTilt: WorldDiceTilt; diceLife: number }
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
/** imageModel: the backgrounds' image model ('' = the app's, Settings > Images); autoBackground: new chats in a world switch backgrounds by scene */
export interface WorldConfig { model: string; buildModel: string; maxTokens: number; imageModel: string; autoBackground: boolean; play: WorldModelPick; build: WorldModelPick }

const chatQuery = (chatId?: string) => (chatId ? `?chatId=${encodeURIComponent(chatId)}` : '')

export async function loadWorldConfig(chatId?: string): Promise<WorldConfig> {
  return j(`/world/config${chatQuery(chatId)}`)
}

export async function saveWorldConfig(patch: { model?: string; buildModel?: string; maxTokens?: number; imageModel?: string; autoBackground?: boolean }, chatId?: string): Promise<WorldConfig> {
  const saved = await j<WorldConfig>(`/world/config${chatQuery(chatId)}`, { method: 'PUT', body: JSON.stringify(patch) })
  // whoever shows the config (the Make a set line, a dialog) re-reads it
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<WorldConfig>(WORLD_CONFIG_EVENT, { detail: saved }))
  return saved
}
export const WORLD_CONFIG_EVENT = 'world-config-saved'

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

// ---------- Start (P3 stage 3): recipes, the draft, the deck, the library, carry, the chat's own opening ----------
export interface WorldRecipeQuestion { id: string; text: string; options?: string[]; default?: string }
export interface WorldRecipe {
  id: string
  name: string
  description: string
  questions: WorldRecipeQuestion[]
  sections: { id: string; kinds: WorldKind[]; max: number; prompt: string }[]
  fronts: { count: number; prompt: string }
  builtin: boolean
}
export interface WorldDraftFront { id: string; name: string; goal: string; clock: number; size: number }
/** A Start's result before the player accepts it: done of total build calls; error = the last step failed (call again) */
export interface WorldDraft {
  recipe: string
  cardIds: string[]
  lang: string
  total: number
  done: number
  entities: WorldRecord[]
  fronts: WorldDraftFront[]
  deck: { id: string; text: string }[]
  at: number
  error: WorldError | null
}
export type WorldOrigin =
  | { kind: 'cards' | 'recipe'; recipe: string; cardIds: string[]; at: number }
  | { kind: 'library'; worldId: string; name: string; at: number }
  | { kind: 'chat'; chatId: string; title: string; at: number }

export async function listWorldRecipes(): Promise<WorldRecipe[]> {
  return (await j<{ recipes: WorldRecipe[] }>('/world/recipes')).recipes
}

interface DraftReply { ok?: boolean; error?: string; code?: WorldErrorCode | 'no-text'; draft: WorldDraft }

/** Begin a draft. 409 code 'no-text' = the chosen cards have nothing to learn from. */
export async function beginWorldStart(chatId: string, o: { recipe: string; cardIds?: string[]; answers?: Record<string, string>; fromCards?: boolean; lang?: string; deck?: boolean }): Promise<WorldDraft> {
  return (await j<DraftReply>('/world/start', { method: 'POST', body: JSON.stringify({ chatId, begin: true, ...o }) })).draft
}

/**
 * Run the draft's build calls one after another until done, a failed step (it stays; calling
 * again retries it) or `stop()`. onStep gets the draft after each call.
 */
export async function buildWorldDraft(chatId: string, onStep: (d: WorldDraft) => void, stop: () => boolean): Promise<{ draft: WorldDraft | null; error?: string; code?: string }> {
  let draft: WorldDraft | null = null
  setRunning(chatId, true)
  try {
    for (let i = 0; i < 80; i++) {
      if (stop()) break
      const r = await j<DraftReply>('/world/start', { method: 'POST', body: JSON.stringify({ chatId }) })
      draft = r.draft
      onStep(draft)
      if (r.ok === false) return { draft, error: r.error, code: r.code }
      if (draft.done >= draft.total) break
    }
    return { draft }
  } catch (e) {
    return { draft, error: String((e as Error)?.message ?? e) }
  } finally {
    setRunning(chatId, false)
    void loadWorld(chatId).catch(() => {})
  }
}

/** Accept the draft into the world, minus the ids the player removed; or throw it away. */
export async function finishWorldDraft(chatId: string, op: 'accept' | 'discard', drop?: { entities?: string[]; fronts?: string[]; deck?: string[] }): Promise<void> {
  const r = await j<Partial<WorldView>>('/world/draft', { method: 'PUT', body: JSON.stringify({ chatId, op, ...(drop ? { drop } : {}) }) })
  if (r?.settings) keepView(chatId, r)
  else void loadWorld(chatId).catch(() => {})
}

/** A new events deck for the chat (one build call). */
export async function newWorldDeck(chatId: string, lang?: string): Promise<{ ok: boolean; deck?: number; error?: string; code?: WorldErrorCode }> {
  const r = await j<{ ok: boolean; deck?: number; error?: string; code?: WorldErrorCode }>('/world/deck', { method: 'POST', body: JSON.stringify({ chatId, ...(lang ? { lang } : {}) }) })
  void loadWorld(chatId).catch(() => {})
  return r
}

/** A world being built without a chat (its draft not yet accepted): Worlds lists it to resume or discard. */
export interface BuildingWorld { id: string; name: string; at: number; level: WorldLevel; done: number; total: number; error: WorldError | null }

/** Begin a new world without a chat (user, 2026-10-19): from cards or an interview. Returns its id and draft. */
export async function beginNewWorld(o: { name: string; description?: string; level?: WorldLevel; profile?: string; recipe: string; cardIds?: string[]; answers?: Record<string, string>; fromCards?: boolean; lang?: string; deck?: boolean }): Promise<{ worldId: string; draft: WorldDraft }> {
  const r = await j<DraftReply & { worldId: string }>('/world/start', { method: 'POST', body: JSON.stringify({ begin: true, newWorld: true, ...o }) })
  return { worldId: r.worldId, draft: r.draft }
}

/** Run a new world's build calls, as buildWorldDraft does for a chat. */
export async function buildNewWorld(worldId: string, onStep: (d: WorldDraft) => void, stop: () => boolean): Promise<{ draft: WorldDraft | null; error?: string; code?: string }> {
  let draft: WorldDraft | null = null
  try {
    for (let i = 0; i < 80; i++) {
      if (stop()) break
      const r = await j<DraftReply>('/world/start', { method: 'POST', body: JSON.stringify({ worldId }) })
      draft = r.draft
      onStep(draft)
      if (r.ok === false) return { draft, error: r.error, code: r.code }
      if (draft.done >= draft.total) break
    }
    return { draft }
  } catch (e) {
    return { draft, error: String((e as Error)?.message ?? e) }
  }
}

/** Accept a new world's draft into the library (minus what the player dropped), or discard it. 409 code "empty" = nothing left to keep. */
export async function finishNewWorld(worldId: string, op: 'accept' | 'discard', drop?: { entities?: string[]; fronts?: string[]; deck?: string[] }): Promise<{ worlds: SavedWorld[]; building: BuildingWorld[] }> {
  return j('/world/draft', { method: 'PUT', body: JSON.stringify({ worldId, op, ...(drop ? { drop } : {}) }) })
}

/** A new world's draft as it stands, without a build call (null = no draft: accepted or discarded elsewhere). */
export async function peekNewWorld(worldId: string): Promise<WorldDraft | null> {
  return (await j<{ draft: WorldDraft | null }>('/world/start', { method: 'POST', body: JSON.stringify({ worldId, peek: true }) })).draft
}

/** The library in one read: saved worlds and worlds being built (an older plugin has no building). null = no World plugin. */
export async function listLibrary(): Promise<{ worlds: SavedWorld[]; building: BuildingWorld[] } | null> {
  try {
    const r = await j<{ worlds: SavedWorld[]; building?: BuildingWorld[] }>('/world/library')
    return { worlds: r.worlds, building: r.building ?? [] }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/** A saved world of the library (records, fronts, deck, settings), as the list shows it. */
export interface SavedWorld { id: string; name: string; description: string; at: number; from: { chatId: string; title: string } | null; backgroundFolderId: string | null; level: WorldLevel; records: number; fronts: number; deck: number }

export async function listSavedWorlds(): Promise<SavedWorld[] | null> {
  try {
    return (await j<{ worlds: SavedWorld[] }>('/world/library')).worlds
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
/** Save the chat's world as it stands. 409 = the world is empty or the library full. */
export async function saveWorldToLibrary(chatId: string, name?: string, description?: string): Promise<{ id: string; worlds: SavedWorld[] }> {
  return j('/world/library', { method: 'POST', body: JSON.stringify({ chatId, name, description }) })
}
export async function renameSavedWorld(id: string, patch: { name?: string; description?: string }): Promise<SavedWorld[]> {
  return (await j<{ worlds: SavedWorld[] }>('/world/library', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })).worlds
}
export async function deleteSavedWorld(id: string): Promise<SavedWorld[]> {
  return (await j<{ worlds: SavedWorld[] }>(`/world/library?id=${encodeURIComponent(id)}`, { method: 'DELETE' })).worlds
}

/** A world into a chat, from the library or another chat. 409 code 'has-world' unless replace. */
export async function carryWorld(toChatId: string, from: { worldId: string } | { fromChatId: string }, replace = false): Promise<WorldView> {
  const v = await j<WorldView>('/world/carry', { method: 'POST', body: JSON.stringify({ toChatId, ...from, ...(replace ? { replace } : {}) }) })
  keepView(toChatId, v)
  return v
}

export interface WorldOpeningDraft { ok: boolean; scenario?: string; opening?: string; model?: string; error?: string; code?: WorldErrorCode }
/** The build model drafts the chat's scenario and first message from its world (or a library world). */
export async function draftWorldOpening(chatId: string, o: { worldId?: string; wish?: string; lang?: string } = {}): Promise<WorldOpeningDraft> {
  return j('/world/opening', { method: 'POST', body: JSON.stringify({ chatId, ...o }) })
}

export interface WorldScenario { text: string; mode: 'replace' | 'append' }
/**
 * The chat's own scenario (null = the card's again) and, before the player's first message, its first
 * message (the greeting's new first swipe). 409 code 'started' = the player has written already.
 */
export async function setWorldOverride(chatId: string, o: { scenario?: WorldScenario | null; opening?: string }): Promise<{ scenario: WorldScenario | null; opening: boolean }> {
  return j('/world/override', { method: 'PUT', body: JSON.stringify({ chatId, ...o }) })
}

/** The chat's own scenario (null = the card's) and whether the player has written in it yet. */
export async function loadWorldScenario(chatId: string): Promise<{ scenario: WorldScenario | null; started: boolean }> {
  const r = await j<{ meta?: { worldScenario?: WorldScenario }; messages?: { role?: string }[] }>(`/chats/${encodeURIComponent(chatId)}`)
  const sc = r.meta?.worldScenario
  return { scenario: sc && typeof sc.text === 'string' && sc.text ? sc : null, started: (r.messages ?? []).some((m) => m.role === 'user') }
}

// ---------- backgrounds: a set per world, named images, picked by scene ----------
export type WorldRef = { chatId: string } | { worldId: string }
export interface WorldPlace { name: string; text: string; aliases?: string[]; inside?: string; background?: string }
/** One planned image: the place it shows, its English file name (the background's name), tags and the image prompt */
export interface PlannedBackground { place: string; file: string; tags: string[]; prompt: string }

/** The world's place records and its folder. */
/** A lorebook entry of the chat's cards, offered as a place to tick (not every entry is a place). */
export interface BookPlace { name: string; text: string; book: string }
export async function loadWorldBackgrounds(ref: WorldRef): Promise<{ places: WorldPlace[]; fromBooks?: BookPlace[]; folderId: string | null }> {
  const q = 'chatId' in ref ? `chatId=${encodeURIComponent(ref.chatId)}` : `worldId=${encodeURIComponent(ref.worldId)}`
  return j(`/world/backgrounds?${q}`)
}
/** The build model plans the set: file names, tags and prompts (taken = names already in the folder). */
export async function planWorldBackgrounds(ref: WorldRef, o: { places: (WorldPlace | string)[]; direction?: string; variants?: number; taken?: string[]; lang?: string }): Promise<{ ok: boolean; images?: PlannedBackground[]; imageModel?: string; error?: string; code?: WorldErrorCode }> {
  return j('/world/backgrounds', { method: 'POST', body: JSON.stringify({ ...ref, ...o }) })
}
/** The build model lists the places the cards and the world's records name (one call). */
export async function findWorldPlaces(ref: WorldRef): Promise<{ ok: boolean; places?: WorldPlace[]; error?: string; code?: WorldErrorCode | 'no-text' }> {
  return j('/world/backgrounds/places', { method: 'POST', body: JSON.stringify(ref) })
}
/** Link the world (a chat's or a saved one) to a folder of the Backgrounds library; null unlinks. */
export async function linkWorldBackgrounds(ref: WorldRef, folderId: string | null): Promise<void> {
  await j('/world/backgrounds', { method: 'PUT', body: JSON.stringify({ ...ref, folderId }) })
  if ('chatId' in ref) void loadWorld(ref.chatId).catch(() => {})
}
/** A vision model names one image (no model = the engine's Vision model). */
export async function nameBackgroundImage(image: { data: string; mimeType: string }, o: { model?: string; hint?: string } = {}): Promise<{ ok: boolean; file?: string; tags?: string[]; error?: string; message?: string; code?: WorldErrorCode }> {
  return j('/world/backgrounds/name', { method: 'POST', body: JSON.stringify({ image, ...o }) })
}

/** One entry of the chat's roll log (`GET /world/dice`): a quiet roll has gated false and no dice. */
export interface WorldDiceRoll {
  at: number
  /** 'life' = the world-intervenes roll (tier says how big); otherwise the action's roll */
  kind?: 'life'
  tier?: 'minor' | 'notable' | 'major'
  /** where in the chat the roll was made: messages so far, the key of the last one (id#swipe) and its swipe count */
  n?: number
  last?: string
  lastSwipes?: number
  op: string
  mode: WorldDiceMode
  stat: WorldDiceStat
  tilt?: WorldDiceTilt
  who: string
  value: number | null
  chance: number
  gated: boolean
  gate: number
  d1?: number
  d2?: number
  mod?: number
  total?: number
  outcome?: 'miss' | 'no_but' | 'yes_but' | 'full'
  /** auto only: the outcome for each present character and stat */
  by?: Record<string, Record<string, string>>
  inserted: boolean
}

/** The chat's last rolls, oldest first, and whether the chat shows them under the replies. */
export async function loadWorldDice(chatId: string): Promise<{ rolls: WorldDiceRoll[]; show: boolean }> {
  const r = await j<{ rolls: WorldDiceRoll[]; show?: boolean }>(`/world/dice?chatId=${encodeURIComponent(chatId)}`)
  return { rolls: r.rolls, show: r.show === true }
}

interface DiceLiveState { chats: Record<string, { rolls: WorldDiceRoll[]; show: boolean }> }
/** The newest read of each chat's rolls, for the marks under the replies. */
export const useDiceLive = create<DiceLiveState>(() => ({ chats: {} }))

/** Read the chat's rolls into the live store; a chat that does not show them is not read again until it is opened. */
export async function refreshDice(chatId: string, force = false): Promise<void> {
  const known = useDiceLive.getState().chats[chatId]
  if (known && !known.show && !force) return
  try {
    const r = await loadWorldDice(chatId)
    useDiceLive.setState((s) => ({ chats: { ...s.chats, [chatId]: r } }))
  } catch {
    // an app with no World DM has no rolls
  }
}
