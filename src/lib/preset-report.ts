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

/** The head of a macro: the part before the first `:` / space, lower-cased (`{{getvar::x}}` -> getvar). */
function macroHead(inner: string): string {
  const t = inner.trim()
  if (t.startsWith('//')) return '//'
  const m = /^([#/]?[A-Za-z_][\w.-]*)/.exec(t)
  return (m?.[1] ?? t.split(/[\s:]/)[0] ?? '').toLowerCase()
}

/** Counts the macros in the texts that this app does not expand. `known` are the preset's own variable
 *  names (a bare {{name}} reads them). */
export function scanMacros(texts: string[], known: Iterable<string> = []): { name: string; count: number }[] {
  const ok = new Set([...SUPPORTED_MACROS, ...[...known].map((k) => k.toLowerCase())])
  const counts = new Map<string, number>()
  for (const raw of texts) {
    // a comment can mention macros: it is not run
    const text = raw.replace(/\{\{\s*\/\/[\s\S]*?\}\}/g, '')
    for (const m of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
      const head = macroHead(m[1] ?? '')
      // ST's scoped variables ({{.x}}, {{$x}}) have their own line in the report
      if (!head || ok.has(head) || /^[.$]/.test(head)) continue
      counts.set(head, (counts.get(head) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
}

export interface MacroRewrite {
  text: string
  /** {{noop}} removed */
  noop: number
  /** {{setglobalvar::x::v}} and friends turned into the chat variable macros */
  globals: number
  /** names of ST local/global variables ({{.x = v}}, {{$x = v}}) whose assignment was removed */
  assigned: string[]
}

/**
 * Macros that map one to one, so they work here instead of leaking into the prompt as text:
 * {{noop}} is nothing; {{setglobalvar}} and the other global-variable macros are chat variables here;
 * an assignment to an ST scoped variable ({{.x = v}}) is dropped (those variables live for one prompt
 * build; a {{#if .x}} that reads one reads "not set", and a {{#if !.x}} passes).
 */
export function rewriteMacros(text: string): MacroRewrite {
  const r: MacroRewrite = { text, noop: 0, globals: 0, assigned: [] }
  r.text = r.text.replace(/\{\{\s*noop\s*\}\}/gi, () => { r.noop++; return '' })
  r.text = r.text.replace(/\{\{(\s*)(set|get|add|inc|dec)globalvar(?=::)/gi, (_, sp: string, op: string) => { r.globals++; return `{{${sp}${op}var` })
  r.text = r.text.replace(/\{\{\s*[.$]([\w.-]+)\s*(?:[-+*/]?=|\+\+|--)[^{}]*\}\}/g, (_, name: string) => { r.assigned.push(name); return '' })
  return r
}

/** A name no other preset has: "Name", then "Name (2)", "Name (3)" ... (case-insensitive). */
export function uniquePresetName(name: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((n) => n.trim().toLowerCase()))
  const base = name.trim() || 'Imported preset'
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
