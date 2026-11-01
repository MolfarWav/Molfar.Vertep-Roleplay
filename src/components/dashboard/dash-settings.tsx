// The dashboard's settings: sensor, event vocabulary, what the model sees, tuning with
// Molfar. It fills the wide drawer and the phone sheet. Settings and vocabulary save
// separately (PUT /dashboard/config, PUT /dashboard/events), so each keeps its own
// unsaved state and one save never discards the other's edits.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, ArrowLeft, CaretDown, CaretRight, Check, Compass, Eye, Plus, Sparkle, Trash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useConfirm } from '@/components/ui/confirm'
import { Fold } from '@/components/ui/fold'
import { Input } from '@/components/ui/input'
import { Chip, Section } from '@/components/ui/section'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumTile, Segmented, SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { ASK_MOLFAR_MAX, askMolfar, canAskMolfar } from '@/lib/shell-bridge'
import { cn, copyText } from '@/lib/utils'
import type { DashView } from '@/lib/dashboard'
import { AgeText, useTx } from './dash-common'
import { howChips, questsChip, remindedChips, summaryChips, type SensorSummaryInput } from './sensor-summary'
import { SoulModelPicker } from './soul-model-picker'

interface VocabRow {
  id: string
  family: string
  meaning: string
  /** only the delta keys, -20..20, zeros omitted */
  deltas: Record<string, number>
  source: 'default' | 'changed' | 'custom'
  off: boolean
}

/** GET /dashboard/config (the plugin's `configBody`). */
interface DashConfig {
  sensorModel: string
  mode: 'sensor' | 'fast' | 'manual'
  families: Record<string, boolean>
  familyList: string[]
  injection: { enabled: boolean; maxTokens: number }
  /** what fast mode adds to every reply, in tokens (about); absent on an older plugin */
  fastTokens?: number
  /** the sensor's reply limit; absent on an older plugin */
  sensorMaxTokens?: number
  catchUp: boolean
  leakCheck?: boolean
  autoSoul: boolean
  sensor: string
  custom: string[]
  deltaKeys: string[]
  events: VocabRow[]
  /** round 3 plugin: absent on an older one */
  maxThreads?: number
  threadCheckEvery?: number
  /** event ids no one could place (#86): absent on an older plugin */
  otherSeen?: OtherSeen[]
  /** quests (#117): absent on an older plugin */
  maxMain?: number
  maxSteps?: number
  everydayTurns?: number
  retireAfter?: number
  sensorMode?: 'parts' | 'whole'
  sensorParts?: { key: string; title: string; text: string; default: string; custom: boolean }[]
  /** 4.34: absent on an older plugin */
  noteAgeTurns?: number
  /** #98: what characters said; absent on an older plugin */
  said?: { perTurn: number; inject: boolean }
  /** #185: where everyone stands, the objects and the clothes in the reply prompt; absent on an older plugin */
  layout?: { inject: boolean }
  soul?: string
  nudge?: string
  nudgeTwist?: string
  fast?: string
}

/** The prompts besides the sensor's, each edited and restored on its own. */
const OTHER_PROMPTS = ['soul', 'nudge', 'nudgeTwist', 'fast'] as const
type OtherPrompt = (typeof OTHER_PROMPTS)[number]

/** The part of the config the Sensor section edits and PUT /dashboard/config takes. */
interface Form {
  sensorModel: string
  mode: 'sensor' | 'fast' | 'manual'
  families: Record<string, boolean>
  injection: { enabled: boolean; maxTokens: number }
  sensorMaxTokens: number
  maxThreads: number
  threadCheckEvery: number
  maxMain: number
  maxSteps: number
  everydayTurns: number
  retireAfter: number
  noteAgeTurns: number
  said: { perTurn: number; inject: boolean }
  layout: { inject: boolean }
  catchUp: boolean
  leakCheck: boolean
  autoSoul: boolean
  /** the whole prompt: only sent in "whole" and legacy mode */
  sensor: string
  /** the prompt's blocks by key: only sent in "parts" mode */
  parts: Record<string, string>
  /** soul, nudge and fast: only sent when the plugin offers them */
  prompts: Partial<Record<OtherPrompt, string>>
}

/** The prompt as the plugin offers it: in blocks, one custom text ("whole"), or an older plugin ("legacy"). */
interface PromptMeta {
  custom: string[]
  sensorMode: 'parts' | 'whole' | 'legacy'
  partList: { key: string; title: string; default: string; custom: boolean }[]
}

/** What the sections need besides the form and the rows. */
/** An event id the sensor used that the vocabulary does not have, and how often (#86). */
export interface OtherSeen { id: string; n: number; at: number; quote: string }
interface Meta extends PromptMeta { familyList: string[]; deltaKeys: string[]; threadCfg: boolean; questCfg: boolean; fastTokens: number | null; otherSeen: OtherSeen[] }

interface Preview {
  insert: { text: string; tokens: number; budget: number; trimmed: string[]; notebookOf: string | null } | null
  speakers: string[]
  checks?: { digits: number; noBlindSpot: boolean; notebookOf: string | null }
}

type Section = 'sensor' | 'events' | 'preview' | 'molfar'
const SECTIONS: Section[] = ['sensor', 'events', 'preview', 'molfar']
const TAB_KEY = 'rp.dashSettingsTab'
const ID_RE = /^[a-z][a-z0-9_]{0,47}$/
const MIN_TOKENS = 50
const MAX_TOKENS = 2000
const MIN_SENSOR_TOKENS = 1000
const MAX_SENSOR_TOKENS = 8000
const DEFAULT_SENSOR_TOKENS = 3000
const DEFAULT_MAX_THREADS = 3
const DEFAULT_THREAD_CHECK = 5
const DEFAULT_MAX_MAIN = 1
const DEFAULT_MAX_STEPS = 4
const DEFAULT_EVERYDAY = 8
const DEFAULT_RETIRE = 3
const DEFAULT_NOTE_AGE = 30
const DEFAULT_SAID = 2
const FIELD = 'rounded-none'

function readTab(): Section {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return SECTIONS.find((s) => s === v) ?? 'sensor'
  } catch { return 'sensor' }
}

