
import { Children, createContext, isValidElement, cloneElement, memo, useContext, useState, type ReactNode, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn, storedMediaUrl } from '@/lib/utils'
import { proxyUrl } from '@/lib/engine'
import { scopeCss } from '@/lib/scope-css'
import { rehypeSafeStyle, safeRuleBody, stripRiskyAtRules } from '@/lib/safe-style'
import { firstVoiceIn, leadVoiceIn, opensWithLabel, voiceInk, type DialogueVoice } from '@/lib/dialogue-voices'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

/** Raw HTML in message bodies renders (community presets emit divs, details
 *  blocks, inline styles). Sanitized: standard tag allowlist, class + inline
 *  style allowed globally, http(s) URLs only. Inline styles and style blocks
 *  then pass lib/safe-style.ts (no fixed/sticky boxes, no viewport-sized
 *  overlays, no off-site url()). */
const htmlSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'style', 'font'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style', 'align'],
    font: ['color', 'face', 'size'],
  },
}

/** Finds what changes the dialogue state inside a text: a quote mark ("straight", “curly”, «guillemets»),
 *  a line break, or a dash (— or –). */
const SCAN_RE = /["“”«»]|\n|[—–]/g

/** Punctuation a spaced dash may follow when it opens or closes a line of dialogue (— Hi, — she said.) */
const DASH_AFTER = /[,.!?…:;]/

/** Elements whose text is code/markup — never re-tint inside them. */
const OPAQUE = new Set(['code', 'pre', 'kbd', 'samp'])

type QuoteKind = 'straight' | 'curly' | 'guillemet' | 'dash' | 'remark'
const OPENERS: Record<string, QuoteKind> = { '"': 'straight', '“': 'curly', '«': 'guillemet' }
const CLOSERS: Record<string, QuoteKind> = { '"': 'straight', '”': 'curly', '»': 'guillemet' }

/**
 * Tints spoken dialogue with the theme's quote color.
 *
 * Runs a STATEFUL walk over each block's children rather than regexing text
 * nodes one at a time: a quotation like `"…but not here. **Walls have ears**,
 * and…"` opens in one text node and closes in a later sibling, with a `strong`
 * element in between. Per-node matching left everything after the bold segment
 * untinted — exactly the "some quotes aren't highlighted" bug. Here the open
 * state carries across siblings, and whole elements encountered mid-quote are
 * pulled inside the `<q>` wrapper so they inherit the dialogue color.
 *
 * An unterminated quote tints to the end of the block, so streamed dialogue
 * colors from the opening mark onward instead of popping in at the close.
 *
 * Dialogue set off by dashes (Russian, Ukrainian, French) is tinted too: a line
 * that opens with a dash is speech to the end of the line, except the author's
 * words between two dashes (`— No, — she said. — Go.`). A dash only counts after
 * sentence punctuation, so `— I — Rhea.` stays one line of speech.
 */
function tintQuotes(children: ReactNode, depth = 0): ReactNode {
  if (depth > 6) return children

  const out: ReactNode[] = []
  let group: ReactNode[] = [] // nodes inside the currently open quote
  let open: QuoteKind | null = null
  let lineStart = true // nothing but spaces yet on this line
  let key = 0

  const flush = () => {
    if (group.length > 0) {
      // `<q>` would add its own marks; globals.css disables that so the
      // author's original quotation characters survive verbatim.
      out.push(<q key={`q${key++}`}>{group}</q>)
      group = []
    }
    open = null
  }
  /** Ends a dash line of speech before the spaces that lead to the closing dash, so they stay untinted. */
  const endSpeech = () => {
    const last = group[group.length - 1]
    const trail = typeof last === 'string' ? /\s+$/.exec(last)?.[0] ?? '' : ''
    if (trail) group[group.length - 1] = (last as string).slice(0, -trail.length)
    flush()
    if (trail) out.push(trail)
  }
  const put = (text: string) => {
    if (!text) return
    if (/\S/.test(text)) lineStart = false
    if (open && open !== 'remark') group.push(text)
    else out.push(text)
  }
  const lineEnds = () => {
    if (open === 'dash') flush()
    else if (open === 'remark') open = null
    lineStart = true
  }

  for (const child of Children.toArray(children)) {
    if (typeof child === 'string') {
      let from = 0
      for (const m of child.matchAll(SCAN_RE)) {
        const token = m[0]
        const at = m.index
        const before = child.slice(from, at)
        put(before)
        from = at + token.length
        if (token === '\n') {
          if (open === 'straight') {
            // A hard break ends an unclosed straight quote — bail out so a
            // stray mark can't paint the rest of the message as dialogue.
            out.push(...group, token)
            group = []
            open = null
          } else if (open === 'dash' || open === 'remark') {
            lineEnds()
            out.push(token)
          } else put(token)
          lineStart = true
        } else if (token === '—' || token === '–') {
          const spaced = from >= child.length || /\s/.test(child[from]!)
          const prev = child.slice(0, at).replace(/[ \t]+$/, '').slice(-1)
          const afterPunct = DASH_AFTER.test(prev) && (at === 0 || /\s/.test(child[at - 1]!))
          if (open === 'dash' && spaced && afterPunct) {
            endSpeech()
            open = 'remark'
            out.push(token)
          } else if (open === 'remark' && spaced && afterPunct) {
            open = 'dash'
            group.push(token)
          } else if (!open && spaced && (lineStart || (prev === ':' && afterPunct))) {
            open = 'dash'
            group.push(token)
            lineStart = false
          } else put(token)
        } else if (open === 'dash' || open === 'remark') {
          put(token) // quote marks inside a dash line are only text
        } else if (open) {
          if (CLOSERS[token] === open) {
            group.push(token)
            flush()
          } else group.push(token)
        } else if (OPENERS[token]) {
          open = OPENERS[token]
          group.push(token)
          lineStart = false
        } else put(token)
      }
      put(child.slice(from))
      continue
    }

    if (isValidElement(child)) {
      const el = child as ReactElement<{ children?: ReactNode }>
      const tag = typeof el.type === 'string' ? el.type : ''
      if (tag === 'br' && (open === 'dash' || open === 'remark')) {
        lineEnds()
        out.push(child)
      } else if (open && open !== 'remark') {
        // e.g. a bolded phrase or inline code inside spoken dialogue: it
        // stays where it was written (code keeps its own look, never re-tinted)
        group.push(child)
      } else if (open === 'remark') {
        out.push(child)
      } else if (!OPAQUE.has(tag) && el.props?.children != null) {
        out.push(cloneElement(el, undefined, tintQuotes(el.props.children, depth + 1)))
        lineStart = false
      } else {
        out.push(child)
        lineStart = tag === 'br'
      }
      continue
    }

    if (open && open !== 'remark') group.push(child)
    else out.push(child)
  }

  if (open && open !== 'remark') flush() // streaming: tint the still-open quote to the block's end
  return out
}

/** The group voices a narrator's message is coloured by (none outside such messages). */
export const DialogueVoices = createContext<DialogueVoice[]>([])

/** True in the player's own message: a quote takes a character's colour only on a line that opens with
 *  `Name:` (and the lines after it, until another label), never from a name said in the narration. */
export const VoiceLeadOnly = createContext(false)

/** The plain text of each line of a block, spoken quotes left out (a name said INSIDE a quote is the
 *  one spoken to, not the speaker). A line ends at a newline or a `<br>`. */
function lineTexts(children: ReactNode, depth = 0, lines: string[] = ['']): string[] {
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string') {
      child.split('\n').forEach((part, i) => {
        if (i > 0) lines.push('')
        lines[lines.length - 1] += part
      })
    } else if (isValidElement(child)) {
      const el = child as ReactElement<{ children?: ReactNode }>
      const tag = typeof el.type === 'string' ? el.type : ''
      if (tag === 'br') lines.push('')
      else if (tag !== 'q' && !OPAQUE.has(tag) && el.props?.children != null && depth <= 6) lineTexts(el.props.children, depth + 1, lines)
    }
  }
  return lines
}

