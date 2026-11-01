import type { ReactNode } from 'react'
import { TONES, type ToneName } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

/**
 * A toggle chip for a filter, with its count. The pressed state is a border and a heavier weight, not only a
 * shade. A tone colours the word and an icon goes before it; 40 px tall on a phone.
 */
export function FilterChip({ pressed, onClick, count, tone, icon, children }: {
  pressed: boolean
  onClick: () => void
  count?: number
  tone?: ToneName
  icon?: ReactNode
  children: ReactNode
}) {
  // text-caption is read as a colour by tailwind-merge, so it is joined after cn() (see ui/section.tsx Chip)
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10',
        pressed
          ? tone ? TONES[tone].chip : 'border-foreground/40 bg-accent text-foreground'
          : tone ? cn('border-border bg-background', TONES[tone].ink) : 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        pressed && 'font-semibold',
      )} text-caption`}
    >
      {icon}
      {children}
      {count !== undefined ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </button>
  )
}
