// What a reply's own CSS may do (Molfar Vertep issue #93). A model's HTML (or a card's greeting)
// carries inline `style` and `<style>` blocks. They may dress the message: colours, borders, shadows,
// transforms, fonts, a paper-note look. They may not leave it: pin a box over the whole app, stack
// above the Send button, or pull in something from another site.

const DANGEROUS = /expression\s*\(|behavior\s*:|-moz-binding|javascript:/i
const VIEWPORT_UNIT = /(-?\d*\.?\d+)\s*(?:vw|vh|vmin|vmax|dvw|dvh|svw|svh|lvw|lvh|cqw|cqh)\b/gi
/** Boxes sized by the viewport are never right inside a chat column: width:100vw overflows it, height:100vh
 *  is a screen tall. Kept only as an upper bound (`max-*`), and offsets up to a screen. */
const OWN_SIZE_PROP = /^(?:width|height|min-width|min-height)$/
const BOUND_PROP = /^(?:max-width|max-height|inset(?:-[a-z]+)?|top|left|right|bottom)$/

/** Splits a declaration list on `;`, not inside quotes or brackets (`url(data:image/png;base64,...)`). */
function splitDeclarations(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let from = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (quote) { if (c === quote && body[i - 1] !== '\\') quote = '' }
    else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ';' && depth === 0) { out.push(body.slice(from, i)); from = i + 1 }
  }
  out.push(body.slice(from))
  return out.filter((d) => d.trim())
}

/** A url() that stays on this engine: a path on the same origin, or an inline image. Anything else is
 *  another site, which the page's policy would block anyway: it is dropped so it never even asks. */
function urlsStayHome(value: string): boolean {
  for (const m of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gis)) {
    const target = m[2]!.trim()
    if (/^data:image\/(?!svg)/i.test(target)) continue
    if (/^\/(?!\/)/.test(target)) continue
    return false
  }
  return true
}

/** One declaration the message may keep. */
export function allowedDeclaration(prop: string, value: string): boolean {
  const p = prop.trim().toLowerCase()
  const v = value.trim()
  if (!p || !v || DANGEROUS.test(v)) return false
  if (p === 'position') return !/\b(?:fixed|sticky)\b/i.test(v)
  if (p === 'z-index') return /^-?\d+$/.test(v) && Number(v) <= 10
  if (OWN_SIZE_PROP.test(p) && new RegExp(VIEWPORT_UNIT.source, 'i').test(v)) return false
  if (BOUND_PROP.test(p)) {
    for (const m of v.matchAll(VIEWPORT_UNIT)) if (Number(m[1]) > 100) return false
  }
  if (/url\(/i.test(v) && !urlsStayHome(v)) return false
  return true
}

/** A declaration list (an element's `style` attribute, or the inside of a rule) with the declarations a
 *  message may not use taken out. */
export function safeDeclarations(body: string): string {
  return splitDeclarations(body)
    .filter((d) => {
      const colon = d.indexOf(':')
      return colon > 0 && allowedDeclaration(d.slice(0, colon), d.slice(colon + 1).replace(/!important\s*$/i, ''))
    })
    .map((d) => d.trim())
    .join('; ')
}

/** A rule body, or the frames of a @keyframes body, filtered. Brace-walked like `scopeCss`. */
export function safeRuleBody(body: string): string {
  if (!body.includes('{')) return safeDeclarations(body)
  return body.replace(/\{([^{}]*)\}/g, (_m, inner: string) => `{${safeDeclarations(inner)}}`)
}

/** A style block with its `@import` and `@font-face` rules removed (neither can load anything here, and
 *  an import is the one at-rule that is not a rule list). Rule bodies are filtered by `scopeCss`. */
export function stripRiskyAtRules(css: string): string {
  return css
    .replace(/@import\b[^;{}]*;?/gi, '')
    .replace(/@font-face\s*\{[^{}]*\}/gi, '')
}

type HastNode = { type?: string; properties?: Record<string, unknown>; children?: HastNode[] }

/** A rehype step for after the sanitizer: inline `style` attributes lose what a message may not use. */
export function rehypeSafeStyle() {
  const walk = (node: HastNode): void => {
    const style = node.properties?.style
    if (typeof style === 'string') {
      const safe = safeDeclarations(style)
      if (safe) node.properties!.style = safe
      else delete node.properties!.style
    }
    node.children?.forEach(walk)
  }
  return (tree: HastNode) => walk(tree)
}
