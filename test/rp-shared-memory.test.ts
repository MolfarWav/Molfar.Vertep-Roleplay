/**
 * A persona's and a saved world's long memory (issue #99): memory/personas/<id>.json and memory/worlds/<id>.json,
 * the same import and the same rules as the card's. A chat takes them in on its own (meta.memory.persona / .world):
 * off until then. No line reaches the model twice, and a deleted chat, persona or world breaks nothing.
 */
import fs from "node:fs";
import { describe, expect, it } from "bun:test";
import { L, abs, exists, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const fact = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, text, subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", updatedAt: Number(id.slice(1)), ...extra });
const WORLD = "w-ember1";

function seedOwners() {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  writeJson("personas/pers_jude.json", { id: "pers_jude", name: "Jude", description: "A tall ferryman with a limp." });
  writeJson(`world/library/${WORLD}.json`, { v: 1, id: WORLD, name: "Emberfall", description: "A kingdom under a red sky." });
}

/** The chat "winter": played with the persona Jude, started in the world Emberfall. */
function seedWinter() {
  seedOwners();
  writeChat("winter", story(8), { title: "Winter watch", characterId: "aria", personaId: "pers_jude", userName: "Jude" });
  writeJson(`world/state/winter.json`, { v: 1, chatId: "winter", origin: { kind: "library", worldId: WORLD, name: "Emberfall" } });
  writeJson("litopys/chats/winter.json", {
    ...L.emptyChat("winter"),
    migrated: true,
    arcs: [{ id: "a1", chapterIds: [], from: "m1", to: "m8", label: "Winter", text: "Jude ferried Aria across the frozen river and lost his boat in the thaw.", at: 1 }],
    facts: [
      fact("f1", "Jude lost his boat in the thaw.", { subject: "Jude", weight: "key" }),
      fact("f2", "Aria trusts the ferryman Jude with her brass key.", { subject: "Aria", weight: "important" }),
      fact("f3", "The river of Emberfall freezes once in ten years.", { subject: "world", type: "world", weight: "important" }),
      fact("f4", "The bell of the northern gate rings at dusk.", { subject: "world", type: "world" }),
      fact("f5", "Aria carries a brass key on a cord.", { subject: "Aria" }),
      fact("f6", "Jude's secret only Bram knows.", { subject: "Jude", knownBy: ["Bram"] }),
      fact("f7", "A retired fact about Jude.", { subject: "Jude", status: "retired" }),
    ],
  });
}

const ctx = (chatId: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName },
});
const textOf = (res: any) => (res ? res.messages.map((m: any) => m.content).join("\n") : "");
const memoryParts = (res: any) => (res && res.promptSources ? res.promptSources.parts.map((p: any) => p.label) : []);

