// The curtain (#448, T3, variant A): one button in the chat header (and a block in the phone menu) that opens the existing
// Backstage section drawers at the object this chat uses: the card, the preset, the lorebooks, the Library and the World
// of this chat, and What fired. The chat stays under the drawer, so closing it returns to the same message.
// The targets come from `backstageTargets` (src/lib/backstage-targets.ts), a pure function a test can read.

import { Brain, BookOpenText, GlobeHemisphereWest, Lightning, MaskHappy, SlidersHorizontal, User } from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { backstageTargets, type BackstageKey, type TargetInput } from '@/lib/backstage-targets'

const ICON: Record<BackstageKey, PhosphorIcon> = { card: User, preset: SlidersHorizontal, book: BookOpenText, library: Brain, world: GlobeHemisphereWest, fired: Lightning }

export interface BackstageRow {
  id: string
  icon: PhosphorIcon
  label: string
  onSelect: () => void
}

/** The curtain's rows for this chat: label and action per target. `onFired` is the chat's own What fired sheet. */
export function useBackstageRows(
  character: TargetInput['character'],
  preset: TargetInput['preset'],
  chatId: string,
  onFired: () => void,
): BackstageRow[] {
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const openCard = useApp((s) => s.openCard)
  const focusPreset = useApp((s) => s.focusPreset)
  const focusLorebook = useApp((s) => s.focusLorebook)
  const focusLibraryChat = useApp((s) => s.focusLibraryChat)
  const focusWorldChat = useApp((s) => s.focusWorldChat)
  return backstageTargets({ character, preset, lorebooks }).map((tg): BackstageRow => {
    const name = tg.objectName ?? ''
    const base = { id: tg.id, icon: ICON[tg.key] }
    switch (tg.key) {
      case 'card': return { ...base, label: t('backstage.card', { name }), onSelect: () => openCard(tg.objectId!) }
      case 'preset': return { ...base, label: t('backstage.preset', { name }), onSelect: () => focusPreset(tg.objectId!) }
      case 'book': return { ...base, label: t('backstage.book', { name }), onSelect: () => focusLorebook(tg.objectId!) }
      case 'fired': return { ...base, label: t('backstage.fired'), onSelect: onFired }
      case 'library': return { ...base, label: t('backstage.library'), onSelect: () => focusLibraryChat(chatId) }
      case 'world': return { ...base, label: t('backstage.world'), onSelect: () => focusWorldChat(chatId) }
    }
  })
}

interface MenuProps {
  character: TargetInput['character']
  preset: TargetInput['preset']
  chatId: string
  /** The chat's own What fired sheet. */
  onFired: () => void
}

/** The header's curtain button. With `labelled` it carries the word, else an icon whose name is in the aria-label. */
export function BackstageButton({ labelled, ...p }: MenuProps & { labelled: boolean }) {
  const t = useT()
  const rows = useBackstageRows(p.character, p.preset, p.chatId, p.onFired)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-guide="chat.backstage" data-testid="backstage-button" variant="outline" size={labelled ? 'sm' : 'icon-sm'} aria-label={t('backstage.button')} title={t('backstage.hint')}>
            <MaskHappy aria-hidden="true" />
            {labelled && t('backstage.button')}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="whitespace-normal text-caption font-normal text-muted-foreground">{t('backstage.hint')}</DropdownMenuLabel>
          {rows.map((r) => (
            <DropdownMenuItem key={r.id} onClick={r.onSelect}>
              <r.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{r.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same rows in the phone menu (44 px rows), under their own heading; `closeMenu` shuts the menu before the drawer opens. */
export function BackstagePhoneBlock({ closeMenu, ...p }: MenuProps & { closeMenu: () => void }) {
  const t = useT()
  const rows = useBackstageRows(p.character, p.preset, p.chatId, p.onFired)
  return (
    <div className="flex flex-col" data-guide="chat.backstage" data-testid="backstage-phone">
      <p className="px-3 pt-2 pb-1 text-caption uppercase tracking-wider text-muted-foreground">{t('backstage.button')}</p>
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => { closeMenu(); r.onSelect() }}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-accent"
        >
          <r.icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{r.label}</span>
        </button>
      ))}
    </div>
  )
}
