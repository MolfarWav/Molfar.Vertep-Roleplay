import { useState, type ReactNode } from 'react'
import { PencilSimple, type Icon } from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ageSeconds, formatStoryDate, type Clock, type DashChar, type DashView } from '@/lib/dashboard'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useLang } from '@/components/dashboard/use-lang'
import { useT } from '@/hooks/use-t'
import { useDashLive, type DashLast } from '@/lib/dash-live'
import { DICTIONARIES, type MsgKey } from '@/lib/i18n'

/**
 * Translate a key built from data (a band, a constellation id, a family...). An id the
 * dictionary does not know falls back to the id with `_` shown as a space, so a new
 * constellation or event family from the plugin still reads as words.
 */
export function useTx(): (prefix: string, id: string) => string {
  const t = useT()
  return (prefix, id) => {
    const key = `${prefix}.${id}`
    return Object.hasOwn(DICTIONARIES.en, key) ? t(key as MsgKey) : id.replace(/_/g, ' ')
  }
}

/** The constellation's gold as text: the fixed gold on dark, a darker one where the page is light. */
export const GOLD_TEXT = 'text-[#9a6a14] dark:text-[#f2c27a]'

/** "just now", "12 s ago", "3 min ago", "2 h ago". */
export function ageLabel(t: ReturnType<typeof useT>, at: number, now: number): string {
  const s = ageSeconds(at, now)
  if (s < 10) return t('dash.age.now')
  if (s < 60) return t('dash.age.s', { n: s })
  if (s < 3600) return t('dash.age.m', { n: Math.floor(s / 60) })
  return t('dash.age.h', { n: Math.floor(s / 3600) })
}

export function AgeText({ at, now }: { at: number; now: number }) {
  const t = useT()
  return <>{ageLabel(t, at, now)}</>
}

export function LiveDot({ at, now }: { at: number; now: number }) {
  const live = ageSeconds(at, now) < 120
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', live ? 'bg-emerald-500' : 'bg-muted-foreground/60')} aria-hidden="true" />
}

/**
 * One look for each time-of-day band (ids as in BANDS): an emoji and a text colour, a darker
 * tone in the light theme and a lighter one in the dark, each at least 4.5:1 on the card.
 */
export const BAND_LOOK: Record<string, { icon: string; text: string }> = {
  dawn: { icon: '🌅', text: 'text-[#b4486a] dark:text-[#f4a8b8]' },
  morning: { icon: '☀️', text: 'text-[#9a6200] dark:text-[#ffd23f]' },
  'late morning': { icon: '🌤️', text: 'text-[#7a6a00] dark:text-[#f2dc7a]' },
  day: { icon: '🌞', text: 'text-[#7a6b25] dark:text-[#fff3c4]' },
  evening: { icon: '🌇', text: 'text-[#b3470f] dark:text-[#ff9a56]' },
  night: { icon: '🌙', text: 'text-[#3a5fb0] dark:text-[#8fb4ff]' },
}

export const bandTextClass = (band: string | null | undefined): string => (band ? BAND_LOOK[band]?.text ?? '' : '')

export function BandMark({ band, className }: { band: string | null | undefined; className?: string }) {
  const look = band ? BAND_LOOK[band] : undefined
  return look ? <span className={cn('shrink-0', className)} aria-hidden="true">{look.icon}</span> : null
}

