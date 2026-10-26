import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { fieldsFor, MAX_ACTIONS, MAX_PANELS, MAX_WIDGETS, newPanel, newWidget, PANEL_PLACE_LIST, setWidgetKind, WIDGET_KINDS } from '@/lib/forge'
import { Field, NativeSelect } from './card-form'

type Obj = Record<string, any>
type State = Record<string, { type: string; item?: Record<string, string> }>

/** The panels of an agent as forms: a title and a place for each panel, and its widgets (what to show, which field, which buttons). */
export function PanelsForm({ panels, state, onChange }: { panels: Obj[]; state: State; onChange: (next: Obj[]) => void }) {
  const t = useT()
  const setPanel = (i: number, patch: Obj) => onChange(panels.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-2" data-testid="forge-panels-form">
      {panels.length === 0 && <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.panels.none')}</p>}
      {panels.map((p, i) => {
        const widgets: Obj[] = Array.isArray(p.widgets) ? p.widgets : []
        const setWidget = (j: number, w: Obj) => setPanel(i, { widgets: widgets.map((x, k) => (k === j ? w : x)) })
        return (
          <div key={String(p.id ?? i)} className="flex flex-col gap-2 rounded-md border border-border p-2" data-testid={`forge-panel-${p.id}`}>
            <div className="flex gap-1.5">
              <Input value={String(p.title ?? '')} aria-label={t('fg.panel.title')} className="min-w-0 flex-1 max-md:h-10" onChange={(e) => setPanel(i, { title: e.target.value })} />
              <div className="w-40 shrink-0">
                <NativeSelect value={String(p.place ?? 'float')} label={t('fg.panel.place')} onChange={(place) => setPanel(i, { place })}>
                  {PANEL_PLACE_LIST.map((pl) => <option key={pl} value={pl}>{t(`fg.place.${pl}` as MsgKey)}</option>)}
                </NativeSelect>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.panel.remove')} onClick={() => onChange(panels.filter((_, k) => k !== i))}>
                <Trash className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {widgets.map((w, j) => (
              <WidgetRow key={j} w={w} state={state} onChange={(next) => setWidget(j, next)} onRemove={() => setPanel(i, { widgets: widgets.filter((_, k) => k !== j) })} />
            ))}
            {widgets.length < MAX_WIDGETS && (
              <NativeSelect value="" label={t('fg.widget.add')} onChange={(kind) => kind && setPanel(i, { widgets: [...widgets, newWidget(kind, state)] })}>
                <option value="">{t('fg.widget.add')}</option>
                {WIDGET_KINDS.map((k) => <option key={k} value={k}>{t(`fg.wk.${k}` as MsgKey)}</option>)}
              </NativeSelect>
            )}
          </div>
        )
      })}
      {panels.length < MAX_PANELS && (
        <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => onChange([...panels, newPanel(panels, state, t('fg.panel.new'))])} data-testid="forge-panel-add">
          <Plus className="size-3.5" aria-hidden="true" />{t('fg.panels.add')}
        </Button>
      )}
    </div>
  )
}

function WidgetRow({ w, state, onChange, onRemove }: { w: Obj; state: State; onChange: (w: Obj) => void; onRemove: () => void }) {
  const t = useT()
  const kind = String(w.w)
  const known = (WIDGET_KINDS as readonly string[]).includes(kind)
  const fields = known ? fieldsFor(kind, state) : []
  const bind = String(w.bind ?? '')
  const columns: string[] = Array.isArray(w.columns) ? w.columns : []
  const items: { label: string; send: string }[] = Array.isArray(w.items) ? w.items : []
  const setItem = (k: number, patch: Partial<{ label: string; send: string }>) => onChange({ ...w, items: items.map((x, n) => (n === k ? { ...x, ...patch } : x)) })
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2">
      <div className="flex gap-1.5">
        {known ? (
          <NativeSelect value={kind} label={t('fg.widget.kind')} onChange={(k) => onChange(setWidgetKind(w, k, state))}>
            {WIDGET_KINDS.map((k) => <option key={k} value={k}>{t(`fg.wk.${k}` as MsgKey)}</option>)}
          </NativeSelect>
        ) : <span className="flex-1 self-center text-xs text-muted-foreground">{t('fg.widget.other', { kind })}</span>}
        <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.widget.remove')} onClick={onRemove}>
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {kind === 'actions' ? (
        <div className="flex flex-col gap-1.5">
          {items.map((it, k) => (
            <div key={k} className="flex flex-col gap-1 rounded-md border border-border bg-background p-1.5">
              <div className="flex gap-1.5">
                <Input value={it.label ?? ''} placeholder={t('fg.widget.btnLabel')} aria-label={t('fg.widget.btnLabel')} className="max-md:h-10" onChange={(e) => setItem(k, { label: e.target.value })} />
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
