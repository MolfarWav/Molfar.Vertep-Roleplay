import { useMemo } from 'react'
import { useT } from '@/hooks/use-t'
import { cleanMarkup } from '@/lib/agent-markup'
import { drawTemplate, widgetDoc } from '@/lib/agent-template'
import type { AgentPanelSet, PanelWidget } from '@/lib/agents'
import { HTML_HEIGHT } from '@/lib/forge'
import { useDark } from '@/components/rich-blocks'

/**
 * An `html` widget, shown in a sealed frame (no scripts, no network, no access to the page): the agent's template filled
 * from its state, or (with `bind`) the markup the model wrote into a text field. A template the checker would refuse is
 * not drawn; a note says so instead.
 */
export function TemplateFrame({ w, set }: { w: PanelWidget; set: Pick<AgentPanelSet, 'schema' | 'own'> }) {
  const t = useT()
  const dark = useDark()
  // fixed look: the author's template filled from the state. Model's look (`bind`): the markup the model wrote into a text
  // field, rewritten from an allow-list on every draw, because a model's markup is never trusted (agent-markup.ts)
  const drawn = useMemo(
    () => (w.bind !== undefined ? (set.schema[w.bind]?.type === 'text' ? { html: cleanMarkup(set.own[w.bind]) } : { problems: [{ code: 'E_BIND', message: 'not a text field' }] }) : drawTemplate(w.template, set.schema, set.own)),
    [w.bind, w.template, set.schema, set.own],
  )
  if ('problems' in drawn) return <p className="text-[11px] text-muted-foreground" data-testid="agent-html-bad">{t('ag.widget.htmlBad')}</p>
  if (w.bind !== undefined && !drawn.html.trim()) return <p className="text-[11px] text-muted-foreground" data-testid="agent-html-empty">{t('ag.widget.htmlEmpty')}</p>
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
