// One hue per kind of content (docs/UI-CATALOG.md 2.2): sky = schedule / scene, emerald = records / memory,
// violet = story / people, pink = plot, teal = place, amber = thing / warning, slate = neutral.
// Plain Tailwind palette classes (no hex), written out in full so the class scanner finds them. A tone is always
// paired with an icon or a word, never colour alone. `Tone` in dashboard/dash-common.tsx is the older, kind-named map.

export type ToneName = 'sky' | 'emerald' | 'violet' | 'pink' | 'teal' | 'amber' | 'slate'

export interface ToneClasses {
  /** the small solid square before a heading */
  square: string
  /** the soft fill and border of a tinted header or tile */
  fill: string
  /** text and icon ink on the soft fill (700 in light, 300 in dark) */
  ink: string
  /** a value chip: fill, border and ink together */
  chip: string
}

export const TONES: Record<ToneName, ToneClasses> = {
  sky: { square: 'bg-sky-500', fill: 'border-sky-500/35 bg-sky-500/12', ink: 'text-sky-700 dark:text-sky-300', chip: 'border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  emerald: { square: 'bg-emerald-500', fill: 'border-emerald-500/35 bg-emerald-500/12', ink: 'text-emerald-700 dark:text-emerald-300', chip: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  violet: { square: 'bg-violet-500', fill: 'border-violet-500/35 bg-violet-500/12', ink: 'text-violet-700 dark:text-violet-300', chip: 'border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300' },
  pink: { square: 'bg-pink-500', fill: 'border-pink-500/35 bg-pink-500/12', ink: 'text-pink-700 dark:text-pink-300', chip: 'border-pink-500/35 bg-pink-500/12 text-pink-700 dark:text-pink-300' },
  teal: { square: 'bg-teal-500', fill: 'border-teal-500/40 bg-teal-500/10', ink: 'text-teal-700 dark:text-teal-300', chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  amber: { square: 'bg-amber-500', fill: 'border-amber-500/40 bg-amber-500/10', ink: 'text-amber-700 dark:text-amber-300', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  slate: { square: 'bg-slate-500', fill: 'border-slate-500/35 bg-slate-500/12', ink: 'text-slate-700 dark:text-slate-300', chip: 'border-slate-500/35 bg-slate-500/12 text-slate-700 dark:text-slate-300' },
}
