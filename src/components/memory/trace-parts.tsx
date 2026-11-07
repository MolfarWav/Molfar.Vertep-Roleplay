import type { ReactNode } from 'react'
import { Database, Eye, EyeSlash, Quotes, Scroll } from '@phosphor-icons/react'
import { Fold } from '@/components/ui/fold'
import { TONES, type ToneName } from '@/components/ui/tone'
import { cn } from '@/lib/utils'
import {
  chaptersIn,
  chaptersOut,
  factsIn,
  factsOut,
  type MemoryTrace,
  type TraceChapter,
  type TraceFact,
  type TracePerson,
  type TraceVerbatim,
  verbatimIn,
} from '@/lib/memory-trace'
import { semVerdict } from '@/lib/vectors'
import type { MsgKey } from '@/lib/i18n'

// The rows and folds of the memory trace (#184 P6), shared by Canvas > Prompt > Memory and the chat's "What fired" panel (#253):
// one piece of code, so the two views cannot drift apart.

export type T = (key: MsgKey, vars?: Record<string, string | number>) => string

export function Chip({ tone, children }: { tone: ToneName; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-caption font-medium', TONES[tone].chip)}>{children}</span>
}

export function Who({ people, t }: { people: 'all' | TracePerson[]; t: T }) {
  if (people === 'all') return <>{t('memtrace.everyone')}</>
  if (!people.length) return <>{t('memtrace.nobody')}</>
  return (
    <>
      {people.map((p, i) => (
        <span key={`${p.id}:${p.name}`}>
          {i > 0 && ', '}
          {p.name}
          {p.id && <code className="ml-1 rounded bg-muted px-1 text-caption text-foreground/70">{p.id}</code>}
        </span>
      ))}
    </>
  )
}

const WHY_TONE: Record<string, ToneName> = { pin: 'violet', change: 'violet', trait: 'violet', rank: 'emerald', cause: 'sky', bridge: 'emerald', arc: 'emerald', speaker: 'amber', unseen: 'amber', budget: 'slate' }
const whyKey = (why: string): MsgKey => `memtrace.why.${why}` as MsgKey

export function WhyChips({ why, rank, t }: { why: string; rank?: number; t: T }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      {rank ? <Chip tone="slate">#{rank}</Chip> : null}
      <Chip tone={WHY_TONE[why] ?? 'slate'}>{t(whyKey(why))}</Chip>
    </span>
  )
}

export function FactRow({ f, t }: { f: TraceFact; t: T }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-3 break-words text-body', f.gone && 'italic text-muted-foreground')}>{f.gone ? t('memtrace.removed') : f.text}</p>
        <p className="mt-0.5 break-words text-caption text-muted-foreground">
          {f.id} · {t('memtrace.known')}: <Who people={f.by} t={t} />
          {f.type === 'belief' && <> · <span data-testid="trace-belief">{t('lit.type.belief')}</span></>}
        </p>
      </div>
      <WhyChips why={f.why} rank={f.rank} t={t} />
    </li>
  )
}

export function ChapterRow({ c, t }: { c: TraceChapter; t: T }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-3 break-words text-body', c.gone && 'italic text-muted-foreground')}>
          {c.gone ? t('memtrace.removed') : c.label ? <strong className="font-semibold">{c.label}: </strong> : null}
          {c.gone ? null : c.text}
        </p>
        <p className="mt-0.5 break-words text-caption text-muted-foreground">
          {c.arc ? t('memtrace.arc') : t('memtrace.chapter')} {c.id}
          {c.cast.length > 0 && (
            <>
              {' · '}
              {t('memtrace.cast')}: <Who people={c.cast} t={t} />
            </>
          )}
        </p>
      </div>
      <WhyChips why={c.why} rank={c.rank} t={t} />
    </li>
  )
}

export function VerbatimRow({ v, t }: { v: TraceVerbatim; t: T }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3" data-testid="trace-verbatim-row">
      <div className="min-w-0 flex-1">
        <p className="break-words text-body font-semibold">{v.title || v.chat}</p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">{v.text}</p>
      </div>
      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Chip tone="sky">{t('memtrace.verbatimShares', { n: v.words })}</Chip>
      </span>
    </li>
  )
}

export function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? <ul className="divide-y divide-border">{children}</ul> : <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
}

