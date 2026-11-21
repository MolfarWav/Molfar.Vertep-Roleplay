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
function makeGroup(id: string, members: string[], mode = "swap") {
  for (const m of members) {
    fs.mkdirSync(path.join(root, "characters", m), { recursive: true });
    if (!exists("characters/" + m + "/card.json")) fs.writeFileSync(path.join(root, "characters", m, "card.json"), JSON.stringify({ name: m[0].toUpperCase() + m.slice(1), description: "A member." }));
  }
  fs.mkdirSync(path.join(root, "groups"), { recursive: true });
  fs.writeFileSync(path.join(root, "groups", id + ".json"), JSON.stringify({ id, name: "The group", memberIds: members, generationMode: mode }));
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

  it("in a group chat a block with no member name is refused, and nothing is written", () => {
    j("/agents/install", "PUT", { file: growerFile(), grant: true });
    useAgent("grower");
    makeGroup("grp", ["aria", "bob"], "narrator");
    makeChat("g1", CHAT, { groupId: "grp", characterId: "grp" });
    expect(run("g1").ran[0].status).toBe("ok");
    expect(exists("characters/aria/growth.json")).toBe(false);
    expect(JSON.stringify(j("/agents/runs", "GET", undefined, { chatId: "g1" }).runs)).toContain("say which member");
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
  const nothing = { changed: false, section: "other", kind: "changed", title: "", text: "", basis: "", who: "" };

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
    runChat("c1", says({ changed: true, section: "personality", kind: "changed", title: "Open now", text: "Aria no longer hides what she feels: she teases, and says so when she is glad.", basis: "tsundere, denies her feelings", who: "" }));
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

describe("the hand button: Update from the story (#396)", () => {
  /** Plays the engine: the first pass asks the model, the second reads what `answer` gave. */
  function update(body: Json, answer: Json | null = { text: "{}" }) {
    results = {};
    requests = [];
    const first = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: {} } as never, host() as never) as { json?: Json; status?: number; __llmPending?: boolean; stash?: Json };
    if (!first.__llmPending) return { first, asked: requests, done: first };
    const asked = requests;
    results = answer ? { growth_update: answer } : {};
    const done = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: first.stash } as never, host() as never) as { json?: Json; status?: number };
    return { first, asked, done };
  }
  const answerWith = (blocks: Json[]) => ({ text: "Here you go:\n" + JSON.stringify({ blocks }) });

  it("asks the model once with the card, what is written and the story, then stores up to four proposals", () => {
    const four = Array.from({ length: 6 }, (_, i) => ({ section: "behaviors", kind: "added", title: "Habit " + i, text: "She keeps one thing " + i + ".", basis: "" }));
    const r = update({ cardId: "aria", chatId: "c1" }, answerWith(four));
    expect(r.asked.length).toBe(1);
    const prompt = r.asked[0][1].messages[0].content as string;
    expect(prompt).toContain("A tsundere.");
    expect(prompt).toContain("I stay by the fire.");
    expect(prompt).toContain("(nothing yet)");
    expect(r.done.json!.added).toBe(4);
    const g = growthOf();
    expect(g.entries.length).toBe(4);
    expect(g.entries.every((e: Json) => e.state === "proposed" && e.agent === "hand" && e.from.chatId === "c1")).toBe(true);
  });

  it("nothing reaches the prompt before the user accepts", () => {
    update({ cardId: "aria", chatId: "c1" }, answerWith([{ section: "personality", kind: "changed", text: "She no longer hides her warmth.", basis: "tsundere" }]));
    const out = reply(PROMPT());
    expect(JSON.stringify(out)).not.toContain("no longer hides");
  });

  it("a block about an accepted section is a revision, a repeated text is not added twice", () => {
    put({ op: "add", section: "personality", kind: "changed", text: "Cold and proud." });
    const r = update({ cardId: "aria", chatId: "c1" }, answerWith([{ section: "personality", kind: "changed", text: "Warm in private." }, { section: "personality", kind: "changed", text: "cold and proud." }]));
    expect(r.done.json!.added).toBe(1);
    const e = growthOf().entries.find((x: Json) => x.agent === "hand");
    expect(e.revises).toBeTruthy();
    expect(r.done.json!.refused.join(" ")).toContain("already there");
  });

  it("a model that sends no JSON, or no answer, stores nothing and says so", () => {
    expect(update({ cardId: "aria", chatId: "c1" }, { text: "I could not tell." }).done.json!.added).toBe(0);
    const none = update({ cardId: "aria", chatId: "c1" }, { error: "boom" });
    expect(none.done.status).toBe(502);
    expect(exists("characters/aria/growth.json")).toBe(false);
  });

  it("refuses a missing card, a missing chat, a chat of another card and an empty chat", () => {
    expect(update({ cardId: "nope", chatId: "c1" }).first.status).toBe(400);
    expect(update({ cardId: "aria", chatId: "zzz" }).first.status).toBe(404);
    makeChat("c2", CHAT, { characterId: "bob" });
    expect(update({ cardId: "aria", chatId: "c2" }).first.status).toBe(400);
    makeChat("c3", []);
    fs.writeFileSync(path.join(root, "chats", "c3.jsonl"), "");
    expect(update({ cardId: "aria", chatId: "c3" }).first.status).toBe(400);
  });

  it("parseGrowthBlocks keeps four at most and drops empty ones", () => {
    expect(plugin.parseGrowthBlocks("no json")).toEqual([]);
    expect(plugin.parseGrowthBlocks('{"blocks":[{"text":""},{"text":"a"},{"text":"b"},{"text":"c"},{"text":"d"},{"text":"e"}]}').length).toBe(4);
  });
});

