import { useMemo } from 'react'
import { Graph } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import type { LitChatItem } from './litopys-api'
import { openOnCanvas } from '@/components/canvas/canvas-focus'
import { StitchHeading } from './stitch'
import { layoutChatMap } from './chats-graph'
import { CanvasBoard } from '@/canvas-kit/canvas-board'
import { CHAT_LINKS, boardFromChats } from '@/canvas-kit/boards/chat-links'

export function ChatsMap(props: {
  items: LitChatItem[]
  chatId: string | null
  onFocus: (id: string) => void
  onOpen: (id: string) => void
  onLinked: () => void
}) {
  const { items, chatId, onFocus, onOpen, onLinked } = props
  const t = useT()
  const chat = chatId ? items.find((i) => i.id === chatId) ?? null : null
  const linked = chat?.continues ? items.find((i) => i.id === chat.continues) ?? null : null

  const layout = useMemo(() => {
    if (!chat) return null
    return layoutChatMap(chat, items)
  }, [chat, items])

  // the map's own tidy layout (the chain above, the descendants below), spread out for cards
  const board = useMemo(() => {
    if (!layout) return null
    const positions: Record<string, { x: number; y: number }> = {}
    for (const n of layout.nodes) positions[n.item.id] = { x: n.x * 1.75, y: n.y * 1.35 }
    return boardFromChats(layout.nodes.map((n) => n.item), positions)
  }, [layout])
  const fitKey = useMemo(() => (chat ? chat.id.length + items.length + Date.now() : 0), [chat?.id, items.length])

  return (
    <div className="flex flex-col gap-4">

      <div className="flex flex-col gap-1">
        <StitchHeading>{t('lit.map.title')}</StitchHeading>
        <p className="text-xs text-muted-foreground">{t('lit.map.hint')}</p>
      </div>

      {!chat ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {t('lit.map.pickChat')}
        </div>
      ) : (
        <>
          {/* Links are edited in one place, the Canvas tab (one editor for one thing) */}
          <div className="flex flex-col gap-2 border border-border rounded-lg p-3" data-testid="map-link">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-muted-foreground shrink-0">{t('lit.map.continues')}</span>
                {linked ? (
                  <button type="button" onClick={() => onFocus(linked.id)} className="truncate text-sm font-medium hover:text-primary">
                    {linked.title}
                  </button>
                ) : (
                  <span className="text-sm">{t('canvas.continuesNone')}</span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => openOnCanvas(chat.id)} data-testid="map-edit-canvas">
                <Graph className="size-3.5" aria-hidden="true" />
                {t('lit.map.editOnCanvas')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('lit.map.backstoryNote')}</p>
          </div>

          {/* The same canvas as the Canvas tab, in View mode: pan, zoom, pick a chat */}
          {board && (
            <div className="relative h-[360px] overflow-hidden rounded-lg border border-border bg-card" data-testid="map-canvas">
              <CanvasBoard
                board={CHAT_LINKS}
                graph={board}
                editable={false}
                onChange={() => {}}
                onOpenNode={onOpen}
                reasonText={(r) => r}
                selectedId={chat.id}
                onSelect={(id) => { if (id && id !== chat.id && items.some((i) => i.id === id)) onFocus(id) }}
                fitSignal={fitKey}
                nodeMeta={(n) => {
                  const it = items.find((i) => i.id === n.id)
                  return it ? t('lit.map.counts', { chapters: it.chapters, facts: it.facts }) : ''
                }}
              />
            </div>
          )}

          {/* Under map */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button size="sm" onClick={() => onOpen(chat.id)} data-testid="map-open">
              {t('lit.map.openChat', { title: chat.title })}
            </Button>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-6 h-0.5 bg-primary" />
                {t('lit.map.legendLink')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-6 h-0.5 border-t border-dashed border-muted-foreground" />
                {t('lit.map.legendFork')}
              </span>
            </div>
          </div>

          {layout && layout.nodes.length === 1 && (
            <p className="text-xs text-muted-foreground">{t('lit.map.alone')}</p>
          )}
        </>
      )}
    </div>
  )
}
