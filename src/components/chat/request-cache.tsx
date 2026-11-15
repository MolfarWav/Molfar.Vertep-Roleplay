// The prompt-cache section of the request-size popup (#112): how much of the last request the provider served from
// its cache, how the model's cache is held, and a way to see where in the prompt the cache ends.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { cacheSplit } from '@/lib/cache-boundary'
import { fetchCacheInfo, type CacheInfo } from '@/lib/engine'
import { shortTokens } from '@/lib/long-chat'
import { cn } from '@/lib/utils'
import type { RequestSize } from '@/components/chat/request-size'

const pct = (n: number, whole: number): string => {
  if (whole <= 0 || n <= 0) return '0'
  const p = (n / whole) * 100
  return p < 1 ? '<1' : String(Math.round(p))
}

export function RequestCache({ rs, onShow }: { rs: RequestSize; onShow: () => void }) {
  const t = useT()
  const [info, setInfo] = useState<CacheInfo | null>(null)
  useEffect(() => {
    setInfo(null)
    if (!rs.open || !rs.model) return
    let live = true
    void fetchCacheInfo(rs.model).then((i) => { if (live) setInfo(i) })
    return () => { live = false }
  }, [rs.open, rs.model, rs.tokens])

  const u = rs.usage
  if (!u) return null
  const s = cacheSplit(u)
  const cached = s.read + s.written > 0
  const rows = [
    { key: 'read', label: t('req.cache.read'), n: s.read, fill: 'bg-teal-500' },
    { key: 'written', label: t('req.cache.written'), n: s.written, fill: 'bg-sky-500' },
    { key: 'fresh', label: t('req.cache.fresh'), n: s.fresh, fill: 'bg-muted-foreground/50' },
  ].filter((r) => r.n > 0)
  const ka = info?.keepalive
  const warn = 'text-caption text-amber-700 dark:text-amber-300'

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs" data-testid="request-cache" aria-labelledby="req-cache-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="req-cache-title" className="text-xs font-semibold">{t('req.cache.title')}</h3>
        {cached && <span className="font-mono text-muted-foreground" data-testid="request-cache-share">{t('req.cache.share', { p: pct(s.read, s.prompt) })}</span>}
      </div>
      {cached ? (
        <>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={rows.map((r) => `${r.label}: ${shortTokens(r.n)}`).join(', ')}>
            {rows.map((r) => <div key={r.key} className={cn('h-full', r.fill)} style={{ width: `${Math.max(1, (r.n / s.prompt) * 100)}%` }} />)}
          </div>
          <dl className="flex flex-col gap-1">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className={cn('size-2 shrink-0 rounded-sm', r.fill)} aria-hidden="true" />
                  <span className="min-w-0">{r.label}</span>
                </dt>
                <dd className="whitespace-nowrap font-mono">{shortTokens(r.n)} · {pct(r.n, s.prompt)}%</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-muted-foreground" data-testid="request-cache-none">{t('req.cache.none')}</p>
      )}
      {info && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
          <span className="text-muted-foreground">{t('req.cache.setting')}</span>
          <span className="font-medium" data-testid="request-cache-mode">{t(`req.cache.mode.${info.mode}` as 'req.cache.mode.default')}</span>
        </div>
      )}
      {info?.mode === 'keepalive' && (
        <>
          <p className="text-muted-foreground">
            {ka && ka.sent > 0 ? t('req.cache.ka', { n: String(ka.sent), m: shortTokens(ka.lastRead ?? 0) }) : t('req.cache.kaNone')}
          </p>
          {ka?.stopped && <p className={warn}>{ka.stopped}</p>}
          {ka?.skipped && <p className={warn}>{ka.skipped}</p>}
        </>
      )}
      {info?.mode === 'default' && cached && <p className="text-muted-foreground">{t('req.cache.hint')}</p>}
      {s.read > 0 && (
        <Button type="button" variant="outline" size="sm" className="h-9 w-full text-xs max-md:h-10" onClick={onShow} data-testid="request-cache-show">
          {t('req.cache.show')}
        </Button>
      )}
    </section>
  )
}
