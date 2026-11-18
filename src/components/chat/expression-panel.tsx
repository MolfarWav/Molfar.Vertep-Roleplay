import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowsOutLineVertical, GearSix, DotsSixVertical, Plus, Trash } from '@phosphor-icons/react'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/lib/store'
import { DEFAULT_OUTFIT } from '@/lib/expressions'
import {
  MAX_WINDOWS, addWindow, arrange, contributions, defaultLayout, loadLayout, memberSprite, patchWindow, removeWindow, resolveWindows,
  saveLayout, sceneKeys, speakerOf, stageMembers,
  type Area, type Contribution, type StageLayout, type StageMember, type StageWindow,
} from '@/lib/sprite-stage'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import type { Chat } from '@/lib/types'
import { cn, onImageError } from '@/lib/utils'

const MIN_HEIGHT = 96
const CHIP = 48
const maxHeight = () => Math.round(window.innerHeight * 0.9)
const storage = (): Storage | null => { try { return localStorage } catch { return null } }
/** The chat's column on the page, where windows are laid out; the whole window when it cannot be found. */
const stageArea = (chatId: string): Area => {
  const r = document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"]`)?.getBoundingClientRect()
  return r && r.width > 120 && r.height > 200 ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
}

/**
 * The sprite stage: floating sprite windows over the chat. Each window shows one character, picked by the
 * character's own last line (keyword rules, soft crossfade). By default there is one window that follows whoever
 * speaks, as before; more can be added (up to 8), each following the next one in the scene or one named
 * character, with or without a frame, and placed anywhere or arranged in a row or a grid (Molfar.Vertep#456).
 * The layout is kept per chat in this browser. On a phone one window shows, and the others in the scene are
 * small round pictures. Settings turns every window off.
 */
