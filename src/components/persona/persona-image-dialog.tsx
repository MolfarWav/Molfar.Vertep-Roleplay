import { useEffect, useRef, useState } from 'react'
import { CircleNotch, MagicWand } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { buildImagePrompt, generateImage, type GeneratedImage } from '@/lib/image-gen'
import { portraitPrompt } from '@/lib/persona-page'
import type { Persona } from '@/lib/types'

/** "Generate image" for a persona: the portrait prompt is built from the profile, shown and editable, and
 *  the picture is drawn through the app's image connection (Extensions > Image generation). A result goes
 *  into the Gallery at once; "Use as portrait" makes it the avatar. */
export function PersonaImageDialog({ open, onOpenChange, persona, onGenerated, onUseAsPortrait }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  persona: Persona
  /** the picture is kept in the persona's Gallery */
  onGenerated: (url: string) => void
  onUseAsPortrait: (url: string) => void
}) {
  const t = useT()
  const ig = useApp((s) => s.settings.imageGen)
  const setView = useApp((s) => s.setView)
  const [prompt, setPrompt] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [result, setResult] = useState<GeneratedImage | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const personaRef = useRef(persona)
  personaRef.current = persona
  const ready = !!ig?.enabled

  // each opening starts from the persona as it is now
  useEffect(() => {
    if (!open) return
    setResult(null)
    setDrawing(false)
    setPrompt(portraitPrompt(personaRef.current))
  }, [open])
  // never leave a drawing running behind a closed dialog
  useEffect(() => () => abortRef.current?.abort(), [])

  const draw = async () => {
    if (!ig || !prompt.trim()) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setDrawing(true)
    setResult(null)
    try {
      const img = await generateImage({
        prompt: buildImagePrompt(ig, prompt),
        negativePrompt: ig.negativePrompt,
        model: ig.model || undefined,
        signal: ac.signal,
      })
      setResult(img)
      onGenerated(img.url)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(t('personas.image.failed'), { description: (err as Error).message })
    } finally {
      if (!ac.signal.aborted) setDrawing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3" data-testid="persona-image-dialog">
        <DialogHeader>
          <DialogTitle>{t('personas.image.title')}</DialogTitle>
          <DialogDescription>{ready ? (ig?.model ? ig.model.split('/').slice(1).join('/') : t('personas.image.defaultModel')) : t('personas.image.noConnection')}</DialogDescription>
        </DialogHeader>
        {!ready ? (
          <div className="flex flex-col gap-3 text-sm" data-testid="persona-image-noconn">
            <p>{t('personas.image.noConnectionHint')}</p>
            <Button className="h-11 w-fit md:h-8" onClick={() => { onOpenChange(false); setView('extensions') }}>{t('personas.image.openSettings')}</Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="persona-image-prompt" className="text-xs">{t('personas.image.prompt')}</Label>
              <Textarea id="persona-image-prompt" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="text-sm" disabled={drawing} />
              <p className="text-xs text-muted-foreground">{t('personas.image.promptHint')}</p>
            </div>
            <div className="flex h-56 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40" role="status">
              {result
                ? <img src={result.url} alt={result.prompt} className="max-h-full max-w-full object-contain" />
                : <p className="px-6 text-center text-xs text-muted-foreground">{drawing ? t('personas.image.drawing') : t('personas.image.preview')}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" className="max-md:h-11" onClick={() => onOpenChange(false)}>{t('personas.cancel')}</Button>
          {ready && (
            <>
              <Button variant="outline" className="max-md:h-11" onClick={() => void draw()} disabled={drawing || !prompt.trim()}>
                {drawing ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <MagicWand className="size-3.5" aria-hidden="true" />}
                {result ? t('personas.image.redraw') : t('personas.image.generate')}
              </Button>
              <Button className="max-md:h-11" disabled={!result} onClick={() => { if (result) { onUseAsPortrait(result.url); onOpenChange(false) } }}>{t('personas.image.useAsPortrait')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
