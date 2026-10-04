// The card's kind (`extensions.molfar_card_type`) as a prominent badge: in the
// character editor's header (a menu that changes it), on the Characters tile and
// in the chat's avatar popover.

import { CaretDown } from '@phosphor-icons/react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { CARD_TYPES, cardTypeOf, withCardType, type CardType } from '@/lib/soul'
import type { Character } from '@/lib/types'
import { cn } from '@/lib/utils'
import { mk } from './effect-text'

const BADGE = 'inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-xs font-bold uppercase tracking-wider'

// one colour per kind (full class names, so Tailwind sees them); `hover` is for the editor's menu trigger
const KIND_COLOR: Record<CardType, { badge: string; hover: string }> = {
  single: { badge: 'border-sky-500/60 bg-sky-500/15 text-sky-700 dark:text-sky-300', hover: 'hover:bg-sky-500/25' },
  narrator: { badge: 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300', hover: 'hover:bg-violet-500/25' },
  group: { badge: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', hover: 'hover:bg-emerald-500/25' },
  assistant: { badge: 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300', hover: 'hover:bg-amber-500/25' },
  other: { badge: 'border-zinc-500/60 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300', hover: 'hover:bg-zinc-500/25' },
}

/** The kind as a badge; nothing when the card has none. */
export function CardKindBadge({ type, className }: { type: CardType | null; className?: string }) {
  const t = useT()
  if (!type) return null
  return <span className={cn(BADGE, KIND_COLOR[type].badge, className)} data-card-kind={type}>{t(mk(`kind.${type}`))}</span>
}

/** Editor header: the badge, or a muted "set kind" chip, opening a menu that writes the card at once. */
export function CardKindMenu({ c }: { c: Character }) {
  const t = useT()
  const updateCharacter = useApp((s) => s.updateCharacter)
  const type = cardTypeOf(c)
  const set = (next: CardType | null) => updateCharacter(c.id, withCardType(c, next))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t('kind.title')}: ${type ? t(mk(`kind.${type}`)) : t('kind.notSet')}`}
        className={cn(
          type
            ? cn(BADGE, KIND_COLOR[type].badge, KIND_COLOR[type].hover, 'cursor-pointer')
            : 'inline-flex shrink-0 items-center gap-1 border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-primary/25 hover:text-foreground',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        )}
      >
        {type ? t(mk(`kind.${type}`)) : t('kind.set')}
        <CaretDown className="size-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-40">
        {/* a menu label must live inside a group, or the menu throws */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('kind.title')}</DropdownMenuLabel>
          {CARD_TYPES.map((k) => (
            <DropdownMenuItem key={k} onClick={() => set(k)} className={cn(k === type && 'font-semibold')}>
              {t(mk(`kind.${k}`))}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => set(null)}>{t('kind.notSet')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
