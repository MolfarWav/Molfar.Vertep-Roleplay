import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The mock's section marker: a small red diamond. */
export function Diamond({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-[7px] shrink-0 rotate-45 bg-primary', className)} />
}

/** A heading with the diamond, in Kurale. */
export function BlockLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('flex items-center gap-2 font-heading text-[15px] text-muted-foreground', className)}>
      <Diamond />
      {children}
    </h2>
  )
}

/** A small label chip: neutral, or red for the persona. */
export function Chip({ tone = 'neutral', icon, className, children }: { tone?: 'neutral' | 'red'; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-heading text-[12.5px] leading-tight',
        tone === 'red'
          ? 'border-primary/45 bg-primary/12 text-[color-mix(in_srgb,var(--primary)_55%,white)]'
          : 'border-border bg-secondary text-muted-foreground',
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** The block frame used by Create / Ask Molfar / Achievements. */
export function Block({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded border border-border bg-card', className)}>
      <div className="border-b border-border px-4 py-2.5"><BlockLabel>{label}</BlockLabel></div>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
    </section>
  )
}