/** Who speaks on each line: a `Name:` lead wins, else the first voice named in the line, else the
 *  previous line's speaker (the one the paragraph before carried in, for the first lines); null before anyone is named. */
export function lineSpeakers(children: ReactNode, voices: DialogueVoice[], carryIn: DialogueVoice | null = null, leadOnly = false): (DialogueVoice | null)[] {
  let carry: DialogueVoice | null = carryIn
  return lineTexts(children).map((line) => {
    if (leadOnly) {
      // a label that names no voice (the player's own, or anyone else's) hands the lines back to the base colour
      if (opensWithLabel(line)) carry = leadVoiceIn(line, voices)
      return carry
    }
    carry = leadVoiceIn(line, voices) ?? firstVoiceIn(line, voices) ?? carry
    return carry
  })
}

/** Paints each tinted quote with the colour of the voice that says it (see lineSpeakers); before anyone
 *  is named, the theme's colour stays. */
function voiceQuotes(children: ReactNode, speakers: (DialogueVoice | null)[], st: { line: number }, depth = 0): ReactNode[] {
  const out: ReactNode[] = []
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string') {
      st.line += child.split('\n').length - 1
      out.push(child)
      continue
    }
    if (!isValidElement(child)) { out.push(child); continue }
    const el = child as ReactElement<{ children?: ReactNode; style?: Record<string, string> }>
    const tag = typeof el.type === 'string' ? el.type : ''
    if (tag === 'br') { st.line++; out.push(child); continue }
    if (tag === 'q') {
      const who = speakers[st.line]
      out.push(who ? cloneElement(el, { style: { ...(el.props.style ?? {}), '--tap-quotes': voiceInk(who.color) } }) : child)
      continue
    }
    if (OPAQUE.has(tag) || el.props?.children == null || depth > 6) { out.push(child); continue }
    out.push(cloneElement(el, undefined, voiceQuotes(el.props.children, speakers, st, depth + 1)))
  }
  return out
}

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] }

