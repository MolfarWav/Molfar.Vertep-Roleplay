import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowUUpLeft, ArrowsClockwise, Eraser } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { reloadDash } from '@/lib/dash-live'
import type { DashInherit } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

/** The phone's empty bar: bring the carried state back after "Start clean". */
export function CarriedBack({ chatId }: { chatId: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-10 rounded-none"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        j('/dashboard/inherit', { method: 'POST', body: JSON.stringify({ chatId, on: true }) })
          .then(() => reloadDash(chatId))
          .catch((e) => toast.error(t('dash.carried.error', { message: String((e as Error)?.message ?? e) })))
          .finally(() => setBusy(false))
      }}
    >
      {t('dash.carried.back')}
    </Button>
  )
}

/**
 * A chat that continues another starts from that chat's end state (#100). Until the Dashboard has
 * read a reply here the user can start clean (and bring it back); afterwards it is one muted line.
 */
export function CarriedBanner({ chatId, inherit, className }: { chatId: string; inherit: DashInherit | null | undefined; className?: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [confirm, dialog] = useConfirm()
  // linked after the chat had read turns of its own: offer to rebuild its Dashboard on top of the earlier chat
  if (inherit?.canRebase) {
    const rebuild = async () => {
      const ok = await confirm({
        title: t('dash.rebase.confirmTitle', { title: inherit.title || inherit.from }),
        description: t('dash.rebase.confirmBody'),
        actionLabel: t('dash.rebase.action'),
        destructive: false,
      })
      if (!ok) return
      setBusy(true)
      try {
        await j('/dashboard/inherit', { method: 'POST', body: JSON.stringify({ chatId, rebase: true }) })
        // the chat is read again from the carried state, one sensor call
        await j('/dashboard/update', { method: 'POST', body: JSON.stringify({ chatId, op: 'send' }) }).catch(() => null)
        await reloadDash(chatId)
      } catch (e) {
        toast.error(t('dash.carried.error', { message: String((e as Error)?.message ?? e) }))
      } finally {
        setBusy(false)
      }
    }
    return (
      <div className={cn('flex flex-col gap-2 border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs', className)} data-testid="dash-rebase">
        <div className="flex items-start gap-2">
          <ArrowsClockwise className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="break-words">{t('dash.rebase.on', { title: inherit.title || inherit.from })}</span>
            <span className="text-[11px] text-muted-foreground">{t('dash.rebase.hint', { title: inherit.title || inherit.from })}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-10 w-full rounded-none md:h-7 md:w-fit" disabled={busy} onClick={() => { void rebuild() }}>
          {t('dash.rebase.action')}
        </Button>
        {dialog}
      </div>
    )
  }
  // an earlier chat with no Dashboard state to carry: nothing to say
  if (!inherit || (!inherit.on && !inherit.off)) return null
  const title = inherit.title || inherit.from
  const params = { title, notes: inherit.notes, threads: inherit.threads }

  const set = async (on: boolean) => {
    setBusy(true)
    try {
      await j('/dashboard/inherit', { method: 'POST', body: JSON.stringify({ chatId, on }) })
      await reloadDash(chatId)
    } catch (e) {
      toast.error(t('dash.carried.error', { message: String((e as Error)?.message ?? e) }))
    } finally {
      setBusy(false)
    }
  }

  if (!inherit.canSwitch) {
    return (
      <p className={cn('flex items-start gap-1.5 text-[11px] text-muted-foreground', className)} data-testid="dash-carried-line">
        {inherit.on ? <ArrowUUpLeft className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : <Eraser className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 break-words">{inherit.on ? t('dash.carried.line', params) : t('dash.carried.offLine')}</span>
      </p>
    )
  }

  return (
    <div
      className={cn('flex flex-col gap-2 border p-2.5 text-xs', inherit.on ? 'border-cta/40 bg-cta/10' : 'border-border bg-muted/40', className)}
      data-testid="dash-carried"
    >
      <div className="flex items-start gap-2">
        {inherit.on ? <ArrowUUpLeft className="mt-px size-4 shrink-0" aria-hidden="true" /> : <Eraser className="mt-px size-4 shrink-0" aria-hidden="true" />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words">{inherit.on ? t('dash.carried.on', params) : t('dash.carried.off', params)}</span>
          {inherit.on && <span className="text-[11px] text-muted-foreground">{t('dash.carried.hint')}</span>}
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-10 w-full rounded-none md:h-7 md:w-fit" disabled={busy} onClick={() => void set(!inherit.on)}>
        {inherit.on ? t('dash.carried.clean') : t('dash.carried.back')}
      </Button>
    </div>
  )
}
