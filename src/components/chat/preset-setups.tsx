import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, PencilSimple, Star, Trash, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import type { PresetValues } from '@/components/chat/preset-choices'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { Preset, PresetSetup, PresetSetups } from '@/lib/types'
import { orderedSetups, sameValues, SETUPS_SEARCH_FROM } from '@/lib/preset-setups'
import { cn } from '@/lib/utils'

const EMPTY: PresetSetups = { items: [], defaultId: null }

/** A setup's name on screen: the older single default has none. */
function useSetupLabel() {
  const t = useT()
  return (x: PresetSetup) => x.name || t('pc.setups.myDefault')
}

/**
 * The chat Preset panel's saved setups (Molfar.Vertep#526): named sets of this preset's Choices. Load one into the
 * chat, save the chat's choices under a name (the same name updates it), star the one new chats start from, rename,
 * delete. The star is the preset's default for new chats (the engine mirrors it into preset-defaults.json).
 */
export function PresetSetupsBlock({ preset, current, onLoad }: { preset: Preset; current: PresetValues; onLoad: (picks: PresetValues) => void }) {
  const t = useT()
  const label = useSetupLabel()
  const [confirm, confirmDialog] = useConfirm()
  const all = useApp((s) => s.presetSetups)
  const load = useApp((s) => s.loadPresetSetups)
  const save = useApp((s) => s.savePresetSetups)
  useEffect(() => { void load() }, [load])
  const data = all?.[preset.id] ?? EMPTY
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // a short list: worked out on each render
  const q = query.trim().toLowerCase()
  const rows = q ? orderedSetups(data).filter((x) => label(x).toLowerCase().includes(q)) : orderedSetups(data)
  const typed = name.replace(/\s+/g, ' ').trim()
  const same = data.items.find((x) => label(x).toLowerCase() === typed.toLowerCase())

  const put = async (next: PresetSetups) => {
    setBusy(true)
    try { return await save(preset.id, next) } finally { setBusy(false) }
  }
  const saveCurrent = async () => {
    if (!typed) return
    const items = same
      ? data.items.map((x) => (x.id === same.id ? { ...x, picks: current, at: Date.now() } : x))
      : [...data.items, { id: `s${Date.now().toString(36)}`, name: typed, picks: current, at: Date.now() }]
    if (await put({ ...data, items })) {
      setName('')
      toast.success(t(same ? 'pc.setups.updated' : 'pc.setups.saved', { name: typed }))
    }
  }
  const star = (x: PresetSetup) => void put({ ...data, defaultId: data.defaultId === x.id ? null : x.id })
  const rename = async (x: PresetSetup) => {
    const n = draft.replace(/\s+/g, ' ').trim()
    if (n && n !== x.name) await put({ ...data, items: data.items.map((y) => (y.id === x.id ? { ...y, name: n } : y)) })
    setEditing(null)
  }
  const remove = async (x: PresetSetup) => {
    const starred = data.defaultId === x.id
    const ok = await confirm({
      title: t('pc.setups.deleteTitle', { name: label(x) }),
      description: starred ? t('pc.setups.deleteBodyStar') : t('pc.setups.deleteBody'),
      actionLabel: t('pc.setups.delete'),
    })
    if (ok) await put({ items: data.items.filter((y) => y.id !== x.id), defaultId: starred ? null : data.defaultId })
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border/70 p-3" aria-labelledby="preset-setups-title" data-testid="preset-setups">
      <h3 id="preset-setups-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('pc.setups.title')}{data.items.length > 0 ? ` · ${data.items.length}` : ''}
      </h3>
      <p className="text-xs text-muted-foreground">{t('pc.setups.lead')}</p>
      {data.items.length >= SETUPS_SEARCH_FROM && (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pc.setups.find')} aria-label={t('pc.setups.find')} className="h-8 text-xs max-md:h-10" data-testid="preset-setups-find" />
      )}
      {data.items.length === 0 && <p className="text-xs text-muted-foreground" data-testid="preset-setups-none">{t('pc.setups.none')}</p>}
      {data.items.length > 0 && rows.length === 0 && <p className="text-xs text-muted-foreground">{t('pc.setups.noMatch', { q: query.trim() })}</p>}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((x) => {
            const starred = data.defaultId === x.id
            const inChat = sameValues(x.picks, current)
            const n = Object.keys(x.picks).length
            return (
              <li key={x.id} className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5', inChat ? 'border-cta/50 bg-cta/5' : 'border-border')} data-testid="preset-setup">
                {editing === x.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void rename(x) }}>
                    <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} aria-label={t('pc.setups.nameLabel')} className="h-8 min-w-0 flex-1 text-xs max-md:h-10"
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) } }} />
                    <Button type="submit" variant="ghost" size="icon" className="max-md:size-10" aria-label={t('pc.setups.renameDone')} title={t('pc.setups.renameDone')} disabled={busy || !draft.trim()}>
                      <Check className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="max-md:size-10" aria-label={t('pc.setups.renameCancel')} title={t('pc.setups.renameCancel')} onClick={() => setEditing(null)}>
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{label(x)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[starred ? t('pc.setups.starred') : '', inChat ? t('pc.setups.inChat') : '', !starred && !inChat ? t('pc.setups.count', { n }) : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Button variant="outline" size="sm" className="shrink-0 text-xs max-md:h-10" disabled={busy || inChat}
                      onClick={() => { onLoad(x.picks); toast.success(t('pc.setups.loaded', { name: label(x) })) }}>
                      {t('pc.setups.load')}
                    </Button>
                    <Button variant={starred ? 'secondary' : 'ghost'} size="icon" className="shrink-0 max-md:size-10" disabled={busy}
                      aria-pressed={starred} aria-label={starred ? t('pc.setups.unstar') : t('pc.setups.star')} title={starred ? t('pc.setups.unstar') : t('pc.setups.star')}
                      onClick={() => star(x)}>
                      <Star className={cn('size-3.5', starred && 'text-cta')} weight={starred ? 'fill' : 'regular'} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" disabled={busy} aria-label={t('pc.setups.rename')} title={t('pc.setups.rename')}
                      onClick={() => { setEditing(x.id); setDraft(label(x)) }}>
                      <PencilSimple className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground max-md:size-10" disabled={busy} aria-label={t('pc.setups.delete')} title={t('pc.setups.delete')}
                      onClick={() => void remove(x)}>
                      <Trash className="size-3.5" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void saveCurrent() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('pc.setups.namePh')} aria-label={t('pc.setups.nameLabel')}
          className="h-8 min-w-0 flex-1 text-xs max-md:h-10" data-testid="preset-setups-name" />
        <Button type="submit" variant="tonal" size="sm" className="shrink-0 text-xs max-md:h-10" disabled={busy || !typed} data-testid="preset-setups-save">
          {same ? t('pc.setups.update') : t('pc.setups.save')}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{same ? t('pc.setups.updateHint', { name: label(same) }) : t('pc.setups.saveHint')}</p>
      {confirmDialog}
    </section>
  )
}