describe("the stronger override: remind near the newest message (#396)", () => {
  const blocks = () => {
    put({ op: "add", section: "personality", kind: "changed", text: "She has stopped hiding her warmth." });
    put({ op: "add", section: "relationships", kind: "changed", text: "She trusts Taras with her back." });
    put({ op: "add", section: "goals", kind: "added", title: "A quiet wish", text: "She wants the keep to feel like home." });
  };
  const lastUser = (r: Json | null) => { const m = (r!.messages as Json[]); return m[m.length - 1].content as string; };

  it("is off by default: the last message is untouched", () => {
    blocks();
    expect(lastUser(reply(PROMPT()))).toBe("Go on.");
  });

  it("when on, repeats the two newest blocks at the end, in the last user message, and says it in the prompt sources", () => {
    blocks();
    expect(put({ op: "inject", remind: true }).growth.inject.remind).toBe(true);
    const r = reply(PROMPT());
    const end = lastUser(r);
    expect(end.startsWith("Go on.")).toBe(true);
    expect(end).toContain("Reminder");
    expect(end).toContain("She wants the keep to feel like home.");
    expect(end).toContain("She trusts Taras with her back.");
    expect(end).not.toContain("stopped hiding");
    expect((r!.promptSources as Json).parts.map((p: Json) => p.label)).toContain("Agents · character growth (reminder)");
  });

  it("is counted in the ceiling, and is off when the portrait is off", () => {
    blocks();
    const before = (plugin.insertCeiling({ chatId: "c1" } as never, host() as never) as Json).ceilings[0].tokens;
    put({ op: "inject", remind: true });
    const after = (plugin.insertCeiling({ chatId: "c1" } as never, host() as never) as Json).ceilings[0].tokens;
    expect(after).toBeGreaterThan(before);
    put({ op: "inject", enabled: false });
    expect(lastUser(reply(PROMPT()) ?? { messages: PROMPT() })).toBe("Go on.");
  });
});

