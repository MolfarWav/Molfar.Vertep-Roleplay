// The Allow dialog of an installed agent: which model answers each role, then every permission with its sentence and a
// switch, then one button. Opened from the agent's card (the chat's agents sheet and the Forge). On a phone it is a full page.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { RoleModels } from '@/components/chat/agent-role-models'
import { useT } from '@/hooks/use-t'
import { describeNeed, grantAgent, saveAgentOwn, type AgentInfo } from '@/lib/agents'
import { modelLines, permissionRows, startDraft, stillWaiting, tokensToSend, trimDraft } from '@/lib/agent-permissions'
import { cn } from '@/lib/utils'

const errText = (e: unknown) => String((e as Error)?.message ?? e)

export function AgentAllow({ agent, open, onOpenChange, onChanged }: { agent: AgentInfo; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> }) {
  const t = useT()
  const [draft, setDraft] = useState<string[]>(() => startDraft(agent))
  const [busy, setBusy] = useState(false)
  // a switch was touched: from then on, a change to the models is a change to what is being approved
  const touched = useRef(false)
  const [stale, setStale] = useState(false)

  // opening starts from what is allowed now
  useEffect(() => {
    if (!open) return
    setDraft(startDraft(agent))
    touched.current = false
    setStale(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // an update under the open dialog: a switch for something the agent no longer asks for goes, and the person looks again
  const needsKey = `${agent.needs.join('|')}#${agent.unsupported.join('|')}`
  useEffect(() => {
    if (!open) return
    setDraft((d) => trimDraft(agent, d))
    if (touched.current) setStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsKey])

  const rows = permissionRows(agent)
  const supported = rows.filter((r) => r.supported)
  const sent = tokensToSend(agent, draft)
  const roles = Object.keys(agent.models ?? {})
  const changedFromNow = sent.length !== agent.granted.filter((g) => agent.needs.includes(g)).length || sent.some((n) => !agent.granted.includes(n))
  const all = sent.length === supported.length

  const flip = (token: string, on: boolean) => {
    touched.current = true
    setStale(false)
    setDraft((d) => (on ? [...new Set([...d, token])] : d.filter((x) => x !== token)))
  }
  const setModel = async (role: string, ref: string) => {
    const models = { ...(agent.own?.models ?? {}) }
    if (ref) models[role] = ref
    else delete models[role]
    setBusy(true)
    try {
      await saveAgentOwn(agent.id, { models, maxCalls: agent.own?.maxCalls ?? 0, everyN: agent.own?.everyN })
      await onChanged()
      // the text goes to a different model now: what was looked at is not what is being approved any more
      if (touched.current) setStale(true)
    } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }
  const commit = async () => {
    setBusy(true)
    try {
      await grantAgent(agent.id, sent)
      await onChanged()
      const left = stillWaiting(agent, sent).length
      if (left > 0) toast.message(t('ag.allow.waitingToast', { name: agent.name, n: left }))
      else toast.success(t('ag.allowedToast', { name: agent.name }))
      onOpenChange(false)
    } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }

  const sendsTo = (() => {
    const lines = modelLines(agent)
    return lines.length ? lines.map((l) => `${l.role}: ${l.ref ?? t('ag.allow.defaultModel')}`).join(' · ') : t('ag.allow.defaultModel')
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0 md:max-h-[min(44rem,calc(100dvh-4rem))] sm:max-w-lg"
        data-testid="agent-allow"
      >
        <DialogHeader className="gap-1 border-b border-border px-4 py-3 pr-12">
          <DialogTitle>{t('ag.review.title', { name: agent.name })}</DialogTitle>
          <DialogDescription>{[agent.description, agent.author ? t('ag.by', { name: agent.author }) : ''].filter(Boolean).join(' · ') || t('ag.allow.lead')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          {roles.length > 0 && (
            <section className="flex flex-col gap-2.5 text-sm" aria-label={t('ag.allow.models')} data-testid="agent-allow-models">
              <h3 className="text-sm font-semibold">{t('ag.allow.models')}</h3>
              <p className="text-xs text-muted-foreground">{t('ag.allow.modelsLead')}</p>
              <div className="flex flex-col gap-3 text-xs"><RoleModels agent={agent} busy={busy} onSet={(role, ref) => void setModel(role, ref)} /></div>
            </section>
          )}

          <section className="flex flex-col gap-2" aria-label={t('ag.allow.perms')} data-testid="agent-allow-perms">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold">{t('ag.allow.perms')}</h3>
              {supported.length > 1 && (
                <Button variant="ghost" size="sm" className="max-md:h-10" disabled={busy} onClick={() => { touched.current = true; setStale(false); setDraft(all ? [] : supported.map((r) => r.token)) }}>
                  {all ? t('ag.allow.clear') : t('ag.allow.all')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('ag.allow.permsLead', { name: agent.name })}</p>
            {stale && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs" role="alert" data-testid="agent-allow-stale">
                <p className="flex items-start gap-1.5"><Warning className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />{t('ag.allow.stale')}</p>
                <Button size="sm" variant="outline" className="self-start max-md:h-10" onClick={() => setStale(false)}>{t('ag.allow.staleOk')}</Button>
              </div>
            )}
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {rows.map((r) => {
                const id = `allow-${agent.id}-${r.token}`
                return (
                  <li key={r.token} className="flex items-start gap-3 px-3 py-2.5 max-md:min-h-14" data-testid={`agent-allow-row-${r.token}`}>
                    <div className="min-w-0 flex-1">
                      <label htmlFor={id} className={cn('block text-sm leading-snug', !r.supported && 'text-muted-foreground')}>
                        {describeNeed(r.token, t)}
                        {r.isNew && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid="agent-need-new">{t('ag.update.new')}</span>}
                      </label>
                      {r.token === 'llm' && <p className="mt-0.5 text-xs text-muted-foreground" data-testid="agent-allow-sends">{t('ag.allow.sendsTo', { models: sendsTo })}</p>}
                      {!r.supported && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{t('ag.allow.unsupported')}</p>}
                    </div>
                    <Switch id={id} disabled={!r.supported || busy} checked={r.supported && draft.includes(r.token)} onCheckedChange={(on) => flip(r.token, on)} />
                  </li>
                )
              })}
            </ul>
            {agent.maxCalls > 0 && <p className="text-xs text-muted-foreground">{t('ag.review.calls', { n: agent.maxCalls })}</p>}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite" data-testid="agent-allow-count">{t('ag.allow.count', { k: sent.length, m: supported.length })}</span>
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('ag.review.later')}</Button>
          <Button size="sm" className="max-md:h-11" disabled={busy || stale || !changedFromNow} onClick={() => void commit()} data-testid="agent-allow-commit">
            {all ? t('ag.review.allow') : t('ag.allow.save', { k: sent.length, m: supported.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
