import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, Image as ImageIcon, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readImage } from '@/lib/charx'
import { APPEARANCE, emptyFields, skippedFields, type Profile } from '@/lib/profile'
import { hasPortrait, toBase64, type Image, type VisionModel } from '@/components/character/structure-draft'

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_BYTES = 6 * 1024 * 1024
const label = (m: { provider: string; id: string }) => `${m.provider} · ${m.id}`

/** "Read from picture": a vision model describes the appearance fields from the
 *  portrait (or a picture picked here). The picture goes only into this one
 *  request, as base64; nothing is uploaded or stored. */
export function ReadPictureDialog({ open, onOpenChange, profile, avatar, vision, busy, onRead }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  avatar: string | undefined
  vision: VisionModel
  busy: boolean
  onRead: (fields: Record<string, string[]>, image: Image, model: string | undefined, replace: boolean) => void
}) {
  const [picked, setPicked] = useState<{ url: string; image: Image } | null>(null)
  const [replace, setReplace] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const checkId = useId()
  // a fresh start each time it opens: no picture left over from another card
  useEffect(() => { if (open) { setPicked(null); setReplace(true) } }, [open])

  const portrait = hasPortrait(avatar) ? avatar : null
  const shown = picked?.url ?? portrait
  const none = vision.models.length === 0 && !vision.engineRef
  // "Don't read" belongs to Fill empty; here the picture is the point
  const reader = vision.override ?? vision.engineRef ?? ''

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!TYPES.includes(file.type)) { toast.error('Pick a PNG, JPEG, WebP or GIF picture.'); return }
    if (file.size > MAX_BYTES) { toast.error('That picture is over 6 MB. Pick a smaller one.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const data = url.slice(url.indexOf(',') + 1)
      setPicked({ url, image: { data, mimeType: file.type } })
    }
    reader.onerror = () => toast.error('Could not read that file.')
    reader.readAsDataURL(file)
  }

  const read = async () => {
    if (!reader || !shown) return
    const skip = skippedFields(profile)
    const fields = replace
      ? { appearance: APPEARANCE.map(([k]) => k).filter((k) => !skip.has(k)) }
      : emptyFields(profile, 'appearance')
    if (!Object.keys(fields).length) { toast('Nothing is empty here.'); return }
    let image = picked?.image
    if (!image && portrait) {
      const img = await readImage(portrait)
      if (img) image = { data: toBase64(img.bytes), mimeType: `image/${img.ext}` }
    }
    if (!image) { toast.error('Could not read the picture. Attach another one.'); return }
    onOpenChange(false)
    onRead(fields, image, vision.override, replace)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Read the appearance from a picture</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            {shown
              ? <img src={shown} alt="Portrait to read" className="size-24 shrink-0 rounded-lg border border-border object-cover" />
              : <div className="flex size-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground"><ImageIcon className="size-6" aria-hidden="true" /></div>}
            <div className="flex min-w-0 flex-col gap-2">
              {!shown && <p className="text-sm text-muted-foreground">No picture on this card yet. Attach one.</p>}
              {picked && portrait && <p className="text-xs text-muted-foreground">Using the picture you picked, not the portrait.</p>}
              <input
                ref={fileInput}
                type="file"
                accept={TYPES.join(',')}
                className="sr-only"
                aria-label="Picture to read"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
              />
              <Button variant="outline" size="sm" className="w-fit" onClick={() => fileInput.current?.click()}>
                {shown ? 'Use another picture…' : 'Attach a picture…'}
              </Button>
              <p className="text-xs text-muted-foreground">The picture goes only to the model in this one request.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">Model</Label>
            <Select value={vision.override ?? 'settings'} onValueChange={(v) => vision.setValue(v ? String(v) : 'settings')} disabled={none}>
              <SelectTrigger className="w-full text-sm" aria-label="Vision model"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="settings">{vision.settingsLabel}</SelectItem>
                {vision.models.map((m) => <SelectItem key={m.ref} value={m.ref}>{label(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <p className="flex items-start gap-2 text-sm">
              <Warning className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              This needs a model that reads pictures (a vision model). A text-only model fails with an error.
            </p>
            {none
              ? <p className="text-muted-foreground">None of your connected models reads pictures. Families that do include Gemini, GPT-4o and GPT-4.1, Qwen-VL, Pixtral and Llama 3.2 Vision: add one in Settings → Connections and models; its Vision model then picks the cheapest one by itself.</p>
              : <p className="text-muted-foreground">Your models that read pictures: {vision.models.map(label).join(', ')}</p>}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id={checkId} checked={replace} onCheckedChange={(v) => setReplace(v === true)} />
            <Label htmlFor={checkId} className="text-sm font-normal leading-snug">Rewrite fields that are already filled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={busy || !shown || !reader} onClick={() => void read()}>
            {busy && <CircleNotch className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Reading…' : 'Read'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
