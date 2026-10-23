// The guide's one mounted piece: decides when What's new and the section tours show.
// Mounted once in the app shell. Nothing here opens a view by itself except "Show me",
// which the user pressed.
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { resolveLanguage } from '@/lib/i18n'
import {
  canShowMe, markSeen, markTourDone, tipText, tourFor, tourSteps, whatsNew,
  type GuideOpen, type GuideState, type Place, type Tip,
} from '@/lib/guide'
import { APP_VERSION, TIPS, TOURS } from '@/lib/guide-tips'
import { BOARD_KEY } from '@/components/canvas/canvas-view'
import { showCharactersList } from '@/components/views/characters-view'
import { GUIDE_DETAIL_EVENT, GUIDE_MENU_EVENT } from './events'
import { HelpList } from './help-list'
import { useCurrentPlace } from './place'
import { findTarget } from './target'
import { Spotlight } from './spotlight'
import { WhatsNewCard } from './whats-new-card'

interface CardState { tips: Tip[]; index: number; lastVersion: string }

type Spot =
  /** from: where "Show me" was pressed, so the button back goes there */
  | { kind: 'single'; tip: Tip; from: 'card' | 'help' }
  | { kind: 'tour'; tourId: string; place: Place; steps: Tip[]; index: number }

const TOUR_DELAY_MS = 600
const TOUR_TRIES = 5

const guideNow = (): GuideState | undefined => useApp.getState().settings.guide
const save = (next: GuideState) => useApp.getState().updateSettings({ guide: next })

/** A panel that lives inside the open chat (or a list's first entry) takes a while to mount after the chat opens (longer on a slow phone or in a
 *  heavy chat): the ask is repeated every RETRY_MS until the tip's target is on screen, at most RETRIES times. */
const RETRY_MS = 150
const RETRIES = 20

/** Run `act` (it only ever sets something open) again and again until the target shows. A tip with no target
 *  has nothing to wait for: two tries, then it is left as it is. */
function untilTarget(act: () => void, target: string | undefined) {
  const max = target ? RETRIES : 2
  let n = 0
  const tick = () => {
    act()
    if (++n < max && !(target && findTarget(target))) setTimeout(tick, RETRY_MS)
  }
  setTimeout(tick, RETRY_MS)
}

const isNarrow = () => window.matchMedia('(max-width: 767px)').matches

/** "Show me": take the user to the place a tip is about. A panel of a chat with no chat
 *  to open is skipped: the spotlight then falls back to the centred bubble. */
function openPlace(open: GuideOpen, target?: string) {
  const app = useApp.getState()
  if (open.panel === 'reference') { app.setHelpOpen(true); return }
  const narrow = isNarrow()
  const panel = open.panel ?? (narrow ? open.narrowPanel : undefined)
  if (panel) {
    // the open chat, else the newest one
    const chat = app.chats.find((c) => c.id === app.activeChatId) ?? [...app.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (!chat) return
    if (panel === 'editor') { app.openCharacterOnTab(chat.characterId, open.tab ?? 'core'); return }
    if (app.view === 'chat' && app.activeChatId === chat.id) app.closeDrawer()
    else app.openChat(chat.id)
    untilTarget(() => {
      if (panel === 'dashboard') useApp.getState().openDashboard()
      else window.dispatchEvent(new CustomEvent(GUIDE_MENU_EVENT))
    }, target)
    return
  }
  if (open.board) {
    // a Canvas that is not mounted yet reads the board from storage; one that is, from the event
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(open.board)) } catch { /* the event still reaches a mounted Canvas */ }
    window.dispatchEvent(new CustomEvent('rp-guide-board', { detail: open.board }))
  }
  if (open.list) {
    // a card editor left open would hide the list
    app.openCharacter(null)
    showCharactersList(open.list)
  }
  // 'chat' = the open chat; with none open (the Chats item would only show the list) the newest one
  if (open.view === 'chat') {
    const newest = app.activeChatId ? null : [...app.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (newest) app.openChat(newest.id)
    else app.navigate('chats')
  } else app.navigate(open.view)
  if (open.detail) untilTarget(() => window.dispatchEvent(new CustomEvent(GUIDE_DETAIL_EVENT, { detail: open.view })), target)
}

