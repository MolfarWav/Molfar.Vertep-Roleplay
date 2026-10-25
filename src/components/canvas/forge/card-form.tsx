import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { SHOW_BY_KIND } from '@/canvas-kit/boards/agent'
import type { CanvasNode, Graph } from '@/canvas-kit/graph'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { INPUT_SOURCES, OUTPUT_KINDS, portsOf, setWire, wireChoices } from '@/lib/forge'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Params = Record<string, unknown>
export type StateFields = Record<string, { type: string; item?: Record<string, string> }>

const box = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm max-md:h-10'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function NativeSelect({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={box}>
      {children}
    </select>
  )
}

/** A number box that keeps what is being typed (an empty box, a minus sign) and reports only whole numbers. */
export function NumberBox({ value, onChange, min, max, label }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; label?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => { setText(value === undefined ? '' : String(value)) }, [value])
  return (
    <Input
      inputMode="numeric"
      value={text}
      aria-label={label}
      className="max-md:h-10"
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw.trim() === '') return onChange(undefined)
        const n = Number(raw)
        if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n)
      }}
    />
  )
}

// ---------- the answer shape of an "Ask the model" or "Parse JSON" card: name, kind ----------

export type Kind = 'text' | 'number' | 'bool' | 'enum'
const kindOf = (spec: string): Kind => (spec === 'number' ? 'number' : spec === 'bool' ? 'bool' : spec.startsWith('enum:') ? 'enum' : 'text')