/** The new-chat step's "Load a saved setup" (#526): picks one of the preset's setups into the step's choices. It names the
 *  setup the step's choices match (the starred one when the step opens with it), and goes back to its prompt once they differ. */
export function SetupLoader({ preset, current, onLoad }: { preset: Preset; current: PresetValues; onLoad: (picks: PresetValues) => void }) {
  const t = useT()
  const label = useSetupLabel()
  const all = useApp((s) => s.presetSetups)
  const load = useApp((s) => s.loadPresetSetups)
  useEffect(() => { void load() }, [load])
  const data = all?.[preset.id] ?? EMPTY
  if (data.items.length === 0) return null
  const list = orderedSetups(data)
  const matched = list.find((x) => sameValues(x.picks, current))
  return (
    <Select value={matched?.id ?? ''} onValueChange={(id) => { const x = list.find((y) => y.id === id); if (x) onLoad(x.picks) }}>
      <SelectTrigger className="h-8 w-full text-xs max-md:h-10" aria-label={t('pc.setups.loadPick')} data-testid="new-chat-setups">
        <SelectValue placeholder={t('pc.setups.loadPick')}>
          {(id: string) => { const x = list.find((y) => y.id === id); return x ? t('pc.setups.loadedAs', { name: label(x) }) : t('pc.setups.loadPick') }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {list.map((x) => (
          <SelectItem key={x.id} value={x.id}>
            <span className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{label(x)}</span>
              {data.defaultId === x.id && <Star className="size-3 text-cta" weight="fill" aria-label={t('pc.setups.starred')} />}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
