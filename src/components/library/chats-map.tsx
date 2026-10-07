import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { LinkSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { LitChatItem } from './litopys-api'
import { StitchHeading } from './stitch'

interface NodeLayout {
  item: LitChatItem
  x: number
  y: number
  children: NodeLayout[]
}

interface ForestLayout {
  nodes: NodeLayout[]
  width: number
  height: number
}

const SLOT_W = 132
const ROW_H = 84
const TOP = 34 // room above the first row for the largest circle
const LABEL_MAX = 18

/**
 * A forest by parentChatId: a chat whose parent is not drawn is a root. Leaves take consecutive
 * slots, a parent sits centred over its children, trees stand side by side one slot apart.
 */
function laidOutForest(items: LitChatItem[]): ForestLayout {
  const byId = new Map(items.map((i) => [i.id, i]))
  const linked = new Set<string>()
  for (const i of items) {
    if (i.parentChatId && byId.has(i.parentChatId)) {
      linked.add(i.id)
      linked.add(i.parentChatId)
    }
  }
  const drawn = items.filter((i) => i.hasData || linked.has(i.id))
  const drawnIds = new Set(drawn.map((i) => i.id))
  const kids = new Map<string, LitChatItem[]>()
  const roots: LitChatItem[] = []
  for (const i of drawn) {
    const p = i.parentChatId
    if (p && drawnIds.has(p) && p !== i.id) kids.set(p, [...(kids.get(p) ?? []), i])
    else roots.push(i)
  }
  const byTitle = (a: LitChatItem, b: LitChatItem) => a.title.localeCompare(b.title)
  const flat: NodeLayout[] = []
  const seen = new Set<string>()
  let slot = 0
  const place = (item: LitChatItem, depth: number): NodeLayout => {
    seen.add(item.id)
    const children = (kids.get(item.id) ?? []).filter((c) => !seen.has(c.id)).sort(byTitle).map((c) => place(c, depth + 1))
    const x = children.length ? (children[0].x + children[children.length - 1].x) / 2 : (slot++ + 0.5) * SLOT_W
    const node = { item, x, y: TOP + depth * ROW_H, children }
    flat.push(node)
    return node
  }
  for (const r of roots.sort(byTitle)) {
    place(r, 0)
    slot++ // a gap between trees
  }
  if (!flat.length) return { nodes: [], width: 0, height: 0 }
  return { nodes: flat, width: Math.max(SLOT_W, (slot - 1) * SLOT_W), height: Math.max(...flat.map((n) => n.y)) + ROW_H }
}

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX ? label.slice(0, LABEL_MAX - 1) + '…' : label
}

function nodeRadius(facts: number): number {
  return Math.min(10 + 3 * Math.sqrt(facts), 26)
}

function buildLinePath(cx1: number, cy1: number, cx2: number, cy2: number): string {
  const midY = (cy1 + cy2) / 2
  return `M ${cx1} ${cy1} C ${cx1} ${midY}, ${cx2} ${midY}, ${cx2} ${cy2}`
}

export function ChatsMap(props: {
  items: LitChatItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { items, selectedId, onSelect } = props
  const t = useT()
  
  const layout = useMemo(() => laidOutForest(items), [items])
  
  const drawnCount = layout.nodes.length
  const noRecordCount = items.length - drawnCount
  
  const handleKeyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }
  
  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <StitchHeading>{t('lit.map.title')}</StitchHeading>
          <p className="text-xs text-muted-foreground">{t('lit.map.hint')}</p>
        </div>
        
        <Tooltip>
          <TooltipTrigger render={
            <span tabIndex={0} className="inline-flex">
              <Button variant="outline" size="sm" disabled data-testid="map-bridge">
                <LinkSimple className="size-3.5" aria-hidden="true" />
                {t('lit.map.bridge')}
              </Button>
            </span>
          } />
          <TooltipContent>{t('lit.map.bridgeSoon')}</TooltipContent>
        </Tooltip>
      </div>
      
      {/* SVG area */}
      {drawnCount === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {t('lit.map.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg bg-card">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width="100%"
            preserveAspectRatio="xMidYMin meet"
            style={{ minWidth: Math.min(layout.width, 2400) }}
          >
            {/* Edges */}
            {layout.nodes.map(node =>
              node.children.map(child => (
                <path
                  key={`${node.item.id}-${child.item.id}`}
                  d={buildLinePath(node.x, node.y, child.x, child.y)}
                  className="stroke-border"
                  strokeWidth={1.5}
                  fill="none"
                />
              ))
            )}
            
            {/* Nodes */}
            {layout.nodes.map(node => {
                const selected = node.item.id === selectedId
                const r = nodeRadius(node.item.facts)
                
                return (
                  <g
                    key={node.item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={node.item.title}
                    onClick={() => onSelect(node.item.id)}
                    onKeyDown={(e) => handleKeyDown(e, node.item.id)}
                    data-testid="map-node"
                    className="cursor-pointer group"
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      className={cn(
                        "fill-primary/15 stroke-primary transition-all",
                        selected ? "stroke-[3]" : "stroke-2 group-hover:stroke-[3]"
                      )}
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
      
      {/* No record line */}
      {noRecordCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('lit.map.noRecord', { n: noRecordCount })}
        </p>
      )}
    </div>
  )
}
