// Dashboard fast mode: the story reply ends with <vertep_state>{...}</vertep_state>. The chat plugin cuts it
// out of the saved reply; this hides it on screen while the reply still streams, and in an older copy that kept it.
// The same goes for the hidden plan a multi-voice reply may open with, <vertep_plan>...</vertep_plan> (Litopys, #184).
// Pure module: no React, no store.

const OPEN = '<vertep_state>'
const TAG = /<vertep_state>[\s\S]*?(?:<\/vertep_state>|$)/g
const PLAN_OPEN = '<vertep_plan>'
const PLAN_CLOSED = /<vertep_plan>[\s\S]*?<\/vertep_plan>/g

/**
 * The text without the state tag: a closed tag, or an unclosed one to the end of the text, is dropped.
 * A hidden plan is dropped when closed; while `streaming`, an unclosed one hides to the end too (it is still being
 * written), and otherwise only its opening tag goes, as the chat plugin does when it saves a reply.
 * While `streaming`, a partial opening tag at the very end ("<", "<vert", ... "<vertep_state") goes too,
 * so no frame of the stream shows a piece of it. Text without a tag is returned as it is. When something was
 * cut at the end, the whitespace left before it goes too.
 */
export function hideStateTag(text: string, streaming = false): string {
  if (!text.includes('<')) return text
  let out = text.replace(PLAN_CLOSED, '')
  const at = out.indexOf(PLAN_OPEN)
  if (at >= 0) out = streaming ? out.slice(0, at) : out.split(PLAN_OPEN).join('')
  const planCut = out !== text
  out = out.replace(TAG, '')
  let cut = out !== text
  if (streaming) {
    for (const open of [OPEN, PLAN_OPEN]) {
      let done = false
      for (let n = Math.min(open.length - 1, out.length); n >= 1; n--) {
        if (out.endsWith(open.slice(0, n))) {
          out = out.slice(0, out.length - n)
          cut = true
          done = true
          break
        }
      }
      if (done) break
    }
  }
  if (!cut) return out
  return planCut ? out.trim() : out.replace(/\s+$/, '')
}
