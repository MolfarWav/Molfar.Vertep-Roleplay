// The guide's one mounted piece: decides when What's new and the section tours show.
// Mounted once in the app shell. Nothing here opens a view by itself except "Show me",
// which the user pressed.
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { resolveLanguage } from '@/lib/i18n'
import {
  markSeen, markTourDone, tipText, tourFor, tourSteps, whatsNew,
  type GuideOpen, type GuideState, type Place, type Tip,
} from '@/lib/guide'
import { APP_VERSION, TIPS, TOURS } from '@/lib/guide-tips'
import { BOARD_KEY } from '@/components/canvas/canvas-view'
import { useCurrentPlace } from './place'
import { findTarget } from './target'
import { Spotlight } from './spotlight'
import { WhatsNewCard } from './whats-new-card'

interface CardState { tips: Tip[]; index: number; lastVersion: string }

type Spot =
  | { kind: 'single'; tip: Tip }
  | { kind: 'tour'; tourId: string; place: Place; steps: Tip[]; index: number }

const TOUR_DELAY_MS = 600
const TOUR_TRIES = 5

const guideNow = (): GuideState | undefined => useApp.getState().settings.guide
const save = (next: GuideState) => useApp.getState().updateSettings({ guide: next })

/** "Show me": take the user to the place a tip is about. */
function openPlace(open: GuideOpen) {
  if (open.board) {
    // a Canvas that is not mounted yet reads the board from storage; one that is, from the event
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(open.board)) } catch { /* the event still reaches a mounted Canvas */ }
    window.dispatchEvent(new CustomEvent('rp-guide-board', { detail: open.board }))
  }
  // 'chat' = the last open chat, which is what the Chats rail item does
  useApp.getState().navigate(open.view === 'chat' ? 'chats' : open.view)
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
    if (!hydrated || !place || card || spot) return
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
  }, [hydrated, place, card, spot, guide])

  // leaving the place ends its tour, without counting it as done
  useEffect(() => {
    if (spot?.kind === 'tour' && place !== spot.place) setSpot(null)
  }, [place, spot])

  if (spot?.kind === 'single') {
    const back = () => setSpot(null)
    return (
      <Spotlight
        target={spot.tip.target}
        title={tipText(spot.tip.title, lang)}
        body={tipText(spot.tip.body, lang)}
        step={0}
        total={1}
        mobile={mobile}
        primary={{ label: t('guide.backToCard'), onClick: back }}
        secondary={{ label: t('guide.close'), onClick: closeCard }}
        onEscape={back}
      />
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
    )
  }

  if (card) {
    return (
      <WhatsNewCard
        tips={card.tips}
        index={card.index}
        lang={lang}
        mobile={mobile}
        onShowMe={(tip) => { if (tip.open) openPlace(tip.open); setSpot({ kind: 'single', tip }) }}
        onNext={() => setCard({ ...card, index: card.index + 1 })}
        onClose={closeCard}
      />
    )
  }

  return null
}
