// One hue per rail item (docs/UI-CATALOG.md 8.2), so a glance at the icon tells the section. The colour tints the icon
// only; the label stays neutral and the icon shapes differ, so colour is never the only cue. Plain Tailwind classes,
// written out in full so the class scanner finds them.

export type RailHue = 'sky' | 'rose' | 'violet' | 'cyan' | 'amber' | 'fuchsia' | 'emerald' | 'orange' | 'indigo' | 'lime' | 'blue' | 'yellow' | 'teal' | 'zinc'

export const RAIL_HUES: Record<RailHue, string> = {
  sky: 'text-sky-600 dark:text-sky-400',
  rose: 'text-rose-600 dark:text-rose-400',
  violet: 'text-violet-600 dark:text-violet-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  amber: 'text-amber-600 dark:text-amber-400',
  fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  orange: 'text-orange-600 dark:text-orange-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  lime: 'text-lime-600 dark:text-lime-400',
  blue: 'text-blue-600 dark:text-blue-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  teal: 'text-teal-600 dark:text-teal-400',
  zinc: 'text-zinc-500 dark:text-zinc-400',
}
