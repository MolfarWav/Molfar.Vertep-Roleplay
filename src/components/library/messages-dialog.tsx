import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { fetchLitMessages, type LitMessage } from './litopys-api'

export interface MessagesRange {
  from: string
  to?: string
  /** what the user opened: a chapter's label or a fact's text */
  title: string
}

/** The original messages behind a chapter or a fact, read-only (M4d). */
export function MessagesDialog({ chatId, range, onClose }: { chatId: string; range: MessagesRange | null; onClose: () => void }) {
  const t = useT()
  const [items, setItems] = useState<LitMessage[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!range) return
    let live = true
    setItems(null)
    setError('')
    fetchLitMessages(chatId, range.from, range.to)
      .then((r) => {
        if (!live) return
        setItems(r.items)
        setMore(r.more)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      live = false
    }
  }, [chatId, range])

  return (
    <Dialog open={!!range} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-testid="messages-dialog">
        <DialogHeader>
          <DialogTitle>{t('lit.msgs.title')}</DialogTitle>
          {range && <DialogDescription className="line-clamp-2">{range.title}</DialogDescription>}
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto pr-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!items && !error && <p className="text-sm text-muted-foreground">…</p>}
          {items?.map((m) => (
            <article key={m.id} className={cn('rounded-md border border-border p-2.5', m.role === 'user' ? 'bg-muted/50' : 'bg-card')}>
              <p className="mb-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{m.name}</span> · {t('lit.msgs.no', { n: m.no })}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
            </article>
          ))}
          {more && <p className="text-xs text-muted-foreground">{t('lit.msgs.more')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
