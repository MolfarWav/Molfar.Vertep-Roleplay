// Turn director bench, phase 0 (Molfar.Vertep #401): replays a saved chat through the Dashboard, turn by turn, with a
// real model, and records per turn what the sensor reported, the snapshot it left, the time and the tokens.
//
//   bun scripts/director-bench.ts <corpus dir> --mode baseline|split [--tag t] [--model nanogpt/...] [--turns 0-20]
//   bun scripts/director-bench.ts <corpus dir> --mode router --from results-baseline.json [--tag t] [--model ...]
//
// baseline: the plugin as it is (one sensor call a turn).
// split:    the same plugin, but the harness cuts the sensor call into specialists (scene, things, relations, knowledge,
//           quests), each with its own rules, output keys and input blocks, runs them side by side and hands the merged
//           JSON back to the plugin, which applies it as usual. No product code changes.
// router:   one call a turn that answers the signal questions (yes/no) from the Previous state and the New messages
//           recorded by an earlier run; scored by scripts/director-score.ts against the answer key.
//
// The corpus dir (kept outside the repository: it holds a user's chat) has `root/` (a copy of the data folder with the
// chat, its card, persona, lorebooks, preset, dashboard/config.json). The key is read like scripts/sensor-replay.ts does.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const corpus = args[0];
if (!corpus || corpus.startsWith("--")) throw new Error("usage: bun scripts/director-bench.ts <corpus dir> --mode baseline|split|router");
const mode = flag("--mode") ?? "baseline";
const tag = flag("--tag") ?? mode;
const modelOverride = flag("--model");
const pluginPath = path.resolve(flag("--plugin") ?? "plugins/relations/plugin.js");
const P: any = await import(new URL("file:///" + pluginPath.replace(/\\/g, "/")).href);

