
import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, Plus, Copy, Trash, Lock, SealCheck, Eye, CaretDown, DownloadSimple, UploadSimple, ArrowsOut, X, GitDiff, Books as LibraryIcon, DotsSixVertical, Star, DotsThreeVertical, PencilSimple } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ui/confirm'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { useDragList } from '@/lib/drag-list'
import { presetExport, downloadJson } from '@/lib/interop'
import { estimateTokens, formatTokens, uid } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { Preset, PromptSection, SectionGroup, ID } from '@/lib/types'
import { SamplersPanel } from '@/components/views/samplers-panel'
import { MasterDetail } from '@/components/shell/master-detail'
import { PresetDiffDialog } from '@/components/presets/preset-diff-dialog'
import { ShapingPanel } from '@/components/presets/shaping-panel'
import { PromptPeekDialog } from '@/components/chat/prompt-peek-dialog'

const triggerOptions = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet']

/**
 * Human labels + docs for the utility prompts, mirroring the standard
 * "Utility Prompts" drawer. The hints matter most for the blank-by-default
 * fields, where an empty box is a deliberate setting rather than an oversight.
 */
const UTILITY_PROMPT_META: Record<
  keyof Preset['utilityPrompts'],
  { label: string; hint: string; placeholder?: string }
> = {
  impersonation: {
    label: 'Impersonation prompt',
    hint: 'Sent when you ask the model to write your next message for you.',
  },
  continueNudge: {
    label: 'Continue nudge',
    hint: 'Appended on a continue when Continue Prefill is off. With prefill on, the partial reply is resent instead and this is unused.',
  },
  newChat: {
    label: 'New chat prompt',
    hint: 'Injected once at the top of a freshly started chat.',
  },
  groupNudge: {
    label: 'Group nudge',
    hint: 'Tells the model which member of a group chat is speaking this turn.',
  },
  emptySend: {
    label: 'Empty send replacement',
    hint: 'Substituted for your message when you send an empty box. Leave blank (the default) to send nothing at all and let the model continue straight from history.',
    placeholder: 'Blank (send no replacement text)',
  },
}

