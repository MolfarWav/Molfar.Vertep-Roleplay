// Dashboard fast mode: the story reply ends with <vertep_state>{...}</vertep_state>. The chat plugin cuts it
// out of the saved reply; this hides it on screen while the reply still streams, and in an older copy that kept it.
// Pure module: no React, no store.

const OPEN = '<vertep_state>'
const TAG = /<vertep_state>[\s\S]*?(?:<\/vertep_state>|$)/g

/**
 * The text without the state tag: a closed tag, or an unclosed one to the end of the text, is dropped.
 * While `streaming`, a partial opening tag at the very end ("<", "<vert", ... "<vertep_state") goes too,
 * so no frame of the stream shows a piece of it. Text without a tag is returned as it is. When something was
 * cut at the end, the whitespace left before it goes too.
 */
export function hideStateTag(text: string, streaming = false): string {
  if (!text.includes('<')) return text
  let out = text.replace(TAG, '')
  let cut = out !== text
  if (streaming) {
    for (let n = Math.min(OPEN.length - 1, out.length); n >= 1; n--) {
      if (out.endsWith(OPEN.slice(0, n))) {
        out = out.slice(0, out.length - n)
        cut = true
        break
      }
    }
  }
  return cut ? out.replace(/\s+$/, '') : out
}
