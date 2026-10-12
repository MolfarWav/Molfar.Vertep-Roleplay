import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Chats, Users, Plus, X, Folder as FolderIcon, PushPin, CheckSquare, Square, Trash, GitBranch } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import { cleanPreview } from '@/lib/preview'
import { NO_FILTER, filterChats, type ChatFilter } from '@/lib/chat-filters'
import { groupChats, sortChats, type ChatKind, type ChatSort } from '@/lib/chat-list'
import { ChatFilters } from '@/components/chat/chat-filters'
import { SectionPage } from '@/components/shell/section-page'
import { MasterDetail } from '@/components/shell/master-detail'
import { ChatAvatar, ChatPanel } from '@/components/chats/chat-panel'
import { timeAgo } from '@/lib/tokens'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Character, Chat } from '@/lib/types'

const SORT_KEY = 'rp.chats.sort'
const readSort = (): ChatSort => {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v === 'messages' || v === 'name' ? v : 'recent'
  } catch { return 'recent' }
}

/** Each time group's heading takes its own hue (tokens in globals.css). */
const GROUP_TONE: Record<string, string> = {
  pinned: 'text-when-pinned', today: 'text-when-today', week: 'text-when-week', earlier: 'text-when-earlier', all: 'text-muted-foreground',
}
const GROUP_LINE: Record<string, string> = {
  pinned: 'bg-when-pinned/40', today: 'bg-when-today/40', week: 'bg-when-week/40', earlier: 'bg-when-earlier/40', all: 'bg-border',
}

