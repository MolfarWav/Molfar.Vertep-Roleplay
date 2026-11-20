import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'

export interface PlaceChoice { id: string; name: string; emoji: string }

/**
 * Which places stand on this map (Molfar.Vertep#473). A place is on a map only where it is put: tick it to show it here, untick to take
 * it off this map (it stays on the others). Rooms follow their place. Every tick is kept at once; there is no Save.
 */
export function MapPlacesDialog({ open, onOpenChange, mapName, places, on, onChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mapName: string
  places: PlaceChoice[]
  /** ids of the places on this map now */
  on: ReadonlySet<string>
  onChange: (ids: string[]) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase()
    return w ? places.filter((p) => p.name.toLowerCase().includes(w)) : places
  }, [places, q])
  const toggle = (id: string) => onChange(places.filter((p) => (p.id === id ? !on.has(id) : on.has(p.id))).map((p) => p.id))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="map-places-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.placesTitle', { name: mapName })}</DialogTitle>
          <DialogDescription>{t('placeMap.placesDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          {places.length > 8 && (
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('placeMap.placesSearch')} aria-label={t('placeMap.placesSearch')} className="min-w-0 flex-1" />
          )}
          <Button variant="outline" size="sm" className="max-md:min-h-10" onClick={() => onChange(places.map((p) => p.id))}>{t('placeMap.placesAll')}</Button>
          <Button variant="outline" size="sm" className="max-md:min-h-10" onClick={() => onChange([])}>{t('placeMap.placesNone')}</Button>
        </div>
        <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-md border border-border" aria-label={t('placeMap.placesList')}>
          {shown.map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-accent/50">
                <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={on.has(p.id)} onChange={() => toggle(p.id)} data-place={p.id} />
                <span aria-hidden="true" className="text-base">{p.emoji}</span>
                <span className="min-w-0 flex-1 break-words text-sm">{p.name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t('placeMap.placesNoMatch')}</li>}
        </ul>
        <p className="text-xs text-muted-foreground" data-testid="map-places-count">{t('placeMap.placesCount', { n: places.filter((p) => on.has(p.id)).length, total: places.length })} {t('placeMap.placesBack')}</p>
      </DialogContent>
    </Dialog>
  )
}
