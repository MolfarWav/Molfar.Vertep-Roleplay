/**
 * Runs the leak scenarios (issue #184, P0b) on chosen models and has a judge model label each reply.
 *
 *   bun scripts/leak-scenarios/run.ts --out <results.json> [--reps 3] [--only nanogpt:google/gemma-4-31b-it,local]
 *
 * Models: `nanogpt:<model id>` (the key is read from the ask-model skill's keys.env, never printed) and `local`
 * (a llama-server on 127.0.0.1:8081). The judge is `nanogpt:deepseek/deepseek-v4-pro-0813`. Synthetic text only.
 * Resumable: a finished (model, scenario, condition, rep) in the --out file is skipped.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CARDS, NEUTRAL_FACTS, SCENARIOS, USER, history, type Scenario } from "./scenarios";

const L = (await import(new URL("../../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;

const arg = (name: string, d = "") => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const OUT = arg("out");
const REPS = Number(arg("reps", "3"));
const MODELS = arg("only", "nanogpt:google/gemma-4-31b-it,nanogpt:deepseek/deepseek-v4-flash,local").split(",");
const JUDGE = "nanogpt:deepseek/deepseek-v4-pro-0813";
if (!OUT) throw new Error("--out is required");

const SKILL = path.join(os.homedir(), ".claude/skills/ask-model");
const keyOf = (name: string) => {
  const m = new RegExp("^" + name + "=(.*)$", "m").exec(fs.readFileSync(path.join(SKILL, "keys.env"), "utf8"));
  if (!m) throw new Error(name + " missing in keys.env");
  return m[1]!.trim().replace(/^["']|["']$/g, "");
};
const NANO = JSON.parse(fs.readFileSync(path.join(SKILL, "providers.json"), "utf8")).providers?.nanogpt?.baseUrl ?? JSON.parse(fs.readFileSync(path.join(SKILL, "providers.json"), "utf8")).nanogpt.baseUrl;
let nanoKey = "";

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function complete(model: string, messages: Msg[], opts: { temperature: number; max: number }): Promise<string> {
  const isLocal = model === "local";
  const url = isLocal ? "http://127.0.0.1:8081/v1/chat/completions" : NANO + "/chat/completions";
  if (!isLocal && !nanoKey) nanoKey = keyOf("NANOGPT_API_KEY");
  const body: Record<string, unknown> = { messages, temperature: opts.temperature, max_tokens: opts.max, ...(isLocal ? { chat_template_kwargs: { enable_thinking: false } } : { model: model.replace(/^nanogpt:/, "") }) };
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 150_000);
      const res = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", ...(isLocal ? {} : { Authorization: "Bearer " + nanoKey }) }, body: JSON.stringify(body) });
      clearTimeout(timer);
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
        if (text) return text;
        last = "empty answer";
      } else last = "HTTP " + res.status + " " + (await res.text()).slice(0, 120);
    } catch (e) {
      last = String((e as Error).message || e);
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(last);
}

/** The prompt of one scenario under one condition, built with the plugin's own insert and brief. */
function build(sc: Scenario, condition: string): Msg[] {
  const hist = history(sc.cast).map((m, i) => ({ id: "m" + i, ...m, swipe: 0 }));
  const final = { id: "m" + hist.length, role: "user" as const, name: USER, text: sc.userTurn };
  const line = L.activeLine([...hist, final]);
  const st = L.emptyChat("bench");
  st.migrated = true;
  const facts = [{ text: sc.secret, knownBy: sc.knownBy }, ...NEUTRAL_FACTS.map((t) => ({ text: t, knownBy: "all" }))];
  st.facts = facts.map((f, i) => ({ id: "f" + (i + 1), text: f.text, subject: "world", knownBy: f.knownBy, type: "event", weight: "important", status: "active", at: 1, updatedAt: 1 }));
  st.counters.fact = facts.length;
  const meta = { userName: USER };
  const common = { st, line, dash: null, meta, cfg: { ...L.DEFAULT_CONFIG }, scanText: sc.userTurn, used: {} };
  const cards = sc.cast.map((n) => "- " + CARDS[n]).join("\n");
  const system =
    sc.kind === "char"
      ? `You are ${sc.speaker}, a character in an ongoing fantasy roleplay with ${USER}, the player. Write ${sc.speaker}'s next reply only, in character, 60 to 120 words.\nThe company:\n${cards}`
      : `You are the narrator of an ongoing fantasy roleplay. You voice every character except ${USER}, the player. Write the next passage with dialogue, 100 to 160 words.\nThe company:\n${cards}`;
  const chat: Msg[] = hist.map((m) => (m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.name + ": " + m.text }));
  const extra: string[] = [];
  if (sc.kind === "char") {
    const voices = condition === "filtered" ? new Set([sc.speaker!.toLowerCase()]) : undefined;
    const ins = L.buildInsert({ ...common, speakerName: sc.speaker, voices });
    if (ins && ins.tail) extra.push(ins.tail);
  } else {
    const ins = L.buildInsert({ ...common, speakerName: "" });
    if (ins && ins.tail) extra.push(ins.tail);
    if (condition === "brief") {
      const brief = L.castKnowledgeFor({ st, line, dash: null, meta, speakerName: "", notCast: [] });
      if (brief) extra.push(brief.text);
    }
  }
  const secretIn = extra.some((t) => t.includes(sc.secret));
  const expectIn = condition === "with" || condition === "plain" || condition === "brief";
  if (secretIn !== expectIn) throw new Error(`${sc.id}/${condition}: secret in prompt = ${secretIn}, expected ${expectIn}`);
  if (condition === "brief" && !extra.some((t) => t.includes("Who knows what"))) throw new Error(`${sc.id}: no brief built`);
  return [{ role: "system", content: system }, ...chat, ...extra.map((t) => ({ role: "system" as const, content: t })), { role: "user", content: final.text }];
}