describe("the portrait in a group chat (#396)", () => {
  const give = (card: string, text: string, extra: Json = {}) => j("/agents/growth", "PUT", { cardId: card, op: "add", section: "personality", kind: "changed", text, ...extra });
  const sys = (r: Json | null) => ((r ? (r.messages as Json[]) : []).filter((m) => m.role === "system").map((m) => m.content).join("\n"));
  const groupReply = (speakerId: string, chatId = "g1") => plugin.llmRequest({ key: "reply", request: { sessionId: chatId, messages: PROMPT() }, turn: { op: "send", chatId, speakerId } } as never, host() as never) as Json | null;

  beforeEach(() => { makeGroup("grp", ["aria", "bob"], "narrator"); makeChat("g1", CHAT, { groupId: "grp", characterId: "grp" }); });

  it("a narrator group carries every member's portrait, each under the member's name", () => {
    give("aria", "Aria now trusts the keep.");
    give("bob", "Bob has stopped lying.");
    const t = sys(groupReply("grp"));
    expect(t).toContain("How Aria has changed");
    expect(t).toContain("Aria now trusts the keep.");
    expect(t).toContain("How Bob has changed");
    expect(t).toContain("Bob has stopped lying.");
  });

  it("the members share ONE room: the biggest of theirs, member by member, newest first", () => {
    give("aria", "A ".repeat(200).trim());
    give("bob", "B ".repeat(200).trim());
    j("/agents/growth", "PUT", { cardId: "aria", op: "inject", maxTokens: 300 });
    j("/agents/growth", "PUT", { cardId: "bob", op: "inject", maxTokens: 300 });
    const r = groupReply("grp");
    const used = Math.ceil(sys(r).length / 3.5);
    expect(sys(r)).toContain("Aria");
    expect(used).toBeLessThanOrEqual(300 + 60);
    // together they would have been about twice that
    j("/agents/growth", "PUT", { cardId: "aria", op: "inject", maxTokens: 8000 });
    j("/agents/growth", "PUT", { cardId: "bob", op: "inject", maxTokens: 8000 });
    expect(Math.ceil(sys(groupReply("grp")).length / 3.5)).toBeGreaterThan(used);
  });

  it("in 'swap' only the speaker's portrait goes in, and none when no member speaks", () => {
    makeGroup("grp", ["aria", "bob"], "swap");
    give("aria", "Aria now trusts the keep.");
    give("bob", "Bob has stopped lying.");
    const t = sys(groupReply("bob"));
    expect(t).toContain("Bob has stopped lying.");
    expect(t).not.toContain("Aria now trusts");
    expect(sys(groupReply("grp"))).not.toContain("trusts the keep");
  });

  it("a chat's own Turns setting wins over the group's", () => {
    give("aria", "Aria now trusts the keep.");
    makeChat("g2", CHAT, { groupId: "grp", characterId: "grp", turns: { generationMode: "swap" } });
    expect(sys(groupReply("bob", "g2"))).not.toContain("trusts the keep");
    expect(sys(groupReply("aria", "g2"))).toContain("trusts the keep");
  });

  it("the history budget counts every member for a narrator group, and the biggest one for swap", () => {
    give("aria", "A ".repeat(300).trim());
    give("bob", "B ".repeat(300).trim());
    const ceil = () => (plugin.insertCeiling({ chatId: "g1" } as never, host() as never) as Json).ceilings[0].tokens;
    const narrator = ceil();
    makeGroup("grp", ["aria", "bob"], "swap");
    const swap = ceil();
    expect(narrator).toBeGreaterThan(swap);
    expect(swap).toBeGreaterThan(0);
  });

  it("an agent's block names the member in 'who' and lands in that member's file", () => {
    const f = (who: string) => {
      const file = growerFile("grower2");
      file.nodes.push({ id: "who", type: "text.template", x: 0, y: 300, title: "Who", params: { text: who } });
      file.edges.push({ id: "w", from: "who:text", to: "grow:who" });
      return compileAgent(file as never).file;
    };
    j("/agents/install", "PUT", { file: f("bob"), grant: true });
    useAgent("grower2");
    expect(run("g1").ran[0].status).toBe("ok");
    expect(exists("characters/aria/growth.json")).toBe(false);
    const g = disk("characters/bob/growth.json");
    expect(g.entries.length).toBe(1);
    expect(g.entries[0].state).toBe("proposed");
  });

  it("the hand button works from a group chat the card is in, and writes into that card only", () => {
    results = {};
    requests = [];
    const body = { cardId: "aria", chatId: "g1" };
    const first = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: {} } as never, host() as never) as { __llmPending?: boolean; stash?: Json; status?: number };
    expect(first.__llmPending).toBe(true);
    expect(requests[0][1].messages[0].content).toContain("write only about Aria");
    results = { growth_update: { text: JSON.stringify({ blocks: [{ section: "goals", kind: "added", title: "Home", text: "She wants the keep to feel like home." }] }) } };
    const done = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: first.stash } as never, host() as never) as { json?: Json };
    expect(done.json!.added).toBe(1);
    expect(exists("characters/bob/growth.json")).toBe(false);
    expect(disk("characters/aria/growth.json").entries[0].text).toContain("feel like home");
  });

  it("the hand button refuses a group chat the card is not in", () => {
    makeGroup("other", ["bob"], "swap");
    makeChat("g3", CHAT, { groupId: "other", characterId: "other" });
    const r = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body: { cardId: "aria", chatId: "g3" }, stash: {} } as never, host() as never) as { status?: number };
    expect(r.status).toBe(400);
  });
});
