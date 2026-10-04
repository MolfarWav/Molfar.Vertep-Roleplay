
import { useEffect, useRef, useState } from "react"
import { Plus, Trash, Asterisk, UploadSimple, DownloadSimple, Flask, X, CaretDown, CaretRight, SlidersHorizontal, Globe, UserCircle, Chats } from '@phosphor-icons/react'
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useApp } from "@/lib/store"
import { regexImport, regexExport, downloadJson } from "@/lib/interop"
import { uid } from "@/lib/tokens"
import type { RegexScript } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MasterDetail } from "@/components/shell/master-detail"
import { useConfirm } from '@/components/ui/confirm'
import { runRegexSafe, type SafeRegexResult } from '@/lib/safe-regex'

const PLACEMENTS: [keyof RegexScript["placements"], string][] = [
  ["userInput", "User input"],
  ["aiOutput", "AI output"],
  ["slash", "Slash commands"],
  ["wi", "World info"],
  ["reasoning", "Reasoning"],
]

const SCOPE_LABEL: Record<RegexScript["scope"], string> = {
  global: "Global",
  character: "Character",
  chat: "Chat",
  preset: "Preset",
}


function HighlightedInput({ text, matches }: { text: string; matches: { start: number; end: number }[] }) {
  if (matches.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let last = 0
  matches.forEach((mt, i) => {
    if (mt.start > last) parts.push(<span key={`t${i}`}>{text.slice(last, mt.start)}</span>)
    parts.push(
      <mark key={`m${i}`} className="rounded-sm bg-primary/25 text-foreground">
        {text.slice(mt.start, mt.end)}
      </mark>,
    )
    last = mt.end
  })
  if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>)
  return <>{parts}</>
}

