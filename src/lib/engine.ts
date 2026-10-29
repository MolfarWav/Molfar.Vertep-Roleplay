// Engine bridge — the ONLY layer that talks to the Chrysalis engine.
// Everything server-backed flows through here: fetch wrappers, the wire
// types, studio-UI ↔ engine adapters (characters/cards, chats/messages/swipes,
// personas, presets, lorebooks, regex, groups), the /v1/models catalog and
// the WS app_stream client used for live generation deltas.
//
// Routes are app-relative: the engine serves this app at /app/roleplay/ and
// the app's own API lives at /v1/apps/roleplay/* (same origin, session
// cookie auth — the page itself is behind the same session).
import type {
  AltVariant, Character, Chat, Message, Persona, Preset, Lorebook, LoreEntry, RegexScript,
  Swipe, ID, ModelInfo, ModelPricing, PromptSection, DataBankFile, PromptFormatSequences, GroupConfig, ChatTurns,
} from './types'
import { uid } from './tokens'
import { beginImport } from './import-progress'
import { t } from './i18n'
import { defaultSamplers, DEFAULT_COMPACT_HISTORY, EMPTY_PROMPT_FORMAT, GENERATION_TYPES } from './seed'
import { DEFAULT_AVATAR, storedMediaUrl } from './utils'
import { saveFile } from './export'
import { markedExport } from './profile'
import { markProfileSections } from './export-prefs'

// frame URL is /app/<user>/<app>/ (cookieless sandboxed origin)
export const APP_ID = decodeURIComponent(location.pathname.split('/').filter(Boolean)[2] ?? 'roleplay')
export const API = `/v1/apps/${APP_ID}`

// ─────────────────────────────────────────────────────────────────────────────
// Wire types (engine plugin shapes — see plugins/engine/plugin.js)
// ─────────────────────────────────────────────────────────────────────────────
export interface EngineCard {
  id?: string
  spec?: string
  name: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  /** card-spec v3: greetings used only when the character is in a group chat */
  group_only_greetings?: string[]
  /** spec extensions bag, preserved verbatim */
  extensions?: Record<string, unknown>
  creator_notes?: string
  tags?: string[]
  avatar?: string | null
  creator?: string
  character_version?: string
  /** Studio metadata bag persisted verbatim alongside the standard fields. */
  studio?: Record<string, unknown>
  [k: string]: unknown
}

export interface EngineMessage {
  id: string
  name: string
  charId: string | null
  role: 'user' | 'char' | 'system'
  text: string
  at: number
  swipes?: string[]
  swipe?: number
  greeting?: boolean
  edited?: boolean
  hidden?: boolean
  bookmarked?: boolean
  bookmarkLabel?: string
  translation?: string
  attachments?: Message['attachments']
  picture?: boolean
  personaId?: string
  extra?: { model?: string; usage?: Swipe['usage']; continued?: boolean; genMs?: number; params?: Record<string, unknown>; reasoning?: string; reasoningMs?: number; tools?: Swipe['tools']; parts?: Swipe['parts']; /** per-swipe generation facts, index-aligned with swipes (null = no data, e.g. client-cancelled commits) */ swipeMeta?: ({ model?: string; usage?: Swipe['usage']; genMs?: number } | null)[] }
}

export interface EngineChatMeta {
  id: string
  title: string
  characterId: string | null
  groupId: string | null
  presetId?: string | null
  presetVars?: Chat['presetVars']
  presetNotes?: Chat['presetNotes']
  personaId?: string | null
  /** this chat's model, when it has one of its own */
  model?: string | null
  userName?: string
  authorNote?: string | null
  authorNoteObject?: Chat['authorNote']
  lorebookIds?: string[]
  folderId?: string | null
  pinned?: boolean
  chatTags?: string[]
  backgroundId?: string | 'none' | null
  autoBackground?: { on: boolean; folderId: string } | null
  temporary?: boolean
  litopysCut?: { count: number; upTo: string | null }
  /** where the last real prompt's history started (messages before it were cut), null before any */
  promptCut?: { count: number; upTo: string | null } | null
  fieldVariantSelection?: Chat['fieldVariantSelection']
  turns?: ChatTurns
  parentChatId?: string | null
  parentMessageId?: string | null
  createdAt: number
  updatedAt?: number
  tainted?: boolean
  messageCount?: number
  preview?: string
  /** does the transcript contain a user turn? The boot sweep deletes chats
   *  that were created and never went anywhere, and it cannot read a
   *  transcript it did not load — without this a chat holding one USER
   *  message would look abandoned. */
  hasUser?: boolean
}

/** groups/<id>.json; the shape lives in types.ts */
export type EngineGroup = GroupConfig

export interface EngineLorebook {
  id?: string
  name: string
  entries: Array<{
    uid?: number
    keys: string[]
    secondaryKeys?: string[]
    selectiveLogic?: string
    content: string
    enabled?: boolean
    constant?: boolean
    order?: number
    position?: string
    depth?: number
    probability?: number
    role?: string
    [k: string]: unknown
  }>
  [k: string]: unknown
}

export interface EnginePreset {
  id?: string
  name: string
  prompts?: Array<{ identifier: string; name?: string; role?: string; content?: string; marker?: boolean; injection_position?: string; injection_depth?: number }>
  prompt_order?: Array<{ character_id?: number; order?: Array<{ identifier: string; enabled?: boolean }> }>
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  repetition_penalty?: number
  rep_pen?: number
  frequency_penalty?: number
  presence_penalty?: number
  openai_max_tokens?: number
  openai_max_context?: number
  reasoning?: string
  [k: string]: unknown
}

export interface EngineRegex {
  id?: string
  scriptName: string
  findRegex: string
  replaceString?: string
  placement?: string[]
  markdownOnly?: boolean
  promptOnly?: boolean
  disabled?: boolean
  minDepth?: number | null
  maxDepth?: number | null
  flags?: string
  [k: string]: unknown
}

export interface EngineModel {
  provider: string
  modelId: string
  label: string
  api: string
  connectionName: string | null
  contextWindow: number | null
  reasoning: boolean
  /** takes pictures as input (from the engine catalog) */
  images?: boolean
  pricing: ModelPricing | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  status: number
  /** A machine-readable reason, when the route sends one ({ error, code }), plus what it carries. */
  code?: string
  data?: Record<string, unknown>
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message)
    this.status = status
    if (data) { this.data = data; if (typeof data.code === 'string' && data.code) this.code = data.code }
  }
}

export async function j<T>(path: string, init?: RequestInit & { body?: string; signal?: AbortSignal }): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'Connection lost. Is the Molfar Vertep engine running?')
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string; [k: string]: unknown }
    // statusText is empty over HTTP/2 and on plenty of proxies: an error with
    // no message reaches the UI as a toast with nothing in it
    throw new ApiError(res.status, e.error || res.statusText || `engine returned ${res.status}`, e)
  }
  return res.json() as Promise<T>
}

/** Everything the app needs to boot, in ONE plugin dispatch. Each route call
 *  rebuilds the plugin sandbox, so ten collection calls plus a transcript
 *  call per chat cost seconds; this costs one. Shapes match the individual
 *  routes exactly (the plugin builds it from them). */
export interface EngineBootstrap {
  characters: EngineCard[]
  groups: EngineGroup[]
  personas: Record<string, unknown>[]
  presets: Record<string, unknown>[]
  lorebooks: Record<string, unknown>[]
  regex: Record<string, unknown>[]
  settings: { model: string | null; personaId: string | null; ui?: Record<string, unknown> }
  library: Record<string, unknown>
  databank: { files?: DataBankFile[] }
  /** List metas ONLY — each carries preview/messageCount/hasUser. Transcripts
   *  load one chat at a time through /chats/:id (see ensureChatMessages). */
  chats: EngineChatMeta[]
  /** The chat the client asked for, so opening the app is still one request. */
  activeChat: { meta: EngineChatMeta; messages: EngineMessage[] } | null
  /** Characters not in the list yet (the index ran out of time): ask /characters/summaries again.
   *  Absent before Roleplay 4.49.0's plugin. */
  charactersPending?: number
  /** Books not in the list yet (the index ran out of time): ask /lorebooks?summaries=1 again.
   *  `lorebooks` holds summaries (`stub: true`, no entries), not whole books. */
  lorebooksPending?: number
}

/** The start-up list again (what /bootstrap left pending, or a refresh): summaries, not cards. */
export function fetchCharacterSummaries(): Promise<{ characters: EngineCard[]; pending: number }> {
  return j<{ characters: EngineCard[]; pending: number }>('/characters/summaries')
}

/** The lorebook list again (what /bootstrap left pending, or a refresh): summaries, not whole books. */
export function fetchBookSummaries(): Promise<{ items: Record<string, unknown>[]; pending: number }> {
  return j<{ items: Record<string, unknown>[]; pending: number }>('/lorebooks?summaries=1')
}

/** One lorebook, whole (entries included). */
export function fetchBook(id: string): Promise<EngineLorebook> {
  return j<EngineLorebook>(`/lorebooks/${encodeURIComponent(id)}`)
}

/** One character's whole card. */
export function fetchCharacterCard(id: string): Promise<EngineCard> {
  return j<EngineCard>(`/characters/${encodeURIComponent(id)}`)
}

/** Portraits the summaries left out (data URLs inside the cards), as many as one answer holds;
 *  `rest` are the ids to ask for again. */
export function fetchCharacterAvatars(ids: string[]): Promise<{ avatars: Record<string, string>; rest: string[] }> {
  return j<{ avatars: Record<string, string>; rest: string[] }>('/characters/avatars', { method: 'POST', body: JSON.stringify({ ids }) })
}

/** `chatId` asks for that chat's transcript inline — pass the one about to be
 *  shown so the first paint needs no follow-up fetch. */
export function fetchBootstrap(chatId?: string | null): Promise<EngineBootstrap> {
  return j<EngineBootstrap>(chatId ? `/bootstrap?chat=${encodeURIComponent(chatId)}` : '/bootstrap')
}

/** A starred model of the engine's quick switch (set in the shell's Settings), with an optional name. */
export interface ModelFavorite { ref: string; name?: string }

/** The model the engine sends pictures to (Settings > Connections and models > Vision model:
 *  the user's pick, or Auto = the cheapest that reads pictures). null when none does, or on
 *  an engine before 0.9.8 (no route). */
export async function fetchVisionModel(): Promise<string | null> {
  try {
    const r = await fetch('/v1/models/vision')
    if (!r.ok) return null
    const { ref } = (await r.json()) as { ref?: unknown }
    return typeof ref === 'string' && ref ? ref : null
  } catch {
    return null
  }
}

