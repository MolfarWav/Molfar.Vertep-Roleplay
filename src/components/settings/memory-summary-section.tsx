import { useEffect, useId, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { ModelPicker } from '@/components/settings/model-picker'
import { NeedsYouSwitch } from '@/components/shell/needs-you-switch'
import { useT } from '@/hooks/use-t'
import { toast } from 'sonner'
import { embedConfig, embedStatus, setEmbedConfig } from '@/lib/engine'
import { canOpenSettingsTab, openSettingsTab } from '@/lib/shell-bridge'
import { deleteLitPrompts, fetchLitConfig, putLitConfig, type LitConfig } from '@/components/library/litopys-api'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** `inDialog`: the dialog's own title names it, so the card drops its heading. */
export function MemorySummarySection({ inDialog = false }: { inDialog?: boolean } = {}) {
  const t = useT()
  const [cfg, setCfg] = useState<LitConfig | null>(null)

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
  const changed = (key: 'chapter' | 'arc') => !cfg?.custom || cfg.custom.includes(key)
  const restore = (key: 'chapter' | 'arc') => {
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
  const numField = (o: { id: string; label: string; hint?: string; min: number; max: number; fallback?: number; value: number | undefined; setLocal: (v: number) => void; commit: (v: number) => void }) => (
    <Field key={o.id}>
      <FieldLabel htmlFor={o.id}>{o.label}</FieldLabel>
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
        className="w-32"
      />
      {o.hint && <p className="text-xs text-muted-foreground">{o.hint}</p>}
    </Field>
  )
  const keyField = (key: 'budget' | 'linkBudget' | 'recentMessages' | 'pinLimit' | 'arcKeep' | 'arcThreshold' | 'arcSizeMin' | 'arcSizeMax' | 'arcWords' | 'skillsEarnAfter', o: { id: string; label: string; hint?: string; min: number; max: number; fallback?: number }) =>
    numField({ ...o, value: cfg[key], setLocal: (v) => setCfg({ ...cfg, [key]: v }), commit: (v) => save({ [key]: v }) })
  const sceneField = (key: 'minMessages' | 'maxMessages', o: { id: string; label: string; min: number; max: number }) =>
    numField({ ...o, value: cfg.scene[key], setLocal: (v) => setCfg({ ...cfg, scene: { ...cfg.scene, [key]: v } }), commit: (v) => saveScene({ [key]: v }) })
  const switchRow = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <Field orientation="horizontal">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {!inDialog && <p className="text-sm font-medium">{t('lit.settingsTitle')}</p>}
        <p className="text-xs text-muted-foreground">{t('lit.set.hint')}</p>
      </div>

      <Block title={t('lit.blk.record')} hint={t('lit.blk.recordHint')}>
        {switchRow('lit-enabled', t('lit.set.enabled'), t('lit.set.enabledHint'), cfg.enabled !== false, (v) => save({ enabled: v }))}
        {switchRow('lit-insert', t('lit.set.insert'), t('lit.set.insertHint'), cfg.insert, (v) => save({ insert: v }))}
      </Block>

      <Block title={t('lit.blk.prompt')} hint={t('lit.blk.promptHint')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {keyField('budget', { id: 'lit-budget', label: t('lit.set.budget'), hint: t('lit.set.budgetHint'), min: 200, max: 4000 })}
          {keyField('linkBudget', { id: 'lit-link-budget', label: t('lit.set.linkBudget'), hint: t('lit.set.linkBudgetHint'), min: 0, max: 3000 })}
          {keyField('recentMessages', { id: 'lit-recent', label: t('lit.set.recent'), hint: t('lit.set.recentHint'), min: 6, max: 200 })}
        </div>
      </Block>

      <Block title={t('lit.blk.writing')} hint={t('lit.blk.writingHint')}>
        <Field>
          <div className="flex flex-col gap-0.5">
            <FieldLabel>{t('lit.set.model')}</FieldLabel>
            <p className="text-xs text-muted-foreground">{t('lit.set.modelHint')}</p>
          </div>
          <ModelPicker
            value={cfg.model}
            onChange={(v) => save({ model: v })}
            ariaLabel={t('lit.set.model')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {sceneField('minMessages', { id: 'lit-scene-min', label: t('lit.set.sceneMin'), min: 1, max: 40 })}
          {sceneField('maxMessages', { id: 'lit-scene-max', label: t('lit.set.sceneMax'), min: 10, max: 200 })}
        </div>
        <Field>
          <PromptLabel id="lit-chapter" label={t('lit.set.prompt')} changed={changed('chapter')} onRestore={() => restore('chapter')} />
          <Textarea
            id="lit-chapter"
            rows={5}
            value={cfg.chapter}
            onChange={(e) => setCfg({ ...cfg, chapter: e.target.value })}
            onBlur={() => save({ chapter: cfg.chapter })}
            className="text-xs"
          />
        </Field>
      </Block>

      <Block title={t('lit.blk.arcs')} hint={t('lit.blk.arcsHint')}>
        <Field>
          <FieldLabel htmlFor="lit-arc-mode">{t('lit.set.arcMode')}</FieldLabel>
          <select
            id="lit-arc-mode"
            value={cfg.arcMode}
            onChange={(e) => {
              const v = e.target.value as LitConfig['arcMode']
              setCfg({ ...cfg, arcMode: v })
              save({ arcMode: v })
            }}
            className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="ask">{t('lit.set.arcAsk')}</option>
            <option value="auto">{t('lit.set.arcAuto')}</option>
            <option value="off">{t('lit.set.arcOff')}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t('lit.set.arcHint')}</p>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {keyField('arcKeep', { id: 'lit-arc-keep', label: t('lit.set.arcKeep'), min: 1, max: 50 })}
          {keyField('arcThreshold', { id: 'lit-arc-threshold', label: t('lit.set.arcThreshold'), hint: t('lit.set.arcThresholdHint', { n: 2 * cfg.budget }), min: 0, max: 40000 })}
          {keyField('arcSizeMin', { id: 'lit-arc-size-min', label: t('lit.set.arcSizeMin'), min: 2, max: 20 })}
          {keyField('arcSizeMax', { id: 'lit-arc-size-max', label: t('lit.set.arcSizeMax'), min: 2, max: 30 })}
          {keyField('arcWords', { id: 'lit-arc-words', label: t('lit.set.arcWords'), min: 40, max: 400 })}
        </div>
        <Field>
          <PromptLabel id="lit-arc-prompt" label={t('lit.set.arcPrompt')} changed={changed('arc')} onRestore={() => restore('arc')} />
          <Textarea
            id="lit-arc-prompt"
            rows={5}
            value={cfg.arc}
            onChange={(e) => setCfg({ ...cfg, arc: e.target.value })}
            onBlur={() => save({ arc: cfg.arc })}
            className="text-xs"
          />
        </Field>
      </Block>

      <Block title={t('lit.blk.skills')} hint={t('lit.blk.skillsHint')}>
        {switchRow('lit-skills', t('lit.set.skills'), t('lit.set.skillsHint'), cfg.skills !== false, (v) => save({ skills: v }))}
        {cfg.skills !== false && keyField('skillsEarnAfter', { id: 'lit-skills-after', label: t('lit.set.skillsAfter'), hint: t('lit.set.skillsAfterHint'), min: 1, max: 5, fallback: 2 })}
      </Block>

      <Block title={t('lit.blk.notices')} hint={t('lit.blk.noticesHint')}>
        <NeedsYouSwitch kind="litopys" label="attn.set.litopys" hint="attn.set.litopysHint" />
        <NeedsYouSwitch kind="failed" label="attn.set.failed" hint="attn.set.failedHint" />
      </Block>

      <Block title="Facts" hint="Short facts kept per chat. Pinned ones ride every prompt; the rest come back when the chat mentions them.">
        {keyField('pinLimit', { id: 'lit-pin-limit', label: t('lit.set.pinLimit'), min: 1, max: 20 })}
        <EmbedRow />
      </Block>
    </div>
  )
}

/** One block of the settings: a short title and what it is for at the top, its own border. */
function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <header className="flex flex-col gap-0.5 border-b border-border pb-2">
        <h3 id={id} className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </header>
      {children}
    </section>
  )
}

