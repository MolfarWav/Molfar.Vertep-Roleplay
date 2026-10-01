
import { useEffect, useRef, useState } from "react"
import { Check, ArrowCounterClockwise, Warning } from '@phosphor-icons/react'
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useApp } from "@/lib/store"

/** Copy-in starting points mirroring the CSS hooks themes lean on. */
const SNIPPETS: { name: string; css: string }[] = [
  {
    name: "Serif prose",
    css: `.mes_text {\n  font-family: Georgia, "Times New Roman", serif;\n  font-size: 1.05em;\n}`,
  },
  {
    name: "Boxed quotes",
    css: `.mes_text q {\n  background: color-mix(in srgb, var(--tap-quotes) 12%, transparent);\n  border-radius: 3px;\n  padding: 0 3px;\n}`,
  },
  {
    name: "Wider chat",
    css: `.chat-column {\n  --chat-max: 64rem;\n}`,
  },
  {
    name: "Flat message rows",
    css: `.group\\/msg > div {\n  border-color: transparent;\n  background: transparent;\n}`,
  },
  {
    name: "Neon headings · cyan lead",
    css: `html {\n  --tap-h1: #22d3ee !important;\n  --tap-h2: #ff2e88 !important;\n  --tap-h3: #a78bfa !important;\n}`,
  },
  {
    name: "Neon headings · violet lead",
    css: `html {\n  --tap-h1: #a78bfa !important;\n  --tap-h2: #22d3ee !important;\n  --tap-h3: #ff2e88 !important;\n}`,
  },
]

/** Cheap balance check — catches the mistake that silently kills a stylesheet. */
function lintCss(css: string): string | null {
  let depth = 0
  for (const ch of css) {
    if (ch === "{") depth++
    if (ch === "}") depth--
    if (depth < 0) return "Unmatched closing brace `}`"
  }
  if (depth > 0) return `${depth} unclosed ${depth === 1 ? "block" : "blocks"} (missing \`}\`)`
  if (/<\/?style/i.test(css)) return "Remove <style> tags, the contents alone are enough"
  return null
}

/**
 * Custom CSS: a plain editor whose contents are injected into
 * a <style> tag on every change. Applied last, so it wins over theme variables.
 */
export function CustomCssSection() {
  const saved = useApp((s) => s.settings.customCss)
  const updateSettings = useApp((s) => s.updateSettings)
  const [draft, setDraft] = useState(saved)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Pull in external changes (theme import, reset) without clobbering typing.
  useEffect(() => { setDraft(saved) }, [saved])

  const error = lintCss(draft)
  const dirty = draft !== saved

  const apply = () => {
    if (error) {
      toast.error(error)
      return
    }
    updateSettings({ customCss: draft })
    toast.success("Custom CSS applied")
  }

  const insert = (css: string) => {
    const next = draft.trim() ? `${draft.replace(/\s+$/, "")}\n\n${css}` : css
    setDraft(next)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(next.length, next.length)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom CSS</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Injected after the theme, so your rules win. Useful hooks:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.mes_text</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.mes_text q</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.mes_text em</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.chat-column</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SNIPPETS.map((s) => (
          <Button key={s.name} variant="outline" size="sm" className="h-7 text-xs" onClick={() => insert(s.css)}>
            + {s.name}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-css" className="sr-only">Custom CSS</Label>
        <textarea
          id="custom-css"
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); apply() }
            // Tab indents instead of escaping the field.
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart: s, selectionEnd: en } = el
              const next = draft.slice(0, s) + "  " + draft.slice(en)
              setDraft(next)
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
            }
          }}
          rows={14}
          spellCheck={false}
          placeholder={"/* Your CSS here */\n.mes_text q {\n  color: #e0b96f;\n}"}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-ring"
        />
        {error ? (
          <p className="flex items-center gap-1.5 text-[11px] text-destructive" role="alert">
            <Warning className="size-3 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {draft.length} characters · Ctrl+Enter to apply
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={apply} disabled={!dirty || !!error} className="gap-1.5">
          <Check className="size-3.5" aria-hidden="true" />
          Apply
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDraft(saved)}
          disabled={!dirty}
        >
          Revert
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-muted-foreground"
          onClick={() => { setDraft(""); updateSettings({ customCss: "" }); toast.success("Custom CSS cleared") }}
          disabled={!draft && !saved}
        >
          <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
          Clear
        </Button>
      </div>
    </div>
  )
}