export function ChatsView() {
  const t = useT()
  const isMobile = useIsMobile()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const deleteChat = useApp((s) => s.deleteChat)
  const updateChat = useApp((s) => s.updateChat)
  const folders = useApp((s) => s.folders)
  const addFolder = useApp((s) => s.addFolder)
  const deleteFolder = useApp((s) => s.deleteFolder)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ChatKind>('all')
  const [sort, setSortState] = useState<ChatSort>(readSort)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ChatFilter>(NO_FILTER)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // in-app folder dialog: never a native window.prompt (user feedback)
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')

  const chatFolders = folders.filter((f) => f.scope === 'chats')
  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const ownerOf = (c: Chat) => byId.get(c.characterId)
  const sizeOf = (c: Chat) => (c.messages.length > 0 ? c.messages.length : c.messageCount ?? 0)
  const setSort = (s: ChatSort) => {
    setSortState(s)
    try { localStorage.setItem(SORT_KEY, s) } catch { /* storage blocked */ }
  }

  const createFolder = () => {
    const name = folderName.trim()
    if (!name) return
    setActiveFolderId(addFolder(name, 'chats'))
    setFolderName('')
    setFolderOpen(false)
    toast.success(`Folder "${name}" created`)
  }

  const counts = useMemo(() => {
    const groups = chats.filter((c) => byId.get(c.characterId)?.isGroup).length
    return { all: chats.length, group: groups, single: chats.length - groups }
  }, [chats, byId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = filterChats([...chats], characters, filter)
      .filter((c) => !activeFolderId || c.folderId === activeFolderId)
      .filter((c) => kind === 'all' || (kind === 'group') === !!byId.get(c.characterId)?.isGroup)
      .filter((c) => {
        if (!q) return true
        const owner = byId.get(c.characterId)
        return c.title.toLowerCase().includes(q) || !!owner?.name.toLowerCase().includes(q) || (c.preview ?? '').toLowerCase().includes(q)
      })
    return sortChats(list, sort, (c) => (c.messages.length > 0 ? c.messages.length : c.messageCount ?? 0), (c) => byId.get(c.characterId)?.name ?? '')
  }, [chats, characters, query, activeFolderId, filter, kind, sort, byId])
  const sections = useMemo(() => groupChats(filtered, sort), [filtered, sort])

  // desktop: the panel always shows a chat, the top one until another is picked
  const selected = filtered.find((c) => c.id === selectedId) ?? (isMobile ? undefined : filtered[0])
  useEffect(() => {
    if (isMobile && detailOpen && !selected) setDetailOpen(false)
  }, [isMobile, detailOpen, selected])

  const pick = (id: string) => {
    if (selecting) {
      setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
      return
    }
    setSelectedId(id)
    setDetailOpen(true)
  }
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }
  const groupLabel = (key: string) => t(`chats.when.${key}` as Parameters<typeof t>[0])

  const row = (chat: Chat) => {
    const owner = ownerOf(chat)
    const isGroup = !!owner?.isGroup
    const members = isGroup ? (owner?.group?.memberIds ?? owner?.members ?? []).map((id) => byId.get(id)).filter((c): c is Character => !!c) : []
    const last = chat.messages[chat.messages.length - 1]
    const previewText = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
    const on = !selecting && !isMobile && selected?.id === chat.id
    const ticked = picked.has(chat.id)
    return (
      <li key={chat.id}>
        <button
          type="button"
          onClick={() => pick(chat.id)}
          onDoubleClick={() => { if (!selecting) useApp.getState().openChat(chat.id) }}
          aria-current={on ? 'true' : undefined}
          aria-pressed={selecting ? ticked : undefined}
          className={cn(
            'flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-left transition-colors hover:bg-accent/50',
            on && (isGroup ? 'border-l-group bg-accent/70' : 'border-l-primary bg-accent/70'),
          )}
        >
          {selecting && (ticked
            ? <CheckSquare className="size-5 shrink-0 text-primary" weight="fill" aria-hidden="true" />
            : <Square className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />)}
          <ChatAvatar owner={owner} members={members} size={42} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className={cn('truncate', isGroup && 'text-group')}>{owner?.name ?? t('chats.panel.unknown')}</span>
              {isGroup && (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-group/50 px-1.5 text-[10px] text-group">
                  <Users className="size-2.5" weight="bold" aria-hidden="true" />{members.length}
                  <span className="sr-only">{t('chats.panel.groupChat')}</span>
                </span>
              )}
              {chat.branches.length > 0 && (
                <Badge variant="outline" className="gap-1 px-1 text-[10px]"><GitBranch className="size-3" aria-hidden="true" />{chat.branches.length}</Badge>
              )}
            </span>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              <span className="text-foreground/90">{chat.title}</span> · {cleanPreview(previewText, 120)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
            {chat.pinned && <PushPin className="size-3.5 text-when-pinned" weight="fill" aria-label={t('chats.when.pinned')} />}
            <span className="font-medium text-foreground/85">{timeAgo(chat.updatedAt)}</span>
            <span className="text-foreground/65">{t('chats.msgs', { n: sizeOf(chat) })}</span>
          </span>
        </button>
      </li>
    )
  }

  const master = (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2.5 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('chats.search')} className="h-9 pl-8 text-sm" aria-label={t('chats.search')} />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as ChatSort)}>
              <SelectTrigger className="h-9 w-auto shrink-0" aria-label={t('chats.sort')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t('chats.sortRecent')}</SelectItem>
                <SelectItem value="messages">{t('chats.sortMessages')}</SelectItem>
                <SelectItem value="name">{t('chats.sortName')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={selecting ? 'default' : 'secondary'} className="h-9 shrink-0" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? t('chats.done') : t('chats.select')}
            </Button>
          </div>
          <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(['all', 'single', 'group'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs max-sm:h-9',
                  kind === k
                    ? k === 'group' ? 'border-group/60 bg-group/15 text-group' : 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'group' && <Users className="size-3" aria-hidden="true" />}
                {t(`chats.kind.${k}` as Parameters<typeof t>[0])}
                <span className="tabular-nums opacity-70">{counts[k]}</span>
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            {chatFolders.map((f) => (
              <span key={f.id} className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-pressed={activeFolderId === f.id}
                  onClick={() => setActiveFolderId(activeFolderId === f.id ? null : f.id)}
                  className={`flex h-8 items-center gap-1.5 rounded-full border pl-2.5 text-xs max-sm:h-9 ${activeFolderId === f.id ? 'border-primary bg-primary/10 text-primary pr-1' : 'border-border text-muted-foreground hover:text-foreground pr-2.5'}`}
                >
                  <FolderIcon className="size-3" style={{ color: f.color }} aria-hidden="true" />
                  {f.name}
                  <span className="tabular-nums opacity-70">{chats.filter((c) => c.folderId === f.id).length}</span>
                  {activeFolderId === f.id && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete folder ${f.name}`}
                      className="rounded-full p-0.5 hover:bg-accent"
                      onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); setActiveFolderId(null); toast.success('Folder deleted') }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); deleteFolder(f.id); setActiveFolderId(null) } }}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => { setFolderName(''); setFolderOpen(true) }}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:text-foreground max-sm:h-9"
            >
              <Plus className="size-3" aria-hidden="true" /> {t('chats.newFolder')}
            </button>
          </div>
          <ChatFilters value={filter} onChange={setFilter} />
        </div>

        {filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Chats aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{t('chats.emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('chats.emptyHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          sections.map((sec) => (
            <section key={sec.key} aria-label={sec.key === 'all' ? undefined : groupLabel(sec.key)}>
              {sec.key !== 'all' && (
                <h3 className={cn('flex items-center gap-2 px-4 pb-1 pt-3.5 text-xs font-semibold uppercase tracking-wider', GROUP_TONE[sec.key])}>
                  {sec.key === 'pinned' && <PushPin className="size-3.5" weight="fill" aria-hidden="true" />}
                  {groupLabel(sec.key)}
                  <span className="tabular-nums font-normal opacity-80">{sec.chats.length}</span>
                  <span className={cn('h-px flex-1', GROUP_LINE[sec.key])} aria-hidden="true" />
                </h3>
              )}
              <ul>{sec.chats.map(row)}</ul>
            </section>
          ))
        )}
      </ScrollArea>
      {selecting && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <span className="flex-1 text-sm text-muted-foreground">{t('chats.selected', { n: picked.size })}</span>
          <Button variant="ghost" size="sm" className="max-sm:h-10" onClick={() => setPicked(picked.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))}>
            {picked.size === filtered.length ? t('chats.selectNone') : t('chats.selectAll')}
          </Button>
          {chatFolders.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="max-sm:h-10" disabled={!picked.size}><FolderIcon className="size-4" aria-hidden="true" />{t('chats.moveTo')}</Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {chatFolders.map((f) => (
                    <DropdownMenuItem key={f.id} onClick={() => { for (const id of picked) updateChat(id, { folderId: f.id }); toast.success(`Moved to ${f.name}`); stopSelecting() }}>
                      <FolderIcon className="size-4" style={{ color: f.color }} aria-hidden="true" />{f.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => { for (const id of picked) updateChat(id, { folderId: null }); stopSelecting() }}>{t('chats.noFolder')}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="destructive" size="sm" className="max-sm:h-10" disabled={!picked.size} onClick={() => setConfirmIds([...picked])}>
            <Trash className="size-4" aria-hidden="true" />{t('chats.panel.delete')}
          </Button>
        </div>
      )}
    </div>
  )

  const detail = selected ? (
    <ChatPanel
      chat={selected}
      onDelete={() => setConfirmIds([selected.id])}
      onRename={() => { setRenameId(selected.id); setRenameValue(selected.title) }}
    />
  ) : (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Chats aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{t('chats.pickTitle')}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )

  return (
    <SectionPage section="chats" count={chats.length} hideOnPhone>
      <MasterDetail
        detailOpen={detailOpen && !!selected}
        onBack={() => setDetailOpen(false)}
        detailTitle={selected?.title}
        masterWidth="w-[26rem]"
        master={master}
        detail={detail}
      />

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New chat folder</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') { e.preventDefault(); createFolder() }
            }}
            placeholder="Folder name…"
            aria-label="Folder name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderOpen(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!folderName.trim()}>Create folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmIds} onOpenChange={(o) => !o && setConfirmIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chats.deleteTitle', { n: confirmIds?.length ?? 1 })}</AlertDialogTitle>
            <AlertDialogDescription>{t('chats.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                for (const id of confirmIds ?? []) deleteChat(id)
                toast.success(t('chats.deleted', { n: confirmIds?.length ?? 1 }))
                setConfirmIds(null)
                stopSelecting()
              }}
            >
              {t('chats.panel.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="Chat title" />
          <DialogFooter>
            <Button onClick={() => { if (renameId) updateChat(renameId, { title: renameValue }); setRenameId(null); toast.success('Renamed') }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPage>
  )
}
