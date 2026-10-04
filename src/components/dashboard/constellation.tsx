import { useId } from 'react'
import type { DispositionStat } from '@/lib/soul'
import { DISPOSITION, STAT_COLORS } from '@/lib/soul'
import { CONSTELLATION_GOLD, CONSTELLATION_STATS, COLD_STAR, rayPosition, ZERO_RING } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { useTx } from './dash-common'

export function Constellation({ stats, prevStats, id, prevId, size, labels }: {
  stats: Record<DispositionStat, number>
  prevStats?: Record<DispositionStat, number> | null
  id: string
  prevId?: string | null
  size: number
  labels?: boolean
}) {
  const t = useT()
  const tx = useTx()
  const uid = useId().replace(/:/g, '')
  const filterId = `glow-${uid}`
  const cx = 50
  const cy = 50
  const rays = DISPOSITION.map((stat, i) => {
    const angle = (i * 72 - 90) * Math.PI / 180
    return { stat, x: cx + Math.cos(angle) * 40, y: cy + Math.sin(angle) * 40, angle }
  })
  const starAt = (stat: DispositionStat, v: number) => {
    const r = rayPosition(v) * 40
    const angle = (DISPOSITION.indexOf(stat) * 72 - 90) * Math.PI / 180
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  }
  const pointsFor = (stats: Record<DispositionStat, number>, ruleId: string) => {
    const list = CONSTELLATION_STATS[ruleId] ?? []
    return list.map((stat) => starAt(stat, stats[stat]))
  }
  const drawLines = (pts: { x: number; y: number }[], opacity: number, dash?: string) => {
    if (pts.length < 2) return null
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + (pts.length >= 3 ? ' Z' : '')
    return <path d={d} fill="none" stroke={CONSTELLATION_GOLD} strokeWidth={0.7} strokeOpacity={opacity} strokeDasharray={dash} />
  }
  const prevPts = prevId && prevStats && prevId !== id ? pointsFor(prevStats, prevId) : []
  const currPts = pointsFor(stats, id)
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={tx('dash.const', id)}
      className="max-w-full shrink-0 overflow-visible"
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      {rays.map((ray) => (
        <line key={ray.stat} x1={cx} y1={cy} x2={ray.x} y2={ray.y} stroke="currentColor" strokeWidth={0.4} opacity={0.25} />
      ))}
      <circle cx={cx} cy={cy} r={20} fill="none" stroke={ZERO_RING} strokeWidth={0.4} strokeDasharray="1.5 1.5" />
      {DISPOSITION.map((stat) => {
        const v = stats[stat]
        const pt = starAt(stat, v)
        const color = STAT_COLORS[stat]
        if (v > 0) {
          const r = 1.6 + 2.4 * v / 100
          return (
            <g key={stat}>
              <circle cx={pt.x} cy={pt.y} r={r} fill={color} opacity={0.6} filter={`url(#${filterId})`} />
              <circle cx={pt.x} cy={pt.y} r={r} fill={color} />
            </g>
          )
        }
        return <circle key={stat} cx={pt.x} cy={pt.y} r={1.8} fill="none" stroke={COLD_STAR} strokeWidth={0.6} />
      })}
      {drawLines(prevPts, 0.35, '1 1.2')}
      {drawLines(currPts, 0.9)}
      {labels && size >= 170 && rays.map((ray) => {
        const lx = cx + Math.cos(ray.angle) * 46
        const ly = cy + Math.sin(ray.angle) * 46
        const anchor = Math.abs(Math.cos(ray.angle)) < 0.3 ? 'middle' : Math.cos(ray.angle) > 0 ? 'start' : 'end'
        return (
          <text
            key={ray.stat}
            x={lx}
            y={ly}
            fontSize={4.2}
            fill="currentColor"
            opacity={0.7}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {t(`soul.stat.${ray.stat}`)}
          </text>
        )
      })}
    </svg>
  )
}

