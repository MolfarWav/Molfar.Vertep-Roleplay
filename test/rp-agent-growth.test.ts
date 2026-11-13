/**
 * The living portrait of a character (Molfar.Vertep#396): the `write.growth` card proposes BLOCKS (a Profile section, "changed"
 * or "added", a text) into characters/<id>/growth.json, the user decides in the Memory tab (routes here), and the accepted blocks
 * go into the prompt as one part that says it wins over the card.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgent } from "../src/canvas-kit/boards/agent-check.js";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

type Json = Record<string, any>;
let root: string;
let requests: [string, Json][] = [];
let results: Record<string, Json> = {};
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: (k: string, body: Json) => requests.push([k, body]), results, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
const call = (method: string, p: string, body?: unknown, query?: Json) =>
  plugin.handleRoute({ method, path: p, query: query ?? {}, body } as never, host() as never) as { status?: number; json?: Json; __llmPending?: boolean };
const j = (p: string, method = "GET", body?: unknown, query?: Json) => call(method, p, body, query).json as Json;
const put = (body: Json) => j("/agents/growth", "PUT", { cardId: "aria", ...body });
const disk = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const growthOf = () => disk("characters/aria/growth.json");

function makeChat(id: string, msgs: [string, string][], meta: Json = {}) {
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "Night in the keep", characterId: "aria", ...meta }));
  setMessages(id, msgs);
}
function setMessages(id: string, msgs: [string, string][]) {
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map(([role, text], i) => JSON.stringify({ id: "m" + i, role, name: role === "user" ? "Taras" : "Aria", text, swipe: 0 })).join("\n") + "\n");
}
/** n replies in the chat (the trigger counts them); the last message is a reply. */
const replies = (n: number, tag = "line") => setMessages("c1", Array.from({ length: n * 2 }, (_, i): [string, string] => [i % 2 ? "char" : "user", tag + " " + i]));
const CHAT: [string, string][] = [["user", "I stay by the fire."], ["char", "She sits next to you and does not pull away."]];

/** An agent with no model: the last reply is the block, a fixed word each for the section and the kind. */
const growerFile = (id = "grower", section = "personality", kind = "changed") => {
  const nodes: Json[] = [
    { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "last", source: "lastReply" }, { id: "msg", source: "lastUserMessage" }] } },
    { id: "sec", type: "text.template", x: 0, y: 100, title: "Section", params: { text: section } },
    { id: "kin", type: "text.template", x: 0, y: 200, title: "Kind", params: { text: kind } },
    { id: "grow", type: "write.growth", x: 300, y: 0, title: "Grow", params: {} },
    { id: "out", type: "agent.output", x: 600, y: 0, title: "Out", params: { kind: "note", title: "Grew" } },
  ];
  const edges: Json[] = [
    { id: "a", from: "in:last", to: "grow:text" }, { id: "b", from: "in:last", to: "out:in" }, { id: "c", from: "sec:text", to: "grow:section" },
    { id: "d", from: "kin:text", to: "grow:kind" }, { id: "e", from: "in:msg", to: "grow:title" },
  ];
  const f = { format: "vertep-canvas", version: 1, kind: "agent", title: id, agent: { formatVersion: 1, id, version: "1.0.0", name: id, description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, models: {}, limits: { maxCalls: 0 } }, nodes, edges };
  return compileAgent(f as never).file;
};
const useAgent = (id: string) => {
  fs.mkdirSync(path.join(root, "agents", "presets"), { recursive: true });
  fs.writeFileSync(path.join(root, "agents", "presets", "p.json"), JSON.stringify({ format: "vertep-agent-preset", version: 1, id: "p", name: "P", items: [{ agent: id, on: true }] }));
  fs.writeFileSync(path.join(root, "agents", "settings.json"), JSON.stringify({ defaultPreset: "p" }));
};
/** Run until the plugin stops asking, the way the engine does; `answer` plays the model for each question. */
function runChat(chatId = "c1", answer: (q: Json, key: string) => Json = () => ({ text: "{}" })): Json {
  results = {};
  let stash: Json = { started: 1 };
  for (let pass = 0; pass < 12; pass++) {
    requests = [];
    const r = plugin.handleRoute({ method: "POST", path: "/agents/run", query: {}, body: { chatId }, stash } as never, host() as never) as { json?: Json; __llmPending?: boolean; stash?: Json };
    if (!r.__llmPending) return r.json as Json;
    stash = r.stash ?? stash;
    results = {};
    for (const [k, q] of requests) results[k] = answer(q, k);
  }
  throw new Error("never finished");
}
const run = (chatId = "c1") => runChat(chatId);
const reply = (messages: Json[], chatId = "c1") => plugin.llmRequest({ key: "reply", request: { sessionId: chatId, messages } } as never, host() as never) as Json | null;
const PROMPT = () => [{ role: "system", content: "Aria is a tsundere." }, { role: "system", content: "Persona: Taras." }, { role: "user", content: "Hi." }, { role: "assistant", content: "Tch." }, { role: "user", content: "Go on." }];
const HEAD = "How Aria has changed and what has come out over the story so far. Where this differs from the character description and personality above, this is more recent and wins.";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-growth-"));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ name: "Aria", description: "A tsundere." }));
  makeChat("c1", CHAT);
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