function TestSandbox({ script }: { script: RegexScript }) {
  const [input, setInput] = useState("Hello *waves* — this is a \"test\" message.\nShe said: \"Try the pattern here.\"")
  // runs in a Worker: a catastrophic-backtracking pattern must cost a
  // "timed out" badge, not the whole tab (the blank-screen bug)
  const [result, setResult] = useState<SafeRegexResult>({ ok: true, output: input, matches: [] })
  useEffect(() => {
    let alive = true
    void runRegexSafe(script.find, script.flags, script.replace, input, { trims: script.trimStrings, timeoutMs: 400 })
      .then((r) => { if (alive) setResult(r) })
    return () => { alive = false }
  }, [script.find, script.flags, script.replace, script.trimStrings, input])
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Flask className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Test Sandbox</span>
        {result.error ? (
          <Badge variant="destructive" className="ml-auto text-[10px]">{result.error}</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {(result.matches ?? []).length} match{(result.matches ?? []).length === 1 ? "" : "es"}
          </Badge>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Input</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            className="font-mono text-xs"
            placeholder="Paste sample text to test against"
          />
          <div className="min-h-10 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-xs leading-relaxed">
            <HighlightedInput text={input} matches={result.matches ?? []} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Output</Label>
          <div className="min-h-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-card p-2 font-mono text-xs leading-relaxed">
            {result.output || <span className="text-muted-foreground">Empty output</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RegexView() {
  const scripts = useApp((s) => s.regexScripts)
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const presets = useApp((s) => s.presets)
  const updateRegex = useApp((s) => s.updateRegex)
  const addRegex = useApp((s) => s.addRegex)
  const deleteRegex = useApp((s) => s.deleteRegex)
  const [selectedId, setSelectedId] = useState<string | null>(scripts[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const [trimDraft, setTrimDraft] = useState("")
  const importRef = useRef<HTMLInputElement>(null)

  const selected = scripts.find((r) => r.id === selectedId) ?? null

  const select = (id: string | null) => {
    setSelectedId(id)
    setDetailOpen(id !== null)
  }
  const set = (patch: Partial<RegexScript>) => selected && updateRegex(selected.id, patch)

  const handleImport = async (files: FileList | null) => {
    if (!files) return
    let firstId: string | null = null
    for (const file of Array.from(files)) {
      try {
        const json = JSON.parse(await file.text())
        const arr = Array.isArray(json) ? json : [json]
        let ok = 0
        for (const item of arr) {
          const rx = regexImport(item)
          if (rx) {
            const id = uid("rx")
            useApp.setState((s) => ({ regexScripts: [...s.regexScripts, { ...rx, id, order: s.regexScripts.length }] }))
            firstId ??= id
            ok++
          }
        }
        if (ok > 0) toast.success(`${file.name}: ${ok} script${ok > 1 ? "s" : ""} imported`)
        else toast.error(`${file.name}: no valid regex scripts`)
      } catch {
        toast.error(`${file.name}: invalid JSON`)
      }
    }
    if (firstId) setSelectedId(firstId)
  }

  // ── Grouped master list: preset groups first (each under its preset
  // header), then global / character / chat, each in run order. Preset groups start collapsed
  // unless they hold the selection, so big preset packs don't flood the list.
  type RegexGroup = {
    key: string
    title: string
    kind: 'preset' | 'global' | 'character' | 'chat'
    targetId: string | null
    scripts: RegexScript[]
  }
  const presetById = new Map(presets.map((p) => [p.id, p]))
  const charById = new Map(characters.map((c) => [c.id, c]))
  const chatById = new Map(chats.map((c) => [c.id, c]))
  const groups: RegexGroup[] = (() => {
    const out: RegexGroup[] = []
    const presetBuckets = new Map<string | null, RegexScript[]>()
    const charBuckets = new Map<string | null, RegexScript[]>()
    const chatBuckets = new Map<string | null, RegexScript[]>()
    const global: RegexScript[] = []
    for (const s of scripts) {
      if (s.scope === 'preset') {
        const k = s.scopeTargetId ?? null
        presetBuckets.set(k, [...(presetBuckets.get(k) ?? []), s])
      } else if (s.scope === 'character') {
        const k = s.scopeTargetId ?? null
        charBuckets.set(k, [...(charBuckets.get(k) ?? []), s])
      } else if (s.scope === 'chat') {
        const k = s.scopeTargetId ?? null
        chatBuckets.set(k, [...(chatBuckets.get(k) ?? []), s])
      } else global.push(s)
    }
    // scripts run in list order: show them in it
    const byOrder = (a: RegexScript, b: RegexScript) => a.order - b.order
    for (const [pid, list] of [...presetBuckets.entries()].sort(([a], [b]) =>
      (presetById.get(a ?? '')?.name ?? '~~').localeCompare(presetById.get(b ?? '')?.name ?? '~~'))) {
      const p = pid ? presetById.get(pid) : undefined
      out.push({
        key: `preset:${pid ?? 'unbound'}`,
        title: p ? p.name : 'Preset: unbound',
        kind: 'preset', targetId: pid,
        scripts: [...list].sort(byOrder),
      })
    }
    if (global.length) out.push({ key: 'global', title: 'Global', kind: 'global', targetId: null, scripts: [...global].sort(byOrder) })
    for (const [cid, list] of charBuckets) {
      const c = cid ? charById.get(cid) : undefined
      out.push({ key: `char:${cid ?? 'unbound'}`, title: c ? c.name : 'Character: unbound', kind: 'character', targetId: cid, scripts: [...list].sort(byOrder) })
    }
    for (const [cid, list] of chatBuckets) {
      const c = cid ? chatById.get(cid) : undefined
      out.push({ key: `chat:${cid ?? 'unbound'}`, title: c ? c.title : 'Chat: unbound', kind: 'chat', targetId: cid, scripts: [...list].sort(byOrder) })
    }
    return out
  })()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isCollapsed = (g: RegexGroup) => {
    if (collapsed[g.key] !== undefined) return collapsed[g.key]
    if (g.kind === 'preset') return !g.scripts.some((s) => s.id === selectedId)
    return false
  }
  const toggleGroup = (g: RegexGroup) => {
    const shut = isCollapsed(g)
    setCollapsed((c) => ({ ...c, [g.key]: !shut }))
  }
  const addToGroup = (g: RegexGroup) => {
    const id = addRegex(g.kind === 'global' ? 'global' : g.kind)
    if (g.targetId) updateRegex(id, { scopeTargetId: g.targetId })
    setCollapsed((c) => ({ ...c, [g.key]: false }))
    select(id)
  }
  const deleteGroup = (g: RegexGroup) => {
    void confirm({
      title: `Delete ${g.scripts.length} script${g.scripts.length === 1 ? '' : 's'} of “${g.title}”?`,
      description: 'The scripts are removed for good and stop working everywhere. This cannot be undone.',
    }).then((yes) => {
      if (!yes) return
      const ids = new Set(g.scripts.map((s) => s.id))
      for (const s of g.scripts) deleteRegex(s.id)
      if (selectedId && ids.has(selectedId)) {
        const next = scripts.find((r) => !ids.has(r.id))?.id ?? null
        setSelectedId(next)
        setDetailOpen(false)
      }
      toast.success(`Deleted ${ids.size} script${ids.size === 1 ? '' : 's'}`)
    })
  }
  const GROUP_ICON = { preset: SlidersHorizontal, global: Globe, character: UserCircle, chat: Chats } as const
  const renderRow = (script: RegexScript) => (
    <button
      key={script.id}
      type="button"
      onClick={() => select(script.id)}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selectedId === script.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      <Asterisk className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{script.name}</span>
      {script.scope !== "global" && (
        <span className="shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {SCOPE_LABEL[script.scope].slice(0, 4)}
        </span>
      )}
      <span
        className={cn("size-1.5 shrink-0 rounded-full", script.enabled ? "bg-primary" : "bg-muted-foreground/30")}
        aria-hidden
      />
    </button>
  )

  return (
    <>
    <MasterDetail
      detailOpen={detailOpen && !!selected}
      onBack={() => setDetailOpen(false)}
      detailTitle={selected?.name}
      master={
        <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regex Scripts</span>
          <div className="flex items-center gap-0.5">
            <input
              ref={importRef}
              type="file"
              accept=".json"
              multiple
              className="hidden"
              onChange={(e) => { handleImport(e.target.files); e.target.value = "" }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => importRef.current?.click()}
              aria-label="Import regex scripts"
              title="Import regex scripts"
            >
              <UploadSimple className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => select(addRegex("global"))}
              aria-label="Add regex script"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1.5 p-1.5">
            {groups.map((g) => {
              const GIcon = GROUP_ICON[g.kind]
              const shut = isCollapsed(g)
              return (
                <div key={g.key} className="overflow-hidden rounded-lg border border-border/50">
                  <div className="flex items-center gap-0.5 bg-muted/50 py-0.5 pl-1 pr-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g)}
                      aria-expanded={!shut}
                      title={shut ? `Expand ${g.title}` : `Collapse ${g.title}`}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1.5 text-left hover:bg-accent/50"
                    >
                      {shut ? <CaretRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <CaretDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <GIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{g.title}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {g.scripts.length}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={() => addToGroup(g)}
                      aria-label={`Add script to ${g.title}`}
                      title={`Add script to ${g.title}`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteGroup(g)}
                      aria-label={`Delete all ${g.scripts.length} scripts of ${g.title}`}
                      title={`Delete all scripts of ${g.title}`}
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  </div>
                  {!shut && (
                    <div className="flex flex-col gap-0.5 p-1">
                      {g.scripts.map(renderRow)}
                    </div>
                  )}
                </div>
              )
            })}
            {scripts.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No scripts yet</p>}
          </div>
        </ScrollArea>
        </div>
      }
      detail={
        selected ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
              <Input
                value={selected.name}
                onChange={(e) => set({ name: e.target.value })}
                className="text-sm font-medium"
                aria-label="Script name"
              />
              <Switch checked={selected.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Enabled" />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => { downloadJson(regexExport(selected), `${selected.name.replace(/[^\w-]+/g, "_")}.json`); toast.success("Exported regex script") }}
                aria-label="Export script"
                title="Export regex script"
              >
                <DownloadSimple className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => void confirm({
                  title: `Delete ${selected.name}?`,
                  description: 'The regex script is removed from disk. Chats stop applying it.',
                }).then((yes) => {
                  if (!yes) return
                  const next = scripts.find((r) => r.id !== selected.id)?.id ?? null
                  deleteRegex(selected.id)
                  setSelectedId(next)
                  setDetailOpen(false)
                })}
                aria-label="Delete script"
              >
                <Trash className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Scope</Label>
                <Select
                  value={selected.scope}
                  onValueChange={(v) => set({ scope: v as RegexScript["scope"], scopeTargetId: null })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="character">Character</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="preset">Preset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selected.scope === "character" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Character</Label>
                  <Select value={selected.scopeTargetId ?? ""} onValueChange={(v) => set({ scopeTargetId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a character" />
                    </SelectTrigger>
                    <SelectContent>
                      {characters.filter((c) => !c.isGroup).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selected.scope === "chat" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Chat</Label>
                  <Select value={selected.scopeTargetId ?? ""} onValueChange={(v) => set({ scopeTargetId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a chat" />
                    </SelectTrigger>
                    <SelectContent>
                      {chats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selected.scope === "preset" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Preset</Label>
                  <Select value={selected.scopeTargetId ?? ""} onValueChange={(v) => set({ scopeTargetId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Find Regex</Label>
                <Input
                  value={selected.find}
                  onChange={(e) => set({ find: e.target.value })}
                  placeholder="pattern"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex w-20 flex-col gap-1.5">
                <Label className="text-xs">Flags</Label>
                <Input
                  value={selected.flags}
                  onChange={(e) => set({ flags: e.target.value })}
                  placeholder="gi"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Replace With</Label>
              <Input
                value={selected.replace}
                onChange={(e) => set({ replace: e.target.value })}
                placeholder="replacement: $1, $2 for groups, {{match}} for the trimmed match"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">Trim Out</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {selected.trimStrings.map((t, i) => (
                  <Badge key={`${t}-${i}`} variant="secondary" className="gap-1 font-mono text-[10px]">
                    {JSON.stringify(t)}
                    <button
                      type="button"
                      onClick={() => set({ trimStrings: selected.trimStrings.filter((_, j) => j !== i) })}
                      aria-label={`Remove trim string ${t}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
                <Input
                  value={trimDraft}
                  onChange={(e) => setTrimDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && trimDraft) {
                      e.preventDefault()
                      set({ trimStrings: [...selected.trimStrings, trimDraft] })
                      setTrimDraft("")
                    }
                  }}
                  placeholder="Add string to erase from matches, Enter to add"
                  className="h-7 w-64 font-mono text-xs"
                  aria-label="Add trim string"
                />
              </div>
            </div>

            <TestSandbox script={selected} />

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applies to</span>
              {PLACEMENTS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <Switch
                    checked={selected.placements[key]}
                    onCheckedChange={(v) => set({ placements: { ...selected.placements, [key]: v } })}
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Changes</span>
              <label className="flex items-center justify-between text-sm">
                <span>Only what&apos;s shown</span>
                <Switch checked={selected.markdownOnly} onCheckedChange={(v) => set({ markdownOnly: v })} />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Only what the model reads</span>
                <Switch checked={selected.promptOnly} onCheckedChange={(v) => set({ promptOnly: v })} />
              </label>
              <p className="text-xs text-muted-foreground">
                {selected.markdownOnly && selected.promptOnly ? 'Display and prompt change; the saved message stays as written.'
                  : selected.markdownOnly ? 'Only the display changes; the model and the saved message see the original.'
                  : selected.promptOnly ? 'Only the prompt changes; you see the original.'
                  : 'Rewrites the message itself when it is saved. Existing messages are not touched.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <label className="flex items-center justify-between text-sm">
                <span>Also run when I edit a message</span>
                <Switch
                  checked={selected.runOnEdit}
                  disabled={selected.markdownOnly || selected.promptOnly}
                  onCheckedChange={(v) => set({ runOnEdit: v })}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Macro Substitution</Label>
                <Select value={selected.macroMode} onValueChange={(v) => set({ macroMode: v as RegexScript["macroMode"] })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don&apos;t substitute</SelectItem>
                    <SelectItem value="raw">Substitute (raw)</SelectItem>
                    <SelectItem value="escaped">Substitute (escaped)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {"Whether {{macros}} in the Find pattern are replaced before matching, raw or regex-escaped."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Min Depth</Label>
                  <Input
                    type="number"
                    value={selected.minDepth ?? ""}
                    onChange={(e) => set({ minDepth: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Max Depth</Label>
                  <Input
                    type="number"
                    value={selected.maxDepth ?? ""}
                    onChange={(e) => set({ maxDepth: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select or create a regex script
          </div>
        )
      }
    />
    {confirmDialog}
    </>
  )
}
