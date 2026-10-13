import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'

/** The reply bubble before its first word: moving dots, and after a few
 *  seconds how long the model has been at it, so a slow model never looks hung. */
export function PendingReply() {
  const t = useT()
  const startedAt = useApp((s) => s.streaming?.startedAt ?? 0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground" role="status" aria-live="off">
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="pending-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
      <span className="text-xs tabular-nums">{secs >= 3 ? t('chat.pending.secs', { n: secs }) : t('chat.pending')}</span>
    </div>
  )
}
