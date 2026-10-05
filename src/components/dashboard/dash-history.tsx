import type { DashChar } from '@/lib/dashboard'
import { DISPOSITION, signed } from '@/lib/dashboard'
import type { DispositionStat } from '@/lib/soul'
import { STAT_COLORS } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Box, useTx } from './dash-common'

export function StoryList({ char, className, compact }: { char: DashChar; className?: string; compact?: boolean }) {
  const t = useT()
  const tx = useTx()
  const lines = [...char.history].sort((a, b) => b.turn - a.turn)
  /** "start values from the Soul applied (trust +10, respect +12)": only the stats that moved. */
  const seedText = (from: Record<string, number>, to: Record<string, number>) => {
    const moved = [...new Set([...Object.keys(from), ...Object.keys(to)])]
      .map((k) => [k, (to[k] ?? 0) - (from[k] ?? 0)] as const)
      .filter(([, d]) => d !== 0)
      .map(([k, d]) => `${tx('soul.stat', k).toLowerCase()} ${signed(d)}`)
    return moved.length ? t('dash.story.seed', { changes: moved.join(', ') }) : t('dash.story.seedNone')
  }
  return (
    <Box title={t('dash.story')} className={cn(compact && 'max-h-[360px] overflow-y-auto', className)}>
      {lines.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.story.none')}</div>
      ) : (
        <ul className="flex flex-col">
          {lines.map((line) => (
            <li key={`${line.turn}|${line.kind}|${line.kind === 'tier' ? line.stat : ''}|${line.kind === 'seed' ? JSON.stringify(line.to) : `${line.from}|${line.to}`}`} className="flex min-w-0 items-baseline gap-2 border-b border-dashed border-border py-1.5 text-sm first:pt-0 last:border-b-0 last:pb-0">
              <span className="min-w-0 flex-1 break-words">
                {line.kind === 'tier'
                  ? t('dash.story.tier', {
                      stat: t(`soul.stat.${line.stat}`),
                      from: tx(`dash.tier.${line.stat}`, String(line.from)),
                      to: tx(`dash.tier.${line.stat}`, String(line.to)),
                    })
                  : line.kind === 'seed'
                    ? seedText(line.from, line.to)
                    : line.kind === 'calls'
                      ? t(line.from ? 'dash.story.calls' : 'dash.story.callsStart', { to: line.to })
                      : t('dash.story.constellation', { from: tx('dash.const', line.from), to: tx('dash.const', line.to) })}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t('dash.story.turn', { n: line.turn })}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

/**
 * Last turns of one stat: x = turn (oldest left), y = -100..+100. The lines are an SVG
 * stretched to the box (non-scaling strokes); dots and labels are HTML so they stay round.
 */
export function StatChart({ char, stat, onStat, className }: {
  char: DashChar
  stat: DispositionStat
  onStat: (stat: DispositionStat) => void
  className?: string
}) {
  const t = useT()
  const color = STAT_COLORS[stat]
  const series = char.series
  const n = series.length
  const xPct = (i: number) => (n > 1 ? 4 + (i / (n - 1)) * 92 : 50)
  const yPct = (v: number) => 100 - (Math.max(-100, Math.min(100, v)) + 100) / 2
  const pts = series.map((p, i) => ({ x: xPct(i), y: yPct(p.stats[stat]), turn: p.turn, v: p.stats[stat] }))
  return (
    <Box title={t('dash.chart')} className={className}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {DISPOSITION.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStat(s)}
            aria-pressed={s === stat}
            className={cn(
              'border px-2 py-0.5 text-xs transition-colors',
              s === stat ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={s === stat ? { background: STAT_COLORS[s], borderColor: STAT_COLORS[s] } : undefined}
          >
            {t(`soul.stat.${s}`)}
          </button>
        ))}
      </div>
      {n === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.story.none')}</div>
      ) : (
        <div className="relative h-[96px] pb-4" role="img" aria-label={`${t('dash.chart')}: ${t(`soul.stat.${stat}`)}`}>
          <div className="relative h-full w-full">
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              {n > 1 && (
                <polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {pts.map((p) => (
              <span
                key={p.turn}
                title={`${p.turn}: ${p.v}`}
                className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }}
              />
            ))}
          </div>
          <span className="absolute bottom-0 -translate-x-1/2 font-mono text-[10px] text-muted-foreground" style={{ left: `${pts[0].x}%` }}>
            {pts[0].turn}
          </span>
          {n > 1 && (
            <span className="absolute bottom-0 -translate-x-1/2 font-mono text-[10px] text-muted-foreground" style={{ left: `${pts[n - 1].x}%` }}>
              {pts[n - 1].turn}
            </span>
          )}
        </div>
      )}
    </Box>
  )
}
