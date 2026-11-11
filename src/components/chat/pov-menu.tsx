// "Continue from someone's view": the + menu's way to follow one character once the persona and the others
// have split up. It sends a stage direction alone ([[...]], Molfar.Vertep#368: an out-of-character instruction
// for that reply, no words of the player's own), so nothing is said in the story and no scene is held back.

import { Eye } from '@phosphor-icons/react'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import {
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { povCast, povDirection } from '@/lib/pov'
import type { Character } from '@/lib/types'

/** The names of the chat's card, or of every member of its group. */
function cardNamesOf(characters: Character[], characterId: string | null): string[] {
  const card = characters.find((c) => c.id === characterId)
  if (!card) return []
  if (!card.isGroup) return [card.name]
  return (card.members ?? []).map((id) => characters.find((c) => c.id === id)?.name ?? '').filter(Boolean)
}

export function PovSubmenu({ chatId, disabled, onSomeoneElse }: {
  chatId: string
  disabled: boolean
  /** puts an empty "from the point of view of ..." direction in the box for a name this list does not have */
  onSomeoneElse: () => void
}) {
  const t = useT()
  const dash = useDashMaybe()
  const sendMessage = useApp((s) => s.sendMessage)
  const characters = useApp((s) => s.characters)
  const characterId = useApp((s) => s.chats.find((c) => c.id === chatId)?.characterId ?? null)
  const usable = !!dash && (dash.status === 'ready' || dash.status === 'empty')
  const view = usable ? dash?.view ?? null : null
  const cast = povCast(view, cardNamesOf(characters, characterId))
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled} data-testid="pov-menu">
        <Eye className="size-4" /> {t('composer.pov')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
        {cast.map((p) => (
          <DropdownMenuItem key={p.name} className="max-md:min-h-10" onClick={() => void sendMessage(chatId, povDirection(p.name))}>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.inScene && <span className="text-xs text-muted-foreground">{t('composer.pov.here')}</span>}
          </DropdownMenuItem>
        ))}
        {cast.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem className="max-md:min-h-10" onClick={onSomeoneElse}>{t('composer.pov.other')}</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
