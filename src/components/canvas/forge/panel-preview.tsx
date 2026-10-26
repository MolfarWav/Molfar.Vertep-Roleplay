import { useMemo } from 'react'
import { BarRow, PanelSection, Widget } from '@/components/chat/agent-panels'
import { useT } from '@/hooks/use-t'
import { sampleState } from '@/lib/agent-template'
import type { AgentPanel, AgentPanelSet, PanelWidget } from '@/lib/agents'
import { WIDGET_KINDS } from '@/lib/forge'

type Obj = Record<string, any>
type State = Record<string, { type: string; item?: Record<string, string> }>

const FITS_A_BAR = new Set(['meter', 'number', 'counter', 'text'])

/**
 * A panel the way the chat will draw it, from the real widgets and sample values: in the floating window, or in a bar
 * above the chat. Nothing in it is live: the buttons show and do nothing.
 */
export function PanelPreview({ panel, state, full }: { panel: Obj; state: State; full: boolean }) {
  const t = useT()
  const word = t('fg.pv.word')
  const set = useMemo(() => ({
    name: '',
    schema: state as AgentPanelSet['schema'],
    own: sampleState(state, full, word),
    prev: null,
  }), [state, full, word])
  const widgets = (Array.isArray(panel.widgets) ? panel.widgets : []).filter((w: Obj): w is PanelWidget => (WIDGET_KINDS as readonly string[]).includes(String(w?.w)))
  const bar = panel.place === 'top1' || panel.place === 'top2'
  const shape: AgentPanel = { id: String(panel.id), title: String(panel.title ?? ''), widgets }
  return (
    <div className="flex flex-col gap-1" data-testid="forge-panel-preview">
      <span className="text-[11px] font-medium text-muted-foreground">{t('fg.pv.title')}</span>
      {bar ? (
        <>
          <div className="rounded-md border border-border bg-card" data-testid="forge-preview-bar">
            <BarRow>{widgets.map((w, i) => <Widget key={i} w={w} set={set} chatId={null} compact />)}</BarRow>
          </div>
          {widgets.some((w) => !FITS_A_BAR.has(w.w)) && <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.pv.barNone')}</p>}
        </>
      ) : (
        <div className="w-[min(360px,100%)] rounded-md border border-border bg-card p-3" data-testid="forge-preview-float">
          <PanelSection set={set} panel={shape} chatId={null} />
        </div>
      )}
    </div>
  )
}
