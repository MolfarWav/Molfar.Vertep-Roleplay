import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Trash, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AvatarImg } from '@/components/dashboard/dash-common'
import { useT } from '@/hooks/use-t'
import { fileToDataUrl } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { type LitPortraits, setLitPortrait } from './litopys-api'

const SIZE = 256
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Any image the app can show (a data URL or a stored media path) as a small data URL the plugin accepts. */
async function toPortrait(src: string): Promise<string> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`image ${res.status}`)
  return fileToDataUrl(await res.blob(), SIZE)
}

/**
 * Set the portrait for a name (narrator cards and lorebook characters have no card of their own):
 * upload an image, or take one from any character card (its avatar or alternates) or persona.
 * Removing it falls back to a card or persona of the same name, then to initials.
 */
export function PortraitDialog({ name, current, own, open, onOpenChange, onSaved }: {
  name: string
  /** what the card shows now */
  current?: string
  /** the user set this one (it can be removed) */
  own: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (map: LitPortraits) => void
}) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const choices = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; label: string; src: string }[] = []
    const add = (label: string, src: string | undefined) => {
      if (!src || seen.has(src) || src.includes('avatar-default')) return
      seen.add(src)
      out.push({ key: `${out.length}`, label, src })
    }
    for (const c of characters) {
      add(c.name, c.avatar)
      for (const a of c.altAvatars ?? []) add(c.name, a)
    }
    for (const p of personas) add(p.name, p.avatar)
    return out
  }, [characters, personas])

  const save = async (make: () => Promise<string | null>) => {
    setBusy(true)
    try {
      onSaved(await setLitPortrait(name, await make()))
      onOpenChange(false)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="portrait-dialog">
        <DialogHeader>
          <DialogTitle>{t('lit.portrait.title', { name })}</DialogTitle>
          <DialogDescription>{t('lit.portrait.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarImg name={name} url={current} className="size-16 rounded-md after:rounded-md" />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void save(() => fileToDataUrl(file, SIZE))
            }}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <UploadSimple className="size-4" aria-hidden="true" />
            {t('lit.portrait.upload')}
          </Button>
          {own && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void save(async () => null)}>
              <Trash className="size-4" aria-hidden="true" />
              {t('lit.portrait.remove')}
            </Button>
          )}
        </div>
        {choices.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t('lit.portrait.fromCards')}</p>
            <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-6">
              {choices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={busy}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => void save(() => toPortrait(c.src))}
                  className={cn('aspect-square overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary disabled:opacity-50')}
                >
                  <img src={c.src} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
