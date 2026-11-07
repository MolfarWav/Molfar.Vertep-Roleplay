
import { useEffect, useMemo, useState } from 'react'
import { CircleNotch, FolderSimplePlus, Plus } from '@phosphor-icons/react'
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
import { exportAllBooks, exportOneBook } from '@/lib/lore-export'
import { bookUsage } from '@/lib/lore-usage'
import { askMolfar } from '@/lib/shell-bridge'
import { entryFilterCounts, matchesEntryFilter, type BookFilter, type EntryFilter } from '@/lib/lore-filters'
import { addToFolderList, buildTree, cleanFolderList, cleanFolderTones, folderOf, isFolderTone, setFolderTone, type FolderTone, hasFolders, listFolders, moveToFolder, removeFolder, renameFolder, renameInFolderList, setFolderEnabled } from '@/lib/lore-folders'
import type { Lorebook, LoreEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BookHeader } from '@/components/lore/book-header'
import { BookList } from '@/components/lore/book-list'
import { BookSettings } from '@/components/lore/book-settings'
import { BookUsedBy } from '@/components/lore/book-used-by'
import { BulkBar, EntryToolbar } from '@/components/lore/entry-toolbar'
import { EntryRowHead } from '@/components/lore/entry-row-head'
import { EntryEditor } from '@/components/lore/entry-editor'
import { EntryTree, LORE_DRAG, visibleEntries, FOLDER_PAGE } from '@/components/lore/entry-tree'
import { MoveToFolderDialog, NewFolderDialog, RenameFolderDialog } from '@/components/lore/folder-dialogs'
import { KeywordTest } from '@/components/lore/keyword-test'
import { WiStatusView } from '@/components/lore/wi-status-view'
import { entriesKey } from '@/components/lore/lore-labels'

const BOOK_PAGE = 100
const ENTRY_PAGE = 50

type BookTab = 'entries' | 'rules' | 'used'