// ---------- the model ----------
function keyFor(env: string): string {
  if (process.env[env]) return process.env[env]!;
  for (const f of [path.resolve(".claude/skills/ask-model/keys.env"), path.join(os.homedir(), ".claude/skills/ask-model/keys.env")]) {
    try {
      const m = new RegExp("^" + env + "=(.*)$", "m").exec(fs.readFileSync(f, "utf8"));
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return "";
}
const BASES: Record<string, { url: string; env: string }> = {
  nanogpt: { url: "https://nano-gpt.com/api/subscription/v1", env: "NANOGPT_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY" },
};
type Answer = { text: string; model: string; error?: string; input: number; output: number; ms: number };
async function callModel(system: string, user: string, model: string, maxTokens: number, temperature: number): Promise<Answer> {
  const full = String(modelOverride ?? model);
  const [prov, ...rest] = full.split("/");
  const base = BASES[prov!];
  const t0 = Date.now();
  if (!base) return { text: "", model: full, error: "unknown provider " + prov, input: 0, output: 0, ms: 0 };
  const key = keyFor(base.env);
  if (!key) return { text: "", model: full, error: "no key " + base.env, input: 0, output: 0, ms: 0 };
  const body = { model: rest.join("/"), messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(base.url + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(body) });
      const j: any = await r.json();
      if (!r.ok) {
        if (attempt < 2 && (r.status === 429 || r.status >= 500)) {
          await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
          continue;
        }
        return { text: "", model: full, error: String(j?.error?.message ?? r.status), input: 0, output: 0, ms: Date.now() - t0 };
      }
      return { text: String(j.choices?.[0]?.message?.content ?? ""), model: full, input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
    } catch (e) {
      if (attempt === 2) return { text: "", model: full, error: String(e), input: 0, output: 0, ms: Date.now() - t0 };
    }
  }
  return { text: "", model: full, error: "retries", input: 0, output: 0, ms: Date.now() - t0 };
}

// ---------- specialists (split mode) ----------
const PARTS: Record<string, string> = P.DEFAULT_SENSOR_PARTS;
const bullets = (part: string) => {
  // a part is a heading line and "- key: rule" lines
  const out: Record<string, string> = {};
  for (const l of part.split("\n").slice(1)) {
    const m = /^- ([a-zA-Z ]+?)(?: \(|:)/.exec(l);
    if (m) out[m[1]!.trim()] = l;
  }
  return out;
};
// --quests v2: the closing rules proposed for phase 1 (#400): a "done when" in the text, three ways to close, scene goals
// end with their scene, a full limit closes first. Applied to the one sensor prompt (baseline) or to the quests specialist.
const QUESTS_V2 = [
  "Threads:",
  "- Keep open threads, up to the open thread limits given in the input: goals and unanswered questions with stakes that drive the story. A question, greeting or order with nothing at stake is not a thread.",
  "- Give each new thread a kind: main (what the story is about now), side (an optional line the story could drop) or everyday (a small errand or chore of the moment, gone in a few turns). Kept threads keep their kind.",
  "- A concrete next step of a main thread is a new thread with parent set to that main thread's id. Only main threads have steps.",
  '- Write a new thread\'s text as the goal, then " | done when: " and the condition that ends it, both short ("Clara gets away from the professor | done when: she leaves his office or someone frees her").',
  "- Every turn, check every open thread against the new messages and resolve it when: its done-when happened (done); it can no longer happen (failed); or the story moved past it (dropped): the scene it belonged to is over, the people it needs left, or nobody pursues it any more. A thread tied to one scene ends with that scene.",
  "- When a limit is full, first resolve the threads that are done, failed or dropped; only then open a new one.",
  '- Give the id of every thread you close in "resolved". In "open", list kept threads with their id and new ones with id null. Never list a thread you resolve in the same report.',
].join("\n");
const questsV2 = flag("--quests") === "v2";
const SB = bullets(PARTS.scene!);
const KB = bullets(PARTS.knowledge!);
const COMMON = (job: string) =>
  [
    "You are one specialist of the scene sensor of an ongoing roleplay story. Read the New messages and the Previous state, and report only " + job + ". Other specialists report everything else: leave every other key out.",
    "",
    'Reply with one JSON object in the shape under "Output shape". No prose, no code fences. Write every letter as itself, never as a \\u escape.',
    "",
    PARTS.language,
    "",
    PARTS.truth,
  ].join("\n");
type Spec = { id: string; system: (vocab: string) => string; blocks: RegExp; keys: string[] };
const SPECS: Spec[] = [
  {
    id: "scene",
    blocks: /^(Characters|Previous state|Backgrounds|New messages)/,
    keys: ["present", "struck", "minutes", "time", "day", "date", "place", "weather", "scene", "chars", "background"],
    system: () =>
      [
        COMMON("where and when the scene is, who is in it and how they are"),
        "",
        "Scene:",
        SB.minutes,
        SB["time and day"],
        SB.present,
        SB["place and weather"],
        SB.scene,
        SB.chars!.replace("mood, condition, outfit, holding, goal, leads", "mood, condition, goal, leads"),
        "",
        PARTS.direction,
        "",
        "Output shape",
        '{ "present": ["name"], "struck": ["name"],',
        '  "minutes": 0, "time": "HH:MM or dawn|morning|late morning|day|evening|night", "day": 1, "date": "YYYY-MM-DD",',
        '  "place": "text", "weather": "text",',
        '  "scene": { "new": false, "label": "2-5 words", "direction": "domestic|social|intrigue|investigation|travel|combat|explicit|transition" },',
        '  "chars": { "name": { "mood": "text", "condition": "text", "goal": "text", "leads": "name or user", "contact": "in person|text|call|video|letter" } },',
        '  "background": "image name or null, only when the input asks for it" }',
        "Leave out any key the new messages give nothing for. date: only a whole date the text states (day, month and year), never a guess.",
      ].join("\n"),
  },
  {
    id: "things",
    blocks: /^(Characters|Previous state|Word scan|Card attire|New messages)/,
    keys: ["chars", "userAt", "objects"],
    system: () =>
      [
        COMMON("what characters wear and hold, where they are in the place, and the things lying in the scene"),
        "",
        "Things:",
        SB["outfit and holding"],
        SB.at,
        "",
        "Output shape",
        '{ "chars": { "name": { "outfit": { "see": [ { "id": "o1" }, { "text": "new item" } ], "off": [ { "id": "o2", "where": "text" } ] }, "holding": { "see": [ { "id": "o4" }, { "text": "item" } ], "off": [ { "id": "o3" } ] }, "at": "text" } },',
        '  "userAt": "text", "objects": { "add": [ { "text": "text", "where": "text" } ], "move": [ { "id": "o9", "where": "text" } ], "remove": ["o9"] } }',
        "Leave out any key the new messages give nothing for.",
      ].join("\n"),
  },
  {
    id: "relations",
    blocks: /^(Characters|Previous state|New messages)/,
    keys: ["events", "edges"],
    system: (vocab) =>
      [
        COMMON("the events between the user's character and the others, and how two other characters stand to each other"),
        "",
        PARTS.events,
        KB.edges,
        "",
        "Event vocabulary",
        vocab,
        "",
        "Output shape",
        '{ "events": [ { "id": "event id", "weight": "routine|significant|pivotal", "from": "name or user", "to": "name or user", "quote": "text" } ],',
        '  "edges": [ { "from": "name", "to": "name", "role": "word", "warmth": "word" } ] }',
        "Leave out any key the new messages give nothing for.",
      ].join("\n"),
  },
  {
    id: "knowledge",
    blocks: /^(Characters|Previous state|Notebook of|Leak check|New messages)/,
    keys: ["learned", "said", "told", "retire", "people", "names", "blindSpot", "chars", "leaks"],
    system: () =>
      [
        COMMON("what characters learn, say that binds them, think, and know about the user's character"),
        "",
        PARTS.knowledge!.split("\n").filter((l) => !l.startsWith("- edges")).join("\n"),
        SB.thought,
        "",
        "Output shape",
        '{ "learned": [ { "who": "name", "text": "text", "how": "saw|heard|guess", "from": "name or null", "weight": "everyday|important|key" } ],',
        '  "said": [ { "who": "name", "text": "quote", "kind": "vow|promise|threat|confession|secret|order|refusal|lie", "strength": 2, "lie": false } ],',
        '  "told": [ { "from": "name", "to": "name", "note": "entry id" } ],',
        '  "retire": ["entry id"],',
        '  "names": [ { "who": "name", "heardUserName": true, "calls": "text" } ],',
        '  "people": [ { "who": "name", "about": "name or user", "text": "text" } ],',
        '  "blindSpot": { "name": "text" },',
        '  "chars": { "name": { "thought": "text" } } }',
        "Leave out any key the new messages give nothing for.",
      ].join("\n"),
  },
  {
    id: "quests",
    blocks: /^(Previous state|Thread check|New messages)/,
    keys: ["threads"],
    system: () =>
      [
        COMMON("the open threads (quests) of the story"),
        "",
        questsV2 ? QUESTS_V2 : PARTS.threads,
        "",
        "Output shape",
        '{ "threads": { "open": [ { "id": "t1 or null", "text": "...", "kind": "main|side|everyday", "parent": "main thread id, only for a step" } ], "resolved": ["thread id"] } }',
        "Leave out any key the new messages give nothing for.",
      ].join("\n"),
  },
];
// the input blocks a specialist gets: the plugin joins its blocks with a blank line, each starting with its heading
const HEADS = /^(Characters|Previous state|Notebook of|Thread check|Backgrounds|Leak check|Word scan|Card attire|New messages)/;
function blocksOf(input: string): string[] {
  const out: string[] = [];
  for (const piece of input.split("\n\n")) {
    if (HEADS.test(piece) || !out.length) out.push(piece);
    else out[out.length - 1] += "\n\n" + piece;
  }
  return out;
}
const parse = (t: string): any => {
  try {
    return P.parseSensorText(t) ?? null;
  } catch {
    return null;
  }
};
function mergeInto(into: any, part: any, keys: string[]) {
  if (!part || typeof part !== "object") return;
  for (const k of keys) {
    if (part[k] === undefined) continue;
    if (k === "chars" && part.chars && typeof part.chars === "object") {
      into.chars = into.chars ?? {};
      for (const [n, v] of Object.entries<any>(part.chars)) into.chars[n] = { ...(into.chars[n] ?? {}), ...(v ?? {}) };
    } else into[k] = part[k];
  }
}
async function splitSensor(req: any, fallbackModel: string) {
  const sys = String(req.systemPrompt ?? "");
  const vocab = (/\n\nEvent vocabulary\n([\s\S]*?)\n\nOutput shape\n/.exec(sys) ?? [])[1] ?? "";
  const input = String(req.messages?.[0]?.content ?? "");
  const blocks = blocksOf(input);
  const maxTokens = req.presetParams?.max_tokens ?? 4000;
  const runs = await Promise.all(
    SPECS.map(async (s) => {
      const user = blocks.filter((b) => s.blocks.test(b)).join("\n\n");
      const a = await callModel(s.system(vocab), user, req.model ?? fallbackModel, maxTokens, req.presetParams?.temperature ?? 0.2);
      return { s, a, parsed: a.error ? null : parse(a.text) };
    }),
  );
  const merged: any = {};
  for (const r of runs) mergeInto(merged, r.parsed, r.s.keys);
  return { merged, runs };
}

// ---------- router (signal questions) ----------
export const SIGNALS: Record<string, string> = {
  quest_progress: "an open thread from the Previous state moved: a concrete step toward it happened, or it got harder",
  quest_end: "an open thread from the Previous state was achieved, failed, or became moot or abandoned",
  new_goal: "a new goal with stakes appeared that the story will follow (not a greeting or a passing request)",
  place_change: "the scene moved to another place (another room, building, outside, a street)",
  time_jump: "story time skipped beyond the continuous scene (more than about 30 minutes, 'the next morning')",
  scene_cut: "one scene ended and another began (new place, new time, or a new situation)",
  clothes_change: "someone put on, took off, changed, damaged or soiled clothing or an accessory",
  item_change: "a thing was picked up, handed over, put down, taken, lost, found or used in a way that matters",
  person_enter: "a character who was not present appears (in person, by phone or message)",
  person_leave: "a present character leaves the scene, falls asleep or hangs up",
  relation_event: "the user's character did something to a character, or a character to the user's character, that changes how they feel about each other (help, protection, betrayal, threat, insult, kiss, intimacy, a gift); ordinary talk is not one",
  secret_learned: "a character learned or revealed hidden information (a secret, a lie exposed, a hidden fact)",
  vow_said: "a binding statement: a promise, vow, threat, confession, ultimatum, a binding order, a lie told",
};
const ROUTER_SYSTEM = [
  "You watch an ongoing roleplay story for a tracker. Read the Previous state and the New messages (the player's last message and the reply). For each question below, answer true or false about what the New messages show. The Previous state is only background. When you are unsure, answer true.",
  "Reply with one JSON object with exactly these keys and true or false as values. No prose, no code fences.",
  "",
  ...Object.entries(SIGNALS).map(([k, v]) => "- " + k + ": " + v),
].join("\n");

// ---------- the host ----------
const results: Record<string, unknown> = {};
let pending: { key: string; req: any }[] = [];
const out: any = { tag, mode, model: modelOverride ?? null, turns: [] as any[] };

if (mode === "router") {
  const from = JSON.parse(fs.readFileSync(path.join(corpus, flag("--from") ?? "results-baseline.json"), "utf8"));
  const model = modelOverride ?? from.sensorModel;
  for (const t of from.turns) {
    if (!t.input) continue;
    const user = blocksOf(t.input).filter((b) => /^(Previous state|New messages)/.test(b)).join("\n\n");
    const a = await callModel(ROUTER_SYSTEM, user, model, 400, 0);
    const parsed = a.error ? null : parse(a.text);
    out.turns.push({ k: t.k, ms: a.ms, calls: [{ who: "router", ms: a.ms, input: a.input, output: a.output, error: a.error }], signals: parsed });
    console.log(`turn ${t.k}: ${a.ms} ms ${a.error ?? ""} ${parsed ? Object.entries(parsed).filter(([, v]) => v === true).map(([k]) => k).join(",") : "unreadable"}`);
  }
  fs.writeFileSync(path.join(corpus, `results-${tag}.json`), JSON.stringify(out, null, 1));
  process.exit(0);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "director-bench-"));
fs.cpSync(path.join(corpus, "root"), root, { recursive: true });
const chatId = fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".jsonl"))!.replace(/\.jsonl$/, "");
const lines = fs.readFileSync(path.join(root, "chats", chatId + ".jsonl"), "utf8").trim().split("\n");
const meta = JSON.parse(fs.readFileSync(path.join(root, "chats", chatId + ".meta.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "config.json"), "utf8"));
out.sensorModel = cfg.sensorModel ?? meta.model;
for (const d of ["dashboard/state", "registry", "_debug"]) fs.rmSync(path.join(root, d), { recursive: true, force: true });

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
const isSensor = (req: any) => String(req.systemPrompt ?? "").startsWith("You are the scene sensor");

async function update(rec: any): Promise<void> {
  const call: any = { query: {}, method: "POST", path: "/dashboard/update", body: { chatId } };
  for (const k of Object.keys(results)) delete (results as any)[k];
  let res: any = P.handleRoute(call, host);
  for (let pass = 0; res?.__llmPending && pass < 6; pass++) {
    if (res.stash) call.stash = res.stash;
    const batch = pending;
    pending = [];
    for (const k of Object.keys(results)) delete (results as any)[k];
    await Promise.all(
      batch.map(async (b) => {
        const model = String(b.req.model ?? meta.model ?? "");
        if (isSensor(b.req)) rec.input = String(b.req.messages?.[0]?.content ?? "");
        if (isSensor(b.req) && mode === "split") {
          const t0 = Date.now();
          const { merged, runs } = await splitSensor(b.req, model);
          for (const r of runs) rec.calls.push({ who: r.s.id, ms: r.a.ms, input: r.a.input, output: r.a.output, error: r.a.error ?? (r.parsed ? undefined : "unreadable") });
          rec.sensorMs = Date.now() - t0;
          rec.raw = merged;
          (results as any)[b.key] = { text: JSON.stringify(merged), model, usage: { input: 0, output: 0 }, genTimeMs: 0 };
          return;
        }
        if (isSensor(b.req) && questsV2) b.req.systemPrompt = String(b.req.systemPrompt).replace(PARTS.threads!, QUESTS_V2);
        const a = await callModel(String(b.req.systemPrompt ?? ""), String(b.req.messages?.map((m: any) => m.content).join("\n\n") ?? ""), model, b.req.presetParams?.max_tokens ?? 4000, b.req.presetParams?.temperature ?? 0);
        rec.calls.push({ who: isSensor(b.req) ? "sensor" : b.key, ms: a.ms, input: a.input, output: a.output, error: a.error });
        if (isSensor(b.req)) {
          rec.sensorMs = a.ms;
          rec.raw = a.error ? null : parse(a.text);
        }
        (results as any)[b.key] = a.error ? { text: "", model: "error", error: a.error, usage: { input: 0, output: 0 } } : { text: a.text, model: a.model, usage: { input: a.input, output: a.output }, genTimeMs: a.ms };
      }),
    );
    res = P.handleRoute(call, host);
  }
  rec.result = res?.json ? { ok: res.json.ok, error: res.json.error } : null;
}

const snapOf = () => {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "state", chatId + ".json"), "utf8"));
    const s = Object.values<any>(st.snapshots).sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0)).at(-1);
    if (!s) return null;
    return {
      turn: s.turn,
      clock: s.clock,
      scene: s.scene,
      present: s.present,
      threads: s.threads,
      events: s.events,
      items: Object.fromEntries(Object.entries<any>(s.chars ?? {}).map(([n, c]) => [n, (c.items ?? []).map((i: any) => i.kind + ":" + i.id + ":" + i.text)])),
      objects: (s.layout?.objects ?? []).map((o: any) => o.id + ":" + o.item + "@" + (o.where ?? "")),
      proposals: (st.proposals ?? []).length,
    };
  } catch {
    return null;
  }
};

