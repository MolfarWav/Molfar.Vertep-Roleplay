import { useMemo, useState } from 'react'
import { CaretDown, Robot } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { fmtValue } from '@/lib/agent-template'
import { nameOf, useAgentsLive, type AgentOutput, type AgentRun } from '@/lib/agents'
import { cn } from '@/lib/utils'
import { ChoiceChips } from './agent-panels'

const openKey = (chatId: string) => `vertep:agents-block-open:${chatId}`
const readOpen = (chatId: string): boolean => {
  try { return localStorage.getItem(openKey(chatId)) === '1' } catch { return false }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** One staged write of a run, as a short line: `mood = 7`, `trust +2`, `inventory + key · 1`. */
export function writeLine(w: unknown): string {
  if (!isObj(w)) return ''
  const field = String(w.field ?? '')
  const item = (x: unknown) => (isObj(x) ? Object.values(x).map(fmtValue).join(' · ') : fmtValue(x))
  switch (w.op) {
    case 'dash.set': case 'own.set': return `${field} = ${fmtValue(w.value)}`
    case 'own.add': { const by = Number(w.by); return `${field} ${by >= 0 ? '+' : '−'}${fmtValue(Math.abs(by))}` }
    case 'list.add': return `${field} + ${item(w.item)}`
    case 'list.update': return `${field} ~ ${item(w.item)}`
    case 'list.remove': return `${field} − ${fmtValue(w.id)}`
    default: return ''
  }
}

/** The newest successful run of each agent the chat mirrors into its block (or its newest failed one, when that is the latest word). */
function useBlockRuns(chatId: string): AgentRun[] {
  const list = useAgentsLive((s) => s.chats[chatId])
  const all = useAgentsLive((s) => s.runs[chatId])
  return useMemo(() => {
    const mirrored = new Set((list?.items ?? []).filter((it) => it.on && it.also).map((it) => it.agent))
    if (!mirrored.size) return []
    const latest = new Map<string, AgentRun>()
    for (const r of all ?? []) if (mirrored.has(r.agent) && (!latest.has(r.agent) || latest.get(r.agent)!.at <= r.at)) latest.set(r.agent, r)
    return (list?.items ?? []).flatMap((it) => (latest.has(it.agent) ? [latest.get(it.agent)!] : []))
  }, [list, all])
}

function Result({ chatId, run }: { chatId: string; run: AgentRun }) {
  const t = useT()
  const silent = useAgentsLive((s) => s.silentNotes)
  const outs: AgentOutput[] = run.status === 'ok' ? run.outputs ?? [] : []
  const writes = run.status === 'ok' ? (run.writes ?? []).map(writeLine).filter(Boolean) : []
  const notes = silent ? [] : outs.filter((o) => o.kind === 'note' && o.text)
  const hints = outs.filter((o) => o.kind === 'prompt-insert' && o.text)
  const choices = outs.filter((o) => o.kind === 'choices' && o.choices?.length)
  return (
    <section className="flex flex-col gap-1" aria-label={nameOf(run.agent)} data-testid={`agent-block-${run.agent}`}>
      <h3 className="text-xs font-semibold">{nameOf(run.agent)}</h3>
      {run.status === 'failed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('ag.failed', { why: run.reason ?? '?' })}</p>}
      {notes.map((o, i) => (
        <div key={`n${i}`} className="text-xs leading-relaxed">
          {o.title && notes.length + hints.length > 1 && <span className="font-medium">{o.title}: </span>}
          <span className="whitespace-pre-wrap">{o.text}</span>
        </div>
      ))}
      {hints.map((o, i) => (
        <p key={`h${i}`} className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">{o.label || t('ag.block.hint')}: </span>
          <span className="whitespace-pre-wrap">{o.text}</span>
        </p>
      ))}
      {writes.length > 0 && <ul className="flex flex-col gap-0.5 text-[11px] tabular-nums text-muted-foreground">{writes.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {choices.map((o, i) => <ChoiceChips key={`c${i}`} chatId={chatId} set={{ agent: run.agent, choices: o.choices! }} />)}
      {run.status === 'ok' && !notes.length && !hints.length && !writes.length && !choices.length && <p className="text-[11px] text-muted-foreground">{t('ag.block.quiet')}</p>}
    </section>
  )
}

/**
 * The block above the composer: the latest result of every agent the user marked "also show in the block", one section each.
 * Folded to one line until opened; the place the agent already shows its result in is not touched. Nothing here goes
 * to the model.
 */
export function AgentBlock({ chatId }: { chatId: string }) {
  const t = useT()
  const runs = useBlockRuns(chatId)
  const [open, setOpen] = useState(() => readOpen(chatId))
  const [forChat, setForChat] = useState(chatId)
  if (forChat !== chatId) { setForChat(chatId); setOpen(readOpen(chatId)) }
  if (!runs.length) return null
  const toggle = () => {
    const v = !open
    setOpen(v)
    try { localStorage.setItem(openKey(chatId), v ? '1' : '0') } catch { /* storage blocked: the fold is not remembered */ }
  }
  const failed = runs.filter((r) => r.status === 'failed').length
  return (
    <div className="chat-column relative z-10 px-3 pb-1.5" data-testid="agent-block">
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5">
        <button type="button" onClick={toggle} aria-expanded={open}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-muted-foreground max-md:min-h-10">
          <Robot className="size-3.5 shrink-0 text-violet-500" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{t('ag.block.title', { n: runs.length })}</span>
            {!open && <span> · {runs.map((r) => nameOf(r.agent)).join(', ')}</span>}
            {failed > 0 && <span className="text-amber-600 dark:text-amber-400"> · {t('ag.log.failed', { n: failed })}</span>}
          </span>
          <CaretDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {open && (
          <div className="flex max-h-56 flex-col gap-2.5 overflow-y-auto border-t border-violet-500/20 px-3 py-2">
            {runs.map((r) => <Result key={r.agent} chatId={chatId} run={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
