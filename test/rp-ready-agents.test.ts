/**
 * The ready agents Repetition guard, Canon guard and Ledger (Molfar.Vertep#396). Each recipe is run through the real
 * executor; its Script cards are run from the code that is IN the recipe file (the file is the one truth), and the model
 * is played by a function. The sandbox itself is the engine's: these scripts were also run on its QuickJS worker.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { compileAgent } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";

type Json = Record<string, any>;
const dir = new URL("../.skills/agent-craft/references/", import.meta.url);
const load = (name: string): Json => JSON.parse(fs.readFileSync(new URL(`recipe-${name}.vertep-agent.json`, dir), "utf8"));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Runs an agent to the end: script requests run the card's own code, model requests go to `model`. */
function drive(f: Json, ctx: Json, model: (prompt: string, node: string) => string = () => "none") {
  const answers: Json = {};
  const prompts: Record<string, string> = {};
  for (let i = 0; i < 12; i++) {
    const r = run.runAgent(f, ctx, answers) as Json;
    if (r.status !== "need") return { r: clone(r), prompts };
    for (const q of r.requests) {
      if (q.kind === "script") {
        const out = new Function("input", "seed", `"use strict";\n${q.code}`)(clone(q.input), ctx.seed ?? "s");
        answers[q.node] = { value: clone(out) };
      } else {
        prompts[q.node] = q.prompt;
        answers[q.node] = { text: model(q.prompt, q.node) };
      }
    }
  }
  throw new Error("the run did not finish");
}
const apply = (own: Json, r: Json): Json => {
  const next = { ...own };
  for (const w of r.writes ?? []) if (w.op === "own.set") next[w.field] = w.value;
  return next;
};
const inserts = (r: Json) => (r.outputs ?? []).filter((o: Json) => o.kind === "prompt-insert");

describe("the three recipes", () => {
  it.each([
    ["repetition", "repetition-guard", 0],
    ["canon", "canon-guard", 1],
    ["ledger", "ledger", 1],
  ])("%s passes the checker clean, id %s, %i model calls", (name, id, calls) => {
    const r = compileAgent(load(name)) as Json;
    expect(r.error).toBeUndefined();
    expect(r.report.errors).toEqual([]);
    expect(r.report.warnings).toEqual([]);
    expect(r.file.agent.id).toBe(id);
    expect(r.report.derived.maxCalls).toBe(calls);
    expect(r.file.agent.limits.maxCalls).toBe(calls);
  });

  it("every script stays under the card's code limit", () => {
    for (const name of ["repetition", "canon", "ledger"])
      for (const n of load(name).nodes.filter((x: Json) => x.type === "code.script")) expect(n.params.code.length).toBeLessThanOrEqual(8000);
  });
});

