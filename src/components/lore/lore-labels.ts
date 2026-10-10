import type { MsgKey } from '@/lib/i18n'
import type { EntryLogic, EntryPosition, EntryStatus } from '@/lib/types'

/** `before_examples` / `after_examples` are the same place as the `_em` ones. */
export function canonicalPosition(p: string): string {
  if (p === 'before_examples') return 'before_em'
  if (p === 'after_examples') return 'after_em'
  return p
}

/** The 7 places an entry can go, in the order the editor lists them. */
export const POSITION_CHOICES: EntryPosition[] = ['before_char', 'after_char', 'before_em', 'after_em', 'before_an', 'after_an', 'at_depth']

export const POSITION_KEY: Record<string, MsgKey> = {
  before_char: 'lore.pos.before_char',
  after_char: 'lore.pos.after_char',
  before_em: 'lore.pos.before_em',
  after_em: 'lore.pos.after_em',
  before_an: 'lore.pos.before_an',
  after_an: 'lore.pos.after_an',
  at_depth: 'lore.pos.at_depth',
}

export const POSITION_SHORT_KEY: Record<string, MsgKey> = {
  before_char: 'lore.posShort.before_char',
  after_char: 'lore.posShort.after_char',
  before_em: 'lore.posShort.before_em',
  after_em: 'lore.posShort.after_em',
  before_an: 'lore.posShort.before_an',
  after_an: 'lore.posShort.after_an',
  at_depth: 'lore.posShort.at_depth',
}

export const STATUS_KEY: Record<EntryStatus, MsgKey> = {
  normal: 'lore.status.normal',
  constant: 'lore.status.constant',
  vectorized: 'lore.status.vectorized',
}

export const LOGIC_KEY: Record<EntryLogic, MsgKey> = {
  AND_ANY: 'lore.logic.AND_ANY',
  AND_ALL: 'lore.logic.AND_ALL',
  NOT_ANY: 'lore.logic.NOT_ANY',
  NOT_ALL: 'lore.logic.NOT_ALL',
}

export const TRIGGER_TYPES = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'] as const

export const entriesKey = (n: number): MsgKey => (n === 1 ? 'lore.books.entriesOne' : 'lore.books.entries')
