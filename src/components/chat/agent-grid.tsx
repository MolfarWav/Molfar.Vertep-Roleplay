import { useMemo } from 'react'
import { useT } from '@/hooks/use-t'
import { gridModel, TONE_CLASS } from '@/lib/agent-grid'
import type { AgentPanelSet, PanelWidget } from '@/lib/agents'
import { cn } from '@/lib/utils'

/**
 * A `grid` widget: a board of tiles (a map of territory, a dungeon floor, a seating plan) coloured by the state the
 * agent's list gives each tile. Colour never stands alone: a tile carries a mark, and the legend names every state.
 * Nothing in it is a button; the agent changes the board, the person reads it.
 */
export function GridWidget({ w, set }: { w: PanelWidget; set: Pick<AgentPanelSet, 'own'> }) {
  const t = useT()
  const model = useMemo(() => gridModel(w, w.bind ? set.own[w.bind] : undefined), [w, set.own])
  const label = w.label ?? w.bind ?? ''
  const total = model.cols * model.rows
  return (
    <div className="flex flex-col gap-1.5 text-xs" data-testid="agent-grid">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{t('ag.grid.known', { n: model.tiles.length, total })}</span>
      </div>
      <div role="group" aria-label={label} className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${model.cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: total }, (_, i) => {
          const tile = model.tiles.find((x) => (x.row - 1) * model.cols + (x.col - 1) === i)
          if (!tile) return <span key={i} aria-hidden="true" className="aspect-square rounded-sm border border-dashed border-border/60" />
          const name = t('ag.grid.cell', { col: tile.col, row: tile.row, state: tile.label })
          return (
            <span key={i} role="img" aria-label={name} title={name}
              className={cn('flex aspect-square items-center justify-center overflow-hidden rounded-sm border text-xs font-semibold leading-none', TONE_CLASS[tile.tone])}>
              {tile.mark}
            </span>
          )
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label={t('ag.grid.legend')}>
        {model.legend.map((l) => (
          <li key={l.value} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('flex size-5 items-center justify-center rounded-sm border text-xs font-semibold leading-none', TONE_CLASS[l.tone])}>{l.mark}</span>
            {l.label}
          </li>
        ))}
      </ul>
      {model.outside > 0 && <p className="text-xs text-muted-foreground" data-testid="agent-grid-outside">{t('ag.grid.outside', { n: model.outside })}</p>}
    </div>
  )
}