/** Some chat templates (Qwen's) refuse a system message after the first: the later ones ride in front of the last user turn. */
function foldSystem(messages: Msg[]): Msg[] {
  const later = messages.filter((m, i) => i > 0 && m.role === "system").map((m) => m.content);
  const rest = messages.filter((m, i) => i === 0 || m.role !== "system");
  const last = rest[rest.length - 1]!;
  return [...rest.slice(0, -1), { role: "user", content: later.length ? later.join("\n\n") + "\n\n" + last.content : last.content }];
}

async function judge(sc: Scenario, reply: string): Promise<{ leak: boolean | null; quote: string }> {
  const who = sc.mustNotKnow.join(", ");
  const prompt = `A fantasy roleplay reply is below. A secret exists in the story: "${sc.secret}" Only ${sc.knownBy.join(", ")} know${sc.knownBy.length === 1 ? "s" : ""} it. ${who} must NOT know it.\n\nQuestion: in the reply, does ${who} speak, think, hint or act as if they knew the secret (or any part of it), or does the narration state it as something they know? A character merely guessing wildly is a leak only if the guess matches the secret. Answer with JSON only: {"leak": true|false, "quote": "the shortest quote that shows it, or empty"}.\n\nReply:\n"""\n${reply}\n"""`;
  for (let i = 0; i < 2; i++) {
    try {
      const out = await complete(JUDGE, [{ role: "user", content: prompt }], { temperature: 0, max: 1500 });
      const m = /\{[\s\S]*\}/.exec(out);
      if (m) {
        const j = JSON.parse(m[0]);
        if (typeof j.leak === "boolean") return { leak: j.leak, quote: String(j.quote || "").slice(0, 200) };
      }
    } catch {
      /* try once more */
    }
  }
  return { leak: null, quote: "" };
}

type Row = { model: string; id: string; kind: string; condition: string; rep: number; reply: string; leak: boolean | null; quote: string };
const rows: Row[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const done = new Set(rows.map((r) => [r.model, r.id, r.condition, r.rep].join("|")));
const jobs: Array<() => Promise<void>> = [];
for (const model of MODELS) {
  for (const sc of SCENARIOS) {
    for (const condition of sc.kind === "char" ? ["with", "filtered"] : ["plain", "brief"]) {
      for (let rep = 0; rep < REPS; rep++) {
        if (done.has([model, sc.id, condition, rep].join("|"))) continue;
        jobs.push(async () => {
          let reply = "";
          try {
            reply = await complete(model, model === "local" ? foldSystem(build(sc, condition)) : build(sc, condition), { temperature: 0.8, max: 600 });
          } catch (e) {
            console.error(`FAILED ${model} ${sc.id} ${condition}: ${(e as Error).message}`);
            return;
          }
          const j = await judge(sc, reply);
          rows.push({ model, id: sc.id, kind: sc.kind, condition, rep, reply, ...j });
          fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
        });
      }
    }
  }
}
// build() throws on a wrong prompt: check every scenario before spending a token
for (const sc of SCENARIOS) for (const c of sc.kind === "char" ? ["with", "filtered"] : ["plain", "brief"]) build(sc, c);
console.log(`${jobs.length} jobs to run (${rows.length} already done)`);

let next = 0;
const workers = Array.from({ length: Number(arg("concurrency", "3")) }, async () => {
  while (next < jobs.length) await jobs[next++]!();
});
await Promise.all(workers);

const table: Record<string, { leaks: number; n: number; unclear: number }> = {};
for (const r of rows) {
  const k = `${r.model} | ${r.kind}/${r.condition}`;
  const t = (table[k] ??= { leaks: 0, n: 0, unclear: 0 });
  t.n++;
  if (r.leak === true) t.leaks++;
  if (r.leak === null) t.unclear++;
}
for (const [k, t] of Object.entries(table).sort()) console.log(`${k.padEnd(60)} leaks ${t.leaks}/${t.n}${t.unclear ? `  (unclear ${t.unclear})` : ""}`);
