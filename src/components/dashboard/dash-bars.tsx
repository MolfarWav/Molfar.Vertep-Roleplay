import type { DispositionStat, PulseStat } from '@/lib/soul'
import { STAT_COLORS } from '@/lib/soul'
import { signed, tierIndex, trend } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useTx } from './dash-common'

const minus = (v: number) => signed(v).replace('-', '−')

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

function Label({ children }: { children: string }) {
  return <div className="w-[86px] shrink-0 truncate font-heading text-[13px] text-muted-foreground" title={children}>{children}</div>
}

export function SignedBar({ stat, value, prev, tier, compact }: {
  stat: DispositionStat
  value: number
  prev?: number | null
  tier?: boolean
  compact?: boolean
}) {
  const t = useT()
  const tx = useTx()
  const color = STAT_COLORS[stat]
  const label = t(`soul.stat.${stat}`)
  const half = Math.min(100, Math.abs(value)) / 100 * 50
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <div
          role="meter"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label={label}
          className={cn('relative min-w-0 flex-1 bg-foreground/10', compact ? 'h-1.5' : 'h-2')}
        >
          {value !== 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 box-border"
              style={value > 0
                ? { left: '50%', width: `${half}%`, background: color }
                : {
                    right: '50%',
                    width: `${half}%`,
                    border: `1px solid ${color}`,
                    background: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 5px)`,
                  }}
            />
          )}
          <div className="absolute inset-y-[-2px] left-1/2 w-px bg-border" aria-hidden="true" />
        </div>
        <div className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">{minus(value)}</div>
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

export function PulseBar({ stat, value, base, prev }: {
  stat: PulseStat
  value: number
  base: number
  prev?: number | null
}) {
  const t = useT()
  const color = STAT_COLORS[stat]
  const label = t(`soul.stat.${stat}`)
  return (
    <div className="flex items-center gap-2">
      <Label>{label}</Label>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
        className="relative h-2 min-w-0 flex-1 bg-foreground/10"
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, value)}%`, background: color }} aria-hidden="true" />
        <div
          className="absolute inset-y-[-2px] w-px bg-foreground/60"
          style={{ left: `${base}%` }}
          title={t('dash.pulse.base', { n: base })}
        />
      </div>
      <div className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">{value}</div>
      <TrendArrow dir={trend(value, prev)} />
    </div>
  )
}

export function HostilityBar({ value, className }: { value: number; className?: string }) {
  const t = useT()
  const label = t('soul.stat.hostility')
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Label>{label}</Label>
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
      <div className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">{value}</div>
      <span className="w-3 shrink-0" aria-hidden="true" />
    </div>
  )
}
