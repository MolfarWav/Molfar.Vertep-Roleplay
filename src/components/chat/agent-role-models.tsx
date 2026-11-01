import { Button } from '@/components/ui/button'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useT } from '@/hooks/use-t'
import type { AgentInfo } from '@/lib/agents'

/**
 * One row per model role the agent names: the author's hint, the model chosen for it (else "default model") and the picker.
 * The choice is the person's own and lives in agents/config.json, never in the agent's file. Used on the Allow dialog (before
 * the first run) and in the agent card's own settings (after it).
 */
export function RoleModels({ agent, busy, onSet }: { agent: AgentInfo; busy: boolean; onSet: (role: string, ref: string) => void }) {
  const t = useT()
  const roles = Object.keys(agent.models ?? {})
  const chosen = agent.own?.models ?? {}
  return (
    <>
      {roles.map((role) => (
        <div key={role} className="flex flex-col gap-1" data-testid={`agent-role-${agent.id}-${role}`}>
          <p className="font-medium">{role}</p>
          {agent.models?.[role]?.hint && <p className="text-muted-foreground">{agent.models[role].hint}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-all font-mono text-xs">{chosen[role] || t('ag.own.default')}</span>
            <SoulModelPicker disabled={busy} label={t('ag.own.pick')} onPick={(ref) => onSet(role, ref)} />
            {chosen[role] && <Button size="sm" variant="ghost" className="max-md:h-10" disabled={busy} onClick={() => onSet(role, '')}>{t('ag.own.useDefault')}</Button>}
          </div>
        </div>
      ))}
    </>
  )
}