describe("persona memory: import", () => {
  it("offers the facts about the persona (its subject or its name in the text) and none of the rest", () => {
    seedWinter();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/memory/preview", { kind: "persona", id: "pers_jude", chatId: "winter" });
    expect(r.status).toBe(200);
    expect(r.json.kind).toBe("persona");
    expect(r.json.arc.text).toContain("ferried Aria");
    // f1 (subject Jude), f2 (names Jude in its text); not the world facts, the private one, the retired one or an unrelated fact
    expect(r.json.facts.map((f: any) => f.id)).toEqual(["f1", "f2"]);
    expect(r.json.notes).toEqual([]);
    expect(r.json.said).toEqual([]);
    expect(r.json.habits).toEqual([]);
  });

  it("writes memory/personas/<id>.json with a copy of the chat's title, not characters/ or the persona file", () => {
    seedWinter();
    const { host } = mockHost();
    const before = fs.readFileSync(abs("personas/pers_jude.json"), "utf8");
    const r = route(host, "POST", "/litopys/memory/import", { kind: "persona", id: "pers_jude", chatId: "winter", facts: ["f1"] });
    expect(r.status).toBe(200);
    const file = readJson("memory/personas/pers_jude.json");
    expect(file.sources[0]).toMatchObject({ id: "s1", chatId: "winter", title: "Winter watch", on: true });
    expect(file.sources[0].facts).toEqual([{ text: "Jude lost his boat in the thaw.", subject: "Jude" }]);
    expect(file.inject.maxTokens).toBe(300);
    expect(fs.readFileSync(abs("personas/pers_jude.json"), "utf8")).toBe(before);
    expect(exists("characters/aria/memory.json")).toBe(false);
    // the persona list reads personas/*.json: the memory must not sit there
    expect(fs.readdirSync(abs("personas"))).toEqual(["pers_jude.json"]);
  });

  it("does not offer a fact the persona's memory holds from another chat, and refuses an unknown owner", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/memory/import", { kind: "persona", id: "pers_jude", chatId: "winter", facts: ["f1"] });
    writeChat("spring", story(4, "s"), { title: "Spring", characterId: "aria", personaId: "pers_jude", userName: "Jude" });
    writeJson("litopys/chats/spring.json", { ...L.emptyChat("spring"), migrated: true, facts: [fact("f1", "Jude lost his boat in the thaw!", { subject: "Jude" }), fact("f2", "Jude mends nets for the harbour.", { subject: "Jude" })] });
    const p = route(host, "POST", "/litopys/memory/preview", { kind: "persona", id: "pers_jude", chatId: "spring" }).json;
    expect(p.facts.map((f: any) => [f.id, f.dup, f.checked])).toEqual([["f2", null, true], ["f1", "memory", false]]);
    expect(route(host, "POST", "/litopys/memory/preview", { kind: "persona", id: "nobody", chatId: "winter" }).status).toBe(404);
    expect(route(host, "POST", "/litopys/memory/preview", { kind: "persona", id: "../x", chatId: "winter" }).status).toBe(404);
  });

  it("lists as importable the chats played with this persona (its own pick or the app's)", () => {
    seedWinter();
    writeJson("settings.json", { personaId: "pers_jude" });
    writeChat("plain", story(2, "p"), { title: "App default persona", characterId: "aria" });
    writeChat("other", story(2, "o"), { title: "Someone else", characterId: "aria", personaId: "pers_other" });
    const { host } = mockHost();
    const v = route(host, "GET", "/litopys/memory", undefined, { kind: "persona", id: "pers_jude" }).json;
    expect(v.chats.map((c: any) => c.id).sort()).toEqual(["plain", "winter"]);
  });
});

describe("world memory: import", () => {
  it("offers the facts about the world itself and the chat's story", () => {
    seedWinter();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/memory/preview", { kind: "world", id: WORLD, chatId: "winter" });
    expect(r.status).toBe(200);
    expect(r.json.facts.map((f: any) => f.id)).toEqual(["f4", "f3"]);
    expect(r.json.arc.text).toContain("frozen river");
  });

  it("writes memory/worlds/<id>.json and lists the chats started in the world", () => {
    seedWinter();
    writeChat("elsewhere", story(2, "e"), { title: "Elsewhere", characterId: "aria" });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/memory/import", { kind: "world", id: WORLD, chatId: "winter", facts: ["f3"], arc: true });
    expect(r.status).toBe(200);
    expect(readJson(`memory/worlds/${WORLD}.json`).sources[0].facts[0].text).toContain("river of Emberfall");
    expect(r.json.chats.map((c: any) => c.id)).toEqual(["winter"]);
    expect(route(host, "POST", "/litopys/memory/import", { kind: "world", id: "w-nope1", chatId: "winter", facts: ["f3"] }).status).toBe(404);
  });

  it("refuses a nothing import and keeps habits to the card", () => {
    seedWinter();
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/memory/import", { kind: "world", id: WORLD, chatId: "winter", facts: [], arc: false }).status).toBe(400);
    route(host, "POST", "/litopys/memory/import", { kind: "world", id: WORLD, chatId: "winter", facts: ["f3"] });
    expect(route(host, "PUT", "/litopys/memory", { kind: "world", id: WORLD, habit: { name: "x", rule: "y" } }).status).toBe(400);
    expect(route(host, "PUT", "/litopys/memory", { kind: "world", id: WORLD, source: { id: "s1", line: { list: "said", add: true, text: "no" } } }).status).toBe(400);
  });
});

