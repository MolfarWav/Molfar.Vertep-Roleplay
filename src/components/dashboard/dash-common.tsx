import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ageSeconds, type Clock, type DashChar, type DashView } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
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
        <div className="font-heading text-3xl leading-none break-words">{band}</div>
      ) : null}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {clock.time && band && <span>{band}</span>}
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

export function AvatarButton({ name, url, onFocus, focused, className }: {
  name: string
  url?: string
  onFocus: (name: string) => void
  focused?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onFocus(name)}
      aria-label={name}
      title={name}
      className={cn(
        'shrink-0 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        focused ? 'ring-1 ring-cta' : 'opacity-80 hover:opacity-100',
        className,
      )}
    >
      <AvatarImg name={name} url={url} />
    </button>
  )
}

export function NameChip({ char }: { char: DashChar }) {
  const t = useT()
  return (
    <span className="min-w-0 text-[11px] text-muted-foreground break-words">
      {char.name?.knowsUserName ? t('dash.name.known') : t('dash.name.unknown')}
      {char.name?.calls ? ` · ${t('dash.name.calls', { calls: char.name.calls })}` : ''}
    </span>
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

/** "sensor · 1.2 s · insert ≈180 tok" on one wrapping line. */
export function FooterLine({ view, className }: { view: DashView; className?: string }) {
  const t = useT()
  return (
    <div className={cn('flex flex-wrap gap-x-2 text-[11px] text-muted-foreground', className)}>
      <span>{t('dash.footer.sensor', { s: (view.usage.lastMs / 1000).toFixed(1) })}</span>
      <span>·</span>
      <span>{view.insertEnabled && view.insert ? t('dash.footer.insert', { n: view.insert.tokens }) : t('dash.footer.insertOff')}</span>
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[11px] uppercase tracking-wide text-muted-foreground', className)}>{children}</h3>
}

/** A titled box of the wide view and the phone sheet. */
export function Box({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 border border-border bg-card p-3', className)}>
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

/** Open threads first, resolved ones struck through. */
export function ThreadList({ threads, limit, openOnly }: { threads: DashView['threads']; limit?: number; openOnly?: boolean }) {
  const t = useT()
  let list = threads
  if (openOnly) list = list.filter((th) => th.status === 'open')
  if (limit) list = list.slice(0, limit)
  if (list.length === 0) return <p className="text-[11px] text-muted-foreground">{t('dash.threads.none')}</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((th) => (
        <li key={th.id} className={cn('flex gap-1.5 text-xs leading-snug', th.status !== 'open' && 'text-muted-foreground')}>
          <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rotate-45 bg-cta" />
          <span className="min-w-0 flex-1">
            <span className={cn('break-words', th.status !== 'open' && 'line-through')}>{th.text}</span>
            {!openOnly && (
              <span className="ml-2 whitespace-nowrap text-[11px]">
                {th.status === 'open' ? t('dash.thread.since', { n: th.since }) : t('dash.thread.resolved')}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
