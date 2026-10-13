import { useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { ID } from '@/lib/types'

/** Regenerate with a hint: one direction for the next variant of the last
 *  reply. It goes to the model for that reply only and is never saved. */
export function RegenerateHintDialog({ chatId, open, onOpenChange }: { chatId: ID; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const regenerate = useApp((s) => s.regenerate)
  const [hint, setHint] = useState('')
  const go = () => {
    if (!hint.trim()) return
    regenerate(chatId, undefined, hint)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('regen.hint.title')}</DialogTitle>
          <DialogDescription>{t('regen.hint.desc')}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          value={hint}
          maxLength={2000}
          placeholder={t('regen.hint.placeholder')}
          aria-label={t('regen.hint.title')}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go() } }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('regen.hint.cancel')}</Button>
          <Button onClick={go} disabled={!hint.trim()}>
            <ArrowsClockwise className="size-4" aria-hidden="true" />{t('regen.hint.go')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