export function PresetsView() {
  const presets = useApp((s) => s.presets)
  const updatePreset = useApp((s) => s.updatePreset)
  const usePreset = useApp((s) => s.usePreset)
  const duplicatePreset = useApp((s) => s.duplicatePreset)
  const deletePreset = useApp((s) => s.deletePreset)
  const activeChatId = useApp((s) => s.activeChatId)
  const chats = useApp((s) => s.chats)
  const composerDraft = useApp((s) => s.composerDraft)
  const __focus = useApp.getState().focusPresetId
  useEffect(() => { if (__focus) useApp.setState({ focusPresetId: null }) }, [])
  // the preset in use right now: the open chat's own, else the one new chats
  // start with. The view opens on it, since that's the one you're about to tweak.
  const activePresetId = chats.find((c) => c.id === activeChatId)?.presetId
  const activeId = activePresetId && presets.some((p) => p.id === activePresetId)
    ? activePresetId
    : (presets.find((p) => p.isDefault)?.id ?? null)
  const [selectedId, setSelectedId] = useState(__focus ?? activeId ?? presets[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [peekOpen, setPeekOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const [diffOpen, setDiffOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const preset = presets.find((p) => p.id === selectedId) ?? presets[0]

  const select = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  const importPreset = useApp((st) => st.importPreset)
  const handleImport = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !preset) return
    let json: unknown
    try { json = JSON.parse(await file.text()) } catch { toast.error('Invalid JSON file'); return }
    try {
      const r = await importPreset(json, file.name.replace(/\.json$/i, ''), preset)
      setSelectedId(r.preset.id)
      toast.success(`Imported ${r.preset.name} (${r.preset.sections.length} prompts${r.scripts ? `, ${r.scripts} regex scripts` : ''})`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

    // presets accumulate for years; the sidebar pages through them
  const PRESET_PAGE = 100
  const [presetPage, setPresetPage] = useState(0)
  const pagedPresets = presets.slice(clampPage(presetPage, presets.length, PRESET_PAGE) * PRESET_PAGE, (clampPage(presetPage, presets.length, PRESET_PAGE) + 1) * PRESET_PAGE)

  return (
    <SectionPage section="presets" count={presets.length} hideOnPhone={detailOpen && !!preset}>
    <MasterDetail
      detailOpen={detailOpen && !!preset}
      onBack={() => setDetailOpen(false)}
      detailTitle={preset?.name}
      masterWidth="w-56"
      master={
        <aside className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <PaneTitle section="presets" icon={<SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />} />
          {/* import lives here so mobile can import without opening a preset */}
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="sr-only"
            onChange={(e) => { handleImport(e.target.files); e.target.value = '' }}
            aria-label="Import preset file"
          />
          <Button variant="ghost" size="sm" className="ml-auto size-7 p-0" onClick={() => importRef.current?.click()} aria-label="Import preset">
            <UploadSimple className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => { const src = preset ?? presets[0]; if (src) { const id = duplicatePreset(src.id); select(id) } }} aria-label="New preset (copy of the open one)">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-1.5">
            {pagedPresets.map((p) => (
              <li key={p.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  className={cn('flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm', p.id === preset?.id ? 'bg-accent' : 'hover:bg-accent/50')}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.readOnly && <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {p.id === activeId && <SealCheck className="size-3 text-primary" aria-hidden="true" />}
                    {p.id === activeId && <span className="text-primary">currently using</span>}
                    <span>{p.sections.filter((s) => s.enabled).length}/{p.sections.length} prompts</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="icon-sm" className="size-7 shrink-0 text-muted-foreground" aria-label={`Actions for ${p.name}`}>
                      <DotsThreeVertical className="size-4" aria-hidden="true" />
                    </Button>
                  } />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={p.id === activeId} onClick={() => { usePreset(p.id); toast.success(`Using preset: ${p.name}`) }}>
                      <Star className="size-4" aria-hidden="true" />Use this preset
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { const id = duplicatePreset(p.id); select(id) }}>
                      <Copy className="size-4" aria-hidden="true" />Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={p.id === 'default' || presets.length <= 1}
                      onClick={() => void confirm({
                        title: `Delete ${p.name}?`,
                        description: 'The preset file is removed from disk. Chats that used it fall back to the default.',
                      }).then((yes) => {
                        if (!yes) return
                        deletePreset(p.id)
                        setSelectedId(presets.find((x) => x.id !== p.id)?.id ?? '')
                        setDetailOpen(false)
                      })}
                    >
                      <Trash className="size-4" aria-hidden="true" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
          <Pager total={presets.length} page={clampPage(presetPage, presets.length, PRESET_PAGE)} pageSize={PRESET_PAGE} onPage={setPresetPage} />
        </ScrollArea>
      </aside>
      }
      detail={
        preset ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* header + section tabs scroll WITH the editor (mobile keyboard room) */}
          <Tabs defaultValue="prompts" className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <Input
              value={preset.name}
              disabled={preset.readOnly}
              onChange={(e) => updatePreset(preset.id, { name: e.target.value })}
              className="h-8 w-full text-sm font-medium md:w-52"
              aria-label="Preset name"
            />
            {preset.readOnly && <Badge variant="outline">stock · read-only</Badge>}
            {preset.id === activeId && <Badge variant="secondary">currently using</Badge>}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setPeekOpen(true)}>
                <Eye className="size-3.5" aria-hidden="true" />Prompt peek
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={presets.length < 2}
                onClick={() => setDiffOpen(true)}
              >
                <GitDiff className="size-3.5" aria-hidden="true" />Compare
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => importRef.current?.click()}>
                <UploadSimple className="size-3.5" aria-hidden="true" />Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { downloadJson(presetExport(preset, useApp.getState().regexScripts), `${preset.name.replace(/[^\w-]+/g, '_')}.json`); toast.success('Exported preset') }}
              >
                <DownloadSimple className="size-3.5" aria-hidden="true" />Export
              </Button>
              {preset.readOnly ? (
                <Button size="sm" className="text-xs" onClick={() => { const id = duplicatePreset(preset.id); setSelectedId(id); toast.success('Editable copy created') }}>
                  Create editable copy
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { const id = duplicatePreset(preset.id); setSelectedId(id) }} aria-label="Duplicate preset">
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { usePreset(preset.id); toast.success(`Using preset: ${preset.name}`) }} disabled={preset.id === activeId}>Use this preset</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void confirm({
                    title: `Delete ${preset.name}?`,
                    description: 'The preset file is removed from disk. Chats that used it fall back to the default.',
                  }).then((yes) => {
                    if (!yes) return
                    deletePreset(preset.id); setSelectedId(presets.find((p) => p.id !== preset.id)?.id ?? ""); setDetailOpen(false)
                  })} aria-label="Delete preset">
                    <Trash className="size-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          </header>

          {/* scrollable strip: padding lives INSIDE the scroller so the
              first/last tabs stop short of the walls instead of clipping */}
            <div
              className="mt-2 overflow-x-auto overscroll-x-contain px-4 no-scrollbar"
              onWheel={(e) => {
                if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  e.currentTarget.scrollLeft += e.deltaY
                }
              }}
            >
              <TabsList className="h-8 w-max flex-nowrap md:h-auto md:w-full md:flex-wrap md:gap-y-1">
                <TabsTrigger value="prompts" className="flex-none px-2.5 text-xs">Prompt manager</TabsTrigger>
                <TabsTrigger value="samplers" className="flex-none px-2.5 text-xs">Samplers</TabsTrigger>
                <TabsTrigger value="shaping" className="flex-none px-2.5 text-xs">Shaping</TabsTrigger>
                <TabsTrigger value="utility" className="flex-none px-2.5 text-xs">Utility prompts</TabsTrigger>
                <TabsTrigger value="variables" className="flex-none px-2.5 text-xs">Variables</TabsTrigger>
              </TabsList>
            </div>
            <div className={cn('p-4', preset.readOnly && 'pointer-events-none opacity-60')}>
                {preset.readOnly && (
                  <p className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Stock preset, everything below is read-only. Use “Create editable copy” above to make changes.
                  </p>
                )}
                <TabsContent value="prompts">
                  <SectionEditor preset={preset} onSelect={select} />
                </TabsContent>
                <TabsContent value="samplers">
                  <SamplersPanel preset={preset} />
                </TabsContent>
                <TabsContent value="shaping">
                  <ShapingPanel preset={preset} />
                </TabsContent>
                <TabsContent value="utility" className="mx-auto flex max-w-2xl flex-col gap-3">
                  {(Object.entries(preset.utilityPrompts) as [keyof Preset['utilityPrompts'], string][]).map(([key, val]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <Label className="text-xs">{UTILITY_PROMPT_META[key]?.label ?? key}</Label>
                      <Textarea
                        value={val}
                        rows={2}
                        disabled={preset.readOnly}
                        onChange={(e) => updatePreset(preset.id, { utilityPrompts: { ...preset.utilityPrompts, [key]: e.target.value } })}
                        aria-label={UTILITY_PROMPT_META[key]?.label ?? key}
                        placeholder={UTILITY_PROMPT_META[key]?.placeholder}
                        className="text-sm"
                      />
                      {UTILITY_PROMPT_META[key]?.hint && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {UTILITY_PROMPT_META[key].hint}
                        </p>
                      )}
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="variables" className="mx-auto flex max-w-2xl flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Typed variables usable in prompt sections via {'{{var:name}}'} macros. Values are picked per chat.</p>
                  {preset.variables.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                      <code className="text-xs text-primary">{'{{var:' + v.name + '}}'}</code>
                      <Input
                        value={v.label} disabled={preset.readOnly} aria-label={`Label for ${v.name}`}
                        className="h-7 w-32 text-xs"
                        onChange={(e) => updatePreset(preset.id, { variables: preset.variables.map((x) => x.id === v.id ? { ...x, label: e.target.value } : x) })}
                      />
                      <Badge variant="outline" className="text-[10px]">{v.type}</Badge>
                      {v.options && <span className="text-[11px] text-muted-foreground">{v.options.join(' / ')}</span>}
                      <Input
                        value={v.defaultValue} disabled={preset.readOnly} aria-label={`Default for ${v.name}`}
                        className="ml-auto h-7 w-28 text-xs"
                        onChange={(e) => updatePreset(preset.id, { variables: preset.variables.map((x) => x.id === v.id ? { ...x, defaultValue: e.target.value } : x) })}
                      />
                      {!preset.readOnly && (
                        <Button variant="ghost" size="icon-sm" className="size-6 p-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.name}`}
                          onClick={() => updatePreset(preset.id, { variables: preset.variables.filter((x) => x.id !== v.id) })}>
                          <X className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-fit text-xs" disabled={preset.readOnly}
                    onClick={() => { const name = `var${preset.variables.length + 1}`; updatePreset(preset.id, { variables: [...preset.variables, { id: uid('var'), name, label: name, type: 'text', defaultValue: '' }] }); toast.success(`Added {{var:${name}}}, edit it below`) }}>
                    <Plus className="size-3.5" aria-hidden="true" />Add variable
                  </Button>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>

          <PromptPeekDialog
            open={peekOpen}
            onOpenChange={setPeekOpen}
            chatId={activeChatId ?? chats[0]?.id ?? null}
            userText={composerDraft ?? undefined}
            title={`Prompt peek: ${preset.name}`}
          />
          {confirmDialog}
          <PresetDiffDialog open={diffOpen} onOpenChange={setDiffOpen} preset={preset} />
        </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No presets</div>
        )
      }
    />
    </SectionPage>
  )
}


/** Macros offered as one-tap hints under the prompt editors. */
const MACRO_HINTS = [
  '{{char}}', '{{user}}', '{{persona}}', '{{scenario}}', '{{time}}', '{{date}}',
  '{{random:a,b}}', '{{pick:a,b}}', '{{roll:d20}}', '{{lastMessage}}', '{{getvar::name}}', '{{setvar::name::value}}',
]
function SectionEditor({ preset, onSelect }: { preset: Preset; onSelect?: (id: string) => void }) {
  const updatePreset = useApp((s) => s.updatePreset)
  const duplicatePreset = useApp((s) => s.duplicatePreset)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const ro = preset.readOnly
  const library = preset.library ?? []
  // whole-row drag (press+move), plain click opens, live reorder preview —
  // exactly one commit on release
  const { containerRef, dragId, ordered, rowProps } = useDragList(preset.sections, (next) =>
    updatePreset(preset.id, { sections: next.map((s, i) => ({ ...s, order: i })) }))
  const upSection = (id: string, patch: Partial<PromptSection>) =>
    updatePreset(preset.id, { sections: preset.sections.map((s) => s.id === id ? { ...s, ...patch } : s) })
  /** Remove from the active order → the library (re-addable, never lost). */
  const removeToLibrary = (id: string) => {
    const sec = preset.sections.find((s) => s.id === id)
    if (!sec) return
    updatePreset(preset.id, {
      sections: preset.sections.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })),
      library: [...library, sec],
    })
    setExpandedId(null)
  }
  /** Bring a library prompt (or a fresh known one) back into the order. */
  const addFromLibrary = (sec: PromptSection) => {
    updatePreset(preset.id, {
      sections: [...preset.sections, { ...sec, order: preset.sections.length }],
      library: library.filter((l) => l.id !== sec.id),
    })
    setExpandedId(sec.id)
    setAddOpen(false)
  }
  const addBlank = () => {
    const sec: PromptSection = {
      id: uid('sec'), name: 'New prompt', enabled: true, role: 'system', marker: null, content: '',
      position: 'relative', depth: 4, order: preset.sections.length,
      injectionTriggers: [...triggerOptions], forbidOverrides: false, groupId: null,
    }
    updatePreset(preset.id, { sections: [...preset.sections, sec] })
    setExpandedId(sec.id)
    setAddOpen(false)
  }
  const deleteFromLibrary = (id: string) =>
    updatePreset(preset.id, { library: library.filter((l) => l.id !== id) })
  // Known marker identifiers that aren't currently placed (in order or library)
  const maximized = preset.sections.find((s) => s.id === maximizedId) ?? null

  const addGroup = () => {
    const g: SectionGroup = { id: uid('grp'), name: 'New group', wrapFormat: 'xml' }
    updatePreset(preset.id, { groups: [...(preset.groups ?? []), g] })
  }
  const upGroup = (id: ID, patch: Partial<SectionGroup>) =>
    updatePreset(preset.id, { groups: (preset.groups ?? []).map((g) => g.id === id ? { ...g, ...patch } : g) })
  const delGroup = (id: ID) => updatePreset(preset.id, {
    groups: (preset.groups ?? []).filter((g) => g.id !== id),
    sections: preset.sections.map((sec) => sec.groupId === id ? { ...sec, groupId: null } : sec),
  })
  const groupName = (id: ID | null) => (preset.groups ?? []).find((g) => g.id === id)?.name ?? null

  return (
    <div ref={containerRef} className="mx-auto flex max-w-3xl flex-col gap-1.5">
      {/* Groups: consecutive same-group sections merge into one wrapped block
          (xml tags or a markdown heading) at assembly */}
      {!ro && (preset.groups ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">Groups — neighboring sections in the same group render as one wrapped block.</p>
          {(preset.groups ?? []).map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-1.5">
              <Input
                value={g.name}
                onChange={(e) => upGroup(g.id, { name: e.target.value })}
                className="h-7 w-40 text-xs"
                aria-label={`Group ${g.name} name`}
              />
              <Select value={g.wrapFormat} onValueChange={(v) => v && upGroup(g.id, { wrapFormat: v as never })}>
                <SelectTrigger className="h-7 w-28 text-[11px]" aria-label={`Wrap format for ${g.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="xml">xml tags</SelectItem>
                  <SelectItem value="markdown">markdown heading</SelectItem>
                  <SelectItem value="none">merge only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete group ${g.name}`} onClick={() => delGroup(g.id)}>
                <Trash className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {!ro && (
        <Button variant="ghost" size="sm" className="h-7 self-start text-[11px] text-muted-foreground" onClick={addGroup}>
          <Plus className="size-3.5" aria-hidden="true" /> Add group
        </Button>
      )}
      {ro && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-foreground">Stock preset, duplicate to edit.</span>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => {
            const id = duplicatePreset(preset.id)
            onSelect?.(id)
            toast.success('Duplicated, the copy is editable')
          }}>
            <Copy className="size-3.5" aria-hidden="true" />Duplicate
          </Button>
        </div>
      )}
      {ordered.map((s) => {
        const expanded = expandedId === s.id
        return (
          <div
            key={s.id}
            data-rowid={s.id}
            className={cn(
              'flex flex-col rounded-md border border-border',
              !s.enabled && 'opacity-50',
              expanded && 'border-primary/40',
              dragId === s.id && 'opacity-50 ring-1 ring-primary/50',
            )}
          >
            {/* Row header — grab anywhere to drag, click to expand */}
            <div
              {...(ro ? {} : rowProps(s.id, () => setExpandedId(expanded ? null : s.id)))}
              className={cn('flex flex-wrap items-center gap-2 px-2.5 py-2', !ro && 'cursor-grab active:cursor-grabbing')}
            >
              {!ro && <DotsSixVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <Switch checked={s.enabled} disabled={ro} onCheckedChange={(v) => upSection(s.id, { enabled: v })} aria-label={`Enable ${s.name}`} />
              <span className="flex min-w-0 flex-1 items-center gap-2" aria-expanded={expanded}>
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.marker && <Badge variant="outline" className="shrink-0 text-[10px]">{s.marker}</Badge>}
                {s.content && <Badge variant="secondary" className="shrink-0 text-[10px]">{formatTokens(estimateTokens(s.content))} tok</Badge>}
              </span>
              {/* explicit open control — the whole-row tap can be claimed by
                  the drag gesture (touch hold, or browsers that don't
                  synthesize a click after our scroll blocker), so opening
                  must not depend on it. A real button never starts a drag. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={ro}
                onClick={() => setExpandedId(expanded ? null : s.id)}
                aria-label={expanded ? `Collapse ${s.name}` : `Edit ${s.name}`}
                aria-expanded={expanded}
              >
                {expanded
                  ? <CaretDown className="size-4 rotate-180" aria-hidden="true" />
                  : <PencilSimple className="size-4" aria-hidden="true" />}
              </Button>
            </div>

            {/* Expanded editor — Main Prompt is fully editable CUSTOM text
                (its content is the fallback when the character card has no
                system prompt of its own). Other engine markers are built by
                the engine (card fields, world info, history), but the
                engine HONORS typed content as an override — the nsfw
                marker's engine text is empty, so its text lives entirely
                here. Chat history is the one exception: its turns are
                inherently user/assistant, so its role stays fixed and
                there is nothing to override. */}
            {expanded && s.marker && s.marker !== 'main' ? (
              <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.marker === 'chatHistory' ? (
                    <span className="text-[11px] text-muted-foreground">
                      Role is fixed, chat turns are naturally user/assistant.
                    </span>
                  ) : (
                    <>
                      <span className="text-[11px] text-muted-foreground">Send as</span>
                      <Select value={s.role} onValueChange={(v) => v && upSection(s.id, { role: v as never })}>
                        <SelectTrigger className="h-7 w-24 text-[11px]" aria-label="Role" disabled={ro}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">system</SelectItem>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="assistant">assistant</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[11px] text-muted-foreground">
                        {s.marker === 'nsfw' ? 'Empty sends nothing. Type the prompt you want sent.' : 'Empty uses the engine-built text. Type your own to override.'}
                      </span>
                    </>
                  )}
                  <Button
                    variant="ghost" size="sm" className="ml-auto h-6 text-[11px] text-muted-foreground hover:text-foreground"
                    disabled={ro}
                    onClick={() => removeToLibrary(s.id)}
                  >
                    <LibraryIcon className="size-3" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
                {s.marker !== 'chatHistory' && (
                  <Textarea
                    value={s.content}
                    disabled={ro}
                    onChange={(e) => upSection(s.id, { content: e.target.value })}
                    aria-label={`${s.name} content`}
                    className="max-h-96 min-h-20 font-mono text-xs"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />
                )}
              </div>
            ) : expanded && (
              <div className="flex flex-col gap-2.5 border-t border-border px-2.5 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    value={s.name}
                    disabled={ro}
                    onChange={(e) => upSection(s.id, { name: e.target.value })}
                    className="h-7 w-44 text-xs"
                    aria-label="Section name"
                  />
                  <Select value={s.role} onValueChange={(v) => v && upSection(s.id, { role: v as never })}>
                    <SelectTrigger className="h-7 w-24 text-[11px]" aria-label="Role" disabled={ro}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">system</SelectItem>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="assistant">assistant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={s.position} onValueChange={(v) => v && upSection(s.id, { position: v as never })}>
                    <SelectTrigger className="h-7 w-28 text-[11px]" aria-label="Position" disabled={ro}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relative">relative</SelectItem>
                      <SelectItem value="in-chat">in-chat @depth</SelectItem>
                    </SelectContent>
                  </Select>
                  {s.position === 'in-chat' && (
                    <Input type="number" value={s.depth} disabled={ro} onChange={(e) => upSection(s.id, { depth: Number(e.target.value) })} className="h-7 w-14 text-[11px]" aria-label="Depth" />
                  )}
                  <Select value={s.groupId ?? 'none'} onValueChange={(v) => upSection(s.id, { groupId: v === 'none' ? null : v })}>
                    <SelectTrigger className="h-7 w-28 text-[11px]" aria-label={`Group for ${s.name}`} disabled={ro || !(preset.groups ?? []).length}>
                      <SelectValue>{(v) => v === 'none' ? 'no group' : (groupName(v as ID) ?? 'no group')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">no group</SelectItem>
                      {(preset.groups ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={s.condition ?? ''}
                    disabled={ro}
                    onChange={(e) => upSection(s.id, { condition: e.target.value })}
                    className="h-7 w-40 font-mono text-[11px]"
                    placeholder="if: var==value"
                    aria-label={`Condition for ${s.name}`}
                  />
                  <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setMaximizedId(s.id)} aria-label="Maximize editor">
                    <ArrowsOut aria-hidden="true" />
                  </Button>
                </div>

                <Textarea
                  value={s.content}
                  disabled={ro}
                  onChange={(e) => upSection(s.id, { content: e.target.value })}
                  aria-label={`${s.name} content`}
                  placeholder={s.marker === 'main' ? 'Empty = the character card’s system prompt (nothing if the card has none). Type to set your own.' : 'Prompt content…'}
                  className="max-h-96 min-h-28 font-mono text-xs"
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                />

                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="mr-1">Macros:</span>
                  {MACRO_HINTS.map((m) => (
                    <code key={m} className="rounded bg-muted px-1 py-0.5">{m}</code>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Triggers:</span>
                  {triggerOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={ro}
                      onClick={() => upSection(s.id, { injectionTriggers: s.injectionTriggers.includes(t) ? s.injectionTriggers.filter((x) => x !== t) : [...s.injectionTriggers, t] })}
                      className={cn('rounded-full border px-1.5 py-0.5', s.injectionTriggers.includes(t) ? 'border-primary bg-primary/15 text-primary' : 'border-border')}
                    >
                      {t}
                    </button>
                  ))}
                  <label className="ml-auto flex items-center gap-1">
                    <Switch checked={s.forbidOverrides} disabled={ro} onCheckedChange={(v) => upSection(s.id, { forbidOverrides: v })} aria-label="Forbid overrides" />
                    forbid overrides
                  </label>
                </div>

                <div>
                  <Button
                    variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                    disabled={ro}
                    onClick={() => removeToLibrary(s.id)}
                  >
                    <LibraryIcon className="size-3" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <Popover open={addOpen} onOpenChange={(o) => !ro && setAddOpen(o)}>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" className="mt-1 w-fit text-xs" disabled={ro} aria-label="Add prompt">
            <Plus className="size-3.5" aria-hidden="true" />Add prompt
          </Button>
        } />
        <PopoverContent align="start" className="w-72 p-2">
          <div className="flex flex-col gap-1">
            <button type="button" onClick={addBlank} className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
              <span>New custom prompt</span>
              <Badge variant="secondary" className="text-[10px]">text</Badge>
            </button>
            {library.length > 0 && (
              <>
                <p className="mt-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Removed
                </p>
                {library.map((l) => (
                  <div key={l.id} className="flex items-center gap-1">
                    <button type="button" onClick={() => addFromLibrary(l)} className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
                      <span className="truncate">{l.name}</span>
                      {l.marker && <Badge variant="outline" className="shrink-0 text-[10px]">{l.marker}</Badge>}
                    </button>
                    <Button
                      variant="ghost" size="sm" className="size-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${l.name} forever`} onClick={() => deleteFromLibrary(l.id)}
                    >
                      <Trash className="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </>
            )}

          </div>
        </PopoverContent>
      </Popover>

      {/* Maximized editor */}
      <Dialog open={!!maximized} onOpenChange={(o) => !o && setMaximizedId(null)}>
        <DialogContent className="flex h-[85dvh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {maximized?.name}
              {maximized?.marker && <Badge variant="outline" className="text-[10px]">{maximized.marker}</Badge>}
              <span className="ml-auto mr-6 text-xs font-normal text-muted-foreground">
                {maximized ? formatTokens(estimateTokens(maximized.content)) : 0} tok
              </span>
            </DialogTitle>
          </DialogHeader>
          {maximized && (
            <>
              <Textarea
                value={maximized.content}
                disabled={ro}
                onChange={(e) => upSection(maximized.id, { content: e.target.value })}
                aria-label={`${maximized.name} content maximized`}
                className="min-h-0 flex-1 resize-none font-mono text-sm"
              />
              <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                {MACRO_HINTS.map((m) => (
                  <code key={m} className="rounded bg-muted px-1 py-0.5">{m}</code>
                ))}
                <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={() => setMaximizedId(null)}>
                  <X className="size-3.5" aria-hidden="true" />Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
