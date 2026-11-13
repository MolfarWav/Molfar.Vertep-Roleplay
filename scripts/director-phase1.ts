// Turn director phase 1 (Molfar.Vertep #401): reads what scripts/director-score.ts wrote with --json, plus the raw
// results of the runs, and prints the tables of the three experiments in MEASUREMENTS.md's manner.
//
//   bun scripts/director-phase1.ts --chat C=<corpus dir>[:<score json>] --chat A=... --noise noise-1,noise-2,noise-3 \
//        --ref baseline-v2 --runs ask-first,calibrated,ask-first-calibrated [--out phase1.json]
//
// Every chat dir needs a score json (default <corpus>/score-phase1.json) made with
//   bun scripts/director-score.ts <corpus> --key labels-key.json --runs <all tags, also <tag>-flags> --json <file>
// `--noise` tags exist for the first chat only (experiment 0).
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const all = (n: string) => args.flatMap((a, i) => (a === n ? [args[i + 1]!] : []));
const one = (n: string) => all(n)[0];
const SIGS = ["quest_progress", "quest_end", "new_goal", "place_change", "time_jump", "scene_cut", "clothes_change", "item_change", "person_enter", "person_leave", "relation_event", "secret_learned", "vow_said"];
const chats = all("--chat").map((s) => {
  const [id, rest] = [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)];
  const [dir, json] = rest.split("|");
  return { id, dir: dir!, json: json ?? path.join(dir!, "score-phase1.json") };
});
const noiseTags = (one("--noise") ?? "").split(",").filter(Boolean);
const ref = one("--ref") ?? "baseline-v2";
const runTags = (one("--runs") ?? "").split(",").filter(Boolean);
const outFile = one("--out");

type Counts = { tp: number; fp: number; fn: number; pos: number };
const readJson = (f: string): any => JSON.parse(fs.readFileSync(f, "utf8"));
const scoreOf = new Map<string, any[]>();
for (const c of chats) scoreOf.set(c.id, readJson(c.json));
const runIn = (chat: string, tag: string) => scoreOf.get(chat)?.find((r: any) => r.tag === tag);
const results = (chat: string, tag: string): any => {
  const c = chats.find((x) => x.id === chat)!;
  try {
    return readJson(path.join(c.dir, `results-${tag}.json`));
  } catch {
    return null;
  }
};
const sumCounts = (cs: Counts[]): Counts => cs.reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn, pos: a.pos + c.pos }), { tp: 0, fp: 0, fn: 0, pos: 0 });
const f1 = (c: Counts) => (2 * c.tp + c.fp + c.fn === 0 ? NaN : (2 * c.tp) / (2 * c.tp + c.fp + c.fn));
const rec = (c: Counts) => (c.tp + c.fn ? c.tp / (c.tp + c.fn) : NaN);
const prec = (c: Counts) => (c.tp + c.fp ? c.tp / (c.tp + c.fp) : NaN);
const pct = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) + "%" : "n/a");
const micro = (run: any): Counts => sumCounts(SIGS.map((s) => run.counts[s]));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
const band = (xs: number[]) => (xs.length ? `${pct(mean(xs))} (${pct(Math.min(...xs))}-${pct(Math.max(...xs))})` : "n/a");
const lines: string[] = [];
const out = (s = "") => lines.push(s);
const json: any = { noise: {}, runs: {}, flags: {}, director: {} };

