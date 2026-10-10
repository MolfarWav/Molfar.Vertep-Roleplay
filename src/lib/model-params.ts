// The engine keeps sampling parameters on the MODEL (engine 0.9.2: model-params.json, blocks by
// caller; this app's replies take the "chat" block). Here: reading them, the model's limits this app
// budgets with, and the one-time move of the active preset's samplers into the current model.

import type { ModelInfo, Preset } from './types'

/** One block as the engine stores it; only the fields this app reads or writes are typed. */
export interface ParamBlock {
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  repetition_penalty?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  max_tokens?: number
  reasoning?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  thinkingBudget?: number
  reasoningTags?: { open: string; close: string }
  params?: Record<string, unknown>
}
export type ModelParams = Record<string, Record<string, ParamBlock>>

/** GET /v1/models/params; null when the engine has none (an older engine answers 404) or is unreachable. */
export async function fetchModelParams(): Promise<ModelParams | null> {
  try {
    const r = await fetch('/v1/models/params')
    if (!r.ok) return null
    const body = (await r.json()) as { models?: ModelParams }
    return body.models ?? {}
  } catch {
    return null
  }
}

/** PUT one model's whole entry (the engine validates; a 400 answers { error }). */
export async function putModelParams(ref: string, blocks: Record<string, ParamBlock> | null): Promise<ModelParams> {
  const r = await fetch('/v1/models/params', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: ref, blocks }),
  })
  const body = (await r.json().catch(() => ({}))) as { models?: ModelParams; error?: string }
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return body.models ?? {}
}

/**
 * What the reply request tells the engine plugin to budget with: the model's context window and the
 * max output of its Chat block. Absent values leave the preset's numbers in charge (older engines,
 * unknown windows).
 */
export function modelLimits(ref: string | null, models: ModelInfo[], params: ModelParams): { contextWindow?: number; maxOutput?: number } {
  if (!ref) return {}
  const m = models.find((x) => x.ref === ref)
  const max = params[ref]?.chat?.max_tokens
  return {
    ...(m && m.context > 0 ? { contextWindow: m.context } : {}),
    ...(typeof max === 'number' && max > 0 ? { maxOutput: max } : {}),
  }
}

const EFFORT: Record<string, ParamBlock['reasoning']> = { min: 'minimal', low: 'low', med: 'medium', high: 'high', max: 'max' }
const inRange = (v: number, lo: number, hi: number, int = false) => Number.isFinite(v) && v >= lo && v <= hi && (!int || Number.isInteger(v))

/** The preset's enabled samplers as a Chat block, within the ranges the engine accepts. */
export function presetToBlock(p: Preset): ParamBlock {
  const S = p.samplers
  const out: ParamBlock = {}
  if (!S) return out
  const on = (s: { value: number; enabled: boolean } | undefined, lo: number, hi: number, int = false) =>
    s && s.enabled && inRange(s.value, lo, hi, int) ? s.value : undefined
  const set = <K extends keyof ParamBlock>(k: K, v: ParamBlock[K] | undefined) => {
    if (v !== undefined) out[k] = v
  }
  set('temperature', on(S.temperature, 0, 2))
  set('top_p', on(S.top_p, 0, 1))
  set('top_k', on(S.top_k, 0, 100000, true))
  set('min_p', on(S.min_p, 0, 1))
  set('repetition_penalty', on(S.rep_pen, 0, 3))
  set('frequency_penalty', on(S.freq_pen, -2, 2))
  set('presence_penalty', on(S.pres_pen, -2, 2))
  if (S.maxTokens > 0 && inRange(S.maxTokens, 1, 1000000, true)) out.max_tokens = S.maxTokens
  if (S.seed >= 0 && inRange(S.seed, 0, 2147483647, true)) out.seed = S.seed
  const r = S.reasoning
  if (r?.enabled && r.effort !== 'off' && EFFORT[r.effort]) {
    out.reasoning = EFFORT[r.effort]
    if (r.budget > 0 && inRange(r.budget, 0, 1000000, true)) out.thinkingBudget = r.budget
    if (r.autoParse && r.thinkTagOpen && r.thinkTagClose && r.thinkTagOpen.length <= 64 && r.thinkTagClose.length <= 64) {
      out.reasoningTags = { open: r.thinkTagOpen, close: r.thinkTagClose }
    }
  }
  const extra = p.extendedSamplers && typeof p.extendedSamplers === 'object' ? (p.extendedSamplers as Record<string, unknown>) : null
  if (extra) {
    const params = Object.fromEntries(Object.entries(extra).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean'))
    if (Object.keys(params).length && JSON.stringify(params).length <= 4096) out.params = params
  }
  return out
}

/**
 * Once per workspace: the active preset's samplers go into the current model's Chat block, only the
 * fields the block does not have yet (what the user set on the model stays). Answers the new
 * parameters, or null when there was nothing to move.
 */
export async function moveSamplersToModel(ref: string, preset: Preset, params: ModelParams): Promise<ModelParams | null> {
  const fromPreset = presetToBlock(preset)
  if (!Object.keys(fromPreset).length) return null
  const entry = params[ref] ?? {}
  const chat = { ...fromPreset, ...(entry.chat ?? {}) }
  if (JSON.stringify(chat) === JSON.stringify(entry.chat ?? {})) return null
  return putModelParams(ref, { ...entry, chat })
}

/** What this app's replies would be sent and where each value comes from (engine 0.9.5). */
export interface EffectiveParams {
  block: string | null
  applied?: {
    temperature?: number
    max_tokens?: number
    reasoning?: string
    thinkingBudget?: number
    /** "model": the model's Chat block; "request": this preset */
    from: Record<string, 'model' | 'request'>
  }
}

/** The preset's side of a reply request, as the engine plugin builds it (plugin.js assemble). */
export function presetRequestSide(p: Preset | undefined): Record<string, string> {
  const S = p?.samplers
  if (!S) return {}
  const out: Record<string, string> = {}
  if (S.temperature?.enabled) out.temperature = String(S.temperature.value)
  if (S.maxTokens > 0) out.max_tokens = String(S.maxTokens)
  if (S.reasoning?.enabled && S.reasoning.effort !== 'off') out.reasoning = EFFORT[S.reasoning.effort] ?? S.reasoning.effort
  if (S.reasoning?.enabled && S.reasoning.budget > 0) out.thinkingBudget = String(S.reasoning.budget)
  if (p?.samplersOverrideModel) out.paramsSource = 'request'
  return out
}

/** GET /v1/models/params/effective for this app's chat replies; `applied` is missing on engines before 0.9.5. */
export async function fetchEffectiveParams(ref: string, side: Record<string, string>, signal?: AbortSignal): Promise<EffectiveParams> {
  const qs = new URLSearchParams({ model: ref, source: 'app:roleplay/roleplay__engine', key: 'reply', ...side })
  const r = await fetch(`/v1/models/params/effective?${qs}`, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as EffectiveParams
}
