import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { LinkBreak, MagnifyingGlass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LitChatItem } from './litopys-api'
import { setLitLink } from './litopys-api'
import { StitchHeading } from './stitch'
import { descendants, layoutChatMap, predecessorOf } from './chats-graph'

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
  const [confirm, confirmDialog] = useConfirm()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const chat = chatId ? items.find((i) => i.id === chatId) ?? null : null
  const linked = chat?.continues ? items.find((i) => i.id === chat.continues) ?? null : null

  const layout = useMemo(() => {
    if (!chat) return null
    return layoutChatMap(chat, items)
  }, [chat, items])

  const searchResults = useMemo(() => {
    if (!chat || !query.trim()) return []
    const q = query.trim().toLowerCase()
    const pred = predecessorOf(chat, items)
    const descSet = new Set(descendants(chat, items).map((i) => i.id))

    return items
      .filter((i) =>
        i.id !== chat.id &&
        i.id !== pred?.id &&
        (i.title.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      )
      .slice(0, 8)
      .map((i) => ({
        ...i,
        isLoop: descSet.has(i.id),
      }))
  }, [chat, items, query])

  const handleUnlink = async () => {
    if (!chat || !linked) return
    const pred = linked

    if (await confirm({
      title: t('lit.map.unlinkTitle'),
      description: t('lit.map.unlinkBody', { title: pred.title }),
      actionLabel: t('lit.map.unlink'),
    })) {
      try {
        await setLitLink(chat.id, null)
        onLinked()
        toast.success(t('lit.map.unlinked'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const handleLink = async (resultId: string) => {
    if (!chat) return
    setBusy(true)
    try {
      await setLitLink(chat.id, resultId)
      onLinked()
      setQuery('')
      const result = items.find((i) => i.id === resultId)
      toast.success(t('lit.map.linked', { title: result?.title ?? '' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (id === chatId) onOpen(id)
      else onFocus(id)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}

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
          {/* Continues block */}
          <div className="flex flex-col gap-2 border border-border rounded-lg p-3" data-testid="map-link">
            {linked && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-muted-foreground shrink-0">{t('lit.map.continues')}</span>
                  <button type="button" onClick={() => onFocus(linked.id)} className="truncate text-sm font-medium hover:text-primary">
                    {linked.title}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleUnlink()}
                  data-testid="map-unlink"
                >
                  <LinkBreak className="size-3.5" aria-hidden="true" />
                  {t('lit.map.unlink')}
                </Button>
              </div>
            )}

            <div className="relative">
              <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(linked ? 'lit.map.searchChange' : 'lit.map.search')}
                className="pl-9 text-sm"
                data-testid="map-search"
              />
            </div>

            {query.trim() && searchResults.length > 0 && (
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    disabled={busy || result.isLoop}
                    onClick={() => void handleLink(result.id)}
                    className="flex flex-col gap-0.5 p-2 rounded-md text-left hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="map-result"
                  >
                    <span className="text-sm font-medium truncate">{result.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.isLoop ? t('lit.map.loop') : [result.name, t('lit.map.counts', { chapters: result.chapters, facts: result.facts }), rel(result.updatedAt)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

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
                      d={buildLinePath(node.x, node.y, child.x, child.y)}
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
