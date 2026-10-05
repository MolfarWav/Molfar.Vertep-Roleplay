// One-time move of the chat prose defaults to the stage look. A user's own choices stay:
// only a value that is still the OLD default is replaced. Pure, so hydrate can run it on
// every load (it is idempotent: after the move `lookVersion` is 2 and nothing changes).

import type { AppSettings } from '@/lib/types'

export const LOOK_VERSION = 2

export interface LookMigration {
  settings: AppSettings
  /** the settings changed, so the engine copy must be written back */
  changed: boolean
}

/**
 * `from` is the version the SAVED copy was written at. Hydrate passes the engine copy's own
 * version when it has one: the engine's `ui` overwrites local values on merge, so the local
 * `lookVersion` alone would claim a move that the engine copy never had.
 */
export function migrateLook(settings: AppSettings, from: number = settings.lookVersion ?? 1): LookMigration {
  if (from >= LOOK_VERSION) return { settings, changed: false }
  const next: AppSettings = { ...settings, lookVersion: LOOK_VERSION }
  if (next.proseFont === 'noto') next.proseFont = 'noto-serif'
  if (next.lineSpacing === 136) next.lineSpacing = 180
  if (next.paragraphSpacing === 10) next.paragraphSpacing = 14
  return { settings: next, changed: true }
}
