/**
 * Scores the leak check (issue #184, P3) against the labels of a leak-scenarios run (results.json from run.ts).
 *
 *   bun scripts/leak-scenarios/eval-p3.ts <results.json> [--stepb nanogpt:deepseek/deepseek-v4-flash]
 *
 * Step A (code): does `leakCandidates` name a character that must not know, for the reply of each row?
 * Step B (optional model call): of those, how many does the sensor-like check confirm?
 * The label is the judge's (`leak` in the rows); rows the judge could not label are skipped. Synthetic text only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCENARIOS, USER, history } from "./scenarios";

const R = (await import(new URL("../../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

const file = process.argv[2];
if (!file) throw new Error("usage: eval-p3.ts <results.json> [--stepb <model>]");
const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ model: string; id: string; kind: string; condition: string; reply: string; leak: boolean | null }>;
const stepbArg = process.argv.indexOf("--stepb");
const STEPB = stepbArg >= 0 ? process.argv[stepbArg + 1]! : "";

const SKILL = path.join(os.homedir(), ".claude/skills/ask-model");
const key = () => {
  const m = /^NANOGPT_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(SKILL, "keys.env"), "utf8"));
  if (!m) throw new Error("NANOGPT_API_KEY missing");
  return m[1]!.trim().replace(/^["']|["']$/g, "");
};
const providers = JSON.parse(fs.readFileSync(path.join(SKILL, "providers.json"), "utf8"));
const NANO = (providers.providers ?? providers).nanogpt.baseUrl as string;

async function ask(model: string, prompt: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(NANO + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key() },
        body: JSON.stringify({ model: model.replace(/^nanogpt:/, ""), temperature: 0, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
      });
      if (res.ok) return String(((await res.json()) as any)?.choices?.[0]?.message?.content ?? "");
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return "";
}

type Counts = { tp: number; fp: number; fn: number; tn: number };
const counts = (): Counts => ({ tp: 0, fp: 0, fn: 0, tn: 0 });
const A: Record<string, Counts> = {};
const B: Record<string, Counts> = {};
const bump = (c: Counts, flagged: boolean, truth: boolean) => {
  if (flagged && truth) c.tp++;
  else if (flagged) c.fp++;
  else if (truth) c.fn++;
  else c.tn++;
};

for (const r of rows) {
  if (r.leak === null) continue;
  const sc = SCENARIOS.find((s) => s.id === r.id)!;
  const cast = history(sc.cast).map((m) => m.name);
  const people = [...new Set([...sc.cast, ...cast])];
  const speakers = sc.kind === "char" ? [sc.speaker!] : ["Narrator"];
  const cands = R.leakCandidates({
    facts: [{ id: "f1", text: sc.secret, knownBy: sc.knownBy }],
    reply: r.reply,
    userText: sc.userTurn,
    people,
    speakers,
    userNames: [USER],
  }).filter((c: any) => sc.mustNotKnow.includes(c.who));
  const flagged = cands.length > 0;
  bump((A[r.model] ??= counts()), flagged, r.leak);
  if (STEPB && flagged) {
    const lines = cands.map((c: any, i: number) => `L${i + 1}: ${c.who} does not know: ${c.text}`);
    const prompt =
      `Leak check: reply to this JSON only: {"leaks": [{"id": "L1", "quote": "..."}]}. Each line below names a character and a fact that character does NOT know in the story. List a line only when the new messages show that character speaking, thinking or acting as if they knew that fact. A guess that only resembles it, or a fact told to the character in the new messages, is not a leak. Use an empty list when there is none.\n` +
      lines.join("\n") +
      `\n\nNew messages\n[user] ${sc.userTurn}\n[${speakers[0]}] ${r.reply}`;
    const out = await ask(STEPB, prompt);
    const m = /\{[\s\S]*\}/.exec(out);
    let confirmed = false;
    try {
      confirmed = !!m && Array.isArray(JSON.parse(m[0]).leaks) && JSON.parse(m[0]).leaks.length > 0;
    } catch {
      /* unusable: not confirmed */
    }
    bump((B[r.model] ??= counts()), confirmed, r.leak);
  } else if (STEPB) {
    // step A found nothing: step B never runs, so the reply counts as clear
    bump((B[r.model] ??= counts()), false, r.leak);
  }
}

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) + "%" : "n/a");
const show = (title: string, table: Record<string, Counts>) => {
  console.log("\n" + title);
  for (const [m, c] of Object.entries(table)) console.log(`${m.padEnd(44)} precision ${pct(c.tp, c.tp + c.fp).padStart(4)}  recall ${pct(c.tp, c.tp + c.fn).padStart(4)}   (tp ${c.tp}, fp ${c.fp}, fn ${c.fn}, tn ${c.tn})`);
  const all = Object.values(table).reduce((s, c) => ({ tp: s.tp + c.tp, fp: s.fp + c.fp, fn: s.fn + c.fn, tn: s.tn + c.tn }), counts());
  console.log(`${"all".padEnd(44)} precision ${pct(all.tp, all.tp + all.fp).padStart(4)}  recall ${pct(all.tp, all.tp + all.fn).padStart(4)}   (tp ${all.tp}, fp ${all.fp}, fn ${all.fn}, tn ${all.tn})`);
};
show("Step A (code only: any candidate counts as a flag)", A);
if (STEPB) show(`Whole check (step A, then ${STEPB} confirms)`, B);
