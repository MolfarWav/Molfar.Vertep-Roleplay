// Turn director bench, analysis (Molfar.Vertep #401): derives the numbers of the measurements document from the
// results the bench already wrote. Makes no model calls.
//
//   bun scripts/director-analyze.ts <corpus dir>... [--out analysis.json]
//
// Per corpus (a dir with labels-key.json and results-<tag>.json from scripts/director-bench.ts):
// - inventory: every run (tag, mode, model, quest rules, turns, errors, time, tokens);
// - blocks: tokens of each input block of the sensor call at sampled turns (what grows with the chat);
// - system: tokens of each part of the sensor's system prompt (from a call captured without a model);
// - signals: TP/FP/FN per signal per run (re-derived as scripts/director-score.ts does), so the direction of errors shows;
// - present: names missed and names extra against the key, per replay run;
// - specialists: mean tokens and time per specialist in split runs, and the tokens of the blocks each one is given;
// - router: what each router run would wake and miss if it gated the specialists (simulation; nothing was gated live).
// Token counts use src/lib/tokens.ts (o200k BPE); each sampled sensor call is also compared with the provider's count.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { estimateTokens } from "../src/lib/tokens";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outFile = outAt >= 0 ? args[outAt + 1] : "analysis.json";
const corpora = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const P: any = await import(new URL("../plugins/relations/plugin.js", import.meta.url).href);

const SIGNALS = ["quest_progress", "quest_end", "new_goal", "place_change", "time_jump", "scene_cut", "clothes_change", "item_change", "person_enter", "person_leave", "relation_event", "secret_learned", "vow_said"];
const HEADS = /^(Characters|Previous state|Notebook of|Thread check|Backgrounds|Leak check|Word scan|Card attire|New messages)/;
// the specialists of the bench (scripts/director-bench.ts SPECS): which input blocks each gets, which signals it owns
const SPEC_BLOCKS: Record<string, RegExp> = {
  scene: /^(Characters|Previous state|Backgrounds|New messages)/,
  things: /^(Characters|Previous state|Word scan|Card attire|New messages)/,
  relations: /^(Characters|Previous state|New messages)/,
  knowledge: /^(Characters|Previous state|Notebook of|Leak check|New messages)/,
  quests: /^(Previous state|Thread check|New messages)/,
};
const SPEC_SIGNALS: Record<string, string[]> = {
  scene: ["place_change", "time_jump", "scene_cut", "person_enter", "person_leave"],
  things: ["clothes_change", "item_change"],
  relations: ["relation_event"],
  knowledge: ["secret_learned", "vow_said"],
  quests: ["quest_progress", "quest_end", "new_goal"],
};

