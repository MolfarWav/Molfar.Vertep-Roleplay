import { useState } from 'react'
import { CircleNotch, Translate } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { loadTranslateTo } from '@/lib/card-translate'
import { makeTranslator } from '@/lib/card-translate-store'
import { resolveLanguage } from '@/lib/i18n'
import { useT } from '@/hooks/use-t'

/** Translate one text field in place (description, a greeting, the example
 *  dialogue…) with the app's translator, into the language the card's
 *  Translate menu remembers. The toast can undo it. */
export function FieldTranslateButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useT()
  const translation = useApp((s) => s.settings.translation)
  const appLanguage = useApp((s) => s.settings.language)
  const [busy, setBusy] = useState(false)
  const target = loadTranslateTo(resolveLanguage(appLanguage) === 'uk' ? 'Ukrainian' : 'English')
  if (!value.trim()) return null
  const run = async () => {
    setBusy(true)
    try {
      const out = await makeTranslator(target, translation)(value)
      if (!out?.trim() || out.trim() === value.trim()) {
        toast.info(t('tr.field.same', { field: label, lang: target }))
        return
      }
      const before = value
      onChange(out)
      toast.success(t('tr.field.done', { field: label, lang: target }), { action: { label: t('tr.field.undo'), onClick: () => onChange(before) } })
    } catch (e) {
      toast.error(t('tr.field.failed', { field: label }), { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="ml-auto font-normal text-muted-foreground max-sm:h-8"
      disabled={busy}
      title={t('tr.field.tip', { lang: target })}
      aria-label={t('tr.field.aria', { field: label, lang: target })}
      onClick={(e) => { e.preventDefault(); void run() }}
    >
      {busy ? <CircleNotch className="animate-spin" aria-hidden="true" /> : <Translate aria-hidden="true" />}
      {t('tr.button')}
    </Button>
  )
}
