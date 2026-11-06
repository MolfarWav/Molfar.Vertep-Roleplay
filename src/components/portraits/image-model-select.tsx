// "Draw with": which image model a drawing uses. The engine lists one set of image models (Settings > Images: a local
// ComfyUI or Forge next to API models), so this is where the player picks the "device". The first choice is the app's
// own image model (Extensions > Image generation); a pick is only for this kind of drawing and never changes that model.

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { fetchImageModels, type ImageModelInfo } from '@/lib/engine'
import type { ImageGenSettings } from '@/lib/image-gen'

/** The select cannot hold an empty value: this stands for "the app's image model". */
const APP = '__app'

/** The engine's image models, loaded once per mounting; [] while loading or when there are none. */
export function useImageModels(): ImageModelInfo[] | null {
  const [models, setModels] = useState<ImageModelInfo[] | null>(null)
  useEffect(() => {
    let alive = true
    void fetchImageModels().then((m) => { if (alive) setModels(m) })
    return () => { alive = false }
  }, [])
  return models
}

export function nameOfImageModel(models: readonly ImageModelInfo[] | null, ref: string): string {
  const m = models?.find((x) => `${x.provider}/${x.id}` === ref)
  return m ? m.favorite?.name || m.label : ref.split('/').slice(1).join('/') || ref
}

export function ImageModelSelect({ value, onChange, ig, models, disabled, testid }: {
  /** the picked model ref; '' = the app's image model */
  value: string
  onChange: (ref: string) => void
  ig: ImageGenSettings | undefined
  models: readonly ImageModelInfo[] | null
  disabled?: boolean
  testid?: string
}) {
  const t = useT()
  const appRef = ig?.model ?? ''
  const appLabel = appRef ? t('portraits.model.app', { name: nameOfImageModel(models, appRef) }) : t('portraits.model.appNone')
  const label = (v: string) => (v === APP || !v ? appLabel : nameOfImageModel(models, v))
  return (
    <Select value={value || APP} onValueChange={(v) => { if (v) onChange(v === APP ? '' : String(v)) }} disabled={disabled}>
      <SelectTrigger className="w-full data-[size=default]:h-10 md:data-[size=default]:h-9" aria-label={t('portraits.model')} data-testid={testid ?? 'portrait-model'}>
        <SelectValue>{models === null ? t('portraits.model.loading') : label(value || APP)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={APP}><span className="text-xs">{appLabel}</span></SelectItem>
          {(models ?? []).map((m) => (
            <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              <span className="text-xs">{m.favorite?.name || m.label}</span>
              <span className="ml-1.5 text-caption text-muted-foreground">{m.connectionName ?? m.provider}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
