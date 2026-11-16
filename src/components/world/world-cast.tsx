// "People coming back" (#424): the chat's World DM card for the cast. Frequency, the testing switch (a mark under the reply
// that brought someone back), the bench as the chat stands (who has been silent how long, who is due), the entrance that
// waits or was sent, the last one, the adopt button and the log. Everything a tester needs to see who came, why and how the dice fell.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UsersThree } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { Section } from '@/components/ui/section'
import { Segmented, SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  adoptWorldBench,
  loadWorldCast,
  loadWorldDice,
  refreshDice,
  WORLD_CAST_FREQS,
  type WorldCast,
  type WorldCastFreq,
  type WorldDiceRoll,
  type WorldView,
} from '@/lib/world'
import { useWorldErrorText } from './world-common'

type T = ReturnType<typeof useT>
const SHOWN = 10

/** One return as a line: who, how big, why, the silence, the dice, what came of it. */
export function castLine(t: T, r: WorldDiceRoll): string {
  const band = t(`world.cast.band.${r.band ?? 'small'}` as MsgKey)
  const result = r.result ? t(`world.cast.result.${r.result}` as MsgKey) : t('world.cast.result.waiting')
  const seen = r.seen !== undefined ? ` · ${t('world.cast.named', { n: r.seen })}` : ''
  if (r.via === 'life') return t('world.cast.roll.life', { who: r.who, band, tier: r.tier ? t(`world.dice.tier.${r.tier}` as MsgKey) : '', silence: r.silence ?? 0 }) + seen + ` · ${result}`
  const [d1, d2] = r.d ?? [0, 0]
  const mods = (r.mod ? ` +${r.mod} ${t('world.cast.mod.silence')}` : '') + (r.weight ? ` +${r.weight} ${t('world.cast.mod.weight')}` : '')
  return t('world.cast.roll.silence', { who: r.who, band, silence: r.silence ?? 0, threshold: r.threshold ?? 0, d1, d2, mods, total: r.total ?? d1 + d2 }) + seen + (r.floor ? ` · ${t('world.cast.floor')}` : '') + ` · ${result}`
}

