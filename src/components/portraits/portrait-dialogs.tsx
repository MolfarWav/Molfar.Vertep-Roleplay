// Portraits for cards (the card editor and the Characters page). Two dialogs, one idea: pick the image model, let the
// text model describe the card, draw. The single card shows the description to edit and the picture before it is used;
// the bulk one only counts, asks which model and starts the run (the progress card follows it and Cancel stops it).

import { useEffect, useRef, useState } from 'react'
import { CircleNotch, MagicWand } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageModelSelect, useImageModels } from '@/components/portraits/image-model-select'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { imageTargetOf, type GeneratedImage } from '@/lib/image-gen'
import { drawCardPortraits, drawPrompt, portraitPrompt, readPortraitModel, writePortraitModel, type CardText } from '@/lib/portrait-draw'

/** Image generation is off: say so and take the player to where it is set up. Nothing is sent before they press a button. */
function NotSetUp({ onClose }: { onClose: () => void }) {
  const t = useT()
  const setView = useApp((s) => s.setView)
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="portrait-noconn">
      <p>{t('portraits.noConn')}</p>
      <Button className="h-11 w-fit md:h-8" onClick={() => { onClose(); setView('extensions') }}>{t('portraits.openSettings')}</Button>
    </div>
  )
}

/** The model the player picked for portraits, remembered on this device. */
function usePortraitModel(): [string, (ref: string) => void] {
  const [ref, setRef] = useState(readPortraitModel)
  return [ref, (v) => { setRef(v); writePortraitModel(v) }]
}