function blocksOf(input: string): string[] {
  const out: string[] = [];
  for (const piece of input.split("\n\n")) {
    if (HEADS.test(piece) || !out.length) out.push(piece);
    else out[out.length - 1] += "\n\n" + piece;
  }
  return out;
}
const headOf = (b: string) => (b.match(HEADS)?.[1] ?? "other").replace("Notebook of", "Notebooks");
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- derived signals of a replay run (the rules of scripts/director-score.ts) ----------
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const first = (s: string) => norm(s).split(" ")[0] ?? "";
function derived(rec: any, prev: any): Record<string, boolean> | null {
  const s = rec?.snap;
  const p = prev?.snap;
  const raw = rec?.raw ?? {};
  if (!s) return null;
  const openOf = (x: any) => new Map<string, any>((x?.threads ?? []).filter((t: any) => t.status === "open").map((t: any) => [t.id, t]));
  const ids = (x: any) => new Set<string>((x?.threads ?? []).map((t: any) => t.id));
  const o = openOf(s);
  const po = openOf(p);
  const kinds = (x: any, kind: string) => JSON.stringify(Object.entries(x?.items ?? {}).map(([n, l]: any) => [n, l.filter((e: string) => e.startsWith(kind + ":")).sort()]).sort());
  const presentNow = new Set<string>((s.present ?? []).map(first));
  const presentBefore = new Set<string>((p?.present ?? []).map(first));
  return {
    quest_end: !!p && [...po.keys()].some((id) => !o.has(id)),
    new_goal: !!p && [...o.keys()].some((id) => !ids(p).has(id)),
    quest_progress: !!p && ([...o.values()].some((t: any) => po.has(t.id) && po.get(t.id).text !== t.text) || [...o.values()].some((t: any) => !po.has(t.id) && t.parent)),
    place_change: !!p && !!norm(s.clock?.place) && !!norm(p.clock?.place) && norm(s.clock?.place) !== norm(p.clock?.place),
    time_jump: Number(raw.minutes) > 30 || (!!p && Number(s.clock?.day) > Number(p.clock?.day)),
    scene_cut: raw.scene?.new === true,
    clothes_change: !!p && kinds(s, "wear") !== kinds(p, "wear"),
    item_change: !!p && (kinds(s, "hold") !== kinds(p, "hold") || JSON.stringify([...(s.objects ?? [])].sort()) !== JSON.stringify([...(p.objects ?? [])].sort())),
    person_enter: !!p && [...presentNow].some((n) => !presentBefore.has(n)),
    person_leave: (!!p && [...presentBefore].some((n) => !presentNow.has(n))) || (Array.isArray(raw.struck) && raw.struck.length > 0),
    relation_event: (raw.events ?? []).some((e: any) => e?.weight === "significant" || e?.weight === "pivotal"),
    secret_learned: (raw.learned ?? []).some((l: any) => l?.weight && l.weight !== "everyday") || (raw.said ?? []).some((x: any) => x?.kind === "secret" || x?.kind === "confession"),
    vow_said: Array.isArray(raw.said) && raw.said.length > 0,
  };
}

