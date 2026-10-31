import { useState, type DragEvent, type ReactNode } from 'react'
import { DownloadSimple, Folder as FolderIcon, Funnel, Plus, Tag as TagIcon, Trash, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { TagRow } from '@/components/tags/tag-row'
import { useT } from '@/hooks/use-t'
import { NO_FOLDER } from '@/lib/persona-list'
import type { Tag } from '@/lib/types'
import { cn } from '@/lib/utils'

/** The persona ids a dragged card carries (a drop on a folder chip reads them). */
export const DRAG_TYPE = 'application/x-persona-ids'

export interface TagChipData { name: string; tag: Tag | undefined }

/** One tag as a filter chip: coloured by the tag manager, neutral for a tag only used on a persona. */
export function TagFilterChip({ name, tag, count, active, big, onToggle }: {
  name: string; tag: Tag | undefined; count: number; active: boolean; big?: boolean; onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      style={tag ? { backgroundColor: tag.color, color: tag.textColor, borderColor: 'transparent' } : undefined}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors',
        big && 'h-8 px-3 text-xs',
        active ? 'font-medium' : 'hover:text-foreground',
        !tag && (active ? 'border-transparent bg-accent text-accent-foreground' : 'border-border text-muted-foreground'),
        tag && !active && 'opacity-75 hover:opacity-100',
        tag && active && 'ring-2 ring-primary',
      )}
    >
      {name} <span className="opacity-60">{count}</span>
    </button>
  )
}

/** A small "name it" dialog for a new folder or tag (never a native prompt). */
export function NameDialog({ open, onOpenChange, title, label, confirm, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; label: string; confirm: string; onSubmit: (name: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const go = () => {
    const v = name.trim()
    if (!v) return
    onSubmit(v)
    setName('')
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setName(''); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); go() }
          }}
          placeholder={label}
          aria-label={label}
          className="h-10 md:h-8"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('personas.cancel')}</Button>
          <Button onClick={go} disabled={!name.trim()}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Folders as chips (desktop): All, each folder, No folder, + Folder. A card dropped on a folder chip joins that folder. */
export function FolderStrip({ folders, folder, counts, total, noFolder, onPick, onAdd, onDropIds }: {
  folders: Tag[]
  folder: string | null
  counts: Map<string, number>
  total: number
  noFolder: number
  onPick: (f: string | null) => void
  onAdd: () => void
  onDropIds: (ids: string[], folder: string) => void
}) {
  const t = useT()
  const [over, setOver] = useState<string | null>(null)
  const chip = (key: string, value: string | null, label: ReactNode, count: number, icon?: ReactNode, drop?: string) => {
    const on = folder === value
    const dnd = drop === undefined ? {} : {
      onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(drop) } },
      onDragLeave: () => setOver((o) => (o === drop ? null : o)),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(null)
        try { onDropIds(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[], drop) } catch { /* not ours */ }
      },
    }
    return (
      <button
        key={key}
        type="button"
        aria-pressed={on}
        onClick={() => onPick(value)}
        {...dnd}
        data-testid={value === null ? 'folder-all' : value === NO_FOLDER ? 'folder-none' : 'folder-chip'}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors',
          on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
          drop !== undefined && over === drop && 'border-primary bg-primary/20 ring-2 ring-primary',
        )}
      >
        {icon}{label}<span className="tabular-nums opacity-70">{count}</span>
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2" role="group" aria-label={t('personas.folders.aria')} data-testid="persona-folder-strip">
      <span className="mr-1 text-xs text-muted-foreground">{t('personas.folders.label')}</span>
      {chip('all', null, t('personas.folders.all'), total)}
      {folders.map((f) => chip(f.id, f.name, f.name, counts.get(f.name) ?? 0, <FolderIcon className="size-3" style={{ color: f.color }} aria-hidden="true" />, f.name))}
      {chip('none', NO_FOLDER, t('personas.folders.none'), noFolder)}
      <button type="button" onClick={onAdd} className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground hover:text-foreground" data-testid="persona-new-folder">
        <Plus className="size-3" aria-hidden="true" />{t('personas.folders.add')}
      </button>
      <span className="ml-auto text-xs text-muted-foreground max-lg:hidden">{t('personas.folders.hint')}</span>
    </div>
  )
}

