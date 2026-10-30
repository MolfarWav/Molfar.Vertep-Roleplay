import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretRight, GearSix, GlobeHemisphereWest } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MasterDetail } from '@/components/shell/master-detail'
import { PaneTitle, SectionPage } from '@/components/shell/section-page'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { setLooking } from '@/lib/attention'
import { useIsDesktop } from '@/hooks/use-mobile'
import { listWorldChats, useWorldLive, type WorldChat, type WorldRecord } from '@/lib/world'
import { formatK, LevelChip, type OpenWorldSettings } from '@/components/world/world-common'
import { WorldControls } from '@/components/world/world-controls'
import { WorldBackgrounds } from '@/components/world/world-backgrounds'
import { WorldRuns } from '@/components/world/world-runs'
import { WorldRecords } from '@/components/world/world-records'
import { WorldPlaces } from '@/components/world/world-places'
import { WorldStart } from '@/components/world/world-start'
import { NEW_WORLD, refreshSavedWorlds, useSavedWorlds, WorldDetail, WorldList } from '@/components/world/world-library'
import { BuildingWorldPanel, NewWorldSetup } from '@/components/world/world-start'
import { NewWorldChatDialog, type WorldSource } from '@/components/world/world-new-chat'
import { NEW_PROFILE, NewProfileEditor, ProfileEditor, ProfileList, useFocusedProfile } from '@/components/world/world-profiles'
import { useConfirm } from '@/components/ui/confirm'
import { refreshWorldProfiles, useWorldProfiles } from '@/lib/world-profiles'
import { WorldSettingsDialog } from '@/components/world/world-settings'

const TAB_KEY = 'rp.worldTab'

type Tab = 'overview' | 'places' | 'records' | 'start' | 'backgrounds' | 'runs'
const isTab = (v: string | null): v is Tab => v === 'overview' || v === 'places' || v === 'records' || v === 'start' || v === 'backgrounds' || v === 'runs'

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return isTab(v) ? v : 'overview'
  } catch {
    return 'overview'
  }
}

function saveTab(v: Tab) {
  try {
    sessionStorage.setItem(TAB_KEY, v)
  } catch {
    // storage is optional
  }
}

type ChatListProps = {
  items: WorldChat[] | null | 'missing'
  listError: string
  selectedId: string | null
  onSelect: (id: string) => void
}

type Top = 'chats' | 'worlds' | 'profiles'

