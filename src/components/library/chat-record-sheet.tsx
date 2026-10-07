import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { ArrowsClockwise, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/hooks/use-t'
import { rebuildLitChat } from './litopys-api'
import { LedgerChat } from './ledger'
import type { Chat } from '@/lib/types'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The chat's story record: the Ledger of THIS chat in a right-side sheet (edit chapters,
 * facts, proposals), with a rebuild-from-scratch action.
 */
export function ChatRecordSheet({ chat, open, onOpenChange }: { chat: Chat; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [building, setBuilding] = useState(false)
  const [tick, setTick] = useState(0)
  const [scenes, setScenes] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  const runRebuild = async () => {
    setBuilding(true)
    try {
      await rebuildLitChat(chat.id)
      toast.success(t('lit.rebuildStarted'))
      setConfirmOpen(false)
      refresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('lit.recordTitle')}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <LedgerChat chatId={chat.id} refreshKey={tick} onLoaded={(c) => setScenes(c.rebuildScenes ?? 0)} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label={t('lit.refresh')}>
            <ArrowsClockwise className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={building}
          >
            <Trash className="size-3.5" aria-hidden="true" />
            {t('lit.rebuild')}
          </Button>
        </div>
      </SheetContent>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('lit.rebuild')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('lit.rebuildConfirm', { n: scenes })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>{t('home.cancel')}</Button>
            <Button size="sm" variant="destructive" onClick={runRebuild} disabled={building}>
              {t('lit.rebuild')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
