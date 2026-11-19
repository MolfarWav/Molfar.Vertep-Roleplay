import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { PLACE_KINDS, placeKind } from '@/lib/place-kinds'
import { kindWords, pickedIconPath, placeIconPath, placeIconVariants, type PlaceIconIndex } from '@/lib/place-icons'
import { cn } from '@/lib/utils'
import type { MapNode } from '@/lib/place-map'

const emojiOf = (id: string) => PLACE_KINDS.find((k) => k.id === id)?.emoji ?? (id === 'place' ? '📍' : '🖼️')

/**
 * Pick a place's icon by hand from the engine's icon set (Molfar.Vertep#454): "Automatic" is the one its name says; otherwise a
 * kind, then one of its pictures. Only the pictures of the chosen kind are loaded, so the list stays light.
 */
export function PlaceIconDialog({ node, index, open, onOpenChange, onPick }: {
  node: MapNode
  index: PlaceIconIndex
  open: boolean
  onOpenChange: (v: boolean) => void
  /** `<kind>-<n>`, or null for the automatic icon */
  onPick: (key: string | null) => void
}) {
  const t = useT()
  const auto = placeKind(...node.names)
  const current = pickedIconPath(node.icon, index) ? node.icon : null
  const currentKind = current ? current.replace(/-[1-9][0-9]?$/, '') : null
  const [kind, setKind] = useState<string>(currentKind ?? (index[auto.id] ? auto.id : (Object.keys(index)[0] ?? 'place')))
  const [q, setQ] = useState('')
  const kinds = useMemo(() => {
    const order = new Map(PLACE_KINDS.map((k, i) => [k.id as string, i]))
    return Object.keys(index).sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b))
  }, [index])
  const shown = kinds.filter((k) => !q.trim() || kindWords(k).includes(q.trim().toLowerCase()))
  const variants = placeIconVariants(kind, index)
  const autoPath = placeIconPath(auto.id, node.id, index)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="place-icon-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.iconTitle', { name: node.name })}</DialogTitle>
          <DialogDescription>{t('placeMap.iconDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button
            variant={current ? 'outline' : 'secondary'}
            className="h-auto justify-start gap-3 py-2 max-md:min-h-12"
            aria-pressed={!current}
            onClick={() => { onPick(null); onOpenChange(false) }}
            data-testid="place-icon-auto"
          >
            {autoPath ? <img src={autoPath} alt="" draggable={false} className="size-10 object-contain" /> : <span className="flex size-10 items-center justify-center text-2xl" aria-hidden="true">{auto.emoji}</span>}
            <span className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">{t('placeMap.iconAuto')}</span>
              <span className="text-xs text-muted-foreground">{t('placeMap.iconAutoHint', { kind: kindWords(auto.id) })}</span>
            </span>
          </Button>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('placeMap.iconSearch')} aria-label={t('placeMap.iconSearch')} data-testid="place-icon-search" />
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label={t('placeMap.iconKinds')}>
            {shown.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
                data-kind={k}
                className={cn(
                  'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs max-md:min-h-10',
                  k === kind ? 'border-primary bg-primary/15 font-semibold' : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span aria-hidden="true">{emojiOf(k)}</span>
                {kindWords(k)}
              </button>
            ))}
            {!shown.length && <p className="text-xs text-muted-foreground">{t('placeMap.iconNone')}</p>}
          </div>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('placeMap.iconPictures', { kind: kindWords(kind) })}>
            {variants.map((src, i) => {
              const key = `${kind}-${i + 1}`
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={current === key}
                  aria-label={`${kindWords(kind)} ${i + 1}`}
                  onClick={() => { onPick(key); onOpenChange(false) }}
                  data-icon={key}
                  className={cn('flex aspect-square items-center justify-center rounded-md border bg-muted/40 p-1 hover:bg-accent', current === key ? 'border-primary ring-2 ring-primary' : 'border-border')}
                >
                  <img src={src} alt="" draggable={false} className="size-full object-contain" />
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
