// The agent board for the editor: the card set from agent-check.js as a BoardKind, with the wiring rules the checker
// also enforces (types must match, one wire per input, no loops). The checker itself, the cards and the file format
// live in agent-check.js, a plain JS file that the runner plugin can carry too. Format: docs/DATA-FORMATS.md, "Agents".

import { wouldCycle } from '../graph'
import type { BoardKind, Graph, PortDef } from '../graph'
import { AGENT_CARDS } from './agent-check'

export { AGENT_CARDS, PANEL_PLACES, SHOW_BY_KIND, agentHash, compileAgent, validateAgent } from './agent-check'
export type { AgentCard, AgentDerived, AgentIssue, AgentReport } from './agent-check'

const one = (ports: PortDef[]): PortDef[] => ports.map((p) => (p.side === 'in' ? { ...p, max: 1 } : p)) // an input takes one wire

export const AGENT_BOARD: BoardKind = {
  kind: 'agent',
  types: Object.fromEntries(
    Object.entries(AGENT_CARDS).map(([type, c]) => [type, { type, label: c.label, colorVar: c.colorVar, hint: c.hint, ports: [], portsFor: (p: Record<string, unknown>) => one(c.ports(p)), deletable: type !== 'agent.input' }]),
  ),
  canConnect: (g: Graph, from: string, to: string) =>
    wouldCycle({ nodes: g.nodes, edges: g.edges.filter((e) => !e.locked) }, from, to)
      ? { ok: false, reason: 'That would make a loop. Agents have no loops in this version' }
      : { ok: true },
}