/** The folder list for the phone's Folders sheet. */
export function FolderList({ folders, folder, counts, total, noFolder, onPick, onAdd }: {
  folders: Tag[]; folder: string | null; counts: Map<string, number>; total: number; noFolder: number
  onPick: (f: string | null) => void; onAdd: () => void
}) {
  const t = useT()
  const row = (key: string, value: string | null, label: string, count: number, icon?: ReactNode) => (
    <button
      key={key}
      type="button"
      aria-pressed={folder === value}
      onClick={() => onPick(value)}
      className={cn('flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm', folder === value ? 'border-primary bg-primary/10 text-primary' : 'border-border')}
    >
      {icon}<span className="min-w-0 flex-1 truncate">{label}</span><span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-4">
      {row('all', null, t('personas.folders.all'), total)}
      {folders.map((f) => row(f.id, f.name, f.name, counts.get(f.name) ?? 0, <FolderIcon className="size-4 shrink-0" style={{ color: f.color }} aria-hidden="true" />))}
      {row('none', NO_FOLDER, t('personas.folders.none'), noFolder)}
      <Button variant="outline" className="h-11 border-dashed" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />{t('personas.folders.add')}</Button>
    </div>
  )
}

/** The tag filter row (desktop): chips in at most two rows, All tags, Manage. */
export function TagFilterRow({ chips, counts, active, onToggle, onAll, onManage, onAddFolder }: {
  chips: TagChipData[]
  counts: Map<string, number>
  active: string[]
  onToggle: (name: string) => void
  onAll: () => void
  onManage: () => void
  /** shown while the persona section has no folder yet, so the first one can be made */
  onAddFolder?: () => void
}) {
  const t = useT()
  return (
    <div className="flex items-start gap-1.5 border-b border-border px-4 py-1.5">
      <span className="mt-1 mr-1 shrink-0 text-xs text-muted-foreground">{t('personas.tags.label')}</span>
      <TagRow chips={chips} counts={counts} render={(name, tag) => (
        <TagFilterChip key={name} name={name} tag={tag} count={counts.get(name) ?? 0} active={active.includes(name)} onToggle={() => onToggle(name)} />
      )} />
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {onAddFolder && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onAddFolder} data-testid="persona-new-folder">
            <Plus className="size-3.5" aria-hidden="true" />{t('personas.folders.add')}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onAll} data-testid="persona-all-tags">
          <Funnel className="size-3.5" aria-hidden="true" />{t('personas.allTags', { n: chips.length })}
          {active.length > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{active.length}</Badge>}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={onManage}>
          <TagIcon className="size-3.5" aria-hidden="true" />{t('personas.tags.manage')}
        </Button>
      </div>
    </div>
  )
}

