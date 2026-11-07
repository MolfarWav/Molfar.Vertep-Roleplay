import { useId, useState, type DragEvent, type ReactNode } from 'react'
import { CaretRight, DotsThreeVertical, FolderOpen, FolderSimple, FolderSimpleDashed, Pencil, Plus, ToggleLeft, ToggleRight, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { TONES } from '@/components/ui/tone'
import type { FolderGroup, FolderTone, FolderTree } from '@/lib/lore-folders'
import { cn } from '@/lib/utils'
import { formatTokens } from '@/lib/tokens'
import type { LoreEntry } from '@/lib/types'

/** The drag payload of entry rows: a JSON list of entry ids. */
export const LORE_DRAG = 'application/x-lore-entry-ids'

/** How many entries of one folder show before "Show more". */
export const FOLDER_PAGE = 50

/** The ids of the entries a tree shows right now: what "Select all visible" takes. */
export function visibleEntries(tree: FolderTree, isOpen: (name: string) => boolean, limit: (key: string) => number): LoreEntry[] {
  return [
    ...tree.folders.filter((f) => isOpen(f.name)).flatMap((f) => f.entries.slice(0, limit(f.name))),
    ...tree.loose.slice(0, limit('')),
  ]
}

/**
 * The Entries tab as a tree (a book that has folders): folders first, each one folded or open, then the entries with
 * no folder. A search or filter opens the folders that have a match (`searching`) and the head says "3 of 41".
 * The rows are the caller's (`renderRow`), so an entry looks the same in a folder and in the flat list.
 */
export function EntryTree({ tree, searching, isOpen, onToggle, limitOf, onMore, selecting, selected, onSelectMany, renderRow, toneOf, onDropEntries, onAddHere, onEnableAll, onRename, onRemove }: {
  tree: FolderTree
  searching: boolean
  isOpen: (name: string) => boolean
  onToggle: (name: string) => void
  limitOf: (key: string) => number
  onMore: (key: string) => void
  selecting: boolean
  selected: string[]
  onSelectMany: (entries: LoreEntry[], on: boolean) => void
  renderRow: (e: LoreEntry) => ReactNode
  /** the colour a folder wears (undefined = the default amber) */
  toneOf: (name: string) => FolderTone | undefined
  /** entries dropped on a folder ('' = the entries with no folder) */
  onDropEntries: (ids: string[], folder: string) => void
  onAddHere: (name: string) => void
  onEnableAll: (name: string, on: boolean) => void
  onRename: (name: string) => void
  onRemove: (name: string) => void
}) {
  const t = useT()
  const ids = useId()
  // drag and drop (a mouse): a row drags onto a folder or onto "No folder". `over` is the target lit up right now;
  // `dragging` shows the "No folder" target even when every entry sits in a folder. A phone uses Move to folder.
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState<string | null>(null)
  const target = (name: string) => ({
    onDragOver: (ev: DragEvent) => { if (ev.dataTransfer.types.includes(LORE_DRAG)) { ev.preventDefault(); ev.stopPropagation(); setOver(name) } },
    onDragLeave: (ev: DragEvent) => { if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) setOver((o) => (o === name ? null : o)) },
    onDrop: (ev: DragEvent) => {
      ev.preventDefault(); ev.stopPropagation()
      setOver(null); setDragging(false)
      try { onDropEntries(JSON.parse(ev.dataTransfer.getData(LORE_DRAG)) as string[], name) } catch { /* not ours */ }
    },
  })
  const lit = 'ring-2 ring-primary ring-offset-2 ring-offset-background'
  const more = (key: string, shown: number, total: number) => total > shown && (
    <li className="px-1 pt-1">
      <Button variant="ghost" size="sm" className="text-caption max-md:h-10" onClick={() => onMore(key)}>
        {t('lore.folder.more', { n: Math.min(FOLDER_PAGE, total - shown) })}
      </Button>
    </li>
  )
  return (
    <ul
      className="flex flex-col gap-2"
      data-testid="entry-tree"
      onDragStart={(ev) => { if (ev.dataTransfer.types.includes(LORE_DRAG)) setDragging(true) }}
      onDragEnd={() => { setDragging(false); setOver(null) }}
    >
      {tree.folders.map((f, i) => {
        const open = isOpen(f.name)
        const listId = `${ids}-${i}`
        const lim = limitOf(f.name)
        return (
          <li key={f.name} data-testid="folder" data-folder={f.name} className={cn('rounded-lg', over === f.name && lit)} {...target(f.name)}>
            <FolderHead
              f={f}
              tone={toneOf(f.name)}
              open={open}
              listId={listId}
              searching={searching}
              selecting={selecting}
              checked={f.entries.length > 0 && f.entries.every((e) => selected.includes(e.id))}
              onCheck={(on) => onSelectMany(f.entries, on)}
              onToggle={() => onToggle(f.name)}
              onAddHere={() => onAddHere(f.name)}
              onEnableAll={(on) => onEnableAll(f.name, on)}
              onRename={() => onRename(f.name)}
              onRemove={() => onRemove(f.name)}
            />
            {open && (
              <ul id={listId} className="mt-2 ml-3 flex flex-col gap-2 border-l border-border pl-3 md:ml-4 md:pl-4">
                {f.total === 0 && <li className="px-1 py-2 text-caption text-muted-foreground">{t('lore.folder.emptyHint')}</li>}
                {f.entries.slice(0, lim).map(renderRow)}
                {more(f.name, lim, f.entries.length)}
              </ul>
            )}
          </li>
        )
      })}
      {(tree.loose.length > 0 || (dragging && tree.folders.length > 0)) && (
        <li data-testid="folder-loose" className={cn('rounded-lg', over === '' && lit)} {...target('')}>
          {tree.folders.length > 0 && (
            <p className="flex items-center gap-2 px-1 pb-2 text-caption text-muted-foreground">
              <FolderSimpleDashed className="size-4 shrink-0" aria-hidden="true" />
              {t('lore.folder.none')}
              <span>{tree.loose.length}</span>
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {tree.loose.slice(0, limitOf('')).map(renderRow)}
            {more('', limitOf(''), tree.loose.length)}
          </ul>
        </li>
      )}
    </ul>
  )
}

/** One folder's head: a button that opens and folds it (name, how many entries, their tokens), a checkbox while
 *  several are being selected, and the folder's menu. */
function FolderHead({ f, tone, open, listId, searching, selecting, checked, onCheck, onToggle, onAddHere, onEnableAll, onRename, onRemove }: {
  f: FolderGroup
  tone: FolderTone | undefined
  open: boolean
  listId: string
  searching: boolean
  selecting: boolean
  checked: boolean
  onCheck: (on: boolean) => void
  onToggle: () => void
  onAddHere: () => void
  onEnableAll: (on: boolean) => void
  onRename: () => void
  onRemove: () => void
}) {
  const t = useT()
  const Icon = open ? FolderOpen : FolderSimple
  const allOff = f.on === 0
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border border-border bg-muted/30 pr-1', allOff && f.total > 0 && 'opacity-60')}>
      {selecting && (
        <label className="flex size-10 shrink-0 items-center justify-center pl-1 md:size-8">
          <input
            type="checkbox"
            checked={checked}
            onChange={(ev) => onCheck(ev.target.checked)}
            aria-label={t('lore.folder.select', { name: f.name })}
            className="size-4 accent-primary"
          />
        </label>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-11"
      >
        <CaretRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
        <Icon className={cn('size-5 shrink-0', tone ? TONES[tone].ink : 'text-amber-500')} weight="fill" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium">{f.name}</span>
          <span className="text-caption text-muted-foreground">
            {f.total === 0 ? t('lore.folder.empty') : (
              <>
                {searching && f.entries.length < f.total
                  ? t('lore.folder.matches', { n: f.entries.length, total: f.total })
                  : t('lore.folder.count', { n: f.total })}
                {' · '}{t('lore.header.tokens', { n: formatTokens(f.tokens) })}
                {f.on < f.total && <>{' · '}{t('lore.folder.on', { n: f.on })}</>}
              </>
            )}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('lore.folder.menu', { name: f.name })} title={t('lore.folder.menu', { name: f.name })}>
            <DotsThreeVertical className="size-4" aria-hidden="true" />
          </Button>
        } />
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={onAddHere}><Plus className="size-4" aria-hidden="true" />{t('lore.folder.addHere')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEnableAll(true)}><ToggleRight className="size-4" aria-hidden="true" />{t('lore.folder.enableAll')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEnableAll(false)}><ToggleLeft className="size-4" aria-hidden="true" />{t('lore.folder.disableAll')}</DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}><Pencil className="size-4" aria-hidden="true" />{t('lore.folder.rename')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRemove}><X className="size-4" aria-hidden="true" />{t('lore.folder.remove')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
