import type { DisplayScript } from '@/hooks/use-display-texts'
import type { RegexScript } from '@/lib/types'

/** Where a message sits, for picking the display-stage regex scripts that apply to it. */
export interface DisplayTarget {
  role: 'user' | 'assistant' | string
  chatId: string
  characterId?: string | null
  presetId?: string | null
  /** The chat's character is a group: a script bound to one of its members applies. */
  members?: string[]
  /** Distance from the chat's end (0 = the last message). */
  depth: number
  userName: string
  charName: string
}

/** Regex scripts arrive from arbitrary import zips; capping the pattern length bounds what ships. */
const MAX_PATTERN = 500

/**
 * The display-stage scripts (markdownOnly) for one message, fully resolved, in the engine's
 * order: global first, then preset-bound, then scoped. Saved-text scripts already ran when the
 * message was stored, prompt-only ones never touch what is shown.
 */
export function resolveDisplayScripts(regexScripts: RegexScript[], at: DisplayTarget): DisplayScript[] {
  const inScope = (r: RegexScript): boolean => {
    if (r.scope === 'global') return true
    if (!r.scopeTargetId) return false
    if (r.scope === 'chat') return r.scopeTargetId === at.chatId
    if (r.scope === 'character') return r.scopeTargetId === at.characterId || (at.members ?? []).includes(r.scopeTargetId)
    if (r.scope === 'preset') return r.scopeTargetId === at.presetId
    return true
  }
  const rank = (r: RegexScript) => (r.scope === 'global' ? 0 : r.scope === 'preset' ? 1 : 2)
  // replacement macros use the chat's global names; only the trim pass is speaker-aware in the
  // source format, keep the same split here
  const subMacros = (t: string) => t.replace(/\{\{(user|char)\}\}/gi, (_, k: string) => (k.toLowerCase() === 'user' ? at.userName : at.charName))
  const escapeLiteral = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const resolved: DisplayScript[] = []
  for (const r of [...regexScripts].sort((a, b) => rank(a) - rank(b) || a.order - b.order)) {
    if (!r.enabled || !r.markdownOnly || !r.find || r.find.length > MAX_PATTERN) continue
    if (!(at.role === 'user' ? r.placements.userInput : r.placements.aiOutput)) continue
    if (!inScope(r)) continue
    // scripts bound to a window only apply inside it (same count the engine uses at assembly)
    if (r.minDepth != null && at.depth < r.minDepth) continue
    if (r.maxDepth != null && at.depth > r.maxDepth) continue
    // same replace semantics as the engine: {{match}} is the whole (trimmed) match, $n / $<name>
    // pull captured groups, missing groups vanish, trims erase from each, macros substitute
    let find = r.find
    if (r.macroMode === 'raw') find = subMacros(find)
    else if (r.macroMode === 'escaped') {
      find = find.replace(/\{\{(user|char)\}\}/gi, (_, k: string) => escapeLiteral(k.toLowerCase() === 'user' ? at.userName : at.charName))
    }
    resolved.push({ find, flags: r.flags || 'g', replace: r.replace, trims: r.trimStrings.filter(Boolean), macros: { user: at.userName, char: at.charName } })
  }
  return resolved
}