export function Summary({ lit, older, t }: { lit: NonNullable<MemoryTrace['litopys']>; older: boolean; t: T }) {
  const pct = lit.limit > 0 ? Math.min(100, Math.round((lit.tokens / lit.limit) * 100)) : 0
  return (
    <div className="rounded-xl border border-border bg-card p-3" data-testid="memory-trace-summary">
      <p className="text-body font-semibold">
        {lit.speaker ? t(older ? 'memtrace.speaksEarlier' : 'memtrace.speaks', { name: lit.speaker.name }) : t(older ? 'memtrace.severalEarlier' : 'memtrace.several')}
        {lit.speaker?.id && <code className="ml-1.5 rounded bg-muted px-1 text-caption font-normal text-foreground/70">{lit.speaker.id}</code>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{lit.one ? t('memtrace.filterOne', { name: lit.speaker?.name ?? '' }) : t('memtrace.filterMany')}</p>
      <p className="mt-1 text-sm">{t('memtrace.counts', { a: lit.n.inF ?? 0, b: lit.n.hidden ?? 0, c: lit.n.drop ?? 0 })}</p>
      <SemLine lit={lit} t={t} />
      <div className="mt-3">
        <div className="flex items-center justify-between text-caption text-muted-foreground">
          <span>{t('memtrace.budget', { used: lit.tokens, limit: lit.limit })}</span>
          <span>{lit.full ? t('memtrace.allFit') : t('memtrace.ranked')}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('memtrace.budget', { used: lit.tokens, limit: lit.limit })}>
          <div className={cn('h-full rounded-full', TONES.slate.square)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

/** Was this reply ranked by meaning, and if not why: tells "the answer was missing" from "meaning search was off". */
export function SemLine({ lit, t }: { lit: NonNullable<MemoryTrace['litopys']>; t: T }) {
  const v = semVerdict(lit.sem)
  if (!v) return null
  const text =
    v.kind === 'yes' ? t('memtrace.semYes', { have: v.have, seen: v.seen })
    : v.kind === 'few' ? t('memtrace.semFew', { have: v.have, seen: v.seen })
    : t(`memtrace.semNo.${v.why}` as MsgKey)
  return <p className={cn('mt-1 text-sm', v.kind === 'yes' ? 'text-foreground' : 'text-muted-foreground')} data-testid="memory-trace-sem">{text}</p>
}

export function LitopysFolds({ lit, t }: { lit: NonNullable<MemoryTrace['litopys']>; t: T }) {
  const inF = factsIn(lit)
  const sp = factsOut(lit, 'speaker')
  const bu = factsOut(lit, 'budget')
  const chIn = chaptersIn(lit)
  const chOut = chaptersOut(lit)
  const hidden = lit.n.hidden ?? sp.length
  const drop = lit.n.drop ?? bu.length
  const vb = verbatimIn(lit)
  return (
    <>
      <Fold id="memtrace.in" title={t('memtrace.foldIn')} icon={Eye} tone="emerald" summary={String(lit.n.inF ?? inF.length)} defaultOpen>
        <Rows empty={t('memtrace.none')}>{inF.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {(lit.n.inF ?? 0) > inF.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: (lit.n.inF ?? 0) - inF.length })}</p>}
      </Fold>
      <Fold id="memtrace.speaker" title={t('memtrace.foldSpeaker')} icon={EyeSlash} tone="amber" summary={String(hidden)} defaultOpen={hidden > 0}>
        <Rows empty={t('memtrace.none')}>{sp.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {hidden > sp.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: hidden - sp.length })}</p>}
      </Fold>
      <Fold id="memtrace.budget" title={t('memtrace.foldBudget')} icon={EyeSlash} tone="slate" summary={String(drop)}>
        <Rows empty={t('memtrace.none')}>{bu.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {drop > bu.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: drop - bu.length })}</p>}
      </Fold>
      <Fold id="memtrace.chapters" title={t('memtrace.foldChapters')} icon={Scroll} tone="violet" summary={t('memtrace.chapterCounts', { a: chIn.length, b: chOut.length })}>
        <Rows empty={t('memtrace.none')}>{[...chIn, ...chOut].map((c) => <ChapterRow key={`${c.state}:${c.id}`} c={c} t={t} />)}</Rows>
      </Fold>
      {vb.length > 0 && (
        <Fold id="memtrace.verbatim" title={t('memtrace.foldVerbatim')} icon={Quotes} tone="sky" summary={String(vb.length)} defaultOpen>
          <Rows empty={t('memtrace.none')}>{vb.map((v, i) => <VerbatimRow key={`${v.chat}:${i}`} v={v} t={t} />)}</Rows>
        </Fold>
      )}
    </>
  )
}

export function DatabankFold({ trace, t }: { trace: MemoryTrace; t: T }) {
  const db = trace.databank
  const rows = db ? db.hits.length + db.scoped.length : 0
  return (
    <Fold id="memtrace.databank" title={t('memtrace.foldDatabank')} icon={Database} tone="teal" summary={db ? (db.off ? t('memtrace.off') : t('memtrace.hits', { n: db.hits.length })) : t('memtrace.noReply')}>
      {!db ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('memtrace.noReply')}</p>
      ) : db.off ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('memtrace.dbOff')}</p>
      ) : (
        <Rows empty={t('memtrace.dbNone')}>
          {[
            ...db.hits.map((h) => (
              <li key={`h:${h.file}:${h.n}`} className="flex items-start gap-3 px-3 py-2">
                <p className="min-w-0 flex-1 break-words text-body">
                  {h.file} <span className="text-muted-foreground">#{h.n}</span>
                </p>
                <Chip tone="slate">{t('memtrace.score', { n: h.score })}</Chip>
                <Chip tone={h.state === 'in' ? 'emerald' : 'slate'}>{h.state === 'in' ? t('memtrace.dbIn') : t('memtrace.dbRoom')}</Chip>
              </li>
            )),
            ...db.scoped.map((s) => (
              <li key={`s:${s.file}`} className="flex items-start gap-3 px-3 py-2">
                <p className="min-w-0 flex-1 break-words text-body">{s.file}</p>
                <Chip tone="amber">{t(s.scope === 'character' ? 'memtrace.dbScopeCharacter' : s.scope === 'chat' ? 'memtrace.dbScopeChat' : 'memtrace.dbScopeOther')}</Chip>
              </li>
            )),
          ]}
        </Rows>
      )}
      {db && !db.off && db.sem && db.sem.seen > 0 && <p className="px-3 pb-2 text-caption text-muted-foreground">{db.sem.ranked && db.sem.have > 0 ? t('memtrace.dbSem', { have: db.sem.have, seen: db.sem.seen }) : t('memtrace.dbNoSem')}</p>}
      {db && !db.off && (db.hidden ?? 0) > 0 && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.dbHidden', { n: db.hidden ?? 0 })}</p>}
      {db && db.scopedMore > 0 && rows > 0 && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: db.scopedMore })}</p>}
    </Fold>
  )
}