export function ShapeEditor({ shape, onChange, kinds = ['text', 'number', 'bool', 'enum'] }: { shape: Record<string, string>; onChange: (s: Record<string, string>) => void; kinds?: Kind[] }) {
  const t = useT()
  const rows = Object.entries(shape)
  const rename = (from: string, to: string) => onChange(Object.fromEntries(rows.map(([k, v]) => [k === from ? to : k, v])))
  const respec = (name: string, spec: string) => onChange({ ...shape, [name]: spec })
  const fresh = () => { let i = rows.length + 1; while (`field${i}` in shape) i++; onChange({ ...shape, [`field${i}`]: 'text' }) }
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([name, spec]) => {
        const kind = kindOf(spec)
        return (
          <div key={name} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <div className="flex gap-1.5">
              <Input defaultValue={name} aria-label={t('fg.shape.name')} className="max-md:h-10" onBlur={(e) => { const v = e.target.value.replace(/[^A-Za-z0-9_-]/g, ''); if (v && v !== name && !(v in shape)) rename(name, v); else e.target.value = name }} />
              <NativeSelect value={kind} label={t('fg.shape.kind')} onChange={(k) => respec(name, k === 'enum' ? 'enum:a|b' : k)}>
                {kinds.map((k) => <option key={k} value={k}>{t(`fg.shape.${k}` as MsgKey)}</option>)}
              </NativeSelect>
              <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.shape.remove')} disabled={rows.length < 2} onClick={() => { const { [name]: _gone, ...rest } = shape; onChange(rest) }}>
                <Trash className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {kind === 'enum' && (
              <Input
                defaultValue={spec.slice(5).split('|').join(', ')}
                aria-label={t('fg.shape.options')}
                placeholder={t('fg.shape.optionsEg')}
                className="max-md:h-10"
                onBlur={(e) => {
                  const opts = e.target.value.split(',').map((x) => x.trim().replace(/\|/g, '')).filter(Boolean)
                  if (opts.length >= 2) respec(name, `enum:${opts.join('|')}`)
                }}
              />
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={fresh}><Plus className="size-3.5" aria-hidden="true" />{t('fg.shape.add')}</Button>
    </div>
  )
}

// ---------- the rules of an "If" card ----------

const OPS: Record<string, string[]> = {
  text: ['eq', 'neq', 'contains', 'notContains', 'in', 'isSet', 'isMissing'],
  number: ['lt', 'lte', 'eq', 'gte', 'gt', 'between', 'isSet', 'isMissing'],
  flag: ['isYes', 'isNo', 'isUnknown'],
}
const NO_RIGHT = new Set(['isSet', 'isMissing', 'isYes', 'isNo', 'isUnknown'])

interface Row { left: { from: string; port: string }; op: string; right?: { value?: unknown; from?: string; port?: string } }

function RulesEditor({ params, onChange }: { params: Params; onChange: (p: Params) => void }) {
  const t = useT()
  const rows = (Array.isArray(params.rows) ? params.rows : []) as Row[]
  const inputs = (Array.isArray(params.inputs) ? params.inputs : []) as { id: string; type: string }[]
  const typeOf = (port: string) => inputs.find((i) => i.id === port)?.type ?? 'text'
  // the inputs are what the rules read: one per name, so they follow the rules
  const write = (next: Row[], match = params.match) => {
    const seen = new Map<string, string>()
    for (const r of next) if (r.left?.from === 'wire') seen.set(r.left.port, typeOf(r.left.port))
    for (const r of next) if (r.right?.from === 'wire' && r.right.port) seen.set(r.right.port, seen.get(r.right.port) ?? typeOf(r.right.port))
    onChange({ ...params, match, rows: next, inputs: [...seen].map(([id, type]) => ({ id, type })) })
  }
  const setType = (port: string, type: string) => {
    const nextRows = rows.map((r) => {
      if (r.left?.port !== port) return r
      const op = OPS[type].includes(r.op) ? r.op : OPS[type][0]
      return NO_RIGHT.has(op) ? { left: r.left, op } : { ...r, op, right: r.right ?? { value: type === 'number' ? 0 : '' } }
    })
    const inputsNext = inputs.some((x) => x.id === port) ? inputs.map((x) => (x.id === port ? { ...x, type } : x)) : [...inputs, { id: port, type }]
    onChange({ ...params, rows: nextRows, inputs: inputsNext })
  }
  const fresh = () => {
    let n = rows.length + 1
    while (inputs.some((i) => i.id === `value${n}`)) n++
    const id = `value${n}`
    onChange({ ...params, rows: [...rows, { left: { from: 'wire', port: id }, op: 'eq', right: { value: '' } }], inputs: [...inputs, { id, type: 'text' }] })
  }
  const parseRight = (type: string, op: string, raw: string): unknown => {
    if (op === 'between') return raw.split(',').map((x) => Number(x.trim())).slice(0, 2)
    if (op === 'in') return raw.split(',').map((x) => x.trim()).filter(Boolean)
    return type === 'number' ? Number(raw) : raw
  }
  const showRight = (r: Row): string => {
    const v = r.right?.value
    return Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v)
  }
  return (
    <div className="flex flex-col gap-2">
      <Field label={t('fg.if.match')}>
        <NativeSelect value={String(params.match ?? 'all')} onChange={(m) => write(rows, m)}>
          <option value="all">{t('fg.if.all')}</option>
          <option value="any">{t('fg.if.any')}</option>
          <option value="none">{t('fg.if.none')}</option>
        </NativeSelect>
      </Field>
      {rows.map((r, i) => {
        const type = r.left?.from === 'wire' ? typeOf(r.left.port) : 'text'
        const literal = r.left?.from === 'wire' && (!r.right || r.right.from === undefined)
        if (!literal) {
          return (
            <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1">{t('fg.if.advancedRow')}</span>
              <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.if.removeRule')} onClick={() => write(rows.filter((_, k) => k !== i))}><Trash className="size-4" aria-hidden="true" /></Button>
            </div>
          )
        }
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <div className="flex gap-1.5">
              <Input defaultValue={r.left.port} aria-label={t('fg.if.name')} className="max-md:h-10" onBlur={(e) => {
                const v = e.target.value.replace(/[^A-Za-z0-9_-]/g, '')
                if (!v || v === r.left.port) { e.target.value = r.left.port; return }
                const inputsNext = inputs.map((x) => (x.id === r.left.port ? { ...x, id: v } : x))
                onChange({ ...params, rows: rows.map((x) => (x.left.port === r.left.port ? { ...x, left: { from: 'wire', port: v } } : x)), inputs: inputsNext })
              }} />
              <NativeSelect value={type} label={t('fg.if.kind')} onChange={(k) => setType(r.left.port, k)}>
                <option value="text">{t('fg.shape.text')}</option>
                <option value="number">{t('fg.shape.number')}</option>
                <option value="flag">{t('fg.shape.bool')}</option>
              </NativeSelect>
              <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.if.removeRule')} onClick={() => write(rows.filter((_, k) => k !== i))}><Trash className="size-4" aria-hidden="true" /></Button>
            </div>
            <NativeSelect value={r.op} label={t('fg.if.op')} onChange={(op) => write(rows.map((x, k) => (k === i ? (NO_RIGHT.has(op) ? { left: x.left, op } : { ...x, op, right: { value: op === 'between' ? [0, 1] : op === 'in' ? [] : type === 'number' ? 0 : '' } }) : x)))}>
              {OPS[type].map((op) => <option key={op} value={op}>{t(`fg.op.${op}` as MsgKey)}</option>)}
            </NativeSelect>
            {!NO_RIGHT.has(r.op) && (
              <Input
                defaultValue={showRight(r)}
                aria-label={t('fg.if.value')}
                placeholder={r.op === 'between' ? t('fg.if.betweenEg') : r.op === 'in' ? t('fg.if.inEg') : ''}
                className="max-md:h-10"
                onBlur={(e) => write(rows.map((x, k) => (k === i ? { ...x, right: { value: parseRight(type, r.op, e.target.value) } } : x)))}
              />
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={fresh}><Plus className="size-3.5" aria-hidden="true" />{t('fg.if.add')}</Button>
      <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.if.hint')}</p>
    </div>
  )
}

// ---------- the form of one card ----------

const SOURCE_ID: Record<string, string> = { lastReply: 'reply', lastUserMessage: 'message', history: 'history', card: 'card', persona: 'persona', authorNote: 'authorNote', myPrevious: 'previous' }

export function CardForm({ node, graph, fields, onParams, onTitle, onNote, onGraph, onDelete, deletable }: {
  node: CanvasNode
  graph: Graph
  fields: StateFields
  onParams: (p: Params) => void
  onTitle: (title: string) => void
  onNote: (text: string) => void
  onGraph: (g: Graph) => void
  onDelete: () => void
  deletable: boolean
}) {
  const t = useT()
  const p = (node.params ?? {}) as Params
  const set = (patch: Params) => onParams({ ...p, ...patch })
  const [json, setJson] = useState(JSON.stringify(p, null, 2))
  const [jsonBad, setJsonBad] = useState(false)
  useEffect(() => { setJson(JSON.stringify(p, null, 2)); setJsonBad(false) }, [node.id, JSON.stringify(p)]) // eslint-disable-line react-hooks/exhaustive-deps
  const fieldsOf = (...types: string[]) => Object.entries(fields).filter(([, f]) => types.includes(f.type)).map(([name]) => name)
  const answer = (p.answer ?? { as: 'text' }) as { as: string; shape?: Record<string, string> }
  const kind = String(p.kind ?? 'note')
  const places = SHOW_BY_KIND[kind] ?? []
  const { ins } = portsOf(node)
  const give = (Array.isArray(p.give) ? p.give : []) as { id: string; source: string }[]

  const stateField = (types: string[], extra?: (name: string) => Params) => {
    const names = fieldsOf(...types)
    return (
      <Field label={t('fg.state.field')} hint={names.length ? undefined : t('fg.state.noFields')}>
        <NativeSelect value={String(p.field ?? '')} onChange={(f) => set({ field: f, ...(extra ? extra(f) : {}) })}>
          <option value="">{t('fg.pick')}</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </NativeSelect>
      </Field>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="forge-card-form">
      <Field label={t('fg.card.title')}>
        <Input value={node.title} onChange={(e) => onTitle(e.target.value)} className="max-md:h-10" />
      </Field>
      <p className="text-[11px] leading-snug text-muted-foreground">{t(`fg.hint.${node.type}` as MsgKey)}</p>

      {node.type === 'agent.input' && (
        <Field label={t('fg.input.give')} hint={t('fg.input.hint')}>
          <div className="flex flex-col gap-1.5">
            {INPUT_SOURCES.map((s) => {
              const on = give.some((g) => g.source === s)
              return (
                <label key={s} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-md:min-h-10">
                  <input type="checkbox" checked={on} className="size-4" onChange={() => {
                    const next = on ? give.filter((g) => g.source !== s) : [...give, { id: SOURCE_ID[s] ?? s, source: s }]
                    if (next.length) set({ give: next })
                  }} />
                  {t(`fg.source.${s}` as MsgKey)}
                </label>
              )
            })}
          </div>
        </Field>
      )}

      {node.type === 'text.template' && (
        <Field label={t('fg.template.text')} hint={t('fg.slots')}>
          <Textarea value={String(p.text ?? '')} rows={5} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      )}

      {node.type === 'model.ask' && (
        <>
          <Field label={t('fg.ask.prompt')} hint={t('fg.slots')}>
            <Textarea value={String(p.prompt ?? '')} rows={6} onChange={(e) => set({ prompt: e.target.value })} />
          </Field>
          <Field label={t('fg.ask.answer')}>
            <NativeSelect value={answer.as} onChange={(as) => set({ answer: as === 'json' ? { as, shape: answer.shape ?? { value: 'text' } } : { as } })}>
              <option value="text">{t('fg.ask.asText')}</option>
              <option value="yesno">{t('fg.ask.asYesno')}</option>
              <option value="json">{t('fg.ask.asJson')}</option>
            </NativeSelect>
          </Field>
          {answer.as === 'json' && (
            <Field label={t('fg.ask.shape')} hint={t('fg.ask.shapeHint')}>
              <ShapeEditor shape={answer.shape ?? {}} onChange={(shape) => set({ answer: { as: 'json', shape } })} />
            </Field>
          )}
          <Field label={t('fg.ask.maxTokens')} hint={t('fg.ask.maxTokensHint')}>
            <NumberBox value={typeof p.maxTokens === 'number' ? p.maxTokens : undefined} min={1} max={4000} onChange={(n) => set({ maxTokens: n ?? 100 })} />
          </Field>
          <Field label={t('fg.ask.role')} hint={t('fg.ask.roleHint')}>
            <Input value={String(p.role ?? 'fast')} className="max-md:h-10" onChange={(e) => set({ role: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') || 'fast' })} />
          </Field>
        </>
      )}

      {node.type === 'data.parse' && (
        <Field label={t('fg.ask.shape')}>
          <ShapeEditor shape={(p.shape ?? {}) as Record<string, string>} onChange={(shape) => set({ shape })} />
        </Field>
      )}

      {node.type === 'logic.if' && <RulesEditor params={p} onChange={onParams} />}

      {node.type === 'logic.merge' && (
        <Field label={t('fg.merge.count')} hint={t('fg.merge.hint')}>
          <NumberBox value={typeof p.count === 'number' ? p.count : 2} min={2} max={8} onChange={(n) => set({ count: n ?? 2 })} />
        </Field>
      )}

      {(node.type === 'state.read' || node.type === 'state.set') && stateField(['number', 'text', 'flag'], (f) => ({ as: fields[f]?.type ?? 'number' }))}

      {node.type === 'state.add' && (
        <>
          {stateField(['number'])}
          <Field label={t('fg.add.amount')} hint={t('fg.add.hint')}>
            <NumberBox value={typeof p.amount === 'number' ? p.amount : undefined} onChange={(n) => { const { amount: _a, ...rest } = p; onParams(n === undefined ? rest : { ...rest, amount: n }) }} />
          </Field>
        </>
      )}

      {node.type === 'state.list' && (
        <>
          {stateField(['list'], (f) => ({ item: fields[f]?.item ?? {}, key: undefined }))}
          <Field label={t('fg.list.op')}>
            <NativeSelect value={String(p.op ?? 'add')} onChange={(op) => set({ op })}>
              <option value="add">{t('fg.list.add')}</option>
              <option value="update">{t('fg.list.update')}</option>
              <option value="remove">{t('fg.list.remove')}</option>
            </NativeSelect>
          </Field>
          {p.op !== 'add' && (
            <Field label={t('fg.list.key')} hint={t('fg.list.keyHint')}>
              <NativeSelect value={String(p.key ?? '')} onChange={(key) => set({ key })}>
                <option value="">{t('fg.pick')}</option>
                {Object.keys((p.item ?? {}) as object).map((k) => <option key={k} value={k}>{k}</option>)}
              </NativeSelect>
            </Field>
          )}
        </>
      )}

      {node.type === 'agent.output' && (
        <>
          <Field label={t('fg.out.kind')}>
            <NativeSelect value={kind} onChange={(k) => { const { show: _s, ...rest } = p; onParams({ ...rest, kind: k }) }}>
              {OUTPUT_KINDS.map((k) => <option key={k} value={k}>{t(`fg.kind.${k}` as MsgKey)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t('fg.out.show')} hint={t('fg.out.showHint')}>
            <NativeSelect value={String(p.show ?? '')} onChange={(show) => { const { show: _s, ...rest } = p; onParams(show ? { ...rest, show } : rest) }}>
              <option value="">{t('fg.out.default', { place: t(`fg.place.${places[0] ?? 'log'}` as MsgKey) })}</option>
              {places.map((pl) => <option key={pl} value={pl}>{t(`fg.place.${pl}` as MsgKey)}</option>)}
            </NativeSelect>
          </Field>
          {kind === 'note' && (
            <Field label={t('fg.out.noteTitle')}>
              <Input value={String(p.title ?? '')} className="max-md:h-10" onChange={(e) => set({ title: e.target.value })} />
            </Field>
          )}
          {kind === 'prompt-insert' && (
            <Field label={t('fg.out.label')} hint={t('fg.out.labelHint')}>
              <Input value={String(p.label ?? '')} className="max-md:h-10" onChange={(e) => set({ label: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {node.type === 'note' && (
        <Field label={t('fg.note.text')} hint={t('fg.note.hint')}>
          <Textarea value={node.note ?? ''} rows={4} onChange={(e) => onNote(e.target.value)} />
        </Field>
      )}

      {ins.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={t('fg.wires')}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.wires')}</h4>
          {ins.map((port) => {
            const end = `${node.id}:${port.id}`
            const choices = wireChoices(graph, end)
            const current = choices.find((c) => c.wired)?.end ?? ''
            return (
              <Field key={port.id} label={`${port.label ?? port.id}${port.optional ? ` (${t('fg.optional')})` : ''}`}>
                <NativeSelect value={current} label={port.id} onChange={(from) => onGraph(setWire(graph, end, from || null).graph)}>
                  <option value="">{port.optional ? t('fg.wires.none') : t('fg.wires.pick')}</option>
                  {choices.map((c) => <option key={c.end} value={c.end}>{c.label}</option>)}
                </NativeSelect>
              </Field>
            )
          })}
        </section>
      )}

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.advanced')}</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <Textarea value={json} rows={8} className={cn('font-mono text-xs', jsonBad && 'border-destructive')} aria-label={t('fg.advanced')} onChange={(e) => {
            setJson(e.target.value)
            try {
              const v = JSON.parse(e.target.value)
              if (v && typeof v === 'object' && !Array.isArray(v)) { setJsonBad(false); onParams(v as Params) } else setJsonBad(true)
            } catch { setJsonBad(true) }
          }} />
          <span className={cn('text-[11px]', jsonBad ? 'text-destructive' : 'text-muted-foreground')}>{jsonBad ? t('fg.advanced.bad') : t('fg.advanced.hint')}</span>
        </div>
      </details>

      {deletable && (
        <Button variant="outline" className="self-start text-destructive max-md:h-10" onClick={onDelete}>
          <Trash className="size-4" aria-hidden="true" />{t('fg.card.delete')}
        </Button>
      )}
    </div>
  )
}
