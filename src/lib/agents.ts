// Agents (plugins/agents + the engine's agent sets, docs/DATA-FORMATS.md "Agents") as the app sees them: the agents
// installed in the app, the list a chat runs, and the run after a reply. An app without the plugin answers 404 and
// stays silent.

import { create } from 'zustand'
import { toast } from 'sonner'
import { ApiError, j } from './engine'
import { t as tr, type MsgKey, type Vars } from './i18n'

export type AgentPhase = 'before' | 'parallel' | 'after' | 'manual'

/** One installed agent (GET /agents/list). */
export interface AgentInfo {
  id: string
  name: string
  description: string
  author: string
  version: string
  trigger: { when?: AgentPhase; everyN?: number; keywords?: string[] }
  needs: string[]
  granted: string[]
  /** needs the user has not allowed yet */
  missing: string[]
  /** needs this version of the runner cannot give; the agent waits */
  unsupported: string[]
  maxCalls: number
  errors: { code: string; message: string }[]
  warnings: { code: string; message: string }[]
  runnable: boolean
  /** why it does not run ('' = it does) */
  blocker: string
  /** the places the chat may move this agent's results to; the first is where the author put them */
  places?: string[]
}

/** `wait: false` = the reply does not wait for an agent set to run before it: it runs beside the reply and its hint goes into the next one. Absent = the reply waits. */
export interface ChatAgentItem { agent: string; on: boolean; phase?: AgentPhase; wait?: boolean; show: string | null }

/** GET|POST /chats/:id/agents: what the chat runs now. */
export interface ChatAgents {
  presetId: string | null
  presetMissing: boolean
  /** true until the chat's first change; then the chat has its own copy */
  followsPreset: boolean
  items: ChatAgentItem[]
}

export interface AgentSet { id: string; name: string; items: { agent: string; on: boolean; phase?: AgentPhase; wait?: boolean }[] }

export type ChatAgentsOp =
  | { op: 'preset'; preset: string | null }
  | { op: 'reset' }
  | { op: 'add'; agent: string; phase?: AgentPhase }
  | { op: 'remove' | 'toggle' | 'phase' | 'move' | 'show' | 'wait'; agent: string; on?: boolean; phase?: AgentPhase | null; to?: number; place?: string | null; wait?: boolean }

/** What an agent left for the chat: a note under the reply, choices, a hint for the next reply, or a silent state change. */
export interface AgentOutput {
  kind: 'note' | 'choices' | 'prompt-insert' | 'state-patch'
  title?: string
  text?: string
  short?: string
  label?: string
  choices?: string[]
  show?: string
}

/** One entry of GET /agents/runs, as far as the app reads it. `key` is `<message id>#<swipe>`. */
export interface AgentRun {
  agent: string
  key: string
  at: number
  ms: number
  status: 'ok' | 'failed'
  reason?: string
  calls?: number
  writes?: unknown[]
  refused?: unknown[]
  outputs?: AgentOutput[]
}

/** One widget of a panel (docs/DATA-FORMATS.md, "Agents"); the checker has already vetted it. */
export interface PanelWidget {
  w: 'meter' | 'number' | 'counter' | 'table' | 'list' | 'log' | 'text' | 'actions' | 'html'
  label?: string
  bind?: string
  of?: number
  delta?: string
  last?: number
  columns?: string[]
  items?: { label: string; send: string }[]
}
export type PanelPlace = 'top1' | 'top2' | 'float'
export interface AgentPanel { id: string; title: string; place?: PanelPlace; widgets: PanelWidget[] }
export interface StateField { type: 'number' | 'text' | 'flag' | 'list'; min?: number; max?: number; item?: Record<string, string> }
/** GET /agents/panels: one agent's panels with its state; `prev` = the state before the last run. */
export interface AgentPanelSet {
  agent: string
  name: string
  /** the place the chat chose for this agent, if any */
  show: string | null
  panels: AgentPanel[]
  schema: Record<string, StateField>
  own: Record<string, unknown>
  prev: Record<string, unknown> | null
}

interface AgentsLive {
  /** the newest list per chat, from a read or an edit */
  chats: Record<string, ChatAgents>
  /** the runs the plugin keeps per chat (the newest ones), oldest first */
  runs: Record<string, AgentRun[]>
  /** the panels of the chat's agents with their state */
  panels: Record<string, AgentPanelSet[]>
  /** display names of the installed agents, once the list has been read */
  names: Record<string, string>
  running: Record<string, true>
}

