// Types of agent-run.js (plain JS, see the note at its top).
import type { CanvasFile } from '../graph'

export type YesNoUnknown = 'yes' | 'no' | 'unknown'
export interface AskRequest { node: string; role: string; prompt: string; maxTokens?: number; batchKey?: string }
export type StateField =
  | { type: 'number'; min?: number; max?: number; start?: number }
  | { type: 'text'; start?: string }
  | { type: 'flag'; start?: boolean }
  | { type: 'list'; item: Record<string, 'number' | 'text' | 'flag'>; max: number }
export type StateSchema = Record<string, StateField>
export type Own = Record<string, number | string | boolean | Array<Record<string, unknown>>>

export type Write =
  | { op: 'dash.set'; field: string; value: string | number; clamp?: { min?: number; max?: number; maxStep?: number } }
  | { op: 'own.set'; field: string; value: number | string | boolean }
  | { op: 'own.add'; field: string; by: number; clamp?: { maxStep?: number } }
  | { op: 'list.add'; field: string; item: Record<string, unknown> }
  | { op: 'list.update'; field: string; key: string; id: unknown; item: Record<string, unknown> }
  | { op: 'list.remove'; field: string; key: string; id: unknown }

export type AgentOutput =
  | { node: string; kind: 'state-patch'; show?: string }
  | { node: string; kind: 'prompt-insert'; text: string; position: string; label: string; show?: string }
  | { node: string; kind: 'note'; title: string; text: string; short?: string; show?: string }
  | { node: string; kind: 'choices'; choices: string[]; show?: string }

export interface TraceStep { node: string; status: 'ran' | 'skipped' | 'waiting'; out?: Record<string, unknown> }
export interface RunContext {
  /** what the host read for the Input card, by give id */
  inputs?: Record<string, string | number | undefined>
  own?: Own
  /** Dashboard fields */
  dash?: Record<string, string | number | undefined>
  chat?: { messageCount?: number; lastSpeaker?: string }
}
export type RunResult =
  | { status: 'need'; requests: AskRequest[]; trace: TraceStep[] }
  | { status: 'done'; writes: Write[]; outputs: AgentOutput[]; calls: number; trace: TraceStep[] }
  | { status: 'failed'; reason: string; node?: string; trace: TraceStep[] }

export function runAgent(file: CanvasFile, ctx: RunContext, answers: Record<string, { text?: string; error?: string }>): RunResult
export function applyWrites(schema: StateSchema | undefined, own: Own | undefined, writes: Write[]): { own: Own; refused: Array<{ write: Write; why: string }> }
export function initialOwn(schema: StateSchema | undefined): Own
export function parseYesNo(text: string): { answer: YesNoUnknown; reason: string }
export function extractJson(text: string): Record<string, unknown> | null
export function shapeValues(obj: Record<string, unknown>, shape: Record<string, string>): { values: Record<string, string | number> } | { error: string }
export function askPrompt(prompt: string, answer?: { as?: string; shape?: Record<string, string> }): string
export function ruleResult(type: string, op: string, left: unknown, right: unknown): YesNoUnknown
export function combineRules(match: string, results: YesNoUnknown[]): YesNoUnknown
