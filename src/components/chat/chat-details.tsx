import { Info } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelMark } from '@/components/model-mark'
import { useT } from '@/hooks/use-t'
import { formatCost, formatTokens } from '@/lib/tokens'
import { shortModel } from '@/lib/utils'

/** The header's "i": what used to be two badges (model, spend) plus the chat's numbers. */
export function ChatDetailsButton({ title, chatIndex, chatCount, model, cost, costMsgs, tokensIn, tokensOut, context }: {
  title: string
  /** 0-based */
  chatIndex: number
  chatCount: number
  model: string | null
  cost: number | null
  costMsgs: number
  tokensIn: number | null
  tokensOut: number | null
  context: { used: number; total: number } | null
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
                <Button variant="ghost" size="icon-sm" aria-label={t('details.open')}>
                  <Info aria-hidden="true" />
                </Button>
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
