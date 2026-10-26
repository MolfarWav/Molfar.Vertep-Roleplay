import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { fetchLitConfig, putLitConfig } from './litopys-api'

/**
 * Once, in the Library: arcs merge by themselves on a new install, and an install that kept "Ask me first"
 * is offered the switch here. Either answer settles it (the config's `arcNotice`), so it never comes back.
 */
export function ArcsOfferNotice() {
  const t = useT()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void fetchLitConfig()
      .then((c) => { if (live) setShow(c.arcNotice === 'pending' && c.arcMode === 'ask') })
      .catch(() => {})
    return () => { live = false }
  }, [])

  if (!show) return null

  const answer = async (patch: Record<string, unknown>, done?: string) => {
    if (busy) return
    setBusy(true)
    try {
      await putLitConfig(patch)
      setShow(false)
      if (done) toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="arcs-offer" className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-medium">{t('lit.arcsOffer.title')}</p>
      <p className="text-xs text-muted-foreground">{t('lit.arcsOffer.body')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-9" disabled={busy} onClick={() => void answer({ arcMode: 'auto' }, t('lit.arc.autoToast'))}>
          {t('lit.arcsOffer.on')}
        </Button>
        <Button variant="ghost" size="sm" className="min-h-9" disabled={busy} onClick={() => void answer({ arcNotice: 'done' })}>
          {t('lit.arcsOffer.keep')}
        </Button>
      </div>
    </div>
  )
}