describe("Repetition guard", () => {
  const f = load("repetition");
  const row = (t: string, who = "Aria") => `${who}: ${t}`;
  const insertOf = (history: string) => inserts(drive(f, { inputs: { h: history } }).r)[0]?.text as string | undefined;

  it("names a phrase that two replies share, in English", () => {
    const text = insertOf([
      row("Her heart pounded in her chest as she looked at him. A shiver ran down her spine."),
      row("The night was cold.\n\nHer heart pounded in her chest again. Elena stepped closer."),
    ].join("\n\n"));
    expect(text).toContain("Do not reuse these phrases from earlier replies");
    expect(text).toContain("heart pounded in her chest");
  });

  it("works on Cyrillic: no stemming, lower case only", () => {
    const text = insertOf([
      row("Серце калатало в грудях, і по спині пробіг холодок. Вона мовчки дивилася на нього."),
      row("Знову серце калатало в грудях, а по спині пробіг холодок. Вона мовчки дивилася на двері. Вона мовчки дивилася на вікно. Вона мовчки дивилася вниз."),
    ].join("\n\n"));
    expect(text!.toLowerCase()).toContain("серце калатало в грудях");
    expect(text).toContain("по спині пробіг холодок");
    // a sentence opening used three times
    expect(text).toContain('Do not open sentences with "Вона мовчки..."');
  });

  it("never names a phrase from one reply only, nor one that crosses a full stop", () => {
    const text = insertOf([row("The rain began at dusk. The market emptied quickly."), row("Marta counted the coins twice. A bell rang above the harbour.")].join("\n\n"));
    expect(text).toBeUndefined();
    const crossing = insertOf([row("He turned away. Her heart pounded hard."), row("She froze. Her heart pounded hard again.")].join("\n\n"));
    expect(crossing).toContain("heart pounded hard");
    expect(crossing).not.toContain("froze");
  });

  it("skips phrases made only of names or of short words", () => {
    const text = insertOf([row("Then Anna Maria Petrova arrived. It is on at in of to."), row("Later Anna Maria Petrova left. It is on at in of to.")].join("\n\n"));
    expect(text).toBeUndefined();
  });

  it("stays empty on an empty input, and an empty output is no insert", () => {
    const r = drive(f, { inputs: { h: "" } }).r;
    expect(r.status).toBe("done");
    expect(inserts(r)).toEqual([]);
    expect(r.calls).toBe(0);
  });

  it("gives at most five phrases and stays small", () => {
    const loop = "the old lighthouse keeper watched silently over restless water while distant thunder rolled across hills. ";
    const text = insertOf([row(loop.repeat(2)), row(loop), row(loop + "another quiet evening settled gently upon sleepy village.")].join("\n\n"))!;
    expect(text.length).toBeLessThan(700);
    expect((text.match(/"/g) ?? []).length / 2).toBeLessThanOrEqual(7);
  });

  it("keeps up on the largest history the Input allows", () => {
    const vocab = "silence night city road wind cold warm slowly quickly door window table candle fire person word glance hand voice heart thought path stone water sky earth house garden forest river bridge street market bell bird horse sword shield letter book key".split(" ");
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rows = Array.from({ length: 6 }, () => row(Array.from({ length: 700 }, (_, i) => vocab[Math.floor(rnd() * vocab.length)] + (i % 11 === 10 ? "." : "")).join(" ")));
    const h = rows.join("\n\n");
    expect(h.length).toBeGreaterThan(20000);
    const t0 = performance.now();
    const text = insertOf(h);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect((text ?? "").length).toBeLessThan(900);
  });

  it("is a prompt insert after the history, labelled, and reads only the chat's own replies", () => {
    const out = f.nodes.find((n: Json) => n.type === "agent.output").params;
    expect(out).toMatchObject({ kind: "prompt-insert", label: "Repetition guard" });
    const give = f.nodes.find((n: Json) => n.type === "agent.input").params.give;
    expect(give).toEqual([{ id: "h", source: "history", only: "char", last: 6, tokens: 8000 }]);
    expect(compileAgent(f).report.derived.needs).toEqual(["read:history", "run:code", "write:prompt"]);
  });
});

describe("Canon guard", () => {
  const f = load("canon");
  const inputs = { hist: "Aria: She tucked her blonde hair behind her ear.", card: "Elena. Black hair, green eyes.", facts: "- Elena has black hair." };
  const found = JSON.stringify({ found: true, what: "The reply says her hair is blonde; the card says black.", fix: "Wait, her hair is black.", key: "hair-colour" });
  const noteOf = (r: Json) => (r.outputs ?? []).find((o: Json) => o.kind === "note");
  const buttonOf = (r: Json) => (r.outputs ?? []).find((o: Json) => o.kind === "choices");

  it("asks one question that carries the replies, the card, the facts and the keys already shown", () => {
    const { r, prompts } = drive(f, { inputs, own: {} }, () => JSON.stringify({ found: false, what: "", fix: "", key: "" }));
    expect(r.calls).toBe(1);
    expect(prompts.ask).toContain("Black hair, green eyes");
    expect(prompts.ask).toContain("- Elena has black hair.");
    expect(prompts.ask).toContain("blonde hair");
    expect(prompts.ask).toContain("Do not report these keys again: |");
    expect(prompts.ask).toContain("Answer with JSON only");
  });

  it("a contradiction gives a note that names the fix to Litopys and a button for the message box", () => {
    const { r } = drive(f, { inputs, own: {} }, () => found);
    expect(noteOf(r)).toMatchObject({ title: "Canon check" });
    expect(noteOf(r).text).toBe("The reply says her hair is blonde; the card says black. If this is the new truth, update the fact in Litopys.");
    expect(buttonOf(r)).toMatchObject({ show: "bottom", choices: ["(OOC: Wait, her hair is black.)"] });
    expect(apply({}, r).seen).toBe("|hair-colour|");
  });

  it("does not show the same key twice", () => {
    const first = drive(f, { inputs, own: {} }, () => found).r;
    const own = apply({}, first);
    const again = drive(f, { inputs, own }, () => found).r;
    expect(noteOf(again)).toBeUndefined();
    expect(buttonOf(again)).toBeUndefined();
    const other = drive(f, { inputs, own }, () => found.replace("hair-colour", "eye-colour")).r;
    expect(noteOf(other)).toBeDefined();
    expect(apply(own, other).seen).toBe("|hair-colour|eye-colour|");
  });

  it("found false, or an empty sentence, leaves no output at all", () => {
    for (const answer of [{ found: false, what: "x", fix: "y", key: "k" }, { found: true, what: "", fix: "y", key: "k" }, { found: true, what: "x", fix: " ", key: "k" }]) {
      const { r } = drive(f, { inputs, own: {} }, () => JSON.stringify(answer));
      expect(r.status).toBe("done");
      expect(r.outputs.filter((o: Json) => o.kind !== "state-patch")).toEqual([]);
    }
  });

  it("a reply that is not JSON fails the run without writing", () => {
    const { r } = drive(f, { inputs, own: {} }, () => "I think the hair is wrong");
    expect(r.status).toBe("failed");
  });

  it("without the card or without recorded facts the agent quietly does not run", () => {
    for (const miss of ["card", "facts"]) {
      const { r } = drive(f, { inputs: { ...inputs, [miss]: undefined }, own: {} });
      expect(r.status).toBe("done");
      expect(r.calls).toBe(0);
      expect(r.outputs.filter((o: Json) => o.kind !== "state-patch")).toEqual([]);
    }
  });

  it("only the last three replies, every third reply, and never a write to a card or to Litopys", () => {
    expect(f.agent.trigger).toMatchObject({ when: "after", everyN: 3 });
    expect(f.nodes.find((n: Json) => n.type === "agent.input").params.give.find((g: Json) => g.id === "hist")).toMatchObject({ source: "history", only: "char", last: 3 });
    const needs: string[] = (compileAgent(f) as Json).report.derived.needs;
    expect(needs.filter((n) => n.startsWith("write:"))).toEqual(["write:own.seen"]);
  });
});

describe("Ledger", () => {
  const f = load("ledger");
  const books = (own: Json) => JSON.parse(own.book as string) as Json[];
  const go = (own: Json, user: string, reply: string, lines?: string) =>
    drive(f, { inputs: { reply, user }, own }, () => lines ?? "none");
  const step = (own: Json, user: string, reply: string, lines?: string) => {
    const { r, prompts } = go(own, user, reply, lines);
    return { r, prompts, own: apply(own, r) };
  };
  const row = (own: Json, name: string) => books(own).find((x) => x.name.toLowerCase() === name.toLowerCase());

  it("the model reports a change, the code does the sum", () => {
    const { own, prompts, r } = step({}, "I pay the smith.", "He takes 30 gold. You have 470 gold left.", "gold: =470");
    expect(r.calls).toBe(1);
    expect(prompts.ask).toContain("Current table (JSON):\n[]");
    expect(row(own, "gold")).toMatchObject({ kind: "stock", amount: 470, perDay: 0 });
    const next = step(own, "I buy a sword.", "The sword costs 30.", "gold: -30");
    expect(row(next.own, "gold")!.amount).toBe(440);
    expect(next.prompts.ask).toContain('"amount":470');
  });

  it("the true numbers are told to the next reply, from one Output only", () => {
    const changed = step({}, "I pay.", "He takes 30 gold.", "gold: =470\ngold per day: =50\ntimer Silver Castle: =4");
    const ins = inserts(changed.r);
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ label: "Ledger", position: "after-history" });
    expect(ins[0].text).toBe("The true numbers, use them and invent no others: gold 470 (+50 a day); Silver Castle in 4 days.");
    // a reply with no digit: no model call, the other Output carries the same numbers
    const quiet = step(changed.own, "I look around.", "The road is quiet.");
    expect(quiet.r.calls).toBe(0);
    expect(quiet.prompts).toEqual({});
    expect(inserts(quiet.r)).toHaveLength(1);
    expect(inserts(quiet.r)[0].text).toBe(ins[0].text);
    expect(quiet.own.book).toBe(changed.own.book);
  });

  it("digits, number words and time words wake the model; plain prose does not", () => {
    for (const reply of ["He takes 30 gold.", "He takes three coins.", "Він бере дві монети.", "Он берёт пять монет.", "Two days later the gate opens.", "Через кілька днів ворота відчинилися.", "Наутро он ушёл.".replace("Наутро", "Утром")]) expect(go({}, "ok", reply).r.calls).toBe(1);
    for (const reply of ["The road is quiet.", "Дорога тиха.", "Дорога тихая."]) expect(go({}, "ok", reply).r.calls).toBe(0);
  });

  it("nothing tracked: no hint at all, and the panel says so", () => {
    const { r, own } = step({}, "I look around.", "The road is quiet.");
    expect(inserts(r)).toEqual([]);
    expect(own.html).toContain("Nothing tracked yet");
  });

  it("days: every stock gains its income, every timer loses the days, never below 0", () => {
    const start = { book: JSON.stringify([{ name: "gold", kind: "stock", amount: 100, perDay: 50 }, { name: "Silver Castle", kind: "timer", amount: 4, perDay: 0 }]) };
    const two = step(start, "We ride.", "Two days pass on the road.", "days: 2");
    expect(row(two.own, "gold")!.amount).toBe(200);
    expect(row(two.own, "Silver Castle")!.amount).toBe(2);
    const late = step(two.own, "We ride on.", "Nine more days pass.", "days: 9");
    expect(row(late.own, "Silver Castle")!.amount).toBe(0);
    expect(late.own.html).toContain("⚑ now");
    expect(inserts(late.r)[0].text).toContain("Silver Castle: now");
    // a change and the days in one answer: the change first, then the days
    const both = step(start, "We rest.", "You spend 20 gold and sleep a day.", "gold: -20\ndays: 1");
    expect(row(both.own, "gold")!.amount).toBe(130);
  });

  it("a malformed line is dropped, not repaired; the rest of the answer counts", () => {
    const lines = ["gold: lots", "silver 5", "- gold: +10", "`ruby: -2`", "none", "gold per day: =5", "timer: =3", "days: soon", "ruby: =1e3", "bread: +99999999999"].join("\n");
    const { own } = step({ book: JSON.stringify([{ name: "gold", kind: "stock", amount: 90, perDay: 0 }]) }, "x 1", "y 2", lines);
    expect(row(own, "gold")).toMatchObject({ amount: 100, perDay: 5 });
    expect(row(own, "ruby")).toMatchObject({ amount: -2 });
    expect(books(own).map((x) => x.name).sort()).toEqual(["gold", "ruby"]);
  });

  it("at most twelve rows", () => {
    const lines = Array.from({ length: 14 }, (_, i) => `item${i}: =${i + 1}`).join("\n");
    const { own } = step({}, "x 1", "y 2", lines);
    expect(books(own)).toHaveLength(12);
    // the first twenty lines only
    expect(books(step({}, "x 1", "y 2", Array.from({ length: 40 }, (_, i) => `a${i}: =1`).join("\n")).own).length).toBeLessThanOrEqual(12);
  });

  it("your own words: (ledger: gold = 500) and (ledger: remove gold), no model needed", () => {
    const set = step({}, "(ledger: gold = 500) I enter the town.", "The gate opens.");
    expect(set.r.calls).toBe(0);
    expect(row(set.own, "gold")!.amount).toBe(500);
    expect(inserts(set.r)[0].text).toContain("gold 500");
    const more = step(set.own, "(ledger: timer Castle = 3) (ledger: gold per day = 20)", "The road is quiet.");
    expect(more.r.calls).toBe(0);
    expect(row(more.own, "Castle")).toMatchObject({ kind: "timer", amount: 3 });
    expect(row(more.own, "gold")).toMatchObject({ amount: 500, perDay: 20 });
    const gone = step(more.own, "(ledger: remove gold)", "The road is quiet.");
    expect(row(gone.own, "gold")).toBeUndefined();
    expect(row(gone.own, "Castle")).toBeDefined();
    // a command that is only digits in brackets does not wake the model
    expect(step({}, "(ledger: gold = 5)", "The road is quiet.").r.calls).toBe(0);
  });

  it("works in Cyrillic and never lets a name become markup", () => {
    const a = step({}, "Плачу ковалю.", "Він бере 30 монет.", "золото: =70\n<b>x</b>: +1");
    expect(row(a.own, "золото")!.amount).toBe(70);
    expect(a.own.html).toContain("золото");
    expect(a.own.html).not.toContain("<b>x</b>");
    expect(a.own.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect((a.own.html as string).length).toBeLessThanOrEqual(8192);
  });

  it("a full table fits the panel's size limit", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `a rather long resource name number ${i}: =${1000000 + i}\nthe resource name number ${i} per day: =${i + 1}`).join("\n");
    const { own } = step({}, "x 1", "y 2", lines);
    expect((own.html as string).length).toBeLessThan(8192);
    expect(JSON.stringify(books(own)).length).toBeLessThan(20000);
  });

  it("reads the last reply and the player's message only, and writes its own two fields", () => {
    const needs: string[] = (compileAgent(f) as Json).report.derived.needs;
    expect(needs).toEqual(["llm", "read:lastReply", "read:lastUserMessage", "read:own.book", "run:code", "show:panel", "write:own.book", "write:own.html", "write:prompt"]);
    expect(f.agent.panels[0]).toMatchObject({ place: "float", widgets: [{ w: "html", bind: "html" }] });
  });
});
