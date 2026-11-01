// A quiet note under a reply that let a character act on a secret it does not know (#184 P3). The Dashboard plugin
// finds it; the note says who, quotes the line and offers three answers. Until one is given, the character learns
// nothing from that reply. It is not a message: it never goes to the model and never into an export.
import { useState } from 'react'
import { ArrowsClockwise, Eye } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import type { LeakHit } from '@/lib/dashboard'
import { useApp } from '@/lib/store'
import type { Message } from '@/lib/types'

/** The open hits of the reply on screen: the key is the message and its active swipe. */
export function leaksFor(all: LeakHit[] | undefined, message: Pick<Message, 'id' | 'activeSwipe' | 'role'>): LeakHit[] {
  if (message.role !== 'assistant') return []
  const key = `${message.id}#${message.activeSwipe}`
  return (all ?? []).filter((l) => l.key === key)
}

export function LeakNote({ chatId, message, last }: { chatId: string; message: Message; last: boolean }) {
  const t = useT()
  const dash = useDashMaybe()
  const regenerate = useApp((s) => s.regenerate)
  const [busy, setBusy] = useState('')
  const hits = leaksFor(dash?.data?.leaks, message)
  if (!hits.length || !dash) return null

  const answer = async (hit: LeakHit, op: 'found' | 'ignore') => {
    setBusy(`${hit.who}:${hit.factId}:${op}`)
    try {
      // "found out" first writes the fact (the name joins its knowers, and the Activity tab shows it), then closes the note
      if (op === 'found') await j('/litopys/facts', { method: 'POST', body: JSON.stringify({ chatId, op: 'know', id: hit.factId, who: hit.who }) })
      await j('/dashboard/leak', { method: 'POST', body: JSON.stringify({ chatId, key: hit.key, who: hit.who, factId: hit.factId, op }) })
      await dash.reload()
    } catch (e) {
      toast.error(t('leak.error', { message: String((e as Error)?.message ?? e) }))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-1" data-testid="leak-note">
      {hits.map((hit) => (
        <section
          key={`${hit.who}:${hit.factId}`}
          className="flex flex-col gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2"
          aria-label={t('leak.title', { who: hit.who })}
        >
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <Eye className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="min-w-0 break-words">{t('leak.title', { who: hit.who })}</span>
          </p>
          {hit.quote ? <p className="min-w-0 break-words pl-6 text-xs italic text-muted-foreground">“{hit.quote}”</p> : null}
          <p className="min-w-0 break-words pl-6 text-xs text-muted-foreground">{t('leak.secret', { text: hit.text })}</p>
          <p className="pl-6 text-xs text-muted-foreground">{t('leak.hold', { who: hit.who })}</p>
          <div className="flex flex-wrap gap-2 pl-6 pt-0.5">
            {last && (
              <Button size="sm" variant="secondary" className="max-md:h-10" disabled={!!busy} onClick={() => regenerate(chatId)}>
                <ArrowsClockwise className="size-4" aria-hidden="true" />
                {t('leak.regenerate')}
              </Button>
            )}
            <Button size="sm" variant="outline" className="max-md:h-10" disabled={!!busy} onClick={() => void answer(hit, 'found')}>
              {t('leak.found', { who: hit.who })}
            </Button>
            <Button size="sm" variant="ghost" className="max-md:h-10" disabled={!!busy} onClick={() => void answer(hit, 'ignore')}>
              {t('leak.ignore')}
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}
