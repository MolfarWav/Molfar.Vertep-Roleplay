
import { useApp } from '@/lib/store'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Image, CircleNotch, MagicWand } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { buildImagePrompt, generateImage, resolvePromptStyle, type GeneratedImage } from '@/lib/image-gen'
import { fetchImageModels, type ImageModelInfo } from '@/lib/engine'

const STYLE_LABELS: Record<string, string> = {
  auto: 'Auto (from the model)',
  description: 'Description',
  tags: 'Danbooru tags',
}

/** Fixed subject so the test isolates the effect of the settings themselves. */
const TEST_SUBJECT = 'a lantern-lit street after rain, figure in a long coat'

export function ImageGenTab() {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const ig = settings.imageGen ?? { enabled: false, model: '', promptPrefix: '', negativePrompt: '', interactive: true, saveToGallery: true }
  const patch = (p: Partial<typeof ig>) => updateSettings({ imageGen: { ...ig, ...p } })

  const [imageModels, setImageModels] = useState<ImageModelInfo[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [preview, setPreview] = useState<GeneratedImage | null>(null)

  useEffect(() => {
    void fetchImageModels().then(setImageModels)
  }, [])
  const modelKnown = !!imageModels?.some((m) => `${m.provider}/${m.id}` === ig.model)
  // The model the Select shows: the picked one if listed, else the first.
  const shown = imageModels?.find((m) => `${m.provider}/${m.id}` === ig.model) ?? imageModels?.[0]
  const shownApi = shown?.api
  // Keep the picked model's backend in the settings: the plugins read it to choose the default prompt style.
  useEffect(() => {
    // only once image generation was set up: opening the tab alone writes nothing
    if (settings.imageGen && shownApi && shownApi !== ig.modelApi) updateSettings({ imageGen: { ...ig, modelApi: shownApi } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownApi, ig.modelApi])
  const style = resolvePromptStyle({ promptStyle: ig.promptStyle, modelApi: shownApi ?? ig.modelApi })

  const runTest = async () => {
    setTesting(true)
    try {
      setPreview(await generateImage({
        prompt: buildImagePrompt(ig, TEST_SUBJECT),
        negativePrompt: ig.negativePrompt,
        model: modelKnown ? ig.model : undefined,
      }))
    } catch (err) {
      toast.error('Test render failed', { description: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Image className="size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Image generation</p>
            <p className="text-xs text-muted-foreground">
              The chat model describes the scene, then an image model draws it. Adds <code className="font-mono">/imagine</code>.
            </p>
          </div>
        </div>
        <Switch checked={ig.enabled} onCheckedChange={(v) => patch({ enabled: v })} aria-label="Enable image generation" />
      </div>

      <div className={ig.enabled ? 'flex flex-col gap-4' : 'pointer-events-none flex flex-col gap-4 opacity-50'}>
        {imageModels === null ? (
          <p className="text-xs text-muted-foreground">Loading image models…</p>
        ) : imageModels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
            No image models yet. Add an OpenRouter or NanoGPT connection, or an image server such as
            ComfyUI or Forge, in the engine&apos;s Settings (API connections, Images).
          </p>
        ) : (
          <Field>
            <FieldLabel>Model</FieldLabel>
            <Select
              value={modelKnown ? ig.model : `${imageModels[0]!.provider}/${imageModels[0]!.id}`}
              onValueChange={(v) => v && patch({ model: v })}
            >
              <SelectTrigger>
                <SelectValue>{(v) => String(v).split('/').slice(1).join('/') || String(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {imageModels.map((m) => (
                    <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                      <span className="text-xs">{m.label}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{m.connectionName ?? m.provider}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {ig.model && !modelKnown && (
              <p className="text-xs text-destructive">{ig.model} is not available. Pick a model to replace it.</p>
            )}
          </Field>
        )}

        <Field>
          <FieldLabel>Prompt style</FieldLabel>
          <Select
            value={ig.promptStyle ?? 'auto'}
            onValueChange={(v) => v && patch({ promptStyle: v as 'auto' | 'description' | 'tags' })}
          >
            <SelectTrigger>
              <SelectValue>{(v) => STYLE_LABELS[String(v)] ?? String(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(STYLE_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}><span className="text-xs">{label}</span></SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {(ig.promptStyle ?? 'auto') === 'auto'
              ? style === 'tags'
                ? `Now: Danbooru tags, because the model runs on ${shownApi === 'a1111' ? 'Forge' : 'ComfyUI'}.`
                : 'Now: description.'
              : null}
            {style === 'tags' ? ' Put quality tags (masterpiece, best quality…) in the prefix below.' : null}
          </p>
        </Field>

        <Field>
          <FieldLabel htmlFor="ig-prefix">Common prompt prefix</FieldLabel>
          <Textarea id="ig-prefix" value={ig.promptPrefix} onChange={(e) => patch({ promptPrefix: e.target.value })} className="min-h-16 font-mono text-xs" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ig-negative">Negative prompt</FieldLabel>
          <Textarea id="ig-negative" value={ig.negativePrompt} onChange={(e) => patch({ negativePrompt: e.target.value })} className="min-h-16 font-mono text-xs" />
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="ig-interactive">Interactive mode</FieldLabel>
          <Switch id="ig-interactive" checked={ig.interactive} onCheckedChange={(v) => patch({ interactive: v })} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Preview and edit before posting. Off: <code className="font-mono">/imagine</code> posts in one step.
        </p>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="ig-gallery">Save pictures to the character&apos;s gallery</FieldLabel>
          <Switch id="ig-gallery" checked={ig.saveToGallery !== false} onCheckedChange={(v) => patch({ saveToGallery: v })} />
        </Field>

        {/* Renders with the settings above through the ENGINE's image bridge,
            so the effect of a prefix change is visible without leaving the tab. */}
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Test render</p>
              <p className="text-xs text-muted-foreground">Runs through the engine. Nothing is sent to the chat.</p>
            </div>
            <Button variant="outline" size="sm" onClick={runTest} disabled={testing}>
              {testing ? <CircleNotch className="size-3.5 animate-spin" /> : <MagicWand className="size-3.5" />}
              Test
            </Button>
          </div>
          {preview && (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.prompt} className="size-28 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-mono text-[11px] text-muted-foreground">{preview.prompt}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{preview.model}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
