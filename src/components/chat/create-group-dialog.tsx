import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, MagnifyingGlass, Star, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { ScrollStrip } from '@/components/ui/scroll-strip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { autoGroupName, moveInOrder, pickCharacters, soloCharacters, tagCounts, type PickerScope, type PickerSort } from '@/lib/group-picker'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'

/** The cards drawn at once; the rest come with "Show more" (a library can hold thousands). */
const PAGE = 60
const SCOPES: PickerScope[] = ['all', 'fav', 'recent']

/**
 * New group, step one: a wide picker (full screen on a phone). Search, All / Favourites / Recent, tag chips and a sort narrow the
 * grid; the chosen members sit in a tray on top in speaking order (the order of the group's `memberIds`). "Next" makes the group
 * and opens its editor, where the first chat is started.
 */
export function CreateGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const createGroup = useApp((s) => s.createGroup)
  const openCard = useApp((s) => s.openCard)
  const wantAvatars = useApp((s) => s.wantAvatars)

  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<PickerScope>('all')
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<PickerSort>('name')
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState(false)

  const solo = useMemo(() => soloCharacters(characters), [characters])
  const byId = useMemo(() => new Map(solo.map((c) => [c.id, c])), [solo])
  const chatCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of chats) if (c.characterId) m.set(c.characterId, (m.get(c.characterId) ?? 0) + 1)
    return m
  }, [chats])
  const tagChips = useMemo(() => tagCounts(solo).slice(0, 40), [solo])
  const list = useMemo(() => pickCharacters(solo, { query, scope, tags, sort }, chatCounts), [solo, query, scope, tags, sort, chatCounts])
  const page = list.slice(0, shown)
  useEffect(() => { setShown(PAGE) }, [query, scope, tags, sort])
  // the portraits the list left out, for the cards on screen
  useEffect(() => { if (open) wantAvatars(page.map((c) => c.id)) }, [open, page, wantAvatars])

  const members = chosen.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
  const ready = members.length >= 2
  const toggle = (id: string) => setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const clearFilters = () => { setQuery(''); setScope('all'); setTags([]) }

  const reset = () => { setName(''); setChosen([]); clearFilters(); setSort('name') }
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) reset()
  }

  const next = () => {
    if (!ready || busy) return
    const title = name.trim() || autoGroupName(members)
    setBusy(true)
    void createGroup(title, chosen)
      .then((gid) => {
        onOpenChange(false)
        reset()
        openCard(gid)
      })
      .catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px] max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0"
        data-testid="group-picker-dialog"
      >
        <DialogHeader className="px-4 pt-4 pr-12 pb-2">
          <DialogTitle>{t('grp.new.title')}</DialogTitle>
          <DialogDescription>{t('grp.new.desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
          <Field>
            <FieldLabel htmlFor="group-name">{t('grp.new.name')}</FieldLabel>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('grp.new.namePlaceholder')} />
          </Field>

          <div data-testid="group-picker-tray">
            <p className="mb-1.5 text-xs font-medium">
              {t('grp.new.members')} <span className="font-normal text-muted-foreground">({chosen.length})</span>
            </p>
            {members.length === 0 ? (
              <p className="min-h-8 text-xs text-muted-foreground">{t('grp.new.trayEmpty')}</p>
            ) : (
              <>
                <ol className="flex flex-wrap gap-1.5">
                  {members.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-0.5 pl-1.5 text-xs" data-testid="group-picker-chip">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cta text-[12px] font-semibold text-cta-foreground tabular-nums">{i + 1}</span>
                      <span className="max-w-32 truncate">{c.name}</span>
                      <button type="button" disabled={i === 0} aria-label={t('grp.new.earlier', { name: c.name })} onClick={() => setChosen((cur) => moveInOrder(cur, c.id, -1))} className="flex size-7 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 max-md:size-10">
                        <ArrowLeft className="size-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={i === members.length - 1} aria-label={t('grp.new.later', { name: c.name })} onClick={() => setChosen((cur) => moveInOrder(cur, c.id, 1))} className="flex size-7 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 max-md:size-10">
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={t('grp.new.remove', { name: c.name })} onClick={() => toggle(c.id)} className="flex size-7 items-center justify-center rounded-full hover:bg-accent max-md:size-10">
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-xs text-muted-foreground">{t('grp.new.orderHint')}</p>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('grp.new.search')} aria-label={t('grp.new.search')} className="pl-8 max-md:h-10" data-testid="group-picker-search" />
            </div>
            <Select value={sort} onValueChange={(v) => v && setSort(v as PickerSort)}>
              <SelectTrigger className="w-40 max-md:h-10" aria-label={t('grp.new.sort')} data-testid="group-picker-sort">
                <SelectValue>{(v: string) => t(v === 'recent' ? 'grp.new.sortRecent' : v === 'chats' ? 'grp.new.sortChats' : 'grp.new.sortName')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t('grp.new.sortName')}</SelectItem>
                <SelectItem value="recent">{t('grp.new.sortRecent')}</SelectItem>
                <SelectItem value="chats">{t('grp.new.sortChats')}</SelectItem>
              </SelectContent>
            </Select>
            <div role="group" aria-label={t('grp.new.show')} className="inline-flex rounded-lg border border-border p-0.5">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={cn('min-h-8 rounded-md px-3 text-xs font-medium transition-colors max-md:min-h-10', scope === s ? 'bg-cta text-cta-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                >
                  {t(s === 'all' ? 'grp.new.scopeAll' : s === 'fav' ? 'grp.new.scopeFav' : 'grp.new.scopeRecent')}
                </button>
              ))}
            </div>
          </div>

          {tagChips.length > 0 && (
            <ScrollStrip>
              <div className="flex w-max gap-1.5 py-0.5" data-testid="group-picker-tags">
                {tagChips.map(({ tag, n }) => (
                  <ToggleChip key={tag} pressed={tags.includes(tag)} onPressedChange={(on) => setTags((cur) => (on ? [...cur, tag] : cur.filter((x) => x !== tag)))}>
                    {tag} <span className="text-muted-foreground tabular-nums">{n}</span>
                  </ToggleChip>
                ))}
              </div>
            </ScrollStrip>
          )}

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center" data-testid="group-picker-empty">
              <p className="text-sm text-muted-foreground">{query.trim() ? t('grp.new.noMatchQ', { q: query.trim() }) : t('grp.new.noMatch')}</p>
              <Button variant="outline" size="sm" onClick={clearFilters}>{t('grp.new.clear')}</Button>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5" data-testid="group-picker-grid">
                {page.map((c) => {
                  const at = chosen.indexOf(c.id)
                  const on = at >= 0
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(c.id)}
                        data-testid="group-picker-card"
                        className={cn(
                          'relative flex w-full flex-col gap-1.5 rounded-lg border-2 bg-card p-1.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          on ? 'border-cta bg-cta/10' : 'border-border hover:bg-accent/50',
                        )}
                      >
                        <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                          <img src={c.avatar || DEFAULT_AVATAR} alt="" loading="lazy" className="size-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR }} />
                          {on && (
                            <span className="absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-cta px-1.5 text-xs font-semibold text-cta-foreground tabular-nums">
                              <Check className="size-3" weight="bold" aria-hidden="true" />{at + 1}
                            </span>
                          )}
                          {c.favorite && (
                            <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/85 text-primary" title={t('group.ed.favorite')}>
                              <Star className="size-3.5" weight="fill" aria-label={t('group.ed.favorite')} />
                            </span>
                          )}
                        </span>
                        <span className="block truncate px-0.5 text-sm font-medium">{c.name}</span>
                        {(c.tags ?? []).length > 0 && <span className="block truncate px-0.5 text-xs text-muted-foreground">{(c.tags ?? []).slice(0, 2).join(' · ')}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {list.length > shown && (
                <Button variant="outline" size="sm" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
                  {t('grp.new.more', { n: list.length - shown })}
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-popover px-4 py-3">
          <Button variant="outline" onClick={() => close(false)} className="max-md:h-10">{t('grp.new.cancel')}</Button>
          <Button onClick={next} disabled={!ready || busy} className="h-9 px-4 max-md:h-10" data-testid="group-picker-next">
            {ready ? t('grp.new.next', { n: members.length }) : t('grp.new.needTwo')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
