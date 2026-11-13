import type { AgentInfo, ChatAgentItem } from './agents'

/** What one run of an agent costs, as the plugin estimates it (Molfar.Vertep#396). Never exact: the screens say "about". */
export interface AgentCost { calls: number; tokensIn: number; tokensOut: number }

/** Every how many replies the agent runs: the person's own cadence, else the author's, else every reply. */
export const cadenceOf = (a: Pick<AgentInfo, 'own' | 'trigger'>): number => {
  const own = a.own?.everyN ?? 0
  if (own > 0) return own
  const n = a.trigger?.everyN
  return typeof n === 'number' && n >= 1 ? Math.floor(n) : 1
}

/** The whole run: what goes in plus the most that may come out. */
export const runTokens = (c: AgentCost): number => c.tokensIn + c.tokensOut

/**
 * What the chat's agents that are on cost for one reply, the cadence spread over the replies (an agent that runs every
 * third reply counts a third). Agents without an estimate, or not installed, are left out and counted in `unknown`.
 * A hand-only agent (`manual`) never runs by itself and adds nothing.
 */
export function replyCost(items: ChatAgentItem[], installed: AgentInfo[] | null | undefined): { calls: number; tokens: number; agents: number; unknown: number } {
  let calls = 0
  let tokens = 0
  let agents = 0
  let unknown = 0
  for (const it of items) {
    if (!it.on) continue
    const info = installed?.find((a) => a.id === it.agent)
    if (!info?.cost) { unknown++; continue }
    if ((it.phase ?? info.trigger.when) === 'manual') continue
    const n = cadenceOf(info)
    calls += info.cost.calls / n
    tokens += runTokens(info.cost) / n
    agents++
  }
  return { calls, tokens, agents, unknown }
}
