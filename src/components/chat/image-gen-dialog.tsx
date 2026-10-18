import { useEffect, useRef, useState } from 'react'
import { BookOpenText, CircleNotch, MagicWand } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  IMAGE_MODES, buildImagePrompt, describeForImage, generateImage, resolvePromptStyle,
  type GeneratedImage, type ImageGenSettings, type ImageMode,
} from '@/lib/image-gen'
import type { ID } from '@/lib/types'

/** How the dialog opens: a mode asks the chat model to describe the scene,
 *  text is a description the user already wrote. */
export type ImageGenStart = { mode: ImageMode } | { text: string }

/**
 * Composes and previews a picture before it is posted to the chat. The chat's
 * model reads the scene and fills in the description; the user can edit it,
 * re-read the chat for another angle, and draw as often as they like.
 */
export function ImageGenDialog({
  open, onOpenChange, settings, chatId, chatModel, start, onAccept,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  settings: ImageGenSettings
  chatId: ID
  chatModel: string | null
  start: ImageGenStart
  onAccept: (image: GeneratedImage) => Promise<void>
}) {
  const [mode, setMode] = useState<ImageMode>('scene')
  const [subject, setSubject] = useState('')
  const [reading, setReading] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<GeneratedImage | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readSeq = useRef(0)

  const read = async (m: ImageMode) => {
    const seq = ++readSeq.current
    setReading(true)
    try {
      const text = await describeForImage(chatId, m, chatModel, resolvePromptStyle(settings))
      if (seq === readSeq.current) setSubject(text)
    } catch (err) {
      if (seq === readSeq.current) toast.error('Could not describe the scene', { description: (err as Error).message })
    } finally {
      if (seq === readSeq.current) setReading(false)
    }
  }

  // each opening starts fresh from how it was asked for
  useEffect(() => {
    if (!open) return
    setResult(null)
    if ('text' in start) {
      readSeq.current++
      setReading(false)
      setSubject(start.text)
    } else {
      setMode(start.mode)
      setSubject('')
      void read(start.mode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start])

  // never leave a generation running behind a closed dialog
  useEffect(() => () => abortRef.current?.abort(), [])

  const fullPrompt = buildImagePrompt(settings, subject)

  const draw = async () => {
    if (!subject.trim()) {
      toast.error('Describe what to draw first')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setDrawing(true)
    try {
      setResult(await generateImage({
        prompt: fullPrompt,
        negativePrompt: settings.negativePrompt,
        model: settings.model || undefined,
        signal: ac.signal,
      }))
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        toast.error('Image generation failed', { description: (err as Error).message })
      }
    } finally {
      if (!ac.signal.aborted) setDrawing(false)
    }
  }

  const post = async () => {
    if (!result) return
    setPosting(true)
    try {
      await onAccept(result)
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not post the picture', { description: (err as Error).message })
    } finally {
      setPosting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* capped + internally scrolling so the preview never pushes the
          footer off a short viewport */}
      <DialogContent className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Generate image</DialogTitle>
          <DialogDescription>{settings.model ? settings.model.split('/').slice(1).join('/') : 'Engine default image model'}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label className="text-xs">Draw</Label>
              <Select value={mode} onValueChange={(v) => { if (!v) return; setMode(v as ImageMode); void read(v as ImageMode) }}>
                <SelectTrigger className="h-8" aria-label="What to draw"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_MODES.map((m) => <SelectItem key={m.mode} value={m.mode}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => void read(mode)} disabled={reading}>
              {reading ? <CircleNotch className="size-3.5 animate-spin" /> : <BookOpenText className="size-3.5" />}
              Read chat again
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ig-subject" className="text-xs">Description</Label>
            <Textarea
              id="ig-subject"
              rows={5}
              value={subject}
              onChange={(e) => { readSeq.current++; setReading(false); setSubject(e.target.value) }}
              className="text-sm"
              placeholder={reading ? 'Reading the chat…' : 'A rain-slick alley lit by neon signage…'}
              disabled={reading}
            />
          </div>

          <div className="flex h-56 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 sm:h-64">
            {result ? (
              <img src={result.url} alt={result.prompt} className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="px-6 text-center text-xs text-muted-foreground">
                {drawing ? 'Drawing…' : 'Preview appears here'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={() => void draw()} disabled={drawing || reading || !subject.trim()}>
            {drawing ? <CircleNotch className="size-3.5 animate-spin" /> : <MagicWand className="size-3.5" />}
            {result ? 'Redraw' : 'Draw'}
          </Button>
          <Button disabled={!result || posting} onClick={() => void post()}>
            {posting && <CircleNotch className="size-3.5 animate-spin" />}
            Post to chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
