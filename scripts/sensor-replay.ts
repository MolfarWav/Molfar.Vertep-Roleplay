// Replays a saved chat through the Dashboard sensor, turn by turn, with a real model, and scores what the Dashboard
// ends up holding (outfit, holding, objects) against hand-written labels (#236).
//
//   bun scripts/sensor-replay.ts <corpus dir> [--plugin plugins/relations/plugin.js] [--model nanogpt/...] [--mock] [--tag name]
//
// A corpus dir (kept outside the repository: it holds a user's chats) has `root/` (a copy of the data folder with the chat,
// its card and lorebooks, dashboard/config.json) and `labels.json`:
//   { chat, turns: { "<index of a char reply>": { must: { Name: { wear: [[synonyms]], hold: [[synonyms]] } }, mustNot: { Name: { wear: [words] } } } },
//     never: { Name: { wear: [words], hold: [words] } }, oneOf: [[synonyms]], objectsNever: [words],
//     persons: { expected: ["Exact Name"], maybe: ["Acceptable Extra NPC"] },   // any character name outside both lists is a duplicate person (#236)
//     maxTurns: N,                 // replay only the first N char replies of `turns` (or of `replayTurns`)
//     replayTurns: [indexes] }     // which char replies to replay when `turns` is empty (persons-only labels)
// The key is read from NANOGPT_API_KEY or a keys.env of the ask-model skill; it is never printed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const corpus = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);
if (!corpus) throw new Error("usage: bun scripts/sensor-replay.ts <corpus dir> [--plugin p] [--model m] [--mock] [--tag t]");
const pluginPath = path.resolve(flag("--plugin") ?? "plugins/relations/plugin.js");
const mock = args.includes("--mock");
const tag = flag("--tag") ?? "run";
const modelOverride = flag("--model");

const P: any = await import(pathToUrl(pluginPath));
function pathToUrl(p: string) {
  return new URL("file:///" + p.replace(/\\/g, "/")).href;
}

// ---------- the model ----------
function keyFor(env: string): string {
  if (process.env[env]) return process.env[env]!;
  for (const f of [path.resolve(".claude/skills/ask-model/keys.env"), "D:/Claude/Molfar.Vertep/.claude/skills/ask-model/keys.env", path.join(os.homedir(), ".claude/skills/ask-model/keys.env")]) {
    try {
      const m = new RegExp("^" + env + "=(.*)$", "m").exec(fs.readFileSync(f, "utf8"));
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return "";
}
const BASES: Record<string, { url: string; env: string }> = {
  nanogpt: { url: "https://nano-gpt.com/api/subscription/v1", env: "NANOGPT_API_KEY" },
  nous: { url: "https://inference-api.nousresearch.com/v1", env: "NOUS_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY" },
};
async function callModel(req: any, fallbackModel: string): Promise<{ text: string; model: string; error?: string; usage?: any }> {
  if (mock) return { text: "{}", model: "mock" };
  const full = String(modelOverride ?? req.model ?? fallbackModel);
  const [prov, ...rest] = full.split("/");
  const base = BASES[prov!];
  if (!base) return { text: "", model: full, error: "unknown provider " + prov };
  const key = keyFor(base.env);
  if (!key) return { text: "", model: full, error: "no key " + base.env };
  const body = {
    model: rest.join("/"),
    messages: [{ role: "system", content: req.systemPrompt ?? "" }, ...(req.messages ?? [])],
    max_tokens: req.presetParams?.max_tokens ?? 4000,
    temperature: req.presetParams?.temperature ?? 0,
  };
  try {
    const r = await fetch(base.url + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(body) });
    const j: any = await r.json();
    if (!r.ok) return { text: "", model: full, error: String(j?.error?.message ?? r.status) };
    return { text: String(j.choices?.[0]?.message?.content ?? ""), model: full, usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 } };
  } catch (e) {
    return { text: "", model: full, error: String(e) };
  }
}

