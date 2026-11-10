/** `insertceilings=<chat>&window=<tokens>`: asks the engine to hand the plugin a send's own insert ceilings, the room each memory plugin
 *  (Dashboard, Litopys, World, agents) may take, so the history is trimmed for what they really add. Empty without a known window: the
 *  plugin then reserves by its own table, as before (Molfar.Vertep#220). `lead` is '?' on a path with no query yet, '&' after one. */
export function ceilingQuery(chatId: string, contextWindow: number | undefined, lead: '?' | '&' = '?'): string {
  return contextWindow && contextWindow > 0 ? `${lead}insertceilings=${encodeURIComponent(chatId)}&window=${Math.round(contextWindow)}` : ''
}
