// Home's blocks and how the user arranged them (docs/UI-CATALOG.md 7.5, 8). Pure: no store, no DOM. The layout
// lives in the app settings as `homeLayout`; every change goes through the functions here, and a stored value
// that is partly wrong (an id from another build, a size that does not exist, a duplicate) is repaired by
// `sanitizeHomeLayout` rather than shown broken.

import type { AppSettings } from './types'

export const HOME_BLOCKS = [
  'continue', 'library', 'market', 'world', 'waiting', 'quests', 'favourites', 'news', 'help',
] as const
export type HomeBlockId = (typeof HOME_BLOCKS)[number]

export const HOME_SIZES = ['sm', 'md', 'lg'] as const
export type HomeSize = (typeof HOME_SIZES)[number]

export type HomeLayout = NonNullable<AppSettings['homeLayout']>

/** Default order on the desktop grid (12 columns). Rows: continue+library, market+world+waiting,
 *  quests+favourites, news+help. */
export const DEFAULT_ORDER: readonly HomeBlockId[] = HOME_BLOCKS

/** Default width per block. Columns: sm 4 (a third), md 8 (two thirds), lg 12 (the whole row). */
export const DEFAULT_SIZE: Record<HomeBlockId, HomeSize> = {
  continue: 'md',
  library: 'sm',
  market: 'sm',
  world: 'sm',
  waiting: 'sm',
  quests: 'sm',
  favourites: 'md',
  news: 'md',
  help: 'sm',
}

/** Columns of the 12-column grid a size takes. */
export const SPAN_COLS: Record<HomeSize, number> = { sm: 4, md: 8, lg: 12 }

/** Tailwind column spans, written out in full so the class scanner finds them. From 768 px up only:
 *  below that every block is one column. */
export const SPAN_CLASS: Record<HomeSize, string> = {
  sm: 'md:col-span-4',
  md: 'md:col-span-8',
  lg: 'md:col-span-12',
}

const SIZE_CYCLE: Record<HomeSize, HomeSize> = { sm: 'md', md: 'lg', lg: 'sm' }

export const isHomeBlock = (id: unknown): id is HomeBlockId =>
  typeof id === 'string' && (HOME_BLOCKS as readonly string[]).includes(id)

const isHomeSize = (v: unknown): v is HomeSize => typeof v === 'string' && (HOME_SIZES as readonly string[]).includes(v)

/** The page as it is when nothing was changed. */
export function defaultHomeLayout(): HomeLayout {
  return { order: [...DEFAULT_ORDER], hidden: [], marketSuggest: true }
}

/** Repairs a stored layout: unknown ids dropped, duplicates dropped, blocks missing from the order appended in
 *  default order (a block a later build adds shows up at the end), bad sizes dropped, and `marketSuggest`
 *  is on unless it is stored as false. Anything that is not an object gives the default page. */
export function sanitizeHomeLayout(raw: unknown): HomeLayout {
  const base = defaultHomeLayout()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const r = raw as Record<string, unknown>
  const order: HomeBlockId[] = []
  if (Array.isArray(r.order)) {
    for (const id of r.order) if (isHomeBlock(id) && !order.includes(id)) order.push(id)
  }
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id)
  const hidden: HomeBlockId[] = []
  if (Array.isArray(r.hidden)) {
    for (const id of r.hidden) if (isHomeBlock(id) && !hidden.includes(id)) hidden.push(id)
  }
  const layout: HomeLayout = { order, hidden, marketSuggest: r.marketSuggest !== false }
  if (r.sizes && typeof r.sizes === 'object' && !Array.isArray(r.sizes)) {
    const sizes: Record<string, HomeSize> = {}
    for (const [id, size] of Object.entries(r.sizes as Record<string, unknown>)) {
      if (isHomeBlock(id) && isHomeSize(size)) sizes[id] = size
    }
    if (Object.keys(sizes).length > 0) layout.sizes = sizes
  }
  return layout
}

/** Whether a block is on the page. The Marketplace block is also off when its suggestion is switched off. */
export function isShown(layout: HomeLayout, id: HomeBlockId): boolean {
  if (layout.hidden.includes(id)) return false
  return id !== 'market' || layout.marketSuggest !== false
}

/** The blocks on the page, in order. `marketAvailable` is false while the Marketplace has nothing to show
 *  (offline, an error, still loading): that block is then left out, not drawn empty. */
export function shownBlocks(layout: HomeLayout, marketAvailable = true): HomeBlockId[] {
  return layout.order.filter((id): id is HomeBlockId => isHomeBlock(id) && isShown(layout, id) && (id !== 'market' || marketAvailable))
}

/** The blocks in the hidden tray, in order. */
export function hiddenBlocks(layout: HomeLayout): HomeBlockId[] {
  return layout.order.filter((id): id is HomeBlockId => isHomeBlock(id) && layout.hidden.includes(id))
}

export function sizeOf(layout: HomeLayout, id: HomeBlockId): HomeSize {
  return layout.sizes?.[id] ?? DEFAULT_SIZE[id]
}

/** Moves a block one step earlier (-1) or later (+1) among the blocks on the page. Hidden ones keep their place. */
export function moveBlock(layout: HomeLayout, id: HomeBlockId, dir: -1 | 1): HomeLayout {
  const shown = layout.order.filter((x): x is HomeBlockId => isHomeBlock(x) && isShown(layout, x))
  const at = shown.indexOf(id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= shown.length) return layout
  const swapped = [...shown]
  swapped[at] = shown[to]!
  swapped[to] = id
  // put the shown blocks back into the slots they had, so a hidden block between two shown ones stays put
  let k = 0
  const order = layout.order.map((x) => (isHomeBlock(x) && isShown(layout, x) ? swapped[k++]! : x))
  return { ...layout, order }
}

export function hideBlock(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  if (layout.hidden.includes(id)) return layout
  return { ...layout, hidden: [...layout.hidden, id] }
}

export function restoreBlock(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  return { ...layout, hidden: layout.hidden.filter((x) => x !== id) }
}

/** sm, md, lg, sm... starting from the block's current size. */
export function cycleSize(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  const next = SIZE_CYCLE[sizeOf(layout, id)]
  return { ...layout, sizes: { ...layout.sizes, [id]: next } }
}

/** The order, the hidden blocks and the sizes go back to the defaults. The Marketplace switch is the user's
 *  choice and stays as it is. */
export function resetHomeLayout(layout: HomeLayout): HomeLayout {
  return { order: [...DEFAULT_ORDER], hidden: [], marketSuggest: layout.marketSuggest }
}

export function setMarketSuggest(layout: HomeLayout, on: boolean): HomeLayout {
  return { ...layout, marketSuggest: on }
}
