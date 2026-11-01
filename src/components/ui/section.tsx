// A titled group of settings. `plain` is a heading over a Card of rows. `tinted` is one "task card": a header bar in
// the tone's soft fill with the icon, the title and value chips, and the rows below it, split by hairlines.

import { useId, type ReactNode } from "react"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"

import { Card } from "@/components/ui/card"
import { TONES, type ToneName } from "@/components/ui/tone"
import { cn } from "@/lib/utils"

/** A value chip: the tone's fill, border and ink. Neutral (muted) when there is no tone. */
export function Chip({ tone, children, className }: { tone?: ToneName; children: ReactNode; className?: string }) {
  // text-caption is a font size that tailwind-merge reads as a colour, so inside cn() the tone's text colour would
  // drop it. It is joined after the merge instead (the size and the colour are different CSS properties).
  return (
    <span
      className={`${cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-medium",
        tone ? TONES[tone].chip : "border-border bg-muted text-muted-foreground",
        className
      )} text-caption`}
    >
      {children}
    </span>
  )
}

export interface SectionProps {
  title: string
  tone?: ToneName
  icon?: PhosphorIcon
  /** a caption on the right of the heading */
  aside?: ReactNode
  variant?: "plain" | "tinted"
  /** value chips in the header (tinted only); they wrap under the title on a phone */
  chips?: string[]
  /** the controls are disabled by the caller; here the rows only get dimmed */
  dimmed?: boolean
  /** a muted caption above the rows */
  note?: string
  /** data-testid is `section-<id>` when given */
  id?: string
  className?: string
  children: ReactNode
}

export function Section({ title, tone, icon: Icon, aside, variant = "plain", chips, dimmed, note, id, className, children }: SectionProps) {
  const uid = useId()
  const headingId = `${uid}-title`
  const testId = id ? `section-${id}` : undefined

  if (variant === "tinted") {
    const k = tone ?? "slate"
    return (
      <section
        aria-labelledby={headingId}
        data-testid={testId}
        data-slot="section"
        data-variant="tinted"
        className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}
      >
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-4 py-3", TONES[k].fill, TONES[k].ink)}>
          {Icon ? <Icon aria-hidden="true" className="size-5 shrink-0" /> : null}
          <h3 id={headingId} className="text-heading font-semibold">{title}</h3>
          {chips && chips.length > 0 ? (
            <div className="ml-auto flex flex-wrap gap-1.5 max-md:ml-0 max-md:w-full">
              {chips.map((c) => (
                <Chip key={c} tone={k} className="bg-card">{c}</Chip>
              ))}
            </div>
          ) : null}
        </div>
        {note ? <p className="px-4 pt-3 text-caption text-muted-foreground">{note}</p> : null}
        <div className={cn("divide-y divide-border", dimmed && "opacity-60")}>{children}</div>
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} data-testid={testId} data-slot="section" data-variant="plain" className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 px-1">
        {tone ? <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-sm", TONES[tone].square)} /> : null}
        {Icon ? <Icon aria-hidden="true" className={cn("size-5 shrink-0", tone ? TONES[tone].ink : "text-muted-foreground")} /> : null}
        <h3 id={headingId} className="text-heading font-semibold">{title}</h3>
        {aside ? <span className="ml-auto text-caption text-muted-foreground">{aside}</span> : null}
      </div>
      {note ? <p className="px-1 text-caption text-muted-foreground">{note}</p> : null}
      <Card variant="rows" className={cn(dimmed && "opacity-60")}>{children}</Card>
    </section>
  )
}
