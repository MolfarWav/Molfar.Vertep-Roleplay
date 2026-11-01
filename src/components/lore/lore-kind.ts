import { Globe, LinkBreak, UserCircle, UsersThree, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { BookKind } from '@/lib/lore-usage'

/** Icon and colour per way a book is tied to cards; the words stay next to them (colour is never alone). */
export const KIND_ICON: Record<BookKind | 'global', { icon: PhosphorIcon; cls: string }> = {
  own: { icon: UserCircle, cls: 'text-amber-600 dark:text-amber-300' },
  shared: { icon: UsersThree, cls: 'text-sky-600 dark:text-sky-300' },
  unlinked: { icon: LinkBreak, cls: 'text-muted-foreground' },
  global: { icon: Globe, cls: 'text-emerald-600 dark:text-emerald-300' },
}
