import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, Clock, GlobeHemisphereWest, Sparkle, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Fold } from '@/components/ui/fold'
import { Section, Chip } from '@/components/ui/section'
import { NumControl, Segmented, SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { TONES } from '@/components/ui/tone'
import { DiceFields } from './dice-fields'
import { DiceLog } from './dice-log'
import { SoFarTiles } from './world-so-far'
import { addsChips, limitsSummary, scheduleChips, writesChips } from './world-summaries'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { useWorldProfiles } from '@/lib/world-profiles'
import { WorldProfilePicker } from './world-profile-picker'
import { SaveWorldDialog } from './world-library'
import { NewWorldChatDialog, useChatCharacterId } from './world-new-chat'
import { DeckLine } from './world-start'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import {
  formatK,
  formatMoney,
  formatSeconds,
  useWorldErrorText,
  NEEDS_CONNECTIONS,
  FROM_KEY,
} from './world-common'
import {
  loadWorld,
  loadWorldScenario,
  peekWorld,
  refreshDice,
  readWholeChat,
  runWorld,
  saveWorldConfig,
  saveWorldSettings,
  setWorldOverride,
  useWorldLive,
  type WorldError,
  type WorldLevel,
  type WorldRecord,
  type WorldScenario,
  type WorldView,
} from '@/lib/world'
import type { MsgKey } from '@/lib/i18n'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const EVENT_LEVELS: WorldLevel[] = ['living', 'director', 'antagonist', 'chaos']

/** The DM's own words about its last run: the text colour, a left rule, four lines unless opened. */
function RunSummary({ text }: { text: string }) {
  const t = useT()
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])
  return (
    <div className="border-l-2 border-primary/40 pl-3" data-testid="world-summary">
      <p ref={ref} className={cn('break-words text-body text-foreground', !open && 'line-clamp-4')}>{text}</p>
      {(long || open) && (
        <button type="button" className="mt-1 text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('world.summary.less') : t('world.summary.more')}
        </button>
      )}
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
          {again && <p className="text-caption text-muted-foreground">{t('world.err.again')}</p>}
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
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 font-mono text-caption">
          {error.details}
        </pre>
      )}
    </div>
  )
}

/** The square before a plain heading, in the tone's colour. */
function HeadingMark({ tone }: { tone: keyof typeof TONES }) {
  return <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-sm', TONES[tone].square)} />
}

