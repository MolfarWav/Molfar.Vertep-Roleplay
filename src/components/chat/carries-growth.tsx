import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CaretRight } from '@phosphor-icons/react'
import { Switch } from '@/components/ui/switch'
import type { useT } from '@/hooks/use-t'
import { type GrowthView, growthActs, loadGrowth, putGrowth } from '@/components/character/memory-api'
import { growthLabel } from '@/components/character/memory-growth'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type T = ReturnType<typeof useT>

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** "Growth blocks in this chat": which blocks of the card's portrait this chat is sent, and why each one is in or out (#450). Read when
 *  opened; every switch is saved at once into the block (its `chats` and `skip` lists) and `onChanged` reads the numbers again.
 *  Only this chat changes: the block is not edited, nor its other chats. */
export function GrowthChoices({ chatId, cardId, t, onChanged }: { chatId: string; cardId: string; t: T; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<GrowthView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async () => {
    setError('')
    try {
      const v = await loadGrowth(cardId, chatId)
      if (alive.current) setData(v)
    } catch (e) {
      if (alive.current) setError(errText(e))
    }
  }, [chatId, cardId])
  useEffect(() => { if (open) void load() }, [open, load])

  const choose = async (id: string, apply: boolean) => {
    setBusy(true)
    try {
      const v = await putGrowth(cardId, { op: 'chat', id, chatId, apply }, chatId)
      if (alive.current) setData(v)
      onChanged()
    } catch (e) {
      toast.error(t('carries.saveFailed', { error: errText(e) }))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const blocks = data ? data.growth.entries.filter((e) => e.state === 'accepted') : []
  const panelId = `carries-growth-${cardId}`
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="carries-growth-toggle"
        className="flex min-h-8 w-fit items-center gap-1 rounded-md px-1 text-sm font-medium outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
      >
        <CaretRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
        {t('carries.growth.toggle')}
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2" data-testid="carries-growth">
          <p className="text-xs text-muted-foreground">{t('carries.growth.hint')}</p>
          {error && <p className="text-xs text-destructive">{t('carries.growth.error', { error })}</p>}
          {!data && !error && <p className="text-xs text-muted-foreground">{t('carries.growth.loading')}</p>}
          {data && blocks.length === 0 && <p className="text-xs text-muted-foreground">{t('carries.growth.none')}</p>}
          <ul className="flex flex-col">
            {blocks.map((e) => {
              const reach = data?.reach?.[e.id] ?? 'card'
              const title = growthLabel(e, 60)
              const cardOff = !e.on
              return (
                <li key={e.id} className="border-t border-border first:border-t-0" data-testid="carries-growth-block">
                  <label className="flex min-h-10 items-start gap-3 py-1.5">
                    <Switch
                      checked={!cardOff && growthActs(reach)}
                      disabled={cardOff || busy}
                      onCheckedChange={(v) => void choose(e.id, v)}
                      aria-label={t('carries.growth.use', { title })}
                      className="mt-0.5 max-md:after:-inset-y-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words text-sm', cardOff && 'text-muted-foreground')}>{title}</span>
                      <span className="block text-xs text-muted-foreground">{t((cardOff ? 'mem.grow.where.note.cardOff' : `mem.grow.where.note.${reach}`) as MsgKey)}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
