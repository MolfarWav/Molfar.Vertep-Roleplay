import { useEffect, useState } from 'react'
import { CheckCircle, MinusCircle, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import type { ImportReport, ReportItem } from '@/lib/preset-report'

const EVENT = 'rp:preset-import-report'

/** Shows the report of a finished preset import (the importer lives in two screens; one dialog serves both). */
export function announceImportReport(name: string, report: ImportReport): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { name, report } }))
}

const BUCKETS = [
  { key: 'came', title: 'presetReport.came', icon: CheckCircle, tone: 'text-emerald-500' },
  { key: 'approx', title: 'presetReport.approx', icon: WarningCircle, tone: 'text-amber-500' },
  { key: 'dropped', title: 'presetReport.dropped', icon: MinusCircle, tone: 'text-muted-foreground' },
] as const

export function PresetImportReportHost() {
  const t = useT()
  const [shown, setShown] = useState<{ name: string; report: ImportReport } | null>(null)
  useEffect(() => {
    const on = (e: Event) => setShown((e as CustomEvent<{ name: string; report: ImportReport }>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])

  const line = (item: ReportItem) => t(`presetReport.${item.id}` as MsgKey, { n: item.n ?? 0 })

  return (
    <Dialog open={!!shown} onOpenChange={(v) => !v && setShown(null)}>
      <DialogContent className="max-w-xl">
        {shown && (
          <>
            <DialogHeader>
              <DialogTitle>{t('presetReport.title', { name: shown.name })}</DialogTitle>
              <DialogDescription>{t('presetReport.intro', { source: t(`presetReport.src.${shown.report.source}` as MsgKey) })}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
              {BUCKETS.map(({ key, title, icon: Icon, tone }) => (
                <section key={key} aria-labelledby={`pr-${key}`}>
                  <h3 id={`pr-${key}`} className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                    <Icon className={`size-4 ${tone}`} aria-hidden="true" weight="fill" />
                    {t(title)}
                    <span className="text-xs font-normal text-muted-foreground">{shown.report[key].length}</span>
                  </h3>
                  {shown.report[key].length === 0 ? (
                    <p className="pl-5.5 text-xs text-muted-foreground">{t('presetReport.none')}</p>
                  ) : (
                    <ul className="space-y-1.5 pl-5.5">
                      {shown.report[key].map((item, i) => (
                        <li key={`${item.id}-${i}`} className="text-sm">
                          {line(item)}
                          {item.names && (
                            <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.names.join(' · ')}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {shown.report.approx.some((i) => i.id === 'assumedOne' || i.id === 'severalAllowed') && (
                <p className="text-xs text-muted-foreground">{t('presetReport.hint')}</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShown(null)}>{t('presetReport.close')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
