import { useEffect, useState } from 'react'
import { Translate, CircleNotch, ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import { useApp } from '@/lib/store'
import { TRANSLATE_LANGUAGES, loadTranslateTo, saveTranslateTo, restoreOriginal } from '@/lib/card-translate'
import { translateCharacter, isTranslating } from '@/lib/card-translate-store'
import type { Character } from '@/lib/types'

/** Translate an installed card into the Store's language, or put the original
 *  texts back. The editor saves every edit at once, so nothing is pending when
 *  a pass starts; a field edited while it runs is left as the user wrote it. */
export function TranslateMenu({ c }: { c: Character }) {
  const translation = useApp((s) => s.settings.translation)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const [target, setTarget] = useState(loadTranslateTo)
  useEffect(() => { saveTranslateTo(target) }, [target])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(isTranslating(c.id))
  const [confirm, confirmDialog] = useConfirm()
  const record = restoreOriginal(c)

  const run = async () => {
    setBusy(true)
    setOpen(false)
    try {
      await translateCharacter(c.id, c.name, { target, translation })
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!record) return
    setOpen(false)
    const ok = await confirm({
      title: 'Restore the original texts?',
      description: `The translation${record.target ? ` to ${record.target}` : ''} is replaced by the texts the card came with. The lorebook stays as it is: its originals are not stored (translated keys were added next to the original ones, so they still work).`,
      actionLabel: 'Restore',
      destructive: false,
    })
    if (!ok) return
    const again = restoreOriginal(useApp.getState().characters.find((x) => x.id === c.id) ?? c)
    if (!again) return
    updateCharacter(c.id, again.patch)
    toast.success(`${c.name}: original texts restored`)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" disabled={busy} aria-label="Translate this card" title="Translate this card">
              {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <Translate className="size-4" aria-hidden="true" />}
            </Button>
          }
        />
        <PopoverContent align="end" className="flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3">
          <p className="text-xs text-muted-foreground">
            Translates the card's texts and its embedded lorebook with the app's translator
            (Tools, Translation). The originals are kept in the card.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Translate to</span>
            <Select value={target} onValueChange={(v) => { if (v) setTarget(String(v)) }}>
              <SelectTrigger className="h-8 text-xs" aria-label="Translate to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSLATE_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void run()}>
            <Translate className="size-4" aria-hidden="true" />Translate
          </Button>
          {record && (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => void restore()}>
              <ArrowCounterClockwise className="size-4" aria-hidden="true" />Restore original
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {confirmDialog}
    </>
  )
}
