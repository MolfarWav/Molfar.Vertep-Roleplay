import { Coins } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import type { AgentInfo, ChatAgentItem } from '@/lib/agents'
import { cadenceOf, lastReply, replyCost, runTokens, type CostInfo } from '@/lib/agent-cost'
import type { AgentRun } from '@/lib/agents'
import { formatTokens } from '@/lib/tokens'

/** A token count a person can read: tens under a thousand, then the usual short form. Always "about". */
const rough = (n: number): string => formatTokens(n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100)
/** Calls per reply: whole when they are, else one decimal. */
const callsText = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * What one run of this agent costs, before the person turns it on (Molfar.Vertep#396). It is an estimate from the file
 * (the length of its questions, what they read, the answer limits), so it says so. An agent that never asks a model says
 * that instead of showing zeros.
 */
export function AgentRunCost({ agent, className }: { agent: Pick<AgentInfo, 'id' | 'cost' | 'own' | 'trigger'>; className?: string }) {
  const t = useT()
  const c = agent.cost
  if (!c) return null
  const every = cadenceOf(agent)
  return (
    <div className={className} data-testid={`agent-cost-${agent.id}`}>
      <p className="flex items-start gap-1.5 text-caption leading-snug text-muted-foreground">
        <Coins className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {c.calls === 0 ? t('ag.cost.none') : t('ag.cost.run', { calls: c.calls, tokens: rough(runTokens(c)), inT: rough(c.tokensIn), outT: rough(c.tokensOut) })}
          {c.calls > 0 && every > 1 ? ` ${t('ag.cost.every', { n: every })}` : ''}
        </span>
      </p>
    </div>
  )
}

/** The line above the chat's agents: what the ones that are on cost for one reply, all together. */
export function ReplyCostLine({ items, installed, className }: { items: ChatAgentItem[]; installed: CostInfo[] | null | undefined; className?: string }) {
  const t = useT()
  if (!installed) return null
  const { calls, tokens, agents, unknown } = replyCost(items, installed)
  if (agents === 0 && unknown === 0) return null
  return (
    <p className={className} title={t('ag.cost.totalTip')} data-testid="agents-reply-cost">
      <Coins className="mr-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
      {agents === 0 || tokens === 0 ? t('ag.cost.totalNone') : t('ag.cost.total', { calls: callsText(calls), tokens: rough(tokens) })}
      {unknown > 0 ? ` ${t('ag.cost.unknown', { n: unknown })}` : ''}
    </p>
  )
}

/** What the agents really did for the newest reply (calls, tokens when the provider told, the longest wait), from the run log. */
export function LastReplyLine({ runs, className }: { runs: AgentRun[] | undefined; className?: string }) {
  const t = useT()
  const l = lastReply(runs)
  if (!l || (l.calls === 0 && l.tokens === 0)) return null
  return (
    <p className={className} data-testid="agents-last-reply">
      {t('ag.last.line', { n: l.runs, calls: l.calls, secs: l.seconds < 10 ? l.seconds.toFixed(1) : String(Math.round(l.seconds)) })}
      {l.tokens > 0 ? ' ' + t('ag.last.tokens', { tokens: rough(l.tokens) }) : ''}
      {l.batched > 0 ? ' ' + t('ag.last.batched', { n: l.batched }) : ''}
    </p>
  )
}
