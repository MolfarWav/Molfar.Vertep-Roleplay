import { useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { AGENT_CARDS } from '@/canvas-kit/boards/agent'
import { SHOW_BY_KIND } from '@/canvas-kit/boards/agent-check.js'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { describeNeed } from '@/lib/agents'
import type { MsgKey } from '@/lib/i18n'

/** The cards a person may add, in groups. The Input is not here: every agent has its one. */
const GROUPS: { key: MsgKey; types: string[] }[] = [
  { key: 'fg.pal.data', types: ['state.read', 'text.template', 'text.extract', 'text.cut'] },
  { key: 'fg.pal.model', types: ['model.ask', 'data.parse'] },
  { key: 'fg.pal.logic', types: ['logic.if', 'logic.merge', 'random.dice', 'random.pick'] },
  { key: 'fg.pal.code', types: ['code.script'] },
  { key: 'fg.pal.write', types: ['state.set', 'state.add', 'state.list'] },
  { key: 'fg.pal.out', types: ['agent.output'] },
  { key: 'fg.pal.misc', types: ['note'] },
]

/** The side list of cards: a coloured bar for the kind, the name, what it does. A tap adds the card. */
export function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const groups = GROUPS.map((g) => ({
    ...g,
    types: g.types.filter((type) => !needle || `${AGENT_CARDS[type]?.label} ${t(`fg.hint.${type}` as MsgKey)}`.toLowerCase().includes(needle)),
  })).filter((g) => g.types.length)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5" data-testid="forge-palette">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fg.pal.search')} aria-label={t('fg.pal.search')} className="h-8 pl-7 text-xs" />
      </div>
      {groups.length === 0 && <p className="text-xs text-muted-foreground">{t('fg.pal.none')}</p>}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h4 className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t(g.key)}</h4>
          {g.types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              data-testid={`forge-pal-${type}`}
              className="flex items-stretch gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left hover:bg-muted"
            >
              <i className="w-1.5 shrink-0 rounded-sm" style={{ background: `var(${AGENT_CARDS[type]?.colorVar ?? '--k-data'})` }} aria-hidden="true" />
              <span className="min-w-0 text-[13px] font-medium leading-tight">
                {AGENT_CARDS[type]?.label ?? type}
                <small className="block text-[11px] font-normal leading-snug text-muted-foreground">{t(`fg.hint.${type}` as MsgKey)}</small>
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}

/** What the agent will ask the player to allow, in plain words, taken from the check (so a file cannot understate it). */
export function Abilities({ needs, calls }: { needs: string[]; calls: number }) {
  const t = useT()
  const lines = needs.filter((n) => n !== 'llm').map((n) => describeNeed(n, t))
  return (
    <section className="rounded-md border border-border bg-background p-2.5 text-xs" data-testid="forge-abilities" aria-label={t('fg.can')}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.can')}</h4>
      <ul className="mt-1.5 flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l} className="flex gap-1.5"><span className="font-bold text-primary" aria-hidden="true">✓</span>{l}</li>
        ))}
        <li className={calls ? 'flex gap-1.5' : 'flex gap-1.5 text-muted-foreground'}>
          <span className={calls ? 'font-bold text-primary' : ''} aria-hidden="true">{calls ? '✓' : '–'}</span>
          {calls ? t('ag.review.calls', { n: calls }) : t('fg.can.noCalls')}
        </li>
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t('fg.can.note')}</p>
    </section>
  )
}

const KINDS = ['note', 'choices', 'state-patch', 'prompt-insert'] as const

/**
 * Where an agent's results can appear and what goes to the model: the answer to "what does Output do?", folded because
 * most people only need it once. The places come from the check, so this table cannot drift from what is allowed.
 */
export function PlacesGuide() {
  const t = useT()
  return (
    <details className="rounded-md border border-border bg-background p-2.5 text-xs" data-testid="forge-places-guide">
      <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.guide.title')}</summary>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t('fg.guide.lead')}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {KINDS.map((k) => (
          <li key={k} className="rounded-md border border-border/60 p-2">
            <b className="block text-[13px] font-medium">{t(`fg.kind.${k}` as MsgKey)}</b>
            <span className="block text-[11px] text-muted-foreground">{t(`fg.guide.${k}` as MsgKey)}</span>
            <span className="mt-1 block text-[11px]">
              {t('fg.guide.where')} {(SHOW_BY_KIND[k] ?? []).map((pl, i) => `${t(`fg.place.${pl}` as MsgKey)}${i === 0 ? ` (${t('fg.guide.first')})` : ''}`).join(', ')}
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[11px] leading-snug text-muted-foreground">
        {(['rule1', 'rule2', 'rule3', 'rule4'] as const).map((r) => <li key={r}>{t(`fg.guide.${r}` as MsgKey)}</li>)}
      </ul>
    </details>
  )
}
