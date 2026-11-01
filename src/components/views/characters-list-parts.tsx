// Pieces of the Characters list (characters-view.tsx): the folder strip, the marker chips on a card,
// the "Move to folder" menu items and the New folder dialog. Presentational: the view owns the state.

import { useEffect, useState, type ReactNode } from 'react'
import { BookOpenText, Check, Folder as FolderIcon, Plus, Smiley, Star, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import type { Tag } from '@/lib/types'
import { cn } from '@/lib/utils'

/** One chip of the folder strip: a toggle, pressed when it is the current choice. */
function StripChip({ pressed, dashed, testId, onClick, children }: {
  pressed: boolean; dashed?: boolean; testId: string; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-caption font-medium max-md:h-10',
        dashed && 'border-dashed',
        pressed ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export interface FolderStripProps {
  /** the folder tags, in the tag manager's order */
  folders: readonly Tag[]
  /** cards per folder name */
  counts: ReadonlyMap<string, number>
  /** every card in the list (All) */
  total: number
  /** starred cards (Favourites) */
  favourites: number
  /** cards with no folder tag (No folder) */
  unfiled: number
  /** the chosen folder's name, null when none */
  folder: string | null
  /** "No folder" is the choice */
  unfiledOn: boolean
  /** the Favourites filter is on */
  favOn: boolean
  onFolder: (name: string | null) => void
  onUnfiled: () => void
  onFavourites: () => void
  onNew: () => void
}

/** The folders block above the Characters list, always shown: All, Favourites, the folders with counts,
 *  No folder, and a dashed New folder. Each chip is a toggle with its count; the choices filter one list. */
export function FolderStrip(p: FolderStripProps) {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t('characters.folders.aria')}
      data-testid="folder-strip"
      data-guide="characters.folders"
      className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 md:px-4"
    >
      <StripChip pressed={p.folder === null && !p.unfiledOn} testId="folder-all" onClick={() => p.onFolder(null)}>
        {t('characters.folders.all')}
        <span className="tabular-nums opacity-70">{p.total}</span>
      </StripChip>
      <StripChip pressed={p.favOn} testId="folder-favourites" onClick={p.onFavourites}>
        <Star className="size-3.5" weight={p.favOn ? 'fill' : 'regular'} aria-hidden="true" />
        {t('characters.folders.favourites')}
        <span className="tabular-nums opacity-70">{p.favourites}</span>
      </StripChip>
      {p.folders.map((f) => (
        <StripChip key={f.id} pressed={p.folder === f.name} testId="folder-chip" onClick={() => p.onFolder(f.name)}>
          <FolderIcon className="size-3.5" style={{ color: f.color }} aria-hidden="true" />
          {f.name}
          <span className="tabular-nums opacity-70">{p.counts.get(f.name) ?? 0}</span>
        </StripChip>
      ))}
      <StripChip pressed={p.unfiledOn} testId="folder-none" onClick={p.onUnfiled}>
        {t('characters.folders.none')}
        <span className="tabular-nums opacity-70">{p.unfiled}</span>
      </StripChip>
      <StripChip dashed pressed={false} testId="folder-new" onClick={p.onNew}>
        <Plus className="size-3.5" aria-hidden="true" />
        {t('characters.folders.new')}
      </StripChip>
    </div>
  )
}

/** The lorebook and sprites markers on a card: a tone chip with the icon and the word. The icons keep
 *  their names for assistive tech. */
export function CardMarkers({ lore, sprites }: { lore: boolean; sprites: boolean }) {
  const t = useT()
  return (
    <>
      {lore && (
        <Chip tone="emerald" className="gap-1">
          <BookOpenText className="size-3.5" aria-label={t('characters.hasLore')} role="img"><title>{t('characters.hasLore')}</title></BookOpenText>
          {t('characters.marker.lore')}
        </Chip>
      )}
      {sprites && (
        <Chip tone="violet" className="gap-1">
          <Smiley className="size-3.5" aria-label={t('characters.hasSprites')} role="img"><title>{t('characters.hasSprites')}</title></Smiley>
          {t('characters.marker.sprites')}
        </Chip>
      )}
    </>
  )
}

/** The items of "Move to folder": the folders, a separator, New folder, No folder. Inside a menu (a sub-menu
 *  on a card, the batch bar's menu). For one card, `current` lists its folders: a ticked folder is taken out on tap. */
export function MoveToFolderItems({ folders, current, onPick, onRemove, onNew, onNone }: {
  folders: readonly Tag[]
  current?: readonly string[]
  onPick: (name: string) => void
  onRemove?: (name: string) => void
  onNew: () => void
  onNone: () => void
}) {
  const t = useT()
  return (
    <>
      {folders.map((f) => {
        const on = current?.includes(f.name) ?? false
        return (
          <DropdownMenuItem key={f.id} onClick={() => (on && onRemove ? onRemove(f.name) : onPick(f.name))}>
            <FolderIcon className="size-4" style={{ color: f.color }} aria-hidden="true" />
            <span className="min-w-0 truncate">{f.name}</span>
            {on && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        )
      })}
      {folders.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onClick={onNew}>
        <Plus className="size-4" aria-hidden="true" />{t('characters.folders.newMenu')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onNone}>
        <X className="size-4" aria-hidden="true" />{t('characters.folders.none')}
      </DropdownMenuItem>
    </>
  )
}

/** Asks for a folder's name. The view makes the tag (and moves the cards that asked for it). */
export function NewFolderDialog({ open, onOpenChange, onCreate }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName('') }, [open])
  const submit = () => {
    const n = name.trim()
    if (!n) return
    onCreate(n)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('characters.folders.newTitle')}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('characters.folders.newName')}
            aria-label={t('characters.folders.newName')}
            className="h-10 text-sm"
          />
          <FieldDescription>{t('characters.folders.newHint')}</FieldDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('characters.folders.cancel')}</Button>
            <Button type="submit" disabled={!name.trim()}>{t('characters.folders.create')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
