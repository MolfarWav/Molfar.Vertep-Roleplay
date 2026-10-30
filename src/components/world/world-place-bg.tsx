// The picture of a place: pick one from the Backgrounds library, remove it, or generate one for just this place.
// The chat shows the bound picture when the story is at the place and "Change the background by scene" is on.
// The picture's tags get the place's name and aliases, so the Dashboard's tag match finds it too.

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { mergeTags, pickerGroups, pictureOf, placeTags } from '@/lib/world-backgrounds'
import { editWorldRecord, type WorldRecord } from '@/lib/world'
import { MakeSet } from './world-bg-set'

/** The little picture of a place row: the bound image, or a dashed empty box (with a hint when the image left the library). */
export function PlaceThumb({ record, className }: { record: WorldRecord; className?: string }) {
  const t = useT()
  const backgrounds = useApp((s) => s.backgrounds)
  const pic = pictureOf(record.background, backgrounds)
  const gone = !!record.background && !pic
  return (
    <span className={cn('flex shrink-0 flex-col items-center gap-0.5', className)}>
      {pic ? (
        <span className="h-8 w-12 rounded-sm border border-border bg-cover bg-center" style={{ backgroundImage: `url(${pic.url})` }} role="img" aria-label={pic.name} data-testid="place-thumb" />
      ) : (
        <span className="flex h-8 w-12 items-center justify-center rounded-sm border border-dashed border-border" role="img" aria-label={gone ? t('world.places.bgGone') : t('world.places.bgNone')} data-testid="place-thumb-empty" data-gone={gone ? 'true' : undefined} />
      )}
      {gone && <span className="max-w-24 text-center text-[10px] leading-tight text-muted-foreground">{t('world.places.bgGone')}</span>}
    </span>
  )
}

export function PlaceBackgroundDialog({ open, onOpenChange, chatId, place, folderId, folderName, onSaved, onOpenBackgrounds }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  chatId: string
  place: WorldRecord
  /** the world's own backgrounds folder (null = none linked yet) */
  folderId: string | null
  folderName: string
  /** the records after a change (as the Records route answers) */
  onSaved: (records: WorldRecord[]) => void
  /** go to the Backgrounds tab, where the world's folder is made */
  onOpenBackgrounds: () => void
}) {
  const t = useT()
  const backgrounds = useApp((s) => s.backgrounds)
  const folders = useApp((s) => s.folders)
  const updateBackground = useApp((s) => s.updateBackground)
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState(false)
  const [busy, setBusy] = useState(false)
  // the first picture a generated set stores for a place with none becomes its background
  const boundByMake = useRef(false)
  const hadPicture = !!pictureOf(place.background, backgrounds)

  useEffect(() => {
    if (open) { setQuery(''); setMaking(false); boundByMake.current = false }
  }, [open])

  const groups = useMemo(() => pickerGroups(backgrounds, folders, folderId, folderName, query, t('world.bg.existingNoFolder')), [backgrounds, folders, folderId, folderName, query, t])
  const anyImage = useMemo(() => backgrounds.some((b) => b.type === 'image'), [backgrounds])

  const save = async (id: string): Promise<boolean> => {
    setBusy(true)
    try {
      onSaved(await editWorldRecord(chatId, 'update', { id: place.id, background: id }))
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const bind = async (picId: string) => {
    const pic = backgrounds.find((b) => b.id === picId)
    if (!pic) return
    if (await save(picId)) {
      // the place's name and aliases become the picture's tags (kept next to the ones it has)
      updateBackground(pic.id, { tags: mergeTags(placeTags(place.name, place.aliases), pic.tags ?? []) })
      toast.success(t('world.places.bgBound', { name: place.name }))
      onOpenChange(false)
    }
  }

  const clear = async () => {
    if (await save('')) {
      toast.success(t('world.places.bgCleared', { name: place.name }))
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-2xl" data-testid="place-bg-dialog">
        <DialogHeader>
          <DialogTitle>{t('world.places.bgTitle', { name: place.name })}</DialogTitle>
          <DialogDescription>{t('world.places.bgHint')}</DialogDescription>
        </DialogHeader>

        {making ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1" data-testid="place-bg-make">
            <Button variant="ghost" size="sm" className="self-start max-md:h-10" onClick={() => setMaking(false)}>{t('world.places.bgBack')}</Button>
            {folderId ? (
              <MakeSet
                wref={{ chatId }}
                folderId={folderId}
                only={{ name: place.name, text: place.text, aliases: place.aliases }}
                onStored={({ bgId }) => {
                  if (hadPicture || boundByMake.current) return
                  boundByMake.current = true
                  void save(bgId)
                }}
              />
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">{t('world.places.bgNoFolder')}</p>
                <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => { onOpenChange(false); onOpenBackgrounds() }}>{t('world.places.bgToBackgrounds')}</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('world.places.bgSearch')} aria-label={t('world.places.bgSearch')} className="h-10 pl-8 md:h-9" />
              </div>
              <Button variant="outline" className="max-md:h-10" onClick={() => setMaking(true)} data-testid="place-bg-make-go">
                <Sparkle className="size-4" aria-hidden="true" />
                {t('world.places.bgMake')}
              </Button>
              {place.background && (
                <Button variant="ghost" className="text-destructive hover:text-destructive max-md:h-10" disabled={busy} onClick={() => void clear()} data-testid="place-bg-remove">
                  {t('world.places.bgRemove')}
                </Button>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" data-testid="place-bg-list">
              {!anyImage && <p className="text-sm text-muted-foreground">{t('world.places.bgLibEmpty')}</p>}
              {anyImage && groups.length === 0 && <p className="text-sm text-muted-foreground">{t('world.places.bgNoMatch')}</p>}
              {groups.map((g) => (
                <section key={g.folderId ?? 'none'} className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{g.name} ({g.items.length})</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {g.items.map((b) => {
                      const on = b.id === place.background
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={on}
                          disabled={busy}
                          onClick={() => void bind(b.id)}
                          title={b.name}
                          className={cn('relative flex flex-col overflow-hidden rounded-md border text-left max-md:min-h-10', on ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground')}
                        >
                          <span className="aspect-video w-full bg-cover bg-center" style={{ backgroundImage: `url(${b.url})` }} aria-hidden="true" />
                          <span className="truncate px-2 py-1 text-xs">{b.name}</span>
                          {on && (
                            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                              <Check className="size-3" weight="bold" aria-hidden="true" />
                              {t('world.places.bgCurrent')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