export function GuideHost() {
  const t = useT()
  const mobile = useIsMobile()
  const hydrated = useApp((s) => s.hydrated)
  const guide = useApp((s) => s.settings.guide)
  const hasChats = useApp((s) => s.chats.length > 0)
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const place = useCurrentPlace()
  const [card, setCard] = useState<CardState | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const helpOpen = useApp((s) => s.guideHelpOpen)
  const setHelpOpen = useApp((s) => s.setGuideHelpOpen)
  // kept while the user is away on "Show me", so "Back to help" lands on the same search
  const [helpQuery, setHelpQuery] = useState('')

  // What's new: after the first load, and again whenever the stored state asks for it
  // (Settings → Show what's new again). A build with nothing new just records its version.
  useEffect(() => {
    if (!hydrated || card) return
    const r = whatsNew(TIPS, guide, APP_VERSION, hasChats)
    if (r.tips.length > 0) setCard({ tips: r.tips, index: 0, lastVersion: r.lastVersion })
    else if (guide?.lastVersion !== r.lastVersion) save({ ...guide, lastVersion: r.lastVersion })
  }, [hydrated, guide, hasChats, card])

  const closeCard = useCallback(() => {
    if (!card) return
    save(markSeen(guideNow(), card.tips.map((tip) => tip.id), card.lastVersion))
    setCard(null)
    setSpot(null)
  }, [card])

  // A tour starts on the first visit to its place, once nothing else of the guide is up.
  // Steps whose target is not on screen are left out; none on screen = no tour (and not done).
  useEffect(() => {
    if (!hydrated || !place || card || spot || helpOpen) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const attempt = () => {
      const tour = tourFor(TOURS, place, guideNow())
      if (!tour) return
      const steps = tourSteps(tour, TIPS).filter((tip) => findTarget(tip.target))
      if (steps.length > 0) { setSpot({ kind: 'tour', tourId: tour.id, place, steps, index: 0 }); return }
      // the screen may still be loading its content: look a few more times
      if (++tries < TOUR_TRIES) timer = setTimeout(attempt, TOUR_DELAY_MS)
    }
    timer = setTimeout(attempt, TOUR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [hydrated, place, card, spot, guide, helpOpen])

  // leaving the place ends its tour, without counting it as done
  useEffect(() => {
    if (spot?.kind === 'tour' && place !== spot.place) setSpot(null)
  }, [place, spot])

  const showFromHelp = (tip: Tip) => {
    setHelpOpen(false)
    if (tip.open) openPlace(tip.open, tip.target)
    // an element to point at: spotlight it; otherwise the place itself is the answer
    if (tip.target) setSpot({ kind: 'single', tip, from: 'help' })
  }
  const helpList = (
    <HelpList
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      query={helpQuery}
      onQuery={setHelpQuery}
      onShowMe={showFromHelp}
      onReference={() => { setHelpOpen(false); useApp.getState().setHelpOpen(true) }}
      lang={lang}
      mobile={mobile}
    />
  )

  if (spot?.kind === 'single') {
    const fromHelp = spot.from === 'help'
    const back = () => { setSpot(null); if (fromHelp) setHelpOpen(true) }
    return (
      <>
      {helpList}
      <Spotlight
        target={spot.tip.target}
        title={tipText(spot.tip.title, lang)}
        body={tipText(spot.tip.body, lang)}
        step={0}
        total={1}
        mobile={mobile}
        primary={{ label: t(fromHelp ? 'guide.backToHelp' : 'guide.backToCard'), onClick: back }}
        secondary={{ label: t('guide.close'), onClick: fromHelp ? () => setSpot(null) : closeCard }}
        onEscape={back}
      />
      </>
    )
  }

  if (spot?.kind === 'tour') {
    const { steps, index } = spot
    const tip = steps[index]
    if (!tip) return null
    const finish = () => {
      save(markTourDone(guideNow(), spot.tourId))
      setSpot(null)
    }
    // a step whose target went away meanwhile is passed over
    const move = (dir: 1 | -1) => {
      for (let i = index + dir; i >= 0 && i < steps.length; i += dir) {
        const s = steps[i]
        if (s && findTarget(s.target)) { setSpot({ ...spot, index: i }); return }
      }
      if (dir === 1) finish()
    }
    const hasPrev = steps.slice(0, index).some((s) => findTarget(s.target))
    const isLast = !steps.slice(index + 1).some((s) => findTarget(s.target))
    return (
      <>
      {helpList}
      <Spotlight
        target={tip.target}
        title={tipText(tip.title, lang)}
        body={tipText(tip.body, lang)}
        step={index}
        total={steps.length}
        mobile={mobile}
        onBack={hasPrev ? () => move(-1) : undefined}
        primary={{ label: isLast ? t('guide.done') : t('guide.next'), onClick: () => move(1) }}
        secondary={{ label: t('guide.skip'), onClick: finish }}
        onEscape={finish}
      />
      </>
    )
  }

  if (card) {
    return (
      <>
      {helpList}
      <WhatsNewCard
        tips={card.tips}
        index={card.index}
        lang={lang}
        mobile={mobile}
        hasChats={hasChats}
        onShowMe={(tip) => { if (tip.open) openPlace(tip.open, tip.target); setSpot({ kind: 'single', tip, from: 'card' }) }}
        onNext={() => setCard({ ...card, index: card.index + 1 })}
        onClose={closeCard}
      />
      </>
    )
  }

  return helpList
}
