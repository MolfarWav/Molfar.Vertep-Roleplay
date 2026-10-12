import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowClockwise, Check, CircleNotch, MagicWand, Sparkle, BookOpen, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { j } from '@/lib/engine'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'

export type SceneMode = 'cards' | 'wild'
export interface SceneDraft { kind: 'scenario' | 'opening'; text: string; mode?: SceneMode; model?: string; at?: number }
type Busy = null | 'scenario' | 'opening'

/** The group's scene draft (plugins/profile): one model call files it; nothing
 *  on the group changes until the user accepts it. */
export function useSceneDraft(groupId: string) {
  const t = useT()
  const [draft, setDraft] = useState<SceneDraft | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const query = `/profile/draft?groupId=${encodeURIComponent(groupId)}`

  useEffect(() => {
    let alive = true
    setDraft(null)
    j<{ draft: SceneDraft | null }>(query).then((r) => { if (alive) setDraft(r.draft) }).catch(() => { /* no plugin: no draft */ })
    return () => { alive = false }
  }, [query])

  const run = async (kind: 'scenario' | 'opening', body: Record<string, unknown>) => {
    setBusy(kind)
    try {
      const path = kind === 'scenario' ? '/profile/group-scene' : '/profile/group-opening'
      const r = await j<{ ok?: boolean; draft?: SceneDraft; error?: string }>(path, { method: 'POST', body: JSON.stringify({ groupId, ...body }) })
      if (r.ok && r.draft) setDraft(r.draft)
      else toast.error(t('group.gen.failed', { error: r.error ?? 'no answer' }))
    } catch (e) {
      toast.error(t('group.gen.failed', { error: String((e as Error).message ?? e) }))
    } finally {
      setBusy(null)
    }
  }
  const drop = () => { setDraft(null); void j(query, { method: 'DELETE' }).catch(() => {}) }
  return { draft, busy, run, drop }
}
export type SceneDraftState = ReturnType<typeof useSceneDraft>

/** A proposal with Use / Try again / Discard; the text can be edited before use. */
function Proposal({ title, text, onUse, useLabel, onAgain, onDiscard, busy }: {
  title: string; text: string; onUse: (text: string) => void; useLabel: string; onAgain: () => void; onDiscard: () => void; busy: boolean
}) {
  const t = useT()
  const [value, setValue] = useState(text)
  useEffect(() => setValue(text), [text])
  return (
    <div className="space-y-2 rounded-lg border border-group/50 bg-group/5 p-3" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs font-medium text-group">
        <Sparkle className="size-3.5" weight="fill" aria-hidden="true" />{title}
      </p>
      <Textarea rows={6} value={value} onChange={(e) => setValue(e.target.value)} aria-label={title} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="max-sm:h-10" onClick={() => onUse(value)} disabled={!value.trim() || busy}>
          <Check className="size-3.5" aria-hidden="true" />{useLabel}
        </Button>
        <Button size="sm" className="max-sm:h-10" variant="secondary" onClick={onAgain} disabled={busy}>
          {busy ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <ArrowClockwise className="size-3.5" aria-hidden="true" />}
          {t('group.gen.again')}
        </Button>
        <Button size="sm" className="max-sm:h-10" variant="ghost" onClick={onDiscard} disabled={busy}>
          <X className="size-3.5" aria-hidden="true" />{t('group.gen.discard')}
        </Button>
      </div>
    </div>
  )
}

/** "Generate the scenario": a mode (from the cards, or something wild) and an optional wish. */
export function ScenarioGenerator({ s, hasScenario, onAccept }: { s: SceneDraftState; hasScenario: boolean; onAccept: (text: string) => void }) {
  const t = useT()
  const [mode, setMode] = useState<SceneMode>(() => s.draft?.mode ?? 'cards')
  const [wish, setWish] = useState('')
  const busy = s.busy === 'scenario'
  const go = () => void s.run('scenario', { mode, ...(wish.trim() ? { wish: wish.trim() } : {}) })
  const modes = [
    { id: 'cards' as const, icon: BookOpen, label: t('group.gen.modeCards'), hint: t('group.gen.modeCardsHint') },
    { id: 'wild' as const, icon: Sparkle, label: t('group.gen.modeWild'), hint: t('group.gen.modeWildHint') },
  ]
  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div>
        <p className="text-sm font-medium">{t('group.gen.title')}</p>
        <p className="text-xs text-muted-foreground">{t('group.gen.hint')}</p>
      </div>
      <div role="radiogroup" aria-label={t('group.gen.modeLabel')} className="grid gap-2 sm:grid-cols-2">
        {modes.map((m) => {
          const on = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex min-h-11 items-start gap-2 rounded-md border p-2.5 text-left transition-colors',
                on ? 'border-group/60 bg-group/10' : 'border-border hover:bg-accent/60',
              )}
            >
              <m.icon className={cn('mt-0.5 size-4 shrink-0', on ? 'text-group' : 'text-muted-foreground')} weight={on ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', on && 'text-group')}>{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="scene-wish">{t('group.gen.wish')}</Label>
        <Input
          id="scene-wish"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && !busy) { e.preventDefault(); go() }
          }}
          placeholder={t('group.gen.wishPlaceholder')}
          maxLength={600}
        />
        <p className="text-xs text-muted-foreground">{t('group.gen.wishHint')}</p>
      </div>
      <Button onClick={go} disabled={!!s.busy} className="max-sm:h-10">
        {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
        {busy ? t('group.gen.busy') : t('group.gen.run')}
      </Button>
      {s.draft?.kind === 'scenario' && (
        <Proposal
          title={t('group.gen.proposal')}
          text={s.draft.text}
          useLabel={t(hasScenario ? 'group.gen.replace' : 'group.gen.use')}
          busy={busy}
          onUse={(text) => { onAccept(text); s.drop(); toast.success(t('group.gen.accepted')) }}
          onAgain={go}
          onDiscard={s.drop}
        />
      )}
    </div>
  )
}

/** "Generate opening": one more opening, written from the saved scenario. */
export function OpeningGenerator({ s, scenario, onAccept }: { s: SceneDraftState; scenario: string; onAccept: (text: string) => void }) {
  const t = useT()
  const busy = s.busy === 'opening'
  const ready = !!scenario.trim()
  const go = () => void s.run('opening', { scenario: scenario.trim() })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="max-sm:h-10" variant="secondary" onClick={go} disabled={!ready || !!s.busy}>
          {busy ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <MagicWand className="size-3.5" aria-hidden="true" />}
          {busy ? t('group.gen.busy') : t('group.gen.opening')}
        </Button>
        {!ready && <span className="text-xs text-muted-foreground">{t('group.gen.openingNeedsScenario')}</span>}
      </div>
      {s.draft?.kind === 'opening' && (
        <Proposal
          title={t('group.gen.openingProposal')}
          text={s.draft.text}
          useLabel={t('group.gen.addOpening')}
          busy={busy}
          onUse={(text) => { onAccept(text); s.drop(); toast.success(t('group.gen.openingAdded')) }}
          onAgain={go}
          onDiscard={s.drop}
        />
      )}
    </div>
  )
}
