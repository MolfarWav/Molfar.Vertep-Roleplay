/**
 * Makes the search-word fixture of the recall bench (issue #184): asks a model, under the worker's own SEARCH_RULE, for the
 * `also` words of every fact and chapter of the synthetic 5000-message world, and keeps them as `{ text: [words] }`.
 *
 *   bun scripts/recall-also.ts --model nanogpt:deepseek/deepseek-v4-flash --tag flash
 *   bun scripts/recall-also.ts --model local --tag qwen9b          (llama-server on 127.0.0.1:8081)
 *
 * Writes test/fixtures/recall-also.<tag>.json. Synthetic text only; the NanoGPT key is read from the ask-model skill's keys.env
 * and never printed. Resumable: texts already in the file are skipped.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { world } from "../test/rp-recall-world";

const L = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;
const arg = (name: string, d = "") => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const MODEL = arg("model");
const TAG = arg("tag");
if (!MODEL || !TAG) throw new Error("--model and --tag are required");
const OUT = path.join(import.meta.dir, "..", "test", "fixtures", `recall-also.${TAG}.json`);
const BATCH = Number(arg("batch", "25"));

const SKILL = path.join(os.homedir(), ".claude/skills/ask-model");
const providers = JSON.parse(fs.readFileSync(path.join(SKILL, "providers.json"), "utf8"));
const NANO: string = providers.providers?.nanogpt?.baseUrl ?? providers.nanogpt.baseUrl;
const key = () => {
  const m = /^NANOGPT_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(SKILL, "keys.env"), "utf8"));
  if (!m) throw new Error("NANOGPT_API_KEY missing");
  return m[1]!.trim().replace(/^["']|["']$/g, "");
};

async function ask(system: string, user: string): Promise<string> {
  const local = MODEL === "local";
  const body = { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3, max_tokens: 4000, ...(local ? { chat_template_kwargs: { enable_thinking: false } } : { model: MODEL.replace(/^nanogpt:/, "") }) };
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 150_000);
      const res = await fetch(local ? "http://127.0.0.1:8081/v1/chat/completions" : NANO + "/chat/completions", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", ...(local ? {} : { Authorization: "Bearer " + key() }) }, body: JSON.stringify(body) });
      clearTimeout(timer);
      if (res.ok) {
        const text = String(((await res.json()) as any)?.choices?.[0]?.message?.content ?? "").trim();
        if (text) return text;
        last = "empty answer";
      } else last = "HTTP " + res.status;
    } catch (e) {
      last = String((e as Error).message || e);
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(last);
}

const { facts, chaps } = world(333);
const items = [...facts.map((f) => ({ id: f.id, text: f.text })), ...chaps.map((c) => ({ id: c.id, text: c.text }))];
const done: Record<string, string[]> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = items.filter((i) => !(i.text in done));
const batches: (typeof items)[] = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
console.log(`${todo.length} texts in ${batches.length} calls (${items.length - todo.length} already done)`);

const system = [
  "You index a story record for search. Each item below is a short sentence from a fantasy story.",
  "",
  L.SEARCH_RULE,
  "",
  'Reply with ONE JSON object and nothing else: {"<id>":["word","word"],...} with one entry per item. No code fences.',
].join("\n");

let next = 0;
let failed = 0;
const workers = Array.from({ length: Number(arg("concurrency", "4")) }, async () => {
  while (next < batches.length) {
    const batch = batches[next++]!;
    try {
      const out = await ask(system, batch.map((i) => `${i.id}: ${i.text}`).join("\n"));
      const m = /\{[\s\S]*\}/.exec(out);
      const parsed = m ? JSON.parse(m[0]) : {};
      for (const i of batch) if (Array.isArray(parsed[i.id])) done[i.text] = parsed[i.id].map(String);
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(done));
    } catch (e) {
      failed++;
      console.error(`batch ${batch[0]!.id}..: ${(e as Error).message}`);
    }
  }
});
await Promise.all(workers);
console.log(`${Object.keys(done).length}/${items.length} texts have search words, ${failed} calls failed`);
