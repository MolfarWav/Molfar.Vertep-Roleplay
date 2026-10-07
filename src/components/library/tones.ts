// Colours for the Library's small labels and card sections, by meaning (M4e): a fact's type, its
// weight and its state each read at a glance. Tailwind palette with dark variants, so both themes
// keep contrast; the base Badge supplies shape and size, these only colour it.
import type { LitFactType, LitFactWeight } from './litopys-api'

// written out in full so Tailwind sees every class
export const TYPE_TONE: Record<LitFactType, string> = {
  event: 'border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  trait: 'border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300',
  change: 'border-amber-500/40 bg-amber-500/14 text-amber-700 dark:text-amber-300',
  relation: 'border-rose-500/35 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  world: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  plan: 'border-indigo-500/35 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
}

export const WEIGHT_TONE: Record<LitFactWeight, string> = {
  everyday: 'border-border bg-transparent text-muted-foreground',
  important: 'border-orange-500/40 bg-orange-500/14 text-orange-700 dark:text-orange-300',
  key: 'border-red-600/50 bg-red-600/20 font-semibold text-red-700 dark:text-red-300',
}

export const TONE = {
  arc: 'border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300',
  subject: 'border-border bg-muted text-foreground',
  knownBy: 'border-teal-500/35 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  pinned: 'border-primary bg-primary text-primary-foreground',
  pinProposed: 'border-dashed border-primary/70 bg-transparent text-primary',
  edited: 'border-yellow-500/40 bg-yellow-500/12 text-yellow-800 dark:text-yellow-300',
  yours: 'border-fuchsia-500/35 bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300',
  merged: 'border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
  gone: 'border-border bg-muted/60 text-muted-foreground line-through',
  stale: 'border-amber-500/40 bg-amber-500/14 text-amber-700 dark:text-amber-300',
  kind: 'border-slate-500/35 bg-slate-500/12 text-slate-700 dark:text-slate-300',
  place: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
} as const

/** A character card's sections: a coloured rule on the left and a faint wash, so each block stands apart. */
export const SECTION_TONE = {
  pinned: 'border-l-primary bg-primary/[0.06]',
  traits: 'border-l-violet-500 bg-violet-500/[0.06]',
  changes: 'border-l-amber-500 bg-amber-500/[0.07]',
  relations: 'border-l-rose-500 bg-rose-500/[0.06]',
  other: 'border-l-slate-400 bg-transparent',
  knows: 'border-l-teal-500 bg-teal-500/[0.07]',
} as const

export const SECTION_TITLE_TONE = {
  pinned: 'text-primary',
  traits: 'text-violet-700 dark:text-violet-300',
  changes: 'text-amber-700 dark:text-amber-300',
  relations: 'text-rose-700 dark:text-rose-300',
  other: 'text-muted-foreground',
  knows: 'text-teal-700 dark:text-teal-300',
} as const

export type SectionKind = keyof typeof SECTION_TONE