// ---------- experiment 0: the noise band ----------
if (noiseTags.length && chats.length) {
  const chat = chats[0]!.id;
  const tags = [...noiseTags, ref].filter((t) => runIn(chat, t));
  out(`### Experiment 0: noise band, ${chat}, ${noiseTags.length} repeats of ${ref} (+ the original ${ref} run as the last column)`);
  out();
  out("| signal | key + | " + tags.join(" | ") + " | mean | min | max |");
  out("|---|---:|" + tags.map(() => "---|").join("") + "---:|---:|---:|");
  const rows = [...SIGS.map((s) => [s, (c: any) => c.counts[s] as Counts] as const), ["**all 13 (micro)**", (c: any) => micro(c)] as const];
  for (const [name, get] of rows) {
    const cs = tags.map((t) => get(runIn(chat, t)));
    const f = cs.map(f1);
    const base = noiseTags.filter((t) => runIn(chat, t)).map((t) => f1(get(runIn(chat, t))));
    out(`| ${name} | ${cs[0]!.pos} | ` + cs.map((c) => `${pct(f1(c))} (${c.tp}/${c.fp}/${c.fn})`).join(" | ") + ` | ${pct(mean(base))} | ${pct(Math.min(...base))} | ${pct(Math.max(...base))} |`);
    json.noise[String(name)] = { f1: f, repeats: base };
  }
  // recall of the micro row and the time and token noise
  const mr = noiseTags.map((t) => rec(micro(runIn(chat, t))));
  const mp = noiseTags.map((t) => prec(micro(runIn(chat, t))));
  out();
  out(`Micro recall over the repeats: ${band(mr)}; micro precision: ${band(mp)}.`);
  out();
  out("| run | mean ms/turn | sensor input tokens/turn (provider) | output tokens/turn |");
  out("|---|---:|---:|---:|");
  for (const t of tags) {
    const r = results(chat, t);
    if (!r) continue;
    const turns = r.turns.filter((x: any) => x.calls?.length);
    out(`| ${t} | ${fmt(mean(turns.map((x: any) => x.ms)), 0)} | ${fmt(mean(turns.map((x: any) => x.calls.reduce((s: number, c: any) => s + (c.input || 0), 0))), 0)} | ${fmt(mean(turns.map((x: any) => x.calls.reduce((s: number, c: any) => s + (c.output || 0), 0))), 0)} |`);
  }
  out();
}

// ---------- experiments 1 and 2: runs against the reference, per chat ----------
const per = (chat: string, tag: string) => {
  const run = runIn(chat, tag);
  if (!run) return null;
  const r = results(chat, tag);
  const turns = (r?.turns ?? []).filter((x: any) => x.calls?.length);
  const tin = mean(turns.map((x: any) => x.calls.reduce((s: number, c: any) => s + (c.input || 0), 0)));
  const tout = mean(turns.map((x: any) => x.calls.reduce((s: number, c: any) => s + (c.output || 0), 0)));
  const ms = mean(turns.map((x: any) => x.ms));
  return { run, tin, tout, ms, m: micro(run) };
};
const chatIds = chats.map((c) => c.id);
const sigRows = (tagA: string, tags: string[]) => {
  out("| signal | " + chatIds.map((c) => `${c} ${tagA} / ` + tags.map((t) => t).join(" / ")).join(" | ") + " |");
};
void sigRows;

out("### Micro F1 / recall / precision (state proxy), per chat");
out();
out("| run | " + chatIds.join(" | ") + " | pooled |");
out("|---|" + chatIds.map(() => "---|").join("") + "---|");
for (const t of [ref, ...runTags]) {
  const cells = chatIds.map((c) => per(c, t));
  const pooled = sumCounts(cells.filter(Boolean).map((x) => x!.m));
  out(`| ${t} | ` + cells.map((x) => (x ? `${pct(f1(x.m))} / ${pct(rec(x.m))} / ${pct(prec(x.m))}` : "-")).join(" | ") + ` | ${pct(f1(pooled))} / ${pct(rec(pooled))} / ${pct(prec(pooled))} |`);
  json.runs[t] = Object.fromEntries(chatIds.map((c, i) => [c, cells[i] ? { f1: f1(cells[i]!.m), recall: rec(cells[i]!.m), precision: prec(cells[i]!.m) } : null]));
}
out();
out("### Cost and time per turn, per chat (mean over turns; provider tokens; ms is the whole turn)");
out();
out("| run | " + chatIds.map((c) => `${c} ms / in / out`).join(" | ") + " |");
out("|---|" + chatIds.map(() => "---|").join(""));
for (const t of [...noiseTags.slice(0, 1), ref, ...runTags]) {
  const cells = chatIds.map((c) => per(c, t));
  out(`| ${t} | ` + cells.map((x) => (x ? `${fmt(x.ms, 0)} / ${fmt(x.tin, 0)} / ${fmt(x.tout, 0)}` : "-")).join(" | ") + " |");
}
out();

