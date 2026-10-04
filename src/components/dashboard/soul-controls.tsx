// Small building blocks of the Soul tab: sharp-cornered cards, a segmented
// control and range bars (a native range input under a drawn track, so keyboard,
// touch and screen readers work as usual).

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SoulCard({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border border-border bg-card', className)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

export function SubLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] text-muted-foreground">{children}</div>
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              'border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Thumb is 12 px wide; both the drawn thumb and the native one use the same
 *  travel so the pointer lands where the diamond is. */
const pos = (frac: number) => `calc(6px + (100% - 12px) * ${frac})`

export function RangeBar({ value, min, max, onChange, color, disabled, label, fillFrom }: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  color: string
  disabled?: boolean
  label: string
  /** the value the fill grows from (0 for signed values, 50 for a spectrum); default: the left end */
  fillFrom?: number
}) {
  const span = max - min
  const f = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0
  const f0 = fillFrom !== undefined && span > 0 ? Math.min(1, Math.max(0, (fillFrom - min) / span)) : 0
  const lo = Math.min(f0, f)
  const hi = Math.max(f0, f)
  return (
    <div className={cn('relative h-5 min-w-0 flex-1', disabled && 'opacity-50')}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-foreground/15" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2"
        style={{ left: pos(lo), right: `calc(100% - ${pos(hi)})`, background: color }}
      />
      <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-border" style={{ left: pos(fillFrom !== undefined ? f0 : 0.5) }} aria-hidden="true" />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'peer absolute inset-0 z-10 m-0 h-full w-full appearance-none bg-transparent opacity-0',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          '[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:border-0',
        )}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-3 -translate-x-1/2 -translate-y-1/2 bg-foreground/80 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] peer-focus-visible:bg-primary"
        style={{ left: pos(f) }}
        aria-hidden="true"
      />
    </div>
  )
}
