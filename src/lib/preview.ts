/** One-line text for list previews (Home, Chats). Display only: the stored
 *  message is never touched. Drops tags such as `<sage:tremble>`, `<b>` and
 *  `</i>`, HTML comments, markdown emphasis and heading/quote markers, turns
 *  `[text](url)` into `text`, and collapses whitespace. */
export function cleanPreview(text: string, max = 0): string {
  let s = text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // <tag>, </tag>, <name:value>, <tag attr="x"/> — a letter right after "<",
    // so "a < b" and "<3" survive
    // (line-breaking tags leave a space, inline ones leave nothing)
    .replace(/<\/?([A-Za-z][^<>\n]*)>/g, (_m, inner: string) => (/^(?:br|p|div|li|hr)\b/i.test(inner) ? ' ' : ''))
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?)/gm, '')
    .replace(/[*~`]+/g, '')
    // underscore emphasis only at word edges, so snake_case stays intact
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  if (max > 0 && s.length > max) s = s.slice(0, max).trimEnd() + '…'
  return s
}

/** The first line of a message that still has words once it is cleaned. */
export function firstLine(text: string, max = 0): string {
  for (const line of text.split(/\r?\n/)) {
    const c = cleanPreview(line, max)
    if (c) return c
  }
  return ''
}
