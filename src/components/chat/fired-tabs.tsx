// The tabs of the chat's "What fired" panel (#253). The rows reuse the memory trace's (`components/memory/trace-parts.tsx`) and the
// lorebook chips (`components/lore/why-rows.tsx`); this file only arranges them for the last reply and for the whole chat.

import type { ReactNode } from 'react'
import { Prohibit, Scissors, Lightning, Key, LinkSimple, PushPin, RadioButton, BookOpenText, Database, Scroll, GitMerge } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { TONES, type ToneName } from '@/components/ui/tone'
import { MeaningCard } from '@/components/memory/meaning-card'
import { DatabankFold, LitopysFolds, Summary, Who, type T } from '@/components/memory/trace-parts'
import { WhyChips, blockedText, scoreText } from '@/components/lore/why-rows'
import type { WIBlockedRow, WIFiredRow } from '@/lib/engine'
import {
  constantTokens,
  loreGroups,
  repliesAgo,
  rowTokens,
  share,
  topBank,
  topLore,
  type FiredLog,
  type LitFired,
} from '@/lib/fired'
import type { FiredAll } from '@/lib/fired-load'
import { semVerdict } from '@/lib/vectors'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'

export type FiredTab = 'lore' | 'chron' | 'bank' | 'vec'
export type FiredScope = 'last' | 'chat'

/** A tab's accent: the hue of the tool it belongs to (the header's Lore button is sky, Record violet, the Canvas Data Bank teal). */
export const TAB_TONE: Record<FiredTab, ToneName> = { lore: 'sky', chron: 'violet', bank: 'teal', vec: 'emerald' }
export const TAB_ICON = { lore: BookOpenText, chron: Scroll, bank: Database, vec: LinkSimple } as const

/** An empty or unavailable state that says what is going on and what to do. */
export function Notice({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-6 text-center" data-testid="fired-notice">
      <p className="text-body font-semibold">{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted-foreground">{children}</p> : null}
      {action}
    </div>
  )
}

const Rows = ({ children }: { children: ReactNode }) => <ul className="divide-y divide-border">{children}</ul>

function Chip({ tone, children }: { tone: ToneName; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-caption font-medium', TONES[tone].chip)}>{children}</span>
}

function LoreRow({ r, t }: { r: WIFiredRow; t: T }) {
  const extras = [r.pass > 0 ? t('lore.why.pass', { n: r.pass }) : null, r.probability != null ? t('lore.why.chance', { n: r.probability }) : null, r.group ? t('lore.why.group', { group: r.group }) : null].filter(Boolean)
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-body font-medium">{r.title}</p>
        <p className="mt-0.5 break-words text-caption text-muted-foreground">
          {r.book} · {t('fired.tok', { n: rowTokens(r) })}
          {extras.length ? ` · ${extras.join(' · ')}` : ''}
        </p>
      </div>
      <WhyChips r={r} />
    </li>
  )
}

function HeldRow({ r, t }: { r: WIBlockedRow; t: T }) {
  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2">
        <Prohibit className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words text-body">{r.title}</p>
      </div>
      <p className="mt-0.5 break-words pl-5.5 text-caption text-muted-foreground">
        {blockedText(r, t)}
        {r.reason === 'secondary' && r.key ? ` · ${t('lore.why.key', { key: r.key })}` : ''} · {r.book}
      </p>
    </li>
  )
}

function CutRow({ r, t }: { r: WIFiredRow; t: T }) {
  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2">
        <Scissors className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words text-body">{r.title}</p>
        <span className="shrink-0 text-caption text-muted-foreground">{t('fired.tok', { n: rowTokens(r) })}</span>
      </div>
      <p className="mt-0.5 break-words pl-5.5 text-caption text-muted-foreground">{t('fired.cutWhy')} · {r.book}</p>
    </li>
  )
}

const Hint = ({ children }: { children: ReactNode }) => <p className="px-3 pt-2 text-caption text-muted-foreground">{children}</p>