/** The models the pickers show, and the quick switch the engine keeps (0.9.2; [] on older engines). */
export async function fetchModels(): Promise<{ models: ModelInfo[]; favorites: ModelFavorite[] }> {
  try {
    const r = await fetch('/v1/models')
    if (!r.ok) return { models: [], favorites: [] }
    const { models, favorites } = (await r.json()) as { models?: EngineModel[]; favorites?: ModelFavorite[] }
    return { favorites: Array.isArray(favorites) ? favorites.filter((f) => f && typeof f.ref === 'string') : [], models: (models ?? []).map((m) => ({
      id: m.modelId,
      // display grouping wants the human connection name; SELECTION must use
      // the qualified ref — model names repeat across providers and the
      // engine's resolver prefers "<provider>/<model id>" (unambiguous)
      provider: m.connectionName || m.provider,
      ref: `${m.provider}/${m.modelId}`,
      api: m.api,
      context: m.contextWindow ?? 0,
      maxOut: 0,
      reasoning: m.reasoning,
      images: m.images === true,
      pricing: m.pricing ?? null,
    })) }
  } catch { return { models: [], favorites: [] } }
}

/** The instruct formats the engine can write a text completion prompt in. */
export interface EnginePromptFormat extends PromptFormatSequences { id: string; name: string }
export async function fetchPromptFormats(): Promise<EnginePromptFormat[]> {
  const r = await fetch('/v1/models/prompt-formats')
  if (!r.ok) throw new Error(`prompt formats: HTTP ${r.status}`)
  return ((await r.json()) as { formats: EnginePromptFormat[] }).formats
}

/** The format a text completion model is written in when the connection
 *  decides, and how it was decided. */
export interface ResolvedPromptFormat {
  id: string
  name: string
  source: 'request' | 'connection' | 'template' | 'model name' | 'fallback'
}
export async function fetchPromptFormatFor(ref: string, matchModel: boolean): Promise<ResolvedPromptFormat> {
  const r = await fetch(`/v1/models/prompt-format?model=${encodeURIComponent(ref)}${matchModel ? '&format=auto' : ''}`)
  const body = (await r.json().catch(() => ({}))) as ResolvedPromptFormat & { error?: string }
  if (!r.ok) throw new Error(body.error ?? `prompt format: HTTP ${r.status}`)
  return body
}

/** Image-capable models from the engine's pi-ai images bridge (empty until a
 *  provider with image models has credentials engine-side). */
export interface ImageModelInfo {
  provider: string; id: string; label: string; api: string; connectionName: string | null
  /** On the user's list in the engine's Settings > Images (engine 1.2.1+): their name and what it is for. */
  favorite?: { name?: string; use?: string }
  /** Image servers (engine 1.2.1+): how their prompts are best written, and the user's own guidance for them. */
  style?: 'tags' | 'description'
  instructions?: string
}
/** The engine's image models, the user's own list (Settings > Images) first in its order. */
export async function fetchImageModels(): Promise<ImageModelInfo[]> {
  try {
    const r = await fetch('/v1/images/models')
    if (!r.ok) return []
    const { models, favorites } = (await r.json()) as { models?: ImageModelInfo[]; favorites?: { ref: string; name?: string; use?: string }[] }
    return sortImageFavorites(models ?? [], favorites ?? [])
  } catch { return [] }
}

export function sortImageFavorites(models: ImageModelInfo[], favorites: { ref: string; name?: string; use?: string }[]): ImageModelInfo[] {
  const byRef = new Map(models.map((m) => [`${m.provider}/${m.id}`, m]))
  const mine: ImageModelInfo[] = []
  for (const f of favorites) {
    const m = byRef.get(f.ref)
    if (!m || mine.includes(m)) continue
    mine.push({ ...m, favorite: { ...(f.name ? { name: f.name } : {}), ...(f.use ? { use: f.use } : {}) } })
  }
  const taken = new Set(mine.map((m) => `${m.provider}/${m.id}`))
  return [...mine, ...models.filter((m) => !taken.has(`${m.provider}/${m.id}`))]
}

/** Engine connections (names/ids/endpoints only — keys never leave). */
export interface EngineConnectionInfo {
  id: string
  name: string
  providerId?: string
  api?: string
  baseUrl?: string
  oauthProvider?: string
  hasKey: boolean
}
export async function fetchEngineConnections(): Promise<EngineConnectionInfo[]> {
  try {
    const r = await fetch('/v1/settings/connections')
    if (!r.ok) return []
    const { connections } = (await r.json()) as { connections?: EngineConnectionInfo[] }
    return connections ?? []
  } catch { return [] }
}

/** Set (or clear with null) one model's context window override. The user's
 *  number wins over the catalog's official value, engine-side, for every app.
 *  Throws on engine errors — callers surface them. */
export async function setEngineModelContext(ref: string, contextWindow: number | null): Promise<void> {
  const r = await fetch('/v1/models/context', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref, contextWindow }),
  })
  if (!r.ok) {
    const { error } = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `engine returned ${r.status}`)
  }
}

/** Set (or clear with null) one model's prices, USD per million tokens. Custom
 *  endpoints and proxies are in no price catalog, so this is the only way the
 *  spend they report can be a real number. Throws on engine errors. */
export async function setEngineModelPricing(ref: string, pricing: ModelPricing | null): Promise<void> {
  const r = await fetch('/v1/models/pricing', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref, pricing }),
  })
  if (!r.ok) {
    const { error } = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `engine returned ${r.status}`)
  }
}

/** Installed plugins as the engine sees them (GET /v1/plugins): this app's
 *  bundled plugins plus user-scope ones. Read-only — installing and capability
 *  grants happen engine-side; apps only ever consume. */
export interface EnginePluginInfo {
  id: string
  source: string
  manifest: {
    name?: string
    version?: string
    description?: string
    origin?: string
    permissions?: string[]
    networkHosts?: string[]
  }
  needsApproval: boolean
  grantedCapabilities: string[]
  pendingCapabilities: string[]
  /** switched off engine-side: not executing (routes, tools, panels) */
  disabled?: boolean
}
export async function fetchEnginePlugins(): Promise<EnginePluginInfo[]> {
  try {
    const r = await fetch('/v1/plugins')
    if (!r.ok) return []
    const { plugins } = (await r.json()) as { plugins?: EnginePluginInfo[] }
    return plugins ?? []
  } catch { return [] }
}

/** Engine provider catalog (builtin + curated + custom): what an app can
 *  connect as. `hasKey` reflects the ENGINE's credential store — keys never
 *  reach app storage in either direction. */
export interface EngineProviderInfo {
  id: string
  label: string
  kind: 'builtin' | 'curated' | 'needs-setup' | string
  baseUrl: string | null
  apiKeyAuth: boolean
  oauth: boolean
  oauthLabel: string | null
  hasKey: boolean
}
export async function fetchEngineProviders(): Promise<EngineProviderInfo[]> {
  try {
    const r = await fetch('/v1/settings/providers')
    if (!r.ok) return []
    const { providers } = (await r.json()) as { providers?: EngineProviderInfo[] }
    return providers ?? []
  } catch { return [] }
}

/** Engine speech endpoints (OpenAI-compatible /audio/speech servers the
 *  user configured engine-side; keys live in the engine's auth store). */
export interface SpeechEndpointInfo { id: string; name: string; baseUrl: string; model: string; voice?: string; hasKey: boolean }
export async function fetchSpeechEndpoints(): Promise<SpeechEndpointInfo[]> {
  try {
    const r = await fetch('/v1/audio/speech/endpoints')
    if (!r.ok) return []
    const { endpoints } = (await r.json()) as { endpoints?: SpeechEndpointInfo[] }
    return endpoints ?? []
  } catch { return [] }
}

/** Edge neural voices the engine can synthesize keylessly. */
export async function fetchEdgeVoices(): Promise<string[]> {
  try {
    const r = await fetch('/v1/audio/voices')
    if (!r.ok) return []
    const { edge } = (await r.json()) as { edge?: string[] }
    return edge ?? []
  } catch { return [] }
}

/** MCP servers the engine shares with apps; `use` is false until this app
 *  switches the server on for itself (engine route: /v1/apps/<app>/mcp). */
