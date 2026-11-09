import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaretRight, Copy, DotsThreeVertical, FolderSimple, Trash, Warning, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { TONES } from '@/components/ui/tone'
import { EntryFolds } from '@/components/lore/entry-folds'
import { MoveToFolderDialog } from '@/components/lore/folder-dialogs'
import { KeyChips } from '@/components/lore/key-chips'
import { useT } from '@/hooks/use-t'
import { APPEARANCE_HINT_KEY, APPEARANCE_KEY, APPEARANCES, appearanceOf, statusOf, type Appearance } from '@/lib/lore-entry'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import type { LoreEntry } from '@/lib/types'
import { needsKeys } from '@/lib/lore-filters'
import { folderOf, type FolderInfo } from '@/lib/lore-folders'
import { cn } from '@/lib/utils'

/**
 * The entry panel: on desktop it opens from the left over the book list and the book together, almost the whole width
 * (owner, 2026-11-08: an entry is read, edited and marked up at length, so it needs room). Wide, the content takes the
 * left and the settings the right, each scrolling on its own; narrow, one column. On a phone it is a full page: drawn into the
 * same `host`, so it is as tall as the screen area and scrolls by itself (drawn in place it took the height of the whole
 * book list, so its own scroll never ran and the page behind it moved instead). Without a `host` (a test, a view that
 * gives none) it is drawn in place, over the book pane. The top has the title, the on switch,
 * a "more" menu (copy, duplicate, delete) and Close. Then the three things most people change (content, when it appears,
 * keys), then the five folds. Edits are saved as the person types, through `onChange`, as they always were. Escape closes it.
 */
