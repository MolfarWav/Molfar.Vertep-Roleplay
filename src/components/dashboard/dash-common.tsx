import type { ReactNode } from 'react'
import { PencilSimple } from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ageSeconds, type Clock, type DashChar, type DashView } from '@/lib/dashboard'
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

/** Time (or band word) large, then band · day · minutes, place, weather. */
export function SceneBlock({ clock }: { clock: Clock | null }) {
  const t = useT()
  const tx = useTx()
  if (!clock) return null
  const band = clock.band ? tx('dash.band', clock.band) : null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {clock.time ? (
        <div className="font-heading text-3xl leading-none tabular-nums">{clock.time}</div>
      ) : band ? (
        <div className={cn('flex min-w-0 items-center gap-2 font-heading text-3xl leading-none break-words', bandTextClass(clock.band))}>
          <BandMark band={clock.band} />
          {band}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {clock.time && band && <span className={cn('flex items-center gap-1', bandTextClass(clock.band))}><BandMark band={clock.band} />{band}</span>}
        <span>{t('dash.day', { n: clock.day })}</span>
        {clock.minutes > 0 && <span>{t('dash.minutes', { n: clock.minutes })}</span>}
      </div>
      {clock.place && <div className="min-w-0 text-sm break-words">{clock.place}</div>}
      {clock.weather && <div className="min-w-0 text-sm text-muted-foreground break-words">{clock.weather}</div>}
    </div>
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

export function Notices({ view, className }: { view: DashView; className?: string }) {
  const t = useT()
  if (!view.stale && !view.partial && !view.lastError) return null
  return (
    <div className={cn('flex flex-col gap-1 text-[11px] text-muted-foreground', className)}>
      {view.stale && <span>{t('dash.stale')}</span>}
      {view.partial && <span>{t('dash.partial')}</span>}
      {view.lastError && <span className="break-words">{t('dash.error', { message: view.lastError.message })}</span>}
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

/** A titled box of the wide view and the phone sheet. */
export function Box({ title, children, className, id }: { title?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={cn('min-w-0 border border-border bg-card p-3 outline-none', className)}>
      {title ? <Label className="mb-2">{title}</Label> : null}
      {children}
    </section>
  )
}

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
