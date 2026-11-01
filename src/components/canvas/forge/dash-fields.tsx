// The Dashboard fields in the agent editor (#132, #196): the picker, the "Write to Dashboard" card and the block of
// Dashboard fields on the Input card. The lists come from the checker, so the form never offers what the file would be refused for.

import { Plus, Trash } from '@phosphor-icons/react'
import { DASH_FIELDS, DASH_WRITE_FIELDS } from '@/canvas-kit/boards/agent-check.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { Field, NativeSelect, NumberBox } from './card-form'

type Params = Record<string, unknown>
type Spec = { as: 'text' | 'number'; char?: true }

/** The three groups of the picker, in the order a person thinks of them. */
function groups(list: Record<string, Spec>): { key: MsgKey; fields: string[] }[] {
  const names = Object.keys(list)
  const all: { key: MsgKey; fields: string[] }[] = [
    { key: 'fg.dash.scene', fields: names.filter((f) => !list[f].char) },
    { key: 'fg.dash.charText', fields: names.filter((f) => list[f].char && list[f].as === 'text') },
    { key: 'fg.dash.charNum', fields: names.filter((f) => list[f].char && list[f].as === 'number') },
  ]
  return all.filter((g) => g.fields.length)
}

export function DashFieldSelect({ value, list, label, onChange }: { value: string; list: Record<string, Spec>; label: string; onChange: (field: string) => void }) {
  const t = useT()
  return (
    <NativeSelect value={value in list ? value : ''} label={label} onChange={onChange}>
      <option value="">{t('fg.pick')}</option>
      {groups(list).map((g) => (
        <optgroup key={g.key} label={t(g.key)}>
          {g.fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </optgroup>
      ))}
    </NativeSelect>
  )
}

/** The character box of a per-character field: empty means whoever wrote the last reply. */
function OfBox({ value, label, onChange }: { value: unknown; label: string; onChange: (name: string) => void }) {
  const t = useT()
  return (
    <Field label={label} hint={t('fg.dash.ofHint')}>
      <Input value={typeof value === 'string' ? value : ''} maxLength={60} placeholder={t('fg.dash.ofPlaceholder')} className="max-md:h-10" onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** `{...p}` with the keys that have no value left removed (an empty name or limit is the same as none). */
const tidy = (p: Params): Params => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''))

/** The form of a "Write to Dashboard" card: which field, for which character, and for a number how far it may go. */
export function DashWriteForm({ p, onParams }: { p: Params; onParams: (p: Params) => void }) {
  const t = useT()
  const field = String(p.field ?? '')
  const spec = DASH_WRITE_FIELDS[field] as Spec | undefined
  const clamp = (p.clamp && typeof p.clamp === 'object' ? p.clamp : {}) as { min?: number; max?: number; maxStep?: number }
  const setClamp = (patch: Record<string, number | undefined>) => {
    const next = tidy({ ...clamp, ...patch })
    onParams(tidy({ ...p, clamp: Object.keys(next).length ? next : undefined }))
  }
  return (
    <>
      <Field label={t('fg.dash.writeField')} hint={t('fg.dash.writeHint')}>
        <DashFieldSelect value={field} list={DASH_WRITE_FIELDS as Record<string, Spec>} label={t('fg.dash.writeField')} onChange={(f) => {
          const next = DASH_WRITE_FIELDS[f] as Spec | undefined
          onParams(tidy({ ...p, field: f, as: next?.as ?? p.as, of: next?.char ? p.of : undefined, clamp: next?.as === 'number' ? p.clamp : undefined }))
        }} />
      </Field>
      {spec?.char && <OfBox value={p.of} label={t('fg.dash.ofWrite')} onChange={(of) => onParams(tidy({ ...p, of: of.trim() ? of : undefined }))} />}
      {spec?.as === 'number' && (
        <Field label={t('fg.dash.limits')} hint={t('fg.dash.limitsHint')}>
          <div className="grid grid-cols-3 gap-2">
            {([['min', clamp.min, -100, 100], ['max', clamp.max, -100, 100], ['step', clamp.maxStep, 0, 200]] as const).map(([k, v, lo, hi]) => (
              <label key={k} className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-caption text-muted-foreground">{t(`fg.dash.${k}` as MsgKey)}</span>
                <NumberBox value={v} min={lo} max={hi} label={t(`fg.dash.${k}` as MsgKey)} onChange={(n) => setClamp({ [k === 'step' ? 'maxStep' : k]: n })} />
              </label>
            ))}
          </div>
        </Field>
      )}
    </>
  )
}

type Give = { id: string; source: string; field?: string; as?: string; of?: string } & Params

/** A port id nobody on the Input uses yet: the field's name, then `name2`, `name3` … */
function freeId(give: Give[], field: string, except?: string): string {
  const used = new Set(give.filter((g) => g.id !== except).map((g) => g.id))
  if (!used.has(field)) return field
  let i = 2
  while (used.has(`${field}${i}`)) i++
  return `${field}${i}`
}

/** The Dashboard fields on the Input card: the rows the agent reads, a character box where the field is per character. */
export function DashReadRows({ give, onGive }: { give: Give[]; onGive: (next: Give[]) => void }) {
  const t = useT()
  const rows = give.filter((g) => g.source === 'state')
  const swap = (row: Give, next: Give) => onGive(give.map((g) => (g === row ? next : g)))
  return (
    <Field label={t('fg.dash.readTitle')} hint={t('fg.dash.readHint')}>
      <div className="flex flex-col gap-2" data-testid="forge-dash-read">
        {rows.map((row) => {
          const spec = DASH_FIELDS[row.field ?? ''] as Spec | undefined
          return (
            <div key={row.id} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <DashFieldSelect value={row.field ?? ''} list={DASH_FIELDS as Record<string, Spec>} label={t('fg.dash.readField')} onChange={(f) => {
                    const next = DASH_FIELDS[f] as Spec | undefined
                    if (!next) return
                    const { of: _of, ...rest } = row
                    swap(row, { ...rest, id: freeId(give, f, row.id), field: f, as: next.as, ...(next.char && row.of ? { of: row.of } : {}) })
                  }} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 max-md:size-10" aria-label={t('fg.dash.readRemove')} onClick={() => { const next = give.filter((g) => g !== row); if (next.length) onGive(next) }}>
                  <Trash className="size-4" aria-hidden="true" />
                </Button>
              </div>
              {spec?.char && (
                <label className="flex flex-col gap-0.5">
                <span className="text-caption text-muted-foreground">{t('fg.dash.ofRead')}</span>
                <Input value={row.of ?? ''} maxLength={60} placeholder={t('fg.dash.ofPlaceholder')} aria-label={t('fg.dash.ofRead')} className="max-md:h-10"
                  onChange={(e) => { const { of: _of, ...rest } = row; swap(row, e.target.value.trim() ? { ...rest, of: e.target.value } : rest) }} />
                </label>
              )}
            </div>
          )
        })}
        <Button type="button" variant="outline" size="sm" className="self-start max-md:h-10" data-testid="forge-dash-add"
          onClick={() => onGive([...give, { id: freeId(give, 'place'), source: 'state', field: 'place', as: 'text' }])}>
          <Plus className="size-3.5" aria-hidden="true" />{t('fg.dash.readAdd')}
        </Button>
      </div>
    </Field>
  )
}
