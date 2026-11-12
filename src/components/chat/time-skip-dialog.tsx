import { useState } from 'react'
import { Clock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { useT } from '@/hooks/use-t'
import { AMOUNT_MAX, TIME_UNITS, timeSkipDirection, type TimeUnit } from '@/lib/time-skip'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'

/** Skip time: how much story time passes, sent as a stage direction alone (the reply narrates the jump and the
 *  Dashboard clock follows it). The amount and the note are each optional, but one of them is needed. */
export function TimeSkipDialog({ chatId, open, onOpenChange }: { chatId: ID; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const sendMessage = useApp((s) => s.sendMessage)
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<TimeUnit>('hour')
  const [note, setNote] = useState('')
  const direction = timeSkipDirection(Number(amount), unit, note)
  const go = () => {
    if (!direction) return
    void sendMessage(chatId, direction)
    onOpenChange(false)
    setNote('')
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="time-skip-dialog">
        <DialogHeader>
          <DialogTitle>{t('timeskip.title')}</DialogTitle>
          <DialogDescription>{t('timeskip.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Input
              inputMode="numeric"
              maxLength={String(AMOUNT_MAX).length}
              autoFocus
              className="w-24"
              value={amount}
              aria-label={t('timeskip.amount')}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }}
            />
            <span className="text-sm text-muted-foreground">{t('timeskip.amount')}</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('timeskip.unit')}>
            {TIME_UNITS.map((u) => (
              <ToggleChip key={u} pressed={unit === u} onPressedChange={() => setUnit(u)}>{t(`timeskip.unit.${u}`)}</ToggleChip>
            ))}
          </div>
          <Textarea
            rows={2}
            value={note}
            maxLength={300}
            placeholder={t('timeskip.note.placeholder')}
            aria-label={t('timeskip.note')}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go() } }}
          />
          <p className="text-xs text-muted-foreground">{t('timeskip.note.hint')}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('timeskip.cancel')}</Button>
          <Button onClick={go} disabled={!direction}>
            <Clock className="size-4" aria-hidden="true" />{t('timeskip.go')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
