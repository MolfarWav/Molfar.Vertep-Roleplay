import { CaretRight, ClockCountdown, Funnel, PushPin, Snowflake, Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Chip } from '@/components/ui/section'
import { Switch } from '@/components/ui/switch'
import { TONES, type ToneName } from '@/components/ui/tone'
import { LoreStatusIcon } from '@/components/lore-status-icon'
import { POSITION_SHORT_KEY, STATUS_KEY, canonicalPosition } from '@/components/lore/lore-labels'
import { useT } from '@/hooks/use-t'
import { needsKeys } from '@/lib/lore-filters'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import type { EntryStatus, LoreEntry } from '@/lib/types'

/** The tone of each entry status: the same colours the filter chips use. */
export const STATUS_TONE: Record<EntryStatus, ToneName> = { constant: 'amber', normal: 'sky', vectorized: 'violet' }

/** One row of an entry: status, title, keys and the small badges for what is set. Two lines on a phone. `open` marks the entry the side panel shows. */
export function EntryRowHead({ e, open, selecting, checked, onCheck, onToggle, onEnable }: {
  e: LoreEntry
  open: boolean
  /** the select-several mode shows the checkbox */
  selecting: boolean
  checked: boolean
  onCheck: (v: boolean) => void
  onToggle: () => void
  onEnable: (v: boolean) => void
}) {
  const t = useT()
  const pos = canonicalPosition(e.position)
  const posLabel = pos === 'at_depth' ? t('lore.posShort.at_depth', { n: e.depth }) : t(POSITION_SHORT_KEY[pos] ?? 'lore.posShort.before_char')
  const hasFilter = e.characterFilter.length > 0 || e.tagFilter.length > 0 || e.triggerFilters.length > 0
  const waits = typeof e.delayUntilRecursion === 'number' ? e.delayUntilRecursion : e.delayUntilRecursion ? 1 : 0
  const timed: { icon: typeof PushPin; n: number; tip: string }[] = [
    ...(e.sticky > 0 ? [{ icon: PushPin, n: e.sticky, tip: t('lore.badge.sticky', { n: e.sticky }) }] : []),
    ...(e.cooldown > 0 ? [{ icon: Snowflake, n: e.cooldown, tip: t('lore.badge.cooldown', { n: e.cooldown }) }] : []),
    ...(e.delay > 0 ? [{ icon: ClockCountdown, n: e.delay, tip: t('lore.badge.delay', { n: e.delay }) }] : []),
  ]
  const warn = needsKeys(e)
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      {selecting ? (
        <label className="-my-1 -ml-1 flex size-10 shrink-0 items-center justify-center md:size-8">
          <input
            type="checkbox"
            checked={checked}
            onChange={(ev) => onCheck(ev.target.checked)}
            aria-label={t('lore.entry.select', { title: e.title })}
            className="size-4 accent-primary"
          />
        </label>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex w-full min-w-0 items-start gap-2">
          <CaretRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="line-clamp-2 min-w-0 flex-1 text-body font-medium break-words">{e.title}</span>
          <span className="shrink-0 pt-0.5 text-caption text-muted-foreground">{t('lore.header.tokens', { n: formatTokens(estimateTokens(e.content)) })}</span>
        </span>
        <span className="flex w-full flex-wrap items-center gap-1.5 pl-6">
          <Chip tone={STATUS_TONE[e.status]} className="gap-1">
            <LoreStatusIcon status={e.status} />
            {t(STATUS_KEY[e.status])}
          </Chip>
          {e.keys.slice(0, 3).map((k) => (
            <Badge key={k} variant="secondary" className="min-w-0 max-w-40 text-caption"><span className="truncate">{k}</span></Badge>
          ))}
          {e.keys.length > 3 && <span className="text-caption text-muted-foreground">+{e.keys.length - 3}</span>}
          {warn && (
            <span className={`flex w-full items-center gap-1 text-caption ${TONES.amber.ink}`}>
              <Warning className="size-3.5 shrink-0" aria-hidden="true" />
              {t('lore.needsKeys')}
            </span>
          )}
          <Badge variant="outline" className="text-caption font-normal text-muted-foreground" title={t('lore.badge.position')}>{posLabel}</Badge>
          {e.probability < 100 && <Badge variant="outline" className="text-caption font-normal text-muted-foreground" title={t('lore.ed.trigger')}>{e.probability}%</Badge>}
          {timed.map(({ icon: Icon, n, tip }) => (
            <span key={tip} className="flex items-center gap-0.5 text-caption text-muted-foreground" title={tip} aria-label={tip}>
              <Icon className="size-3" aria-hidden="true" />{n}
            </span>
          ))}
          {waits > 0 && (
            <span className="text-caption text-muted-foreground" title={t('lore.badge.waits', { n: waits })} aria-label={t('lore.badge.waits', { n: waits })}>↻{waits}</span>
          )}
          {e.group && <Badge variant="outline" className="max-w-32 text-caption font-normal text-muted-foreground" title={t('lore.badge.group', { group: e.group })}><span className="truncate">{e.group}</span></Badge>}
          {hasFilter && (
            <span className="text-muted-foreground" title={t('lore.badge.filters')} aria-label={t('lore.badge.filters')}>
              <Funnel className="size-3" aria-hidden="true" />
            </span>
          )}
        </span>
      </button>
      <Switch tone="cta" className="mt-1.5" checked={e.enabled} onCheckedChange={onEnable} aria-label={t('lore.entry.enable', { title: e.title })} />
    </div>
  )
}
