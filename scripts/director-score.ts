// Turn director bench scorer (Molfar.Vertep #401): scores the runs written by scripts/director-bench.ts against the
// hand-made answer key.
//
//   bun scripts/director-score.ts <corpus dir> --key labels-key.json --runs baseline,split,router [--out score.md]
//
// Reads <corpus>/results-<tag>.json per run and the key, prints markdown to stdout and writes it to --out
// (default <corpus>/score.md). Router runs carry their own yes/no signals; replay runs (baseline, split) are
// compared turn against turn from the sensor's raw JSON and the state snapshot each turn left.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const corpus = args[0];
if (!corpus || corpus.startsWith("--")) {
  console.error("usage: bun scripts/director-score.ts <corpus dir> --key labels-key.json --runs a,b,c [--out score.md]");
  process.exit(1);
}
const keyFile = flag("--key") ?? "labels-key.json";
const tags = (flag("--runs") ?? "baseline,split,router").split(",").map((s) => s.trim()).filter(Boolean);
const outFile = flag("--out") ?? path.join(corpus, "score.md");
const resolveIn = (f: string) => (path.isAbsolute(f) || !fs.existsSync(path.join(corpus, f)) ? f : path.join(corpus, f));

const SIGNALS = [
  "quest_progress",
  "quest_end",
  "new_goal",
  "place_change",
  "time_jump",
  "scene_cut",
  "clothes_change",
  "item_change",
  "person_enter",
  "person_leave",
  "relation_event",
  "secret_learned",
  "vow_said",
] as const;
type Sig = (typeof SIGNALS)[number];
type Flags = Partial<Record<Sig | "relation_event_any", boolean>>;

// ---------- loading ----------
const readJson = (f: string): any => JSON.parse(fs.readFileSync(f, "utf8"));
const key = readJson(resolveIn(keyFile));
const keyTurns: Record<string, any> = key?.turns ?? {};
const keyQuests: any[] = Array.isArray(key?.quests) ? key.quests : [];

type Run = { tag: string; mode: string; turns: any[]; missing?: string };
const runs: Run[] = tags.map((tag) => {
  try {
    const j = readJson(path.join(corpus, `results-${tag}.json`));
    return { tag, mode: String(j?.mode ?? ""), turns: Array.isArray(j?.turns) ? j.turns : [] };
  } catch (e) {
    return { tag, mode: "", turns: [], missing: String(e) };
  }
});

// ---------- helpers ----------
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const openThreads = (snap: any): any[] => arr(snap?.threads).filter((t) => t && t.status === "open");
const setOf = (a: unknown[]) => new Set(a.map(String));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const withPrefix = (list: unknown, p: string) => arr(list).map(String).filter((s) => s.startsWith(p));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
const pct = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) + "%" : "n/a");

// ---------- replay derivation ----------
function derive(rec: any, prev: any): { flags: Flags; diffed: boolean } {
  const raw = rec?.raw && typeof rec.raw === "object" ? rec.raw : null;
  const snap = rec?.snap ?? null;
  const ps = prev?.snap ?? null;
  const f: Flags = {};
  for (const s of SIGNALS) f[s] = false;
  f.relation_event_any = false;

  // signals from the raw sensor JSON
  if (raw) {
    f.time_jump = Number(raw.minutes) > 30;
    f.scene_cut = raw.scene?.new === true;
    const events = arr(raw.events);
    f.relation_event = events.some((e) => e?.weight === "significant" || e?.weight === "pivotal");
    f.relation_event_any = events.length > 0;
    f.secret_learned = arr(raw.learned).some((l) => l && l.weight !== "everyday") || arr(raw.said).some((s) => s?.kind === "secret" || s?.kind === "confession");
    f.vow_said = arr(raw.said).length > 0;
    if (arr(raw.struck).length > 0) f.person_leave = true;
  }

  // signals from the snapshot against the previous one
  const diffed = !!(snap && ps);
  if (diffed) {
    const prevOpen = openThreads(ps);
    const curOpen = openThreads(snap);
    const prevOpenIds = new Set(prevOpen.map((t) => String(t.id)));
    const curOpenIds = new Set(curOpen.map((t) => String(t.id)));
    const prevAllIds = new Set(arr(ps.threads).map((t) => String(t?.id)));
    const prevText = new Map(prevOpen.map((t) => [String(t.id), String(t.text ?? "")]));
    f.quest_end = [...prevOpenIds].some((id) => !curOpenIds.has(id));
    f.new_goal = curOpen.some((t) => !prevAllIds.has(String(t.id)));
    f.quest_progress = curOpen.some((t) => {
      const id = String(t.id);
      if (prevText.has(id)) return prevText.get(id) !== String(t.text ?? "");
      return !prevAllIds.has(id) && !!t.parent;
    });

    const pp = norm(ps.clock?.place);
    const cp = norm(snap.clock?.place);
    f.place_change = !!pp && !!cp && pp !== cp;
    if (Number(snap.clock?.day) > Number(ps.clock?.day)) f.time_jump = true;

    const items: Record<string, unknown[]> = snap.items && typeof snap.items === "object" ? snap.items : {};
    const pitems: Record<string, unknown[]> = ps.items && typeof ps.items === "object" ? ps.items : {};
    const names = new Set([...Object.keys(items), ...Object.keys(pitems)]);
    for (const n of names) {
      if (!sameSet(setOf(withPrefix(items[n], "wear:")), setOf(withPrefix(pitems[n], "wear:")))) f.clothes_change = true;
      if (!sameSet(setOf(withPrefix(items[n], "hold:")), setOf(withPrefix(pitems[n], "hold:")))) f.item_change = true;
    }
    if (!sameSet(setOf(arr(snap.objects)), setOf(arr(ps.objects)))) f.item_change = true;

    const pres = setOf(arr(snap.present));
    const ppres = setOf(arr(ps.present));
    if ([...pres].some((n) => !ppres.has(n))) f.person_enter = true;
    if ([...ppres].some((n) => !pres.has(n))) f.person_leave = true;
  }
  return { flags: f, diffed };
}

