import { Info } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelMark } from '@/components/model-mark'
import { useT } from '@/hooks/use-t'
import { formatCost, formatTokens } from '@/lib/tokens'
import { shortModel } from '@/lib/utils'

/** A ring that fills as the context does: the phone header's trigger. */
function ContextRing({ pct, known }: { pct: number; known: boolean }) {
  const r = 10.5
  const c = 2 * Math.PI * r
  // amber past three quarters, red when nearly full: the next reply may cut old messages
  const tone = pct >= 90 ? 'text-destructive' : pct >= 75 ? 'text-amber-500' : 'text-cta'
  // the number in the middle keeps a nearly empty ring from reading as a spinner
  return (
    <span className="relative flex size-7 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 28 28" className="absolute inset-0 size-7! -rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-muted-foreground/35" />
        {known && (
          <circle cx="14" cy="14" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className={tone} />
        )}
      </svg>
      <span className="font-mono text-[9px] leading-none font-semibold tabular-nums text-foreground">
        {known ? Math.round(pct) : 'i'}
      </span>
    </span>
  )
}

/** The last reply's prompt and how much of it the provider read from its cache; `total` is the chat's sum. */
export type ChatCache = { last: number; prompt: number; total: number }

/** The header's "i": what used to be two badges (model, spend) plus the chat's numbers.
 *  `ring` shows how full the context is instead of the "i" (the phone header). */
export function ChatDetailsButton({ title, chatIndex, chatCount, model, cost, costMsgs, tokensIn, tokensOut, cache = null, context, ring = false }: {
  title: string
  /** 0-based */
  chatIndex: number
  chatCount: number
  model: string | null
  cost: number | null
  costMsgs: number
  tokensIn: number | null
  tokensOut: number | null
  cache?: ChatCache | null
  context: { used: number; total: number } | null
  ring?: boolean
}) {
  const t = useT()
  const none = <span className="text-muted-foreground">{t('details.none')}</span>
  const pct = context && context.total > 0 ? Math.min(100, (context.used / context.total) * 100) : 0
  const row = 'flex items-start justify-between gap-3'
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                ring ? (
                  <Button variant="ghost" size="icon" className="size-10" aria-label={context ? t('details.ring', { n: Math.round(pct) }) : t('details.open')}>
                    <ContextRing pct={pct} known={!!context && context.total > 0} />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label={t('details.open')}>
                    <Info aria-hidden="true" />
                  </Button>
                )
              }
            />
          }
        />
        <TooltipContent>{t('details.open')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 gap-0 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={title}>{title}</p>
          <p className="text-xs text-muted-foreground">{t('details.chat', { n: chatIndex + 1, m: chatCount })}</p>
        </div>
        <dl className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs">
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('details.model')}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-right">
              {model ? (
                <>
                  <ModelMark model={model} className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-mono">{shortModel(model)}</span>
                </>
              ) : none}
            </dd>
          </div>
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('details.spend')}</dt>
            <dd className="text-right" title={cost != null ? t('details.spendMsgs', { n: costMsgs }) : undefined}>
              {cost != null ? <span className="font-mono">{formatCost(cost)}</span> : none}
            </dd>
          </div>
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('details.tokens')}</dt>
            <dd className="font-mono text-right">
              {tokensIn != null || tokensOut != null
                ? `${tokensIn != null ? formatTokens(tokensIn) : '—'} / ${tokensOut != null ? formatTokens(tokensOut) : '—'}`
                : none}
            </dd>
          </div>
          {cache && cache.prompt > 0 && (
            <div className={row}>
              <dt className="shrink-0 text-muted-foreground">{t('details.cache')}</dt>
              <dd className="font-mono text-right" title={t('details.cacheTotal', { n: formatTokens(cache.total) })}>
                {cache.last > 0
                  ? t('details.cacheOf', { n: formatTokens(cache.last), m: formatTokens(cache.prompt), pct: Math.round((cache.last / cache.prompt) * 100) })
                  : <span className="text-muted-foreground">{t('details.cacheNone')}</span>}
              </dd>
            </div>
          )}
          {context && (
            <div className="flex flex-col gap-1">
              <div className={row}>
                <dt className="shrink-0 text-muted-foreground">{t('details.context')}</dt>
                <dd className="font-mono text-right">{formatTokens(context.used)} / {formatTokens(context.total)}</dd>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted" role="presentation">
                <div className="h-full rounded-full bg-cta" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
