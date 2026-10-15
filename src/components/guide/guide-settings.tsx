// Settings → Guide: tours on/off, play the tours or What's new again.
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { GUIDE_BASELINE, resetTours } from '@/lib/guide'

export function GuideSection() {
  const t = useT()
  const guide = useApp((s) => s.settings.guide)
  const update = (next: NonNullable<typeof guide>) => useApp.getState().updateSettings({ guide: next })

  return (
    <div data-guide="settings.guide" className="flex flex-col gap-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('guide.settings.title')}</h3>
      <div className="flex flex-col gap-3 rounded-lg border border-border px-3 py-2.5">
        <label className="flex items-start justify-between gap-3 text-sm">
          <span className="flex min-w-0 flex-col">
            {t('guide.settings.tours')}
            <span className="text-xs text-muted-foreground">{t('guide.settings.toursHint')}</span>
          </span>
          <Switch checked={guide?.showTours !== false} onCheckedChange={(v) => update({ ...guide, showTours: v })} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => { update(resetTours(guide)); toast.success(t('guide.settings.toursReset')) }}
          >
            {t('guide.settings.resetTours')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => {
              update({ ...guide, seen: [], lastVersion: GUIDE_BASELINE })
              toast.success(t('guide.settings.newReset'))
            }}
          >
            {t('guide.settings.resetNew')}
          </Button>
        </div>
      </div>
    </div>
  )
}