/** The left pane's head: the section title, World settings, and the switch Chats | Profiles. */
function PaneHeader({ top, onTop, onOpenSettings }: { top: Top; onTop: (v: Top) => void; onOpenSettings: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <PaneTitle section="world" icon={<GlobeHemisphereWest className="size-4 text-primary" aria-hidden="true" />} />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto size-9 p-0 md:size-7"
          onClick={onOpenSettings}
          aria-label={t('world.settings.open')}
          title={t('world.settings.open')}
        >
          <GearSix className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <Tabs value={top} onValueChange={(v) => { if (v === 'chats' || v === 'worlds' || v === 'profiles') onTop(v) }}>
        <TabsList className="w-full max-md:h-10">
          <TabsTrigger value="chats" className="flex-1 max-md:h-10" data-testid="world-top-chats">{t('world.top.chats')}</TabsTrigger>
          <TabsTrigger value="worlds" className="flex-1 max-md:h-10" data-testid="world-top-worlds">{t('world.top.worlds')}</TabsTrigger>
          <TabsTrigger value="profiles" className="flex-1 max-md:h-10" data-testid="world-top-profiles">{t('world.top.profiles')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}

function ChatList({ items, listError, selectedId, onSelect }: ChatListProps) {
  const t = useT()
  const rel = useRelativeTime()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {listError && <p className="p-3 text-xs text-destructive">{t('world.list.loadError', { error: listError })}</p>}
        {items === 'missing' && <p className="p-3 text-xs text-muted-foreground">{t('world.missing')}</p>}
        {Array.isArray(items) && items.length === 0 && !listError && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('world.list.empty')}</p>
            <Button variant="outline" onClick={() => useApp.getState().setView('chats')}>
              {t('world.list.toChats')}
            </Button>
          </div>
        )}
        <ul className="flex flex-col p-1.5">
          {Array.isArray(items) &&
            items.map((c) => {
              const failed = !!c.error
              return (
                <li key={c.chatId}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.chatId)}
                    aria-current={c.chatId === selectedId ? 'true' : undefined}
                    data-testid="world-chat"
                    className={cn(
                      'relative flex min-h-12 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm max-md:pr-7',
                      c.chatId === selectedId ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      {failed && <span role="img" aria-label={t('world.list.failed')} className="size-2 shrink-0 rounded-full bg-destructive" />}
                      <span className="min-w-0 truncate">{c.title || c.cards.join(', ')}</span>
                      <LevelChip level={c.level} className="ml-auto" />
                    </span>
                    <span className={cn('truncate text-[11px]', failed ? 'text-destructive' : 'text-muted-foreground')}>
                      {t('world.list.counts', { n: c.records, f: c.fronts })}
                      {' · '}
                      {failed ? t('world.list.failed') : c.lastRunAt ? t('world.list.ran', { when: rel(c.lastRunAt) }) : t('world.list.never')}
                    </span>
                    {c.usage.runs > 0 && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {t('world.list.tokens', { tokens: formatK(c.usage.input + c.usage.output) })}
                      </span>
                    )}
                    <CaretRight className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:hidden" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
        </ul>
      </ScrollArea>
    </div>
  )
}

type ChatDetailProps = {
  chatId: string
  items: WorldChat[] | null | 'missing'
  tab: Tab
  onTabChange: (tab: Tab) => void
  onOpenSettings: OpenWorldSettings
}

function ChatDetail({ chatId, items, tab, onTabChange, onOpenSettings }: ChatDetailProps) {
  const t = useT()
  const chat = Array.isArray(items) ? items.find((c) => c.chatId === chatId) : undefined
  // a chat with the DM off and no records is not in the list, but a sheet can send you to it
  const storeTitle = useApp((s) => s.chats.find((c) => c.id === chatId)?.title)
  // a row of Places opens its record in Records, with the records already read
  const [openRec, setOpenRec] = useState<{ records: WorldRecord[]; editId?: string; add?: 'place' } | undefined>(undefined)
  const toRecords = (o: { records: WorldRecord[]; editId?: string; add?: 'place' }) => { setOpenRec(o); onTabChange('records') }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-3 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl max-md:sr-only">{chat?.title || storeTitle || ''}</h2>
            {chat && chat.cards.length > 0 && <p className="truncate text-sm text-muted-foreground">{chat.cards.join(', ')}</p>}
          </div>
          <Button variant="outline" onClick={() => useApp.getState().openChat(chatId)} className="self-start max-md:h-10">
            {t('world.openChat')}
          </Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => { if (isTab(v)) { setOpenRec(undefined); onTabChange(v) } }} className="mt-3">
          <TabsList className="max-md:h-10 max-md:w-full">
            <TabsTrigger value="overview" className="max-md:h-10">
              {t('world.tab.overview')}
            </TabsTrigger>
            <TabsTrigger value="places" className="max-md:h-10" data-testid="world-tab-places">
              {t('world.tab.places')}
            </TabsTrigger>
            <TabsTrigger value="records" className="max-md:h-10">
              {t('world.tab.records')}
            </TabsTrigger>
            <TabsTrigger value="start" className="max-md:h-10" data-testid="world-tab-start">
              {t('world.tab.start')}
            </TabsTrigger>
            <TabsTrigger value="backgrounds" className="max-md:h-10" data-testid="world-tab-backgrounds">
              {t('world.tab.backgrounds')}
            </TabsTrigger>
            <TabsTrigger value="runs" className="max-md:h-10">
              {t('world.tab.runs')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
        {tab === 'overview' && <WorldControls key={chatId} chatId={chatId} where="hub" wide onOpenSettings={onOpenSettings} />}
        {tab === 'places' && <WorldPlaces key={chatId} chatId={chatId} onOpenBackgrounds={() => onTabChange('backgrounds')} onOpenRecord={(r, all) => toRecords({ records: all, editId: r.id })} onAdd={(all) => toRecords({ records: all, add: 'place' })} />}
        {tab === 'records' && <WorldRecords key={`${chatId}:${openRec?.editId ?? ''}${openRec?.add ?? ''}`} chatId={chatId} initial={openRec} />}
        {tab === 'start' && <WorldStart key={chatId} chatId={chatId} onOpenSettings={onOpenSettings} onAccepted={() => onTabChange('records')} />}
        {tab === 'backgrounds' && <WorldBackgrounds key={chatId} wref={{ chatId }} worldName={chat?.title || storeTitle || ''} onOpenSettings={onOpenSettings} />}
        {tab === 'runs' && <WorldRuns key={chatId} chatId={chatId} />}
      </div>
    </div>
  )
}

export function WorldView() {
  const t = useT()
  const [items, setItems] = useState<WorldChat[] | null | 'missing'>(null)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFocus, setSettingsFocus] = useState<'build' | null>(null)
  /** 'build': from the links next to a world build, the dialog scrolls to the Build model row */
  const openSettings: OpenWorldSettings = (focus) => {
    setSettingsFocus(focus === 'build' ? 'build' : null)
    setSettingsOpen(true)
  }
  const [tab, setTab] = useState<Tab>(readTab)
  const [top, setTop] = useState<Top>('chats')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [worldId, setWorldId] = useState<string | null>(null)
  const [newChatFor, setNewChatFor] = useState<{ source: WorldSource; charId: string | null } | null>(null)
  const saved = useSavedWorlds((s) => s.list)
  const building = useSavedWorlds((s) => s.building)
  const focusWorld = useApp((s) => s.focusWorldWorldId)
  const profiles = useWorldProfiles((s) => s.list)
  const [confirm, confirmDialog] = useConfirm()
  const dirtyRef = useRef(false)
  const onDirty = useCallback((d: boolean) => { dirtyRef.current = d }, [])
  // unsaved profile text: ask before anything that would drop it
  const guard = async (go: () => void) => {
    if (dirtyRef.current && !(await confirm({ title: t('world.prof.leaveTitle'), description: t('world.prof.leaveWarn'), actionLabel: t('world.prof.leaveGo'), destructive: false }))) return
    dirtyRef.current = false
    go()
  }
  const [tick, setTick] = useState(0)
  const chats = useApp((s) => s.chats)
  const libraryCharacter = (chatId: string | undefined) => (chatId ? chats.find((c) => c.id === chatId)?.characterId ?? null : null)
  const focusChat = useApp((s) => s.focusWorldChatId)
  const liveViews = useWorldLive((s) => s.views)
  // tell the failure toast which chat is on screen (no toast about a chat you are looking at)
  const isDesktop = useIsDesktop()
  useEffect(() => {
    setLooking('world', selectedId && (isDesktop || detailOpen) ? selectedId : null)
    return () => setLooking('world', null)
  }, [selectedId, detailOpen, isDesktop])

  const current = Array.isArray(items) ? items.find((c) => c.chatId === selectedId) : undefined
  const count = Array.isArray(items) ? items.length : undefined
  const storeTitle = useApp((s) => s.chats.find((c) => c.id === selectedId)?.title)

  useEffect(() => {
    if (!focusChat) return
    useApp.setState({ focusWorldChatId: null })
    setTop('chats')
    setSelectedId(focusChat)
    setDetailOpen(true)
    setTab('overview')
    saveTab('overview')
  }, [focusChat])

  useEffect(() => {
    let live = true
    const load = () => {
      listWorldChats()
        .then((chats) => {
          if (!live) return
          if (chats === null) {
            setItems('missing')
            return
          }
          setItems(chats)
          setListError('')
          setSelectedId((cur) => {
            if (cur) return cur
            const firstOn = chats.find((c) => c.level !== 'off')
            return firstOn?.chatId ?? chats[0]?.chatId ?? null
          })
        })
        .catch((e: unknown) => {
          if (!live) return
          setListError(e instanceof Error ? e.message : String(e))
        })
    }
    void load()
    const id = setInterval(() => {
      if (!document.hidden) void load()
    }, 15_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [tick])

  const selectedViewSig = useMemo(() => {
    const v = selectedId ? liveViews[selectedId] : undefined
    if (!v) return ''
    return [v.lastRunAt, v.lastError?.at, v.settings.level].join('|')
  }, [liveViews, selectedId])

  useEffect(() => {
    if (!selectedViewSig) return
    setTick((n) => n + 1)
  }, [selectedViewSig])

  const selectChat = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  useEffect(() => { void refreshWorldProfiles() }, [])
  // "Open" in the toast after "Save world" lands on that world
  useEffect(() => {
    if (!focusWorld) return
    useApp.setState({ focusWorldWorldId: null })
    void refreshSavedWorlds()
    void guard(() => { setTop('worlds'); setWorldId(focusWorld); setDetailOpen(true) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusWorld])
  // "Edit profile" in the Overview or the chat's sheet lands here
  useFocusedProfile((id) => void guard(() => { setTop('profiles'); setProfileId(id); setDetailOpen(true) }))

  const changeTop = (v: Top) => void guard(() => { setTop(v); setDetailOpen(false) })
  const selectProfile = (id: string) => void guard(() => { setProfileId(id); setDetailOpen(true) })
  const profile = profiles?.find((p) => p.id === profileId)
  const world = Array.isArray(saved) ? saved.find((w) => w.id === worldId) : undefined
  const buildingWorld = world ? undefined : building.find((w) => w.id === worldId)
  const selectWorld = (id: string) => void guard(() => { setWorldId(id); setDetailOpen(true) })
  const hasSelection = top === 'chats' ? !!selectedId : top === 'worlds' ? !!world || !!buildingWorld || worldId === NEW_WORLD : !!profileId

  const handleTabChange = (v: Tab) => {
    setTab(v)
    saveTab(v)
  }

  return (
    <SectionPage section="world" count={top === 'chats' ? count : undefined} hideOnPhone={detailOpen && hasSelection}>
      <MasterDetail
        detailOpen={detailOpen && hasSelection}
        onBack={() => void guard(() => setDetailOpen(false))}
        detailTitle={top === 'chats' ? current?.title || storeTitle : top === 'worlds' ? (worldId === NEW_WORLD ? t('world.new.title') : world?.name ?? buildingWorld?.name) : profileId === NEW_PROFILE ? t('world.prof.new') : profile ? (profile.builtIn ? t(`world.level.${profile.id}` as MsgKey) : profile.name) : undefined}
        masterWidth="w-72"
        master={
          <aside aria-label={t('world.list.aria')} className="flex h-full min-h-0 flex-col">
            <PaneHeader top={top} onTop={changeTop} onOpenSettings={() => openSettings()} />
            {top === 'chats' ? (
              <ChatList items={items} listError={listError} selectedId={selectedId} onSelect={(id) => void guard(() => selectChat(id))} />
            ) : top === 'worlds' ? (
              <WorldList selectedId={worldId} onSelect={selectWorld} />
            ) : (
              <ProfileList selectedId={profileId} onSelect={selectProfile} onNew={() => selectProfile(NEW_PROFILE)} />
            )}
          </aside>
        }
        detail={
          top === 'worlds' ? (
            world ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <WorldDetail
                  key={world.id}
                  world={world}
                  onNewChat={(w) => setNewChatFor({ source: { worldId: w.id }, charId: libraryCharacter(w.from?.chatId) })}
                  onGone={() => { setWorldId(null); setDetailOpen(false) }}
                  onOpenSettings={openSettings}
                />
              </div>
            ) : worldId === NEW_WORLD ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NewWorldSetup onBegun={(id) => setWorldId(id)} onOpenSettings={openSettings} />
              </div>
            ) : buildingWorld ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <BuildingWorldPanel
                  key={buildingWorld.id}
                  worldId={buildingWorld.id}
                  onGone={() => { setWorldId(null); setDetailOpen(false) }}
                  onOpenSettings={openSettings}
                />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">{t('world.lib.pick')}</div>
            )
          ) : top === 'profiles' ? (
            profileId === NEW_PROFILE ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
                <NewProfileEditor key="new" onDirty={onDirty} onCancel={() => void guard(() => { setProfileId(null); setDetailOpen(false) })} onCreated={(id) => { setProfileId(id) }} />
              </div>
            ) : profile ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
                <ProfileEditor key={profile.id} profile={profile} onDirty={onDirty} onGone={() => { setProfileId(null); setDetailOpen(false) }} onOpenProfile={(id) => void guard(() => setProfileId(id))} />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">{t('world.prof.pick')}</div>
            )
          ) : selectedId ? (
            <ChatDetail chatId={selectedId} items={items} tab={tab} onTabChange={handleTabChange} onOpenSettings={openSettings} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              {items === null ? '…' : t('world.list.pick')}
            </div>
          )
        }
      />
      {confirmDialog}
      {newChatFor && <NewWorldChatDialog open onOpenChange={(o) => { if (!o) setNewChatFor(null) }} source={newChatFor.source} defaultCharId={newChatFor.charId} />}
      <WorldSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} focus={settingsFocus} chatId={top === 'chats' ? selectedId : null} chatTitle={current?.title || storeTitle || ''} />
    </SectionPage>
  )
}
