import { House, Chats, User, UsersThree, UserCircle, SlidersHorizontal, BookOpenText, Scroll, Lightning, PuzzlePiece, Gear, Storefront, Graph, GlobeHemisphereWest, Robot } from '@phosphor-icons/react'
import type { ViewKey } from '@/lib/store'
import type { MsgKey } from '@/lib/i18n'
import type { CanvasBoardKey } from '@/lib/canvas-board'
import type { RailHue } from '@/components/shell/rail-hues'

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
  /** The icon's hue (one per item, all different). */
  hue: RailHue
  /** A link to a view of another section, not a section of its own: it opens `key` on this Canvas board
   *  and is current only while that board is open. */
  board?: CanvasBoardKey
  /** Unique id when two items share a `key` (Canvas and Agents); the key is used otherwise. */
  id?: string
}

/** The id that tells two rail items apart. */
export const itemId = (item: SectionItem): string => item.id ?? item.key

/** Every navigable section, in rail order. Regex lives inside Tools, one home only.
 *  Groups: Home and Chats | the people (Characters, Groups, Marketplace, Personas) | the technical block
 *  (Lorebooks, Library, Canvas, World, Agents) | Presets | Shortcuts and Tools. */
export const SECTIONS: SectionItem[] = [
  { key: 'home', label: 'Home', labelKey: 'nav.home', icon: House, group: 0, hue: 'sky' },
  { key: 'chats', label: 'Chats', labelKey: 'nav.chats', icon: Chats, group: 0, hue: 'rose' },
  { key: 'characters', label: 'Characters', labelKey: 'nav.characters', icon: User, group: 1, hue: 'violet' },
  { key: 'groups', label: 'Groups', labelKey: 'nav.groups', icon: UsersThree, group: 1, hue: 'cyan' },
  { key: 'marketplace', label: 'Marketplace', labelKey: 'nav.marketplace', icon: Storefront, group: 1, hue: 'amber' },
  { key: 'personas', label: 'Personas', labelKey: 'nav.personas', icon: UserCircle, group: 1, hue: 'fuchsia' },
  { key: 'lorebooks', label: 'Lorebooks', labelKey: 'nav.lorebooks', icon: BookOpenText, group: 2, hue: 'emerald' },
  { key: 'litopys', label: 'Library', labelKey: 'nav.litopys', icon: Scroll, group: 2, hue: 'orange' },
  { key: 'canvas', label: 'Canvas', labelKey: 'nav.canvas', icon: Graph, group: 2, hue: 'indigo' },
  { key: 'world', label: 'World', labelKey: 'nav.world', icon: GlobeHemisphereWest, group: 2, hue: 'lime' },
  { key: 'canvas', id: 'agents', board: 'agents', label: 'Agents', labelKey: 'nav.agents', icon: Robot, group: 2, hue: 'teal' },
  { key: 'presets', label: 'Presets', labelKey: 'nav.presets', icon: SlidersHorizontal, group: 3, hue: 'blue' },
  { key: 'quickreplies', label: 'Shortcuts', labelKey: 'nav.quickreplies', icon: Lightning, group: 4, hue: 'yellow' },
  { key: 'extensions', label: 'Tools', labelKey: 'nav.extensions', icon: PuzzlePiece, group: 4, hue: 'zinc' },
  { key: 'settings', label: 'Roleplay settings', labelKey: 'nav.settings', icon: Gear, group: 'none', hue: 'zinc' },
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

export const sectionsFor = (keys: ViewKey[]): SectionItem[] =>
  keys.flatMap((k) => SECTIONS.filter((s) => s.key === k && !s.board))
