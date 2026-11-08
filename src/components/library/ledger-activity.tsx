import { useMemo, useState } from 'react'
import { ArrowCounterClockwise, Eye, Trophy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useT, useRelativeTime } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { LitActivity, LitActivityKind, LitChat } from './litopys-api'
import { removeLitTurn } from './litopys-api'
import { canUndoFoundTurn } from './turns-util'
import type { TabProps } from './ledger-facts'
import { UndoAuto, canUndo } from './ledger-proposals'
import type { MsgKey } from '@/lib/i18n'

type Filter = 'all' | 'user' | 'litopys'

const opKeys: Record<string, MsgKey> = {
  merge: 'lit.op.merge',
  retire: 'lit.op.retire',
  rewrite: 'lit.op.rewrite',
  pin: 'lit.op.pin',
}

const byKeys: Record<string, MsgKey> = {
  user: 'lit.by.user',
  worker: 'lit.by.worker',
  rebuild: 'lit.by.rebuild',
  sweep: 'lit.by.sweep',
  notes: 'lit.by.notes',
}

function activityText(a: LitActivity, t: (key: MsgKey, vars?: Record<string, string | number>) => string): string {
  const d = a.data ?? {}
  const text = typeof d.text === 'string' ? d.text : ''
  const label = typeof d.label === 'string' ? d.label : ''
  const num = (v: unknown) => (typeof v === 'number' ? v : '')
  const from = num(d.from)
  const to = num(d.to)
  const facts = num(d.facts)
  const proposals = num(d.proposals)
  const n = num(d.n)
  const error = typeof d.error === 'string' ? d.error : ''
  const op = typeof d.op === 'string' ? t(opKeys[d.op] ?? 'lit.op.merge') : ''
  const keepGone = d.keepGone === true

  switch (a.kind as LitActivityKind) {
    case 'fact.add': return t('lit.act.factAdd', { text })
    case 'fact.edit': return t('lit.act.factEdit', { text })
    case 'fact.pin':
      return typeof d.replaced === 'string' ? t('lit.act.factPinReplace', { text, replaced: d.replaced }) : t('lit.act.factPin', { text })
    case 'fact.unpin': return t('lit.act.factUnpin', { text })
    case 'fact.retire': return t('lit.act.factRetire', { text })
    case 'fact.restore': return t('lit.act.factRestore', { text })
    case 'fact.delete': return t('lit.act.factDelete', { text })
    case 'turn.add':
      // the server writes one kind for all three: the worker found it, the user marked a chapter, the user wrote it
      return a.by === 'worker' ? t('lit.act.turnFound', { text }) : a.text.startsWith('Marked') ? t('lit.act.turnMark', { text }) : t('lit.act.turnAdd', { text })
    case 'turn.edit': return t('lit.act.turnEdit', { text })
    case 'turn.remove': return t('lit.act.turnRemove', { text })
    case 'turn.undo': return a.text.startsWith('Put back') ? t('lit.act.turnPutBack', { text }) : t('lit.act.turnUndo', { text })
    case 'turn.stance': return t('lit.act.turnStance', { who: typeof d.who === 'string' ? d.who : '', line: typeof d.line === 'string' ? d.line : '' })
    case 'turn.accept': return t('lit.act.turnAccept', { text })
    case 'turn.dismiss': return t('lit.act.turnDismiss', { text })
    case 'chapter.edit': return t('lit.act.chapterEdit', { label })
    case 'chapter.rewrite': return t('lit.act.chapterRewrite', { label })
    case 'chapter.delete': return keepGone ? t('lit.act.chapterDeleteKept', { label }) : t('lit.act.chapterDelete', { label })
    case 'chapter.write':
      return d.rewrite === true ? t('lit.act.chapterRewrote', { label, from, to }) : t('lit.act.chapterWrite', { label, from, to, facts, proposals })
    case 'proposal.accept': return t('lit.act.proposalAccept', { op, text })
    case 'proposal.reject': return t('lit.act.proposalReject', { op, text })
    case 'proposal.auto': return t('lit.act.proposalAuto', { op, text })
    case 'proposal.undo': return t('lit.act.proposalUndo', { op, text })
    case 'worker.fail': return t('lit.act.workerFail', { error })
    case 'import': return t('lit.act.import', { n })
    case 'notes.move': return t('lit.act.notesMove', { n })
    case 'belief.move': return t('lit.act.beliefMove', { n })
    case 'belief.end': return t('lit.act.beliefEnd', { n })
    case 'rebuild.start': return t('lit.act.rebuildStart')
    case 'rebuild.finish': return t('lit.act.rebuildFinish', { chapters: num(d.chapters), facts })
    case 'arc.ask': return t('lit.act.arcAsk', { n: num(d.chapters) })
    case 'arc.write':
      return d.rewrite === true
        ? t('lit.act.arcWriteRewrite', { label })
        : t('lit.act.arcWrite', { n: num(d.chapters), label, from, to })
    case 'arc.rewrite': return t('lit.act.arcRewrite', { label })
    case 'arc.delete': return t('lit.act.arcDelete', { label })
    case 'arc.drop': return t('lit.act.arcDrop', { label })
    case 'arc.fail': return t('lit.act.arcFail', { error })
    case 'scene.mark': return t('lit.act.sceneMark', { from: num(d.fromNo), to: num(d.toNo) })
    case 'scene.unmark': return t('lit.act.sceneUnmark')
    case 'chat.config': return d.cleared === true ? t('lit.act.chatConfigCleared') : t('lit.act.chatConfig')
    case 'habit.seen': return t('lit.act.habitSeen', { who: typeof d.who === 'string' ? d.who : '', name: typeof d.name === 'string' ? d.name : '' })
    case 'habit.earn': return t('lit.act.habitEarn', { who: typeof d.who === 'string' ? d.who : '', name: typeof d.name === 'string' ? d.name : '' })
    case 'habit.accept': return t('lit.act.habitAccept', { who: typeof d.who === 'string' ? d.who : '', name: typeof d.name === 'string' ? d.name : '' })
    case 'consolidate.ask': return d.auto === true ? t('lit.act.consolidateAuto', { n: num(d.facts) }) : t('lit.act.consolidateAsk', { n: num(d.facts) })
    case 'consolidate.done': return Number(d.proposed) > 0 ? t('lit.act.consolidateDone', { n: num(d.proposed) }) : t('lit.consolidate.nothing')
    case 'consolidate.fail': return t('lit.act.consolidateFail', { error })
    default: return a.text
  }
}