export function EntryEditor({ entry: e, host, folders, onChange, onDelete, onDuplicate, onCopyToBook, onClose }: {
  entry: LoreEntry
  /** the box to draw the panel into on a desktop (it must be `relative`); null or absent: in place */
  host?: HTMLElement | null
  /** the book's folders, for the Folder row */
  folders: FolderInfo[]
  onChange: (p: Partial<LoreEntry>) => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyToBook: () => void
  onClose: () => void
}) {
  const t = useT()
  const ids = useId()
  const panelRef = useRef<HTMLElement>(null)
  const appearance: Appearance = appearanceOf(e.status)
  const [moving, setMoving] = useState(false)
  const folder = folderOf(e)

  // opening the panel puts the focus in it (no field is focused: phone keyboards)
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }) }, [e.id])

  // Escape closes the panel wherever the focus is (the list too). It is taken in the capture phase, so the book's
  // drawer does not also close; while a menu, select, popover or dialog has the focus, Escape is theirs.
  useEffect(() => {
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return
      const focus = document.activeElement
      if (focus?.closest?.('[data-slot="popover-content"],[data-slot="select-content"],[data-slot="dropdown-menu-content"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"]')) return
      ev.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const panel = (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={t('lore.ed.panel')}
      data-testid="entry-panel"
      className={cn(
        'absolute inset-0 z-20 flex min-h-0 min-w-0 flex-col bg-background outline-none @container motion-reduce:animate-none',
        // desktop: from the left, almost the whole width; the sliver at the right shows there is a page beneath
        host
          ? 'md:inset-y-0 md:right-auto md:left-0 md:w-[calc(100%-2rem)] md:border-r md:border-border md:shadow-2xl md:animate-in md:slide-in-from-left md:duration-150'
          : 'md:inset-y-0 md:left-auto md:right-0 md:w-[min(460px,88%)] md:border-l md:border-border md:shadow-2xl md:animate-in md:slide-in-from-right md:duration-150',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={e.title}
          onChange={(ev) => onChange({ title: ev.target.value })}
          aria-label={t('lore.ed.title')}
          className="h-8 min-w-0 flex-1 text-body font-medium max-md:h-10"
        />
        <Switch tone="cta" checked={e.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={t('lore.entry.enable', { title: e.title })} />
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('lore.ed.menu')} title={t('lore.ed.menu')}>
              <DotsThreeVertical className="size-4" aria-hidden="true" />
            </Button>
          } />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyToBook}>
              <Copy className="size-4" aria-hidden="true" />{t('lore.ed.copyToBook')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" aria-hidden="true" />{t('lore.ed.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash className="size-4" aria-hidden="true" />{t('lore.ed.deleteEntry')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="max-md:size-10" onClick={onClose} aria-label={t('lore.ed.close')} title={t('lore.ed.close')}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      {/* narrow: one column that scrolls; wide (the panel is 48rem or more): the content on the left, the rest on the right, each scrolling by itself */}
      <div className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain @3xl:flex-row @3xl:overflow-hidden">
        <section className="flex flex-col gap-1.5 px-4 pt-4 @3xl:min-h-0 @3xl:min-w-0 @3xl:flex-1 @3xl:pb-4">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${ids}-content`}>{t('lore.ed.content')}</Label>
            <Badge variant="outline" className="text-caption font-normal">{t('lore.header.tokens', { n: formatTokens(estimateTokens(e.content)) })}</Badge>
          </div>
          <Textarea
            id={`${ids}-content`}
            value={e.content}
            rows={6}
            onChange={(ev) => onChange({ content: ev.target.value })}
            className="min-h-32 max-h-[55dvh] overflow-y-auto text-body @3xl:max-h-none @3xl:min-h-0 @3xl:flex-1 @3xl:resize-none @3xl:[field-sizing:fixed] @3xl:text-base @3xl:leading-relaxed"
          />
        </section>

        <div className="flex flex-col gap-5 px-4 py-4 @3xl:w-[22rem] @3xl:shrink-0 @3xl:overflow-y-auto @3xl:overscroll-contain @3xl:border-l @3xl:border-border @3xl:pt-4">

        <section className="flex flex-col gap-1.5">
          <span id={`${ids}-appears`} className="text-body font-medium">{t('lore.ed.appears')}</span>
          <Segmented
            label={t('lore.ed.appears')}
            value={appearance}
            options={APPEARANCES.map((a) => ({ id: a, label: t(APPEARANCE_KEY[a]), className: 'flex-1 justify-center' }))}
            onChange={(a) => onChange({ status: statusOf(a) })}
            className="flex w-full"
          />
          <p className="text-caption text-muted-foreground">{t(APPEARANCE_HINT_KEY[appearance])}</p>
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${ids}-keys`}>{t('lore.ed.keys')}</Label>
            <label className="flex min-h-10 items-center gap-2 text-caption text-muted-foreground md:min-h-8">
              <Switch tone="cta" checked={e.keysRegex} onCheckedChange={(v) => onChange({ keysRegex: v })} aria-label={t('lore.ed.regex')} />
              {t('lore.ed.regex')}
            </label>
          </div>
          <KeyChips
            id={`${ids}-keys`}
            keys={e.keys}
            onChange={(keys) => onChange({ keys })}
            label={t('lore.ed.keys')}
            placeholder={t('lore.ed.keysPlaceholder')}
          />
          <p className="text-caption text-muted-foreground">{t('lore.ed.keysHint')}</p>
          {needsKeys(e) && (
            <p className={`flex items-center gap-1 text-caption ${TONES.amber.ink}`}>
              <Warning className="size-3.5 shrink-0" aria-hidden="true" />
              {t('lore.ed.noKeysWarn')}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <span id={`${ids}-folder`} className="text-body font-medium">{t('lore.folder.label')}</span>
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 max-md:h-10"
            aria-labelledby={`${ids}-folder`}
            aria-haspopup="dialog"
            data-testid="entry-folder"
            onClick={() => setMoving(true)}
          >
            <FolderSimple className="size-4 shrink-0 text-muted-foreground" weight={folder ? 'fill' : 'regular'} aria-hidden="true" />
            <span className={`min-w-0 flex-1 truncate text-left ${folder ? '' : 'text-muted-foreground'}`}>{folder || t('lore.folder.none')}</span>
            <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
          <p className="text-caption text-muted-foreground">{t('lore.folder.hint')}</p>
        </section>

        <EntryFolds entry={e} onChange={onChange} />

        <p className="text-caption text-muted-foreground">{t('lore.ed.saved')}</p>
        </div>
      </div>
      <MoveToFolderDialog
        open={moving}
        onOpenChange={setMoving}
        title={t('lore.folder.moveOne', { title: e.title })}
        folders={folders}
        current={folder}
        onPick={(name) => onChange({ folder: name || undefined })}
      />
    </aside>
  )
  return host ? createPortal(panel, host) : panel
}

