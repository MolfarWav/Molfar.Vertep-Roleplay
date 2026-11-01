import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, DotsSixVertical, Plus, Trash } from '@phosphor-icons/react'
import { templateProblems } from '@/canvas-kit/boards/agent-check'
import { slotsFor } from '@/lib/agent-template'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import { dragItems, droppedItems, fieldsFor, GRID, gridFields, HTML_HEIGHT, MAX_ACTIONS, MAX_PANELS, MAX_WIDGETS, moveItem, newPanel, newWidget, PANEL_PLACE_LIST, setWidgetKind, starterTemplate, WIDGET_KINDS } from '@/lib/forge'
import { useDragList } from '@/lib/drag-list'
import { Field, NativeSelect, NumberBox } from './card-form'
import { PanelPreview } from './panel-preview'

type Obj = Record<string, any>
type State = Record<string, { type: string; item?: Record<string, string> }>

/** The panels of an agent as forms: a title and a place for each panel, and its widgets (what to show, which field, which buttons). */
export function PanelsForm({ panels, state, onChange }: { panels: Obj[]; state: State; onChange: (next: Obj[]) => void }) {
  const t = useT()
  const [full, setFull] = useState(true)
  const setPanel = (i: number, patch: Obj) => onChange(panels.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const items = useMemo(() => dragItems(panels), [panels])
  const { containerRef, dragId, ordered, rowProps } = useDragList(items, (o) => onChange(droppedItems(panels, o)))
  return (
    <div className="flex flex-col gap-2" data-testid="forge-panels-form">
      {panels.length === 0 && <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.panels.none')}</p>}
      {panels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('fg.pv.mode')}>
          <span className="text-[11px] text-muted-foreground">{t('fg.pv.mode')}</span>
          {([true, false] as const).map((v) => (
            <Button key={String(v)} variant={full === v ? 'secondary' : 'outline'} size="sm" className="max-md:h-10" aria-pressed={full === v} onClick={() => setFull(v)} data-testid={`forge-sample-${v ? 'full' : 'empty'}`}>
              {t(v ? 'fg.pv.full' : 'fg.pv.empty')}
            </Button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="flex flex-col gap-2">
        {ordered.map(({ id, item: p }) => {
          const i = Number(id)
          return (
            <PanelCard key={id} id={id} p={p} at={i} count={panels.length} state={state} full={full} dragging={dragId === id}
              grip={rowProps(id)} onPanel={(patch) => setPanel(i, patch)} onMove={(by) => onChange(moveItem(panels, i, by))} onRemove={() => onChange(panels.filter((_, k) => k !== i))} />
          )
        })}
      </div>
      {panels.length < MAX_PANELS && (
        <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => onChange([...panels, newPanel(panels, state, t('fg.panel.new'))])} data-testid="forge-panel-add">
          <Plus className="size-3.5" aria-hidden="true" />{t('fg.panels.add')}
        </Button>
      )}
    </div>
  )
}

type GripProps = ReturnType<ReturnType<typeof useDragList>['rowProps']>

/** One panel: its header, its widgets (draggable among themselves) and the preview. */
function PanelCard({ id, p, at, count, state, full, dragging, grip, onPanel, onMove, onRemove }: {
  id: string; p: Obj; at: number; count: number; state: State; full: boolean; dragging: boolean; grip: GripProps
  onPanel: (patch: Obj) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const t = useT()
  const widgets: Obj[] = Array.isArray(p.widgets) ? p.widgets : []
  const setWidget = (j: number, w: Obj) => onPanel({ widgets: widgets.map((x, k) => (k === j ? w : x)) })
  const wItems = useMemo(() => dragItems(widgets), [widgets])
  const wDrag = useDragList(wItems, (o) => onPanel({ widgets: droppedItems(widgets, o) }))
  return (
    <div data-rowid={id} className={cn('flex flex-col gap-2 rounded-md border border-border p-2', dragging && 'opacity-60 ring-2 ring-primary/50')} data-testid={`forge-panel-${p.id}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {count > 1 && <Grip handle={grip} />}
        <Input value={String(p.title ?? '')} aria-label={t('fg.panel.title')} className="min-w-[9rem] flex-1 max-md:h-10" onChange={(e) => onPanel({ title: e.target.value })} />
        <div className="w-40 shrink-0">
          <NativeSelect value={String(p.place ?? 'float')} label={t('fg.panel.place')} onChange={(place) => onPanel({ place })}>
            {PANEL_PLACE_LIST.map((pl) => <option key={pl} value={pl}>{t(`fg.place.${pl}` as MsgKey)}</option>)}
          </NativeSelect>
        </div>
        <Mover at={at} count={count} onMove={onMove} />
        <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.panel.remove')} onClick={onRemove}>
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div ref={wDrag.containerRef} className="flex flex-col gap-2">
        {wDrag.ordered.map(({ id: wid, item: w }) => {
          const j = Number(wid)
          return (
            <WidgetRow key={wid} id={wid} w={w} state={state} dragging={wDrag.dragId === wid} grip={wDrag.rowProps(wid)} onChange={(next) => setWidget(j, next)}
              onRemove={() => onPanel({ widgets: widgets.filter((_, k) => k !== j) })} at={j} count={widgets.length} onMove={(by) => onPanel({ widgets: moveItem(widgets, j, by) })} />
          )
        })}
      </div>
      {widgets.length < MAX_WIDGETS && (
        <NativeSelect value="" label={t('fg.widget.add')} onChange={(kind) => kind && onPanel({ widgets: [...widgets, newWidget(kind, state)] })}>
          <option value="">{t('fg.widget.add')}</option>
          {WIDGET_KINDS.map((k) => <option key={k} value={k}>{t(`fg.wk.${k}` as MsgKey)}</option>)}
        </NativeSelect>
      )}
      <PanelPreview panel={p} state={state} full={full} />
    </div>
  )
}

/** The grip of a row: press and move with a mouse, or hold and move on a touch screen. The keyboard uses Move up / Move down. */
function Grip({ handle }: { handle: GripProps }) {
  const t = useT()
  return (
    <span {...handle} role="img" aria-label={t('fg.drag')} title={t('fg.drag')} data-testid="forge-grip"
      className="flex size-6 shrink-0 cursor-grab touch-none select-none items-center justify-center self-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing max-md:size-10">
      <DotsSixVertical className="size-4" aria-hidden="true" />
    </span>
  )
}

function WidgetRow({ id, w, state, dragging, grip, onChange, onRemove, at, count, onMove }: { id: string; w: Obj; state: State; dragging: boolean; grip: GripProps; onChange: (w: Obj) => void; onRemove: () => void; at: number; count: number; onMove: (by: -1 | 1) => void }) {
  const t = useT()
  const kind = String(w.w)
  const known = (WIDGET_KINDS as readonly string[]).includes(kind)
  const fields = known ? fieldsFor(kind, state) : []
  const bind = String(w.bind ?? '')
  const columns: string[] = Array.isArray(w.columns) ? w.columns : []
  const items: { label: string; send: string }[] = Array.isArray(w.items) ? w.items : []
  const setItem = (k: number, patch: Partial<{ label: string; send: string }>) => onChange({ ...w, items: items.map((x, n) => (n === k ? { ...x, ...patch } : x)) })
  return (
    <div data-rowid={id} className={cn('flex flex-col gap-1.5 rounded-md bg-muted/40 p-2', dragging && 'opacity-60 ring-2 ring-primary/50')}>
      <div className="flex gap-1.5">
        {count > 1 && <Grip handle={grip} />}
        {known ? (
          <NativeSelect value={kind} label={t('fg.widget.kind')} onChange={(k) => onChange(setWidgetKind(w, k, state))}>
            {WIDGET_KINDS.map((k) => <option key={k} value={k}>{t(`fg.wk.${k}` as MsgKey)}</option>)}
          </NativeSelect>
        ) : <span className="flex-1 self-center text-xs text-muted-foreground">{t('fg.widget.other', { kind })}</span>}
        <Mover at={at} count={count} onMove={onMove} />
        <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.widget.remove')} onClick={onRemove}>
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {kind === 'html' ? (
        <HtmlForm w={w} state={state} onChange={onChange} />
      ) : kind === 'grid' ? (
        <GridForm w={w} state={state} onChange={onChange} fields={fields} />
      ) : kind === 'actions' ? (
        <div className="flex flex-col gap-1.5">
          {items.map((it, k) => (
            <div key={k} className="flex flex-col gap-1 rounded-md border border-border bg-background p-1.5">
              <div className="flex gap-1.5">
                <Input value={it.label ?? ''} placeholder={t('fg.widget.btnLabel')} aria-label={t('fg.widget.btnLabel')} className="max-md:h-10" onChange={(e) => setItem(k, { label: e.target.value })} />
                <Mover at={k} count={items.length} onMove={(by) => onChange({ ...w, items: moveItem(items, k, by) })} />
                <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.widget.btnRemove')} disabled={items.length < 2} onClick={() => onChange({ ...w, items: items.filter((_, n) => n !== k) })}>
                  <Trash className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <Textarea value={it.send ?? ''} rows={2} placeholder={t('fg.widget.btnSend')} aria-label={t('fg.widget.btnSend')} onChange={(e) => setItem(k, { send: e.target.value })} />
            </div>
          ))}
          {items.length < MAX_ACTIONS && (
            <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => onChange({ ...w, items: [...items, { label: '', send: '' }] })}>
              <Plus className="size-3.5" aria-hidden="true" />{t('fg.widget.btnAdd')}
            </Button>
          )}
        </div>
      ) : known ? (
        <>
          <Field label={t('fg.widget.label')}>
            <Input value={String(w.label ?? '')} className="max-md:h-10" onChange={(e) => onChange({ ...w, label: e.target.value })} />
          </Field>
          <Field label={t('fg.widget.field')} hint={fields.length ? undefined : t('fg.widget.noField')}>
            <NativeSelect value={bind} onChange={(b) => onChange({ ...w, bind: b, ...(kind === 'table' ? { columns: Object.keys(state[b]?.item ?? {}).slice(0, 3) } : {}) })}>
              {!fields.includes(bind) && <option value={bind}>{bind || t('fg.pick')}</option>}
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </NativeSelect>
          </Field>
          {kind === 'table' && (
            <Field label={t('fg.widget.columns')}>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.keys(state[bind]?.item ?? {}).map((c) => (
                  <label key={c} className="flex min-h-8 items-center gap-1.5 text-sm max-md:min-h-10">
                    <input type="checkbox" className="size-4" checked={columns.includes(c)} onChange={() => {
                      const next = columns.includes(c) ? columns.filter((x) => x !== c) : [...columns, c]
                      if (next.length) onChange({ ...w, columns: next })
                    }} />
                    {c}
                  </label>
                ))}
              </div>
            </Field>
          )}
        </>
      ) : <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.widget.otherHint')}</p>}
    </div>
  )
}

/** The checker's code, said in the person's language; the token is the slot that is wrong. */
function problemText(t: ReturnType<typeof useT>, p: { code: string; message: string }): string {
  const token = /\{\{[^{}]*\}\}/.exec(p.message)?.[0] ?? ''
  if (p.code === 'E_TPL_FORBIDDEN') return t('fg.tpl.err.forbidden')
  if (p.code === 'E_TPL_UNCLOSED') return t('fg.tpl.err.unclosed', { token })
  if (p.code === 'E_TPL_FIELD') return t('fg.tpl.err.field', { token })
  return t('fg.tpl.err.size')
}

/** The form of an `html` widget: the template, buttons that put a field into it, what the checker says, the height. */
function HtmlForm({ w, state, onChange }: { w: Obj; state: State; onChange: (w: Obj) => void }) {
  const t = useT()
  const area = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const tpl = String(w.template ?? '')
  const problems = templateProblems(tpl, state)
  const put = (text: string) => {
    const el = area.current
    const a = el?.selectionStart ?? tpl.length
    const b = el?.selectionEnd ?? tpl.length
    onChange({ ...w, template: tpl.slice(0, a) + text + tpl.slice(b) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length) })
  }
  const slots = slotsFor(state)
  const model = w.bind !== undefined
  const textFields = Object.keys(state).filter((k) => state[k]?.type === 'text')
  // switching the mode swaps what draws the widget; the height and the label stay
  const toFixed = () => { const { bind: _b, ...rest } = w; onChange({ ...rest, template: starterTemplate(state) }) }
  const toModel = () => { const { template: _t, ...rest } = w; onChange({ ...rest, bind: textFields[0] ?? '' }) }
  return (
    <div className="flex flex-col gap-1.5" data-testid="forge-html-form">
      <div className="flex gap-1.5" role="group" aria-label={t('fg.html.mode')}>
        {([['fixed', !model, toFixed], ['model', model, toModel]] as const).map(([k, on, go]) => (
          <button key={k} type="button" aria-pressed={on} onClick={() => { if (!on) go() }} data-testid={`forge-html-mode-${k}`}
            className={cn('min-h-8 flex-1 rounded-md border px-2 py-1 text-left text-xs max-md:min-h-10', on ? 'border-primary bg-primary/10' : 'border-input text-muted-foreground hover:bg-muted')}>
            <b className="block font-medium">{t(`fg.html.mode.${k}` as MsgKey)}</b>
            <span className="block text-[11px] leading-snug text-muted-foreground">{t(`fg.html.mode.${k}.hint` as MsgKey)}</span>
          </button>
        ))}
      </div>
      {model && (
        <>
          <Field label={t('fg.html.field')} hint={textFields.length ? t('fg.html.fieldHint') : t('fg.html.noField')}>
            <NativeSelect value={String(w.bind ?? '')} onChange={(b) => onChange({ ...w, bind: b })} invalid={!textFields.includes(String(w.bind ?? ''))}>
              {!textFields.includes(String(w.bind ?? '')) && <option value={String(w.bind ?? '')}>{String(w.bind || t('fg.pick'))}</option>}
              {textFields.map((f) => <option key={f} value={f}>{f}</option>)}
            </NativeSelect>
          </Field>
          <details className="rounded-md border border-border bg-background p-2 text-xs" data-testid="forge-html-tip">
            <summary className="cursor-pointer select-none text-[11px] font-medium">{t('fg.html.tip')}</summary>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t('fg.html.tipBody')}</p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-[11px] leading-snug">{t('fg.html.tipPrompt')}</pre>
          </details>
        </>
      )}
      {!model && (
      <Field label={t('fg.tpl.label')} hint={t('fg.tpl.hint')}>
        <Textarea ref={area} value={tpl} rows={7} spellCheck={false} aria-invalid={problems.length > 0} className="font-mono text-xs" onChange={(e) => onChange({ ...w, template: e.target.value })} data-testid="forge-html-template" />
      </Field>
      )}
      {!model && slots.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('fg.tpl.insert')}>
          <span className="text-[11px] text-muted-foreground">{t('fg.tpl.insert')}</span>
          {slots.map((s) => (
            <Button key={s.label} variant="outline" size="sm" className="h-7 px-2 font-mono text-[11px] max-md:h-10" onClick={() => put(s.insert)}>{s.label}</Button>
          ))}
        </div>
      )}
      {!model && problems.map((p, i) => <p key={i} role="alert" className="text-[11px] leading-snug text-destructive" data-testid="forge-html-problem">{problemText(t, p)}</p>)}
      <Field label={t('fg.tpl.height')}>
        <Input type="number" inputMode="numeric" min={HTML_HEIGHT.min} max={HTML_HEIGHT.max} step={10} value={draft ?? w.height ?? HTML_HEIGHT.start} className="w-28 max-md:h-10"
          onChange={(e) => {
            setDraft(e.target.value)
            const n = Number(e.target.value)
            if (Number.isInteger(n) && n >= HTML_HEIGHT.min && n <= HTML_HEIGHT.max) onChange({ ...w, height: n })
          }}
          onBlur={() => {
            const n = Math.min(HTML_HEIGHT.max, Math.max(HTML_HEIGHT.min, Math.round(Number(draft ?? w.height) || HTML_HEIGHT.start)))
            setDraft(null)
            if (n !== w.height) onChange({ ...w, height: n })
          }} />
      </Field>
    </div>
  )
}

/** The form of a `grid` widget: which list is the board, its size, which entry fields are the column, the row and the state, and the legend. */
function GridForm({ w, state, onChange, fields }: { w: Obj; state: State; onChange: (w: Obj) => void; fields: string[] }) {
  const t = useT()
  const bind = String(w.bind ?? '')
  const item = state[bind]?.item ?? {}
  const ofType = (type: string) => Object.keys(item).filter((k) => item[k] === type)
  const legend: Obj[] = Array.isArray(w.legend) ? w.legend : []
  const setLegend = (i: number, patch: Obj) => onChange({ ...w, legend: legend.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  const pick = (key: 'x' | 'y' | 'cell', type: 'number' | 'text') => (
    <Field label={t(`fg.grid.${key}` as MsgKey)}>
      <NativeSelect value={String(w[key] ?? '')} onChange={(v) => onChange({ ...w, [key]: v })}>
        {!ofType(type).includes(String(w[key])) && <option value={String(w[key] ?? '')}>{String(w[key] || t('fg.pick'))}</option>}
        {ofType(type).map((f) => <option key={f} value={f}>{f}</option>)}
      </NativeSelect>
    </Field>
  )
  return (
    <div className="flex flex-col gap-1.5" data-testid="forge-grid-form">
      <Field label={t('fg.widget.label')}>
        <Input value={String(w.label ?? '')} className="max-md:h-10" onChange={(e) => onChange({ ...w, label: e.target.value })} />
      </Field>
      <Field label={t('fg.grid.list')} hint={fields.length ? t('fg.grid.listHint') : t('fg.grid.noList')}>
        <NativeSelect value={bind} onChange={(b) => onChange({ ...w, bind: b, ...(gridFields(state[b]) ?? {}) })}>
          {!fields.includes(bind) && <option value={bind}>{bind || t('fg.pick')}</option>}
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label={t('fg.grid.cols')}><NumberBox value={w.cols} min={1} max={GRID.max} label={t('fg.grid.cols')} onChange={(v) => onChange({ ...w, cols: v })} /></Field>
        <Field label={t('fg.grid.rows')}><NumberBox value={w.rows} min={1} max={GRID.max} label={t('fg.grid.rows')} onChange={(v) => onChange({ ...w, rows: v })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {pick('x', 'number')}
        {pick('y', 'number')}
        {pick('cell', 'text')}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{t('fg.grid.fieldsHint', { max: GRID.max })}</p>
      <span className="text-xs font-medium">{t('fg.grid.legend')}</span>
      <div className="grid grid-cols-2 gap-1.5 px-1.5 text-xs text-muted-foreground" aria-hidden="true"><span>{t('fg.grid.value')}</span><span>{t('fg.grid.label')}</span></div>
      {legend.map((l, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md border border-border bg-background p-1.5" data-testid="forge-grid-legend">
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={String(l.value ?? '')} placeholder={t('fg.grid.value')} aria-label={t('fg.grid.value')} className="max-md:h-10" onChange={(e) => setLegend(i, { value: e.target.value })} />
            <Input value={String(l.label ?? '')} placeholder={t('fg.grid.label')} aria-label={t('fg.grid.label')} className="max-md:h-10" onChange={(e) => setLegend(i, { label: e.target.value })} />
          </div>
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1">
              <NativeSelect value={String(l.tone ?? 'muted')} label={t('fg.grid.tone')} onChange={(tone) => setLegend(i, { tone })}>
                {GRID.tones.map((tn) => <option key={tn} value={tn}>{t(`fg.grid.tone.${tn}` as MsgKey)}</option>)}
              </NativeSelect>
            </div>
            <Input value={String(l.mark ?? '')} maxLength={2} placeholder={t('fg.grid.mark')} aria-label={t('fg.grid.mark')} className="w-20 shrink-0 max-md:h-10" onChange={(e) => setLegend(i, { mark: e.target.value || undefined })} />
            <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.grid.remove')} disabled={legend.length < 2} onClick={() => onChange({ ...w, legend: legend.filter((_, k) => k !== i) })}>
              <Trash className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      {legend.length < GRID.legend && (
        <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => onChange({ ...w, legend: [...legend, { value: '', label: '', tone: 'muted' }] })}>
          <Plus className="size-3.5" aria-hidden="true" />{t('fg.grid.add')}
        </Button>
      )}
    </div>
  )
}

/** Up and down buttons for the place of an item in a list. */
function Mover({ at, count, onMove }: { at: number; count: number; onMove: (by: -1 | 1) => void }) {
  const t = useT()
  if (count < 2) return null
  return (
    <span className="flex shrink-0" role="group" aria-label={t('fg.move')}>
      <Button variant="ghost" size="icon" className="size-8 max-md:size-10" aria-label={t('fg.move.up')} title={t('fg.move.up')} disabled={at === 0} onClick={() => onMove(-1)}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8 max-md:size-10" aria-label={t('fg.move.down')} title={t('fg.move.down')} disabled={at === count - 1} onClick={() => onMove(1)}>
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  )
}