describe("proposing a block (#396)", () => {
  it("the card needs its own permission, and a run leaves a proposed block that is not in the prompt yet", () => {
    const r = j("/agents/install", "PUT", { file: growerFile(), grant: true });
    expect(r.ok).toBe(true);
    expect(r.needs).toContain("write:card.growth");
    expect(r.unsupported).toEqual([]);
    useAgent("grower");
    expect(run().ran[0]).toMatchObject({ agent: "grower", status: "ok" });
    const g = growthOf();
    expect(g.v).toBe(2);
    expect(g.entries).toHaveLength(1);
    expect(g.entries[0]).toMatchObject({ id: "g1", section: "personality", kind: "changed", text: "She sits next to you and does not pull away.", title: "I stay by the fire.", state: "proposed", on: true, origin: "agent", agent: "grower" });
    expect(g.entries[0].from).toMatchObject({ chatId: "c1", title: "Night in the keep" });
    expect(g.next).toBe(2);
    // nothing reaches the prompt before the user says yes
    expect(reply(PROMPT())).toBeNull();
  });

  it("a second run of the same reply does not add it twice; a section that is not one of ours becomes 'other'", () => {
    j("/agents/install", "PUT", { file: growerFile("grower", "appearance"), grant: true });
    useAgent("grower");
    run();
    run();
    expect(growthOf().entries).toHaveLength(1);
    // identity and appearance are not sections of the portrait: a rare scar is an "other" block
    expect(growthOf().entries[0].section).toBe("other");
  });

  it("refuses in a group chat and writes nothing", () => {
    j("/agents/install", "PUT", { file: growerFile(), grant: true });
    useAgent("grower");
    makeChat("g1", CHAT, { groupId: "grp", characterId: "aria" });
    expect(run("g1").ran[0].status).toBe("ok");
    expect(exists("characters/aria/growth.json")).toBe(false);
    expect(JSON.stringify(j("/agents/runs", "GET", undefined, { chatId: "g1" }).runs)).toContain("group chat is not supported");
  });
});

