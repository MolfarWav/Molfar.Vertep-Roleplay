
import { useEffect, useMemo, useRef, useState } from "react"
import { Archive, BookOpen, MagnifyingGlass, Check, DownloadSimple, UploadSimple, Trash, FileCode, FileImage, FileText, Asterisk as RegexIcon } from '@phosphor-icons/react'
import { ProseColorsSection } from "@/components/settings/prose-colors-section"
import { CustomCssSection } from "@/components/settings/custom-css-section"
import { MemorySummarySection } from "@/components/settings/memory-summary-section"
import { PROSE_FONTS } from "@/components/theme-applier"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useApp } from "@/lib/store"
import { useIsMobile } from "@/hooks/use-mobile"
import { MasterDetail } from "@/components/shell/master-detail"
import { SectionPage } from "@/components/shell/section-page"
import { resolveLanguage } from "@/lib/i18n"
import type { AppSettings } from "@/lib/types"
import { extractCharaFromPng, regexImport } from "@/lib/interop"
import { downloadBlob, fileToRawBase64, importLorebookFiles, j } from "@/lib/engine"
import { cn } from "@/lib/utils"

type ControlDef =
  | { kind: "switch"; key: keyof AppSettings; label: string }
  | { kind: "slider"; key: keyof AppSettings; label: string; min: number; max: number; step: number; unit?: string }
  | { kind: "select"; key: keyof AppSettings; label: string; options: [string, string][] }

interface SectionDef {
  id: string
  label: string
  controls: ControlDef[]
}

const SECTIONS: SectionDef[] = [
  {
    id: "appearance",
    label: "Appearance",
    controls: [
      // NOTE: no light/dark pick here — the Themes section is the single
      // source of truth (a light theme like Daylight switches the mode).
      { kind: "select", key: "language", label: "Interface Language", options: [["en", "English"], ["uk", "Українська"]] },
      { kind: "select", key: "proseFont", label: "Chat Font", options: PROSE_FONTS.map((f) => [f.id, f.label]) },
      { kind: "select", key: "chatWidth", label: "Chat Width", options: [["full", "Full"], ["comfortable", "Comfortable"], ["compact", "Compact"]] },
      { kind: "slider", key: "fontScale", label: "Font Scale", min: 70, max: 150, step: 5, unit: "%" },
      { kind: "slider", key: "lineSpacing", label: "Line Spacing", min: 110, max: 220, step: 2, unit: "%" },
      { kind: "slider", key: "paragraphSpacing", label: "Paragraph Spacing", min: 0, max: 32, step: 1, unit: "px" },
      { kind: "slider", key: "uiScale", label: "UI Scale", min: 70, max: 140, step: 5, unit: "%" },
      { kind: "slider", key: "avatarScale", label: "Avatar Scale", min: 50, max: 200, step: 10, unit: "%" },
      { kind: "select", key: "messageSpacing", label: "Message Spacing", options: [["compact", "Compact"], ["cozy", "Cozy"], ["roomy", "Roomy"]] },
      { kind: "select", key: "quoteStyle", label: "Quote Style", options: [["default", "Default"], ["bold", "Bold"], ["glow", "Glow"], ["underline", "Underline"]] },
      { kind: "switch", key: "hideAvatars", label: "Hide Avatars" },
      { kind: "switch", key: "reducedMotion", label: "Reduced Motion" },
      { kind: "switch", key: "dayDividers", label: "Day Dividers" },
    ],
  },
  {
    id: "chat",
    label: "Chat Behavior",
    controls: [
      { kind: "switch", key: "sendOnEnter", label: "Send on Enter" },
      { kind: "switch", key: "upArrowEditLast", label: "Up Arrow Recalls Input History" },
      { kind: "switch", key: "autoScroll", label: "Auto-scroll" },
      { kind: "switch", key: "confirmDeletions", label: "Confirm Deletions" },
      { kind: "switch", key: "showTimestamps", label: "Show Timestamps" },
      { kind: "switch", key: "showMessageIds", label: "Show Message IDs" },
      { kind: "switch", key: "showEdited", label: "Show Edited Markers" },
      { kind: "switch", key: "showTokens", label: "Show Token Counts" },
      { kind: "switch", key: "showCache", label: "Show Cached Tokens" },
      { kind: "switch", key: "showCost", label: "Show Chat Cost" },
      { kind: "switch", key: "italicNarration", label: "Italicize Narration" },
      { kind: "switch", key: "showModelIcons", label: "Show Model Badges" },
      { kind: "switch", key: "showGenTimer", label: "Show Generation Timer" },
      { kind: "switch", key: "expandMessageActions", label: "Expand Message Actions" },
      { kind: "switch", key: "showExpressionSprites", label: "Expression Sprites" },
      { kind: "slider", key: "messagesToLoad", label: "Messages to Load", min: 10, max: 200, step: 10 },
    ],
  },
  {
    id: "streaming",
    label: "Streaming",
    controls: [
      { kind: "slider", key: "streamingFps", label: "Streaming FPS", min: 10, max: 120, step: 5 },
      { kind: "switch", key: "reasoningAutoExpand", label: "Auto-expand Thinking" },
    ],
  },
]

