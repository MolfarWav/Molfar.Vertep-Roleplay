
import { useEffect, useMemo, useRef, useState } from "react"
import { cleanPreview } from '@/lib/preview'
import { Check, Flag, GitBranch, ChatCenteredText, PencilSimple, Trash, ArrowElbowDownRight, BookmarkSimple, FileText, FileCode, UploadSimple, BoxArrowUp } from '@phosphor-icons/react'
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useApp } from "@/lib/store"
import { saveFile } from "@/lib/export"
import { fileToRawBase64, j } from "@/lib/engine"
import type { Chat, ID } from "@/lib/types"
import { cn } from "@/lib/utils"

function downloadText(text: string, filename: string, mime = "text/plain") {
  saveFile(new Blob([text], { type: mime }), filename)
}

const safeName = (name: string) => name.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "chat"

/** Plain-text transcript: speaker-labeled blocks separated by blank lines. */
function chatToText(chat: Chat, charName: string, userName: string): string {
  const body = chat.messages
    .map((m) => `${m.role === "user" ? userName : charName}: ${m.swipes[m.activeSwipe]?.content ?? ""}`)
    .join("\n\n")
  return `# ${chat.title}\n\n${body}\n`
}

/** Interchange JSONL: a header line with both names, then one object per
 *  message (swipes carried, hidden messages flagged as system) — the same
 *  shape the importer rebuilds from. */
function chatToJsonl(chat: Chat, charName: string, userName: string): string {
  const lines = [
    JSON.stringify({ user_name: userName, character_name: charName }),
    ...chat.messages.map((m) => JSON.stringify({
      name: m.role === "user" ? userName : charName,
      is_user: m.role === "user",
      is_system: m.hidden === true,
      mes: m.swipes[m.activeSwipe]?.content ?? "",
      send_date: m.timestamp,
      swipes: m.swipes.map((sw) => sw.content),
      swipe_id: m.activeSwipe,
    })),
  ]
  return lines.join("\n") + "\n"
}

function previewLine(chat: Chat): string {
  const last = [...chat.messages].reverse().find((m) => !m.hidden) ?? chat.messages[chat.messages.length - 1]
  // a chat whose transcript is not loaded falls back to the list meta's preview
  const text = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ""
  return cleanPreview(text, 110)
}

