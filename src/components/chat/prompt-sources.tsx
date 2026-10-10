import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { PromptSources, PromptSourceSpan } from '@/lib/engine'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'

// Sources panel and marked text for the prompt peek: where each part of the
// prompt came from, colored marks in the texts, and what did not make it.
// Mirrors the engine's prompt inspector (client-agent/src/inspector-sources.tsx).

type SourcePart = PromptSources['parts'][number]

/** One colour per source kind: a 500 fill for dots, a text shade for labels on
 *  both themes, and the mark tints (class names spelled out for Tailwind). */
const KIND: Record<string, { label: string; fill: string; text: string; mark: string; markActive: string }> = {
  card: { label: 'Card', fill: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-300', mark: 'bg-pink-500/15', markActive: 'bg-pink-500/35' },
  persona: { label: 'Persona', fill: 'bg-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300', mark: 'bg-fuchsia-500/15', markActive: 'bg-fuchsia-500/35' },
  preset: { label: 'Preset', fill: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300', mark: 'bg-purple-500/15', markActive: 'bg-purple-500/35' },
  lorebook: { label: 'Lorebook', fill: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300', mark: 'bg-indigo-500/15', markActive: 'bg-indigo-500/35' },
  example: { label: 'Examples', fill: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300', mark: 'bg-blue-500/15', markActive: 'bg-blue-500/35' },
  databank: { label: 'Data Bank', fill: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', mark: 'bg-cyan-500/15', markActive: 'bg-cyan-500/35' },
  note: { label: "Author's note", fill: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', mark: 'bg-teal-500/15', markActive: 'bg-teal-500/35' },
  history: { label: 'History', fill: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-300', mark: 'bg-emerald-600/15', markActive: 'bg-emerald-600/35' },
  group: { label: 'Group', fill: 'bg-green-500', text: 'text-green-700 dark:text-green-300', mark: 'bg-green-500/15', markActive: 'bg-green-500/35' },
  memory: { label: 'Memory', fill: 'bg-lime-600', text: 'text-lime-700 dark:text-lime-300', mark: 'bg-lime-600/15', markActive: 'bg-lime-600/35' },
  dashboard: { label: 'Dashboard', fill: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300', mark: 'bg-yellow-500/20', markActive: 'bg-yellow-500/40' },
  utility: { label: 'Utility prompt', fill: 'bg-orange-400', text: 'text-orange-700 dark:text-orange-300', mark: 'bg-orange-400/15', markActive: 'bg-orange-400/35' },
  prefill: { label: 'Prefill', fill: 'bg-orange-600', text: 'text-orange-700 dark:text-orange-300', mark: 'bg-orange-600/15', markActive: 'bg-orange-600/35' },
  plugin: { label: 'Plugin', fill: 'bg-red-500', text: 'text-red-700 dark:text-red-300', mark: 'bg-red-500/15', markActive: 'bg-red-500/35' },
  other: { label: 'Other', fill: 'bg-gray-500', text: 'text-gray-700 dark:text-gray-300', mark: 'bg-gray-500/15', markActive: 'bg-gray-500/35' },
}
const OTHER = KIND.other as (typeof KIND)[string]
const kindOf = (kind: string) => KIND[kind] ?? OTHER
/** Keys for lists that may repeat an item (two books with an entry of one name). */
const keyed = <T,>(items: readonly T[], name: (item: T) => string): Array<{ item: T; key: string }> =>
  items.map((item, i) => ({ item, key: `${name(item)}#${i}` }))

const pct = (share: number): string => (share > 0 && share < 0.01 ? '<1' : String(Math.round(share * 100)))

/** A row of the table; `index` is the part's place in sources.parts (null: not clickable). */
interface Row {
  part: { kind: string; label: string; detail?: string; located: boolean }
  tokens: number
  index: number | null
}

function SourceRow({ row, active, onPick, total }: { row: Row; active: boolean; onPick: (i: number | null) => void; total: number }): ReactNode {
  const { part, index } = row
  const clickable = index != null && part.located
  return (
    <button
      type="button"
      disabled={!clickable}
      aria-pressed={clickable ? active : undefined}
      onClick={() => clickable && onPick(active ? null : index)}
      className={cn(
        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-left text-xs',
        clickable && 'hover:bg-muted/60',
        active && 'bg-primary/10 ring-1 ring-primary/30',
        !clickable && 'cursor-default',
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-sm', kindOf(part.kind).fill)} aria-hidden="true" />
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="min-w-0 break-words font-medium">{part.label}</span>
        {part.detail ? (
          <span className="min-w-0 truncate text-muted-foreground" title={part.detail}>{part.detail}</span>
        ) : null}
        {!part.located ? (
          <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">not found in the request</Badge>
        ) : null}
      </span>
      <span className="whitespace-nowrap text-right text-muted-foreground">
        {formatTokens(row.tokens)} · {pct(row.tokens / total)}%
      </span>
    </button>
  )
}

/** The "Sources" section of the peek: parts grouped by kind (largest group
 *  first, request order inside), the unlabeled rest, what was left out and the
 *  preset's choices. Collapsible, open by default. */
export function PromptSourcesPanel({ sources, total, active, onPick }: {
  sources: PromptSources
  /** tokens of all blocks, the base for the shares */
  total: number
  active: number | null
  onPick: (part: number | null) => void
}): ReactNode {
  const [open, setOpen] = useState(true)
  const [leftOutOpen, setLeftOutOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const base = Math.max(total, 1)

  const { groups, unlabeled } = useMemo(() => {
    const byKind = new Map<string, Row[]>()
    let labeled = 0
    sources.parts.forEach((part, index) => {
      const tokens = estimateTokens(part.text)
      if (part.located) labeled += tokens
      const list = byKind.get(part.kind) ?? []
      list.push({ part, tokens, index })
      byKind.set(part.kind, list)
    })
    const out = [...byKind]
      .map(([kind, rows]) => ({ kind, rows, tokens: rows.reduce((n, r) => n + r.tokens, 0) }))
      .sort((a, b) => b.tokens - a.tokens)
    return { groups: out, unlabeled: Math.max(0, total - labeled) }
  }, [sources, total])

  const toggle = (kind: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="grid min-w-0 gap-1.5">
      <CollapsibleTrigger className="flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <CaretRight className={cn('size-3 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        Sources
        <span className="font-normal">({sources.parts.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid min-w-0 gap-1.5">
        <div className="grid min-w-0 gap-0.5 rounded-lg border p-1.5">
          {groups.map((group) => {
            const k = kindOf(group.kind)
            const expandedGroup = expanded.has(group.kind)
            const many = group.rows.length > 8
            return (
              <div key={group.kind} className="grid min-w-0 gap-0.5">
                <div className="flex min-w-0 items-center gap-2 px-2 pt-1 text-xs font-semibold">
                  <span className={cn('size-2 shrink-0 rounded-sm', k.fill)} aria-hidden="true" />
                  <span className={cn('min-w-0 flex-1 truncate', k.text)}>{k.label}</span>
                  <span className="whitespace-nowrap text-right font-normal text-muted-foreground">
                    {formatTokens(group.tokens)} · {pct(group.tokens / base)}%
                  </span>
                </div>
                {(expandedGroup ? group.rows : group.rows.slice(0, 8)).map((row) => (
                  <SourceRow key={row.index} row={row} total={base} active={row.index === active} onPick={onPick} />
                ))}
                {many ? (
                  <button
                    type="button"
                    className="flex w-fit items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    aria-expanded={expandedGroup}
                    onClick={() => toggle(group.kind)}
                  >
                    <CaretDown className={cn('size-3 transition-transform', !expandedGroup && '-rotate-90')} aria-hidden="true" />
                    {expandedGroup ? 'Show fewer' : `Show all ${group.rows.length}`}
                  </button>
                ) : null}
              </div>
            )
          })}
          {unlabeled > 0 ? (
            <div className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">Unlabeled (separators, wrappers)</span>
              <span className="whitespace-nowrap text-right">
                {formatTokens(unlabeled)} · {pct(unlabeled / base)}%
              </span>
            </div>
          ) : null}
        </div>

        {sources.omitted.length ? (
          <Collapsible open={leftOutOpen} onOpenChange={setLeftOutOpen} className="grid min-w-0 gap-1">
            <CollapsibleTrigger className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              <CaretRight className={cn('size-3 transition-transform', leftOutOpen && 'rotate-90')} aria-hidden="true" />
              Left out ({sources.omitted.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="grid min-w-0 gap-0.5 rounded-lg border p-1.5">
              {keyed(sources.omitted, (o) => `${o.kind}-${o.label}`).map(({ item: o, key }) => (
                <div key={key} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 rounded-md px-2 py-1 text-xs">
                  <span className={cn('mt-1 size-2 shrink-0 rounded-sm', kindOf(o.kind).fill)} aria-hidden="true" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="break-words font-medium">{o.label}</span>
                    <span className="break-words text-muted-foreground">
                      {o.reason}
                      {o.detail ? ` · ${o.detail}` : ''}
                    </span>
                  </span>
                  {o.tokens != null ? <span className="whitespace-nowrap text-right text-muted-foreground">{formatTokens(o.tokens)}</span> : <span />}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {sources.vars.length ? (
          <div className="grid min-w-0 gap-1">
            <span className="text-xs text-muted-foreground">Preset choices ({sources.vars.length})</span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {keyed(sources.vars, (v) => v.name).map(({ item: v, key }) => (
                <span
                  key={key}
                  className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  title={`${v.label || v.name}: ${v.value}`}
                >
                  {v.label || v.name}: {v.value}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Plugins (Litopys, the dashboard) add their parts when the message is sent; they show in Molfar's prompt inspector.
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A block's text with source marks. The active part's marks get the stronger
 *  style; when `scrollToActive` is set the first one is scrolled into view.
 *  Marks past the end of the text are cut. */
export function MarkedPre({ text, spans, parts, active, scrollToActive }: {
  text: string
  spans?: PromptSourceSpan[]
  parts?: SourcePart[]
  active: number | null
  scrollToActive?: boolean
}): ReactNode {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (active == null || !scrollToActive) return
    ref.current?.querySelector<HTMLElement>(`[data-part="${active}"]`)?.scrollIntoView({ block: 'center' })
  }, [active, scrollToActive])

  const marked = useMemo(() => {
    if (!spans?.length || !parts?.length) return null
    const out: ReactNode[] = []
    let cursor = 0
    for (const span of [...spans].sort((a, b) => a.start - b.start)) {
      const start = Math.max(span.start, cursor)
      const end = Math.min(span.end, text.length)
      if (end <= start) continue
      if (start > cursor) out.push(text.slice(cursor, start))
      const part = parts[span.part]
      const k = kindOf(part?.kind ?? 'other')
      const on = span.part === active
      out.push(
        <mark
          key={`${span.start}-${span.part}`}
          data-part={span.part}
          title={part ? `${part.label}${part.detail ? ` — ${part.detail}` : ''}` : undefined}
          className={cn('rounded-[2px] text-inherit', on ? cn(k.markActive, 'ring-2 ring-primary/40') : k.mark)}
        >
          {text.slice(start, end)}
        </mark>,
      )
      cursor = end
    }
    if (cursor < text.length) out.push(text.slice(cursor))
    return out
  }, [spans, parts, text, active])

  return (
    <pre ref={ref} className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
      {marked ?? text}
    </pre>
  )
}
