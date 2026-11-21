/**
 * Character growth on a card that voices several characters (Molfar.Vertep#450): a narrator card keeps a portrait of EACH character
 * it voices (its souls), a block names the one it is about (`of`), and another character's block is never a revision of it.
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

const narrator = () => {
  fs.mkdirSync(path.join(root, "characters", "narrator"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "narrator", "card.json"), JSON.stringify({
    name: "Narrator", description: "A storyteller.",
    extensions: { molfar_card_type: "narrator", molfar_soul: { v: 1, characters: { Marina: { aliases: ["Марина"] }, Torgrim: {} } } },
  }));
  makeChat("n1", CHAT, { characterId: "narrator" });
};
const growthN = () => disk("characters/narrator/growth.json");
const putN = (body: Json) => j("/agents/growth", "PUT", { cardId: "narrator", ...body });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-growth-cast-"));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ name: "Aria", description: "A tsundere." }));
  makeChat("c1", CHAT);
  narrator();
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

/** Plays the engine for the hand button: the first pass asks the model, the second reads what `answer` gave. */
function update(body: Json, answer: Json = { text: "{}" }) {
  results = {};
  requests = [];
  const first = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: {} } as never, host() as never) as { __llmPending?: boolean; stash?: Json };
  const asked = requests;
  results = { growth_update: answer };
  const done = plugin.handleRoute({ method: "POST", path: "/agents/growth/update", query: {}, body, stash: first.stash } as never, host() as never) as { json?: Json };
  return { asked, done };
}
const blocks = (list: Json[]) => ({ text: JSON.stringify({ blocks: list }) });
const rel = (text: string, who?: string) => ({ section: "relationships", kind: "changed", title: "", text, basis: "", ...(who !== undefined ? { who } : {}) });

describe("who a card voices (#450)", () => {
  it("the Memory tab's answer lists the characters of a narrator card, and none for a card that is one character", () => {
    expect(j("/agents/growth", "GET", undefined, { cardId: "narrator" }).cast).toEqual(["Marina", "Torgrim"]);
    expect(j("/agents/growth", "GET", undefined, { cardId: "aria" }).cast).toBeUndefined();
  });
  it("a card with two souls voices several characters even when it is not marked a narrator; one soul on a plain card does not", () => {
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: {} } } } }));
    expect(j("/agents/growth", "GET", undefined, { cardId: "aria" }).cast).toBeUndefined();
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: {}, Bo: {} } } } }));
    expect(j("/agents/growth", "GET", undefined, { cardId: "aria" }).cast).toEqual(["Aria", "Bo"]);
  });
});

describe("a block names its character (#450)", () => {
  it("the hand button asks about the characters, and stores each block under the name the model gave (an alias counts)", () => {
    const r = update({ cardId: "narrator", chatId: "n1" }, blocks([rel("Marina now trusts the player.", "Marina"), rel("Torgrim lowered his sword.", "Torgrim"), rel("She trusts him more.", "Марина")]));
    expect(growthN().entries.map((e: Json) => e.of)).toEqual(["Marina", "Torgrim", "Marina"]);
    expect(r.done.json!.refused).toEqual([]);
    expect(r.asked[0][1].messages[0].content).toContain("This card voices several characters: Marina, Torgrim.");
    expect(r.asked[0][1].messages[0].content).toContain("the characters voiced by Narrator");
  });

  it("a block with no name takes the one character its text names, and is refused when it names none or two", () => {
    const r = update({ cardId: "narrator", chatId: "n1" }, blocks([rel("Torgrim learns to read."), rel("The world gets colder."), rel("Marina and Torgrim quarrel.")]));
    expect(growthN().entries.map((e: Json) => e.of)).toEqual(["Torgrim"]);
    expect(r.done.json!.refused.length).toBe(2);
    expect(r.done.json!.refused[0]).toContain("voices several characters (Marina, Torgrim)");
  });

  it("an agent's write.growth names the character in who", () => {
    const file = growerFile("grower2");
    file.nodes.push({ id: "who", type: "text.template", x: 0, y: 300, title: "Who", params: { text: "marina" } });
    file.edges.push({ id: "w", from: "who:text", to: "grow:who" });
    j("/agents/install", "PUT", { file: compileAgent(file as never).file, grant: true });
    useAgent("grower2");
    expect(run("n1").ran[0].status).toBe("ok");
    expect(growthN().entries.length).toBe(1);
    expect(growthN().entries[0].of).toBe("Marina");
  });

  it("another character's block is not a revision of Marina's (the old rule keyed on the section alone)", () => {
    putN({ op: "add", section: "relationships", kind: "changed", text: "Marina fears the player.", of: "Marina" });
    update({ cardId: "narrator", chatId: "n1" }, blocks([rel("Torgrim respects the player.", "Torgrim"), rel("Marina begins to trust the player.", "Marina")]));
    const e = growthN().entries;
    const torgrim = e.find((x: Json) => x.of === "Torgrim");
    const marina = e.find((x: Json) => x.of === "Marina" && x.state === "proposed");
    expect(torgrim.revises).toBeUndefined();
    expect(marina.revises).toBe("g1");
  });

  it("a plain card is untouched: who is ignored and the block carries no name", () => {
    update({ cardId: "aria", chatId: "c1" }, blocks([rel("She softens.", "Marina")]));
    const g = growthOf();
    expect(g.entries.length).toBe(1);
    expect(g.entries[0].of).toBeUndefined();
  });
});

