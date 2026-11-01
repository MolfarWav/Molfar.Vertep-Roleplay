import { useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, Check, DiceFive, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { probeAgentOnChat, runAgentOnChat } from '@/lib/agents'
import { describeWrite, dryRun, sampleInputs, startOwn, type DryFile, type DryResult } from '@/lib/agent-dry'
import { fmtValue } from '@/lib/agent-template'
import type { MsgKey } from '@/lib/i18n'
import { estimateTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import { Field } from './card-form'
import { ChatTrial } from './try-chat'

type Json = Record<string, any>
/**
 * `chat`: the inputs and memory above came from this real chat. `live`: the answers that came from the model, by card
 * id, with the model's name (an answer the person edits stops being the model's).
 */
export interface ChatMark { id: string; title: string; messages: number; models: Record<string, string>; empty: string[] }
interface Edits { inputs: Record<string, string>; own: Record<string, unknown>; replies: Record<string, string>; chat?: ChatMark; live?: Record<string, string> }
const NONE: Edits = { inputs: {}, own: {}, replies: {} }
/** What the last run on the model did: its cost, or why a card has no answer from it. */
export interface LiveNote { models: string[]; calls: number; input: number; output: number; failed: { node: string; error: string }[]; stopped?: string }
const newSeed = () => Math.random().toString(36).slice(2, 10)
/** The cards that roll: a trial keeps their result until the person asks for a new one. */
export const hasRandom = (file: Pick<DryFile, 'nodes'> | null) => !!file?.nodes.some((n) => n.type === 'random.dice' || n.type === 'random.pick')

/**
 * The trial run: what the person set (on top of the examples) and what the real executor makes of it. It runs only
 * while the Try tab is open and the check has no errors, and it is recomputed on every change, so there is no Run button.
 */
export function useDry(file: DryFile | null, key: string, active: boolean) {
  const t = useT()
  const [edits, setEdits] = useState<Edits>(NONE)
  // 'probe' = reading a chat, 'live' = waiting for the model; the note is the last run's outcome
  const [busy, setBusy] = useState<'probe' | 'live' | null>(null)
  const [note, setNote] = useState<LiveNote | null>(null)
  // the seed of the dice and picks: it stays while the person edits, and changes only with "Roll again"
  const [seed, setSeed] = useState('try')
  useEffect(() => { setEdits(NONE); setSeed('try'); setNote(null) }, [key])
  const examples = useMemo(() => (file ? sampleInputs(file) : {}), [file])
  const result = useMemo<DryResult | null>(() => {
    if (!file || !active) return null
    try {
      return dryRun(file, { inputs: { ...examples, ...edits.inputs }, own: edits.own, replies: edits.replies, chat: { messageCount: 6, lastSpeaker: 'Character' }, seed })
    } catch { return null }
  }, [file, active, examples, edits, seed])
  /** Fill the inputs and the memory from a real chat. The chat is only read. */
  const fromChat = async (chatId: string) => {
    if (!file) return
    setBusy('probe')
    try {
      const p = await probeAgentOnChat(file, chatId)
      setNote(null)
      setEdits({
        inputs: Object.fromEntries(p.inputs.map((i) => [i.id, i.text])),
        own: p.own,
        replies: {},
        chat: { id: p.chat.id, title: p.chat.title, messages: p.chat.messages, models: p.models, empty: p.inputs.filter((i) => i.empty).map((i) => (i.source === 'state' ? `${i.field}` : i.id)) },
      })
    } catch (e) {
      toast.error(t('fg.chat.failed', { why: (e as Error).message }))
    } finally { setBusy(null) }
  }

  /** Ask the chat's model what the agent's questions ask, once; its answers fill the boxes, so the trial runs on them from now on at no cost. */
  const askModel = async () => {
    if (!file || !edits.chat) return
    setBusy('live')
    setNote(null)
    try {
      const schema = (file.agent?.state ?? {}) as Json
      const r = await runAgentOnChat(file, edits.chat.id, { inputs: { ...examples, ...edits.inputs }, own: startOwn(schema, edits.own) })
      const good = r.asked.filter((a) => !a.error && a.reply.trim())
      setEdits((e) => ({
        ...e,
        replies: { ...e.replies, ...Object.fromEntries(good.map((a) => [a.node, a.reply])) },
        live: { ...e.live, ...Object.fromEntries(good.map((a) => [a.node, a.model ?? ''])) },
      }))
      setNote({
        models: [...new Set(good.map((a) => a.model).filter((m): m is string => !!m))],
        calls: r.asked.length,
        input: r.usage?.input ?? 0,
        output: r.usage?.output ?? 0,
        failed: r.asked.filter((a) => a.error || !a.reply.trim()).map((a) => ({ node: a.node, error: a.error || t('fg.chat.noAnswer') })),
      })
    } catch (e) {
      setNote({ models: [], calls: 0, input: 0, output: 0, failed: [], stopped: (e as Error).message })
    } finally { setBusy(null) }
  }

  return { edits, setEdits, result, examples, reroll: () => setSeed(newSeed()), busy, note, clearNote: () => setNote(null), fromChat, askModel }
}
export type Dry = ReturnType<typeof useDry>

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function TryPanel({ file, errors, dry, titleOf, calls }: { file: DryFile; errors: number; dry: Dry; titleOf: (id: string) => string; calls: number }) {
  const t = useT()
  const { edits, setEdits, result, examples, reroll } = dry
  const schema = (file.agent?.state ?? {}) as Json
  const own = startOwn(schema, edits.own)
  const give = file.nodes.filter((n) => n.type === 'agent.input').flatMap((n) => (n.params?.give ?? []) as Json[])
  const set = (patch: Partial<Edits>) => setEdits((e) => ({ ...e, ...patch }))
  const changed = Object.keys(edits.inputs).length + Object.keys(edits.own).length + Object.keys(edits.replies).length > 0 || !!edits.chat

  if (errors > 0) return <p className="text-xs text-muted-foreground" data-testid="try-fix">{t('fg.try.fix')}</p>
  return (
    <div className="flex flex-col gap-4" data-testid="try-panel">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{t('fg.try.lead')}</p>
        {changed && (
          <Button variant="outline" size="sm" className="shrink-0 max-md:h-10" onClick={() => { setEdits({ inputs: {}, own: {}, replies: {} }); dry.clearNote() }} data-testid="try-reset">
            <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />{t('fg.try.reset')}
          </Button>
        )}
      </div>

      <ChatTrial dry={dry} calls={calls} titleOf={titleOf} />

      {hasRandom(file) && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="shrink-0 max-md:h-10" onClick={reroll} data-testid="try-reroll">
            <DiceFive className="size-3.5" aria-hidden="true" />{t('fg.try.reroll')}
          </Button>
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{t('fg.try.rerollHint')}</p>
        </div>
      )}

      <section className="flex flex-col gap-2" aria-label={t('fg.try.inputs')}>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.try.inputs')}</h4>
        {give.map((g) => (
          <Field key={g.id} label={String(g.id)} hint={g.source === 'state' ? t('fg.try.inputState', { field: g.field }) : t('fg.try.inputFrom', { source: g.source })}>
            <Textarea rows={g.source === 'state' ? 1 : 3} value={edits.inputs[g.id] ?? examples[g.id] ?? ''} className="text-xs" onChange={(e) => set({ inputs: { ...edits.inputs, [g.id]: e.target.value } })} data-testid={`try-input-${g.id}`} />
          </Field>
        ))}
      </section>

      {Object.keys(schema).length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('fg.try.own')}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.try.own')}</h4>
          {Object.entries(schema).map(([id, f]) => (
            <OwnField key={id} id={id} f={f} value={own[id]} onChange={(v) => set({ own: { ...edits.own, [id]: v } })} />
          ))}
        </section>
      )}

      {result && result.asked.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('fg.try.replies')}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.try.replies')}</h4>
          <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.try.repliesHint')}</p>
          {result.asked.map((a) => (
            <div key={a.node} className="flex flex-col gap-1" data-testid={`try-reply-${a.node}`}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="min-w-0 flex-1 truncate">{titleOf(a.node)}</span>
                <span className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground" title={t('fg.try.promptHint')} data-testid={`try-prompt-${a.node}`}>{t('fg.try.promptTokens', { n: estimateTokens(a.prompt).toLocaleString() })}</span>
                <span className={cn('shrink-0 rounded-full border px-1.5 text-[10px] font-normal', a.example ? 'border-border text-muted-foreground' : 'border-primary/60 text-primary')}>{a.example ? t('fg.try.example') : edits.live?.[a.node] !== undefined ? t('fg.try.model') : t('fg.try.yours')}</span>
              </div>
              <Textarea rows={3} value={a.reply} className="font-mono text-xs" aria-label={titleOf(a.node)} onChange={(e) => { const { [a.node]: _was, ...live } = edits.live ?? {}; set({ replies: { ...edits.replies, [a.node]: e.target.value }, live }) }} />
              {!a.example && (
                <Button variant="ghost" size="sm" className="self-start max-md:h-10" onClick={() => { const { [a.node]: _gone, ...rest } = edits.replies; const { [a.node]: _was, ...live } = edits.live ?? {}; set({ replies: rest, live }) }}>{t('fg.try.resetReply')}</Button>
              )}
            </div>
          ))}
        </section>
      )}

      {result && <Result r={result} schema={schema} before={own} titleOf={titleOf} />}
    </div>
  )
}

