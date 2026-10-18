import { useState } from 'react'
import { CircleNotch, Broom } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useT } from '@/hooks/use-t'
import { Button } from '@/components/ui/button'
import { cancelLitConsolidate, startLitConsolidate } from './litopys-api'
import type { TabProps } from './ledger-facts'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * #51: Consolidate facts. One pass over the chat's active facts proposes merges of duplicates
 * and fixes of contradictions; they wait in Proposals and nothing changes until accepted.
 */
export function ConsolidateBar({ chat, onChat }: Omit<TabProps, 'onRefresh'>) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const c = chat.consolidate
  // an engine without #51 sends no consolidate field
  if (!c) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (c.state === 'working') {
    return (
      <div data-testid="consolidate-bar" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
          <CircleNotch className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {t('lit.consolidate.working', { n: Math.min(c.next + 1, c.batches), total: c.batches })}
        </p>
        <Button variant="ghost" size="sm" className="max-md:h-10" disabled={busy} onClick={() => void run(() => cancelLitConsolidate(chat.chatId).then(onChat))}>
          {t('lit.cancel')}
        </Button>
      </div>
    )
  }

  const tooFew = c.active < c.min
  return (
    <div data-testid="consolidate-bar" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-10"
          data-testid="consolidate-start"
          disabled={busy || tooFew || !!chat.rebuilding}
          onClick={() => void run(() => startLitConsolidate(chat.chatId).then(onChat))}
        >
          <Broom className="size-4" aria-hidden="true" />
          {t('lit.consolidate.start', { n: c.active })}
        </Button>
        <span className="text-xs text-muted-foreground">
          {tooFew ? t('lit.consolidate.tooFew', { min: c.min }) : t('lit.consolidate.hint')}
        </span>
      </div>
      {c.state === 'failed' && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
          {t('lit.consolidate.failed', { error: c.error })}
        </p>
      )}
      {c.state === 'done' && (
        <p className="text-xs text-muted-foreground">
          {c.proposed > 0 ? t('lit.consolidate.done', { n: c.proposed }) : t('lit.consolidate.nothing')}
        </p>
      )}
    </div>
  )
}
