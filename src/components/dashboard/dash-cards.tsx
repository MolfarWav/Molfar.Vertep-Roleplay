// The cards of the Dashboard's Person and Here views. The strip, the phone sheet and the open dashboard all draw
// them from here, so a change is made once. Each card has its tone: attitude violet, mood and state sky,
// outfit and things amber, the place teal.

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Flag, Hand, Handbag, Heart, MapPin, Package, Pulse, TShirt, type Icon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Constellation } from './constellation'
import { HostilityBar, PulseBar, SignedBar } from './dash-bars'
import { AvatarImg, Box, ChangeBadge, CLASS_MARK, GOLD_TEXT, MARK, useTx } from './dash-common'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { DISPOSITION, PULSE, type DashChar, type DashView } from '@/lib/dashboard'
import { outfitEmpty, outfitOf, sensorDifference, thingCount } from '@/lib/dash-outfit'
import { personChanges, tally, type ChangeCount } from '@/lib/dash-changes'
import { saveWorldSettings, type WorldHere } from '@/lib/world'

const CHIP = {
  plain: 'border-border bg-muted text-foreground',
  thing: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  place: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  sleep: 'border-dashed border-border bg-transparent text-muted-foreground',
} as const
export type ChipTone = keyof typeof CHIP

/** A small label in a box: a plain word, a thing (amber), a place (teal) or an "asleep" dashed one. `sub` is the muted where. */
export function Chip({ tone = 'plain', sub, children, className }: { tone?: ChipTone; sub?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 border px-1.5 py-px text-[12px] leading-snug break-words', CHIP[tone], className)}>
      {children}
      {sub ? <span className="text-[11px] opacity-75">{sub}</span> : null}
    </span>
  )
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>
}

/** A group's small uppercase label with its icon (Wearing, In hands, Carried, Nearby, Things here). */
function GroupLabel({ icon: Glyph, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </div>
  )
}

const sameWord = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

// ---------- Attitude ----------

/** The name and class in the bar; the radar on the left, the five stats on the right, the constellation's name and line under them. */
export function AttitudeCard({ name, char, narrow, count }: { name: string; char: DashChar; narrow?: boolean; count?: ChangeCount | null }) {
  const t = useT()
  const tx = useTx()
  return (
    <Box
      title={<span className="font-heading text-[14px] tracking-normal normal-case">{name}</span>}
      tone="people"
      icon={Heart}
      count={count}
      right={<Badge variant="outline" className={cn('rounded-none text-[10px]', MARK[CLASS_MARK[char.cls] ?? 'neutral'])}>{t(`soul.class.${char.cls}`)}</Badge>}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
          <div className="overflow-hidden">
            <Constellation stats={char.stats} prevStats={char.prev?.stats} id={char.constellation} prevId={char.prevConstellation} size={narrow ? 84 : 96} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            {DISPOSITION.map((stat) => (
              <SignedBar key={stat} stat={stat} value={char.stats[stat]} prev={char.prev?.stats[stat]} compact slim />
            ))}
            {char.cls === 'hostile' && char.hostility !== null && <HostilityBar value={char.hostility} slim />}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 leading-tight">
          <span className={cn('font-heading text-[15px]', GOLD_TEXT)}>{tx('dash.const', char.constellation)}</span>
          <span className="text-[11px] text-muted-foreground">{tx('dash.constLine', char.constellation)}</span>
        </div>
      </div>
    </Box>
  )
}

// ---------- Mood and state ----------

