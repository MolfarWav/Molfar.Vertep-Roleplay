// The World DM's settings as a list, not paragraphs: a row is the label, an (i) button that opens the long
// explanation in a popover, and the control on the right. Rows sit in folds that remember their state.

import { useEffect, useState, type ReactNode } from 'react'
import { CaretDown, CaretRight, Info } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'

/** The (i) after a label: a click or tap opens the explanation (never a hover-only tooltip). */
export function InfoButton({ label, children }: { label: string; children: ReactNode }) {
  const t = useT()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-10"
            aria-label={t('world.info', { label })}
            title={t('world.info', { label })}
            data-testid="setting-info"
          />
        }
      >
        <Info className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-xs leading-snug text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** Label on the left (with its (i) when there is a hint), the control on the right; 40 px high on a phone. */
export function SettingRow({ label, info, status, children, className }: { label: string; info?: ReactNode; /** one short live line under the row, muted */ status?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="flex min-w-0 flex-[1_1_9rem] items-center gap-0.5">
          <span className="min-w-0">{label}</span>
          {info ? <InfoButton label={label}>{info}</InfoButton> : null}
        </span>
        {children}
      </div>
      {status ? <p className="-mt-1 pb-1 text-xs text-muted-foreground">{status}</p> : null}
    </div>
  )
}

/** A number control for a row: the draft is kept while typing, committed on blur or Enter, clamped to its bounds. */
export function NumControl({ label, value, min, max, step, disabled, onCommit }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || draft.trim() === '') return setDraft(String(value))
    const next = Math.min(max, Math.max(min, n))
    if (next !== value) onCommit(next)
    else setDraft(String(value))
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step ?? 1}
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      className="h-10 w-20 shrink-0 text-right md:h-8"
    />
  )
}

/** Two or three short choices side by side; the long explanation belongs in the row's (i). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => { if (value !== o.id) onChange(o.id) }}
          className={cn('rounded px-2.5 py-1 text-sm whitespace-nowrap max-md:min-h-10', value === o.id ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const KEY = 'rp.worldSections'

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
    return typeof v[id] === 'boolean' ? v[id] : fallback
  } catch {
    return fallback
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
    sessionStorage.setItem(KEY, JSON.stringify({ ...v, [id]: open }))
  } catch { /* storage is optional */ }
}

/** A heading that folds its rows; the state is remembered for the session. */
export function FoldSection({ id, title, defaultOpen = false, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  return (
    <section className="border-b border-border last:border-b-0" data-testid={`fold-${id}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { setOpen(!open); writeOpen(id, !open) }}
        className="flex min-h-10 w-full items-center gap-1.5 text-left text-sm font-medium"
      >
        {open ? <CaretDown className="size-3.5 text-muted-foreground" aria-hidden="true" /> : <CaretRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        {title}
      </button>
      {open && <div className="flex flex-col pb-2">{children}</div>}
    </section>
  )
}