/** Lorebook, last reply: the rows the engine's scan kept, by the way they got in, then what was held back or cut. */
export function LoreLast({ log, t }: { log: FiredLog; t: T }) {
  const last = log.last
  if (!last) return null
  const g = loreGroups(last)
  const used = Math.round(last.used / 4)
  const budget = Math.round(last.budget / 4)
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3" data-testid="fired-lore-summary">
        <p className="text-body font-semibold">{t('fired.lore.went', { n: last.fired.length })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('fired.lore.rest', { held: g.held.length, cut: g.cut.length })}</p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-caption text-muted-foreground">
            <span>{t('fired.lore.budget', { used, budget })}</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('fired.lore.budget', { used, budget })}>
            <div className={cn('h-full rounded-full', TONES.slate.square)} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <Fold id="fired.vector" title={t('fired.sec.vector')} icon={LinkSimple} tone="violet" count={g.vector.length} summary={g.vector.length ? undefined : t('fired.none')} defaultOpen={g.vector.length > 0}>
        <Hint>{t('fired.sec.vectorHint')}</Hint>
        {g.vector.length ? <Rows>{g.vector.map((r, i) => <LoreRow key={`v:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows> : <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>}
      </Fold>
      <Fold id="fired.key" title={t('fired.sec.key')} icon={Key} tone="sky" count={g.key.length} summary={g.key.length ? undefined : t('fired.none')} defaultOpen={g.key.length > 0}>
        {g.key.length ? <Rows>{g.key.map((r, i) => <LoreRow key={`k:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows> : <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>}
      </Fold>
      {g.sticky.length > 0 && (
        <Fold id="fired.sticky" title={t('fired.sec.sticky')} icon={PushPin} tone="pink" count={g.sticky.length} defaultOpen>
          <Rows>{g.sticky.map((r, i) => <LoreRow key={`s:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows>
        </Fold>
      )}
      <Fold id="fired.constant" title={t('fired.sec.constant')} icon={RadioButton} tone="amber" count={g.constant.length} summary={t('fired.constantTok', { n: constantTokens(g.constant) })}>
        {g.constant.length ? <Rows>{g.constant.map((r, i) => <LoreRow key={`c:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows> : <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>}
      </Fold>
      {g.held.length > 0 && (
        <Fold id="fired.held" title={t('fired.sec.held')} icon={Prohibit} tone="slate" count={g.held.length} defaultOpen>
          <Rows>{g.held.map((r, i) => <HeldRow key={`h:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows>
        </Fold>
      )}
      {g.cut.length > 0 && (
        <Fold id="fired.cut" title={t('fired.sec.cut')} icon={Scissors} tone="slate" count={g.cut.length}>
          <Rows>{g.cut.map((r, i) => <CutRow key={`x:${r.bookId ?? r.book}:${r.uid}:${i}`} r={r} t={t} />)}</Rows>
        </Fold>
      )}
    </>
  )
}

/** One counted thing: its text, "N of M replies" with a small scale, how it got in, and how long ago it last did. */
function CountRow({ title, sub, n, replies, ago, chips, tone, t }: { tone: ToneName; title: ReactNode; sub: ReactNode; n: number; replies: number; ago: number; chips?: ReactNode; t: T }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2">
      <p className="line-clamp-3 break-words text-body font-medium">{title}</p>
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <span className="shrink-0 tabular-nums">{t('fired.count', { n, total: replies })}</span>
        <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className={cn('block h-full rounded-full', TONES[tone].square)} style={{ width: `${Math.round(share(n, replies) * 100)}%` }} />
        </span>
      </div>
      {chips ? <div className="flex flex-wrap items-center gap-1">{chips}</div> : null}
      <p className="break-words text-caption text-muted-foreground">
        {sub} · {ago === 0 ? t('fired.ago.now') : t('fired.ago.n', { n: ago })}
      </p>
    </li>
  )
}

const Counted = ({ replies, since, t, date }: { replies: number; since: number; t: T; date: (ts: number) => string }) => (
  <div className="rounded-xl border border-border bg-card px-3 py-2" data-testid="fired-counted">
    <p className="text-sm">{t('fired.counted', { n: replies, date: date(since) })}</p>
    <p className="mt-0.5 text-caption text-muted-foreground">{t('fired.countedNote')}</p>
  </div>
)

export function LoreChat({ log, t, date }: { log: FiredLog; t: T; date: (ts: number) => string }) {
  const rows = topLore(log)
  const total = Object.keys(log.lore).length
  return (
    <>
      <Counted replies={log.replies} since={log.since} t={t} date={date} />
      <Fold id="fired.chat.lore" title={t('fired.chat.mostLore')} icon={Lightning} tone="sky" count={total} defaultOpen>
        {rows.length ? (
          <Rows>
            {rows.map(({ id, e }) => (
              <CountRow
                tone="sky"
                key={id}
                title={e.t}
                sub={e.b}
                n={e.n}
                replies={log.replies}
                ago={repliesAgo(log, e.at)}
                t={t}
                chips={
                  <>
                    {e.v.vector ? <Chip tone="violet">{t('fired.mix.vector', { n: e.v.vector })}{e.best ? ` · ${scoreText(e.best)}` : ''}</Chip> : null}
                    {e.v.key ? <Chip tone="sky">{t('fired.mix.key', { n: e.v.key })}</Chip> : null}
                    {e.v.sticky ? <Chip tone="pink">{t('fired.mix.sticky', { n: e.v.sticky })}</Chip> : null}
                  </>
                }
              />
            ))}
          </Rows>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>
        )}
        {total > rows.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: total - rows.length })}</p>}
      </Fold>
      <p className="px-1 text-caption text-muted-foreground">{t('fired.constantNote')}</p>
    </>
  )
}

export function ChronLast({ all, t }: { all: FiredAll; t: T }) {
  const lit = all.trace.litopys
  if (!lit) return <Notice title={t('fired.chron.noneTitle')}>{t(all.trace.unavailable ? 'memtrace.unavailable' : 'memtrace.noLitopys')}</Notice>
  return (
    <>
      <Summary lit={lit} older={false} t={t} />
      <LitopysFolds lit={lit} t={t} />
    </>
  )
}

export function ChronChat({ lit, t, date }: { lit: LitFired; t: T; date: (ts: number) => string }) {
  return (
    <>
      <Counted replies={lit.replies} since={lit.since} t={t} date={date} />
      <Fold id="fired.chat.facts" title={t('fired.chat.facts')} icon={Scroll} tone="emerald" count={lit.factsTotal} defaultOpen>
        {lit.facts.length ? (
          <Rows>
            {lit.facts.map((f) => (
              <CountRow
                tone="emerald"
                key={f.id}
                title={f.gone ? <span className="italic text-muted-foreground">{t('memtrace.removed')}</span> : f.text}
                sub={<>{f.id} · {t('memtrace.known')}: <Who people={f.by} t={t} /></>}
                n={f.n}
                replies={lit.replies}
                ago={repliesAgo(lit, f.at)}
                t={t}
              />
            ))}
          </Rows>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>
        )}
        {lit.factsTotal > lit.facts.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: lit.factsTotal - lit.facts.length })}</p>}
      </Fold>
      <Fold id="fired.chat.chapters" title={t('fired.chat.chapters')} icon={Scroll} tone="violet" count={lit.chaptersTotal}>
        {lit.chapters.length ? (
          <Rows>
            {lit.chapters.map((c) => (
              <CountRow
                tone="violet"
                key={c.id}
                title={c.gone ? <span className="italic text-muted-foreground">{t('memtrace.removed')}</span> : <>{c.label ? <strong className="font-semibold">{c.label}: </strong> : null}{c.text}</>}
                sub={`${t('memtrace.chapter')} ${c.id}`}
                n={c.n}
                replies={lit.replies}
                ago={repliesAgo(lit, c.at)}
                t={t}
              />
            ))}
          </Rows>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>
        )}
      </Fold>
      {lit.far && (
        <Fold id="fired.chat.far" title={t('fired.chat.far')} icon={GitMerge} tone="violet" count={lit.far.n}>
          <Rows>
            <CountRow
              tone="violet"
              title={t('fired.far.title', { range: lit.far.first === lit.far.last ? String(lit.far.first) : `${lit.far.first}-${lit.far.last}` })}
              sub={t('memtrace.farBody', { chats: lit.far.chats, turns: lit.far.turns, facts: lit.far.facts, units: lit.far.units, tokens: lit.far.tokens })}
              n={lit.far.n}
              replies={lit.replies}
              ago={repliesAgo(lit, lit.far.at)}
              t={t}
            />
          </Rows>
        </Fold>
      )}
    </>
  )
}

export function BankLast({ all, t }: { all: FiredAll; t: T }) {
  return <DatabankFold trace={all.trace} t={t} />
}

export function BankChat({ log, t, date }: { log: FiredLog; t: T; date: (ts: number) => string }) {
  const rows = topBank(log)
  const total = Object.keys(log.bank).length
  return (
    <>
      <Counted replies={log.replies} since={log.since} t={t} date={date} />
      <Fold id="fired.chat.bank" title={t('fired.chat.bank')} icon={Database} tone="teal" count={total} defaultOpen>
        {rows.length ? (
          <Rows>
            {rows.map(({ id, e }) => (
              <CountRow
                tone="teal"
                key={id}
                title={<>{e.f} <span className="text-caption font-normal text-muted-foreground">#{e.p}</span></>}
                sub={e.best ? t('fired.bank.best', { n: e.best }) : t('fired.bank.passage')}
                n={e.n}
                replies={log.replies}
                ago={repliesAgo(log, e.at)}
                t={t}
              />
            ))}
          </Rows>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t('fired.none')}</p>
        )}
        {total > rows.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: total - rows.length })}</p>}
      </Fold>
    </>
  )
}

/** Vectors: the state of what "by meaning" compares (the chat's facts, the Data Bank), and which source used it for the last reply. */
export function VectorsTab({ chatId, all, refreshKey, t }: { chatId: string; all: FiredAll | null; refreshKey: number; t: T }) {
  const lit = all?.trace.litopys ?? null
  const db = all?.trace.databank ?? null
  const sem = lit ? semVerdict(lit.sem) : null
  const litLine = !lit ? t('fired.vec.noReply')
    : !sem ? t('fired.vec.unknown')
    : sem.kind === 'yes' ? t('memtrace.semYes', { have: sem.have, seen: sem.seen })
    : sem.kind === 'few' ? t('memtrace.semFew', { have: sem.have, seen: sem.seen })
    : t(`memtrace.semNo.${sem.why}` as MsgKey)
  const bankLine = !db ? t('fired.vec.noReply') : db.off ? t('memtrace.dbOff') : db.sem && db.sem.seen > 0 ? (db.sem.ranked && db.sem.have > 0 ? t('memtrace.dbSem', { have: db.sem.have, seen: db.sem.seen }) : t('memtrace.dbNoSem')) : t('fired.vec.unknown')
  const byMeaning = all?.log.data?.last?.fired.filter((r) => r.via === 'vector').length ?? null
  const loreLine = byMeaning === null ? t('fired.vec.noReply') : byMeaning > 0 ? t('fired.vec.loreYes', { n: byMeaning }) : t('fired.vec.loreNo')
  return (
    <>
      <p className="px-1 text-sm text-muted-foreground">{t('fired.vec.intro')}</p>
      <MeaningCard chatId={chatId} refreshKey={refreshKey} />
      <MeaningCard shelf refreshKey={refreshKey} />
      <Fold id="fired.vec.last" title={t('fired.vec.last')} icon={LinkSimple} tone="emerald" summary={t('fired.vec.lastSum')} defaultOpen>
        <Rows>
          <li className="px-3 py-2 text-sm"><span className="font-medium">{t('fired.tab.lore')}:</span> {loreLine}</li>
          <li className="px-3 py-2 text-sm"><span className="font-medium">{t('fired.tab.chron')}:</span> {litLine}</li>
          <li className="px-3 py-2 text-sm"><span className="font-medium">{t('fired.tab.bank')}:</span> {bankLine}</li>
        </Rows>
      </Fold>
    </>
  )
}
