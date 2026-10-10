import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { defaultIdsOf, isOff } from '@/components/chat/preset-choices'
import { useApp } from '@/lib/store'
import { uid } from '@/lib/tokens'
import type { Preset, PromptVariable, PromptVariableChoice } from '@/lib/types'

type VarType = PromptVariable['type']

const TYPE_LABEL: Record<VarType, string> = {
  choice: 'Choice (options with prompt text)',
  toggle: 'Toggle (on / off)',
  text: 'Text',
  number: 'Number',
  slider: 'Slider',
  dropdown: 'Dropdown (plain options)',
  multi: 'Multi-select (plain options)',
}

/**
 * The preset's variables: what the user picks per chat. A `choice` variable carries options (a label the
 * user sees and the prompt text it stands for); prompt sections read the pick as {{name}}, in
 * {{#if}} blocks, or in a section condition.
 */
export function VariablesPanel({ preset }: { preset: Preset }) {
  const updatePreset = useApp((s) => s.updatePreset)
  const ro = preset.readOnly
  const setVars = (variables: PromptVariable[]) => updatePreset(preset.id, { variables })
  const update = (id: string, patch: Partial<PromptVariable>) => setVars(preset.variables.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const add = (type: VarType) => {
    const name = `${type === 'choice' ? 'choice' : 'var'}${preset.variables.length + 1}`
    const v: PromptVariable = {
      id: uid('var'), name, label: name, type, defaultValue: type === 'toggle' ? 'false' : '',
      ...(type === 'choice' ? { choices: [{ id: uid('opt'), label: 'Option 1', value: '' }], display: 'list' as const } : {}),
    }
    setVars([...preset.variables, v])
    toast.success(`Added {{${name}}}, edit it below`)
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Description</Label>
        <Textarea
          value={preset.description ?? ''}
          rows={3}
          disabled={ro}
          aria-label="Preset description"
          placeholder="What this preset is for. Shown in the chat's Preset panel under “About this preset”."
          className="text-sm"
          onChange={(e) => updatePreset(preset.id, { description: e.target.value })}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Variables are picked per chat (the chat's Preset panel and the step before a chat starts). In prompt sections,{' '}
        <code className="text-primary">{'{{name}}'}</code> or <code className="text-primary">{'{{var:name}}'}</code> insert the value;{' '}
        <code className="text-primary">{'{{#if name == "value"}}…{{else}}…{{/if}}'}</code> picks text; a section condition{' '}
        <code className="text-primary">name</code>, <code className="text-primary">!name</code> or <code className="text-primary">name==value</code>{' '}
        turns the whole section on or off.
      </p>
      {preset.variables.map((v, i) => (
        <VariableCard
          key={v.id}
          v={v}
          ro={ro}
          first={i === 0}
          last={i === preset.variables.length - 1}
          onChange={(patch) => update(v.id, patch)}
          onMove={(dir) => {
            const list = [...preset.variables]
            const j = i + dir
            if (j < 0 || j >= list.length) return
            ;[list[i], list[j]] = [list[j], list[i]]
            setVars(list)
          }}
          onDelete={() => setVars(preset.variables.filter((x) => x.id !== v.id))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="text-xs" disabled={ro} onClick={() => add('choice')}>
          <Plus className="size-3.5" aria-hidden="true" />Add choice variable
        </Button>
        <Button variant="outline" size="sm" className="text-xs" disabled={ro} onClick={() => add('text')}>
          <Plus className="size-3.5" aria-hidden="true" />Add variable
        </Button>
      </div>
    </>
  )
}

function VariableCard({
  v, ro, first, last, onChange, onMove, onDelete,
}: {
  v: PromptVariable
  ro: boolean
  first: boolean
  last: boolean
  onChange: (patch: Partial<PromptVariable>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const choices = v.choices ?? []
  const defaults = defaultIdsOf(v)
  const setChoices = (next: PromptVariableChoice[], nextDefaults?: string[]) =>
    onChange({ choices: next, defaults: (nextDefaults ?? v.defaults ?? []).filter((id) => next.some((c) => c.id === id)) })
  const updateChoice = (id: string, patch: Partial<PromptVariableChoice>) => setChoices(choices.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const moveChoice = (i: number, dir: -1 | 1) => {
    const list = [...choices]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setChoices(list)
  }
  const setDefault = (id: string) => {
    if (v.multi) onChange({ defaults: defaults.includes(id) ? defaults.filter((x) => x !== id) : [...defaults, id] })
    else onChange({ defaults: [id] })
  }
  const changeType = (type: VarType) => {
    const patch: Partial<PromptVariable> = { type }
    if (type === 'choice') { patch.choices = v.choices ?? []; patch.display = v.display ?? 'list'; patch.defaultValue = '' }
    if (type === 'toggle' && v.defaultValue !== 'true' && v.defaultValue !== 'false') patch.defaultValue = 'false'
    if ((type === 'dropdown' || type === 'multi') && !v.options) patch.options = []
    onChange(patch)
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-2.5 py-2 text-sm" data-var-editor={v.name}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs text-primary">{`{{${v.name}}}`}</code>
        <Badge variant="outline" className="text-[10px]">{v.type}</Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" className="size-6 p-0" disabled={ro || first} aria-label={`Move ${v.name} up`} onClick={() => onMove(-1)}>
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-6 p-0" disabled={ro || last} aria-label={`Move ${v.name} down`} onClick={() => onMove(1)}>
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
          {!ro && (
            <Button variant="ghost" size="icon-sm" className="size-6 p-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.name}`} onClick={onDelete}>
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Name (used in the prompt)</Label>
          <Input
            value={v.name} disabled={ro} aria-label={`Name of ${v.name}`} className="h-7 font-mono text-xs"
            onChange={(e) => onChange({ name: e.target.value.replace(/[^\w.-]/g, '') })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Label (shown to the user)</Label>
          <Input value={v.label} disabled={ro} aria-label={`Label for ${v.name}`} className="h-7 text-xs" onChange={(e) => onChange({ label: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">Type</Label>
        <Select value={v.type} onValueChange={(t) => t && changeType(t as VarType)} disabled={ro}>
          <SelectTrigger className="h-7 w-full text-xs sm:w-72" aria-label={`Type of ${v.name}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABEL) as VarType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {v.type === 'choice' && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Question (a help line under the label)</Label>
            <Input value={v.question ?? ''} disabled={ro} aria-label={`Question for ${v.name}`} className="h-7 text-xs" onChange={(e) => onChange({ question: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Display</Label>
              <Select value={v.display ?? 'list'} onValueChange={(d) => d && onChange({ display: d as 'list' | 'buttons' })} disabled={ro}>
                <SelectTrigger className="h-7 w-32 text-xs" aria-label={`Display of ${v.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">List</SelectItem>
                  <SelectItem value="buttons">Buttons</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-1 text-xs">
              <Switch checked={v.multi === true} disabled={ro} aria-label={`Several picks for ${v.name}`} onCheckedChange={(on) => onChange({ multi: on, defaults: on ? v.defaults : (v.defaults ?? []).slice(0, 1) })} />
              Several picks
            </label>
            {v.multi && (
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">Separator</Label>
                <Input value={v.separator ?? ', '} disabled={ro} aria-label={`Separator of ${v.name}`} className="h-7 w-24 font-mono text-xs" onChange={(e) => onChange({ separator: e.target.value })} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Options: the label is what the user picks, the text is what goes into the prompt{v.multi ? ' (tick the ones on by default)' : ' (the marked one is the default)'}
            </Label>
            {choices.map((c, i) => (
              <div key={c.id} className="flex items-start gap-1.5 rounded-md border border-border/70 p-1.5" data-option={c.id}>
                <button
                  type="button"
                  role={v.multi ? 'checkbox' : 'radio'}
                  aria-checked={defaults.includes(c.id)}
                  aria-label={`${c.label || 'Option'} is a default`}
                  disabled={ro}
                  onClick={() => setDefault(c.id)}
                  className={`mt-1.5 flex size-4 shrink-0 items-center justify-center border ${v.multi ? 'rounded-[4px]' : 'rounded-full'} ${defaults.includes(c.id) ? 'border-primary bg-primary' : 'border-input'}`}
                >
                  {defaults.includes(c.id) && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Input value={c.label} disabled={ro} aria-label={`Label of option ${i + 1}`} placeholder="Label" className="h-7 text-xs" onChange={(e) => updateChoice(c.id, { label: e.target.value })} />
                  <Textarea value={c.value} disabled={ro} rows={2} aria-label={`Prompt text of option ${i + 1}`} placeholder="Prompt text (may use macros like {{char}})" className="text-xs" onChange={(e) => updateChoice(c.id, { value: e.target.value })} />
                </div>
                <div className="flex shrink-0 flex-col">
                  <Button variant="ghost" size="icon-sm" className="size-6 p-0" disabled={ro || i === 0} aria-label={`Move option ${i + 1} up`} onClick={() => moveChoice(i, -1)}>
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="size-6 p-0" disabled={ro || i === choices.length - 1} aria-label={`Move option ${i + 1} down`} onClick={() => moveChoice(i, 1)}>
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  </Button>
                  {!ro && (
                    <Button variant="ghost" size="icon-sm" className="size-6 p-0 text-muted-foreground hover:text-destructive" aria-label={`Delete option ${i + 1}`} onClick={() => setChoices(choices.filter((x) => x.id !== c.id))}>
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit text-xs" disabled={ro} onClick={() => setChoices([...choices, { id: uid('opt'), label: `Option ${choices.length + 1}`, value: '' }])}>
              <Plus className="size-3.5" aria-hidden="true" />Add option
            </Button>
          </div>
        </>
      )}

      {v.type === 'toggle' && (
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!isOff(v.defaultValue)} disabled={ro} aria-label={`Default of ${v.name}`} onCheckedChange={(on) => onChange({ defaultValue: on ? 'true' : 'false' })} />
          On by default
        </label>
      )}

      {v.type !== 'choice' && v.type !== 'toggle' && (
        <>
          {v.options && <span className="text-[11px] text-muted-foreground">Options: {v.options.join(' / ') || 'none'}</span>}
          {v.type === 'slider' && (
            <div className="flex gap-2">
              <Input type="number" value={v.min ?? 0} disabled={ro} aria-label={`Minimum of ${v.name}`} className="h-7 w-20 text-xs" onChange={(e) => onChange({ min: Number(e.target.value) })} />
              <Input type="number" value={v.max ?? 100} disabled={ro} aria-label={`Maximum of ${v.name}`} className="h-7 w-20 text-xs" onChange={(e) => onChange({ max: Number(e.target.value) })} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Default</Label>
            <Input value={v.defaultValue} disabled={ro} aria-label={`Default for ${v.name}`} className="h-7 text-xs" onChange={(e) => onChange({ defaultValue: e.target.value })} />
          </div>
        </>
      )}
    </div>
  )
}
