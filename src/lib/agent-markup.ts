// Mode B of the agent panel's `html` widget: the MODEL wrote the markup. It is untrusted, so it is never inspected for
// "bad things" (a blacklist loses to the next trick); it is read by a small tokenizer and RE-WRITTEN from an allow-list.
// What the list does not name is not removed from the text, it never reaches the output: no <a>, <img>, <style>,
// <script>, <iframe>, <form>, no event handler, no href/src, no url() in a style. The result is then drawn in the same
// sealed frame as a template (no scripts, no network), so even a mistake here cannot run or load anything.
// Pure and without the DOM, so a test can hold it. Design: .fork/handoff/script-card/DESIGN.md in the engine repo, section 2.

/** The most characters of markup one widget draws. The output is cut at a token, never in the middle of a tag. */
export const MARKUP_MAX = 8192
/** How deep tags may nest. A deeper tag is dropped. */
export const MARKUP_DEPTH = 20

const HTML_TAGS = new Set([
  'div', 'span', 'p', 'br', 'hr', 'b', 'i', 'em', 'strong', 'u', 's', 'small', 'sub', 'sup', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
])
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs',
  'lineargradient', 'radialgradient', 'stop',
])
/** Elements that have no closing tag in what we write. */
const VOID = new Set(['br', 'hr', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'stop'])
/** Elements whose CONTENT is code or data, not text: dropped with the tag instead of being shown as words. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'xmp', 'noembed', 'noframes',
  'frameset', 'applet', 'math', 'foreignobject', 'select', 'option', 'datalist', 'audio', 'video', 'canvas', 'head', 'title',
])
/** The canonical spelling of a tag or attribute that is not all lower case. */
const CAMEL: Record<string, string> = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio' }

const LEN = /^-?\d{1,4}(?:\.\d{1,3})?(?:px|em|rem|%)?$/
const NUM = /^-?\d{1,6}(?:\.\d{1,4})?$/
const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\(\s*[\d.%\s,/deg]{3,40}\))$/i
const PATHDATA = /^[0-9a-zA-Z\s.,+-]{1,2000}$/
const WORDS = /^[A-Za-z0-9 _-]{1,100}$/

/** Attribute -> what its value must look like (or `text`: free text up to 200 characters, escaped). `style` is handled apart. */
const ATTRS: Record<string, RegExp | 'text' | 'style'> = {
  style: 'style',
  class: WORDS, role: /^[a-z]{3,20}$/, lang: /^[A-Za-z-]{2,12}$/, dir: /^(?:ltr|rtl|auto)$/,
  title: 'text', 'aria-label': 'text',
  width: LEN, height: LEN, colspan: /^(?:[1-9]|1\d|20)$/, rowspan: /^(?:[1-9]|1\d|20)$/,
  viewbox: /^[\d\s.,-]{1,60}$/, preserveaspectratio: /^[A-Za-z\s]{1,40}$/,
  fill: COLOR, stroke: COLOR, 'stop-color': COLOR, 'stroke-width': NUM, opacity: NUM, 'fill-opacity': NUM, 'stroke-opacity': NUM, 'stop-opacity': NUM, offset: /^-?[\d.]{1,6}%?$/,
  d: PATHDATA, points: PATHDATA, transform: /^[a-zA-Z0-9\s.,()+-]{1,200}$/,
  x: LEN, y: LEN, x1: LEN, y1: LEN, x2: LEN, y2: LEN, cx: LEN, cy: LEN, r: LEN, rx: LEN, ry: LEN,
  'text-anchor': /^(?:start|middle|end)$/, 'font-size': LEN, 'font-weight': /^(?:normal|bold|[1-9]00)$/,
}

