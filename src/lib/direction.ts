// Direction (plugins/direction, Molfar.Vertep #496) as the app sees it: the director's report after a reply, the chat's switch
// and lock, and the one model for every chat. An app without the plugin answers 404; everything here then stays silent.

import { create } from 'zustand'
import { ApiError, j } from './engine'

/** The scene kinds every chat offers (phases 1 to 3), then the nine a genre set adds (phase 4): every kind a report, a rule or a beat may hold. */
export const DIRECTION_BASE_TAGS = ['lesson', 'break', 'lunch', 'club', 'commute', 'group_out', 'date', 'alone_moment', 'at_home', 'event'] as const
export const DIRECTION_EXTRA_TAGS = ['work', 'meal', 'downtime', 'argument', 'travel', 'danger', 'investigation', 'secret', 'night'] as const
export const DIRECTION_TAGS = [...DIRECTION_BASE_TAGS, ...DIRECTION_EXTRA_TAGS] as const
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
  /** phase 3b: World people (ids `n<digits>`) the director judged to be in the reply; only when it was asked */
  others?: string[]
}

export interface DirectionLogEntry {
  at: number
  kind: 'report' | 'error' | 'on' | 'off' | 'lock' | 'release' | 'rule' | 'result' | 'rules' | 'skip' | 'beat' | string
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
  /** phase 2: kind `rule` (state fired | missed), `result`, `rules` (set, on) and `skip` carry these */
  rule?: string
  /** phase 3: kind `beat` (state due | fired) carries `beat` (the id), `text`, `who`, `why`, `forced`; a beat's result line has `rule: "beat:<id>"` */
  beat?: string
  text?: string
  state?: 'fired' | 'missed' | 'due'
  roll?: DirectionRoll | null
  who?: string[]
  /** phase 3b: World people of a firing (kinds `rule`, `beat`, `result`) */
  npc?: string[]
  with?: string[]
  why?: string
  payoff?: boolean
  forced?: boolean
  result?: DirectionResult
  by?: 'direction' | 'world' | 'empty' | string
  set?: string
  on?: boolean
}

export interface DirectionScene {
  /** where the cast comes from: the player's lock, the director, the Dashboard, or nothing known */
  source: 'lock' | 'director' | 'dashboard' | 'none'
  present: string[]
  tag: DirectionTag | null
}

export interface DirectionRoll { d1: number; d2: number; total: number; need: number }
export type DirectionResult = 'came' | 'mentioned' | 'missed' | 'yielded' | 'sent'
export type DirectionRuleKind = 'interrupt' | 'join' | 'return'
/** phase 3b: who a rule brings: group members, people of the World, or either */
export type DirectionFrom = 'members' | 'world' | 'any'
export const DIRECTION_FROMS: readonly DirectionFrom[] = ['members', 'world', 'any']
export type DirectionRuleStatus = 'ready' | 'cooldown' | 'payoff' | 'off'
/** a queued note or a firing is a rule's, or (phase 3) a beat's */
export type DirectionNoteKind = DirectionRuleKind | 'beat'

/** What a rule waits for: alone with one member N replies, nobody present N replies, a scene kind (and at most N present), or not a kind. */
export interface DirectionRuleWhen {
  alone?: number
  empty?: number
  tag?: string[]
  tagNot?: string[]
  min?: number
  max?: number
}
/** The built-in numbers of a rule (what "Restore defaults" sends). */
export interface DirectionRuleDefaults { need: number; cooldown: number; k: number; m: number; from: DirectionFrom }

/** One genre rule of the chat's set, with the chat's edits applied and where it stands now. */
export interface DirectionRule {
  id: string
  name: string
  kind: DirectionRuleKind
  on: boolean
  /** 2d6 total needed: 2 = sure, 13 = never */
  need: number
  cooldown: number
  /** payoff: every K-th firing the rule is quiet M replies more (0 = none) */
  k: number
  m: number
  /** the closed condition the rule reads (phase 2): see `DirectionRuleWhen` */
  when?: DirectionRuleWhen
  /** phase 4: the built-in numbers, so the client keeps no copy (an older plugin leaves it out) */
  defaults?: DirectionRuleDefaults
  status: DirectionRuleStatus
  /** replies left of the cooldown or the payoff silence */
  left: number
  tension: number
  /** phase 3b (an older plugin leaves it out: then nothing about World people shows) */
  from?: DirectionFrom
}

/** The note queued for the next reply. */
export interface DirectionNext {
  id: string
  /** a rule's id, or `beat:<id>` for a beat of the plan */
  rule: string
  kind: DirectionNoteKind
  who: string[]
  /** phase 3b: World people who come (ids of `state.world.people`) */
  npc?: string[]
  with: string[]
  after: string
  forced: boolean
  at: number
  /** true while the reply it rides on is still to come */
  due?: boolean
}