describe("what the user decides, and what goes into the prompt (#396)", () => {
  const propose = (section = "personality", kind = "changed") => { j("/agents/install", "PUT", { file: growerFile("grower", section, kind), grant: true }); useAgent("grower"); run(); };

  it("an accepted block is one part at the end of the leading system block, in the words of the Profile's sections", () => {
    propose();
    const answer = put({ op: "accept", id: "g1" });
    expect(answer.growth.entries[0].state).toBe("accepted");
    const out = reply(PROMPT()) as Json;
    const texts = out.messages.map((m: Json) => m.content);
    expect(texts[0]).toBe("Aria is a tsundere.");
    expect(texts[1]).toBe("Persona: Taras.\n\n" + HEAD + "\n\n## Personality (now)\nShe sits next to you and does not pull away.");
    expect(texts[4]).toBe("Go on.");
    expect(out.promptSources.parts[0]).toMatchObject({ kind: "plugin", label: "Agents · character growth" });
  });

  it("writes the sections in the Profile's order, 'changed' blocks of one section together, 'added' blocks under their own title", () => {
    put({ op: "add", section: "goals", text: "Wants to leave the guild." });
    put({ op: "add", section: "personality", text: "Laughs easily now." });
    put({ op: "add", section: "relationships", kind: "added", title: "Trust in the courier", text: "Trusts the courier with her real name." });
    put({ op: "add", section: "personality", text: "Stands her ground quietly." });
    const part = (reply(PROMPT()) as Json).messages[1].content as string;
    expect(part).toContain(HEAD + "\n\n## Trust in the courier\nTrusts the courier with her real name.\n\n## Personality (now)\nLaughs easily now.\n\nStands her ground quietly.\n\n## Goals (now)\nWants to leave the guild.");
  });

  it("a block about a section that already has an accepted one is a revision: accepting replaces the text, keeps the old one, and can go back", () => {
    put({ op: "add", section: "personality", text: "Sharp-tongued, denies her feelings." });
    propose("personality", "changed");
    const proposed = growthOf().entries.find((e: Json) => e.state === "proposed");
    expect(proposed.revises).toBe("g1");
    const after = put({ op: "accept", id: proposed.id });
    expect(after.growth.entries).toHaveLength(1);
    expect(after.growth.entries[0]).toMatchObject({ id: "g1", text: "She sits next to you and does not pull away.", prev: ["Sharp-tongued, denies her feelings."] });
    expect(((reply(PROMPT()) as Json).messages[1].content as string)).not.toContain("Sharp-tongued");
    const back = put({ op: "revert", id: "g1" });
    expect(back.growth.entries[0].text).toBe("Sharp-tongued, denies her feelings.");
    expect(back.growth.entries[0].prev).toBeUndefined();
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "revert", id: "g1" }).status).toBe(400);
  });

  it("is off when the block is switched off, the whole thing is off, or the Prompt board switch is off for the chat", () => {
    propose();
    put({ op: "accept", id: "g1" });
    put({ op: "on", id: "g1", on: false });
    expect(reply(PROMPT())).toBeNull();
    put({ op: "on", id: "g1", on: true });
    expect(reply(PROMPT())).not.toBeNull();
    put({ op: "inject", enabled: false });
    expect(reply(PROMPT())).toBeNull();
    put({ op: "inject", enabled: true });
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", characterId: "aria", promptBoard: { v: 1, off: ["plugin:cardgrowth"] } }));
    expect(reply(PROMPT())).toBeNull();
  });

  it("the user sets the room (far above the habits' 800); over it the newest blocks stay and the answer says how many are left out", () => {
    for (let i = 1; i <= 4; i++) put({ op: "add", section: "background", kind: "added", title: "Part " + i, text: `Part ${i}: ` + "x".repeat(300) });
    let a = j("/agents/growth", "GET", undefined, { cardId: "aria" });
    expect(a.growth.inject.maxTokens).toBe(1500);
    expect(a.tokens).toMatchObject({ live: 4, omitted: 0, sent: 4 });
    a = put({ op: "inject", maxTokens: 250 });
    expect(a.tokens.sent).toBeLessThan(4);
    expect(a.tokens.sent).toBeGreaterThan(0);
    expect(a.tokens.omitted).toBe(4 - a.tokens.sent);
    const part = (reply(PROMPT()) as Json).messages[1].content as string;
    expect(part).toContain("Part 4:");
    expect(part).not.toContain("Part 1:");
    expect(put({ op: "inject", maxTokens: 6000 }).growth.inject.maxTokens).toBe(6000);
  });

  it("the ceiling the engine reserves counts the part, exactly", () => {
    expect((plugin.insertCeiling({ chatId: "c1" } as never, host() as never) as Json).ceilings[0].tokens).toBe(0);
    put({ op: "add", section: "personality", text: "She stopped hiding it." });
    expect((plugin.insertCeiling({ chatId: "c1" } as never, host() as never) as Json).ceilings[0].tokens).toBeGreaterThan(30);
  });

  it("a v1 file (was and now) is read as blocks", () => {
    fs.writeFileSync(path.join(root, "characters", "aria", "growth.json"), JSON.stringify({ v: 1, next: 3, entries: [{ id: "g1", was: "Cold.", now: "Warm.", on: true, state: "accepted", origin: "user", at: 1 }, { id: "g2", now: "Keeps a diary.", on: true, state: "proposed", origin: "agent", at: 2 }], inject: { enabled: true, maxTokens: 800 } }));
    const a = j("/agents/growth", "GET", undefined, { cardId: "aria" });
    expect(a.growth.entries[0]).toMatchObject({ id: "g1", section: "other", kind: "changed", text: "Was: Cold. Now: Warm." });
    expect(a.growth.entries[1].text).toBe("Keeps a diary.");
    expect(a.growth.inject.maxTokens).toBe(800);
    expect(a.growth.v).toBe(2);
  });

  it("the routes refuse what makes no sense, cut the texts and keep the card alone", () => {
    expect(call("GET", "/agents/growth", undefined, { cardId: "ghost" }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "add", text: "  " }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "add", text: "x", section: "appearance" }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "add", text: "x", kind: "wrong" }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "inject", maxTokens: 50 }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "inject", maxTokens: 9000 }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "accept", id: "g99" }).status).toBe(404);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "nonsense" }).status).toBe(400);
    put({ op: "add", section: "goals", text: "x".repeat(2000), title: "t".repeat(300), basis: "b".repeat(300) });
    const e = growthOf().entries[0];
    expect(e.text.length).toBe(1200);
    expect(e.title.length).toBe(80);
    expect(e.basis.length).toBe(120);
    put({ op: "edit", id: "g1", text: "Short.", section: "background", kind: "added", title: "" });
    expect(growthOf().entries[0]).toMatchObject({ text: "Short.", section: "background", kind: "added" });
    expect(growthOf().entries[0].title).toBeUndefined();
    put({ op: "delete", id: "g1" });
    expect(growthOf().entries).toEqual([]);
    expect(disk("characters/aria/card.json")).toEqual({ name: "Aria", description: "A tsundere." });
  });
});

