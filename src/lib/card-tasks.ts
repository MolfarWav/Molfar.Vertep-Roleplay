// The model for a card's own tasks (GitHub #104): Structure it, Fill empty, the Soul rating. A card can name
// its own; else an app-wide "Card tasks" model; else the Dashboard sensor's; else the app's default. The limits
// follow the model's real window instead of fixed numbers. Pure: the editor and the plugin (plugins/profile)
// share the order, and the plugin has its own copy of it (`resolveTaskModel`).

import type { ModelInfo } from '@/lib/types'

/** A card's own task settings, kept in `characters/<id>/card-tasks.json` (not in the card, so a shared card carries none). */
export interface CardTasks {
  model?: string
  /** Tokens of the card sent in one call; unset = what the model's window allows. */
  maxInput?: number
  /** Tokens of the reply; unset = the task's usual size, kept inside the model's real maximum. */
  maxOutput?: number
}

export type ModelSource = 'card' | 'app' | 'sensor' | 'default' | 'none'

/** Which model runs a card's task, and why. `pick` is the editor's unsaved choice for this card. */
export function resolveCardModel(pick: string | undefined, app: string | undefined, sensor: string | undefined, fallback: string | null | undefined): { model: string; source: ModelSource } {
  if (pick) return { model: pick, source: 'card' }
  if (app) return { model: app, source: 'app' }
  if (sensor) return { model: sensor, source: 'sensor' }
  if (fallback) return { model: fallback, source: 'default' }
  return { model: '', source: 'none' }
}

export type TaskKind = 'structure' | 'fill'

/** The reply size each task asks for when nothing else is set. */
export const TASK_OUTPUT: Record<TaskKind, number> = { structure: 12000, fill: 8000 }
/** The system prompt, the instructions and the part lead share the window with the card. */
export const TASK_OVERHEAD = 1500
/** The card's share when the model's window is not known: about what the fixed cut used to allow. */
export const UNKNOWN_INPUT_TOKENS = 6000

export interface TaskLimits {
  /** The model's window and its reply maximum, when known. */
  context: number | null
  maxOut: number | null
  /** Tokens of the card in one call, and the reply size, after the model's real limits. */
  inputTokens: number
  outputTokens: number
}

type WindowOf = Pick<ModelInfo, 'context' | 'maxOut'>

/** What fits one call: the reply is capped by the model's maximum and by half its window; the card gets what is left. */
export function taskLimits(model: WindowOf | null | undefined, own: CardTasks, kind: TaskKind): TaskLimits {
  const context = model && model.context > 0 ? model.context : null
  const maxOut = model && model.maxOut > 0 ? model.maxOut : null
  let out = own.maxOutput && own.maxOutput > 0 ? own.maxOutput : TASK_OUTPUT[kind]
  if (maxOut) out = Math.min(out, maxOut)
  if (context) out = Math.min(out, Math.floor(context / 2))
  out = Math.max(800, out)
  const room = context ? Math.max(500, context - out - TASK_OVERHEAD) : null
  const inputTokens = own.maxInput && own.maxInput > 0 ? Math.min(own.maxInput, room ?? own.maxInput) : (room ?? UNKNOWN_INPUT_TOKENS)
  return { context, maxOut, inputTokens: Math.max(500, inputTokens), outputTokens: out }
}

/** How many calls the card's text needs at these limits. */
export function fitReport(cardTokens: number, limits: TaskLimits): { parts: number; fits: boolean } {
  const parts = Math.max(1, Math.ceil(cardTokens / limits.inputTokens))
  return { parts, fits: parts === 1 }
}

/** The limits as the plugin takes them: the card's share in characters, from this very text's characters per token. */
export function requestLimits(limits: TaskLimits, text: string, tokens: number): { inputChars: number; outputTokens: number } {
  const perToken = Math.min(6, Math.max(1.2, text.length / Math.max(1, tokens)))
  return { inputChars: Math.floor(limits.inputTokens * perToken * 0.95), outputTokens: limits.outputTokens }
}

/** Makes a tokens count short: 128000 -> "128k". */
export function shortTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
