// ── Portable preset/regex JSON shapes shared across roleplay frontends
// (community data formats, no external code). Pure: no browser APIs, so the
// engine-side test suite typechecks this module directly.
import type { Preset, PromptSection, RegexScript } from './types.js'
import { uid } from './tokens.js'

// ─── Presets ───
// chat-completion preset shape: prompts[] + prompt_order[]
interface WirePrompt {
  name: string
  identifier: string
  role?: 'system' | 'user' | 'assistant'
  content?: string
  system_prompt?: boolean
  marker?: boolean
  injection_position?: number // 0 relative, 1 in-chat
  injection_depth?: number
  injection_order?: number
  forbid_overrides?: boolean
  /** generation types this prompt fires on; absent/empty = always */
  injection_trigger?: string[]
}
interface WirePromptOrderEntry { identifier: string; enabled: boolean }
interface WirePresetJson {
  prompts: WirePrompt[]
  /** regex scripts that travel with the preset and run only while it is active */
  extensions?: { regex_scripts?: unknown[]; [k: string]: unknown }
  prompt_order: { character_id: number; order: WirePromptOrderEntry[] }[]
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  repetition_penalty?: number
  frequency_penalty?: number
  presence_penalty?: number
  openai_max_tokens?: number
  openai_max_context?: number
  impersonation_prompt?: string
  continue_nudge_prompt?: string
  new_chat_prompt?: string
  group_nudge_prompt?: string
  send_if_empty?: string
  names_behavior?: number
  verbosity?: string
  continue_prefill?: boolean
  custom_prompt_post_processing?: string
  assistant_prefill?: string
  squash_system_messages?: boolean
  reasoning_effort?: string
  seed?: number
  stop?: string[]
  custom_stop_strings?: string
  stream_openai?: boolean
  // the wider textgen sampler sweep — keys the engine forwards verbatim
  [key: string]: unknown
}

/** Keys with first-class preset slots are excluded; everything else in this
 *  sweep rides extendedSamplers. Mirrors the engine's forwarded-key list. */
const EXTRA_NUM_KEYS = [
  'top_a', 'typical_p', 'eta_cutoff', 'epsilon_cutoff', 'repetition_penalty_range',
  'no_repeat_ngram_size', 'penalty_alpha', 'guidance_scale', 'negative_prompt_scale',
  'smoothing_factor', 'smoothing_curve', 'dry_multiplier', 'dry_base', 'dry_allowed_length',
  'dry_last_n', 'xtc_probability', 'xtc_threshold', 'dynatemp_min', 'dynatemp_max',
  'dynatemp_exponent', 'mirostat_mode', 'mirostat_tau', 'mirostat_eta',
]
const EXTRA_BOOL_KEYS = ['temperature_last', 'skip_special_tokens', 'ban_eos_token', 'add_bos_token']

/** names behavior is a numeric enum: NONE -1, DEFAULT 0, COMPLETION 1, CONTENT 2. */
const NAMES_BEHAVIOR: Record<Preset['namesBehavior'], number> = {
  none: -1, default: 0, completion: 1, content: 2,
}
const NAMES_BEHAVIOR_REVERSE: Record<number, Preset['namesBehavior']> = {
  '-1': 'none', 0: 'default', 1: 'completion', 2: 'content',
}
/** post-processing values; the `_tools` variants collapse onto the base mode. */
const POST_MODES: Record<string, Preset['promptPostProcessing']['mode']> = {
  '': 'none',
  claude: 'merge', // legacy alias, migrated to merge
  merge: 'merge', merge_tools: 'merge',
  semi: 'semi', semi_tools: 'semi',
  strict: 'strict', strict_tools: 'strict',
  single: 'single',
}

