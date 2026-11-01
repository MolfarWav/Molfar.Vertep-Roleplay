import { ArrowSquareOut } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { usedByRows } from '@/lib/lore-usage'
import type { Character, ID } from '@/lib/types'

/** The Used by tab: every card that holds this book as its own or links it, with a way to open each card's editor. */
export function BookUsedBy({ bookId, characters }: { bookId: ID; characters: Character[] }) {
  const t = useT()
  const openCharacterOnTab = useApp((s) => s.openCharacterOnTab)
  const rows = usedByRows(characters, bookId)
  if (rows.length === 0) {
    return (
      <div className="px-4 py-3">
        <Empty className="p-6">
          <EmptyHeader>
            <EmptyDescription>{t('lore.usedBy.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }
  return (
    <div className="px-4 py-3">
      <Card variant="rows">
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-12 items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{r.name}</span>
                <span className="text-caption text-muted-foreground">{t(r.own ? 'lore.usedBy.ownBook' : 'lore.usedBy.linkedBook')}</span>
              </span>
              <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => openCharacterOnTab(r.id, 'lorebook')} aria-label={t('lore.usedBy.openNamed', { name: r.name })}>
                <ArrowSquareOut className="size-3.5" aria-hidden="true" />{t('lore.usedBy.openCard')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
