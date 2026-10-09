// Where the relationship dashboard meets the chat view. `DashProvider` owns the one
// `useDashboard` for the open chat; the strip (≥ 1024 px, a column beside the log and the
// composer) and the phone bar (below 1024 px) read it from context, so the chat view itself
// does not re-render when the dashboard polls. Nothing renders while the plugin is absent or
// the first load is running: chats without the plugin do not shift.

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CaretLeft, CaretRight, GearSix } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/hooks/use-t'
import { setOwnPortraits, useOwnPortraits, usePortraitMap } from '@/lib/portraits'
import { useApp } from '@/lib/store'
import { PortraitDialog } from '@/components/library/portrait-dialog'
import { DashCtx, useDashMaybe } from './dash-context'
import { DashEmpty } from './dash-empty'
import { DashPhoneBar, DashPhoneSheet } from './dash-phone'
import { DashSettings } from './dash-settings'
import { DashStrip } from './dash-strip'
import { DashWide } from './dash-wide'
import { useDashboard } from './use-dashboard'

export { useDashMaybe }

export function DashProvider({ chatId, children }: { chatId: string; children: ReactNode }) {
  const dash = useDashboard(chatId)
  return <DashCtx.Provider value={dash}>{children}</DashCtx.Provider>
}

/**
 * Leaving the settings view (Back, Esc, the backdrop, the close button) asks first while a
 * section has unsaved edits. `DashSettings` reports its dirtiness through `setDirty`.
 */
function useSettingsGuard() {
  const t = useT()
  const [confirm, dialog] = useConfirm()
  const dirty = useRef(false)
  const setDirty = useCallback((d: boolean) => { dirty.current = d }, [])
  const canLeave = async (): Promise<boolean> =>
    !dirty.current || confirm({ title: t('dash.set.discardTitle'), description: t('dash.set.discardBody'), actionLabel: t('dash.set.discard') })
  return { setDirty, canLeave, dialog }
}

/**
 * "Open the dashboard" requests (the avatar menu) arrive as a store counter. A mount reacts
 * only to a change after it mounted, and only when its own layout is the one on screen: both
 * mounts are always in the tree, CSS hides one (the strip from 1024 px, the phone bar below).
 */
function useDashOpenRequest(wide: boolean, onOpen: () => void) {
  const counter = useApp((s) => s.dashOpen)
  const seen = useRef(counter)
  const open = useRef(onOpen)
  open.current = onOpen
  useEffect(() => {
    if (counter === seen.current) return
    seen.current = counter
    if (window.matchMedia('(min-width: 1024px)').matches === wide) open.current()
  }, [counter, wide])
}

const STRIP_KEY = 'rp.dashStrip'

/** '1' = expanded (the default), '0' = collapsed. Storage may be blocked: never throw. */
function readExpanded(): boolean {
  try { return localStorage.getItem(STRIP_KEY) !== '0' } catch { return true }
}
function writeExpanded(v: boolean) {
  try { localStorage.setItem(STRIP_KEY, v ? '1' : '0') } catch { /* private mode */ }
}

/**
 * name → portrait for the names the dashboard lists: the user's own portrait (the Library's, one
 * per name for every chat), else the chat's card or a group member, else any card or persona of
 * that name, else initials.
 */
function useAvatars(chatId: string, names: string[] | undefined): Record<string, string | undefined> {
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const card = useApp((s) => s.characters.find((c) => c.id === chat?.characterId))
  const map = usePortraitMap([card?.id, ...(card?.members ?? [])])
  const key = (names ?? []).join('|')
  return useMemo(() => {
    const out: Record<string, string | undefined> = {}
    for (const n of key ? key.split('|') : []) out[n] = map.get(n.toLowerCase())
    return out
  }, [map, key])
}

/** The portrait dialog the dashboard opens from a click on the focused character's avatar. */
function usePortraitEdit(avatars: Record<string, string | undefined>) {
  const own = useOwnPortraits()
  const [name, setName] = useState<string | null>(null)
  const dialog = name ? (
    <PortraitDialog
      name={name}
      current={avatars[name]}
      own={!!own[name.toLowerCase()]}
      open
      onOpenChange={(o) => { if (!o) setName(null) }}
      onSaved={setOwnPortraits}
    />
  ) : null
  return { open: setName, dialog }
}

/** The name the chat shows for {{user}}: the chat's persona, else the default one. */
function useUserName(chatId: string): string {
  const personaId = useApp((s) => s.chats.find((c) => c.id === chatId)?.personaId)
  const personas = useApp((s) => s.personas)
  return (personas.find((p) => p.id === personaId) ?? personas.find((p) => p.isDefault))?.name ?? ''
}

