import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Check, CornersOut, DotsThree, GearSix, ImageSquare, LockSimple, LockSimpleOpen, MapTrifold, Minus, NavigationArrow, Path, PencilSimple, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useConfirm } from '@/components/ui/confirm'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TONES } from '@/components/ui/tone'
import { PlaceMapBoard, type PlaceMapBoardHandle } from '@/components/chat/place-map-board'
import { MapGalleryDialog } from '@/components/chat/map-gallery-dialog'
import { PlaceIconDialog } from '@/components/chat/place-icon-dialog'
import { PlaceTravelDialog, type TravelSent } from '@/components/chat/place-travel-dialog'
import { limitArea, stageArea, useComposer } from '@/components/chat/expression-panel'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import { CHIP, boxRect, dragTo, loadBox, resizeTo, saveBox, setFolded, type FloatBox } from '@/lib/float-box'
import { cleanLabel, emptyMap, layoutMap, moveNode, roadsOf, routeOf, setIcon, setRouteInfo, stepRoute, toggleRoute, visibleRoutes, withPositions, type PlaceMapData } from '@/lib/place-map'
import { placeKind } from '@/lib/place-kinds'
import { defaultMapKey, hasMap, mapPackUrl, useMapPacks } from '@/lib/map-packs'
import { placeIconPath, usePlaceIconIndex } from '@/lib/place-icons'
import { setPlaceMapOpen } from '@/lib/place-map-open'
import { loadLock, saveLock } from '@/lib/place-map-lock'
import { useApp } from '@/lib/store'
import type { Chat } from '@/lib/types'
import { askRoadName, loadWorld, loadWorldHere, peekWorld, useWorldLive, type WorldRecord } from '@/lib/world'
import { isRevealed, markRevealed, needsGate } from '@/lib/world-reveal'
import { storeBackground } from '@/lib/webp'
import { cn } from '@/lib/utils'

const NAME = 'map'
const storage = (): Storage | null => { try { return localStorage } catch { return null } }
/** How far a press may wander and still be a tap on the chip (px). */
const TAP_SLOP = 8

/**
 * The places map (Molfar.Vertep#454): a floating window over the chat, folded into a round chip, that shows the places of the
 * chat's World book on a board you can pan, zoom and rearrange, with the roads the story has walked between them and,
 * if you like, a picture of your own under them. Shows only in a chat whose book has places. Layout and roads are
 * kept in the chat (`Chat.placeMap`); where the window stands is kept in this browser. No model is called.
 */
