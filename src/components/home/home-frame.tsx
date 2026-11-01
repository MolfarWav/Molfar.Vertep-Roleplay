// The frame every Home block shares: a card with a tinted heading bar (the tone's soft fill, an icon and a word),
// the language hook the blocks read texts with, and the one empty line a block shows when it has nothing.

import type { ComponentProps, ReactNode } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useApp } from '@/lib/store'
import { resolveLanguage, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The language of the texts a block reads from guide tips (the setting, else the browser's). */
export function useLang(): Lang {
  return resolveLanguage(useApp((s) => s.settings.language))
}

/** A block's card: rows and art fill the grid cell's height. */
export function BlockCard({ className, children, ...rest }: ComponentProps<'div'>) {
  return <Card className={cn('min-w-0 flex-1 gap-0 py-0', className)} {...rest}>{children}</Card>
}

/** The heading bar: the tone's soft fill, the icon and the title; `aside` sits on the right. */
export function BlockHead({ tone, icon: Icon, title, aside }: { tone: ToneName; icon: PhosphorIcon; title: string; aside?: ReactNode }) {
  return (
    <div className={cn('flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5', TONES[tone].fill, TONES[tone].ink)}>
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <h3 className="text-heading font-semibold">{title}</h3>
      {aside ? <div className="ml-auto flex items-center gap-2 max-md:ml-0">{aside}</div> : null}
    </div>
  )
}

/** A block's body padding. */
export const BODY = 'flex flex-1 flex-col gap-3 p-4'

/** The one line a block shows when it has nothing to list. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-4 text-body text-muted-foreground">{children}</p>
}
