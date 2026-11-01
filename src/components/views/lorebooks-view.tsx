
import { useEffect, useMemo, useState } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pager, clampPage } from '@/components/ui/pager'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { useApp } from '@/lib/store'
import { useGuidePlace } from '@/components/guide/place'
import { GUIDE_DETAIL_EVENT } from '@/components/guide/events'
import { SectionPage } from '@/components/shell/section-page'
import { MasterDetail } from '@/components/shell/master-detail'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { estimateTokens, uid } from '@/lib/tokens'
import { bookEntryCount, importLorebookFiles } from '@/lib/engine'
import { bookUsage } from '@/lib/lore-usage'
import { askMolfar } from '@/lib/shell-bridge'
import { entryFilterCounts, matchesEntryFilter, type BookFilter, type EntryFilter } from '@/lib/lore-filters'
import type { Lorebook, LoreEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BookHeader } from '@/components/lore/book-header'
import { BookList } from '@/components/lore/book-list'
import { BookSettings } from '@/components/lore/book-settings'
import { BookUsedBy } from '@/components/lore/book-used-by'
import { BulkBar, EntryToolbar } from '@/components/lore/entry-toolbar'
import { EntryRowHead } from '@/components/lore/entry-row-head'
import { EntryEditor } from '@/components/lore/entry-editor'
import { KeywordTest } from '@/components/lore/keyword-test'
import { WiStatusView } from '@/components/lore/wi-status-view'
import { entriesKey } from '@/components/lore/lore-labels'

const BOOK_PAGE = 100
const ENTRY_PAGE = 50

type BookTab = 'entries' | 'rules' | 'used'

