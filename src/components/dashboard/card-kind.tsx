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

const BADGE = 'inline-flex shrink-0 items-center gap-1 border border-primary/60 bg-primary/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary'

/** The kind as a badge; nothing when the card has none. */
export function CardKindBadge({ type, className }: { type: CardType | null; className?: string }) {
  const t = useT()
  if (!type) return null
  return <span className={cn(BADGE, className)} data-card-kind={type}>{t(mk(`kind.${type}`))}</span>
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
          type ? BADGE : 'inline-flex shrink-0 items-center gap-1 border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground',
          'outline-none hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring/60',
          type && 'cursor-pointer',
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
