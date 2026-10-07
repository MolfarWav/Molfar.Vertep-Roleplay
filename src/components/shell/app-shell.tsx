
import { Fragment, useEffect, useState } from 'react'
import { CircleNotch, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp, DRAWER_VIEWS, type ViewKey } from '@/lib/store'
import { takeReloadReason } from '@/lib/engine'
import { useIsDesktop, useIsWideRail } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import { SectionHostProvider } from '@/components/shell/section-page'
import { useBackClose } from '@/hooks/use-back-close'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { HomeView } from '@/components/views/home-view'
import { CharactersView } from '@/components/views/characters-view'
import { MarketplaceView } from '@/components/views/marketplace-view'
import { ChatsView } from '@/components/views/chats-view'
import { ChatView } from '@/components/chat/chat-view'
import { PersonasView } from '@/components/views/personas-view'
import { PresetsView } from '@/components/views/presets-view'
import { LorebooksView } from '@/components/views/lorebooks-view'
import { LitopysView } from '@/components/library/litopys-view'
import { QuickRepliesView } from '@/components/views/quickreplies-view'
import { ExtensionsView } from '@/components/views/extensions-view'
import { ConnectionsView } from '@/components/views/connections-view'
import { SettingsView } from '@/components/views/settings-view'
import { ThemeApplier } from '@/components/theme-applier'
import { MobileTabBar } from '@/components/shell/mobile-tab-bar'
import { SECTIONS, sectionGroups, type SectionItem } from '@/components/shell/sections'