// ---------- the sensor's system prompt, captured from one call without a model ----------
function captureSystem(corpus: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "director-analyze-"));
  fs.cpSync(path.join(corpus, "root"), root, { recursive: true });
  for (const d of ["dashboard/state", "registry", "_debug"]) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  const chatId = fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".jsonl"))!.replace(/\.jsonl$/, "");
  const lines = fs.readFileSync(path.join(root, "chats", chatId + ".jsonl"), "utf8").trim().split("\n");
  fs.writeFileSync(path.join(root, "chats", chatId + ".jsonl"), lines.slice(0, 3).join("\n") + "\n");
  let sys = "";
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, c: string) => {
        fs.mkdirSync(path.dirname(path.resolve(root, rel)), { recursive: true });
        fs.writeFileSync(path.resolve(root, rel), c, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: (_k: string, req: any) => { if (String(req.systemPrompt ?? "").startsWith("You are the scene sensor")) sys = req.systemPrompt; }, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  P.handleRoute({ query: {}, method: "POST", path: "/dashboard/update", body: { chatId } }, host);
  fs.rmSync(root, { recursive: true, force: true });
  return sys;
}
function systemParts(sys: string) {
  const [rules, rest = ""] = sys.split("\n\nEvent vocabulary\n");
  const [vocab, shape = ""] = rest.split("\n\nOutput shape\n");
  const parts: Record<string, number> = {};
  for (const p of P.SENSOR_PARTS) parts[p.key] = estimateTokens(P.DEFAULT_SENSOR_PARTS[p.key]);
  return { total: estimateTokens(sys), rules: estimateTokens(rules), parts, vocabulary: estimateTokens(vocab), outputShape: estimateTokens(shape), oldThreadsPart: estimateTokens((P.PAST_DEFAULT_PROMPTS.sensor.at(-1).match(/Threads:\n[\s\S]*?(?=\n\nKeep the whole reply compact)/) ?? [""])[0]) };
}

const report: any = {};
for (const corpus of corpora) {
  const name = path.basename(corpus);
  const key = JSON.parse(fs.readFileSync(path.join(corpus, "labels-key.json"), "utf8"));
  const runs = fs
    .readdirSync(corpus)
    .filter((f) => /^results-.+\.json$/.test(f) && !f.includes("smoke"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(corpus, f), "utf8")));
  const R: any = (report[name] = { keyTurns: Object.keys(key.turns).length, keyQuests: key.quests.length, keyClosed: key.quests.filter((q: any) => q.closed != null).length });

  // inventory
  R.inventory = runs.map((r) => {
    const calls = r.turns.flatMap((t: any) => t.calls ?? []);
    return {
      tag: r.tag,
      mode: r.mode,
      model: r.model ?? r.sensorModel ?? "(router: model of --from run unless overridden)",
      quests: /v3/.test(r.tag) ? "v3" : /v2/.test(r.tag) ? "v2" : "today's",
      turns: r.turns.length,
      callErrors: calls.filter((c: any) => c.error).length,
      msPerTurn: Math.round(mean(r.turns.map((t: any) => t.ms ?? 0))),
      inPerTurn: Math.round(sum(calls.map((c: any) => c.input ?? 0)) / Math.max(1, r.turns.length)),
      outPerTurn: Math.round(sum(calls.map((c: any) => c.output ?? 0)) / Math.max(1, r.turns.length)),
    };
  });

  // input blocks at sampled turns of the baseline run
  const base = runs.find((r) => r.tag === "baseline");
  if (base) {
    const withInput = base.turns.filter((t: any) => t.input);
    const ks = withInput.map((t: any) => t.k);
    const picks = [...new Set([ks[1] ?? ks[0], ks[Math.floor(ks.length / 4)], ks[Math.floor(ks.length / 2)], ks[Math.floor((3 * ks.length) / 4)], ks.at(-1)])];
    R.blocks = picks.map((k) => {
      const t = withInput.find((x: any) => x.k === k);
      const by: Record<string, number> = {};
      let notebooks = 0;
      for (const b of blocksOf(t.input)) {
        const h = headOf(b);
        if (h === "Notebooks") notebooks++;
        by[h] = (by[h] ?? 0) + estimateTokens(b);
      }
      const provider = (t.calls ?? []).find((c: any) => c.who === "sensor")?.input ?? null;
      return { k, blocks: by, notebooks, inputTotal: estimateTokens(t.input), providerPromptTokens: provider };
    });
    // the per-specialist inputs at the same turns
    R.specialistInputs = R.blocks.map((row: any) => {
      const t = withInput.find((x: any) => x.k === row.k);
      const bl = blocksOf(t.input);
      return { k: row.k, ...Object.fromEntries(Object.entries(SPEC_BLOCKS).map(([s, re]) => [s, estimateTokens(bl.filter((b) => re.test(b)).join("\n\n"))])) };
    });
  }
  R.system = systemParts(captureSystem(corpus));

  // signals per run, with direction
  const keyK = new Set(Object.keys(key.turns).map(Number).filter((k) => k !== 0));
  R.signals = {};
  for (const r of runs) {
    const counts: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(SIGNALS.map((s) => [s, { tp: 0, fp: 0, fn: 0 }]));
    r.turns.forEach((t: any, i: number) => {
      if (!keyK.has(t.k)) return;
      const got = r.mode === "router" ? t.signals ?? {} : derived(t, r.turns[i - 1]);
      if (!got) return;
      for (const s of SIGNALS) {
        const want = !!key.turns[String(t.k)].signals?.[s];
        const have = got[s] === true;
        if (want && have) counts[s]!.tp++;
        else if (have) counts[s]!.fp++;
        else if (want) counts[s]!.fn++;
      }
    });
    R.signals[r.tag] = counts;
  }

  // present: names missed and extra against the key (first word, lowercase)
  R.present = {};
  for (const r of runs.filter((x) => x.mode !== "router")) {
    let missed = 0;
    let extra = 0;
    let turns = 0;
    for (const t of r.turns) {
      const kt = key.turns[String(t.k)];
      if (!kt || !t.snap || t.k === 0) continue;
      turns++;
      const want = new Set<string>((kt.present ?? []).map(first));
      const have = new Set<string>((t.snap.present ?? []).map(first));
      missed += [...want].filter((n) => !have.has(n)).length;
      extra += [...have].filter((n) => !want.has(n)).length;
    }
    R.present[r.tag] = { turns, missedPerTurn: r1(missed / Math.max(1, turns)), extraPerTurn: r1(extra / Math.max(1, turns)) };
  }

  // quests: open count against the key, closes
  R.quests = {};
  for (const r of runs.filter((x) => x.mode !== "router")) {
    const diffs: number[] = [];
    let closes = 0;
    r.turns.forEach((t: any, i: number) => {
      if (!keyK.has(t.k) || !t.snap) return;
      const keyOpen = key.quests.filter((q: any) => q.opened <= t.k && (q.closed == null || q.closed > t.k)).length;
      const open = (t.snap.threads ?? []).filter((x: any) => x.status === "open");
      diffs.push(open.length - keyOpen);
      const prev = r.turns[i - 1]?.snap;
      if (prev) closes += (prev.threads ?? []).filter((x: any) => x.status === "open" && !open.some((o: any) => o.id === x.id)).length;
    });
    const last = r.turns.at(-1)?.snap;
    R.quests[r.tag] = { meanOpenMinusKey: r1(mean(diffs)), meanAbsDiff: r1(mean(diffs.map(Math.abs))), closes, openAtEnd: (last?.threads ?? []).filter((x: any) => x.status === "open").length };
  }

  // specialists: tokens and time per specialist in split and hybrid runs
  R.specialists = {};
  for (const r of runs.filter((x) => x.mode === "split" || x.mode === "hybrid")) {
    const by: Record<string, any[]> = {};
    for (const t of r.turns) for (const c of t.calls ?? []) (by[c.who] ??= []).push(c);
    R.specialists[r.tag] = Object.fromEntries(
      Object.entries(by).map(([w, cs]) => [w, { calls: cs.length, errors: cs.filter((c) => c.error).length, in: Math.round(mean(cs.map((c) => c.input ?? 0))), out: Math.round(mean(cs.map((c) => c.output ?? 0))), ms: Math.round(mean(cs.map((c) => c.ms ?? 0))) }]),
    );
  }

  // router: what it would wake if it gated the specialists (simulation)
  R.router = {};
  const split = runs.find((r) => r.tag === "split-v2") ?? runs.find((r) => r.mode === "split");
  const specCost = split ? R.specialists[split.tag] : null;
  const baseIn = base ? R.inventory.find((x: any) => x.tag === "baseline").inPerTurn : null;
  for (const r of runs.filter((x) => x.mode === "router")) {
    let woken = 0;
    let needed = 0;
    let missed = 0;
    let wasted = 0;
    let turns = 0;
    let specIn = 0;
    const missedBy: Record<string, number> = {};
    for (const t of r.turns) {
      const kt = key.turns[String(t.k)];
      if (!kt || t.k === 0) continue;
      turns++;
      for (const [s, sigs] of Object.entries(SPEC_SIGNALS)) {
        const on = sigs.some((g) => t.signals?.[g] === true);
        const need = sigs.some((g) => kt.signals?.[g] === true);
        if (on) {
          woken++;
          if (specCost?.[s]) specIn += specCost[s].in;
        }
        if (need) needed++;
        if (need && !on) {
          missed++;
          missedBy[s] = (missedBy[s] ?? 0) + 1;
        }
        if (on && !need) wasted++;
      }
    }
    const routerIn = mean(r.turns.map((t: any) => t.calls?.[0]?.input ?? 0));
    R.router[r.tag] = {
      turns,
      wokenPerTurn: r1(woken / turns),
      neededPerTurn: r1(needed / turns),
      missedShare: r1((100 * missed) / Math.max(1, needed)),
      wastedPerTurn: r1(wasted / turns),
      missedBy,
      inputPerTurn: Math.round(routerIn + specIn / turns),
      routerInputPerTurn: Math.round(routerIn),
      baselineInputPerTurn: baseIn,
      specialistCostsFrom: split?.tag ?? null,
    };
  }
}
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
