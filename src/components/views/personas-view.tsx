
import { forEachImport } from '@/lib/import-progress'
import { t as tNow } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, UploadSimple, DownloadSimple, CheckSquare, Check, SortAscending, MagnifyingGlass, DotsThree, Folder as FolderIcon, Tag as TagIcon, UserCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useConfirm } from '@/components/ui/confirm'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { downloadTextFile } from '@/lib/export'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBackClose } from '@/hooks/use-back-close'
import { useT } from '@/hooks/use-t'
import { PersonaPage } from '@/components/persona/persona-page'
import { PersonaNewDialog } from '@/components/persona/persona-new-dialog'
import { PersonaGrid, PersonaRows, type PersonaItem } from '@/components/persona/persona-list'
import { PersonaPreviewPanel, PersonaPreviewSheet } from '@/components/persona/persona-preview'
import { ActiveFilters, AllTagsPanel, FolderList, FolderStrip, NameDialog, SelectBar, TagFilterRow, type SelectActions } from '@/components/persona/persona-filters'
import { TagManager } from '@/components/tags/tag-manager'
import { folderCounts, folderTags, resolveFolder } from '@/lib/character-folders'
import {
  NO_FOLDER, PERSONA_SORTS, cleanTags, filterPersonas, folderNamesOf, moveToFolder, noFolderCount, personaLine, personaTagChips,
  personaTagCounts, personaTokens, profileFill, sortPersonas, tagsOf, withTag, type PersonaSort,
} from '@/lib/persona-list'

const SORT_KEY = 'rp.personas.sort'
const FOLDER_KEY = 'rp.personas.folder'
const readSort = (): PersonaSort => {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return PERSONA_SORTS.find((s) => s === v) ?? 'recent'
  } catch { return 'recent' }
}
const readFolder = (): string | null => {
  try { return localStorage.getItem(FOLDER_KEY) } catch { return null }
}
const remember = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage blocked */ }
}

// years of use → thousands of personas; the list pages through them
const PERSONA_PAGE = 100

