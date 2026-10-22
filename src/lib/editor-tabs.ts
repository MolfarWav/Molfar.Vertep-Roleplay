/** The character editor's six tabs and the panels each one holds.
 *
 *  The editor used to show eleven tabs in a single row; on a phone they did not fit, so
 *  they are grouped by purpose now. The panels keep their old names — that is what links,
 *  the store and older builds pass — and `tabOfPanel` maps an old name to the tab that
 *  holds it, so anything that asked for an old tab still opens the panel it named. */

/** The six tabs, in the order they are shown. */
export const EDITOR_TABS = ['core', 'profile', 'soul', 'memory', 'lorebook', 'more'] as const
export type EditorTab = (typeof EDITOR_TABS)[number]

/** The panels each tab holds, in order. Core and More hold more than one. */
export const TAB_PANELS: Record<EditorTab, readonly string[]> = {
  core: ['core', 'dialogue'],
  profile: ['profile'],
  soul: ['soul'],
  memory: ['memory'],
  lorebook: ['lorebook'],
  more: ['advanced', 'colors', 'sprites', 'gallery', 'regex', 'voice'],
}

/** Which of the six tabs holds a panel — or a tab name itself. Anything unknown opens Core. */
export function tabOfPanel(panel: string | null | undefined): EditorTab {
  if (!panel) return 'core'
  if ((EDITOR_TABS as readonly string[]).includes(panel)) return panel as EditorTab
  for (const tab of EDITOR_TABS) if (TAB_PANELS[tab].includes(panel)) return tab
  return 'core'
}

/** Every panel of the old eleven-tab row, in the order the desktop strip shows them. */
export const ALL_PANELS = [
  'core', 'profile', 'dialogue', 'soul', 'memory', 'lorebook', 'regex',
  'colors', 'sprites', 'gallery', 'voice', 'advanced',
] as const
export type EditorPanel = (typeof ALL_PANELS)[number]

/** The group a panel belongs to (its color family). */
export function panelGroup(panel: string | null | undefined): EditorTab {
  return tabOfPanel(panel)
}

/** The panel an arrow / Home / End key should move to within a tab, undefined for any
 *  other key. Tabs are a keyboard widget, so the editor's rows answer the same keys. */
export function panelStep(panels: readonly string[], panel: string, key: string): string | undefined {
  const i = panels.indexOf(panel)
  if (i < 0) return undefined
  if (key === 'ArrowRight' || key === 'ArrowDown') return panels[(i + 1) % panels.length]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return panels[(i - 1 + panels.length) % panels.length]
  if (key === 'Home') return panels[0]
  if (key === 'End') return panels[panels.length - 1]
  return undefined
}
