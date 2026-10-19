
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Check, FileArrowDown, ImageSquare, PencilSimple, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { storeBackground } from '@/lib/webp'
import { convertCandidates, convertOne, formatBytes, parseTags, toSnake, uniqueName, type ConvertReport } from '@/lib/world-backgrounds'
import { useConfirm } from '@/components/ui/confirm'

export function BackgroundsTab() {
  const backgrounds = useApp((s) => s.backgrounds)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const updateBackground = useApp((s) => s.updateBackground)
  const addBackground = useApp((s) => s.addBackground)
  const deleteBackground = useApp((s) => s.deleteBackground)
  const t = useT()
  const folders = useApp((s) => s.folders)
  const focusFolder = useApp((s) => s.focusBackgroundFolderId)
  const [newName, setNewName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  // folder filter: 'all', 'none' (no folder) or a folder id
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState('')
  const [conv, setConv] = useState<{ done: number; total: number } | null>(null)
  const convStop = useRef(false)

  const bgFolders = useMemo(() => folders.filter((f) => f.scope === 'backgrounds'), [folders])
  // "Open in Backgrounds" from a world lands here on that folder
  useEffect(() => {
    if (!focusFolder) return
    setFilter(focusFolder)
    useApp.setState({ focusBackgroundFolderId: null })
  }, [focusFolder])
  const shown = useMemo(
    () => backgrounds.filter((b) => (filter === 'all' ? true : filter === 'none' ? !b.folderId : b.folderId === filter)),
    [backgrounds, filter],
  )
  const candidates = useMemo(() => convertCandidates(backgrounds), [backgrounds])

  const addFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    const taken = backgrounds.map((b) => b.name)
    let added = 0
    for (let i = 0; i < list.length; i++) {
      const file = list[i]!
      const base = newName.trim() && list.length === 1 ? newName.trim() : file.name.replace(/\.[^.]+$/, '')
      const name = uniqueName(base || `Background ${i + 1}`, taken)
      try {
        // stored once as WebP in the asset store (the library keeps only the URL)
        const r = await storeBackground(file, name)
        const id = addBackground(name, r.url)
        taken.push(name)
        added++
        if (filter !== 'all' && filter !== 'none') updateBackground(id, { folderId: filter })
        if (r.converted) toast.success(t('bg.tab.saved', { before: formatBytes(r.before), after: formatBytes(r.size) }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    }
    setNewName('')
    if (added > 0) toast.success(t('bg.tab.added', { n: added }))
  }

  const startEdit = (id: string) => {
    const b = backgrounds.find((x) => x.id === id)
    if (!b) return
    setEditing(id); setEditName(b.name); setEditTags((b.tags ?? []).join(', '))
  }
  const saveEdit = () => {
    const b = backgrounds.find((x) => x.id === editing)
    if (!b) { setEditing(null); return }
    const raw = editName.trim()
    // names of the world's folders are English snake_case; a free name elsewhere stays as typed
    const name = b.folderId && toSnake(raw) ? uniqueName(toSnake(raw), backgrounds.filter((x) => x.id !== b.id && x.folderId === b.folderId).map((x) => x.name)) : (raw || b.name)
    updateBackground(b.id, { name, tags: parseTags(editTags) })
    setEditing(null)
  }

  const convertAll = async () => {
    const yes = await confirm({
      title: t('bg.tab.convertTitle'),
      description: `${t('bg.tab.convertCount', { n: candidates.length })} ${t('bg.tab.convertWarn')}`,
      actionLabel: t('bg.tab.convertGo'),
      destructive: false,
    })
    if (!yes) return
    convStop.current = false
    const rep: ConvertReport = { converted: 0, kept: 0, failed: 0, saved: 0 }
    setConv({ done: 0, total: candidates.length })
    for (let i = 0; i < candidates.length; i++) {
      if (convStop.current) break
      const b = candidates[i]!
      try {
        const r = await convertOne(b)
        if (r) { updateBackground(b.id, { url: r.url }); rep.converted++; rep.saved += r.saved } else rep.kept++
      } catch {
        rep.failed++
      }
      setConv({ done: i + 1, total: candidates.length })
    }
    setConv(null)
    toast.success(t('bg.tab.convertDone', { n: rep.converted, size: formatBytes(rep.saved), m: rep.kept + rep.failed }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-pretty text-muted-foreground">
          Manage chat backgrounds. The active background applies to all chats unless a chat overrides it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('bg.tab.folder')}</span>
          <Select value={filter} onValueChange={(v) => v && setFilter(v)}>
            <SelectTrigger className="h-9 w-48 max-md:h-10" aria-label={t('bg.tab.folder')} data-testid="bg-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t('bg.tab.folderAll')}</SelectItem>
                <SelectItem value="none">{t('bg.tab.folderNone')}</SelectItem>
                {bgFolders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        {candidates.length > 0 && !conv && (
          <Button size="sm" variant="outline" className="max-md:h-10" onClick={() => void convertAll()} data-testid="bg-convert">
            <FileArrowDown className="size-4" aria-hidden="true" /> {t('bg.tab.convert')}
          </Button>
        )}
        {conv && (
          <>
            <span role="status" className="text-sm text-muted-foreground" data-testid="bg-convert-progress">{t('bg.tab.converting', { done: Math.min(conv.done + 1, conv.total), total: conv.total })}</span>
            <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => { convStop.current = true }}>{t('world.bg.stop')}</Button>
          </>
        )}
      </div>
      {candidates.length > 0 && !conv && <p className="-mt-2 text-xs text-muted-foreground">{t('bg.tab.convertHint')}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-dashed p-3 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
      >
        <p className="text-xs text-muted-foreground">
          Drop image files here to add your own backgrounds, or name one and browse for it.
        </p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Optional name…"
            aria-label="New background name"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <ImageSquare className="size-4" aria-hidden="true" /> Upload
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          data-testid="bg-file"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((bg) => {
          const active = settings.activeBackgroundId === bg.id
          return (
            <figure key={bg.id} className={cn('overflow-hidden rounded-lg border', active ? 'border-primary' : 'border-border')}>
              <button
                type="button"
                className="relative block aspect-video w-full"
                onClick={() => updateSettings({ activeBackgroundId: active ? null : bg.id })}
                aria-pressed={active}
                aria-label={active ? `Deactivate ${bg.name}` : `Set ${bg.name} as active background`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bg.url || DEFAULT_AVATAR} alt="" className="size-full object-cover" />
                {active && (
                  <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
              <figcaption className="flex flex-wrap items-center gap-1.5 p-2">
                <span className="w-full truncate text-xs font-medium" title={bg.name}>{bg.name}</span>
                <Badge variant="outline" className="hidden text-[10px] lg:inline-flex">{bg.type}</Badge>
                <Select value={bg.fitting} onValueChange={(v) => v && updateBackground(bg.id, { fitting: v as never })}>
                  <SelectTrigger className="h-6 w-20 px-1.5 text-[11px]" aria-label={`Fitting for ${bg.name}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="cover">Cover</SelectItem>
                      <SelectItem value="contain">Contain</SelectItem>
                      <SelectItem value="stretch">Stretch</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="ml-auto size-6 text-muted-foreground" aria-label={`${t('world.bg.edit')} ${bg.name}`} onClick={() => (editing === bg.id ? setEditing(null) : startEdit(bg.id))}>
                  <PencilSimple className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${bg.name}`}
                  onClick={() => void confirm({
                    title: `Delete ${bg.name}?`,
                    description: 'The image is removed; chats using it fall back to plain color.',
                  }).then((yes) => {
                    if (!yes) return
                    deleteBackground(bg.id); toast.success('Background deleted')
                  })}
                >
                  <Trash className="size-3.5" aria-hidden="true" />
                </Button>
              </figcaption>
              {(bg.tags?.length ?? 0) > 0 && editing !== bg.id && (
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {bg.tags!.map((tag) => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
                </div>
              )}
              {editing === bg.id && (
                <form className="flex flex-col gap-1.5 p-2 pt-0" onSubmit={(e) => { e.preventDefault(); saveEdit() }}>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={t('bg.tab.nameLabel')} className="h-9 text-sm" />
                  <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder={t('bg.tab.tagsPh')} aria-label={t('bg.tab.tagsLabel')} className="h-9 text-sm" />
                  <Button type="submit" size="sm" variant="outline" className="max-md:h-10">{t('world.bg.save')}</Button>
                </form>
              )}
            </figure>
          )
        })}
      </div>
    {confirmDialog}
    </div>
  )
}
