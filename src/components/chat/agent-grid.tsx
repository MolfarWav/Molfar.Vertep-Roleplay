import { useMemo } from 'react'
import { useT } from '@/hooks/use-t'
import { gridModel, tapText, TONE_CLASS } from '@/lib/agent-grid'
import { insertIntoComposer, type AgentPanelSet, type PanelWidget } from '@/lib/agents'
import { cn } from '@/lib/utils'

/**
 * A `grid` widget: a board of tiles (a map of territory, a dungeon floor, a seating plan) coloured by the state the
 * agent's list gives each tile. Colour never stands alone: a tile carries a mark, and the legend names every state.
 * The agent changes the board, the person reads it. Only when the widget names a `send` text is a tile a button: a tap
 * puts that text in the message box (nothing is sent), so the person can say "go to column 3, row 4" without typing it.
 */
export function GridWidget({ w, set, chatId }: { w: PanelWidget; set: Pick<AgentPanelSet, 'own'>; chatId?: string | null }) {
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
          const col = (i % model.cols) + 1
          const row = Math.floor(i / model.cols) + 1
          // a tile with no state is empty; with `send` it is still a place the person may point at
          if (w.send && chatId) {
            const state = tile ? tile.label : t('ag.grid.empty')
            const name = tile ? t('ag.grid.cell', { col, row, state }) : t('ag.grid.cellEmpty', { col, row })
            return (
              <button key={i} type="button" title={t('ag.grid.tap', { cell: name })} aria-label={t('ag.grid.tap', { cell: name })}
                onClick={() => insertIntoComposer(chatId, tapText(w.send!, col, row, state))}
                className={cn('flex aspect-square items-center justify-center overflow-hidden rounded-sm border text-xs font-semibold leading-none hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-9',
                  tile ? TONE_CLASS[tile.tone] : 'border-dashed border-border/60 text-muted-foreground')}>
                {tile ? tile.mark : ''}
              </button>
            )
          }
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