/** Undo for a turning point the worker found: it is taken out again, and whatever it undid is active again. */
function UndoFoundTurn({ chat, turnId, onChat, onRefresh }: { chat: LitChat; turnId: string; onChat: (c: LitChat) => void; onRefresh: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      onChat(await removeLitTurn(chat.chatId, turnId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="outline" className="min-h-10 md:min-h-8" disabled={busy} onClick={() => void run()} data-testid="turn-undo-found">
      <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
      {t('lit.undo')}
    </Button>
  )
}

/** A small icon for the rows about habits (the other rows have none): a glance tells a habit seen from a habit earned. */
function HabitIcon({ kind }: { kind: string }) {
  const cls = 'size-4 shrink-0 text-violet-700 dark:text-violet-300'
  if (kind === 'habit.earn' || kind === 'habit.accept') return <Trophy className={cls} weight="fill" aria-hidden="true" />
  if (kind === 'habit.seen') return <Eye className={cls} aria-hidden="true" />
  return null
}

export function ActivityTab({ chat, onChat, onRefresh }: TabProps) {
  const t = useT()
  const rel = useRelativeTime()
  const [filter, setFilter] = useState<Filter>('all')

  const activities = useMemo(() => {
    const sorted = [...chat.activity].sort((a, b) => b.at - a.at)
    if (filter === 'all') return sorted
    if (filter === 'user') return sorted.filter((a) => a.by === 'user')
    return sorted.filter((a) => a.by !== 'user')
  }, [chat.activity, filter])

  const filters: { key: Filter; label: MsgKey }[] = [
    { key: 'all', label: 'lit.actAll' },
    { key: 'user', label: 'lit.actYours' },
    { key: 'litopys', label: 'lit.actLitopys' },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'min-h-9 rounded-md border px-2.5 text-xs transition-colors',
              filter === key
                ? 'border-primary/50 bg-accent text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent/50'
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('lit.noActivity')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {activities.map((a, i) => (
            <li
              key={`${a.at}-${i}`}
              data-testid="activity-row"
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span
                  className="text-muted-foreground"
                  title={new Date(a.at).toLocaleString()}
                >
                  {rel(a.at)}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {t(byKeys[a.by] ?? 'lit.by.worker')}
                </Badge>
                <HabitIcon kind={a.kind} />
                <span className="text-sm break-words">{activityText(a, t)}</span>
                {a.kind === 'proposal.auto' && (() => {
                  const p = chat.proposals.find((x) => x.id === a.ids[0])
                  return canUndo(p) ? <span className="ml-auto"><UndoAuto chat={chat} proposal={p} onChat={onChat} onRefresh={onRefresh} /></span> : null
                })()}
                {a.kind === 'turn.add' && a.by === 'worker' && (() => {
                  const turn = (chat.turns ?? []).find((x) => x.id === a.ids[0])
                  return canUndoFoundTurn(turn) ? <span className="ml-auto"><UndoFoundTurn chat={chat} turnId={turn.id} onChat={onChat} onRefresh={onRefresh} /></span> : null
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