function pickForm(c: DashConfig): Form {
  return {
    sensorModel: c.sensorModel ?? '',
    mode: c.mode === 'manual' || c.mode === 'fast' ? c.mode : 'sensor',
    families: Object.fromEntries(c.familyList.map((f) => [f, c.families?.[f] !== false])),
    injection: { enabled: c.injection?.enabled !== false, maxTokens: c.injection?.maxTokens ?? 200 },
    sensorMaxTokens: c.sensorMaxTokens ?? DEFAULT_SENSOR_TOKENS,
    maxThreads: c.maxThreads ?? DEFAULT_MAX_THREADS,
    threadCheckEvery: c.threadCheckEvery ?? DEFAULT_THREAD_CHECK,
    maxMain: c.maxMain ?? DEFAULT_MAX_MAIN,
    maxSteps: c.maxSteps ?? DEFAULT_MAX_STEPS,
    everydayTurns: c.everydayTurns ?? DEFAULT_EVERYDAY,
    retireAfter: c.retireAfter ?? DEFAULT_RETIRE,
    noteAgeTurns: c.noteAgeTurns ?? DEFAULT_NOTE_AGE,
    said: { perTurn: c.said?.perTurn ?? DEFAULT_SAID, inject: c.said?.inject !== false },
    layout: { inject: c.layout?.inject !== false },
    catchUp: c.catchUp !== false,
    leakCheck: c.leakCheck !== false,
    autoSoul: c.autoSoul !== false,
    sensor: c.sensor ?? '',
    parts: Object.fromEntries((c.sensorParts ?? []).map((p) => [p.key, p.text])),
    prompts: Object.fromEntries(OTHER_PROMPTS.filter((k) => typeof c[k] === 'string').map((k) => [k, c[k] as string])),
  }
}

function promptMeta(c: DashConfig): PromptMeta {
  return {
    custom: c.custom ?? [],
    sensorMode: c.sensorParts ? (c.sensorMode === 'whole' ? 'whole' : 'parts') : 'legacy',
    partList: (c.sensorParts ?? []).map((p) => ({ key: p.key, title: p.title, default: typeof p.default === 'string' ? p.default : '', custom: !!p.custom })),
  }
}

const clampTokens = (n: number) => Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Math.round(Number.isFinite(n) ? n : MIN_TOKENS)))
const clampSensorTokens = (n: number) => Math.min(MAX_SENSOR_TOKENS, Math.max(MIN_SENSOR_TOKENS, Math.round(Number.isFinite(n) ? n : DEFAULT_SENSOR_TOKENS)))
const clampThreads = (n: number) => Math.min(6, Math.max(1, Math.round(Number.isFinite(n) ? n : DEFAULT_MAX_THREADS)))
const clampNoteAge = (n: number) => Math.min(500, Math.max(5, Math.round(Number.isFinite(n) ? n : DEFAULT_NOTE_AGE)))
const clampSaid = (n: number) => Math.min(4, Math.max(1, Math.round(Number.isFinite(n) ? n : DEFAULT_SAID)))
const clampCheck =(n: number) => Math.min(50, Math.max(0, Math.round(Number.isFinite(n) ? n : DEFAULT_THREAD_CHECK)))
const clampTo = (lo: number, hi: number, dflt: number) => (n: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : dflt)))
const clampMain = clampTo(1, 2, DEFAULT_MAX_MAIN)
const clampSteps = clampTo(1, 6, DEFAULT_MAX_STEPS)
const clampEveryday = clampTo(0, 30, DEFAULT_EVERYDAY)
const clampRetire = clampTo(0, 10, DEFAULT_RETIRE)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The rows PUT /dashboard/events takes: only what differs from the defaults. */
function eventsPayload(rows: VocabRow[]) {
  return rows
    .filter((r) => r.source !== 'default' || r.off)
    .map(({ id, family, meaning, deltas, off }) => (off
      ? { id, off: true }
      : { id, family, meaning, deltas: Object.fromEntries(Object.entries(deltas).sort(([a], [b]) => a.localeCompare(b))) }))
}