export function SettingsView() {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const themes = useApp((s) => s.themes)
  const section = useApp((s) => s.selectedSettingsSection)
  const setSection = useApp((s) => s.setSettingsSection)
  const isMobile = useIsMobile()
  const [query, setQuery] = useState("")
  const [detailOpen, setDetailOpen] = useState(false)
  // deep-links (palette "Settings: …") open the section directly; the plain
  // Settings tab opens on the section LIST first — one tap to pick, like Chats.
  const initialSection = useRef(section)
  useEffect(() => {
    if (section !== initialSection.current) setDetailOpen(true)
  }, [section])

  const navItems = [
    ...SECTIONS.map((s) => ({ id: s.id, label: s.label })),
    { id: "memory", label: "Memory" },
    { id: "themes", label: "Themes" },
    { id: "prose", label: "Prose Colors" },
    { id: "custom-css", label: "Custom CSS" },
    { id: "studio-import", label: "Import" },
    { id: "data", label: "Data" },
  ]
  const activeLabel = navItems.find((n) => n.id === section)?.label ?? "Settings"

  const q = query.trim().toLowerCase()
  const matchedSections = useMemo(
    () => (q ? navItems.filter((n) => n.label.toLowerCase().includes(q)) : []),
    [q],
  )
  const filtered = useMemo(() => {
    if (!q) return null
    return SECTIONS.map((s) => ({ ...s, controls: s.controls.filter((c) => c.label.toLowerCase().includes(q)) })).filter(
      (s) => s.controls.length > 0,
    )
  }, [q])

  // Custom CSS is injected last, so a `.mes_text { font-family: … }` rule in it
  // beats the Chat Font picker — the picker then looks broken. Say so instead.
  const cssPinsProseFont = /\.mes_text[^{]*\{[^}]*font-family/i.test(settings.customCss)

  const renderControl = (c: ControlDef) => {
    // the stored value may be unset or an old string: show what is in effect
    const value = c.key === "language" ? resolveLanguage(settings.language) : settings[c.key]
    if (c.kind === "switch") {
      return (
        <label key={c.key} className="flex items-center justify-between py-1.5 text-sm">
          <span>{c.label}</span>
          <Switch checked={value as boolean} onCheckedChange={(v) => updateSettings({ [c.key]: v })} />
        </label>
      )
    }
    if (c.kind === "slider") {
      return (
        <div key={c.key} className="flex flex-col gap-1.5 py-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>{c.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{String(value)}{c.unit ?? ""}</span>
          </div>
          <Slider
            value={[value as number]}
            min={c.min}
            max={c.max}
            step={c.step}
            onValueChange={(v) => updateSettings({ [c.key]: Array.isArray(v) ? v[0] : v })}
            aria-label={c.label}
          />
        </div>
      )
    }
    const note = c.key === "proseFont" && cssPinsProseFont ? "Custom CSS is setting this font." : null
    return (
      <div key={c.key} className="flex items-center justify-between py-1.5 text-sm">
        <span className="flex flex-col">
          {c.label}
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
        </span>
        <Select value={value as string} onValueChange={(v) => v && updateSettings({ [c.key]: v })}>
          <SelectTrigger className="w-40" aria-label={c.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {c.options.map(([val, label]) => (
              <SelectItem
                key={val}
                value={val}
                // the font picker previews itself: every option renders in its
                // own face, so the effect of a pick is visible before committing
                style={c.key === "proseFont" ? { fontFamily: PROSE_FONTS.find((f) => f.id === val)?.stack } : undefined}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const renderSection = (s: SectionDef) => (
    <div key={s.id} className="flex flex-col gap-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h3>
      <div className="rounded-lg border border-border px-3 py-1.5">{s.controls.map(renderControl)}</div>
    </div>
  )

  // the search-results block, shared by the detail pane and (on mobile,
  // where the detail pane is a separate page that typing never opens) the
  // master pane itself — otherwise the section list just sits there and
  // search reads as dead
  const searchResults = filtered ? (
    <>
      {matchedSections.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sections</h3>
          <div className="flex flex-col rounded-lg border border-border p-1">
            {matchedSections.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { setQuery(""); setSection(n.id); setDetailOpen(true) }}
                className="flex min-h-9 items-center rounded-md px-2.5 text-left text-sm transition-colors hover:bg-accent"
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {filtered.length > 0 ? (
        filtered.map(renderSection)
      ) : matchedSections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No settings match &quot;{query}&quot;</p>
      ) : null}
    </>
  ) : null

  return (
    <SectionPage section="settings" hideOnPhone={detailOpen}>
    <MasterDetail
      detailOpen={detailOpen}
      onBack={() => setDetailOpen(false)}
      detailTitle={activeLabel}
      masterWidth="w-56"
      master={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-border p-2">
            <div className="relative">
              <MagnifyingGlass className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings"
                className="h-8 pl-7 text-sm"
                aria-label="Search settings"
              />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {isMobile && searchResults ? (
              <div className="flex flex-col gap-4 p-3">{searchResults}</div>
            ) : (
              <nav className="flex flex-col gap-0.5 p-1.5" aria-label="Settings sections">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setQuery(""); setSection(item.id); setDetailOpen(true) }}
                    className={cn(
                      "flex min-h-11 items-center rounded-md px-3 text-left text-sm transition-colors",
                      section === item.id && !q ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            )}
          </ScrollArea>
        </div>
      }
      detail={
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
            {searchResults ?? (section === "themes" ? (
              <ThemesSection themes={themes} activeThemeId={settings.activeThemeId} onPick={(id) => updateSettings({ activeThemeId: id })} />
            ) : section === "memory" ? (
              <MemorySummarySection />
            ) : section === "prose" ? (
              <ProseColorsSection />
            ) : section === "custom-css" ? (
              <CustomCssSection />
            ) : section === "studio-import" ? (
              <STImportSection />
            ) : section === "data" ? (
              <DataSection />
            ) : (
              renderSection(SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!)
            ))}
          </div>
        </ScrollArea>
      }
    />
    </SectionPage>
  )
}

function ThemesSection({ themes, activeThemeId, onPick }: {
  themes: { id: string; name: string; colors: { accent: string; chatBg: string; userTint: string; charTint: string } }[]
  activeThemeId: string
  onPick: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Themes</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              activeThemeId === t.id ? "border-primary bg-accent" : "border-border hover:bg-accent/50",
            )}
          >
            <div className="flex gap-1" aria-hidden>
              {[t.colors.accent, t.colors.chatBg, t.colors.userTint, t.colors.charTint].map((color, i) => (
                <span key={i} className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span className="flex-1 text-sm">{t.name}</span>
            {activeThemeId === t.id && <Check className="size-4 text-primary" aria-label="Active theme" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Theme colors are applied live over the base design tokens. Override quote and narration colors in{" "}
        <SectionLink id="prose">Prose Colors</SectionLink>; <SectionLink id="custom-css">Custom CSS</SectionLink> is injected last and wins over everything.
      </p>
    </div>
  )
}

function SectionLink({ id, children }: { id: string; children: React.ReactNode }) {
  const setSection = useApp((s) => s.setSettingsSection)
  return (
    <button type="button" onClick={() => setSection(id)} className="text-primary underline underline-offset-2 hover:no-underline">
      {children}
    </button>
  )
}

function STImportSection() {
  const presetInput = useRef<HTMLInputElement>(null)
  const charInput = useRef<HTMLInputElement>(null)
  const regexInput = useRef<HTMLInputElement>(null)
  const chatInput = useRef<HTMLInputElement>(null)
  const loreInput = useRef<HTMLInputElement>(null)

  const handlePresets = async (files: FileList | null) => {
    if (!files) return
    const importPreset = useApp.getState().importPreset
    for (const file of Array.from(files)) {
      try {
        const r = await importPreset(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ""))
        toast.success(`Preset imported: ${r.preset.name} (${r.preset.sections.length} prompts${r.scripts ? `, ${r.scripts} regex scripts` : ""})`)
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? "invalid JSON"}`) }
    }
  }

  const handleCharacters = async (files: FileList | null) => {
    if (!files) return
    const cards: unknown[] = []
    for (const file of Array.from(files)) {
      try {
        const lower = file.name.toLowerCase()
        if (lower.endsWith(".png")) {
          const json = await extractCharaFromPng(file)
          if (!json) { toast.error(`${file.name}: no embedded character data found`); continue }
          cards.push(json)
        } else if (lower.endsWith(".charx")) {
          // a charx package IS a zip with card.json — the plugin unpacks it
          const r = await j<Record<string, unknown>>("/import/zip", {
            method: "POST",
            body: JSON.stringify({ zipBase64: await fileToRawBase64(file) }),
          })
          const got = (r.characters as string[] | undefined)?.length ?? 0
          if (got) toast.success(`${file.name}: card imported`)
          else toast.error(`${file.name}: no card.json in package`)
          continue
        } else {
          let json = JSON.parse(await file.text()) as Record<string, unknown>
          // native wrappers: unwrap the first card-shaped value
          if (!json || typeof json.name !== "string") {
            for (const key of ["character", "card", "data"]) {
              const inner = (json as Record<string, unknown>)?.[key]
              if (inner && typeof inner === "object" && typeof (inner as { name?: unknown }).name === "string") { json = inner as Record<string, unknown>; break }
            }
          }
          cards.push(json)
        }
      } catch { toast.error(`${file.name}: could not parse`) }
    }
    if (cards.length) {
      try {
        // the studio-import plugin normalizes raw card JSON into card.json files
        const r = await j<{ characters: string[]; regex: string[] }>("/import/batch", { method: "POST", body: JSON.stringify({ cards }) })
        // regex scripts a card carries arrive as that character's scripts
        const nScripts = r.regex?.length ?? 0
        toast.success(`Imported ${r.characters.length} character${r.characters.length === 1 ? "" : "s"}${nScripts ? `, ${nScripts} regex script${nScripts === 1 ? "" : "s"}` : ""}`)
        await useApp.getState().hydrate()
      } catch (e) { toast.error(String((e as Error).message ?? e)) }
    }
  }

  const handleRegex = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        const json = JSON.parse(await file.text())
        const arr = Array.isArray(json) ? json : [json]
        // one round trip per FILE, not per script: a shared regex bundle runs
        // to dozens of scripts, and the normalizer takes them as a batch
        const valid = arr.filter((item: unknown) => regexImport(item) !== null)
        if (!valid.length) { toast.error(`${file.name}: no valid regex scripts`); continue }
        const r = await j<{ regex: string[] }>("/import/batch", { method: "POST", body: JSON.stringify({ regex: valid }) })
        const ok = r.regex.length
        if (ok > 0) {
          toast.success(`${file.name}: ${ok} regex script${ok > 1 ? "s" : ""} imported`)
          await useApp.getState().hydrate()
        } else toast.error(`${file.name}: no valid regex scripts`)
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? "invalid JSON"}`) }
    }
  }

  const handleLorebooks = async (files: FileList | null) => {
    if (!files) return
    const ids = await importLorebookFiles(Array.from(files), (m) => toast.error(m))
    if (!ids.length) return
    toast.success(`Imported ${ids.length} book${ids.length > 1 ? "s" : ""}`)
    await useApp.getState().hydrate()
  }

  const handleChats = async (files: FileList | null) => {
    if (!files) return
    const state = useApp.getState()
    const char = state.characters.find((c) => c.id === state.activeCharacterId) ?? state.characters.find((c) => !c.isGroup)
    if (!char) { toast.error("No character available to attach the chat to"); return }
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        // public chat jsonl: one message object per line — posted raw, the
        // studio-import plugin rebuilds the chat server-side and links it by name
        const lines = text.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        if (!lines.length) { toast.error(`${file.name}: no messages found`); continue }
        const r = await j<{ chats: string[] }>("/import/batch", {
          method: "POST",
          body: JSON.stringify({ chats: [{ character: char.name, file: file.name.replace(/\.jsonl$/i, ""), lines }] }),
        })
        toast.success(`Chat imported to ${char.name} (${r.chats.length} new)`)
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message ?? "could not parse JSONL"}`) }
    }
    await useApp.getState().hydrate()
  }

  const rows: { icon: typeof FileCode; title: string; desc: string; accept: string; ref: React.RefObject<HTMLInputElement | null>; onFiles: (f: FileList | null) => void }[] = [
    { icon: FileCode, title: "Presets", desc: "Chat-completion presets (prompts + order)", accept: ".json", ref: presetInput, onFiles: handlePresets },
    { icon: FileImage, title: "Characters", desc: "PNG / JSON / charx cards", accept: ".png,.json,.charx", ref: charInput, onFiles: handleCharacters },
    { icon: RegexIcon, title: "Regex scripts", desc: "Single script or array", accept: ".json", ref: regexInput, onFiles: handleRegex },
    { icon: BookOpen, title: "Lorebooks", desc: "World info JSON", accept: ".json", ref: loreInput, onFiles: handleLorebooks },
    { icon: FileText, title: "Chats", desc: "JSONL transcripts", accept: ".jsonl,.txt", ref: chatInput, onFiles: handleChats },
  ]

  const backupInput = useRef<HTMLInputElement>(null)
  const handleBackupZip = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    try {
      const r = await j<Record<string, unknown>>("/import/zip", {
        method: "POST",
        body: JSON.stringify({ zipBase64: await fileToRawBase64(f) }),
      })
      const parts = Object.entries(r)
        .filter(([, v]) => Array.isArray(v) && v.length)
        .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
      toast.success(parts.length ? `Imported ${parts.join(", ")}` : "Nothing recognized in that zip")
      await useApp.getState().hydrate()
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Import</h3>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Backup zip</p>
            <p className="truncate text-xs text-muted-foreground">Everything at once: characters, chats, personas, presets, worlds, regex</p>
          </div>
          <input
            ref={backupInput}
            type="file"
            accept=".zip,.charx"
            className="sr-only"
            onChange={(e) => { void handleBackupZip(e.target.files); e.target.value = "" }}
            aria-label="Import backup zip"
          />
          <Button variant="outline" size="sm" onClick={() => backupInput.current?.click()}>
            <UploadSimple className="size-3.5" aria-hidden /> Choose file
          </Button>
        </div>
        {rows.map((r) => (
          <div key={r.title} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <r.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <input
              ref={r.ref}
              type="file"
              accept={r.accept}
              multiple
              className="sr-only"
              onChange={(e) => { r.onFiles(e.target.files); e.target.value = "" }}
              aria-label={`Import ${r.title}`}
            />
            <Button variant="outline" size="sm" onClick={() => r.ref.current?.click()}>
              <UploadSimple className="size-3.5" aria-hidden /> Choose files
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataSection() {
  const resetAll = useApp((s) => s.resetAll)
  const hydrate = useApp((s) => s.hydrate)
  const importInput = useRef<HTMLInputElement>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  /** Full backup: the engine zips every stored entity (characters, chats,
   *  presets, lorebooks, regex, personas) in the public interchange shapes. */
  const handleExport = async () => {
    setBusy(true)
    try {
      const r = await j<{ filename: string; base64: string }>("/export/backup")
      downloadBlob(r.base64, r.filename)
      toast.success("Backup exported", { description: r.filename })
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  /** Restore: the zip goes back through the studio-import plugin, which
   *  re-imports every entry it understands (PNG cards excluded — binary). */
  const handleImport = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const summary = await j<{ characters: string[]; lorebooks: string[]; presets: string[]; regex: string[]; personas: string[]; chats: string[]; databank?: string[]; errors: string[] }>("/import/zip", {
        method: "POST", body: JSON.stringify({ zipBase64: await fileToRawBase64(file) }),
      })
      const n = summary.characters.length + summary.lorebooks.length + summary.presets.length + summary.regex.length + summary.personas.length + summary.chats.length + (summary.databank?.length ?? 0)
      toast.success(`Restored ${n} items`, { description: summary.errors.length ? `${summary.errors.length} skipped (incl. PNG cards, import those from Characters → Import)` : undefined })
      await hydrate()
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data</h3>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Button variant="outline" className="justify-start gap-2 bg-transparent" disabled={busy} onClick={() => void handleExport()}>
          <DownloadSimple className="size-4" aria-hidden /> Export backup (zip)
        </Button>
        <input
          ref={importInput}
          type="file"
          accept=".zip"
          className="sr-only"
          onChange={(e) => { void handleImport(e.target.files); e.target.value = "" }}
          aria-label="Import backup zip"
        />
        <Button variant="outline" className="justify-start gap-2 bg-transparent" disabled={busy} onClick={() => importInput.current?.click()}>
          <UploadSimple className="size-4" aria-hidden /> Restore backup (zip)
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-2 bg-transparent text-destructive hover:text-destructive"
          onClick={() => setResetOpen(true)}
        >
          <Trash className="size-4" aria-hidden /> Reset All Data
        </Button>
      </div>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset local UI state?</AlertDialogTitle>
            <AlertDialogDescription>
              Resets appearance settings, themes, quick replies and tags to their defaults. Server data
              (characters, chats, presets, lorebooks, stored by the Chrysalis engine) is not touched;
              delete those from their own views.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { resetAll(); toast.success("Local UI state reset, server data untouched") }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