out("### Over-reported fields (TP/FP/FN pooled over chats, state proxy)");
out();
const FIELDS = ["secret_learned", "relation_event", "vow_said", "clothes_change", "item_change"];
out("| run | " + FIELDS.join(" | ") + " |");
out("|---|" + FIELDS.map(() => "---|").join(""));
for (const t of [ref, ...runTags]) {
  const cells = FIELDS.map((s) => sumCounts(chatIds.map((c) => runIn(c, t)).filter(Boolean).map((r) => r.counts[s])));
  out(`| ${t} | ` + cells.map((c) => `${c.tp}/${c.fp}/${c.fn}`).join(" | ") + " |");
  json.runs[t] = { ...(json.runs[t] ?? {}), fields: Object.fromEntries(FIELDS.map((s, i) => [s, cells[i]])) };
}
out();

// ---------- experiment 1 details: the flags ----------
const flagRuns = runTags.filter((t) => chatIds.some((c) => runIn(c, t + "-flags")));
if (flagRuns.length) {
  out("### Experiment 1: the `changed` flags against the key (router-style scoring), pooled over chats");
  out();
  out("| run | micro F1 / recall / precision | " + SIGS.join(" | ") + " |");
  out("|---|---|" + SIGS.map(() => "---|").join(""));
  for (const t of [ref.startsWith("router") ? ref : "", ...flagRuns.map((x) => x + "-flags")].filter(Boolean)) {
    const rs = chatIds.map((c) => runIn(c, t)).filter(Boolean);
    const m = sumCounts(rs.map(micro));
    out(`| ${t} | ${pct(f1(m))} / ${pct(rec(m))} / ${pct(prec(m))} | ` + SIGS.map((s) => { const c = sumCounts(rs.map((r) => r.counts[s])); return `${c.tp}/${c.fp}/${c.fn}`; }).join(" | ") + " |");
    json.flags[t] = { f1: f1(m), recall: rec(m), precision: prec(m) };
  }
  out();

  // the keys of each group, written or left out, against the flags
  const GROUPS: Record<string, { flags: string[]; keys: string[] }> = {
    scene: { flags: ["place_change", "time_jump", "scene_cut", "person_enter", "person_leave"], keys: ["place", "weather", "scene", "present", "struck", "userAt"] },
    things: { flags: ["clothes_change", "item_change"], keys: ["objects"] },
    relations: { flags: ["relation_event"], keys: ["events", "edges"] },
    knowledge: { flags: ["secret_learned", "vow_said"], keys: ["learned", "said", "told", "retire", "people", "blindSpot"] },
    threads: { flags: ["quest_progress", "quest_end", "new_goal"], keys: ["threads"] },
  };
  const filled = (v: any) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
  out("### Experiment 1: how the output followed the flags (turns where the group's section was written or left out)");
  out();
  out("| run | group | turns | flag true, written | flag true, left out | flag false, written | flag false, left out |");
  out("|---|---|---:|---:|---:|---:|---:|");
  for (const t of flagRuns) {
    for (const [g, d] of Object.entries(GROUPS)) {
      const n = { tw: 0, tl: 0, fw: 0, fl: 0 };
      for (const c of chatIds) {
        const r = results(c, t);
        for (const x of r?.turns ?? []) {
          if (!x.changed || !x.raw) continue;
          const flag = d.flags.some((f) => x.changed[f] === true);
          const inChars = (field: string) => Object.values<any>(x.raw.chars && typeof x.raw.chars === "object" ? x.raw.chars : {}).some((v) => filled(v?.[field]));
          const wrote = d.keys.some((k) => filled(x.raw[k])) || (g === "things" && (inChars("outfit") || inChars("holding"))) || (g === "scene" && inChars("at"));
          if (flag && wrote) n.tw++;
          else if (flag) n.tl++;
          else if (wrote) n.fw++;
          else n.fl++;
        }
      }
      out(`| ${t} | ${g} | ${n.tw + n.tl + n.fw + n.fl} | ${n.tw} | ${n.tl} | ${n.fw} | ${n.fl} |`);
      json.flags[t + ":" + g] = n;
    }
  }
  out();

  // the price of skipping: the flag is false but the state of the baseline-v2 run (or the key) shows a change
  out("### Experiment 1: the price of skipping (flag false, the key says the change happened), pooled over chats");
  out();
  out("| run | " + SIGS.join(" | ") + " |");
  out("|---|" + SIGS.map(() => "---|").join(""));
  for (const t of flagRuns) {
    const rs = chatIds.map((c) => runIn(c, t + "-flags")).filter(Boolean);
    out(`| ${t} | ` + SIGS.map((s) => { const c = sumCounts(rs.map((r) => r.counts[s])); return `${c.fn} of ${c.pos}`; }).join(" | ") + " |");
  }
  out();

  // ---------- experiment 3: the flags as the director ----------
  out("### Experiment 3: the flags as the director's trigger (pooled over chats; a miss only delays a job by a turn)");
  out();
  out("| run | trigger | real triggers (key) | caught | missed | recall | false wakes | wakes per 100 turns |");
  out("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const t of flagRuns) {
    const rs = chatIds.map((c) => runIn(c, t + "-flags")).filter(Boolean);
    const turns = rs.reduce((a, r) => a + r.turns, 0);
    const combos: [string, (p: any) => boolean, (k: any) => boolean][] = [];
    for (const s of ["scene_cut", "place_change", "time_jump"]) {
      const c = sumCounts(rs.map((r) => r.counts[s]));
      out(`| ${t} | ${s} | ${c.pos} | ${c.tp} | ${c.fn} | ${pct(rec(c))} | ${c.fp} | ${fmt(((c.tp + c.fp) / turns) * 100, 0)} |`);
      json.director[`${t}:${s}`] = { ...c, recall: rec(c), turns };
    }
    void combos;
  }
  out("");
  // one wake for any of the three (what a job waiting for "the scene changed" would use), flags against the sensor's own
  // proxy (`scene.new`, the place text, minutes) of the reference run
  out("Any of the three together (a turn is a trigger when scene_cut, place_change or time_jump is true):");
  out();
  out("| source | real triggers (key) | caught | missed | recall | false wakes | wakes per 100 turns |");
  out("|---|---:|---:|---:|---:|---:|---:|");
  const TRIG = ["scene_cut", "place_change", "time_jump"];
  const union = (runTag: string, label: string) => {
    let pos = 0, tp = 0, fn = 0, fp = 0, turns = 0;
    for (const c of chats) {
      const run = runIn(c.id, runTag);
      if (!run) continue;
      const key = readJson(path.join(c.dir, "labels-key.json"));
      for (const [k, p] of Object.entries<any>(run.preds ?? {})) {
        const truth = TRIG.some((s) => key.turns?.[k]?.signals?.[s] === true);
        const pred = !!p && TRIG.some((s) => p[s] === true);
        turns++;
        if (truth) pos++;
        if (truth && pred) tp++;
        else if (truth) fn++;
        else if (pred) fp++;
      }
    }
    if (!turns) return;
    out(`| ${label} | ${pos} | ${tp} | ${fn} | ${pct(tp / pos)} | ${fp} | ${fmt(((tp + fp) / turns) * 100, 0)} |`);
    json.director[`union:${label}`] = { pos, tp, fn, fp, turns, recall: tp / pos };
  };
  union(ref, `${ref} (state proxy)`);
  for (const t of flagRuns) union(t + "-flags", `${t} flags`);
  out();
}

const text = lines.join("\n") + "\n";
console.log(text);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(json, null, 1));
