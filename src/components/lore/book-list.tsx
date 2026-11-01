import { useMemo, useRef } from 'react'
import { BookOpenText, CaretRight, DotsThreeVertical, DownloadSimple, Globe, MagnifyingGlass, Plus, Pulse, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pager, clampPage } from '@/components/ui/pager'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PaneTitle } from '@/components/shell/section-page'
import { FilterChip } from '@/components/lore/filter-chip'
import { KIND_ICON } from '@/components/lore/lore-kind'
import { entriesKey } from '@/components/lore/lore-labels'
import { useT } from '@/hooks/use-t'
import { bookEntryCount } from '@/lib/engine'
import { BOOK_FILTERS, bookFilterCounts, matchesBookFilter, type BookFilter } from '@/lib/lore-filters'
import { bookKind, bookUsageLabel } from '@/lib/lore-usage'
import { canAskMolfar } from '@/lib/shell-bridge'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import type { Character, Lorebook } from '@/lib/types'

/**
 * The left list of books (380 px on desktop, the whole screen on a phone): the kind icons, the search, the filter
 * chips with counts, and New (the one filled button), Create with Molfar and Import.
 */
export function BookList({ books, characters, selectedId, query, onQuery, filter, onFilter, page, onPage, pageSize, onSelect, onNew, onImport, onExportOne, onExportAll, exporting, onMolfar, onActiveChats }: {
  books: Lorebook[]
  characters: Character[]
  selectedId: string | null
  query: string
  onQuery: (q: string) => void
  filter: BookFilter
  onFilter: (f: BookFilter) => void
  page: number
  onPage: (p: number) => void
  pageSize: number
  onSelect: (id: string) => void
  onNew: () => void
  onImport: (files: FileList | null) => void | Promise<void>
  /** the open book as a JSON file; null when no book is open */
  onExportOne: (() => void) | null
  /** every book in one zip */
  onExportAll: () => void
  exporting: boolean
  onMolfar: () => void
  onActiveChats: () => void
}) {
  const t = useT()
  const importInput = useRef<HTMLInputElement>(null)
  const counts = useMemo(() => bookFilterCounts(books, characters), [books, characters])
  const q = query.trim().toLowerCase()
  const shown = books.filter((b) => (!q || b.name.toLowerCase().includes(q)) && matchesBookFilter(b, bookKind(characters, b.id), filter))
  const safePage = clampPage(page, shown.length, pageSize)
  const paged = shown.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    <aside data-guide="lore.list" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PaneTitle section="lorebooks" icon={<BookOpenText className="size-4 text-primary" aria-hidden="true" />} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="max-md:size-10" onClick={() => importInput.current?.click()} aria-label={t('lore.import')} title={t('lore.import')}>
            <DownloadSimple className="size-4" aria-hidden="true" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="max-md:size-10" disabled={exporting || books.length === 0} aria-label={t('lore.exportMenu')} title={t('lore.exportMenu')} data-testid="lore-export">
                <UploadSimple className="size-4" aria-hidden="true" />
              </Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!onExportOne} onClick={() => onExportOne?.()}>
                <span className="flex max-w-64 flex-col">
                  {t('lore.export.one')}
                  {!onExportOne && <span className="text-caption text-muted-foreground">{t('lore.export.pick')}</span>}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportAll}>{t('lore.export.all', { n: books.length })}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('lore.header.more')} title={t('lore.header.more')}>
                <DotsThreeVertical className="size-4" aria-hidden="true" />
              </Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onActiveChats}>
                <Pulse className="mt-0.5 size-4 self-start" aria-hidden="true" />
                <span className="flex max-w-64 flex-col">
                  {t('lore.active.menu')}
                  <span className="text-caption text-muted-foreground">{t('lore.active.info')}</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <Button data-guide="lore.new" variant="default" className="w-full max-md:h-10" onClick={onNew}>
          <Plus className="size-4" aria-hidden="true" />{t('lore.newBook')}
        </Button>
        {canAskMolfar() && (
          <Button variant="tonal" className="w-full max-md:h-10" onClick={onMolfar} title={t('lore.molfar.tip')} aria-label={t('lore.molfar.tip')}>
            <Sparkle className="size-4" aria-hidden="true" />{t('lore.molfar')}
          </Button>
        )}
        <div className="relative">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('lore.books.search')} className="h-8 pl-8 text-caption max-md:h-10" aria-label={t('lore.books.search')} />
        </div>
        <div role="group" aria-label={t('lore.bookFilter.label')} className="flex flex-wrap gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1">
          {BOOK_FILTERS.map((f) => {
            const meta = f === 'all' ? null : KIND_ICON[f]
            return (
              <FilterChip
                key={f}
                pressed={filter === f}
                count={counts[f]}
                onClick={() => onFilter(f)}
                icon={meta ? <meta.icon className={cn('size-3.5 shrink-0', meta.cls)} aria-hidden="true" /> : <BookOpenText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              >
                {t(`lore.bookFilter.${f}` as MsgKey)}
              </FilterChip>
            )
          })}
        </div>
      </div>
      <input ref={importInput} type="file" accept="application/json" multiple className="hidden" onChange={(e) => { void onImport(e.target.files); e.target.value = '' }} />
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col p-1.5">
          {paged.map((b) => {
            const use = bookUsageLabel(characters, b.id)
            const kind = KIND_ICON[bookKind(characters, b.id)]
            const entries = bookEntryCount(b)
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onSelect(b.id)}
                  aria-current={b.id === selectedId ? 'true' : undefined}
                  className={cn('relative flex min-h-12 w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left max-md:pr-8', b.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50')}
                >
                  <kind.icon className={cn('mt-0.5 size-4 shrink-0', kind.cls)} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-start gap-1.5 text-body font-medium">
                      <span className="line-clamp-2 min-w-0 flex-1 break-words">{b.name}</span>
                      {b.globalActive && (
                        <span role="img" aria-label={t('lore.global.tip')} title={t('lore.global.tip')} className="mt-0.5 shrink-0">
                          <Globe className={cn('size-3.5', KIND_ICON.global.cls)} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-wrap gap-x-1.5 text-caption text-muted-foreground">
                      <span className="shrink-0">{t(entriesKey(entries), { n: entries })}</span>
                      <span aria-hidden="true">·</span>
                      <span className={cn('min-w-0', use.muted && 'opacity-70')}>{t(use.key, use.vars)}</span>
                    </span>
                  </span>
                  <CaretRight className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:hidden" aria-hidden="true" />
                </button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="px-2 py-3 text-caption text-muted-foreground">{t('lore.books.noMatch')}</li>}
        </ul>
        <Pager total={shown.length} page={safePage} pageSize={pageSize} onPage={onPage} />
      </ScrollArea>
    </aside>
  )
}