export function ExpressionPanel({ chat }: { chat: Chat }) {
  const characters = useApp((s) => s.characters)
  const loadCharacter = useApp((s) => s.loadCharacter)
  const show = useApp((s) => s.settings.showExpressionSprites !== false)
  const dash = useDashMaybe()
  const phone = useIsMobile()

  const [layout, setLayout] = useState<StageLayout>(() => loadLayout(chat.id, storage()))
  const [forChat, setForChat] = useState(chat.id)
  // a phone: the character the user tapped in the strip, shown in the one window until tapped again
  const [pinned, setPinned] = useState<string | null>(null)
  if (forChat !== chat.id) {
    setForChat(chat.id)
    setLayout(loadLayout(chat.id, storage()))
    setPinned(null)
  }
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  // `transient` = in the middle of a drag or resize: kept on the screen, written when it ends
  const update = useCallback((fn: (l: StageLayout) => StageLayout, transient = false) => {
    const next = fn(layoutRef.current)
    layoutRef.current = next
    setLayout(next)
    if (!transient) saveLayout(chat.id, next, storage())
  }, [chat.id])

  const chatCard = characters.find((c) => c.id === chat.characterId)
  const order = chat.groupSettings?.order
  const members = useMemo(() => stageMembers(chatCard, characters, order), [chatCard, characters, order])
  // a group's members come from the list as summaries until loaded
  useEffect(() => {
    if (!chatCard?.isGroup) return
    for (const id of chatCard.group?.memberIds ?? chatCard.members ?? []) {
      if (characters.find((x) => x.id === id)?.stub) void loadCharacter(id)
    }
  }, [chatCard, characters, loadCharacter])

  const said = useMemo(() => contributions(members, chat.messages), [members, chat.messages])
  const speaker = useMemo(() => speakerOf(members, said), [members, said])
  const usable = !!dash && (dash.status === 'ready' || dash.status === 'empty')
  const presentKey = usable ? (dash?.view?.present ?? []).join('\n') : ''
  const present = useMemo(() => (presentKey ? presentKey.split('\n') : null), [presentKey])
  const scene = useMemo(() => sceneKeys(members, said, present), [members, said, present])
  const view = useMemo(() => resolveWindows(layout, members, speaker, scene), [layout, members, speaker, scene])

  // who holds which window is kept, so nobody moves while they stay in the scene
  const slotsNow = JSON.stringify(view.slots)
  useEffect(() => {
    if (slotsNow !== JSON.stringify(layoutRef.current.slots)) update((l) => ({ ...l, slots: view.slots }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsNow])

  if (!show || !members.length) return null

  const menuFor = (id: string) => (
    <StageMenu layout={layout} members={members} current={id} phone={phone} update={update} area={() => stageArea(chat.id)} />
  )
  const windows = phone ? layout.windows.slice(0, 1) : layout.windows
  const shownKey = (w: StageWindow) => (phone && pinned && members.some((m) => m.key === pinned) ? pinned : view.shows[w.id] ?? null)
  const first = windows[0]
  return (
    <>
      {windows.map((w) => {
        const key = shownKey(w)
        const member = members.find((m) => m.key === key) ?? null
        return (
          <SpriteWindow
            key={w.id}
            chatId={chat.id}
            win={w}
            member={member}
            said={member ? said.get(member.key) ?? null : null}
            outfits={chat.spriteOutfits}
            hideEmpty={layout.hideEmpty}
            onPatch={(patch, transient) => update((l) => patchWindow(l, w.id, patch), transient)}
            menu={menuFor(w.id)}
          />
        )
      })}
      {phone && first && (
        <CastStrip
          members={members}
          keys={scene.filter((k) => k !== shownKey(first)).slice(0, MAX_WINDOWS)}
          said={said}
          outfits={chat.spriteOutfits}
          pinned={pinned}
          onPin={(k) => setPinned((p) => (p === k ? null : k))}
        />
      )}
    </>
  )
}

/** A phone: the others in the scene as small round pictures; a tap puts one in the window. */
function CastStrip({ members, keys, said, outfits, pinned, onPin }: {
  members: StageMember[]
  keys: string[]
  said: ReadonlyMap<string, Contribution | null>
  outfits: Record<string, string> | undefined
  pinned: string | null
  onPin: (key: string) => void
}) {
  const t = useT()
  const list = [...keys]
  if (pinned && !list.includes(pinned) && members.some((m) => m.key === pinned)) list.unshift(pinned)
  if (!list.length) return null
  return (
    <div data-expression-panel className="fixed bottom-20 left-2 z-30 flex max-w-[60vw] gap-2 overflow-x-auto" data-testid="cast-strip">
      {list.map((k) => {
        const m = members.find((x) => x.key === k)
        const sp = m ? memberSprite(m, said.get(k) ?? null, outfits) : null
        if (!m || !sp) return null
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPin(k)}
            aria-pressed={pinned === k}
            aria-label={t('sprites.win.chip', { name: m.name })}
            title={m.name}
            className={cn('size-10 shrink-0 overflow-hidden rounded-full border border-border/60 bg-card shadow-lg', pinned === k && 'ring-2 ring-primary')}
          >
            <img src={sp.sprite.url} alt="" draggable={false} className="size-full object-cover object-top" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * One sprite window: drag it anywhere, resize it from its lower corner, fold it into a small chip (a click on the
 * chip brings it back). A transparent window has no frame and lets clicks through to the chat; it is moved by its
 * grip. A window with nobody to show stays as an empty slot, or disappears when "Hide empty windows" is on.
 */
function SpriteWindow({ chatId, win, member, said, outfits, hideEmpty, onPatch, menu }: {
  chatId: string
  win: StageWindow
  member: StageMember | null
  said: Contribution | null
  outfits: Record<string, string> | undefined
  hideEmpty: boolean
  onPatch: (patch: Partial<Omit<StageWindow, 'id'>>, transient?: boolean) => void
  menu: React.ReactNode
}) {
  const t = useT()
  const setSpriteOutfit = useApp((s) => s.setSpriteOutfit)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ y: number; h: number } | null>(null)
  // set by a drag, read by the click that ends it: pointerup clears dragRef before the browser fires that click
  const movedRef = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const patchRef = useRef(onPatch)
  patchRef.current = onPatch
  // the sprite URL that finished loading, and the ones that failed. Until its image loads the window is not
  // hit-testable: an invisible box over the lower half of the log swallowed touch scrolling on Chromium, and a
  // sprite that never loads (a dead URL) left it there for good
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [brokenUrls, setBrokenUrls] = useState<ReadonlySet<string>>(() => new Set())
  const markBroken = (url: string) => setBrokenUrls((prev) => (prev.has(url) ? prev : new Set(prev).add(url)))

  const picked = useMemo(() => (member ? memberSprite(member, said, outfits) : null), [member, said, outfits])
  const sprite = picked?.sprite ?? null

  useEffect(() => {
    // keep the whole box on screen: its own size, not a fixed guess
    const clamp = (p: { x: number; y: number }) => {
      const w = boxRef.current?.offsetWidth ?? 80
      const h = boxRef.current?.offsetHeight ?? 80
      return {
        x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - Math.min(w, 80))),
        y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - Math.min(h, 80))),
      }
    }
    const move = (e: PointerEvent) => {
      if (resizeRef.current) {
        const next = resizeRef.current.h + (e.clientY - resizeRef.current.y)
        patchRef.current({ h: Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(next))) }, true)
        return
      }
      if (!dragRef.current) return
      movedRef.current = true
      patchRef.current(clamp({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }), true)
    }
    const up = () => {
      if (resizeRef.current) { resizeRef.current = null; patchRef.current({}); return }
      if (!dragRef.current) return
      dragRef.current = null
      patchRef.current({})
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const hasPos = win.x !== null && win.y !== null
  const style: React.CSSProperties = hasPos
    ? { left: win.x!, top: win.y!, right: 'auto', bottom: 'auto' }
    : { right: '1rem', bottom: '5rem' }
  const startDrag = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    const at = hasPos ? { x: win.x!, y: win.y! } : r ? { x: r.left, y: r.top } : { x: e.clientX - 60, y: e.clientY - 60 }
    if (!hasPos) onPatch({ x: at.x, y: at.y }, true)
    dragRef.current = { dx: e.clientX - at.x, dy: e.clientY - at.y }
    movedRef.current = false
  }
  const setFolded = (v: boolean) => onPatch({ folded: v })
  const h = win.h ?? Math.round(window.innerHeight * 0.42)
  const transparent = win.transparent

  // nobody to show
  if (!sprite || !member || brokenUrls.has(sprite.url)) {
    if (hideEmpty || win.folded || (!member && win.who === 'speaker')) return null
    return (
      <div
        ref={boxRef}
        data-expression-panel
        className={cn('group fixed z-30 flex cursor-grab touch-none select-none items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-2 text-center text-xs text-muted-foreground active:cursor-grabbing', transparent && 'pointer-events-none')}
        style={{ ...style, height: h, width: Math.round(h * 0.6) }}
        onPointerDown={transparent ? undefined : startDrag}
        data-testid="sprite-window-empty"
      >
        {t('sprites.win.empty')}
        <WindowControls t={t} transparent={transparent} startDrag={startDrag} menu={menu} onFold={null} onResizeStart={(e) => { resizeRef.current = { y: e.clientY, h } }} onResetSize={() => onPatch({ h: null })} />
      </div>
    )
  }

  const who = picked?.character || member.name
  const label = `${member.name}${picked?.character && picked.character !== member.name ? ` (${picked.character})` : ''}: ${sprite.name}`

  if (win.folded) {
    return (
      <div ref={boxRef} data-expression-panel className="fixed z-30 touch-none select-none" style={style} onPointerDown={startDrag}>
        <button
          type="button"
          onClick={() => { if (movedRef.current) { movedRef.current = false; return } setFolded(false) }}
          className="block overflow-hidden rounded-full border border-border/60 bg-card shadow-lg ring-primary/50 hover:ring-2"
          style={{ width: CHIP, height: CHIP }}
          aria-label={`Show ${label}`}
          title={`${label} (click to show, drag to move)`}
        >
          <img src={sprite.url} alt="" draggable={false} onError={(e) => onImageError(e.currentTarget, () => markBroken(sprite.url))} className="size-full object-cover object-top" />
        </button>
      </div>
    )
  }

  const loaded = loadedUrl === sprite.url
  return (
    <div
      ref={boxRef}
      data-expression-panel
      className={cn('group fixed z-30 touch-none select-none', transparent ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing')}
      style={{ ...style, visibility: loaded ? undefined : 'hidden' }}
      onPointerDown={transparent ? undefined : startDrag}
      role="img"
      aria-label={label}
      title={transparent ? label : `${label} (drag to move)`}
      data-transparent={transparent || undefined}
    >
      <img
        key={sprite.url}
        src={sprite.url}
        alt={`${member.name} ${sprite.name}`}
        draggable={false}
        onLoad={(e) => { e.currentTarget.style.opacity = '1'; setLoadedUrl(sprite.url) }}
        onError={(e) => onImageError(e.currentTarget, () => markBroken(sprite.url))}
        style={{ height: h, maxHeight: '90dvh' }}
        className={cn('w-auto [opacity:0] transition-opacity duration-200', transparent ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]' : 'rounded-lg border border-border/40 bg-card/60 shadow-lg')}
      />
      {/* the outfit: only when this character has more than one; the choice is kept for this chat */}
      {picked && picked.outfits.length > 1 && (
        <select
          value={picked.outfit}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setSpriteOutfit(chatId, member.outfitKey, e.target.value)}
          aria-label={t('sprites.outfitSwitchAria', { name: who })}
          title={t('sprites.outfitSwitchAria', { name: who })}
          data-testid="outfit-switch"
          className={cn('pointer-events-auto absolute bottom-1 left-1 h-8 max-w-[calc(100%-3rem)] cursor-pointer rounded-full border border-border/60 bg-background/85 px-2 text-xs text-foreground shadow backdrop-blur max-md:h-10 max-md:text-sm', transparent && 'opacity-60 hover:opacity-100 focus-visible:opacity-100')}
        >
          {picked.outfits.map((o) => <option key={o} value={o}>{o.toLowerCase() === DEFAULT_OUTFIT ? t('sprites.outfitDefault') : o}</option>)}
        </select>
      )}
      <WindowControls t={t} transparent={transparent} startDrag={startDrag} menu={menu} onFold={() => setFolded(true)} onResizeStart={(e) => { resizeRef.current = { y: e.clientY, h } }} onResetSize={() => onPatch({ h: null })} />
    </div>
  )
}

/**
 * The buttons on a window: fold (×), settings (gear), resize, and for a transparent window a grip to move it.
 * Always visible on touch screens, on hover elsewhere; a transparent window shows them faintly all the time,
 * since hovering a picture that lets clicks through would not reveal them.
 */
function WindowControls({ t, transparent, startDrag, menu, onFold, onResizeStart, onResetSize }: {
  t: ReturnType<typeof useT>
  transparent: boolean
  startDrag: (e: React.PointerEvent) => void
  menu: React.ReactNode
  onFold: (() => void) | null
  onResizeStart: (e: React.PointerEvent) => void
  onResetSize: () => void
}) {
  const reveal = transparent
    ? 'pointer-events-auto opacity-50 hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100'
    : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100'
  const btn = 'absolute flex size-7 items-center justify-center rounded-full bg-background/85 text-foreground shadow backdrop-blur transition-opacity hover:bg-background max-md:size-10'
  return (
    <>
      {transparent && (
        <span
          onPointerDown={(e) => { e.stopPropagation(); startDrag(e) }}
          className={cn(btn, reveal, 'left-1 top-1 cursor-grab touch-none active:cursor-grabbing')}
          role="button"
          aria-label={t('sprites.win.grip')}
          title={t('sprites.win.grip')}
          data-testid="sprite-grip"
        >
          <DotsSixVertical className="size-4" aria-hidden="true" />
        </span>
      )}
      <Popover>
        <PopoverTrigger
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(btn, reveal, onFold ? 'right-9 top-1 max-md:right-11' : 'right-1 top-1')}
          aria-label={t('sprites.win.menuAria')}
          title={t('sprites.win.menuAria')}
          data-testid="sprite-menu"
        >
          <GearSix className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent data-stage-menu align="end" className="w-80 max-md:w-[calc(100vw-1.5rem)]">{menu}</PopoverContent>
      </Popover>
      {onFold && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onFold}
          className={cn(btn, reveal, 'right-1 top-1')}
          aria-label="Fold the sprite"
          title="Fold into a small chip"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      <span
        onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e) }}
        onDoubleClick={onResetSize}
        className={cn(btn, reveal, 'bottom-1 right-1 cursor-ns-resize touch-none')}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the sprite"
        title="Drag to resize, double-click for the default size"
      >
        <ArrowsOutLineVertical className="size-4" aria-hidden="true" />
      </span>
    </>
  )
}