// ---------- the host ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), "sensor-replay-"));
fs.cpSync(path.join(corpus, "root"), root, { recursive: true });
const labels = JSON.parse(fs.readFileSync(path.join(corpus, "labels.json"), "utf8"));
const chatId: string = labels.chat;
const lines = fs.readFileSync(path.join(root, "chats", chatId + ".jsonl"), "utf8").trim().split("\n");
const meta = JSON.parse(fs.readFileSync(path.join(root, "chats", chatId + ".meta.json"), "utf8"));
fs.rmSync(path.join(root, "dashboard", "state"), { recursive: true, force: true });
// --prompt old: a user who saved their own sensor prompt (the previous default, changed) keeps it; --no-preset: a chat without a preset
if (flag("--prompt") === "old") {
  const cfgPath = path.join(root, "dashboard", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.sensor = (P.PAST_DEFAULT_PROMPTS.sensor as string[]).at(-1) + "\n\n(A custom note of the user: keep every text value short.)";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
}
if (args.includes("--no-preset")) {
  delete meta.presetId;
  delete meta.presetVars;
  fs.writeFileSync(path.join(root, "chats", chatId + ".meta.json"), JSON.stringify(meta));
}

let pending: { key: string; req: any }[] = [];
const results: Record<string, unknown> = {};
const host = {
  fs: {
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: (key: string, req: any) => pending.push({ key, req }), results, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
};

let calls = 0;
let tokensIn = 0;
let tokensOut = 0;
async function update(): Promise<void> {
  const call: any = { query: {}, method: "POST", path: "/dashboard/update", body: { chatId } };
  for (const k of Object.keys(results)) delete (results as any)[k];
  let out: any = P.handleRoute(call, host);
  for (let pass = 0; out?.__llmPending && pass < 4; pass++) {
    if (out.stash) call.stash = out.stash;
    const batch = pending;
    pending = [];
    for (const k of Object.keys(results)) delete (results as any)[k];
    const answers = await Promise.all(batch.map((b) => callModel(b.req, String(meta.model ?? ""))));
    batch.forEach((b, i) => {
      calls++;
      tokensIn += answers[i]!.usage?.input ?? 0;
      tokensOut += answers[i]!.usage?.output ?? 0;
      (results as any)[b.key] = answers[i]!.error ? { text: "", model: "error", error: answers[i]!.error, usage: { input: 0, output: 0 } } : { text: answers[i]!.text, model: answers[i]!.model, usage: answers[i]!.usage ?? { input: 0, output: 0 }, genTimeMs: 0 };
    });
    out = P.handleRoute(call, host);
  }
}

// ---------- scoring ----------
type Snap = { chars: Record<string, { outfit?: string | null; holding?: string | null }>; layout?: { objects?: { item: string; where?: string }[] } };
const lastSnap = (): Snap | null => {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "state", chatId + ".json"), "utf8"));
    const keys = Object.keys(st.snapshots);
    return keys.length ? st.snapshots[keys[keys.length - 1]!] : null;
  } catch {
    return null;
  }
};
const charOf = (snap: Snap, name: string) => {
  const first = name.toLowerCase().split(/\s+/)[0]!;
  const k = Object.keys(snap.chars).find((n) => n === name) ?? Object.keys(snap.chars).find((n) => n.toLowerCase().split(/\s+/)[0] === first);
  return k ? snap.chars[k]! : null;
};
const has = (text: string, alts: string[]) => alts.some((a) => text.toLowerCase().includes(a.toLowerCase()));
const entries = (text: string | null | undefined) => String(text ?? "").split(/\s*[,;]\s*/).filter(Boolean);

type Row = { turn: number; must: number; mustOk: number; bad: string[]; dups: string[]; phantoms: string[]; outfit: Record<string, string>; objects: string[]; names: string[]; dupPersons: string[] };
const rows: Row[] = [];