/** Properties a `style` may set. A value is refused when it can load or run something, whatever the property. */
const STYLE_PROPS = new RegExp(
  '^(?:color|background|background-color|background-image|border(?:-(?:top|right|bottom|left))?(?:-(?:color|width|style|radius))?|border-radius|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|' +
  'font|font-family|font-size|font-style|font-weight|line-height|letter-spacing|text-align|text-decoration|text-transform|text-shadow|box-shadow|' +
  'width|height|min-width|min-height|max-width|max-height|display|flex|flex-direction|flex-wrap|flex-grow|flex-shrink|gap|justify-content|align-items|align-self|' +
  'grid-template-columns|grid-template-rows|opacity|overflow|white-space|word-break|transform|fill|stroke|stroke-width|vertical-align|list-style|list-style-type|' +
  'position|top|left|right|bottom|z-index|float|clear|border-collapse|border-spacing|cursor)$',
)
const STYLE_VALUE_BAD = /url\s*\(|image-set|src\s*\(|element\s*\(|cross-fade|@|\\|expression|javascript|behavior|binding|<|>|\/\*|fixed|!important/i

/** A style attribute with only the declarations that are safe. Empty when none is. */
export function cleanStyle(value: string): string {
  const out: string[] = []
  for (const decl of value.split(';')) {
    const at = decl.indexOf(':')
    if (at < 1) continue
    const prop = decl.slice(0, at).trim().toLowerCase()
    const val = decl.slice(at + 1).trim()
    if (!STYLE_PROPS.test(prop) || !val || val.length > 200 || STYLE_VALUE_BAD.test(val)) continue
    if (prop === 'background-image' && !/^(?:linear|radial)-gradient\(/i.test(val)) continue
    out.push(`${prop}:${val}`)
    if (out.length >= 30) break
  }
  return out.join(';')
}

const ENTITY = /^&(?:#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/
/** Text with its markup characters made harmless. A well-formed entity stays; any other `&` is a plain ampersand. */
function escapeText(s: string, inAttr = false): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '&') out += ENTITY.test(s.slice(i, i + 40)) ? '&' : '&amp;'
    else if (c === '<') out += '&lt;'
    else if (c === '>') out += '&gt;'
    else if (c === '"') out += inAttr ? '&quot;' : '"'
    else if (c === '`') out += inAttr ? '&#96;' : '`'
    else if (c === "'") out += inAttr ? '&#39;' : "'"
    else out += c
  }
  return out
}

const NAMED: Record<string, string> = { colon: ':', tab: '\t', newline: '\n', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }
/** Decodes the few entities a value may carry before it is judged, so `&#106;avascript&colon;` is judged as what it is. */
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]{1,6});?/g, (_, h: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
    .replace(/&#(\d{1,7});?/g, (_, d: string) => String.fromCodePoint(Math.min(0x10ffff, Number(d))))
    .replace(/&([a-zA-Z]{2,8});?/g, (m, n: string) => NAMED[n.toLowerCase()] ?? m)
}

interface Attr { name: string; value: string }

/** Reads the attributes of an open tag from `s` starting at `i` (just after the tag name). Returns them and the index after the `>`. */
function readAttrs(s: string, i: number): { attrs: Attr[]; end: number; selfClosed: boolean } {
  const attrs: Attr[] = []
  let selfClosed = false
  while (i < s.length) {
    while (i < s.length && /[\s/]/.test(s[i]!)) { if (s[i] === '/' && s[i + 1] === '>') selfClosed = true; i++ }
    if (i >= s.length) break
    if (s[i] === '>') return { attrs, end: i + 1, selfClosed }
    let name = ''
    while (i < s.length && !/[\s/>=]/.test(s[i]!)) name += s[i++]
    if (!name) { i++; continue }
    while (i < s.length && /\s/.test(s[i]!)) i++
    let value = ''
    if (s[i] === '=') {
      i++
      while (i < s.length && /\s/.test(s[i]!)) i++
      const q = s[i]
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, i + 1)
        value = s.slice(i + 1, close < 0 ? s.length : close)
        i = close < 0 ? s.length : close + 1
      } else {
        while (i < s.length && !/[\s>]/.test(s[i]!)) value += s[i++]
      }
    }
    if (attrs.length < 40) attrs.push({ name: name.toLowerCase(), value })
  }
  return { attrs, end: s.length, selfClosed }
}