// ---------- scoring ----------
type Counts = { tp: number; fp: number; fn: number; pos: number };
const emptyCounts = (): Counts => ({ tp: 0, fp: 0, fn: 0, pos: 0 });
const SCORED: (Sig | "relation_event_any")[] = [...SIGNALS, "relation_event_any"];

type RunScore = {
  run: Run;
  replay: boolean;
  scoredTurns: number[];
  counts: Record<string, Counts>;
  unreadable: number;
  recs: Map<number, any>;
  prevs: Map<number, any>;
};

function scoreRun(run: Run): RunScore {
  const replay = run.mode !== "router";
  const counts: Record<string, Counts> = {};
  for (const s of SCORED) counts[s] = emptyCounts();
  const recs = new Map<number, any>();
  const prevs = new Map<number, any>();
  run.turns.forEach((t, i) => {
    recs.set(Number(t?.k), t);
    prevs.set(Number(t?.k), run.turns[i - 1] ?? null);
  });
  const scoredTurns: number[] = [];
  let unreadable = 0;
  for (const [k, rec] of recs) {
    if (k === 0 || !keyTurns[String(k)]) continue;
    scoredTurns.push(k);
    const truth = keyTurns[String(k)]?.signals ?? {};
    let pred: Flags;
    if (replay) pred = derive(rec, prevs.get(k)).flags;
    else {
      const sg = rec?.signals;
      if (!sg || typeof sg !== "object") {
        unreadable++;
        pred = {};
      } else pred = sg;
    }
    for (const s of SCORED) {
      // "relation_event (any)" has no key of its own: it is judged against relation_event
      const t = s === "relation_event_any" ? truth.relation_event === true : truth[s] === true;
      const p = pred[s] === true || (!replay && s === "relation_event_any" && pred.relation_event === true);
      const c = counts[s]!;
      if (t) c.pos++;
      if (t && p) c.tp++;
      else if (!t && p) c.fp++;
      else if (t && !p) c.fn++;
    }
  }
  scoredTurns.sort((a, b) => a - b);
  return { run, replay, scoredTurns, counts, unreadable, recs, prevs };
}

const scores = runs.map(scoreRun);
const lines: string[] = [];
const out = (s = "") => lines.push(s);

out("# Turn director score");
out();
out(`Key: ${keyFile} (chat ${key?.chat ?? "?"}, ${Object.keys(keyTurns).length} labelled turns). R = recall, P = precision, counts are TP/FP/FN.`);
for (const s of scores) {
  out(`- ${s.run.tag}: mode ${s.run.mode || "?"}, ${s.run.turns.length} records, ${s.scoredTurns.length} scored turns${s.run.missing ? " (results file not readable)" : ""}${s.replay ? "" : `, ${s.unreadable} unreadable`}`);
}

// ----- signals -----
out();
out("## Signals");
out();
out("| signal | key + | " + scores.map((s) => s.run.tag).join(" | ") + " |");
out("|---|---:|" + scores.map(() => "---|").join(""));
const f1 = (c: Counts) => (2 * c.tp + c.fp + c.fn === 0 ? NaN : (2 * c.tp) / (2 * c.tp + c.fp + c.fn));
const cell = (c: Counts) => {
  const r = c.tp + c.fn ? c.tp / (c.tp + c.fn) : NaN;
  const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : NaN;
  return `R ${pct(r)} P ${pct(p)} F1 ${pct(f1(c))} (${c.tp}/${c.fp}/${c.fn})`;
};
for (const sig of SCORED) {
  const label = sig === "relation_event_any" ? "relation_event (any)" : sig;
  // positives depend only on the scored turns: show the largest over the runs
  const posText = String(Math.max(0, ...scores.map((s) => s.counts[sig]!.pos)));
  out(`| ${label} | ${posText} | ` + scores.map((s) => cell(s.counts[sig]!)).join(" | ") + " |");
}
// micro average over the 13 real signals
{
  const cells = scores.map((s) => {
    const c = emptyCounts();
    for (const sig of SIGNALS) {
      const x = s.counts[sig]!;
      c.tp += x.tp;
      c.fp += x.fp;
      c.fn += x.fn;
      c.pos += x.pos;
    }
    return cell(c);
  });
  out(`| **all 13 (micro)** | | ` + cells.join(" | ") + " |");
}

