import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { markLitScene } from '@/components/library/litopys-api'
import { useT } from '@/hooks/use-t'
import type { Chat } from '@/lib/types'

/** How many messages either side of the clicked one the pickers list. */
const WINDOW = 120

/** Set a run of messages apart as a scene of its own: the story record never folds it into a longer one and is told it matters. */
export function SceneMarkDialog({ chat, messageId, onClose }: { chat: Chat; messageId: string; onClose: () => void }) {
  const t = useT()
  // the story record counts the messages it reads: the ones the model sees, in order (the same numbers as its chapters)
  const line = useMemo(
    () => chat.messages.filter((m) => !m.hidden && (m.role === 'user' || m.role === 'assistant')),
    [chat.messages],
  )
  const at = Math.max(0, line.findIndex((m) => m.id === messageId))
  const [from, setFrom] = useState(at)
  const [to, setTo] = useState(Math.min(line.length - 1, at + 4))
  const [busy, setBusy] = useState(false)

  const label = (i: number) => {
    const m = line[i]
    const text = (m.swipes[m.activeSwipe]?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    return `#${i + 1} · ${m.role === 'user' ? t('scene.you') : t('scene.char')} · ${text}`
  }
  const fromOptions = range(Math.max(0, at - WINDOW), at)
  const toOptions = range(Math.max(from, at), Math.min(line.length - 1, at + WINDOW))
  if (!fromOptions.includes(from)) fromOptions.push(from)

  const save = async () => {
    setBusy(true)
    try {
      await markLitScene(chat.id, line[from].id, line[to].id)
      toast.success(t('scene.saved'))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const field = 'h-10 w-full rounded-md border border-input bg-background px-2 text-sm'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="scene-mark-dialog">
        <DialogHeader>
          <DialogTitle>{t('scene.title')}</DialogTitle>
          <DialogDescription>{t('scene.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t('scene.from')}
            <select className={field} value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to < v) setTo(v) }}>
              {fromOptions.map((i) => <option key={i} value={i}>{label(i)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('scene.to')}
            <select className={field} value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {toOptions.map((i) => <option key={i} value={i}>{label(i)}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{t('scene.count', { n: to - from + 1 })}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="max-md:min-h-10" onClick={onClose}>{t('lit.cancel')}</Button>
          <Button className="max-md:min-h-10" disabled={busy || line.length === 0 || to < from} onClick={() => void save()}>{t('scene.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function range(a: number, b: number): number[] {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
