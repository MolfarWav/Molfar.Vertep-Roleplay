// "Meanwhile" (#449, M1b): the chat's World DM card for life off screen. The switch (one for all chats), what the panel may show,
// when the next pass runs and with which model, "Run a pass now", the events so far and the log of every pass (when, why, how many
// events the model offered and the rules kept, why one was dropped). Everything a tester needs to see what the pass did and why.
// The events are what the story's people did; the player's character never knows them. Under "Nothing" and "Hints" the text stays hidden.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Hourglass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { Section } from '@/components/ui/section'
import { Segmented, SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import {
  loadMeanwhile,
  runMeanwhile,
  saveMeanwhileConfig,
  useMeanwhileLive,
  type MeanwhileEvent,
  type MeanwhileLogEntry,
  type MeanwhileSpoilers,
  type MeanwhileState,
} from '@/lib/meanwhile'

type T = ReturnType<typeof useT>

/** One event as the panel's spoiler setting allows: who, where and when always; the text only under "Everything". */
export function eventLine(t: T, e: MeanwhileEvent): string {
  const vis = t(`world.mw.vis.${e.visibility}` as MsgKey)
  if (e.what) return `${e.what} (${[...(e.who ?? []), e.where, e.when].filter(Boolean).join(', ')}) · ${vis}`
  if (!e.who) return t('world.mw.event.none', { vis })
  return t('world.mw.event.hint', { who: e.who.join(', '), where: [e.where, e.when].filter(Boolean).join(', ') || '…', vis })
}

/** One pass of the log: why it ran, how many events the model offered and the rules kept, why the rest went, or the error. */
export function logLine(t: T, l: MeanwhileLogEntry): string {
  const why = t(`world.mw.reason.${l.reason}` as MsgKey)
  if (l.error) return t('world.mw.log.failed', { why, error: l.error })
  const base = t('world.mw.log.line', { why, kept: l.kept, offered: l.offered })
  return l.dropped.length ? `${base} ${t('world.mw.log.dropped', { reasons: l.dropped.join('; ') })}` : base
}

/** What the next pass waits for, in words. */
export function dueText(t: T, due: MeanwhileState['due'], hours: number): string {
  if (due.reason === 'clock') return t('world.mw.due.clock', { span: Math.max(1, Math.round(due.spanMinutes / 60)) })
  if (due.reason === 'few') return t('world.mw.due.few', { n: due.replies })
  if (due.reason === 'quiet') return t('world.mw.due.quiet', { h: hours })
  return t(`world.mw.due.${due.reason}` as MsgKey)
}

const FROM_KEY = { meanwhile: 'world.mw.from.meanwhile', world: 'world.mw.from.world', sensor: 'world.mw.from.sensor', litopys: 'world.mw.from.litopys', chat: 'world.mw.from.chat', default: 'world.mw.from.default', none: 'world.mw.from.none' } as const

export function MeanwhileCard({ chatId }: { chatId: string }) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [state, setState] = useState<MeanwhileState | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const stamp = useMeanwhileLive((s) => s.stamp)
  const load = useCallback(() => {
    loadMeanwhile(chatId).then(setState).catch(() => setState(null))
  }, [chatId])
  useEffect(() => { load() }, [load, stamp])

  // the plugin is missing (an older app) or still loading: no card
  if (!state) return null
  const cfg = state.config
  const save = async (patch: Parameters<typeof saveMeanwhileConfig>[0]) => {
    try {
      await saveMeanwhileConfig(patch)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const now = async () => {
    setBusy(true)
    try {
      const r = await runMeanwhile(chatId, true)
      if (r.ok) toast(r.kept ? t('world.mw.done', { n: r.kept }) : t('world.mw.doneNone'))
      else toast.error(t('world.mw.notRun', { why: t(`world.mw.why.${r.reason ?? 'error'}` as MsgKey) }))
      load()
    } finally {
      setBusy(false)
    }
  }
  const events = state.events
  const log = state.log
  const model = state.model.model ? t('world.mw.model', { model: state.model.model, from: t(FROM_KEY[state.model.from]) }) : t('world.mw.model.none')
  return (
    <Section variant="tinted" tone="pink" icon={Hourglass} id="meanwhile" title={t('world.mw.title')}>
      <SettingRow label={t('world.mw.switch')} info={t('world.mw.hint')}>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => void save({ enabled: v })} aria-label={t('world.mw.switch')} data-testid="mw-switch" />
      </SettingRow>
      {cfg.enabled && (
        <>
          <SettingRow label={t('world.mw.spoilers')} info={t('world.mw.spoilers.hint')}>
            <Segmented<MeanwhileSpoilers>
              label={t('world.mw.spoilers')}
              value={cfg.spoilers}
              options={[{ id: 'none', label: t('world.mw.sp.none') }, { id: 'hints', label: t('world.mw.sp.hints') }, { id: 'all', label: t('world.mw.sp.all') }]}
              onChange={(v) => void save({ spoilers: v })}
            />
          </SettingRow>
          <div className="flex flex-col gap-2 px-4 py-3" data-testid="mw-status">
            <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="mw-due">{dueText(t, state.due, cfg.clockHours)}</p>
            <p className="text-caption text-muted-foreground" data-testid="mw-model">{model}</p>
            <Button variant="outline" className="w-full max-md:h-11" onClick={() => void now()} disabled={busy} data-testid="mw-now">
              {busy ? t('world.mw.running') : t('world.mw.now')}
            </Button>
          </div>
          <div data-testid="mw-events">
            <Fold id="mw-events" title={t('world.mw.events')} summary={t('world.mw.events.count', { n: events.length })} flat>
              <div className="flex flex-col gap-1 px-4 py-2">
                {events.length === 0 && <p className="text-caption text-muted-foreground">{t('world.mw.events.empty')}</p>}
                {events.length > 0 && (
                  <ul className="flex flex-col gap-1.5 text-caption">
                    {events.slice(0, 30).map((e) => (
                      <li key={e.id} className="break-words text-foreground">{eventLine(t, e)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Fold>
          </div>
          <div data-testid="mw-log">
            <Fold id="mw-log" title={t('world.mw.log')} summary={log.length ? logLine(t, log[0]!) : t('world.mw.log.empty')} flat>
              <div className="flex flex-col gap-1 px-4 py-2">
                {log.length === 0 && <p className="text-caption text-muted-foreground">{t('world.mw.log.empty')}</p>}
                {log.length > 0 && (
                  <ul className="flex flex-col gap-1.5 text-caption">
                    {log.slice(0, 30).map((l) => (
                      <li key={l.at} className="break-words text-foreground">
                        {logLine(t, l)} <span className="text-muted-foreground">· {relativeTime(l.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Fold>
          </div>
        </>
      )}
    </Section>
  )
}