describe("the Memory tab's routes (#450)", () => {
  it("add and edit accept one of the card's characters, and refuse another name, or a name on a plain card", () => {
    expect(putN({ op: "add", section: "goals", kind: "added", text: "Marina wants the key.", of: "marina" }).growth.entries[0].of).toBe("Marina");
    expect(call("PUT", "/agents/growth", { cardId: "narrator", op: "add", section: "goals", kind: "added", text: "x", of: "Zed" }).status).toBe(400);
    expect(call("PUT", "/agents/growth", { cardId: "aria", op: "add", section: "goals", kind: "added", text: "x", of: "Marina" }).status).toBe(400);
    expect(putN({ op: "edit", id: "g1", of: "Torgrim" }).growth.entries[0].of).toBe("Torgrim");
    expect(putN({ op: "edit", id: "g1", of: "" }).growth.entries[0].of).toBeUndefined();
  });
});

describe("what the prompt carries (#450)", () => {
  const partOf = (needle: string) => {
    const out = reply(PROMPT(), "n1") as Json;
    return out.messages.map((m: Json) => m.content).find((c: string) => c.includes(needle)) as string;
  };

  it("one heading per character, the card's own older blocks first; the head says whose they are", () => {
    putN({ op: "add", section: "personality", kind: "changed", text: "The narrator grows grim." });
    putN({ op: "add", section: "relationships", kind: "changed", text: "Marina trusts the player.", of: "Marina" });
    putN({ op: "add", section: "goals", kind: "added", title: "The key", text: "Torgrim hunts the key.", of: "Torgrim" });
    const part = partOf("How the characters of Narrator");
    const at = (s: string) => part.indexOf(s);
    expect(at("# Narrator")).toBeGreaterThan(-1);
    expect(at("# Narrator")).toBeLessThan(at("# Marina"));
    expect(at("# Marina")).toBeLessThan(at("# Torgrim"));
    expect(part).toContain("# Marina\n\n## Relationships (now)\nMarina trusts the player.");
    expect(part).toContain("# Torgrim\n\n## The key\nTorgrim hunts the key.");
  });

  it("blocks with no name only: the same words as before", () => {
    putN({ op: "add", section: "personality", kind: "changed", text: "Grim." });
    const part = partOf("has changed and what has come out");
    expect(part).toContain("How Narrator has changed and what has come out over the story so far.");
    expect(part).not.toContain("# Narrator");
  });

  it("the reminder names the character", () => {
    putN({ op: "add", section: "relationships", kind: "changed", text: "Marina trusts the player.", of: "Marina" });
    putN({ op: "inject", remind: true });
    const out = reply(PROMPT(), "n1") as Json;
    const last = out.messages[out.messages.length - 1].content as string;
    expect(last).toContain("- Marina, Relationships (now): Marina trusts the player.");
  });
});