/** The mood as one word, "was X", the condition as a chip, the goal in two lines, leads; the two pulse bars when asked for. */
export function MoodBody({ char, pulse }: { char: DashChar; pulse?: boolean }) {
  const t = useT()
  const moodChanged = !!char.mood && !!char.moodWas && !sameWord(char.mood, char.moodWas)
  const has = !!(char.mood || char.condition || char.goal || char.leads)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {pulse && (
        <div className="flex flex-col gap-1.5">
          {PULSE.map((stat) => (
            <PulseBar key={stat} stat={stat} value={char.pulse[stat]} base={char.pulseBase[stat]} prev={char.prev?.pulse[stat]} slim />
          ))}
        </div>
      )}
      {char.mood && (
        <div className={cn('flex min-w-0 flex-wrap items-baseline justify-between gap-x-2', moodChanged && 'border-l-2 border-cta pl-2')}>
          <span className="font-heading text-[19px] leading-tight break-words text-sky-700 dark:text-sky-300">{char.mood}</span>
          {moodChanged && <span className="text-[11px] text-muted-foreground">{t('dash.moodWas', { mood: char.moodWas ?? '' })}</span>}
        </div>
      )}
      {char.condition && <Chips><Chip>{char.condition}</Chip></Chips>}
      {char.goal && (
        <div className="flex min-w-0 items-start gap-1.5 text-[12.5px] leading-snug">
          <Flag className="mt-0.5 size-3.5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
          <span className="sr-only">{t('dash.goal')}:</span>
          <span className="line-clamp-2 min-w-0" title={char.goal}>{char.goal}</span>
        </div>
      )}
      {char.leads && (
        <div className="text-[12px] text-muted-foreground">
          <span className="text-[11px] tracking-wide uppercase">{t('dash.leads')}</span> {char.leads === 'user' ? t('dash.leads.user') : char.leads}
        </div>
      )}
      {!has && !pulse && <p className="text-[12px] text-muted-foreground">{t('dash.mood.none')}</p>}
    </div>
  )
}

export function MoodCard({ char, count, pulse = true }: { char: DashChar; count?: ChangeCount | null; pulse?: boolean }) {
  const t = useT()
  return (
    <Box title={t('dash.pulse')} tone="scene" icon={Pulse} count={count}>
      <MoodBody char={char} pulse={pulse} />
    </Box>
  )
}

// ---------- the DM switch ----------

