import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { ModelPicker } from '@/components/settings/model-picker'
import { useT } from '@/hooks/use-t'
import { toast } from 'sonner'
import { embedConfig, embedStatus, setEmbedConfig } from '@/lib/engine'
import { deleteLitPrompts, fetchLitConfig, putLitConfig, type LitConfig } from '@/components/library/litopys-api'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function MemorySummarySection() {
  const t = useT()
  const [cfg, setCfg] = useState<LitConfig | null>(null)
  const [embed, setEmbed] = useState<{ ok: boolean; via: string | null } | null>(null)
  const [embedModel, setEmbedModel] = useState('text-embedding-3-small')
  useEffect(() => { void embedStatus().then(setEmbed); void embedConfig().then((c) => setEmbedModel(c.model)) }, [])

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
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {embed === null ? 'Matching by meaning: checking…'
              : embed.ok ? `Matching by meaning${embed.via ? ` via ${embed.via}` : ''}`
              : 'Matching by words only. An embeddings connection adds matching by meaning.'}
          </p>
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
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t('lit.settingsTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('lit.set.hint')}</p>
        </div>
        <Field orientation="horizontal">
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="lit-insert">{t('lit.set.insert')}</FieldLabel>
            <p className="text-xs text-muted-foreground">{t('lit.set.insertHint')}</p>
          </div>
          <Switch id="lit-insert" checked={cfg.insert} onCheckedChange={(v) => save({ insert: v })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lit-budget">{t('lit.set.budget')}</FieldLabel>
          <Input
            id="lit-budget"
            type="number"
            min={200}
            max={4000}
            value={cfg.budget}
            onChange={(e) => setCfg({ ...cfg, budget: Number(e.target.value) })}
            onBlur={(e) => {
              const v = clamp(Number(e.target.value), 200, 4000)
              setCfg({ ...cfg, budget: v })
              if (v !== cfg.budget) save({ budget: v })
            }}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">{t('lit.set.budgetHint')}</p>
        </Field>
        <Field>
          <FieldLabel htmlFor="lit-recent">{t('lit.set.recent')}</FieldLabel>
          <Input
            id="lit-recent"
            type="number"
            min={6}
            max={200}
            value={cfg.recentMessages}
            onChange={(e) => setCfg({ ...cfg, recentMessages: Number(e.target.value) })}
            onBlur={(e) => {
              const v = clamp(Number(e.target.value), 6, 200)
              setCfg({ ...cfg, recentMessages: v })
              if (v !== cfg.recentMessages) save({ recentMessages: v })
            }}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">{t('lit.set.recentHint')}</p>
        </Field>
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
          <Field>
            <FieldLabel htmlFor="lit-scene-min">{t('lit.set.sceneMin')}</FieldLabel>
            <Input
              id="lit-scene-min"
              type="number"
              min={1}
              max={40}
              value={cfg.scene.minMessages}
              onChange={(e) => setCfg({ ...cfg, scene: { ...cfg.scene, minMessages: Number(e.target.value) } })}
              onBlur={(e) => {
                const v = clamp(Number(e.target.value), 1, 40)
                setCfg({ ...cfg, scene: { ...cfg.scene, minMessages: v } })
                if (v !== cfg.scene.minMessages) saveScene({ minMessages: v })
              }}
              className="w-32"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lit-scene-max">{t('lit.set.sceneMax')}</FieldLabel>
            <Input
              id="lit-scene-max"
              type="number"
              min={10}
              max={200}
              value={cfg.scene.maxMessages}
              onChange={(e) => setCfg({ ...cfg, scene: { ...cfg.scene, maxMessages: Number(e.target.value) } })}
              onBlur={(e) => {
                const v = clamp(Number(e.target.value), 10, 200)
                setCfg({ ...cfg, scene: { ...cfg.scene, maxMessages: v } })
                if (v !== cfg.scene.maxMessages) saveScene({ maxMessages: v })
              }}
              className="w-32"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="lit-pin-limit">{t('lit.set.pinLimit')}</FieldLabel>
          <Input
            id="lit-pin-limit"
            type="number"
            min={1}
            max={20}
            value={cfg.pinLimit}
            onChange={(e) => setCfg({ ...cfg, pinLimit: Number(e.target.value) })}
            onBlur={(e) => {
              const v = clamp(Number(e.target.value), 1, 20)
              setCfg({ ...cfg, pinLimit: v })
              if (v !== cfg.pinLimit) save({ pinLimit: v })
            }}
            className="w-32"
          />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="lit-chapter">{t('lit.set.prompt')}</FieldLabel>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                void deleteLitPrompts().then(() => fetchLitConfig()).then(setCfg).catch((e) => {
                  toast.error(e instanceof Error ? e.message : String(e))
                })
              }}
            >
              {t('lit.set.reset')}
            </Button>
          </div>
          <Textarea
            id="lit-chapter"
            rows={5}
            value={cfg.chapter}
            onChange={(e) => setCfg({ ...cfg, chapter: e.target.value })}
            onBlur={() => save({ chapter: cfg.chapter })}
            className="text-xs"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Facts</p>
        <p className="text-xs text-muted-foreground">Short facts kept per chat. Pinned ones ride every prompt; the rest come back when the chat mentions them.</p>
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {embed === null ? 'Matching by meaning: checking…'
            : embed.ok ? `Matching by meaning${embed.via ? ` via ${embed.via}` : ''}`
            : 'Matching by words only. An embeddings connection adds matching by meaning.'}
        </p>
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
      </div>
    </div>
  )
}
