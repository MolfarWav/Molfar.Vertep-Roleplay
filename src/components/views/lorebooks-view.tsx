
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText, Plus, Trash, Copy, MagnifyingGlass, Globe, Flask, Pulse, CaretDown, CaretRight, Funnel,
  PushPin, Snowflake, ClockCountdown, Users, GearSix, ArrowSquareOut,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { estimateTokens, formatTokens, uid } from '@/lib/tokens'
import { importLorebookFiles } from '@/lib/engine'
import { cn } from '@/lib/utils'
import type { Lorebook, LoreEntry } from '@/lib/types'
import { MasterDetail } from '@/components/shell/master-detail'
import { LoreStatusIcon } from '@/components/lore-status-icon'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { bookUsage } from '@/lib/lore-usage'
import { BookSettings } from '@/components/lore/book-settings'
import { EntryEditor } from '@/components/lore/entry-editor'
import { KeywordTest } from '@/components/lore/keyword-test'
import { WiStatusView } from '@/components/lore/wi-status-view'
import { POSITION_SHORT_KEY, STATUS_KEY, canonicalPosition } from '@/components/lore/lore-labels'

export function LorebooksView() {
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const characters = useApp((s) => s.characters)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const addLorebook = useApp((s) => s.addLorebook)
  const duplicateLorebook = useApp((s) => s.duplicateLorebook)
  const deleteLorebook = useApp((s) => s.deleteLorebook)
  const focusLorebookId = useApp((s) => s.focusLorebookId)
  const [selectedId, setSelectedId] = useState(lorebooks[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const [activeViewerOpen, setActiveViewerOpen] = useState(false)
  const [bookQuery, setBookQuery] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const refreshLorebooks = useApp((s) => s.refreshLorebooks)
  const hydrate = useApp((s) => s.hydrate)
  const book = lorebooks.find((b) => b.id === selectedId) ?? lorebooks[0]

  /** Import: native studio lorebook JSON (PUT as-is) or world-info
   *  JSON (normalized server-side by the import plugin). World files
   *  carry no book name: the FILE name is the book's name, so it
   *  rides along as `name`. */
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const ids = await importLorebookFiles(Array.from(files), (m) => toast.error(m))
    const added = ids.length
    const lastId = ids.at(-1) ?? null
    if (added) {
      // one list refresh: the WS look_changed echo does the full hydrate
      await (lastId ? refreshLorebooks() : hydrate())
      toast.success(`Imported ${added} book${added > 1 ? 's' : ''}`)
      if (lastId) select(lastId)
      else { const last = useApp.getState().lorebooks.at(-1); if (last) select(last.id) }
    }
  }

  const select = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  // "Open" on a card's book (character editor) lands here with that book chosen
  useEffect(() => {
    if (!focusLorebookId) return
    setBookQuery('')
    select(focusLorebookId)
    useApp.setState({ focusLorebookId: null })
  }, [focusLorebookId])

  // lorebooks grow for years: the sidebar pages through them
  const BOOK_PAGE = 100
  const [bookPage, setBookPage] = useState(0)
  const bq = bookQuery.trim().toLowerCase()
  const shownBooks = bq ? lorebooks.filter((b) => b.name.toLowerCase().includes(bq)) : lorebooks
  const safeBookPage = clampPage(bookPage, shownBooks.length, BOOK_PAGE)
  const pagedBooks = shownBooks.slice(safeBookPage * BOOK_PAGE, (safeBookPage + 1) * BOOK_PAGE)

  const usageLabel = (b: Lorebook): { text: string; muted: boolean } => {
    const { owners, users } = bookUsage(characters, b.id)
    if (users.length === 0) return { text: t('lore.use.none'), muted: true }
    if (owners.length === 1 && users.length === 1) return { text: t('lore.use.own', { name: owners[0]!.name }), muted: false }
    return { text: t(users.length === 1 ? 'lore.use.cardsOne' : 'lore.use.cards', { n: users.length }), muted: false }
  }

  return (
    <SectionPage section="lorebooks" count={lorebooks.length} hideOnPhone={detailOpen && !!book}>
    <>
    <MasterDetail
      detailOpen={detailOpen && !!book}
      onBack={() => setDetailOpen(false)}
      detailTitle={book?.name}
      masterWidth="w-60"
      master={
        <aside className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <PaneTitle section="lorebooks" icon={<BookOpenText className="size-4 text-primary" aria-hidden="true" />} />
          <Button variant="ghost" size="sm" className="ml-auto size-7 p-0" onClick={() => select(addLorebook())} aria-label="New lorebook" title="New lorebook">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {lorebooks.length > 8 && (
          <div className="relative border-b border-border px-2 py-1.5">
            <MagnifyingGlass className="absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={bookQuery} onChange={(e) => { setBookQuery(e.target.value); setBookPage(0) }} placeholder={t('lore.books.search')} className="h-7 pl-7 text-xs" aria-label={t('lore.books.search')} />
          </div>
        )}
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-1.5">
            {pagedBooks.map((b) => {
              const use = usageLabel(b)
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => select(b.id)}
                    className={cn('flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm', b.id === book?.id ? 'bg-accent' : 'hover:bg-accent/50')}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="min-w-0 truncate">{b.name}</span>
                      {b.globalActive && (
                        <span role="img" aria-label={t('lore.global.tip')} title={t('lore.global.tip')} className="shrink-0">
                          <Globe className="size-3 text-primary" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground">
                      <span>{t('lore.books.entries', { n: b.entries.length })}</span>
                      <span aria-hidden="true">·</span>
                      <span className={use.muted ? 'opacity-70' : undefined}>{use.text}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {shownBooks.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">{t('lore.books.noMatch')}</li>}
          </ul>
          <Pager total={shownBooks.length} page={safeBookPage} pageSize={BOOK_PAGE} onPage={setBookPage} />
        </ScrollArea>
        <div className="flex gap-1 border-t border-border p-1.5">
          <input ref={importInput} type="file" accept="application/json" multiple className="hidden" onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }} />
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => importInput.current?.click()}>Import</Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => setActiveViewerOpen(true)}>
            <Pulse className="size-3.5" aria-hidden="true" />{t('lore.active')}
          </Button>
        </div>
      </aside>
      }
      detail={
        book ? (
          <BookEditor
            key={book.id}
            book={book}
            onUpdate={(patch) => updateLorebook(book.id, patch)}
            onDelete={() => void confirm({
              title: `Delete ${book.name}?`,
              description: 'The lorebook file is removed from disk, every entry in it goes too.',
            }).then((yes) => {
              if (!yes) return
              deleteLorebook(book.id); setSelectedId(lorebooks.find((b) => b.id !== book.id)?.id ?? ""); setDetailOpen(false)
            })}
            onDuplicate={() => { setSelectedId(duplicateLorebook(book.id)); toast.success('Lorebook duplicated') }}
            onTest={() => setTestOpen(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No lorebooks</div>
        )
      }
    />

      <KeywordTest open={testOpen} onOpenChange={setTestOpen} book={book ?? null} />
      <ActiveEntriesViewer open={activeViewerOpen} onOpenChange={setActiveViewerOpen} />
      {confirmDialog}
    </>
    </SectionPage>
  )
}

const FILTERS = ['all', 'on', 'off', 'constant', 'keyed', 'vector', 'nokeys'] as const
type EntryFilter = (typeof FILTERS)[number]

const matchesFilter = (e: LoreEntry, f: EntryFilter): boolean => {
  switch (f) {
    case 'on': return e.enabled
    case 'off': return !e.enabled
    case 'constant': return e.status === 'constant'
    case 'keyed': return e.status === 'normal'
    case 'vector': return e.status === 'vectorized'
    // keyed entries with no keys never fire
    case 'nokeys': return e.status === 'normal' && e.keys.length === 0
    default: return true
  }
}

function newEntry(): LoreEntry {
  return { id: uid('we'), title: 'New entry', memo: '', keys: [], keysRegex: false, secondaryKeys: [], logic: 'AND_ANY', status: 'normal', content: '', position: 'after_char', depth: 4, role: 'system', order: 100, probability: 100, useProbability: false, group: '', groupWeight: 100, groupPrioritize: false, sticky: 0, cooldown: 0, delay: 0, enabled: true, characterFilter: [], characterFilterExclude: false, tagFilter: [], triggerFilters: [], nonRecursable: false, preventFurtherRecursion: false, delayUntilRecursion: false, ignoreBudget: false, scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null, wordFormsOverride: null, groupScoringOverride: null, automationId: '', matchSources: { description: false, personality: false, scenario: false, persona: false } }
}

/** A copy that is a new entry of its own: no engine uid carried over. */
const asCopy = (e: LoreEntry, extra?: Partial<LoreEntry>): LoreEntry => ({ ...e, ...extra, id: uid('entry'), uid: undefined })

function BookEditor({ book, onUpdate, onDelete, onDuplicate, onTest }: {
  book: Lorebook; onUpdate: (p: Partial<Lorebook>) => void; onDelete: () => void; onDuplicate: () => void; onTest: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('order')
  const [filter, setFilter] = useState<EntryFilter>('all')
  const [openIds, setOpenIds] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [copyEntries, setCopyEntries] = useState<LoreEntry[] | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const allBooks = useApp((s) => s.lorebooks)
  const characters = useApp((s) => s.characters)
  const openCharacterOnTab = useApp((s) => s.openCharacterOnTab)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const users = bookUsage(characters, book.id).users

  const counts = useMemo(() => {
    const out = {} as Record<EntryFilter, number>
    for (const f of FILTERS) out[f] = book.entries.filter((e) => matchesFilter(e, f)).length
    return out
  }, [book.entries])

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = book.entries.filter((e) =>
      matchesFilter(e, filter) &&
      (!q || e.title.toLowerCase().includes(q) || e.keys.some((k) => k.toLowerCase().includes(q)) || e.content.toLowerCase().includes(q)))
    switch (sort) {
      case 'title': list = [...list].sort((a, b) => a.title.localeCompare(b.title)); break
      case 'tokens': list = [...list].sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content)); break
      case 'priority': list = [...list].sort((a, b) => b.order - a.order); break
      case 'trigger': list = [...list].sort((a, b) => b.probability - a.probability); break
    }
    return list
  }, [book.entries, query, sort, filter])

  const ENTRY_PAGE = 50
  const [entryPage, setEntryPage] = useState(0)
  const safeEntryPage = clampPage(entryPage, entries.length, ENTRY_PAGE)
  const pagedEntries = entries.slice(safeEntryPage * ENTRY_PAGE, safeEntryPage * ENTRY_PAGE + ENTRY_PAGE)

  const upEntry = (id: string, patch: Partial<LoreEntry>) =>
    onUpdate({ entries: book.entries.map((e) => e.id === id ? { ...e, ...patch } : e) })
  const bulk = (patch: Partial<LoreEntry>) => onUpdate({ entries: book.entries.map((e) => selected.includes(e.id) ? { ...e, ...patch } : e) })

  const copyTo = (target: Lorebook) => {
    if (!copyEntries) return
    updateLorebook(target.id, { entries: [...target.entries, ...copyEntries.map((e) => asCopy(e))] })
    toast.success(t('lore.copied', { n: copyEntries.length, name: target.name }))
    setCopyEntries(null)
  }

  const bulkDelete = async () => {
    const yes = await confirm({
      title: t('lore.bulk.deleteTitle', { n: selected.length }),
      description: t('lore.bulk.deleteBody'),
    })
    if (!yes) return
    onUpdate({ entries: book.entries.filter((e) => !selected.includes(e.id)) })
    setSelected([])
    toast.success('Deleted')
  }

  const sortLabels: Record<string, string> = { order: t('lore.sort.order'), title: t('lore.sort.title'), tokens: t('lore.sort.tokens'), priority: t('lore.sort.priority'), trigger: t('lore.sort.trigger') }
  const filterLabels: Record<EntryFilter, string> = {
    all: t('lore.filter.all'), on: t('lore.filter.on'), off: t('lore.filter.off'), constant: t('lore.filter.constant'),
    keyed: t('lore.filter.keyed'), vector: t('lore.filter.vector'), nokeys: t('lore.filter.nokeys'),
  }

  return (
    // @container: the detail pane spans from a phone page to a narrow drawer
    // to a full page; the grids below must follow the PANE's width, not the
    // viewport, or fixed-width label+input rows crush into each other
    <div className="flex min-h-0 min-w-0 flex-1 flex-col @container">
      {/* header + settings + entries toolbar scroll WITH the entries: the
          toolbar pinning at the top was eating the viewport on mobile */}
      <ScrollArea className="min-h-0 flex-1">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Input value={book.name} onChange={(e) => onUpdate({ name: e.target.value })} className="h-8 w-full text-sm font-medium md:w-52" aria-label="Book name" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t('lore.global.tip')}>
          <Switch checked={book.globalActive} onCheckedChange={(v) => onUpdate({ globalActive: v })} aria-label={t('lore.global.label')} />
          {t('lore.global.label')}
        </label>
        <Badge variant="outline" className="text-[10px]">{formatTokens(book.entries.reduce((a, e) => a + estimateTokens(e.content), 0))} tok total</Badge>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" onClick={onTest}>
            <Flask className="size-3.5" aria-hidden="true" />{t('lore.testKeys')}
          </Button>
          <Button variant={showSettings ? 'secondary' : 'outline'} size="sm" className="text-xs" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>
            <GearSix className="size-3.5" aria-hidden="true" />{t('lore.settings')}
          </Button>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" className="text-xs"><Users className="size-3.5" aria-hidden="true" />{t('lore.usedBy')}{users.length > 0 ? ` (${users.length})` : ''}</Button>} />
            <PopoverContent align="end" className="w-72">
              {users.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('lore.usedBy.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {users.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.embeddedLorebookId === book.id && <Badge variant="secondary" className="text-[10px]">{t('lore.usedBy.own')}</Badge>}
                      <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => openCharacterOnTab(c.id, 'lorebook')} aria-label={t('lore.usedBy.openNamed', { name: c.name })}>
                        <ArrowSquareOut className="size-3" aria-hidden="true" />{t('lore.open')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={onDuplicate} aria-label="Duplicate book" title="Duplicate book"><Copy className="size-4" aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} aria-label="Delete book" title="Delete book"><Trash className="size-4" aria-hidden="true" /></Button>
        </div>
      </header>

      {showSettings && <BookSettings book={book} onUpdate={onUpdate} />}

      <div className="flex flex-col gap-1.5 border-b border-border px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lore.entries.search')} className="h-7 pl-8 text-xs" aria-label={t('lore.entries.search')} />
          </div>
          <Select value={sort} onValueChange={(v) => v && setSort(v)}>
            <SelectTrigger className="h-7 w-32 text-xs" aria-label={t('lore.sort.label')}><SelectValue>{(v: string) => `${t('lore.sort.label')}: ${sortLabels[v] ?? v}`}</SelectValue></SelectTrigger>
            <SelectContent>
              {Object.entries(sortLabels).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpenIds(openIds.length ? [] : entries.map((e) => e.id))}>
            {openIds.length ? t('lore.closeAll') : t('lore.openAll')}
          </Button>
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => {
            const e = newEntry()
            onUpdate({ entries: [e, ...book.entries] })
            setFilter('all'); setQuery('')
            setOpenIds((o) => [...o, e.id])
          }}>
            <Plus className="size-3.5" aria-hidden="true" />{t('lore.addEntry')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('lore.filter.label')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => { setFilter(f); setEntryPage(0) }}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px]',
                filter === f ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50',
              )}
            >
              {filterLabels[f]} <span className="opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs" data-testid="bulk-bar">
            <span className="mr-1 font-medium">{t('lore.bulk.selected', { n: selected.length })}</span>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setSelected(pagedEntries.map((e) => e.id))}>{t('lore.bulk.selectAll')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => bulk({ enabled: true })}>{t('lore.bulk.enable')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => bulk({ enabled: false })}>{t('lore.bulk.disable')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => bulk({ status: 'constant' })}>{t('lore.bulk.constant')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => bulk({ status: 'normal' })}>{t('lore.bulk.keyed')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setCopyEntries(book.entries.filter((e) => selected.includes(e.id)))}>{t('lore.bulk.copy')}</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px] text-destructive" onClick={() => void bulkDelete()}>{t('lore.bulk.delete')}</Button>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-[11px]" onClick={() => setSelected([])}>{t('lore.bulk.clear')}</Button>
          </div>
        )}
      </div>

        <ul className="flex flex-col gap-1.5 p-3">
          {pagedEntries.map((e) => {
            const open = openIds.includes(e.id)
            return (
              <li key={e.id} className={cn('rounded-md border border-border', !e.enabled && 'opacity-60')}>
                <EntryRowHead
                  e={e}
                  open={open}
                  checked={selected.includes(e.id)}
                  onCheck={(v) => setSelected((s) => v ? [...s, e.id] : s.filter((x) => x !== e.id))}
                  onToggle={() => setOpenIds((o) => open ? o.filter((x) => x !== e.id) : [...o, e.id])}
                  onEnable={(v) => upEntry(e.id, { enabled: v })}
                />
                <Collapsible open={open}>
                  <CollapsibleContent>
                    <EntryEditor
                      entry={e}
                      onChange={(patch) => upEntry(e.id, patch)}
                      onDelete={() => onUpdate({ entries: book.entries.filter((x) => x.id !== e.id) })}
                      onDuplicate={() => { onUpdate({ entries: [...book.entries, asCopy(e, { title: `${e.title} (copy)` })] }); toast.success('Entry duplicated') }}
                      onCopyToBook={() => setCopyEntries([e])}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            )
          })}
          {entries.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted-foreground">{t('lore.entries.none')}</li>}
        </ul>
        <Pager total={entries.length} page={safeEntryPage} pageSize={ENTRY_PAGE} onPage={setEntryPage} />
      </ScrollArea>
      <Dialog open={!!copyEntries} onOpenChange={(o) => { if (!o) setCopyEntries(null) }}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{copyEntries?.length === 1 ? t('lore.copyOne', { title: copyEntries[0]!.title }) : t('lore.copyMany', { n: copyEntries?.length ?? 0 })}</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {allBooks.filter((b) => b.id !== book.id).map((b) => (
              <li key={b.id}>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => copyTo(b)}>
                  {b.name}
                  <span className="ml-auto text-[11px] text-muted-foreground">{t('lore.books.entries', { n: b.entries.length })}</span>
                </Button>
              </li>
            ))}
            {allBooks.length <= 1 && <p className="text-xs text-muted-foreground">No other lorebooks yet, create one first.</p>}
          </ul>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}

