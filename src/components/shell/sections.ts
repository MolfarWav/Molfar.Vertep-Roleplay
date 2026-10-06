import { House, Chats, Users, UserCircle, SlidersHorizontal, BookOpenText, Scroll, Lightning, PuzzlePiece, Plug, Gear, Storefront } from '@phosphor-icons/react'
import type { ViewKey } from '@/lib/store'
import type { MsgKey } from '@/lib/i18n'

export interface SectionItem {
  key: ViewKey
  /** English fallback (and the aria text where no translation is wired). */
  label: string
  /** The i18n key for the label and the page title. */
  labelKey: MsgKey
  icon: typeof House
  /** Items sharing a group sit together; the desktop rail draws a divider
   *  between groups. 'end' is pinned to the bottom of the rail. */
  group: number | 'end'
}

/** Every navigable section, in rail order. Regex lives inside Tools, one home only. */
export const SECTIONS: SectionItem[] = [
  { key: 'home', label: 'Home', labelKey: 'nav.home', icon: House, group: 0 },
  { key: 'chats', label: 'Chats', labelKey: 'nav.chats', icon: Chats, group: 0 },
  { key: 'characters', label: 'Characters', labelKey: 'nav.characters', icon: Users, group: 1 },
  { key: 'marketplace', label: 'Marketplace', labelKey: 'nav.marketplace', icon: Storefront, group: 1 },
  { key: 'personas', label: 'Personas', labelKey: 'nav.personas', icon: UserCircle, group: 1 },
  { key: 'lorebooks', label: 'Lorebooks', labelKey: 'nav.lorebooks', icon: BookOpenText, group: 1 },
  { key: 'litopys', label: 'Litopys', labelKey: 'nav.litopys', icon: Scroll, group: 1 },
  { key: 'presets', label: 'Presets', labelKey: 'nav.presets', icon: SlidersHorizontal, group: 2 },
  { key: 'connections', label: 'Connections', labelKey: 'nav.connections', icon: Plug, group: 2 },
  { key: 'quickreplies', label: 'Shortcuts', labelKey: 'nav.quickreplies', icon: Lightning, group: 3 },
  { key: 'extensions', label: 'Tools', labelKey: 'nav.extensions', icon: PuzzlePiece, group: 3 },
  { key: 'settings', label: 'Settings', labelKey: 'nav.settings', icon: Gear, group: 'end' },
]

/** The rail's sections split into runs of equal group, in order. */
export function sectionGroups(items: SectionItem[] = SECTIONS): SectionItem[][] {
  const out: SectionItem[][] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && last[0]!.group === item.group) last.push(item)
    else out.push([item])
  }
  return out
}

export const sectionsFor = (keys: ViewKey[]): SectionItem[] =>
  keys.flatMap((k) => SECTIONS.filter((s) => s.key === k))
