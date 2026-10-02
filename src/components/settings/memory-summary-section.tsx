import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModelPicker } from '@/components/settings/model-picker'
import { useApp } from '@/lib/store'
import { embedConfig, embedStatus, fetchSummaryPromptDefault, setEmbedConfig } from '@/lib/engine'

const one = (v: number | readonly number[]) => (Array.isArray(v) ? v[0]! : (v as number))

/** A prompt as the user would see it changed: spacing and line endings do not count. */
const promptKey = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Memory: how the running summary is made and placed (compaction folds the
 * messages above a chat's cutoff into it), and how a chat's facts are kept.
 */
export function MemorySummarySection() {
  const summary = useApp((s) => s.settings.summary)
  const memory = useApp((s) => s.settings.memory)
  const updateSettings = useApp((s) => s.updateSettings)
  const set = (patch: Partial<typeof summary>) => updateSettings({ summary: { ...summary, ...patch } })
  const setMemory = (patch: Partial<typeof memory>) => updateSettings({ memory: { ...memory, ...patch } })
  const [embed, setEmbed] = useState<{ ok: boolean; via: string | null } | null>(null)
  const [embedModel, setEmbedModel] = useState('text-embedding-3-small')
  useEffect(() => { void embedStatus().then(setEmbed); void embedConfig().then((c) => setEmbedModel(c.model)) }, [])

  // The summary prompt ships with the engine. Settings keep one only when the
  // user changed it ('' = the shipped one), so the default follows updates.
  const [shipped, setShipped] = useState<{ prompt: string; past: string[] } | null>(null)
  const [draft, setDraft] = useState(summary.prompt)
  useEffect(() => { void fetchSummaryPromptDefault().then(setShipped).catch(() => undefined) }, [])
  const isShipped = (p: string) =>
    !promptKey(p) || (shipped !== null && [shipped.prompt, ...shipped.past].some((d) => promptKey(d) === promptKey(p)))
  // once the default is known, the box shows the effective prompt
  useEffect(() => {
    if (shipped) setDraft(isShipped(summary.prompt) ? shipped.prompt : summary.prompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipped])
  // and follows a change made elsewhere (a reset, a synced edit)
  useEffect(() => {
    if (!shipped) return
    setDraft((d) => (d === summary.prompt || (isShipped(d) && isShipped(summary.prompt)) ? d : isShipped(summary.prompt) ? shipped.prompt : summary.prompt))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.prompt])
  const editPrompt = (text: string) => {
    setDraft(text)
    set({ prompt: isShipped(text) ? '' : text })
  }

  // a chosen model whose connection is gone still shows inside the picker,
  // rather than the row silently reading "the chat's model"
  const memoryModel = memory.model ?? ''

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Memory model</p>
          <p className="text-xs text-muted-foreground">Writes summaries and finds facts. A cheaper one saves money.</p>
        </div>
        <ModelPicker
          value={memoryModel}
          onChange={(v) => setMemory({ model: v })}
          ariaLabel="Memory model"
        />
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Summary</p>
        <Field orientation="horizontal">
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="sum-auto">Compact automatically</FieldLabel>
            <p className="text-xs text-muted-foreground">When the chat outgrows the context, or on the interval below.</p>
          </div>
          <Switch id="sum-auto" checked={summary.mode === 'auto'} onCheckedChange={(v) => set({ mode: v ? 'auto' : 'manual' })} />
        </Field>
        {summary.mode === 'auto' && (
          <Field>
            <FieldLabel>Also every {summary.interval} messages</FieldLabel>
            <Slider value={[summary.interval]} min={10} max={200} step={5} onValueChange={(v) => set({ interval: one(v) })} />
          </Field>
        )}
        <Field>
          <FieldLabel>Keep the last {summary.keepRecent} messages word for word</FieldLabel>
          <Slider value={[summary.keepRecent]} min={1} max={30} step={1} onValueChange={(v) => set({ keepRecent: one(v) })} />
        </Field>
        <Field>
          <FieldLabel>Summary length: about {summary.targetLength} words</FieldLabel>
          <Slider value={[summary.targetLength]} min={50} max={1500} step={25} onValueChange={(v) => set({ targetLength: one(v) })} />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="sum-prompt">Summary prompt</FieldLabel>
            {!isShipped(summary.prompt) && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { set({ prompt: '' }); if (shipped) setDraft(shipped.prompt) }}>Reset</Button>
            )}
          </div>
          <Textarea
            id="sum-prompt"
            rows={5}
            value={draft}
            placeholder={shipped ? undefined : 'Loading the default prompt…'}
            disabled={!shipped && !summary.prompt}
            onChange={(e) => editPrompt(e.target.value)}
            onBlur={() => { if (shipped && !promptKey(draft)) setDraft(shipped.prompt) }}
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">{'{{summary}}'} is the summary so far, {'{{words}}'} the length. The messages being folded in follow it.{' '}
            {isShipped(summary.prompt) ? 'This is the default; it improves with updates until you change it.' : 'Changed from the default. Reset goes back to it.'}</p>
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Where the summary goes</p>
        <Select value={summary.position} onValueChange={(v) => v && set({ position: v as typeof summary.position })}>
          <SelectTrigger aria-label="Summary placement"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="after-system">Before the chat history</SelectItem>
            <SelectItem value="in-chat">Inside the chat, a few messages up</SelectItem>
            <SelectItem value="off">Only where a prompt uses {'{{summary}}'}</SelectItem>
          </SelectContent>
        </Select>
        {summary.position === 'in-chat' && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Depth: {summary.depth}</FieldLabel>
              <Slider value={[summary.depth]} min={0} max={16} step={1} onValueChange={(v) => set({ depth: one(v) })} />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select value={summary.role} onValueChange={(v) => v && set({ role: v as typeof summary.role })}>
                <SelectTrigger aria-label="Summary role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">system</SelectItem>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="assistant">assistant</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
        {summary.position !== 'off' && (
          <Field>
            <FieldLabel htmlFor="sum-template">Wrapper</FieldLabel>
            <Input id="sum-template" value={summary.template} onChange={(e) => set({ template: e.target.value })} className="font-mono text-xs" />
            {!summary.template.includes('{{summary}}') && <p className="text-[11px] text-destructive">Needs {'{{summary}}'} somewhere.</p>}
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Facts</p>
        <p className="text-xs text-muted-foreground">Short facts kept per chat. Pinned ones ride every prompt; the rest come back when the chat mentions them.</p>
        <div className="flex flex-wrap gap-6">
          <Field orientation="horizontal">
            <FieldLabel htmlFor="mem-enabled">Use facts</FieldLabel>
            <Switch id="mem-enabled" checked={memory.enabled} onCheckedChange={(v) => setMemory({ enabled: v })} />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="mem-auto">Find facts automatically</FieldLabel>
            <Switch id="mem-auto" checked={memory.auto} onCheckedChange={(v) => setMemory({ auto: v })} />
          </Field>
        </div>
        {memory.auto && (
          <Field>
            <FieldLabel>Look every {memory.interval} messages</FieldLabel>
            <Slider value={[memory.interval]} min={4} max={100} step={2} onValueChange={(v) => setMemory({ interval: one(v) })} />
          </Field>
        )}
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {embed === null ? 'Matching by meaning: checking…'
            : embed.ok ? `Matching by meaning${embed.via ? ` via ${embed.via}` : ''}`
            : 'Matching by words only. An embeddings connection adds matching by meaning.'}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            onBlur={() => { if (embedModel.trim()) { void setEmbedConfig(embedModel.trim()).then(() => embedStatus(true).then(setEmbed)) } }}
            className="h-7 w-56 font-mono text-[11px]"
            aria-label="Embeddings model"
          />
          <span className="text-[11px] text-muted-foreground">embeddings model</span>
        </div>
      </div>
    </div>
  )
}
