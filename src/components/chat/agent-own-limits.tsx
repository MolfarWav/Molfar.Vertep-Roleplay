// What the user sets for one installed agent: which model answers each of its roles and the most model calls a run
// may make. It lives with the user, not in the agent's file, so a shared agent never carries a model or a key.

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useT } from '@/hooks/use-t'
import { saveAgentOwn, type AgentInfo, type AgentOwn } from '@/lib/agents'

const errText = (e: unknown) => String((e as Error)?.message ?? e)
const CALLS_MAX = 50

export function AgentOwnLimits({ agent, onChanged }: { agent: AgentInfo; onChanged: () => Promise<void> }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  // the limit is typed freely and saved when the field is left, not on every digit
  const [draft, setDraft] = useState<string | null>(null)
  // opened by the user, or by itself while the limit blocks the agent; it must not close under a hand that just fixed the limit
  const [opened, setOpened] = useState(false)
  const own: AgentOwn = agent.own ?? { models: {}, maxCalls: 0 }
  const roles = Object.keys(agent.models ?? {})
  // an agent with no model call has nothing to choose or limit
  if (agent.maxCalls <= 0 && !roles.length) return null

  const save = async (next: AgentOwn) => {
    setBusy(true)
    try { await saveAgentOwn(agent.id, next); await onChanged() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }
  const setModel = (role: string, ref: string) => {
    const models = { ...own.models }
    if (ref) models[role] = ref
    else delete models[role]
    return save({ ...own, models })
  }
  const over = own.maxCalls > 0 && agent.maxCalls > own.maxCalls

  return (
    <details className="text-xs" open={opened || over} onToggle={(e) => setOpened(e.currentTarget.open)} data-testid={`agent-own-${agent.id}`}>
      <summary className="cursor-pointer select-none text-muted-foreground max-md:py-3">{t('ag.own.title')}</summary>
      <div className="mt-1.5 flex flex-col gap-2.5">
        <p className="text-muted-foreground">{t('ag.own.roleHelp')}</p>
        {roles.map((role) => (
          <div key={role} className="flex flex-col gap-1">
            <p className="font-medium">{role}</p>
            {agent.models?.[role]?.hint && <p className="text-muted-foreground">{agent.models[role].hint}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-all font-mono text-[11px]">{own.models[role] || t('ag.own.default')}</span>
              <SoulModelPicker disabled={busy} label={t('ag.own.pick')} onPick={(ref) => void setModel(role, ref)} />
              {own.models[role] && <Button size="sm" variant="ghost" className="max-md:h-10" disabled={busy} onClick={() => void setModel(role, '')}>{t('ag.own.useDefault')}</Button>}
            </div>
          </div>
        ))}
        {agent.maxCalls > 0 && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">{t('ag.own.calls')}<span className="ml-1.5 font-normal text-muted-foreground">{t('ag.review.calls', { n: agent.maxCalls })}</span></p>
            <div className="flex flex-wrap items-center gap-2">
              {own.maxCalls > 0 ? (
                <>
                  <Input
                    type="number" min={1} max={CALLS_MAX} step={1} value={draft ?? String(own.maxCalls)} disabled={busy} aria-label={t('ag.own.calls')}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      const n = Math.min(CALLS_MAX, Math.trunc(Number(draft)))
                      const was = draft
                      setDraft(null)
                      if (was !== null && was !== '' && n >= 1 && n !== own.maxCalls) void save({ ...own, maxCalls: n })
                    }}
                    className="w-24 max-md:h-10" data-testid={`agent-own-calls-${agent.id}`}
                  />
                  <Button size="sm" variant="ghost" className="max-md:h-10" disabled={busy} onClick={() => void save({ ...own, maxCalls: 0 })}>{t('ag.own.removeLimit')}</Button>
                </>
              ) : (
                <>
                  <span>{t('ag.own.noLimit')}</span>
                  <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy} onClick={() => void save({ ...own, maxCalls: Math.min(CALLS_MAX, agent.maxCalls) })}>{t('ag.own.setLimit')}</Button>
                </>
              )}
            </div>
            {over && <p className="text-amber-700 dark:text-amber-400" data-testid="agent-own-over">{t('ag.own.over', { n: agent.maxCalls, cap: own.maxCalls })}</p>}
          </div>
        )}
      </div>
    </details>
  )
}
