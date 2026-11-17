// Puts the offer's picked agents in (the one place of the offer that writes; the rules live in agent-offer.ts).

import type { CanvasFile } from '@/canvas-kit/graph'
import { grantAgentTokens, installAgentFile, type AgentPreview } from './agents'
import { needsAllowing } from './agent-offer'

/**
 * Puts the picked agents in with the person's yes for what each one lists (the step has shown those lines). An agent that is
 * already installed is never overwritten (the person may have edited it): only its missing needs are allowed. Every agent is
 * tried; the names that failed come back with the reason, and the caller then does not start the chat.
 */
export async function installPicked(files: CanvasFile[], previews: Map<string, AgentPreview>, picked: string[]): Promise<{ id: string; why: string }[]> {
  const failed: { id: string; why: string }[] = []
  for (const id of picked) {
    const p = previews.get(id)
    const file = files.find((f) => f.agent?.id === id)
    if (!p || !file) { failed.push({ id, why: 'unknown agent' }); continue }
    try {
      if (!p.installed) await installAgentFile(file, true)
      else if (needsAllowing(p).length > 0) await grantAgentTokens(id, p.needs.filter((n) => !p.unsupported.includes(n)))
    } catch (e) {
      failed.push({ id, why: String((e as Error)?.message ?? e) })
    }
  }
  return failed
}