/** The text of a hast node, a `<br>` as a line break. */
function hastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (node.type === 'element' && node.tagName === 'br') return '\n'
  return (node.children ?? []).map(hastText).join('')
}

/** A paragraph with speech in it: quote marks, a line that opens with a dash, or a dash after a colon. */
const hasSpeech = (text: string) => /["“”«»]/.test(text) || /(^|\n)\s*[—–]\s/.test(text) || /:\s+[—–]\s/.test(text)

/**
 * A paragraph of speech that names nobody ("— No, — she said.") takes the speaker of the narration
 * paragraph right before it ("Rhea steps forward."). Marks each paragraph with `data-carry`, the name of
 * the voice that paragraph hands on; a paragraph with speech hands on nobody, so a reply by someone else
 * is never painted with the wrong colour. Runs after the sanitizer, which would drop the attribute.
 */
function rehypeVoiceCarry(voices: DialogueVoice[]) {
  return (tree: HastNode) => {
    let carry: DialogueVoice | null = null
    const walk = (node: HastNode) => {
      for (const child of node.children ?? []) {
        if (child.type !== 'element' || child.tagName === 'pre' || child.tagName === 'code') continue
        if (child.tagName === 'p') {
          if (carry) child.properties = { ...child.properties, 'data-carry': carry.name }
          const text = hastText(child)
          carry = hasSpeech(text) ? null : lineSpeakers(text, voices).at(-1) ?? null
        } else walk(child)
      }
    }
    walk(tree)
  }
}

const withTint = (Tag: 'p' | 'li' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'td' | 'th') =>
  function Tinted({ children, ...rest }: { children?: ReactNode; 'data-carry'?: string }) {
    const voices = useContext(DialogueVoices)
    const leadOnly = useContext(VoiceLeadOnly)
    const tinted = tintQuotes(children)
    const carryIn = voices.find((v) => v.name === rest['data-carry']) ?? null
    return <Tag>{voices.length ? voiceQuotes(tinted, lineSpeakers(tinted, voices, carryIn, leadOnly), { line: 0 }) : tinted}</Tag>
  }

/** The selector every per-message <style> block is rewritten under. The
 *  message row overrides it with its own boundary, so a style block cannot
 *  restyle its neighbours. */
const StyleScope = createContext('.mes_text')

function ScopedStyle({ children }: { children?: ReactNode }) {
  const scope = useContext(StyleScope)
  return <style dangerouslySetInnerHTML={{ __html: scopeCss(stripRiskyAtRules(String(children ?? '')), scope, safeRuleBody) }} />
}

const mdComponents = {
  p: withTint('p'),
  li: withTint('li'),
  h1: withTint('h1'),
  h2: withTint('h2'),
  h3: withTint('h3'),
  h4: withTint('h4'),
  blockquote: withTint('blockquote'),
  td: withTint('td'),
  th: withTint('th'),
  // links must never navigate this SPA tab away from the app
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target={/^https?:\/\//i.test(href ?? '') ? '_blank' : undefined} rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Pictures a card carries in its text (`![alt](https://…)` in a greeting,
  // or a raw <img>): the page is sandboxed and its image policy lets only
  // same-origin pictures through, so a remote link renders as the browser's
  // broken-image icon unless the bytes come from our own origin. The engine's
  // image proxy (/v1/apps/<id>/img) fetches the picture for us. If the proxy
  // refuses or the picture is gone, the reader still gets a working link
  // instead of a bare broken icon.
  img: MessageImage,
  // per-message styles render scoped to the message boundary (selectors rewritten)
  style: ScopedStyle,
} as const

/** Where a picture in a message body may come from. Mirrors the proxy's own
 *  rules: http(s) only, no data:/javascript:, and nothing on the user's own
 *  machine (the proxy refuses those anyway). */
const REMOTE_IMAGE = /^https?:\/\//i

/** A picture inside a message. Remote pictures go through the engine's image
 *  proxy because the app page's image policy is same-origin only; a proxy
 *  failure (or a dead link) degrades to the alt text as a link, never to a
 *  broken-image icon. Same-origin, data: and blob: sources render directly. */
function MessageImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const remote = typeof src === 'string' && REMOTE_IMAGE.test(src) ? src : null
  // a failure belongs to the source that failed: a changed link gets its own try
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc !== null && failedSrc === src
  const resolved = remote ? proxyUrl(remote) : (typeof src === 'string' ? storedMediaUrl(src) : '')
  if (!resolved) return null
  if (failed) {
    return (
      <a href={remote ?? resolved} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
        {alt?.trim() || (remote ? (remote.match(/^https?:\/\/([^/?#]+)/i)?.[1] ?? 'image') : 'image')}
      </a>
    )
  }
  // A markdown image whose alt text is empty is decorative: keep it out of the a11y tree
  const altText = alt ?? ''
  return (
    <img
      src={resolved}
      alt={altText}
      title={title}
      loading="lazy"
      decoding="async"
      // the sandbox never sends a referrer; say so explicitly, some CDNs
      // (Cloudflare Image Delivery among them) refuse a foreign one
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src ?? "")}
      className="my-1"
    />
  )
}

// memoized: re-parses markdown (remark/rehype/KaTeX/highlight) ONLY when the
// content string actually changes — not on every parent re-render
export const Markdown = memo(function Markdown({ content, className, scope }: { content: string; className?: string; scope?: string }) {
  const voices = useContext(DialogueVoices)
  const leadOnly = useContext(VoiceLeadOnly)
  return (
    <div
      className={cn(
        // `mes_text` is the styling hook the Custom CSS editor documents, so
        // prose colours live in globals.css rather than in utility classes.
        'mes_text break-words',
        '[&_blockquote]:my-0 [&_blockquote]:border-l-[3px] [&_blockquote]:border-primary/50 [&_blockquote]:pl-2.5 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:border [&_code]:border-border/60 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono',
        '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_pre_code.hljs]:bg-transparent [&_pre]:has-[code.hljs]:bg-[#0d1117]',
        // lists: browser-default indent (40px) and decimal/disc markers,
        // 5px around the whole list, zero item gaps
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-10 [&_ol]:pl-10 [&_ul]:my-[5px] [&_ol]:my-[5px] [&_li]:my-0',
        '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        '[&_a]:text-primary [&_a]:underline [&_img]:rounded-md [&_img]:max-h-80 [&_img]:max-w-full',
        '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
        className,
      )}
    >
      <StyleScope.Provider value={scope ?? '.mes_text'}>
        <ReactMarkdown
          // remark-breaks: single newlines render as breaks
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
          rehypePlugins={[
            // raw HTML parsed, then sanitized BEFORE katex/highlight so their
            // generated markup isn't stripped by the allowlist
            rehypeRaw,
            [rehypeSanitize, htmlSchema],
            // a reply may dress itself, not leave its box (position:fixed, vw widths, off-site urls)
            rehypeSafeStyle,
            rehypeKatex,
            [rehypeHighlight, { detect: false, ignoreMissing: true }],
            ...(voices.length && !leadOnly ? [[rehypeVoiceCarry, voices] as [typeof rehypeVoiceCarry, DialogueVoice[]]] : []),
          ]}
          components={mdComponents}
        >
          {content}
        </ReactMarkdown>
      </StyleScope.Provider>
    </div>
  )
})
