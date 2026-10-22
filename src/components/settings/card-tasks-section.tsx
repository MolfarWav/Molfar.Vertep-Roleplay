import { ModelPicker } from '@/components/settings/model-picker'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'

/** The app-wide model for card tasks (GitHub #104): what Structure it, Fill empty and the Soul rating use for a
 *  card that names no model of its own. Separate from the Dashboard's settings, so a model picked for the
 *  sensor's short JSON does not have to write card text. */
export function CardTasksSection() {
  const t = useT()
  const model = useApp((s) => s.settings.cardTasks?.model ?? '')
  const updateSettings = useApp((s) => s.updateSettings)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{t('ct.app.title')}</p>
        <p className="text-xs text-muted-foreground">{t('ct.app.hint')}</p>
      </div>
      <ModelPicker value={model} onChange={(v) => updateSettings({ cardTasks: { model: v } })} chatDefaultLabel={t('ct.app.follow')} ariaLabel={t('ct.app.title')} />
    </div>
  )
}