const MARKER_IDENTIFIERS: Record<string, PromptSection['marker']> = {
  main: 'main', nsfw: 'nsfw', jailbreak: 'jailbreak', charDescription: 'charDescription',
  charPersonality: 'personality', scenario: 'scenario', personaDescription: 'persona',
  dialogueExamples: 'exampleDialogue', chatHistory: 'chatHistory', worldInfoBefore: 'wiBefore',
  worldInfoAfter: 'wiAfter', summary: 'summary', depthPrompt: 'depthPrompt',
}
const MARKER_TO_IDENTIFIER: Record<string, string> = Object.fromEntries(
  Object.entries(MARKER_IDENTIFIERS).map(([k, v]) => [String(v), k]),
)

export function presetExport(preset: Preset, scripts: RegexScript[] = []): WirePresetJson {
  const ordered = [...preset.sections].sort((a, b) => a.order - b.order)
  const bound = scripts.filter((r) => r.scope === 'preset' && r.scopeTargetId === preset.id).sort((a, b) => a.order - b.order)
  return {
    ...(bound.length ? { extensions: { regex_scripts: bound.map(regexExport) } } : {}),
    prompts: ordered.map((s) => ({
      name: s.name,
      identifier: s.marker ? (MARKER_TO_IDENTIFIER[s.marker] ?? s.id) : s.id,
      role: s.role,
      content: s.content || undefined,
      system_prompt: s.role === 'system',
      marker: !!s.marker,
      injection_position: s.position === 'in-chat' ? 1 : 0,
      injection_depth: s.depth,
      injection_order: s.order,
      forbid_overrides: s.forbidOverrides,
    })),
    prompt_order: [{
      character_id: 100001,
      order: ordered.map((s) => ({
        identifier: s.marker ? (MARKER_TO_IDENTIFIER[s.marker] ?? s.id) : s.id,
        enabled: s.enabled,
      })),
    }],
    temperature: preset.samplers.temperature.value,
    top_p: preset.samplers.top_p.value,
    top_k: preset.samplers.top_k.value,
    min_p: preset.samplers.min_p.value,
    repetition_penalty: preset.samplers.rep_pen.value,
    frequency_penalty: preset.samplers.freq_pen.value,
    presence_penalty: preset.samplers.pres_pen.value,
    openai_max_tokens: preset.samplers.maxTokens,
    openai_max_context: preset.samplers.contextSize,
    impersonation_prompt: preset.utilityPrompts.impersonation,
    continue_nudge_prompt: preset.utilityPrompts.continueNudge,
    new_chat_prompt: preset.utilityPrompts.newChat,
    group_nudge_prompt: preset.utilityPrompts.groupNudge,
    send_if_empty: preset.utilityPrompts.emptySend,
    names_behavior: NAMES_BEHAVIOR[preset.namesBehavior],
    verbosity: preset.verbosity,
    continue_prefill: preset.continuePrefill,
    // the format encodes "off" as an empty string rather than a separate flag.
    custom_prompt_post_processing:
      preset.promptPostProcessing.enabled && preset.promptPostProcessing.mode !== 'none'
        ? preset.promptPostProcessing.mode
        : '',
    // everything below is read back by presetImport: without it an
    // export/import round trip silently drops the prefill, the stop strings,
    // the seed, streaming, squash and the whole extended sampler sweep
    assistant_prefill: preset.samplers.assistantPrefill,
    squash_system_messages: preset.squashSystemMessages,
    stream_openai: preset.samplers.streaming,
    seed: preset.samplers.seed,
    ...(preset.samplers.stopStrings.length ? { stop: preset.samplers.stopStrings } : {}),
    ...(preset.samplers.reasoning.enabled && preset.samplers.reasoning.effort !== 'off'
      ? { reasoning_effort: REASONING_EFFORT[preset.samplers.reasoning.effort] }
      : {}),
    ...preset.extendedSamplers,
  }
}

/** effort levels → the three the format carries; the finer studio levels
 *  round to the nearest one rather than exporting a value nothing reads. */
const REASONING_EFFORT: Record<Exclude<Preset['samplers']['reasoning']['effort'], 'off'>, string> = {
  min: 'low', low: 'low', med: 'medium', high: 'high', max: 'high',
}

