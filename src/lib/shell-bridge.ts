// The engine shell's bridge, `window.chrysalisShell`, exists only on engines
// that have it and only inside an app frame. Everything here feature-detects
// it, so an older engine simply shows no Molfar blocks and no "My apps".

export interface ShellApp { id: string; name: string }

interface ChrysalisShell {
  /** Opens the Molfar tab on a NEW chat with `text` in the composer, unsent. */
  askMolfar: (text: string) => Promise<null>
  /** The user's installed apps. */
  apps: () => Promise<ShellApp[]>
  /** Switches the shell to that app's tab. */
  openApp: (id: string) => Promise<null>
}

declare global {
  interface Window {
    chrysalisShell?: Partial<ChrysalisShell>
  }
}

/** The text limit the engine enforces on askMolfar. */
export const ASK_MOLFAR_MAX = 4000

export const canAskMolfar = (): boolean =>
  typeof window !== 'undefined' && typeof window.chrysalisShell?.askMolfar === 'function'

export const canListApps = (): boolean =>
  typeof window !== 'undefined' && typeof window.chrysalisShell?.apps === 'function' && typeof window.chrysalisShell?.openApp === 'function'

/** Open Molfar on a fresh chat with this draft in the composer (unsent).
 *  Rejects with an Error whose message is the engine's reason (untrusted app,
 *  not the tab on screen, called too often) or the bridge being absent. */
export async function askMolfar(text: string): Promise<void> {
  const fn = window.chrysalisShell?.askMolfar
  if (typeof fn !== 'function') throw new Error('Molfar is not reachable from this engine')
  const draft = text.slice(0, ASK_MOLFAR_MAX) // kept as typed: drafts end in a space for the user to continue
  if (!draft.trim()) throw new Error('Nothing to send')
  try {
    await fn(draft)
  } catch (e) {
    throw e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Rejected')
  }
}

/** The installed apps other than this one. [] when the bridge is missing or rejects. */
export async function listOtherApps(selfId = 'roleplay'): Promise<ShellApp[]> {
  const fn = window.chrysalisShell?.apps
  if (typeof fn !== 'function') return []
  try {
    const all = await fn()
    return Array.isArray(all) ? all.filter((a) => a && typeof a.id === 'string' && a.id !== selfId) : []
  } catch {
    return []
  }
}

export async function openShellApp(id: string): Promise<void> {
  const fn = window.chrysalisShell?.openApp
  if (typeof fn !== 'function') throw new Error('Apps are not reachable from this engine')
  await fn(id)
}

/** The shell can open its Settings on one model (engine 0.9.2). */
export const canOpenModelSettings = (): boolean =>
  typeof window !== 'undefined' && typeof (window.chrysalisShell as { openSettings?: unknown } | undefined)?.openSettings === 'function'

/** Open the shell's Settings > connections, on this model's settings when a "<provider>/<model>" ref is given. */
export async function openModelSettings(ref?: string | null): Promise<void> {
  const fn = (window.chrysalisShell as { openSettings?: (model?: string) => Promise<null> } | undefined)?.openSettings
  if (typeof fn !== 'function') throw new Error('This engine has no model settings yet')
  await fn(ref ?? undefined)
}

/** The shell's interface language (engine 0.9.5), e.g. "uk"; null on older engines or outside the shell. */
export async function shellLocale(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const fn = (window.chrysalisShell as { locale?: () => Promise<unknown> } | undefined)?.locale
  if (typeof fn !== 'function') return null
  try {
    const v = await fn()
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

/** The shell can open its Settings on one tab (engine 0.9.5). */
export const canOpenSettingsTab = (): boolean =>
  typeof window !== 'undefined' && typeof (window.chrysalisShell as { openSettingsTab?: unknown } | undefined)?.openSettingsTab === 'function'

export async function openSettingsTab(tab: 'api' | 'models' | 'memory' | 'backup'): Promise<void> {
  const fn = (window.chrysalisShell as { openSettingsTab?: (tab: string) => Promise<null> } | undefined)?.openSettingsTab
  if (typeof fn !== 'function') throw new Error('This engine cannot open that part of Settings')
  await fn(tab)
}
