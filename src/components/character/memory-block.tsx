import { Plus } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TONES = {
  sky: { box: 'border-sky-500/40', head: 'border-sky-500/40 bg-sky-500/10', icon: 'bg-sky-500/20 text-sky-700 dark:text-sky-300' },
  emerald: { box: 'border-emerald-500/40', head: 'border-emerald-500/40 bg-emerald-500/10', icon: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  violet: { box: 'border-violet-500/40', head: 'border-violet-500/40 bg-violet-500/10', icon: 'bg-violet-500/20 text-violet-700 dark:text-violet-300' },
} as const

/** A section of the Memory tab with a coloured header strip, so the sections are told apart at a glance. */
export function Block({ tone, icon: Icon, title, count, children }: { tone: keyof typeof TONES; icon: typeof Plus; title: string; count?: number; children: React.ReactNode }) {
  const k = TONES[tone]
  return (
    <section className={cn('overflow-hidden rounded-lg border', k.box)}>
      <header className={cn('flex items-center gap-2 border-b px-3 py-2', k.head)}>
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', k.icon)}><Icon className="size-4" aria-hidden="true" /></span>
        <h3 className="text-sm font-medium">{title}</h3>
        {count !== undefined && <Badge variant="secondary" className="px-1.5">{count}</Badge>}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

export function AddButton({ onClick, label, primary, disabled }: { onClick: () => void; label: string; primary?: boolean; disabled?: boolean }) {
  return (
    <Button variant={primary ? 'default' : 'outline'} size="sm" className="w-fit max-md:h-10" onClick={onClick} disabled={disabled}>
      <Plus aria-hidden="true" />{label}
    </Button>
  )
}