describe("the ready agent 'Character growth' (#396)", () => {
  const recipe = () => JSON.parse(fs.readFileSync(new URL("../.skills/agent-craft/references/recipe-growth.vertep-agent.json", import.meta.url), "utf8"));
  const install = () => { const r = j("/agents/install", "PUT", { file: compileAgent(recipe()).file, grant: true }); useAgent("character-growth"); return r; };
  const says = (o: Json) => () => ({ text: JSON.stringify(o) });
  const nothing = { changed: false, section: "other", kind: "changed", title: "", text: "", basis: "" };

  it("installs with the permissions the Allow page lists, and costs one call every eighth reply", () => {
    const r = install();
    expect(r.ok).toBe(true);
    expect(r.needs).toEqual(["llm", "read:card", "read:growth", "read:history", "write:card.growth"]);
    expect(r.unsupported).toEqual([]);
    expect(j("/agents/list").agents[0]).toMatchObject({ maxCalls: 1, trigger: { everyN: 8 } });
  });

  it("proposes the block the model writes, and nothing when it says nothing lasting happened", () => {
    install();
    // the first run has no portrait yet, which must not stop the question
    replies(8);
    const asked: string[] = [];
    const first = runChat("c1", (q) => { asked.push(JSON.stringify(q)); return { text: JSON.stringify(nothing) }; });
    expect(first.ran[0]).toMatchObject({ agent: "character-growth", status: "ok", calls: 1 });
    expect(asked[0]).toContain("(nothing yet)");
    expect(exists("characters/aria/growth.json")).toBe(false);
    replies(16);
    runChat("c1", says({ changed: true, section: "personality", kind: "changed", title: "Open now", text: "Aria no longer hides what she feels: she teases, and says so when she is glad.", basis: "tsundere, denies her feelings" }));
    const g = growthOf();
    expect(g.entries).toHaveLength(1);
    expect(g.entries[0]).toMatchObject({ section: "personality", kind: "changed", title: "Open now", basis: "tsundere, denies her feelings", state: "proposed", agent: "character-growth" });
    expect(g.entries[0].text).toContain("teases");
    // the next question carries what is already there, so the model is told not to repeat it
    const later: string[] = [];
    replies(24);
    runChat("c1", (q) => { later.push(JSON.stringify(q)); return { text: JSON.stringify(nothing) }; });
    expect(later[0]).toContain("[personality] Open now");
    expect(later[0]).toContain("waiting for the user");
  });
});