const selectClass = 'h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-background px-2 text-xs text-foreground max-md:h-10 max-md:text-sm'
const smallBtn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 max-md:h-10 max-md:text-sm'

/** The one menu every window's gear opens: all the windows, who each shows, and how they are laid out. */
function StageMenu({ layout, members, current, phone, update, area }: {
  layout: StageLayout
  members: StageMember[]
  current: string
  phone: boolean
  update: (fn: (l: StageLayout) => StageLayout) => void
  area: () => Area
}) {
  const t = useT()
  const list = phone ? layout.windows.slice(0, 1) : layout.windows
  const full = layout.windows.length >= MAX_WINDOWS
  return (
    <div className="flex flex-col gap-2.5" data-testid="stage-menu">
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-medium">{t('sprites.win.title')}</div>
        <p className="text-xs text-muted-foreground">{t('sprites.win.hint')}</p>
      </div>
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto overscroll-contain">
        {list.map((w, i) => (
          <div key={w.id} className={cn('flex flex-col gap-1.5 rounded-md border p-2', w.id === current ? 'border-primary/60 bg-primary/5' : 'border-border')} data-testid="stage-window-row">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{t('sprites.win.n', { n: i + 1 })}</span>
              {layout.windows.length > 1 && (
                <button
                  type="button"
                  onClick={() => update((l) => removeWindow(l, w.id))}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
                  aria-label={t('sprites.win.remove')}
                  title={t('sprites.win.remove')}
                >
                  <Trash className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-14 shrink-0 text-muted-foreground">{t('sprites.win.who')}</span>
              <select
                value={w.who === 'speaker' || w.who === 'auto' || members.some((m) => m.key === w.who) ? w.who : 'auto'}
                onChange={(e) => update((l) => patchWindow(l, w.id, { who: e.target.value }))}
                className={selectClass}
              >
                <option value="speaker">{t('sprites.win.whoSpeaker')}</option>
                <option value="auto">{t('sprites.win.whoAuto')}</option>
                {members.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>{t('sprites.win.transparent')}</span>
              <Switch size="sm" checked={w.transparent} onCheckedChange={(v) => update((l) => patchWindow(l, w.id, { transparent: v }))} aria-label={t('sprites.win.transparent')} />
            </label>
          </div>
        ))}
      </div>
      {phone ? (
        <p className="text-xs text-muted-foreground">{t('sprites.win.phoneNote')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={smallBtn} disabled={full} onClick={() => update((l) => addWindow(l, area()))} data-testid="stage-add">
              <Plus className="size-4" aria-hidden="true" /> {t('sprites.win.add')}
            </button>
            {full && <span className="text-xs text-muted-foreground">{t('sprites.win.max', { n: MAX_WINDOWS })}</span>}
          </div>
          {layout.windows.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('sprites.win.arrange')}</span>
              <button type="button" className={smallBtn} onClick={() => update((l) => arrange(l, 'row', area()))} data-testid="stage-row">{t('sprites.win.row')}</button>
              <button type="button" className={smallBtn} onClick={() => update((l) => arrange(l, 'grid', area()))} data-testid="stage-grid">{t('sprites.win.grid')}</button>
            </div>
          )}
          <label className="flex items-start justify-between gap-3 text-xs">
            <span className="flex flex-col gap-0.5">
              <span>{t('sprites.win.hideEmpty')}</span>
              <span className="text-muted-foreground">{t('sprites.win.hideEmptyHint')}</span>
            </span>
            <Switch size="sm" checked={layout.hideEmpty} onCheckedChange={(v) => update((l) => ({ ...l, hideEmpty: v }))} aria-label={t('sprites.win.hideEmpty')} />
          </label>
        </>
      )}
      {(layout.windows.length > 1 || layout.windows[0]?.transparent) && (
        <button type="button" className={cn(smallBtn, 'self-start border-transparent bg-transparent text-muted-foreground')} onClick={() => update(() => defaultLayout())}>
          {t('sprites.win.reset')}
        </button>
      )}
    </div>
  )
}