/** Which folders of a book are open: a per-viewer convenience kept in the browser, never in the book. */
const openKey = (bookId: string) => `rp.lore.folders.open.${bookId}`
function loadOpen(bookId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(openKey(bookId)) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function saveOpen(bookId: string, open: string[]) {
  try { localStorage.setItem(openKey(bookId), JSON.stringify(open)) } catch { /* private window or blocked storage */ }
}

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

  const [exporting, setExporting] = useState(false)
  /** Export all: every book in one zip; a book that cannot be read is skipped and the toast says how many. */
  const exportAll = async () => {
    setExporting(true)
    try {
      const { saved, skipped } = await exportAllBooks(useApp.getState().lorebooks, loadBook)
      if (saved) toast.success(t('lore.export.done', { n: saved }) + (skipped ? ' ' + t('lore.export.skipped', { n: skipped }) : ''))
      else toast.error(t('lore.export.none'))
    } finally {
      setExporting(false)
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
          onExportOne={book && !book.stub ? () => exportOneBook(book) : null}
          onExportAll={() => void exportAll()}
          exporting={exporting}
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
  const [openFolders, setOpenFolders] = useState<string[]>(() => loadOpen(book.id))
  /** how many entries each folder shows ('' = those with no folder); missing = FOLDER_PAGE */
  const [limits, setLimits] = useState<Record<string, number>>({})
  /** the entries the Move dialog is for (the selected ones); null = closed */
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
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

  // Folders: a book that has any shows its entries as a tree, a book with none keeps the flat paged list
  const listed = useMemo(() => cleanFolderList(book.folders), [book.folders])
  const folders = useMemo(() => listFolders(book.entries, listed), [book.entries, listed])
  const tones = useMemo(() => cleanFolderTones(book.folderTones), [book.folderTones])
  const toneOf = (name: string): FolderTone | undefined => { const x = tones[name]; return isFolderTone(x) ? x : undefined }
  const treeMode = hasFolders(book.entries, listed)
  const searching = query.trim() !== '' || filter !== 'all'
  const tree = useMemo(() => (treeMode ? buildTree(book.entries, entries, searching ? [] : listed) : null), [treeMode, book.entries, entries, searching, listed])
  const isOpen = (name: string) => searching || openFolders.includes(name)
  const limitOf = (key: string) => limits[key] ?? FOLDER_PAGE
  const shownEntries = tree ? visibleEntries(tree, isOpen, limitOf) : pagedEntries
  const toggleFolder = (name: string) => setOpenFolders((cur) => {
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
    saveOpen(book.id, next)
    return next
  })
  const openFolder = (name: string) => setOpenFolders((cur) => {
    if (cur.includes(name)) return cur
    const next = [...cur, name]
    saveOpen(book.id, next)
    return next
  })
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

  /** Put entries into a folder ('' = out of any) and open it, so the person sees where they went. */
  const moveTo = (ids: string[], name: string) => {
    onUpdate({ entries: moveToFolder(book.entries, ids, name), ...(name ? { folders: addToFolderList(listed, name) } : {}) })
    if (name) openFolder(name)
    toast.success(name ? t('lore.folder.moved', { n: ids.length, name }) : t('lore.folder.movedOut', { n: ids.length }))
  }
  /** Entries dropped on a folder (or on "No folder"). Dropping on the folder an entry already sits in changes nothing. */
  const dropEntries = (ids: string[], name: string) => {
    const moving = ids.filter((id) => { const e = book.entries.find((x) => x.id === id); return e && folderOf(e) !== name })
    if (moving.length) moveTo(moving, name)
  }
  const addEntry = (folder?: string) => {
    const e = { ...newEntry(), ...(folder ? { folder } : {}) }
    onUpdate({ entries: [e, ...book.entries] })
    setFilter('all'); setQuery('')
    if (folder) openFolder(folder)
    setActiveId(e.id)
  }
  const selectMany = (list: LoreEntry[], on: boolean) => setSelected((cur) => {
    const ids = new Set(list.map((e) => e.id))
    return on ? [...new Set([...cur, ...ids])] : cur.filter((id) => !ids.has(id))
  })
  const doRename = (from: string, to: string, tone: FolderTone | undefined) => {
    onUpdate({ entries: renameFolder(book.entries, from, to), folders: renameInFolderList(listed, from, to), folderTones: setFolderTone(tones, from, to, tone) })
    setOpenFolders((cur) => {
      const next = [...new Set(cur.map((n) => (n === from ? to : n)))]
      saveOpen(book.id, next)
      return next
    })
  }
  const doRemove = (name: string) => {
    const n = book.entries.filter((e) => folderOf(e) === name).length
    onUpdate({ entries: removeFolder(book.entries, name), folders: renameInFolderList(listed, name, ''), folderTones: setFolderTone(tones, name, '', undefined) })
    toast.success(t('lore.folder.removed', { n }))
  }
  /** A new, empty folder: it shows at once, open, ready for entries. */
  const createFolder = (name: string) => {
    onUpdate({ folders: addToFolderList(listed, name) })
    openFolder(name)
    toast.success(t('lore.folder.created', { name }))
  }
  const selectedFolder = (): string | null => {
    const names = new Set(book.entries.filter((e) => moveIds?.includes(e.id)).map(folderOf))
    return names.size === 1 ? [...names][0]! : null
  }

  const toggleSelecting = () => {
    if (selecting) setSelected([])
    setSelecting(!selecting)
  }

  /** One entry row, the same in a folder and in the flat list. */
  const renderRow = (e: LoreEntry) => {
    const open = active?.id === e.id
    return (
      <li
        key={e.id}
        draggable={treeMode}
        onDragStart={treeMode ? (ev) => {
          // a ticked row drags every ticked entry; the rest drag alone
          const ids = selecting && selected.includes(e.id) ? selected : [e.id]
          ev.dataTransfer.setData(LORE_DRAG, JSON.stringify(ids))
          ev.dataTransfer.effectAllowed = 'move'
        } : undefined}
        className={cn('rounded-lg border border-border', !e.enabled && 'opacity-60', open && 'border-ring bg-accent/40')}
      >
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
  }

  return (
    // @container: the detail pane spans from a phone page to a narrow drawer to a full page; the grids below must
    // follow the PANE's width, not the viewport, or fixed-width label+input rows crush into each other
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col @container">
      {/* The entry panel is a drawer over the page: from the right on desktop (it covers part of the list), the whole page
          on a phone. The list keeps the full width underneath. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* the header, the tabs and the entries scroll together: a toolbar pinned at the top eats the phone screen */}
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <BookHeader book={book} characters={characters} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} onTest={onTest} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as BookTab)} className="gap-0">
          {/* the tabs, and on Entries the two things you do there, on one row: no half-empty line above the search */}
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <TabsList className="h-9 w-full max-md:h-11 md:w-auto">
              <TabsTrigger value="entries">{t('lore.tab.entries')}</TabsTrigger>
              <TabsTrigger value="rules">{t('lore.tab.rules')}</TabsTrigger>
              <TabsTrigger value="used">{`${t('lore.tab.usedBy')} (${users})`}</TabsTrigger>
            </TabsList>
            {tab === 'entries' && (
              <div className="ml-auto flex items-center gap-2 max-md:w-full max-md:justify-end">
                <Button variant="tonal" className="max-md:h-10" onClick={() => setNewFolderOpen(true)} data-testid="new-folder">
                  <FolderSimplePlus className="size-4" aria-hidden="true" />{t('lore.folder.new')}
                </Button>
                <Button variant="default" className="max-md:h-10" onClick={() => addEntry()}>
                  <Plus className="size-4" aria-hidden="true" />{t('lore.addEntry')}
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="entries" className="flex flex-col gap-3 px-4 py-3">
            <EntryToolbar
              query={query}
              onQuery={(q) => { setQuery(q); setEntryPage(0); setLimits({}) }}
              sort={sort}
              onSort={(s) => setSort(s as (typeof SORTS)[number])}
              selecting={selecting}
              onToggleSelecting={toggleSelecting}
              filter={filter}
              onFilter={(f) => { setFilter(f); setEntryPage(0); setLimits({}) }}
              counts={counts}
              badgesInfo={t('lore.badges.info')}
            />
            {selected.length > 0 && (
              <BulkBar
                n={selected.length}
                onSelectAllVisible={() => setSelected(shownEntries.map((e) => e.id))}
                onBulk={bulk}
                onMove={() => setMoveIds(selected)}
                onCopy={() => setCopyEntries(book.entries.filter((e) => selected.includes(e.id)))}
                onDelete={() => void bulkDelete()}
                onClear={() => setSelected([])}
              />
            )}
            {counts.vector > 0 && (
              <p className="text-caption text-muted-foreground" data-testid="vector-note">{t('lore.vector.note', { n: counts.vector })}</p>
            )}
            {tree ? (
              <>
                <EntryTree
                  tree={tree}
                  searching={searching}
                  isOpen={isOpen}
                  onToggle={toggleFolder}
                  limitOf={limitOf}
                  onMore={(key) => setLimits((cur) => ({ ...cur, [key]: (cur[key] ?? FOLDER_PAGE) + FOLDER_PAGE }))}
                  selecting={selecting}
                  selected={selected}
                  onSelectMany={selectMany}
                  renderRow={renderRow}
                  toneOf={toneOf}
                  onDropEntries={dropEntries}
                  onAddHere={addEntry}
                  onEnableAll={(name, on) => onUpdate({ entries: setFolderEnabled(book.entries, name, on) })}
                  onRename={setRenaming}
                  onRemove={doRemove}
                />
                {entries.length === 0 && <p className="px-1 py-6 text-center text-caption text-muted-foreground">{t('lore.entries.none')}</p>}
              </>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {pagedEntries.map(renderRow)}
                  {entries.length === 0 && <li className="px-1 py-6 text-center text-caption text-muted-foreground">{t('lore.entries.none')}</li>}
                </ul>
                <Pager total={entries.length} page={safeEntryPage} pageSize={ENTRY_PAGE} onPage={setEntryPage} />
              </>
            )}
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
          folders={folders}
          onChange={(patch) => { upEntry(active.id, patch); if (patch.folder) { openFolder(patch.folder); if (!listed.includes(patch.folder)) onUpdate({ folders: addToFolderList(listed, patch.folder) }) } }}
          onDelete={() => deleteEntry(active)}
          onDuplicate={() => { onUpdate({ entries: [...book.entries, asCopy(active, { title: `${active.title} (copy)` })] }); toast.success(t('lore.entry.duplicated')) }}
          onCopyToBook={() => setCopyEntries([active])}
          onClose={() => setActiveId(null)}
        />
      )}
      </div>

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
      <MoveToFolderDialog
        open={moveIds !== null}
        onOpenChange={(o) => { if (!o) setMoveIds(null) }}
        title={t('lore.folder.moveMany', { n: moveIds?.length ?? 0 })}
        folders={folders}
        current={selectedFolder()}
        onPick={(name) => { if (moveIds) moveTo(moveIds, name) }}
      />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} existing={folders.map((f) => f.name)} onCreate={createFolder} />
      <RenameFolderDialog folder={renaming} folders={folders} tone={renaming ? toneOf(renaming) : undefined} onOpenChange={(o) => { if (!o) setRenaming(null) }} onRename={doRename} />
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