/** One card: the description (editable), the picture, "Use as portrait". The picture is kept in the card's Gallery at once. */
export function CardPortraitDialog({ open, onOpenChange, characterId, name, card, onGenerated, onUse }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  characterId: string
  name: string
  /** what the editor shows now, so the description reads it and not the last save */
  card: CardText
  /** the picture is kept in the card's Gallery */
  onGenerated: (url: string) => void
  onUse: (url: string) => void
}) {
  const t = useT()
  const ig = useApp((s) => s.settings.imageGen)
  const models = useImageModels()
  const [pick, setPick] = usePortraitModel()
  const [prompt, setPrompt] = useState('')
  const [edited, setEdited] = useState(false)
  const [describing, setDescribing] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [result, setResult] = useState<GeneratedImage | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cardRef = useRef(card)
  cardRef.current = card
  const ready = !!ig?.enabled
  const target = imageTargetOf(ig, models ?? [], pick)

  const describe = async () => {
    setDescribing(true)
    try {
      setPrompt(await portraitPrompt(characterId, target, cardRef.current))
      setEdited(false)
    } catch (e) {
      toast.error(t('portraits.describeFailed'), { description: (e as Error).message })
    } finally {
      setDescribing(false)
    }
  }

  // each opening starts from the card as it is now; the description is written once the model list is known (its style depends on the model)
  useEffect(() => {
    if (!open) return
    setResult(null)
    setDrawing(false)
    setPrompt('')
    setEdited(false)
  }, [open])
  const style = target.style
  // described again when the open dialog's model changes the prompt style, never over the player's edit
  useEffect(() => {
    if (open && ready && models !== null && !edited) void describe()
  }, [open, ready, models, style])
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
      const img = await drawPrompt(ig, target, prompt, ac.signal)
      setResult(img)
      onGenerated(img.url)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(t('portraits.failed'), { description: (err as Error).message })
    } finally {
      if (!ac.signal.aborted) setDrawing(false)
    }
  }

  const busy = describing || drawing
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3" data-testid="card-portrait-dialog">
        <DialogHeader>
          <DialogTitle>{t('portraits.one.title', { name })}</DialogTitle>
          <DialogDescription>{ready ? t('portraits.one.lead') : t('portraits.noConnTitle')}</DialogDescription>
        </DialogHeader>
        {!ready ? (
          <NotSetUp onClose={() => onOpenChange(false)} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('portraits.model')}</Label>
              <ImageModelSelect value={pick} onChange={setPick} ig={ig} models={models} disabled={busy} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-portrait-prompt" className="text-xs">{t('portraits.prompt')}</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs max-md:h-10" disabled={busy || models === null} onClick={() => void describe()} data-testid="card-portrait-rewrite">
                  {describing ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <MagicWand className="size-3.5" aria-hidden="true" />}
                  {t('portraits.rewrite')}
                </Button>
              </div>
              <Textarea
                id="card-portrait-prompt"
                rows={5}
                value={describing && !prompt ? '' : prompt}
                placeholder={describing ? t('portraits.describing') : ''}
                onChange={(e) => { setPrompt(e.target.value); setEdited(true) }}
                className="text-sm"
                disabled={drawing}
              />
              <p className="text-xs text-muted-foreground">{t(target.style === 'tags' ? 'portraits.promptHintTags' : 'portraits.promptHint')}</p>
            </div>
            <div className="flex h-56 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40" role="status">
              {result
                ? <img src={result.url} alt={result.prompt} className="max-h-full max-w-full object-contain" />
                : <p className="px-6 text-center text-xs text-muted-foreground">{drawing ? t('portraits.drawing') : t('portraits.preview')}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" className="max-md:h-11" onClick={() => onOpenChange(false)}>{t('portraits.cancel')}</Button>
          {ready && (
            <>
              <Button variant="outline" className="max-md:h-11" onClick={() => void draw()} disabled={busy || !prompt.trim()} data-testid="card-portrait-draw">
                {drawing ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <MagicWand className="size-3.5" aria-hidden="true" />}
                {result ? t('portraits.redraw') : t('portraits.draw1')}
              </Button>
              <Button className="max-md:h-11" disabled={!result} onClick={() => { if (result) { onUse(result.url); onOpenChange(false) } }} data-testid="card-portrait-use">{t('portraits.use')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Every card with no portrait: how many, which model, Start. The run goes on in the progress card. */
export function MissingPortraitsDialog({ open, onOpenChange, targets, onApply }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  targets: readonly { id: string; name: string }[]
  onApply: (id: string, url: string) => void
}) {
  const t = useT()
  const ig = useApp((s) => s.settings.imageGen)
  const models = useImageModels()
  const [pick, setPick] = usePortraitModel()
  const ready = !!ig?.enabled
  const shown = targets.slice(0, 6).map((x) => x.name || x.id)
  const rest = targets.length - shown.length

  const start = () => {
    if (!ig) return
    const target = imageTargetOf(ig, models ?? [], pick)
    const list = targets.slice()
    onOpenChange(false)
    void drawCardPortraits(t('portraits.title'), list, ig, target, onApply).then(({ done, failed }) => {
      if (failed > 0) toast.warning(t('portraits.fail', { done, failed }))
      else if (done > 0) toast.success(t('portraits.done', { n: done }))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3" data-testid="missing-portraits-dialog">
        <DialogHeader>
          <DialogTitle>{t('portraits.bulk.title')}</DialogTitle>
          <DialogDescription>{targets.length > 0 ? t('portraits.bulk.lead', { n: targets.length }) : t('portraits.bulk.none')}</DialogDescription>
        </DialogHeader>
        {!ready ? (
          <NotSetUp onClose={() => onOpenChange(false)} />
        ) : targets.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('portraits.model')}</Label>
              <ImageModelSelect value={pick} onChange={setPick} ig={ig} models={models} testid="missing-portraits-model" />
            </div>
            <p className="text-xs text-muted-foreground" data-testid="missing-portraits-names">
              {shown.join(', ')}{rest > 0 ? ` ${t('portraits.bulk.more', { n: rest })}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">{t('portraits.bulk.cost')}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" className="max-md:h-11" onClick={() => onOpenChange(false)}>{t('portraits.cancel')}</Button>
          {ready && targets.length > 0 && (
            <Button className="max-md:h-11" onClick={start} disabled={models === null} data-testid="missing-portraits-start">
              <MagicWand className="size-3.5" aria-hidden="true" />
              {t('portraits.bulk.start', { n: targets.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