export function DashSettings({ chatId, view, onBack, onSaved, onDirty }: {
  chatId: string
  view: DashView | null
  onBack: () => void
  onSaved?: () => void
  /** true while the Sensor or Vocabulary section has unsaved edits: the mount asks before it closes this view */
  onDirty?: (dirty: boolean) => void
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [section, setSectionState] = useState<Section>(readTab)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [formBase, setFormBase] = useState<Form | null>(null)
  const [rows, setRows] = useState<VocabRow[]>([])
  const [rowsBase, setRowsBase] = useState<VocabRow[]>([])
  const [saving, setSaving] = useState(false)

  const setSection = (s: Section) => {
    setSectionState(s)
    try { localStorage.setItem(TAB_KEY, s) } catch { /* private mode */ }
  }

  /**
   * Take the server's config as the new truth for the parts named. A save passes what it
   * sent: edits typed while it ran stay in the form and stay unsaved against the new base.
   */
  const apply = useCallback((c: DashConfig, what: { form?: boolean; rows?: boolean; sentForm?: Form; sentRows?: VocabRow[] }) => {
    setMeta({ familyList: c.familyList ?? [], deltaKeys: c.deltaKeys ?? [], threadCfg: c.maxThreads !== undefined, questCfg: c.maxMain !== undefined, otherSeen: c.otherSeen ?? [], fastTokens: typeof c.fastTokens === 'number' ? c.fastTokens : null, ...promptMeta(c) })
    if (what.form) {
      const f = pickForm(c)
      setFormBase(f)
      setForm((cur) => (what.sentForm && cur && !same(cur, what.sentForm) ? cur : f))
    }
    if (what.rows) {
      const r = c.events ?? []
      setRowsBase(r)
      setRows((cur) => (what.sentRows && !same(cur, what.sentRows) ? cur : r))
    }
  }, [])

  const load = useCallback(async () => {
    setFailed(false)
    try { apply(await j<DashConfig>('/dashboard/config'), { form: true, rows: true }) } catch { setFailed(true) }
  }, [apply])
  useEffect(() => { void load() }, [load])

  const fail = (e: unknown) => toast.error(t('dash.set.error', { message: String((e as Error)?.message ?? e) }))

  const saveForm = async () => {
    if (!form) return
    setSaving(true)
    try {
      const { sensor, parts, prompts, ...rest } = form
      const body = {
        ...rest,
        ...prompts,
        noteAgeTurns: clampNoteAge(form.noteAgeTurns),
        said: { ...form.said, perTurn: clampSaid(form.said.perTurn) },
        injection: { ...form.injection, maxTokens: clampTokens(form.injection.maxTokens) },
        sensorMaxTokens: clampSensorTokens(form.sensorMaxTokens),
        maxThreads: clampThreads(form.maxThreads),
        threadCheckEvery: clampCheck(form.threadCheckEvery),
        maxMain: clampMain(form.maxMain),
        maxSteps: clampSteps(form.maxSteps),
        everydayTurns: clampEveryday(form.everydayTurns),
        retireAfter: clampRetire(form.retireAfter),
        // blocks, or the one custom text: never both (a whole prompt would shadow the blocks)
        ...(meta?.sensorMode === 'parts' ? { sensorParts: parts } : { sensor }),
      }
      apply(await j<DashConfig>('/dashboard/config', { method: 'PUT', body: JSON.stringify(body) }), { form: true, sentForm: form })
      toast.success(t('dash.set.saved'))
      onSaved?.()
    } catch (e) { fail(e) } finally { setSaving(false) }
  }

  /** The insert limit from the "What the model sees" section: saved at once, the rest of the form untouched. */
  const saveInsertLimit = async (n: number): Promise<boolean> => {
    try {
      const c = await j<DashConfig>('/dashboard/config', { method: 'PUT', body: JSON.stringify({ injection: { maxTokens: n } }) })
      const next = c.injection?.maxTokens ?? n
      const was = formBase?.injection.maxTokens
      setFormBase((f) => (f ? { ...f, injection: { ...f.injection, maxTokens: next } } : f))
      setForm((f) => (f && f.injection.maxTokens === was ? { ...f, injection: { ...f.injection, maxTokens: next } } : f))
      toast.success(t('dash.set.saved'))
      onSaved?.()
      return true
    } catch (e) { fail(e); return false }
  }

  /** Only the prompt comes back to default: the other unsaved edits stay. */
  const restorePrompts = async () => {
    try {
      // the sensor's prompt only (its blocks or its whole text): the other prompts restore on their own
      const c = await j<DashConfig>('/dashboard/config/prompts?key=sensor', { method: 'DELETE' })
      const f = pickForm(c)
      setForm((cur) => (cur ? { ...cur, sensor: f.sensor, parts: f.parts } : cur))
      setFormBase((cur) => (cur ? { ...cur, sensor: f.sensor, parts: f.parts } : cur))
      setMeta((m) => (m ? { ...m, ...promptMeta(c) } : m))
      toast.success(t('dash.set.promptsRestored'))
    } catch (e) { fail(e) }
  }

  const restorePart = async (key: string) => {
    try {
      const c = await j<DashConfig>(`/dashboard/config/prompts?part=${encodeURIComponent(key)}`, { method: 'DELETE' })
      const text = c.sensorParts?.find((p) => p.key === key)?.text
      if (text !== undefined) {
        setForm((cur) => (cur ? { ...cur, parts: { ...cur.parts, [key]: text } } : cur))
        setFormBase((cur) => (cur ? { ...cur, parts: { ...cur.parts, [key]: text } } : cur))
      }
      setMeta((m) => (m ? { ...m, ...promptMeta(c) } : m))
      toast.success(t('dash.set.promptsRestored'))
    } catch (e) { fail(e) }
  }

  /** One of the other prompts back to its default: the other unsaved edits stay. */
  const restorePrompt = async (key: OtherPrompt) => {
    try {
      const c = await j<DashConfig>(`/dashboard/config/prompts?key=${key}`, { method: 'DELETE' })
      const text = c[key]
      if (typeof text === 'string') {
        setForm((cur) => (cur ? { ...cur, prompts: { ...cur.prompts, [key]: text } } : cur))
        setFormBase((cur) => (cur ? { ...cur, prompts: { ...cur.prompts, [key]: text } } : cur))
      }
      setMeta((m) => (m ? { ...m, ...promptMeta(c) } : m))
      toast.success(t('dash.set.promptsRestored'))
    } catch (e) { fail(e) }
  }

  /** A whole custom prompt cannot be cut into blocks by code: starting over from the default blocks is the way. */
  const splitPrompt = async () => {
    if (!(await confirm({ title: t('dash.set.splitTitle'), description: t('dash.set.splitBody'), actionLabel: t('dash.set.split') }))) return
    await restorePrompts()
  }

  const saveRows = async () => {
    setSaving(true)
    try {
      const c = await j<DashConfig & { skipped?: number }>('/dashboard/events', { method: 'PUT', body: JSON.stringify({ events: eventsPayload(rows) }) })
      apply(c, { rows: true, sentRows: rows })
      onSaved?.()
      if (c.skipped && c.skipped > 0) toast.warning(t('dash.set.skipped', { n: c.skipped }))
      else toast.success(t('dash.set.saved'))
    } catch (e) { fail(e) } finally { setSaving(false) }
  }

  /** Back to the default for one row: saved at once, from the rows as last saved. */
  const resetRow = async (id: string) => {
    try {
      const c = await j<DashConfig>('/dashboard/events', { method: 'PUT', body: JSON.stringify({ events: eventsPayload(rowsBase.filter((r) => r.id !== id)) }) })
      const fresh = c.events.find((r) => r.id === id)
      setRows((cur) => (fresh ? cur.map((r) => (r.id === id ? fresh : r)) : cur))
      setRowsBase(c.events)
      onSaved?.()
    } catch (e) { fail(e) }
  }

  const ignoreSeen = async (id?: string) => {
    try {
      const r = await j<{ otherSeen?: OtherSeen[] }>('/dashboard/other-seen', { method: 'DELETE', body: JSON.stringify(id ? { id } : {}) })
      setMeta((m) => (m ? { ...m, otherSeen: r.otherSeen ?? [] } : m))
    } catch (e) { fail(e) }
  }

  const restoreAllRows = async () => {
    if (!(await confirm({ title: t('dash.set.restoreAllTitle'), description: t('dash.set.restoreAllBody'), actionLabel: t('dash.set.restoreAll') }))) return
    try {
      apply(await j<DashConfig>('/dashboard/events', { method: 'DELETE' }), { rows: true })
      toast.success(t('dash.set.restored'))
      onSaved?.()
    } catch (e) { fail(e) }
  }

  const dirty = !!form && !!formBase && (!same(form, formBase) || !same(eventsPayload(rows), eventsPayload(rowsBase)))
  useEffect(() => { onDirty?.(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty?.(false), [onDirty])

  let body: ReactNode
  if (failed) {
    body = (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
        <span>{t('dash.set.loadError')}</span>
        <Button size="sm" variant="outline" className={FIELD} onClick={() => { void load() }}>{t('dash.live.retry')}</Button>
      </div>
    )
  } else if (!meta || !form || !formBase) {
    body = <div className="p-4 text-sm text-muted-foreground">{t('dash.set.loading')}</div>
  } else if (section === 'sensor') {
    body = (
      <SensorSection
        meta={meta} form={form} setForm={setForm} view={view} saving={saving}
        dirty={!same(form, formBase)} onSave={saveForm} onRestorePrompts={restorePrompts} onRestorePart={restorePart} onRestorePrompt={restorePrompt} onSplit={splitPrompt}
      />
    )
  } else if (section === 'events') {
    body = (
      <EventsSection
        meta={meta} rows={rows} setRows={setRows} saving={saving} onIgnore={ignoreSeen}
        dirty={!same(eventsPayload(rows), eventsPayload(rowsBase))} onSave={saveRows} onReset={resetRow} onRestoreAll={restoreAllRows}
      />
    )
  } else if (section === 'preview') {
    body = <PreviewSection chatId={chatId} injectionOn={formBase.injection.enabled} limit={formBase.injection.maxTokens} onSaveLimit={saveInsertLimit} />
  } else {
    body = <MolfarSection form={form} rows={rows} />
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2 pr-12">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t('dash.set.back')} title={t('dash.set.back')} className={FIELD}>
          <ArrowLeft />
        </Button>
        <h2 className="min-w-0 truncate font-heading text-heading">{t('dash.set.title')}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:overflow-x-visible md:border-r md:border-b-0 md:p-3">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-current={s === section ? 'page' : undefined}
              className={`${cn(
                "relative min-h-11 shrink-0 rounded-lg px-3 text-left font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:whitespace-normal",
                s === section
                  ? "bg-accent font-semibold text-foreground before:absolute before:rounded-sm before:bg-cta before:content-[''] before:max-md:inset-x-3 before:max-md:bottom-0 before:max-md:h-[3px] md:before:inset-y-2.5 md:before:left-0 md:before:w-[3px]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )} text-body`}
            >
              {t(`dash.set.tab.${s}`)}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">{body}</div>
      </div>
      {confirmDialog}
    </div>
  )
}

// ---------- shared bits ----------

/** Sticks to the bottom of the scrolling section: the save button is never a long scroll away. It is the one important button here. */
function SaveBar({ dirty, saving, onSave, children }: { dirty: boolean; saving: boolean; onSave: () => void; children?: ReactNode }) {
  const t = useT()
  return (
    <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-card px-5 py-3 max-md:px-3">
      <Button size="lg" className="max-md:flex-1" disabled={!dirty || saving} onClick={onSave}>{t('dash.set.save')}</Button>
      {dirty && <Chip tone="amber">{t('dash.set.unsaved')}</Chip>}
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

// ---------- Sensor ----------

function SensorSection({ meta, form, setForm, view, saving, dirty, onSave, onRestorePrompts, onRestorePart, onRestorePrompt, onSplit }: {
  meta: Meta
  form: Form
  setForm: (f: (cur: Form | null) => Form | null) => void
  view: DashView | null
  saving: boolean
  dirty: boolean
  onSave: () => void
  onRestorePrompts: () => void
  onRestorePart: (key: string) => void
  onRestorePrompt: (key: OtherPrompt) => void
  onSplit: () => void
}) {
  const t = useT()
  const tx = useTx()
  const patch = (p: Partial<Form>) => setForm((cur) => (cur ? { ...cur, ...p } : cur))
  const modes: Form['mode'][] = ['sensor', 'fast', 'manual']
  const groupsOn = meta.familyList.filter((f) => form.families[f] !== false).length
  const sum: SensorSummaryInput = {
    mode: form.mode,
    sensorModel: form.sensorModel,
    insertOn: form.injection.enabled,
    insertTokens: form.injection.maxTokens,
    saidOn: form.said.inject,
    groupsOn,
    groupsTotal: meta.familyList.length,
    hasQuests: meta.questCfg,
    maxMain: form.maxMain,
    maxThreads: form.maxThreads,
  }
  const questsChipText = questsChip(t, sum)
  const promptCount = (meta.sensorMode === 'parts' ? meta.partList.length : 1) + OTHER_PROMPTS.filter((k) => typeof form.prompts[k] === 'string').length
  const promptsChanged = meta.custom.length
  return (
    <>
      <div className="flex max-w-3xl flex-col gap-6 p-5 max-md:p-3">
        <Card variant="padded" data-testid="sensor-summary" className="gap-2.5">
          <h3 className="text-heading font-semibold">{t('dash.set.summary')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {summaryChips(t, sum).map((c) => <Chip key={c.text} tone={c.tone}>{c.text}</Chip>)}
          </div>
          {view && (
            <div className="flex flex-wrap gap-1.5" aria-label={t('dash.set.counters')}>
              <Chip>{t('dash.set.calls', { n: view.usage.calls })}</Chip>
              <Chip>{t('dash.set.tokensInOut', { in: view.usage.inTokens, out: view.usage.outTokens })}</Chip>
              {view.usage.lastMs > 0 && <Chip>{t('dash.set.lastSensor', { s: (view.usage.lastMs / 1000).toFixed(1) })}</Chip>}
            </div>
          )}
          {view?.lastError && (
            <p className="break-words text-caption text-amber-700 dark:text-amber-300">
              {t('dash.set.lastError', { message: view.lastError.message })} · <AgeText at={view.lastError.at} now={Date.now()} />
            </p>
          )}
        </Card>

        <Section variant="tinted" tone="sky" icon={Eye} id="sensor-how" title={t('dash.set.card.how')} chips={howChips(t, sum)}>
          <div className="flex flex-col gap-2 px-4 py-3">
            <span className="text-body font-semibold">{t('dash.set.mode')}</span>
            <Segmented
              label={t('dash.set.mode')}
              value={form.mode}
              options={modes.map((m) => ({ id: m, label: t(`dash.set.mode.${m}`), className: m === 'fast' ? 'max-md:order-3 max-md:col-span-2 max-md:whitespace-normal' : undefined }))}
              onChange={(m) => patch({ mode: m })}
              className="w-full max-md:grid max-md:grid-cols-2 md:w-fit [&>button]:flex-1"
            />
            <p className="text-caption text-muted-foreground">{t(`dash.set.mode.${form.mode}.hint`, { n: meta.fastTokens ?? 0 })}</p>
          </div>
          <SettingRow label={t('dash.set.model')}>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <span className="min-w-0 break-all font-mono text-caption">{form.sensorModel || t('dash.set.chatModel')}</span>
              <SoulModelPicker label={t('dash.set.chooseModel')} onPick={(ref) => patch({ sensorModel: ref })} />
              {form.sensorModel && (
                <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => patch({ sensorModel: '' })}>{t('dash.set.useChatModel')}</Button>
              )}
            </div>
          </SettingRow>
          <SettingRow label={t('dash.set.leakCheck')} info={t('dash.set.leakCheck.hint')}>
            <Switch checked={form.leakCheck} onCheckedChange={(v) => patch({ leakCheck: v })} aria-label={t('dash.set.leakCheck')} />
          </SettingRow>
          <SettingRow label={t('dash.set.catchUp')} info={t('dash.set.catchUp.hint')}>
            <Switch checked={form.catchUp} onCheckedChange={(v) => patch({ catchUp: v })} aria-label={t('dash.set.catchUp')} />
          </SettingRow>
          <SettingRow label={t('dash.set.autoSoul')} info={t('dash.set.autoSoul.hint')}>
            <Switch checked={form.autoSoul} onCheckedChange={(v) => patch({ autoSoul: v })} aria-label={t('dash.set.autoSoul')} />
          </SettingRow>
        </Section>

        <Section variant="tinted" tone="violet" icon={Sparkle} id="sensor-reminded" title={t('dash.set.card.reminded')} chips={remindedChips(t, sum)}>
          <SettingRow label={t('dash.set.insert')} info={t('dash.set.insert.hint')}>
            <Switch checked={form.injection.enabled} onCheckedChange={(v) => patch({ injection: { ...form.injection, enabled: v } })} aria-label={t('dash.set.insert')} />
          </SettingRow>
          <SettingRow label={t('dash.set.saidInject')} info={t('dash.set.saidInject.hint')}>
            <Switch checked={form.said.inject} onCheckedChange={(v) => patch({ said: { ...form.said, inject: v } })} aria-label={t('dash.set.saidInject')} />
          </SettingRow>
          <SettingRow label={t('dash.set.layoutInject')} info={t('dash.set.layoutInject.hint')}>
            <Switch checked={form.layout.inject} onCheckedChange={(v) => patch({ layout: { inject: v } })} aria-label={t('dash.set.layoutInject')} />
          </SettingRow>
          <div className="grid grid-cols-2 gap-3 p-4 max-md:grid-cols-1">
            <NumTile label={t('dash.set.tokens')} value={form.injection.maxTokens} min={MIN_TOKENS} max={MAX_TOKENS} step={10} disabled={!form.injection.enabled} onCommit={(n) => patch({ injection: { ...form.injection, maxTokens: n } })} />
            {meta.threadCfg && (
              <NumTile label={t('dash.set.noteAge')} hint={t('dash.set.hint.noteAge')} value={form.noteAgeTurns} min={5} max={500} onCommit={(n) => patch({ noteAgeTurns: n })} />
            )}
            <NumTile label={t('dash.set.said')} hint={t('dash.set.hint.said')} info={t('dash.set.said.hint')} value={form.said.perTurn} min={1} max={4} onCommit={(n) => patch({ said: { ...form.said, perTurn: n } })} />
            <NumTile label={t('dash.set.sensorTokens')} hint={t('dash.set.hint.sensorTokens')} info={t('dash.set.sensorTokens.warn')} value={form.sensorMaxTokens} min={MIN_SENSOR_TOKENS} max={MAX_SENSOR_TOKENS} step={100} onCommit={(n) => patch({ sensorMaxTokens: n })} />
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <p className="text-body font-semibold">{t('dash.set.families')}</p>
            <div className="flex flex-wrap gap-2">
              {meta.familyList.map((f) => (
                <ToggleChip key={f} tone="violet" pressed={form.families[f] !== false} onPressedChange={(v) => patch({ families: { ...form.families, [f]: v } })}>
                  {tx('dash.set.family', f)}
                </ToggleChip>
              ))}
            </div>
          </div>
        </Section>

        {meta.threadCfg && (
          <Section variant="tinted" tone="pink" icon={Compass} id="sensor-quests" title={t('dash.set.card.quests')} chips={questsChipText ? [questsChipText] : undefined}>
            <div className="grid grid-cols-2 gap-3 p-4 max-md:grid-cols-1">
              {meta.questCfg && (
                <NumTile label={t('dash.set.maxMain')} hint={t('dash.set.hint.mainQuests')} value={form.maxMain} min={1} max={2} onCommit={(n) => patch({ maxMain: n })} />
              )}
              <NumTile label={t('dash.set.maxThreads')} hint={t('dash.set.hint.sideQuests')} value={form.maxThreads} min={1} max={6} onCommit={(n) => patch({ maxThreads: n })} />
              {meta.questCfg && (
                <>
                  <NumTile label={t('dash.set.maxSteps')} value={form.maxSteps} min={1} max={6} onCommit={(n) => patch({ maxSteps: n })} />
                  <NumTile label={t('dash.set.everydayTurns')} hint={t('dash.set.hint.never')} value={form.everydayTurns} min={0} max={30} onCommit={(n) => patch({ everydayTurns: n })} />
                  <NumTile label={t('dash.set.retireAfter')} hint={t('dash.set.hint.never')} value={form.retireAfter} min={0} max={10} onCommit={(n) => patch({ retireAfter: n })} />
                </>
              )}
              <NumTile label={t('dash.set.threadCheck')} hint={t('dash.set.hint.never')} value={form.threadCheckEvery} min={0} max={50} onCommit={(n) => patch({ threadCheckEvery: n })} />
            </div>
          </Section>
        )}

        <Fold
          id="sensor-prompts"
          title={t('dash.set.advanced')}
          tone="slate"
          count={promptsChanged}
          summary={promptsChanged > 0 ? t('dash.set.prompts.sumChanged', { n: promptCount, c: promptsChanged }) : t('dash.set.prompts.sum', { n: promptCount })}
        >
          <div className="flex flex-col gap-2 p-4">
            {meta.sensorMode === 'parts' ? (
              <>
                <span className="text-sm">{t('dash.set.prompt')}</span>
                {meta.partList.map((p) => {
                  const text = form.parts[p.key] ?? ''
                  const changed = text !== p.default
                  return (
                    <Collapsible key={p.key} className="border border-border">
                      <CollapsibleTrigger className="group/part flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm hover:bg-muted">
                        <CaretRight className="size-3 shrink-0 group-data-[panel-open]/part:hidden" aria-hidden="true" />
                        <CaretDown className="hidden size-3 shrink-0 group-data-[panel-open]/part:block" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        {changed && <Badge variant="outline" className="h-4 rounded-none px-1 text-[10px]">{t('dash.set.source.changed')}</Badge>}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="flex flex-col gap-1.5 border-t border-border p-2">
                        <Textarea
                          rows={8}
                          value={text}
                          maxLength={4000}
                          aria-label={p.title}
                          onChange={(e) => patch({ parts: { ...form.parts, [p.key]: e.target.value } })}
                          className={cn(FIELD, 'font-mono text-xs')}
                        />
                        {changed && (
                          <Button size="xs" variant="outline" className={cn(FIELD, 'w-fit')} onClick={() => (p.custom ? onRestorePart(p.key) : patch({ parts: { ...form.parts, [p.key]: p.default } }))}>
                            {t('dash.set.partRestore')}
                          </Button>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
                {meta.partList.some((p) => p.custom) && (
                  <Button size="sm" variant="outline" className={cn(FIELD, 'w-fit')} onClick={onRestorePrompts}>{t('dash.set.restoreAllPrompts')}</Button>
                )}
              </>
            ) : (
              <>
                <label className="text-sm" htmlFor="dash-sensor-prompt">{t('dash.set.prompt')}</label>
                {meta.sensorMode === 'whole' && <p className="text-[11px] text-muted-foreground">{t('dash.set.wholeNote')}</p>}
                <Textarea id="dash-sensor-prompt" rows={12} value={form.sensor} onChange={(e) => patch({ sensor: e.target.value })} className={cn(FIELD, 'font-mono text-xs')} />
                <div className="flex flex-wrap gap-2">
                  {meta.sensorMode === 'whole' && (
                    <Button size="sm" variant="outline" className={FIELD} onClick={onSplit}>{t('dash.set.split')}</Button>
                  )}
                  {meta.custom.includes('sensor') && (
                    <Button size="sm" variant="outline" className={FIELD} onClick={onRestorePrompts}>{t('dash.set.restorePrompts')}</Button>
                  )}
                </div>
              </>
            )}
            {OTHER_PROMPTS.filter((k) => typeof form.prompts[k] === 'string').map((k) => (
              <div key={k} className="flex flex-col gap-1.5 pt-2">
                <label className="text-sm" htmlFor={`dash-prompt-${k}`}>{t(`dash.set.prompt.${k}`)}</label>
                <p className="text-[11px] text-muted-foreground">{t(`dash.set.prompt.${k}.hint`)}</p>
                <Textarea
                  id={`dash-prompt-${k}`}
                  rows={k === 'nudge' || k === 'nudgeTwist' ? 5 : 10}
                  value={form.prompts[k]}
                  maxLength={8000}
                  onChange={(e) => patch({ prompts: { ...form.prompts, [k]: e.target.value } })}
                  className={cn(FIELD, 'font-mono text-xs')}
                />
                {meta.custom.includes(k) && (
                  <Button size="xs" variant="outline" className={cn(FIELD, 'w-fit')} onClick={() => onRestorePrompt(k)}>
                    {t('dash.set.promptRestore')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Fold>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} />
    </>
  )
}

// ---------- Event vocabulary ----------

const clampDelta = (n: number) => Math.min(20, Math.max(-20, Math.round(Number.isFinite(n) ? n : 0)))

/** "trust +1", "respect −1": the stat's own name; green is good for the character's feeling, red is bad (hostility rising is bad). */
function DeltaChips({ deltas, off }: { deltas: Record<string, number>; off?: boolean }) {
  const tx = useTx()
  const list = Object.entries(deltas).filter(([, v]) => v !== 0)
  if (list.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {list.map(([k, v]) => (
        <span
          key={k}
          className={cn(
            'border px-1 font-mono text-[10px]',
            off ? 'border-border text-muted-foreground'
              : (k === 'hostility' ? v < 0 : v > 0) ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300',
          )}
        >
          {tx('soul.stat', k)} {v > 0 ? `+${v}` : `−${Math.abs(v)}`}
        </span>
      ))}
    </span>
  )
}

/** The fields of one event: family, meaning and a number per delta key. The id is typed only for a new one. */
function EventFields({ row, meta, onChange, idError, onId }: {
  row: VocabRow
  meta: Meta
  onChange: (p: Partial<VocabRow>) => void
  idError?: string | null
  onId?: (id: string) => void
}) {
  const t = useT()
  const tx = useTx()
  const families = meta.familyList.includes(row.family) || !row.family ? meta.familyList : [...meta.familyList, row.family]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {onId && (
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
            {t('dash.set.id')}
            <Input value={row.id} onChange={(e) => onId(e.target.value.trim())} maxLength={48} aria-invalid={!!idError} className={cn(FIELD, 'font-mono text-xs')} />
          </label>
        )}
        <div className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          {t('dash.set.family')}
          <Select value={row.family} onValueChange={(v) => v && onChange({ family: v })}>
            <SelectTrigger className={cn(FIELD, 'w-full')} aria-label={t('dash.set.family')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {families.map((f) => <SelectItem key={f} value={f}>{tx('dash.set.family', f)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {idError && <p className="text-[11px] text-amber-600 dark:text-amber-400">{idError}</p>}
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {t('dash.set.meaning')}
        <Input value={row.meaning} onChange={(e) => onChange({ meaning: e.target.value })} maxLength={200} className={FIELD} />
      </label>
      <div className="flex flex-wrap gap-2">
        {meta.deltaKeys.map((k) => (
          <label key={k} className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            {tx('soul.stat', k)}
            <Input
              type="number" min={-20} max={20} step={1}
              value={row.deltas[k] ?? 0}
              onChange={(e) => {
                const v = clampDelta(Number(e.target.value))
                const next = { ...row.deltas }
                if (v === 0) delete next[k]
                else next[k] = v
                onChange({ deltas: next })
              }}
              className={cn(FIELD, 'w-20')}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function EventRowView({ row, meta, open, onOpen, onChange, onReset, onDelete }: {
  row: VocabRow
  meta: Meta
  open: boolean
  onOpen: () => void
  onChange: (p: Partial<VocabRow>) => void
  onReset: () => void
  onDelete: () => void
}) {
  const t = useT()
  return (
    <li className={cn('border bg-card', open ? 'border-cta' : 'border-border')}>
      <div className="flex items-start gap-2.5 p-2">
        <Switch size="sm" className="mt-1" checked={!row.off} disabled={row.source === 'custom'} onCheckedChange={(v) => onChange({ off: !v })} aria-label={row.id} />
        <button type="button" onClick={onOpen} aria-expanded={open} className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-none text-left">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn('break-all font-mono text-xs', row.off && 'text-muted-foreground line-through')}>{row.id}</span>
            {row.source !== 'default' && <Badge variant="outline" className="h-4 rounded-none px-1 text-[10px]">{t(`dash.set.source.${row.source}`)}</Badge>}
          </span>
          <span className={cn('break-words text-xs', row.off && 'text-muted-foreground')}>{row.meaning}</span>
          <DeltaChips deltas={row.deltas} off={row.off} />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-2.5">
          <EventFields row={row} meta={meta} onChange={onChange} />
          <div className="flex flex-wrap gap-2">
            {row.source === 'changed' && <Button size="sm" variant="outline" className={FIELD} onClick={onReset}>{t('dash.set.reset')}</Button>}
            {row.source === 'custom' && (
              <Button size="sm" variant="destructive" className={FIELD} onClick={onDelete}><Trash />{t('dash.set.delete')}</Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function AddEvent({ meta, rows, onAdd, startId, onStarted }: { meta: Meta; rows: VocabRow[]; onAdd: (r: VocabRow) => void; startId?: string | null; onStarted?: () => void }) {
  const t = useT()
  const [draft, setDraft] = useState<VocabRow | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // "Add as event" on a not-recognised id opens the form with that id filled in
  useEffect(() => {
    if (!startId) return
    setDraft({ id: startId, family: meta.familyList[0] ?? 'trust', meaning: '', deltas: {}, source: 'custom', off: false })
    onStarted?.()
  }, [startId, meta.familyList, onStarted])
  useEffect(() => { if (draft) box.current?.scrollIntoView({ block: 'nearest' }) }, [draft === null])
  if (!draft) {
    return (
      <Button size="sm" variant="outline" className={cn(FIELD, 'w-fit')} onClick={() => setDraft({ id: '', family: meta.familyList[0] ?? 'trust', meaning: '', deltas: {}, source: 'custom', off: false })}>
        <Plus />{t('dash.set.add')}
      </Button>
    )
  }
  const idError = draft.id === '' ? null : !ID_RE.test(draft.id) ? t('dash.set.idInvalid') : rows.some((r) => r.id === draft.id) ? t('dash.set.idTaken') : null
  const ready = ID_RE.test(draft.id) && !idError && draft.meaning.trim() !== ''
  return (
    <div ref={box} className="flex scroll-mb-16 flex-col gap-2 border border-cta bg-card p-2.5">
      <EventFields row={draft} meta={meta} onChange={(p) => setDraft({ ...draft, ...p })} onId={(id) => setDraft({ ...draft, id })} idError={idError} />
      <div className="flex gap-2">
        <Button size="sm" className={FIELD} disabled={!ready} onClick={() => { onAdd({ ...draft, meaning: draft.meaning.trim() }); setDraft(null) }}>{t('dash.set.addRow')}</Button>
        <Button size="sm" variant="ghost" className={FIELD} onClick={() => setDraft(null)}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

function EventsSection({ meta, rows, setRows, saving, dirty, onSave, onReset, onRestoreAll, onIgnore }: {
  meta: Meta
  rows: VocabRow[]
  setRows: (f: (cur: VocabRow[]) => VocabRow[]) => void
  onIgnore: (id?: string) => void
  saving: boolean
  dirty: boolean
  onSave: () => void
  onReset: (id: string) => void
  onRestoreAll: () => void
}) {
  const t = useT()
  const tx = useTx()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [startId, setStartId] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  // an id already taken by a row (added meanwhile, not saved yet) is not offered again
  const unseen = meta.otherSeen.filter((o) => !rows.some((r) => r.id === o.id))
  const shown = rows.filter((r) => !q || r.id.includes(q) || r.meaning.toLowerCase().includes(q))
  const order = [...meta.familyList, ...new Set(rows.map((r) => r.family).filter((f) => !meta.familyList.includes(f)))]

  // a default row that is edited becomes "changed"
  const change = (id: string, p: Partial<VocabRow>) =>
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p, source: r.source === 'default' ? 'changed' : r.source } : r)))

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('dash.set.search')} aria-label={t('dash.set.search')} className={FIELD} />
        <p className="text-[11px] text-muted-foreground">{t('dash.set.eventsNote')}</p>
        {order.map((fam) => {
          const list = shown.filter((r) => r.family === fam)
          if (list.length === 0) return null
          return (
            <section key={fam} className="flex flex-col gap-1.5">
              <h3 className="font-heading text-[13px]">{tx('dash.set.family', fam)}</h3>
              <ul className="flex flex-col gap-1.5">
                {list.map((r) => (
                  <EventRowView
                    key={r.id} row={r} meta={meta} open={open === r.id}
                    onOpen={() => setOpen(open === r.id ? null : r.id)}
                    onChange={(p) => change(r.id, p)}
                    onReset={() => { void onReset(r.id) }}
                    onDelete={() => { setRows((cur) => cur.filter((x) => x.id !== r.id)); setOpen(null) }}
                  />
                ))}
              </ul>
            </section>
          )
        })}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">{t('dash.set.noEvents')}</p>}
        {unseen.length > 0 && (
          <section className="flex flex-col gap-1.5 border border-amber-500/50 bg-amber-500/10 p-2.5" data-testid="events-unseen">
            <h3 className="font-heading text-[13px]">{t('dash.set.unseen')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('dash.set.unseen.note')}</p>
            <ul className="flex flex-col gap-2">
              {unseen.map((o) => (
                <li key={o.id} className="flex flex-col gap-1.5 text-xs">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <code className="break-all font-mono">{o.id}</code>
                    <span className="text-[11px] text-muted-foreground">{t('dash.set.unseen.seen', { n: o.n })}</span>
                  </span>
                  {o.quote && <span className="break-words text-[11px] text-muted-foreground">“{o.quote}”</span>}
                  <span className="flex gap-2">
                    <Button size="sm" className={cn(FIELD, 'max-md:min-h-10')} onClick={() => setStartId(o.id)}>{t('dash.set.unseen.add')}</Button>
                    <Button size="sm" variant="ghost" className={cn(FIELD, 'max-md:min-h-10')} onClick={() => onIgnore(o.id)}>{t('dash.set.unseen.ignore')}</Button>
                  </span>
                </li>
              ))}
            </ul>
            {unseen.length > 1 && <Button size="sm" variant="outline" className={cn(FIELD, 'w-fit max-md:min-h-10')} onClick={() => onIgnore()}>{t('dash.set.unseen.ignoreAll')}</Button>}
          </section>
        )}
        <AddEvent meta={meta} rows={rows} startId={startId} onStarted={() => setStartId(null)} onAdd={(r) => { setRows((cur) => [...cur, r]); setOpen(r.id); setQuery('') }} />
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave}>
        <Button size="sm" variant="outline" className={FIELD} onClick={onRestoreAll}>{t('dash.set.restoreAll')}</Button>
      </SaveBar>
    </>
  )
}

// ---------- What the model sees ----------

function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-400')}>
      {ok ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Warning className="size-3.5 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

function PreviewSection({ chatId, injectionOn, limit, onSaveLimit }: {
  chatId: string
  injectionOn: boolean
  /** the saved insert limit, tokens per character */
  limit: number
  onSaveLimit: (n: number) => Promise<boolean>
}) {
  const t = useT()
  const tx = useTx()
  const [speaker, setSpeaker] = useState('')
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState(String(limit))
  const [savingLimit, setSavingLimit] = useState(false)
  useEffect(() => { setDraft(String(limit)) }, [limit])
  // only the newest request may show its answer or end the spinner
  const seq = useRef(0)

  const load = useCallback(async (who: string) => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const d = await j<Preview>(`/dashboard/preview?chatId=${encodeURIComponent(chatId)}${who ? `&speaker=${encodeURIComponent(who)}` : ''}`)
      if (mine !== seq.current) return
      setData(d)
      setFailed(false)
      // the first answer names the speakers: take the first and read it for that one
      if (!who && d.speakers?.[0]) setSpeaker(d.speakers[0])
    } catch {
      if (mine === seq.current) setFailed(true)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [chatId])
  useEffect(() => { void load(speaker) }, [load, speaker])
  useEffect(() => () => { seq.current++ }, [])

  const draftN = clampTokens(Number(draft))
  const saveLimit = async () => {
    setSavingLimit(true)
    const ok = await onSaveLimit(draftN)
    setSavingLimit(false)
    if (ok) await load(speaker)
  }

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
        <span>{t('dash.set.loadError')}</span>
        <Button size="sm" variant="outline" className={FIELD} onClick={() => { void load(speaker) }}>{t('dash.live.retry')}</Button>
      </div>
    )
  }
  if (!data) return <p className="p-4 text-sm text-muted-foreground">{t('dash.set.loading')}</p>
  const speakers = data.speakers ?? []
  const ins = data.insert
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        {speakers.length > 0 && (
          <Select value={speaker} onValueChange={(v) => v && setSpeaker(v)}>
            <SelectTrigger className={cn(FIELD, 'min-w-40')} aria-label={t('dash.set.speaker')}><SelectValue /></SelectTrigger>
            <SelectContent>{speakers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="icon-sm" className={FIELD} onClick={() => { void load(speaker) }} disabled={loading} aria-label={t('dash.refresh')} title={t('dash.refresh')}>
          <ArrowClockwise className={cn(loading && 'animate-spin')} />
        </Button>
      </div>
      {!injectionOn && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('dash.set.insertOff')}</p>}
      {!ins ? (
        <p className="text-sm text-muted-foreground">{t('dash.set.noInsert')}</p>
      ) : (
        <>
          <pre className="whitespace-pre-wrap break-words border border-border bg-card p-3 font-mono text-xs">{ins.text}</pre>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{t('dash.set.tokensOf', { n: ins.tokens, budget: ins.budget })}</span>
            {ins.trimmed.map((x) => <span key={x}>{t('dash.set.trimmed', { what: tx('dash.set.trimmed', x) })}</span>)}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="dash-insert-limit">{t('dash.set.limit')}</label>
              <Input
                id="dash-insert-limit" type="number" min={MIN_TOKENS} max={MAX_TOKENS} step={10}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setDraft(String(draftN))}
                className={cn(FIELD, 'h-7 w-24')}
              />
              <Button size="xs" className={FIELD} disabled={savingLimit || draftN === limit} onClick={() => { void saveLimit() }}>{t('dash.set.save')}</Button>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('dash.set.limit.warn')}</p>
          </div>
          {data.checks && (
            <ul className="flex flex-col gap-1">
              <CheckLine ok={data.checks.digits === 0}>{t('dash.set.check.digits')}</CheckLine>
              <CheckLine ok={data.checks.noBlindSpot}>{t('dash.set.check.blind')}</CheckLine>
              <CheckLine ok>{data.checks.notebookOf ? t('dash.set.check.notebook', { name: data.checks.notebookOf }) : t('dash.set.check.noNotebook')}</CheckLine>
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ---------- Tune with Molfar ----------

/** The draft Molfar gets, in English whatever the UI language: the agent reads it, the user reviews its change. */
function molfarDraft(form: Form, rows: VocabRow[], userText: string, none: string): string {
  const off = Object.entries(form.families).filter(([, on]) => !on).map(([f]) => f)
  return [
    'Tune the Roleplay relationship dashboard for me.',
    'Edit data files only, never src/ or plugins/:',
    '- apps/roleplay/data/dashboard/events.json: the event vocabulary, { "events": [ {id, family, meaning, deltas} | {id, off: true} ] }; a row with a default id replaces that default; deltas use trust, comfort, attraction, respect, affection, excitement, arousal, hostility (-20..20).',
    '- apps/roleplay/data/dashboard/config.json: only values that differ from the defaults.',
    `Current settings: mode ${form.mode}, sensor model ${form.sensorModel || 'chat model'}, insert ${form.injection.enabled ? 'on' : 'off'} at ${form.injection.maxTokens} tokens per character, families off: ${off.length ? off.join(', ') : none}, changed or custom events: ${rows.filter((r) => r.source !== 'default').length}, events switched off: ${rows.filter((r) => r.off).length}.`,
    `What I want: ${userText}`,
    'Show me the change and wait for my yes before writing.',
  ].join('\n')
}

function MolfarSection({ form, rows }: { form: Form; rows: VocabRow[] }) {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const room = ASK_MOLFAR_MAX - molfarDraft(form, rows, '', 'none').length

  const send = async () => {
    const draft = molfarDraft(form, rows, text.trim(), 'none')
    setBusy(true)
    try {
      // the bridge refuses an app that is not trusted, or one that is not the tab on screen: copy instead
      if (canAskMolfar() && (await askMolfar(draft).then(() => true, () => false))) return
      if (!(await copyText(draft))) throw new Error('copy failed')
      toast.success(t('dash.set.molfar.copied'))
    } catch (e) {
      toast.error(t('dash.set.error', { message: String((e as Error)?.message ?? e) }))
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">{t('dash.set.molfar.about')}</p>
      <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {t('dash.set.molfar.label')}
        <Textarea rows={6} value={text} maxLength={Math.max(0, room)} onChange={(e) => setText(e.target.value)} className={cn(FIELD, 'text-sm normal-case tracking-normal text-foreground')} />
      </label>
      {room < 200 && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('dash.set.molfar.short', { n: Math.max(0, room) })}</p>}
      <Button size="sm" className={cn(FIELD, 'w-fit')} disabled={busy || !text.trim()} onClick={() => { void send() }}>{t('dash.set.molfar.ask')}</Button>
    </div>
  )
}
