// Types of agent-check.js (plain JS, see the note at its top).
import type { CanvasFile, CanvasNode, PortDef } from '../graph'

export interface AgentCard {
  label: string
  colorVar: string
  hint: string
  ports: (params: Record<string, any>) => PortDef[]
  /** permission tokens the card needs (shown on the install screen, never trusted from the file) */
  needs: (params: Record<string, any>) => string[]
  /** model calls the card can make per run */
  calls?: number
}
export const AGENT_CARDS: Record<string, AgentCard>
/** Where an Output of each kind may show its result. The first entry is the default place. */
export const SHOW_BY_KIND: Record<string, string[]>
export const PANEL_PLACES: string[]
/** The `grid` widget: the tones a legend entry may name, and the most columns/rows (`size`) and legend entries. */
export const GRID_TONES: string[]
export const GRID_LIMITS: { size: number; legend: number }
/** The most model calls an agent may make one behind another (the runner takes one pass for each, plus one to commit). */
export const AGENT_MAX_ROUNDS: number

/** The Dashboard fields an agent may read: `as` is the wire type, `char` = per character (named by `of`, else the one who spoke last). */
export const DASH_FIELDS: Record<string, { as: 'text' | 'number'; char?: true }>
/** The key under which the host hands a Dashboard value to the executor (`ctx.dash`): `field`, or `field@name` with `of`. */
export const dashKey: (x: { field?: string; of?: string } | null | undefined) => string | undefined

export interface AgentIssue { code: string; message: string; node?: string }
export interface AgentDerived { needs: string[]; maxCalls: number; hash: string }
export interface AgentReport { errors: AgentIssue[]; warnings: AgentIssue[]; derived: AgentDerived | null }

/** What is wrong with the template of an `html` widget, for the editor (empty = fine). `state` is the agent's `state`. */
export function templateProblems(tpl: unknown, state: Record<string, { type: string; item?: Record<string, string> }> | undefined): { code: string; message: string }[]

export const splitEnd: (end: string) => [string, string]
export const readCanvasFile: (raw: unknown) => { file: CanvasFile } | { error: string }
/** Hash of what the agent IS: the header (without `derived`), the cards without their position, the wires. Moving a card does not change it. */
export const agentHash: (f: Pick<CanvasFile, 'nodes' | 'edges'> & { agent?: Record<string, unknown> }) => string
/** Checks an agent file. `derived` is what the file ought to declare (needs, calls, hash); a file that declares something else is refused. */
export function validateAgent(raw: unknown): AgentReport
/** Fills `agent.derived` from the cards, so a file made in the editor is always consistent. Returns the file and the report of the filled file. */
export function compileAgent(raw: unknown): { file: CanvasFile; report: AgentReport } | { error: string }
export type { CanvasNode }
