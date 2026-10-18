// The World DM sheet (plugins/world, #52): one chat's DM, from the chat menu. It shows what
// the DM is set to and how it went, never the world itself: that stays the DM's (the prompt
// Inspector shows what reaches the model).

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookBookmark, GlobeHemisphereWest, Prohibit } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useT } from '@/hooks/use-t'
import { relativeTime } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { loadWorld, loadWorldConfig, runWorld, saveWorldConfig, saveWorldSettings, useWorldLive, type WorldLevel } from '@/lib/world'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const LEVEL_ICON: Partial<Record<WorldLevel, typeof Prohibit>> = { off: Prohibit, chronicler: BookBookmark }

export function WorldSheet({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const view = useWorldLive((s) => s.views[chatId])
  const running = useWorldLive((s) => !!s.running[chatId])
  const [missing, setMissing] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [everyN, setEveryN] = useState('')

  useEffect(() => {
    if (!open) return
    let live = true
    loadWorld(chatId).then((v) => { if (live) setMissing(v === null) }).catch((e) => toast.error(errText(e)))
    loadWorldConfig().then((c) => { if (live) setModel(c.model) }).catch(() => {})
    return () => { live = false }
  }, [open, chatId])
  useEffect(() => { if (view) setEveryN(String(view.settings.everyN)) }, [view?.settings.everyN])

  const save = async (patch: { level?: WorldLevel; everyN?: number }) => {
    try {
      await saveWorldSettings(chatId, patch)
    } catch (e) {
      toast.error(errText(e))
    }
  }
  const saveEvery = () => {
    const n = Math.round(Number(everyN))
    if (!view || !Number.isFinite(n) || n === view.settings.everyN) { if (view) setEveryN(String(view.settings.everyN)); return }
    void save({ everyN: Math.min(50, Math.max(1, n)) })
  }
  const pickModel = async (ref: string) => {
    try {
      setModel((await saveWorldConfig({ model: ref })).model)
    } catch (e) {
      toast.error(errText(e))
    }
  }
  const worldTurn = async () => {
    const r = await runWorld(chatId, false)
    if (!r) return
    if (r.ok === false) toast.error(r.error || t('world.failed'))
    else if (r.skipped === 'nothing new') toast(t('world.nothingNew'))
    else toast.success(r.changes ? t('world.changed', { n: r.changes }) : t('world.unchanged'))
  }

  const level = view?.settings.level ?? 'off'
  const on = level !== 'off'
  const levels = (view?.ready ?? ['off', 'chronicler']) as WorldLevel[]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><GlobeHemisphereWest className="size-4" aria-hidden="true" />{t('world.title')}</SheetTitle>
          <SheetDescription>{t('world.lead')}</SheetDescription>
        </SheetHeader>
        {missing ? (
          <p className="px-4 text-sm text-muted-foreground">{t('world.missing')}</p>
        ) : !view ? (
          <p className="px-4 text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('world.level')}</h3>
              <div role="radiogroup" aria-label={t('world.level')} className="flex flex-col gap-2">
                {levels.map((l) => {
                  const picked = level === l
                  const Icon = LEVEL_ICON[l] ?? GlobeHemisphereWest
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => { if (!picked) void save({ level: l }) }}
                      className={cn('flex min-h-11 items-start gap-2 rounded-md border p-2.5 text-left transition-colors', picked ? 'border-primary/60 bg-primary/10' : 'border-border hover:bg-accent/60')}
                    >
                      <Icon className={cn('mt-0.5 size-4 shrink-0', picked ? 'text-primary' : 'text-muted-foreground')} weight={picked ? 'fill' : 'regular'} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-medium', picked && 'text-primary')}>{t(`world.level.${l}` as never)}</span>
                        <span className="block text-xs text-muted-foreground">{t(`world.level.${l}.hint` as never)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className={cn('flex flex-col gap-3 rounded-md border border-border bg-card p-3', !on && 'opacity-60')}>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>{t('world.everyN')}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={everyN}
                  disabled={!on}
                  onChange={(e) => setEveryN(e.target.value)}
                  onBlur={saveEvery}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEvery() }}
                  className="h-10 w-20 text-right md:h-8"
                />
              </label>
              <p className="-mt-2 text-xs text-muted-foreground">
                {on ? (view.dueIn > 0 ? t('world.dueIn', { n: view.dueIn }) : t('world.dueNow')) : t('world.offHint')}
              </p>
              <Button onClick={() => void worldTurn()} disabled={!on || running} className="max-md:h-10">
                <GlobeHemisphereWest className="size-4" aria-hidden="true" />
                {running ? t('world.running') : t('world.turn')}
              </Button>
              {!on && <p className="-mt-1 text-xs text-muted-foreground">{t('world.turnOff')}</p>}
            </section>

            <section className="flex flex-col gap-1 text-sm" aria-live="polite">
              <h3 className="font-medium">{t('world.status')}</h3>
              <p className="text-muted-foreground">{t('world.records', { n: view.records, r: view.retired })}</p>
              {view.lastRunAt ? (
                <p className="text-muted-foreground">
                  {t('world.lastRun', { when: relativeTime(view.lastRunAt) })}{view.lastSummary ? ': ' + view.lastSummary : ''}
                </p>
              ) : (
                <p className="text-muted-foreground">{t('world.neverRan')}</p>
              )}
              {view.lastError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {t('world.error', { message: view.lastError.message })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t('world.hidden')}</p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('world.model')}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all font-mono text-xs">{model || t('world.chatModel')}</span>
                <SoulModelPicker label={t('dash.set.chooseModel')} onPick={(ref) => void pickModel(ref)} />
                {model && <Button size="sm" variant="ghost" onClick={() => void pickModel('')}>{t('dash.set.useChatModel')}</Button>}
              </div>
              <p className="text-xs text-muted-foreground">{t('world.modelHint')}</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
