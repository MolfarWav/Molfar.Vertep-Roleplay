import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { fetchImageModels, type ImageModelInfo } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { loadWorldConfig, saveWorldConfig, WORLD_CONFIG_EVENT, type WorldConfig } from '@/lib/world'

/** The select cannot hold an empty value: this stands for "no World override, use the app's". */
const APP = '__app'

/** The World's image model: the one in force and where it comes from, and a picker whose first choice
 *  clears the World's own pick. Reads and saves the config itself, so it works in any dialog. */
export function ImageModelSection({ chatId }: { chatId: string | null }) {
  const t = useT()
  const appModel = useApp((s) => s.settings.imageGen?.model ?? '')
  const [own, setOwn] = useState<string | null>(null)
  const [models, setModels] = useState<ImageModelInfo[]>([])

  useEffect(() => {
    let alive = true
    loadWorldConfig(chatId ?? undefined)
      .then((c) => { if (alive) setOwn((prev) => prev ?? c.imageModel) })
      .catch((e) => { if (alive) toast.error(e instanceof Error ? e.message : String(e)) })
    // a save elsewhere hands over the saved config: no second read that could land out of order
    const saved = (e: Event) => setOwn((e as CustomEvent<WorldConfig>).detail.imageModel)
    void fetchImageModels().then((m) => { if (alive) setModels(m) })
    window.addEventListener(WORLD_CONFIG_EVENT, saved)
    return () => { alive = false; window.removeEventListener(WORLD_CONFIG_EVENT, saved) }
  }, [chatId])

  const nameOf = (ref: string) => {
    const m = models.find((x) => `${x.provider}/${x.id}` === ref)
    return m ? m.favorite?.name || m.label : ref
  }
  const pick = async (v: string) => {
    try {
      setOwn((await saveWorldConfig({ imageModel: v === APP ? '' : v }, chatId ?? undefined)).imageModel)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const inForce = own || appModel
  const choiceLabel = (v: string) => (v === APP ? t(appModel ? 'world.img.appChoice' : 'world.img.appChoiceNone') : nameOf(v))

  return (
    <div className="flex flex-col gap-2" data-testid="world-image-model">
      <p className="break-all text-sm" data-testid="world-image-line">
        {inForce ? (
          <>
            <span className="font-mono">{nameOf(inForce)}</span>{' '}
            <span className="text-xs text-muted-foreground">({t(own ? 'world.bg.modelWorld' : 'world.bg.modelApp')})</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t('world.settings.imageNone')}</span>
        )}
      </p>
      <Select value={own === null ? undefined : own || APP} onValueChange={(v) => v && void pick(v)}>
        <SelectTrigger className="h-10 w-full md:h-9" aria-label={t('world.settings.image')} data-testid="world-settings-image-model">
          <SelectValue placeholder={t('world.img.empty')}>{own === null ? t('world.img.empty') : choiceLabel(own || APP)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={APP}>
              <span className="text-xs">{t(appModel ? 'world.img.appChoice' : 'world.img.appChoiceNone')}</span>
            </SelectItem>
            {models.map((m) => (
              <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                <span className="text-xs">{m.favorite?.name || m.label}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground">{m.connectionName ?? m.provider}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/** A small dialog for the image model only (the Make a set line's "Change"). */
export function ImageModelDialog({ open, onOpenChange, chatId }: { open: boolean; onOpenChange: (o: boolean) => void; chatId: string | null }) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="image-model-dialog">
        <DialogHeader>
          <DialogTitle>{t('world.img.title')}</DialogTitle>
          <DialogDescription>{t('world.img.lead')}</DialogDescription>
        </DialogHeader>
        <ImageModelSection chatId={chatId} />
      </DialogContent>
    </Dialog>
  )
}
