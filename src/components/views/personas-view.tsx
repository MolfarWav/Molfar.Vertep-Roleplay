
import { useEffect, useRef, useState } from 'react'
import { Plus, Trash, Copy, UploadSimple, DownloadSimple, SealCheck, ChartBar, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm'
import { MasterDetail } from '@/components/shell/master-detail'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { downloadTextFile } from '@/lib/export'
import { fileToDataUrl } from '@/lib/engine'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'

export function PersonasView() {
  const personas = useApp((s) => s.personas)
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const lorebooks = useApp((s) => s.lorebooks)
  const updatePersona = useApp((s) => s.updatePersona)
  const usePersona = useApp((s) => s.usePersona)
  const addPersona = useApp((s) => s.addPersona)
  const duplicatePersona = useApp((s) => s.duplicatePersona)
  const deletePersona = useApp((s) => s.deletePersona)
  const __focus = useApp.getState().focusPersonaId
  useEffect(() => { if (__focus) useApp.setState({ focusPersonaId: null }) }, [])
  const [selectedId, setSelectedId] = useState(__focus ?? personas[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const importInput = useRef<HTMLInputElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const p = personas.find((x) => x.id === selectedId) ?? personas[0]
  // the persona being spoken as right now: the open chat's own, else the
  // selection new chats start with
  const activeChatId = useApp((s) => s.activeChatId)
  const chatPersonaId = chats.find((c) => c.id === activeChatId)?.personaId ?? null
  const activeId = personas.some((x) => x.id === chatPersonaId)
    ? chatPersonaId
    : (personas.find((x) => x.isDefault)?.id ?? null)

  /** Import: our backup shape (array of personas) or the common
   *  { name: description } personas object. */
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    let added = 0
    for (const file of Array.from(files)) {
      try {
        const json: unknown = JSON.parse(await file.text())
        if (Array.isArray(json)) {
          for (const item of json) {
            if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
              setSelectedId(addPersona(item as never)); added++
            }
          }
        } else if (json && typeof json === 'object') {
          for (const [name, description] of Object.entries(json as Record<string, unknown>)) {
            setSelectedId(addPersona({ name, description: String(description ?? '') })); added++
          }
        }
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? 'invalid JSON'}`) }
    }
    if (added) { toast.success(`Imported ${added} persona${added > 1 ? 's' : ''}`); setDetailOpen(true) }
  }

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !p) return
    try {
      updatePersona(p.id, { avatar: await fileToDataUrl(file, 512) })
      toast.success('Avatar updated')
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  const select = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

    // years of use → thousands of personas; the sidebar pages through them
  const PERSONA_PAGE = 100
  const [personaPage, setPersonaPage] = useState(0)
  const pagedPersonas = personas.slice(clampPage(personaPage, personas.length, PERSONA_PAGE) * PERSONA_PAGE, (clampPage(personaPage, personas.length, PERSONA_PAGE) + 1) * PERSONA_PAGE)

  return (
    <SectionPage section="personas" count={personas.length} hideOnPhone={detailOpen && !!p}>
    <MasterDetail
      detailOpen={detailOpen && !!p}
      onBack={() => setDetailOpen(false)}
      detailTitle={p?.name}
      masterWidth="w-60"
      master={
        <aside className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <PaneTitle section="personas" count={personas.length} />
          <Button variant="ghost" size="sm" className="ml-auto size-7 p-0" onClick={() => setSelectedId(addPersona())} aria-label="New persona">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-1.5">
            {pagedPersonas.map((x) => (
              <li key={x.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => select(x.id)}
                  className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', x.id === p?.id ? 'bg-accent' : 'hover:bg-accent/50')}
                >
                  <Avatar className="size-7 rounded-md">
                    <AvatarImage src={x.avatar || DEFAULT_AVATAR} alt="" />
                    <AvatarFallback>{x.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate font-medium">
                      {x.name}
                      {x.id === activeId && <SealCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{x.title}</span>
                  </span>
                </button>
                {x.id !== activeId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 shrink-0 p-0 text-muted-foreground"
                    onClick={() => { usePersona(x.id); toast.success(`Using ${x.name}`) }}
                    aria-label={`Use ${x.name}`}
                  >
                    <CheckCircle className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pager total={personas.length} page={clampPage(personaPage, personas.length, PERSONA_PAGE)} pageSize={PERSONA_PAGE} onPage={setPersonaPage} />
        </ScrollArea>
        <div className="flex gap-1 border-t border-border p-1.5">
          <input ref={importInput} type="file" accept="application/json" multiple className="hidden" onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }} />
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => importInput.current?.click()}><UploadSimple className="size-3.5" aria-hidden="true" />Import</Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { downloadTextFile('personas-backup.json', JSON.stringify(personas, null, 2), 'application/json'); toast.success('Backup downloaded') }}><DownloadSimple className="size-3.5" aria-hidden="true" />Backup</Button>
        </div>
        </aside>
      }
      detail={
        <>
      {p ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-16 rounded-lg">
                <AvatarImage src={p.avatar || DEFAULT_AVATAR} alt={p.name} />
                <AvatarFallback>{p.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
                <div className="flex flex-col gap-1">
                <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.target.value = '' }} />
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => avatarInput.current?.click()}>Upload</Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={p.id === activeId}
                  onClick={() => { usePersona(p.id); toast.success(`Using ${p.name}`) }}
                >
                  {p.id === activeId ? 'In use' : 'Use this persona'}
                </Button>
              </div>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setStatsOpen(true)} aria-label="Usage stats"><ChartBar className="size-4" aria-hidden="true" /></Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedId(duplicatePersona(p.id)); toast.success('Persona duplicated') }} aria-label="Duplicate"><Copy className="size-4" aria-hidden="true" /></Button>
                <Button variant="ghost" size="sm" onClick={() => void confirm({
                  title: `Delete ${p.name}?`,
                  description: 'Their avatar and description go with them, chats keep their messages.',
                }).then((yes) => {
                  if (!yes) return
                  deletePersona(p.id); setSelectedId(personas.find((x) => x.id !== p.id)?.id ?? ""); toast.success('Deleted')
                })} aria-label="Delete persona">
                  <Trash className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Name</Label>
                <Input value={p.name} onChange={(e) => updatePersona(p.id, { name: e.target.value })} aria-label="Persona name" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Pronouns</Label>
                <Input value={p.pronouns} onChange={(e) => updatePersona(p.id, { pronouns: e.target.value })} aria-label="Pronouns" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Title</Label>
              <Input value={p.title} onChange={(e) => updatePersona(p.id, { title: e.target.value })} aria-label="Title" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="flex items-center gap-2 text-xs">
                Description
                <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(p.description))} tok</Badge>
              </Label>
              <Textarea value={p.description} rows={5} onChange={(e) => updatePersona(p.id, { description: e.target.value })} aria-label="Description" className="text-sm" />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground">Bindings</h2>
              <div className="flex items-center gap-3">
                <Label className="w-28 text-xs">Binding mode</Label>
                <Select value={p.binding} onValueChange={(v) => updatePersona(p.id, { binding: v as never })}>
                  <SelectTrigger className="w-48" aria-label="Binding mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="character">Lock to character</SelectItem>
                    <SelectItem value="chat">Lock to chat</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.autoLock} onCheckedChange={(v) => updatePersona(p.id, { autoLock: v })} aria-label="Auto-lock" />
                  Auto-lock
                </label>
              </div>
              {p.binding === 'character' && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Bound characters</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {characters.filter((c) => !c.isGroup).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => updatePersona(p.id, { boundCharacterIds: p.boundCharacterIds.includes(c.id) ? p.boundCharacterIds.filter((x) => x !== c.id) : [...p.boundCharacterIds, c.id] })}
                        className={cn('rounded-full border px-2 py-0.5 text-xs', p.boundCharacterIds.includes(c.id) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground')}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground">Bound lorebooks</h2>
              {lorebooks.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={p.lorebookIds.includes(b.id)}
                    onCheckedChange={(v) => updatePersona(p.id, { lorebookIds: v ? [...p.lorebookIds, b.id] : p.lorebookIds.filter((x) => x !== b.id) })}
                    aria-label={`Bind ${b.name}`}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No persona selected</div>
      )}

      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Usage: {p?.name}</DialogTitle></DialogHeader>
          {p && (() => {
            const using = chats.filter((ch) => ch.personaId === p.id)
            const msgs = using.flatMap((ch) => ch.messages.filter((m) => m.role === 'user'))
            const words = msgs.reduce((n, m) => n + (m.swipes[m.activeSwipe]?.content.trim().split(/\s+/).filter(Boolean).length ?? 0), 0)
            const pairs = new Map<string, number>()
            for (const ch of using) {
              const cid = ch.characterId
              if (cid) pairs.set(cid, (pairs.get(cid) ?? 0) + 1)
            }
            const top = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0]
            const topChar = characters.find((c) => c.id === top?.[0])
            return (
              <ul className="flex flex-col gap-1 text-sm">
                <li className="flex justify-between"><span className="text-muted-foreground">Chats using this persona</span><span>{using.length}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Messages sent</span><span>{msgs.length}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Words written</span><span>{words.toLocaleString()}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Most-paired character</span><span>{topChar?.name ?? '—'}</span></li>
              </ul>
            )
          })()}
        </DialogContent>
      </Dialog>
        {confirmDialog}
        </>
      }
    />
    </SectionPage>
  )
}
