import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, Copy, Database, Eye, EyeSlash, Heartbeat, Scroll } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import {
  buildReport,
  chaptersIn,
  chaptersOut,
  factsIn,
  factsOut,
  type MemoryTrace,
  type TraceChapter,
  type TraceFact,
  type TracePerson,
} from '@/lib/memory-trace'
import { loadMemoryTrace } from '@/lib/memory-trace-load'
import type { MsgKey } from '@/lib/i18n'

/** The memory trace of a chat's last reply (#184 P6): what went into the prompt from memory, what stayed out and why. */
export function MemoryTraceView({ chatId, title }: { chatId: string; title: string }) {
  const t = useT()
  const ago = useRelativeTime()
  const [trace, setTrace] = useState<MemoryTrace | null>(null)
  const [loading, setLoading] = useState(false)
  // a late answer for a chat that is no longer on screen must not fill the view of the new one (as the board does, #39)
  const live = useRef(chatId)
  live.current = chatId

  const load = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        const next = await loadMemoryTrace(id)
        if (live.current === id) setTrace(next)
      } catch {
        if (live.current === id) toast.error(t('memtrace.loadFailed'))
      } finally {
        if (live.current === id) setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    setTrace(null)
    void load(chatId)
  }, [chatId, load])

  const copy = async () => {
    if (!trace) return
    try {
      await navigator.clipboard.writeText(buildReport(title, trace))
      toast.success(t('memtrace.copied'))
    } catch {
      toast.error(t('memtrace.copyFailed'))
    }
  }

  const lit = trace?.litopys ?? null
  const hasAnything = !!trace && (lit || trace.databank || trace.leaks.length > 0 || trace.keptOut)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="memory-trace">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{lit ? t('memtrace.when', { when: ago(lit.at) }) : t('memtrace.intro')}</p>
        <Button variant="outline" size="sm" onClick={() => void load(chatId)} disabled={loading} className="min-h-10 sm:min-h-8">
          <ArrowClockwise className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          {t('memtrace.refresh')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!trace || !hasAnything} className="min-h-10 sm:min-h-8">
          <Copy className="h-4 w-4" aria-hidden="true" />
          {t('memtrace.copy')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {trace === null ? (
            <TraceSkeleton />
          ) : trace.unavailable ? (
            <Note>{t('memtrace.unavailable')}</Note>
          ) : !hasAnything ? (
            <Note title={t('memtrace.emptyTitle')}>{t('memtrace.emptyBody')}</Note>
          ) : (
            <>
              {lit && <Summary lit={lit} t={t} />}
              {lit ? <LitopysFolds lit={lit} t={t} /> : <Note>{t('memtrace.noLitopys')}</Note>}
              <DatabankFold trace={trace} t={t} />
              <AfterFold trace={trace} t={t} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type T = (key: MsgKey, vars?: Record<string, string | number>) => string

function Note({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      {title && <p className="mb-1 text-body font-semibold">{title}</p>}
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function TraceSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

function Chip({ tone, children }: { tone: ToneName; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-caption font-medium', TONES[tone].chip)}>{children}</span>
}

function Who({ people, t }: { people: 'all' | TracePerson[]; t: T }) {
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

function WhyChips({ why, rank, t }: { why: string; rank?: number; t: T }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      {rank ? <Chip tone="slate">#{rank}</Chip> : null}
      <Chip tone={WHY_TONE[why] ?? 'slate'}>{t(whyKey(why))}</Chip>
    </span>
  )
}

function FactRow({ f, t }: { f: TraceFact; t: T }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-3 break-words text-body', f.gone && 'italic text-muted-foreground')}>{f.gone ? t('memtrace.removed') : f.text}</p>
        <p className="mt-0.5 break-words text-caption text-muted-foreground">
          {f.id} · {t('memtrace.known')}: <Who people={f.by} t={t} />
        </p>
      </div>
      <WhyChips why={f.why} rank={f.rank} t={t} />
    </li>
  )
}

function ChapterRow({ c, t }: { c: TraceChapter; t: T }) {
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

function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? <ul className="divide-y divide-border">{children}</ul> : <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
}

function Summary({ lit, t }: { lit: NonNullable<MemoryTrace['litopys']>; t: T }) {
  const pct = lit.limit > 0 ? Math.min(100, Math.round((lit.tokens / lit.limit) * 100)) : 0
  return (
    <div className="rounded-xl border border-border bg-card p-3" data-testid="memory-trace-summary">
      <p className="text-body font-semibold">
        {lit.speaker ? t('memtrace.speaks', { name: lit.speaker.name, op: lit.op || 'send' }) : t('memtrace.several', { op: lit.op || 'send' })}
        {lit.speaker?.id && <code className="ml-1.5 rounded bg-muted px-1 text-caption font-normal text-foreground/70">{lit.speaker.id}</code>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{lit.one ? t('memtrace.filterOne', { name: lit.speaker?.name ?? '' }) : t('memtrace.filterMany')}</p>
      <div className="mt-3">
        <div className="flex items-center justify-between text-caption text-muted-foreground">
          <span>{t('memtrace.budget', { used: lit.tokens, limit: lit.limit })}</span>
          <span>{lit.full ? t('memtrace.allFit') : t('memtrace.ranked')}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('memtrace.budget', { used: lit.tokens, limit: lit.limit })}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function LitopysFolds({ lit, t }: { lit: NonNullable<MemoryTrace['litopys']>; t: T }) {
  const inF = factsIn(lit)
  const sp = factsOut(lit, 'speaker')
  const bu = factsOut(lit, 'budget')
  const chIn = chaptersIn(lit)
  const chOut = chaptersOut(lit)
  const hidden = lit.n.hidden ?? sp.length
  const drop = lit.n.drop ?? bu.length
  return (
    <>
      <Fold id="memtrace.in" title={t('memtrace.foldIn')} icon={Eye} tone="emerald" summary={t('memtrace.facts', { n: lit.n.inF ?? inF.length })} defaultOpen>
        <Rows empty={t('memtrace.none')}>{inF.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {(lit.n.inF ?? 0) > inF.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: (lit.n.inF ?? 0) - inF.length })}</p>}
      </Fold>
      <Fold id="memtrace.speaker" title={t('memtrace.foldSpeaker')} icon={EyeSlash} tone="amber" summary={t('memtrace.facts', { n: hidden })} defaultOpen={hidden > 0}>
        <Rows empty={t('memtrace.none')}>{sp.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {hidden > sp.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: hidden - sp.length })}</p>}
      </Fold>
      <Fold id="memtrace.budget" title={t('memtrace.foldBudget')} icon={EyeSlash} tone="slate" summary={t('memtrace.facts', { n: drop })}>
        <Rows empty={t('memtrace.none')}>{bu.map((f) => <FactRow key={f.id} f={f} t={t} />)}</Rows>
        {drop > bu.length && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: drop - bu.length })}</p>}
      </Fold>
      <Fold id="memtrace.chapters" title={t('memtrace.foldChapters')} icon={Scroll} tone="violet" summary={t('memtrace.chapterCounts', { a: chIn.length, b: chOut.length })}>
        <Rows empty={t('memtrace.none')}>{[...chIn, ...chOut].map((c) => <ChapterRow key={`${c.state}:${c.id}`} c={c} t={t} />)}</Rows>
      </Fold>
    </>
  )
}

function DatabankFold({ trace, t }: { trace: MemoryTrace; t: T }) {
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
                <Chip tone="amber">{t('memtrace.dbScope', { scope: s.scope })}</Chip>
              </li>
            )),
          ]}
        </Rows>
      )}
      {db && db.scopedMore > 0 && rows > 0 && <p className="px-3 pb-2 text-caption text-muted-foreground">{t('memtrace.more', { n: db.scopedMore })}</p>}
    </Fold>
  )
}

function AfterFold({ trace, t }: { trace: MemoryTrace; t: T }) {
  const n = trace.leaks.length + (trace.keptOut ? 1 : 0)
  return (
    <Fold id="memtrace.after" title={t('memtrace.foldAfter')} icon={Heartbeat} tone="sky" summary={n ? t('memtrace.flagged', { n }) : t('memtrace.nothing')} defaultOpen={n > 0}>
      {n === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('memtrace.nothing')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {trace.keptOut && (
            <li className="px-3 py-2 text-body">{t('memtrace.keptOut', { user: trace.keptOut.user, absent: trace.keptOut.absent })}</li>
          )}
          {trace.leaks.map((l) => (
            <li key={`${l.key}:${l.factId}:${l.who}`} className="px-3 py-2">
              <p className="break-words text-body">{t('memtrace.leak', { who: l.who })}</p>
              <p className="mt-0.5 break-words text-caption text-muted-foreground">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  )
}

