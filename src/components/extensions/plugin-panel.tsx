import { useMemo, useState } from 'react'
import { Plus, ArrowCounterClockwise, CaretDown, Check, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { j } from '@/lib/engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useApp } from '@/lib/store'
import { cn, shortModel } from '@/lib/utils'

/** A plugin ships its own UI as a declarative panel (uiPanel hook →
 *  /__panels): the shape below is the whole contract. The plugin owns the
 *  labels, rows, fields and action URLs; this renderer just draws them. */

export interface PanelField {
  key: string
  label: string
  /** 'model' = engine model picker grouped by endpoint (live catalog);
   *  stores the qualified ref ("<provider>/<model id>"), '' = chat default */
  kind: 'text' | 'number' | 'textarea' | 'code' | 'select' | 'model'
  value: string | number
  /** muted one-liner under the control */
  hint?: string
  placeholder?: string
  /** preset options: dropdown (select) or quick picks (text). '' = chat default */
  list?: string[]
  /** textarea height; defaults to 4 (8 for code) */
  rows?: number
  /** rendered collapsed under an "Advanced" disclosure to keep panels compact */
  advanced?: boolean
}

export interface PanelItem {
  id: string
  title: string
  subtitle?: string
  badge?: string
  enabled: boolean
  saveUrl: string
  deleteUrl?: string
  deleteLabel?: string
  fields?: PanelField[]
  /** small muted footnote under the fields (constraints the plugin wants stated) */
  note?: string
}

export interface PluginPanelDescriptor {
  label: string
  icon?: string
  hint?: string
  items: PanelItem[]
  create?: { url: string; label: string }
}

/** Panel action URLs arrive from PLUGIN code: confine them to plain relative
 *  app paths — no traversal, no protocol-relative tricks, no query strings.
 *  A malicious app must not steer a panel button at engine-level routes. */
function safePanelUrl(u: string): string | null {
  return /^\/[a-zA-Z0-9/_-]*$/.test(u) ? u : null
}

/** '' is a legit option ("use default") but an empty Select value renders as
 *  placeholder — address it through a sentinel, translated back on change. */
const DEFAULT_SENTINEL = '__panel_default'

function OptionsField({ f, value, onChange }: { f: PanelField; value: string; onChange: (v: string) => void }) {
  const rawOpts = f.list ?? []
  const hasDefault = rawOpts.includes('')
  const opts = rawOpts.map((o) => (o === '' ? DEFAULT_SENTINEL : o))
  const sel = value === '' && hasDefault ? DEFAULT_SENTINEL : opts.includes(value) ? value : '__custom'
  const [custom, setCustom] = useState(sel === '__custom')

  return (
    <div>
      <Select
        value={custom ? '__custom' : sel}
        onValueChange={(v) => {
          if (v === '__custom') {
            setCustom(true)
            if (!custom) onChange(value)
          } else {
            setCustom(false)
            onChange(v === DEFAULT_SENTINEL ? '' : v)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rawOpts.map((o) => (
            <SelectItem key={o === '' ? DEFAULT_SENTINEL : o} value={o === '' ? DEFAULT_SENTINEL : o}>
              {o === '' ? 'Chat default (empty)' : o}
            </SelectItem>
          ))}
          <SelectItem value="__custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          className="mt-2 font-mono text-xs"
          value={value}
          placeholder={f.placeholder ?? 'provider/model-id'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {f.hint && <p className="mt-1.5 text-xs text-muted-foreground">{f.hint}</p>}
    </div>
  )
}

/** Endpoint-aware engine model picker. The same model id can exist on several
 *  endpoints (NanoGPT, OpenRouter, …), so rows are grouped under their
 *  connection name and the trigger always shows "Endpoint / model". Stores
 *  the qualified wire ref; '' means "use the chat's own model". */
function ModelField({ f, value, onChange }: { f: PanelField; value: string; onChange: (v: string) => void }) {
  const models = useApp((s) => s.models)
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)

  const current = models.find((m) => m.ref === value) ?? models.find((m) => m.id === value) ?? null
  const unknown = value !== '' && !current

  const groups = useMemo(() => {
    const order: string[] = []
    const byProvider = new Map<string, typeof models>()
    for (const m of models) {
      if (!byProvider.has(m.provider)) {
        byProvider.set(m.provider, [])
        order.push(m.provider)
      }
      byProvider.get(m.provider)!.push(m)
    }
    return order.map((name) => ({ name, models: byProvider.get(name)! }))
  }, [models])

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`${f.label}: ${current ? `${current.provider} ${shortModel(current.id)}` : value === '' ? 'chat default' : value}`}
            >
              {value === '' ? (
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">Chat default (uses chat model)</span>
              ) : current ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="shrink-0 rounded border border-border bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                    {current.provider}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={current.ref}>
                    {shortModel(current.id)}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-left font-mono text-xs" title={value}>
                  {value}
                </span>
              )}
              <CaretDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-80 p-0">
          <Command>
            <CommandInput placeholder="Search models or endpoints…" />
            <CommandList>
              <CommandEmpty>No models match.</CommandEmpty>
              <CommandGroup heading="Default">
                <CommandItem value="__chat_default" keywords={['chat', 'default']} onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="flex flex-1 items-center gap-2">
                    <span>Chat default (uses chat model)</span>
                    {value === '' && <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />}
                  </span>
                </CommandItem>
              </CommandGroup>
              {groups.map((g) => (
                <CommandGroup key={g.name} heading={`${g.name} · ${g.models.length}`}>
                  {g.models.map((m) => (
                    <CommandItem
                      key={m.ref}
                      value={m.ref}
                      keywords={[m.id, m.provider, m.ref]}
                      onSelect={() => { onChange(m.ref); setCustomOpen(false); setOpen(false) }}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2" title={m.ref}>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortModel(m.id)}</span>
                        {m.ref === value && <Check className="size-4 shrink-0" aria-hidden="true" />}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          {models.length === 0 || customOpen || unknown ? (
            <div className="border-t border-border p-2">
              {models.length === 0 && (
                <p className="mb-1.5 px-1 text-xs text-muted-foreground">
                  Engine model catalog is empty — type the ref manually.
                </p>
              )}
              <Input
                className="h-8 font-mono text-xs"
                value={value}
                placeholder={f.placeholder ?? 'provider/model-id'}
                onChange={(e) => onChange(e.target.value)}
                aria-label="Custom model ref"
              />
            </div>
          ) : (
            <button
              type="button"
              className="w-full border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setCustomOpen(true)}
            >
              Custom ref…
            </button>
          )}
        </PopoverContent>
      </Popover>
      {unknown ? (
        <p className="mt-1.5 text-xs text-destructive">
          Not in the engine catalog — check the ref or pick from the list above.
        </p>
      ) : (
        value !== '' && current && <p className="mt-1.5 font-mono text-[11px] break-all text-muted-foreground/80">Sends as: {current.ref}</p>
      )}
      {f.hint && <p className="mt-1.5 text-xs text-muted-foreground">{f.hint}</p>}
    </div>
  )
}

function FieldControl({ f, value, onChange }: { f: PanelField; value: string; onChange: (v: string) => void }) {
  // live engine catalog with endpoint grouping — the usable pick for model refs
  if (f.kind === 'model') return <ModelField f={f} value={value} onChange={onChange} />
  // preset list → dropdown with a custom-input escape hatch (most usable for model picks)
  if (((f.kind === 'text' || f.kind === 'select') && f.list?.length) || f.kind === 'select') {
    if (f.list?.length) return <OptionsField f={f} value={value} onChange={onChange} />
  }
  if (f.kind === 'text' || f.kind === 'number') {
    return (
      <div>
        <Input
          value={value}
          className={cn(f.kind === 'number' && 'max-w-32')}
          inputMode={f.kind === 'number' ? 'numeric' : undefined}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {f.hint && <p className="mt-1.5 text-xs text-muted-foreground">{f.hint}</p>}
      </div>
    )
  }
  return (
    <div>
      <Textarea
        value={value}
        rows={f.rows ?? (f.kind === 'code' ? 8 : 4)}
        placeholder={f.placeholder}
        className={cn('text-[13px] leading-relaxed', f.kind === 'code' && 'font-mono text-xs')}
        onChange={(e) => onChange(e.target.value)}
      />
      {f.hint && <p className="mt-1.5 text-xs text-muted-foreground">{f.hint}</p>}
    </div>
  )
}

function ItemEditor({ item, onSaved, onDeleted }: { item: PanelItem; onSaved: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((item.fields ?? []).map((f) => [f.key, String(f.value ?? '')])),
  )
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    const url = safePanelUrl(item.saveUrl)
    if (!url) return toast.error('Blocked an unsafe panel action')
    setBusy(true)
    try {
      await j(url, { method: 'PUT', body: JSON.stringify({ enabled: item.enabled, values }) })
      toast.success('Saved')
      onSaved()
    } catch (e) {
      toast.error('Save failed', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const url = item.deleteUrl ? safePanelUrl(item.deleteUrl) : null
    if (item.deleteUrl && !url) return toast.error('Blocked an unsafe panel action')
    try {
      if (url) await j(url, { method: 'DELETE' })
      toast.success(item.deleteLabel || 'Deleted')
      onDeleted()
    } catch (e) {
      toast.error('Delete failed', { description: (e as Error).message })
    }
  }

  const fields = item.fields ?? []
  const basic = fields.filter((f) => !f.advanced)
  const advanced = fields.filter((f) => f.advanced)

  /** consecutive plain number fields share one row — the scribe/curator
   *  cadence pair stops eating a full screen of vertical space */
  const rows: PanelField[][] = []
  for (const f of basic) {
    const last = rows[rows.length - 1]
    if (f.kind === 'number' && !f.list && last && last.length === 1 && last[0].kind === 'number' && !last[0].list) {
      last.push(f)
    } else {
      rows.push([f])
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
      {fields.length ? (
        <FieldGroup className="gap-3">
          {rows.map((group, i) => (
            <div key={i} className={cn(group.length > 1 && 'grid grid-cols-2 gap-3')}>
              {group.map((f) => (
                <Field key={f.key} className="gap-1.5">
                  <FieldLabel className="text-[13px]">{f.label}</FieldLabel>
                  <FieldControl f={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                </Field>
              ))}
            </div>
          ))}
          {advanced.length > 0 && (
            <details className="group rounded-md border border-border/60 px-2.5 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none group-open:mb-2">
                Advanced prompts ({advanced.length})
              </summary>
              <div className="flex flex-col gap-3">
                {advanced.map((f) => (
                  <Field key={f.key} className="gap-1.5">
                    <FieldLabel className="text-[13px]">{f.label}</FieldLabel>
                    <FieldControl f={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                  </Field>
                ))}
              </div>
            </details>
          )}
        </FieldGroup>
      ) : (
        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
      )}
      {item.note && <p className="mt-2 text-xs text-muted-foreground/80">{item.note}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>Save</Button>
        {item.deleteUrl && (
          <Button size="sm" variant="ghost" onClick={remove}>
            {item.deleteLabel ? <ArrowCounterClockwise className="size-3.5" aria-hidden="true" /> : <Trash className="size-3.5" aria-hidden="true" />}
            {item.deleteLabel || 'Delete'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function PluginPanelView({ panel, reload }: { panel: PluginPanelDescriptor; reload: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PanelItem | null>(null)

  const toggle = async (item: PanelItem, enabled: boolean) => {
    const url = safePanelUrl(item.saveUrl)
    if (!url) return toast.error('Blocked an unsafe panel action')
    try {
      await j(url, { method: 'PUT', body: JSON.stringify({ enabled }) })
      reload()
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    }
  }

  const create = async () => {
    if (!panel.create) return
    const url = safePanelUrl(panel.create.url)
    if (!url) return toast.error('Blocked an unsafe panel action')
    try {
      const r = await j<PanelItem>(url, { method: 'POST', body: JSON.stringify({}) })
      setDraft(r)
      setOpenId(r.id)
    } catch (e) {
      toast.error('Could not start a new item', { description: (e as Error).message })
    }
  }

  const items = draft ? [...panel.items, draft] : panel.items

  return (
    <div className="flex max-w-lg flex-col gap-3">
      {panel.hint && <p className="text-sm text-muted-foreground">{panel.hint}</p>}
      {items.map((item) => (
        <div key={item.id} className={cn('rounded-lg border border-border', openId === item.id && 'bg-muted/10')}>
          <div className="flex items-center gap-3 px-3 py-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
              <span className="block truncate text-sm font-medium">{item.title}</span>
              {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
            </button>
            {item.badge && <span className="rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">{item.badge}</span>}
            <Switch checked={item.enabled} onCheckedChange={(v) => { if (item !== draft) void toggle(item, v) }} aria-label={`Enable ${item.title}`} />
          </div>
          {openId === item.id && (
            <ItemEditor
              item={item}
              onSaved={() => { setDraft(null); setOpenId(null); reload() }}
              onDeleted={() => { setDraft(null); setOpenId(null); reload() }}
            />
          )}
        </div>
      ))}
      {panel.create && (
        <Button variant="outline" size="sm" className="w-fit" onClick={create}>
          <Plus className="size-3.5" aria-hidden="true" /> {panel.create.label}
        </Button>
      )}
    </div>
  )
}
