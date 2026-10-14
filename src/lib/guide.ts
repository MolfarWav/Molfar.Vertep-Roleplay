// The in-app guide: What's new after an update, a short tour on the first visit to a
// section. Pure module (no store, no DOM): the registry lives in guide-tips.ts, the UI
// in components/guide/, and the state is the `guide` app setting so two machines on
// one account do not repeat each other.
//
// A tip points at an element by its `data-guide="<target>"` attribute, never by a CSS
// class or text. A tour is an ordered list of tip ids, started the first time its
// place is shown. A place is a screen the user can be on ('canvas.links', 'chat'...),
// reported by the component that draws it.

import type { Lang } from './i18n'

export type Text = Record<Lang, string>

/** Where "Show me" takes the user before the tip is drawn. */
export interface GuideOpen {
  /** A rail section, or 'chat' for the last open chat. */
  view: 'canvas' | 'chat' | 'settings' | 'home'
  /** On the Canvas: which board. */
  board?: 'links' | 'prompt'
}

export interface Tip {
  id: string
  /** The `data-guide` value of the element the tip points at. Absent = the text alone
   *  (the thing lives outside the app, in the shell around it). */
  target?: string
  title: Text
  body: Text
  /** The app version that brought the feature: What's new shows it once to anyone
   *  who last saw an older version. Tour-only tips leave it out. */
  since?: string
  /** For "Show me" from What's new. */
  open?: GuideOpen
}

export type Place = 'canvas.links' | 'canvas.prompt' | 'chat'

export interface Tour {
  id: string
  place: Place
  /** Tip ids in order. A step whose target is not on screen is skipped. */
  steps: string[]
}

/** The `guide` app setting. Every field is optional: an absent one is the default. */
export interface GuideState {
  /** What's new tips the user closed or went through. */
  seen?: string[]
  /** Tours finished or skipped. */
  tours?: string[]
  /** The app version whose What's new the user has had. Absent = never ran a guided build. */
  lastVersion?: string
  /** Tours start by themselves on a first visit. Default on. */
  showTours?: boolean
}

/** Numeric compare of dotted versions ("4.45.0" < "4.46.0" < "4.100.0"). A missing
 *  part counts as 0; anything that is not a number counts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** The version the guide arrived in. Someone with chats but no `lastVersion` played
 *  before it and gets What's new for what came after this. */
export const GUIDE_BASELINE = '4.43.0'

/**
 * The tips What's new should show now, oldest first, and the `lastVersion` to store
 * once they are handled.
 *
 * - A fresh install (no `lastVersion`, no chats) gets nothing: tours explain the
 *   sections on the first visit instead of a list of "new" things that are not new to them.
 * - Someone who played before the guide (no `lastVersion`, has chats) gets everything
 *   newer than GUIDE_BASELINE.
 * - Otherwise: tips newer than `lastVersion`, up to the current version, not yet seen.
 */
export function whatsNew(
  tips: Tip[],
  state: GuideState | undefined,
  appVersion: string,
  hasChats: boolean,
): { tips: Tip[]; lastVersion: string } {
  const from = state?.lastVersion ?? (hasChats ? GUIDE_BASELINE : null)
  if (from === null) return { tips: [], lastVersion: appVersion }
  const seen = new Set(state?.seen ?? [])
  const out = tips.filter(
    (tip) =>
      tip.since !== undefined &&
      !seen.has(tip.id) &&
      compareVersions(tip.since, from) > 0 &&
      compareVersions(tip.since, appVersion) <= 0,
  )
  out.sort((a, b) => compareVersions(a.since!, b.since!))
  return { tips: out, lastVersion: appVersion }
}

/** The tour to start on arriving at `place`, or null: tours switched off, already
 *  done, or none for this place. */
export function tourFor(tours: Tour[], place: Place, state: GuideState | undefined): Tour | null {
  if (state?.showTours === false) return null
  const done = new Set(state?.tours ?? [])
  return tours.find((tour) => tour.place === place && !done.has(tour.id)) ?? null
}

/** The tour's tips in order; ids that are not in the registry are dropped. */
export function tourSteps(tour: Tour, tips: Tip[]): Tip[] {
  const byId = new Map(tips.map((tip) => [tip.id, tip]))
  return tour.steps.flatMap((id) => {
    const tip = byId.get(id)
    return tip ? [tip] : []
  })
}

const addUnique = (list: string[] | undefined, ids: string[]): string[] => [...new Set([...(list ?? []), ...ids])]

/** State after What's new was handled (closed, or every tip gone through). */
export function markSeen(state: GuideState | undefined, ids: string[], lastVersion: string): GuideState {
  return { ...state, seen: addUnique(state?.seen, ids), lastVersion }
}

/** State after a tour was finished or skipped. */
export function markTourDone(state: GuideState | undefined, tourId: string): GuideState {
  return { ...state, tours: addUnique(state?.tours, [tourId]) }
}

/** Settings → "Show all tours again". */
export function resetTours(state: GuideState | undefined): GuideState {
  return { ...state, tours: [] }
}

/** The tip's text in the user's language (English when a translation is missing). */
export const tipText = (text: Text, lang: Lang): string => text[lang] || text.en
