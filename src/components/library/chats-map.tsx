import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { Graph } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { LitChatItem } from './litopys-api'
import { openOnCanvas } from '@/components/canvas/canvas-focus'
import { StitchHeading } from './stitch'
import { layoutChatMap } from './chats-graph'

const LABEL_MAX = 18

function buildLinePath(cx1: number, cy1: number, cx2: number, cy2: number): string {
  const midY = (cy1 + cy2) / 2
  return `M ${cx1} ${cy1} C ${cx1} ${midY}, ${cx2} ${midY}, ${cx2} ${cy2}`
}

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX ? label.slice(0, LABEL_MAX - 1) + '…' : label
}

function nodeRadius(facts: number): number {
  return Math.min(10 + 3 * Math.sqrt(facts), 26)
}

export function ChatsMap(props: {
  items: LitChatItem[]
  chatId: string | null
  onFocus: (id: string) => void
  onOpen: (id: string) => void
  onLinked: () => void
}) {
  const { items, chatId, onFocus, onOpen, onLinked } = props
  const t = useT()
  const rel = useRelativeTime()
  const chat = chatId ? items.find((i) => i.id === chatId) ?? null : null
  const linked = chat?.continues ? items.find((i) => i.id === chat.continues) ?? null : null

  const layout = useMemo(() => {
    if (!chat) return null
    return layoutChatMap(chat, items)
  }, [chat, items])

  const handleKeyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (id === chatId) onOpen(id)
      else onFocus(id)
    }
  }

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

          {/* SVG map */}
          {layout && (
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <svg
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                width="100%"
                preserveAspectRatio="xMidYMin meet"
                style={{ maxWidth: `${layout.width}px` }}
                data-testid="map-svg"
              >
                {layout.nodes.map((node) =>
                  node.children.map((child) => (
                    <path
                      key={`${node.item.id}-${child.item.id}`}
                      // from under the parent's two label lines to the top of the child's circle
                      d={buildLinePath(node.x, node.y + nodeRadius(node.item.facts) + 34, child.x, child.y - nodeRadius(child.item.facts) - 2)}
                      className={child.kind === 'link' ? 'stroke-primary' : 'stroke-muted-foreground'}
                      strokeWidth={child.kind === 'link' ? 2 : 1.5}
                      strokeDasharray={child.kind === 'fork' ? '5 4' : undefined}
                      fill="none"
                    />
                  ))
                )}

                {layout.nodes.map((node) => {
                  const selected = node.item.id === chatId
                  const r = nodeRadius(node.item.facts)

                  return (
                    <g
                      key={node.item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={node.item.title}
                      onClick={() => selected ? onOpen(node.item.id) : onFocus(node.item.id)}
                      onKeyDown={(e) => handleKeyDown(e, node.item.id)}
                      data-testid="map-node"
                      className="cursor-pointer group"
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        className={cn(
                          node.item.hasData === false ? 'fill-muted-foreground/15 stroke-muted-foreground' : 'fill-primary/15 stroke-primary',
                          selected ? 'stroke-[3]' : 'stroke-2 group-hover:stroke-[3]'
                        )}
                        strokeDasharray={node.item.hasData === false ? '4 3' : undefined}
                      />
                      {selected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={r + 3}
                          className="fill-none stroke-primary stroke-2"
                        />
                      )}
                      <text
                        x={node.x}
                        y={node.y + r + 16}
                        textAnchor="middle"
                        className="text-[11px] fill-foreground"
                      >
                        {truncateLabel(node.item.title)}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + r + 28}
                        textAnchor="middle"
                        className="text-[11px] fill-muted-foreground"
                      >
                        {t('lit.map.counts', { chapters: node.item.chapters, facts: node.item.facts })}
                      </text>
                    </g>
                  )
                })}
              </svg>
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
