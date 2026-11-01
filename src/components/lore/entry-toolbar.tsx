import { CheckSquare, MagnifyingGlass, Plus, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/info-tip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterChip } from '@/components/lore/filter-chip'
import { useT } from '@/hooks/use-t'
import { ENTRY_FILTERS, type EntryFilter } from '@/lib/lore-filters'
import type { LoreEntry } from '@/lib/types'
import { TONES, type ToneName } from '@/components/ui/tone'

/** The tone of each entry filter chip (the status colours; "No keys" is the warning amber). */
const FILTER_TONE: Partial<Record<EntryFilter, ToneName>> = { constant: 'amber', keyed: 'sky', vector: 'violet', nokeys: 'amber' }
const SORTS = ['order', 'title', 'tokens', 'priority', 'trigger'] as const

/**
 * The Entries tab's toolbar: search, sort, select several and the one primary "Add entry", then the filter chips with
 * their counts in one row. On a phone the search takes its own row and the chips scroll sideways.
 */
export function EntryToolbar({ query, onQuery, sort, onSort, selecting, onToggleSelecting, filter, onFilter, counts, onAdd, badgesInfo }: {
  query: string
  onQuery: (q: string) => void
  sort: string
  onSort: (s: string) => void
  selecting: boolean
  onToggleSelecting: () => void
  filter: EntryFilter
  onFilter: (f: EntryFilter) => void
  counts: Record<EntryFilter, number>
  onAdd: () => void
  badgesInfo: string
}) {
  const t = useT()
  const sortLabels: Record<string, string> = Object.fromEntries(SORTS.map((k) => [k, t(`lore.sort.${k}` as const)]))
  const filterLabel = (f: EntryFilter): string => t(`lore.filter.${f}` as const)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative basis-full md:max-w-xs md:flex-1">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('lore.entries.search')} className="h-8 pl-8 text-caption max-md:h-10" aria-label={t('lore.entries.search')} />
        </div>
        <Select value={sort} onValueChange={(v) => v && onSort(v)}>
          <SelectTrigger className="h-8 w-40 text-caption max-md:h-10" aria-label={t('lore.sort.label')}>
            <SelectValue>{(v: string) => `${t('lore.sort.label')}: ${sortLabels[v] ?? v}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sortLabels).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={selecting ? 'secondary' : 'outline'} size="sm" className="text-caption max-md:h-10" aria-pressed={selecting} onClick={onToggleSelecting}>
          <CheckSquare className="size-3.5" aria-hidden="true" />{t('lore.entries.select')}
        </Button>
        <InfoTip label={t('lore.badges.label')}>{badgesInfo}</InfoTip>
        <Button variant="default" size="default" className="ml-auto max-md:h-10" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />{t('lore.addEntry')}
        </Button>
      </div>
      <div role="group" aria-label={t('lore.filter.label')} className="flex flex-wrap gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1">
        {ENTRY_FILTERS.map((f) => (
          <FilterChip
            key={f}
            pressed={filter === f}
            count={counts[f]}
            tone={FILTER_TONE[f]}
            onClick={() => onFilter(f)}
            icon={f === 'nokeys' ? <Warning className={`size-3.5 shrink-0 ${TONES.amber.ink}`} aria-hidden="true" /> : undefined}
          >
            {filterLabel(f)}
          </FilterChip>
        ))}
      </div>
    </div>
  )
}

/** Shown only once something is selected: the bulk actions of the selected entries. */
export function BulkBar({ n, onSelectAllVisible, onBulk, onCopy, onDelete, onClear }: {
  n: number
  onSelectAllVisible: () => void
  onBulk: (patch: Partial<LoreEntry>) => void
  onCopy: () => void
  onDelete: () => void
  onClear: () => void
}) {
  const t = useT()
  const btn = 'h-7 text-caption max-md:h-10'
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2" data-testid="bulk-bar">
      <span className="mr-1 text-body font-medium">{t('lore.bulk.selected', { n })}</span>
      <Button variant="outline" size="sm" className={btn} onClick={onSelectAllVisible}>{t('lore.bulk.selectAll')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => onBulk({ enabled: true })}>{t('lore.bulk.enable')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => onBulk({ enabled: false })}>{t('lore.bulk.disable')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => onBulk({ status: 'constant' })}>{t('lore.bulk.constant')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => onBulk({ status: 'normal' })}>{t('lore.bulk.keyed')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => onBulk({ status: 'vectorized' })}>{t('lore.bulk.vector')}</Button>
      <Button variant="outline" size="sm" className={btn} onClick={onCopy}>{t('lore.bulk.copy')}</Button>
      <Button variant="outline" size="sm" className={`${btn} text-destructive`} onClick={onDelete}>{t('lore.bulk.delete')}</Button>
      <Button variant="ghost" size="sm" className={`ml-auto ${btn}`} onClick={onClear}>{t('lore.bulk.clear')}</Button>
    </div>
  )
}