/** "The World DM is off" with the button that turns it on at the Chronicler level. */
export function DmOffNote({ chatId, onReload }: { chatId: string; onReload: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const on = async () => {
    setBusy(true)
    try {
      await saveWorldSettings(chatId, { profile: 'chronicler' })
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-start gap-1.5 text-[12px] text-muted-foreground" data-testid="dash-dm-off">
      <span>{t('dash.dm.off')}</span>
      <Button size="sm" variant="outline" className="rounded-none max-md:h-10" disabled={busy} onClick={() => void on()}>{t('dash.dm.on')}</Button>
    </div>
  )
}

// ---------- Outfit and things ----------

/** Groups with a small icon and label, then chips: Wearing, In hands, Carried, Nearby. Empty groups are not drawn. */
export function OutfitBody({ name, char, here, chatId, onReload }: { name: string; char: DashChar; here: WorldHere | null; chatId: string; onReload: () => void }) {
  const t = useT()
  const o = outfitOf(name, char, here)
  const diff = sensorDifference(name, here)
  if (outfitEmpty(o)) {
    return (
      <div className="flex flex-col gap-2" data-testid="dash-outfit-empty">
        <p className="border border-dashed border-border px-2.5 py-2 text-[12px] text-muted-foreground">{t('dash.outfit.empty')}</p>
        {here && !here.on && <DmOffNote chatId={chatId} onReload={onReload} />}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {o.wearing.length > 0 && (
        <>
          <GroupLabel icon={TShirt}>{t('dash.outfit.wearing')}</GroupLabel>
          <Chips>{o.wearing.map((w) => <Chip key={w}>{w}</Chip>)}</Chips>
        </>
      )}
      {o.hands.length > 0 && (
        <>
          <GroupLabel icon={Hand}>{t('dash.outfit.hands')}</GroupLabel>
          <Chips>{o.hands.map((h) => <Chip key={h} tone="thing">{h}</Chip>)}</Chips>
        </>
      )}
      {o.carried.length > 0 && (
        <>
          <GroupLabel icon={Handbag}>{t('dash.outfit.carried')}</GroupLabel>
          <Chips>{o.carried.map((c) => <Chip key={c.what} tone="thing" sub={c.where ? `(${c.where})` : undefined}>{c.what}</Chip>)}</Chips>
        </>
      )}
      {o.nearby.length > 0 && (
        <>
          <GroupLabel icon={MapPin}>{t('dash.outfit.nearby')}</GroupLabel>
          <Chips>{o.nearby.map((n) => <Chip key={n} tone="sleep">{n}</Chip>)}</Chips>
        </>
      )}
      {diff && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground" data-testid="dash-sensor-sees">
          {t('dash.outfit.sensorSees', { text: [diff.wearing.join(', '), diff.hands.length ? t('dash.outfit.sensorHands', { hands: diff.hands.join(', ') }) : ''].filter(Boolean).join('; ') })}
        </p>
      )}
    </div>
  )
}

export function OutfitCard({ name, char, here, chatId, onReload, count }: { name: string; char: DashChar; here: WorldHere | null; chatId: string; onReload: () => void; count?: ChangeCount | null }) {
  const t = useT()
  return (
    <Box title={t('dash.outfit.title')} tone="thing" icon={TShirt} count={count}>
      <OutfitBody name={name} char={char} here={here} chatId={chatId} onReload={onReload} />
    </Box>
  )
}

// ---------- the other characters in the scene ----------

const CLASS_BORDER: Record<string, string> = { ally: 'border-emerald-500/50', hostile: 'border-rose-500/50', romantic: 'border-pink-500/50' }

/** Two-column tiles for the other characters present: avatar, name, constellation in gold, counter; a click focuses them. */
export function OthersGrid({ view, here, focus, onFocus, avatars }: { view: DashView; here: WorldHere | null; focus: string; onFocus: (name: string) => void; avatars: Record<string, string | undefined> }) {
  const tx = useTx()
  const others = view.order.filter((n) => n !== focus && view.present.includes(n) && view.chars[n] && !view.chars[n].compact)
  if (others.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-1.5" data-testid="dash-others">
      {others.map((n) => {
        const c = view.chars[n]
        return (
          <button
            key={n}
            type="button"
            onClick={() => onFocus(n)}
            className={cn('grid min-h-10 min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-none border bg-card p-1.5 text-left hover:bg-muted', CLASS_BORDER[c.cls] ?? 'border-border')}
          >
            <span className="relative">
              <AvatarImg name={n} url={avatars[n]} className="size-7" />
              <ChangeBadge count={tally(personChanges(n, c, here))} className="absolute -top-2 -left-2 z-10" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-[13px]">{n}</span>
              <span className={cn('block truncate font-heading text-[11px]', GOLD_TEXT)}>{tx('dash.const', c.constellation)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Here ----------

/**
 * The place: its name in the heading font, how often the story came here, its parent as a chip, two lines of its
 * text and its spots. Without a place record the sensor's own words stand alone with "Not recorded yet".
 */
export function HereBody({ here, scenePlace, chatId, onReload }: { here: WorldHere | null; scenePlace?: string | null; chatId: string; onReload: () => void }) {
  const t = useT()
  const place = here?.place ?? null
  if (place) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-heading text-[18px] leading-tight break-words">{place.name}</span>
          {!!place.visits && <span className="text-[11px] text-muted-foreground">{t('dash.here.visits', { n: place.visits })}</span>}
        </div>
        {here?.parent && <Chips><Chip tone="place">{t('dash.here.in', { name: here.parent.name })}</Chip></Chips>}
        {place.text && <p className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground" title={place.text}>{place.text}</p>}
        {(here?.spots.length ?? 0) > 0 && (
          <>
            <GroupLabelTeal>{t('dash.here.spots')}</GroupLabelTeal>
            <Chips>{here?.spots.map((s) => <Chip key={s.id} tone="place">{s.name}</Chip>)}</Chips>
          </>
        )}
      </div>
    )
  }
  const text = (here?.scenePlace || scenePlace || '').trim()
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="dash-here-empty">
      {text ? (
        <>
          <span className="font-heading text-[18px] leading-tight break-words">{text}</span>
          <p className="border border-dashed border-border px-2.5 py-2 text-[12px] text-muted-foreground">{t('dash.here.unrecorded')}</p>
        </>
      ) : (
        <p className="border border-dashed border-border px-2.5 py-2 text-[12px] text-muted-foreground">{t('dash.here.none')}</p>
      )}
      {here && !here.on && <DmOffNote chatId={chatId} onReload={onReload} />}
    </div>
  )
}

function GroupLabelTeal({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[10.5px] font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-300">{children}</div>
}

export function HereCard({ here, scenePlace, chatId, onReload, count, right }: { here: WorldHere | null; scenePlace?: string | null; chatId: string; onReload: () => void; count?: ChangeCount | null; right?: ReactNode }) {
  const t = useT()
  return (
    <Box title={t('dash.here.title')} tone="place" icon={MapPin} count={count} right={right}>
      <HereBody here={here} scenePlace={scenePlace} chatId={chatId} onReload={onReload} />
    </Box>
  )
}

/** Things lying here, things asleep elsewhere (folded), what the focused character has on them, and a button for each other present character. */
export function ThingsCard({ view, here, focus, onFocus }: { view: DashView; here: WorldHere | null; focus: string; onFocus: (name: string) => void }) {
  const t = useT()
  const char = view.chars[focus]
  const mine = outfitOf(focus, char, here)
  const others = view.order.filter((n) => n !== focus && view.present.includes(n) && view.chars[n] && !view.chars[n].compact)
  const placeName = here?.place?.name ?? ''
  const lying = here?.things ?? []
  const asleep = here?.asleep ?? []
  return (
    <Box title={t('dash.things.title')} tone="thing" icon={Package}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <GroupLabel icon={Package}>{t('dash.things.here')}</GroupLabel>
        {lying.length > 0 ? (
          <Chips>{lying.map((th) => <Chip key={th.id} tone="thing" sub={th.place && !sameWord(th.place, placeName) ? th.place : undefined}>{th.name}</Chip>)}</Chips>
        ) : (
          <p className="text-[12px] text-muted-foreground">{t('dash.things.none')}</p>
        )}
        {asleep.length > 0 && (
          <details className="group">
            <summary className="flex min-h-8 cursor-pointer items-center text-[11px] text-muted-foreground max-md:min-h-10">{t('dash.things.asleep', { n: asleep.length })}</summary>
            <Chips>{asleep.map((th) => <Chip key={th.id} tone="sleep" sub={th.holder ? t('dash.things.with', { name: th.holder }) : th.place}>{th.name}</Chip>)}</Chips>
          </details>
        )}
        <div className="my-1 h-px bg-border" />
        <GroupLabel icon={Hand}>{t('dash.things.on', { name: focus })}</GroupLabel>
        {mine.wearing.length + mine.hands.length > 0 ? (
          <Chips>
            {mine.wearing.map((w) => <Chip key={`w-${w}`}>{w}</Chip>)}
            {mine.hands.map((h) => <Chip key={`h-${h}`} tone="thing">{h}</Chip>)}
          </Chips>
        ) : (
          <p className="text-[12px] text-muted-foreground">{t('dash.things.onNone')}</p>
        )}
        {others.length > 0 && (
          <Chips>
            {others.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onFocus(n)}
                className="inline-flex min-h-8 items-center border border-dashed border-border px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground max-md:min-h-10"
              >
                {t('dash.things.other', { name: n.split(' ')[0] ?? n, n: thingCount(outfitOf(n, view.chars[n], here)) })}
              </button>
            ))}
          </Chips>
        )}
      </div>
    </Box>
  )
}
