
import { useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Database, FileText, CircleNotch, Trash, UploadSimple, Globe, User, ChatCircle } from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/use-t'
import type { DataBankFile } from '@/lib/types'
import { useConfirm } from '@/components/ui/confirm'
import { toast } from 'sonner'
import { j } from '@/lib/engine'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.log', '.jsonl']

/** Retrieved chunk shown by the search probe below the list. */
interface SearchHit {
  fileId: string
  fileName: string
  chunkIndex: number
  text: string
  score: number
}

type Scope = DataBankFile['scope']
const NO_TARGET = '__none__'

/** Where a file applies: everywhere, one character, or one chat. */
function ScopePicker({ scope, target, onScope, onTarget, compact }: {
  scope: Scope; target: string | null; onScope: (s: Scope) => void; onTarget: (id: string | null) => void; compact?: boolean
}) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const chatList = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'}>
      <Select value={scope} onValueChange={(v) => { if (v) { onScope(v as Scope); onTarget(null) } }}>
        <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('bank.scope')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="global">{t('bank.scope.global')}</SelectItem>
          <SelectItem value="character">{t('bank.scope.character')}</SelectItem>
          <SelectItem value="chat">{t('bank.scope.chat')}</SelectItem>
        </SelectContent>
      </Select>
      {scope === 'character' && (
        <Select value={target ?? NO_TARGET} onValueChange={(v) => v && onTarget(v === NO_TARGET ? null : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('bank.pickCharacter')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TARGET}>{t('bank.pickCharacter')}</SelectItem>
            {characters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {scope === 'chat' && (
        <Select value={target ?? NO_TARGET} onValueChange={(v) => v && onTarget(v === NO_TARGET ? null : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('bank.pickChat')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TARGET}>{t('bank.pickChat')}</SelectItem>
            {chatList.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

/** The scope of a stored file, changeable in place. */
function FileScope({ f }: { f: DataBankFile }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const updateDataBankFile = useApp((s) => s.updateDataBankFile)
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>(f.scope)
  const [target, setTarget] = useState<string | null>(f.scopeTargetId)
  const label = f.scope === 'global' || !f.scopeTargetId
    ? t('bank.scope.global')
    : f.scope === 'character'
      ? characters.find((c) => c.id === f.scopeTargetId)?.name ?? f.scopeTargetId
      : t('bank.scope.chatNamed', { title: chats.find((c) => c.id === f.scopeTargetId)?.title ?? f.scopeTargetId })
  const Icon = f.scope === 'character' ? User : f.scope === 'chat' ? ChatCircle : Globe
  const apply = (s: Scope, tg: string | null) => {
    if (s !== 'global' && !tg) return
    updateDataBankFile(f.id, { scope: s, scopeTargetId: s === 'global' ? null : tg })
    setOpen(false)
    toast.success(t('bank.scope.changed'))
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setScope(f.scope); setTarget(f.scopeTargetId) } }}>
      <PopoverTrigger
        render={
          <button type="button" className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50" title={t('bank.scope.change')} aria-label={t('bank.scope.changeNamed', { name: f.name })}>
            <Icon className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
          </button>
        }
      />
      <PopoverContent align="start" className="w-60">
        <p className="text-xs font-medium">{t('bank.scope.change')}</p>
        <ScopePicker
          compact
          scope={scope}
          target={target}
          onScope={(s) => { setScope(s); if (s === 'global') apply('global', null) }}
          onTarget={(id) => { setTarget(id); if (id) apply(scope, id) }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DataBankTab() {
  const dataBank = useApp((s) => s.dataBank)
  const uploadDataBankFile = useApp((s) => s.uploadDataBankFile)
  const updateDataBankFile = useApp((s) => s.updateDataBankFile)
  const deleteDataBankFile = useApp((s) => s.deleteDataBankFile)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, confirmDialog] = useConfirm()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const t = useT()
  const chats = useApp((s) => s.chats)
  const [upScope, setUpScope] = useState<Scope>('global')
  const [upTarget, setUpTarget] = useState<string | null>(null)
  const [searchChat, setSearchChat] = useState(NO_TARGET)
  const needTarget = upScope !== 'global' && !upTarget

  const upload = async (files: FileList) => {
    for (const f of Array.from(files)) {
      if (!TEXT_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        toast.error(`${f.name}: only text formats are indexed (${TEXT_EXTENSIONS.join(', ')})`)
        continue
      }
      if (f.size > 2 * 1024 * 1024) {
        toast.error(`${f.name}: over the 2 MB text limit`)
        continue
      }
      try {
        await uploadDataBankFile(f.name, await f.text(), upScope, upScope === 'global' ? null : upTarget)
      } catch (e) {
        toast.error(`${f.name} failed`, { description: (e as Error).message })
      }
    }
  }

  const search = async () => {
    if (!query.trim()) { setHits(null); return }
    setSearching(true)
    try {
      const r = await j<{ results: SearchHit[] }>(`/databank/search?q=${encodeURIComponent(query)}${searchChat !== NO_TARGET ? `&chatId=${encodeURIComponent(searchChat)}` : ''}`)
      setHits(r.results)
    } catch (e) {
      toast.error('Search failed', { description: (e as Error).message })
    } finally { setSearching(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-pretty text-muted-foreground">
          <Database className="size-4 shrink-0" aria-hidden="true" />
          Attach documents for retrieval. The engine chunks them and injects the most
          relevant passages into the prompt when you send a message.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={TEXT_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ScopePicker scope={upScope} target={upTarget} onScope={setUpScope} onTarget={setUpTarget} />
          <Button size="sm" variant="outline" disabled={needTarget} title={needTarget ? t('bank.needTarget') : undefined} onClick={() => fileRef.current?.click()}>
            <UploadSimple className="size-4" aria-hidden="true" /> Upload
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {dataBank.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(f.size)} · {f.chunks} chunk{f.chunks === 1 ? '' : 's'}</p>
              <FileScope f={f} />
            </div>
            <Switch
              checked={f.enabled}
              onCheckedChange={(v) => { updateDataBankFile(f.id, { enabled: v }); toast.success(v ? `${f.name} is now injected` : `${f.name} paused`) }}
              aria-label={`Enable ${f.name}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${f.name}`}
              onClick={() => void confirm({
                title: `Delete ${f.name}?`,
                description: 'The document and its chunks are removed from disk.',
              }).then((yes) => {
                if (!yes) return
                deleteDataBankFile(f.id)
                toast.success('File removed')
              })}
            >
              <Trash className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {dataBank.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No documents yet. Upload text files to make them available to the AI.
        </p>
      )}

      {/* Search probe: proves the retrieval half end-to-end without sending a chat. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Search the bank</p>
            <p className="text-xs text-muted-foreground">The same retrieval that runs when you send a message.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={searchChat} onValueChange={(v) => v && setSearchChat(v)}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('bank.searchChat')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TARGET}>{t('bank.searchAll')}</SelectItem>
                {[...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
              placeholder="terms to look for…"
              className="h-8 w-44 rounded-md border border-border bg-transparent px-2 text-xs"
              aria-label="Search the data bank"
            />
            <Button variant="outline" size="sm" onClick={() => void search()} disabled={searching}>
              {searching ? <CircleNotch className="size-3.5 animate-spin" /> : null} Search
            </Button>
          </div>
        </div>
        {hits && (
          hits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No matching passages.</p>
          ) : hits.map((h, i) => (
            <div key={i} className="rounded-md bg-muted/50 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{h.fileName} · chunk {h.chunkIndex} · score {h.score}</p>
              <p className="line-clamp-3 text-xs leading-relaxed">{h.text}</p>
            </div>
          ))
        )}
      </div>
      {confirmDialog}
    </div>
  )
}