export function PlaceMap({ chat }: { chat: Chat }) {
  const t = useT()
  const show = useApp((s) => s.settings.showPlaceMap !== false)
  const updateChat = useApp((s) => s.updateChat)
  const backgrounds = useApp((s) => s.backgrounds)
  const view = useWorldLive((s) => s.views[chat.id])
  const dash = useDashMaybe()
  const phone = useIsMobile()
  const composer = useComposer(phone)
  const [confirm, confirmDialog] = useConfirm()

  const [box, setBox] = useState<FloatBox>(() => loadBox(NAME, chat.id, storage()))
  const [forChat, setForChat] = useState(chat.id)
  if (forChat !== chat.id) {
    setForChat(chat.id)
    setBox(loadBox(NAME, chat.id, storage()))
  }
  const boxRef = useRef(box)
  boxRef.current = box
  const update = useCallback((fn: (b: FloatBox) => FloatBox, transient = false) => {
    const next = fn(boxRef.current)
    boxRef.current = next
    setBox(next)
    if (!transient) saveBox(NAME, chat.id, next, storage())
  }, [chat.id])

  // the chat's World: how many places it has, and the places themselves
  useEffect(() => {
    if (show) void loadWorld(chat.id).catch(() => {})
  }, [chat.id, show])
  const places = view?.kinds.place ?? 0
  const lastRunAt = view?.lastRunAt
  const [book, setBook] = useState<{ chatId: string; records: WorldRecord[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const records = book?.chatId === chat.id ? book.records : null
  const wanted = show && places > 0
  useEffect(() => {
    if (!wanted) return
    let live = true
    peekWorld(chat.id)
      .then((r) => { if (live) { setBook({ chatId: chat.id, records: r }); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [chat.id, wanted, lastRunAt, retry])

  // where the story is now: after each Dashboard reading and each reply
  const [here, setHere] = useState<{ chatId: string; id: string | null; scene: string } | null>(null)
  const hereId = here?.chatId === chat.id ? here.id : null
  const sceneText = here?.chatId === chat.id ? here.scene : ''
  const sceneKey = `${dash?.view?.key ?? ''}|${dash?.view?.clock?.place ?? ''}`
  const messageCount = chat.messages?.length ?? 0
  useEffect(() => {
    if (!wanted || !records) return
    let live = true
    loadWorldHere(chat.id).then((h) => { if (live) setHere({ chatId: chat.id, id: h?.place?.id ?? null, scene: h?.scenePlace ?? '' }) }).catch(() => {})
    return () => { live = false }
  }, [chat.id, wanted, records, sceneKey, messageCount])

  const data = chat.placeMap ?? null
  const layout = useMemo(() => (records ? layoutMap(records, data, hereId) : null), [records, data, hereId])
  // new places get their position, and the road the story just walked is kept, even while the window is folded
  useEffect(() => {
    if (!records || !layout) return
    let next: PlaceMapData | null = Object.keys(layout.added).length ? withPositions(data, layout.added) : data
    next = stepRoute(next, records, hereId)
    if (next && next !== data) updateChat(chat.id, { placeMap: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, layout, hereId])

  // the spoiler question of a world built before the story, as the World section asks it
  const [, bumpReveal] = useState(0)
  const ref = { chatId: chat.id }
  const locked = needsGate(ref, view ? { origin: view.origin } : null) === true && !isRevealed(ref)
  const askReveal = async () => {
    if (!(await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false }))) return
    markRevealed(ref)
    bumpReveal((n) => n + 1)
  }

  // the room the window may stand in
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const area = phone && composer.top !== null ? limitArea({ top: composer.logTop, bottom: composer.top }) : stageArea(chat.id)
  const areaRef = useRef(area)
  areaRef.current = area
  const phoneRef = useRef(phone)
  phoneRef.current = phone

  const visible = show && places > 0
  const open = visible && !box.folded
  useEffect(() => {
    setPlaceMapOpen(open)
    return () => setPlaceMapOpen(false)
  }, [open])

  // dragging the window by its bar or the chip, and resizing it from its corner
  const dragRef = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const movedRef = useRef(false)
  useEffect(() => {
    const up = () => {
      if (!resizeRef.current && !dragRef.current) return
      resizeRef.current = null
      dragRef.current = null
      update((b) => b)
    }
    const move = (e: PointerEvent) => {
      // a button let go outside the page (an app frame does not always hear it): the drag is over
      if (e.pointerType === 'mouse' && e.buttons === 0) { up(); return }
      const rs = resizeRef.current
      if (rs) {
        update((b) => resizeTo(b, { w: rs.w + (e.clientX - rs.x), h: rs.h + (e.clientY - rs.y) }, areaRef.current, phoneRef.current), true)
        return
      }
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < TAP_SLOP) return
      d.moved = true
      movedRef.current = true
      update((b) => dragTo(b, { x: e.clientX - d.dx, y: e.clientY - d.dy }, areaRef.current, phoneRef.current), true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [update])
  const startDrag = (e: React.PointerEvent) => {
    const r = boxRect(boxRef.current, areaRef.current, phoneRef.current)
    // the first drag fixes the place the box stands in now
    update((b) => ({ ...b, x: r.x, y: r.y }), true)
    dragRef.current = { dx: e.clientX - r.x, dy: e.clientY - r.y, sx: e.clientX, sy: e.clientY, moved: false }
    movedRef.current = false
  }
  const fold = (v: boolean) => update((b) => setFolded(b, v, areaRef.current, phoneRef.current))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const boardRef = useRef<PlaceMapBoardHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const iconIndex = usePlaceIconIndex()
  useEffect(() => { setSelectedId(null) }, [chat.id])
  // the lock: places stay where they are; kept per chat in this browser
  const [pinned, setPinned] = useState(() => loadLock(chat.id, storage()))
  useEffect(() => { setPinned(loadLock(chat.id, storage())) }, [chat.id])
  const toggleLock = () => {
    const next = !pinned
    setPinned(next)
    saveLock(chat.id, next, storage())
  }
  // renaming a place on the map: a label kept in the chat. The World record keeps its own name (the book, the Dashboard and
  // travel by a tap all go by the record), and an empty label puts the book's name back
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [selectedId, chat.id])
  const saveName = () => {
    const rec = records?.find((x) => x.id === selectedId)
    const label = cleanLabel(draft)
    setDraft(null)
    if (!rec) return
    const labels = { ...(data?.labels ?? {}) }
    if (!label || label === rec.name) delete labels[rec.id]
    else labels[rec.id] = label
    updateChat(chat.id, { placeMap: { ...withPositions(data, layout?.added ?? {}), labels } })
  }
  // drawing a road by hand: from the picked place to the next whole place that is tapped (a road that is there is taken away)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  useEffect(() => { setConnectFrom(null) }, [chat.id])
  // travel by a tap: the dialog for the picked place
  // after a trip with an unnamed road: when its reply is in, one call asks what the reply called the road; the player keeps it or not
  const streaming = useApp((s) => s.streaming)
  const [journey, setJourney] = useState<{ chatId: string; baseId: string | null; sent: TravelSent } | null>(null)
  const [roadOffer, setRoadOffer] = useState<{ chatId: string; a: string; b: string; name: string } | null>(null)
  useEffect(() => {
    if (!journey || journey.chatId !== chat.id || (streaming && streaming.chatId === chat.id)) return
    const msgs = chat.messages ?? []
    const base = journey.baseId ? msgs.findIndex((m) => m.id === journey.baseId) : -1
    const after = msgs.slice(base + 1)
    const last = after[after.length - 1]
    if (after.length < 2 || !last || last.role !== 'assistant') return
    const text = last.swipes[last.activeSwipe]?.content ?? ''
    const { sent } = journey
    setJourney(null)
    if (!text.trim() || !sent.fromId) return
    askRoadName(chat.id, { from: sent.from ?? '', to: sent.to, reply: text })
      .then((name) => { if (name) setRoadOffer({ chatId: chat.id, a: sent.fromId!, b: sent.toId, name }) })
      .catch(() => {})
  }, [journey, streaming, chat.messages, chat.id])
  useEffect(() => { setJourney(null); setRoadOffer(null) }, [chat.id])
  const keepRoadName = () => {
    if (!roadOffer) return
    updateChat(chat.id, { placeMap: setRouteInfo(withPositions(data, layout?.added ?? {}), roadOffer.a, roadOffer.b, { via: roadOffer.name }) })
    setRoadOffer(null)
  }
  // the card's less used actions live in a menu: rename, icon, road
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => { setMoreOpen(false) }, [selectedId, chat.id])
  // the icon picker for the picked place
  const [iconOpen, setIconOpen] = useState(false)
  useEffect(() => { setIconOpen(false) }, [selectedId, chat.id])
  const [travelOpen, setTravelOpen] = useState(false)
  const [travelRun, setTravelRun] = useState(0)
  useEffect(() => { setTravelOpen(false) }, [selectedId, chat.id])
  const nodes = layout?.nodes ?? []
  const pick = (id: string | null) => {
    if (!connectFrom) { setSelectedId(id); return }
    const from = nodes.find((n) => n.id === connectFrom)
    const to = id ? nodes.find((n) => n.id === id) : null
    setConnectFrom(null)
    if (!from || !to || to.spot || to.id === from.id) return
    const done = toggleRoute(withPositions(data, layout?.added ?? {}), from.id, to.id)
    updateChat(chat.id, { placeMap: done.data })
    toast.success(t(done.added ? 'placeMap.roadAdded' : 'placeMap.roadRemoved', { a: from.name, b: to.name }))
  }
  const selected = nodes.find((n) => n.id === selectedId) ?? null
  const selectedRecord = selected ? records?.find((r) => r.id === selected.id) ?? null : null
  const parentName = selected?.parentId ? nodes.find((n) => n.id === selected.parentId)?.name ?? null : null
  const thumb = selectedRecord?.background ? backgrounds.find((b) => b.id === selectedRecord.background && b.type === 'image')?.url ?? null : null
  // the picture under the places: the player's own, a ready map they chose, none (the grid), or by default a ready map that suits the places
  const packs = useMapPacks()
  const chosen = data?.picture ?? null
  const autoKey = !chosen && records ? defaultMapKey(records, chat.id, packs) : null
  const pictureKey = chosen && 'builtin' in chosen ? chosen.builtin : autoKey
  const pictureUrl = chosen && 'id' in chosen ? `/v1/assets/${chosen.id}` : chosen && 'none' in chosen ? null : pictureKey && hasMap(pictureKey, packs) ? mapPackUrl(pictureKey) : null
  const [galleryOpen, setGalleryOpen] = useState(false)

  const baseData = () => withPositions(data, layout?.added ?? {})
  const onMoved = (id: string, to: { x: number; y: number }) => {
    const spots = nodes.filter((n) => n.parentId === id).map((n) => n.id)
    updateChat(chat.id, { placeMap: moveNode(baseData(), id, to, spots) })
  }
  const upload = async (file: File) => {
    try {
      const stored = await storeBackground(file, 'places-map')
      const id = stored.url.split('/').pop()
      if (!id) throw new Error('no id')
      updateChat(chat.id, { placeMap: { ...baseData(), picture: { id } } })
      toast.success(t('placeMap.picked'))
    } catch (e) {
      toast.error(t('placeMap.uploadFail', { message: e instanceof Error ? e.message : String(e) }))
    }
  }
  const removePicture = () => updateChat(chat.id, { placeMap: { ...baseData(), picture: { none: true } } })
  const autoPicture = () => { const { picture: _p, ...rest } = baseData(); updateChat(chat.id, { placeMap: rest }) }
  const pickReady = (key: string) => updateChat(chat.id, { placeMap: { ...baseData(), picture: { builtin: key } } })
  const resetLayout = async () => {
    if (!(await confirm({ title: t('placeMap.resetTitle'), description: t('placeMap.resetBody'), actionLabel: t('placeMap.resetGo'), destructive: false }))) return
    updateChat(chat.id, { placeMap: { ...(data ?? emptyMap()), nodes: {} } })
  }

  if (!visible) return confirmDialog
  const hidden = phone && composer.typing
  const r = boxRect(box, area, phone)

  if (box.folded) {
    return (
      <>
        <div
          data-place-map
          data-testid="place-map-chip"
          className={cn('fixed z-30 touch-none select-none', hidden && 'hidden')}
          style={{ left: r.x, top: r.y, width: CHIP, height: CHIP }}
          onPointerDown={startDrag}
        >
          <button
            type="button"
            onClick={() => { if (movedRef.current) { movedRef.current = false; return } fold(false) }}
            className="flex size-full items-center justify-center rounded-full border border-border/60 bg-card text-foreground shadow-lg ring-primary/50 hover:ring-2 focus-visible:ring-2"
            aria-label={t('placeMap.chip')}
            title={t('placeMap.chipHint')}
          >
            <MapTrifold className="size-6" weight="duotone" aria-hidden="true" />
          </button>
        </div>
        {confirmDialog}
      </>
    )
  }

  const ctl = 'size-8 max-md:size-10 shrink-0'
  const kind = selected ? placeKind(...selected.names) : null
  const selectedIcon = kind && selected ? placeIconPath(kind.id, selected.id, iconIndex) : null
  return (
    <>
      <div
        data-place-map
        data-testid="place-map"
        role="dialog"
        aria-label={t('placeMap.title')}
        className={cn('fixed z-30 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl', hidden && 'hidden')}
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none select-none items-center gap-1 border-b border-border px-2 py-1 active:cursor-grabbing max-md:py-0.5"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input')) return
            try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* a drag without capture still works */ }
            startDrag(e)
          }}
          title={t('placeMap.grip')}
          data-testid="place-map-bar"
        >
          <MapTrifold className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('placeMap.title')}</span>
          <Button variant="ghost" size="icon" className={ctl} onClick={() => boardRef.current?.zoom(1 / 1.3)} aria-label={t('placeMap.zoomOut')} title={t('placeMap.zoomOut')}>
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className={ctl} onClick={() => boardRef.current?.zoom(1.3)} aria-label={t('placeMap.zoomIn')} title={t('placeMap.zoomIn')}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className={ctl} onClick={() => boardRef.current?.fit()} aria-label={t('placeMap.fit')} title={t('placeMap.fit')}>
            <CornersOut className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant={pinned ? 'secondary' : 'ghost'}
            size="icon"
            className={ctl}
            onClick={toggleLock}
            aria-pressed={pinned}
            aria-label={pinned ? t('placeMap.unlock') : t('placeMap.lock')}
            title={pinned ? t('placeMap.unlockHint') : t('placeMap.lockHint')}
            data-testid="place-map-lock"
          >
            {pinned ? <LockSimple className={cn('size-4', TONES.amber.ink)} weight="fill" aria-hidden="true" /> : <LockSimpleOpen className="size-4" aria-hidden="true" />}
          </Button>
          <Popover>
            <PopoverTrigger
              className={cn('inline-flex items-center justify-center rounded-md hover:bg-muted', ctl)}
              aria-label={t('placeMap.menu')}
              title={t('placeMap.menu')}
              data-testid="place-map-menu"
            >
              <GearSix className="size-4" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-72 flex-col gap-2 max-md:w-[calc(100vw-1.5rem)]">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="place-map-file"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }}
              />
              <Button variant="outline" size="sm" className="justify-start max-md:h-10" onClick={() => fileRef.current?.click()}>
                <UploadSimple className={cn('size-4', TONES.sky.ink)} aria-hidden="true" />
                {t('placeMap.uploadPicture')}
              </Button>
              {packs && packs.length > 0 && (
                <Button variant="outline" size="sm" className="justify-start max-md:h-10" onClick={() => setGalleryOpen(true)} data-testid="place-map-gallery">
                  <MapTrifold className={cn('size-4', TONES.teal.ink)} weight="duotone" aria-hidden="true" />
                  {t('placeMap.readyMaps')}
                </Button>
              )}
              {chosen && 'none' in chosen && packs && packs.length > 0 && (
                <Button variant="outline" size="sm" className="justify-start max-md:h-10" onClick={autoPicture} data-testid="place-map-auto-picture">
                  <ArrowCounterClockwise className={cn('size-4', TONES.sky.ink)} aria-hidden="true" />
                  {t('placeMap.autoPicture')}
                </Button>
              )}
              {pictureUrl && (
                <Button variant="outline" size="sm" className="justify-start max-md:h-10" onClick={removePicture} data-testid="place-map-no-picture">
                  <Trash className={cn('size-4', TONES.orange.ink)} aria-hidden="true" />
                  {t('placeMap.removePicture')}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t('placeMap.pictureHint')}</p>
              <Button variant="outline" size="sm" className="justify-start max-md:h-10" onClick={() => void resetLayout()}>
                <ArrowCounterClockwise className={cn('size-4', TONES.amber.ink)} aria-hidden="true" />
                {t('placeMap.reset')}
              </Button>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className={ctl} onClick={() => fold(true)} aria-label={t('placeMap.fold')} title={t('placeMap.fold')} data-testid="place-map-fold">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {view?.settings.level === 'off' && (
          <p className="shrink-0 truncate border-b border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground" title={t('placeMap.dmOff')}>{t('placeMap.dmOff')}</p>
        )}

        {connectFrom && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/10 px-3 py-1 text-xs" role="status" data-testid="place-map-connecting">
            <span className="min-w-0 flex-1 truncate" title={t('placeMap.connectMore', { name: nodes.find((n) => n.id === connectFrom)?.name ?? '' })}>{t('placeMap.connectHint', { name: nodes.find((n) => n.id === connectFrom)?.name ?? '' })}</span>
            <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs max-md:h-9" onClick={() => setConnectFrom(null)} data-testid="place-map-connect-cancel">{t('placeMap.connectCancel')}</Button>
          </div>
        )}

        {roadOffer && roadOffer.chatId === chat.id && !routeOf(data, roadOffer.a, roadOffer.b)?.via && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/10 px-3 py-1 text-xs" role="status" data-testid="place-map-road-offer">
            <span className="min-w-0 flex-1 truncate" title={t('placeMap.roadOffer', { name: roadOffer.name })}>{t('placeMap.roadOffer', { name: roadOffer.name })}</span>
            <Button variant="secondary" size="sm" className="h-6 shrink-0 px-2 text-xs max-md:h-9" onClick={keepRoadName} data-testid="place-map-road-keep">{t('placeMap.roadKeep')}</Button>
            <Button variant="ghost" size="icon" className="size-6 shrink-0 max-md:size-9" onClick={() => setRoadOffer(null)} aria-label={t('placeMap.close')} title={t('placeMap.close')}><X className="size-3.5" aria-hidden="true" /></Button>
          </div>
        )}

        {!hereId && sceneText && (
          <p className="shrink-0 truncate border-b border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground" title={t('placeMap.sceneUnknown', { name: sceneText })} data-testid="place-map-scene">
            {t('placeMap.sceneUnknown', { name: sceneText })}
          </p>
        )}

        {selected && !connectFrom && (
          // over the bottom of the board, so the board keeps its room
          <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-md border border-border bg-card/95 py-1 pl-2 pr-1 shadow-md max-md:bottom-3" style={{ marginRight: 32 }} data-testid="place-map-card">
            {thumb ? (
              <img src={thumb} alt="" draggable={false} className="size-10 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-xl" aria-hidden="true">
                {selectedIcon ? <img src={selectedIcon} alt="" draggable={false} className="size-9 object-contain" /> : kind?.emoji}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {draft !== null ? (
                <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); saveName() }}>
                  <input
                    autoFocus
                    value={draft}
                    maxLength={80}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) } }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm max-md:h-10 max-md:text-base"
                    aria-label={t('placeMap.renameLabel')}
                    placeholder={selected.bookName}
                    data-testid="place-map-rename-input"
                  />
                  <Button type="submit" variant="ghost" size="icon" className={ctl} aria-label={t('placeMap.renameSave')} title={t('placeMap.renameSave')} data-testid="place-map-rename-save">
                    <Check className="size-4" aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <p className="line-clamp-3 break-words text-sm font-medium" title={selected.name} data-testid="place-map-card-name">{selected.name}</p>
              )}
              <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                {[
                  selected.here ? t('placeMap.here') : null,
                  selected.bookName !== selected.name ? t('placeMap.bookName', { name: selected.bookName }) : null,
                  parentName ? t('placeMap.inside', { name: parentName }) : null,
                  selected.visits > 0 ? t('placeMap.visits', { n: selected.visits }) : t('placeMap.neverVisited'),
                  !selected.spot && roadsOf(data, selected.id) > 0 ? t('placeMap.roads', { n: roadsOf(data, selected.id) }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {draft === null && !selected.here && (
              <Button variant="secondary" size="icon" className={ctl} onClick={() => { setTravelRun((n) => n + 1); setTravelOpen(true) }} aria-label={t('placeMap.travel')} title={t('placeMap.travel')} data-testid="place-map-travel">
                <NavigationArrow className={cn('size-4', TONES.sky.ink)} weight="fill" aria-hidden="true" />
              </Button>
            )}
            {draft === null && (
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger className={cn('inline-flex items-center justify-center rounded-md hover:bg-muted', ctl)} aria-label={t('placeMap.more')} title={t('placeMap.more')} data-testid="place-map-more">
                  <DotsThree className="size-5" weight="bold" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="end" className="flex w-64 flex-col gap-0.5 p-1">
                  {selectedRecord && (
                    <Button variant="ghost" size="sm" className="h-auto justify-start gap-2 whitespace-normal py-2 text-left max-md:min-h-11" onClick={() => { setMoreOpen(false); setDraft(selected.name) }} data-testid="place-map-rename">
                      <PencilSimple className={cn('size-4 shrink-0', TONES.emerald.ink)} weight="duotone" aria-hidden="true" />{t('placeMap.rename')}
                    </Button>
                  )}
                  {Object.keys(iconIndex ?? {}).length > 0 && (
                    <Button variant="ghost" size="sm" className="h-auto justify-start gap-2 whitespace-normal py-2 text-left max-md:min-h-11" onClick={() => { setMoreOpen(false); setIconOpen(true) }} data-testid="place-map-icon">
                      <ImageSquare className={cn('size-4 shrink-0', TONES.violet.ink)} weight="duotone" aria-hidden="true" />{t('placeMap.icon')}
                    </Button>
                  )}
                  {!selected.spot && nodes.some((n) => !n.spot && n.id !== selected.id) && (
                    <Button variant="ghost" size="sm" className="h-auto justify-start gap-2 whitespace-normal py-2 text-left max-md:min-h-11" onClick={() => { setMoreOpen(false); setConnectFrom(selected.id) }} data-testid="place-map-connect">
                      <Path className={cn('size-4 shrink-0', TONES.teal.ink)} weight="bold" aria-hidden="true" />{t('placeMap.connect')}
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            )}
            <Button variant="ghost" size="icon" className={ctl} onClick={() => setSelectedId(null)} aria-label={t('placeMap.close')} title={t('placeMap.close')}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {locked ? (
            <div className="flex h-full flex-col items-start gap-2 p-3" data-testid="place-map-gate">
              <p className="text-sm">{t('world.places.lead')}</p>
              <p className="text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
              <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => void askReveal()}>{t('world.places.show')}</Button>
            </div>
          ) : !records ? (
            <div className="flex h-full flex-col items-start gap-2 p-3 text-sm text-muted-foreground" role="status">
              {failed ? (
                <>
                  <p>{t('placeMap.failed')}</p>
                  <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setRetry((n) => n + 1)}>{t('placeMap.retry')}</Button>
                </>
              ) : (
                <p>{t('placeMap.loading')}</p>
              )}
            </div>
          ) : (
            <PlaceMapBoard
              ref={boardRef}
              nodes={nodes}
              routes={visibleRoutes(data, nodes)}
              pictureUrl={pictureUrl}
              selectedId={selectedId}
              onSelect={pick}
              onMoved={onMoved}
              label={t('placeMap.board')}
              hereLabel={t('placeMap.here')}
              locked={pinned}
              connecting={connectFrom !== null}
            />
          )}
          <span
            onPointerDown={(e) => {
              e.stopPropagation()
              try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* a resize without capture still works */ }
              resizeRef.current = { x: e.clientX, y: e.clientY, w: r.w, h: r.h }
            }}
            onDoubleClick={() => update((b) => ({ ...b, w: null, h: null }))}
            className="absolute bottom-0 right-0 flex size-7 cursor-nwse-resize touch-none items-end justify-end p-1 text-muted-foreground max-md:size-10"
            role="separator"
            aria-label={t('placeMap.resize')}
            title={t('placeMap.resize')}
            data-testid="place-map-resize"
          >
            <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true"><path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" /></svg>
          </span>
        </div>
      </div>
      {galleryOpen && packs && (
        <MapGalleryDialog packs={packs} current={pictureKey && hasMap(pictureKey, packs) && !(chosen && ('id' in chosen || 'none' in chosen)) ? pictureKey : null} open={galleryOpen} onOpenChange={setGalleryOpen} onPick={pickReady} />
      )}
      {selected && iconOpen && iconIndex && (
        <PlaceIconDialog
          key={selected.id}
          node={selected}
          index={iconIndex}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onPick={(key) => updateChat(chat.id, { placeMap: setIcon(withPositions(data, layout?.added ?? {}), selected.id, key) })}
        />
      )}
      {selected && (
        <PlaceTravelDialog
          key={`${selected.id}:${travelRun}`}
          chatId={chat.id}
          target={selected}
          from={nodes.find((n) => n.id === hereId) ?? null}
          nodes={nodes}
          data={data}
          open={travelOpen}
          onOpenChange={setTravelOpen}
          onSaveMap={(next) => updateChat(chat.id, { placeMap: { ...next, nodes: { ...withPositions(data, layout?.added ?? {}).nodes } } })}
          dmOn={view?.settings.level !== 'off'}
          dmEvent={view?.eventWaiting === true}
          messageCount={messageCount}
          onSent={(sent) => {
            // a road with no name yet: read the one the reply gives it
            if (sent.fromId && !sent.within && sent.mode !== 'skip' && !sent.nameKnown && view?.settings.level !== 'off') {
              const msgs = chat.messages ?? []
              setJourney({ chatId: chat.id, baseId: msgs[msgs.length - 1]?.id ?? null, sent })
            }
            if (phone) fold(true)
          }}
        />
      )}
      {confirmDialog}
    </>
  )
}
