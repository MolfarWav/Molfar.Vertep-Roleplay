
import { useEffect, useRef, useState } from 'react'
import { PuzzlePiece, Asterisk, Translate, Image, Waveform, Database, SquaresFour, DiceFive, Wrench, Lightning, BookOpenText, Plug } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { j } from '@/lib/engine'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RegexView } from '@/components/views/regex-view'
import { TranslationTab } from '@/components/extensions/translation-tab'
import { ImageGenTab } from '@/components/extensions/image-gen-tab'
import { TtsTab } from '@/components/extensions/tts-tab'
import { DataBankTab } from '@/components/extensions/data-bank-tab'
import { BackgroundsTab } from '@/components/extensions/backgrounds-tab'
import { PluginsTab } from '@/components/extensions/plugins-tab'
import { McpTab } from '@/components/extensions/mcp-tab'
import { PluginPanelView, type PluginPanelDescriptor } from '@/components/extensions/plugin-panel'
import { SectionPage, PaneTitle, useSectionHost } from '@/components/shell/section-page'

// plugin-chosen icons resolve through this map; unknown names fall back
const PANEL_ICONS: Record<string, typeof DiceFive> = {
  dices: DiceFive, wrench: Wrench, zap: Lightning, book: BookOpenText, plug: Plug, blocks: SquaresFour,
}

export function ExtensionsView() {
  const [tab, setTab] = useState('regex')
  // panels are PLUGIN-provided UI: every app plugin may export a uiPanel hook
  // (label, icon, items, fields); no plugin → no tabs
  const [panels, setPanels] = useState<PluginPanelDescriptor[]>([])
  // strip stays blank until the panel list resolves: rendering the static tabs
  // first makes plugin tabs PREPEND a frame later and yank the selection —
  // the visible "Regex flashes then jumps to Tool Calling" glitch
  const [ready, setReady] = useState(false)
  const pickedTab = useRef(false)
  const reloadPanels = () => j<{ panels: PluginPanelDescriptor[] }>('/__panels')
    .then((r) => { setPanels(Array.isArray(r.panels) ? r.panels : []); setReady(true) })
    .catch(() => { setPanels([]); setReady(true) })
  useEffect(() => { void reloadPanels() }, [])
  // plugin tabs lead the strip, so a fresh Tools visit opens on the first one
  const firstPanelValue = panels[0] ? `panel:${panels[0].label}` : null
  useEffect(() => {
    if (!pickedTab.current && firstPanelValue) setTab(firstPanelValue)
  }, [firstPanelValue])

  // Header + tab strip scroll WITH the tab content (mobile keyboard room).
  // The regex tab is a full master/detail workspace with its own internal
  // scrolling — there the strip stays pinned above it so leaving the
  // workspace is always possible.
  // as a page the big title above says it; the compact bar is the drawer's
  const headerRow = useSectionHost() === 'drawer' ? (
    <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <PaneTitle section="extensions" icon={<PuzzlePiece className="size-4 text-primary" aria-hidden="true" />} />
    </header>
  ) : null
  // horizontal strip: triggers are flex-none so they overflow instead
  // of compressing — touch-scroll on mobile, wheel-scroll on desktop
  const strip = (
        <div
          className="overflow-x-auto overscroll-x-contain border-b border-border px-4 no-scrollbar"
          onWheel={(e) => {
            if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
        >
          {/* wide screens show every tab at once (wrapped rows) instead of a
              one-line scroller; narrow screens keep the touch strip */}
          <TabsList className="my-2 h-9 w-max flex-nowrap md:h-auto md:w-full md:flex-wrap md:gap-y-1">
            {panels.map((p) => {
              const Icon = PANEL_ICONS[p.icon ?? ''] ?? PuzzlePiece
              const value = `panel:${p.label}`
              return (
                <TabsTrigger key={value} value={value} className="flex-none gap-1.5">
                  <Icon className="size-3.5" aria-hidden="true" /> {p.label}
                </TabsTrigger>
              )
            })}
            <TabsTrigger value="regex" className="flex-none gap-1.5"><Asterisk className="size-3.5" aria-hidden="true" /> Regex</TabsTrigger>
            <TabsTrigger value="translation" className="flex-none gap-1.5"><Translate className="size-3.5" aria-hidden="true" /> Translation</TabsTrigger>
            <TabsTrigger value="image-gen" className="flex-none gap-1.5"><Image className="size-3.5" aria-hidden="true" /> Image Generation</TabsTrigger>
            <TabsTrigger value="tts" className="flex-none gap-1.5"><Waveform className="size-3.5" aria-hidden="true" /> TTS</TabsTrigger>
            <TabsTrigger value="data-bank" className="flex-none gap-1.5"><Database className="size-3.5" aria-hidden="true" /> Data Bank</TabsTrigger>
            <TabsTrigger value="backgrounds" className="flex-none gap-1.5"><Image className="size-3.5" aria-hidden="true" /> Backgrounds</TabsTrigger>
            <TabsTrigger value="mcp" className="flex-none gap-1.5"><Plug className="size-3.5" aria-hidden="true" /> MCP</TabsTrigger>
            <TabsTrigger value="plugins" className="flex-none gap-1.5"><SquaresFour className="size-3.5" aria-hidden="true" /> Plugins</TabsTrigger>
          </TabsList>
        </div>
  )

  return (
    <SectionPage section="extensions">
    <div className="flex h-full min-h-0 flex-col">
      {headerRow}
      {!ready ? null : (
      <Tabs value={tab} onValueChange={(v) => { if (v) { pickedTab.current = true; setTab(v) } }} className="flex min-h-0 flex-1 flex-col">
        {tab === 'regex' && (
          <>
            {strip}
            {/* Regex is a full master/detail workspace, so it renders full-bleed
                rather than inside the narrow settings column. */}
            <TabsContent value="regex" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
              <RegexView />
            </TabsContent>
          </>
        )}
        <ScrollArea className={cn('min-h-0 flex-1', tab === 'regex' && 'hidden')}>
          {strip}
          <div className="mx-auto max-w-3xl p-4">
            <TabsContent value="translation" className="mt-0"><TranslationTab /></TabsContent>
            <TabsContent value="image-gen" className="mt-0"><ImageGenTab /></TabsContent>
            <TabsContent value="tts" className="mt-0"><TtsTab /></TabsContent>
            <TabsContent value="data-bank" className="mt-0"><DataBankTab /></TabsContent>
            <TabsContent value="backgrounds" className="mt-0"><BackgroundsTab /></TabsContent>
            <TabsContent value="mcp" className="mt-0"><McpTab /></TabsContent>
            <TabsContent value="plugins" className="mt-0"><PluginsTab /></TabsContent>
            {panels.map((p) => (
              <TabsContent key={`panel:${p.label}`} value={`panel:${p.label}`} className="mt-0">
                <PluginPanelView panel={p} reload={reloadPanels} />
              </TabsContent>
            ))}
          </div>
        </ScrollArea>
      </Tabs>
      )}
    </div>
    </SectionPage>
  )
}