/** Transcript length, or the list meta's count when it is not loaded. */
function msgCount(chat: Chat): number {
  return chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

/** Size of the chat's JSONL export — the real byte count of what
 *  "Export JSONL" downloads, not an estimate. */
function fmtSize(chat: Chat, charName: string, userName: string): string {
  const bytes = new Blob([chatToJsonl(chat, charName, userName)]).size
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function fmtRelative(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days < 30 ? `${days}d ago` : fmtDate(ts)
}

function ChatRow({
  chat,
  depth,
  isCurrent,
  childCount,
  onOpen,
}: {
  chat: Chat
  depth: number
  isCurrent: boolean
  childCount: number
  onOpen: () => void
}) {
  const updateChat = useApp((s) => s.updateChat)
  const deleteChat = useApp((s) => s.deleteChat)
  const forkAndOpen = useApp((s) => s.forkAndOpen)
  const confirmDeletions = useApp((s) => s.settings.confirmDeletions)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const personaName =
    personas.find((p) => p.id === chat.personaId)?.name ?? personas.find((p) => p.isDefault)?.name ?? "You"
  const charName = characters.find((c) => c.id === chat.characterId)?.name ?? "Character"
  const [renaming, setRenaming] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [draft, setDraft] = useState(chat.title)

  const commitRename = () => {
    const title = draft.trim()
    if (title && title !== chat.title) updateChat(chat.id, { title })
    setRenaming(false)
  }

  const lastMessage = chat.messages[chat.messages.length - 1]
  const branchCount = chat.branches.length
  const lastVisible = [...chat.messages].reverse().find((m) => !m.hidden) ?? lastMessage
  const lastSpeaker = !lastVisible
    ? null
    : lastVisible.role === "user"
      ? personaName
      : characters.find((c) => c.id === (lastVisible.characterId ?? chat.characterId))?.name ?? null

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
        isCurrent ? "border-primary/50 bg-accent/60" : "border-transparent hover:bg-accent/40",
      )}
      style={{ marginLeft: depth * 20 }}
    >
      {depth > 0 && <ArrowElbowDownRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" aria-label={`Open chat ${chat.title}`}>
        <div className="flex items-center gap-1.5">
          {renaming ? (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") { setDraft(chat.title); setRenaming(false) }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="h-6 w-48 text-xs"
              aria-label="Rename chat"
            />
          ) : (
            <span className="truncate text-sm font-medium">{chat.title}</span>
          )}
          {isCurrent && (
            <Badge variant="default" className="h-4 gap-0.5 px-1 text-[9px]">
              <Check className="size-2.5" /> current
            </Badge>
          )}
          {chat.parentChatId && (
            <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px]">
              <GitBranch className="size-2.5" /> branch
            </Badge>
          )}
          {childCount > 0 && (
            <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px]">
              <Flag className="size-2.5" /> {childCount} fork{childCount > 1 ? "s" : ""}
            </Badge>
          )}
          {chat.temporary && <Badge variant="outline" className="h-4 px-1 text-[9px]">temp</Badge>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {lastSpeaker && <span className="font-medium text-foreground/80">{lastSpeaker}: </span>}
          {previewLine(chat) || "Empty chat"}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground/70">
          <span>{msgCount(chat)} message{msgCount(chat) === 1 ? "" : "s"}</span>
          <span aria-hidden="true">·</span>
          <span>{fmtSize(chat, charName, personaName)}</span>
          <span aria-hidden="true">·</span>
          <span title={fmtDate(chat.updatedAt)}>{fmtRelative(chat.updatedAt)}</span>
          {branchCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{branchCount} checkpoint{branchCount === 1 ? "" : "s"}</span>
            </>
          )}
        </p>
      </button>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => { setDraft(chat.title); setRenaming(true) }}
          aria-label={`Rename ${chat.title}`}
          title="Rename"
        >
          <PencilSimple className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => downloadText(chatToText(chat, charName, personaName), `${safeName(chat.title)}.txt`)}
          aria-label={`Export ${chat.title} as plain text`}
          title="Export TXT"
        >
          <FileText className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => downloadText(chatToJsonl(chat, charName, personaName), `${safeName(chat.title)}.jsonl`, "application/x-ndjson")}
          aria-label={`Export ${chat.title} as JSONL`}
          title="Export JSONL"
        >
          <FileCode className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => {
            if (!lastMessage) return
            void forkAndOpen(chat.id, lastMessage.id)
            toast.success("Checkpoint created")
          }}
          aria-label={`Create checkpoint from ${chat.title}`}
          title="Checkpoint (fork from last message)"
        >
          <BookmarkSimple className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          onClick={() => {
            // Respect the "confirm deletions" setting, but always through an
            // in-app AlertDialog rather than a native window.confirm.
            if (confirmDeletions) { setConfirmOpen(true); return }
            deleteChat(chat.id)
            toast.success("Chat deleted")
          }}
          aria-label={`Delete ${chat.title}`}
          title="Delete"
        >
          <Trash className="size-3" />
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{chat.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {msgCount(chat)} message{msgCount(chat) === 1 ? "" : "s"}
              {childCount > 0 && ` and ${childCount} fork${childCount > 1 ? "s" : ""}`} will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteChat(chat.id); toast.success("Chat deleted") }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ManageChatsDialog({
  open,
  onOpenChange,
  characterId,
  currentChatId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  characterId: ID
  currentChatId: ID
}) {
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const openChat = useApp((s) => s.openChat)
  const hydrate = useApp((s) => s.hydrate)
  const chatFileRef = useRef<HTMLInputElement>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)

  const character = characters.find((c) => c.id === characterId)

  // This tree shows real previews, message counts and export sizes, all of
  // which need the transcripts — and chats arrive unloaded now. Pull this
  // character's when the dialog opens; ensureChatMessages is a no-op for any
  // chat already loaded, so reopening costs nothing.
  const ensureChatMessages = useApp((s) => s.ensureChatMessages)
  useEffect(() => {
    if (!open) return
    for (const c of useApp.getState().chats) {
      if (c.characterId === characterId) void ensureChatMessages(c.id)
    }
  }, [open, characterId, ensureChatMessages])

  // JSONL transcripts attach to THIS character (the importer links by name)
  const importChats = async (files: FileList | null) => {
    if (!files || !character) return
    for (const file of Array.from(files)) {
      try {
        const lines = (await file.text())
          .split("\n").filter((l) => l.trim())
          .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        if (!lines.length) { toast.error(`${file.name}: no messages found`); continue }
        const r = await j<{ chats: string[] }>("/import/batch", {
          method: "POST",
          body: JSON.stringify({ chats: [{ character: character.name, file: file.name.replace(/\.jsonl$/i, ""), lines }] }),
        })
        toast.success(`Imported to ${character.name} (${r.chats.length} new)`)
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? "could not parse JSONL"}`) }
    }
    await hydrate()
  }

  const importBackup = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    try {
      const r = await j<Record<string, unknown>>("/import/zip", {
        method: "POST",
        body: JSON.stringify({ zipBase64: await fileToRawBase64(f) }),
      })
      const parts = Object.entries(r)
        .filter(([, v]) => Array.isArray(v) && v.length)
        .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
      toast.success(parts.length ? `Imported ${parts.join(", ")}` : "Nothing recognized in that zip")
      await hydrate()
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  // Build root list + fork tree for this character
  const { roots, childrenOf } = useMemo(() => {
    const mine = chats.filter((c) => c.characterId === characterId)
    const ids = new Set(mine.map((c) => c.id))
    const childrenOf = new Map<ID, Chat[]>()
    const roots: Chat[] = []
    for (const c of mine) {
      if (c.parentChatId && ids.has(c.parentChatId)) {
        const arr = childrenOf.get(c.parentChatId) ?? []
        arr.push(c)
        childrenOf.set(c.parentChatId, arr)
      } else {
        roots.push(c)
      }
    }
    roots.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const arr of childrenOf.values()) arr.sort((a, b) => a.createdAt - b.createdAt)
    return { roots, childrenOf }
  }, [chats, characterId])

  const renderTree = (chat: Chat, depth: number): React.ReactNode => {
    const kids = childrenOf.get(chat.id) ?? []
    return (
      <div key={chat.id} className="flex flex-col gap-1">
        <ChatRow
          chat={chat}
          depth={depth}
          isCurrent={chat.id === currentChatId}
          childCount={kids.length}
          onOpen={() => { openChat(chat.id); onOpenChange(false) }}
        />
        {kids.map((k) => renderTree(k, depth + 1))}
      </div>
    )
  }

  const total = chats.filter((c) => c.characterId === characterId).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Chat files{character ? ` · ${character.name}` : ""}
            <Badge variant="secondary" className="text-[10px]">{total}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => {
              void startChatAndOpen(characterId)
              onOpenChange(false)
            }}
          >
            <ChatCenteredText className="size-4" /> Start new chat
          </Button>
          <input
            ref={chatFileRef}
            type="file"
            accept=".jsonl,.txt"
            multiple
            className="sr-only"
            onChange={(e) => { void importChats(e.target.files); e.target.value = "" }}
            aria-label="Import chat files"
          />
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => chatFileRef.current?.click()}>
            <UploadSimple className="size-4" /> Import chat
          </Button>
          <input
            ref={backupFileRef}
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={(e) => { void importBackup(e.target.files); e.target.value = "" }}
            aria-label="Import backup zip"
          />
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => backupFileRef.current?.click()}>
            <BoxArrowUp className="size-4" /> Restore backup
          </Button>
        </div>
        {/* max-h ON THE ROOT (not just the dialog): the dialog's height is
            content-sized up to a cap, and a percentage viewport height can't
            resolve against that — the viewport goes content-sized and never
            scrolls. A definite max-h here caps the viewport (max-h-[inherit])
            and scrolls; flex-1 keeps it shrinking with the dialog. */}
        <ScrollArea className="-mx-2 min-h-0 max-h-[62dvh] flex-1 px-2">
          <div className="flex flex-col gap-1 pb-1">
            {roots.map((c) => renderTree(c, 0))}
            {roots.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No chats yet for this character</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
