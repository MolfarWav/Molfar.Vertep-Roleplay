
import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Star, SquaresFour, List, Plus, UploadSimple, Chats, Copy, Trash, Tag, DotsThree, DotsThreeVertical, CheckSquare, DownloadSimple, Users, FileCode, LinkSimple, UserCircle, Funnel, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/store'
import { useGuidePlace } from '@/components/guide/place'
import { GUIDE_LIST_EVENT } from '@/components/guide/events'
import type { Character, Chat } from '@/lib/types'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
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
import { ownBookOnlyFor } from '@/lib/lore-usage'
import { CreateGroupDialog } from '@/components/chat/create-group-dialog'
import { GroupEditor } from '@/components/groups/group-editor'

/** Characters | Groups: kept per page session, so coming back from an editor lands on the same side. */
let lastMode: 'characters' | 'groups' = 'characters'

/** The guide's "Show me": a Characters view that is not mounted yet reads this when it
 *  opens; one that is, listens for GUIDE_LIST_EVENT. */
export function showCharactersList(m: 'characters' | 'groups') {
  lastMode = m
  window.dispatchEvent(new CustomEvent(GUIDE_LIST_EVENT, { detail: m }))
}

type SortKey = 'az' | 'newest' | 'oldest' | 'favorites' | 'recent' | 'chats' | 'tokens' | 'random'
const SORT_OPTIONS: [SortKey, string][] = [
  ['recent', 'Recent'], ['az', 'A–Z'], ['newest', 'Newest'], ['oldest', 'Oldest'],
  ['favorites', 'Favorites'], ['chats', 'Most chats'], ['tokens', 'Most tokens'], ['random', 'Random'],
]