/** The collapsed row: status, title, a few keys, and small badges only for
 *  what is set. Two lines on a phone, nothing cut. */
function EntryRowHead({ e, open, checked, onCheck, onToggle, onEnable }: {
  e: LoreEntry; open: boolean; checked: boolean; onCheck: (v: boolean) => void; onToggle: () => void; onEnable: (v: boolean) => void
}) {
  const t = useT()
  const pos = canonicalPosition(e.position)
  const posLabel = pos === 'at_depth' ? t('lore.posShort.at_depth', { n: e.depth }) : t(POSITION_SHORT_KEY[pos] ?? 'lore.posShort.before_char')
  const hasFilter = e.characterFilter.length > 0 || e.tagFilter.length > 0 || e.triggerFilters.length > 0
  const waits = typeof e.delayUntilRecursion === 'number' ? e.delayUntilRecursion : e.delayUntilRecursion ? 1 : 0
  const timed: { icon: typeof PushPin; n: number; tip: string }[] = [
    ...(e.sticky > 0 ? [{ icon: PushPin, n: e.sticky, tip: t('lore.badge.sticky', { n: e.sticky }) }] : []),
    ...(e.cooldown > 0 ? [{ icon: Snowflake, n: e.cooldown, tip: t('lore.badge.cooldown', { n: e.cooldown }) }] : []),
    ...(e.delay > 0 ? [{ icon: ClockCountdown, n: e.delay, tip: t('lore.badge.delay', { n: e.delay }) }] : []),
  ]
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onCheck(ev.target.checked)}
        aria-label={`Select ${e.title}`}
        className="mt-1.5 size-3.5 shrink-0 accent-primary"
      />
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" aria-expanded={open}>
        <span className="flex w-full min-w-0 items-center gap-2">
          {open ? <CaretDown className="size-3.5 shrink-0" aria-hidden="true" /> : <CaretRight className="size-3.5 shrink-0" aria-hidden="true" />}
          <LoreStatusIcon status={e.status} />
          <span className="sr-only">{t(STATUS_KEY[e.status])}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatTokens(estimateTokens(e.content))} tok</span>
        </span>
        <span className="flex w-full flex-wrap items-center gap-1 pl-6">
          {e.keys.slice(0, 3).map((k) => (
            <Badge key={k} variant="secondary" className="min-w-0 max-w-32 text-[10px]"><span className="truncate">{k}</span></Badge>
          ))}
          {e.keys.length > 3 && <span className="text-[10px] text-muted-foreground">+{e.keys.length - 3}</span>}
          {e.status === 'normal' && e.keys.length === 0 && <span className="text-[10px] text-destructive">{t('lore.badge.noKeys')}</span>}
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground" title={t('lore.badge.position')}>{posLabel}</Badge>
          {e.probability < 100 && <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground" title={t('lore.ed.trigger')}>{e.probability}%</Badge>}
          {timed.map(({ icon: Icon, n, tip }) => (
            <span key={tip} className="flex items-center gap-0.5 text-[10px] text-muted-foreground" title={tip} aria-label={tip}>
              <Icon className="size-3" aria-hidden="true" />{n}
            </span>
          ))}
          {waits > 0 && (
            <span className="text-[10px] text-muted-foreground" title={t('lore.badge.waits', { n: waits })} aria-label={t('lore.badge.waits', { n: waits })}>↻{waits}</span>
          )}
          {e.group && <Badge variant="outline" className="max-w-28 text-[10px] font-normal text-muted-foreground" title={t('lore.badge.group', { group: e.group })}><span className="truncate">{e.group}</span></Badge>}
          {hasFilter && (
            <span className="text-muted-foreground" title={t('lore.badge.filters')} aria-label={t('lore.badge.filters')}>
              <Funnel className="size-3" aria-hidden="true" />
            </span>
          )}
        </span>
      </button>
      <Switch className="mt-0.5" checked={e.enabled} onCheckedChange={onEnable} aria-label={`Enable ${e.title}`} />
    </div>
  )
}

/** REAL world-info activation for the active chat: the same scan a
 *  generation runs. Numbers and reasons come from the engine, not a mock. */
function ActiveEntriesViewer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const chat = useApp((s) => (s.activeChatId ? s.chats.find((c) => c.id === s.activeChatId) : null))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('lore.status.title', { name: chat?.title ?? '' })}</DialogTitle></DialogHeader>
        <div className="max-h-[65dvh] overflow-y-auto overscroll-contain">
          <WiStatusView chatId={chat?.id ?? null} active={open} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
