// The install screens' wording for what an install did. Pure, so a test can hold it.

import type { InstallReply } from './agents'
import type { MsgKey, Vars } from './i18n'

/** What to tell the person once a file is in: a new agent waits to be allowed; an update says whether it asks for more. */
export function installMessage(t: (key: MsgKey, vars?: Vars) => string, name: string, r: InstallReply): string {
  const fresh = r.missing.filter((n) => !r.unsupported.includes(n)).length
  if (!r.updated) return t('ag.drafts.done', { name })
  return fresh > 0 ? t('ag.update.toastNew', { name, n: fresh }) : t('ag.update.toastSame', { name })
}
