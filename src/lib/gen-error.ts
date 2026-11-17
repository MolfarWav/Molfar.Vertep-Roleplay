// A failed reply, said so a person can act on it (Molfar.Vertep#306).
// A model that cannot use tools answers every request that carries them with an error like OpenRouter's
// "No endpoints found that support tool use": the page showed it raw, the user message stayed, and every later send
// failed the same way until Tool Calling went off. The text is recognised here and the toast names the way out.

import { toast } from 'sonner'
import { t, type Lang } from './i18n'

/** What providers answer when a request carries tools the model cannot use (OpenRouter, Ollama, vLLM, LM Studio and the like). */
const TOOLS_REFUSED = new RegExp([
  'no endpoints found that support tool',
  'does(?: not|n\'t) support (?:tool|function)',
  'tool(?:s| use| calling)? (?:is|are) not supported',
  'function calling (?:is )?(?:not|isn\'t) (?:supported|enabled|available)',
  'tool(?:s|_choice|_calls?)?[^a-z_].{0,30}not supported',
].join('|'), 'i')

export const toolsRefused = (message: string): boolean => TOOLS_REFUSED.test(message)

/** The toast for a reply that failed: the plain error, or for a model that refuses tools, the cause and a button to the Tools page. */
export function toastGenerationError(e: unknown, lang: Lang, openTools: () => void): void {
  const message = String((e as Error)?.message ?? e)
  if (toolsRefused(message)) {
    toast.error(t('gen.toolsRefused', lang), {
      description: t('gen.toolsRefusedWhy', lang),
      duration: 15_000,
      action: { label: t('gen.openTools', lang), onClick: openTools },
    })
    return
  }
  toast.error(message)
}
