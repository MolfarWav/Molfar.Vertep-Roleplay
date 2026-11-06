// Letters from cards (#72): the offer. The feature is off by default and its switch sat three clicks deep
// (Characters, More, Letters from cards), so nobody found it. While it is off, this card says what it is and
// turns it on in one tap, on the two screens where letters would arrive or where cards live: the Characters
// page and Home's "Waiting on you". "Not now" hides it for good; the menu item stays.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EnvelopeSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { LettersDialog } from '@/components/letters/letters-dialog'
import { loadLetters, saveLettersConfig, useLetters } from '@/lib/letters'
import { showLettersOffer, LETTERS_OFFER_KEY } from '@/lib/letters-core'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'

function dismissed(): boolean {
  try { return localStorage.getItem(LETTERS_OFFER_KEY) === 'no' } catch { return false }
}

export function LettersOffer({ className }: { className?: string }) {
  const t = useT()
  const { config, available } = useLetters()
  const [hidden, setHidden] = useState(dismissed)
  const [details, setDetails] = useState(false)
  useEffect(() => { if (!available) void loadLetters() }, [available])
  if (!showLettersOffer({ available, enabled: config.enabled, dismissed: hidden })) return details ? <LettersDialog open onOpenChange={setDetails} /> : null

  const hide = () => {
    try { localStorage.setItem(LETTERS_OFFER_KEY, 'no') } catch { /* memory only */ }
    setHidden(true)
  }
  const turnOn = async () => {
    await saveLettersConfig({ enabled: true })
    if (!useLetters.getState().config.enabled) return
    toast.success(t('letters.offer.on', { days: config.idleDays }))
    // no model for background work: the card stays honest and sends the player to where it is set
    if (!useLetters.getState().model) setDetails(true)
  }

  return (
    <>
      <section className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5', className)} aria-label={t('letters.title')} data-testid="letters-offer">
        <EnvelopeSimple className="size-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-body font-semibold">{t('letters.offer.title')}</p>
          <p className="text-caption text-muted-foreground">{t('letters.offer.body', { days: config.idleDays })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button className="max-md:h-10" onClick={() => void turnOn()} data-testid="letters-offer-on">{t('letters.offer.turnOn')}</Button>
          <Button variant="ghost" className="max-md:h-10" onClick={hide} data-testid="letters-offer-no">{t('letters.offer.notNow')}</Button>
        </div>
      </section>
      <LettersDialog open={details} onOpenChange={setDetails} />
    </>
  )
}