export function DashStripMount({ chatId }: { chatId: string }) {
  const dash = useContext(DashCtx)
  const t = useT()
  const avatars = useAvatars(chatId, dash?.view?.order)
  const portrait = usePortraitEdit(avatars)
  const userName = useUserName(chatId)
  const [expanded, setExpanded] = useState(readExpanded)
  const [wideOpen, setWideOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const [notebookSignal, setNotebookSignal] = useState(0)
  const guard = useSettingsGuard()
  // an empty dashboard has no sheet: asking for it unfolds the strip
  useDashOpenRequest(true, () => { setSettings(false); if (dash?.status === 'empty') { setExpanded(true); writeExpanded(true) } else setWideOpen(true) })
  if (!dash || dash.status === 'absent' || dash.status === 'loading') return null
  const toggle = () => setExpanded((v) => { writeExpanded(!v); return !v })

  if (dash.status === 'empty') {
    if (!expanded) {
      return (
        <div className="hidden h-full w-7 shrink-0 flex-col items-center border-l border-border bg-card py-2 lg:flex">
          <button type="button" onClick={toggle} aria-label={t('dash.expand')} title={t('dash.expand')} className="rounded-none p-1 text-muted-foreground hover:text-foreground">
            <CaretLeft className="size-4" />
          </button>
        </div>
      )
    }
    return (
      <aside className="hidden h-full w-[272px] shrink-0 flex-col border-l border-border bg-card lg:flex" aria-label={t('dash.title')}>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="font-heading text-[15px]">{t('dash.title')}</span>
          <Button variant="ghost" size="icon-xs" onClick={toggle} aria-label={t('dash.collapse')} title={t('dash.collapse')} className="ml-auto rounded-none">
            <CaretRight />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashEmpty
            hasMessages={(dash.data?.messages ?? 0) > 0}
            onBuild={() => { void dash.refresh() }}
            building={dash.refreshing}
            error={dash.data?.lastError?.message ?? null}
          />
        </div>
      </aside>
    )
  }

  const view = dash.view
  if (!view || !dash.focus) return null
  return (
    <div className="hidden h-full shrink-0 lg:block">
      <DashStrip
        chatId={chatId}
        view={view}
        focus={dash.focus}
        onFocus={dash.setFocus}
        onOpen={() => setWideOpen(true)}
        onNotebook={() => { setSettings(false); setNotebookSignal(Date.now()); setWideOpen(true) }}
        onRefresh={() => { void dash.refresh() }}
        refreshing={dash.refreshing}
        collapsed={!expanded}
        onCollapse={toggle}
        now={dash.now}
        avatars={avatars}
        onPortrait={portrait.open}
        userName={userName}
      />
      {/* inside the sheet while it is open, so its focus trap does not hold the dialog */}
      {!wideOpen && portrait.dialog}
      <Sheet
        open={wideOpen}
        onOpenChange={(o) => {
          if (o) { setWideOpen(true); return }
          void (async () => {
            if (settings && !(await guard.canLeave())) return
            setWideOpen(false)
            setSettings(false)
          })()
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-[min(1180px,calc(100vw-48px))] data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('dash.title')}</SheetTitle>
          </SheetHeader>
          {settings ? (
            <DashSettings
              chatId={chatId}
              view={view}
              onBack={() => { void guard.canLeave().then((ok) => { if (ok) setSettings(false) }) }}
              onSaved={() => { void dash.reload() }}
              onDirty={guard.setDirty}
            />
          ) : (
            <DashWide
              chatId={chatId}
              notebookSignal={notebookSignal}
              view={view}
              focus={dash.focus}
              onFocus={dash.setFocus}
              onRefresh={() => { void dash.refresh() }}
              refreshing={dash.refreshing}
              onSettings={() => setSettings(true)}
              onClose={() => setWideOpen(false)}
              now={dash.now}
              avatars={avatars}
              onPortrait={portrait.open}
              userName={userName}
            />
          )}
          {guard.dialog}
          {portrait.dialog}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function DashPhoneMount({ chatId }: { chatId: string }) {
  const dash = useContext(DashCtx)
  const t = useT()
  const avatars = useAvatars(chatId, dash?.view?.order)
  const portrait = usePortraitEdit(avatars)
  const userName = useUserName(chatId)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const guard = useSettingsGuard()
  useDashOpenRequest(false, () => { setSettings(false); if (dash?.status !== 'empty') setOpen(true) })
  if (!dash || dash.status === 'absent' || dash.status === 'loading') return null

  if (dash.status === 'empty') {
    const hasMessages = (dash.data?.messages ?? 0) > 0
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-sm lg:hidden">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{t('dash.empty.title')}</span>
        {hasMessages && (
          <Button size="xs" variant="outline" className="rounded-none" disabled={dash.refreshing} onClick={() => { void dash.refresh() }}>
            {dash.refreshing ? t('dash.refreshing') : t('dash.empty.build')}
          </Button>
        )}
      </div>
    )
  }

  const view = dash.view
  if (!view || !dash.focus) return null
  return (
    <div className="lg:hidden">
      <DashPhoneBar view={view} focus={dash.focus} onOpen={() => setOpen(true)} />
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (o) { setOpen(true); return }
          void (async () => {
            if (settings && !(await guard.canLeave())) return
            setOpen(false)
            setSettings(false)
          })()
        }}
      >
        <SheetContent side="bottom" className="h-[85dvh] gap-0 p-0">
          {settings ? (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>{t('dash.set.title')}</SheetTitle>
              </SheetHeader>
              <DashSettings
                chatId={chatId}
                view={view}
                onBack={() => { void guard.canLeave().then((ok) => { if (ok) setSettings(false) }) }}
                onSaved={() => { void dash.reload() }}
                onDirty={guard.setDirty}
              />
            </>
          ) : (
            <>
              <SheetHeader className="shrink-0 flex-row items-center gap-2 px-4 pt-4 pr-12 pb-2">
                <SheetTitle className="min-w-0 flex-1 font-heading">{t('dash.title')}</SheetTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => setSettings(true)} aria-label={t('dash.set.open')} title={t('dash.set.open')} className="rounded-none">
                  <GearSix />
                </Button>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <DashPhoneSheet
                  view={view}
                  focus={dash.focus}
                  onFocus={dash.setFocus}
                  onRefresh={() => { void dash.refresh() }}
                  refreshing={dash.refreshing}
                  now={dash.now}
                  avatars={avatars}
                  onPortrait={portrait.open}
                  userName={userName}
                />
              </div>
            </>
          )}
          {guard.dialog}
          {portrait.dialog}
        </SheetContent>
      </Sheet>
    </div>
  )
}