export interface McpServerInfo {
  id: string
  type: string
  connected: boolean
  enabled: boolean
  tools?: number
  error?: string
  use: boolean
}
export async function fetchAppMcp(): Promise<McpServerInfo[]> {
  return (await j<{ servers: McpServerInfo[] }>('/mcp')).servers
}
/** Switch an engine-shared server on or off for this app. */
export function setAppMcpUse(id: string, use: boolean): Promise<unknown> {
  return engineCall(`/v1/apps/${APP_ID}/mcp/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ use }) })
}
async function engineCall<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
  const b = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new ApiError(r.status, b.error ?? `engine returned ${r.status}`)
  return b
}

/** One-shot speech synthesis through the engine: Edge voices (keyless) or a
 *  configured speech endpoint — credentials never leave the engine. Returns
 *  the clip as a Blob (data: URLs are unusable for media in some webviews,
 *  so the base64 never becomes one client-side). */
export async function engineSpeech(opts: {
  text: string
  provider?: 'edge' | 'endpoint'
  endpointId?: string
  model?: string
  voice: string
  speed: number
  /** 'webm' requests opus-in-webm — for builds without the mp3 decoder */
  format?: 'webm'
}): Promise<Blob> {
  const r = await fetch('/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  })
  const b = (await r.json().catch(() => ({}))) as { dataUrl?: string; error?: string }
  if (!r.ok || !b.dataUrl) throw new ApiError(r.status, b.error ?? 'speech synthesis failed')
  const b64 = b.dataUrl.slice(b.dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: opts.format === 'webm' ? 'audio/webm' : 'audio/mpeg' })
}

// ─────────────────────────────────────────────────────────────────────────────
// WS app_stream + look_changed — live generation deltas AND data-change
// pings. `look_changed {app:'roleplay'}` fires whenever anything under the
// app dir changes on disk (agent edit, watcher rebuild, another client) —
// the UI re-hydrates so agent edits appear instantly.
// ─────────────────────────────────────────────────────────────────────────────
// The app reloads itself for exactly two reasons — newer engine code, or a
// fresh build of the app. Both leave a note the next load reads back and
// shows, so a reload the reader did not expect is attributable: no note means
// it came from the browser (a backgrounded page dropped, a crashed renderer),
// not from here.
const RELOAD_NOTE_KEY = 'chrysalis.reload-reason'

/** Leave the note without reloading — for a reload somebody else performs. */
export function noteReload(reason: string): void {
  try { sessionStorage.setItem(RELOAD_NOTE_KEY, reason) } catch { /* storage unavailable */ }
}

export function reloadWithReason(reason: string): void {
  noteReload(reason)
  location.reload()
}

/** Reads the note the last self-reload left, and clears it. */
export function takeReloadReason(): string | null {
  try {
    const reason = sessionStorage.getItem(RELOAD_NOTE_KEY)
    if (reason) sessionStorage.removeItem(RELOAD_NOTE_KEY)
    return reason
  } catch {
    return null
  }
}

// Engine build stamp (WS hello): a changed stamp across reconnects = the
// engine restarted with newer code than this tab runs → self-reload (deferred
// while the tab is hidden).
let seenBuild: number | null = null
let reloadPending = false
function onHelloBuild(build: unknown): void {
  if (typeof build !== 'number') return
  if (seenBuild === null) { seenBuild = build; return }
  if (build === seenBuild) return
  reloadPending = true
  const reload = () => reloadWithReason('Reloaded: the engine restarted with newer code')
  if (document.visibilityState === 'visible') reload()
  else
    document.addEventListener(
      'visibilitychange',
      () => { if (document.visibilityState === 'visible' && reloadPending) reload() },
      { once: true },
    )
}

export interface StreamToolEvent {
  phase: 'start' | 'end'
  name: string
  args: Record<string, unknown>
  result?: { text: string; isError: boolean }
}

export function connectStreams(
  onDelta: (chatId: string, name: string, delta: string) => void,
  onDataChanged?: (paths?: string[]) => void,
  onThinking?: (chatId: string, delta: string) => void,
  onTool?: (chatId: string, ev: StreamToolEvent) => void,
  onConnectionsChanged?: () => void,
): () => void {
  // no trailing colon on either branch — the template supplies '://'.
  // (This used to be 'wss:' vs 'ws', which built 'wss:://' under https —
  // e.g. through a Cloudflare tunnel — the WS constructor threw.)
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  let ws: WebSocket | null = null
  let closed = false
  let backoff = 800
  const open = () => {
    if (closed) return
    ws = new WebSocket(`${proto}://${location.host}/v1/ws`)
    ws.onopen = () => { backoff = 800 }
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as { type?: string; build?: unknown; payload?: { chatId?: string; name?: string; delta?: string; thinking?: string; tool?: StreamToolEvent; app?: string; paths?: string[] } }
        if (frame.type === 'app_stream' && frame.payload?.chatId) {
          if (frame.payload.thinking != null && onThinking) onThinking(frame.payload.chatId, frame.payload.thinking)
          else if (frame.payload.tool && onTool) onTool(frame.payload.chatId, frame.payload.tool)
          else onDelta(frame.payload.chatId, frame.payload.name ?? '', frame.payload.delta ?? '')
        } else if (frame.type === 'look_changed' && frame.payload?.app && onDataChanged) {
          onDataChanged(frame.payload.paths)
        } else if (frame.type === 'connections_changed' && onConnectionsChanged) {
          onConnectionsChanged()
        } else if (frame.type === 'hello') {
          onHelloBuild(frame.build)
        }
      } catch { /* not a frame we care about */ }
    }
    ws.onclose = () => { if (!closed) { setTimeout(open, backoff); backoff = Math.min(backoff * 2, 15000) } }
    ws.onerror = () => ws?.close()
  }
  open()
  return () => { closed = true; ws?.close() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Character adapter (card ⇄ studio Character; group entities ⇄ group Characters)
// ─────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER = DEFAULT_AVATAR

/** Fields the adapters own; any OTHER card field is preserved verbatim on the
 *  character (v3 extras, the spec extensions bag, future spec additions). */
const CARD_KNOWN = new Set([
  'id', 'spec', 'spec_version', 'studio', 'name', 'description', 'personality', 'scenario',
  'first_mes', 'mes_example', 'alternate_greetings', 'group_only_greetings', 'creator_notes', 'tags',
  'system_prompt', 'post_history_instructions', 'avatar', 'creator', 'character_version', 'character_book',
  // a start-up summary's own fields (the plugin's cardSummary), never card data
  'stub', 'blurb', 'tokens', 'spriteCount', 'avatarLazy', 'rev',
])
function cardExtrasOf(card: EngineCard): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(card)) {
    if (CARD_KNOWN.has(k) || v === undefined || v === null) continue
    out[k] = v
  }
  return out
}

// card.json is a plain file: the built-in agent, a script or another tool may
// write a list as one string, a number for a text, an object where a list goes.
// The adapter is the one door every screen reads a card through, so it hands
// them the types they expect; a wrong shape must never take a page down.
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fallback
/** Strings of a list; one string is one item (a greeting), or split (`sep`: tags). */
const texts = (v: unknown, sep?: RegExp): string[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (typeof x === 'string' ? [x] : typeof x === 'number' ? [String(x)] : []))
    : typeof v === 'string' && v.trim()
      ? (sep ? v.split(sep).map((x) => x.trim()).filter(Boolean) : [v])
      : []
const records = <T,>(v: unknown, fix: (r: Record<string, unknown>, i: number) => T | null): T[] =>
  Array.isArray(v) ? v.flatMap((r, i) => { const out = isRecord(r) ? fix(r, i) : null; return out ? [out] : [] }) : []
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}
const variants = (v: unknown): AltVariant[] =>
  records(v, (r, i) => ({ ...r, id: text(r.id) || `v${i}`, label: text(r.label), content: text(r.content) }))

export function cardToCharacter(card: EngineCard, id: string, lastChatAt = 0): Character {
  const studio = (isRecord(card.studio) ? card.studio : {}) as Record<string, unknown>
  const depth = isRecord(studio.depthPrompt) ? studio.depthPrompt : {}
  const colors = isRecord(studio.colors) ? studio.colors : {}
  const role = depth.role === 'user' || depth.role === 'assistant' ? depth.role : 'system'
  const extensions = card.extensions as { group_greetings?: unknown } | undefined
  return {
    id,
    name: text(card.name) || 'Unnamed',
    avatar: storedMediaUrl(text(card.avatar) || text(studio.avatar) || PLACEHOLDER),
    altAvatars: texts(studio.altAvatars).map(storedMediaUrl),
    description: text(card.description),
    personality: text(card.personality),
    scenario: text(card.scenario),
    firstMessage: text(card.first_mes),
    altGreetings: texts(card.alternate_greetings),
    // v3 group-only greetings; the legacy extension spelling also reads
    groupGreetings: Array.isArray(card.group_only_greetings)
      ? texts(card.group_only_greetings)
      : texts(isRecord(extensions) ? extensions.group_greetings : undefined),
    exampleDialogue: text(card.mes_example),
    systemPromptOverride: text(card.system_prompt),
    postHistoryInstructions: text(card.post_history_instructions),
    depthPrompt: { text: text(depth.text), depth: num(depth.depth, 4), role },
    creatorNotes: text(card.creator_notes),
    creator: text(card.creator),
    version: text(card.character_version),
    tags: texts(card.tags, /[,;\n]/),
    favorite: studio.favorite === true,
    folderId: typeof studio.folderId === 'string' ? studio.folderId : null,
    createdAt: num(studio.createdAt, 0),
    lastChatAt: num(studio.lastChatAt, lastChatAt),
    embeddedLorebookId: typeof studio.embeddedLorebookId === 'string' ? studio.embeddedLorebookId : null,
    linkedLorebookIds: texts(studio.linkedLorebookIds),
    colors: { name: text(colors.name), dialogue: text(colors.dialogue), bubble: text(colors.bubble) },
    voices: records(studio.voices, (r) => ({ name: text(r.name).trim(), color: typeof r.color === 'string' ? r.color : '' })).filter((v) => v.name),
    stats: records(studio.stats, (r, i) => ({ ...r, id: text(r.id) || `s${i}`, name: text(r.name), initial: num(r.initial, 0), max: num(r.max, 100), color: text(r.color) })),
    isGroup: false,
    descVariants: variants(studio.descVariants),
    personalityVariants: variants(studio.personalityVariants),
    scenarioVariants: variants(studio.scenarioVariants),
    versions: records(studio.versions, (r, i) => ({
      ...r, id: text(r.id) || `ver${i}`, label: text(r.label), savedAt: num(r.savedAt, 0), snapshot: (isRecord(r.snapshot) ? r.snapshot : {}) as Partial<Character>,
    })),
    voiceProvider: text(studio.voiceProvider),
    voiceId: text(studio.voiceId),
    // unknown card fields (v3 extras + the spec extensions bag) ride the
    // character so edits can write them back — imports must not destroy data
    cardExtras: Object.keys(cardExtrasOf(card)).length ? cardExtrasOf(card) : undefined,
    gallery: records(studio.gallery, (g, i) => {
      const url = text(g.url)
      return url ? { ...g, id: text(g.id) || `g${i}`, url: storedMediaUrl(url), type: g.type === 'video' ? 'video' as const : 'image' as const, caption: text(g.caption) } : null
    }),
    expressions: records(studio.expressions, (e) => {
      const name = text(e.name)
      const url = text(e.url)
      return name ? { ...e, name, url: url ? storedMediaUrl(url) : null } : null
    }),
    defaultExpression: text(studio.defaultExpression) || 'neutral',
    characterRegexIds: texts(studio.characterRegexIds),
    css: text(studio.css),
    // the card file's size and change time as the engine saw them (absent on an engine without fs.stat)
    ...(typeof card.rev === 'string' && card.rev ? { rev: card.rev } : {}),
    // a start-up summary: the texts, variants, versions, sprites and gallery are not here yet
    ...(card.stub === true ? {
      stub: true as const,
      blurb: text(card.blurb),
      tokens: num(card.tokens, 0),
      spriteCount: num(card.spriteCount, 0),
      ...(card.avatarLazy === true ? { avatarLazy: true as const } : {}),
    } : {}),
  }
}

export function characterToCard(c: Character): EngineCard {
  return {
    // the engine refuses to write a summary as a whole card: it would blank the texts
    ...(c.stub ? { _stub: true } : {}),
    spec: 'chara_card_v2',
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMessage,
    mes_example: c.exampleDialogue,
    ...(c.systemPromptOverride ? { system_prompt: c.systemPromptOverride } : {}),
    ...(c.postHistoryInstructions ? { post_history_instructions: c.postHistoryInstructions } : {}),
    ...(c.altGreetings.length ? { alternate_greetings: c.altGreetings } : {}),
    ...(c.groupGreetings.length ? { group_only_greetings: c.groupGreetings } : {}),
    ...(c.creatorNotes ? { creator_notes: c.creatorNotes } : {}),
    ...(c.tags.length ? { tags: c.tags } : {}),
    ...(c.avatar && c.avatar !== PLACEHOLDER ? { avatar: c.avatar } : {}),
    ...(c.creator ? { creator: c.creator } : {}),
    ...(c.version ? { character_version: c.version } : {}),
    // preserved unknown card-spec fields go back where they came from
    ...c.cardExtras,
    studio: {
      avatar: c.avatar, altAvatars: c.altAvatars, depthPrompt: c.depthPrompt,
      favorite: c.favorite, folderId: c.folderId, createdAt: c.createdAt, lastChatAt: c.lastChatAt,
      embeddedLorebookId: c.embeddedLorebookId, linkedLorebookIds: c.linkedLorebookIds,
      colors: c.colors, ...(c.voices?.length ? { voices: c.voices } : {}), stats: c.stats, descVariants: c.descVariants,
      personalityVariants: c.personalityVariants, scenarioVariants: c.scenarioVariants,
      versions: c.versions, voiceProvider: c.voiceProvider, voiceId: c.voiceId,
      gallery: c.gallery, expressions: c.expressions, defaultExpression: c.defaultExpression,
      characterRegexIds: c.characterRegexIds, css: c.css,
    },
  }
}

