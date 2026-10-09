// The dashboard's settings: sensor, event vocabulary, what the model sees, tuning with
// Molfar. It fills the wide drawer and the phone sheet. Settings and vocabulary save
// separately (PUT /dashboard/config, PUT /dashboard/events), so each keeps its own
// unsaved state and one save never discards the other's edits.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, ArrowLeft, CaretDown, CaretRight, Check, Plus, Trash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { ASK_MOLFAR_MAX, askMolfar, canAskMolfar } from '@/lib/shell-bridge'
import { cn, copyText } from '@/lib/utils'
import type { DashView } from '@/lib/dashboard'
import { AgeText, Box, useTx } from './dash-common'
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
  autoSoul: boolean
  sensor: string
  custom: string[]
  deltaKeys: string[]
  events: VocabRow[]
  /** round 3 plugin: absent on an older one */
  maxThreads?: number
  threadCheckEvery?: number
  sensorMode?: 'parts' | 'whole'
  sensorParts?: { key: string; title: string; text: string; default: string; custom: boolean }[]
}

/** The part of the config the Sensor section edits and PUT /dashboard/config takes. */
interface Form {
  sensorModel: string
  mode: 'sensor' | 'fast' | 'manual'
  families: Record<string, boolean>
  injection: { enabled: boolean; maxTokens: number }
  sensorMaxTokens: number
  maxThreads: number
  threadCheckEvery: number
  catchUp: boolean
  autoSoul: boolean
  /** the whole prompt: only sent in "whole" and legacy mode */
  sensor: string
  /** the prompt's blocks by key: only sent in "parts" mode */
  parts: Record<string, string>
}

/** The prompt as the plugin offers it: in blocks, one custom text ("whole"), or an older plugin ("legacy"). */
interface PromptMeta {
  custom: string[]
  sensorMode: 'parts' | 'whole' | 'legacy'
  partList: { key: string; title: string; default: string; custom: boolean }[]
}

