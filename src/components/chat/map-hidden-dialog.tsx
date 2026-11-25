import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import type { PlaceRow } from '@/lib/place-map'

/**
 * Which places show on the maps (Molfar.Vertep#504 follow-up, the map's "Hide places"). Untick a place or a room to hide it from every map;
 * the World book and the story keep it, and ticking it again puts it back where it stood. A room of a hidden place is hidden with it.
 * Every tick is kept at once; there is no Save.
 */
export function MapHiddenDialog({ open, onOpenChange, rows, onChange, onShowAll }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  rows: PlaceRow[]
  /** hide (true) or show (false) one place */
  onChange: (id: string, hide: boolean) => void
  onShowAll: () => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase()
    return w ? rows.filter((r) => r.name.toLowerCase().includes(w)) : rows
  }, [rows, q])
  const hiddenCount = rows.filter((r) => r.hidden).length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="map-hidden-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.hiddenTitle')}</DialogTitle>
          <DialogDescription>{t('placeMap.hiddenDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          {rows.length > 8 && (
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('placeMap.placesSearch')} aria-label={t('placeMap.placesSearch')} className="min-w-0 flex-1" />
          )}
          <Button variant="outline" size="sm" className="max-md:min-h-10" disabled={hiddenCount === 0} onClick={onShowAll} data-testid="map-hidden-all">{t('placeMap.hiddenShowAll')}</Button>
        </div>
        <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-md border border-border" aria-label={t('placeMap.placesList')}>
          {shown.map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <label className={`flex min-h-10 items-center gap-3 px-3 py-1.5 ${p.viaParent ? 'opacity-60' : 'cursor-pointer hover:bg-accent/50'} ${p.spot ? 'pl-8' : ''}`}>
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={!p.hidden}
                  disabled={p.viaParent}
                  onChange={() => onChange(p.id, !p.hidden)}
                  data-place={p.id}
                />
                <span aria-hidden="true" className="text-base">{p.emoji}</span>
                <span className="min-w-0 flex-1 break-words text-sm">
                  {p.name}
                  {p.spot && p.parentName && <span className="text-xs text-muted-foreground"> · {t('placeMap.hiddenIn', { name: p.parentName })}</span>}
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t('placeMap.placesNoMatch')}</li>}
        </ul>
        <p className="text-xs text-muted-foreground" data-testid="map-hidden-count">{t('placeMap.hiddenCount', { n: hiddenCount, total: rows.length })}</p>
      </DialogContent>
    </Dialog>
  )
}
