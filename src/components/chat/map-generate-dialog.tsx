import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise, CircleNotch, Sparkle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { fetchImageModels } from '@/lib/engine'
import { generateImage } from '@/lib/image-gen'
import { MAP_GEN_KINDS, defaultGenKind, mapPrompt, type MapGenKind } from '@/lib/map-generate'
import { mapKindLabels } from '@/components/chat/map-gallery-dialog'
import { mapKindWords } from '@/lib/map-packs'
import type { MapScale } from '@/lib/place-map'
import { useApp } from '@/lib/store'
import { storeBackground } from '@/lib/webp'
import { cn } from '@/lib/utils'

/**
 * Draw a map with the image model (Molfar.Vertep#475): the kind of map (chips), a prompt filled from it and from the places on the
 * map (the player edits it), one call to the image model in Settings > Images, then the result is shown and the player keeps it as
 * this map's picture or draws again. Nothing is changed until "Use this map".
 */
export function MapGenerateDialog({ open, onOpenChange, scale, mapName, placeNames, onUse }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  scale: MapScale
  mapName: string
  /** names of the places on this map, so the picture leaves room for them */
  placeNames: string[]
  /** the drawn picture, stored as an asset id */
  onUse: (assetId: string) => void
}) {
  const t = useT()
  const kindName = mapKindLabels(t)
  const model = useApp((s) => s.settings.imageGen?.model ?? '')
  const [kind, setKind] = useState<MapGenKind>(() => defaultGenKind(scale))
  const [prompt, setPrompt] = useState(() => mapPrompt(defaultGenKind(scale), placeNames, mapName))
  const [edited, setEdited] = useState(false)
  const [modelLabel, setModelLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; model: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])
  // the picked image model's own name, as Settings > Images calls it
  useEffect(() => {
    if (!open || !model) { setModelLabel(''); return }
    let live = true
    void fetchImageModels().then((all) => {
      const hit = all.find((m) => `${m.provider}/${m.id}` === model)
      if (live) setModelLabel(hit ? hit.favorite?.name || hit.label : model)
    })
    return () => { live = false }
  }, [open, model])

  const pickKind = (k: MapGenKind) => {
    setKind(k)
    // a prompt the player has not touched follows the kind; an edited one stays
    if (!edited) setPrompt(mapPrompt(k, placeNames, mapName))
  }
  const draw = async () => {
    if (busy || !prompt.trim()) return
    setBusy(true)
    setError(null)
    abort.current = new AbortController()
    try {
      const img = await generateImage({ prompt: prompt.trim(), ...(model ? { model } : {}), aspect: 'wide', signal: abort.current.signal })
      setResult({ url: img.url, model: img.model })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  // the picture is kept as a WebP asset of the engine (a drawn PNG is several MB); the raw one if the conversion fails
  const use = async () => {
    if (!result || saving) return
    setSaving(true)
    try {
      let id = result.url.split('/').pop() ?? ''
      try {
        const blob = await (await fetch(result.url)).blob()
        const stored = await storeBackground(blob, 'places-map')
        id = stored.url.split('/').pop() ?? id
      } catch { /* the drawn file itself is good enough */ }
      if (!id) throw new Error('no id')
      onUse(id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const close = (v: boolean) => {
    if (!v) abort.current?.abort()
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl" data-testid="map-generate-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.genTitle')}</DialogTitle>
          <DialogDescription>{t('placeMap.genDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[68vh] flex-col gap-3 overflow-y-auto pr-0.5">
          {result ? (
            <div className="flex flex-col gap-2">
              <img src={result.url} alt={t('placeMap.genResult')} draggable={false} className="w-full rounded-md border border-border" data-testid="map-generate-result" />
              <p className="text-xs text-muted-foreground">{t('placeMap.genDone', { model: result.model || modelLabel || '' })}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{t('placeMap.genKind')}</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('placeMap.genKind')}>
                  {MAP_GEN_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={k === kind}
                      onClick={() => pickKind(k)}
                      data-gen-kind={k}
                      className={cn(
                        'inline-flex min-h-8 items-center rounded-full border px-3 text-xs max-md:min-h-10',
                        k === kind ? 'border-primary bg-primary/15 font-semibold' : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {kindName[k] ?? mapKindWords(k)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="map-gen-prompt" className="text-sm font-medium">{t('placeMap.genPrompt')}</label>
                <Textarea
                  id="map-gen-prompt"
                  rows={7}
                  value={prompt}
                  maxLength={3000}
                  className="text-xs"
                  onChange={(e) => { setPrompt(e.target.value); setEdited(true) }}
                  data-testid="map-generate-prompt"
                />
                <p className="text-xs text-muted-foreground">{t('placeMap.genPromptHint')}</p>
              </div>
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="map-generate-model">
                {model ? t('placeMap.genModel', { model: modelLabel || model }) : t('placeMap.genModelDefault')} {t('placeMap.genCost')}
              </p>
            </>
          )}
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert" data-testid="map-generate-error">{error}</p>}
        </div>
        <DialogFooter className="gap-2 max-md:flex-col-reverse">
          <Button variant="ghost" onClick={() => close(false)} className="max-md:min-h-10">{t('placeMap.genCancel')}</Button>
          {result ? (
            <>
              <Button variant="outline" onClick={() => { setResult(null); setError(null) }} className="max-md:min-h-10" data-testid="map-generate-again">
                <ArrowClockwise className="size-4" aria-hidden="true" />{t('placeMap.genAgain')}
              </Button>
              <Button onClick={() => void use()} disabled={saving} className="max-md:min-h-10" data-testid="map-generate-use">
                {t('placeMap.genUse')}
              </Button>
            </>
          ) : (
            <Button onClick={() => void draw()} disabled={busy || !prompt.trim()} className="max-md:min-h-10" data-testid="map-generate-go">
              {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <Sparkle className="size-4" weight="fill" aria-hidden="true" />}
              {busy ? t('placeMap.genBusy') : t('placeMap.genGo')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
