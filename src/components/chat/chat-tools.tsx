// The chat's story tools (#109): Author's note, Lorebook activity, Story record, World DM and what the chat carries,
// as tinted buttons with their live state in the middle of the chat header; the phone shows the same as tiles at the
// top of the chat menu. The tools open the sheets chat-view owns; this file only draws them.

import { useEffect, useState } from 'react'
import { BookOpenText, Brain, CaretRight, GlobeHemisphereWest, Note, Stack } from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { WorldDot } from '@/components/world/world-status'

export type ToolKey = 'note' | 'lore' | 'record' | 'world'

/** The keys the header (or the phone tiles) carry, so the "More" menu leaves them out. */
export const TOOL_KEYS: readonly ToolKey[] = ['note', 'lore', 'record', 'world']

/** Border and fill by tool, from the same palette as the chips these replace (never colour alone: icon, word and state text too). */
const TINT: Record<ToolKey | 'carries', { box: string; icon: string }> = {
  note: { box: 'border-amber-500/40 bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-300' },
  lore: { box: 'border-sky-500/40 bg-sky-500/10', icon: 'text-sky-600 dark:text-sky-300' },
  record: { box: 'border-violet-500/40 bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-300' },
  world: { box: 'border-emerald-500/40 bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-300' },
  carries: { box: 'border-dashed border-border bg-muted/40', icon: 'text-muted-foreground' },
}
const ICON: Record<ToolKey | 'carries', PhosphorIcon> = { note: Note, lore: BookOpenText, record: Brain, world: GlobeHemisphereWest, carries: Stack }

export interface ToolState {
  noteWritten: boolean
  loreFired: number | null
  chapters: number | null
  /** null = the World DM is off for this chat */
  world: WorldDot
  /** Tokens this chat carries; null = nothing to show (a plain chat) */
  total: number | null
}

export interface ToolHandlers {
  note: () => void
  lore: () => void
  record: () => void
  world: () => void
  carries: () => void
}

interface ToolItem {
  key: ToolKey | 'carries'
  short: string
  /** The full name and the state in words, for screen readers and the title */
  aria: string
  badge: string | null
  dot: 'note' | 'ok' | 'failed' | 'running' | null
  onSelect: () => void
}

function useToolItems(state: ToolState, on: ToolHandlers, compact: boolean): ToolItem[] {
  const t = useT()
  const items: ToolItem[] = [
    {
      key: 'note', short: t('tools.note'), badge: null, dot: state.noteWritten ? 'note' : null, onSelect: on.note,
      aria: state.noteWritten ? t('tools.noteOn', { name: t('carries.note.title') }) : t('carries.note.title'),
    },
    {
      key: 'lore', short: t('tools.lore'), badge: state.loreFired ? String(state.loreFired) : null, dot: null, onSelect: on.lore,
      aria: state.loreFired ? t('tools.loreFired', { name: t('lore.activity.title'), n: state.loreFired }) : t('lore.activity.title'),
    },
    {
      key: 'record', short: t('tools.record'), badge: state.chapters ? String(state.chapters) : null, dot: null, onSelect: on.record,
      aria: state.chapters ? t('tools.chapters', { name: t('lit.recordTitle'), n: state.chapters }) : t('lit.recordTitle'),
    },
    {
      key: 'world', short: t('tools.world'), badge: null, dot: state.world, onSelect: on.world,
      aria: state.world === 'running' ? t('world.status.running') : state.world === 'failed' ? t('world.status.failed') : state.world === 'ok' ? t('world.status.on') : t('world.menu'),
    },
  ]
  if (state.total != null) {
    items.push({
      key: 'carries', short: compact ? `~${state.total}` : t('tools.carries', { n: state.total }), badge: null, dot: null, onSelect: on.carries,
      aria: `${t('carries.title')}, ${t('carries.total', { n: state.total })}`,
    })
  }
  return items
}

function Dot({ kind }: { kind: NonNullable<ToolItem['dot']> }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        kind === 'note' && 'bg-amber-500',
        kind === 'ok' && 'bg-emerald-500',
        kind === 'failed' && 'bg-destructive',
        kind === 'running' && 'animate-pulse bg-amber-500 motion-reduce:animate-none',
      )}
    />
  )
}

function Badge({ children }: { children: string }) {
  return <span className="shrink-0 rounded-full bg-background/70 px-1.5 text-[10px] font-medium leading-4 tabular-nums">{children}</span>
}

/** The header's tool buttons. `labelled` shows the names; without it each is an icon with its counter and the
 *  full name stays in the aria-label and the title. */
export function ChatToolButtons({ state, on, labelled }: { state: ToolState; on: ToolHandlers; labelled: boolean }) {
  const t = useT()
  const items = useToolItems(state, on, !labelled)
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={t('tools.group')} data-guide="chat.story-tools" data-testid="chat-tools">
      {items.map((it) => {
        const Icon = ICON[it.key]
        return (
          <button
            key={it.key}
            type="button"
            data-tool={it.key}
            data-state={it.dot ?? undefined}
            onClick={it.onSelect}
            aria-label={it.aria}
            title={it.aria}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium outline-none transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring/60',
              TINT[it.key].box,
            )}
          >
            <Icon className={cn('size-4 shrink-0', TINT[it.key].icon)} aria-hidden="true" />
            {(labelled || it.key === 'carries') && <span className={cn('whitespace-nowrap', it.key === 'carries' && 'tabular-nums text-muted-foreground')}>{it.short}</span>}
            {it.badge && <Badge>{it.badge}</Badge>}
            {it.dot && <Dot kind={it.dot} />}
          </button>
        )
      })}
    </div>
  )
}

/** The same tools as tiles for the phone menu (40 px and up), and the carries row under them. */
export function ChatToolTiles({ state, on, closeMenu }: { state: ToolState; on: ToolHandlers; closeMenu: () => void }) {
  const t = useT()
  const items = useToolItems(state, on, false)
  const tiles = items.filter((i) => i.key !== 'carries')
  const carries = items.find((i) => i.key === 'carries')
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1" data-guide="chat.story-tools" data-testid="chat-tool-tiles">
      <div className="grid grid-cols-2 gap-1.5">
        {tiles.map((it) => {
          const Icon = ICON[it.key]
          return (
            <button
              key={it.key}
              type="button"
              data-tool={it.key}
              aria-label={it.aria}
              onClick={() => { closeMenu(); it.onSelect() }}
              className={cn('flex min-h-12 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60', TINT[it.key].box)}
            >
              <Icon className={cn('size-4.5 shrink-0', TINT[it.key].icon)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{it.short}</span>
              {it.badge && <Badge>{it.badge}</Badge>}
              {it.dot && <Dot kind={it.dot} />}
            </button>
          )
        })}
      </div>
      {carries && state.total != null && (
        <button
          type="button"
          data-tool="carries"
          aria-label={carries.aria}
          onClick={() => { closeMenu(); carries.onSelect() }}
          className={cn('flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60', TINT.carries.box)}
        >
          <Stack className={cn('size-4.5 shrink-0', TINT.carries.icon)} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('carries.title')}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('carries.tok', { n: state.total })}</span>
          <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** How much of the header's width the tools may use: names and counters, counters only, or none (the More menu then lists them). */
export type ToolMode = 'labelled' | 'icons' | 'none'
const LABELLED_FROM = 1120
const ICONS_FROM = 820

export function useToolMode(el: HTMLElement | null): ToolMode {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return width >= LABELLED_FROM ? 'labelled' : width >= ICONS_FROM ? 'icons' : 'none'
}
