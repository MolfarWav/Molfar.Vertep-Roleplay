// "So far": the chat panel's tiles. First row: People, Places, Factions, Things, each in its type's colour and each a button that opens the
// world book at that type. Second row: the Archive (retired and tidied up), the old notes while any are left, the Fronts (only when the level
// has events) and the Runs. A type with no records stays visible but dimmed, so the layout does not jump.
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Archive, Compass, GlobeHemisphereWest, MapPin, Package, Scroll, UsersFour, UserCircle } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { TONES, type ToneName } from '@/components/ui/tone'
import { cn } from '@/lib/utils'
import type { WorldKind } from '@/lib/world'
import type { MsgKey } from '@/lib/i18n'

/** What a tile opens: one kind, the old notes ('fact'), or the Archive. */
export type TileKey = WorldKind | 'archive'

interface Tile {
  id: string
  tone: ToneName
  icon: PhosphorIcon
  label: string
  value: number
  /** a button that opens the book at this key; absent = a plain count */
  open?: TileKey
  dim?: boolean
}

export function SoFarTiles({ kinds, notes, archive, fronts, runs, onOpen }: {
  kinds: { person: number; place: number; group: number; thing: number }
  /** old notes still in the book: their tile shows only while there are any */
  notes: number
  /** retired and tidied-up records: the tile shows only while there are any */
  archive: number
  /** omitted when the level has no events: the tile is not shown */
  fronts?: number
  runs: number
  onOpen: (key: TileKey) => void
}) {
  const t = useT()
  const kindLabel = (k: TileKey) => t(`world.kinds.${k}` as MsgKey)
  const first: Tile[] = [
    { id: 'person', tone: 'pink', icon: UserCircle, label: kindLabel('person'), value: kinds.person, open: 'person', dim: kinds.person === 0 },
    { id: 'place', tone: 'teal', icon: MapPin, label: kindLabel('place'), value: kinds.place, open: 'place', dim: kinds.place === 0 },
    { id: 'group', tone: 'violet', icon: UsersFour, label: kindLabel('group'), value: kinds.group, open: 'group', dim: kinds.group === 0 },
    { id: 'thing', tone: 'amber', icon: Package, label: kindLabel('thing'), value: kinds.thing, open: 'thing', dim: kinds.thing === 0 },
  ]
  const second: Tile[] = [
    ...(archive > 0 ? [{ id: 'archive', tone: 'slate' as const, icon: Archive, label: kindLabel('archive'), value: archive, open: 'archive' as const }] : []),
    ...(notes > 0 ? [{ id: 'fact', tone: 'sky' as const, icon: Scroll, label: kindLabel('fact'), value: notes, open: 'fact' as const }] : []),
    ...(fronts === undefined ? [] : [{ id: 'fronts', tone: 'orange' as const, icon: Compass, label: t('world.tile.fronts'), value: fronts }]),
    { id: 'runs', tone: 'neutral', icon: GlobeHemisphereWest, label: t('world.tile.runs'), value: runs },
  ]
  const render = (tile: Tile) => {
    const Icon = tile.icon
    const body = (
      <>
        <span className="flex min-w-0 items-center gap-1.5 text-caption font-medium">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{tile.label}</span>
        </span>
        <span className="text-heading font-semibold tabular-nums">{tile.value}</span>
      </>
    )
    const cls = cn('flex min-w-0 flex-col gap-1 rounded-xl border px-2.5 py-2 text-left', TONES[tile.tone].fill, TONES[tile.tone].ink, tile.dim && 'opacity-60')
    if (!tile.open) return <div key={tile.id} data-testid={`tile-${tile.id}`} className={cls}>{body}</div>
    const key = tile.open
    return (
      <button
        key={tile.id}
        type="button"
        data-testid={`tile-${tile.id}`}
        aria-label={t('world.tile.open', { name: tile.label, n: tile.value })}
        onClick={() => onOpen(key)}
        className={cn(cls, 'transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-md:min-h-14')}
      >
        {body}
      </button>
    )
  }
  return (
    // a container query, not a viewport one: the same tiles sit in a 350 px hub column and a 416 px sheet
    <div className="@container">
      <div data-testid="world-facts" className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">{first.map(render)}</div>
        <div className={cn('grid gap-2', second.length > 3 ? 'grid-cols-2 @sm:grid-cols-4' : second.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>{second.map(render)}</div>
      </div>
    </div>
  )
}
