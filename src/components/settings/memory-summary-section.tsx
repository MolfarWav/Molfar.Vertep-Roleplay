import { useEffect, useId, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { BookOpen, Bell, CaretDown, MagnifyingGlass, PencilSimple, PenNib, Quotes, Repeat, Stack, TextT, TreeStructure, type Icon } from '@phosphor-icons/react'
import { MARK, TONE, type Tone } from '@/components/dashboard/dash-common'
import { cn } from '@/lib/utils'
import { ModelPicker } from '@/components/settings/model-picker'
import { NeedsYouSwitch } from '@/components/shell/needs-you-switch'
import { useT } from '@/hooks/use-t'
import { toast } from 'sonner'
import { embedConfig, embedStatus, setEmbedConfig } from '@/lib/engine'
import { canOpenSettingsTab, openSettingsTab } from '@/lib/shell-bridge'
import { deleteLitPrompts, fetchLitConfig, putLitConfig, type LitConfig, type LitPromptKey } from '@/components/library/litopys-api'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** The default memory size (tokens) and the most a custom one may be: the plugin's own limits. */
const COMPACT_SIZE = 800
const BUDGET_MAX = 16000

/** `inDialog`: the dialog's own title names it, so the card drops its heading. */
export function MemorySummarySection({ inDialog = false }: { inDialog?: boolean } = {}) {
  const t = useT()
  const [cfg, setCfg] = useState<LitConfig | null>(null)
  // the memory size: Compact is the 800 tokens of the default; any other number is Custom (kept apart so choosing Custom with 800 works)
  const [sizeMode, setSizeMode] = useState<'compact' | 'custom' | null>(null)

  useEffect(() => {
    void fetchLitConfig().then(setCfg).catch((e) => {
      toast.error(e instanceof Error ? e.message : String(e))
    })
  }, [])

  const save = (patch: Record<string, unknown>) => {
    if (!cfg) return
    void putLitConfig(patch).then(setCfg).catch((e) => {
      toast.error(e instanceof Error ? e.message : String(e))
    })
  }

  // an older plugin sends no `custom`: then both buttons stay, as before
  const changed = (key: LitPromptKey) => !cfg?.custom || cfg.custom.includes(key)
  const restore = (key: LitPromptKey) => {
    void deleteLitPrompts(key).then(setCfg).catch((e) => {
      toast.error(e instanceof Error ? e.message : String(e))
    })
  }

  const saveScene = (patch: Record<string, unknown>) => {
    if (!cfg) return
    void putLitConfig({ scene: { ...cfg.scene, ...patch } }).then(setCfg).catch((e) => {
      toast.error(e instanceof Error ? e.message : String(e))
    })
  }

  if (!cfg) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <p className="text-sm text-muted-foreground">…</p>
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <EmbedRow />
        </div>
      </div>
    )
  }

  /** A number field that edits the local copy while typing and saves, clamped, when the field is left. */
  const numField = (o: { id: string; label: string; hint?: string; unit?: string; min: number; max: number; fallback?: number; value: number | undefined; setLocal: (v: number) => void; commit: (v: number) => void }) => (
    <Field key={o.id}>
      <FieldLabel htmlFor={o.id} className="font-medium">{o.label}</FieldLabel>
      <div className="flex items-center gap-2">
      <Input
        id={o.id}
        type="number"
        min={o.min}
        max={o.max}
        value={o.value ?? o.fallback ?? o.min}
        onChange={(e) => o.setLocal(Number(e.target.value))}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          const v = clamp(raw === '' || Number.isNaN(Number(raw)) ? (o.fallback ?? o.min) : Math.round(Number(raw)), o.min, o.max)
          o.setLocal(v)
          o.commit(v)
        }}
        className="w-32 max-md:h-10"
      />
      {o.unit && <span className="text-xs text-muted-foreground">{o.unit}</span>}
      </div>
      {o.hint && <p className="text-xs text-muted-foreground">{o.hint}</p>}
    </Field>
  )
  const keyField = (key: 'budget' | 'linkBudget' | 'recentMessages' | 'sceneKeep' | 'pinLimit' | 'arcKeep' | 'arcThreshold' | 'arcSizeMin' | 'arcSizeMax' | 'arcWords' | 'habitsEarnAfter', o: { id: string; label: string; hint?: string; unit?: string; min: number; max: number; fallback?: number }) =>
    numField({ ...o, value: cfg[key], setLocal: (v) => setCfg({ ...cfg, [key]: v }), commit: (v) => save({ [key]: v }) })
  const sizeField = () => {
    const mode: 'compact' | 'auto' | 'custom' = cfg.budgetMode === 'auto' ? 'auto' : sizeMode ?? (cfg.budget === COMPACT_SIZE ? 'compact' : 'custom')
    return (
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Field>
          <FieldLabel className="font-medium">{t('lit.set.size')}</FieldLabel>
          <Segmented
            tone="scene"
            label={t('lit.set.size')}
            value={mode}
            onChange={(v) => {
              setSizeMode(v === 'auto' ? null : v)
              if (v === 'auto') {
                setCfg({ ...cfg, budgetMode: 'auto' })
                save({ budgetMode: 'auto' })
              } else if (v === 'compact') {
                setCfg({ ...cfg, budget: COMPACT_SIZE, budgetMode: 'fixed' })
                save({ budget: COMPACT_SIZE, budgetMode: 'fixed' })
              } else {
                setCfg({ ...cfg, budgetMode: 'fixed' })
                save({ budgetMode: 'fixed' })
              }
            }}
            options={[
              { value: 'compact', label: t('lit.set.sizeCompact', { n: COMPACT_SIZE }) },
              { value: 'auto', label: t('lit.set.sizeAuto') },
              { value: 'custom', label: t('lit.set.sizeCustom') },
            ]}
          />
          <p className="text-xs text-muted-foreground">{mode === 'auto' ? t('lit.set.sizeAutoHint') : t('lit.set.sizeHint')}</p>
        </Field>
        {mode === 'custom' && keyField('budget', { id: 'lit-budget', label: t('lit.set.budget'), hint: t('lit.set.sizeCustomHint', { max: BUDGET_MAX }), unit: t('lit.unit.tokens'), min: 200, max: BUDGET_MAX })}
      </div>
    )
  }
  const sceneField = (key: 'minMessages' | 'maxMessages', o: { id: string; label: string; min: number; max: number }) =>
    numField({ ...o, value: cfg.scene[key], setLocal: (v) => setCfg({ ...cfg, scene: { ...cfg.scene, [key]: v } }), commit: (v) => saveScene({ [key]: v }) })
  const switchRow = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <Field orientation="horizontal">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id} className="font-medium">{label}</FieldLabel>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
  /** A prompt text: its label with Restore default, the box, an optional hint. */
  const textField = (key: 'chapter' | 'arc' | 'summary' | 'remembers' | 'continues' | 'cardMemory', label: string, rows: number, hint?: string) => (
    <Field key={key}>
      <PromptLabel id={`lit-${key}`} label={label} changed={changed(key)} onRestore={() => restore(key)} />
      <Textarea
        id={`lit-${key}`}
        rows={rows}
        value={cfg[key] ?? ''}
        onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
        onBlur={() => save({ [key]: cfg[key] ?? '' })}
        className="text-xs"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Field>
  )

  // what a folded block says about itself, so nothing has to be opened to see what is set
  const sizeText = cfg.budgetMode === 'auto' ? t('lit.set.sizeAuto') : t('lit.sum.tokens', { n: cfg.budget })
  const modeText = { ask: t('lit.set.arcAsk'), auto: t('lit.set.arcAuto'), off: t('lit.set.arcOff') }[cfg.arcMode]
  const textKeys: LitPromptKey[] = ['chapter', 'arc', 'summary', 'remembers', 'continues', 'cardMemory']
  const changedTexts = cfg.custom ? textKeys.filter((k) => cfg.custom?.includes(k)).length : null
  const onOff = (on: boolean) => (on ? t('lit.sum.on') : t('lit.sum.off'))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {!inDialog && <p className="text-sm font-medium">{t('lit.settingsTitle')}</p>}
        <p className="text-xs text-muted-foreground">{t('lit.set.hint')}</p>
      </div>

      <Block tone="memory" icon={BookOpen} defaultOpen title={t('lit.blk.record')} hint={t('lit.blk.recordHint')} summary={`${onOff(cfg.enabled !== false)} · ${onOff(cfg.insert)}`}>
        {switchRow('lit-enabled', t('lit.set.enabled'), t('lit.set.enabledHint'), cfg.enabled !== false, (v) => save({ enabled: v }))}
        {switchRow('lit-insert', t('lit.set.insert'), t('lit.set.insertHint'), cfg.insert, (v) => save({ insert: v }))}
      </Block>

      <Block tone="scene" icon={Stack} defaultOpen title={t('lit.blk.prompt')} hint={t('lit.blk.promptHint')} summary={cfg.cutMode === 'scenes' ? t('lit.sum.promptScenes', { size: sizeText, n: cfg.sceneKeep ?? 2 }) : t('lit.sum.prompt', { size: sizeText, n: cfg.recentMessages })}>
        <div className="grid gap-3 sm:grid-cols-2">
          {sizeField()}
          {keyField('linkBudget', { id: 'lit-link-budget', label: t('lit.set.linkBudget'), hint: t('lit.set.linkBudgetHint'), unit: t('lit.unit.tokens'), min: 0, max: 3000 })}
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Field>
              <FieldLabel className="font-medium">{t('lit.set.cutMode')}</FieldLabel>
              <Segmented
                tone="scene"
                label={t('lit.set.cutMode')}
                value={cfg.cutMode === 'scenes' ? 'scenes' : 'fit'}
                onChange={(v) => {
                  setCfg({ ...cfg, cutMode: v })
                  save({ cutMode: v })
                }}
                options={[
                  { value: 'fit', label: t('lit.set.cutFit') },
                  { value: 'scenes', label: t('lit.set.cutScenes') },
                ]}
              />
              <p className="text-xs text-muted-foreground">{cfg.cutMode === 'scenes' ? t('lit.set.cutScenesHint') : t('lit.set.cutFitHint')}</p>
            </Field>
          </div>
          {cfg.cutMode === 'scenes'
            ? keyField('sceneKeep', { id: 'lit-scene-keep', label: t('lit.set.sceneKeep'), hint: t('lit.set.sceneKeepHint'), min: 2, max: 100000, fallback: 2 })
            : keyField('recentMessages', { id: 'lit-recent', label: t('lit.set.recent'), hint: t('lit.set.recentHint'), min: 6, max: 200 })}
        </div>
      </Block>

      <Block tone="plot" icon={PencilSimple} defaultOpen title={t('lit.blk.proposals')} hint={t('lit.blk.proposalsHint')} summary={cfg.proposals === 'quiet' ? t('lit.set.proposalsQuiet') : t('lit.set.proposalsAsk')}>
        <Field>
          <FieldLabel className="font-medium">{t('lit.set.proposals')}</FieldLabel>
          <Segmented
            tone="plot"
            label={t('lit.set.proposals')}
            value={cfg.proposals ?? 'ask'}
            onChange={(v) => {
              setCfg({ ...cfg, proposals: v })
              save({ proposals: v })
            }}
            options={[
              { value: 'ask', label: t('lit.set.proposalsAsk') },
              { value: 'quiet', label: t('lit.set.proposalsQuiet') },
            ]}
          />
          <p className="text-xs text-muted-foreground">{t('lit.set.proposalsHint')}</p>
        </Field>
        {switchRow('lit-auto-consolidate', t('lit.set.autoConsolidate'), t('lit.set.autoConsolidateHint'), cfg.autoConsolidate ?? cfg.proposals === 'quiet', (v) => save({ autoConsolidate: v }))}
      </Block>

      <Block tone="people" icon={PenNib} title={t('lit.blk.writing')} hint={t('lit.blk.writingHint')} summary={t('lit.sum.writing', { model: cfg.model || t('lit.sum.modelDefault'), min: cfg.scene.minMessages, max: cfg.scene.maxMessages })}>
        <Field>
          <div className="flex flex-col gap-0.5">
            <FieldLabel className="font-medium">{t('lit.set.model')}</FieldLabel>
            <p className="text-xs text-muted-foreground">{t('lit.set.modelHint')}</p>
          </div>
          <ModelPicker
            value={cfg.model}
            onChange={(v) => save({ model: v })}
            chatDefaultLabel={t('lit.sum.modelDefault')}
            ariaLabel={t('lit.set.model')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {sceneField('minMessages', { id: 'lit-scene-min', label: t('lit.set.sceneMin'), min: 1, max: 40 })}
          {sceneField('maxMessages', { id: 'lit-scene-max', label: t('lit.set.sceneMax'), min: 10, max: 200 })}
        </div>
      </Block>

      <Block tone="scene" icon={TreeStructure} title={t('lit.blk.arcs')} hint={t('lit.blk.arcsHint')} summary={cfg.arcMode === 'off' ? modeText : t('lit.sum.arcs', { mode: modeText, n: cfg.arcThreshold || 2 * cfg.budget })}>
        <Field>
          <FieldLabel htmlFor="lit-arc-mode" className="font-medium">{t('lit.set.arcMode')}</FieldLabel>
          <select
            id="lit-arc-mode"
            value={cfg.arcMode}
            onChange={(e) => {
              const v = e.target.value as LitConfig['arcMode']
              setCfg({ ...cfg, arcMode: v })
              save({ arcMode: v })
            }}
            className="min-h-10 w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm md:min-h-8"
          >
            <option value="ask">{t('lit.set.arcAsk')}</option>
            <option value="auto">{t('lit.set.arcAuto')}</option>
            <option value="off">{t('lit.set.arcOff')}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t('lit.set.arcHint')}</p>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {keyField('arcKeep', { id: 'lit-arc-keep', label: t('lit.set.arcKeep'), min: 1, max: 50 })}
          {keyField('arcThreshold', { id: 'lit-arc-threshold', label: t('lit.set.arcThreshold'), hint: t('lit.set.arcThresholdHint', { n: 2 * cfg.budget }), unit: t('lit.unit.tokens'), min: 0, max: 40000 })}
          {keyField('arcSizeMin', { id: 'lit-arc-size-min', label: t('lit.set.arcSizeMin'), min: 2, max: 20 })}
          {keyField('arcSizeMax', { id: 'lit-arc-size-max', label: t('lit.set.arcSizeMax'), min: 2, max: 30 })}
          {keyField('arcWords', { id: 'lit-arc-words', label: t('lit.set.arcWords'), unit: t('lit.unit.words'), min: 40, max: 400 })}
        </div>
      </Block>

      <Block tone="memory" icon={MagnifyingGlass} title={t('lit.blk.facts')} hint={t('lit.blk.factsHint')} summary={t('lit.sum.facts', { n: cfg.pinLimit })}>
        {keyField('pinLimit', { id: 'lit-pin-limit', label: t('lit.set.pinLimit'), min: 1, max: 20 })}
        <EmbedRow />
      </Block>

      <Block tone="people" icon={Repeat} title={t('lit.blk.habits')} hint={t('lit.blk.habitsHint')} summary={cfg.habits !== false ? t('lit.sum.habits', { n: cfg.habitsEarnAfter ?? 2 }) : onOff(false)}>
        {switchRow('lit-habits', t('lit.set.habits'), t('lit.set.habitsHint'), cfg.habits !== false, (v) => save({ habits: v }))}
        {cfg.habits !== false && keyField('habitsEarnAfter', { id: 'lit-habits-after', label: t('lit.set.habitsAfter'), hint: t('lit.set.habitsAfterHint'), min: 1, max: 5, fallback: 2 })}
      </Block>

      <Block tone="people" icon={Quotes} title={t('lit.blk.recollections')} hint={t('lit.blk.recollectionsHint')} summary={onOff(cfg.recollections !== false)}>
        {switchRow('lit-recollections', t('lit.set.recollections'), t('lit.set.recollectionsHint'), cfg.recollections !== false, (v) => save({ recollections: v }))}
      </Block>

      <Block tone="plot" icon={Bell} title={t('lit.blk.notices')} hint={t('lit.blk.noticesHint')}>
        <NeedsYouSwitch kind="litopys" label="attn.set.litopys" hint="attn.set.litopysHint" />
        <NeedsYouSwitch kind="failed" label="attn.set.failed" hint="attn.set.failedHint" />
      </Block>

      <Block tone="scene" icon={TextT} title={t('lit.blk.texts')} hint={t('lit.blk.textsHint')} summary={changedTexts === null ? undefined : changedTexts === 0 ? t('lit.sum.textsDefault') : t('lit.sum.texts', { n: changedTexts, total: textKeys.length })}>
        {textField('chapter', t('lit.set.prompt'), 5)}
        {textField('arc', t('lit.set.arcPrompt'), 5)}
        {textField('summary', t('lit.set.summaryPrompt'), 5, t('lit.set.summaryPromptHint'))}
        {(['remembers', 'continues', 'cardMemory'] as const).map((key) => textField(key, t(`lit.set.${key}`), 3, t(`lit.set.${key}Hint`)))}
      </Block>
    </div>
  )
}

