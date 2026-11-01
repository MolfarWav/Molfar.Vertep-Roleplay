import { useState } from 'react'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { AgentRoleModels } from '@/components/chat/agent-own-limits'
import { useT } from '@/hooks/use-t'
import { describeNeed, grantAgentTokens, type AgentInfo } from '@/lib/agents'
import { allowedCount, groupNeeds, nextGranted, type PermGroup } from '@/lib/agent-permissions'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const errText = (e: unknown) => String((e as Error)?.message ?? e)
const GROUP_KEY: Record<PermGroup, MsgKey> = {
  read: 'ag.perm.g.read', write: 'ag.perm.g.write', show: 'ag.perm.g.show', model: 'ag.perm.g.model', other: 'ag.perm.g.other',
}

/**
 * The Permissions page of one installed agent: what it may do, one line each with its own switch, and the model for each
 * of its roles, before the first run. The runner starts an agent only when every line is on, so the page says so and counts.
 * The rows are read from `agent.needs` on every render: after a model is picked the card re-reads the list, so the page
 * can never show a list from before the change.
 */
export function AgentPermissions({ agent, open, onOpenChange, onChanged }: { agent: AgentInfo; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => Promise<void> }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const groups = groupNeeds(agent.needs, agent.unsupported)
  const { done, n } = allowedCount(agent.needs, agent.unsupported, agent.granted)
  // allowed before and asking for more now = a new version: the new lines are marked
  const isUpdate = agent.granted.length > 0 && agent.missing.length > 0
  const supported = agent.needs.filter((x) => !agent.unsupported.includes(x))

  const set = async (tokens: string[]) => {
    setBusy(true)
    try { await grantAgentTokens(agent.id, tokens); await onChanged() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }
  const flip = (token: string, on: boolean) => set(nextGranted(agent.granted, agent.needs, token, on))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-3 sm:max-w-lg" data-testid={`agent-perm-${agent.id}`}>
        <DialogHeader>
          <DialogTitle className="pr-8">{t('ag.perm.title', { name: agent.name })}</DialogTitle>
          <DialogDescription>{agent.description || t('ag.perm.lead')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5">
          {agent.description && <p className="text-xs text-muted-foreground">{t('ag.perm.lead')}</p>}

          <section className="flex flex-col gap-2" aria-label={t('ag.perm.models')}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('ag.perm.models')}</h3>
            {Object.keys(agent.models ?? {}).length > 0
              ? <><p className="text-xs text-muted-foreground">{t('ag.perm.modelsLead')}</p><div className="text-xs"><AgentRoleModels agent={agent} onChanged={onChanged} /></div></>
              : <p className="text-xs text-muted-foreground">{t('ag.perm.noModels')}</p>}
          </section>

          {groups.map((g) => (
            <section key={g.group} className="flex flex-col gap-1" aria-label={t(GROUP_KEY[g.group])}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(GROUP_KEY[g.group])}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {g.tokens.map((tok) => {
                  const on = agent.granted.includes(tok)
                  const fresh = isUpdate && !on
                  const what = describeNeed(tok, t)
                  return (
                    <li key={tok}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 max-md:min-h-11" data-testid={`agent-perm-row-${tok}`}>
                        <Switch size="sm" className="mt-0.5 max-md:after:-inset-y-3.5" checked={on} disabled={busy} aria-label={t('ag.perm.row', { what })} onCheckedChange={(v) => void flip(tok, v)} />
                        <span className="min-w-0 flex-1 text-xs leading-snug">{what}</span>
                        {fresh && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{t('ag.update.new')}</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {agent.unsupported.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-amber-600 dark:text-amber-400">
              <p className="flex items-start gap-1.5"><Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{t('ag.review.unsupported')}</p>
              <ul className="list-disc pl-8">{agent.unsupported.map((x) => <li key={x}>{describeNeed(x, t)}</li>)}</ul>
            </div>
          )}
          {agent.maxCalls > 0 && <p className="text-[11px] text-muted-foreground">{t('ag.review.calls', { n: agent.maxCalls })}</p>}
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn('text-xs', done === n ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} aria-live="polite" data-testid="agent-perm-progress">
            {done === n && n > 0 ? t('ag.perm.ready') : t('ag.perm.progress', { done, n })}
          </p>
          <div className="flex justify-end gap-2">
            {done < n && <Button size="sm" className="max-md:h-10" disabled={busy} onClick={() => void set(supported)} data-testid="agent-perm-all">{t('ag.perm.allowAll')}</Button>}
            <Button size="sm" variant={done < n ? 'outline' : 'default'} className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('ag.perm.done')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