/** Every tag in use, searchable and sortable: the body of the All tags dialog (desktop) and sheet (phone). */
export function AllTagsPanel({ chips, counts, active, onToggle, onClear, onManage, onDone }: {
  chips: TagChipData[]; counts: Map<string, number>; active: string[]
  onToggle: (name: string) => void; onClear: () => void; onManage: () => void; onDone: () => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [by, setBy] = useState<'count' | 'az'>('count')
  const needle = q.trim().toLowerCase()
  const list = chips.filter(({ name }) => !needle || name.toLowerCase().includes(needle))
  list.sort(by === 'az'
    ? (a, b) => a.name.localeCompare(b.name)
    : (a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || a.name.localeCompare(b.name))
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4 md:px-0 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('characters.tagsFind')} className="h-10 min-w-40 flex-1 text-sm md:h-8" aria-label={t('characters.tagsFind')} />
        <div role="group" aria-label={t('characters.tagsTitle')} className="flex gap-1">
          {(['count', 'az'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)} className={cn('h-10 rounded-md border px-2.5 text-xs md:h-8', by === k ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-accent/60')}>
              {t(k === 'count' ? 'characters.tagsByCount' : 'characters.tagsByName')}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" data-testid="persona-all-tags-list">
        {list.map(({ name, tag }) => (
          <TagFilterChip key={name} name={name} tag={tag} count={counts.get(name) ?? 0} active={active.includes(name)} big onToggle={() => onToggle(name)} />
        ))}
        {chips.length === 0 && <span className="text-xs text-muted-foreground">{t('personas.tagsNone')}</span>}
        {chips.length > 0 && list.length === 0 && <span className="text-xs text-muted-foreground">{t('characters.tagsNoMatch')}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-10 md:h-8" onClick={onManage}><TagIcon className="size-4" aria-hidden="true" />{t('characters.tagsManage')}</Button>
        {active.length > 0 && <Button variant="ghost" className="h-10 md:h-8" onClick={onClear}>{t('characters.tagsClear')}</Button>}
        <Button className="ml-auto h-10 md:h-8" onClick={onDone}>{t('characters.tagsDone')}</Button>
      </div>
    </div>
  )
}

/** Filters that are on, each with its own way out (phone: the folder and tag rows are behind sheets). */
export function ActiveFilters({ folder, folders, tags, onFolder, onTag, onClear }: {
  folder: string | null; folders: Tag[]; tags: string[]
  onFolder: (f: string | null) => void; onTag: (name: string) => void; onClear: () => void
}) {
  const t = useT()
  const chip = (key: string, label: string, off: () => void, icon?: ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={off}
      className="flex h-9 items-center gap-1 rounded-full bg-accent px-3 text-xs text-accent-foreground"
      aria-label={t('personas.removeFilter', { name: label })}
    >
      {icon}{label}<X className="size-3" aria-hidden="true" />
    </button>
  )
  if (folder === null && tags.length === 0) return null
  const folderName = folder === NO_FOLDER ? t('personas.folders.none') : folder
  const color = folders.find((f) => f.name === folder)?.color
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {folder !== null && folderName && chip('folder', folderName, () => onFolder(null), <FolderIcon className="size-3" style={color ? { color } : undefined} aria-hidden="true" />)}
      {tags.map((name) => chip(`tag-${name}`, name, () => onTag(name)))}
      <Button variant="ghost" className="h-9 px-2 text-xs" onClick={onClear}>{t('characters.tagsClear')}</Button>
    </div>
  )
}

/** What the select bar can do with the ticked personas. */
export interface SelectActions {
  count: number
  allTicked: boolean
  folders: Tag[]
  tagNames: string[]
  onToggleAll: () => void
  onMove: (folder: string | null) => void
  onNewFolder: () => void
  onTag: (name: string) => void
  onNewTag: () => void
  onExport: () => void
  onDelete: () => void
  onCancel: () => void
}

/** The bar of select mode: Move to folder, Add tag, Export, Delete, Cancel. Desktop: a row under the filters;
 *  phone: the bottom bar, every target at least 44 px. */
export function SelectBar({ a, compact }: { a: SelectActions; compact?: boolean }) {
  const t = useT()
  const none = a.count === 0
  const btn = (extra?: string) => cn(compact ? 'h-12 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[11px]' : 'h-8', extra)
  const moveMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className={btn()} disabled={none}><FolderIcon className="size-4" aria-hidden="true" />{t(compact ? 'personas.moveShort' : 'personas.moveTo')}</Button>} />
      <DropdownMenuContent align="end">
        {a.folders.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => a.onMove(f.name)}>
            <FolderIcon className="size-4" style={{ color: f.color }} aria-hidden="true" />{f.name}
          </DropdownMenuItem>
        ))}
        {a.folders.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => a.onMove(null)}>{t('personas.folders.none')}</DropdownMenuItem>
        <DropdownMenuItem onClick={a.onNewFolder}><Plus className="size-4" aria-hidden="true" />{t('personas.folders.new')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const tagMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className={btn()} disabled={none}><TagIcon className="size-4" aria-hidden="true" />{t(compact ? 'personas.tagShort' : 'personas.addTag')}</Button>} />
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {a.tagNames.map((name) => <DropdownMenuItem key={name} onClick={() => a.onTag(name)}>{name}</DropdownMenuItem>)}
        {a.tagNames.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={a.onNewTag}><Plus className="size-4" aria-hidden="true" />{t('personas.tag.new')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const exportBtn = (
    <Button variant="outline" className={btn()} disabled={none} onClick={a.onExport}><DownloadSimple className="size-4" aria-hidden="true" />{t('personas.export')}</Button>
  )
  const deleteBtn = (
    <Button variant="destructive" className={btn()} disabled={none} onClick={a.onDelete}><Trash className="size-4" aria-hidden="true" />{t('personas.delete')}</Button>
  )
  const cancel = <Button variant="ghost" className={btn()} onClick={a.onCancel}>{compact ? <X className="size-4" aria-hidden="true" /> : null}{t('personas.cancel')}</Button>
  if (compact) {
    return (
      <div className="shrink-0 border-t border-border bg-card" data-testid="persona-select-bar">
        <div className="flex items-center justify-between gap-2 px-4 pt-2 text-sm">
          <span className="font-medium">{t('personas.selected', { n: a.count })}</span>
          <Button variant="ghost" className="h-11 px-2 text-xs" onClick={a.onToggleAll}>{t(a.allTicked ? 'personas.selectNone' : 'personas.selectAll')}</Button>
        </div>
        <div className="flex gap-1 px-2 pb-2">{moveMenu}{tagMenu}{exportBtn}{deleteBtn}{cancel}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/10 px-4 py-2 text-sm" data-testid="persona-select-bar">
      <span className="font-semibold">{t('personas.selected', { n: a.count })}</span>
      <Button variant="ghost" size="sm" className="h-8" onClick={a.onToggleAll}>{t(a.allTicked ? 'personas.selectNone' : 'personas.selectAll')}</Button>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{moveMenu}{tagMenu}{exportBtn}{deleteBtn}{cancel}</div>
    </div>
  )
}