export const useAgentsLive = create<AgentsLive>(() => ({ chats: {}, runs: {}, panels: {}, names: {}, running: {} }))

const keep = (chatId: string, v: ChatAgents) => useAgentsLive.setState((s) => ({ chats: { ...s.chats, [chatId]: v } }))
const forgetChats = () => useAgentsLive.setState({ chats: {} })

const q = (s: string) => encodeURIComponent(s)

export async function loadChatAgents(chatId: string): Promise<ChatAgents> {
  const v = await j<ChatAgents>(`/chats/${q(chatId)}/agents`)
  keep(chatId, v)
  return v
}

export async function editChatAgents(chatId: string, op: ChatAgentsOp): Promise<ChatAgents> {
  const v = await j<ChatAgents>(`/chats/${q(chatId)}/agents`, { method: 'POST', body: JSON.stringify(op) })
  keep(chatId, v)
  // an agent switched on or off changes which panels there are
  void loadAgentPanels(chatId).catch(() => {})
  return v
}

/** The installed agents; null when the app has no agents plugin. */
/** When each installed agent runs by its own trigger, as the last list said: a send reads it without asking the plugin again. */
const triggers = new Map<string, AgentPhase | undefined>()

export async function listInstalledAgents(): Promise<AgentInfo[] | null> {
  try {
    const agents = (await j<{ agents: AgentInfo[] }>('/agents/list')).agents
    triggers.clear()
    for (const a of agents) triggers.set(a.id, a.trigger.when)
    useAgentsLive.setState({ names: Object.fromEntries(agents.map((a) => [a.id, a.name])) })
    return agents
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export interface InstallReply { id: string; updated: boolean; needs: string[]; granted: string[]; missing: string[]; unsupported: string[]; warnings: { code: string; message: string }[] }

/** Puts the file in; nothing is allowed yet (the agent waits for the user to confirm the list of needs). */
/** One file in the workspace's agents/drafts, as GET /agents/drafts reports it. */
export interface AgentDraft {
  name: string
  id: string
  title: string
  description: string
  needs: string[]
  maxCalls: number
  installed: boolean
  errors: { code: string; message: string }[]
  warnings: { code: string; message: string }[]
}

export async function listAgentDrafts(): Promise<AgentDraft[]> {
  return (await j<{ drafts: AgentDraft[] }>('/agents/drafts')).drafts
}

/** The file in one draft. `text` instead of `file` when it is not valid JSON. */
export async function readAgentDraft(name: string): Promise<{ name: string; file?: Record<string, unknown>; text?: string }> {
  return j(`/agents/drafts/${encodeURIComponent(name)}`)
}

/** Saves a draft as the editor left it, errors and all. */
export async function saveAgentDraft(name: string, file: unknown): Promise<void> {
  await j(`/agents/drafts/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ file }) })
}

/** A copy of an installed agent in the drafts, to edit; the name is the agent's id. */
export async function copyAgentToDraft(id: string): Promise<string> {
  return (await j<{ name: string }>('/agents/drafts/copy', { method: 'POST', body: JSON.stringify({ id }) })).name
}

export async function installAgentDraft(name: string): Promise<InstallReply> {
  return j<InstallReply>('/agents/drafts/install', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function deleteAgentDraft(name: string): Promise<void> {
  await j(`/agents/drafts/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function installAgentFile(file: unknown): Promise<InstallReply> {
  return j<InstallReply>('/agents/install', { method: 'PUT', body: JSON.stringify({ file }) })
}

/** The user confirmed the permissions list. */
export async function grantAgent(id: string): Promise<void> {
  await j('/agents/grant', { method: 'POST', body: JSON.stringify({ id, tokens: true }) })
}

export async function removeAgent(id: string): Promise<void> {
  await j(`/agents/${q(id)}`, { method: 'DELETE' })
}

export async function loadAgentRuns(chatId: string): Promise<AgentRun[]> {
  const runs = (await j<{ runs: AgentRun[] }>(`/agents/runs?chatId=${q(chatId)}`)).runs
  useAgentsLive.setState((s) => ({ runs: { ...s.runs, [chatId]: runs } }))
  return runs
}

export async function loadAgentPanels(chatId: string): Promise<AgentPanelSet[]> {
  const panels = (await j<{ panels: AgentPanelSet[] }>(`/agents/panels?chatId=${q(chatId)}`)).panels
  useAgentsLive.setState((s) => ({ panels: { ...s.panels, [chatId]: panels } }))
  return panels
}

/** A panel button: its text goes into the chat's composer; nothing is sent. */
export const COMPOSER_INSERT = 'vertep:composer-insert'
export function insertIntoComposer(chatId: string, text: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COMPOSER_INSERT, { detail: { chatId, text } }))
}

const loading = new Set<string>()

/**
 * Once per chat, when it is opened: the chat's agents and, when it has any, their runs, so the notes under the
 * replies are there. Silent when the app has no agents plugin.
 */
export async function ensureAgentRuns(chatId: string): Promise<void> {
  if (useAgentsLive.getState().chats[chatId] || loading.has(chatId)) return
  loading.add(chatId)
  try {
    const list = await loadChatAgents(chatId)
    if (list.items.length) await Promise.all([loadAgentRuns(chatId), loadAgentPanels(chatId)])
  } catch { /* the plugin is absent or the engine is busy: the notes just do not show */ } finally {
    loading.delete(chatId)
  }
}

export async function listAgentSets(): Promise<AgentSet[]> {
  return (await j<{ items: AgentSet[] }>('/agent-presets')).items
}

export async function saveAgentSet(id: string, name: string, items: AgentSet['items']): Promise<AgentSet> {
  return j<AgentSet>(`/agent-presets/${q(id)}`, { method: 'PUT', body: JSON.stringify({ name, items }) })
}

export async function deleteAgentSet(id: string): Promise<void> {
  await j(`/agent-presets/${q(id)}`, { method: 'DELETE' })
  forgetChats()
}

export async function loadDefaultAgentSet(): Promise<string | null> {
  return (await j<{ defaultPreset: string | null }>('/agent-settings')).defaultPreset
}

export async function setDefaultAgentSet(id: string | null): Promise<void> {
  await j('/agent-settings', { method: 'PUT', body: JSON.stringify({ defaultPreset: id }) })
  // chats that follow the default now follow another set
  forgetChats()
}

/** A file name for a set: lower case, digits and dashes (the engine takes `[A-Za-z0-9][A-Za-z0-9_-]*`). */
export function setIdFromName(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'set'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** The agent's name for people: the installed one's, else its id as words. */
export function nameOf(id: string): string {
  const known = useAgentsLive.getState().names[id]
  if (known) return known
  const w = id.replace(/-/g, ' ')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

// ---------- what a permission means, in words ----------

const SOURCE_KEYS: Record<string, MsgKey> = {
  lastReply: 'ag.need.src.lastReply',
  lastUserMessage: 'ag.need.src.lastUserMessage',
  history: 'ag.need.src.history',
  card: 'ag.need.src.card',
  persona: 'ag.need.src.persona',
  authorNote: 'ag.need.src.authorNote',
  myPrevious: 'ag.need.src.myPrevious',
  summary: 'ag.need.src.summary',
}

type T = (key: MsgKey, vars?: Vars) => string

/** One permission token of an agent file as a sentence the user can judge. Unknown tokens are shown as they are. */
export function describeNeed(token: string, t: T): string {
  if (token === 'llm') return t('ag.need.llm')
  if (token === 'write:prompt') return t('ag.need.prompt')
  if (token === 'show:note') return t('ag.need.note')
  if (token === 'show:choices') return t('ag.need.choices')
  if (token === 'show:panel') return t('ag.need.panel')
  const m = /^(read|write):(state|own)\.(.+)$/.exec(token)
  if (m) {
    const key: MsgKey = m[2] === 'own' ? (m[1] === 'read' ? 'ag.need.ownRead' : 'ag.need.ownWrite') : (m[1] === 'read' ? 'ag.need.dashRead' : 'ag.need.dashWrite')
    return t(key, { field: m[3] })
  }
  const src = /^read:(.+)$/.exec(token)
  if (src && SOURCE_KEYS[src[1]]) return t(SOURCE_KEYS[src[1]])
  return token
}

// ---------- the run after a reply ----------

const inFlight = new Set<string>()
const runId = (r: AgentRun) => `${r.agent}|${r.key}|${r.at}`

interface RunReply {
  ok?: boolean
  error?: string
  skipped?: string | { agent: string; why: string }[]
  ran?: { agent: string; status: 'ok' | 'failed'; reason?: string }[]
}

/**
 * Toasts the runs that failed since `seen` (an agent set to run before or beside the reply fails inside the engine, where
 * the app is not looking, so the log is read). The toast has a button that runs that agent again by hand.
 */
function reportFailures(chatId: string, runs: AgentRun[], seen: Set<string>): void {
  for (const run of runs) {
    if (run.status !== 'failed' || seen.has(runId(run))) continue
    toast.error(`${nameOf(run.agent)}: ${run.reason ?? 'failed'}`, { action: { label: tr('ag.runAgain'), onClick: () => void runAgents(chatId, run.agent) } })
  }
}

/**
 * Runs the chat's agents (or one, `agent`, by hand). Returns the plugin's answer, or null when there is no plugin
 * or a run for this chat is already going. Failures are shown as a toast with a Run again button; a skipped agent stays quiet.
 */
export async function runAgents(chatId: string, agent?: string): Promise<RunReply | null> {
  if (inFlight.has(chatId)) return null
  inFlight.add(chatId)
  useAgentsLive.setState((s) => ({ running: { ...s.running, [chatId]: true } }))
  try {
    const before = new Set((useAgentsLive.getState().runs[chatId] ?? []).map(runId))
    const r = await j<RunReply>('/agents/run', { method: 'POST', body: JSON.stringify({ chatId, ...(agent ? { agent } : {}) }) })
    // the log tells what ran before and beside the reply as well; the notes under the reply and the toasts agents asked for come from it
    const [runs] = await Promise.all([loadAgentRuns(chatId).catch(() => [] as AgentRun[]), loadAgentPanels(chatId).catch(() => [])])
    reportFailures(chatId, runs, before)
    for (const run of runs.filter((x) => !before.has(runId(x))))
      for (const o of run.outputs ?? []) if (o.show === 'toast' && o.text) toast.message(o.title || nameOf(run.agent), { description: o.text })
    return r
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    return { ok: false, error: String((e as Error)?.message ?? e) }
  } finally {
    inFlight.delete(chatId)
    useAgentsLive.setState((s) => {
      const running = { ...s.running }
      delete running[chatId]
      return { running }
    })
  }
}

/** Does this agent run beside the reply: set to, or set to run before it with the reply not waiting? */
function runsBeside(it: ChatAgentItem, trigger: AgentPhase | undefined): boolean {
  const when = it.phase ?? trigger
  return when === 'parallel' || (when === 'before' && it.wait === false)
}

/**
 * A send has started: the agents set to run beside the reply start now, on what the user wrote (the engine has not saved it
 * yet). Quiet when the chat has none, so a plain send costs nothing; what they leave appears when they are done.
 */
export async function triggerParallelAgents(chatId: string, userText: string): Promise<void> {
  try {
    let list = useAgentsLive.getState().chats[chatId]
    if (!list) list = await loadChatAgents(chatId)
    const on = list.items.filter((it) => it.on)
    if (!on.length) return
    if (on.some((it) => !triggers.has(it.agent))) await listInstalledAgents()
    if (!on.some((it) => runsBeside(it, triggers.get(it.agent)))) return
    const seen = new Set((useAgentsLive.getState().runs[chatId] ?? []).map(runId))
    await j('/agents/run', { method: 'POST', body: JSON.stringify({ chatId, phase: 'parallel', userText }) })
    const [runs] = await Promise.all([loadAgentRuns(chatId).catch(() => [] as AgentRun[]), loadAgentPanels(chatId).catch(() => [])])
    reportFailures(chatId, runs, seen)
  } catch { /* the plugin is absent or the engine is busy: nothing runs beside this reply */ }
}

/**
 * After a reply (once the dashboard and the World have had their turn): the agents set to run after a reply.
 * A chat with no agent switched on is not asked at all: every plugin call builds the sandbox again.
 */
export async function triggerAgentsRun(chatId: string, busy: () => boolean): Promise<void> {
  if (busy()) return
  let list = useAgentsLive.getState().chats[chatId]
  if (!list) {
    try { list = await loadChatAgents(chatId) } catch { return }
  }
  if (!list.items.some((it) => it.on)) return
  if (busy()) return
  await runAgents(chatId)
}
