import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Field, NativeSelect, NumberBox, ShapeEditor } from './card-form'

type Agent = Record<string, any>

/** The agent's own header: name, when it runs, the fields it keeps, its panels. Edits go back as a new header. */
export function AgentForm({ agent, title, onAgent, onTitle, installed }: {
  agent: Agent
  title: string
  onAgent: (a: Agent) => void
  onTitle: (t: string) => void
  installed: boolean
}) {
  const t = useT()
  const trigger = (agent.trigger ?? { when: 'after', everyN: 1, keywords: [] }) as { when: string; everyN?: number; keywords?: string[] }
  const state = (agent.state ?? {}) as Record<string, any>
  const set = (patch: Agent) => onAgent({ ...agent, ...patch })
  const setTrigger = (patch: Record<string, unknown>) => set({ trigger: { ...trigger, ...patch } })
  const setState = (next: Record<string, any>) => { if (Object.keys(next).length) set({ state: next }); else { const { state: _s, ...rest } = agent; onAgent(rest) } }

  const [panels, setPanels] = useState(JSON.stringify(agent.panels ?? [], null, 2))
  const [panelsBad, setPanelsBad] = useState(false)
  useEffect(() => { setPanels(JSON.stringify(agent.panels ?? [], null, 2)); setPanelsBad(false) }, [agent.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const addField = () => {
    let i = Object.keys(state).length + 1
    while (`field${i}` in state) i++
    setState({ ...state, [`field${i}`]: { type: 'number', min: 0, max: 10, start: 0 } })
  }
  const renameField = (from: string, to: string) => {
    const v = to.replace(/[^A-Za-z0-9_-]/g, '')
    if (!/^[A-Za-z]/.test(v) || v === from || v in state) return false
    setState(Object.fromEntries(Object.entries(state).map(([k, f]) => [k === from ? v : k, f])))
    return true
  }
  const typed = (name: string, type: string) => {
    const was = state[name]
    if (was.type === type) return
    const next = type === 'number' ? { type, min: 0, max: 10, start: 0 } : type === 'list' ? { type, item: { name: 'text' }, max: 20 } : { type }
    setState({ ...state, [name]: next })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="forge-agent-form">
      <Field label={t('fg.agent.name')}>
        <Input value={String(agent.name ?? '')} className="max-md:h-10" onChange={(e) => { set({ name: e.target.value }); onTitle(e.target.value) }} />
      </Field>
      <Field label={t('fg.agent.id')} hint={installed ? t('fg.agent.idInstalled') : t('fg.agent.idHint')}>
        <Input value={String(agent.id ?? '')} readOnly className="font-mono max-md:h-10" />
      </Field>
      <Field label={t('fg.agent.description')} hint={t('fg.agent.descriptionHint')}>
        <Textarea value={String(agent.description ?? '')} rows={3} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label={t('fg.agent.author')}>
        <Input value={String(agent.author ?? '')} className="max-md:h-10" onChange={(e) => set({ author: e.target.value })} />
      </Field>

      <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={t('fg.trigger')}>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.trigger')}</h4>
        {trigger.when !== 'after' ? (
          <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">{t('fg.trigger.notYet', { when: trigger.when })}</p>
        ) : null}
        <Field label={t('fg.trigger.when')}>
          <NativeSelect value={trigger.when} onChange={(when) => setTrigger({ when })}>
            <option value="after">{t('fg.trigger.after')}</option>
            {trigger.when !== 'after' && <option value={trigger.when}>{trigger.when}</option>}
          </NativeSelect>
        </Field>
        <Field label={t('fg.trigger.every')} hint={t('fg.trigger.everyHint')}>
          <NumberBox value={trigger.everyN ?? 1} min={1} max={50} onChange={(n) => setTrigger({ everyN: n ?? 1 })} />
        </Field>
        <Field label={t('fg.trigger.keywords')} hint={t('fg.trigger.keywordsHint')}>
          <Input defaultValue={(trigger.keywords ?? []).join(', ')} placeholder={t('fg.trigger.keywordsEg')} className="max-md:h-10"
            onBlur={(e) => setTrigger({ keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={t('fg.state')}>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.state')}</h4>
        <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.state.lead')}</p>
        {Object.entries(state).map(([name, f]) => (
          <div key={name} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <div className="flex gap-1.5">
              <Input defaultValue={name} aria-label={t('fg.state.name')} className="max-md:h-10" onBlur={(e) => { if (!renameField(name, e.target.value)) e.target.value = name }} />
              <NativeSelect value={f.type} label={t('fg.state.type')} onChange={(type) => typed(name, type)}>
                <option value="number">{t('fg.shape.number')}</option>
                <option value="text">{t('fg.shape.text')}</option>
                <option value="flag">{t('fg.shape.bool')}</option>
                <option value="list">{t('fg.state.list')}</option>
              </NativeSelect>
              <Button variant="ghost" size="icon" className="shrink-0 max-md:size-10" aria-label={t('fg.state.remove')} onClick={() => { const { [name]: _gone, ...rest } = state; setState(rest) }}>
                <Trash className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {f.type === 'number' && (
              <div className="grid grid-cols-3 gap-1.5">
                <Field label={t('fg.state.min')}><NumberBox value={f.min} onChange={(n) => setState({ ...state, [name]: { ...f, min: n } })} /></Field>
                <Field label={t('fg.state.max')}><NumberBox value={f.max} onChange={(n) => setState({ ...state, [name]: { ...f, max: n } })} /></Field>
                <Field label={t('fg.state.start')}><NumberBox value={f.start} onChange={(n) => setState({ ...state, [name]: { ...f, start: n } })} /></Field>
              </div>
            )}
            {f.type === 'list' && (
              <>
                <Field label={t('fg.state.entry')} hint={t('fg.state.entryHint')}>
                  <ShapeEditor shape={f.item ?? {}} kinds={['text', 'number']} onChange={(item) => setState({ ...state, [name]: { ...f, item } })} />
                </Field>
                <Field label={t('fg.state.maxEntries')}><NumberBox value={f.max} min={1} max={500} onChange={(n) => setState({ ...state, [name]: { ...f, max: n ?? 20 } })} /></Field>
              </>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={addField}><Plus className="size-3.5" aria-hidden="true" />{t('fg.state.add')}</Button>
      </section>

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.panels')}</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.panels.lead')}</p>
          <Textarea value={panels} rows={10} className={cn('font-mono text-xs', panelsBad && 'border-destructive')} aria-label={t('fg.panels')} onChange={(e) => {
            setPanels(e.target.value)
            try {
              const v = JSON.parse(e.target.value)
              if (Array.isArray(v)) { setPanelsBad(false); if (v.length) set({ panels: v }); else { const { panels: _p, ...rest } = agent; onAgent(rest) } } else setPanelsBad(true)
            } catch { setPanelsBad(true) }
          }} />
          <span className={cn('text-[11px]', panelsBad ? 'text-destructive' : 'text-muted-foreground')}>{panelsBad ? t('fg.advanced.bad') : t('fg.panels.hint')}</span>
        </div>
      </details>
    </div>
  )
}
