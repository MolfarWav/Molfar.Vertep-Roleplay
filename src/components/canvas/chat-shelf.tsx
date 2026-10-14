import { forwardRef, useState, useEffect } from 'react'
import { Plus, LinkSimple, CaretLeft, MagnifyingGlass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import type { LitChatItem } from '@/components/library/litopys-api'

const SORT_KEY = 'rp.canvas.shelf.sort'

type SortMode = 'recent' | 'title' | 'character'

interface ChatShelfProps {
  chats: LitChatItem[]
  total: number
  dragType: string
  dropActive: boolean
  onAdd: (id: string) => void
  onAddChain: (id: string) => void
  hasChain: (id: string) => boolean
  onCollapse: () => void
}

export const ChatShelf = forwardRef<HTMLDivElement, ChatShelfProps>(({
  chats,
  total,
  dragType,
  dropActive,
  onAdd,
  onAddChain,
  hasChain,
  onCollapse
}, ref) => {
  const t = useT()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY)
      if (saved === 'title' || saved === 'character' || saved === 'recent') return saved
    } catch {}
    return 'recent'
  })

  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {}
  }, [sort])

  const filtered = chats.filter(c => {
    const q = search.toLowerCase()
    if (!q) return true
    return c.title.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'title') {
      return a.title.localeCompare(b.title)
    }
    if (sort === 'character') {
      const nameCompare = a.name.localeCompare(b.name)
      if (nameCompare !== 0) return nameCompare
      return a.title.localeCompare(b.title)
    }
    return b.updatedAt - a.updatedAt
  })

  return (
    <div
      ref={ref}
      className={cn(
        'flex h-full w-[260px] flex-col border-r bg-card',
        dropActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{t('canvas.shelf.title')}</h2>
          <span className="text-xs text-muted-foreground">
            {chats.length} / {total}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCollapse}
          aria-label={t('canvas.shelf.collapse')}
        >
          <CaretLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-b px-3 py-2">
        <div className="relative">
          <MagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('canvas.shelf.search')}
            className="h-8 pl-7 text-sm"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortMode)}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="recent">{t('canvas.shelf.sortRecent')}</option>
          <option value="title">{t('canvas.shelf.sortTitle')}</option>
          <option value="character">{t('canvas.shelf.sortCharacter')}</option>
        </select>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {dropActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10">
            <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              {t('canvas.shelf.dropHint')}
            </span>
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {chats.length === 0 ? t('canvas.shelf.emptyAll') : t('canvas.shelf.emptySearch')}
          </div>
        ) : (
          <div className="flex flex-col p-2">
            {sorted.map(chat => (
              <div
                key={chat.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData(dragType, chat.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="min-w-0 flex-1 cursor-grab">
                  <div className="truncate text-sm">{chat.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{chat.name}</div>
                </div>
                {hasChain(chat.id) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onAddChain(chat.id)}
                    aria-label={t('canvas.shelf.addChain')}
                    title={t('canvas.shelf.addChain')}
                  >
                    <LinkSimple className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onAdd(chat.id)}
                  aria-label={t('canvas.shelf.add')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

ChatShelf.displayName = 'ChatShelf'