const TRIGGERS = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'] as const

/** The chat-completion prompt order lives under the reserved character id
 *  100001; other ids in the same file are different layouts (the text-
 *  completion default order rides along under 100000), NOT the author's
 *  active arrangement. */
function activeOrder(d: WirePresetJson): WirePromptOrderEntry[] {
  const lists = (d.prompt_order ?? []).filter((o) => o && Array.isArray(o.order) && o.order.length > 0)
  return (lists.find((o) => o.character_id === 100001) ?? lists[0])?.order
    ?? d.prompts.map((p) => ({ identifier: p.identifier, enabled: true }))
}

// ─── Marinara presets ───
// { type: "marinara_preset", data: { preset, sections[], groups[], choiceBlocks[] } }; booleans and
// nested lists often arrive as strings ("true", "[...]").
type Loose = Record<string, unknown>
const truthy = (v: unknown) => v === true || v === 'true' || v === 1
const parsed = <T>(v: unknown, dflt: T): T => {
  if (typeof v !== 'string') return (v as T) ?? dflt
  try { return JSON.parse(v) as T } catch { return dflt }
}
// Marinara marker types -> our marker sections (canonical ids); the chat summary is left out:
// the story memory (Litopys) places itself
const MARINARA_MARKERS: Record<string, PromptSection['marker'][]> = {
  lorebook: ['wiBefore'], persona: ['persona'], character: ['charDescription', 'personality', 'scenario'],
  dialogue_examples: ['exampleDialogue'], chat_history: ['chatHistory'],
}
const MARINARA_EFFORT: Record<string, Preset['samplers']['reasoning']['effort']> = {
  minimal: 'min', low: 'low', medium: 'med', high: 'high', xhigh: 'max', maximum: 'max',
}

export function isMarinaraPreset(json: unknown): boolean {
  const d = json as Loose
  return !!d && d.type === 'marinara_preset' && !!d.data && typeof d.data === 'object'
}

