import type { ReactElement } from 'react'
import { IdentificationCard, Sparkle, Gauge, ArrowsOut } from '@phosphor-icons/react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CardKindBadge } from '@/components/dashboard/card-kind'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cardTypeOf } from '@/lib/soul'
import type { ID } from '@/lib/types'

/** What a click on a character's portrait opens: the card, its soul, the dashboard,
 *  the full portrait. In a group chat `characterId` is the SPEAKER, except in the chat
 *  header, where it is the group card (no Soul item for a group). */
export function AvatarMenu({ characterId, children, onViewPortrait, align = 'center' }: {
  characterId: ID
  /** the trigger element */
  children: ReactElement
  /** the "View portrait" item shows only when given */
  onViewPortrait?: () => void
  align?: 'start' | 'center' | 'end'
}) {
  const t = useT()
  const card = useApp((s) => s.characters.find((c) => c.id === characterId))
  const openCharacterOnTab = useApp((s) => s.openCharacterOnTab)
  const openDashboard = useApp((s) => s.openDashboard)
  const dash = useDashMaybe()
  const dashAvailable = dash?.status === 'empty' || dash?.status === 'ready'
  // an empty dashboard has a sheet only on wide screens (there the strip unfolds); a phone shows its empty bar already
  const dashItem = dash?.status === 'ready' || (dash?.status === 'empty' && window.matchMedia('(min-width: 1024px)').matches)

  // a speaker whose card was deleted: the trigger stays, there is nothing to open
  if (!card) return children

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children} aria-label={t('avatar.menu', { name: card.name })} />
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col items-start gap-1 py-1.5">
            <span className="max-w-full truncate text-sm font-medium text-foreground">{card.name}</span>
            <CardKindBadge type={cardTypeOf(card)} />
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openCharacterOnTab(characterId, 'core')}>
          <IdentificationCard className="size-4" aria-hidden="true" />
          {t('avatar.card')}
        </DropdownMenuItem>
        {!card.isGroup && dashAvailable && (
          <DropdownMenuItem onClick={() => openCharacterOnTab(characterId, 'soul')}>
            <Sparkle className="size-4" aria-hidden="true" />
            {t('avatar.soul')}
          </DropdownMenuItem>
        )}
        {dashItem && (
          <DropdownMenuItem onClick={() => openDashboard()}>
            <Gauge className="size-4" aria-hidden="true" />
            {t('avatar.dashboard')}
          </DropdownMenuItem>
        )}
        {onViewPortrait && (
          <DropdownMenuItem onClick={onViewPortrait}>
            <ArrowsOut className="size-4" aria-hidden="true" />
            {t('avatar.portrait')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
