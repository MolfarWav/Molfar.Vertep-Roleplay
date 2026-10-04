// Where the relationship dashboard meets the chat view. `DashProvider` owns the one
// `useDashboard` for the open chat; the strip (≥ 1024 px, a column beside the log and the
// composer) and the phone bar (below 1024 px) read it from context, so the chat view itself
// does not re-render when the dashboard polls. Nothing renders while the plugin is absent or
// the first load is running: chats without the plugin do not shift.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { DashEmpty } from './dash-empty'
import { DashPhoneBar, DashPhoneSheet } from './dash-phone'
import { DashStrip } from './dash-strip'
import { DashWide } from './dash-wide'
import { useDashboard, type UseDashboard } from './use-dashboard'

const Ctx = createContext<UseDashboard | null>(null)

export function DashProvider({ chatId, children }: { chatId: string; children: ReactNode }) {
  const dash = useDashboard(chatId)
  return <Ctx.Provider value={dash}>{children}</Ctx.Provider>
}

const STRIP_KEY = 'rp.dashStrip'

/** '1' = expanded (the default), '0' = collapsed. Storage may be blocked: never throw. */
function readExpanded(): boolean {
  try { return localStorage.getItem(STRIP_KEY) !== '0' } catch { return true }
}
function writeExpanded(v: boolean) {
  try { localStorage.setItem(STRIP_KEY, v ? '1' : '0') } catch { /* private mode */ }
}

/** name → avatar URL for the chat's card and every group member, matched by lower-cased name. */
function useAvatars(chatId: string, names: string[] | undefined): Record<string, string | undefined> {
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const characters = useApp((s) => s.characters)
  const key = (names ?? []).join('|')
  return useMemo(() => {
    const card = characters.find((c) => c.id === chat?.characterId)
    const cards = [card, ...(card?.members ?? []).map((id) => characters.find((c) => c.id === id))]
    const byName = new Map<string, string>()
    for (const c of cards) if (c?.avatar) byName.set(c.name.toLowerCase(), c.avatar)
    const out: Record<string, string | undefined> = {}
    for (const n of key ? key.split('|') : []) out[n] = byName.get(n.toLowerCase())
    return out
  }, [chat?.characterId, characters, key])
}

/** The name the chat shows for {{user}}: the chat's persona, else the default one. */
function useUserName(chatId: string): string {
  const personaId = useApp((s) => s.chats.find((c) => c.id === chatId)?.personaId)
  const personas = useApp((s) => s.personas)
  return (personas.find((p) => p.id === personaId) ?? personas.find((p) => p.isDefault))?.name ?? ''
}

export function DashStripMount({ chatId }: { chatId: string }) {
  const dash = useContext(Ctx)
  const t = useT()
  const avatars = useAvatars(chatId, dash?.view?.order)
  const userName = useUserName(chatId)
  const [expanded, setExpanded] = useState(readExpanded)
  const [wideOpen, setWideOpen] = useState(false)
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
        view={view}
        focus={dash.focus}
        onFocus={dash.setFocus}
        onOpen={() => setWideOpen(true)}
        onRefresh={() => { void dash.refresh() }}
        refreshing={dash.refreshing}
        collapsed={!expanded}
        onCollapse={toggle}
        now={dash.now}
        avatars={avatars}
        userName={userName}
      />
      <Sheet open={wideOpen} onOpenChange={setWideOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-[min(1180px,calc(100vw-48px))] data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('dash.title')}</SheetTitle>
          </SheetHeader>
          <DashWide
            view={view}
            focus={dash.focus}
            onFocus={dash.setFocus}
            onRefresh={() => { void dash.refresh() }}
            refreshing={dash.refreshing}
            onClose={() => setWideOpen(false)}
            now={dash.now}
            avatars={avatars}
            userName={userName}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function DashPhoneMount({ chatId }: { chatId: string }) {
  const dash = useContext(Ctx)
  const t = useT()
  const avatars = useAvatars(chatId, dash?.view?.order)
  const userName = useUserName(chatId)
  const [open, setOpen] = useState(false)
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
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85dvh] gap-0 p-0">
          <SheetHeader className="shrink-0 px-4 pt-4 pb-2">
            <SheetTitle className="font-heading">{t('dash.title')}</SheetTitle>
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
              userName={userName}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
