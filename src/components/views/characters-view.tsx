
import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Star, SquaresFour, List, Plus, Chats, Copy, Trash, Tag, DotsThree, CheckSquare, DownloadSimple, Users, FileCode, LinkSimple, UserCircle, Funnel, X, CircleNotch, Check, SortAscending, Folder as FolderIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Textarea } from '@/components/ui/textarea'
import { loadForExport, loadOwnBooks, useApp } from '@/lib/store'
import { useGuidePlace } from '@/components/guide/place'
import type { Character, Chat } from '@/lib/types'
import { PaneTitle, SectionPage, useSectionHost } from '@/components/shell/section-page'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { DEFAULT_AVATAR, cn, readableNameColor } from '@/lib/utils'
import { characterToExportCard } from '@/lib/engine'
import { buildCardPng, downloadCardPng } from '@/lib/png-card'
import { importCardFiles, importAnyCardLink, JANNY_MESSAGE } from '@/lib/card-import'
import { downloadJson } from '@/lib/interop'
import { CharacterEditor } from '@/components/views/character-editor'
import { CardKindBadge } from '@/components/dashboard/card-kind'
import { cardTypeOf } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { folderCounts, folderTags, inFolder, moveToFolder, noFolder, removeFromFolder, resolveFolder } from '@/lib/character-folders'
import { ownBookOnlyFor } from '@/lib/lore-usage'
import { TagManager } from '@/components/tags/tag-manager'
import { TagRow } from '@/components/tags/tag-row'
import { CreateGroupDialog } from '@/components/chat/create-group-dialog'
import { GroupEditor } from '@/components/groups/group-editor'
import { CardMarkers, FolderStrip, MoveToFolderItems, NewFolderDialog } from '@/components/views/characters-list-parts'

type SortKey = 'az' | 'newest' | 'oldest' | 'favorites' | 'recent' | 'chats' | 'tokens' | 'random'
const SORT_OPTIONS: [SortKey, string][] = [
  ['recent', 'Recent'], ['az', 'A–Z'], ['newest', 'Newest'], ['oldest', 'Oldest'],
  ['favorites', 'Favorites'], ['chats', 'Most chats'], ['tokens', 'Most tokens'], ['random', 'Random'],
]

/** The text a list shows and searches: a summary carries the description's start only. */
const listText = (c: Character) => (c.stub ? c.blurb ?? '' : c.description)
/** The card's main texts in tokens: a summary carries the engine's estimate. */
const cardTokens = (c: Character) => (c.stub ? c.tokens ?? 0 : estimateTokens(c.description + c.personality + c.scenario + c.firstMessage + c.exampleDialogue))

/** The card has a lorebook of its own or a linked one (books that were deleted do not count). */
const hasBookIn = (c: Character, bookIds: Set<string>) => (!!c.embeddedLorebookId && bookIds.has(c.embeddedLorebookId)) || c.linkedLorebookIds.some((id) => bookIds.has(id))
/** The card has sprites: a summary carries their count, a whole card the list. */
const hasSprites = (c: Character) => (c.stub ? (c.spriteCount ?? 0) > 0 : c.expressions.some((e) => !!e.url))

/** The Characters section, or the Groups section: the same
 *  page over one kind of card each, so a group is found in the menu rather
 *  than behind a switch inside Characters. */