export function LorebooksView() {
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const characters = useApp((s) => s.characters)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const addLorebook = useApp((s) => s.addLorebook)
  const duplicateLorebook = useApp((s) => s.duplicateLorebook)
  const deleteLorebook = useApp((s) => s.deleteLorebook)
  const focusLorebookId = useApp((s) => s.focusLorebookId)
  const refreshLorebooks = useApp((s) => s.refreshLorebooks)
  const hydrate = useApp((s) => s.hydrate)
  const loadBook = useApp((s) => s.loadBook)
  const [selectedId, setSelectedId] = useState(lorebooks[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  useGuidePlace('lorebooks', lorebooks.length > 0)
  const [testOpen, setTestOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const [activeViewerOpen, setActiveViewerOpen] = useState(false)
  const [bookQuery, setBookQuery] = useState('')
  const [bookFilter, setBookFilter] = useState<BookFilter>('all')
  const [bookPage, setBookPage] = useState(0)
  const book = lorebooks.find((b) => b.id === selectedId) ?? lorebooks[0]

  // the list holds summaries: the book on screen is fetched whole (its entries come with it)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [loadTry, setLoadTry] = useState(0)
  const isMobile = useIsMobile()
  useEffect(() => {
    // a phone shows the list first: the book behind it is not fetched until it is opened
    if (!book?.stub || (isMobile && !detailOpen)) return
    const id = book.id
    let live = true
    void loadBook(id).then((whole) => { if (live && !whole) setFailedId(id) })
    return () => { live = false }
  }, [book?.id, book?.stub, isMobile, detailOpen, loadBook, loadTry])

  /** Import: native studio lorebook JSON (PUT as-is) or world-info JSON (normalized server-side by the import
   *  plugin). World files carry no book name: the FILE name is the book's name, so it rides along as `name`. */
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const ids = await importLorebookFiles(Array.from(files))
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

  // the guide's "Show me" wants an open book (a phone shows the list first)
  useEffect(() => {
    const on = (e: Event) => {
      const first = useApp.getState().lorebooks[0]
      if ((e as CustomEvent<string>).detail === 'lorebooks' && first) select(selectedId || first.id)
    }
    window.addEventListener(GUIDE_DETAIL_EVENT, on)
    return () => window.removeEventListener(GUIDE_DETAIL_EVENT, on)
  }, [selectedId])

  /** Hands Molfar the brief: it asks the user what the book is for, then builds it. */
  const createWithMolfar = async () => {
    try {
      await askMolfar(t('lore.molfar.message'))
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `${t('home.askError')}: ${e.message}` : t('home.askError'))
    }
  }

  return (
    <SectionPage section="lorebooks" count={lorebooks.length} hideOnPhone={detailOpen && !!book}>
    <>
    <MasterDetail
      detailOpen={detailOpen && !!book}
      onBack={() => setDetailOpen(false)}
      detailTitle={book?.name}
      backLabel={t('lore.backToList')}
      masterWidth="w-[380px]"
      master={
        <BookList
          books={lorebooks}
          characters={characters}
          selectedId={book?.id ?? null}
          query={bookQuery}
          onQuery={(q) => { setBookQuery(q); setBookPage(0) }}
          filter={bookFilter}
          onFilter={(f) => { setBookFilter(f); setBookPage(0) }}
          page={bookPage}
          onPage={setBookPage}
          pageSize={BOOK_PAGE}
          onSelect={select}
          onNew={() => select(addLorebook())}
          onImport={importFiles}
          onMolfar={() => void createWithMolfar()}
          onActiveChats={() => setActiveViewerOpen(true)}
        />
      }
      detail={
        book?.stub ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-body text-muted-foreground" role="status">
            {failedId === book.id ? (
              <>
                <span>{t('lore.openFailed')}</span>
                <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => { setFailedId(null); setLoadTry((n) => n + 1) }}>{t('lore.openRetry')}</Button>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
                {t('lore.opening', { name: book.name })}
              </span>
            )}
          </div>
        ) : book ? (
          <BookEditor
            key={book.id}
            book={book}
            onUpdate={(patch) => updateLorebook(book.id, patch)}
            onDelete={() => void confirm({
              title: t('lore.book.deleteTitle', { name: book.name }),
              description: t('lore.book.deleteBody'),
            }).then((yes) => {
              if (!yes) return
              deleteLorebook(book.id); setSelectedId(lorebooks.find((b) => b.id !== book.id)?.id ?? ''); setDetailOpen(false)
            })}
            onDuplicate={() => { setSelectedId(duplicateLorebook(book.id)); toast.success(t('lore.book.duplicated')) }}
            onTest={() => setTestOpen(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-body text-muted-foreground">{t('lore.books.none')}</div>
        )
      }
    />

      <KeywordTest open={testOpen} onOpenChange={setTestOpen} book={book && !book.stub ? book : null} />
      <ActiveEntriesViewer open={activeViewerOpen} onOpenChange={setActiveViewerOpen} />
      {confirmDialog}
    </>
    </SectionPage>
  )
}

const SORTS = ['order', 'title', 'tokens', 'priority', 'trigger'] as const

const newEntry = (): LoreEntry => ({ id: uid('we'), title: 'New entry', memo: '', keys: [], keysRegex: false, secondaryKeys: [], logic: 'AND_ANY', status: 'normal', content: '', position: 'after_char', depth: 4, role: 'system', order: 100, probability: 100, useProbability: false, group: '', groupWeight: 100, groupPrioritize: false, sticky: 0, cooldown: 0, delay: 0, enabled: true, characterFilter: [], characterFilterExclude: false, tagFilter: [], triggerFilters: [], nonRecursable: false, preventFurtherRecursion: false, delayUntilRecursion: false, ignoreBudget: false, scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null, wordFormsOverride: null, groupScoringOverride: null, automationId: '', matchSources: { description: false, personality: false, scenario: false, persona: false } })

/** A copy that is a new entry of its own: no engine uid carried over. */
const asCopy = (e: LoreEntry, extra?: Partial<LoreEntry>): LoreEntry => ({ ...e, ...extra, id: uid('entry'), uid: undefined })

/** The book page: header, then the tabs Entries | Rules | Used by. Each tab is its own screen, so the entries never
 *  share a page with the rules. An entry opens in the side panel (a full page on a phone), not inline. */
function BookEditor({ book, onUpdate, onDelete, onDuplicate, onTest }: {
  book: Lorebook; onUpdate: (p: Partial<Lorebook>) => void; onDelete: () => void; onDuplicate: () => void; onTest: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<BookTab>('entries')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('order')
  const [filter, setFilter] = useState<EntryFilter>('all')
  /** the one entry the side panel shows */
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [copyEntries, setCopyEntries] = useState<LoreEntry[] | null>(null)
  const [entryPage, setEntryPage] = useState(0)
  const [confirm, confirmDialog] = useConfirm()
  const allBooks = useApp((s) => s.lorebooks)
  const characters = useApp((s) => s.characters)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const loadBook = useApp((s) => s.loadBook)
  const users = bookUsage(characters, book.id).users.length

  const counts = useMemo(() => entryFilterCounts(book.entries), [book.entries])

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = book.entries.filter((e) =>
      matchesEntryFilter(e, filter) &&
      (!q || e.title.toLowerCase().includes(q) || e.keys.some((k) => k.toLowerCase().includes(q)) || e.content.toLowerCase().includes(q)))
    switch (sort) {
      case 'title': list = [...list].sort((a, b) => a.title.localeCompare(b.title)); break
      case 'tokens': list = [...list].sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content)); break
      case 'priority': list = [...list].sort((a, b) => b.order - a.order); break
      case 'trigger': list = [...list].sort((a, b) => b.probability - a.probability); break
    }
    return list
  }, [book.entries, query, sort, filter])

  const safeEntryPage = clampPage(entryPage, entries.length, ENTRY_PAGE)
  const pagedEntries = entries.slice(safeEntryPage * ENTRY_PAGE, safeEntryPage * ENTRY_PAGE + ENTRY_PAGE)
  const active = book.entries.find((e) => e.id === activeId) ?? null
  // the panel belongs to the Entries screen: the other tabs have no entry on screen
  const panelOpen = !!active && tab === 'entries'

  /** Deleting an entry asks first; the panel closes with it. */
  const deleteEntry = (e: LoreEntry) => void confirm({
    title: t('lore.ed.deleteTitle', { title: e.title }),
    description: t('lore.ed.deleteBody'),
  }).then((yes) => {
    if (!yes) return
    onUpdate({ entries: book.entries.filter((x) => x.id !== e.id) })
    setActiveId((id) => (id === e.id ? null : id))
  })

  const upEntry = (id: string, patch: Partial<LoreEntry>) =>
    onUpdate({ entries: book.entries.map((e) => e.id === id ? { ...e, ...patch } : e) })
  const bulk = (patch: Partial<LoreEntry>) => onUpdate({ entries: book.entries.map((e) => selected.includes(e.id) ? { ...e, ...patch } : e) })

  const copyTo = async (target: Lorebook) => {
    if (!copyEntries) return
    // the target may be a summary: the entries are appended to the book as it is on disk
    const whole = await loadBook(target.id)
    if (!whole || whole.stub) { toast.error(t('lore.openFailed')); return }
    updateLorebook(whole.id, { entries: [...whole.entries, ...copyEntries.map((e) => asCopy(e))] })
    toast.success(t('lore.copied', { n: copyEntries.length, name: whole.name }))
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
    toast.success(t('lore.bulk.deleted'))
  }

  const toggleSelecting = () => {
    if (selecting) setSelected([])
    setSelecting(!selecting)
  }

  return (
    // @container: the detail pane spans from a phone page to a narrow drawer to a full page; the grids below must
    // follow the PANE's width, not the viewport, or fixed-width label+input rows crush into each other
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col @container">
      {/* the header, the tabs and the entries scroll together: a toolbar pinned at the top eats the phone screen */}
      <ScrollArea className="min-h-0 flex-1">
        <BookHeader book={book} characters={characters} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} onTest={onTest} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as BookTab)} className="gap-0">
          <div className="px-4 pt-3">
            <TabsList className="h-9 w-full max-md:h-11 md:w-auto">
              <TabsTrigger value="entries">{t('lore.tab.entries')}</TabsTrigger>
              <TabsTrigger value="rules">{t('lore.tab.rules')}</TabsTrigger>
              <TabsTrigger value="used">{`${t('lore.tab.usedBy')} (${users})`}</TabsTrigger>
            </TabsList>
          </div>

          {/* beside the panel the list keeps its width: the rows are padded off the panel's 440 px on a desktop */}
          <TabsContent value="entries" className={cn('flex flex-col gap-3 px-4 py-3', panelOpen && 'md:pr-[456px]')}>
            <EntryToolbar
              query={query}
              onQuery={(q) => { setQuery(q); setEntryPage(0) }}
              sort={sort}
              onSort={(s) => setSort(s as (typeof SORTS)[number])}
              selecting={selecting}
              onToggleSelecting={toggleSelecting}
              filter={filter}
              onFilter={(f) => { setFilter(f); setEntryPage(0) }}
              counts={counts}
              badgesInfo={t('lore.badges.info')}
              onAdd={() => {
                const e = newEntry()
                onUpdate({ entries: [e, ...book.entries] })
                setFilter('all'); setQuery('')
                setActiveId(e.id)
              }}
            />
            {selected.length > 0 && (
              <BulkBar
                n={selected.length}
                onSelectAllVisible={() => setSelected(pagedEntries.map((e) => e.id))}
                onBulk={bulk}
                onCopy={() => setCopyEntries(book.entries.filter((e) => selected.includes(e.id)))}
                onDelete={() => void bulkDelete()}
                onClear={() => setSelected([])}
              />
            )}
            {counts.vector > 0 && (
              <p className="text-caption text-muted-foreground" data-testid="vector-note">{t('lore.vector.note', { n: counts.vector })}</p>
            )}
            <ul className="flex flex-col gap-2">
              {pagedEntries.map((e) => {
                const open = active?.id === e.id
                return (
                  <li key={e.id} className={cn('rounded-lg border border-border', !e.enabled && 'opacity-60', open && 'border-ring bg-accent/40')}>
                    <EntryRowHead
                      e={e}
                      open={open}
                      selecting={selecting}
                      checked={selected.includes(e.id)}
                      onCheck={(v) => setSelected((s) => v ? [...s, e.id] : s.filter((x) => x !== e.id))}
                      onToggle={() => setActiveId((id) => (id === e.id ? null : e.id))}
                      onEnable={(v) => upEntry(e.id, { enabled: v })}
                    />
                  </li>
                )
              })}
              {entries.length === 0 && <li className="px-1 py-6 text-center text-caption text-muted-foreground">{t('lore.entries.none')}</li>}
            </ul>
            <Pager total={entries.length} page={safeEntryPage} pageSize={ENTRY_PAGE} onPage={setEntryPage} />
          </TabsContent>

          <TabsContent value="rules">
            <BookSettings book={book} onUpdate={onUpdate} />
          </TabsContent>

          <TabsContent value="used">
            <BookUsedBy bookId={book.id} characters={characters} />
          </TabsContent>
        </Tabs>
      </ScrollArea>

      {panelOpen && active && (
        <EntryEditor
          key={active.id}
          entry={active}
          onChange={(patch) => upEntry(active.id, patch)}
          onDelete={() => deleteEntry(active)}
          onDuplicate={() => { onUpdate({ entries: [...book.entries, asCopy(active, { title: `${active.title} (copy)` })] }); toast.success(t('lore.entry.duplicated')) }}
          onCopyToBook={() => setCopyEntries([active])}
          onClose={() => setActiveId(null)}
        />
      )}

      <Dialog open={!!copyEntries} onOpenChange={(o) => { if (!o) setCopyEntries(null) }}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{copyEntries?.length === 1 ? t('lore.copyOne', { title: copyEntries[0]!.title }) : t('lore.copyMany', { n: copyEntries?.length ?? 0 })}</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {allBooks.filter((b) => b.id !== book.id).map((b) => (
              <li key={b.id}>
                <Button variant="outline" size="sm" className="w-full justify-start max-md:h-10" onClick={() => void copyTo(b)}>
                  {b.name}
                  <span className="ml-auto text-caption text-muted-foreground">{t(entriesKey(bookEntryCount(b)), { n: bookEntryCount(b) })}</span>
                </Button>
              </li>
            ))}
            {allBooks.length <= 1 && <p className="text-caption text-muted-foreground">{t('lore.copy.none')}</p>}
          </ul>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}

/** REAL world-info activation for the active chat: the same scan a generation runs. Numbers and reasons come from the
 *  engine, not a mock. */
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