/** The bench and the entrance as the chat stands now (GET /world/cast); read on mount and whenever `stamp` changes (a run, a settings save) or on Refresh. */
function CastStatus({ chatId, stamp, lore }: { chatId: string; stamp: string; lore: (n: number) => void }) {
  const t = useT()
  const [cast, setCast] = useState<WorldCast | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    setFailed(false)
    loadWorldCast(chatId).then((c) => { setCast(c); lore(c.lorePeople) }).catch(() => setFailed(true))
  }, [chatId, lore])
  useEffect(() => { load() }, [load, stamp])

  if (failed) return <p className="px-4 py-3 text-caption text-muted-foreground">{t('chats.panel.loading')}</p>
  if (!cast) return <p className="px-4 py-3 text-caption text-muted-foreground">{t('chats.panel.loading')}</p>
  const due = cast.people.filter((p) => p.due).length
  const summary = cast.people.length ? t('world.cast.benchSummary', { n: cast.people.length, due }) : t('world.cast.benchEmptyShort')
  const band = (b: string) => t(`world.cast.band.${b}` as MsgKey)
  return (
    <Fold id="cast-bench" title={t('world.cast.bench')} summary={summary} flat>
      <div className="flex flex-col gap-2 px-4 py-2" data-testid="cast-status">
        {cast.entrance && (
          <p className="text-caption text-foreground" data-testid="cast-entrance">
            {cast.entrance.sent > 0
              ? t('world.cast.sent', { name: cast.entrance.name, band: band(cast.entrance.band) })
              : t('world.cast.queued', { name: cast.entrance.name, band: band(cast.entrance.band) })}
            {cast.entrance.retried ? ` · ${t('world.cast.retried')}` : ''}
          </p>
        )}
        {cast.last && (
          <p className="text-caption text-muted-foreground">
            {t(cast.last.res === 'mentioned' ? 'world.cast.lastMentioned' : cast.last.ok ? 'world.cast.lastCame' : 'world.cast.lastMissed', { name: cast.people.find((p) => p.id === cast.last?.id)?.name ?? cast.last.id })}
          </p>
        )}
        {cast.freq !== 'off' && cast.wait > 0 && <p className="text-caption text-muted-foreground">{t('world.cast.wait', { n: cast.wait })}</p>}
        {cast.people.length === 0 && <p className="text-caption text-muted-foreground">{t('world.cast.benchEmpty')}</p>}
        {cast.people.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {cast.people.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 text-caption" data-testid="cast-person">
                <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5', p.due ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className="font-medium">{p.name}</span>
                  <span>{t('world.cast.silent', { silence: p.silence, threshold: p.threshold })}{p.named < p.silence ? ` · ${t('world.cast.named', { n: p.named })}` : ''}</span>
                  {p.due && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-caption leading-none text-amber-700 dark:text-amber-300">{t('world.cast.tag.due')}</span>}
                </span>
                <span className="text-caption text-muted-foreground">
                  {[
                    t('world.cast.weight', { n: p.weight }),
                    p.relation ? t(`world.relation.${p.relation}` as MsgKey) : null,
                    p.byId ? t('world.cast.tag.id') : t('world.cast.tag.names'),
                    p.linked ? t('world.cast.tag.linked') : null,
                    p.off ? t('world.cast.tag.off') : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={load} className="self-start text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10">
          {t('world.dice.log.refresh')}
        </button>
      </div>
    </Fold>
  )
}

/** The returns of this chat, newest first, each as one line (who, how big, why, the dice, the result). */
function CastLog({ chatId, stamp }: { chatId: string; stamp: string }) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [rolls, setRolls] = useState<WorldDiceRoll[] | null>(null)
  const load = useCallback(() => {
    loadWorldDice(chatId).then((r) => setRolls(r.rolls.filter((x) => x.kind === 'cast').slice(-SHOWN).reverse())).catch(() => setRolls([]))
  }, [chatId])
  useEffect(() => { load() }, [load, stamp])
  const summary = rolls === null ? t('chats.panel.loading') : rolls.length ? castLine(t, rolls[0]!) : t('world.cast.log.empty')
  return (
    <div data-testid="cast-log">
      <Fold id="cast-log" title={t('world.cast.log')} summary={summary} flat>
        <div className="flex flex-col gap-1 px-4 py-2">
          {rolls && rolls.length === 0 && <p className="text-caption text-muted-foreground">{t('world.cast.log.empty')}</p>}
          {rolls && rolls.length > 0 && (
            <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
              {rolls.map((r, i) => (
                <li key={`${r.at}-${i}`} className="text-foreground">
                  {castLine(t, r)} <span className="text-muted-foreground">· {relativeTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={load} className="self-start text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10">
            {t('world.dice.log.refresh')}
          </button>
        </div>
      </Fold>
    </div>
  )
}

export function CastCard({ chatId, view, save, on }: {
  chatId: string
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  /** the DM is on for this chat (off = the card says so and its controls are disabled) */
  on: boolean
}) {
  const t = useT()
  const errorText = useWorldErrorText()
  const freq = view.settings.cast
  const [lorePeople, setLorePeople] = useState(0)
  const [adopting, setAdopting] = useState(false)
  // anything that can change the bench: a run, a save, the dice, a reply
  const stamp = `${view.lastRunAt ?? 0}|${view.settings.cast}|${view.records}|${view.usage.runs}`

  const adopt = async () => {
    setAdopting(true)
    try {
      const r = await adoptWorldBench(chatId)
      if (!r.ok) toast.error(r.code ? errorText({ code: r.code, message: r.error ?? '' }) : (r.error ?? t('world.cast.adopt.failed')))
      else if (r.none || (!r.added?.length && !r.linked?.length)) toast(t('world.cast.adopt.none'))
      else toast.success(t('world.cast.adopt.done', { added: r.added?.length ?? 0, linked: r.linked?.length ?? 0 }))
      await refreshDice(chatId, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAdopting(false)
    }
  }

  return (
    <Section
      variant="tinted"
      tone="pink"
      icon={UsersThree}
      id="cast"
      title={t('world.card.cast')}
      chips={[t(`world.cast.freq.${freq}` as MsgKey)]}
      dimmed={!on}
      note={on ? undefined : t('world.cast.offNote')}
    >
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="cast-options">
        <span className="text-body font-semibold">{t('world.cast.freq')}</span>
        <Segmented
          label={t('world.cast.freq')}
          value={freq}
          className="w-full [&>button]:flex-1"
          options={WORLD_CAST_FREQS.map((f: WorldCastFreq) => ({ id: f, label: t(`world.cast.freq.${f}` as MsgKey) }))}
          onChange={(v) => { if (on) void save({ cast: v }) }}
        />
        <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="cast-freq-hint">{t(`world.cast.freq.${freq}.hint` as MsgKey)}</p>
      </div>
      <SettingRow label={t('world.cast.show')} info={t('world.cast.showHint')}>
        <Switch
          checked={view.settings.castShow === true}
          disabled={!on}
          onCheckedChange={(v) => void save({ castShow: v }).then(() => refreshDice(chatId, true))}
          aria-label={t('world.cast.show')}
        />
      </SettingRow>
      <CastStatus chatId={chatId} stamp={stamp} lore={setLorePeople} />
      <CastLog chatId={chatId} stamp={stamp} />
      {lorePeople > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3" data-testid="cast-adopt">
          <Button variant="outline" className="w-full max-md:h-11" onClick={() => void adopt()} disabled={!on || adopting}>
            {adopting ? t('world.cast.adopting') : t('world.cast.adopt')}
          </Button>
          <p className="text-caption text-muted-foreground">{t('world.cast.adoptHint', { n: lorePeople })}</p>
        </div>
      )}
    </Section>
  )
}
