import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/setting-row'
import { useT } from '@/hooks/use-t'
import { setLitChatConfig, type LitChatConfig } from './litopys-api'
import type { TabProps } from './ledger-facts'

type NumKey = 'minMessages' | 'maxMessages' | 'recentMessages' | 'sceneKeep' | 'pinLimit'
type Mode = 'global' | 'fit' | 'scenes'

const LIMITS: Record<NumKey, [number, number]> = {
  minMessages: [1, 40],
  maxMessages: [10, 200],
  recentMessages: [6, 200],
  sceneKeep: [2, 100000],
  pinLimit: [1, 20],
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** The chat's own values as the fields hold them: text, empty = follows the Library. */
function draftOf(c: LitChatConfig | undefined): Record<NumKey, string> {
  const s = (v: number | undefined) => (typeof v === 'number' ? String(v) : '')
  return {
    minMessages: s(c?.scene?.minMessages),
    maxMessages: s(c?.scene?.maxMessages),
    recentMessages: s(c?.recentMessages),
    sceneKeep: s(c?.sceneKeep),
    pinLimit: s(c?.pinLimit),
  }
}

/** The config the fields describe, or null when every field is empty. */
function configOf(draft: Record<NumKey, string>, mode: Mode): LitChatConfig | null {
  const num = (k: NumKey) => {
    const raw = draft[k].trim()
    if (raw === '' || Number.isNaN(Number(raw))) return undefined
    return clamp(Math.round(Number(raw)), LIMITS[k][0], LIMITS[k][1])
  }
  const out: LitChatConfig = {}
  const min = num('minMessages')
  const max = num('maxMessages')
  if (min !== undefined || max !== undefined) out.scene = { ...(min !== undefined ? { minMessages: min } : {}), ...(max !== undefined ? { maxMessages: max } : {}) }
  const recent = num('recentMessages')
  if (recent !== undefined) out.recentMessages = recent
  const keep = num('sceneKeep')
  if (keep !== undefined) out.sceneKeep = keep
  const pin = num('pinLimit')
  if (pin !== undefined) out.pinLimit = pin
  if (mode !== 'global') out.cutMode = mode
  return Object.keys(out).length ? out : null
}

/**
 * How many settings this chat keeps for itself that show in the tab (its count). Of the recent-messages and the
 * kept-after-scenes fields only the one of the cut mode in force is counted: the other is hidden.
 */
export function chatConfigCount(c: LitChatConfig | undefined, globalCutMode: 'fit' | 'scenes' = 'fit'): number {
  if (!c) return 0
  const scenes = (c.cutMode ?? globalCutMode) === 'scenes'
  return (
    (c.scene?.minMessages !== undefined ? 1 : 0) +
    (c.scene?.maxMessages !== undefined ? 1 : 0) +
    (scenes ? (c.sceneKeep !== undefined ? 1 : 0) : c.recentMessages !== undefined ? 1 : 0) +
    (c.pinLimit !== undefined ? 1 : 0) +
    (c.cutMode ? 1 : 0)
  )
}

/**
 * #122 part 2: settings for this chat alone. An empty field follows Library > Litopys settings (shown as the
 * placeholder); a value is saved when the field is left and counts from the next tick.
 */
export function SettingsTab({ chat, onChat }: TabProps) {
  const t = useT()
  const own = chat.chatConfig
  const global = chat.globalConfig
  const [draft, setDraft] = useState(() => draftOf(own))
  const [mode, setMode] = useState<Mode>(own?.cutMode ?? 'global')
  const [busy, setBusy] = useState(false)

  // the poll brings the saved values back: fields not being edited follow them
  const saved = JSON.stringify(own ?? {})
  useEffect(() => {
    setDraft(draftOf(own))
    setMode(own?.cutMode ?? 'global')
    // own is read through its JSON
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  if (!global) {
    return <p className="text-sm text-muted-foreground" data-testid="chat-settings-old">{t('lit.chatSet.old')}</p>
  }

  const save = async (nextDraft: Record<NumKey, string>, nextMode: Mode) => {
    const config = configOf(nextDraft, nextMode)
    if (JSON.stringify(config ?? {}) === JSON.stringify(own ?? {})) return
    setBusy(true)
    try {
      onChat(await setLitChatConfig(chat.chatId, config))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const effectiveMode = mode === 'global' ? global.cutMode : mode
  const fallback: Record<NumKey, number> = {
    minMessages: global.scene.minMessages,
    maxMessages: global.scene.maxMessages,
    recentMessages: global.recentMessages,
    sceneKeep: global.sceneKeep,
    pinLimit: global.pinLimit,
  }
  const field = (key: NumKey, label: string, hint?: string) => (
    <Field key={key}>
      <FieldLabel htmlFor={`chat-set-${key}`} className="font-medium">{label}</FieldLabel>
      <Input
        id={`chat-set-${key}`}
        data-testid={`chat-set-${key}`}
        type="number"
        inputMode="numeric"
        min={LIMITS[key][0]}
        max={LIMITS[key][1]}
        placeholder={t('lit.chatSet.follows', { n: fallback[key] })}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          const v = raw === '' || Number.isNaN(Number(raw)) ? '' : String(clamp(Math.round(Number(raw)), LIMITS[key][0], LIMITS[key][1]))
          const next = { ...draft, [key]: v }
          setDraft(next)
          void save(next, mode)
        }}
        className="w-40 max-md:h-10"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Field>
  )
  const count = chatConfigCount(own, global.cutMode)
  const anyOwn = own !== undefined && Object.keys(own).length > 0

  return (
    <div className="flex flex-col gap-4" data-testid="chat-settings">
      <div className="flex flex-col gap-1">
        <p className="text-sm">{t('lit.chatSet.intro')}</p>
        <p className="text-xs text-muted-foreground">{t('lit.chatSet.note')}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-border p-3" aria-label={t('lit.chatSet.scenes')}>
        <h3 className="font-heading text-sm">{t('lit.chatSet.scenes')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('minMessages', t('lit.set.sceneMin'))}
          {field('maxMessages', t('lit.set.sceneMax'))}
        </div>
        <p className="text-xs text-muted-foreground">{t('lit.chatSet.scenesHint')}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-3" aria-label={t('lit.chatSet.prompt')}>
        <h3 className="font-heading text-sm">{t('lit.chatSet.prompt')}</h3>
        <Field>
          <FieldLabel className="font-medium">{t('lit.set.cutMode')}</FieldLabel>
          <Segmented
            label={t('lit.set.cutMode')}
            value={mode}
            onChange={(v) => {
              setMode(v)
              void save(draft, v)
            }}
            className="max-sm:w-full max-sm:flex-col"
            options={[
              { id: 'global', label: t('lit.chatSet.sameAsLibrary') },
              { id: 'fit', label: t('lit.set.cutFit') },
              { id: 'scenes', label: t('lit.set.cutScenes') },
            ]}
          />
          <p className="text-xs text-muted-foreground">{effectiveMode === 'scenes' ? t('lit.set.cutScenesHint') : t('lit.set.cutFitHint')}</p>
        </Field>
        {effectiveMode === 'scenes'
          ? field('sceneKeep', t('lit.set.sceneKeep'), t('lit.set.sceneKeepHint'))
          : field('recentMessages', t('lit.set.recent'), t('lit.set.recentHint'))}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-3" aria-label={t('lit.chatSet.facts')}>
        <h3 className="font-heading text-sm">{t('lit.chatSet.facts')}</h3>
        {field('pinLimit', t('lit.set.pinLimit'))}
      </section>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={busy || !anyOwn}
          onClick={() => {
            setDraft(draftOf(undefined))
            setMode('global')
            void save(draftOf(undefined), 'global')
          }}
          data-testid="chat-set-reset"
        >
          {t('lit.chatSet.reset')}
        </Button>
        <span className="text-xs text-muted-foreground">{count > 0 ? t('lit.chatSet.own', { n: count }) : t('lit.chatSet.noneOwn')}</span>
      </div>
    </div>
  )
}
