// The Places tab: the world book's places as a tree, whole places with their spots indented, how often the story
// came to each, where the story is now, and the things lying in each place. A row opens the record in Records.
// Behind the same spoiler question as the Records tab: the book also holds places the story has not visited.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowBendDownRight, CaretDown, ImageSquare, MapPin } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { buildPlaceTree, treeRows } from '@/lib/world-places'
import { loadWorld, loadWorldHere, peekWorld, useWorldLive, type WorldRecord } from '@/lib/world'
import { useApp } from '@/lib/store'
import { KIND_TONE } from './world-common'
import { PlaceBackgroundDialog, PlaceThumb } from './world-place-bg'

function ThingChip({ thing, onOpen, sub }: { thing: WorldRecord; onOpen: (r: WorldRecord) => void; sub?: string }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => onOpen(thing)}
      title={t('world.places.open', { name: thing.name })}
      className={cn('inline-flex min-h-7 max-w-full items-center gap-1 border px-1.5 py-0.5 text-left text-[12px] leading-snug break-words max-md:min-h-10', KIND_TONE.thing)}
    >
      {thing.name}
      {sub ? <span className="text-[11px] opacity-75">{sub}</span> : null}
    </button>
  )
}

export function WorldPlaces({ chatId, onOpenRecord, onAdd, onOpenBackgrounds }: {
  /** go to the Backgrounds tab (the world's folder is made there) */
  onOpenBackgrounds: () => void
  chatId: string
  /** open a record in the Records editor; the records already read ride along so Records need not ask again */
  onOpenRecord: (record: WorldRecord, all: WorldRecord[]) => void
  onAdd: (all: WorldRecord[]) => void
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [records, setRecords] = useState<WorldRecord[] | null>(null)
  const [hereId, setHereId] = useState<string | null>(null)
  const lastRunAt = useWorldLive((s) => s.views[chatId]?.lastRunAt)
  const folderId = useWorldLive((s) => s.views[chatId]?.backgroundFolderId ?? null)
  const folders = useApp((s) => s.folders)
  const folderName = folders.find((f) => f.id === folderId)?.name ?? t('world.places.bgOwn')
  const [bgFor, setBgFor] = useState<string | null>(null)
  useEffect(() => { void loadWorld(chatId).catch(() => {}) }, [chatId])

  useEffect(() => {
    if (records === null) return
    let live = true
    peekWorld(chatId).then((r) => { if (live) setRecords(r) }).catch(() => {})
    loadWorldHere(chatId).then((h) => { if (live) setHereId(h?.place?.id ?? null) }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunAt, records === null])

  const tree = useMemo(() => buildPlaceTree(records ?? [], hereId), [records, hereId])
  const rows = useMemo(() => treeRows(tree), [tree])

  const reveal = async () => {
    if (!(await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false }))) return
    try {
      setRecords(await peekWorld(chatId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  if (records === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-sm">{t('world.places.lead')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
          <Button variant="outline" size="sm" className="mt-2 max-md:h-10" onClick={() => void reveal()}>
            {t('world.places.show')}
          </Button>
        </div>
        {confirmDialog}
      </div>
    )
  }

  const all = records
  const open = (r: WorldRecord) => onOpenRecord(r, all)

  if (tree.places === 0 && tree.unplaced.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-4" data-testid="places-empty">
        <MapPin className="size-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('world.places.empty')}</p>
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAdd(records)}>{t('world.places.add')}</Button>
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="world-places">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('world.places.summary', { places: tree.places, things: tree.things })}</p>
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAdd(records)}>{t('world.places.add')}</Button>
      </div>

      <ul className="flex flex-col rounded-md border border-border bg-card">
        {rows.map(({ node, spot }) => (
          <li key={node.place.id} className={cn('flex flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0', spot && 'pl-8')} data-testid="place-row" data-here={node.here ? 'true' : undefined}>
            <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => open(node.place)}
              title={t('world.places.open', { name: node.place.name })}
              className="flex min-h-8 min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left max-md:min-h-10"
            >
              {spot ? <ArrowBendDownRight className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" /> : <CaretDown className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />}
              <span className={cn('min-w-0 break-words', spot ? 'text-sm' : 'font-heading text-[15px]')}>{node.place.name}</span>
              {(node.place.size === 'spot' && (node.place.inside || node.strayInside)) && (
                <span className="text-[11px] text-muted-foreground">{t('world.places.spotOf', { name: node.place.inside ?? node.strayInside ?? '' })}</span>
              )}
              {!!node.place.visits && <span className="text-[11px] text-muted-foreground">{t('dash.here.visits', { n: node.place.visits })}</span>}
              {node.here && (
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none font-medium', KIND_TONE.place)}>
                  <MapPin className="size-3" weight="fill" aria-hidden="true" />
                  {t('world.places.here')}
                </span>
              )}
            </button>
            <PlaceThumb record={node.place} />
            <Button variant="outline" size="sm" className="shrink-0 max-md:size-10 max-md:p-0" onClick={() => setBgFor(node.place.id)} aria-label={t('world.places.bgOf', { name: node.place.name })} title={t('world.places.bgOf', { name: node.place.name })} data-testid="place-bg-button">
              <ImageSquare className="size-4" aria-hidden="true" />
              <span className="max-md:sr-only">{t('world.places.bg')}</span>
            </Button>
            </div>
            {node.things.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-5">
                {node.things.map((th) => <ThingChip key={th.id} thing={th} onOpen={open} />)}
              </div>
            )}
          </li>
        ))}
      </ul>

      {tree.unplaced.length > 0 && (
        <section className="rounded-md border border-dashed border-border p-3" aria-label={t('world.places.unplaced')} data-testid="places-unplaced">
          <h3 className="text-sm font-medium">{t('world.places.unplaced')}</h3>
          <p className="mb-1.5 text-xs text-muted-foreground">{t('world.places.unplacedHint')}</p>
          <div className="flex flex-wrap gap-1">
            {tree.unplaced.map((th) => (
              <ThingChip key={th.id} thing={th} onOpen={open} sub={th.holder ? t('world.places.heldBy', { name: th.holder }) : th.place || undefined} />
            ))}
          </div>
        </section>
      )}
      {bgFor && records.find((r) => r.id === bgFor) && (
        <PlaceBackgroundDialog
          open
          onOpenChange={(o) => { if (!o) setBgFor(null) }}
          chatId={chatId}
          place={records.find((r) => r.id === bgFor)!}
          folderId={folderId}
          folderName={folderName}
          onSaved={setRecords}
          onOpenBackgrounds={onOpenBackgrounds}
        />
      )}
      {confirmDialog}
    </div>
  )
}
