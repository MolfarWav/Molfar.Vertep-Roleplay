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
  view: 'home' | 'chats' | 'chat' | 'characters' | 'groups' | 'lorebooks' | 'litopys' | 'canvas' | 'presets' | 'quickreplies' | 'extensions' | 'settings' | 'personas' | 'marketplace'
  /** On the Canvas: which board. */
  board?: 'links' | 'prompt'
  /** Something to open on top of the view: a panel of the open chat, the character
   *  editor (of the open chat's character) on a tab, the commands reference. */
  panel?: 'dashboard' | 'chat-menu' | 'editor' | 'reference'
  /** With panel 'editor': the tab, by the editor's own tab key. */
  tab?: string
  /** With view 'characters' or 'groups': the list, not a card editor left open. */
  list?: true
  /** The panel to open instead of `panel` on a narrow screen (< 768 px). */
  narrowPanel?: 'chat-menu'
  /** With view 'lorebooks' or 'presets': open the first entry, since phones show the list first. */
  detail?: boolean
}

/** The help list's groups, in the order the list shows them. */
export const HELP_GROUPS = ['chat', 'story', 'characters', 'world', 'canvas', 'setup', 'help'] as const
export type HelpGroup = (typeof HELP_GROUPS)[number]

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
  /** For "Show me" (What's new and the help list). */
  open?: GuideOpen
  /** The help list's group: a tip with one is listed under "?", searchable. */
  help?: HelpGroup
  /** Extra words the help search matches (synonyms, other apps' names for it). */
  keywords?: Text
}

export type Place =
  | 'canvas.links' | 'canvas.prompt' | 'chat' | 'chat.menu' | 'dashboard' | 'soul' | 'litopys'
  | 'characters' | 'groups' | 'lorebooks' | 'presets'

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

/** The help list for a search: tips with a group whose title, body or keywords contain
 *  every word of the query (either language, so a mixed query still finds), in group
 *  order, then registry order. An empty query lists everything. */
export function searchHelp(tips: Tip[], query: string): Tip[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = (tip: Tip) =>
    [tip.title.en, tip.title.uk, tip.body.en, tip.body.uk, tip.keywords?.en ?? '', tip.keywords?.uk ?? '']
      .join(' ')
      .toLowerCase()
  const order = (tip: Tip) => HELP_GROUPS.indexOf(tip.help as HelpGroup)
  return tips
    .map((tip, i) => ({ tip, i }))
    .filter(({ tip }) => tip.help && words.every((w) => hay(tip).includes(w)))
    .sort((a, b) => order(a.tip) - order(b.tip) || a.i - b.i)
    .map(({ tip }) => tip)
}

/** Whether "Show me" can take the user to a tip's place (#87). A chat panel, the card editor of the open
 *  chat and the open chat itself all need a chat to exist; without one the button is replaced by a line saying so. */
export function canShowMe(open: GuideOpen | undefined, ctx: { hasChats: boolean; narrow: boolean }): boolean {
  if (!open) return true
  const panel = open.panel ?? (ctx.narrow ? open.narrowPanel : undefined)
  if (panel === 'reference') return true
  if (panel || open.view === 'chat') return ctx.hasChats
  return true
}
