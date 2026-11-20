import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TONES } from '@/components/ui/tone'
import { useT } from '@/hooks/use-t'
import { MAIN_LEVEL, MAX_LEVELS, SCALES, levelIds, levelInfo, type MapScale, type PlaceMapData } from '@/lib/place-map'
import { cn } from '@/lib/utils'

/**
 * The maps of a chat (Molfar.Vertep#473): the first one and the levels added to it (a country, a city's plan, a dungeon). Each has a
 * name, a scale (how long a trip takes on it: minutes, hours, days) and, if you like, the place it is the plan of, so that place has
 * an "Open its map" button. Every change is kept at once.
 */
export function MapLevelsDialog({ open, onOpenChange, data, current, places, onRename, onScale, onPlan, onAdd, onDelete, onOpenLevel }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  data: PlaceMapData | null
  current: string
  /** the whole places, for "plan of" */
  places: { id: string; name: string }[]
  onRename: (id: string, name: string) => void
  onScale: (id: string, scale: MapScale) => void
  onPlan: (id: string, place: string | null) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onOpenLevel: (id: string) => void
}) {
  const t = useT()
  const ids = levelIds(data)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="map-levels-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.levelsTitle')}</DialogTitle>
          <DialogDescription>{t('placeMap.levelsDesc')}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[58vh] flex-col gap-2 overflow-y-auto" aria-label={t('placeMap.levelsList')}>
          {ids.map((id) => {
            const info = levelInfo(data, id, t('placeMap.mainName'))
            return (
              <li key={id} className={cn('flex flex-col gap-2 rounded-md border bg-card p-2.5', id === current ? 'border-primary' : 'border-border')} data-level={id}>
                <div className="flex items-center gap-2">
                  <NameField value={info.name} label={t('placeMap.levelName')} onSave={(v) => onRename(id, v)} />
                  {id === current ? (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium">{t('placeMap.levelShown')}</span>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0 max-md:min-h-10" onClick={() => { onOpenLevel(id); onOpenChange(false) }} data-testid="map-level-open">{t('placeMap.levelOpen')}</Button>
                  )}
                  {id !== MAIN_LEVEL && (
                    <Button variant="ghost" size="icon" className="size-8 shrink-0 max-md:size-10" onClick={() => onDelete(id)} aria-label={t('placeMap.levelDelete', { name: info.name })} title={t('placeMap.levelDelete', { name: info.name })} data-testid="map-level-delete">
                      <Trash className={cn('size-4', TONES.orange.ink)} aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('placeMap.levelScale')}>
                  {SCALES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={info.scale === s}
                      onClick={() => onScale(id, s)}
                      data-scale={s}
                      className={cn(
                        'inline-flex min-h-8 items-center rounded-full border px-3 text-xs max-md:min-h-10',
                        info.scale === s ? 'border-primary bg-primary/15 font-semibold' : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {t(`placeMap.scale.${s}`)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t(`placeMap.scaleHint.${info.scale}`)}</p>
                {id !== MAIN_LEVEL && (
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0">{t('placeMap.levelPlan')}</span>
                    <select
                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground max-md:h-10"
                      value={info.plan ?? ''}
                      onChange={(e) => onPlan(id, e.target.value || null)}
                      data-testid="map-level-plan"
                    >
                      <option value="">{t('placeMap.levelPlanNone')}</option>
                      {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-1.5">
          <Button variant="secondary" className="justify-center max-md:min-h-10" onClick={onAdd} disabled={ids.length > MAX_LEVELS} data-testid="map-level-add">
            <Plus className="size-4" aria-hidden="true" />{t('placeMap.levelAdd')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('placeMap.levelAddHint')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A name field that keeps its value when it loses focus or Enter is pressed (a keystroke is not a save). */
function NameField({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  const commit = () => { const v = text.replace(/\s+/g, ' ').trim(); if (v && v !== value) onSave(v); else setText(value) }
  return (
    <Input
      value={text}
      maxLength={40}
      aria-label={label}
      className="min-w-0 flex-1"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      data-testid="map-level-name"
    />
  )
}
