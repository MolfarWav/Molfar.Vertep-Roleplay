/**
 * The cards that run as plain code, no model: Dice and Pick (seeded, so one reply always rolls the same), Extract
 * (a pattern) and Cut, and the Input sources that read Litopys facts and the lorebooks. The checker refuses a bad
 * parameter and a pattern that can run for very long; the host reads the chat's files for the two sources.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgent, riskyPattern } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";
import { defaultParams } from "../src/lib/forge";

type Json = Record<string, any>;
const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

/** An agent: Input (a reply) -> one code card -> Output (a note). `wire` = [from port, to port] between the card and the Output. */
function agentWith(card: Json, wire: [string, string] = ["text", "in"], give: Json[] = [{ id: "reply", source: "lastReply" }], intoCard: string | null = "in"): Json {
  const edges: Json[] = [{ id: "e2", from: `c:${wire[0]}`, to: "out:in" }];
  if (intoCard) edges.unshift({ id: "e1", from: `in:${give[0].id}`, to: `c:${intoCard}` });
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: "t",
    agent: { formatVersion: 1, id: "code-card", version: "1.0.0", name: "Code card", description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, limits: { maxCalls: 0, concurrency: 1 } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give } },
      { id: "c", x: 250, y: 0, title: "Card", ...card },
      { id: "out", type: "agent.output", x: 500, y: 0, title: "Output", params: { kind: "note", title: "Result" } },
    ],
    edges,
  };
}
const dice = (params: Json = {}) => agentWith({ type: "random.dice", params }, ["rolls", "in"], [], null);
const compiled = (f: Json) => compileAgent(f) as Json;
const errorsOf = (f: Json) => (compiled(f).report?.errors ?? []).map((e: Json) => e.code);

describe("the checker", () => {
  it("accepts each code card with its parameters, and they need no permission", () => {
    for (const f of [
      dice({ count: 2, sides: 6, bonus: 1 }),
      agentWith({ type: "random.pick", params: { items: [{ text: "rain", weight: 3 }, { text: "sun" }] } }, ["text", "in"], [], null),
      agentWith({ type: "text.extract", params: { pattern: "\\[MEMORY\\]:\\s*(.+)", group: 1 } }, ["match", "in"]),
      agentWith({ type: "text.cut", params: { keep: "last", unit: "words", n: 20 } }),
    ]) {
      const r = compiled(f);
      expect(r.report.errors).toEqual([]);
      // an agent made of dice or a pick alone does not read the Input: that is the one thing the checker may remark on
      expect(r.report.warnings.filter((w: Json) => w.code !== "W_ISLAND")).toEqual([]);
      expect(r.report.derived.maxCalls).toBe(0);
    }
    expect(compiled(dice()).report.derived.needs).toEqual(["show:note"]);
  });

  it("refuses a parameter out of range", () => {
    expect(errorsOf(dice({ sides: 1 }))).toContain("E_PARAM");
    expect(errorsOf(dice({ count: 21 }))).toContain("E_PARAM");
    expect(errorsOf(dice({ bonus: 1.5 }))).toContain("E_PARAM");
    expect(errorsOf(agentWith({ type: "random.pick", params: { items: [{ text: "one" }] } }, ["text", "in"], undefined, null))).toContain("E_PARAM");
    expect(errorsOf(agentWith({ type: "random.pick", params: { items: [{ text: "a", weight: 0 }, { text: "b" }] } }, ["text", "in"], undefined, null))).toContain("E_PARAM");
    expect(errorsOf(agentWith({ type: "text.cut", params: { keep: "middle", unit: "chars", n: 5 } }))).toContain("E_PARAM");
    expect(errorsOf(agentWith({ type: "text.cut", params: { keep: "first", unit: "chars", n: 0 } }))).toContain("E_PARAM");
  });

  it("refuses a pattern that does not compile, has a group it lacks, or can run for very long", () => {
    const ex = (params: Json) => errorsOf(agentWith({ type: "text.extract", params }, ["match", "in"]));
    expect(ex({ pattern: "(" })).toContain("E_REGEX");
    expect(ex({ pattern: "a", group: 1 })).toContain("E_PARAM");
    expect(ex({ pattern: "a", flags: "g" })).toContain("E_PARAM");
    expect(ex({ pattern: "x".repeat(201) })).toContain("E_PARAM");
    expect(ex({ pattern: "(a+)+$" })).toContain("E_REGEX_RISK");
    expect(ex({ pattern: "(a|b)*c" })).toContain("E_REGEX_RISK");
    expect(ex({ pattern: "(a)\\1" })).toContain("E_REGEX_RISK");
    expect(ex({ pattern: "^(?:foo|bar)$" })).toEqual([]);
    expect(ex({ pattern: "(\\d+)-(\\d+)", group: 2 })).toEqual([]);
    expect(riskyPattern("([a-z]+\\s?)+")).toBe(true);
  });

  it("types the ports: Dice gives a number and text, Extract a signal for no match", () => {
    expect(errorsOf(agentWith({ type: "random.dice", params: {} }, ["total", "in"], undefined, null))).toContain("E_TYPE"); // a number cannot feed a text Output
    expect(errorsOf(agentWith({ type: "text.extract", params: { pattern: "a" } }, ["none", "in"]))).toContain("E_TYPE");
  });
});