const wantedTurns = new Set<number>([...Object.keys(labels.turns ?? {}).map(Number), ...(Array.isArray(labels.replayTurns) ? labels.replayTurns.map(Number) : [])]);
let turnKeys = [...wantedTurns].sort((a, b) => a - b);
if (typeof labels.maxTurns === "number") turnKeys = turnKeys.slice(0, labels.maxTurns);
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const knownPersons = labels.persons ? new Set<string>([...(labels.persons.expected ?? []), ...(labels.persons.maybe ?? [])].map(norm)) : null;
for (const k of turnKeys) {
  fs.writeFileSync(path.join(root, "chats", chatId + ".jsonl"), lines.slice(0, k + 1).join("\n") + "\n");
  await update();
  const snap = lastSnap();
  const row: Row = { turn: k, must: 0, mustOk: 0, bad: [], dups: [], phantoms: [], outfit: {}, objects: [], names: [], dupPersons: [] };
  rows.push(row);
  if (!snap) {
    row.bad.push("no snapshot");
    continue;
  }
  row.names = Object.keys(snap.chars);
  if (knownPersons) row.dupPersons = row.names.filter((n) => !knownPersons.has(norm(n)));
  for (const [n, c] of Object.entries(snap.chars)) row.outfit[n] = "wear: " + (c.outfit ?? "-") + " | hold: " + (c.holding ?? "-");
  row.objects = (snap.layout?.objects ?? []).map((o) => o.item + (o.where ? " (" + o.where + ")" : ""));
  const spec = labels.turns?.[String(k)] ?? {};
  for (const [name, want] of Object.entries<any>(spec.must ?? {})) {
    const c = charOf(snap, name);
    for (const field of ["wear", "hold"]) {
      const text = String(field === "wear" ? c?.outfit ?? "" : c?.holding ?? "");
      for (const alts of want[field] ?? []) {
        row.must++;
        if (c && has(text, alts)) row.mustOk++;
        else row.bad.push(`missing ${name} ${field}: ${alts[0]}`);
      }
    }
  }
  for (const [name, no] of Object.entries<any>(spec.mustNot ?? {})) {
    const c = charOf(snap, name);
    for (const field of ["wear", "hold"]) for (const w of no[field] ?? []) if (c && has(String(field === "wear" ? c.outfit ?? "" : c.holding ?? ""), [w])) row.bad.push(`should be gone ${name} ${field}: ${w}`);
  }
  for (const [name, no] of Object.entries<any>(labels.never ?? {})) {
    const c = charOf(snap, name);
    if (!c) continue;
    for (const field of ["wear", "hold"]) for (const w of no[field] ?? []) if (has(String(field === "wear" ? c.outfit ?? "" : c.holding ?? ""), [w])) row.bad.push(`never ${name} ${field}: ${w}`);
  }
  for (const [name, c] of Object.entries(snap.chars)) {
    for (const group of labels.oneOf ?? []) {
      const n = [...entries(c.outfit), ...entries(c.holding)].filter((e) => has(e, group)).length;
      if (n > 1) row.dups.push(`${name}: ${n} entries for ${group[0]}`);
    }
  }
  for (const o of row.objects) if (has(o.split(" (")[0]!, labels.objectsNever ?? [])) row.phantoms.push(o);
}

// ---------- report ----------
let must = 0;
let ok = 0;
let bad = 0;
let dups = 0;
let phantoms = 0;
let dupPersons = 0;
for (const r of rows) {
  must += r.must;
  ok += r.mustOk;
  bad += r.bad.filter((b) => !b.startsWith("missing")).length;
  dups += r.dups.length;
  phantoms += r.phantoms.length;
  dupPersons += r.dupPersons.length;
  console.log(`\n== turn ${r.turn}: ${r.mustOk}/${r.must} expected items`);
  for (const [n, t] of Object.entries(r.outfit)) console.log(`   ${n}: ${t}`);
  if (knownPersons) console.log(`   persons: ${r.names.join("; ") || "-"}`);
  if (r.objects.length) console.log(`   objects: ${r.objects.join("; ")}`);
  for (const b of r.bad) console.log(`   ! ${b}`);
  for (const d of r.dups) console.log(`   ! duplicate: ${d}`);
  for (const d of r.dupPersons) console.log(`   ! duplicate person: ${d}`);
  for (const p of r.phantoms) console.log(`   ! phantom object: ${p}`);
}
console.log(`\nSUMMARY ${tag}: recall ${ok}/${must} (${must ? Math.round((100 * ok) / must) : 0}%), wrong items ${bad}, duplicates ${dups}, phantom objects ${phantoms}, duplicate persons ${dupPersons}; model calls ${calls}, tokens in/out ${tokensIn}/${tokensOut}`);
fs.writeFileSync(path.join(corpus, `results-${tag}.json`), JSON.stringify({ tag, ok, must, bad, dups, phantoms, dupPersons, rows }, null, 1));
try {
  fs.copyFileSync(path.join(root, "_debug", "dashboard-runs.json"), path.join(corpus, `runs-${tag}.json`));
} catch {}
fs.rmSync(root, { recursive: true, force: true });
