import type { MsgKey } from '@/lib/i18n'

/**
 * The prompt board's fixed rows carry an English label from the app's engine plugin. The
 * board shows them in the interface language through this table; a row it does not know
 * (a preset section, a lorebook: names the user chose) keeps its own label.
 */
const NAME_KEYS: Record<string, MsgKey> = {
  history: 'canvas.prompt.name.history',
  databank: 'canvas.prompt.name.databank',
  authorNote: 'canvas.prompt.name.authorNote',
  'plugin:litopys': 'canvas.prompt.name.litopys',
  'plugin:relations': 'canvas.prompt.name.relations',
  'plugin:said': 'canvas.prompt.name.said',
  'plugin:journal': 'canvas.prompt.name.journal',
  'plugin:cardmemory': 'canvas.prompt.name.cardmemory',
  'plugin:cardhabits': 'canvas.prompt.name.cardhabits',
  'plugin:recollections': 'canvas.prompt.name.recollections',
  'plugin:verbatim': 'canvas.prompt.name.verbatim',
  'plugin:personamemory': 'canvas.prompt.name.personamemory',
  'plugin:worldmemory': 'canvas.prompt.name.worldmemory',
  'plugin:world': 'canvas.prompt.name.world',
}

export function boardName(item: { key: string; label: string }, t: (key: MsgKey) => string): string {
  const key = NAME_KEYS[item.key]
  return key ? t(key) : item.label
}
