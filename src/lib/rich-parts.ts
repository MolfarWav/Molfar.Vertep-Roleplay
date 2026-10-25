
/**
 * Rich message parts — typed blocks a model (or the user) can emit inside any
 * message as fenced code blocks:
 *
 *   ```data <optional title>   → key/value panel (JSON object or [label,value] rows)
 *   ```stat <optional title>   → same payload, compact big-number styling
 *   ```html                    → sandboxed inlay (static HTML + inline styles;
 *                                the page CSP blocks scripts inside inlays)
 *
 * Everything else stays ordinary markdown. A fence that has not CLOSED yet
 * (mid-stream) renders as a plain code block — a panel only materializes
 * once its fence closes, so streaming never flashes half-built UI.
 */

export type RichBlock =
  | { kind: 'md'; text: string }
  | { kind: 'data'; variant: 'data' | 'stat'; title: string | null; rows: [string, string][] }
  | { kind: 'html'; html: string }
  /** clickable choices: each sends its text as the user's next message */
  | { kind: 'choices'; title: string | null; options: string[] }
  | { kind: 'code'; lang: string | null; text: string }

const CLOSE_RE = /^[ \t]*```[ \t]*$/gm

const countOccurrences = (s: string, marker: string) => s.split(marker).length - 1

/** A streaming partial can end mid-emphasis or inside a code fence; the
 *  unclosed marker would swallow the rest of the text as italic or code.
 *  While the reply is still streaming, an odd marker count gets a closing
 *  counterpart appended (fences close on their own line) so every tick
 *  renders as finished markdown. The synthetic closers never commit — the
 *  balancing only shapes the displayed partial. */
const BALANCE_MARKERS = ['*', '"', '```', '~~~'] as const
export function balanceStreamingMarkdown(text: string): string {
  let out = text
  for (const marker of BALANCE_MARKERS) {
    if (countOccurrences(out, marker) % 2 === 1) {
      const separator = marker.length > 1 ? '\n' : ''
      out = out.trimEnd() + separator + marker
    }
  }
  return out
}

/** JSON payload → display rows; arrays of pairs and {label,value} work too. */
function rowsFromJson(raw: string): [string, string][] | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const v = JSON.parse(text)
    if (Array.isArray(v)) {
      const rows: [string, string][] = []
      for (const e of v) {
        if (Array.isArray(e) && e.length >= 2) rows.push([String(e[0]), String(e[1])])
        else if (e && typeof e === 'object' && 'label' in (e as object)) rows.push([String((e as { label: unknown }).label), String((e as { value: unknown }).value ?? '')])
        else return null
      }
      return rows.length ? rows : null
    }
    if (v && typeof v === 'object') {
      const rows: [string, string][] = []
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        rows.push([k, typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)])
      }
      return rows.length ? rows : null
    }
    return null
  } catch {
    return null
  }
}

/** Real block-level HTML. Only these tags get block-HTML treatment; any
 *  OTHER tag (custom pseudo-tags models emit — choices, status, scene…) is
 *  transparent to markdown and simply strips at sanitize. A strict
 *  CommonMark read instead treats EVERY line-start tag as block HTML,
 *  which swallows the markdown after it as raw text — during streaming an
 *  unclosed custom tag turned the whole reply tail into one unformatted
 *  line. Strip non-block tags from markdown runs so their content always
 *  parses (fenced ```html inlays never pass through here, so their markup
 *  is untouched). */
const BLOCK_LEVEL_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'script', 'style',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])
/** Real inline HTML a reply may use (a bold word, a line break, a coloured span, a picture). Kept: they are
 *  not custom tags, and stripping them took the paper note's line break and every `<span style>` away. */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'del', 'em', 'font', 'i', 'img', 'ins', 'kbd', 'mark', 'q',
  'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
])
const ANY_TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^<>]*?\/?>/g
/** A line that holds nothing but one inline tag: CommonMark reads it as the start of a block of raw HTML
 *  and swallows the markdown below it, so that tag goes (an inline tag amid text is fine). */
const LONE_INLINE_RE = /^[ \t]*<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*)?\/?>[ \t]*$/gm
export function stripCustomHtmlTags(text: string): string {
  return text
    .replace(LONE_INLINE_RE, (tag, name: string) => (INLINE_TAGS.has(name.toLowerCase()) && name.toLowerCase() !== 'img' ? '' : tag))
    .replace(ANY_TAG_RE, (tag, name: string) => {
      const n = name.toLowerCase()
      return BLOCK_LEVEL_TAGS.has(n) || INLINE_TAGS.has(n) ? tag : ''
    })
}

export function splitRichBlocks(text: string): RichBlock[] {
  if (!text) return []
  const md = (t: string) => ({ kind: 'md' as const, text: stripCustomHtmlTags(t) })
  const out: RichBlock[] = []
  let i = 0    // scan cursor
  let last = 0 // start of the pending markdown run
  while (i < text.length) {
    const open = text.indexOf('```', i)
    if (open < 0) break
    // a fence only opens at a line start
    if (open > 0 && text[open - 1] !== '\n') { i = open + 3; continue }
    const infoEnd = text.indexOf('\n', open)
    if (infoEnd < 0) break
    const info = text.slice(open + 3, infoEnd).trim()
    const bodyStart = infoEnd + 1
    CLOSE_RE.lastIndex = bodyStart
    const closeM = CLOSE_RE.exec(text)
    const close = closeM ? closeM.index : -1
    const body = close >= 0 ? text.slice(bodyStart, close) : text.slice(bodyStart)
    const end = close >= 0 ? close + closeM![0].length : text.length
    if (open > last) out.push(md(text.slice(last, open)))
    const lang = info.split(/\s+/)[0]?.toLowerCase() ?? ''
    const title = info.slice(lang.length).trim() || null
    let typed = false
    if (close >= 0 && lang === 'choices') {
      // JSON array of strings, or one option per line
      let options: string[] | null = null
      try {
        const v = JSON.parse(body)
        if (Array.isArray(v) && v.every((e) => typeof e === 'string')) options = v.map((e) => e.trim()).filter(Boolean)
      } catch { options = null }
      if (!options) options = body.split('\n').map((l) => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean)
      if (options.length >= 2) { out.push({ kind: 'choices', title, options }); typed = true }
    }
    if (close >= 0 && (lang === 'data' || lang === 'stat')) {
      const rows = rowsFromJson(body)
      if (rows) { out.push({ kind: 'data', variant: lang, title, rows }); typed = true }
    } else if (close >= 0 && lang === 'html' && body.trim()) {
      out.push({ kind: 'html', html: body })
      typed = true
    }
    if (!typed) out.push({ kind: 'code', lang: lang || null, text: body })
    last = end
    i = end
  }
  if (last < text.length) out.push(md(text.slice(last)))
  return out
}
