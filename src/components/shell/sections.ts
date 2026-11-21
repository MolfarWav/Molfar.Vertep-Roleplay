import { House, Chats, User, UsersThree, UserCircle, SlidersHorizontal, BookOpenText, Scroll, Lightning, PuzzlePiece, Gear, Storefront, Graph, GlobeHemisphereWest, Robot, MaskHappy } from '@phosphor-icons/react'
import type { ViewKey } from '@/lib/store'
import type { MsgKey } from '@/lib/i18n'
import { writeCanvasBoard, type CanvasBoardKey } from '@/lib/canvas-board'
import { writeWorldTop, type WorldTop } from '@/lib/world-nav'
import type { RailHue } from '@/components/shell/rail-hues'

export type SectionTier = 'playbill' | 'backstage'

export interface SectionItem {
  key: ViewKey
  /** English fallback (and the aria text where no translation is wired). */
  label: string
  /** The i18n key for the label and the page title. */
  labelKey: MsgKey
  icon: typeof House
  /** Items sharing a group sit together; the desktop rail draws a divider
   *  between groups. 'none' is a section that is not on the rail (it opens
   *  from elsewhere: Roleplay settings from Home and the phone menu). */
  group: number | 'none'
  /** Where the section sits in the two-floor map (docs/STAGE-BACKSTAGE.md, #448): the lobby where a story is picked,
   *  or the maker's floor. The Stage is the chat itself, so no section has it. The rail's groups follow the tiers;
   *  later steps read this field, not a group number. */
  tier: SectionTier
  /** The icon's hue (one per item, all different). */
  hue: RailHue
  /** A link to a view of another section, not a section of its own: it opens `key` on this Canvas board
   *  and is current only while that board is open. */
  board?: CanvasBoardKey
  /** A link to a tab of the World section (DM, #183), not a section of its own: it opens `world` on this tab
   *  and is current only while that tab is open. */
  worldTop?: WorldTop
  /** Unique id when two items share a `key` (Canvas and Agents, World and DM); the key is used otherwise. */
  id?: string
}

/** A link item (a Canvas board or a World tab), not a section of its own. */
export const isLinkItem = (item: SectionItem): boolean => !!item.board || !!item.worldTop

/** Whether a rail or sheet item is the current one, given where the section is open: a link item is current
 *  only while its board or tab is open, the item of its section only while it is not. */
export function itemActive(item: SectionItem, open: boolean, canvasBoard: CanvasBoardKey, worldTop: WorldTop): boolean {
  if (!open) return false
  if (item.key === 'canvas') return (canvasBoard === 'agents') === !!item.board
  if (item.key === 'world') return (worldTop === 'dm') === !!item.worldTop
  return true
}

/** Before navigating to an item: a link item opens its board or tab; its section's own item leaves the link's
 *  board or tab for the section's usual one (Canvas from Agents goes to Chat links, World from DM to Chats). */
export function prepareItem(item: SectionItem, canvasBoard: CanvasBoardKey, worldTop: WorldTop): void {
  if (item.key === 'canvas') writeCanvasBoard(item.board ?? (canvasBoard === 'agents' ? 'links' : canvasBoard))
  if (item.key === 'world') writeWorldTop(item.worldTop ?? (worldTop === 'dm' ? 'chats' : worldTop))
}

/** The id that tells two rail items apart. */
export const itemId = (item: SectionItem): string => item.id ?? item.key

/** Every navigable section, in rail order. Regex lives inside Tools, one home only.
 *  Groups: Home and Chats | the people (Characters, Groups, Marketplace, Personas) | the technical block
 *  (Lorebooks, Library, Canvas, World, Agents) | Presets | Shortcuts and Tools. */
