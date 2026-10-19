import { useEffect, useMemo, useRef } from 'react'
import { BellSimple, CaretRight, Scroll, Sparkle, Warning, X } from '@phosphor-icons/react'
import { useApp } from '@/lib/store'
import { dismissFailure, failKey, useAttention, useInbox, inboxRows, workerName, type InboxFilter, type InboxRow } from '@/lib/attention'
import { APP_VERSION, TIPS } from '@/lib/guide-tips'
import { tipText } from '@/lib/guide'
import { resolveLanguage } from '@/lib/i18n'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { useIsDesktop, useIsWideRail } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NeedsYouBadge } from '@/components/shell/needs-you-badge'

export { useInbox }

/** The rows, the total and the failure count, from the sources and the per-kind switches. */
export function useInboxRows() {
  const litopys = useAttention((s) => s.litopys)
  const litNames = useAttention((s) => s.litNames)
  const soul = useAttention((s) => s.soul)
  const failed = useAttention((s) => s.failed)
  const dismissed = useAttention((s) => s.dismissed)
  const settings = useApp((s) => s.settings.attention)
  const language = useApp((s) => s.settings.language)
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  return inboxRows({
    settings,
    litopys,
    soul,
    failed,
    dismissed,
    lang: resolveLanguage(language),
    chatName: (chatId) => {
      const chat = chats.find((c) => c.id === chatId)
      return chat?.title || characters.find((c) => c.id === chat?.characterId)?.name || litNames[chatId] || ''
    },
    cardName: (id) => characters.find((c) => c.id === id)?.name ?? '',
  })
}

/** The number on the inbox button, and how many of it are failures (the badge turns red). */
export function useInboxBadge() {
  const { total, failures } = useInboxRows()
  return { total, failures }
}

/** The number on the inbox button. */
export const useInboxTotal = () => useInboxRows().total

function openRow(row: InboxRow) {
  useInbox.getState().setOpen(false)
  const app = useApp.getState()
  if (row.kind === 'litopys') app.focusLibraryChat(row.chatId)
  else if (row.kind === 'soul') app.openCharacterOnTab(row.characterId, 'soul')
  else {
    const f = row.item
    if (f.worker === 'world') app.focusWorldChat(f.ref)
    else if (f.worker === 'litopys') app.focusLibraryChat(f.ref)
    else if (f.worker === 'soul') app.openCharacterOnTab(f.ref, 'soul')
    else {
      app.openChat(f.ref)
      app.openDashboard()
    }
  }
}

/** Colour, icon and kind label of each row kind: a failure is red, a Library approval blue, a soul review violet. */
const KIND_STYLE = {
  failed: {
    icon: Warning,
    row: 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10',
    chip: 'bg-destructive/15 text-destructive',
    iconTone: 'text-destructive',
  },
  litopys: {
    icon: Scroll,
    row: 'border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10',
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    iconTone: 'text-sky-600 dark:text-sky-300',
  },
  soul: {
    icon: Sparkle,
    row: 'border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10',
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    iconTone: 'text-violet-600 dark:text-violet-300',
  },
} as const