function marinaraImport(json: unknown, name: string, base: Preset): Preset | null {
  const data = (json as { data: Loose }).data
  const mp = (data.preset ?? {}) as Loose
  const rawSections = Array.isArray(data.sections) ? (data.sections as Loose[]) : []
  const groups = (Array.isArray(data.groups) ? (data.groups as Loose[]) : []).filter((g) => typeof g.id === 'string')
  const offGroups = new Set(groups.filter((g) => g.enabled != null && !truthy(g.enabled)).map((g) => g.id as string))
  const wrap = mp.wrapFormat === 'markdown' || mp.wrapFormat === 'none' ? mp.wrapFormat : 'xml'
  // the author's order first, then anything it leaves out
  const order = parsed<string[]>(mp.sectionOrder, [])
  const byId = new Map(rawSections.map((s) => [s.id as string, s]))
  const ordered = [...order.map((id) => byId.get(id)).filter((s): s is Loose => !!s), ...rawSections.filter((s) => !order.includes(s.id as string))]
  const sections: PromptSection[] = []
  const used = new Set<string>()
  const common = (s: Loose) => {
    const groupId = typeof s.groupId === 'string' && groups.some((g) => g.id === s.groupId) ? s.groupId : null
    return {
      enabled: truthy(s.enabled) && !(groupId && offGroups.has(groupId)),
      role: (s.role === 'user' || s.role === 'assistant' ? s.role : 'system') as PromptSection['role'],
      position: (s.injectionPosition === 'depth' ? 'in-chat' : 'relative') as PromptSection['position'],
      depth: typeof s.injectionDepth === 'number' ? s.injectionDepth : 4,
      injectionTriggers: [...TRIGGERS],
      forbidOverrides: truthy(s.forbidOverrides),
      groupId,
    }
  }
  for (const s of ordered) {
    if (truthy(s.isMarker)) {
      const type = String(parsed<Loose>(s.markerConfig, {}).type ?? '')
      for (const marker of MARINARA_MARKERS[type] ?? []) {
        const id = MARKER_TO_IDENTIFIER[String(marker)]
        if (!id || used.has(id)) continue
        used.add(id)
        sections.push({ ...common(s), id, name: type === 'character' ? `${s.name || 'Character'} (${id})` : String(s.name || id), marker, content: '', order: sections.length })
      }
      continue
    }
    const tag = truthy(s.wrapInXml) && typeof s.xmlTagName === 'string' && s.xmlTagName.trim() ? s.xmlTagName.trim() : ''
    const content = String(s.content ?? '')
    sections.push({ ...common(s), id: uid('sec'), name: String(s.name || 'Section'), marker: null, content: tag ? `<${tag}>\n${content}\n</${tag}>` : content, order: sections.length })
  }
  if (!sections.length) return null
  const defaults = parsed<Record<string, string | string[]>>(mp.defaultChoices, {})
  const blocks = (Array.isArray(data.choiceBlocks) ? (data.choiceBlocks as Loose[]) : [])
    .filter((b) => typeof b.variableName === 'string' && /^[\w.-]+$/.test(b.variableName))
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
  const variables: Preset['variables'] = blocks.map((b) => {
    const varName = b.variableName as string
    const choices = parsed<Loose[]>(b.options, []).filter((o) => o && typeof o.value === 'string')
      .map((o) => ({ id: typeof o.id === 'string' && o.id ? o.id : uid('opt'), label: String(o.label || o.value), value: String(o.value) }))
    const want = defaults[varName]
    const wanted = (Array.isArray(want) ? want : want == null ? [] : [want]).map((x) => String(x).trim())
    const picked = choices.filter((c) => wanted.includes(c.value.trim())).map((c) => c.id)
    return {
      id: uid('var'),
      name: varName,
      label: varName.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      type: 'choice' as const,
      defaultValue: '',
      question: typeof b.question === 'string' ? b.question : '',
      choices,
      multi: truthy(b.multiSelect),
      separator: typeof b.separator === 'string' ? b.separator : ', ',
      display: b.displayMode === 'buttons' ? 'buttons' as const : 'list' as const,
      defaults: picked,
    }
  })
  const pr = parsed<Loose>(mp.parameters, {})
  const num = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt)
  const effort = typeof pr.reasoningEffort === 'string' ? MARINARA_EFFORT[pr.reasoningEffort] : undefined
  const stops = Array.isArray(pr.stopSequences) ? pr.stopSequences.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
  return {
    ...base,
    id: uid('preset'),
    name: typeof mp.name === 'string' && mp.name.trim() ? mp.name.trim() : name,
    readOnly: false,
    isDefault: false,
    sections,
    library: [],
    groups: groups.map((g) => ({ id: g.id as string, name: String(g.name || 'Group'), wrapFormat: wrap })),
    variables,
    description: typeof mp.description === 'string' ? mp.description : '',
    verbosity: pr.verbosity === 'low' || pr.verbosity === 'medium' || pr.verbosity === 'high' ? pr.verbosity : base.verbosity,
    squashSystemMessages: typeof pr.squashSystemMessages === 'boolean' ? pr.squashSystemMessages : base.squashSystemMessages,
    samplers: {
      ...base.samplers,
      temperature: { ...base.samplers.temperature, value: num(pr.temperature, base.samplers.temperature.value) },
      top_p: { ...base.samplers.top_p, value: num(pr.topP, base.samplers.top_p.value) },
      top_k: { ...base.samplers.top_k, value: num(pr.topK, base.samplers.top_k.value) },
      min_p: { ...base.samplers.min_p, value: num(pr.minP, base.samplers.min_p.value) },
      rep_pen: { ...base.samplers.rep_pen, value: num(pr.repetitionPenalty, base.samplers.rep_pen.value) },
      freq_pen: { ...base.samplers.freq_pen, value: num(pr.frequencyPenalty, base.samplers.freq_pen.value) },
      pres_pen: { ...base.samplers.pres_pen, value: num(pr.presencePenalty, base.samplers.pres_pen.value) },
      maxTokens: num(pr.maxTokens, base.samplers.maxTokens),
      contextSize: num(pr.maxContext, base.samplers.contextSize),
      stopStrings: stops.length ? stops : base.samplers.stopStrings,
      assistantPrefill: typeof pr.assistantPrefill === 'string' && pr.assistantPrefill.trim() ? pr.assistantPrefill : base.samplers.assistantPrefill,
      reasoning: effort ? { ...base.samplers.reasoning, enabled: true, effort } : base.samplers.reasoning,
    },
    createdAt: Date.now(),
  }
}

