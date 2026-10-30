// The Places tab: the world book's places as a tree, whole places with their spots indented, how often the story
// came to each, where the story is now, and the things lying in each place. A row opens the record in the World
// book. Used for a chat's world and for a saved world (no "you are here" and no generating there).

import { useEffect, useMemo, useState } from 'react'
import { ArrowBendDownRight, CaretDown, ImageSquare, MapPin, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { buildPlaceTree, treeRows } from '@/lib/world-places'
import { editWorldRecord, loadWorld, loadWorldHere, useWorldLive, type WorldRecord, type WorldRef } from '@/lib/world'
import { useApp } from '@/lib/store'
import { KIND_TONE } from './world-common'
import { PlaceBackgroundDialog, PlaceThumb } from './world-place-bg'
import { useWorldBook } from './use-world-book'

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

export function WorldPlaces({ wref, gated, folderId: worldFolderId, onOpenRecord, onAdd, onOpenBackgrounds }: {
  /** a chat's world or a saved world */
  wref: WorldRef
  /** a saved world: whether it asks the spoiler question */
  gated?: boolean
  /** a saved world's own backgrounds folder (a chat's is read from its view) */
  folderId?: string | null
  /** open a record in the World book; the records already read ride along so it need not read them again */
  onOpenRecord: (record: WorldRecord, all: WorldRecord[]) => void
  /** add a place or a thing in the World book */
  onAdd: (kind: 'place' | 'thing', all: WorldRecord[]) => void
  /** go to the Backgrounds tab (the world's folder is made there) */
  onOpenBackgrounds: () => void
}) {
  const t = useT()
  const chatId = 'chatId' in wref ? wref.chatId : null
  const [confirm, confirmDialog] = useConfirm()
  const book = useWorldBook(wref, { gated })
  const { records, setRecords } = book
  const [hereId, setHereId] = useState<string | null>(null)
  const lastRunAt = useWorldLive((s) => (chatId ? s.views[chatId]?.lastRunAt : undefined))
  const viewFolder = useWorldLive((s) => (chatId ? s.views[chatId]?.backgroundFolderId ?? null : null))
  const folderId = chatId ? viewFolder : worldFolderId ?? null
  const folders = useApp((s) => s.folders)
  const folderName = folders.find((f) => f.id === folderId)?.name ?? t('world.places.bgOwn')
  const [bgFor, setBgFor] = useState<string | null>(null)
  useEffect(() => { if (chatId) void loadWorld(chatId).catch(() => {}) }, [chatId])
  // where the story is now (a chat only)
  useEffect(() => {
    if (!chatId || records === null) return
    let live = true
    loadWorldHere(chatId).then((h) => { if (live) setHereId(h?.place?.id ?? null) }).catch(() => {})
    return () => { live = false }
  }, [chatId, lastRunAt, records === null])

  const tree = useMemo(() => buildPlaceTree(records ?? [], hereId), [records, hereId])
  const rows = useMemo(() => treeRows(tree), [tree])

  if (records === null) {
    return (
      <div className="flex flex-col gap-3">
        {book.locked ? (
          <div className="rounded-md border border-border bg-card p-3" data-testid="book-gate">
            <p className="text-sm">{t('world.places.lead')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
            <Button variant="outline" size="sm" className="mt-2 max-md:h-10" onClick={() => void book.reveal()}>
              {t('world.places.show')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">…</p>
        )}
        {book.confirmDialog}
      </div>
    )
  }

  const all = records
  const open = (r: WorldRecord) => onOpenRecord(r, all)

  const remove = async (place: WorldRecord) => {
    if (!(await confirm({ title: t('world.rec.deleteTitle', { name: place.name }), description: t('world.places.deleteWarn'), actionLabel: t('world.rec.delete') }))) return
    try {
      setRecords(await editWorldRecord(wref, 'delete', { id: place.id }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const addButtons = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAdd('place', all)} data-testid="places-add-place">
        <Plus className="size-4" aria-hidden="true" />{t('world.places.add')}
      </Button>
      <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAdd('thing', all)} data-testid="places-add-thing">
        <Plus className="size-4" aria-hidden="true" />{t('world.places.addThing')}
      </Button>
    </div>
  )

  if (tree.places === 0 && tree.unplaced.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-4" data-testid="places-empty">
        <MapPin className="size-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('world.places.empty')}</p>
        {addButtons}
        {book.confirmDialog}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="world-places">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('world.places.summary', { places: tree.places, things: tree.things })}</p>
        {addButtons}
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
              <Button variant="ghost" size="sm" className="shrink-0 px-2 text-muted-foreground hover:text-destructive max-md:size-10 max-md:p-0" onClick={() => void remove(node.place)} aria-label={t('world.places.deleteOf', { name: node.place.name })} title={t('world.places.deleteOf', { name: node.place.name })} data-testid="place-delete">
                <Trash className="size-4" aria-hidden="true" />
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
          wref={wref}
          place={records.find((r) => r.id === bgFor)!}
          folderId={folderId}
          folderName={folderName}
          onSaved={setRecords}
          onOpenBackgrounds={onOpenBackgrounds}
        />
      )}
      {book.confirmDialog}
      {confirmDialog}
    </div>
  )
}