/** A firing of a rule: what was rolled, which reply carried the note and how it went. */
export interface DirectionFire {
  id: string
  rule: string
  kind: DirectionNoteKind
  who: string[]
  npc?: string[]
  with: string[]
  after: string
  n: number
  roll: DirectionRoll | null
  tension: number
  hold: number
  payoff: boolean
  result: DirectionResult | null
  /** `<message id>#<swipe>` of the reply that carried the note ("" = not yet) */
  carrier: string
  forced: boolean
  why: string
  at: number
}

export interface DirectionRules {
  /** "" = no genre picked */
  set: string
  on: boolean
  sets: { id: string; name: string }[]
  items: DirectionRule[]
}

// ---------- the beat plan (phase 3a) ----------

export type DirectionBeatWhen = { kind: 'replies'; n: number } | { kind: 'tag'; tag: DirectionTag } | { kind: 'place'; place: string } | { kind: 'manual' }
export type DirectionBeatKind = DirectionBeatWhen['kind']
export type DirectionBeatStatus = 'waiting' | 'due' | 'queued' | 'delivered' | 'skipped' | 'failed' | 'behind'

/** One beat of the plan as the state route reads it: what the player wrote and where it stands now. */
export interface DirectionBeat {
  id: string
  text: string
  /** members who take part (those away come in for it); may be empty */
  who: string[]
  /** phase 3b: people of the World who take part (ids of `state.world.people`) */
  npc?: string[]
  when: DirectionBeatWhen
  /** once due, wait up to `boundaryWait` replies for a new scene */
  wait: boolean
  /** misses so far (two end it) */
  tries: number
  status: DirectionBeatStatus
  /** replies still to count (waiting, replies kind) or replies left of the boundary wait (due) */
  left?: number
  hold?: 'off' | 'lock' | 'explicit'
  result?: DirectionResult
  /** the condition holds (waiting: the beat becomes due at the next report) */
  met?: boolean
}

/** A ready-made beat of the chat's genre (phase 4): text only, a condition and the wait; the player adds who takes part. */
export interface DirectionBeatTemplate {
  id: string
  text: string
  when: DirectionBeatWhen
  wait: boolean
}

export interface DirectionPlan {
  beats: DirectionBeat[]
  whenKinds: string[]
  /** the scene kinds offered in this chat: the base ten and the genre's own (an older plugin: the base ten) */
  tags: DirectionTag[]
  /** phase 4: the genre's ready-made beats, `[]` with no genre (an older plugin leaves it out: nothing shows) */
  templates?: DirectionBeatTemplate[]
  boundaryWait: number
  max: number
  textMax: number
}

/** A beat as the player edits it and as `PUT /direction/plan` takes it: no server fields. A new beat has no id. */
export interface BeatDraft {
  id?: string
  text: string
  who: string[]
  npc: string[]
  when: DirectionBeatWhen
  wait: boolean
  skipped: boolean
}

/** The plugin's limits (the state route sends the same numbers; these are the fallback for an older answer). */
export const BEAT_MAX = 20
export const BEAT_TEXT_MAX = 400
export const BEAT_PLACE_MAX = 80
export const BEAT_REPLIES_MAX = 200

export interface DirectionState {
  config: { model: string }
  chat: { on: boolean; lock: { ids: string[]; at: number } | null; returning: { ids: string[]; after: string; at: number } | null }
  scene: DirectionScene
  report: DirectionReport | null
  members: { id: string; name: string }[]
  log: DirectionLogEntry[]
  usage: { input: number; output: number; runs: number }
  /** phase 2 (an older plugin leaves these out) */
  rules?: DirectionRules
  next?: DirectionNext | null
  fires?: DirectionFire[]
  /** phase 3a: the beat plan (an older plugin leaves it out) */
  plan?: DirectionPlan
  /** phase 3b: the people of this chat's World a beat or a rule may bring (an older plugin leaves it out) */
  world?: DirectionWorld
}

/** One person of the chat's World: `noReturn` = the World does not bring them back by itself, so a rule never picks them. */
export interface DirectionWorldPerson { id: string; name: string; text?: string; noReturn?: boolean }
export interface DirectionWorld { people: DirectionWorldPerson[] }

/** One genre set as `GET /direction/sets` lists it: the group editor has no chat to ask the state route. */
export interface DirectionSetInfo {
  id: string
  name: string
  tags?: string[]
  rules?: { id: string; name: string; kind: DirectionRuleKind }[]
  templates?: number
}
/** What the group editor offers when the route is missing (an older plugin shipped only this set). */
export const FALLBACK_SETS: DirectionSetInfo[] = [{ id: 'romcom', name: 'School rom-com' }]

/** The plugin's genre sets (phase 4: nine). An older plugin or an app without it answers the rom-com entry only. */
export async function fetchDirectionSets(): Promise<DirectionSetInfo[]> {
  try {
    const r = await j<{ sets?: DirectionSetInfo[] }>('/direction/sets')
    return Array.isArray(r.sets) && r.sets.length ? r.sets : FALLBACK_SETS
  } catch {
    return FALLBACK_SETS
  }
}

