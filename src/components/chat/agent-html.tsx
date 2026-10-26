import { useMemo } from 'react'
import { useT } from '@/hooks/use-t'
import { drawTemplate, widgetDoc } from '@/lib/agent-template'
import type { AgentPanelSet, PanelWidget } from '@/lib/agents'
import { HTML_HEIGHT } from '@/lib/forge'
import { useDark } from '@/components/rich-blocks'

/**
 * An `html` widget: the agent's template filled from its state, shown in a sealed frame (no scripts, no network, no
 * access to the page). A template the checker would refuse is not drawn; a note says so instead.
 */
export function TemplateFrame({ w, set }: { w: PanelWidget; set: Pick<AgentPanelSet, 'schema' | 'own'> }) {
  const t = useT()
  const dark = useDark()
  const drawn = useMemo(() => drawTemplate(w.template, set.schema, set.own), [w.template, set.schema, set.own])
  if ('problems' in drawn) return <p className="text-[11px] text-muted-foreground" data-testid="agent-html-bad">{t('ag.widget.htmlBad')}</p>
  const height = Math.min(HTML_HEIGHT.max, Math.max(HTML_HEIGHT.min, w.height ?? HTML_HEIGHT.start))
  return (
    <iframe
      title={t('ag.widget.htmlTitle')}
      srcDoc={widgetDoc(drawn.html, dark)}
      sandbox=""
      style={{ height }}
      className="block w-full rounded-md border border-border bg-transparent"
      data-testid="agent-html"
    />
  )
}
