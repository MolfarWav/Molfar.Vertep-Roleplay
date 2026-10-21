import { useRef, useState } from 'react'
import { CircleNotch, Translate } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { loadTranslateTo, raceAbort } from '@/lib/card-translate'
import { makeTranslator } from '@/lib/card-translate-store'
import { resolveLanguage } from '@/lib/i18n'
import { useT } from '@/hooks/use-t'

/** Translate one text field in place (description, a greeting, the example
 *  dialogue…) with the app's translator, into the language the card's
 *  Translate menu remembers. The toast can undo it; while it runs the button
 *  is a Cancel (nothing is written when it is pressed). */
export function FieldTranslateButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useT()
  const translation = useApp((s) => s.settings.translation)
  const appLanguage = useApp((s) => s.settings.language)
  const [busy, setBusy] = useState(false)
  const ac = useRef<AbortController | null>(null)
  const target = loadTranslateTo(resolveLanguage(appLanguage) === 'uk' ? 'Ukrainian' : 'English')
  if (!value.trim()) return null
  const run = async () => {
    const mine = new AbortController()
    ac.current = mine
    setBusy(true)
    try {
      const out = await raceAbort(makeTranslator(target, translation)(value, mine.signal), mine.signal)
      if (mine.signal.aborted) { toast.info(t('tr.cancelled', { name: label })); return }
      if (!out?.trim() || out.trim() === value.trim()) {
        toast.info(t('tr.field.same', { field: label, lang: target }))
        return
      }
      const before = value
      onChange(out)
      toast.success(t('tr.field.done', { field: label, lang: target }), { action: { label: t('tr.field.undo'), onClick: () => onChange(before) } })
    } catch (e) {
      if (mine.signal.aborted) toast.info(t('tr.cancelled', { name: label }))
      else toast.error(t('tr.field.failed', { field: label }), { description: String((e as Error)?.message ?? e) })
    } finally {
      if (ac.current === mine) ac.current = null
      setBusy(false)
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={busy ? 'ml-auto font-normal text-muted-foreground max-sm:h-10 max-sm:px-3' : 'ml-auto font-normal text-muted-foreground max-sm:h-8'}
      title={busy ? t('tr.cancel') : t('tr.field.tip', { lang: target })}
      aria-label={busy ? t('tr.cancel.aria', { field: label }) : t('tr.field.aria', { field: label, lang: target })}
      onClick={(e) => { e.preventDefault(); if (busy) ac.current?.abort(); else void run() }}
    >
      {busy ? <CircleNotch className="animate-spin" aria-hidden="true" /> : <Translate aria-hidden="true" />}
      {busy ? t('tr.cancel') : t('tr.button')}
    </Button>
  )
}
