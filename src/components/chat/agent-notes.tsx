import { useMemo } from 'react'
import { Robot } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { nameOf, useAgentsLive, type AgentRun } from '@/lib/agents'
import type { Message } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Places a note shows under the reply; the other places (bars, the floating panel) are drawn elsewhere. */
const NOTE_PLACES = new Set<string | undefined>([undefined, 'note', 'feed'])
/** A short note opens by itself; a long one shows its first line. */
const OPEN_BELOW = 240

/**
 * What the chat's agents left for one reply: their notes as cards that fold, and one muted line that says who ran
 * (so an agent that did nothing is not invisible). Not a message: it lives in the plugin's run file, never goes to
 * the model and never into an export. A regenerated or swiped reply has its own runs.
 */
export function AgentNotes({ chatId, message }: { chatId: string; message: Message }) {
  const t = useT()
  const all = useAgentsLive((s) => s.runs[chatId])
  const key = `${message.id}#${message.activeSwipe}`
  const runs = useMemo(() => {
    const latest = new Map<string, AgentRun>()
    for (const r of all ?? []) if (r.key === key && (!latest.has(r.agent) || latest.get(r.agent)!.at <= r.at)) latest.set(r.agent, r)
    return [...latest.values()]
  }, [all, key])
  if (message.role !== 'assistant' || !runs.length) return null

  const notes = runs.flatMap((r) => (r.status === 'ok' ? (r.outputs ?? []).filter((o) => o.kind === 'note' && o.text && NOTE_PLACES.has(o.show)).map((o) => ({ r, o })) : []))
  const failed = runs.filter((r) => r.status === 'failed').length

  return (
    <div className="flex flex-col gap-1 px-4 py-1" data-testid="agent-notes">
      {notes.map(({ r, o }, i) => (
        <details key={`${r.agent}-${i}`} open={(o.text?.length ?? 0) <= OPEN_BELOW} className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">
            <span className="font-medium text-foreground">{o.title || nameOf(r.agent)}</span>
            {o.short ? <span> · {o.short}</span> : null}
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{o.text}</p>
        </details>
      ))}
      <details className="text-[10px] text-muted-foreground">
        <summary className={cn('flex cursor-pointer select-none items-center gap-1', failed > 0 && 'text-amber-600 dark:text-amber-400')}>
          <Robot className="size-3" aria-hidden="true" />
          {t('ag.log', { n: runs.length })}{failed > 0 ? ` · ${t('ag.log.failed', { n: failed })}` : ''}
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5 pl-4">
          {runs.map((r) => {
            const refused = r.refused?.length ?? 0
            return (
              <li key={r.agent}>
                <span className="text-foreground/80">{nameOf(r.agent)}</span>
                {' · '}
                {r.status === 'failed'
                  ? t('ag.failed', { why: r.reason ?? '?' })
                  : t('ag.log.ok', { ms: r.ms, calls: r.calls ?? 0, changes: r.writes?.length ?? 0 })}
                {refused > 0 ? ` · ${t('ag.log.refused', { n: refused })}` : ''}
              </li>
            )
          })}
        </ul>
      </details>
    </div>
  )
}