export function presetImport(json: unknown, name: string, base: Preset): Preset | null {
  if (isMarinaraPreset(json)) return marinaraImport(json, name, base)
  const d = json as WirePresetJson
  if (!d || !Array.isArray(d.prompts)) return null
  const orderList = activeOrder(d)
  const promptMap = new Map(d.prompts.map((p) => [p.identifier, p]))
  const sections: PromptSection[] = []
  let i = 0
  for (const entry of orderList) {
    const p = promptMap.get(entry.identifier)
    if (!p) continue
    const triggers = (p.injection_trigger ?? []).filter((t): t is (typeof TRIGGERS)[number] =>
      (TRIGGERS as readonly string[]).includes(t))
    const marker = MARKER_IDENTIFIERS[p.identifier] ?? null
    sections.push({
      // marker sections take the CANONICAL identifier as their id — the
      // engine matches markers by identifier ("chatHistory", "main", …), so
      // a generated id would silently detach the section from its engine text
      id: marker ? (MARKER_TO_IDENTIFIER[marker] ?? uid('sec')) : uid('sec'),
      name: p.name || entry.identifier,
      enabled: entry.enabled,
      // files in the wild carry empty-string roles alongside the valid ones
      role: p.role || 'system',
      marker,
      content: p.content ?? '',
      position: p.injection_position === 1 ? 'in-chat' : 'relative',
      depth: p.injection_depth ?? 4,
      // the LIST INDEX is the section order — injection_order is a per-depth
      // tiebreak for in-chat entries in the source format, and files in the
      // wild carry constant values (100 on most entries) that would scramble
      // the arrangement the moment anything sorts by order
      order: i,
      // absent/empty trigger list means "every generation type"
      injectionTriggers: triggers.length ? [...triggers] : [...TRIGGERS],
      forbidOverrides: !!p.forbid_overrides,
      groupId: null,
    })
    i++
  }
  if (sections.length === 0) return null
  // NEVER trim a stop string: leading whitespace is the point of the most
  // common one ("\nUser:" halts the model as it starts the user's turn).
  // Blank entries from splitting the multi-line field are dropped instead.
  const stops = [
    ...(Array.isArray(d.stop) ? d.stop.filter((x) => typeof x === 'string' && x) : []),
    ...(typeof d.custom_stop_strings === 'string' && d.custom_stop_strings.trim() ? d.custom_stop_strings.split('\n') : []),
  ].filter((x) => x.trim())
  const effort: Partial<Record<string, Preset['samplers']['reasoning']['effort']>> = {
    minimal: 'min', low: 'low', medium: 'med', high: 'high', xhigh: 'max',
  }
  const mappedEffort = d.reasoning_effort ? effort[d.reasoning_effort] : undefined
  // the textgen sweep beyond the classic knobs (dry/xtc/dynatemp/mirostat/
  // smoothing/typical/…) — carried verbatim, forwarded only when set
  const extended: Record<string, number | string | boolean> = {}
  for (const k of EXTRA_NUM_KEYS) if (typeof d[k] === 'number') extended[k] = d[k] as number
  for (const k of EXTRA_BOOL_KEYS) if (typeof d[k] === 'boolean') extended[k] = d[k] as boolean
  if (typeof d.negative_prompt === 'string' && d.negative_prompt.trim()) extended.negative_prompt = d.negative_prompt
  return {
    ...base,
    id: uid('preset'),
    name,
    readOnly: false,
    isDefault: false,
    sections,
    utilityPrompts: {
      impersonation: d.impersonation_prompt ?? base.utilityPrompts.impersonation,
      continueNudge: d.continue_nudge_prompt ?? base.utilityPrompts.continueNudge,
      newChat: d.new_chat_prompt ?? base.utilityPrompts.newChat,
      groupNudge: d.group_nudge_prompt ?? base.utilityPrompts.groupNudge,
      emptySend: d.send_if_empty ?? base.utilityPrompts.emptySend,
    },
    namesBehavior:
      d.names_behavior != null
        ? NAMES_BEHAVIOR_REVERSE[d.names_behavior] ?? base.namesBehavior
        : base.namesBehavior,
    verbosity:
      d.verbosity && (['auto', 'low', 'medium', 'high'] as const).includes(
        d.verbosity as Preset['verbosity'],
      )
        ? (d.verbosity as Preset['verbosity'])
        : base.verbosity,
    continuePrefill: d.continue_prefill ?? base.continuePrefill,
    squashSystemMessages: d.squash_system_messages ?? base.squashSystemMessages,
    promptPostProcessing: {
      // the format carries no equivalent of the utility model / instruction
      // fields, so those keep the base preset's values across a round-trip.
      ...base.promptPostProcessing,
      // an empty/absent value means post-processing was switched off.
      enabled: !!d.custom_prompt_post_processing,
      mode: POST_MODES[d.custom_prompt_post_processing ?? ''] ?? 'none',
    },
    samplers: {
      ...base.samplers,
      temperature: { ...base.samplers.temperature, value: d.temperature ?? base.samplers.temperature.value },
      top_p: { ...base.samplers.top_p, value: d.top_p ?? base.samplers.top_p.value },
      top_k: { ...base.samplers.top_k, value: d.top_k ?? base.samplers.top_k.value },
      min_p: { ...base.samplers.min_p, value: d.min_p ?? base.samplers.min_p.value },
      rep_pen: { ...base.samplers.rep_pen, value: d.repetition_penalty ?? base.samplers.rep_pen.value },
      freq_pen: { ...base.samplers.freq_pen, value: d.frequency_penalty ?? base.samplers.freq_pen.value },
      pres_pen: { ...base.samplers.pres_pen, value: d.presence_penalty ?? base.samplers.pres_pen.value },
      maxTokens: d.openai_max_tokens ?? base.samplers.maxTokens,
      contextSize: d.openai_max_context ?? base.samplers.contextSize,
      seed: typeof d.seed === 'number' && d.seed >= 0 ? d.seed : base.samplers.seed,
      streaming: d.stream_openai ?? base.samplers.streaming,
      stopStrings: stops.length ? [...new Set(stops)] : base.samplers.stopStrings,
      assistantPrefill: d.assistant_prefill?.trim() ? d.assistant_prefill : base.samplers.assistantPrefill,
      reasoning: mappedEffort
        ? { ...base.samplers.reasoning, enabled: true, effort: mappedEffort }
        : base.samplers.reasoning,
    },
    ...(Object.keys(extended).length ? { extendedSamplers: extended } : {}),
    createdAt: Date.now(),
  }
}

