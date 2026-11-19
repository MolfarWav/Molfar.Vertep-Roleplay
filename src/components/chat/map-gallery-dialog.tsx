import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { mapKindWords, mapPackUrl, type MapPack } from '@/lib/map-packs'
import { cn } from '@/lib/utils'

/**
 * Pick a ready map for the places map (Molfar.Vertep#454): the engine's packs of painted plans, by kind (a region, a walled town, a
 * village, a coast, a house plan, caves...). Thumbnails only; the full picture loads when the map is chosen.
 */
export function MapGalleryDialog({ packs, current, open, onOpenChange, onPick }: {
  packs: MapPack[]
  /** `<pack>/<map id>` of the ready map in use, or null */
  current: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (key: string) => void
}) {
  const t = useT()
  const kinds = useMemo(() => [...new Set(packs.flatMap((p) => p.maps.map((m) => m.kind)))], [packs])
  const [kind, setKind] = useState<string>(() => (current ? (packs.flatMap((p) => p.maps.map((m) => ({ key: `${p.id}/${m.id}`, kind: m.kind }))).find((m) => m.key === current)?.kind ?? kinds[0]) : kinds[0]) ?? '')
  const maps = packs.flatMap((p) => p.maps.filter((m) => m.kind === kind).map((m) => ({ key: `${p.id}/${m.id}`, pack: p.name, id: m.id })))
  const names: Record<string, string> = {
    region: t('placeMap.mapKind.region'),
    wilds: t('placeMap.mapKind.wilds'),
    coast: t('placeMap.mapKind.coast'),
    city: t('placeMap.mapKind.city'),
    village: t('placeMap.mapKind.village'),
    'port-town': t('placeMap.mapKind.port-town'),
    interior: t('placeMap.mapKind.interior'),
    underground: t('placeMap.mapKind.underground'),
    'modern-downtown': t('placeMap.mapKind.modern-downtown'),
    'modern-residential': t('placeMap.mapKind.modern-residential'),
    'modern-industrial': t('placeMap.mapKind.modern-industrial'),
    'modern-campus': t('placeMap.mapKind.modern-campus'),
    'modern-waterfront': t('placeMap.mapKind.modern-waterfront'),
    'modern-old-town': t('placeMap.mapKind.modern-old-town'),
    'modern-airport': t('placeMap.mapKind.modern-airport'),
    'modern-metropolis': t('placeMap.mapKind.modern-metropolis'),
    'modern-park': t('placeMap.mapKind.modern-park'),
    'modern-small-town': t('placeMap.mapKind.modern-small-town'),
  }
  const label = (k: string) => names[k] ?? mapKindWords(k)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="place-map-gallery-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.galleryTitle')}</DialogTitle>
          <DialogDescription>{t('placeMap.galleryDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('placeMap.galleryKinds')}>
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
                data-map-kind={k}
                className={cn(
                  'inline-flex min-h-8 items-center rounded-full border px-3 text-xs max-md:min-h-10',
                  k === kind ? 'border-primary bg-primary/15 font-semibold' : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {label(k)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto" role="group" aria-label={label(kind)}>
            {maps.map((m, i) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={current === m.key}
                aria-label={`${label(kind)} ${i + 1}`}
                onClick={() => { onPick(m.key); onOpenChange(false) }}
                data-map={m.key}
                className={cn('overflow-hidden rounded-md border bg-muted/40 hover:ring-2 hover:ring-primary/60', current === m.key ? 'border-primary ring-2 ring-primary' : 'border-border')}
              >
                <img src={mapPackUrl(m.key, true)} alt="" draggable={false} className="aspect-video w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
