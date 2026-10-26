import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { SHOW_BY_KIND } from '@/canvas-kit/boards/agent'
import type { CanvasNode, Graph } from '@/canvas-kit/graph'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
export function NumberBox({ value, onChange, min, max, label, placeholder }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; label?: string; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => { setText(value === undefined ? '' : String(value)) }, [value])
  return (
    <Input
      inputMode="numeric"
      value={text}
      aria-label={label}
      placeholder={placeholder}
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

// ---------- the cards that work in code: dice, pick, extract, cut ----------

/** A whole-number field. It keeps what is typed (the Input's number draft); text that is not a number is not reported. */
function IntBox({ value, onChange, min, max, label, placeholder, className }: { value: number | string; onChange: (n: number) => void; min?: number; max?: number; label: string; placeholder?: string; className?: string }) {
  return (
    <Input
      type="number" inputMode="numeric" step={1} min={min} max={max} value={value} aria-label={label} placeholder={placeholder}
      className={cn('max-md:h-10', className)}
      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n) }}
    />
  )
}

const PICK_MAX = 40
const FLAGS = ['i', 'm', 's'] as const
type Line = { text: string; weight?: number }

function DiceForm({ p, onParams }: { p: Params; onParams: (p: Params) => void }) {
  const t = useT()
  const count = typeof p.count === 'number' ? p.count : 1
  const sides = typeof p.sides === 'number' ? p.sides : 20
  const bonus = typeof p.bonus === 'number' ? p.bonus : 0
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fg.dice.count')}><IntBox value={count} min={1} max={20} label={t('fg.dice.count')} onChange={(n) => onParams({ ...p, count: n })} /></Field>
        <Field label={t('fg.dice.sides')}><IntBox value={sides} min={2} max={1000} label={t('fg.dice.sides')} onChange={(n) => onParams({ ...p, sides: n })} /></Field>
      </div>
      <Field label={t('fg.dice.bonus')} hint={t('fg.dice.bonusHint')}>
        <IntBox value={p.bonus === undefined ? '' : bonus} min={-1000} max={1000} label={t('fg.dice.bonus')} placeholder="0" className="w-28"
          onChange={(n) => { const { bonus: _b, ...rest } = p; onParams(n === 0 ? rest : { ...rest, bonus: n }) }} />
      </Field>
      <p className="text-xs font-medium" data-testid="dice-preview">{t('fg.dice.preview', { dice: `${count}d${sides}${bonus > 0 ? `+${bonus}` : bonus < 0 ? String(bonus) : ''}` })}</p>
      <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.dice.out')}</p>
    </>
  )
}

