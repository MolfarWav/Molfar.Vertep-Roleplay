// The "Who knows" tab of the chat Ledger (#449, S1): secrets as rows, people as columns. It only reads the
// chat's facts (`knowledgeMap`): no model call, nothing is written. A secret is a fact only part of the cast
// knows, or one marked as a secret in the Facts tab.
import { useMemo, useState } from 'react'
import { Check, Lock, Minus, Question } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { knowledgeMap, stateOf, type KnowPerson, type KnowRow, type KnowState } from '@/lib/knowledge-map'
import type { TabProps } from './ledger-facts'

/** Columns shown before "Show all": a wider matrix scrolls sideways. */
const COLUMNS = 8

const STATE_KEY = { knows: 'lit.kn.knows', suspects: 'lit.kn.suspects', none: 'lit.kn.none' } as const

function Cell({ state, who, label }: { state: KnowState; who: string; label: string }) {
  return (
    <span className="inline-flex size-6 items-center justify-center" role="img" aria-label={`${who}: ${label}`} title={`${who}: ${label}`}>
      {state === 'knows' && <Check weight="bold" className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
      {state === 'suspects' && <Question weight="bold" className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
      {state === 'none' && <Minus className="size-3.5 text-muted-foreground/60" aria-hidden="true" />}
    </span>
  )
}

function RowText({ row }: { row: KnowRow }) {
  const t = useT()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="line-clamp-3 min-w-0 break-words text-sm" title={row.text}>
        {row.marked && <Lock className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-label={t('lit.kn.marked')} />}
        {row.text}
      </p>
      <span className="text-xs text-muted-foreground">
        {row.subject ? t('lit.subject', { name: row.subject }) : null}
        {row.unnamed ? `${row.subject ? ' · ' : ''}${t('lit.kn.unnamed')}` : null}
      </span>
    </div>
  )
}

function Legend() {
  const t = useT()
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t('lit.kn.legend')}>
      {(['knows', 'suspects', 'none'] as const).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <Cell state={s} who="" label={t(STATE_KEY[s])} />
          {t(STATE_KEY[s])}
        </li>
      ))}
    </ul>
  )
}

function Matrix({ rows, people }: { rows: KnowRow[]; people: KnowPerson[] }) {
  const t = useT()
  return (
    <div className="hidden overflow-x-auto rounded-md border md:block" data-testid="kn-matrix">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b bg-muted/40">
            <th scope="col" className="sticky left-0 z-10 min-w-64 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">{t('lit.kn.secret')}</th>
            {people.map((p) => (
              <th key={p.key} scope="col" className="max-w-28 px-2 py-2 text-center text-xs font-medium" title={p.group ? t('lit.groupLabel', { name: p.name }) : p.name}>
                <span className="block truncate">{p.name}</span>
                {p.group && <span className="block text-[12px] font-normal text-muted-foreground">{t('lit.kn.group')}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0" data-testid="kn-row">
              <th scope="row" className="sticky left-0 z-10 min-w-64 max-w-md bg-card px-3 py-2 font-normal"><RowText row={r} /></th>
              {people.map((p) => {
                const s = stateOf(r, p.key)
                return (
                  <td key={p.key} className="px-2 py-2 text-center">
                    <Cell state={s} who={p.name} label={t(STATE_KEY[s])} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A phone has no room for a matrix: one card per secret, who knows it in words. */
function Cards({ rows, people }: { rows: KnowRow[]; people: KnowPerson[] }) {
  const t = useT()
  const name = (k: string) => people.find((p) => p.key === k)?.name ?? k
  return (
    <ul className="flex flex-col gap-2 md:hidden" data-testid="kn-cards">
      {rows.map((r) => (
        <li key={r.id} className="flex min-w-0 flex-col gap-2 rounded-md border bg-card p-3">
          <RowText row={r} />
          <dl className="flex flex-col gap-1 text-xs">
            {r.knows.length > 0 && (
              <div className="flex gap-1.5"><dt className="inline-flex shrink-0 items-center gap-1 font-medium"><Check weight="bold" className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t('lit.kn.knows')}:</dt><dd className="min-w-0 break-words">{r.knows.map(name).join(', ')}</dd></div>
            )}
            {r.suspects.length > 0 && (
              <div className="flex gap-1.5"><dt className="inline-flex shrink-0 items-center gap-1 font-medium"><Question weight="bold" className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />{t('lit.kn.suspects')}:</dt><dd className="min-w-0 break-words">{r.suspects.map(name).join(', ')}</dd></div>
            )}
          </dl>
        </li>
      ))}
    </ul>
  )
}

export function KnowledgeTab({ chat }: TabProps) {
  const t = useT()
  const [markedOnly, setMarkedOnly] = useState(false)
  const [allPeople, setAllPeople] = useState(false)
  const map = useMemo(() => knowledgeMap(chat), [chat])
  const marked = map.rows.filter((r) => r.marked).length
  const rows = markedOnly ? map.rows.filter((r) => r.marked) : map.rows
  const people = allPeople ? map.people : map.people.slice(0, COLUMNS)

  if (map.rows.length === 0) {
    return (
      <Empty className="flex-none border" data-testid="kn-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lock aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{t('lit.kn.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('lit.kn.empty.body')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="kn-tab">
      <p className="text-xs text-muted-foreground">{t('lit.kn.hint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs text-muted-foreground" data-testid="kn-summary">
          {t('lit.kn.summary', { secrets: map.rows.length, people: map.people.length, open: map.open })}
        </span>
        {marked > 0 && marked < map.rows.length && (
          <ToggleChip pressed={markedOnly} onPressedChange={setMarkedOnly} tone="sky">{t('lit.kn.markedOnly', { n: marked })}</ToggleChip>
        )}
      </div>
      <Legend />
      <Matrix rows={rows} people={people} />
      <Cards rows={rows} people={map.people} />
      {map.people.length > COLUMNS && (
        <Button variant="outline" size="sm" className={cn('hidden self-start md:inline-flex')} onClick={() => setAllPeople((v) => !v)} data-testid="kn-people-toggle">
          {allPeople ? t('lit.kn.fewer') : t('lit.kn.all', { n: map.people.length })}
        </Button>
      )}
    </div>
  )
}
