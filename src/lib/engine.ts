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
  Character, Chat, Message, Persona, Preset, Lorebook, LoreEntry, RegexScript,
  Swipe, ID, ModelInfo, ModelPricing, PromptSection, DataBankFile, PromptFormatSequences,
} from './types'
import { uid } from './tokens'
import { defaultSamplers, DEFAULT_COMPACT_HISTORY, EMPTY_PROMPT_FORMAT, GENERATION_TYPES } from './seed'
import { DEFAULT_AVATAR, storedMediaUrl } from './utils'
import { saveFile } from './export'

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
  personaId?: string | null
  /** this chat's model, when it has one of its own */
  model?: string | null
  userName?: string
  authorNote?: string | null
  authorNoteObject?: Chat['authorNote']
  lorebookIds?: string[]
  folderId?: string | null
  chatTags?: string[]
  backgroundId?: string | 'none' | null
  temporary?: boolean
  litopysCut?: { count: number; upTo: string | null }
  fieldVariantSelection?: Chat['fieldVariantSelection']
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

export interface EngineGroup {
  id?: string
  name: string
  memberIds: string[]
  mode?: 'manual' | 'list' | 'natural'
  mutedIds?: string[]
  /** 'append' = all member cards join the prompt, 'swap' = speaker's only */
  generationMode?: 'swap' | 'append'
  allowSelfResponses?: boolean
  autoMode?: boolean
  autoDelaySec?: number
  openingMessage?: string
}

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
  pricing: ModelPricing | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
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
    throw new ApiError(0, 'Connection lost. Is the Chrysalis engine running?')
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string }
    // statusText is empty over HTTP/2 and on plenty of proxies: an error with
    // no message reaches the UI as a toast with nothing in it
    throw new ApiError(res.status, e.error || res.statusText || `engine returned ${res.status}`)
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
}

/** `chatId` asks for that chat's transcript inline — pass the one about to be
 *  shown so the first paint needs no follow-up fetch. */
export function fetchBootstrap(chatId?: string | null): Promise<EngineBootstrap> {
  return j<EngineBootstrap>(chatId ? `/bootstrap?chat=${encodeURIComponent(chatId)}` : '/bootstrap')
}

/** A starred model of the engine's quick switch (set in the shell's Settings), with an optional name. */
export interface ModelFavorite { ref: string; name?: string }

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
export interface ImageModelInfo { provider: string; id: string; label: string; api: string; connectionName: string | null }
export async function fetchImageModels(): Promise<ImageModelInfo[]> {
  try {
    const r = await fetch('/v1/images/models')
    if (!r.ok) return []
    const { models } = (await r.json()) as { models?: ImageModelInfo[] }
    return models ?? []
  } catch { return [] }
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
])
function cardExtrasOf(card: EngineCard): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(card)) {
    if (CARD_KNOWN.has(k) || v === undefined || v === null) continue
    out[k] = v
  }
  return out
}

export function cardToCharacter(card: EngineCard, id: string, lastChatAt = 0): Character {
  const studio = (card.studio ?? {}) as Partial<Character>
  return {
    id,
    name: card.name ?? 'Unnamed',
    avatar: storedMediaUrl(card.avatar || studio.avatar || PLACEHOLDER),
    altAvatars: (studio.altAvatars ?? []).map(storedMediaUrl),
    description: card.description ?? '',
    personality: card.personality ?? '',
    scenario: card.scenario ?? '',
    firstMessage: card.first_mes ?? '',
    altGreetings: card.alternate_greetings ?? [],
    // v3 group-only greetings; the legacy extension spelling also reads
    groupGreetings: Array.isArray(card.group_only_greetings)
      ? card.group_only_greetings.map(String)
      : Array.isArray((card.extensions as { group_greetings?: unknown[] } | undefined)?.group_greetings)
        ? ((card.extensions as { group_greetings: unknown[] }).group_greetings).map(String)
        : [],
    exampleDialogue: card.mes_example ?? '',
    systemPromptOverride: card.system_prompt ?? '',
    postHistoryInstructions: card.post_history_instructions ?? '',
    depthPrompt: studio.depthPrompt ?? { text: '', depth: 4, role: 'system' },
    creatorNotes: card.creator_notes ?? '',
    creator: card.creator ?? '',
    version: card.character_version ?? '',
    tags: card.tags ?? [],
    favorite: studio.favorite ?? false,
    folderId: studio.folderId ?? null,
    createdAt: studio.createdAt ?? 0,
    lastChatAt: studio.lastChatAt ?? lastChatAt,
    embeddedLorebookId: studio.embeddedLorebookId ?? null,
    linkedLorebookIds: studio.linkedLorebookIds ?? [],
    colors: studio.colors ?? { name: '', dialogue: '', bubble: '' },
    stats: studio.stats ?? [],
    isGroup: false,
    descVariants: studio.descVariants ?? [],
    personalityVariants: studio.personalityVariants ?? [],
    scenarioVariants: studio.scenarioVariants ?? [],
    versions: studio.versions ?? [],
    voiceProvider: studio.voiceProvider ?? '',
    voiceId: studio.voiceId ?? '',
    // unknown card fields (v3 extras + the spec extensions bag) ride the
    // character so edits can write them back — imports must not destroy data
    cardExtras: Object.keys(cardExtrasOf(card)).length ? cardExtrasOf(card) : undefined,
    gallery: (studio.gallery ?? []).map((g) => ({ ...g, url: storedMediaUrl(g.url) })),
    expressions: (studio.expressions ?? []).map((e) => ({ ...e, url: e.url ? storedMediaUrl(e.url) : e.url })),
    defaultExpression: studio.defaultExpression ?? 'neutral',
    characterRegexIds: studio.characterRegexIds ?? [],
    css: studio.css ?? '',
  }
}