describe("the editor's new cards", () => {
  it("start with parameters the checker accepts", () => {
    for (const type of ["random.dice", "random.pick", "text.extract", "text.cut"]) {
      const errs = errorsOf(agentWith({ type, params: defaultParams(type) }, type === "text.extract" ? ["match", "in"] : type === "random.dice" ? ["rolls", "in"] : ["text", "in"], [{ id: "reply", source: "lastReply" }], type.startsWith("random.") ? null : "in"));
      expect(errs.filter((c: string) => c === "E_PARAM" || c === "E_REGEX" || c === "E_REGEX_RISK")).toEqual([]);
    }
  });
});

describe("the runner", () => {
  const go = (f: Json, ctx: Json = {}) => run.runAgent(compiled(f).file, { inputs: { reply: "text" }, ...ctx }, {}) as Json;

  it("rolls the same for the same seed and differently for another", () => {
    const f = dice({ count: 3, sides: 20 });
    const a = go(f, { seed: "chat|agent|m2#0" });
    expect(a.status).toBe("done");
    expect(go(f, { seed: "chat|agent|m2#0" }).outputs[0].text).toBe(a.outputs[0].text);
    const others = new Set(Array.from({ length: 12 }, (_, i) => go(f, { seed: "chat|agent|m2#" + i }).outputs[0].text));
    expect(others.size).toBeGreaterThan(4);
    const rolls = a.outputs[0].text.split(", ").map(Number);
    expect(rolls).toHaveLength(3);
    for (const n of rolls) { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(20); }
  });

  it("dice add the bonus to the total and keep the sides", () => {
    for (let i = 0; i < 50; i++) {
      const r = run.rollDice("s" + i, { count: 2, sides: 6, bonus: 3 });
      const rolls = r.rolls.split(", ").map(Number);
      expect(r.total).toBe(rolls[0] + rolls[1] + 3);
      expect(Math.min(...rolls)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...rolls)).toBeLessThanOrEqual(6);
    }
  });

  it("a pick follows the weights over many seeds, and takes a weightless line as 1", () => {
    const n: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) n[run.pickWeighted("p" + i, [{ text: "a", weight: 1 }, { text: "b", weight: 3 }]).text]++;
    expect(n.b / 4000).toBeGreaterThan(0.7);
    expect(n.b / 4000).toBeLessThan(0.8);
    expect(run.pickWeighted("x", [{ text: "only" }, { text: "other" }]).index).toBeGreaterThanOrEqual(1);
  });

  it("Extract takes a group, all matches joined, and signals none", () => {
    const text = "hello\n[MEMORY]: The king is poisoned.\nbye";
    expect(run.extractText(text, { pattern: "\\[MEMORY\\]:\\s*(.+)", group: 1 })).toBe("The king is poisoned.");
    expect(run.extractText("a1 b22 c3", { pattern: "\\d+", all: true, join: "|" })).toBe("1|22|3");
    expect(run.extractText("a1", { pattern: "x" })).toBeNull();
    expect(run.extractText("abc", { pattern: "x*", all: true })).toBeNull(); // an empty match is no match, and the loop ends
    const f = agentWith({ type: "text.extract", params: { pattern: "\\[MEMORY\\]:\\s*(.+)", group: 1 } }, ["match", "in"]);
    expect(go(f, { inputs: { reply: text } }).outputs).toEqual([expect.objectContaining({ kind: "note", text: "The king is poisoned." })]);
    expect(go(f, { inputs: { reply: "nothing here" } }).outputs).toEqual([]); // no match: the note path is skipped, nothing fires
  });

  it("Cut keeps the first or last characters, words or lines", () => {
    expect(run.cutText("abcdef", { keep: "first", unit: "chars", n: 3 })).toBe("abc");
    expect(run.cutText("abcdef", { keep: "last", unit: "chars", n: 2 })).toBe("ef");
    expect(run.cutText("one two three four", { keep: "last", unit: "words", n: 2 })).toBe("three four");
    expect(run.cutText("l1\nl2\nl3", { keep: "first", unit: "lines", n: 2 })).toBe("l1\nl2");
    const f = agentWith({ type: "text.cut", params: { keep: "first", unit: "words", n: 2 } });
    expect(go(f, { inputs: { reply: "alpha beta gamma" } }).outputs[0].text).toBe("alpha beta");
  });

  it("a card gated by a wire that did not fire does not roll", () => {
    const f = agentWith({ type: "random.dice", params: {} }, ["rolls", "in"], [{ id: "reply", source: "lastReply" }], null);
    f.nodes.splice(2, 0, { id: "gate", type: "data.parse", x: 100, y: 100, title: "Parse", params: { shape: { v: "text" } } });
    f.edges.push({ id: "e3", from: "in:reply", to: "gate:text" }, { id: "e4", from: "gate:failed", to: "c:when" });
    const r = go(f, { inputs: { reply: '{"v":"x"}' } }); // parses: `failed` does not fire, the dice are skipped
    expect(r.outputs).toEqual([]);
    expect(go(f, { inputs: { reply: "not json" } }).outputs).toHaveLength(1);
  });
});