/** The allowed attributes of one tag, written out. A value that does not fit its shape is dropped with its attribute. */
function writeAttrs(attrs: Attr[]): string {
  let out = ''
  const seen = new Set<string>()
  for (const { name, value } of attrs) {
    const rule = ATTRS[name]
    if (!rule || seen.has(name)) continue
    const v = decode(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    let clean: string | null = null
    if (rule === 'style') clean = cleanStyle(v) || null
    else if (rule === 'text') clean = v.slice(0, 200) || null
    else clean = rule.test(v) ? v : null
    if (clean === null) continue
    seen.add(name)
    out += ` ${CAMEL[name] ?? name}="${escapeText(clean, true)}"`
  }
  return out
}

/**
 * The model's markup, rewritten to the allowed vocabulary: well-formed, at most MARKUP_MAX characters and MARKUP_DEPTH
 * deep. A reply that wraps the markup in a code fence is read without the fence. Text outside any tag is kept (escaped).
 */
export function cleanMarkup(input: unknown): string {
  let s = typeof input === 'string' ? input : ''
  s = s.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '')
  // a comment can hide a tag from a reader that does not know it, so comments are cut first
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
  let out = ''
  const stack: string[] = []
  let svg = 0
  let i = 0
  const full = () => out.length >= MARKUP_MAX
  while (i < s.length && !full()) {
    const lt = s.indexOf('<', i)
    if (lt < 0) { out += escapeText(s.slice(i)); break }
    if (lt > i) out += escapeText(s.slice(i, lt))
    i = lt
    const rest = s.slice(i, i + 3)
    if (rest.startsWith('<!') || rest.startsWith('<?')) { const gt = s.indexOf('>', i); i = gt < 0 ? s.length : gt + 1; continue }
    const closing = s[i + 1] === '/'
    const m = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(s.slice(i + (closing ? 2 : 1), i + (closing ? 2 : 1) + 40))
    if (!m) { out += '&lt;'; i++; continue }
    const name = m[0].toLowerCase()
    const afterName = i + (closing ? 2 : 1) + m[0].length
    if (closing) {
      const gt = s.indexOf('>', afterName)
      i = gt < 0 ? s.length : gt + 1
      const at = stack.lastIndexOf(name)
      if (at < 0) continue
      while (stack.length > at) { const t = stack.pop()!; if (t === 'svg') svg--; out += `</${CAMEL[t] ?? t}>` }
      continue
    }
    const { attrs, end, selfClosed } = readAttrs(s, afterName)
    i = end
    if (DROP_WITH_CONTENT.has(name)) {
      if (!selfClosed) {
        const close = new RegExp(`</\\s*${name.replace(/[^a-z0-9]/g, '')}\\b[^>]*>`, 'i').exec(s.slice(i))
        i = close ? i + close.index + close[0].length : s.length
      }
      continue
    }
    const allowed = HTML_TAGS.has(name) || (SVG_TAGS.has(name) && (name === 'svg' || svg > 0))
    if (!allowed) continue
    if (VOID.has(name)) { out += `<${CAMEL[name] ?? name}${writeAttrs(attrs)}${SVG_TAGS.has(name) ? '/' : ''}>`; continue }
    if (stack.length >= MARKUP_DEPTH) continue
    out += `<${CAMEL[name] ?? name}${writeAttrs(attrs)}>`
    stack.push(name)
    if (name === 'svg') svg++
  }
  if (out.length > MARKUP_MAX) out = out.slice(0, MARKUP_MAX).replace(/<[^>]*$/, '').replace(/&[^;\s]{0,10}$/, '')
  while (stack.length) { const t = stack.pop()!; out += `</${CAMEL[t] ?? t}>` }
  return out
}
