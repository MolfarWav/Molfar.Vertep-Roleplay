import { useEffect, useMemo, useState } from 'react'
import { Robot } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { Switch } from '@/components/ui/switch'
import { AgentRunCost, ReplyCostLine } from '@/components/chat/agent-cost'
import { useT } from '@/hooks/use-t'
import { describeNeed, inspectAgentFiles, type AgentPreview } from '@/lib/agents'
import { groupNeeds } from '@/lib/agent-permissions'
import { starterFiles, SUGGESTED, usable } from '@/lib/agent-offer'
import { replyCost } from '@/lib/agent-cost'
import { AGENT_RECIPES } from '@/lib/forge-recipes'
import { formatTokens } from '@/lib/tokens'
import type { MsgKey } from '@/lib/i18n'
import type { CanvasFile } from '@/canvas-kit/graph'

const GROUP_KEY: Record<string, MsgKey> = { read: 'ag.perm.g.read', write: 'ag.perm.g.write', show: 'ag.perm.g.show', model: 'ag.perm.g.model', code: 'ag.perm.g.code', other: 'ag.perm.g.other' }

export interface StarterOffer {
  /** the recipe files in list order */
  files: CanvasFile[]
  /** what each would be, by agent id; empty until the plugin answered */
  previews: Map<string, AgentPreview>
  /** 'none' = the app has no agents plugin (the block is not drawn) */
  state: 'loading' | 'ready' | 'none'
}

/** Looks at the ready agents once (nothing is installed or allowed by looking). */
export function useStarterOffer(isGroup: boolean): StarterOffer {
  const files = useMemo(() => starterFiles(AGENT_RECIPES, isGroup), [isGroup])
  const [previews, setPreviews] = useState<Map<string, AgentPreview>>(new Map())
  const [state, setState] = useState<StarterOffer['state']>('loading')
  useEffect(() => {
    let live = true
    inspectAgentFiles(files).then((rows) => {
      if (!live) return
      if (!rows) { setState('none'); return }
      setPreviews(new Map(rows.filter((r): r is AgentPreview => !r.error).map((r) => [r.id, r])))
      setState('ready')
    }).catch(() => { if (live) setState('none') })
    return () => { live = false }
  }, [files])
  return { files, previews, state }
}

/**
 * "Agents (optional)" in the new-chat step. Closed it is one line; open it lists the ready agents, each with a switch, what it
 * reads, changes and shows, and what it costs. All are off until the person turns one on. Nothing is installed or allowed
 * here: the step does that on Start, for the ones switched on, and says so under the list.
 */
export function AgentOffer({ offer, picked, onPicked }: { offer: StarterOffer; picked: string[]; onPicked: (ids: string[]) => void }) {
  const t = useT()
  if (offer.state === 'none') return null
  const list = offer.files.map((f) => String(f.agent?.id ?? '')).filter((id) => offer.previews.has(id))
  const toggle = (id: string, on: boolean) => onPicked(on ? [...picked.filter((x) => x !== id), id] : picked.filter((x) => x !== id))
  const suggested = SUGGESTED.filter((id) => usable(offer.previews.get(id)))
  const total = replyCost(picked.map((agent) => ({ agent, on: true, show: null })), [...offer.previews.values()])
  const rough = (n: number) => formatTokens(n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100)
  const summary = picked.length === 0
    ? t('ag.offer.summaryNone')
    : total.tokens === 0
      ? t('ag.offer.summaryFree', { n: picked.length })
      : t('ag.offer.summaryOn', { n: picked.length, calls: Number.isInteger(total.calls) ? String(total.calls) : total.calls.toFixed(1), tokens: rough(total.tokens) })
  return (
    <Fold id="new-chat-agent-offer" title={t('ag.offer.title')} summary={offer.state === 'loading' ? t('ag.offer.loading') : summary} icon={Robot} count={picked.length} className="shrink-0">
      <div className="flex flex-col gap-3 p-3" data-testid="new-chat-agent-offer">
        <p className="text-xs leading-snug text-muted-foreground">{t('ag.offer.lead')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="max-md:h-10" disabled={suggested.length === 0} onClick={() => onPicked(suggested)} data-testid="offer-suggested">{t('ag.offer.suggested')}</Button>
          {picked.length > 0 && <Button type="button" size="sm" variant="ghost" className="max-md:h-10" onClick={() => onPicked([])} data-testid="offer-clear">{t('ag.offer.clear')}</Button>}
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {list.map((id) => <OfferRow key={id} p={offer.previews.get(id)!} on={picked.includes(id)} onChange={(v) => toggle(id, v)} />)}
        </ul>
        {picked.length > 0 && (
          <div className="flex flex-col gap-1">
            <ReplyCostLine items={picked.map((agent) => ({ agent, on: true, show: null }))} installed={[...offer.previews.values()]} className="text-xs text-muted-foreground" />
            <p className="text-caption leading-snug text-muted-foreground" data-testid="offer-consent">{t('ag.offer.consent')}</p>
          </div>
        )}
      </div>
    </Fold>
  )
}

function OfferRow({ p, on, onChange }: { p: AgentPreview; on: boolean; onChange: (on: boolean) => void }) {
  const t = useT()
  const ok = usable(p)
  const groups = groupNeeds(p.needs, p.unsupported)
  const count = p.needs.length
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5" data-testid={`offer-row-${p.id}`}>
      <label className={`flex items-start gap-2.5 ${ok ? 'cursor-pointer' : ''}`}>
        <Switch size="sm" className="mt-0.5 max-md:after:-inset-y-4" checked={on && ok} disabled={!ok} aria-label={t('ag.offer.turnOn', { name: p.name })} onCheckedChange={onChange} data-testid={`offer-switch-${p.id}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium leading-snug">{p.name}</span>
          <span className="text-xs leading-snug text-muted-foreground">{p.description}</span>
          <AgentRunCost agent={p} />
          {p.installed && <span className="text-caption text-muted-foreground">{t('ag.offer.installed')}</span>}
          {!ok && <span className="text-caption text-amber-600 dark:text-amber-400">{t('ag.offer.newer')}</span>}
        </div>
      </label>
      {ok && count > 0 && (
        <details className="ml-9 text-xs" data-testid={`offer-can-${p.id}`}>
          <summary className="cursor-pointer select-none py-1 font-medium max-md:min-h-10 max-md:leading-10">{t('ag.offer.can', { n: count })}</summary>
          <div className="mt-1 flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.group} className="flex flex-col gap-0.5">
                <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{t(GROUP_KEY[g.group])}</span>
                <ul className="list-disc pl-4 text-xs leading-snug">{g.tokens.map((tok) => <li key={tok}>{describeNeed(tok, t)}</li>)}</ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </li>
  )
}