/** What changed between two saved forms of a card, as the PATCH /characters/:id body
 *  (null when nothing did). Values compare as JSON; the studio bag key by key. */
export function cardPatch(prev: EngineCard, next: EngineCard): Record<string, unknown> | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const diff = (a: Record<string, unknown>, b: Record<string, unknown>, skip: string[]) => {
    const set: Record<string, unknown> = {}
    const unset: string[] = []
    for (const k of Object.keys(b)) if (!skip.includes(k) && b[k] !== undefined && !same(a[k], b[k])) set[k] = b[k]
    for (const k of Object.keys(a)) if (!skip.includes(k) && a[k] !== undefined && b[k] === undefined) unset.push(k)
    return { set, unset }
  }
  const top = diff(prev as Record<string, unknown>, next as Record<string, unknown>, ['studio', 'spec'])
  const st = diff((prev.studio ?? {}) as Record<string, unknown>, (next.studio ?? {}) as Record<string, unknown>, [])
  const out: Record<string, unknown> = {}
  if (Object.keys(top.set).length) out.set = top.set
  if (top.unset.length) out.unset = top.unset
  if (Object.keys(st.set).length) out.studio = st.set
  if (st.unset.length) out.studioUnset = st.unset
  return Object.keys(out).length ? out : null
}

// ── Card export: a V2 envelope that other apps read, with the card's own book ──
const ST_POSITION: Record<string, number> = {
  before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4,
  before_em: 5, after_em: 6, before_examples: 5, after_examples: 6,
}
const ST_LOGIC = ['AND_ANY', 'NOT_ALL', 'NOT_ANY', 'AND_ALL']
const ST_ROLE = ['system', 'user', 'assistant']

/** A lorebook as a card-spec `character_book` (ST's extension fields; the importer reads them back). */
export function lorebookToCharacterBook(b: Lorebook): Record<string, unknown> {
  if (b.stub) throw new Error(`lorebook ${b.id} is only a summary: load the book before exporting it`)
  return {
    name: b.name,
    description: '',
    scan_depth: b.settings.scanDepth,
    recursive_scanning: b.settings.recursiveScan !== false,
    extensions: {},
    entries: b.entries.map((e, i) => ({
      id: typeof e.uid === 'number' ? e.uid : i,
      keys: e.keys,
      secondary_keys: e.secondaryKeys,
      comment: e.title,
      content: e.content,
      constant: e.status === 'constant',
      selective: e.secondaryKeys.length > 0,
      insertion_order: e.order,
      enabled: e.enabled,
      position: e.position === 'before_char' ? 'before_char' : 'after_char',
      extensions: {
        position: ST_POSITION[e.position] ?? 1,
        depth: e.depth,
        role: Math.max(0, ST_ROLE.indexOf(e.role)),
        selectiveLogic: Math.max(0, ST_LOGIC.indexOf(e.logic)),
        probability: e.useProbability ? e.probability : 100,
        useProbability: e.useProbability,
        group: e.group, group_override: e.groupPrioritize, group_weight: e.groupWeight,
        exclude_recursion: e.nonRecursable, prevent_recursion: e.preventFurtherRecursion,
        delay_until_recursion: e.delayUntilRecursion,
        scan_depth: e.scanDepthOverride, case_sensitive: e.caseSensitiveOverride,
        match_whole_words: e.wholeWordsOverride, use_group_scoring: e.groupScoringOverride,
        automation_id: e.automationId,
        vectorized: e.status === 'vectorized',
        sticky: e.sticky, cooldown: e.cooldown, delay: e.delay,
        ignore_budget: e.ignoreBudget,
        match_character_description: e.matchSources.description,
        match_character_personality: e.matchSources.personality,
        match_scenario: e.matchSources.scenario,
        match_persona_description: e.matchSources.persona,
        ...(e.characterFilter.length || e.tagFilter.length
          ? { character_filter: { isExclude: e.characterFilterExclude, names: e.characterFilter, tags: e.tagFilter } }
          : {}),
        ...(e.triggerFilters.length ? { triggers: e.triggerFilters } : {}),
      },
    })),
  }
}

/** The card as exported (PNG chunk, JSON file): a chara_card_v2 envelope with the
 *  fields under `data` (V1 fields mirrored on top, like other apps write), the
 *  card's own lorebook as `data.character_book`. The app's own `studio` bag rides
 *  inside `data`, so re-importing here keeps sprites, gallery and the rest.
 *  `markSections` puts a heading in front of each Profile section in the exported text
 *  (GitHub #105); the default is the user's "Mark the profile sections" choice. The card
 *  itself keeps its plain text. */
export function characterToExportCard(c: Character, books: Lorebook[], opts?: { markSections?: boolean }): EngineCard {
  const { spec: _spec, ...fields } = characterToCard(c)
  const marks = (opts?.markSections ?? markProfileSections()) ? markedExport(c) : null
  if (marks) {
    ;(fields as Record<string, unknown>).description = marks.description
    ;(fields as Record<string, unknown>).personality = marks.personality
  }
  // the edit history (old texts, drafts) stays home: a shared card carries the current text only
  if (fields.studio && typeof fields.studio === 'object') {
    const { versions: _versions, ...studio } = fields.studio as Record<string, unknown>
    ;(fields as Record<string, unknown>).studio = studio
  }
  const own = c.embeddedLorebookId ? books.find((b) => b.id === c.embeddedLorebookId) : undefined
  // a summary has no entries: a card exported with it would lose the book. Callers load the book first.
  if (own?.stub) throw new Error(`the card's lorebook ${own.id} is not loaded`)
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: fields.name,
    description: fields.description,
    personality: fields.personality,
    scenario: fields.scenario,
    first_mes: fields.first_mes,
    mes_example: fields.mes_example,
    data: { ...fields, ...(own ? { character_book: lorebookToCharacterBook(own) } : {}) },
  } as EngineCard
}

export function groupToCharacter(g: EngineGroup, cards: Character[]): Character {
  // callers may pass every card: keep this group's members, in its order
  const members = (g.memberIds ?? []).map((id) => cards.find((m) => m.id === id)).filter((m): m is Character => !!m)
  const first = members[0]
  return {
    id: g.id ?? '',
    name: g.name,
    avatar: g.avatar || (first?.avatar ?? PLACEHOLDER),
    altAvatars: [], description: `Group chat with ${members.map((m) => m.name).join(', ')}.`,
    personality: '', scenario: '',
    firstMessage: g.openingMessage ?? `*${members.map((m) => m.name).join(', ')} are here.*`,
    altGreetings: [], groupGreetings: [], exampleDialogue: '', systemPromptOverride: '', postHistoryInstructions: '',
    depthPrompt: { text: '', depth: 4, role: 'system' },
    creatorNotes: '', creator: 'You', version: '1.0', tags: g.tags?.length ? g.tags : ['group'], favorite: g.favorite === true, folderId: null,
    createdAt: 0, lastChatAt: 0, embeddedLorebookId: g.embeddedLorebookId ?? null, linkedLorebookIds: g.linkedLorebookIds ?? [],
    colors: { name: '', dialogue: '', bubble: '' }, stats: [],
    isGroup: true, members: g.memberIds ?? [], group: { ...g, memberIds: g.memberIds ?? [] },
    descVariants: [], personalityVariants: [], scenarioVariants: [], versions: [],
    voiceProvider: '', voiceId: '', gallery: [], expressions: [], defaultExpression: 'neutral', characterRegexIds: [], css: '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message / chat adapters
// ─────────────────────────────────────────────────────────────────────────────
function toSwipe(content: string, model: string, at: number, genMs = 0, extra?: EngineMessage['extra']): Swipe {
  return {
    id: uid('sw'), content, model, genTimeMs: genMs, timestamp: at,
    // the engine's generation metadata (real usage + params snapshot +
    // reasoning-model thinking) belongs to the swipe that was actually
    // generated — the ACTIVE one
    ...(extra?.usage ? { usage: extra.usage } : {}),
    ...(extra?.params ? { params: extra.params } : {}),
    ...(extra?.reasoning ? { reasoning: extra.reasoning } : {}),
    ...(extra?.reasoningMs ? { reasoningTime: extra.reasoningMs / 1000 } : {}),
    ...(extra?.tools?.length ? { tools: extra.tools } : {}),
    ...(extra?.parts?.length ? { parts: extra.parts } : {}),
  }
}

export function engineMessageToUI(m: EngineMessage): Message {
  const raw = m.swipes?.length ? m.swipes : [m.text]
  const active = Math.min(m.swipe ?? 0, raw.length - 1)
  // per-swipe generation facts ride extra.swipeMeta when it is index-aligned
  // with the swipes; older messages only have the active swipe's facts
  const meta = m.extra?.swipeMeta?.length === raw.length ? m.extra.swipeMeta : null
  // the engine expands macros ({{user}}/{{char}}/…) on `text` for the ACTIVE
  // swipe but keeps swipes[] raw so future navigation can re-expand with
  // fresh values — mirror that: the active swipe shows the expanded text
  const swipes = raw.map((t, i) => {
    const own = meta?.[i]
    return toSwipe(
      i === active && m.text ? m.text : t,
      i === active && m.extra?.model ? m.extra.model : (own?.model ?? ''),
      m.at,
      i === active ? (m.extra?.genMs ?? 0) : (own?.genMs ?? 0),
      i === active ? m.extra : (own?.usage ? { usage: own.usage } : undefined),
    )
  })
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant',
    characterId: m.charId,
    ...(typeof m.name === 'string' && m.name ? { authorName: m.name } : {}),
    swipes,
    activeSwipe: active,
    timestamp: m.at,
    edited: m.edited === true,
    hidden: m.hidden === true,
    bookmarked: m.bookmarked === true,
    bookmarkLabel: m.bookmarkLabel,
    ...(typeof m.translation === 'string' ? { translation: m.translation } : {}),
    ...(m.attachments?.length ? { attachments: m.attachments } : {}),
    ...(m.picture === true ? { picture: true } : {}),
    ...(typeof m.personaId === 'string' && m.personaId ? { personaId: m.personaId } : {}),
  }
}

const DEFAULT_AUTHOR_NOTE: Chat['authorNote'] = { text: '', position: 'in-chat', depth: 4, role: 'system', frequency: 1, includeInWIScan: false }

export function engineChatToUI(meta: EngineChatMeta, msgs: EngineMessage[]): Chat {
  return {
    id: meta.id,
    characterId: meta.groupId ?? meta.characterId ?? '',
    title: meta.title,
    messages: msgs.map(engineMessageToUI),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt ?? meta.createdAt,
    branches: [],
    parentChatId: meta.parentChatId ?? null,
    parentMessageId: meta.parentMessageId ?? null,
    personaId: meta.personaId ?? null,
    presetId: meta.presetId ?? null,
    ...(meta.presetVars ? { presetVars: meta.presetVars } : {}),
    ...(meta.presetNotes?.length ? { presetNotes: meta.presetNotes } : {}),
    model: typeof meta.model === 'string' && meta.model ? meta.model : null,
    authorNote: meta.authorNoteObject ?? { ...DEFAULT_AUTHOR_NOTE, text: meta.authorNote ?? '' },
    litopysCut: meta.litopysCut,
    promptCut: meta.promptCut ?? null,
    temporary: meta.temporary === true,
    folderId: meta.folderId ?? null,
    ...(meta.pinned === true ? { pinned: true } : {}),
    ...(meta.turns && Object.keys(meta.turns).length ? { turns: meta.turns } : {}),
    chatTags: meta.chatTags ?? [],
    backgroundId: meta.backgroundId ?? null,
    ...(meta.autoBackground && typeof meta.autoBackground === 'object' ? { autoBackground: meta.autoBackground } : {}),
    fieldVariantSelection: meta.fieldVariantSelection ?? {},
    // carried so an unloaded chat still renders a preview and a count; a
    // loaded transcript makes them redundant
    preview: meta.preview ?? '',
    messageCount: meta.messageCount ?? msgs.length,
    hasUser: meta.hasUser ?? msgs.some((x) => x.role === 'user'),
  }
}

/** Studio chat-level fields the engine stores on the chat meta (PATCH body keys). */
export function chatPatchOf(p: Partial<Chat>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if ('title' in p) out.title = p.title
  if ('personaId' in p) out.personaId = p.personaId
  if ('presetId' in p) out.presetId = p.presetId
  if ('model' in p) out.model = p.model ?? null
  if ('authorNote' in p && p.authorNote) { out.authorNote = p.authorNote.text; out.authorNoteObject = p.authorNote }
  if ('temporary' in p) out.temporary = p.temporary
  if ('folderId' in p) out.folderId = p.folderId
  if ('pinned' in p) out.pinned = p.pinned === true
  if ('chatTags' in p) out.chatTags = p.chatTags
  if ('backgroundId' in p) out.backgroundId = p.backgroundId
  if ('autoBackground' in p) out.autoBackground = p.autoBackground ?? null
  if ('fieldVariantSelection' in p) out.fieldVariantSelection = p.fieldVariantSelection
  if ('turns' in p) out.turns = p.turns && Object.keys(p.turns).length ? p.turns : null
  return out
}

/** How a group chat plays: the group's defaults with the chat's own turns on
 *  top (the engine's withChatTurns does the same). The order keeps only
 *  current members; members added since go last. */
export function chatGroupSettings(g: GroupConfig, turns?: ChatTurns): NonNullable<Chat['groupSettings']> {
  const t = turns ?? {}
  const ids = g.memberIds ?? []
  const order = t.order ? [...t.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !t.order!.includes(id))] : ids
  return {
    activation: t.mode ?? g.mode ?? 'natural',
    generationMode: t.generationMode ?? g.generationMode ?? 'swap',
    autoMode: t.autoMode ?? g.autoMode ?? false,
    autoDelaySec: t.autoDelaySec ?? g.autoDelaySec ?? 5,
    allowSelfResponses: t.allowSelfResponses ?? g.allowSelfResponses ?? false,
    muted: t.mutedIds ?? g.mutedIds ?? [],
    order,
  }
}

