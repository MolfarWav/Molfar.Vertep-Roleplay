import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { WeatherIcon, weatherKind, weatherNameKey, weatherTextClass } from './dash-weather'

/**
 * The weather tile: the animated icon, a small "Weather" label, the kind's name in the heading font and
 * the sensor's own words under it (two lines at most). No kind found in the text: just the text, no icon.
 */
export function WeatherTile({ text, night, size = 52, className }: { text: string | null | undefined; night?: boolean; size?: number; className?: string }) {
  const t = useT()
  const raw = (text ?? '').trim()
  if (!raw) return null
  const kind = weatherKind(raw)
  if (!kind) return <div className={cn('min-w-0 text-[12px] leading-snug break-words text-muted-foreground', className)}>{raw}</div>
  const tone = weatherTextClass(kind, night)
  return (
    <div className={cn('grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5', className)} data-testid="dash-weather" data-weather={kind}>
      <WeatherIcon kind={kind} night={night} size={size} />
      <div className="min-w-0">
        <div className="text-caption uppercase tracking-wide text-muted-foreground">{t('dash.wx.label')}</div>
        <div className={cn('font-heading text-[19px] leading-tight break-words', tone)}>{t(weatherNameKey(kind, night))}</div>
        <div className="line-clamp-2 text-[12px] leading-snug text-muted-foreground" title={raw}>{raw}</div>
      </div>
    </div>
  )
}