/** Time (or band word) large, then date · band · day · minutes, place, weather. */
export function SceneBlock({ clock, calendar }: { clock: Clock | null; calendar?: DashView['calendar'] }) {
  const t = useT()
  const tx = useTx()
  const lang = useLang()
  if (!clock) return null
  const band = clock.band ? tx('dash.band', clock.band) : null
  const date = clock.date ? formatStoryDate(clock.date, lang) : null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {clock.time ? (
        <div className="font-heading text-3xl leading-none tabular-nums" title={clock.approx ? t('dash.time.approx') : undefined}>
          {clock.approx && <span aria-hidden="true">~</span>}
          {clock.time}
          {clock.approx && <span className="sr-only">{t('dash.time.approx')}</span>}
        </div>
      ) : band ? (
        <div className={cn('flex min-w-0 items-center gap-2 font-heading text-3xl leading-none break-words', bandTextClass(clock.band))}>
          <BandMark band={clock.band} />
          {band}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {date && <span className="text-foreground" data-testid="dash-date">{date}</span>}
        {clock.time && band && <span className={cn('flex items-center gap-1', bandTextClass(clock.band))}><BandMark band={clock.band} />{band}</span>}
        <span>{t('dash.day', { n: clock.day })}</span>
        {clock.minutes > 0 && <span>{t('dash.minutes', { n: clock.minutes })}</span>}
        <DateEdit clock={clock} calendar={calendar ?? null} />
      </div>
      {clock.place && <div className="min-w-0 text-sm break-words">{clock.place}</div>}
      {clock.weather && <div className="min-w-0 text-sm text-muted-foreground break-words">{clock.weather}</div>}
    </div>
  )
}

/**
 * The pencil next to the date: where the date comes from, a field to set it, "Use today's date" and a switch to
 * hide it. Not shown outside a chat's Dashboard, or before the calendar exists (the first reading makes it).
 */
function DateEdit({ clock, calendar }: { clock: Clock; calendar: DashView['calendar'] | null }) {
  const t = useT()
  const dash = useDashMaybe()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  if (!dash || !calendar) return null
  const hidden = calendar.off
  const run = async (body: { date?: string | null; off?: boolean }) => {
    setBusy(true)
    try {
      await dash.setCalendar(body)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover onOpenChange={(open) => { if (open) setDraft(clock.date ?? '') }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
            aria-label={t('dash.date.edit')}
            title={t('dash.date.edit')}
            data-testid="dash-date-edit"
          />
        }
      >
        <PencilSimple className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-3 font-sans text-xs">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t('dash.date.title')}</p>
          <p className="text-muted-foreground">{t(`dash.date.from.${calendar.source}` as MsgKey)}</p>
        </div>
        {!hidden && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-date-input" className="font-medium">{t('dash.date.today')}</label>
            <div className="flex gap-2">
              <input
                id="dash-date-input"
                type="date"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm max-md:h-10"
              />
              <Button size="sm" className="h-9 max-md:h-10" disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(draft) || draft === clock.date} onClick={() => void run({ date: draft })}>
                {t('dash.date.set')}
              </Button>
            </div>
            <p className="text-muted-foreground">{t('dash.date.hint')}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-medium max-md:min-h-10">
            <Switch checked={!hidden} onCheckedChange={(on) => void run({ off: !on })} disabled={busy} />
            {t('dash.date.show')}
          </label>
          {calendar.source === 'user' && !hidden && (
            <Button variant="ghost" size="sm" className="h-8 max-md:h-10" disabled={busy} onClick={() => void run({ date: null })}>
              {t('dash.date.auto')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const chars = words.length > 1 ? [words[0], words[1]].map((w) => [...w][0]).join('') : [...(words[0] ?? '?')].slice(0, 2).join('')
  return chars.toUpperCase()
}

/** A square avatar (image, else initials). Not interactive: wrap it in a button when it must be. */
export function AvatarImg({ name, url, className }: { name: string; url?: string; className?: string }) {
  return (
    <Avatar className={cn('size-7 rounded-none after:rounded-none', className)}>
      {url ? <AvatarImage src={url} alt={name} className="rounded-none" /> : null}
      <AvatarFallback className="rounded-none text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

/** A click focuses the character; with onPortrait, a click on the focused one opens its portrait dialog. */
export function AvatarButton({ name, url, onFocus, focused, onPortrait, className }: {
  name: string
  url?: string
  onFocus: (name: string) => void
  focused?: boolean
  onPortrait?: (name: string) => void
  className?: string
}) {
  const t = useT()
  const portrait = focused && onPortrait
  const label = portrait ? `${name}: ${t('lit.portrait.change')}` : name
  return (
    <button
      type="button"
      onClick={() => (portrait ? onPortrait(name) : onFocus(name))}
      aria-label={label}
      title={label}
      className={cn(
        'group relative shrink-0 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        focused ? 'ring-1 ring-cta' : 'opacity-80 hover:opacity-100',
        className,
      )}
    >
      <AvatarImg name={name} url={url} />
      {portrait && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
          <PencilSimple className="size-3.5" />
        </span>
      )}
    </button>
  )
}

export function NameChip({ char, onClick }: { char: DashChar; onClick?: () => void }) {
  const t = useT()
  const text = (
    <>
      {char.name?.knowsUserName ? t('dash.name.known') : t('dash.name.unknown')}
      {char.name?.calls ? ` · ${t('dash.name.calls', { calls: char.name.calls })}` : ''}
    </>
  )
  if (!onClick) return <span className="min-w-0 text-[11px] text-muted-foreground break-words">{text}</span>
  return (
    <button type="button" onClick={onClick} title={t('dash.notes.open')} className="min-w-0 rounded-none text-left text-[11px] text-muted-foreground break-words underline-offset-2 hover:text-foreground hover:underline">
      {text}
    </button>
  )
}

/** A failed update in plain words; the raw reason (what the plugin stored) sits behind "Details". */
export function plainDashError(t: ReturnType<typeof useT>, raw: string): string {
  if (/not JSON|had no characters|could not apply/i.test(raw)) return t('dash.err.unreadable')
  if (/429|rate.?limit/i.test(raw)) return t('dash.err.busy')
  if (/whole reply limit thinking/i.test(raw)) return t('dash.err.thinking')
  return t('dash.err.generic')
}

export function DashError({ message, className }: { message: string; className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <span className={cn('min-w-0 break-words', className)}>
      {plainDashError(t, message)}{' '}
      {message && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-none underline underline-offset-2 hover:text-foreground">
          {t('dash.err.details')}
        </button>
      )}
      {open && <code className="mt-1 block break-words font-mono text-[10.5px] opacity-80">{message}</code>}
    </span>
  )
}

export function Notices({ view, className }: { view: DashView; className?: string }) {
  const t = useT()
  const kept = view.keptOut
  if (!view.stale && !view.partial && !view.lastError && !kept) return null
  return (
    <div className={cn('flex flex-col gap-1 text-[11px] text-muted-foreground', className)}>
      {view.stale && <span>{t('dash.stale')}</span>}
      {view.partial && <span>{t('dash.partial')}</span>}
      {view.lastError && <DashError message={view.lastError.message} />}
      {kept && kept.user > 0 && <span className="text-amber-700 dark:text-amber-300" data-testid="dash-kept-user">{t('dash.keptUser', { n: kept.user })}</span>}
      {kept && kept.absent > 0 && <span className="text-amber-700 dark:text-amber-300" data-testid="dash-kept-absent">{t('dash.keptAbsent', { n: kept.absent })}</span>}
      {kept && (kept.noQuote ?? 0) > 0 && <span className="text-amber-700 dark:text-amber-300" data-testid="dash-kept-noquote">{t('dash.keptNoQuote', { n: kept.noQuote ?? 0 })}</span>}
    </div>
  )
}

/** The message of a failed update that no newer snapshot has replaced, else null (the live line and the footer share it). */
export function liveError(last: DashLast | undefined, view: DashView | null): string | null {
  const since = view?.at ?? 0
  if (last && !last.ok && last.at > since) return last.error ?? ''
  if (view?.lastError && view.lastError.at > since) return view.lastError.message
  return null
}

/** "● sensor · 1.2 s · insert ≈180 tok" on one wrapping line; the dot and the first part follow the sensor's state. */
export function FooterLine({ view, chatId, className }: { view: DashView; chatId: string; className?: string }) {
  const t = useT()
  const running = useDashLive((s) => !!s.running[chatId]) && view.mode !== 'manual'
  const last = useDashLive((s) => s.last[chatId])
  const failed = liveError(last, view) !== null
  const state = running ? 'running' : failed ? 'error' : view.stale ? 'stale' : 'ready'
  const dot = { running: 'animate-pulse bg-amber-500', error: 'bg-amber-500', stale: 'bg-muted-foreground/60', ready: 'bg-emerald-500' }[state]
  const text = { running: 'text-amber-600 dark:text-amber-400', error: 'text-amber-600 dark:text-amber-400', stale: 'text-muted-foreground', ready: 'text-muted-foreground' }[state]
  const label = state === 'running' ? t('dash.footer.running')
    : state === 'error' ? t('dash.footer.error')
      : state === 'stale' ? t('dash.footer.stale')
        : view.fast ? t('dash.footer.fast')
          : t('dash.footer.sensor', { s: (view.usage.lastMs / 1000).toFixed(1) })
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground', className)}>
      <span className={cn('flex items-center gap-1.5', text)} aria-live="polite">
        <span className={cn('inline-block size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
        {label}
      </span>
      <span>·</span>
      <span>{view.insertEnabled && view.insert ? t('dash.footer.insert', { n: view.insert.tokens }) : t('dash.footer.insertOff')}</span>
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[11px] uppercase tracking-wide text-muted-foreground', className)}>{children}</h3>
}

/**
 * One hue per kind of content, not per box: scene = what is going on now, people = how they stand to each
 * other, memory = what is known and promised, plot = what is still open. The hue is only a tint over the
 * theme's own surface (a translucent fill and border) and its text is the 700/300 step, so every theme keeps
 * its own ground; the title and its icon always name the block, colour never carries it alone.
 */
export type Tone = 'scene' | 'people' | 'memory' | 'plot'
export const TONE: Record<Tone, { bar: string; text: string }> = {
  scene: { bar: 'border-sky-500/35 bg-sky-500/12', text: 'text-sky-700 dark:text-sky-300' },
  people: { bar: 'border-violet-500/35 bg-violet-500/12', text: 'text-violet-700 dark:text-violet-300' },
  memory: { bar: 'border-emerald-500/35 bg-emerald-500/12', text: 'text-emerald-700 dark:text-emerald-300' },
  plot: { bar: 'border-pink-500/35 bg-pink-500/12', text: 'text-pink-700 dark:text-pink-300' },
}

/** A block's title on a tinted bar with its icon; `className` places it (a box bleeds it to its edges). */
export function TitleBar({ tone, icon: Glyph, children, className }: { tone: Tone; icon?: Icon; children: ReactNode; className?: string }) {
  const look = TONE[tone]
  return (
    <div className={cn('flex min-w-0 items-center gap-2 border-b px-3 py-1.5', look.bar, className)}>
      {Glyph ? <Glyph className={cn('size-4 shrink-0', look.text)} aria-hidden="true" /> : null}
      <Label className={cn('min-w-0 font-semibold break-words', look.text)}>{children}</Label>
    </div>
  )
}

/** A titled box of the wide view and the phone sheet; with a `tone` the title sits on a tinted bar. */
export function Box({ title, tone, icon, children, className, id, 'data-guide': guide }: { title?: ReactNode; tone?: Tone; icon?: Icon; children: ReactNode; className?: string; id?: string; 'data-guide'?: string }) {
  return (
    <section id={id} data-guide={guide} tabIndex={id ? -1 : undefined} className={cn('min-w-0 border border-border bg-card p-3 outline-none', className)}>
      {title && tone ? <TitleBar tone={tone} icon={icon} className="-mx-3 -mt-3 mb-3">{title}</TitleBar> : title ? <Label className="mb-2">{title}</Label> : null}
      {children}
    </section>
  )
}

/** A heading with no box of its own (the phone and strip views): the tone's text colour and icon, no bar. */
export function ToneLabel({ tone, icon: Glyph, children }: { tone: Tone; icon?: Icon; children: ReactNode }) {
  const look = TONE[tone]
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {Glyph ? <Glyph className={cn('size-3.5 shrink-0', look.text)} aria-hidden="true" /> : null}
      <Label className={cn('font-semibold', look.text)}>{children}</Label>
    </div>
  )
}

/** A mark's colour by what it says, as border + tint + text like the other chips. Always beside its word. */
export const MARK = {
  neutral: 'border-border text-muted-foreground',
  good: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  bad: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  strong: 'border-rose-500/70 bg-rose-500/20 font-semibold text-rose-700 dark:text-rose-200',
  power: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  body: 'border-pink-500/50 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
} as const
export type Mark = keyof typeof MARK

/** How much an event weighs: routine is quiet, significant is amber, pivotal is the loudest. */
export const WEIGHT_MARK: Record<string, Mark> = { routine: 'neutral', significant: 'warn', pivotal: 'strong' }
/** What an event is about: bonds green, a fight red, power orange, the body pink, knowledge blue. */
export const FAMILY_MARK: Record<string, Mark> = { trust: 'good', warmth: 'good', care: 'good', conflict: 'bad', power: 'power', body: 'body', knowledge: 'info' }
/** How a character knows a note: saw it, heard it, or only guesses. */
export const HOW_TEXT: Record<string, string> = {
  saw: 'text-emerald-700 dark:text-emerald-300',
  heard: 'text-sky-700 dark:text-sky-300',
  guess: 'text-amber-700 dark:text-amber-300',
}
/** What was said: dangers red, a hidden truth amber, a pledge or an open word green. */
export const SAID_MARK: Record<string, Mark> = { threat: 'bad', order: 'bad', lie: 'warn', secret: 'warn', vow: 'good', promise: 'good', confession: 'good' }
/** How a character stands to you, as the class badge and tab text. */
export const CLASS_MARK: Record<string, Mark> = { romantic: 'body', ally: 'good', hostile: 'bad' }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>{' '}
      <span className="break-words">{children}</span>
    </div>
  )
}

/** Mood, condition, outfit, holding, goal, leads: a row with no value is not rendered. */
export function CharFields({ char }: { char: DashChar }) {
  const t = useT()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {char.mood && (
        <Field label={t('dash.mood')}>
          {char.mood}
          {char.moodWas && <span className="ml-1 text-[11px] text-muted-foreground">({t('dash.moodWas', { mood: char.moodWas })})</span>}
        </Field>
      )}
      {char.condition && <Field label={t('dash.condition')}>{char.condition}</Field>}
      {char.outfit && <Field label={t('dash.outfit')}>{char.outfit}</Field>}
      {char.holding && <Field label={t('dash.holding')}>{char.holding}</Field>}
      {char.goal && <Field label={t('dash.goal')}>{char.goal}</Field>}
      {char.leads && <Field label={t('dash.leads')}>{char.leads === 'user' ? t('dash.leads.user') : char.leads}</Field>}
    </div>
  )
}
