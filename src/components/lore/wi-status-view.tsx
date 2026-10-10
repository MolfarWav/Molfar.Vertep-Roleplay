import { useEffect, useState } from 'react'
import { fetchWIStatus, type WIStatus } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { BudgetLine, WhyRows } from '@/components/lore/why-rows'

/** Scan depth of a book by the name (or id) the engine reports it under. */
export function useBookDepth(): (name: string) => number | null {
  const lorebooks = useApp((s) => s.lorebooks)
  return (name) => {
    const b = lorebooks.find((x) => x.name === name || x.id === name)
    return b ? b.settings.scanDepth : null
  }
}

/** REAL world-info activation for a chat: the engine runs the same scan a
 *  generation runs and says what fired, what the budget cut and what was held
 *  back. Numbers come from the engine, never from a client-side guess. */
export function WiStatusView({ chatId, active }: { chatId: string | null; active: boolean }) {
  const t = useT()
  const depthOfBook = useBookDepth()
  const [status, setStatus] = useState<WIStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !chatId) { setStatus(null); setError(null); return }
    let alive = true
    fetchWIStatus(chatId)
      .then((s) => { if (alive) { setStatus(s); setError(null) } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'failed') })
    return () => { alive = false }
  }, [active, chatId])

  if (!chatId) return <p className="text-sm text-muted-foreground">{t('lore.status.openChat')}</p>
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!status) return <p className="text-sm text-muted-foreground">{t('lore.status.checking')}</p>
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <BudgetLine usedChars={status.usedChars} budgetChars={status.budgetChars} contextTokens={status.contextTokens} />
      <WhyRows fired={status.fired} skipped={status.skipped} blocked={status.blocked ?? []} depthOfBook={depthOfBook} />
    </div>
  )
}