// ─── Regex scripts (portable JSON) ───
interface WireRegex {
  scriptName?: string
  findRegex?: string
  replaceString?: string
  trimStrings?: string[]
  placement?: number[] // 1 user, 2 ai, 3 slash, 5 wi, 6 reasoning
  disabled?: boolean
  markdownOnly?: boolean
  promptOnly?: boolean
  runOnEdit?: boolean
  substituteRegex?: number // 0 none, 1 raw, 2 escaped
  minDepth?: number | null
  maxDepth?: number | null
}

export function regexImport(json: unknown): Omit<RegexScript, 'id' | 'order'> | null {
  const d = json as WireRegex
  if (!d || typeof d.findRegex !== 'string') return null
  // the format stores /pattern/flags or a bare pattern
  let find = d.findRegex
  let flags = 'g'
  const m = /^\/(.*)\/([a-z]*)$/s.exec(d.findRegex)
  if (m) { find = m[1] ?? d.findRegex; flags = m[2] || 'g' }
  const placement = d.placement ?? [2]
  return {
    name: d.scriptName ?? 'Imported script',
    scope: 'global',
    scopeTargetId: null,
    find,
    replace: d.replaceString ?? '',
    flags,
    placements: {
      userInput: placement.includes(1),
      aiOutput: placement.includes(2),
      slash: placement.includes(3),
      wi: placement.includes(5),
      reasoning: placement.includes(6),
    },
    markdownOnly: !!d.markdownOnly,
    promptOnly: !!d.promptOnly,
    minDepth: d.minDepth ?? null,
    maxDepth: d.maxDepth ?? null,
    trimStrings: d.trimStrings ?? [],
    runOnEdit: !!d.runOnEdit,
    macroMode: d.substituteRegex === 1 ? 'raw' : d.substituteRegex === 2 ? 'escaped' : 'none',
    enabled: !d.disabled,
  }
}

