// The Permissions page of an installed agent: its needs sorted into groups a person can read, and the one rule of
// granting: the plugin keeps exactly the list it is sent, so one switch means "the old list plus/minus this token".
// Pure, so a test can hold it.

export type PermGroup = 'read' | 'write' | 'show' | 'model' | 'other'
export const PERM_GROUPS: PermGroup[] = ['read', 'write', 'show', 'model', 'other']

export function groupOfNeed(token: string): PermGroup {
  if (token === 'llm') return 'model'
  if (token.startsWith('read:')) return 'read'
  if (token.startsWith('write:')) return 'write'
  if (token.startsWith('show:')) return 'show'
  return 'other'
}

/** The needs this runner can give, in groups (empty groups left out), each token in the order the agent asked. */
export function groupNeeds(needs: string[], unsupported: string[]): { group: PermGroup; tokens: string[] }[] {
  const ok = needs.filter((n) => !unsupported.includes(n))
  return PERM_GROUPS.map((group) => ({ group, tokens: ok.filter((n) => groupOfNeed(n) === group) })).filter((g) => g.tokens.length > 0)
}

/** The list to send after one switch: tokens the agent no longer asks for (an older grant) drop out. */
export function nextGranted(granted: string[], needs: string[], token: string, on: boolean): string[] {
  const keep = granted.filter((g) => needs.includes(g) && g !== token)
  return on && needs.includes(token) ? [...keep, token] : keep
}

/** How many of the needs this runner can give are allowed, out of how many. */
export function allowedCount(needs: string[], unsupported: string[], granted: string[]): { done: number; n: number } {
  const ok = needs.filter((x) => !unsupported.includes(x))
  return { done: ok.filter((x) => granted.includes(x)).length, n: ok.length }
}
