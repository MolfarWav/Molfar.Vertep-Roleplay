// A setting as a list row: the label on the left (with an (i) that opens the long explanation), the control on the
// right. Rows pad themselves, so they sit in a Card with variant="rows" (the hairline between rows is the Card's).
// Moved from components/world/world-setting-row.tsx, which a later job removes.

import { useEffect, useState, type ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { InfoTip } from "@/components/ui/info-tip"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

/** Label on the left (with its (i) when there is a hint), the control on the right; 48 px high on a phone. */
export function SettingRow({
  label,
  info,
  status,
  off,
  children,
  className,
}: {
  label: string
  /** the long explanation, opened by the (i) */
  info?: ReactNode
  /** one short live line under the row, muted (say why when `off`) */
  status?: ReactNode
  /** the setting is switched off elsewhere: the row is dimmed */
  off?: boolean
  children: ReactNode
  className?: string
}) {
  const t = useT()
  return (
    <div className={cn("flex flex-col", off && "opacity-60", className)}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1 text-body max-md:min-h-12">
        <span className="flex min-w-0 flex-[1_1_9rem] items-center gap-0.5">
          <span className="min-w-0">{label}</span>
          {info ? (
            <InfoTip label={t("ui.info", { label })} testId="setting-info" className="size-8 max-md:size-10">
              {info}
            </InfoTip>
          ) : null}
        </span>
        {children}
      </div>
      {status ? <p aria-live="polite" className="-mt-1 px-4 pb-1 text-caption text-muted-foreground">{status}</p> : null}
    </div>
  )
}

/** A number control for a row: the draft is kept while typing, committed on blur or Enter, clamped to its bounds. */
export function NumControl({ label, value, min, max, step, disabled, onCommit, className }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onCommit: (n: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || draft.trim() === "") return setDraft(String(value))
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
      onKeyDown={(e) => { if (e.key === "Enter") commit() }}
      className={cn("h-10 w-20 shrink-0 text-right md:h-8", className)}
    />
  )
}

/**
 * A number as a tile: a short label, an optional one-line hint under it and the input below. Tiles sit in a two-column
 * grid (one column on a phone), so the label must be short; the long explanation goes into `info` (the (i)).
 */
export function NumTile({ label, hint, info, value, min, max, step, disabled, onCommit }: { label: string; hint?: string; info?: ReactNode; value: number; min: number; max: number; step?: number; disabled?: boolean; onCommit: (n: number) => void }) {
  const t = useT()
  return (
    <div data-slot="num-tile" className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-background p-3", disabled && "opacity-60")}>
      <span className="flex items-center gap-0.5 text-body">
        <span className="min-w-0">{label}</span>
        {info ? (
          <InfoTip label={t("ui.info", { label })} testId="setting-info" className="size-8 max-md:size-10">
            {info}
          </InfoTip>
        ) : null}
      </span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
      <NumControl label={label} value={value} min={min} max={max} step={step} disabled={disabled} onCommit={onCommit} className="mt-1.5 w-full text-left" />
    </div>
  )
}

/** Two or three short choices side by side; the long explanation belongs in the row's (i). */
export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: { id: T; label: string; className?: string }[]; onChange: (v: T) => void; className?: string }) {
  // text-body is joined after cn(): tailwind-merge reads it as a colour and would drop it next to the text colour
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5", className)}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { if (!active) onChange(o.id) }}
            className={`${cn(
              "rounded-md px-2.5 py-1 whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-10",
              active
                ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              o.className
            )} text-body`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
