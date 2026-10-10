import { Prohibit, Scissors } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import type { WIBlockedRow, WIFiredRow } from '@/lib/engine'
import { cn } from '@/lib/utils'
import { LoreStatusIcon } from '@/components/lore-status-icon'
import { LOGIC_KEY, POSITION_KEY, canonicalPosition } from '@/components/lore/lore-labels'
import type { EntryLogic } from '@/lib/types'

type T = (key: MsgKey, vars?: Record<string, string | number>) => string

const quote = (s: string) => `“${s}”`

/** The line that says WHY an entry fired. */
function whyText(r: WIFiredRow, t: T): string {
  if (r.via === 'key') {
    const base = t('lore.why.key', { key: r.key ?? '' })
    return r.secondary?.length ? `${base} ${t('lore.why.and', { keys: r.secondary.map(quote).join(', ') })}` : base
  }
  if (r.via === 'sticky') return t('lore.why.sticky')
  if (r.via === 'vector') return t('lore.why.vector', { score: r.score ?? 0 })
  return t('lore.why.constant')
}

/** The reason a matching entry was held back, in words. */
export function blockedText(r: WIBlockedRow, t: T): string {
  const d = r.detail
  switch (r.reason) {
    case 'delay': return t('lore.block.delay', { n: d ?? '' })
    case 'cooldown': return t('lore.block.cooldown', { n: d ?? '' })
    case 'recursion_delay': return t('lore.block.recursionDelay', { n: d ?? '' })
    case 'non_recursable': return t('lore.block.nonRecursable')
    case 'secondary': {
      const logic = typeof d === 'string' && d in LOGIC_KEY ? t(LOGIC_KEY[d as EntryLogic]) : String(d ?? '')
      return t('lore.block.secondary', { logic })
    }
    case 'probability': return t('lore.block.probability', { n: d ?? '' })
    case 'group': return t('lore.block.group', { group: String(d ?? ''), winner: r.winner ?? '' })
    case 'character': return d === 'excluded' ? t('lore.block.speakerExcluded') : t('lore.block.speakerNotListed')
    case 'trigger': return t('lore.block.trigger', { types: String(d ?? '') })
    default: return String(r.reason)
  }
}

/** Rows from the scan do not carry the book's base scan depth; the deepest
 *  base among the books involved is what the engine started from. */
export function baseDepthOf(
  rows: WIFiredRow[],
  depthOfBook: (bookName: string) => number | null,
): number | null {
  let base: number | null = null
  for (const r of rows) {
    const d = depthOfBook(r.book)
    if (d != null && (base == null || d > base)) base = d
  }
  return base
}

function Extra({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Badge variant="outline" className="h-auto max-w-full whitespace-normal px-1.5 py-0 text-[10px] font-normal text-muted-foreground" title={title}>
      {children}
    </Badge>
  )
}

function FiredCard({ r, base, muted }: { r: WIFiredRow; base: number | null; muted?: boolean }) {
  const t = useT() as T
  const tokens = Math.ceil(r.chars / 4)
  const posKey = POSITION_KEY[canonicalPosition(r.position)]
  return (
    <li
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-sm',
        muted ? 'border-dashed border-border text-muted-foreground' : 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2">
        {muted
          ? <Scissors className="size-3.5 shrink-0" aria-hidden="true" />
          : <LoreStatusIcon status={r.via === 'constant' ? 'constant' : r.via === 'vector' ? 'vectorized' : 'normal'} />}
        <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{tokens}t</span>
      </div>
      <p className="mt-0.5 break-words text-xs">
        {muted ? <span>{t('lore.why.cut')} · </span> : null}
        <span className={muted ? '' : 'text-foreground'}>{whyText(r, t)}</span>
        <span className="text-muted-foreground"> · {r.book}</span>
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {r.pass > 0 && <Extra>{t('lore.why.pass', { n: r.pass })}</Extra>}
        {base != null && r.depth > base && <Extra>{t('lore.why.deeper', { n: r.depth })}</Extra>}
        {r.probability != null && <Extra>{t('lore.why.chance', { n: r.probability })}</Extra>}
        {r.group && <Extra>{t('lore.why.group', { group: r.group })}</Extra>}
        {posKey && <Extra>{t(posKey)}</Extra>}
      </div>
    </li>
  )
}

function BlockedCard({ r }: { r: WIBlockedRow }) {
  const t = useT() as T
  return (
    <li className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Prohibit className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{r.title}</span>
        <span className="shrink-0 text-[10px]">{r.book}</span>
      </div>
      <p className="mt-0.5 break-words text-xs">
        {blockedText(r, t)}
        {r.reason === 'secondary' && r.key ? <span> · {t('lore.why.key', { key: r.key })}</span> : null}
      </p>
    </li>
  )
}

/** One shared list of "what fired, what the budget cut, what was held back and
 *  why" for the keyword test, the Lorebooks "Active" viewer and the chat's
 *  Lorebook activity panel. */
export function WhyRows({ fired, skipped, blocked, depthOfBook }: {
  fired: WIFiredRow[]
  skipped: WIFiredRow[]
  blocked: WIBlockedRow[]
  /** the base scan depth of a book by its name (null = unknown) */
  depthOfBook?: (bookName: string) => number | null
}) {
  const t = useT() as T
  const base = depthOfBook ? baseDepthOf([...fired, ...skipped], depthOfBook) : null
  return (
    <div className="flex flex-col gap-1.5" data-testid="why-rows">
      <p className="text-xs font-medium">{t('lore.why.firedN', { n: fired.length })}</p>
      {fired.length === 0 && <p className="text-xs text-muted-foreground">{t('lore.why.noneFired')}</p>}
      <ul className="flex flex-col gap-1.5">
        {fired.map((r, i) => <FiredCard key={`f-${r.book}-${r.uid}-${i}`} r={r} base={base} />)}
      </ul>
      {skipped.length > 0 && (
        <>
          <p className="mt-1 text-xs font-medium">{t('lore.why.skippedN', { n: skipped.length })}</p>
          <ul className="flex flex-col gap-1.5">
            {skipped.map((r, i) => <FiredCard key={`s-${r.book}-${r.uid}-${i}`} r={r} base={base} muted />)}
          </ul>
        </>
      )}
      {blocked.length > 0 && (
        <>
          <p className="mt-1 text-xs font-medium">{t('lore.why.blockedN', { n: blocked.length })}</p>
          <ul className="flex flex-col gap-1.5">
            {blocked.map((r, i) => <BlockedCard key={`b-${r.book}-${r.uid}-${i}`} r={r} />)}
          </ul>
        </>
      )}
    </div>
  )
}

/** "used ~N of ~M tokens budget, context N" */
export function BudgetLine({ usedChars, budgetChars, contextTokens }: { usedChars: number; budgetChars: number; contextTokens?: number }) {
  const t = useT() as T
  return (
    <p className="text-[11px] text-muted-foreground">
      {t('lore.why.budget', { used: Math.round(usedChars / 4).toLocaleString(), budget: Math.round(budgetChars / 4).toLocaleString() })}
      {contextTokens != null ? ` · ${t('lore.why.context', { n: contextTokens.toLocaleString() })}` : ''}
    </p>
  )
}
