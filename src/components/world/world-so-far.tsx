// "So far": four number tiles, each in the tone of what it counts (records emerald, retired slate, fronts pink, runs sky),
// with its icon and its word. The Fronts tile is left out when the level has no events.
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Archive, BookOpen, Compass, GlobeHemisphereWest } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { TONES, type ToneName } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

interface Tile {
  id: string
  tone: ToneName
  icon: PhosphorIcon
  label: string
  value: number
}

export function SoFarTiles({ records, retired, fronts, runs }: {
  records: number
  retired: number
  /** omitted when the level has no events: the tile is not shown */
  fronts?: number
  runs: number
}) {
  const t = useT()
  const tiles: Tile[] = [
    { id: 'records', tone: 'emerald', icon: BookOpen, label: t('world.tile.records'), value: records },
    { id: 'retired', tone: 'slate', icon: Archive, label: t('world.tile.retired'), value: retired },
    ...(fronts === undefined ? [] : [{ id: 'fronts', tone: 'pink' as const, icon: Compass, label: t('world.tile.fronts'), value: fronts }]),
    { id: 'runs', tone: 'sky', icon: GlobeHemisphereWest, label: t('world.tile.runs'), value: runs },
  ]
  return (
    <div
      data-testid="world-facts"
      className={cn('grid gap-2', tiles.length === 4 ? 'grid-cols-2 min-[360px]:grid-cols-4' : 'grid-cols-3')}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon
        return (
          <div
            key={tile.id}
            data-testid={`tile-${tile.id}`}
            className={cn('flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-2', TONES[tile.tone].fill, TONES[tile.tone].ink)}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-caption font-medium">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{tile.label}</span>
            </span>
            <span className="text-heading font-semibold tabular-nums">{tile.value}</span>
          </div>
        )
      })}
    </div>
  )
}
