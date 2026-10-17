import { Switch } from '@/components/ui/switch'
import { Field, FieldLabel } from '@/components/ui/field'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import type { AttentionKind } from '@/lib/attention'
import type { MsgKey } from '@/lib/i18n'

/** The per-kind "tell me" switch (#55), placed next to the thing it is about. */
export function NeedsYouSwitch({ kind, label, hint }: { kind: AttentionKind; label: MsgKey; hint: MsgKey }) {
  const t = useT()
  const on = useApp((s) => s.settings.attention?.[kind] !== false)
  const set = (v: boolean) => {
    const cur = useApp.getState().settings.attention ?? {}
    useApp.getState().updateSettings({ attention: { ...cur, [kind]: v } })
  }
  const id = `needs-you-${kind}`
  return (
    <Field orientation="horizontal">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{t(label)}</FieldLabel>
        <p className="text-xs text-muted-foreground">{t(hint)}</p>
      </div>
      <Switch id={id} checked={on} onCheckedChange={set} />
    </Field>
  )
}