function PickForm({ p, set }: { p: Params; set: (patch: Params) => void }) {
  const t = useT()
  const items = (Array.isArray(p.items) ? p.items : []) as Line[]
  const write = (next: Line[]) => set({ items: next })
  const edit = (i: number, patch: Partial<Line>) => write(items.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  return (
    <Field label={t('fg.pick.items', { n: items.length, max: PICK_MAX })} hint={t('fg.pick.hint')}>
      <div className="flex flex-col gap-1.5" data-testid="pick-lines">
        <div className="flex gap-1.5 text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="min-w-0 flex-1">{t('fg.pick.text')}</span>
          <span className="w-16 shrink-0">{t('fg.pick.weight')}</span>
          <span className="w-8 shrink-0 max-md:w-10" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5">
            <Input value={it.text} maxLength={400} aria-label={t('fg.pick.line', { n: i + 1 })} className="min-w-0 flex-1 max-md:h-10" onChange={(e) => edit(i, { text: e.target.value })} />
            <IntBox value={it.weight ?? 1} min={1} max={100} label={t('fg.pick.weightOf', { n: i + 1 })} className="w-16 shrink-0" onChange={(n) => edit(i, { weight: n })} />
            <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.pick.remove', { n: i + 1 })} disabled={items.length <= 2} onClick={() => write(items.filter((_, k) => k !== i))}>
              <Trash className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start max-md:h-10" disabled={items.length >= PICK_MAX} onClick={() => write([...items, { text: '', weight: 1 }])}>
          <Plus className="size-3.5" aria-hidden="true" />{t('fg.pick.add')}
        </Button>
      </div>
    </Field>
  )
}

function ExtractForm({ p, set, onParams }: { p: Params; set: (patch: Params) => void; onParams: (p: Params) => void }) {
  const t = useT()
  const flags = typeof p.flags === 'string' ? p.flags : ''
  const toggle = (f: string) => {
    const next = FLAGS.filter((x) => (x === f ? !flags.includes(x) : flags.includes(x))).join('')
    const { flags: _f, ...rest } = p
    onParams(next ? { ...rest, flags: next } : rest)
  }
  return (
    <>
      <Field label={t('fg.extract.pattern')} hint={t('fg.extract.patternHint')}>
        <Input value={String(p.pattern ?? '')} maxLength={200} spellCheck={false} autoCapitalize="off" autoCorrect="off" className="font-mono max-md:h-10" onChange={(e) => set({ pattern: e.target.value })} data-testid="extract-pattern" />
      </Field>
      <Field label={t('fg.extract.flags')}>
        <div className="flex flex-wrap gap-1.5">
          {FLAGS.map((f) => {
            const on = flags.includes(f)
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => toggle(f)} data-testid={`extract-flag-${f}`}
                className={cn('flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs max-md:min-h-10', on ? 'border-primary bg-primary/10 text-foreground' : 'border-input text-muted-foreground hover:bg-muted')}>
                <b className="font-mono">{f}</b>{t(`fg.extract.flag.${f}` as MsgKey)}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label={t('fg.extract.group')} hint={t('fg.extract.groupHint')}>
        <IntBox value={typeof p.group === 'number' ? p.group : 0} min={0} max={9} label={t('fg.extract.group')} className="w-24" onChange={(n) => set({ group: n })} />
      </Field>
      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-md:min-h-10">
        <Switch size="sm" checked={p.all === true} aria-label={t('fg.extract.all')} onCheckedChange={(on) => set({ all: on })} data-testid="extract-all" />
        {t('fg.extract.all')}
      </label>
      {p.all === true && (
        <Field label={t('fg.extract.join')} hint={t('fg.extract.joinHint')}>
          <Input value={typeof p.join === 'string' ? p.join : ', '} maxLength={20} className="max-md:h-10" onChange={(e) => set({ join: e.target.value })} />
        </Field>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.extract.none')}</p>
    </>
  )
}

function CutForm({ p, set }: { p: Params; set: (patch: Params) => void }) {
  const t = useT()
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fg.cut.keep')}>
          <NativeSelect value={p.keep === 'last' ? 'last' : 'first'} label={t('fg.cut.keep')} onChange={(keep) => set({ keep })}>
            <option value="first">{t('fg.cut.first')}</option>
            <option value="last">{t('fg.cut.last')}</option>
          </NativeSelect>
        </Field>
        <Field label={t('fg.cut.n')}>
          <IntBox value={typeof p.n === 'number' ? p.n : 50} min={1} max={20000} label={t('fg.cut.n')} onChange={(n) => set({ n })} />
        </Field>
      </div>
      <Field label={t('fg.cut.unit')}>
        <NativeSelect value={['chars', 'words', 'lines'].includes(String(p.unit)) ? String(p.unit) : 'words'} label={t('fg.cut.unit')} onChange={(unit) => set({ unit })}>
          <option value="chars">{t('fg.cut.chars')}</option>
          <option value="words">{t('fg.cut.words')}</option>
          <option value="lines">{t('fg.cut.lines')}</option>
        </NativeSelect>
      </Field>
    </>
  )
}

/** What the checker says about one card, under its form. */
function Problems({ messages }: { messages: string[] }) {
  if (!messages.length) return null
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/50 bg-destructive/5 p-2" data-testid="card-problems">
      {messages.map((m, i) => <p key={i} role="alert" className="break-words text-[11px] leading-snug text-destructive">{m}</p>)}
    </div>
  )
}

/** Sources that give a list, and how many entries they give when the card does not say. */
const LIMITED: Record<string, { def: number; max: number }> = { litopysFacts: { def: 20, max: 60 }, lorebook: { def: 8, max: 20 } }

// ---------- the form of one card ----------

const SOURCE_ID: Record<string, string> = { lastReply: 'reply', lastUserMessage: 'message', history: 'history', card: 'card', persona: 'persona', authorNote: 'authorNote', myPrevious: 'previous', litopysFacts: 'facts', lorebook: 'lore' }

export function CardForm({ node, graph, fields, problems = [], onParams, onTitle, onNote, onGraph, onDelete, deletable }: {
  node: CanvasNode
  graph: Graph
  fields: StateFields
  /** what the check says about this card (its error messages) */
  problems?: string[]
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
  const give = (Array.isArray(p.give) ? p.give : []) as { id: string; source: string; limit?: number }[]

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
              const entry = give.find((g) => g.source === s)
              const on = !!entry
              const lim = LIMITED[s]
              return (
                <div key={s} className="flex flex-col gap-1">
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm max-md:min-h-10">
                    <input type="checkbox" checked={on} className="size-4" onChange={() => {
                      const next = on ? give.filter((g) => g.source !== s) : [...give, { id: SOURCE_ID[s] ?? s, source: s }]
                      if (next.length) set({ give: next })
                    }} />
                    {t(`fg.source.${s}` as MsgKey)}
                  </label>
                  {on && lim && (
                    <div className="ml-6 flex flex-col gap-1">
                      <span className="text-[11px] font-medium">{t('fg.input.limit')}</span>
                      <NumberBox value={typeof entry.limit === 'number' ? entry.limit : undefined} min={1} max={lim.max} label={`${t(`fg.source.${s}` as MsgKey)}: ${t('fg.input.limit')}`} placeholder={String(lim.def)}
                        onChange={(n) => set({ give: give.map((g) => { if (g.source !== s) return g; const { limit: _l, ...rest } = g; return n === undefined ? rest : { ...rest, limit: n } }) })} />
                      <span className="text-[11px] leading-snug text-muted-foreground">{t('fg.input.limitHint', { n: lim.def, max: lim.max })}</span>
                    </div>
                  )}
                </div>
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

      {node.type === 'random.dice' && <DiceForm p={p} onParams={onParams} />}
      {node.type === 'random.pick' && <PickForm p={p} set={set} />}
      {node.type === 'text.extract' && <ExtractForm p={p} set={set} onParams={onParams} />}
      {node.type === 'text.cut' && <CutForm p={p} set={set} />}

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

      <Problems messages={problems} />

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