/** Two or three choices, all visible at once (a select hides them). The chosen one takes the block's colour. */
function Segmented<T extends string>({ label, value, onChange, options, tone }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; tone: Tone }) {
  const look = TONE[tone]
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-md border border-border bg-muted p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-10 flex-1 rounded border px-3 md:min-h-8', value === o.value ? cn(look.bar, look.text, 'font-semibold shadow-sm') : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * One block of the settings: a tinted title bar with its icon (the Dashboard's colours: one hue for a kind
 * of content), and what is set when it is folded. A block folds, so a long list of settings reads as a list
 * of titles; the everyday ones start open.
 */
function Block({ title, hint, tone, icon: Glyph, summary, defaultOpen = false, children }: { title: string; hint: string; tone: Tone; icon: Icon; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const look = TONE[tone]
  return (
    <Collapsible defaultOpen={defaultOpen} className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <CollapsibleTrigger
        className={cn('group flex min-h-11 w-full items-center gap-2 border-b border-transparent px-3 py-2 text-left aria-expanded:border-border', look.bar)}
      >
        <Glyph className={cn('size-4 shrink-0', look.text)} aria-hidden="true" />
        <span className={cn('shrink-0 text-sm font-semibold', look.text)}>{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-aria-expanded:hidden">{summary}</span>}
        <CaretDown className={cn('ml-auto size-4 shrink-0 transition-transform group-aria-expanded:rotate-180', look.text)} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">{hint}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A prompt's label, with "Restore default" while it differs from the default. */
function PromptLabel({ id, label, changed, onRestore }: { id: string; label: string; changed: boolean; onRestore: () => void }) {
  const t = useT()
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <FieldLabel htmlFor={id} className="font-medium">{label}</FieldLabel>
      {changed && (
        <Button variant="outline" size="sm" className={cn('h-6 text-xs max-md:h-10', MARK.warn)} onClick={onRestore}>
          {t('lit.set.reset')}
        </Button>
      )}
    </div>
  )
}

/**
 * Matching by meaning: its status, and where to set it up. The embeddings provider, key and model belong
 * to the shell (Settings > Memory, 0.9.5); an older engine without that link keeps the model field here.
 */
function EmbedRow() {
  const t = useT()
  const [embed, setEmbed] = useState<{ ok: boolean; via: string | null } | null>(null)
  const [embedModel, setEmbedModel] = useState('text-embedding-3-small')
  const linked = canOpenSettingsTab()
  useEffect(() => {
    void embedStatus().then(setEmbed)
    if (!linked) void embedConfig().then((c) => setEmbedModel(c.model))
  }, [linked])
  const chip = embed === null ? MARK.neutral : embed.ok ? MARK.good : MARK.warn
  return (
    <>
      <p className={cn('w-fit border px-2 py-0.5 text-xs', chip)} aria-live="polite">
        {embed === null ? t('lit.emb.checking')
          : embed.ok ? (embed.via ? t('lit.emb.okVia', { via: embed.via }) : t('lit.emb.ok'))
          : t('lit.emb.words')}
      </p>
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-7 text-xs max-md:h-10" onClick={() => void openSettingsTab('memory').catch((e: unknown) => toast.error(String((e as Error).message ?? e)))}>
            {t('lit.emb.setup')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('lit.emb.shared')}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            onBlur={() => { if (embedModel.trim()) { void setEmbedConfig(embedModel.trim()).then(() => embedStatus(true).then(setEmbed)) } }}
            className="h-7 w-56 font-mono text-[11px] max-md:h-10"
            aria-label={t('lit.emb.modelLabel')}
          />
          <span className="text-xs text-muted-foreground">{t('lit.emb.model')}</span>
        </div>
      )}
    </>
  )
}
