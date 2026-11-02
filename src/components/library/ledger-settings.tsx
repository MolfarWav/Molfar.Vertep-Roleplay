import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { putLitChatConfig, type LitChatValues } from './litopys-api'
import type { TabProps } from './ledger-facts'

/** One setting a chat may set for itself: where it lives in the values, its limits and its label. */
type Row = { id: string; get: (v: LitChatValues) => number | undefined; set: (n: number | null) => Parameters<typeof putLitChatConfig>[1]; min: number; max: number; label: string; hint?: string; unit?: string }

/**
 * What leaving a field does: nothing (unchanged, or empty with nothing set), clear the key (emptied, so the chat follows the
 * global value again), or set it (the number, rounded and kept inside the limits). show = what the field shows afterwards.
 */
export function settingAction(raw: string, had: number | undefined, min: number, max: number): { kind: 'none'; show: string } | { kind: 'clear'; show: string } | { kind: 'set'; n: number; show: string } {
  const text = raw.trim()
  if (text === '' || Number.isNaN(Number(text))) return had === undefined ? { kind: 'none', show: '' } : { kind: 'clear', show: '' }
  const n = Math.min(max, Math.max(min, Math.round(Number(text))))
  return n === had ? { kind: 'none', show: String(n) } : { kind: 'set', n, show: String(n) }
}

/** How many settings a chat has set for itself (the tab's counter). */
export function ownCount(own: LitChatValues | undefined): number {
  if (!own) return 0
  const scene = own.scene ?? {}
  return [own.recentMessages, own.sceneKeep, own.pinLimit, own.budget, scene.minMessages, scene.maxMessages].filter((v) => typeof v === 'number').length
}

export function SettingsTab({ chat, onChat }: TabProps) {
  const t = useT()
  const cc = chat.chatConfig
  const ownKey = JSON.stringify(cc?.own ?? {})
  const rows: Row[] = [
    { id: 'sceneMin', get: (v) => v.scene?.minMessages, set: (n) => ({ scene: { minMessages: n } }), min: 1, max: 40, label: t('lit.set.sceneMin') },
    { id: 'sceneMax', get: (v) => v.scene?.maxMessages, set: (n) => ({ scene: { maxMessages: n } }), min: 10, max: 200, label: t('lit.set.sceneMax') },
    cc?.global.cutMode === 'scenes'
      ? { id: 'sceneKeep', get: (v) => v.sceneKeep, set: (n) => ({ sceneKeep: n }), min: 2, max: 100000, label: t('lit.set.sceneKeep') }
      : { id: 'recent', get: (v) => v.recentMessages, set: (n) => ({ recentMessages: n }), min: 6, max: 200, label: t('lit.set.recent') },
    { id: 'budget', get: (v) => v.budget, set: (n) => ({ budget: n }), min: 200, max: 16000, label: t('lit.set.budget'), unit: t('lit.unit.tokens') },
    { id: 'pin', get: (v) => v.pinLimit, set: (n) => ({ pinLimit: n }), min: 1, max: 20, label: t('lit.set.pinLimit') },
  ]

  // what the chat has set, as the fields show it (set at once, so the first paint is not empty)
  const shown = (): Record<string, string> => Object.fromEntries(rows.map((r) => [r.id, r.get((cc?.own ?? {}) as LitChatValues) === undefined ? '' : String(r.get((cc?.own ?? {}) as LitChatValues))]))
  const [text, setText] = useState<Record<string, string>>(shown)
  const [busy, setBusy] = useState(false)

  // a change that came back from the engine replaces what was typed
  useEffect(() => {
    setText(shown())
    // rows is rebuilt on every render; ownKey and the cut mode are what can change it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownKey, cc?.global.cutMode])

  if (!cc) return <p className="text-sm text-muted-foreground">{t('lit.chatSet.missing')}</p>

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // raw is what the field holds now, read from the field itself: the shared number Input keeps an empty field
  // out of onChange and resets its draft on blur, so the state here never sees "empty"
  const commit = (r: Row, raw: string) => {
    const act = settingAction(raw, r.get(cc.own), r.min, r.max)
    if (act.kind === 'none') return setText({ ...text, [r.id]: act.show })
    setText({ ...text, [r.id]: act.show })
    if (act.kind === 'clear') return void run(() => putLitChatConfig(chat.chatId, r.set(null)).then(onChat))
    void run(() => putLitChatConfig(chat.chatId, r.set(act.n)).then((c) => { onChat(c); toast.success(t('lit.chatSet.saved')) }))
  }

  const field = (r: Row) => {
    const own = r.get(cc.own) !== undefined
    const globalValue = r.get(cc.global)
    return (
      <Field key={r.id}>
        <FieldLabel htmlFor={`lit-chat-${r.id}`} className="font-medium">{r.label}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id={`lit-chat-${r.id}`}
            data-testid={`lit-chat-${r.id}`}
            type="number"
            inputMode="numeric"
            min={r.min}
            max={r.max}
            disabled={busy || !!chat.rebuilding}
            placeholder={String(globalValue ?? '')}
            value={text[r.id] ?? ''}
            onChange={(e) => setText({ ...text, [r.id]: e.target.value })}
            onBlur={(e) => commit(r, e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className={cn('w-32 max-md:h-10', own && 'border-primary/60')}
          />
          {r.unit && <span className="text-xs text-muted-foreground">{r.unit}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{own ? t('lit.chatSet.own', { n: globalValue ?? '' }) : t('lit.chatSet.follows', { n: globalValue ?? '' })}</p>
      </Field>
    )
  }

  const count = ownCount(cc.own)
  return (
    <div className="flex flex-col gap-3" data-testid="lit-chat-settings">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{t('lit.chatSet.title')}</p>
        <p className="text-xs text-muted-foreground">{t('lit.chatSet.hint')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <p className="text-sm font-medium">{t('lit.chatSet.scenes')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.slice(0, 2).map(field)}</div>
        <p className="text-xs text-muted-foreground">{t('lit.chatSet.scenesHint')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <p className="text-sm font-medium">{t('lit.chatSet.prompt')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.slice(2).map(field)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-10"
          data-testid="lit-chat-reset"
          disabled={busy || count === 0 || !!chat.rebuilding}
          onClick={() => void run(() => putLitChatConfig(chat.chatId, { reset: true }).then((c) => { onChat(c); toast.success(t('lit.chatSet.resetToast')) }))}
        >
          {t('lit.chatSet.reset')}
        </Button>
        {chat.rebuilding && <span className="text-xs text-muted-foreground">{t('lit.lockedRebuild')}</span>}
      </div>
    </div>
  )
}
