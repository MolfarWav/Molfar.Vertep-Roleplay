
import { useMemo, useState } from 'react'
import { MagnifyingGlass, Trash, DownloadSimple, GitBranch, Chats, PencilSimple, Plus, X, Folder as FolderIcon, DotsThree } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { clampPage } from '@/components/ui/pager'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { timeAgo } from '@/lib/tokens'
import { exportChatJSONL, exportChatTxt } from '@/lib/export'
import { toast } from 'sonner'
import { DEFAULT_AVATAR } from '@/lib/utils'

export function ChatsView() {
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const openChat = useApp((s) => s.openChat)
  const deleteChat = useApp((s) => s.deleteChat)
  const updateChat = useApp((s) => s.updateChat)
  const folders = useApp((s) => s.folders)
  const addFolder = useApp((s) => s.addFolder)
  const deleteFolder = useApp((s) => s.deleteFolder)
  const [query, setQuery] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [chatPage, setChatPage] = useState(0)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  // In-app folder dialog — never a native window.prompt (user feedback).
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')

  const chatFolders = folders.filter((f) => f.scope === 'chats')

  const createFolder = () => {
    const name = folderName.trim()
    if (!name) return
    setActiveFolderId(addFolder(name, 'chats'))
    setFolderName('')
    setFolderOpen(false)
    toast.success(`Folder "${name}" created`)
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return [...chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((c) => !activeFolderId || c.folderId === activeFolderId)
      .filter((c) => {
        const char = characters.find((x) => x.id === c.characterId)
        return !q || c.title.toLowerCase().includes(q) || char?.name.toLowerCase().includes(q)
      })
  }, [chats, characters, query, activeFolderId])
  const CHAT_PAGE = 30
  const safePage = clampPage(chatPage, filtered.length, CHAT_PAGE)
  const paged = useMemo(() => filtered.slice(safePage * CHAT_PAGE, safePage * CHAT_PAGE + CHAT_PAGE), [filtered, safePage])

  return (
    <SectionPage section="chats" count={chats.length}>
    <div className="flex h-full min-h-0 flex-col">
      {/* header + folder chips scroll WITH the list (mobile keyboard room) */}
      <ScrollArea className="min-h-0 flex-1">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <PaneTitle section="chats" count={chats.length} />
        <div className="relative ml-auto w-56">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setChatPage(0) }}
            placeholder="Search chats…"
            className="h-8 pl-8 text-sm"
            aria-label="Search chats"
          />
        </div>
      </header>
      <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border px-4 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => { setActiveFolderId(null); setChatPage(0) }}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${!activeFolderId ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
        {chatFolders.map((f) => (
          <span key={f.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => { setActiveFolderId(activeFolderId === f.id ? null : f.id); setChatPage(0) }}
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-2.5 text-xs ${activeFolderId === f.id ? 'border-primary bg-primary/10 text-primary pr-1' : 'border-border text-muted-foreground hover:text-foreground pr-2.5'}`}
            >
              <FolderIcon className="size-3" style={{ color: f.color }} aria-hidden="true" />
              {f.name}
              <Badge variant="secondary" className="px-1 text-[10px]">{chats.filter((c) => c.folderId === f.id).length}</Badge>
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
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" aria-hidden="true" /> New folder
        </button>
      </div>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New chat folder</DialogTitle>
          </DialogHeader>
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
        {filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Chats aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No chats found</EmptyTitle>
              <EmptyDescription>Try a different search, or start a new chat from the Characters tab.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {paged.map((chat) => {
              const char = characters.find((c) => c.id === chat.characterId)
              const last = chat.messages[chat.messages.length - 1]
              // a chat whose transcript has not been loaded yet (list refresh,
              // never opened this session) carries its preview and size on the
              // list meta instead
              const loaded = chat.messages.length > 0
              const previewText = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
              const msgCount = loaded ? chat.messages.length : chat.messageCount ?? 0
              return (
                <li key={chat.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-accent/50">
                  <button type="button" onClick={() => openChat(chat.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar className="size-9 rounded-md">
                      <AvatarImage src={char?.avatar || DEFAULT_AVATAR} alt="" />
                      <AvatarFallback>{char?.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {char?.name}
                        <span className="text-muted-foreground">·</span>
                        <span className="truncate text-muted-foreground">{chat.title}</span>
                        {chat.branches.length > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <GitBranch className="size-3" aria-hidden="true" />
                            {chat.branches.length}
                          </Badge>
                        )}
                        {chat.parentChatId && <Badge variant="outline">branch</Badge>}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {previewText.replace(/[*>#`]/g, '').slice(0, 120)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-xs text-muted-foreground">
                      <span>{timeAgo(chat.updatedAt)}</span>
                      <span className="hidden sm:inline">{msgCount} msgs</span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 max-sm:opacity-100" aria-label="Chat actions">
                          <DotsThree className="size-4" aria-hidden="true" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => { setRenameId(chat.id); setRenameValue(chat.title) }}>
                          <PencilSimple className="size-4" aria-hidden="true" />
                          Rename
                        </DropdownMenuItem>
                        {chatFolders.length > 0 && (
                          <>
                            {chatFolders.map((f) => (
                              <DropdownMenuItem
                                key={f.id}
                                onClick={() => { updateChat(chat.id, { folderId: chat.folderId === f.id ? null : f.id }); toast.success(chat.folderId === f.id ? `Removed from ${f.name}` : `Moved to ${f.name}`) }}
                              >
                                <FolderIcon className="size-4" style={{ color: f.color }} aria-hidden="true" />
                                {chat.folderId === f.id ? `Remove from ${f.name}` : `Move to ${f.name}`}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        <DropdownMenuItem onClick={() => { exportChatJSONL(chat, characters); toast.success('Exported as JSONL') }}>
                          <DownloadSimple className="size-4" aria-hidden="true" />
                          Export JSONL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { exportChatTxt(chat, characters); toast.success('Exported as TXT') }}>
                          <DownloadSimple className="size-4" aria-hidden="true" />
                          Export TXT
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirmId(chat.id)}>
                          <Trash className="size-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}

        {filtered.length > CHAT_PAGE && (
          <div className="flex items-center justify-center gap-3 py-3 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" className="h-7" disabled={safePage === 0} onClick={() => setChatPage((p) => p - 1)}>Previous</Button>
            <span>{safePage * CHAT_PAGE + 1}–{Math.min(filtered.length, (safePage + 1) * CHAT_PAGE)} of {filtered.length}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={(safePage + 1) * CHAT_PAGE >= filtered.length} onClick={() => setChatPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the chat and all its messages. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmId) deleteChat(confirmId)
                setConfirmId(null)
                toast.success('Chat deleted')
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="Chat title" />
          <DialogFooter>
            <Button
              onClick={() => {
                if (renameId) updateChat(renameId, { title: renameValue })
                setRenameId(null)
                toast.success('Renamed')
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </SectionPage>
  )
}
