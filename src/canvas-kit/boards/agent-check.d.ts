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
/** The most model calls an agent may make one behind another (the runner takes one pass for each, plus one to commit). */
export const AGENT_MAX_ROUNDS: number

export interface AgentIssue { code: string; message: string; node?: string }
export interface AgentDerived { needs: string[]; maxCalls: number; hash: string }
export interface AgentReport { errors: AgentIssue[]; warnings: AgentIssue[]; derived: AgentDerived | null }

export const splitEnd: (end: string) => [string, string]
export const readCanvasFile: (raw: unknown) => { file: CanvasFile } | { error: string }
/** Hash of what the agent IS: the header (without `derived`), the cards without their position, the wires. Moving a card does not change it. */
export const agentHash: (f: Pick<CanvasFile, 'nodes' | 'edges'> & { agent?: Record<string, unknown> }) => string
/** Checks an agent file. `derived` is what the file ought to declare (needs, calls, hash); a file that declares something else is refused. */
export function validateAgent(raw: unknown): AgentReport
/** Fills `agent.derived` from the cards, so a file made in the editor is always consistent. Returns the file and the report of the filled file. */
export function compileAgent(raw: unknown): { file: CanvasFile; report: AgentReport } | { error: string }
export type { CanvasNode }