export function CharactersView({ mode }: { mode: 'characters' | 'groups' }) {
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const activeCharacterId = useApp((s) => s.activeCharacterId)
  const openCharacter = useApp((s) => s.openCharacter)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const newCharacter = useApp((s) => s.newCharacter)
  const hydrate = useApp((s) => s.hydrate)
  const duplicateCharacter = useApp((s) => s.duplicateCharacter)
  const deleteCharacter = useApp((s) => s.deleteCharacter)
  const personas = useApp((s) => s.personas)
  const convertCharacterToPersona = useApp((s) => s.convertCharacterToPersona)
  const loadCharacter = useApp((s) => s.loadCharacter)
  const rosterPending = useApp((s) => s.rosterPending)
  const allTags = useApp((s) => s.tags)
  // the Personas section keeps its own tags in the same list (they carry a scope)
  const tags = useMemo(() => allTags.filter((t) => !t.scope), [allTags])

  const [query, setQuery] = useState('')
  const [grid, setGrid] = useState(true)
  const [sort, setSort] = useState<SortKey>('recent')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  // the folder strip's choice: a tag name, null = All
  const [folderChoice, setFolderChoice] = useState<string | null>(null)
  // "No folder" is a choice of its own; Favourites is a filter that stacks with the folder
  const [unfiled, setUnfiled] = useState(false)
  const [favOnly, setFavOnly] = useState(false)
  // the New folder dialog: the card ids to move into the new folder ([] = just make it); null = closed
  const [newFolderFor, setNewFolderFor] = useState<string[] | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [tagSort, setTagSort] = useState<'count' | 'az'>('count')
  const isMobile = useIsMobile()
  // a page on a phone draws the big title itself (SectionPage); a drawer gets the title in the header
  const titleInPage = useSectionHost() === 'page'
  const addTag = useApp((s) => s.addTag)
  const updateTag = useApp((s) => s.updateTag)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [page, setPage] = useState(0)
  const hydrated = useApp((s) => s.hydrated)
  const importRef = useRef<HTMLInputElement>(null)

  /** Import cards from links: chub, RisuRealm, CharaVault or a direct file
   *  link. The fetch happens engine-side (no CORS, no keys in the browser);
   *  importAnyCardLink picks the route. JannyAI/JanitorAI pages are not
   *  fetched: the toast offers to open the page. */
  const importFromUrl = async () => {
    const urls = urlValue.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'))
    if (!urls.length) return
    setUrlBusy(true)
    let okCount = 0
    for (const url of urls) {
      try {
        const r = await importAnyCardLink(url, hydrate)
        if (r.status === 'browser-only') {
          toast.error(JANNY_MESSAGE, { action: { label: 'Open', onClick: () => window.open(r.openUrl, '_blank', 'noopener,noreferrer') } })
          continue
        }
        okCount++
        toast.success(`Imported ${r.names[0] ?? 'character'}`)
        for (const n of r.notes ?? []) toast.info(n)
      } catch (e) {
        toast.error(url.split('/').pop() ?? url, { description: String((e as Error).message ?? e) })
      }
    }
    if (okCount) {
      setUrlOpen(false)
      setUrlValue('')
      await hydrate()
    }
    setUrlBusy(false)
  }

  /** Real import (PNG and JSON cards, single or bulk): shared with Home. */
  const importFiles = (files: FileList | null) => importCardFiles(files, hydrate)

  /** Real export: V2 PNG card with the JSON spliced into a tEXt chunk. */
  const exportPng = async (listed: (typeof characters)[number]) => {
    try {
      // the list holds a summary: the export needs the whole card
      const c = (await loadCharacter(listed.id)) ?? listed
      if (c.stub) throw new Error(`Could not load ${c.name}: try again.`)
      // the card's own book comes whole too: the list holds only a summary of it
      const books = await loadOwnBooks([c])
      const bytes = await buildCardPng(c.avatar || DEFAULT_AVATAR, characterToExportCard(c, books))
      downloadCardPng(bytes, c.name)
      toast.success(`Exported ${c.name} as a PNG card`)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmBatch, setConfirmBatch] = useState(false)
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const bookIds = useMemo(() => new Set(lorebooks.map((b) => b.id)), [lorebooks])
  const hasBook = (c: Character) => hasBookIn(c, bookIds)
  // an own book nobody else uses goes with its card unless the user says no
  const [alsoBook, setAlsoBook] = useState(true)
  useEffect(() => { if (confirmDelete || confirmBatch) setAlsoBook(true) }, [confirmDelete, confirmBatch])
  const bookName = (id: string | null) => lorebooks.find((b) => b.id === id)?.name ?? ''
  const deletingGroup = !!confirmDelete && !!characters.find((c) => c.id === confirmDelete)?.isGroup
  const singleOwnId = confirmDelete ? ownBookOnlyFor(characters, confirmDelete) : null
  const singleOwn = singleOwnId && lorebooks.some((b) => b.id === singleOwnId) ? singleOwnId : null
  const singleShared = !!confirmDelete && !singleOwn && !!characters.find((c) => c.id === confirmDelete)?.embeddedLorebookId
    && !!lorebooks.find((b) => b.id === characters.find((c) => c.id === confirmDelete)?.embeddedLorebookId)
  const batchOwn = confirmBatch ? selected.map((id) => ownBookOnlyFor(characters, id)).filter((x): x is string => !!x && !!lorebooks.find((b) => b.id === x)) : []
  const batchShared = confirmBatch
    ? selected.filter((id) => { const o = characters.find((c) => c.id === id)?.embeddedLorebookId; return !!o && !batchOwn.includes(o) && !!lorebooks.find((b) => b.id === o) }).length
    : 0
  const [groupOpen, setGroupOpen] = useState(false)
  const [convertTarget, setConvertTarget] = useState<(typeof characters)[number] | null>(null)

  /** A card can become the user's own persona: name, description and avatar
   *  carry over with the {{char}}/{{user}} macros swapped. A same-name
   *  persona is replaced only after the confirm below. */
  const convertToPersona = (c: (typeof characters)[number], overwrite = false) => {
    if (!overwrite && personas.some((p) => p.name === c.name)) {
      setConvertTarget(c)
      return
    }
    // the description moves over: it comes with the whole card
    void loadCharacter(c.id).then(() => {
      if (convertCharacterToPersona(c.id, { overwrite })) toast.success(`${c.name} is now a persona`)
    })
  }

  // the open card belongs to one section: a group left open does not cover the Characters list
  const open = characters.find((c) => c.id === activeCharacterId)
  const active = open && !!open.isGroup === (mode === 'groups') ? open : undefined

  // chats per character, counted once: per card it was a pass over every chat (2,000 cards x
  // thousands of chats froze the page, more so in the sort)
  const chatCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of chats) m.set(ch.characterId, (m.get(ch.characterId) ?? 0) + 1)
    return m
  }, [chats])

  const folders = useMemo(() => folderTags(tags), [tags])
  const folder = resolveFolder(folderChoice, folders)
  // the chosen tag stopped being a folder (unticked, renamed, deleted): back to All, from the first page
  useEffect(() => {
    if (folderChoice !== null && folder === null) { setFolderChoice(null); setPage(0) }
  }, [folderChoice, folder])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    let list = characters.filter((c) =>
      !!c.isGroup === (mode === 'groups') &&
      (!q || c.name.toLowerCase().includes(q) || listText(c).toLowerCase().includes(q) || c.tags.some((t) => t.includes(q))) &&
      (tagFilter.every((t) => c.tags.includes(t))) &&
      (mode === 'groups' || !favOnly || !!c.favorite) &&
      (mode === 'groups' || (unfiled ? noFolder(c, folders) : inFolder(c, folder))),
    )
    const chatCount = (id: string) => chatCounts.get(id) ?? 0
    switch (sort) {
      case 'az': list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
      case 'newest': list = [...list].sort((a, b) => b.createdAt - a.createdAt); break
      case 'oldest': list = [...list].sort((a, b) => a.createdAt - b.createdAt); break
      case 'favorites': list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite)); break
      case 'recent': list = [...list].sort((a, b) => b.lastChatAt - a.lastChatAt); break
      case 'chats': list = [...list].sort((a, b) => chatCount(b.id) - chatCount(a.id)); break
      case 'tokens': list = [...list].sort((a, b) => cardTokens(b) - cardTokens(a)); break
      case 'random': list = [...list].sort(() => Math.random() - 0.5); break
    }
    return list
  }, [characters, chatCounts, query, sort, tagFilter, mode, folder, folders, unfiled, favOnly])

  const soloCards = useMemo(() => characters.filter((c) => !c.isGroup), [characters])
  const groupCards = useMemo(() => characters.filter((c) => c.isGroup), [characters])
  const shownCount = mode === 'groups' ? groupCards.length : soloCards.length
  const favorites = soloCards.filter((c) => c.favorite)
  const unfiledCount = useMemo(() => soloCards.filter((c) => noFolder(c, folders)).length, [soloCards, folders])

  /** Tag filter chips: the tag manager owns color, visibility and order —
   *  tags in use but never configured in the manager fall back to neutral
   *  chips at the end (alphabetical). */
  const tagChips = useMemo(() => {
    const meta = new Map(tags.map((t) => [t.name, t]))
    return Array.from(new Set(soloCards.flatMap((c) => c.tags)))
      .filter((name) => meta.get(name)?.visible !== false)
      .sort((a, b) => {
        const oa = meta.get(a)?.order ?? Number.MAX_SAFE_INTEGER
        const ob = meta.get(b)?.order ?? Number.MAX_SAFE_INTEGER
        return oa !== ob ? oa - ob : a.localeCompare(b)
      })
      .map((name) => ({ name, tag: meta.get(name) }))
  }, [soloCards, tags])

  const folderCount = useMemo(() => folderCounts(soloCards, folders), [soloCards, folders])
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of soloCards) for (const tg of c.tags) m.set(tg, (m.get(tg) ?? 0) + 1)
    return m
  }, [soloCards])
  const panelChips = useMemo(() => {
    const q = tagQuery.trim().toLowerCase()
    const list = tagChips.filter(({ name }) => !q || name.toLowerCase().includes(q))
    return tagSort === 'az'
      ? [...list].sort((a, b) => a.name.localeCompare(b.name))
      : [...list].sort((a, b) => (tagCounts.get(b.name) ?? 0) - (tagCounts.get(a.name) ?? 0) || a.name.localeCompare(b.name))
  }, [tagChips, tagQuery, tagSort, tagCounts])
  const PAGE_SIZE = 24
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page])
  // the portraits the list left out, for the cards on this page
  const wantAvatars = useApp((s) => s.wantAvatars)
  useEffect(() => { wantAvatars(paged.map((c) => c.id)) }, [paged, wantAvatars])

  // the list is a place of its own; an open editor is not
  useGuidePlace(mode === 'groups' ? 'groups' : 'characters', hydrated && !active)

  if (active?.isGroup && active.group) {
    return <GroupEditor group={active} onClose={() => openCharacter(null)} />
  }
  if (active?.stub) {
    // the list holds a summary: the editor waits for the whole card (the store is loading it)
    return (
      <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t('characters.loadingCard', { name: active.name })}
      </div>
    )
  }
  if (active) {
    return <CharacterEditor key={active.id} character={active} onClose={() => openCharacter(null)} />
  }

  const tagChip = (name: string, tag: (typeof tagChips)[number]['tag'], big?: boolean) => {
    const n = soloCards.filter((c) => c.tags.includes(name)).length
    const active = tagFilter.includes(name)
    return (
      <button
        key={name}
        type="button"
        aria-pressed={active}
        onClick={() => { setTagFilter((f) => f.includes(name) ? f.filter((x) => x !== name) : [...f, name]); setPage(0) }}
        style={tag ? { backgroundColor: tag.color, color: tag.textColor, borderColor: 'transparent' } : undefined}
        className={cn(
          'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption transition-colors',
          big && 'h-8 px-3 text-xs',
          active ? 'font-medium' : 'hover:text-foreground',
          !tag && (active ? 'border-transparent bg-accent text-accent-foreground' : 'border-border text-muted-foreground'),
          tag && !active && 'opacity-75 hover:opacity-100',
          tag && active && big && 'ring-2 ring-primary',
        )}
      >
        {name} <span className="opacity-60">{n}</span>
      </button>
    )
  }

  // folders: a card carries a folder's name in its tags; moving adds it (a card may sit in several folders)
  /** Applies one change to each card; returns how many changed. */
  const retag = (ids: string[], next: (tags: string[]) => string[]): number => {
    let changed = 0
    for (const id of ids) {
      const c = characters.find((x) => x.id === id)
      if (!c) continue
      const tags = next(c.tags)
      if (tags.length === c.tags.length && tags.every((x, i) => x === c.tags[i])) continue
      updateCharacter(id, { tags })
      changed++
    }
    return changed
  }
  const noChange = () => toast.info(t('characters.folders.nothing'))
  const pickFolder = (name: string, ids: string[]) => {
    const n = retag(ids, (tags) => moveToFolder(tags, name, folders))
    if (n) toast.success(t('characters.folders.moved', { n, folder: name })); else noChange()
  }
  const takeOutOfFolder = (name: string, ids: string[]) => {
    const n = retag(ids, (tags) => removeFromFolder(tags, name))
    if (n) toast.success(t('characters.folders.removed', { n, folder: name })); else noChange()
  }
  const clearFolders = (ids: string[]) => {
    const n = retag(ids, (tags) => moveToFolder(tags, null, folders))
    if (n) toast.success(t('characters.folders.cleared', { n })); else noChange()
  }
  /** Makes the tag a folder: a new tag is made with it set, an existing tag is ticked as a folder. Returns the name. */
  const createFolder = (raw: string): string | null => {
    const name = raw.trim()
    if (!name) return null
    const find = () => useApp.getState().tags.find((x) => x.name === name && !x.scope)
    const have = find()
    if (have) {
      if (!have.asFolder) updateTag(have.id, { asFolder: true })
    } else {
      addTag(name)
      const made = find()
      if (made) updateTag(made.id, { asFolder: true })
    }
    return name
  }
  const onNewFolder = (raw: string) => {
    const name = createFolder(raw)
    if (!name) return
    toast.success(t('characters.folders.created', { name }))
    const ids = newFolderFor ?? []
    if (ids.length) pickFolder(name, ids)
    else { setFolderChoice(name); setUnfiled(false); setPage(0) }
  }

  const newButton = mode === 'groups' ? (
    <Button data-guide="groups.create" className="h-10 shrink-0 md:h-8" data-testid="new-group" onClick={() => setGroupOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />{t('groups.create')}
    </Button>
  ) : (
    <Button size="lg" data-guide="characters.new" className="max-md:h-10 shrink-0" data-testid="new-character" onClick={() => { const id = newCharacter(); openCharacter(id) }}>
      <Plus className="size-4" aria-hidden="true" />{t('characters.createCharacter')}
    </Button>
  )

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="outline" className="size-10 shrink-0 p-0 md:size-8 2xl:w-auto 2xl:gap-1.5 2xl:px-2.5 2xl:text-xs" aria-label={t('characters.sort')} title={t('characters.sort')}>
          <SortAscending className="size-4" aria-hidden="true" />
          <span className="max-2xl:hidden">{SORT_OPTIONS.find(([v]) => v === sort)?.[1]}</span>
        </Button>
      } />
      <DropdownMenuContent align="end">
        {SORT_OPTIONS.map(([v, label]) => (
          <DropdownMenuItem key={v} onClick={() => { setSort(v); setPage(0) }}>
            <Check className={cn('size-4', sort !== v && 'opacity-0')} aria-hidden="true" />{label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const viewToggle = (
    <Button variant="ghost" className="size-10 p-0 md:size-8" onClick={() => setGrid(!grid)} aria-label={grid ? t('characters.viewList') : t('characters.viewGrid')} title={grid ? t('characters.viewList') : t('characters.viewGrid')}>
      {grid ? <List className="size-4" aria-hidden="true" /> : <SquaresFour className="size-4" aria-hidden="true" />}
    </Button>
  )

  // the rare tools: select several, import, the tags and folders (the tag row keeps the common ones)
  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button data-guide="characters.more" variant="outline" className="size-10 shrink-0 p-0 md:size-8" aria-label={t('characters.more')} title={t('characters.more')}>
          <DotsThree className="size-4" aria-hidden="true" />
        </Button>
      } />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { setBatchMode(!batchMode); setSelected([]) }}>
          <CheckSquare className="size-4" weight={batchMode ? 'fill' : 'regular'} aria-hidden="true" />{t('characters.selectMode')}
          {batchMode && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('characters.import')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => importRef.current?.click()}>
          <FileCode className="size-4" aria-hidden="true" />{t('characters.importFiles')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setUrlOpen(true)}>
          <LinkSimple className="size-4" aria-hidden="true" />{t('characters.importUrl')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTagManagerOpen(true)}>
          <Tag className="size-4" aria-hidden="true" />{t('characters.moreManage')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const tagsPanel = (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4 md:px-0 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder={t('characters.tagsFind')} className="h-10 min-w-40 flex-1 text-sm md:h-8" aria-label={t('characters.tagsFind')} />
        <div role="group" aria-label={t('characters.tagsTitle')} className="flex gap-1">
          {(['count', 'az'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={tagSort === k} onClick={() => setTagSort(k)} className={cn('h-10 rounded-md border px-2.5 text-xs md:h-8', tagSort === k ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-accent/60')}>
              {t(k === 'count' ? 'characters.tagsByCount' : 'characters.tagsByName')}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" data-testid="all-tags-list">
        {panelChips.map(({ name, tag }) => tagChip(name, tag, true))}
        {tagChips.length === 0 && <span className="text-xs text-muted-foreground">{t('characters.tagsNone')}</span>}
        {tagChips.length > 0 && panelChips.length === 0 && <span className="text-xs text-muted-foreground">{t('characters.tagsNoMatch')}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-10 md:h-8" onClick={() => setTagManagerOpen(true)}>
          <Tag className="size-4" aria-hidden="true" />{t('characters.tagsManage')}
        </Button>
        {tagFilter.length > 0 && (
          <Button variant="ghost" className="h-10 md:h-8" onClick={() => { setTagFilter([]); setPage(0) }}>{t('characters.tagsClear')}</Button>
        )}
        <Button className="ml-auto h-10 md:h-8" onClick={() => setFilterOpen(false)}>{t('characters.tagsDone')}</Button>
      </div>
    </div>
  )

  const batchActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <span className="text-caption text-muted-foreground">{selected.length} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="outline" size="sm" className="h-8 text-caption max-md:h-10" data-testid="batch-move-folder">
            <FolderIcon className="size-3.5" aria-hidden="true" />{t('characters.folders.move')}
          </Button>
        } />
        <DropdownMenuContent align="end">
          <MoveToFolderItems
            folders={folders}
            onPick={(name) => pickFolder(name, selected)}
            onNew={() => setNewFolderFor(selected)}
            onNone={() => clearFolders(selected)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" className="h-8 text-caption max-md:h-10" onClick={() => void (async () => {
        try {
          // the list holds summaries of cards and of their books: the export needs both whole
          const { cards, books } = await loadForExport(characters.filter((c) => selected.includes(c.id) && !c.isGroup).map((c) => c.id))
          downloadJson(cards.map((c) => characterToExportCard(c, books)), `characters-${cards.length}`)
          setSelected([])
          toast.success(`Exported ${cards.length} card${cards.length === 1 ? '' : 's'} as JSON`)
        } catch (e) {
          toast.error(String((e as Error).message ?? e))
        }
      })()}>
        <DownloadSimple className="size-3.5" aria-hidden="true" />Export
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-caption max-md:h-10" onClick={() => setConfirmBatch(true)}>
        <Trash className="size-3.5" aria-hidden="true" />Delete
      </Button>
    </div>
  )

  return (
    <SectionPage section={mode} count={shownCount} actions={newButton}>
    <div className="flex h-full min-h-0 flex-col">
      {/* header + tag filter + favorites scroll WITH the grid — a pinned
          toolbar eats the viewport on mobile once the keyboard opens */}
      <ScrollArea className="min-h-0 flex-1">
      <input
        ref={importRef}
        type="file"
        accept=".png,.json"
        multiple
        className="sr-only"
        onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }}
        aria-label="Import character cards"
      />
      {/* the header in rows, hairlines between them: title and New (a drawer; on a phone the page's own title
          carries New), search and sort, the folders, the tags and tools, the active filters, the selection bar */}
      <header className="flex flex-col divide-y divide-border border-b border-border">
        {!titleInPage && (
          <div className="flex items-center gap-3 px-3 py-3 md:px-4 md:py-2.5">
            <PaneTitle section={mode} count={shownCount} />
            <div className="ml-auto flex shrink-0 items-center">{newButton}</div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 md:px-4">
          <div className="relative min-w-0 flex-1 md:max-w-80">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder={mode === 'groups' ? t('groups.search') : t('characters.search')} className="h-10 pl-8 text-sm md:h-8" aria-label={mode === 'groups' ? t('groups.search') : t('characters.search')} />
          </div>
          {mode === 'characters' && sortMenu}
        </div>
        {mode === 'characters' && (<>
          <FolderStrip
            folders={folders}
            counts={folderCount}
            total={soloCards.length}
            favourites={favorites.length}
            unfiled={unfiledCount}
            folder={folder}
            unfiledOn={unfiled}
            favOn={favOnly}
            onFolder={(name) => { setFolderChoice(name); setUnfiled(false); setPage(0) }}
            onUnfiled={() => { setFolderChoice(null); setUnfiled(true); setPage(0) }}
            onFavourites={() => { setFavOnly((v) => !v); setPage(0) }}
            onNew={() => setNewFolderFor([])}
          />
          {/* the tag row: on desktop the tags in use (two rows at most; the rest is behind All tags), on a phone
              the tags live in the All tags sheet */}
          <div className="flex items-start gap-2 px-3 py-2 md:gap-1.5 md:px-4 md:py-1.5">
            {!isMobile && <TagRow chips={tagChips} counts={tagCounts} render={(name, tag) => tagChip(name, tag)} />}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-1 md:pt-0.5">
              <Button variant="outline" size="sm" className="h-10 px-2.5 text-caption md:h-6 md:px-2" onClick={() => setFilterOpen(true)} data-testid="all-tags">
                <Funnel className="size-3.5" aria-hidden="true" />{t('characters.allTags', { n: tagChips.length })}
                {tagFilter.length > 0 && <Badge className="h-4 min-w-4 px-1 text-caption">{tagFilter.length}</Badge>}
              </Button>
              {!isMobile && (
                <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-caption" onClick={() => setTagManagerOpen(true)}>
                  <Tag className="size-3.5" aria-hidden="true" />{t('characters.tagsManage')}
                </Button>
              )}
              {viewToggle}
              {moreMenu}
            </div>
          </div>
          {/* active tag filters on a phone, each with its own way out; the chips scroll sideways */}
          {isMobile && tagFilter.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
              {tagFilter.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setTagFilter((f) => f.filter((x) => x !== name)); setPage(0) }}
                  className="flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent px-3 text-caption text-accent-foreground"
                  aria-label={`Remove the ${name} filter`}
                >
                  {name}<X className="size-3" aria-hidden="true" />
                </button>
              ))}
              <Button variant="ghost" className="h-10 shrink-0 px-2 text-caption" onClick={() => { setTagFilter([]); setPage(0) }}>{t('characters.tagsClear')}</Button>
            </div>
          )}
        </>)}
        {mode === 'characters' && batchMode && selected.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 md:px-4">{batchActions}</div>
        )}
      </header>

      <CreateGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />
      <NewFolderDialog open={newFolderFor !== null} onOpenChange={(o) => { if (!o) setNewFolderFor(null) }} onCreate={onNewFolder} />

      {/* the first start after an update builds the list in the background: say more are coming */}
      {mode === 'characters' && rosterPending > 0 && (
        <p role="status" className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
          {t('characters.listFilling', { n: rosterPending })}
        </p>
      )}

      {/* favorites hotswap bar */}
      {mode === 'characters' && favorites.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
          <Star className="size-3.5 text-primary" aria-hidden="true" />
          {favorites.map((c) => (
            <button key={c.id} type="button" onClick={() => { void startChatAndOpen(c.id) }} title={`Quick chat with ${c.name}`} className="transition-transform hover:scale-110">
              <Avatar className="size-7 rounded-md">
                <AvatarImage src={c.avatar || DEFAULT_AVATAR} alt={c.name} />
                <AvatarFallback>{c.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
            </button>
          ))}
        </div>
      )}

        {mode === 'groups' ? (
          <GroupTiles groups={filtered} chats={chats} onCreate={() => setGroupOpen(true)} onDelete={setConfirmDelete} hasAny={groupCards.length > 0} />
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Users aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No characters match</EmptyTitle>
              <EmptyDescription>Clear the search or tag filters, or import a card.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : grid ? (
          <div data-guide="characters.grid" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {paged.map((c) => {
              const chatCount = chatCounts.get(c.id) ?? 0
              const tokens = cardTokens(c)
              return (
                <div key={c.id} className={cn('group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50', selected.includes(c.id) && 'border-primary')}>
                  {batchMode && (
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onCheckedChange={(v) => setSelected((s) => v ? [...s, c.id] : s.filter((x) => x !== c.id))}
                      className="absolute left-2 top-2 z-10 bg-background"
                      aria-label={`Select ${c.name}`}
                    />
                  )}
                  <button type="button" className="flex flex-col text-left" onClick={() => batchMode ? setSelected((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]) : openCharacter(c.id)}>
                    {c.avatarLazy
                      ? <span role="img" aria-label={t('characters.portraitLoading', { name: c.name })} className="block aspect-square w-full animate-pulse bg-muted" />
                      : c.avatar && !c.avatar.endsWith('avatar-default.png') ? <img src={c.avatar} alt={c.name} className="aspect-square w-full object-cover" /> : <NoPortrait name={c.name} />}
                    <span className="flex flex-col gap-1 p-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: readableNameColor(c.colors.name) }}>
                        {c.name}
                        {c.favorite && <Star weight="fill" className="size-3 text-primary" aria-hidden="true" />}
                        {c.isGroup && <Badge variant="outline" className="border-group/50 text-[10px] text-group">group</Badge>}
                      </span>
                      <CardKindBadge type={cardTypeOf(c)} className="w-fit" />
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        {chatCount > 0 && (
                          <span className="flex items-center gap-1 font-semibold tabular-nums text-sky-600 dark:text-sky-400"><Chats className="size-4" weight="fill" aria-hidden="true" />{t('characters.chatsN', { n: chatCount })}</span>
                        )}
                        <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{c.stub ? '~' : ''}{t('characters.tokensN', { n: formatTokens(tokens) })}</span>
                        <CardMarkers lore={hasBook(c)} sprites={hasSprites(c)} />
                      </span>
                    </span>
                  </button>
                  {/* touch has no hover: the kebab must not depend on it */}
                  <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="size-7 p-0" aria-label={`${c.name} actions`}><DotsThree className="size-4" aria-hidden="true" /></Button>} />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { void startChatAndOpen(c.id) }}>
                          <Chats className="size-4" aria-hidden="true" />New chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateCharacter(c.id, { favorite: !c.favorite })}>
                          <Star className="size-4" aria-hidden="true" />{c.favorite ? 'Unfavorite' : 'Favorite'}
                        </DropdownMenuItem>
                        {!c.isGroup && (
                          <>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <FolderIcon className="size-4" aria-hidden="true" />{t('characters.folders.move')}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <MoveToFolderItems
                                  folders={folders}
                                  current={folders.filter((f) => c.tags.includes(f.name)).map((f) => f.name)}
                                  onPick={(name) => pickFolder(name, [c.id])}
                                  onRemove={(name) => takeOutOfFolder(name, [c.id])}
                                  onNew={() => setNewFolderFor([c.id])}
                                  onNone={() => clearFolders([c.id])}
                                />
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => { duplicateCharacter(c.id); toast.success('Duplicated') }}>
                              <Copy className="size-4" aria-hidden="true" />Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => convertToPersona(c)}>
                              <UserCircle className="size-4" aria-hidden="true" />Convert to persona
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void exportPng(c)}>
                              <DownloadSimple className="size-4" aria-hidden="true" />Export PNG
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(c.id)}>
                          <Trash className="size-4" aria-hidden="true" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {paged.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-accent/50">
                {batchMode && (
                  <Checkbox checked={selected.includes(c.id)} onCheckedChange={(v) => setSelected((s) => v ? [...s, c.id] : s.filter((x) => x !== c.id))} aria-label={`Select ${c.name}`} />
                )}
                <button type="button" onClick={() => openCharacter(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar className="size-9 rounded-md">
                    <AvatarImage src={c.avatar || DEFAULT_AVATAR} alt="" />
                    <AvatarFallback>{c.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {c.name}
                      {c.favorite && <Star weight="fill" className="size-3 text-primary" aria-hidden="true" />}
                      <CardKindBadge type={cardTypeOf(c)} className="px-1.5 py-0 text-[10px]" />
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">{listText(c)}</span>
                  </span>
                  <span className="hidden gap-1 sm:flex">
                    {c.tags.slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                  </span>
                </button>
                <Button variant="ghost" size="sm" onClick={() => { void startChatAndOpen(c.id) }} aria-label={`New chat with ${c.name}`}>
                  <Chats className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 py-3 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>{page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </ScrollArea>

      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import from a link</DialogTitle>
          </DialogHeader>
          <Textarea
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder={"https://chub.ai/characters/user/name\nhttps://realm.risuai.net/character/...\nhttps://charavault.net/cards/..."}
            aria-label="Card links, one per line"
            rows={5}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setUrlOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={urlBusy || !urlValue.trim()} onClick={() => void importFromUrl()}>
              {urlBusy ? 'Fetching…' : 'Import'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TagManager open={tagManagerOpen} onOpenChange={setTagManagerOpen} tags={tags} usage={(name) => characters.filter((c) => c.tags.includes(name)).length} />
      {/* every tag, searchable and sortable: a sheet on a phone, a dialog on desktop */}
      {isMobile ? (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh]">
            <SheetHeader>
              <SheetTitle>{t('characters.tagsTitle')}</SheetTitle>
            </SheetHeader>
            {tagsPanel}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('characters.tagsTitle')}</DialogTitle>
            </DialogHeader>
            {tagsPanel}
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deletingGroup ? 'Delete this group?' : 'Delete this character?'}</AlertDialogTitle>
            <AlertDialogDescription>{deletingGroup
              ? 'This removes the group and all of its chats. Its members stay. This cannot be undone.'
              : 'This removes the character and all of their chats. This cannot be undone.'}</AlertDialogDescription>
            {singleOwn && (
              <label className="mt-2 flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={alsoBook} onChange={(e) => setAlsoBook(e.target.checked)} />
                <span>{t('lore.del.alsoBook', { name: bookName(singleOwn) })}</span>
              </label>
            )}
            {singleShared && <p className="mt-2 text-xs text-muted-foreground">{t('lore.del.sharedNote')}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) deleteCharacter(confirmDelete, { withBook: !!singleOwn && alsoBook }); setConfirmDelete(null); toast.success(deletingGroup ? 'Group deleted' : 'Character deleted') }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!convertTarget} onOpenChange={(o) => !o && setConvertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the existing persona?</AlertDialogTitle>
            <AlertDialogDescription>
              A persona named {convertTarget?.name} already exists. Its description and avatar become this character's.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (convertTarget) convertToPersona(convertTarget, true); setConvertTarget(null) }}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBatch} onOpenChange={setConfirmBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.length} characters?</AlertDialogTitle>
            <AlertDialogDescription>Their cards and every chat with them are removed. This cannot be undone.</AlertDialogDescription>
            {batchOwn.length > 0 && (
              <label className="mt-2 flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={alsoBook} onChange={(e) => setAlsoBook(e.target.checked)} />
                <span>{batchOwn.length === 1 ? t('lore.del.alsoBook', { name: bookName(batchOwn[0]!) }) : t('lore.del.alsoBooks', { n: batchOwn.length })}</span>
              </label>
            )}
            {batchShared > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('lore.del.sharedNote')}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { selected.forEach((id) => deleteCharacter(id, { withBook: alsoBook && batchOwn.length > 0 })); setSelected([]); setConfirmBatch(false); toast.success('Deleted') }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selected.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </SectionPage>
  )
}

/** The card has no portrait: a neutral silhouette and the words, not a "?" that reads as a broken image. */
function NoPortrait({ name }: { name: string }) {
  return (
    <span role="img" aria-label={`${name}: no portrait`} className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
      <UserCircle className="size-1/3" weight="light" aria-hidden="true" />
      <span className="text-[11px]">No portrait</span>
    </span>
  )
}

function GroupTiles({ groups, chats, onCreate, onDelete, hasAny }: {
  groups: Character[]; chats: Chat[]; onCreate: () => void; onDelete: (id: string) => void; hasAny: boolean
}) {
  const t = useT()
  const openCharacter = useApp((s) => s.openCharacter)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const characters = useApp((s) => s.characters)
  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Users aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{hasAny ? t('groups.noMatch') : t('groups.empty')}</EmptyTitle>
          {!hasAny && <EmptyDescription>{t('groups.emptyHint')}</EmptyDescription>}
        </EmptyHeader>
        {!hasAny && <Button size="sm" onClick={onCreate}><Users className="size-4" aria-hidden="true" />{t('groups.create')}</Button>}
      </Empty>
    )
  }
  return (
    <div data-guide="groups.list" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {groups.map((c) => {
        const members = (c.group?.memberIds ?? []).map((id) => characters.find((m) => m.id === id)).filter((m): m is Character => !!m)
        const chatCount = chats.filter((ch) => ch.characterId === c.id).length
        return (
          <div key={c.id} className="group relative flex flex-col overflow-hidden rounded-lg border border-group/35 bg-card transition-colors hover:border-group">
            <button type="button" className="flex flex-col text-left" onClick={() => openCharacter(c.id)}>
              {c.group?.avatar ? (
                <img src={c.group.avatar} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className={cn('grid aspect-square w-full grid-cols-2 bg-muted', members.length > 2 ? 'grid-rows-2' : 'grid-rows-1')}>
                  {members.slice(0, 4).map((m, i) => (
                    <img key={m.id} src={m.avatar || DEFAULT_AVATAR} alt="" className={cn('size-full min-h-0 min-w-0 object-cover', members.length === 3 && i === 0 && 'row-span-2')} />
                  ))}
                </div>
              )}
              <span className="flex flex-col gap-1 p-2.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="min-w-0 truncate">{c.name}</span>
                  {c.favorite && <Star weight="fill" className="size-3 shrink-0 text-primary" aria-hidden="true" />}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5 font-medium text-group"><Users className="size-3" weight="fill" aria-hidden="true" />{members.length} {members.length === 1 ? 'member' : 'members'}</span>
                  <span className="flex items-center gap-0.5"><Chats className="size-3" aria-hidden="true" />{chatCount} {chatCount === 1 ? 'chat' : 'chats'}</span>
                </span>
              </span>
            </button>
            <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="size-7 p-0" aria-label={`${c.name} actions`}><DotsThree className="size-4" aria-hidden="true" /></Button>} />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { void startChatAndOpen(c.id) }}>
                    <Chats className="size-4" aria-hidden="true" />New chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateCharacter(c.id, { favorite: !c.favorite })}>
                    <Star className="size-4" aria-hidden="true" />{c.favorite ? 'Unfavorite' : 'Favorite'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(c.id)}>
                    <Trash className="size-4" aria-hidden="true" />Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}
    </div>
  )
}
