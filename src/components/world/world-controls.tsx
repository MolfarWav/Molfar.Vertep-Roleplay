import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GlobeHemisphereWest, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import {
  LEVEL_ICON,
  LEVEL_TONE,
  formatK,
  formatMoney,
  formatSeconds,
  useWorldErrorText,
  NEEDS_CONNECTIONS,
  FROM_KEY,
} from './world-common'
import {
  loadWorld,
  peekWorld,
  readWholeChat,
  runWorld,
  saveWorldConfig,
  saveWorldSettings,
  useWorldLive,
  type WorldError,
  type WorldLevel,
  type WorldRecord,
  type WorldView,
} from '@/lib/world'
import type { MsgKey } from '@/lib/i18n'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const EVENT_LEVELS: WorldLevel[] = ['living', 'director', 'antagonist', 'chaos']

function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm">
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}

export function WorldErrorCard({
  error,
  onRetry,
  onPickModel,
  busy,
  model,
  again = true,
  className,
}: {
  error: Pick<WorldError, 'code' | 'message' | 'details' | 'limit'>
  onRetry?: () => void
  onPickModel?: () => void
  busy?: boolean
  /** the model in force: "Open API connections" opens on its settings */
  model?: string | null
  /** the line about the same messages being read next time (a real run, not a test) */
  again?: boolean
  className?: string
}) {
  const t = useT()
  const text = useWorldErrorText()
  const [showDetails, setShowDetails] = useState(false)

  const openConnections = () => {
    if (!canOpenModelSettings()) {
      toast.info(t('world.connectionsHint'))
      return
    }
    void openModelSettings(model || null).catch(() => toast.info(t('world.connectionsHint')))
  }

  return (
    <div className={cn('rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm', className)}>
      <div className="flex items-start gap-2">
        <Warning className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-destructive">{t('world.err.title')}</p>
          <p className="break-words">{text(error)}</p>
          {again && <p className="text-xs text-muted-foreground">{t('world.err.again')}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={onRetry}>
            {t('world.err.retry')}
          </Button>
        )}
        {onPickModel && (
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={onPickModel}>
            {t('world.err.pickModel')}
          </Button>
        )}
        {NEEDS_CONNECTIONS.includes(error.code) && (
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={openConnections}>
            {t('world.openConnections')}
          </Button>
        )}
        {error.details && (
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            {t('world.err.details')}
          </Button>
        )}
      </div>
      {showDetails && error.details && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 font-mono text-xs">
          {error.details}
        </pre>
      )}
    </div>
  )
}