export function AppShell() {
  const [mounted, setMounted] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const view = useApp((s) => s.view)
  // a boolean, never the streaming object: subscribing to the object here
  // re-rendered the whole shell on every token
  const streaming = useApp((s) => s.streaming !== null)
  const boot = useApp((s) => s.boot)
  const bootError = useApp((s) => s.bootError)
  const hydrate = useApp((s) => s.hydrate)
  const isDesktop = useIsDesktop()

  useEffect(() => setMounted(true), [])

  // Desktop invariant: the page behind is always home/chats/chat. A persisted
  // section view (or a phone session resized wide) becomes a drawer. Phones
  // only have drawers over an open chat: one still open once the chat is gone
  // (or the window shrinks off a desktop page) becomes the page.
  useEffect(() => {
    const { view: v, drawer } = useApp.getState()
    if (isDesktop) {
      if (DRAWER_VIEWS.has(v)) useApp.setState({ drawer: v, view: 'home' })
    } else if (drawer && v !== 'chat') {
      useApp.setState({ view: drawer, drawer: null })
    }
  }, [isDesktop, view])
  // Mobile back, outermost first (declaration order is push order): any tab
  // but Home returns to Home, however many tabs were flipped through; an open
  // chat returns to the chat list like its own back button. The section
  // drawer is a sheet, and sheets, dialogs and detail pages carry their own
  // layers above these.
  useBackClose(view !== 'home', () => useApp.getState().setView('home'))
  useBackClose(view === 'chat', () => useApp.getState().closeChat())

  // engine hydrate — characters/chats/personas/presets/lorebooks/regex/models
  useEffect(() => { void hydrate() }, [hydrate])

  // A reload the app asked for explains itself once it lands. Nothing shown
  // here means the reload came from the browser, not from the app.
  useEffect(() => {
    const reason = takeReloadReason()
    if (reason) toast(reason)
  }, [])

  // Mobile keyboards shrink the VISUAL viewport only — dvh keeps the layout
  // full-height and buries the composer (and the bottom of the chat) under
  // the keyboard, making the last messages unreachable until it closes.
  // Track the visible height and size the shell to it, so the chat log keeps
  // its scrollable area while typing. The scroll clamp kills the residual
  // page pan browsers apply while the keyboard is up.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const focused = document.activeElement
      const editing = focused instanceof HTMLElement && (focused.matches('input, textarea') || focused.isContentEditable)
      setKeyboardOpen(window.matchMedia('(pointer: coarse)').matches && editing)
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0
    }
    apply()
    document.addEventListener('focusin', apply)
    document.addEventListener('focusout', apply)
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      document.removeEventListener('focusin', apply)
      document.removeEventListener('focusout', apply)
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      document.documentElement.style.removeProperty('--vvh')
    }
  }, [])

  if (!mounted || boot === 'loading') {
    return (
      <div className="flex items-center justify-center bg-background" style={{ height: 'var(--vvh, 100dvh)' }}>
        <CircleNotch className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  if (boot === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 bg-background px-6 text-center" style={{ height: 'var(--vvh, 100dvh)' }}>
        <p className="text-sm font-medium text-foreground">Can&apos;t reach the Chrysalis engine</p>
        <p className="max-w-sm text-xs text-muted-foreground">{bootError}</p>
        <Button variant="outline" size="sm" onClick={() => void hydrate()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-background text-foreground" style={{ height: 'var(--vvh, 100dvh)' }}>
      <ThemeApplier />
      <div className="flex min-h-0 flex-1">
        <IconRail />
        <main className="min-w-0 flex-1 overflow-hidden">
          {renderView(view)}
        </main>
      </div>
      {view !== 'chat' && !keyboardOpen && <MobileTabBar />}
      <SectionDrawer isDesktop={isDesktop} />
      {/* Live generation status, below the header line at the right edge:
          clear of the header buttons, the composer, toasts and quick replies. */}
      {streaming && (
        <span className="pointer-events-none fixed top-14 right-2 z-30 flex items-center gap-1 rounded-md border border-border bg-popover/90 px-1.5 py-1 text-[11px] text-primary backdrop-blur">
          <CircleNotch className="size-3 animate-spin" aria-hidden="true" />
          generating…
        </span>
      )}
      <Toaster position={isDesktop ? "bottom-right" : "top-center"} visibleToasts={isDesktop ? 3 : 1} closeButton />
    </div>
  )
}

/** The one mounted view for a section key — the page on mobile and (for the
 *  home/chat surfaces) on desktop too; drawer sections render through the
 *  same component inside SectionDrawer. */
function renderView(v: ViewKey) {
  switch (v) {
    case 'home': return <HomeView />
    case 'chats': return <ChatsView />
    case 'chat': return <ChatView />
    case 'characters': return <CharactersView />
    case 'marketplace': return <MarketplaceView />
    case 'personas': return <PersonasView />
    case 'presets': return <PresetsView />
    case 'lorebooks': return <LorebooksView />
    case 'litopys': return <LitopysView />
    case 'quickreplies': return <QuickRepliesView />
    case 'extensions': return <ExtensionsView />
    case 'connections': return <ConnectionsView />
    case 'settings': return <SettingsView />
  }
}

/** Section drawer: the page behind stays mounted (a chat keeps its scroll and
 *  any running stream) and closing the drawer drops you right back into it.
 *  On phones it opens only over a chat; elsewhere there a section is the page.
 *  Desktop: slides over the left part of the screen beside the rail and stops
 *  short of the right edge; clicking the uncovered side or Esc closes it.
 *  Mobile: covers the open chat below its section bar, full width. */
function SectionDrawer({ isDesktop }: { isDesktop: boolean }) {
  const drawer = useApp((s) => s.drawer)
  const closeDrawer = useApp((s) => s.closeDrawer)
  const wide = useRailWide()
  const t = useT()
  const item = SECTIONS.find((i) => i.key === drawer)
  const label = item ? t(item.labelKey) : ''
  const railOffset = !isDesktop ? 'top-11' : wide ? 'left-[206px]' : 'left-12'
  return (
    // non-modal and without pointer dismissal: the rail (or the chat's section
    // bar) stays live, since pressing it must not read as an outside-close; the
    // page area closes via the backdrop's own click, Esc and the X keep working
    <Sheet modal={false} disablePointerDismissal open={!!drawer} onOpenChange={(open) => { if (!open) closeDrawer() }}>
      <SheetContent
        // it comes out of whatever opened it: the rail on desktop, the bar
        // above it on mobile
        side={isDesktop ? 'left' : 'top'}
        aria-label={label}
        // the drawer and its dim sit beside the rail / below the section bar,
        // never over it: it stays clickable to flip sections or close
        overlayClassName={cn('bg-black/45', railOffset)}
        onOverlayClick={closeDrawer}
        className={cn(
          'gap-0',
          isDesktop
            ? cn(
                // the Library holds a timeline, character cards and a ledger side by side: it gets more room
                // 88vw ran past the screen: the drawer starts after the rail, so its room is the screen minus the rail and a gap
                drawer === 'litopys' ? (wide ? 'data-[side=left]:w-[min(1200px,calc(100vw-206px-16px))]' : 'data-[side=left]:w-[min(1200px,calc(100vw-48px-16px))]') : 'data-[side=left]:w-[min(720px,75vw)]',
                'data-[side=left]:border-r-2 data-[side=left]:border-primary data-[side=left]:sm:max-w-none',
                wide ? 'data-[side=left]:left-[206px]' : 'data-[side=left]:left-12',
              )
            : 'data-[side=top]:top-11 data-[side=top]:bottom-0 data-[side=top]:max-h-none',
        )}
        // mobile: the section bar's lit icon is the title, and tapping it again closes
        showCloseButton={isDesktop}
      >
        {isDesktop && (
          <div className="flex h-11 shrink-0 items-center border-b border-border pr-12 pl-4 font-heading text-[17px]">
            {label}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SectionHostProvider value="drawer">{drawer && renderView(drawer)}</SectionHostProvider>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** The rail shows labels when the window is wide enough and the user has not
 *  collapsed it; collapsed, it is the slim icon rail. */
function useRailWide() {
  const roomy = useIsWideRail()
  const collapsed = useApp((s) => s.railCollapsed)
  return roomy && !collapsed
}

function IconRail() {
  const view = useApp((s) => s.view)
  const drawer = useApp((s) => s.drawer)
  const navigate = useApp((s) => s.navigate)
  const closeDrawer = useApp((s) => s.closeDrawer)
  const railCollapsed = useApp((s) => s.railCollapsed)
  const setRailCollapsed = useApp((s) => s.setRailCollapsed)
  // the toggle exists only where a labeled rail fits; a slim rail has nothing to hide
  const roomy = useIsWideRail()
  const wide = roomy && !railCollapsed
  const t = useT()

  const toggleLabel = t(wide ? 'nav.hideRail' : 'nav.showRail')
  const toggle = !roomy ? null : wide ? (
    <button
      type="button"
      onClick={() => setRailCollapsed(true)}
      aria-label={toggleLabel}
      title={toggleLabel}
      className="mx-2 mb-1 flex h-8 shrink-0 items-center justify-end rounded-md pr-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    >
      <CaretLeft className="size-4" aria-hidden="true" />
    </button>
  ) : (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setRailCollapsed(false)}
            aria-label={toggleLabel}
            className="mx-auto mb-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <CaretRight className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side="right">{toggleLabel}</TooltipContent>
    </Tooltip>
  )

  return (
    <nav
      aria-label="Primary sections"
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-card py-2 md:flex',
        wide ? 'w-[206px]' : 'w-12',
      )}
    >
      {toggle}
      {sectionGroups().map((group, gi) => (
        <Fragment key={String(group[0]!.group)}>
          {gi > 0 && <RailDivider wide={wide} pinned={group[0]!.group === 'end'} />}
          {group.map((item) => (
            <RailItem
              key={item.key}
              item={item}
              wide={wide}
              label={t(item.labelKey)}
              active={drawer ? drawer === item.key : view === item.key || (view === 'chat' && item.key === 'chats')}
              onClick={() => {
                // clicking the open drawer's icon toggles it shut; anything
                // else navigates (a section over a chat becomes its drawer)
                if (drawer === item.key) { closeDrawer(); return }
                navigate(item.key)
              }}
            />
          ))}
        </Fragment>
      ))}
    </nav>
  )
}

/** Between rail groups: the ornament when labels show, a short rule when not.
 *  `pinned` pushes it (and everything after it) to the bottom of the rail. */
function RailDivider({ wide, pinned }: { wide: boolean; pinned: boolean }) {
  return wide ? (
    <img
      src={`${import.meta.env.BASE_URL}divider-mute.svg`}
      alt=""
      aria-hidden="true"
      width={178}
      height={19}
      className={cn('mx-auto my-2 block h-[19px] w-[178px] shrink-0 select-none', pinned && 'mt-auto')}
      draggable={false}
    />
  ) : (
    <div aria-hidden="true" className={cn('mx-auto my-2.5 h-px w-6 shrink-0 bg-border', pinned && 'mt-auto')} />
  )
}

function RailItem({ item, wide, label, active, onClick }: {
  item: SectionItem
  wide: boolean
  label: string
  active: boolean
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex w-full shrink-0 items-center border-l-[3px] transition-colors',
        wide ? 'gap-3 py-2 pr-[22px] pl-[13px] font-heading text-[17px] leading-tight' : 'h-10 justify-center',
        active
          ? 'border-primary bg-linear-to-r from-primary/25 to-primary/[0.03] text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <item.icon className={cn('shrink-0', wide ? 'size-[19px]' : 'size-5', active && 'text-cta')} aria-hidden="true" />
      {wide && <span className="min-w-0 text-left">{label}</span>}
    </button>
  )
  if (wide) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