export function regexExport(script: RegexScript): WireRegex {
  const placement: number[] = []
  if (script.placements.userInput) placement.push(1)
  if (script.placements.aiOutput) placement.push(2)
  if (script.placements.slash) placement.push(3)
  if (script.placements.wi) placement.push(5)
  if (script.placements.reasoning) placement.push(6)
  return {
    scriptName: script.name,
    findRegex: `/${script.find.replace(/(?<!\\)\//g, '\\/')}/${script.flags}`,
    replaceString: script.replace,
    trimStrings: script.trimStrings,
    placement,
    disabled: !script.enabled,
    markdownOnly: script.markdownOnly,
    promptOnly: script.promptOnly,
    runOnEdit: script.runOnEdit,
    substituteRegex: script.macroMode === 'raw' ? 1 : script.macroMode === 'escaped' ? 2 : 0,
    minDepth: script.minDepth,
    maxDepth: script.maxDepth,
  }
}

/** Extract the base64 `chara` tEXt chunk from a character card PNG.
 *  A v3 card (`ccv3`) wins over the v2 chunk a card carries for backward
 *  compatibility, so the richer record is the one imported. */
export async function extractCharaFromPng(file: File): Promise<unknown | null> {
  const buf = new Uint8Array(await file.arrayBuffer())
  // PNG signature is 8 bytes; then chunks: length(4) type(4) data(length) crc(4)
  if (buf.length < 8) return null
  let pos = 8
  const td = new TextDecoder('latin1')
  let v2: unknown | null = null
  while (pos + 8 <= buf.length) {
    const len = (buf[pos]! * 0x1000000) + (buf[pos + 1]! << 16) + (buf[pos + 2]! << 8) + buf[pos + 3]!
    // a length that doesn't advance or overruns the file means the chunk
    // stream is corrupt; walking further would loop or read past the end
    if (len < 0 || pos + 12 + len > buf.length) break
    const type = td.decode(buf.slice(pos + 4, pos + 8))
    if (type === 'tEXt') {
      const data = buf.slice(pos + 8, pos + 8 + len)
      const nul = data.indexOf(0)
      if (nul > 0) {
        const keyword = td.decode(data.slice(0, nul))
        if (keyword === 'chara' || keyword === 'ccv3') {
          const parsed = decodeCardChunk(td.decode(data.slice(nul + 1)))
          if (keyword === 'ccv3' && parsed !== null) return parsed
          if (v2 === null) v2 = parsed
        }
      }
    }
    pos += 12 + len
  }
  return v2
}

/** Card JSON is base64 over UTF-8 bytes. Decoding straight out of `atob`
 *  reads those bytes as latin1, which mangles every non-ASCII name and
 *  quotation mark in the card. */
function decodeCardChunk(b64: string): unknown | null {
  try {
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null }
}
