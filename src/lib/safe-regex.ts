/**
 * Native RegExp cannot be interrupted: a catastrophic-backtracking pattern
 * (`(a+)+b` against 40 a's) freezes the tab's main thread until the renderer
 * dies — the blank-screen class. User-authored regex therefore runs in a
 * Worker with a hard timeout; patterns that time out are remembered and
 * skipped afterwards, and the wedged worker is thrown away and recreated.
 *
 * Nothing runs a user pattern on the render path. The worker is a single
 * serialized job queue: one pattern at a time, so a timeout blames exactly
 * the pattern that wedged it.
 */

export interface SafeRegexResult {
  ok: boolean
  output?: string
  matches?: { start: number; end: number }[]
  error?: string
  timedOut?: boolean
}

// Application (same semantics as the message renderer): global exec loop,
// trim strings, {{match}} and $n/$<name> substitution, macro names, and a
// zero-length guard. Trim strings erase from every substituted value.
// Exported for the worker-semantics test; the engine itself only runs it
// inside the Worker created below.
export const WORKER_SRC = `
self.onmessage = (e) => {
  const { id, find, flags, replace, trims, macros, input } = e.data;
  try {
    const re = new RegExp(find, (flags || "").includes("g") ? flags : (flags || "") + "g");
    const trim = (v) => {
      let t = v;
      for (const s of (trims || [])) if (s) t = t.split(s).join("");
      return t;
    };
    const subMacros = (t) => (macros
      ? t.replace(/\\{\\{(user|char)\\}\\}/gi, (_, k) => macros[k.toLowerCase()] || "")
      : t);
    const matches = [];
    let output = "";
    let last = 0;
    let m;
    let guard = 0;
    while ((m = re.exec(input)) !== null && guard++ < 5000) {
      if (m.index === re.lastIndex) re.lastIndex++;
      matches.push({ start: m.index, end: m.index + m[0].length });
      let repl = String(replace ?? "").replace(/\\{\\{match\\}\\}/gi, "\\u0000");
      repl = repl.replace(/\\$(\\d+)|\\$<([^>]+)>/g, (_, num, name) => {
        const v = num != null ? m[Number(num)] : (m.groups ? m.groups[name] : undefined);
        return v != null && v !== "" ? trim(v) : "";
      });
      repl = subMacros(repl.split("\\u0000").join(trim(m[0])));
      output += input.slice(last, m.index) + repl;
      last = m.index + m[0].length;
    }
    output += input.slice(last);
    self.postMessage({ id, ok: true, output, matches });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
`

const badPatterns = new Set<string>()
let workerUrl: string | null = null
let sharedWorker: RegexWorker | null = null
let seq = 0
/** the shared worker has answered once: its start-up no longer counts toward a job's time */
let warm = false
/** extra time for the first job of a new worker: a cold start on a slow phone took longer than
 *  the job's own limit, and the pattern was then skipped for the whole session */
const COLD_START_MS = 5000

/** Structural shape of the browser Worker used here. Declared locally because
 *  the engine's TypeScript program compiles this app module too, without the
 *  DOM lib. */
interface RegexWorker {
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: (() => void) | null
  terminate: () => void
  postMessage: (message: unknown) => void
}

function createWorker(): RegexWorker | null {
  try {
    const ctor = (globalThis as { Worker?: new (url: string) => RegexWorker }).Worker
    if (!ctor) return null
    return new ctor(getWorkerUrl())
  } catch {
    return null
  }
}

const key = (find: string, flags: string) => `${find}::${flags}::`

interface PendingJob {
  id: number
  message: Record<string, unknown>
  timeoutMs: number
  resolve: (r: SafeRegexResult) => void
  timer?: ReturnType<typeof setTimeout>
}

const queue: PendingJob[] = []
let active: PendingJob | null = null

function getWorkerUrl(): string {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }))
  return workerUrl
}

function finishActive(result: SafeRegexResult): void {
  const job = active
  if (!job) return
  active = null
  if (job.timer !== undefined) clearTimeout(job.timer)
  job.resolve(result)
  pump()
}

function ensureWorker(): RegexWorker | null {
  if (sharedWorker) return sharedWorker
  const w = createWorker()
  if (!w) return null
  w.onmessage = (ev) => {
    const d = ev.data as ({ id?: number } & SafeRegexResult) | null
    warm = true
    if (!active || d?.id !== active.id) return
    finishActive(d)
  }
  w.onerror = () => {
    // a worker-level failure kills whatever it was running
    try { sharedWorker?.terminate() } catch { /* already gone */ }
    sharedWorker = null
    finishActive({ ok: false, error: "regex worker error" })
  }
  sharedWorker = w
  warm = false
  return w
}

function pump(): void {
  if (active || queue.length === 0) return
  const job = queue.shift()
  if (!job) return
  const w = ensureWorker()
  if (!w) {
    job.resolve({ ok: false, error: "regex worker unavailable" })
    pump()
    return
  }
  active = job
  const limit = job.timeoutMs + (warm ? 0 : COLD_START_MS)
  job.timer = setTimeout(() => {
    // only the one in-flight pattern can have wedged the worker
    try { sharedWorker?.terminate() } catch { /* already gone */ }
    sharedWorker = null
    finishActive({ ok: false, timedOut: true, error: `timed out (${job.timeoutMs}ms), likely catastrophic backtracking` })
  }, limit)
  try {
    w.postMessage(job.message)
  } catch {
    try { sharedWorker?.terminate() } catch { /* already gone */ }
    sharedWorker = null
    finishActive({ ok: false, error: "regex worker unavailable" })
  }
}

export function runRegexSafe(
  find: string,
  flags: string,
  replace: string,
  input: string,
  opts: { trims?: string[]; timeoutMs?: number; macros?: Record<string, string> } = {},
): Promise<SafeRegexResult> {
  return new Promise((resolve) => {
    if (!find) { resolve({ ok: true, output: input, matches: [] }); return }
    const id = ++seq
    queue.push({
      id,
      timeoutMs: opts.timeoutMs ?? 400,
      message: { id, find, flags: flags || "", replace, trims: opts.trims ?? [], macros: opts.macros, input },
      resolve: (r) => {
        if (r.timedOut) badPatterns.add(key(find, flags))
        resolve(r)
      },
    })
    pump()
  })
}

/** Sync check for render-path decisions: skip patterns that already timed out once. */
export function isBadPattern(find: string, flags: string): boolean {
  return badPatterns.has(key(find, flags))
}
