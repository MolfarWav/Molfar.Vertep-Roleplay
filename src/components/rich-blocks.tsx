
import { memo, useEffect, useState } from 'react'
import { useT } from '@/hooks/use-t'
import { Markdown } from '@/components/markdown'
import { splitRichBlocks } from '@/lib/rich-parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Key/value panel — the ```data / ```stat fenced blocks. */
function DataPanel({ variant, title, rows }: { variant: 'data' | 'stat'; title: string | null; rows: [string, string][] }) {
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-card">
      {title && (
        <p className="border-b border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      )}
      {variant === 'stat' ? (
        <div className="flex flex-wrap gap-px bg-border">
          {rows.map(([label, value], i) => (
            <div key={i} className="min-w-24 flex-1 bg-card px-3 py-2 text-center">
              <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <dl className="divide-y divide-border">
          {rows.map(([label, value], i) => (
            <div key={i} className="flex items-baseline gap-3 px-2.5 py-1.5">
              <dt className="w-32 shrink-0 truncate text-xs text-muted-foreground">{label}</dt>
              <dd className="min-w-0 flex-1 break-words font-mono text-xs">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Is the document dark right now? Follows the theme switch. */
export function useDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const root = document.documentElement
    const obs = new MutationObserver(() => setDark(root.classList.contains('dark')))
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/** A block that sets its own colours (a paper note, a card of its own) was drawn for a light page: it
 *  keeps a white sheet behind it. One that sets none follows the theme. */
export const inlayIsStyled = (html: string) => /(?:^|[\s;"'{])(?:color|background(?:-color|-image)?)\s*:|\bbgcolor=|<font\b[^>]*\bcolor=/i.test(html)

/** The inlay's document: theme-following defaults first, so the block's own markup and CSS override them.
 *  The doctype keeps it out of quirks mode, where the root element always fills the frame and could not be measured. */
export const inlayDoc = (html: string, dark: boolean) =>
  `<!doctype html><style>:root{color-scheme:${dark ? 'dark' : 'light'}}html{background:transparent}body{margin:8px;font:14px/1.5 system-ui,sans-serif;color:CanvasText;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${html}`

/** How tall an inlay is before it is expanded, and the share of the window it takes once expanded. */
const INLAY_HEIGHT = 160
const INLAY_EXPANDED_VH = 60

/**
 * Sandboxed HTML inlay (```html blocks): srcdoc iframe with scripts
 * disallowed by both the sandbox and the page CSP — static markup and inline
 * styles only, never script-driven. The frame cannot be measured from here
 * (the app page is itself sandboxed, so the inlay is a separate origin), so it
 * has a modest fixed height with an Expand toggle, and can be dragged taller
 * where the browser allows it.
 */
function HtmlInlay({ html }: { html: string }) {
  const t = useT()
  const dark = useDark()
  const styled = inlayIsStyled(html)
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="my-2">
      <iframe
        title="Message inlay"
        srcDoc={inlayDoc(html, styled ? false : dark)}
        sandbox=""
        style={{ height: expanded ? `${INLAY_EXPANDED_VH}vh` : INLAY_HEIGHT }}
        className={cn('block min-h-24 w-full resize-y rounded-md border border-border', styled ? 'bg-white' : 'bg-transparent')}
      />
      <Button variant="ghost" size="sm" className="mt-0.5 h-10 text-xs text-muted-foreground md:h-7" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded}>
        {expanded ? t('inlay.collapse') : t('inlay.expand')}
      </Button>
    </div>
  )
}

/** Clickable choice buttons (```choices blocks): picking one SENDS it as the
 *  user's next message — interactivity lives in the app, never in scripts. */
function ChoicesPanel({ title, options, onPick }: { title: string | null; options: string[]; onPick?: (choice: string) => void }) {
  return (
    <div className="my-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
      {title && <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>}
      <div className="flex flex-col gap-1.5">
        {options.map((o, i) => (
          <Button key={i} variant="outline" size="sm" className="h-auto justify-start whitespace-normal py-1.5 text-left text-xs" disabled={!onPick} onClick={() => onPick?.(o)}>
            {o}
          </Button>
        ))}
      </div>
    </div>
  )
}

function CodeFallback({ lang, text }: { lang: string | null; text: string }) {
  return <Markdown content={'```' + (lang ?? '') + '\n' + text + '\n```'} />
}

/** Message body renderer: markdown prose with typed ```data/```stat/```html
 *  blocks rendered as panels and sandboxed inlays. Memoized — the split and
 *  the markdown parse only rerun when the text changes. `scope` is the CSS
 *  boundary per-message <style> blocks are rewritten under. */
export const RichText = memo(function RichText({ content, className, onChoice, scope }: { content: string; className?: string; onChoice?: (choice: string) => void; scope?: string }) {
  const blocks = splitRichBlocks(content)
  const only = blocks.length === 1 ? blocks[0] : null
  if (only && only.kind === 'md') return <Markdown content={only.text} className={className} scope={scope} />
  return (
    <div className={cn('text-sm leading-relaxed break-words', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'md') return b.text.trim() ? <Markdown key={i} content={b.text} scope={scope} /> : null
        if (b.kind === 'data') return <DataPanel key={i} variant={b.variant} title={b.title} rows={b.rows} />
        if (b.kind === 'html') return <HtmlInlay key={i} html={b.html} />
        if (b.kind === 'choices') return <ChoicesPanel key={i} title={b.title} options={b.options} onPick={onChoice} />
        return <CodeFallback key={i} lang={b.lang} text={b.text} />
      })}
    </div>
  )
})