export function WorldControls({
  chatId,
  where,
  onOpenSettings,
  onNavigate,
  wide,
}: {
  chatId: string
  where: 'sheet' | 'hub'
  onOpenSettings?: () => void
  /** called before the controls send the player elsewhere (the sheet closes itself) */
  onNavigate?: () => void
  wide?: boolean
}) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const view = useWorldLive((s) => s.views[chatId])
  const profiles = useWorldProfiles((s) => s.list)
  const running = useWorldLive((s) => !!s.running[chatId])
  const [missing, setMissing] = useState(false)
  const [records, setRecords] = useState<WorldRecord[] | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [own, setOwn] = useState<WorldScenario | null>(null)
  const chatTitle = useApp((s) => s.chats.find((c) => c.id === chatId)?.title ?? '')
  const chatCharId = useChatCharacterId(chatId)
  // the chat's own scenario: read again when the opening dialog closes
  const openingOpen = useApp((s) => !!s.worldOpening)
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
    if (openingOpen) return
    let live = true
    loadWorldScenario(chatId).then((r) => { if (live) setOwn(r.scenario) }).catch(() => {})
    return () => { live = false }
  }, [chatId, openingOpen])

  if (missing) {
    return <p className="text-body text-muted-foreground">{t('world.missing')}</p>
  }
  if (!view) {
    return <p className="text-body text-muted-foreground">{t('chats.panel.loading')}</p>
  }

  const save = async (patch: Partial<WorldView['settings']>) => {
    try {
      await saveWorldSettings(chatId, patch)
    } catch (e) {
      toast.error(errText(e))
    }
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

  const useCardScenario = async () => {
    if (!(await confirm({ title: t('world.open.useCardTitle'), description: t('world.open.useCardWarn'), actionLabel: t('world.open.useCard'), destructive: false }))) return
    try {
      await setWorldOverride(chatId, { scenario: null })
      setOwn(null)
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

  const inForce = profiles?.find((p) => p.id === view.profile)

  const profileSection = (
    <WorldProfilePicker
      on={on}
      profileId={view.profile}
      ready={levels}
      onToggle={(v) => void save(v ? { profile: 'chronicler' } : { level: 'off' })}
      onPick={(id) => void save({ profile: id })}
      onEdit={(id) => {
        onNavigate?.()
        useApp.getState().focusWorldProfile(id)
      }}
    />
  )

  // Card 1: when the DM runs. Off: dimmed, every control disabled (the reason is the note).
  const whenCard = (
    <Section
      variant="tinted"
      tone="sky"
      icon={Clock}
      id="when"
      title={t('world.card.when')}
      chips={scheduleChips(t, { everyN: view.settings.everyN, dueIn: view.dueIn })}
      dimmed={!on}
      note={on ? undefined : t('world.card.offWhen')}
    >
      {on && view.behind.messages > 0 && !reading && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-4 py-3">
          <p className="min-w-0 text-caption text-muted-foreground">{t('world.behind', { n: view.behind.messages })}</p>
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={reading} onClick={() => void startReadAll()}>
            {t('world.readAll', { k: view.behind.runs })}
          </Button>
        </div>
      )}

      {reading && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-4 py-3">
          <p className="min-w-0 text-caption text-muted-foreground">
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

      <SettingRow
        label={t('world.everyN')}
        info={on && inForce ? t('world.profile.default', { n: inForce.defaults.everyN }) : undefined}
        status={on ? (view.dueIn > 0 ? t('world.dueIn', { n: view.dueIn }) : t('world.dueNow')) : t('world.offHint')}
      >
        <NumControl label={t('world.everyN')} value={view.settings.everyN} min={1} max={50} disabled={!on} onCommit={(n) => void save({ everyN: n })} />
      </SettingRow>

      <div className="px-4 py-3">
        <Button size="lg" className="w-full" onClick={() => void handleWorldTurn()} disabled={!on || running || reading}>
          <GlobeHemisphereWest className="size-4" aria-hidden="true" />
          {running ? t('world.running') : t('world.turn')}
        </Button>
        {!on && <p className="mt-2 text-caption text-muted-foreground">{t('world.turnOff')}</p>}
      </div>

      <SettingRow label={t('world.still')} info={view.sensor ? t('world.stillHint') : t('world.noSensor')}>
        <NumControl label={t('world.still')} value={view.settings.stagnation} min={0} max={50} disabled={!on || !view.sensor} onCommit={(n) => void save({ stagnation: n })} />
      </SettingRow>
      <SettingRow label={t('world.transition')} info={view.sensor ? t('world.transitionHint') : t('world.noSensor')}>
        <Switch checked={view.settings.onTransition} disabled={!on || !view.sensor} onCheckedChange={(v) => void save({ onTransition: v })} aria-label={t('world.transition')} />
      </SettingRow>
      <SettingRow label={t('world.place')} info={view.sensor ? t('world.placeHint') : t('world.noSensor')}>
        <Switch checked={view.settings.onPlace} disabled={!on || !view.sensor} onCheckedChange={(v) => void save({ onPlace: v })} aria-label={t('world.place')} />
      </SettingRow>
    </Section>
  )

  // Card 2: what the DM writes. Never dimmed: the sweep still writes records with the DM off.
  const writesCard = (
    <Section
      variant="tinted"
      tone="emerald"
      icon={BookOpen}
      id="writes"
      title={t('world.card.writes')}
      chips={writesChips(t, { recordsEveryN: view.settings.recordsEveryN, textMax: view.settings.textMax })}
    >
      <SettingRow label={t('world.recordsEvery')} info={t('world.recordsEveryHint')}>
        <NumControl label={t('world.recordsEvery')} value={view.settings.recordsEveryN} min={0} max={50} onCommit={(n) => void save({ recordsEveryN: n })} />
      </SettingRow>
      <SettingRow
        label={t('world.carry.from')}
        info={
          <>
            <p><strong className="text-foreground">{t('world.carry.sensor')}.</strong> {t('world.carry.sensorHint')}</p>
            <p><strong className="text-foreground">{t('world.carry.dm')}.</strong> {t('world.carry.dmHint')}</p>
            <p>{t('world.carry.next')}</p>
          </>
        }
      >
        <Segmented
          label={t('world.carry.label')}
          value={view.settings.carrySource ?? 'sensor'}
          options={[{ id: 'sensor', label: t('world.carry.sensor') }, { id: 'dm', label: t('world.carry.dm') }]}
          onChange={(v) => void save({ carrySource: v })}
        />
      </SettingRow>
      <Fold
        id="limits"
        title={t('world.fold.limits')}
        summary={limitsSummary(t, { textMax: view.settings.textMax, changesMax: view.settings.changesMax })}
        flat
      >
        <SettingRow label={t('world.textMax')} info={t('world.textMaxHint')}>
          <NumControl label={t('world.textMax')} value={view.settings.textMax} min={200} max={3000} step={100} onCommit={(n) => void save({ textMax: n })} />
        </SettingRow>
        <SettingRow label={t('world.changesMax')} info={t('world.changesMaxHint')}>
          <NumControl label={t('world.changesMax')} value={view.settings.changesMax} min={4} max={20} onCommit={(n) => void save({ changesMax: n })} />
        </SettingRow>
      </Fold>
    </Section>
  )

  // Card 3: events and dice. Shown at an event level, and (dimmed) while the DM is off; hidden at a level without events.
  const addsCard = (events || !on) && (
    <Section
      variant="tinted"
      tone="violet"
      icon={Sparkle}
      id="adds"
      title={t('world.card.adds')}
      chips={addsChips(t, { insert: view.settings.insert, dice: view.dice?.mode })}
      dimmed={!on}
      note={on ? undefined : t('world.card.offAdds')}
    >
      <SettingRow label={t('world.insert')} info={t('world.insertHint')}>
        <Switch checked={view.settings.insert} disabled={!on} onCheckedChange={(v) => void save({ insert: v })} aria-label={t('world.insert')} />
      </SettingRow>
      {view.dice && (
        <DiceFields
          mode={view.dice.mode}
          stat={view.dice.stat}
          chance={view.dice.chance}
          tilt={view.dice.tilt}
          life={view.dice.life}
          show={view.settings.diceShow}
          disabled={!on}
          onShow={(v) => void save({ diceShow: v }).then(() => refreshDice(chatId, true))}
          onChange={(p) => void save({ ...(p.dice ? { dice: p.dice } : {}), ...(p.diceStat ? { diceStat: p.diceStat } : {}), ...(p.diceChance ? { diceChance: p.diceChance } : {}), ...(p.diceTilt ? { diceTilt: p.diceTilt } : {}), ...(p.diceLife !== undefined ? { diceLife: p.diceLife } : {}) })}
        >
          <DiceLog chatId={chatId} />
        </DiceFields>
      )}
    </Section>
  )

  const soFarSection = (
    <section className="flex flex-col gap-3" aria-live="polite">
      <h3 className="flex items-center gap-2 text-heading font-semibold">
        <HeadingMark tone="sky" />
        {t('world.status')}
      </h3>
      <SoFarTiles records={view.records} retired={view.retired} fronts={events ? view.fronts : undefined} runs={view.usage.runs} />
      {((view.direction) || (events && view.eventWaiting)) && (
        <div className="flex flex-wrap gap-1.5">
          {view.direction && <Chip tone="sky">{t('world.direction', { d: t(`world.dir.${view.direction}` as MsgKey) })}</Chip>}
          {events && view.eventWaiting && <Chip tone="amber">{t('world.eventWaiting')}</Chip>}
        </div>
      )}
      {view.lastRunAt ? (
        <div className="flex flex-col gap-2" data-testid="world-last-run">
          <div className="flex flex-col gap-0.5">
            <p className="text-caption text-muted-foreground">{t('world.lastRun', { when: relativeTime(view.lastRunAt) })}</p>
            {view.lastRun?.usage && (
              <p className="text-caption text-muted-foreground">
                {t('world.usage.last', {
                  in: formatK(view.lastRun.usage.input),
                  out: formatK(view.lastRun.usage.output),
                  cost: view.lastRun.usage.cost > 0 ? ` · ${formatMoney(view.lastRun.usage.cost)}` : '',
                  sec: formatSeconds(view.lastRun.ms),
                })}
              </p>
            )}
          </div>
          {view.lastSummary && <RunSummary text={view.lastSummary} />}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">{t('world.neverRan')}</p>
      )}
      {view.usage.runs > 0 && (
        <p className="text-caption text-muted-foreground">
          {t('world.usage.total', { runs: view.usage.runs, tokens: formatK(view.usage.input + view.usage.output) })}
        </p>
      )}

      <DeckLine chatId={chatId} view={view} where="overview" />
      {own && (
        <Card variant="padded" className="flex-row flex-wrap items-center gap-2 p-3" data-testid="own-scenario">
          <span className="min-w-0 flex-1 text-body">{t('world.open.own')}</span>
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => useApp.getState().openWorldOpening(chatId, false)}>{t('world.open.edit')}</Button>
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => void useCardScenario()}>{t('world.open.useCard')}</Button>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {view.records > 0 && (
          <Button variant="tonal" size="sm" className="max-md:h-10" onClick={() => setNewChatOpen(true)} data-testid="overview-new-chat">
            {t('world.newchat.btn')}
          </Button>
        )}
        {view.records > 0 && (
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setSaveOpen(true)} data-testid="save-world">
            {t('world.save.btn')}
          </Button>
        )}
        {view.records + view.retired > 0 && (
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => void lookAtWorld()}>
            {t('world.peek')}
          </Button>
        )}
      </div>
      <p className="text-caption text-muted-foreground">{t('world.hidden')}</p>
    </section>
  )

  const modelSection = (
    <section id={`world-model-${where}`} ref={modelSectionRef} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-heading font-semibold">
        <HeadingMark tone="slate" />
        {t('world.model')}
      </h3>
      <Card variant="padded" className="gap-1 py-3">
        <span className="text-caption text-muted-foreground">{t('world.modelNow')}</span>
        <span className="break-all font-mono text-caption">{view.play?.model || t('world.chatModel')}</span>
        {view.play && <span className="text-caption text-muted-foreground">{t(FROM_KEY[view.play.from])}</span>}
      </Card>
      {where === 'sheet' ? (
        <div className="flex flex-wrap items-center gap-2">
          <SoulModelPicker
            label={t('dash.set.chooseModel')}
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            onPick={(ref) => void pickModel(ref)}
          />
          {view.play?.from === 'world' && (
            <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => void clearModel()}>
              {t('dash.set.useChatModel')}
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => onOpenSettings?.()}>
          {t('world.settings.open')}
        </Button>
      )}
      <p className="text-caption text-muted-foreground">{t('world.modelHint')}</p>
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
    />
  )

  // Phone and sheet: one column, in the order profile, the three cards, So far, model. Hub (wide, >= lg): the cards in the
  // right column, the rest in the left one.
  return (
    <>
      <div className="flex flex-col gap-5">
        {errorCard}
        <div className={cn('flex flex-col gap-5', wide && 'lg:grid lg:grid-cols-2 lg:items-start')}>
          <div className={cn('flex flex-col', wide && 'lg:col-start-1 lg:row-start-auto')}>{profileSection}</div>
          <div className={cn('flex flex-col gap-5', wide && 'lg:col-start-2 lg:row-span-3 lg:row-start-1')}>
            {whenCard}
            {writesCard}
            {addsCard}
          </div>
          <div className={cn('flex flex-col', wide && 'lg:col-start-1 lg:row-start-auto')}>{soFarSection}</div>
          <div className={cn('flex flex-col', wide && 'lg:col-start-1 lg:row-start-auto')}>{modelSection}</div>
        </div>
      </div>
      {confirmDialog}
      <SaveWorldDialog open={saveOpen} onOpenChange={setSaveOpen} chatId={chatId} defaultName={chatTitle} />
      <NewWorldChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        source={{ fromChatId: chatId }}
        defaultCharId={chatCharId}
        onCreate={onNavigate}
      />
      <Dialog open={records !== null} onOpenChange={(o) => { if (!o) setRecords(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('world.peekTitle')}</DialogTitle>
            <DialogDescription>{t('world.peekLead')}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {(records ?? []).map((r) => (
              <li key={r.id} className={cn('rounded-md border border-border p-2.5 text-body', r.status === 'past' && 'opacity-70')}>
                <p className="font-medium">
                  {r.name}
                  <span className="ml-2 text-caption font-normal text-muted-foreground">
                    {t(`world.kind.${r.kind}` as MsgKey)}
                    {r.status === 'past' ? ` · ${t('world.past')}` : ''}
                  </span>
                </p>
                {r.aliases.length > 0 && <p className="text-caption text-muted-foreground">{r.aliases.join(', ')}</p>}
                <p className="mt-1 text-muted-foreground">{r.text}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