/** A prompt's label, with "Restore default" while it differs from the default. */
function PromptLabel({ id, label, changed, onRestore }: { id: string; label: string; changed: boolean; onRestore: () => void }) {
  const t = useT()
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {changed && (
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onRestore}>
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
  const [embed, setEmbed] = useState<{ ok: boolean; via: string | null } | null>(null)
  const [embedModel, setEmbedModel] = useState('text-embedding-3-small')
  const linked = canOpenSettingsTab()
  useEffect(() => {
    void embedStatus().then(setEmbed)
    if (!linked) void embedConfig().then((c) => setEmbedModel(c.model))
  }, [linked])
  return (
    <>
      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        {embed === null ? 'Matching by meaning: checking…'
          : embed.ok ? `Matching by meaning${embed.via ? ` via ${embed.via}` : ''}`
          : 'Matching by words only. An embeddings connection adds matching by meaning.'}
      </p>
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void openSettingsTab('memory').catch((e: unknown) => toast.error(String((e as Error).message ?? e)))}>
            Set up in Settings › Memory
          </Button>
          <span className="text-[11px] text-muted-foreground">The embeddings provider and model are shared by every app.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            onBlur={() => { if (embedModel.trim()) { void setEmbedConfig(embedModel.trim()).then(() => embedStatus(true).then(setEmbed)) } }}
            className="h-7 w-56 font-mono text-[11px]"
            aria-label="Embeddings model"
          />
          <span className="text-[11px] text-muted-foreground">embeddings model</span>
        </div>
      )}
    </>
  )
}