export function WorldControls({
  chatId,
  where,
  onOpenSettings,
  wide,
}: {
  chatId: string
  where: 'sheet' | 'hub'
  onOpenSettings?: () => void
  wide?: boolean
}) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const view = useWorldLive((s) => s.views[chatId])
  const running = useWorldLive((s) => !!s.running[chatId])
  const [missing, setMissing] = useState(false)
  const [everyN, setEveryN] = useState('')
  const [still, setStill] = useState('')
  const [records, setRecords] = useState<WorldRecord[] | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelSectionRef = useRef<HTMLElement>(null)

  const [reading, setReading] = useState(false)
  const [readDone, setReadDone] = useState(0)
  const [readTotal, setReadTotal] = useState(0)
  const stopReadRef = useRef(false)

  useEffect(() => {
    let live = true
    setMissing(false)
    setReading(false)
    setReadDone(0)
    setReadTotal(0)
    stopReadRef.current = false
    loadWorld(chatId)
      .then((v) => {
        if (!live) return
        setMissing(v === null)
      })
      .catch((e) => toast.error(errText(e)))
    return () => {
      live = false
      stopReadRef.current = true
    }
  }, [chatId])

  useEffect(() => {
    if (view) setEveryN(String(view.settings.everyN))
  }, [view?.settings.everyN])

  useEffect(() => {
    if (view) setStill(String(view.settings.stagnation))
  }, [view?.settings.stagnation])

  if (missing) {
    return <p className="text-sm text-muted-foreground">{t('world.missing')}</p>
  }
  if (!view) {
    return <p className="text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
  }

  const save = async (patch: Partial<WorldView['settings']>) => {
    try {
      await saveWorldSettings(chatId, patch)
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const saveEvery = () => {
    const n = Math.round(Number(everyN))
    if (!view || !Number.isFinite(n) || n === view.settings.everyN) {
      setEveryN(String(view.settings.everyN))
      return
    }
    void save({ everyN: Math.min(50, Math.max(1, n)) })
  }

  const saveStill = () => {
    const n = Math.round(Number(still))
    if (!view || !Number.isFinite(n) || n === view.settings.stagnation) {
      setStill(String(view.settings.stagnation))
      return
    }
    void save({ stagnation: Math.min(50, Math.max(0, n)) })
  }

  const handleWorldTurn = async () => {
    const r = await runWorld(chatId, false)
    if (!r) return
    if (r.ok === false) toast.error(r.error || t('world.failed'))
    else if (r.skipped === 'nothing new') toast.info(t('world.nothingNew'))
    else if (r.skipped === 'explicit') toast.warning(t('world.explicitWait'))
    else toast.success(r.changes ? t('world.changed', { n: r.changes }) : t('world.unchanged'))
  }

  const startReadAll = async () => {
    if (reading) return
    stopReadRef.current = false
    const total = view.behind.runs
    setReadTotal(total)
    setReadDone(0)
    setReading(true)
    const { runs, error } = await readWholeChat(
      chatId,
      (_left, done) => setReadDone(done),
      () => stopReadRef.current,
    )
    setReading(false)
    if (error) toast.error(t('world.readFailed', { n: runs, message: error }))
    else if (stopReadRef.current) toast.info(t('world.readStopped', { n: runs }))
    else toast.success(t('world.readDone', { n: runs }))
    stopReadRef.current = false
  }

  const pickModel = async (ref: string) => {
    try {
      await saveWorldConfig({ model: ref })
      await loadWorld(chatId)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setModelPickerOpen(false)
    }
  }

  const clearModel = async () => {
    try {
      await saveWorldConfig({ model: '' })
      await loadWorld(chatId)
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const lookAtWorld = async () => {
    if (!(await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false }))) return
    try {
      setRecords(await peekWorld(chatId))
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const level = view.settings.level
  const on = level !== 'off'
  const levels = (view.ready ?? ['off', 'chronicler']) as WorldLevel[]
  const events = EVENT_LEVELS.includes(level)

  const levelSection = (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('world.level')}</h3>
      <div role="radiogroup" aria-label={t('world.level')} className="flex flex-col gap-2">
        {levels.map((l) => {
          const picked = level === l
          const Icon = LEVEL_ICON[l]
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => {
                if (!picked) void save({ level: l })
              }}
              className={cn(
                'flex min-h-11 items-start gap-2 rounded-md border p-2.5 text-left transition-colors',
                picked ? LEVEL_TONE[l].picked : 'border-border hover:bg-accent/60',
              )}
            >
              <Icon
                className={cn('mt-0.5 size-4 shrink-0', picked ? LEVEL_TONE[l].icon : 'text-muted-foreground')}
                weight={picked ? 'fill' : 'regular'}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', picked && LEVEL_TONE[l].icon)}>
                  {t(`world.level.${l}` as MsgKey)}
                </span>
                <span className="block text-xs text-muted-foreground">{t(`world.level.${l}.hint` as MsgKey)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )

  const scheduleSection = (
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEvery()
          }}
          className="h-10 w-20 text-right md:h-8"
        />
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        {on ? (view.dueIn > 0 ? t('world.dueIn', { n: view.dueIn }) : t('world.dueNow')) : t('world.offHint')}
      </p>
      <Button onClick={() => void handleWorldTurn()} disabled={!on || running || reading} className="max-md:h-10">
        <GlobeHemisphereWest className="size-4" aria-hidden="true" />
        {running ? t('world.running') : t('world.turn')}
      </Button>
      {!on && <p className="-mt-1 text-xs text-muted-foreground">{t('world.turnOff')}</p>}

      {on && view.behind.messages > 0 && !reading && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-2.5">
          <p className="text-xs text-muted-foreground">{t('world.behind', { n: view.behind.messages })}</p>
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            disabled={reading}
            onClick={() => void startReadAll()}
          >
            {t('world.readAll', { k: view.behind.runs })}
          </Button>
        </div>
      )}

      {reading && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-2.5">
          <p className="text-xs text-muted-foreground">
            {t('world.readProgress', {
              done: Math.min(readDone + 1, Math.max(readTotal, readDone + 1)),
              total: readTotal,
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => {
              stopReadRef.current = true
            }}
          >
            {t('world.readStop')}
          </Button>
        </div>
      )}
    </section>
  )

  const moreSection = on && (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <h3 className="text-sm font-medium">{t('world.more')}</h3>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">
          {t('world.still')}
          <span className="block text-xs text-muted-foreground">{view.sensor ? t('world.stillHint') : t('world.noSensor')}</span>
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          value={still}
          disabled={!view.sensor}
          onChange={(e) => setStill(e.target.value)}
          onBlur={saveStill}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveStill()
          }}
          className="h-10 w-20 shrink-0 text-right md:h-8"
        />
      </label>
      <SwitchRow
        label={t('world.transition')}
        hint={view.sensor ? t('world.transitionHint') : t('world.noSensor')}
        checked={view.settings.onTransition}
        disabled={!view.sensor}
        onChange={(v) => void save({ onTransition: v })}
      />
      {events && (
        <SwitchRow label={t('world.insert')} hint={t('world.insertHint')} checked={view.settings.insert} onChange={(v) => void save({ insert: v })} />
      )}
    </section>
  )

  const statusSection = (
    <section className="flex flex-col gap-1 text-sm" aria-live="polite">
      <h3 className="font-medium">{t('world.status')}</h3>
      <p className="text-muted-foreground">{t('world.records', { n: view.records, r: view.retired })}</p>
      {events && (
        <p className="text-muted-foreground">
          {t('world.fronts', { n: view.fronts })} {view.eventWaiting ? t('world.eventWaiting') : ''}
        </p>
      )}
      {view.direction && (
        <p className="text-muted-foreground">
          {t('world.direction', { d: t(`world.dir.${view.direction}` as MsgKey) })}
        </p>
      )}
      {view.lastRunAt ? (
        <p className="text-muted-foreground">
          {t('world.lastRun', { when: relativeTime(view.lastRunAt) })}
          {view.lastSummary ? `: ${view.lastSummary}` : ''}
        </p>
      ) : (
        <p className="text-muted-foreground">{t('world.neverRan')}</p>
      )}

      {view.lastRun?.usage && (
        <p className="text-muted-foreground">
          {t('world.usage.last', {
            in: formatK(view.lastRun.usage.input),
            out: formatK(view.lastRun.usage.output),
            cost: view.lastRun.usage.cost > 0 ? ` · ${formatMoney(view.lastRun.usage.cost)}` : '',
            sec: formatSeconds(view.lastRun.ms),
          })}
        </p>
      )}
      {view.usage.runs > 0 && (
        <p className="text-muted-foreground">
          {t('world.usage.total', {
            runs: view.usage.runs,
            tokens: formatK(view.usage.input + view.usage.output),
          })}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t('world.hidden')}</p>
      {view.records + view.retired > 0 && (
        <Button variant="outline" size="sm" className="mt-1 self-start max-md:h-10" onClick={() => void lookAtWorld()}>
          {t('world.peek')}
        </Button>
      )}
    </section>
  )

  const modelSection = (
    <section id={`world-model-${where}`} ref={modelSectionRef} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('world.model')}</h3>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('world.modelNow')}</span>
        <span className="break-all font-mono text-xs">{view.play?.model || t('world.chatModel')}</span>
        {view.play && <span className="text-xs text-muted-foreground">{t(FROM_KEY[view.play.from])}</span>}
      </div>
      {where === 'sheet' ? (
        <div className="flex flex-wrap items-center gap-2">
          <SoulModelPicker
            label={t('dash.set.chooseModel')}
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            onPick={(ref) => void pickModel(ref)}
          />
          {view.play?.from === 'world' && (
            <Button size="sm" variant="ghost" onClick={() => void clearModel()}>
              {t('dash.set.useChatModel')}
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onOpenSettings?.()}>
          {t('world.settings.open')}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t('world.modelHint')}</p>
    </section>
  )

  const errorCard = view.lastError && (
    <WorldErrorCard
      error={view.lastError}
      model={view.play?.model}
      busy={running || reading}
      onRetry={() => void handleWorldTurn()}
      onPickModel={() => {
        if (where === 'sheet') {
          modelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          setModelPickerOpen(true)
        } else {
          onOpenSettings?.()
        }
      }}
      className={cn(wide && 'lg:col-span-2')}
    />
  )

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-5',
          wide && 'lg:grid lg:grid-cols-2 lg:items-start',
        )}
      >
        {errorCard}
        <div className="flex flex-col gap-5">{levelSection}</div>
        <div className="flex flex-col gap-5">
          {scheduleSection}
          {moreSection}
          {statusSection}
          {modelSection}
        </div>
      </div>
      {confirmDialog}
      <Dialog open={records !== null} onOpenChange={(o) => { if (!o) setRecords(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('world.peekTitle')}</DialogTitle>
            <DialogDescription>{t('world.peekLead')}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {(records ?? []).map((r) => (
              <li key={r.id} className={cn('rounded-md border border-border p-2.5 text-sm', r.status === 'past' && 'opacity-70')}>
                <p className="font-medium">
                  {r.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t(`world.kind.${r.kind}` as MsgKey)}
                    {r.status === 'past' ? ` · ${t('world.past')}` : ''}
                  </span>
                </p>
                {r.aliases.length > 0 && <p className="text-xs text-muted-foreground">{r.aliases.join(', ')}</p>}
                <p className="mt-1 text-muted-foreground">{r.text}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
