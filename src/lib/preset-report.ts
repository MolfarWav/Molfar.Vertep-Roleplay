// What a preset import brought over, approximated or left behind. Pure data: the dialog turns the
// ids into words (src/lib/i18n.ts, keys `presetReport.<id>`), so the parser never holds UI text.

export interface ReportItem {
  /** i18n key suffix: `presetReport.<id>` */
  id: string
  /** a count the text can show as {n} */
  n?: number
  /** the things the line is about (prompt names, macro names, variable names), shown after the text */
  names?: string[]
}

export interface ImportReport {
  /** where the preset came from: 'sillytavern' | 'marinara' */
  source: string
  came: ReportItem[]
  approx: ReportItem[]
  dropped: ReportItem[]
}

export const newReport = (source: string): ImportReport => ({ source, came: [], approx: [], dropped: [] })

type Bucket = 'came' | 'approx' | 'dropped'
export function note(report: ImportReport, bucket: Bucket, id: string, n?: number, names?: string[]): void {
  if (n !== undefined && n <= 0) return
  const item: ReportItem = { id }
  if (n !== undefined) item.n = n
  if (names?.length) item.names = names.slice(0, 12)
  report[bucket].push(item)
}

// ─── macros ───
/** Macro heads this app expands (plugins/engine expandMacros and the {{#if}} blocks). */
const SUPPORTED_MACROS = new Set([
  'user', 'char', 'persona', 'description', 'personality', 'scenario', 'time', 'isotime', 'date', 'isodate', 'weekday',
  'lastmessage', 'lastusermessage', 'lastcharmessage', 'idle_duration', 'words', 'limit', 'trim', 'newline',
  'getvar', 'setvar', 'addvar', 'incvar', 'decvar', 'random', 'pick', 'roll', 'var', '//', '#if', '/if', 'else',
  // expands to nothing here: the story memory is Litopys
  'summary',
])

/** ST macros with no equivalent here, and what to use instead (shown in the report). */
export const MACRO_ADVICE: Record<string, string> = {
  original: 'original',
  input: 'original',
  outlet: 'outlet',
  charprompt: 'charfields', charjailbreak: 'charfields', mesexamples: 'charfields', mesexamplesraw: 'charfields', chardepthprompt: 'charfields',
  group: 'group', groupnotmuted: 'group', notchar: 'group',
  model: 'model', maxprompt: 'model',
  pipe: 'pipe',
}

export interface MacroScan {
  /** macro head (lower case) -> how many times, for the ones this app does not expand */
  unsupported: { name: string; count: number; advice: string | null }[]
  /** macros the import rewrote ({{noop}} dropped) */
  rewritten: number
}

/** The head of a macro: the part before the first `:` / space, lower-cased (`{{getvar::x}}` -> getvar). */
function macroHead(inner: string): string {
  const t = inner.trim()
  if (t.startsWith('//')) return '//'
  const m = /^([#/]?[A-Za-z_][\w.-]*)/.exec(t)
  return (m?.[1] ?? t.split(/[\s:]/)[0] ?? '').toLowerCase()
}

/** Counts the macros in the texts that this app does not expand. `known` are the preset's own variable
 *  names (a bare {{name}} reads them). */
export function scanMacros(texts: string[], known: Iterable<string> = []): MacroScan['unsupported'] {
  const ok = new Set([...SUPPORTED_MACROS, ...[...known].map((k) => k.toLowerCase())])
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const m of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
      const head = macroHead(m[1] ?? '')
      if (!head || ok.has(head)) continue
      counts.set(head, (counts.get(head) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, advice: MACRO_ADVICE[name] ?? null }))
}

/** {{noop}} is an ST macro for "nothing"; here it is simply nothing. */
export function rewriteMacros(text: string): { text: string; changed: number } {
  let changed = 0
  const out = text.replace(/\{\{\s*noop\s*\}\}/gi, () => { changed++; return '' })
  return { text: out, changed }
}
