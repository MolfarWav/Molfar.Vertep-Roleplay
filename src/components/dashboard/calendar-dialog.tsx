import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { CUSTOM_CALENDAR_LIMITS, type CustomCalendar, type CustomDate } from '@/lib/dashboard'

type Row = { name: string; days: string }

const SAMPLE: Row[] = ['Frostmoon', 'Thawmoon', 'Seedmoon', 'Rainmoon', 'Greenmoon', 'Sunmoon', 'Highmoon', 'Harvestmoon', 'Reapmoon', 'Fogmoon', 'Darkmoon', 'Yulemoon'].map((name) => ({ name, days: '30' }))

const field = 'h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm max-md:h-10'

/** The weekday names as one line the person types ("Moonday, Fireday"), and back. */
const splitWeekdays = (s: string): string[] => s.split(',').map((w) => w.trim()).filter(Boolean)

/**
 * The calendar of a world with its own months (#272): month names and lengths, optional weekday names and an era, and
 * the date of the story's present day in it. Saved through the Dashboard's calendar route; the real calendar is one
 * button away ("Use the real calendar"). Nothing here is needed for an ordinary chat.
 */
export function CalendarDialog({ open, onOpenChange, current, today, busy, onSave, onReal }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: CustomCalendar | null
  /** the date of the story's present day in the current calendar, to start the form from */
  today: CustomDate | null
  busy: boolean
  onSave: (custom: CustomCalendar, present: CustomDate) => void
  onReal: () => void
}) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(SAMPLE)
  const [weekdays, setWeekdays] = useState('')
  const [era, setEra] = useState('')
  const [y, setY] = useState('1')
  const [m, setM] = useState('1')
  const [d, setD] = useState('1')
  const [wd, setWd] = useState('0')

  useEffect(() => {
    if (!open) return
    setRows(current ? current.months.map((x) => ({ name: x.name, days: String(x.days) })) : SAMPLE)
    setWeekdays(current?.weekdays?.join(', ') ?? '')
    setEra(current?.era ?? '')
    setY(String(today?.y ?? 1))
    setM(String(today?.m ?? 1))
    setD(String(today?.d ?? 1))
    setWd(String(today?.wd ?? 0))
  }, [open, current, today])

  const days = rows.map((r) => Number(r.days))
  const rowsOk = rows.length >= 1 && rows.length <= CUSTOM_CALENDAR_LIMITS.months
    && rows.every((r, i) => r.name.trim() !== '' && Number.isInteger(days[i]) && days[i]! >= 1 && days[i]! <= CUSTOM_CALENDAR_LIMITS.days)
  const names = splitWeekdays(weekdays)
  const mi = Number(m)
  const present: CustomDate = { y: Number(y), m: mi, d: Number(d), ...(names.length && Number(wd) > 0 ? { wd: Number(wd) } : {}) }
  const dateOk = Number.isInteger(present.y) && Math.abs(present.y) <= CUSTOM_CALENDAR_LIMITS.year && Number.isInteger(mi) && mi >= 1 && mi <= rows.length
    && Number.isInteger(present.d) && present.d >= 1 && present.d <= (days[mi - 1] ?? 0)
  const ok = rowsOk && dateOk && names.length <= CUSTOM_CALENDAR_LIMITS.weekdays
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const save = () => onSave({ months: rows.map((r, i) => ({ name: r.name.trim(), days: days[i]! })), ...(names.length ? { weekdays: names } : {}), ...(era.trim() ? { era: era.trim() } : {}) }, present)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-lg" data-testid="calendar-dialog">
        <DialogHeader>
          <DialogTitle>{t('dash.cal.title')}</DialogTitle>
          <DialogDescription>{t('dash.cal.intro')}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-1.5" aria-labelledby="cal-months">
          <h3 id="cal-months" className="text-sm font-medium">{t('dash.cal.months')}</h3>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5" data-testid="calendar-month">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}</span>
                <Input value={r.name} maxLength={CUSTOM_CALENDAR_LIMITS.name} placeholder={t('dash.cal.monthName')} aria-label={t('dash.cal.monthNameN', { n: i + 1 })}
                  className="h-9 min-w-0 flex-1 max-md:h-10" onChange={(e) => setRow(i, { name: e.target.value })} />
                <input type="number" inputMode="numeric" min={1} max={CUSTOM_CALENDAR_LIMITS.days} value={r.days} aria-label={t('dash.cal.monthDaysN', { n: i + 1 })}
                  className={`${field} w-16 shrink-0 tabular-nums`} onChange={(e) => setRow(i, { days: e.target.value })} />
                <span className="shrink-0 text-xs text-muted-foreground">{t('dash.cal.daysUnit')}</span>
                <Button variant="ghost" size="icon" className="size-8 shrink-0 max-md:size-10" disabled={rows.length < 2} aria-label={t('dash.cal.removeMonthN', { n: i + 1 })}
                  onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                  <Trash className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-9 max-md:h-10" disabled={rows.length >= CUSTOM_CALENDAR_LIMITS.months} onClick={() => setRows((rs) => [...rs, { name: '', days: '30' }])}>
              <Plus className="size-4" aria-hidden="true" />{t('dash.cal.addMonth')}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 max-md:h-10" onClick={() => setRows(SAMPLE)}>{t('dash.cal.sample')}</Button>
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="cal-extra">
          <h3 id="cal-extra" className="text-sm font-medium">{t('dash.cal.extra')}</h3>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">{t('dash.cal.weekdays')}</span>
            <Input value={weekdays} placeholder={t('dash.cal.weekdaysExample')} className="h-9 max-md:h-10" onChange={(e) => setWeekdays(e.target.value)} />
            <span className="text-muted-foreground">{t('dash.cal.weekdaysHint', { max: CUSTOM_CALENDAR_LIMITS.weekdays })}</span>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">{t('dash.cal.era')}</span>
            <Input value={era} maxLength={CUSTOM_CALENDAR_LIMITS.name} placeholder={t('dash.cal.eraExample')} className="h-9 max-md:h-10" onChange={(e) => setEra(e.target.value)} />
          </label>
        </section>

        <section className="flex flex-col gap-1.5" aria-labelledby="cal-today">
          <h3 id="cal-today" className="text-sm font-medium">{t('dash.cal.today')}</h3>
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] gap-2 text-xs">
            <label className="flex flex-col gap-1"><span className="font-medium">{t('dash.cal.day')}</span>
              <input type="number" inputMode="numeric" min={1} value={d} className={`${field} tabular-nums`} onChange={(e) => setD(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className="font-medium">{t('dash.cal.month')}</span>
              <select value={m} className={field} onChange={(e) => setM(e.target.value)}>
                {rows.map((r, i) => <option key={i} value={i + 1}>{r.name.trim() || t('dash.cal.monthN', { n: i + 1 })}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="font-medium">{t('dash.cal.year')}</span>
              <input type="number" inputMode="numeric" value={y} className={`${field} tabular-nums`} onChange={(e) => setY(e.target.value)} />
            </label>
          </div>
          {names.length > 0 && (
            <label className="flex flex-col gap-1 text-xs"><span className="font-medium">{t('dash.cal.weekdayToday')}</span>
              <select value={wd} className={field} onChange={(e) => setWd(e.target.value)}>
                {names.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-muted-foreground">{t('dash.cal.todayHint')}</p>
        </section>

        {/* the footer stays in view while the months scroll, and carries the reason Save is off: on a phone the field that is wrong may be far above */}
        <DialogFooter className="sticky bottom-0 z-10 gap-2 sm:flex-wrap">
          {current && <Button variant="ghost" className="max-md:h-10 sm:mr-auto" disabled={busy} onClick={onReal}>{t('dash.cal.real')}</Button>}
          <Button variant="outline" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('dash.cal.cancel')}</Button>
          <Button className="max-md:h-10" disabled={busy || !ok} onClick={save}>{t('dash.cal.save')}</Button>
          {!ok && <p className="text-xs text-destructive sm:order-first sm:basis-full" role="alert" data-testid="calendar-problem">{!rowsOk ? t('dash.cal.monthsBad', { max: CUSTOM_CALENDAR_LIMITS.days }) : !dateOk ? t('dash.cal.dateBad') : t('dash.cal.weekdaysBad', { max: CUSTOM_CALENDAR_LIMITS.weekdays })}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