export const SECTIONS: SectionItem[] = [
  { key: 'home', label: 'Home', labelKey: 'nav.home', icon: House, group: 0, tier: 'playbill', hue: 'sky' },
  { key: 'chats', label: 'Chats', labelKey: 'nav.chats', icon: Chats, group: 0, tier: 'playbill', hue: 'rose' },
  { key: 'characters', label: 'Characters', labelKey: 'nav.characters', icon: User, group: 1, tier: 'playbill', hue: 'violet' },
  { key: 'groups', label: 'Groups', labelKey: 'nav.groups', icon: UsersThree, group: 1, tier: 'playbill', hue: 'cyan' },
  { key: 'marketplace', label: 'Marketplace', labelKey: 'nav.marketplace', icon: Storefront, group: 1, tier: 'playbill', hue: 'amber' },
  { key: 'personas', label: 'Personas', labelKey: 'nav.personas', icon: UserCircle, group: 1, tier: 'playbill', hue: 'fuchsia' },
  { key: 'lorebooks', label: 'Lorebooks', labelKey: 'nav.lorebooks', icon: BookOpenText, group: 2, tier: 'backstage', hue: 'emerald' },
  { key: 'litopys', label: 'Library', labelKey: 'nav.litopys', icon: Scroll, group: 2, tier: 'backstage', hue: 'orange' },
  { key: 'canvas', label: 'Canvas', labelKey: 'nav.canvas', icon: Graph, group: 2, tier: 'backstage', hue: 'indigo' },
  { key: 'world', label: 'World', labelKey: 'nav.world', icon: GlobeHemisphereWest, group: 2, tier: 'backstage', hue: 'lime' },
  { key: 'world', id: 'dm', worldTop: 'dm', label: 'DM', labelKey: 'nav.dm', icon: MaskHappy, group: 2, tier: 'backstage', hue: 'red' },
  { key: 'canvas', id: 'agents', board: 'agents', label: 'Agents', labelKey: 'nav.agents', icon: Robot, group: 2, tier: 'backstage', hue: 'teal' },
  { key: 'presets', label: 'Presets', labelKey: 'nav.presets', icon: SlidersHorizontal, group: 3, tier: 'backstage', hue: 'blue' },
  { key: 'quickreplies', label: 'Shortcuts', labelKey: 'nav.quickreplies', icon: Lightning, group: 4, tier: 'backstage', hue: 'yellow' },
  { key: 'extensions', label: 'Tools', labelKey: 'nav.extensions', icon: PuzzlePiece, group: 4, tier: 'backstage', hue: 'zinc' },
  { key: 'settings', label: 'Roleplay settings', labelKey: 'nav.settings', icon: Gear, group: 'none', tier: 'backstage', hue: 'zinc' },
]

/** What the desktop rail draws: every section that has a group. */
export const RAIL_SECTIONS: SectionItem[] = SECTIONS.filter((s) => s.group !== 'none')

/** The rail's sections split into runs of equal group, in order. */
export function sectionGroups(items: SectionItem[] = RAIL_SECTIONS): SectionItem[][] {
  const out: SectionItem[][] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && last[0]!.group === item.group) last.push(item)
    else out.push([item])
  }
  return out
}

/** The three tabs of the phone's bottom bar; every other section sits in its "All sections" sheet. */
export const PHONE_TAB_KEYS: readonly ViewKey[] = ['home', 'chats', 'characters']
export const PHONE_TABS: SectionItem[] = SECTIONS.filter((s) => PHONE_TAB_KEYS.includes(s.key))
/** The tiles of the phone's "All sections" sheet: everything but the tabs, in rail order. Unlike `sectionsFor`
 *  it keeps the board links, so Agents (a Canvas board) is there as on the desktop rail. */
export const PHONE_MORE_TILES: SectionItem[] = SECTIONS.filter((s) => !PHONE_TAB_KEYS.includes(s.key))

/** The item whose title a section shows: Agents is a Canvas board, so while that board is open the Canvas drawer and page
 *  carry the Agents item (its own name), not Canvas's. */
export const sectionItemOf = (key: ViewKey, canvasBoard?: CanvasBoardKey): SectionItem | undefined =>
  (canvasBoard ? SECTIONS.find((s) => s.key === key && s.board === canvasBoard) : undefined) ?? SECTIONS.find((s) => s.key === key)

export const sectionsFor =(keys: ViewKey[]): SectionItem[] =>
  keys.flatMap((k) => SECTIONS.filter((s) => s.key === k && !isLinkItem(s)))
