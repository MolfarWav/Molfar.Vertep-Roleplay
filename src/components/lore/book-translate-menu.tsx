import { useEffect, useState } from 'react'
import { Translate } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { TRANSLATE_LANGUAGES, loadTranslateTo, saveTranslateTo } from '@/lib/card-translate'
import { isTranslating, translateLorebook } from '@/lib/card-translate-store'
import { resolveLanguage } from '@/lib/i18n'
import { useT } from '@/hooks/use-t'
import type { Lorebook } from '@/lib/types'

/** Translate a whole lorebook with the app's translator, from the book's "more" menu. Entry texts are replaced,
 *  translated keys are added next to the originals; a copy of the book as it was can be kept (on by default: the
 *  originals are not stored). */
export function BookTranslateDialog({ book, open, onOpenChange }: { book: Lorebook; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const appLanguage = useApp((s) => s.settings.language)
  const translation = useApp((s) => s.settings.translation)
  const [target, setTarget] = useState(() => loadTranslateTo(resolveLanguage(appLanguage) === 'uk' ? 'Ukrainian' : 'English'))
  useEffect(() => { saveTranslateTo(target) }, [target])
  const [keepCopy, setKeepCopy] = useState(true)
  const [busy, setBusy] = useState(isTranslating(book.id))
  const run = async () => {
    onOpenChange(false)
    setBusy(true)
    try {
      await translateLorebook(book.id, book.name, { target, translation, keepCopy })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('lore.tr.button')}</DialogTitle>
        </DialogHeader>
        <p className="text-body text-muted-foreground">{t('lore.tr.desc')}</p>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">{t('lore.tr.to')}</span>
          <Select value={target} onValueChange={(v) => { if (v) setTarget(String(v)) }}>
            <SelectTrigger className="h-8 text-body max-md:h-10" aria-label={t('lore.tr.to')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSLATE_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-start gap-2 text-body">
          <Checkbox checked={keepCopy} onCheckedChange={(c) => setKeepCopy(c === true)} className="mt-0.5" />
          <span>{t('lore.tr.keep')}</span>
        </label>
        <Button className="gap-1.5 self-start max-md:h-10" disabled={busy || book.entries.length === 0} onClick={() => void run()}>
          <Translate className="size-4" aria-hidden="true" />{t('lore.tr.go', { n: book.entries.length })}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
