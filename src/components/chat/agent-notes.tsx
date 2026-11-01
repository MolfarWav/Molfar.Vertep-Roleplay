import { useMemo } from 'react'
import { Robot } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { nameOf, useAgentsLive, type AgentRun } from '@/lib/agents'
import { ChoiceChips } from './agent-panels'
import type { Message } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Places a note shows under the reply (`feed` as a plain line, the others as a card); the other places (bars, the floating panel) are drawn elsewhere. */
const NOTE_PLACES = new Set<string | undefined>([undefined, 'note', 'feed'])
/** A short note opens by itself; a long one shows its first line. */
const OPEN_BELOW = 240

/**
 * What the chat's agents left for one reply: their notes as cards that fold, and one muted line that says who ran
 * (so an agent that did nothing is not invisible). Not a message: it lives in the plugin's run file, never goes to
 * the model and never into an export. A regenerated or swiped reply has its own runs.
 */
export function AgentNotes({ chatId, message, last }: { chatId: string; message: Message; last?: boolean }) {
  const t = useT()
  const all = useAgentsLive((s) => s.runs[chatId])
  // the person switched every agent's notes off: the run line below still says who ran
  const silent = useAgentsLive((s) => s.silentNotes)
  const key = `${message.id}#${message.activeSwipe}`
  const runs = useMemo(() => {
    const latest = new Map<string, AgentRun>()
    for (const r of all ?? []) if (r.key === key && (!latest.has(r.agent) || latest.get(r.agent)!.at <= r.at)) latest.set(r.agent, r)
    return [...latest.values()]
  }, [all, key])
  if (message.role !== 'assistant' || !runs.length) return null

  const notes = silent ? [] : runs.flatMap((r) => (r.status === 'ok' ? (r.outputs ?? []).filter((o) => o.kind === 'note' && o.text && NOTE_PLACES.has(o.show)).map((o) => ({ r, o })) : []))
  const cards = notes.filter(({ o }) => o.show !== 'feed')
  const lines = notes.filter(({ o }) => o.show === 'feed')
  const failed = runs.filter((r) => r.status === 'failed').length

  return (
    <div className="flex flex-col gap-1 px-4 py-1" data-testid="agent-notes">
      {lines.map(({ r, o }, i) => (
        <p key={`${r.agent}-line-${i}`} className="flex items-baseline gap-1.5 text-[11px] leading-relaxed text-muted-foreground" data-testid="agent-feed-line">
          <Robot className="size-3 shrink-0 translate-y-0.5 text-violet-500" aria-hidden="true" />
          <span><span className="font-medium text-foreground/80">{o.title || nameOf(r.agent)}</span>{' · '}{(o.short || o.text || '').slice(0, 280)}</span>
        </p>
      ))}
      {cards.map(({ r, o }, i) => (
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
                {last && r.status === 'ok' && (r.outputs ?? []).filter((o) => o.kind === 'choices' && o.show === 'log' && o.choices?.length).map((o, k) => (
                  <div key={k} className="mt-1"><ChoiceChips chatId={chatId} set={{ agent: r.agent, choices: o.choices! }} /></div>
                ))}
              </li>
            )
          })}
        </ul>
      </details>
    </div>
  )
}