// ----- cost and time -----
out();
out("## Cost and time");
out();
out("| run | turns | mean ms/turn | mean sensorMs | input tokens (total / per turn) | output tokens (total / per turn) | call errors |");
out("|---|---:|---:|---:|---|---|---:|");
for (const s of scores) {
  const recs = s.run.turns.filter((t) => t && typeof t === "object");
  const calls = (t: any) => arr(t.calls);
  const tin = recs.map((t) => sum(calls(t).map((c) => Number(c?.input) || 0)));
  const tout = recs.map((t) => sum(calls(t).map((c) => Number(c?.output) || 0)));
  const errs = sum(recs.map((t) => calls(t).filter((c) => c?.error).length));
  const ms = recs.map((t) => Number(t.ms)).filter(Number.isFinite);
  const sms = recs.map((t) => t.sensorMs).filter((n): n is number => typeof n === "number");
  out(`| ${s.run.tag} | ${recs.length} | ${fmt(mean(ms), 0)} | ${fmt(mean(sms), 0)} | ${sum(tin)} / ${fmt(mean(tin), 0)} | ${sum(tout)} / ${fmt(mean(tout), 0)} | ${errs} |`);
}

// ----- present accuracy -----
out();
out("## Present accuracy (replay runs)");
out();
out("Jaccard of the snapshot's present list against the key's present list, first word of each name, lowercase; mean over scored turns.");
out();
out("| run | turns compared | mean Jaccard |");
out("|---|---:|---:|");
const first = (n: unknown) => norm(n).split(" ")[0] ?? "";
for (const s of scores) {
  if (!s.replay) continue;
  const js: number[] = [];
  for (const k of s.scoredTurns) {
    const snap = s.recs.get(k)?.snap;
    if (!snap) continue;
    const a = new Set(arr(snap.present).map(first).filter(Boolean));
    const b = new Set(arr(keyTurns[String(k)]?.present).map(first).filter(Boolean));
    const inter = [...a].filter((x) => b.has(x)).length;
    const uni = new Set([...a, ...b]).size;
    js.push(uni ? inter / uni : 1);
  }
  out(`| ${s.run.tag} | ${js.length} | ${fmt(mean(js), 3)} |`);
}

// ----- quests -----
out();
out("## Quests (replay runs)");
out();
const replayRuns = scores.filter((s) => s.replay);
const turnsAll = [...new Set(replayRuns.flatMap((s) => s.scoredTurns))].sort((a, b) => a - b);
const keyOpen = (k: number) => keyQuests.filter((q) => Number(q.opened) <= k && (q.closed === null || q.closed === undefined || Number(q.closed) > k)).length;
out("Open quests per turn: key counts quests with opened <= k and not yet closed; runs count open threads in the snapshot.");
out();
out("| turn | key | " + replayRuns.map((s) => s.run.tag).join(" | ") + " |");
out("|---:|---:|" + replayRuns.map(() => "---:|").join(""));
const diffs: Record<string, number[]> = {};
for (const s of replayRuns) diffs[s.run.tag] = [];
for (const k of turnsAll) {
  const kk = keyOpen(k);
  const cells = replayRuns.map((s) => {
    const snap = s.recs.get(k)?.snap;
    if (!snap || !s.scoredTurns.includes(k)) return "-";
    const n = openThreads(snap).length;
    diffs[s.run.tag]!.push(n - kk);
    return String(n);
  });
  out(`| ${k} | ${kk} | ` + cells.join(" | ") + " |");
}
out();
const keyCloses = keyQuests.filter((q) => q.closed !== null && q.closed !== undefined).length;
out(`Key: ${keyQuests.length} quests, ${keyCloses} closed.`);
out();
out("| run | mean (run - key) open count (lingering) | thread closes |");
out("|---|---:|---:|");
for (const s of replayRuns) {
  let closes = 0;
  for (const k of s.scoredTurns) {
    const rec = s.recs.get(k);
    const ps = s.prevs.get(k)?.snap;
    if (!rec?.snap || !ps) continue;
    const cur = new Set(openThreads(rec.snap).map((t) => String(t.id)));
    closes += openThreads(ps).filter((t) => !cur.has(String(t.id))).length;
  }
  out(`| ${s.run.tag} | ${fmt(mean(diffs[s.run.tag]!), 2)} | ${closes} |`);
}

const text = lines.join("\n") + "\n";
console.log(text);
fs.writeFileSync(outFile, text, "utf8");
