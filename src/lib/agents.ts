// Agents (plugins/agents + the engine's agent sets, docs/DATA-FORMATS.md "Agents") as the app sees them: the agents
// installed in the app, the list a chat runs, and the run after a reply. An app without the plugin answers 404 and
// stays silent.

import { create } from 'zustand'
import { toast } from 'sonner'
import { ApiError, j } from './engine'
import type { MsgKey, Vars } from './i18n'

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
}

export interface ChatAgentItem { agent: string; on: boolean; phase?: AgentPhase; show: string | null }

/** GET|POST /chats/:id/agents: what the chat runs now. */
export interface ChatAgents {
  presetId: string | null
  presetMissing: boolean
  /** true until the chat's first change; then the chat has its own copy */
  followsPreset: boolean
  items: ChatAgentItem[]
}

export interface AgentSet { id: string; name: string; items: { agent: string; on: boolean; phase?: AgentPhase }[] }

export type ChatAgentsOp =
  | { op: 'preset'; preset: string | null }
  | { op: 'reset' }
  | { op: 'add'; agent: string; phase?: AgentPhase }
  | { op: 'remove' | 'toggle' | 'phase' | 'move' | 'show'; agent: string; on?: boolean; phase?: AgentPhase | null; to?: number; place?: string | null }

/** One entry of GET /agents/runs, as far as the app reads it. */
export interface AgentRun { agent: string; key: string; at: number; ms: number; status: 'ok' | 'failed'; reason?: string; calls?: number }

interface AgentsLive {
  /** the newest list per chat, from a read or an edit */
  chats: Record<string, ChatAgents>
  running: Record<string, true>
}

export const useAgentsLive = create<AgentsLive>(() => ({ chats: {}, running: {} }))

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
  return v
}

/** The installed agents; null when the app has no agents plugin. */
export async function listInstalledAgents(): Promise<AgentInfo[] | null> {
  try {
    return (await j<{ agents: AgentInfo[] }>('/agents/list')).agents
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export interface InstallReply { id: string; updated: boolean; needs: string[]; granted: string[]; missing: string[]; unsupported: string[]; warnings: { code: string; message: string }[] }

/** Puts the file in; nothing is allowed yet (the agent waits for the user to confirm the list of needs). */
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
  return (await j<{ runs: AgentRun[] }>(`/agents/runs?chatId=${q(chatId)}`)).runs
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

interface RunReply {
  ok?: boolean
  error?: string
  skipped?: string | { agent: string; why: string }[]
  ran?: { agent: string; status: 'ok' | 'failed'; reason?: string }[]
}

/**
 * Runs the chat's agents (or one, `agent`, by hand). Returns the plugin's answer, or null when there is no plugin
 * or a run for this chat is already going. Failures are shown as a toast; a skipped agent stays quiet.
 */
export async function runAgents(chatId: string, agent?: string): Promise<RunReply | null> {
  if (inFlight.has(chatId)) return null
  inFlight.add(chatId)
  useAgentsLive.setState((s) => ({ running: { ...s.running, [chatId]: true } }))
  try {
    const r = await j<RunReply>('/agents/run', { method: 'POST', body: JSON.stringify({ chatId, ...(agent ? { agent } : {}) }) })
    for (const x of r.ran ?? []) if (x.status === 'failed') toast.error(`${x.agent}: ${x.reason ?? 'failed'}`)
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