describe("the host: seeded run and the two new sources", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-code-")); });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });
  const host = () => ({
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => { try { return fs.readdirSync(path.resolve(root, rel)).sort(); } catch { return []; } },
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  });
  const call = (method: string, p: string, body?: unknown, query?: Json) => (plugin.handleRoute({ method, path: p, query: query ?? {}, body } as never, host() as never) as Json);
  const put = (rel: string, v: unknown) => host().fs.write(rel, typeof v === "string" ? v : JSON.stringify(v));
  const setup = (file: Json, msgs: [string, string, number?][], meta: Json = {}) => {
    call("PUT", "/agents/install", { file, grant: true });
    put("chats/c1.meta.json", { id: "c1", title: "t", characterId: "aria", ...meta });
    put("chats/c1.jsonl", msgs.map(([role, text, swipe], i) => JSON.stringify({ id: "m" + i, role, name: role === "user" ? "Taras" : "Aria", text, swipe: swipe ?? 0 })).join("\n") + "\n");
    put("agents/presets/p.json", { format: "vertep-agent-preset", version: 1, id: "p", name: "P", items: [{ agent: "code-card", on: true }] });
    put("agents/settings.json", { defaultPreset: "p" });
  };
  const runOnce = () => call("POST", "/agents/run", { chatId: "c1", agent: "code-card" }).json.ran[0];
  const lastRun = () => call("GET", "/agents/runs", undefined, { chatId: "c1" }).json.runs.at(-1);

  it("a run rolls the same twice for one reply and again for a new swipe", () => {
    setup(dice({ count: 4, sides: 1000 }), [["user", "go"], ["char", "reply"]]);
    expect(runOnce()).toMatchObject({ status: "ok", outputs: 1 });
    const first = lastRun().outputs[0].text;
    expect(first).toMatch(/^\d+, \d+, \d+, \d+$/);
    runOnce();
    expect(lastRun().outputs[0].text).toBe(first);
    put("chats/c1.jsonl", [["user", "go", 0], ["char", "reply", 1]].map(([role, text, swipe], i) => JSON.stringify({ id: "m" + i, role, name: "x", text, swipe })).join("\n") + "\n");
    runOnce();
    expect(lastRun().outputs[0].text).not.toBe(first);
  });

  it("reads the chat's active Litopys facts, pinned first, and nothing when there are none", () => {
    const f = agentWith({ type: "text.cut", params: { keep: "first", unit: "lines", n: 3 } }, ["text", "in"], [{ id: "facts", source: "litopysFacts", limit: 2 }]);
    setup(f, [["user", "go"], ["char", "reply"]]);
    expect(runOnce()).toMatchObject({ status: "ok", outputs: 0 }); // no record: the source is missing and the card is skipped
    put("litopys/chats/c1.json", { facts: [
      { id: "f1", text: "old fact", status: "active" },
      { id: "f2", text: "pinned fact", status: "active", pinned: true },
      { id: "f3", text: "retired fact", status: "retired" },
      { id: "f4", text: "newest fact", status: "active" },
    ] });
    expect(runOnce()).toMatchObject({ status: "ok", outputs: 1 });
    expect(lastRun().outputs[0].text).toBe("- pinned fact\n- newest fact");
  });

  it("reads the lorebook entries that are constant or keyed by the last messages, from the books the chat uses", () => {
    const f = agentWith({ type: "text.cut", params: { keep: "first", unit: "lines", n: 20 } }, ["text", "in"], [{ id: "lore", source: "lorebook" }]);
    setup(f, [["user", "Tell me about the Dragon of the north."], ["char", "reply"]]);
    put("characters/aria/card.json", { name: "Aria", studio: { linkedLorebookIds: ["north"] } });
    put("lorebooks/north.json", { id: "north", entries: [
      { uid: 1, title: "Dragon", keys: ["dragon"], content: "Sleeps under the glacier.", enabled: true, status: "normal" },
      { uid: 2, title: "Law", keys: [], content: "Fire is forbidden.", enabled: true, status: "constant" },
      { uid: 3, title: "Unicorn", keys: ["unicorn"], content: "Not mentioned.", enabled: true, status: "normal" },
      { uid: 4, title: "Off", keys: ["dragon"], content: "Disabled.", enabled: false, status: "normal" },
      { uid: 5, title: "Rx", keys: ["dra.on"], keysRegex: true, content: "Regex keys are not applied.", enabled: true, status: "normal" },
    ] });
    put("lorebooks/other.json", { id: "other", entries: [{ uid: 1, title: "Elsewhere", keys: ["dragon"], content: "A book the chat does not use.", enabled: true, status: "normal" }] });
    put("lorebooks/everywhere.json", { id: "everywhere", globalActive: true, entries: [{ uid: 1, title: "Global", keys: ["north"], content: "A global book.", enabled: true, status: "normal" }] });
    expect(runOnce()).toMatchObject({ status: "ok", outputs: 1 });
    expect(lastRun().outputs[0].text).toBe("- Dragon: Sleeps under the glacier.\n- Law: Fire is forbidden.\n- Global: A global book.");
  });

  it("the two sources are asked for in plain words and are not held back as unsupported", () => {
    const f = agentWith({ type: "text.cut", params: { keep: "first", unit: "lines", n: 5 } }, ["text", "in"], [{ id: "facts", source: "litopysFacts" }, { id: "lore", source: "lorebook" }]);
    f.edges.push({ id: "e3", from: "in:lore", to: "c2:in" });
    const r = call("PUT", "/agents/install", { file: agentWith({ type: "text.cut", params: { keep: "first", unit: "lines", n: 5 } }, ["text", "in"], [{ id: "facts", source: "litopysFacts" }]) }).json;
    expect(r.needs).toEqual(["read:litopysFacts", "show:note"]);
    expect(r.unsupported).toEqual([]);
    expect(f.nodes.length).toBe(3);
  });
});