function OwnField({ id, f, value, onChange }: { id: string; f: Json; value: unknown; onChange: (v: unknown) => void }) {
  const t = useT()
  if (f.type === 'flag') {
    return (
      <label className="flex min-h-8 items-center gap-2 text-xs max-md:min-h-10">
        <input type="checkbox" className="size-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{id}
      </label>
    )
  }
  if (f.type === 'list') return <ListJson label={t('fg.try.listJson', { field: id })} value={value} onChange={onChange} />
  return (
    <Field label={id}>
      <Input type={f.type === 'number' ? 'number' : 'text'} value={value === undefined ? '' : String(value)} className="max-md:h-10"
        onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)} />
    </Field>
  )
}

/** A list field as JSON: a text that does not parse is kept as typed and not used. */
function ListJson({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  return (
    <Field label={label}>
      <Textarea rows={2} aria-invalid={bad} value={draft ?? JSON.stringify(value ?? [])} className="font-mono text-xs"
        onChange={(e) => {
          setDraft(e.target.value)
          try { const v = JSON.parse(e.target.value); if (Array.isArray(v)) { setBad(false); onChange(v) } else setBad(true) } catch { setBad(true) }
        }}
        onBlur={() => { if (!bad) setDraft(null) }} />
    </Field>
  )
}

function Result({ r, schema, before, titleOf }: { r: DryResult; schema: Json; before: Record<string, unknown>; titleOf: (id: string) => string }) {
  const t = useT()
  const fieldsChanged = Object.keys(schema).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(r.ownAfter[k]))
  const show = (v: unknown) => (Array.isArray(v) ? t('fg.try.entries', { n: v.length }) : fmtValue(v))
  return (
    <section className="flex flex-col gap-2" aria-label={t('fg.try.result')} data-testid="try-result">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.try.result')}</h4>
      <p role="status" className={cn('flex items-start gap-1.5 text-xs font-medium', r.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')} data-testid="try-status">
        {r.status === 'done' ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
        <span>{r.status === 'done' ? `${t('fg.try.done')} · ${t('fg.check.calls', { n: r.calls })}` : t('fg.try.failed', { why: r.reason ?? '' })}</span>
      </p>
      {r.status === 'done' && (
        <>
          <Lines title={t('fg.try.writes')} none={t('fg.try.noWrites')} lines={[...r.ownWrites.map((w) => describeWrite(w)), ...r.refused.map((x) => `${describeWrite(x.write)} (${t('fg.try.refused', { why: x.why })})`)]} />
          {r.dashWrites.length > 0 && <Lines title={t('fg.try.dash')} none="" lines={r.dashWrites.map((w) => describeWrite(w))} />}
          <Lines title={t('fg.try.outputs')} none={t('fg.try.noOutputs')} lines={r.outputs.map((o) => `${o.kind}${o.text ? `: ${clip(String(o.text), 80)}` : o.choices ? `: ${(o.choices as string[]).join(' / ')}` : ''}`)} />
          {fieldsChanged.length > 0 && <Lines title={t('fg.try.after')} none="" lines={fieldsChanged.map((k) => `${k}: ${show(before[k])} → ${show(r.ownAfter[k])}`)} />}
        </>
      )}
      <details className="text-xs" open={r.status === 'failed'}>
        <summary className="cursor-pointer select-none py-1 font-medium max-md:min-h-10">{t('fg.try.steps')}</summary>
        <ol className="flex flex-col gap-1">
          {r.trace.map((s, i) => (
            <li key={i} className="flex flex-col rounded-md border border-border px-2 py-1" data-testid={`try-step-${s.node}`}>
              <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{titleOf(s.node)}</span><span className="shrink-0 text-[11px] text-muted-foreground">{t(`fg.try.s.${r.nodes[s.node] === 'failed' ? 'failed' : s.status}` as MsgKey)}</span></span>
              {s.out && <span className="break-words font-mono text-[11px] text-muted-foreground">{Object.entries(s.out).map(([k, v]) => `${k}=${clip(typeof v === 'string' ? v : JSON.stringify(v), 60)}`).join(' · ')}</span>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

function Lines({ title, none, lines }: { title: string; none: string; lines: string[] }) {
  if (!lines.length && !none) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
      {lines.length ? lines.map((l, i) => <span key={i} className="break-words font-mono text-xs">{l}</span>) : <span className="text-xs text-muted-foreground">{none}</span>}
    </div>
  )
}