export function CharactersView() {
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
  const settings = useApp((s) => s.settings)
  const tags = useApp((s) => s.tags)

  const [query, setQuery] = useState('')
  const [grid, setGrid] = useState(true)
  const [sort, setSort] = useState<SortKey>('recent')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const isMobile = useIsMobile()
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [page, setPage] = useState(0)
  const [mode, setModeState] = useState<'characters' | 'groups'>(lastMode)
  const setMode = (m: 'characters' | 'groups') => { lastMode = m; setModeState(m); setPage(0) }
  useEffect(() => {
    const on = (e: Event) => {
      const m = (e as CustomEvent<string>).detail
      if (m === 'characters' || m === 'groups') { lastMode = m; setModeState(m); setPage(0) }
    }
    window.addEventListener(GUIDE_LIST_EVENT, on)
    return () => window.removeEventListener(GUIDE_LIST_EVENT, on)
  }, [])
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
  const exportPng = async (c: (typeof characters)[number]) => {
    try {
      const bytes = await buildCardPng(c.avatar || DEFAULT_AVATAR, characterToExportCard(c, useApp.getState().lorebooks))
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
    if (convertCharacterToPersona(c.id, { overwrite })) toast.success(`${c.name} is now a persona`)
  }

  const active = characters.find((c) => c.id === activeCharacterId)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    let list = characters.filter((c) =>
      !!c.isGroup === (mode === 'groups') &&
      (!q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q))) &&
      (tagFilter.every((t) => c.tags.includes(t))),
    )
    const chatCount = (id: string) => chats.filter((ch) => ch.characterId === id).length
    switch (sort) {
      case 'az': list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
      case 'newest': list = [...list].sort((a, b) => b.createdAt - a.createdAt); break
      case 'oldest': list = [...list].sort((a, b) => a.createdAt - b.createdAt); break
      case 'favorites': list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite)); break
      case 'recent': list = [...list].sort((a, b) => b.lastChatAt - a.lastChatAt); break
      case 'chats': list = [...list].sort((a, b) => chatCount(b.id) - chatCount(a.id)); break
      case 'tokens': list = [...list].sort((a, b) => estimateTokens(b.description) - estimateTokens(a.description)); break
      case 'random': list = [...list].sort(() => Math.random() - 0.5); break
    }
    return list
  }, [characters, chats, query, sort, tagFilter, mode])

  const soloCards = useMemo(() => characters.filter((c) => !c.isGroup), [characters])
  const groupCards = useMemo(() => characters.filter((c) => c.isGroup), [characters])
  const shownCount = mode === 'groups' ? groupCards.length : soloCards.length
  const favorites = soloCards.filter((c) => c.favorite)

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

  const PAGE_SIZE = 24
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page])

  // the list is a place of its own; an open editor is not
  useGuidePlace(mode === 'groups' ? 'groups' : 'characters', hydrated && !active)

  if (active?.isGroup && active.group) {
    return <GroupEditor group={active} onClose={() => openCharacter(null)} />
  }
  if (active) {
    return <CharacterEditor character={active} onClose={() => openCharacter(null)} />
  }

  // two clearly separate tabs, each in its own colour: characters take the
  // theme's accent, groups the group hue the group tiles and group chats share
  const modeSwitch = (
    <div data-guide="characters.switch" role="group" aria-label={t('groups.switch')} className="flex gap-1 max-md:min-w-0 max-md:flex-1">
      {(['characters', 'groups'] as const).map((m) => {
        const on = mode === m
        const Icon = m === 'groups' ? Users : UserCircle
        const n = m === 'groups' ? groupCards.length : soloCards.length
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => { setMode(m); setPage(0) }}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors max-md:h-10 max-md:min-w-0 max-md:flex-1 max-md:justify-center',
              on
                ? m === 'groups' ? 'border-group/60 bg-group/15 text-group' : 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" weight={on ? 'fill' : 'regular'} aria-hidden="true" />
            <span className="truncate">{t(m === 'groups' ? 'groups.switchGroups' : 'groups.switchCharacters')}</span>
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', on ? 'bg-background/60' : 'bg-muted')}>{n}</span>
          </button>
        )
      })}
    </div>
  )

  const batchActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      <Button variant="outline" size="sm" className="h-6 text-xs max-md:h-9" onClick={() => {
        const picked = characters.filter((c) => selected.includes(c.id) && !c.isGroup)
        downloadJson(picked.map((c) => characterToExportCard(c, useApp.getState().lorebooks)), `characters-${picked.length}`)
        setSelected([])
        toast.success(`Exported ${picked.length} card${picked.length === 1 ? '' : 's'} as JSON`)
      }}>
        <DownloadSimple className="size-3.5" aria-hidden="true" />Export
      </Button>
      <Button variant="outline" size="sm" className="h-6 text-xs max-md:h-9" onClick={() => setConfirmBatch(true)}>
        <Trash className="size-3.5" aria-hidden="true" />Delete
      </Button>
    </div>
  )

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
          'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors',
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

  return (
    <SectionPage section="characters" count={shownCount} title={mode === 'groups' ? t('groups.switchGroups') : undefined}>
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
      {isMobile ? (
        // phone: the switch and one primary button, then search, Filter and More; the rest is in the menus
        <header className="flex flex-col gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            {modeSwitch}
            {mode === 'characters' ? (
              <Button className="h-10 shrink-0" onClick={() => { const id = newCharacter(); openCharacter(id) }}>
                <Plus className="size-4" aria-hidden="true" />New
              </Button>
            ) : (
              <Button data-guide="groups.create" className="h-10 shrink-0 bg-group text-group-foreground hover:bg-group/85" onClick={() => setGroupOpen(true)}>
                <Users className="size-4" aria-hidden="true" />{t('groups.create')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder={mode === 'groups' ? t('groups.search') : 'Search characters…'} className="h-10 pl-8 text-sm" aria-label={mode === 'groups' ? t('groups.search') : 'Search characters'} />
            </div>
            {mode === 'characters' && (
              <Button variant="outline" className="h-10 shrink-0" onClick={() => setFilterOpen(true)}>
                <Funnel className="size-4" aria-hidden="true" />Filter
                {tagFilter.length > 0 && <Badge className="h-5 min-w-5 px-1 text-[10px]">{tagFilter.length}</Badge>}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button data-guide="characters.import" variant="outline" className="size-10 shrink-0 p-0" aria-label="More">
                  <DotsThreeVertical className="size-5" aria-hidden="true" />
                </Button>
              } />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => importRef.current?.click()}>
                  <FileCode className="size-4" aria-hidden="true" />Import from files…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUrlOpen(true)}>
                  <LinkSimple className="size-4" aria-hidden="true" />Import from URL (chub)…
                </DropdownMenuItem>
                {mode === 'characters' && (<>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setGroupOpen(true)}>
                    <Users className="size-4" aria-hidden="true" />New group
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setBatchMode(!batchMode); setSelected([]) }}>
                    <CheckSquare className="size-4" weight={batchMode ? 'fill' : 'regular'} aria-hidden="true" />{batchMode ? 'Stop selecting' : 'Select several'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGrid(!grid)}>
                    {grid ? <List className="size-4" aria-hidden="true" /> : <SquaresFour className="size-4" aria-hidden="true" />}{grid ? 'List view' : 'Grid view'}
                  </DropdownMenuItem>
                </>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* only the tags in use, each with its own way out */}
          {mode === 'characters' && tagFilter.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {tagFilter.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setTagFilter((f) => f.filter((x) => x !== name)); setPage(0) }}
                  className="flex h-8 items-center gap-1 rounded-full bg-accent px-2.5 text-xs text-accent-foreground"
                  aria-label={`Remove the ${name} filter`}
                >
                  {name}<X className="size-3" aria-hidden="true" />
                </button>
              ))}
              <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setTagFilter([]); setPage(0) }}>Clear</Button>
            </div>
          )}
          {mode === 'characters' && batchMode && selected.length > 0 && batchActions}
        </header>
      ) : (
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <PaneTitle section="characters" count={shownCount} title={mode === 'groups' ? t('groups.switchGroups') : undefined} />
        {modeSwitch}
        <div className="relative order-last w-full md:order-none md:w-64">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder={mode === 'groups' ? t('groups.search') : 'Search characters…'} className="h-8 pl-8 text-sm" aria-label={mode === 'groups' ? t('groups.search') : 'Search characters'} />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {mode === 'characters' && (<>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Sort characters">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={batchMode ? 'secondary' : 'ghost'} size="sm" onClick={() => { setBatchMode(!batchMode); setSelected([]) }} aria-label="Batch select mode">
            <CheckSquare className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setGrid(!grid)} aria-label={grid ? 'List view' : 'Grid view'}>
            {grid ? <List className="size-4" aria-hidden="true" /> : <SquaresFour className="size-4" aria-hidden="true" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button data-guide="characters.import" variant="outline" size="sm">
                <UploadSimple className="size-4" aria-hidden="true" />Import
              </Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => importRef.current?.click()}>
                <FileCode className="size-4" aria-hidden="true" />From files…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUrlOpen(true)}>
                <LinkSimple className="size-4" aria-hidden="true" />From URL (chub)…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>)}
          <Button data-guide="groups.create" variant={mode === 'groups' ? 'default' : 'outline'} size="sm" className={cn(mode === 'groups' ? 'bg-group text-group-foreground hover:bg-group/85' : 'border-group/50 text-group hover:bg-group/10 hover:text-group dark:border-group/50 dark:hover:bg-group/10')} onClick={() => setGroupOpen(true)}>
            <Users className="size-4" aria-hidden="true" />{mode === 'groups' ? t('groups.create') : 'Group'}
          </Button>
          {mode === 'characters' && (
            <Button size="sm" onClick={() => { const id = newCharacter(); openCharacter(id) }}>
              <Plus className="size-4" aria-hidden="true" />New
            </Button>
          )}
        </div>
      </header>
      )}

      <CreateGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />

      {/* tag filter row (desktop) — tags IN USE on existing cards, horizontally
          scrollable; on a phone they live in the Filter sheet */}
      {mode === 'characters' && !isMobile && (
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          {tagChips.map(({ name, tag }) => tagChip(name, tag))}
        </div>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setTagManagerOpen(true)}>
          <Tag className="size-3.5" aria-hidden="true" />Manage
        </Button>
        {batchMode && selected.length > 0 && batchActions}
      </div>
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
              const chatCount = chats.filter((ch) => ch.characterId === c.id).length
              const tokens = estimateTokens(c.description + c.personality + c.scenario + c.firstMessage + c.exampleDialogue)
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
                    {c.avatar && !c.avatar.endsWith('avatar-default.png') ? <img src={c.avatar} alt={c.name} className="aspect-square w-full object-cover" /> : <NoPortrait name={c.name} />}
                    <span className="flex flex-col gap-1 p-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: readableNameColor(c.colors.name) }}>
                        {c.name}
                        {c.favorite && <Star weight="fill" className="size-3 text-primary" aria-hidden="true" />}
                        {c.isGroup && <Badge variant="outline" className="border-group/50 text-[10px] text-group">group</Badge>}
                      </span>
                      <CardKindBadge type={cardTypeOf(c)} className="w-fit" />
                      <span className="text-[11px] text-muted-foreground">
                        {settings.charSubheader === 'creator' ? `by ${c.creator}` : `v${c.version}`}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{c.description}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{formatTokens(tokens)} tokens</span>
                        <span className="flex items-center gap-0.5"><Chats className="size-3" aria-hidden="true" />{chatCount} {chatCount === 1 ? 'chat' : 'chats'}</span>
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
                    <span className="line-clamp-1 text-xs text-muted-foreground">{c.description}</span>
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

      <TagManager open={tagManagerOpen} onOpenChange={setTagManagerOpen} />
      {/* phone: sort and every tag, wrapped, instead of a row you swipe sideways */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh]">
          <SheetHeader>
            <SheetTitle>Filter and sort</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Sort</span>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-10 w-44 text-sm" aria-label="Sort characters">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {tagChips.length > 12 && (
              <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Find a tag" className="h-10 text-sm" aria-label="Find a tag" />
            )}
            <div className="flex flex-wrap gap-1.5">
              {tagChips.filter(({ name }) => !tagQuery.trim() || name.toLowerCase().includes(tagQuery.trim().toLowerCase())).map(({ name, tag }) => tagChip(name, tag, true))}
              {tagChips.length === 0 && <span className="text-xs text-muted-foreground">No tags on your cards yet.</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="h-10" onClick={() => setTagManagerOpen(true)}>
                <Tag className="size-4" aria-hidden="true" />Manage tags
              </Button>
              {tagFilter.length > 0 && (
                <Button variant="ghost" className="h-10" onClick={() => { setTagFilter([]); setPage(0) }}>Clear</Button>
              )}
              <Button className="ml-auto h-10" onClick={() => setFilterOpen(false)}>Done</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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

function TagManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tags = useApp((s) => s.tags)
  const updateTag = useApp((s) => s.updateTag)
  const addTag = useApp((s) => s.addTag)
  const deleteTag = useApp((s) => s.deleteTag)
  const characters = useApp((s) => s.characters)
  const [newName, setNewName] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tag manager</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name" aria-label="New tag name" className="h-8" />
          <Button size="sm" onClick={() => { if (newName.trim()) { addTag(newName.trim()); setNewName('') } }}>Add</Button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {[...tags].sort((a, b) => a.order - b.order).map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
              <Input
                value={t.name}
                onChange={(e) => updateTag(t.id, { name: e.target.value })}
                className="h-7 w-32 text-xs"
                aria-label={`Rename tag ${t.name}`}
              />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                bg
                <input type="color" value={t.color} onChange={(e) => updateTag(t.id, { color: e.target.value })} aria-label={`${t.name} background color`} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                text
                <input type="color" value={t.textColor} onChange={(e) => updateTag(t.id, { textColor: e.target.value })} aria-label={`${t.name} text color`} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              </label>
              <span className="ml-auto text-[11px] text-muted-foreground">{characters.filter((c) => c.tags.includes(t.name)).length}</span>
              <Switch checked={t.visible} onCheckedChange={(v) => updateTag(t.id, { visible: v })} aria-label={`Toggle visibility of ${t.name}`} />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                folder
                <Checkbox checked={t.asFolder} onCheckedChange={(v) => updateTag(t.id, { asFolder: !!v })} aria-label={`Use ${t.name} as folder`} />
              </label>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => deleteTag(t.id)} aria-label={`Delete tag ${t.name}`}>
                <Trash className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