/** What the sections need besides the form and the rows. */
interface Meta extends PromptMeta { familyList: string[]; deltaKeys: string[]; threadCfg: boolean; fastTokens: number | null }

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
    catchUp: c.catchUp !== false,
    autoSoul: c.autoSoul !== false,
    sensor: c.sensor ?? '',
    parts: Object.fromEntries((c.sensorParts ?? []).map((p) => [p.key, p.text])),
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
const clampCheck = (n: number) => Math.min(50, Math.max(0, Math.round(Number.isFinite(n) ? n : DEFAULT_THREAD_CHECK)))
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
    setMeta({ familyList: c.familyList ?? [], deltaKeys: c.deltaKeys ?? [], threadCfg: c.maxThreads !== undefined, fastTokens: typeof c.fastTokens === 'number' ? c.fastTokens : null, ...promptMeta(c) })
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
      const { sensor, parts, ...rest } = form
      const body = {
        ...rest,
        injection: { ...form.injection, maxTokens: clampTokens(form.injection.maxTokens) },
        sensorMaxTokens: clampSensorTokens(form.sensorMaxTokens),
        maxThreads: clampThreads(form.maxThreads),
        threadCheckEvery: clampCheck(form.threadCheckEvery),
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
      const c = await j<DashConfig>('/dashboard/config/prompts', { method: 'DELETE' })
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
        dirty={!same(form, formBase)} onSave={saveForm} onRestorePrompts={restorePrompts} onRestorePart={restorePart} onSplit={splitPrompt}
      />
    )
  } else if (section === 'events') {
    body = (
      <EventsSection
        meta={meta} rows={rows} setRows={setRows} saving={saving}
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
        <h2 className="min-w-0 truncate font-heading text-[15px]">{t('dash.set.title')}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-2 sm:w-48 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 sm:p-3">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-current={s === section ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-none border px-2.5 py-1 text-left font-heading text-[13px] whitespace-nowrap transition-colors sm:whitespace-normal',
                s === section ? 'border-cta bg-cta/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
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

function SwitchRow({ label, hint, checked, onChange, disabled }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm">
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}

/** Sticks to the bottom of the scrolling section: the save button is never a long scroll away. */
function SaveBar({ dirty, saving, onSave, children }: { dirty: boolean; saving: boolean; onSave: () => void; children?: ReactNode }) {
  const t = useT()
  return (
    <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-2">
      <Button size="sm" className={FIELD} disabled={!dirty || saving} onClick={onSave}>{t('dash.set.save')}</Button>
      {dirty && <span className="text-[11px] text-muted-foreground">{t('dash.set.unsaved')}</span>}
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

function Fieldset({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

// ---------- Sensor ----------

function SensorSection({ meta, form, setForm, view, saving, dirty, onSave, onRestorePrompts, onRestorePart, onSplit }: {
  meta: Meta
  form: Form
  setForm: (f: (cur: Form | null) => Form | null) => void
  view: DashView | null
  saving: boolean
  dirty: boolean
  onSave: () => void
  onRestorePrompts: () => void
  onRestorePart: (key: string) => void
  onSplit: () => void
}) {
  const t = useT()
  const tx = useTx()
  const patch = (p: Partial<Form>) => setForm((cur) => (cur ? { ...cur, ...p } : cur))
  const modes: Form['mode'][] = ['sensor', 'fast', 'manual']
  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <Fieldset label={t('dash.set.mode')}>
          <div className="flex w-fit max-w-full flex-wrap border border-border" role="group" aria-label={t('dash.set.mode')}>
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={form.mode === m}
                onClick={() => patch({ mode: m })}
                className={cn('rounded-none px-3 py-1 font-heading text-[13px] transition-colors', form.mode === m ? 'bg-cta/15 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
              >
                {t(`dash.set.mode.${m}`)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{t(`dash.set.mode.${form.mode}.hint`, { n: meta.fastTokens ?? 0 })}</p>
        </Fieldset>

        <Fieldset label={t('dash.set.model')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-all font-mono text-xs">{form.sensorModel || t('dash.set.chatModel')}</span>
            <SoulModelPicker label={t('dash.set.chooseModel')} onPick={(ref) => patch({ sensorModel: ref })} />
            {form.sensorModel && (
              <Button size="sm" variant="ghost" className={FIELD} onClick={() => patch({ sensorModel: '' })}>{t('dash.set.useChatModel')}</Button>
            )}
          </div>
        </Fieldset>

        <Box>
          <div className="flex flex-col gap-3">
            <SwitchRow label={t('dash.set.insert')} hint={t('dash.set.insert.hint')} checked={form.injection.enabled} onChange={(v) => patch({ injection: { ...form.injection, enabled: v } })} />
            {form.injection.enabled && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>{t('dash.set.tokens')}</span>
                <Input
                  type="number" min={MIN_TOKENS} max={MAX_TOKENS} step={10}
                  value={form.injection.maxTokens}
                  onChange={(e) => patch({ injection: { ...form.injection, maxTokens: Number(e.target.value) } })}
                  onBlur={() => patch({ injection: { ...form.injection, maxTokens: clampTokens(form.injection.maxTokens) } })}
                  className={cn(FIELD, 'w-24')}
                />
              </label>
            )}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t('dash.set.sensorTokens')}</span>
              <Input
                type="number" min={MIN_SENSOR_TOKENS} max={MAX_SENSOR_TOKENS} step={100}
                value={form.sensorMaxTokens}
                onChange={(e) => patch({ sensorMaxTokens: Number(e.target.value) })}
                onBlur={() => patch({ sensorMaxTokens: clampSensorTokens(form.sensorMaxTokens) })}
                className={cn(FIELD, 'w-24')}
              />
            </label>
            <p className="-mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t('dash.set.sensorTokens.warn')}</p>
            {meta.threadCfg && (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('dash.set.maxThreads')}</span>
                  <Input
                    type="number" min={1} max={6} step={1}
                    value={form.maxThreads}
                    onChange={(e) => patch({ maxThreads: Number(e.target.value) })}
                    onBlur={() => patch({ maxThreads: clampThreads(form.maxThreads) })}
                    className={cn(FIELD, 'w-24')}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('dash.set.threadCheck')}</span>
                  <Input
                    type="number" min={0} max={50} step={1}
                    value={form.threadCheckEvery}
                    onChange={(e) => patch({ threadCheckEvery: Number(e.target.value) })}
                    onBlur={() => patch({ threadCheckEvery: clampCheck(form.threadCheckEvery) })}
                    className={cn(FIELD, 'w-24')}
                  />
                </label>
              </>
            )}
            <SwitchRow label={t('dash.set.catchUp')} hint={t('dash.set.catchUp.hint')} checked={form.catchUp} onChange={(v) => patch({ catchUp: v })} />
            <SwitchRow label={t('dash.set.autoSoul')} hint={t('dash.set.autoSoul.hint')} checked={form.autoSoul} onChange={(v) => patch({ autoSoul: v })} />
          </div>
        </Box>

        <Fieldset label={t('dash.set.families')}>
          <Box>
            <div className="flex flex-col gap-2.5">
              {meta.familyList.map((f) => (
                <SwitchRow key={f} label={tx('dash.set.family', f)} checked={form.families[f] !== false} onChange={(v) => patch({ families: { ...form.families, [f]: v } })} />
              ))}
            </div>
          </Box>
        </Fieldset>

        {view && (
          <Fieldset label={t('dash.set.counters')}>
            <div className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
              <span>{t('dash.set.calls', { n: view.usage.calls })}</span>
              <span>{t('dash.set.tokensInOut', { in: view.usage.inTokens, out: view.usage.outTokens })}</span>
              {view.usage.lastMs > 0 && <span>{t('dash.set.lastSensor', { s: (view.usage.lastMs / 1000).toFixed(1) })}</span>}
              {view.lastError && (
                <span className="break-words text-amber-600 dark:text-amber-400">
                  {t('dash.set.lastError', { message: view.lastError.message })} · <AgeText at={view.lastError.at} now={Date.now()} />
                </span>
              )}
            </div>
          </Fieldset>
        )}

        <Collapsible className="flex flex-col gap-2">
          <CollapsibleTrigger className="group/adv flex w-fit items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
            <CaretRight className="size-3 group-data-[panel-open]/adv:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/adv:block" aria-hidden="true" />
            {t('dash.set.advanced')}
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2">
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
          </CollapsibleContent>
        </Collapsible>
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

function AddEvent({ meta, rows, onAdd }: { meta: Meta; rows: VocabRow[]; onAdd: (r: VocabRow) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<VocabRow | null>(null)
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
    <div className="flex flex-col gap-2 border border-cta bg-card p-2.5">
      <EventFields row={draft} meta={meta} onChange={(p) => setDraft({ ...draft, ...p })} onId={(id) => setDraft({ ...draft, id })} idError={idError} />
      <div className="flex gap-2">
        <Button size="sm" className={FIELD} disabled={!ready} onClick={() => { onAdd({ ...draft, meaning: draft.meaning.trim() }); setDraft(null) }}>{t('dash.set.addRow')}</Button>
        <Button size="sm" variant="ghost" className={FIELD} onClick={() => setDraft(null)}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

function EventsSection({ meta, rows, setRows, saving, dirty, onSave, onReset, onRestoreAll }: {
  meta: Meta
  rows: VocabRow[]
  setRows: (f: (cur: VocabRow[]) => VocabRow[]) => void
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
  const q = query.trim().toLowerCase()
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
        <AddEvent meta={meta} rows={rows} onAdd={(r) => { setRows((cur) => [...cur, r]); setOpen(r.id); setQuery('') }} />
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