describe("persona and world memory: the prompt", () => {
  const importBoth = (host: any) => {
    route(host, "POST", "/litopys/memory/import", { kind: "persona", id: "pers_jude", chatId: "winter", facts: ["f1", "f2"] });
    route(host, "POST", "/litopys/memory/import", { kind: "world", id: WORLD, chatId: "winter", facts: ["f3", "f4"] });
  };

  it("is off for a chat until the chat takes it in", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", userName: "Jude" });
    writeJson(`world/state/next.json`, { v: 1, chatId: "next", origin: { kind: "library", worldId: WORLD } });
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
  });

  it("gives a chat that took them in its own two parts, persona first", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", userName: "Jude", memory: { persona: true, world: true } });
    writeJson(`world/state/next.json`, { v: 1, chatId: "next", origin: { kind: "library", worldId: WORLD } });
    const res = L.llmRequest(ctx("next"), host);
    const text = textOf(res);
    expect(text).toContain("[What Jude (the player's character) has lived through in earlier stories (persona memory):");
    expect(text).toContain("Facts: Jude lost his boat in the thaw.; Aria trusts the ferryman Jude with her brass key.");
    expect(text).toContain("[What happened in Emberfall in earlier stories (world memory):");
    expect(text).toContain("Facts: The bell of the northern gate rings at dusk.; The river of Emberfall freezes once in ten years.");
    expect(memoryParts(res)).toEqual(["Litopys · persona memory", "Litopys · world memory"]);
    expect(text.indexOf("persona memory")).toBeLessThan(text.indexOf("world memory"));
    expect(readJson("litopys/insert/next.json")).toMatchObject({ personaMemory: { personaId: "pers_jude" }, worldMemory: { worldId: WORLD } });
  });

  it("takes in only the one the chat chose, and the Prompt board switch mutes it", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("p", story(2, "x"), { title: "P", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    writeJson(`world/state/p.json`, { v: 1, chatId: "p", origin: { kind: "library", worldId: WORLD } });
    const only = textOf(L.llmRequest(ctx("p"), host));
    expect(only).toContain("persona memory");
    expect(only).not.toContain("world memory");
    writeChat("muted", story(2, "x"), { title: "M", characterId: "aria", personaId: "pers_jude", memory: { persona: true }, promptBoard: { v: 1, off: ["plugin:personamemory"] } });
    expect(L.llmRequest(ctx("muted"), host)).toBeNull();
  });

  it("the world follows the chat's own world, the persona the chat's persona; none, none", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("noworld", story(2, "x"), { title: "NW", characterId: "aria", personaId: "pers_other", memory: { persona: true, world: true } });
    expect(L.llmRequest(ctx("noworld"), host)).toBeNull();
  });

  it("never says a line twice: the chat's own Litopys fact, the card's memory, the persona's own text", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    route(host, "POST", "/litopys/memory/import", { kind: "card", id: "aria", chatId: "winter", facts: ["f2"] });
    writeChat("next", story(6, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", userName: "Jude", memory: { persona: true, world: true } });
    writeJson(`world/state/next.json`, { v: 1, chatId: "next", origin: { kind: "library", worldId: WORLD } });
    // the new chat's own record holds the world fact nearly word for word
    writeJson("litopys/chats/next.json", { ...L.emptyChat("next"), migrated: true, facts: [fact("f9", "The river of Emberfall freezes once in ten years!", { subject: "world", weight: "key", pinned: true })] });
    const text = textOf(L.llmRequest(ctx("next"), host));
    // f2 reaches the model once (the card's block comes first), the world fact once (the chat's own record), the rest survive
    expect(text.split("trusts the ferryman Jude").length - 1).toBe(1);
    expect(text.split("river of Emberfall freezes").length - 1).toBe(1);
    expect(text).toContain("bell of the northern gate");
    expect(text).toContain("lost his boat in the thaw");
    // the persona's own description is not repeated either
    writeJson("personas/pers_jude.json", { id: "pers_jude", name: "Jude", description: "Jude lost his boat in the thaw. A tall ferryman." });
    expect(textOf(L.llmRequest(ctx("next"), host))).not.toContain("Facts: Jude lost his boat");
  });

  it("skips a story that is the chat itself or in its backstory chain", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("winter2", story(2, "w"), { title: "Winter, again", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    route(host, "POST", "/litopys/links", { chatId: "winter2", from: "winter" });
    const text = textOf(L.llmRequest(ctx("winter2"), host));
    expect(text).toContain("[Backstory (Litopys)");
    expect(text).not.toContain("persona memory");
    // the chat the story came from carries it by itself
    writeChat("winter", story(8), { title: "Winter watch", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    expect(textOf(L.llmRequest(ctx("winter"), host))).not.toContain("persona memory");
  });

  it("keeps to its budget, and the text does not change between replies (prompt cache)", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    route(host, "PUT", "/litopys/memory", { kind: "persona", id: "pers_jude", inject: { maxTokens: 100 } });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    const a = textOf(L.llmRequest(ctx("next"), host));
    writeChat("next", story(4, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    expect(textOf(L.llmRequest(ctx("next"), host))).toBe(a);
    const v = route(host, "GET", "/litopys/memory", undefined, { kind: "persona", id: "pers_jude" }).json;
    expect(v.tokens).toBeLessThanOrEqual(100);
    expect(v.budget).toBe(100);
  });

  it("a deleted chat, persona or world breaks nothing", () => {
    seedWinter();
    const { host } = mockHost();
    importBoth(host);
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", memory: { persona: true, world: true } });
    writeJson(`world/state/next.json`, { v: 1, chatId: "next", origin: { kind: "library", worldId: WORLD } });
    const before = textOf(L.llmRequest(ctx("next"), host));
    for (const f of ["chats/winter.meta.json", "chats/winter.jsonl", "litopys/chats/winter.json", "world/state/winter.json"]) fs.rmSync(abs(f), { force: true });
    expect(textOf(L.llmRequest(ctx("next"), host))).toBe(before);
    expect(readJson("memory/personas/pers_jude.json").sources[0]).toMatchObject({ chatId: "winter", title: "Winter watch" });
    // the persona and the world go: the chat simply gets nothing, the files stay for a restore
    fs.rmSync(abs("personas/pers_jude.json"));
    fs.rmSync(abs(`world/library/${WORLD}.json`));
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    expect(exists("memory/personas/pers_jude.json")).toBe(true);
    expect(route(host, "GET", "/litopys/memory", undefined, { kind: "persona", id: "pers_jude" }).status).toBe(404);
  });

  it("what the card's own memory does is unchanged: card routes still answer, and the card block does not need the opt-in", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f5"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const res = L.llmRequest(ctx("next"), host);
    expect(memoryParts(res)).toEqual(["Litopys · character memory"]);
    expect(route(host, "GET", "/litopys/card-memory", undefined, { cardId: "aria" }).json.kind).toBe("card");
  });
});

describe("persona and world memory: what the chat carries", () => {
  it("/carries says what the chat could take in, whether it did, and what the block would say", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/memory/import", { kind: "persona", id: "pers_jude", chatId: "winter", facts: ["f1"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude" });
    let c = route(host, "GET", "/litopys/carries", undefined, { chatId: "next" }).json;
    expect(c.personaMemory).toMatchObject({ id: "pers_jude", name: "Jude", taken: false, stories: 1, tokens: 0 });
    expect(c.worldMemory).toBeNull();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", personaId: "pers_jude", memory: { persona: true } });
    c = route(host, "GET", "/litopys/carries", undefined, { chatId: "next" }).json;
    expect(c.personaMemory.taken).toBe(true);
    expect(c.personaMemory.tokens).toBeGreaterThan(0);
    expect(c.personaMemory.text).toContain("persona memory");
  });
});