function InboxItem({ row, phone }: { row: InboxRow; phone?: boolean }) {
  const t = useT()
  const when = useRelativeTime()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const style = KIND_STYLE[row.kind]
  const Icon = style.icon
  const name = row.name || '…'
  const kindLabel = t(row.kind === 'failed' ? 'inbox.kind.failed' : row.kind === 'litopys' ? 'inbox.kind.litopys' : 'inbox.kind.soul')
  const what = row.kind === 'failed' ? row.reason : row.kind === 'litopys' ? t('inbox.lit', { n: row.count }) : t('inbox.soul', { n: row.count })
  const at = row.kind === 'failed' ? row.item.at : row.kind === 'soul' ? row.at : 0
  const worker = row.kind === 'failed' ? workerName(row.item.worker, lang) : ''
  return (
    <li className="flex items-stretch gap-1" data-testid={`inbox-row-${row.kind}`}>
      <button
        type="button"
        onClick={() => openRow(row)}
        aria-label={`${kindLabel}${worker ? `, ${worker}` : ''}: ${name}. ${what}. ${t('attn.open')}`}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 rounded-lg border px-3 text-left transition-colors',
          style.row,
          phone ? 'min-h-14 py-2.5' : 'py-2',
        )}
      >
        <Icon className={cn('mt-0.5 size-5 shrink-0', style.iconTone)} weight={row.kind === 'failed' ? 'fill' : 'regular'} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={cn('shrink-0 rounded-full px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide', style.chip)}>{kindLabel}</span>
            {worker && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{worker}</span>}
            {at > 0 && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{when(at)}</span>}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className={cn('text-xs text-muted-foreground', row.kind === 'failed' ? 'line-clamp-2' : 'truncate')}>{what}</span>
        </span>
        <CaretRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {row.kind === 'failed' && (
        <button
          type="button"
          onClick={() => dismissFailure(failKey(row.item))}
          aria-label={`${t('inbox.dismiss')}: ${name}`}
          title={t('inbox.dismiss')}
          className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/** The current version's notes: the tips that came with it, as the in-app guide has them. */
function useNewTips() {
  return useMemo(() => TIPS.filter((tip) => tip.since === APP_VERSION), [])
}

function NewList() {
  const t = useT()
  const tips = useNewTips()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  return (
    <ul className="flex flex-col gap-2" data-testid="inbox-new">
      <li className="px-0.5 text-xs text-muted-foreground">{t('inbox.newIn', { v: APP_VERSION })}</li>
      {tips.map((tip) => (
        <li key={tip.id} className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-sm font-medium text-foreground">{tipText(tip.title, lang)}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{tipText(tip.body, lang)}</p>
        </li>
      ))}
    </ul>
  )
}

/** The filter chips: only the kinds that have something (plus All and What's new). Hidden when there is one choice. */
function FilterChips({ counts, hasNew, value, onChange, phone }: {
  counts: Record<'failed' | 'litopys' | 'soul', number>
  hasNew: boolean
  value: InboxFilter
  onChange: (f: InboxFilter) => void
  phone?: boolean
}) {
  const t = useT()
  const chips: { key: InboxFilter; label: string; n?: number }[] = [{ key: 'all', label: t('inbox.filter.all') }]
  if (counts.failed) chips.push({ key: 'failed', label: t('inbox.filter.failed'), n: counts.failed })
  if (counts.litopys) chips.push({ key: 'litopys', label: t('inbox.filter.litopys'), n: counts.litopys })
  if (counts.soul) chips.push({ key: 'soul', label: t('inbox.filter.soul'), n: counts.soul })
  if (hasNew) chips.push({ key: 'new', label: t('inbox.filter.new') })
  if (chips.length < 2) return null
  return (
    <div role="group" aria-label={t('inbox.filterLabel')} className="flex flex-wrap gap-1" data-testid="inbox-filters">
      {chips.map((c) => {
        const on = value === c.key
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
              phone ? 'h-10' : 'h-8',
              on
                ? c.key === 'failed' ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {c.label}
            {c.n !== undefined && <span className={cn('tabular-nums', on ? 'opacity-90' : c.key === 'failed' ? 'text-destructive' : 'text-foreground')}>{c.n}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** The body of the drawer: chips, then the rows of the chosen kind. */
function InboxBody({ phone }: { phone?: boolean }) {
  const t = useT()
  const { rows } = useInboxRows()
  const filter = useInbox((s) => s.filter)
  const setFilter = useInbox((s) => s.setFilter)
  const hasNew = useNewTips().length > 0
  const counts = {
    failed: rows.filter((r) => r.kind === 'failed').length,
    litopys: rows.filter((r) => r.kind === 'litopys').length,
    soul: rows.filter((r) => r.kind === 'soul').length,
  }
  // a chip that emptied (the failure cleared, the last suggestion was settled) falls back to All
  const active: InboxFilter = filter === 'all' || filter === 'new' ? (filter === 'new' && !hasNew ? 'all' : filter) : counts[filter] > 0 ? filter : 'all'
  const shown = active === 'all' ? rows : rows.filter((r) => r.kind === active)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-4">
        <FilterChips counts={counts} hasNew={hasNew} value={active} onChange={setFilter} phone={phone} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" data-testid="inbox-scroll">
        {active === 'new' ? (
          <NewList />
        ) : !shown.length ? (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BellSimple aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{t('inbox.empty')}</EmptyTitle>
              <EmptyDescription>{t('inbox.emptyHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="inbox-list">
            {shown.map((row) => <InboxItem key={row.key} row={row} phone={phone} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * The inbox ("Waiting on you", #55) as a drawer. Desktop: a side sheet that comes out of the rail
 * (the rail stays live, like a section drawer); phones: a full-height sheet. One open flag serves both.
 */
export function InboxDrawer() {
  const t = useT()
  const open = useInbox((s) => s.open)
  const setOpen = useInbox((s) => s.setOpen)
  const isDesktop = useIsDesktop()
  const roomy = useIsWideRail()
  const collapsed = useApp((s) => s.railCollapsed)
  const wide = roomy && !collapsed
  const { total, failures } = useInboxBadge()
  // moving to another section closes it: the page you asked for is the one to see
  const view = useApp((s) => s.view)
  const drawer = useApp((s) => s.drawer)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    useInbox.getState().setOpen(false)
  }, [view, drawer])
  const railOffset = wide ? 'left-[206px]' : 'left-12'
  return (
    <Sheet modal={!isDesktop} disablePointerDismissal={isDesktop} open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? 'left' : 'bottom'}
        aria-label={t('inbox.title')}
        overlayClassName={isDesktop ? cn('bg-black/30', railOffset) : undefined}
        onOverlayClick={isDesktop ? () => setOpen(false) : undefined}
        className={cn(
          'gap-0',
          isDesktop
            ? cn('data-[side=left]:w-[min(420px,calc(100vw-60px))] data-[side=left]:border-r-2 data-[side=left]:border-primary data-[side=left]:sm:max-w-none', wide ? 'data-[side=left]:left-[206px]' : 'data-[side=left]:left-12')
            : 'data-[side=bottom]:h-dvh data-[side=bottom]:max-h-none data-[side=bottom]:border-t-0 pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <SheetHeader className="flex-row items-center gap-2 border-b border-border pr-12">
          <SheetTitle className="font-heading text-[17px]">{t('inbox.title')}</SheetTitle>
          <NeedsYouBadge count={total} failed={failures > 0} />
          <SheetDescription className="sr-only">{t('inbox.emptyHint')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          {open && <InboxBody phone={!isDesktop} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