export function characterToCard(c: Character): EngineCard {
  return {
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
      colors: c.colors, stats: c.stats, descVariants: c.descVariants,
      personalityVariants: c.personalityVariants, scenarioVariants: c.scenarioVariants,
      versions: c.versions, voiceProvider: c.voiceProvider, voiceId: c.voiceId,
      gallery: c.gallery, expressions: c.expressions, defaultExpression: c.defaultExpression,
      characterRegexIds: c.characterRegexIds, css: c.css,
    },
  }
}

export function groupToCharacter(g: EngineGroup, members: Character[]): Character {
  const first = members.find((m) => m.id === g.memberIds?.[0])
  return {
    id: g.id ?? '',
    name: g.name,
    avatar: first?.avatar ?? PLACEHOLDER,
    altAvatars: [], description: `Group chat with ${members.map((m) => m.name).join(', ')}.`,
    personality: '', scenario: '',
    firstMessage: g.openingMessage ?? `*${members.map((m) => m.name).join(', ')} are here.*`,
    altGreetings: [], groupGreetings: [], exampleDialogue: '', systemPromptOverride: '', postHistoryInstructions: '',
    depthPrompt: { text: '', depth: 4, role: 'system' },
    creatorNotes: '', creator: 'You', version: '1.0', tags: ['group'], favorite: false, folderId: null,
    createdAt: 0, lastChatAt: 0, embeddedLorebookId: null, linkedLorebookIds: [],
    colors: { name: '', dialogue: '', bubble: '' }, stats: [],
    isGroup: true, members: g.memberIds ?? [],
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
    model: typeof meta.model === 'string' && meta.model ? meta.model : null,
    authorNote: meta.authorNoteObject ?? { ...DEFAULT_AUTHOR_NOTE, text: meta.authorNote ?? '' },
    litopysCut: meta.litopysCut,
    temporary: meta.temporary === true,
    folderId: meta.folderId ?? null,
    chatTags: meta.chatTags ?? [],
    backgroundId: meta.backgroundId ?? null,
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
  if ('chatTags' in p) out.chatTags = p.chatTags
  if ('backgroundId' in p) out.backgroundId = p.backgroundId
  if ('fieldVariantSelection' in p) out.fieldVariantSelection = p.fieldVariantSelection
  return out
}

/** The EXACT prompt the engine would send for this chat right now (macros
 *  expanded, world info + summary + injections spliced) — powers prompt peek.
 *  With messageId the assembly is scoped to that message: the prompt as it
 *  existed at that point in the chat, not the current tail. */
export function promptPreview(chatId: string, opts?: { userText?: string; messageId?: string }): Promise<{
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
}> {
  const { userText, messageId } = opts ?? {}
  // ?siblingtools=1: the engine attaches the exact tool set a send's
  // wantsTools request would carry
  return j('/prompt/preview?siblingtools=1', {
    method: 'POST',
    body: JSON.stringify({ chatId, ...(userText?.trim() ? { userText } : {}), ...(messageId ? { messageId } : {}) }),
  })
}

/** World-info activation status for a chat — the same activation path a
 *  generation runs (constants + key matches over recent messages, with the
 *  real context-scaled budget), so the viewer shows what ACTUALLY fires. */
export interface WIStatusRec {
  book: string
  uid: number | null
  title: string
  chars: number
  constant: boolean
}
export interface WIStatus {
  fired: WIStatusRec[]
  skipped: WIStatusRec[]
  usedChars: number
  budgetChars: number
  contextTokens: number
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

export function fetchWIStatus(chatId: string): Promise<WIStatus> {
  return j('/wi-status', {
    method: 'POST',
    body: JSON.stringify({ chatId }),
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
    ...(S?.contextSize ? { openai_max_context: S.contextSize } : {}),
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
    contextSize: ep.openai_max_context ?? 8192, seed: ep.seed ?? 0,
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
    else if (k === 'contextSize') base.contextSize = v as number
    else if (k === 'seed') base.seed = v as number
    else (base as unknown as Record<string, { value: number; enabled: boolean }>)[k] = { value: v as number, enabled: true }
  }
  const samplers = bag?.samplers
    ? { ...base, ...bag.samplers, ...Object.fromEntries(Object.entries(flat).filter(([, v]) => v != null).map(([k, v]) => [k, (k === 'stopStrings' || k === 'maxTokens' || k === 'contextSize' || k === 'seed') ? v : (typeof v === 'number' ? { value: v, enabled: true } : v)])) }
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
    utilityPrompts: bag?.utilityPrompts ?? (ep.utilityPrompts as Preset['utilityPrompts'] | undefined) ?? { impersonation: '', continueNudge: '', newChat: '', groupNudge: '', emptySend: '' },
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
const POS_TO_ENGINE: Record<string, string> = {
  before_char: 'before_char', before_em: 'before_char', before_an: 'before_char', before_examples: 'before_char',
  after_char: 'after_char', after_em: 'after_char', after_an: 'after_char', after_examples: 'after_char',
  at_depth: 'at_depth',
}
const ENGINE_TO_POS: Record<string, LoreEntry['position']> = {
  before_char: 'before_char', after_char: 'after_char', at_depth: 'at_depth',
}

/** Import lorebook files. A native studio book is stored verbatim; anything
 *  else goes through the server-side world-info normalizer, where the FILE
 *  name becomes the book name because world files carry none. Returns the new
 *  book ids in order, and throws per file are reported by the caller. */
export async function importLorebookFiles(
  files: File[],
  onError: (message: string) => void,
): Promise<string[]> {
  const ids: string[] = []
  for (const file of files) {
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>
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
      onError(`${file.name}: ${(e as Error).message ?? 'could not parse'}`)
    }
  }
  return ids
}

export function lorebookToEngine(b: Lorebook): EngineLorebook {
  return {
    id: b.id, name: b.name, globalActive: b.globalActive, linkedCharacterIds: b.linkedCharacterIds,
    settings: b.settings, vectorized: b.vectorized, isEmbedded: b.isEmbedded, formatTemplate: b.formatTemplate,
    folderId: b.folderId,
    entries: b.entries.map((e, i) => ({
      uid: i,
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
    })),
  }
}

export function engineLorebookToUI(b: EngineLorebook, id: string): Lorebook {
  return {
    id, name: b.name ?? 'Lorebook', folderId: (b.folderId as string | null) ?? null,
    globalActive: b.globalActive === true,
    linkedCharacterIds: (b.linkedCharacterIds as string[]) ?? [],
    entries: (b.entries ?? []).map((e, i): LoreEntry => ({
      id: `e${e.uid ?? i}`,
      title: (e.title as string) ?? '', memo: (e.memo as string) ?? '',
      keys: e.keys ?? [], keysRegex: e.keysRegex === true,
      secondaryKeys: e.secondaryKeys ?? [],
      logic: ((e.selectiveLogic as LoreEntry['logic']) ?? 'AND_ANY'),
      status: ((e.status as LoreEntry['status']) ?? (e.constant === true ? 'constant' : 'normal')),
      content: e.content ?? '',
      position: ENGINE_TO_POS[e.position ?? 'before_char'] ?? 'before_char',
      depth: e.depth ?? 4, role: (e.role as LoreEntry['role']) ?? 'system',
      order: e.order ?? 100, probability: e.probability ?? 100, useProbability: e.probability != null && e.probability < 100,
      group: (e.group as string) ?? '', groupWeight: (e.groupWeight as number) ?? 100, groupPrioritize: e.groupPrioritize === true,
      sticky: (e.sticky as number) ?? 0, cooldown: (e.cooldown as number) ?? 0, delay: (e.delay as number) ?? 0,
      enabled: e.enabled !== false,
      characterFilter: (e.characterFilter as ID[]) ?? [], characterFilterExclude: e.characterFilterExclude === true,
      tagFilter: (e.tagFilter as string[]) ?? [], triggerFilters: (e.triggerFilters as string[]) ?? [],
      nonRecursable: e.nonRecursable === true, preventFurtherRecursion: e.preventFurtherRecursion === true, ignoreBudget: e.ignoreBudget === true,
      delayUntilRecursion: e.delayUntilRecursion === true,
      scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null, groupScoringOverride: null,
      automationId: (e.automationId as string) ?? '',
      matchSources: (e.matchSources as LoreEntry['matchSources']) ?? { description: false, personality: false, scenario: false, persona: false },
    })),
    settings: (b.settings as Lorebook['settings']) ?? {
      scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2,
      insertionStrategy: 'character_first', caseSensitive: false, wholeWords: true, groupScoring: false,
      recursiveScan: true, includeNames: true, overflowAlert: true,
    },
    vectorized: (b.vectorized as Lorebook['vectorized']) ?? { embedding: 'all-MiniLM-L6-v2', queryMessages: 2, scoreThreshold: 0.35, topK: 10 },
    isEmbedded: b.isEmbedded === true,
    formatTemplate: (b.formatTemplate as string) ?? '',
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
export function fileToDataUrl(file: File | Blob, max = 192, opts: { alpha?: boolean } = {}): Promise<string> {
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
      resolve(canEncodeWebp() ? canvas.toDataURL('image/webp', 0.9) : canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
    img.src = url
  })
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
  const res = await fetch(proxyUrl(url))
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