/** The chat's turns with `patch` merged in, dropping keys that now equal the
 *  group's default, so a chat set back to the group's values follows the
 *  group again. Empty result = undefined. */
export function mergeChatTurns(g: GroupConfig, turns: ChatTurns | undefined, patch: ChatTurns): ChatTurns | undefined {
  const next: ChatTurns = { ...(turns ?? {}), ...patch }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const dflt = chatGroupSettings(g)
  if (next.generationMode !== undefined && next.generationMode === dflt.generationMode) delete next.generationMode
  if (next.mode !== undefined && next.mode === dflt.activation) delete next.mode
  if (next.allowSelfResponses !== undefined && next.allowSelfResponses === dflt.allowSelfResponses) delete next.allowSelfResponses
  if (next.autoMode !== undefined && next.autoMode === dflt.autoMode) delete next.autoMode
  if (next.autoDelaySec !== undefined && next.autoDelaySec === dflt.autoDelaySec) delete next.autoDelaySec
  if (next.mutedIds !== undefined && same([...next.mutedIds].sort(), [...dflt.muted].sort())) delete next.mutedIds
  if (next.order !== undefined && same(chatGroupSettings(g, { order: next.order }).order, dflt.order)) delete next.order
  return Object.keys(next).length ? next : undefined
}

/** `key`: the prompt-board switch a part or omitted row belongs to (`section:<id>`, `book:<id>`, `history`, ...). */
export interface PromptSourcePart { kind: string; label: string; detail?: string; text: string; located: boolean; key?: string }
export interface PromptSourceOmitted { kind: string; label: string; detail?: string; reason: string; tokens?: number; key?: string }
export interface PromptSourceVar { name: string; value: string; label?: string }
/** One thing a chat can switch on the prompt board, in request order. */
export interface PromptBoardItem {
  key: string
  label: string
  kind: 'main' | 'card' | 'persona' | 'lorebook' | 'example' | 'preset' | 'history' | 'databank' | 'note' | 'memory' | 'dashboard'
  state: 'on' | 'off' | 'preset-off' | 'condition' | 'not-this-generation' | 'empty'
}
export interface PromptSources { v: number; parts: PromptSourcePart[]; omitted: PromptSourceOmitted[]; vars: PromptSourceVar[]; board?: PromptBoardItem[] }

/** A chat's prompt switches (chat meta `promptBoard`); absent = everything on. */
export interface PromptBoardHistory { lastN: number; only: 'all' | 'user' | 'char'; thinking: boolean }
export interface PromptBoardConfig { v: 1; off?: string[]; history?: PromptBoardHistory }
export const DEFAULT_PROMPT_HISTORY: PromptBoardHistory = { lastN: 0, only: 'all', thinking: true }

export async function getChatPromptBoard(chatId: string): Promise<PromptBoardConfig | null> {
  const r = await j<{ meta: { promptBoard?: PromptBoardConfig } }>(`/chats/${encodeURIComponent(chatId)}`)
  return r.meta.promptBoard ?? null
}

/** Replaces the chat's switches whole; the engine cleans them (null = everything on again). */
export async function setChatPromptBoard(chatId: string, board: PromptBoardConfig | null): Promise<PromptBoardConfig | null> {
  const meta = await j<{ promptBoard?: PromptBoardConfig }>(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ promptBoard: board }),
  })
  return meta.promptBoard ?? null
}

/** Which of the card's stories feed this chat (chat meta `memory.sources`): false = left out, true = a "separate" story let in. */
export type ChatMemorySources = Record<string, boolean>

export async function getChatMemorySources(chatId: string): Promise<ChatMemorySources | null> {
  const r = await j<{ meta: { memory?: { sources?: ChatMemorySources } } }>(`/chats/${encodeURIComponent(chatId)}`)
  return r.meta.memory?.sources ?? null
}

/** Replaces the chat's story choice whole; the engine cleans it (null = every story back to its own default). */
export async function setChatMemorySources(chatId: string, sources: ChatMemorySources | null): Promise<ChatMemorySources | null> {
  const meta = await j<{ memory?: { sources?: ChatMemorySources } }>(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ memory: sources ? { sources } : null }),
  })
  return meta.memory?.sources ?? null
}
export interface PromptSourceSpan { msg: number; start: number; end: number; part: number }

/** The EXACT prompt the engine would send for this chat right now (macros
 *  expanded, world info + summary + injections spliced) — powers prompt peek.
 *  With messageId the assembly is scoped to that message: the prompt as it
 *  existed at that point in the chat, not the current tail. */
export async function promptPreview(chatId: string, opts?: { userText?: string; messageId?: string }): Promise<{
  systemPrompt: string | null
  messages: { role: string; content: string }[]
  presetParams: Record<string, unknown>
  presetName: string
  model?: string | null
  reasoning?: string
  thinkingBudget?: number
  assistantPrefill?: string
  /** tool definitions the generation would carry (enabled app tools) */
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[]
  /** where each part of the request came from (absent from older plugins) */
  sources?: PromptSources
  /** ranges in the texts: msg -1 = systemPrompt, else the index in `messages`; part = index in sources.parts */
  sourceSpans?: PromptSourceSpan[]
}> {
  const { userText, messageId } = opts ?? {}
  const limits = await limitsOfChat(chatId)
  // ?siblingtools=1: the engine attaches the exact tool set a send's
  // wantsTools request would carry
  return j('/prompt/preview?siblingtools=1', {
    method: 'POST',
    body: JSON.stringify({ chatId, ...(userText?.trim() ? { userText } : {}), ...(messageId ? { messageId } : {}), ...limits }),
  })
}

/** The chat's model limits, as a send carries them: a preview or status that budgets against another
 *  window would show a prompt the send never builds. (Imported late: the store imports this module.) */
async function limitsOfChat(chatId: string): Promise<{ contextWindow?: number; maxOutput?: number }> {
  try {
    return (await import('./store')).chatLimits(chatId)
  } catch {
    return {}
  }
}

/** World-info activation status for a chat — the same activation path a
 *  generation runs (constants + key matches over recent messages, with the
 *  real context-scaled budget), so the viewer shows what ACTUALLY fires. */
export interface WIFiredRow {
  book: string
  uid: number | null
  title: string
  chars: number
  constant: boolean
  position: string
  sticky?: boolean
  via: 'key' | 'constant' | 'sticky' | 'vector'
  key?: string
  secondary?: string[]
  /** vector hits: cosine score */
  score?: number
  /** recursion pass the entry fired in (0 = the first scan) */
  pass: number
  /** how many messages deep the scan was when it fired */
  depth: number
  probability?: number
  group?: string
  /** skipped rows only */
  reason?: 'budget'
}
export type WIBlockReason =
  | 'delay' | 'cooldown' | 'recursion_delay' | 'non_recursable' | 'secondary'
  | 'probability' | 'group' | 'character' | 'trigger'
