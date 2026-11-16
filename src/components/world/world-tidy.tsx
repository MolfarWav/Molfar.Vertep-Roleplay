// "Tidying the book" (#424, step 3): the chat's World DM card for the code tidy-up of things that played out. The switch, how many
// replies to the next pass, how many things sleep in the Archive, "Tidy now" and the log of every archive and every wake (what, why, the
// count that decided it). Everything a tester needs to see what the book did by itself and why.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Broom } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { Section } from '@/components/ui/section'
import { SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { loadWorld, loadWorldTidy, runWorldTidy, type WorldTidy, type WorldTidyLine, type WorldView } from '@/lib/world'

/** One line of the log: which thing, archived or woken, and the count (or the DM) that decided it. */
export function tidyLine(t: ReturnType<typeof useT>, l: WorldTidyLine): string {
  if (l.act === 'archive') return t('world.tidy.line.archive', { name: l.name, n: l.count })
  return l.via === 'dm' ? t('world.tidy.line.wakeDm', { name: l.name }) : t('world.tidy.line.wake', { name: l.name, n: l.count })
}

export function TidyCard({ chatId, view, save, on }: {
  chatId: string
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  /** the DM is on for this chat (off = the card is dimmed; the tidy-up still runs, it needs no model) */
  on: boolean
}) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [tidy, setTidy] = useState<WorldTidy | null>(null)
  const [busy, setBusy] = useState(false)
  // anything that can change what the pass sees: a run, a save, the records
  const stamp = `${view.lastRunAt ?? 0}|${view.settings.tidy}|${view.records}|${view.archive}|${view.usage.runs}`
  const load = useCallback(() => {
    loadWorldTidy(chatId).then(setTidy).catch(() => setTidy(null))
  }, [chatId])
  useEffect(() => { load() }, [load, stamp])

  const now = async () => {
    setBusy(true)
    try {
      const r = await runWorldTidy(chatId)
      setTidy(r)
      toast(r.archived.length || r.woken.length ? t('world.tidy.done', { a: r.archived.length, w: r.woken.length }) : t('world.tidy.doneNone'))
      await loadWorld(chatId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const enabled = view.settings.tidy !== false
  const log = tidy?.log ?? []
  const status = !tidy
    ? ''
    : !tidy.on
      ? t('world.tidy.off')
      : tidy.first
        ? t('world.tidy.first')
        : tidy.next > 0
          ? t('world.tidy.next', { n: tidy.next })
          : t('world.tidy.nextNow')
  return (
    <Section variant="tinted" tone="amber" icon={Broom} id="tidy" title={t('world.tidy.title')} dimmed={!on}>
      <SettingRow label={t('world.tidy.switch')} info={t('world.tidy.hint')}>
        <Switch checked={enabled} onCheckedChange={(v) => void save({ tidy: v })} aria-label={t('world.tidy.switch')} />
      </SettingRow>
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="tidy-status">
        {tidy && (
          <>
            <p className="text-caption text-muted-foreground" data-testid="tidy-counts">{t('world.tidy.counts', { active: tidy.active, asleep: tidy.asleep })}</p>
            <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="tidy-next">{status}</p>
          </>
        )}
        <Button variant="outline" className="w-full max-md:h-11" onClick={() => void now()} disabled={busy} data-testid="tidy-now">
          {t('world.tidy.now')}
        </Button>
      </div>
      <div data-testid="tidy-log">
        <Fold id="tidy-log" title={t('world.tidy.log')} summary={log.length ? tidyLine(t, log[0]!) : t('world.tidy.log.empty')} flat>
          <div className="flex flex-col gap-1 px-4 py-2">
            {log.length === 0 && <p className="text-caption text-muted-foreground">{t('world.tidy.log.empty')}</p>}
            {log.length > 0 && (
              <ul className="flex flex-col gap-1 text-caption">
                {log.slice(0, 30).map((l, i) => (
                  <li key={`${l.at}-${l.id}-${i}`} className="text-foreground">
                    {tidyLine(t, l)} <span className="text-muted-foreground">· {relativeTime(l.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Fold>
      </div>
    </Section>
  )
}