/** The chance of 2d6 reaching `need`, in percent: 2 is sure, 13 never. */
export const needPercent: Record<number, number> = { 2: 100, 3: 97, 4: 92, 5: 83, 6: 72, 7: 58, 8: 42, 9: 28, 10: 17, 11: 8, 12: 3, 13: 0 }
/** The ranges the plugin clamps a rule's numbers to. */
export const RULE_LIMITS = { need: [2, 13], cooldown: [0, 30], k: [0, 10], m: [0, 20] } as const
export type RuleNumber = keyof typeof RULE_LIMITS

export function clampRuleNumber(field: RuleNumber, n: number): number {
  const [lo, hi] = RULE_LIMITS[field]
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/** The loaded chat's firings and the names of its rules and members, read by the mark under a reply without a fetch per message. */
export interface DirectionMarks {
  chatId: string
  fires: DirectionFire[]
  /** rule id -> name; a beat is `beat:<id>` -> its text */
  rules: Record<string, string>
  members: Record<string, string>
  /** World person id -> name (phase 3b) */
  people?: Record<string, string>
}
export const useDirectionMarks = create<{ chat: DirectionMarks | null }>(() => ({ chat: null }))

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

/** This chat's genre set ("" = none; picking one turns the rules on), the rules switch, or edits to one rule's numbers. */
export async function setDirectionRules(chatId: string, patch: { set?: string; on?: boolean; rule?: { id: string; on?: boolean; from?: DirectionFrom; need?: number; cooldown?: number; k?: number; m?: number } }): Promise<{ set: string; on: boolean }> {
  const r = await j<{ rules: { set: string; on: boolean } }>('/direction/rules', { method: 'PUT', body: JSON.stringify({ chatId, ...patch }) })
  bump()
  return r.rules
}

/** "Fire now": a rule's note rides the next reply. Rejects with the plugin's message when it cannot. */
export async function fireDirectionRule(chatId: string, rule: string): Promise<DirectionNext | null> {
  const r = await j<{ next: DirectionNext | null }>('/direction/fire', { method: 'POST', body: JSON.stringify({ chatId, rule }) })
  bump()
  return r.next
}

/** The whole plan, sent back after any change (a new beat has no id: the plugin gives it one). Rejects with the plugin's message. */
export async function setDirectionPlan(chatId: string, beats: BeatDraft[]): Promise<void> {
  await j<{ plan: { beats: unknown[] } }>('/direction/plan', { method: 'PUT', body: JSON.stringify({ chatId, beats }) })
  bump()
}

/** What the draft route answers: the beats as the plugin wrote them (nothing saved), or a reason. */
export interface DirectionDraft {
  ok: boolean
  beats?: BeatDraft[]
  model?: string
  reason?: 'no-model' | 'not-group' | 'no-chat' | 'bad-reply' | 'empty' | 'error' | 'no-plugin' | string
  message?: string
}

/** A plan drafted from the members' cards: one slow model call (10 to 60 s), nothing is saved. Never rejects: a failure is `{ ok: false, reason }`. */
export async function draftDirectionPlan(chatId: string): Promise<DirectionDraft> {
  try {
    const r = await j<DirectionDraft>('/direction/draft', { method: 'POST', body: JSON.stringify({ chatId }) })
    if (!r.ok || !Array.isArray(r.beats)) return { ok: false, reason: r.reason ?? 'error', message: r.message }
    return { ok: true, model: r.model, beats: r.beats.map((b) => ({ ...b, npc: b.npc ?? [], skipped: false })) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !e.data?.reason) return { ok: false, reason: 'no-plugin' }
    if (e instanceof ApiError && typeof e.data?.reason === 'string') return { ok: false, reason: e.data.reason, message: typeof e.data.message === 'string' ? e.data.message : undefined }
    return { ok: false, reason: 'error', message: String((e as Error)?.message ?? e) }
  }
}

/** "Fire now" for a beat: no condition, no wait; it rides the next reply. Rejects with the plugin's message when it cannot. */
export async function fireDirectionBeat(chatId: string, beat: string): Promise<DirectionNext | null> {
  const r = await j<{ next: DirectionNext | null }>('/direction/fire', { method: 'POST', body: JSON.stringify({ chatId, beat }) })
  bump()
  return r.next
}

/** Drop the queued note. */
export async function skipDirectionNext(chatId: string): Promise<void> {
  await j<{ next: null }>('/direction/skip', { method: 'POST', body: JSON.stringify({ chatId }) })
  bump()
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

/** A new group chat takes the group's default genre (phase 2): best effort, an app without the plugin stays silent. */
export async function directionSetForNewChat(chatId: string, set: string | undefined): Promise<void> {
  if (!set) return
  try {
    await setDirectionRules(chatId, { set })
  } catch {
    /* an app without the plugin, or a set it does not know */
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
