import type { DispositionStat, PulseStat } from '@/lib/soul'
import { STAT_COLORS } from '@/lib/soul'
import { signed, tierIndex, trend } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useTx } from './dash-common'
import { useGlide } from './dash-motion'

const minus = (v: number) => signed(v).replace('-', '−')

/** A negative number is red (the minus sign and the bar's side say it too: colour is never alone). */
export const NEG_TEXT = 'text-red-600 dark:text-red-400'
export const NEG_BAR = 'bg-red-500'

function TrendArrow({ dir }: { dir: -1 | 0 | 1 }) {
  return (
    <span
      aria-hidden="true"
      className={cn('w-3 shrink-0 text-center font-mono text-[11px]', dir === 0 && 'text-muted-foreground/60')}
      style={dir === 1 ? { color: '#8fc6d6' } : dir === -1 ? { color: '#ff6b7d' } : undefined}
    >
      {dir === 1 ? '▲' : dir === -1 ? '▼' : '—'}
    </span>
  )
}

function Label({ children, slim }: { children: string; slim?: boolean }) {
  return <div className={cn('shrink-0 truncate font-heading text-muted-foreground', slim ? 'w-[58px] text-[12px]' : 'w-[86px] text-[13px]')} title={children}>{children}</div>
}

export function SignedBar({ stat, value, prev, tier, compact, slim }: {
  stat: DispositionStat
  value: number
  prev?: number | null
  tier?: boolean
  compact?: boolean
  /** the narrow label and number of the Attitude card beside the radar */
  slim?: boolean
}) {
  const t = useT()
  const tx = useTx()
  const color = STAT_COLORS[stat]
  const label = t(`soul.stat.${stat}`)
  // the bar glides from last turn's value to this turn's; the number and the meter say the true one
  const drawn = useGlide(value, prev)
  const half = Math.min(100, Math.abs(drawn)) / 100 * 50
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Label slim={slim}>{label}</Label>
        <div
          role="meter"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label={label}
          className={cn('relative min-w-0 flex-1 bg-foreground/10', compact ? 'h-1.5' : 'h-2')}
        >
          {(drawn !== 0 || value !== 0) && (
            <div
              aria-hidden="true"
              className={cn('absolute inset-y-0 box-border motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out', (drawn !== 0 ? drawn : value) < 0 && NEG_BAR)}
              style={(drawn !== 0 ? drawn : value) > 0
                ? { left: '50%', width: `${half}%`, background: color }
                : { right: '50%', width: `${half}%` }}
            />
          )}
          <div className="absolute inset-y-[-2px] left-1/2 w-px bg-border" aria-hidden="true" />
        </div>
        <div className={cn('shrink-0 text-right font-mono text-[11px] tabular-nums', slim ? 'w-8' : 'w-9', value < 0 && NEG_TEXT)}>{minus(value)}</div>
        <TrendArrow dir={trend(value, prev)} />
      </div>
      {tier && (
        <div className="ml-[94px] min-w-0 break-words font-heading text-[12px] text-muted-foreground">
          {tx(`dash.tier.${stat}`, String(tierIndex(value)))}
        </div>
      )}
    </div>
  )
}

export function PulseBar({ stat, value, base, prev, slim }: {
  stat: PulseStat
  value: number
  base: number
  prev?: number | null
  slim?: boolean
}) {
  const t = useT()
  const color = STAT_COLORS[stat]
  const label = t(`soul.stat.${stat}`)
  const drawn = useGlide(value, prev)
  return (
    <div className="flex items-center gap-2">
      <Label slim={slim}>{label}</Label>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
        className="relative h-2 min-w-0 flex-1 bg-foreground/10"
      >
        <div className={cn('absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out', value < 0 && NEG_BAR)} style={value < 0 ? { width: `${Math.min(100, Math.abs(drawn))}%` } : { width: `${Math.min(100, drawn)}%`, background: color }} aria-hidden="true" />
        <div
          className="absolute inset-y-[-2px] w-px bg-foreground/60"
          style={{ left: `${base}%` }}
          title={t('dash.pulse.base', { n: base })}
        />
      </div>
      <div className={cn('shrink-0 text-right font-mono text-[11px] tabular-nums', slim ? 'w-8' : 'w-9', value < 0 && NEG_TEXT)}>{value}</div>
      <TrendArrow dir={trend(value, prev)} />
    </div>
  )
}

export function HostilityBar({ value, className, slim }: { value: number; className?: string; slim?: boolean }) {
  const t = useT()
  const label = t('soul.stat.hostility')
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Label slim={slim}>{label}</Label>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
        className="relative h-2 min-w-0 flex-1 bg-foreground/10"
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, value)}%`, background: STAT_COLORS.hostility }} aria-hidden="true" />
      </div>
      <div className={cn('shrink-0 text-right font-mono text-[11px] tabular-nums', slim ? 'w-8' : 'w-9')}>{value}</div>
      <span className="w-3 shrink-0" aria-hidden="true" />
    </div>
  )
}