export function PersonasView() {
  const t = useT()
  const isMobile = useIsMobile()
  const personas = useApp((s) => s.personas)
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const allTags = useApp((s) => s.tags)
  const updatePersona = useApp((s) => s.updatePersona)
  const switchTo = useApp((s) => s.usePersona)
  const addPersona = useApp((s) => s.addPersona)
  const duplicatePersona = useApp((s) => s.duplicatePersona)
  const deletePersona = useApp((s) => s.deletePersona)
  const addTag = useApp((s) => s.addTag)
  const updateTag = useApp((s) => s.updateTag)
  const openChatsForPersona = useApp((s) => s.openChatsForPersona)
  const __focus = useApp.getState().focusPersonaId
  useEffect(() => { if (__focus) useApp.setState({ focusPersonaId: null }) }, [])
  // a persona opened from elsewhere (a chat's persona link) goes straight to its page
  const [selectedId, setSelectedId] = useState<string | null>(__focus ?? null)
  const [detailOpen, setDetailOpen] = useState(!!__focus)
  const [confirm, confirmDialog] = useConfirm()
  const importInput = useRef<HTMLInputElement>(null)
  const p = personas.find((x) => x.id === selectedId) ?? personas[0]
  // the persona being spoken as right now: the open chat's own, else the
  // selection new chats start with
  const activeChatId = useApp((s) => s.activeChatId)
  const chatPersonaId = chats.find((c) => c.id === activeChatId)?.personaId ?? null
  const activeId = personas.some((x) => x.id === chatPersonaId)
    ? chatPersonaId
    : (personas.find((x) => x.isDefault)?.id ?? null)

  // ── the overview: filters, sort, select mode ──
  const [query, setQuery] = useState('')
  const [sort, setSortState] = useState<PersonaSort>(readSort)
  const [folderChoice, setFolderChoice] = useState<string | null>(readFolder)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [allTagsOpen, setAllTagsOpen] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // which dialog makes a name: a folder (and whether the ticked personas move into it) or a tag for them
  const [naming, setNaming] = useState<'folder' | 'folder-move' | 'tag' | null>(null)

  const setSort = (s: PersonaSort) => { setSortState(s); remember(SORT_KEY, s); setPage(0) }
  const pickFolder = (f: string | null) => { setFolderChoice(f); remember(FOLDER_KEY, f); setPage(0) }

  // the Personas section's own tags: the same list as the characters' tags, told apart by `scope`
  const ptags = useMemo(() => allTags.filter((x) => x.scope === 'persona'), [allTags])
  const folders = useMemo(() => folderTags(ptags), [ptags])
  const tagMeta = useMemo(() => new Map(ptags.map((x) => [x.name, x])), [ptags])
  // a folder that stopped being one (unticked, renamed, deleted) is All again
  const folder = folderChoice === NO_FOLDER ? (folders.length ? NO_FOLDER : null) : resolveFolder(folderChoice, folders)
  useEffect(() => {
    if (folderChoice !== null && folder === null) { setFolderChoice(null); remember(FOLDER_KEY, null) }
  }, [folderChoice, folder])

  const chatCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of chats) if (ch.personaId) m.set(ch.personaId, (m.get(ch.personaId) ?? 0) + 1)
    return m
  }, [chats])
  const tokenMap = useMemo(() => new Map(personas.map((x) => [x.id, personaTokens(x)])), [personas])
  const folderNames = useMemo(() => folders.map((f) => f.name), [folders])
  const folderCount = useMemo(() => folderCounts(personas.map((x) => ({ tags: tagsOf(x) })), folders), [personas, folders])
  const noFolder = useMemo(() => noFolderCount(personas, folders), [personas, folders])
  const tagCounts = useMemo(() => personaTagCounts(personas), [personas])
  const tagChips = useMemo(() => personaTagChips(personas, ptags), [personas, ptags])

  const filtered = useMemo(
    () => sortPersonas(filterPersonas(personas, { query, tags: tagFilter, folder, folderNames }), sort, chatCounts, tokenMap),
    [personas, query, tagFilter, folder, folderNames, sort, chatCounts, tokenMap],
  )
  const pageNo = clampPage(page, filtered.length, PERSONA_PAGE)
  const items: PersonaItem[] = useMemo(() => filtered.slice(pageNo * PERSONA_PAGE, (pageNo + 1) * PERSONA_PAGE).map((x) => ({
    p: x, line: personaLine(x), chats: chatCounts.get(x.id) ?? 0, tokens: tokenMap.get(x.id) ?? 0,
    fill: profileFill(x).label, tags: tagsOf(x), folders: folderNamesOf(x, folders),
  })), [filtered, pageNo, chatCounts, tokenMap, folders])
  const previewItem = items.find((i) => i.p.id === selectedId) ?? items.find((i) => i.p.id === activeId) ?? items[0] ?? null

  const clearFilters = () => { setQuery(''); setTagFilter([]); pickFolder(null) }
  const toggleTag = (name: string) => { setTagFilter((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name])); setPage(0) }
  const leaveSelect = () => { setSelectMode(false); setPicked(new Set()) }
  const tick = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  const tap = (id: string) => {
    if (selectMode) { tick(id, !picked.has(id)); return }
    setSelectedId(id)
    if (isMobile) setSheetOpen(true)
  }
  const open = (id: string) => { setSelectedId(id); setSheetOpen(false); setDetailOpen(true) }

  const withPersonas = (ids: string[]) => ids.map((id) => personas.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x)

  /** A folder is a persona tag marked "folder"; an existing tag of that name just becomes one. */
  const makeFolder = (name: string): string => {
    const have = useApp.getState().tags.find((x) => x.scope === 'persona' && x.name === name)
    if (have) { if (!have.asFolder) updateTag(have.id, { asFolder: true }); return name }
    addTag(name, 'persona')
    const made = useApp.getState().tags.find((x) => x.scope === 'persona' && x.name === name)
    if (made) updateTag(made.id, { asFolder: true })
    return name
  }
  const moveTo = (ids: string[], target: string | null) => {
    for (const x of withPersonas(ids)) {
      const next = moveToFolder(x, target, folders)
      if (next.join('\n') !== tagsOf(x).join('\n')) updatePersona(x.id, { tags: next })
    }
    toast.success(target ? t('personas.moved', { name: target }) : t('personas.movedNone'))
  }
  const addToFolder = (ids: string[], target: string) => {
    for (const x of withPersonas(ids)) {
      const next = withTag(x, target, true)
      if (next) updatePersona(x.id, { tags: next })
    }
    toast.success(t('personas.moved', { name: target }))
  }
  const tagThem = (ids: string[], name: string) => {
    for (const x of withPersonas(ids)) {
      const next = withTag(x, name, true)
      if (next) updatePersona(x.id, { tags: next })
    }
    toast.success(t('personas.tagged', { name }))
  }
  const exportThem = (ids: string[]) => {
    const list = withPersonas(ids)
    downloadTextFile(`personas-${list.length}.json`, JSON.stringify(list, null, 2), 'application/json')
    toast.success(t('personas.exported', { n: list.length }))
  }
  const removeThem = async (ids: string[]) => {
    const list = withPersonas(ids)
    if (!list.length) return false
    const yes = await confirm({
      title: list.length === 1 ? t('personas.deleteOne', { name: list[0]?.name ?? '' }) : t('personas.deleteN', { n: list.length }),
      description: t('personas.deleteDesc'),
    })
    if (!yes) return false
    for (const x of list) deletePersona(x.id)
    if (selectedId && ids.includes(selectedId)) setSelectedId(personas.find((x) => !ids.includes(x.id))?.id ?? null)
    toast.success(t('personas.deleted'))
    return true
  }

  // "New persona" asks how to start; a blank page is the first choice
  const [newOpen, setNewOpen] = useState(false)
  const newPersona = () => setNewOpen(true)
  const startTag = folder && folder !== NO_FOLDER ? folder : null
  const blankPersona = () => {
    // inside a folder, the new persona starts in it
    const id = addPersona(startTag ? { tags: [startTag] } : undefined)
    setSelectedId(id)
    setDetailOpen(true)
  }
  /** Persona records (a backup, a file): each one is added, its tags kept clean. Returns how many. */
  const addRecords = (records: Record<string, unknown>[]): number => {
    let added = 0
    for (const item of records) {
      if (typeof item.name !== 'string') continue
      const tags = cleanTags(item.tags)
      setSelectedId(addPersona({ ...item, tags: tags?.length ? tags : undefined } as never))
      added++
    }
    return added
  }
  const switchPersona = (id: string, name: string) => { switchTo(id); toast.success(t('personas.using', { name })) }
  const downloadBackup = () => { downloadTextFile('personas-backup.json', JSON.stringify(personas, null, 2), 'application/json'); toast.success('Backup downloaded') }

  /** Import: our backup shape (array of personas) or the common
   *  { name: description } personas object. */
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    let added = 0
    await forEachImport(tNow('imp.title.personas'), Array.from(files), (f) => f.name, async (file) => {
      try {
        const json: unknown = JSON.parse(await file.text())
        if (Array.isArray(json)) {
          added += addRecords(json.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object'))
        } else if (json && typeof json === 'object') {
          for (const [name, description] of Object.entries(json as Record<string, unknown>)) {
            setSelectedId(addPersona({ name, description: String(description ?? '') })); added++
          }
        }
        return true
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? 'invalid JSON'}`); return false }
    })
    if (added) toast.success(`Imported ${added} persona${added > 1 ? 's' : ''}`)
  }

  // ── pieces of the overview ──
  // tags the Add tag menu offers: every non-folder tag, in use or only in the manager
  const tagNames = useMemo(() => {
    const folderSet = new Set(folderNames)
    const names = tagChips.map((c) => c.name).filter((n) => !folderSet.has(n))
    for (const x of ptags) if (!x.asFolder && x.name.trim() && !names.includes(x.name)) names.push(x.name)
    return names
  }, [tagChips, ptags, folderNames])

  const selectActions: SelectActions = {
    count: picked.size,
    allTicked: filtered.length > 0 && picked.size === filtered.length,
    folders,
    tagNames,
    onToggleAll: () => setPicked(picked.size === filtered.length ? new Set() : new Set(filtered.map((x) => x.id))),
    onMove: (f) => { moveTo([...picked], f); leaveSelect() },
    onNewFolder: () => setNaming('folder-move'),
    onTag: (name) => { tagThem([...picked], name); leaveSelect() },
    onNewTag: () => setNaming('tag'),
    onExport: () => { exportThem([...picked]); leaveSelect() },
    onDelete: () => { void removeThem([...picked]).then((done) => { if (done) leaveSelect() }) },
    onCancel: leaveSelect,
  }

  const previewActions = (it: PersonaItem) => ({
    inUse: it.p.id === activeId,
    goesWith: it.p.boundCharacterIds.map((id) => characters.find((c) => c.id === id)?.name).filter((n): n is string => !!n),
    tagMeta,
    onOpen: () => open(it.p.id),
    onUse: () => switchPersona(it.p.id, it.p.name),
    onDuplicate: () => { const id = duplicatePersona(it.p.id); setSelectedId(id); setSheetOpen(false); toast.success('Persona duplicated') },
    onDelete: () => { setSheetOpen(false); void removeThem([it.p.id]) },
    onChats: () => { setSheetOpen(false); openChatsForPersona(it.p.id) },
  })

  const sortLabel = (s: PersonaSort) => t(`personas.sort.${s}` as Parameters<typeof t>[0])
  const sortSelect = (
    <Select value={sort} onValueChange={(v) => setSort(v as PersonaSort)}>
      <SelectTrigger className="h-8 w-auto shrink-0" aria-label={t('personas.sort')} data-testid="persona-sort">
        <SelectValue>{sortLabel(sort)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PERSONA_SORTS.map((s) => <SelectItem key={s} value={s}>{sortLabel(s)}</SelectItem>)}
      </SelectContent>
    </Select>
  )

  const importInputEl = <input ref={importInput} type="file" accept="application/json" multiple className="hidden" onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }} />

  const search = (
    <div className="relative min-w-0 flex-1 md:min-w-36 md:max-w-72">
      <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder={t('personas.search')} className="h-10 pl-8 text-sm md:h-8" aria-label={t('personas.search')} />
    </div>
  )

  const header = isMobile ? (
    <header className="flex items-center gap-2 px-3 py-2">
      <PaneTitle section="personas" count={personas.length} />
      {search}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="size-11 shrink-0 p-0" aria-label={t('personas.more')}><DotsThree className="size-5" aria-hidden="true" /></Button>} />
        <DropdownMenuContent align="end">
          {PERSONA_SORTS.map((s) => (
            <DropdownMenuItem key={s} onClick={() => setSort(s)}>
              <Check className={cn('size-4', sort !== s && 'opacity-0')} aria-hidden="true" />{sortLabel(s)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => importInput.current?.click()}><UploadSimple className="size-4" aria-hidden="true" />{t('personas.import')}</DropdownMenuItem>
          <DropdownMenuItem onClick={downloadBackup}><DownloadSimple className="size-4" aria-hidden="true" />{t('personas.backup')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  ) : (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
      <PaneTitle section="personas" count={personas.length} />
      {search}
      <div className="flex items-center gap-1.5 text-muted-foreground"><SortAscending className="size-4" aria-hidden="true" />{sortSelect}</div>
      <Button variant={selectMode ? 'secondary' : 'outline'} size="sm" className="h-8" aria-pressed={selectMode} onClick={() => (selectMode ? leaveSelect() : setSelectMode(true))} data-testid="persona-select-toggle">
        <CheckSquare className="size-4" weight={selectMode ? 'fill' : 'regular'} aria-hidden="true" />{t('personas.selectMode')}
      </Button>
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8" onClick={() => importInput.current?.click()}><UploadSimple className="size-4" aria-hidden="true" />{t('personas.import')}</Button>
        <Button variant="outline" size="sm" className="h-8" onClick={downloadBackup}><DownloadSimple className="size-4" aria-hidden="true" />{t('personas.backup')}</Button>
        <Button className="h-8" onClick={newPersona} data-testid="new-persona"><Plus className="size-4" aria-hidden="true" />{t('personas.new')}</Button>
      </div>
    </header>
  )

  const empty = personas.length === 0 ? (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><UserCircle aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{t('personas.emptyTitle')}</EmptyTitle>
        <EmptyDescription>{t('personas.emptyHint')}</EmptyDescription>
      </EmptyHeader>
      <Button className="h-11 md:h-8" onClick={newPersona}><Plus className="size-4" aria-hidden="true" />{t('personas.new')}</Button>
    </Empty>
  ) : (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><MagnifyingGlass aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{t('personas.noMatchTitle')}</EmptyTitle>
        <EmptyDescription>{t('personas.noMatchHint')}</EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" className="h-11 md:h-8" onClick={clearFilters}>{t('personas.clearFilters')}</Button>
    </Empty>
  )

  const listProps = {
    items, activeId, previewId: previewItem?.p.id ?? null, selectMode, picked, tagMeta,
    onTap: tap, onOpen: open, onTick: tick,
  }

  const allTagsPanel = (
    <AllTagsPanel
      chips={tagChips} counts={tagCounts} active={tagFilter} onToggle={toggleTag}
      onClear={() => { setTagFilter([]); setPage(0) }}
      onManage={() => { setAllTagsOpen(false); setTagManagerOpen(true) }}
      onDone={() => setAllTagsOpen(false)}
    />
  )

  const overview = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {importInputEl}
      {header}
      {!isMobile && folders.length > 0 && (
        <FolderStrip
          folders={folders} folder={folder} counts={folderCount} total={personas.length} noFolder={noFolder}
          onPick={pickFolder} onAdd={() => setNaming('folder')} onDropIds={addToFolder}
        />
      )}
      {!isMobile && personas.length > 0 && (
        <TagFilterRow
          chips={tagChips} counts={tagCounts} active={tagFilter} onToggle={toggleTag}
          onAll={() => setAllTagsOpen(true)} onManage={() => setTagManagerOpen(true)}
          onAddFolder={folders.length === 0 ? () => setNaming('folder') : undefined}
        />
      )}
      {isMobile && (folder !== null || tagFilter.length > 0) && (
        <div className="px-3 pb-2">
          <ActiveFilters folder={folder} folders={folders} tags={tagFilter} onFolder={pickFolder} onTag={toggleTag} onClear={() => { setTagFilter([]); pickFolder(null) }} />
        </div>
      )}
      {!isMobile && selectMode && <SelectBar a={selectActions} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {filtered.length === 0 ? empty : (
            <ScrollArea className="min-h-0 flex-1">
              {isMobile ? <PersonaRows {...listProps} /> : <PersonaGrid {...listProps} />}
              <Pager total={filtered.length} page={pageNo} pageSize={PERSONA_PAGE} onPage={setPage} />
            </ScrollArea>
          )}
        </div>
        {!isMobile && previewItem && <PersonaPreviewPanel item={previewItem} a={previewActions(previewItem)} />}
      </div>
      {isMobile && (selectMode ? <SelectBar a={selectActions} compact /> : (
        <nav className="flex shrink-0 items-stretch border-t border-border bg-card px-1" aria-label={t('personas.tools')} data-testid="persona-bottom-bar">
          <Button variant="ghost" className="h-12 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => setSelectMode(true)} data-testid="persona-select-toggle">
            <CheckSquare className="size-4" aria-hidden="true" />{t('personas.selectMode')}
          </Button>
          <Button variant="ghost" className="relative h-12 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => setFoldersOpen(true)}>
            <FolderIcon className="size-4" aria-hidden="true" />{t('personas.folders.label')}
          </Button>
          <Button variant="ghost" className="relative h-12 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => setAllTagsOpen(true)}>
            <TagIcon className="size-4" aria-hidden="true" />{t('personas.tags.label')}
            {tagFilter.length > 0 && <Badge className="absolute right-3 top-0.5 h-4 min-w-4 px-1 text-[10px]">{tagFilter.length}</Badge>}
          </Button>
          <Button className="m-1.5 h-11 min-w-0 flex-[1.3] gap-1 px-2" onClick={newPersona} data-testid="new-persona">
            <Plus className="size-4" aria-hidden="true" />{t('personas.newShort')}
          </Button>
        </nav>
      ))}
      {isMobile && previewItem && <PersonaPreviewSheet item={previewItem} a={previewActions(previewItem)} open={sheetOpen} onOpenChange={setSheetOpen} />}

      {/* every tag, searchable and sortable: a sheet on a phone, a dialog on desktop */}
      {isMobile ? (
        <>
          <Sheet open={allTagsOpen} onOpenChange={setAllTagsOpen}>
            <SheetContent side="bottom" className="max-h-[80dvh]">
              <SheetHeader><SheetTitle>{t('characters.tagsTitle')}</SheetTitle></SheetHeader>
              {allTagsPanel}
            </SheetContent>
          </Sheet>
          <Sheet open={foldersOpen} onOpenChange={setFoldersOpen}>
            <SheetContent side="bottom" className="max-h-[80dvh]">
              <SheetHeader><SheetTitle>{t('personas.folders.label')}</SheetTitle></SheetHeader>
              <FolderList
                folders={folders} folder={folder} counts={folderCount} total={personas.length} noFolder={noFolder}
                onPick={(f) => { pickFolder(f); setFoldersOpen(false) }}
                onAdd={() => { setFoldersOpen(false); setNaming('folder') }}
              />
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Dialog open={allTagsOpen} onOpenChange={setAllTagsOpen}>
          <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{t('characters.tagsTitle')}</DialogTitle></DialogHeader>
            {allTagsPanel}
          </DialogContent>
        </Dialog>
      )}
      <PersonaNewDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        startTag={startTag}
        onBlank={blankPersona}
        onCreated={(id) => { setSelectedId(id); setDetailOpen(true) }}
        onImportRecords={addRecords}
      />
      <TagManager open={tagManagerOpen} onOpenChange={setTagManagerOpen} tags={ptags} scope="persona" usage={(name) => tagCounts.get(name) ?? 0} />
      <NameDialog
        open={naming === 'folder' || naming === 'folder-move'}
        onOpenChange={(o) => { if (!o) setNaming(null) }}
        title={t('personas.folderTitle')} label={t('personas.folderName')} confirm={t('personas.folderCreate')}
        onSubmit={(name) => {
          const f = makeFolder(name)
          if (naming === 'folder-move') { moveTo([...picked], f); leaveSelect() }
          pickFolder(f)
          toast.success(t('personas.folderCreated', { name: f }))
        }}
      />
      <NameDialog
        open={naming === 'tag'}
        onOpenChange={(o) => { if (!o) setNaming(null) }}
        title={t('personas.tagTitle')} label={t('personas.tagName')} confirm={t('personas.tagCreate')}
        onSubmit={(name) => {
          if (!useApp.getState().tags.some((x) => x.scope === 'persona' && x.name === name)) addTag(name, 'persona')
          tagThem([...picked], name)
          leaveSelect()
        }}
      />
    </div>
  )

  const back = () => setDetailOpen(false)
  useBackClose(detailOpen && !!p, back)

  return (
    <SectionPage section="personas" count={personas.length} hideOnPhone={detailOpen && !!p}>
      {detailOpen && p ? (
        <>
          <PersonaPage
            key={p.id}
            p={p}
            inUse={p.id === activeId}
            confirm={confirm}
            onBack={back}
            onUse={() => switchPersona(p.id, p.name)}
            onDuplicate={() => { setSelectedId(duplicatePersona(p.id)); toast.success('Persona duplicated') }}
            onDelete={() => { void removeThem([p.id]).then((done) => { if (done) back() }) }}
          />
          {confirmDialog}
        </>
      ) : (
        <>
          {overview}
          {confirmDialog}
        </>
      )}
    </SectionPage>
  )
}