export interface WIBlockedRow {
  book: string
  uid: number | null
  title: string
  reason: WIBlockReason
  detail?: string | number
  key?: string
  secondary?: string[]
  winner?: string
}
export interface WIStatus {
  fired: WIFiredRow[]
  skipped: WIFiredRow[]
  blocked: WIBlockedRow[]
  usedChars: number
  budgetChars: number
  scanDepth: number
  contextTokens: number
}
export interface WITestResult {
  fired: WIFiredRow[]
  skipped: WIFiredRow[]
  blocked: WIBlockedRow[]
  usedChars: number
  budgetChars: number
}
/** Core engine route (not an app route) — absolute path, like image-gen. */
export async function embedConfig(): Promise<{ model: string }> {
  try {
    return (await fetch('/v1/embeddings/config').then((x) => x.json())) as { model: string };
  } catch {
    return { model: 'text-embedding-3-small' };
  }
}
export async function setEmbedConfig(model: string): Promise<void> {
  await fetch('/v1/embeddings/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) });
  embedStatusCache = null; // re-probe with the new model next time
}

let embedStatusCache: { at: number; r: { ok: boolean; via: string | null } } | null = null;
export async function embedStatus(force = false): Promise<{ ok: boolean; via: string | null }> {
  if (!force && embedStatusCache && Date.now() - embedStatusCache.at < 5 * 60_000) return embedStatusCache.r;
  try {
    const r = (await fetch('/v1/embeddings/probe', { method: 'POST' }).then((x) => x.json())) as { ok?: boolean; via?: string | null };
    const out = { ok: r.ok === true, via: r.via ?? null };
    embedStatusCache = { at: Date.now(), r: out };
    return out;
  } catch {
    return { ok: false, via: null };
  }
}

export async function fetchWIStatus(chatId: string): Promise<WIStatus> {
  return j('/wi-status', {
    method: 'POST',
    body: JSON.stringify({ chatId, ...(await limitsOfChat(chatId)) }),
  })
}

/** The keyword test: the real scanner on pasted text, against the editor's
 *  own (possibly unsaved) books. A chat lends its timed state and card. */
export async function wiTest(opts: { text: string; books: EngineLorebook[]; chatId?: string }, signal?: AbortSignal): Promise<WITestResult> {
  const limits = opts.chatId ? await limitsOfChat(opts.chatId) : {}
  return j('/wi-test', {
    method: 'POST',
    body: JSON.stringify({ text: opts.text, books: opts.books, ...(opts.chatId ? { chatId: opts.chatId } : {}), ...limits }),
    signal,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona adapter (engine personas are pass-through JSON)
// ─────────────────────────────────────────────────────────────────────────────
export function enginePersonaToUI(p: { id?: string } & Record<string, unknown>, defaultId: string | null): Persona {
  const id = p.id ?? ''
  return {
    id, name: String(p.name ?? 'Persona'),
    avatar: storedMediaUrl((p.avatar as string) || PLACEHOLDER),
    title: (p.title as string) ?? '',
    description: (p.description as string) ?? '',
    pronouns: (p.pronouns as string) ?? '',
    lorebookIds: (p.lorebookIds as string[]) ?? [],
    isDefault: id !== '' && id === defaultId,
    folderId: (p.folderId as string | null) ?? null,
    binding: (p.binding as Persona['binding']) ?? 'default',
    boundCharacterIds: (p.boundCharacterIds as string[]) ?? [],
    autoLock: p.autoLock === true,
    createdAt: (p.createdAt as number) ?? 0,
    ...(p.profile && typeof p.profile === 'object' && !Array.isArray(p.profile) ? { profile: p.profile as Record<string, unknown> } : {}),
    ...(typeof p.dialogueColor === 'string' && p.dialogueColor ? { dialogueColor: p.dialogueColor } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset adapter — studio sections ⇄ engine prompts[]/prompt_order[] (portable shape)
// ─────────────────────────────────────────────────────────────────────────────
const MARKER_TO_ENGINE: Record<string, string> = {
  main: 'main', nsfw: 'nsfw', jailbreak: 'postHistory',
  charDescription: 'charDescription', personality: 'charPersonality', scenario: 'scenario',
  persona: 'personaDescription', exampleDialogue: 'dialogueExamples', chatHistory: 'chatHistory',
  wiBefore: 'worldInfoBefore', wiAfter: 'worldInfoAfter',
}
const ENGINE_TO_MARKER = Object.fromEntries(Object.entries(MARKER_TO_ENGINE).map(([k, v]) => [v, k] as const))

export function presetToEngine(p: Preset): EnginePreset {
  const sections = [...p.sections].sort((a, b) => a.order - b.order)
  const prompts = sections.map((s) => ({
    identifier: s.id,
    name: s.name,
    role: s.role,
    marker: s.marker != null,
    ...(s.marker == null || s.content ? { content: s.content } : {}),
    ...(s.position === 'in-chat' ? { injection_position: 'absolute' as const, injection_depth: s.depth } : {}),
  }))
  const S = p.samplers
  const num = (v: { value: number; enabled: boolean } | undefined) => (v && v.enabled && Number.isFinite(v.value) ? v.value : undefined)
  const out: EnginePreset = {
    name: p.name,
    prompts,
    prompt_order: [{ character_id: 100000, order: sections.map((s) => ({ identifier: s.id, enabled: s.enabled })) }],
    ...(num(S?.temperature) != null ? { temperature: num(S!.temperature) } : {}),
    ...(num(S?.top_p) != null ? { top_p: num(S!.top_p) } : {}),
    ...(num(S?.top_k) != null ? { top_k: num(S!.top_k) } : {}),
    ...(num(S?.min_p) != null ? { min_p: num(S!.min_p) } : {}),
    ...(num(S?.rep_pen) != null ? { repetition_penalty: num(S!.rep_pen) } : {}),
    ...(num(S?.freq_pen) != null ? { frequency_penalty: num(S!.freq_pen) } : {}),
    ...(num(S?.pres_pen) != null ? { presence_penalty: num(S!.pres_pen) } : {}),
    ...(S?.maxTokens ? { openai_max_tokens: S.maxTokens } : {}),
    ...(S?.seed ? { seed: S.seed } : {}),
    ...(S?.stopStrings?.length ? { stop: S.stopStrings } : {}),
    ...(S?.reasoning?.enabled && S.reasoning.effort !== 'off'
      ? { reasoning: S.reasoning.effort === 'med' ? 'medium' : S.reasoning.effort }
      : {}),
    // inline-thinking parse tags + thinking token budget (consumed engine-side)
    ...(S?.reasoning?.enabled && S.reasoning.autoParse && S.reasoning.thinkTagOpen && S.reasoning.thinkTagClose
      ? { reasoningTags: { open: S.reasoning.thinkTagOpen, close: S.reasoning.thinkTagClose } }
      : {}),
    ...(S?.reasoning?.enabled && S.reasoning.budget > 0 ? { thinkingBudget: S.reasoning.budget } : {}),
    // extended sampler sweep (dry/xtc/dynatemp/mirostat/…): lifted to the
    // top level where the engine's forwarded-key list picks them up
    ...(p.extendedSamplers && typeof p.extendedSamplers === 'object'
      // samplers_override_model is the preset's own switch, never an extra sampler (an older build harvested it here)
      ? Object.fromEntries(Object.entries(p.extendedSamplers).filter(([k]) => k !== 'samplers_override_model').filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.trim())))
      : {}),
    // the full studio preset rides along — the engine stores presets verbatim, so the
    // section editor loses nothing the kernel doesn't understand. Fields the
    // ENGINE actually consumes at runtime (utility prompts) are ALSO lifted to
    // the top level where the plugin reads them.
    // the engine plugin reads it at the top level: the preset's samplers win over the model's
    ...(p.samplersOverrideModel ? { samplers_override_model: true } : {}),
    studio: p as unknown as Record<string, unknown>,
    ...(p.utilityPrompts ? { utilityPrompts: p.utilityPrompts } : {}),
  }
  return out
}

export function enginePresetToUI(ep: EnginePreset, id: string): Preset {
  const bag = ep.studio as Partial<Preset> | undefined
  const ordered = (() => {
    const byId = new Map((ep.prompts ?? []).map((p) => [p.identifier, p]))
    // the studio bag carries the full editor preset — group + condition ride there
    const bagSections = new Map(((bag?.sections ?? []) as PromptSection[]).map((x) => [x.id, x]))
    // only a NON-EMPTY order array is authoritative — legacy/corrupt files
    // carry empty entries and must fall through to the prompts list. Outside
    // preset files carry several layouts; the chat-completion arrangement
    // lives under character id 100001, so prefer it over the first list.
    const po = (ep.prompt_order ?? []).find((o) => o && o.character_id === 100001 && Array.isArray(o.order) && o.order.length > 0)
      ?? (ep.prompt_order ?? []).find((o) => o && Array.isArray(o.order) && o.order.length > 0)
      ?? null
    const order = po?.order ?? (ep.prompts ?? []).map((p) => ({ identifier: p.identifier, enabled: true }))
    return order.map((o, i) => {
      const p = byId.get(o.identifier)
      const markerKey = p && p.marker ? ENGINE_TO_MARKER[p.identifier] : undefined
      const bagSection = bagSections.get(o.identifier)
      return {
        id: o.identifier,
        name: p?.name ?? o.identifier,
        enabled: o.enabled !== false,
        role: (p?.role || 'system') as 'system' | 'user' | 'assistant',
        marker: (markerKey ?? null) as never,
        // marker sections keep their stored content — the Main Prompt and
        // Post-history instructions are editable entries whose text must
        // survive a reload (wiping it here made edits vanish on rehydrate)
        content: p?.content ?? '',
        position: p?.injection_position === 'absolute' ? ('in-chat' as const) : ('relative' as const),
        depth: p?.injection_depth ?? 4,
        order: i,
        // a section that never chose its generation types runs for all of them
        injectionTriggers: bagSection?.injectionTriggers ?? [...GENERATION_TYPES],
        forbidOverrides: bagSection?.forbidOverrides ?? false,
        groupId: bagSection?.groupId ?? null,
        condition: bagSection?.condition ?? null,
      }
    })
  })()
  const flat = {
    temperature: ep.temperature, top_p: ep.top_p, top_k: ep.top_k, min_p: ep.min_p,
    rep_pen: ep.repetition_penalty ?? ep.rep_pen, freq_pen: ep.frequency_penalty,
    pres_pen: ep.presence_penalty, maxTokens: ep.openai_max_tokens ?? 0,
    seed: ep.seed ?? 0,
    stopStrings: (ep.stop as string[]) ?? [],
  }
  // engine presets carry flat numbers; the editor wants {value, enabled} —
  // start from defaults and overlay whatever is actually set (bag wins for
  // fields the kernel doesn't know)
  const base = { ...defaultSamplers() }
  for (const [k, v] of Object.entries(flat)) {
    if (v == null) continue
    if (k === 'stopStrings') base.stopStrings = v as string[]
    else if (k === 'maxTokens') base.maxTokens = v as number
    else if (k === 'seed') base.seed = v as number
    else (base as unknown as Record<string, { value: number; enabled: boolean }>)[k] = { value: v as number, enabled: true }
  }
  const samplers = bag?.samplers
    ? { ...base, ...bag.samplers, ...Object.fromEntries(Object.entries(flat).filter(([, v]) => v != null).map(([k, v]) => [k, (k === 'stopStrings' || k === 'maxTokens' || k === 'seed') ? v : (typeof v === 'number' ? { value: v, enabled: true } : v)])) }
    : base
  return {
    id,
    name: ep.name ?? id,
    // the default preset is the user's own working copy — fully editable
    readOnly: bag?.readOnly === true,
    // default is the USER'S choice (persisted in the studio bag); the id-based
    // fallback only covers legacy bags that predate the flag
    isDefault: bag?.isDefault === true || (bag?.isDefault === undefined && id === 'default'),
    folderId: bag?.folderId ?? null,
    picture: bag?.picture ?? null,
    sections: ordered,
    library: bag?.library ?? [],
    groups: bag?.groups ?? [],
    variables: bag?.variables ?? [],
    ...(typeof bag?.description === 'string' && bag.description ? { description: bag.description } : {}),
    // a preset written before a prompt existed (polish, #15) shows it blank: blank = the built-in text
    utilityPrompts: { impersonation: '', continueNudge: '', newChat: '', groupNudge: '', emptySend: '', polish: '', ...(bag?.utilityPrompts ?? (ep.utilityPrompts as Partial<Preset['utilityPrompts']> | undefined)) },
    samplers,
    // the editor bag first; a preset written before the bag knew the field carries it only at the top level
    samplersOverrideModel: bag?.samplersOverrideModel ?? ep.samplers_override_model === true,
    namesBehavior: bag?.namesBehavior ?? 'default',
    verbosity: bag?.verbosity ?? 'auto',
    continuePrefill: bag?.continuePrefill ?? true,
    squashSystemMessages: bag?.squashSystemMessages ?? false,
    compactHistory: { ...DEFAULT_COMPACT_HISTORY, ...bag?.compactHistory },
    promptPostProcessing: bag?.promptPostProcessing ?? { enabled: false, mode: 'none' },
    promptFormat: bag?.promptFormat ?? { use: 'connection', custom: { ...EMPTY_PROMPT_FORMAT } },
    // extended sampler sweep: the editor bag wins; presets that arrived by
    // the server import path carry it only at the top level, so harvest there
    extendedSamplers: bag?.extendedSamplers ?? (() => {
      const KNOWN = new Set(['name', 'prompts', 'prompt_order', 'studio', 'utilityPrompts', 'temperature', 'top_p', 'top_k', 'min_p', 'repetition_penalty', 'rep_pen', 'frequency_penalty', 'presence_penalty', 'openai_max_tokens', 'openai_max_context', 'seed', 'stop', 'reasoning', 'reasoningTags', 'thinkingBudget', 'id', 'samplers_override_model'])
      const out: Record<string, number | string | boolean> = {}
      for (const [k, v] of Object.entries(ep)) {
        if (KNOWN.has(k)) continue
        if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && k === 'negative_prompt')) out[k] = v
      }
      return Object.keys(out).length ? out : undefined
    })(),
    createdAt: bag?.createdAt ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lorebook adapter
// ─────────────────────────────────────────────────────────────────────────────
// the engine places every position (0.9.4); before/after_examples are the same place as before/after_em
const POS_TO_ENGINE: Record<string, string> = {
  before_char: 'before_char', before_em: 'before_em', before_an: 'before_an', before_examples: 'before_em',
  after_char: 'after_char', after_em: 'after_em', after_an: 'after_an', after_examples: 'after_em',
  at_depth: 'at_depth',
}
const ENGINE_TO_POS: Record<string, LoreEntry['position']> = {
  before_char: 'before_char', after_char: 'after_char', at_depth: 'at_depth',
  before_em: 'before_em', after_em: 'after_em', before_an: 'before_an', after_an: 'after_an',
  before_examples: 'before_em', after_examples: 'after_em',
}

/** Import lorebook files. A native studio book is stored verbatim; anything
 *  else goes through the server-side world-info normalizer, where the FILE
 *  name becomes the book name because world files carry none. Returns the new
 *  book ids in order, and throws per file are reported by the caller. */
export async function importLorebookFiles(
  files: File[],
  /** a file that failed is listed with its reason on the progress card; this is for a caller that wants it too */
  onError?: (message: string) => void,
): Promise<string[]> {
  const ids: string[] = []
  const run = beginImport(t('imp.title.lorebooks'), files.length)
  try {
  for (const file of files) {
    if (run.cancelled()) break
    run.start(file.name, t('imp.step.reading'))
    let ok = true
    let failure = ''
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>
      run.step(t('imp.step.saving'), 0.5)
      const isNative = 'settings' in json && 'vectorized' in json && Array.isArray(json.entries)
      if (isNative) {
        const id = uid('book')
        await j(`/lorebooks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ ...lorebookToEngine({ ...(json as unknown as Lorebook), id }), id }),
        })
        ids.push(id)
      } else {
        const r = await j<{ lorebooks?: string[] }>('/import/batch', {
          method: 'POST',
          body: JSON.stringify({ worldInfo: [{ ...json, name: file.name.replace(/\.json$/i, '') }] }),
        })
        if (!r.lorebooks?.length) throw new Error('not a recognized world-info file')
        ids.push(...r.lorebooks)
      }
    } catch (e) {
      ok = false
      onError?.(`${file.name}: ${(e as Error).message ?? 'could not parse'}`)
      failure = (e as Error).message || 'could not parse'
    }
    run.finish(ok, ok ? '' : failure)
  }
  } finally {
    run.end(t(run.cancelled() ? 'imp.cancelled' : 'imp.done', undefined, { ok: ids.length, total: files.length }))
  }
  return ids
}

// Engine entry fields the editor models; anything else rides `extra` so a save never drops it.
// caseSensitive / matchWholeWords / groupOverride (imported books) are read into the editor's
// override fields and written back under those names only.
const LORE_ENTRY_KNOWN = new Set([
  'uid', 'title', 'memo', 'keys', 'keysRegex', 'secondaryKeys', 'selectiveLogic', 'status', 'constant', 'content',
  'position', 'depth', 'role', 'order', 'probability', 'group', 'groupWeight', 'groupPrioritize', 'groupOverride',
  'sticky', 'cooldown', 'delay', 'enabled', 'characterFilter', 'characterFilterExclude', 'tagFilter', 'triggerFilters',
  'nonRecursable', 'preventFurtherRecursion', 'ignoreBudget', 'delayUntilRecursion', 'automationId', 'matchSources',
  'scanDepthOverride', 'caseSensitiveOverride', 'caseSensitive', 'wholeWordsOverride', 'matchWholeWords',
  'groupScoringOverride', 'wordFormsOverride',
])
const LORE_BOOK_KNOWN = new Set([
  'id', 'name', 'folderId', 'globalActive', 'linkedCharacterIds', 'entries', 'settings', 'vectorized', 'isEmbedded', 'formatTemplate',
  // a start-up summary's own fields (the plugin's bookSummary), never book data
  'stub', 'entryCount', 'tokens', 'rev',
])
const extraOf = (o: Record<string, unknown>, known: Set<string>): Record<string, unknown> | undefined => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (!known.has(k) && v !== undefined) out[k] = v
  return Object.keys(out).length ? out : undefined
}
const boolOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

export function lorebookToEngine(b: Lorebook): EngineLorebook {
  // a summary has no entries: written as a book it would blank the user's. The last guard; the store loads first.
  if (b.stub) throw new Error(`lorebook ${b.id} is only a summary: load the book before saving it`)
  // uids are stable: kept from the file, new entries get the next free number
  const used = new Set<number>()
  for (const e of b.entries) if (typeof e.uid === 'number') used.add(e.uid)
  let next = used.size ? Math.max(...used) + 1 : 0
  const taken = new Set<number>()
  const uidOf = (e: LoreEntry): number => {
    if (typeof e.uid === 'number' && !taken.has(e.uid)) { taken.add(e.uid); return e.uid }
    while (used.has(next) || taken.has(next)) next++
    taken.add(next)
    return next
  }
  return {
    ...b.extra,
    id: b.id, name: b.name, globalActive: b.globalActive, linkedCharacterIds: b.linkedCharacterIds,
    settings: b.settings, vectorized: b.vectorized, isEmbedded: b.isEmbedded, formatTemplate: b.formatTemplate,
    folderId: b.folderId,
    entries: b.entries.map((e) => ({
      ...e.extra,
      uid: uidOf(e),
      title: e.title, memo: e.memo,
      keys: e.keys, keysRegex: e.keysRegex, secondaryKeys: e.secondaryKeys,
      selectiveLogic: e.logic, content: e.content,
      enabled: e.enabled,
      order: e.order, position: POS_TO_ENGINE[e.position] ?? 'before_char',
      depth: e.depth, role: e.role, probability: e.useProbability ? e.probability : undefined,
      status: e.status, group: e.group, groupWeight: e.groupWeight, groupPrioritize: e.groupPrioritize,
      sticky: e.sticky, cooldown: e.cooldown, delay: e.delay,
      characterFilter: e.characterFilter, characterFilterExclude: e.characterFilterExclude,
      tagFilter: e.tagFilter, triggerFilters: e.triggerFilters,
      nonRecursable: e.nonRecursable, preventFurtherRecursion: e.preventFurtherRecursion, ignoreBudget: e.ignoreBudget,
      delayUntilRecursion: e.delayUntilRecursion, automationId: e.automationId, matchSources: e.matchSources,
      scanDepthOverride: e.scanDepthOverride, caseSensitiveOverride: e.caseSensitiveOverride,
      wholeWordsOverride: e.wholeWordsOverride, groupScoringOverride: e.groupScoringOverride,
      wordFormsOverride: e.wordFormsOverride,
    })),
  }
}

/** How many entries a book has: a summary (`stub`) carries the count, a whole book its entries. */
export const bookEntryCount = (b: Pick<Lorebook, 'stub' | 'entryCount' | 'entries'>): number => (b.stub ? b.entryCount ?? 0 : b.entries.length)

export function engineLorebookToUI(b: EngineLorebook, id: string): Lorebook {
  const stub = (b as { stub?: unknown }).stub === true
  return {
    id, name: b.name ?? 'Lorebook', folderId: (b.folderId as string | null) ?? null,
    globalActive: b.globalActive === true,
    linkedCharacterIds: (b.linkedCharacterIds as string[]) ?? [],
    entries: (b.entries ?? []).map((e, i): LoreEntry => ({
      id: `e${e.uid ?? i}`,
      uid: typeof e.uid === 'number' ? e.uid : i,
      title: (e.title as string) ?? '', memo: (e.memo as string) ?? '',
      keys: e.keys ?? [], keysRegex: e.keysRegex === true,
      secondaryKeys: e.secondaryKeys ?? [],
      logic: ((e.selectiveLogic as LoreEntry['logic']) ?? 'AND_ANY'),
      status: ((e.status as LoreEntry['status']) ?? (e.constant === true ? 'constant' : 'normal')),
      content: e.content ?? '',
      position: ENGINE_TO_POS[e.position ?? 'before_char'] ?? 'before_char',
      depth: e.depth ?? 4, role: (e.role as LoreEntry['role']) ?? 'system',
      order: e.order ?? 100, probability: e.probability ?? 100, useProbability: e.probability != null && e.probability < 100,
      group: (e.group as string) ?? '', groupWeight: (e.groupWeight as number) ?? 100,
      groupPrioritize: e.groupPrioritize === true || e.groupOverride === true,
      sticky: (e.sticky as number) ?? 0, cooldown: (e.cooldown as number) ?? 0, delay: (e.delay as number) ?? 0,
      enabled: e.enabled !== false,
      characterFilter: (e.characterFilter as ID[]) ?? [], characterFilterExclude: e.characterFilterExclude === true,
      tagFilter: (e.tagFilter as string[]) ?? [], triggerFilters: (e.triggerFilters as string[]) ?? [],
      nonRecursable: e.nonRecursable === true, preventFurtherRecursion: e.preventFurtherRecursion === true, ignoreBudget: e.ignoreBudget === true,
      delayUntilRecursion: typeof e.delayUntilRecursion === 'number' && e.delayUntilRecursion > 0 ? e.delayUntilRecursion : e.delayUntilRecursion === true,
      scanDepthOverride: typeof e.scanDepthOverride === 'number' && e.scanDepthOverride > 0 ? e.scanDepthOverride : null,
      caseSensitiveOverride: boolOrNull(e.caseSensitiveOverride) ?? (e.caseSensitive === true ? true : null),
      wholeWordsOverride: boolOrNull(e.wholeWordsOverride) ?? (e.matchWholeWords === false ? false : null),
      groupScoringOverride: boolOrNull(e.groupScoringOverride),
      wordFormsOverride: boolOrNull(e.wordFormsOverride),
      automationId: (e.automationId as string) ?? '',
      matchSources: (e.matchSources as LoreEntry['matchSources']) ?? { description: false, personality: false, scenario: false, persona: false },
      ...(extraOf(e, LORE_ENTRY_KNOWN) ? { extra: extraOf(e, LORE_ENTRY_KNOWN) } : {}),
    })),
    settings: (b.settings as Lorebook['settings']) ?? {
      scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2,
      insertionStrategy: 'character_first', caseSensitive: false, wholeWords: true, groupScoring: false,
      recursiveScan: true, includeNames: true, overflowAlert: true,
    },
    vectorized: (b.vectorized as Lorebook['vectorized']) ?? { embedding: 'all-MiniLM-L6-v2', queryMessages: 2, scoreThreshold: 0.35, topK: 10 },
    isEmbedded: b.isEmbedded === true,
    formatTemplate: (b.formatTemplate as string) ?? '',
    ...(extraOf(b, LORE_BOOK_KNOWN) ? { extra: extraOf(b, LORE_BOOK_KNOWN) } : {}),
    ...(typeof b.rev === 'string' && b.rev ? { rev: b.rev } : {}),
    // a start-up summary: the entries are not here yet
    ...(stub ? {
      stub: true as const,
      entryCount: num(b.entryCount, 0),
      tokens: num(b.tokens, 0),
    } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex adapter
// ─────────────────────────────────────────────────────────────────────────────
export function regexToEngine(r: RegexScript): EngineRegex {
  const placement: string[] = []
  if (r.placements.userInput) placement.push('user_input')
  if (r.placements.aiOutput) placement.push('ai_output')
  if (r.placements.slash) placement.push('slash')
  if (r.placements.wi) placement.push('wi')
  if (r.placements.reasoning) placement.push('reasoning')
  return {
    id: r.id, scriptName: r.name, findRegex: r.find, replaceString: r.replace,
    placement, markdownOnly: r.markdownOnly, promptOnly: r.promptOnly,
    disabled: !r.enabled, minDepth: r.minDepth, maxDepth: r.maxDepth, flags: r.flags,
    scope: r.scope, scopeTargetId: r.scopeTargetId, trimStrings: r.trimStrings,
    runOnEdit: r.runOnEdit, macroMode: r.macroMode, order: r.order,
  }
}

/** Scripts saved before the when-flags existed listed "display" and "prompt"
 *  among their placements; they read as the flags that reproduce what they
 *  did (the engine applies the same reading). */
function regexWhen(r: EngineRegex, placement: Set<string>): { markdownOnly: boolean; promptOnly: boolean; extraWhere: string[] } {
  if (typeof r.markdownOnly === 'boolean' || typeof r.promptOnly === 'boolean') {
    return { markdownOnly: r.markdownOnly === true, promptOnly: r.promptOnly === true, extraWhere: [] }
  }
  const roles = placement.has('user_input') || placement.has('ai_output')
  const extraWhere = placement.has('prompt') ? ['wi'] : []
  if (!placement.has('display')) return { markdownOnly: false, promptOnly: true, extraWhere }
  if (!roles && !placement.has('prompt')) return { markdownOnly: true, promptOnly: false, extraWhere: ['user_input', 'ai_output'] }
  return { markdownOnly: true, promptOnly: true, extraWhere }
}

export function engineRegexToUI(r: EngineRegex, id: string): RegexScript {
  const raw = new Set(r.placement ?? ['ai_output'])
  const when = regexWhen(r, raw)
  const placement = new Set([...raw, ...when.extraWhere])
  return {
    id, name: r.scriptName ?? 'Script',
    scope: (r.scope as RegexScript['scope']) ?? 'global', scopeTargetId: (r.scopeTargetId as string | null) ?? null,
    find: r.findRegex ?? '', replace: r.replaceString ?? '', flags: r.flags ?? 'g',
    placements: {
      userInput: placement.has('user_input'), aiOutput: placement.has('ai_output'),
      slash: placement.has('slash'), wi: placement.has('wi'), reasoning: placement.has('reasoning'),
    },
    markdownOnly: when.markdownOnly, promptOnly: when.promptOnly,
    minDepth: r.minDepth ?? null, maxDepth: r.maxDepth ?? null,
    trimStrings: (r.trimStrings as string[]) ?? [], runOnEdit: r.runOnEdit === true,
    macroMode: (r.macroMode as RegexScript['macroMode']) ?? 'none',
    enabled: r.disabled !== true, order: (r.order as number) ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc browser helpers (from the old studio client, unchanged behavior)
// ─────────────────────────────────────────────────────────────────────────────
/** Whether this browser can ENCODE webp from a canvas (every current one can;
 *  the check keeps an old build from silently getting a png labelled webp). */
let webpEncodes: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpEncodes === null) {
    try {
      webpEncodes = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')
    } catch {
      webpEncodes = false
    }
  }
  return webpEncodes
}

/**
 * Downscale an image file into a data URL.
 *
 * `alpha: true` keeps transparency. Sprites are cut-out characters meant to
 * float over the chat, and flattening one onto a canvas turns it into an
 * opaque rectangle, so they must never take the jpeg path. Webp keeps the
 * alpha at a fraction of png's size; png is the fallback where it can't be
 * encoded.
 */
export function fileToDataUrl(file: File | Blob, max = 192, opts: { alpha?: boolean; quality?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      if (!opts.alpha) { resolve(canvas.toDataURL('image/jpeg', 0.86)); return }
      resolve(canEncodeWebp() ? canvas.toDataURL('image/webp', opts.quality ?? 0.9) : canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
    img.src = url
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) throw new Error('not a data URL')
  const raw = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' })
}

/** The long side of an expression sprite when it is stored. Sprites live in the asset store (the card keeps
 *  their URLs), so the card's size limits no longer shrink them (GitHub #167). */
export const SPRITE_MAX_PX = 1024
/** Webp quality of a stored sprite (its transparency is kept). */
export const SPRITE_QUALITY = 0.92

/** Put an image (a file, or an image already held as a data URL) into the engine's asset store
 *  and return its URL, `/v1/assets/<id>`. A gallery item keeps only that URL: as data URLs inside
 *  card.json eight images passed the size limit of one save and vanished (GitHub #17). */
export async function storeImageAsset(src: File | Blob | string, max = 1024, name?: string, opts: { alpha?: boolean; quality?: number } = {}): Promise<string> {
  const blob = typeof src === 'string' ? dataUrlToBlob(src) : dataUrlToBlob(await fileToDataUrl(src, max, opts))
  const r = await fetch(`/v1/assets${name ? `?name=${encodeURIComponent(name.slice(0, 120))}` : ''}`, {
    method: 'PUT', headers: { 'content-type': blob.type }, body: blob,
  })
  const out = (await r.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!r.ok || !out.id) throw new Error(out.error || `could not store the image (${r.status})`)
  return `/v1/assets/${out.id}`
}

/** An attached file goes into the asset store as it is (no resize, any type) and comes back as
 *  `/v1/assets/<id>`: a draft keeps that handle, so unsent attachments survive a reload (#31). The store is
 *  content-addressed, so picking the same file again adds nothing. */
export async function storeAttachmentAsset(file: File): Promise<string> {
  const r = await fetch(`/v1/assets?name=${encodeURIComponent(file.name.slice(0, 120))}`, {
    method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file,
  })
  const out = (await r.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!r.ok || !out.id) throw new Error(out.error || `could not store the file (${r.status})`)
  return `/v1/assets/${out.id}`
}

/** The app's image route for remote art: same-origin and host-allowlisted
 *  engine-side. The fetch rides the frame's bridge shim (its window.fetch),
 *  because the sandbox itself cannot reach another host. */
export const proxyUrl = (u: string): string => `${API}/img?url=${encodeURIComponent(u)}`

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

/** Downscale a remote image to at most `maxDim` on its longest edge, as a
 *  JPEG data URL. Keeps a sharp portrait without embedding the multi-MB
 *  original. */
export async function downscaleRemoteImage(url: string, maxDim = 512): Promise<string> {
  const res = await fetch(proxyUrl(url), { credentials: 'include' })
  if (!res.ok) throw new Error(`image ${res.status}`)
  const objectUrl = URL.createObjectURL(await res.blob())
  try {
    const img = await loadImage(objectUrl)
    const long = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = long > maxDim ? maxDim / long : 1
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Raw data URL (no resize) for attachments we want to persist on messages. */
export function fileToRawBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('could not read file'))
    r.readAsDataURL(file)
  })
}

export function fileToRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('could not read file'))
    r.readAsDataURL(file)
  })
}

export function downloadBlob(base64: string, filename: string, mime = 'application/zip'): void {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  saveFile(new Blob([bytes], { type: mime }), filename)
}

