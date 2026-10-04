
import { useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Star, SquaresFour, List, Plus, UploadSimple, Chats, Copy, Trash, Tag, DotsThree, CheckSquare, DownloadSimple, Users, FileCode, LinkSimple, UserCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
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
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { DEFAULT_AVATAR, cn, readableNameColor } from '@/lib/utils'
import { j, downscaleRemoteImage, characterToCard } from '@/lib/engine'
import { buildCardPng, downloadCardPng } from '@/lib/png-card'
import { importCardFiles } from '@/lib/card-import'
import { downloadJson } from '@/lib/interop'
import { CharacterEditor } from '@/components/views/character-editor'
import { CardKindBadge } from '@/components/dashboard/card-kind'
import { cardTypeOf } from '@/lib/soul'
import { CreateGroupDialog } from '@/components/chat/create-group-dialog'

type SortKey = 'az' | 'newest' | 'oldest' | 'favorites' | 'recent' | 'chats' | 'tokens' | 'random'

/** chub card links map to the full-resolution card image; the app's img
 *  route streams it through the engine (the sandboxed frame cannot fetch
 *  other hosts). Returns a downscaled data URL, or undefined when the link
 *  is not a card link or the image cannot be fetched — the importer then
 *  keeps its own 200px listing thumbnail. */
const CHUB_CARD = /^https:\/\/(?:www\.)?(?:chub\.ai|characterhub\.(?:ai|org))\/characters\/([^/\s?#]+)\/([^/\s?#]+)/i
const CHUB_API_CARD = /^https:\/\/api\.chub\.ai\/api\/characters\/([^/\s?#]+)\/([^/\s?#]+)/i
async function fullSizeAvatar(pageUrl: string): Promise<string | undefined> {
  const m = CHUB_CARD.exec(pageUrl) ?? CHUB_API_CARD.exec(pageUrl)
  if (!m) return undefined
  const src = `https://avatars.charhub.io/avatars/${encodeURIComponent(m[1]!)}/${encodeURIComponent(m[2]!)}/chara_card_v2.png`
  try {
    return await downscaleRemoteImage(src, 512)
  } catch {
    return undefined
  }
}

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
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [page, setPage] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)

  /** Import a card from a CharacterHub/chub link — the fetch happens
   *  engine-side (no CORS, no keys in the browser). The importer's own
   *  avatar is a 200px listing thumbnail; the full card image is fetched
   *  here first and downscaled, so the stored portrait is a real one. */
  const importFromUrl = async () => {
    const urls = urlValue.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'))
    if (!urls.length) return
    setUrlBusy(true)
    let okCount = 0
    for (const url of urls) {
      try {
        const avatar = await fullSizeAvatar(url)
        const r = await j<{ characters: string[]; name?: string; error?: string }>('/import/url', {
          method: 'POST', body: JSON.stringify({ url, ...(avatar ? { avatar } : {}) }),
        })
        okCount++
        toast.success(`Imported ${r.name ?? 'character'}`)
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
      const bytes = await buildCardPng(c.avatar || DEFAULT_AVATAR, characterToCard(c))
      downloadCardPng(bytes, c.name)
      toast.success(`Exported ${c.name} as a PNG card`)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmBatch, setConfirmBatch] = useState(false)
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
  }, [characters, chats, query, sort, tagFilter])

  const favorites = characters.filter((c) => c.favorite)

  /** Tag filter chips: the tag manager owns color, visibility and order —
   *  tags in use but never configured in the manager fall back to neutral
   *  chips at the end (alphabetical). */
  const tagChips = useMemo(() => {
    const meta = new Map(tags.map((t) => [t.name, t]))
    return Array.from(new Set(characters.flatMap((c) => c.tags)))
      .filter((name) => meta.get(name)?.visible !== false)
      .sort((a, b) => {
        const oa = meta.get(a)?.order ?? Number.MAX_SAFE_INTEGER
        const ob = meta.get(b)?.order ?? Number.MAX_SAFE_INTEGER
        return oa !== ob ? oa - ob : a.localeCompare(b)
      })
      .map((name) => ({ name, tag: meta.get(name) }))
  }, [characters, tags])

  const PAGE_SIZE = 24
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page])

  if (active) {
    return <CharacterEditor character={active} onClose={() => openCharacter(null)} />
  }

  return (
    <SectionPage section="characters" count={characters.length}>
    <div className="flex h-full min-h-0 flex-col">
      {/* header + tag filter + favorites scroll WITH the grid — a pinned
          toolbar eats the viewport on mobile once the keyboard opens */}
      <ScrollArea className="min-h-0 flex-1">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <PaneTitle section="characters" count={characters.length} />
        <div className="relative order-last w-full md:order-none md:w-64">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder="Search characters…" className="h-8 pl-8 text-sm" aria-label="Search characters" />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Sort characters">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="az">A–Z</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="favorites">Favorites</SelectItem>
              <SelectItem value="chats">Most chats</SelectItem>
              <SelectItem value="tokens">Most tokens</SelectItem>
              <SelectItem value="random">Random</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={batchMode ? 'secondary' : 'ghost'} size="sm" onClick={() => { setBatchMode(!batchMode); setSelected([]) }} aria-label="Batch select mode">
            <CheckSquare className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setGrid(!grid)} aria-label={grid ? 'List view' : 'Grid view'}>
            {grid ? <List className="size-4" aria-hidden="true" /> : <SquaresFour className="size-4" aria-hidden="true" />}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".png,.json"
            multiple
            className="sr-only"
            onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }}
            aria-label="Import character cards"
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm">
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
          <Button variant="outline" size="sm" onClick={() => setGroupOpen(true)}>
            <Users className="size-4" aria-hidden="true" />Group
          </Button>
          <Button size="sm" onClick={() => { const id = newCharacter(); openCharacter(id) }}>
            <Plus className="size-4" aria-hidden="true" />New
          </Button>
        </div>
      </header>

      <CreateGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />

      {/* tag filter row — tags IN USE on existing cards, horizontally
          scrollable so it never wraps into a wall of chips on mobile */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          {tagChips.map(({ name, tag }) => {
            const n = characters.filter((c) => c.tags.includes(name)).length
            const active = tagFilter.includes(name)
            return (
              <button
                key={name}
                type="button"
                onClick={() => { setTagFilter((f) => f.includes(name) ? f.filter((x) => x !== name) : [...f, name]); setPage(0) }}
                style={tag ? { backgroundColor: tag.color, color: tag.textColor, borderColor: 'transparent' } : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  active ? 'font-medium' : 'hover:text-foreground',
                  !tag && (active ? 'border-transparent bg-accent text-accent-foreground' : 'border-border text-muted-foreground'),
                  tag && !active && 'opacity-75 hover:opacity-100',
                )}
              >
                {name} <span className="opacity-60">{n}</span>
              </button>
            )
          })}
        </div>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setTagManagerOpen(true)}>
          <Tag className="size-3.5" aria-hidden="true" />Manage
        </Button>
        {batchMode && selected.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => {
              const picked = characters.filter((c) => selected.includes(c.id) && !c.isGroup)
              downloadJson(picked.map((c) => characterToCard(c)), `characters-${picked.length}`)
              setSelected([])
              toast.success(`Exported ${picked.length} card${picked.length === 1 ? '' : 's'} as JSON`)
            }}>
              <DownloadSimple className="size-3.5" aria-hidden="true" />Export
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setConfirmBatch(true)}>
              <Trash className="size-3.5" aria-hidden="true" />Delete
            </Button>
          </div>
        )}
      </div>

      {/* favorites hotswap bar */}
      {favorites.length > 0 && (
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

        {filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Users aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No characters match</EmptyTitle>
              <EmptyDescription>Clear the search or tag filters, or import a card.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : grid ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                    <img src={c.avatar || DEFAULT_AVATAR} alt={c.name} className="aspect-square w-full object-cover" />
                    <span className="flex flex-col gap-1 p-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: readableNameColor(c.colors.name) }}>
                        {c.name}
                        {c.favorite && <Star weight="fill" className="size-3 text-primary" aria-hidden="true" />}
                        {c.isGroup && <Badge variant="outline" className="text-[10px]">group</Badge>}
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
                        <span>{formatTokens(tokens)} tok</span>
                        <span className="flex items-center gap-0.5"><Chats className="size-3" aria-hidden="true" />{chatCount}</span>
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
                        <DropdownMenuItem onClick={() => { duplicateCharacter(c.id); toast.success('Duplicated') }}>
                          <Copy className="size-4" aria-hidden="true" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => convertToPersona(c)}>
                          <UserCircle className="size-4" aria-hidden="true" />Convert to persona
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void exportPng(c)}>
                          <DownloadSimple className="size-4" aria-hidden="true" />Export PNG
                        </DropdownMenuItem>
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
            <DialogTitle>Import from chub</DialogTitle>
          </DialogHeader>
          <Textarea
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder={"https://chub.ai/characters/user/name\nhttps://chub.ai/characters/user/another"}
            aria-label="chub card URLs, one per line"
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this character?</AlertDialogTitle>
            <AlertDialogDescription>This removes the character and all of their chats. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) deleteCharacter(confirmDelete); setConfirmDelete(null); toast.success('Character deleted') }}>Delete</AlertDialogAction>
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
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { selected.forEach((id) => deleteCharacter(id)); setSelected([]); setConfirmBatch(false); toast.success('Deleted') }}
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