// --turns 10-20 or --turns 12: only those char reply lines; without it, every one
const range = flag("--turns") ? flag("--turns")!.split("-").map(Number) : null;
const charLines = lines.map((l, i) => [JSON.parse(l), i] as const).filter(([m]) => m.role === "char").map(([, i]) => i);
const turns = range ? charLines.filter((k) => k >= range[0]! && k <= (range[1] ?? range[0]!)) : charLines;
for (const k of turns) {
  fs.writeFileSync(path.join(root, "chats", chatId + ".jsonl"), lines.slice(0, k + 1).join("\n") + "\n");
  const rec: any = { k, calls: [] };
  const t0 = Date.now();
  await update(rec);
  rec.ms = Date.now() - t0;
  rec.snap = snapOf();
  out.turns.push(rec);
  const tin = rec.calls.reduce((s: number, c: any) => s + (c.input ?? 0), 0);
  const tout = rec.calls.reduce((s: number, c: any) => s + (c.output ?? 0), 0);
  const errs = rec.calls.filter((c: any) => c.error).map((c: any) => c.who + ": " + c.error);
  console.log(`turn ${k}: ${rec.ms} ms, sensor ${rec.sensorMs ?? "-"} ms, calls ${rec.calls.length}, tokens ${tin}/${tout}, open threads ${(rec.snap?.threads ?? []).filter((t: any) => t.status === "open").length}${errs.length ? " ! " + errs.join("; ") : ""}`);
  fs.writeFileSync(path.join(corpus, `results-${tag}.json`), JSON.stringify(out, null, 1));
}
fs.rmSync(root, { recursive: true, force: true });
