/**
 * The card's long memory (memory bridge, #102): characters/<id>/memory.json, the import of a chat
 * (preview and write). Since #492 the card's saved stories are no longer sent in a prompt or reported as carried; the file
 * (and the kept habits in it) stay.
 */
import fs from "node:fs";
import { describe, expect, it } from "bun:test";
import { L, abs, exists, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const fact = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, text, subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", updatedAt: Number(id.slice(1)), ...extra });

function seedCard(id = "aria", name = "Aria") {
  writeJson(`characters/${id}/card.json`, { spec: "chara_card_v2", name, description: "A quiet courier.", extensions: {} });
}

/** The chat "winter" of the card, with Litopys facts, an arc, a Dashboard note and a said line of Aria's. */
function seedWinter() {
  seedCard();
  writeChat("winter", story(8), { title: "Winter watch", characterId: "aria" });
  writeJson("litopys/chats/winter.json", {
    ...L.emptyChat("winter"),
    migrated: true,
    arcs: [{ id: "a1", chapterIds: [], from: "m1", to: "m8", label: "Winter", text: "Aria guarded the northern gate through the long winter and lost her brother there.", at: 1 }],
    facts: [
      fact("f1", "Aria lost her brother at the northern gate.", { weight: "key" }),
      fact("f2", "Aria carries a brass key on a cord.", { weight: "important" }),
      fact("f3", "Only Bram knows the vault code.", { knownBy: ["Bram"] }),
      fact("f4", "A retired fact.", { status: "retired" }),
    ],
  });
  const key = (id: string) => `${id}#0`;
  writeJson("dashboard/state/winter.json", {
    v: 2,
    chatId: "winter",
    snapshots: {},
    notebook: { Aria: [{ id: "n1", text: "The courier trusts nobody with the key.", how: "saw", turn: 5, weight: "important", src: key("m6") }, { id: "n2", text: "Stranger note.", how: "saw", turn: 4, src: key("m6") }], Bram: [{ id: "n3", text: "Bram saw the gate fall.", how: "saw", turn: 3, src: key("m6") }] },
    said: { Aria: [{ id: "s1", text: "I will not leave the gate.", kind: "vow", turn: 6, src: key("m6"), source: "chat" }] },
  });
}

describe("card memory: import", () => {
  it("previews what a chat would give: top picks checked, the character's own notes and said only", () => {
    seedWinter();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/card-memory/preview", { cardId: "aria", chatId: "winter" });
    expect(r.status).toBe(200);
    const p = r.json;
    expect(p.chat).toEqual({ id: "winter", title: "Winter watch" });
    expect(p.arc.text).toContain("northern gate");
    // retired and privately known facts are not offered
    expect(p.facts.map((f: any) => f.id)).toEqual(["f1", "f2"]);
    expect(p.facts.every((f: any) => f.checked)).toBe(true);
    expect(p.notes.map((n: any) => n.id)).toEqual(["n1", "n2"]);
    expect(p.said.map((s: any) => s.id)).toEqual(["s1"]);
  });

  it("writes a source with a copy of the chat's title, and a second import refreshes it", () => {
    seedWinter();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"], notes: ["n1"], said: ["s1"] });
    expect(r.status).toBe(200);
    const file = readJson("characters/aria/memory.json");
    expect(file.sources).toHaveLength(1);
    expect(file.sources[0]).toMatchObject({ id: "s1", chatId: "winter", title: "Winter watch", on: true, canon: "main" });
    expect(file.sources[0].facts.map((f: any) => f.text)).toEqual(["Aria lost her brother at the northern gate."]);
    expect(file.sources[0].arc).toContain("northern gate");
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", arc: false, facts: ["f2"] });
    const again = readJson("characters/aria/memory.json");
    expect(again.sources).toHaveLength(1);
    expect(again.sources[0].facts.map((f: any) => f.text)).toEqual(["Aria carries a brass key on a cord."]);
    expect(again.sources[0].arc).toBe("");
    expect(route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", arc: false }).status).toBe(400);
  });

  it("marks what another imported story already holds, and does not check it", () => {
    seedWinter();
    seedCard("aria");
    writeChat("spring", story(4), { title: "Spring market", characterId: "aria" });
    writeJson("litopys/chats/spring.json", { ...L.emptyChat("spring"), migrated: true, facts: [fact("f1", "Aria lost her brother at the northern gate!", { weight: "key" }), fact("f2", "Aria sells honey at the market.")] });
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    const p = route(host, "POST", "/litopys/card-memory/preview", { cardId: "aria", chatId: "spring" }).json;
    const copy = p.facts.find((f: any) => f.id === "f1");
    expect(copy).toMatchObject({ dup: "memory", checked: false });
    expect(p.facts.find((f: any) => f.id === "f2")).toMatchObject({ dup: null, checked: true });
  });

  it("lists the card's chats with which are in memory; switches and removes a source; refuses a missing card", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    let v = route(host, "GET", "/litopys/card-memory", undefined, { cardId: "aria" }).json;
    expect(v.chats).toEqual([expect.objectContaining({ id: "winter", imported: "s1" })]);
    expect(v.tokens).toBeGreaterThan(0);
    v = route(host, "PUT", "/litopys/card-memory", { cardId: "aria", source: { id: "s1", on: false }, inject: { maxTokens: 9000 } }).json;
    expect(v.memory.sources[0].on).toBe(false);
    expect(v.memory.inject.maxTokens).toBe(1500);
    expect(v.tokens).toBe(0);
    v = route(host, "DELETE", "/litopys/card-memory", undefined, { cardId: "aria", sourceId: "s1" }).json;
    expect(v.memory.sources).toEqual([]);
    expect(route(host, "GET", "/litopys/card-memory", undefined, { cardId: "nobody" }).status).toBe(404);
    expect(route(host, "GET", "/litopys/card-memory", undefined, { cardId: "../x" }).status).toBe(404);
  });
});

const ctx = (chatId: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName },
});
const textOf = (res: any) => (res?.messages ?? []).map((m: any) => m.content).join("\n");

describe("card stories are not sent any more (#492)", () => {
  it("a story saved on the card stays in its file but goes into no prompt, and nothing is reserved for it", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"], notes: ["n1"], said: ["s1"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const res = L.llmRequest(ctx("next"), host);
    expect(textOf(res)).not.toContain("character memory");
    expect(textOf(res)).not.toContain("northern gate");
    expect(res?.promptSources?.parts?.map((p: any) => p.label) ?? []).not.toContain("Litopys · character memory");
    expect(exists("litopys/insert/next.json") ? readJson("litopys/insert/next.json").cardMemory : undefined).toBeUndefined();
    // the data is not touched
    expect(readJson("characters/aria/memory.json").sources).toHaveLength(1);
  });

  it("a chat that continues the story still gets it from Litopys, once", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "next", from: "winter" });
    const text = textOf(L.llmRequest(ctx("next"), host));
    expect(text).toContain("[Backstory (Litopys)");
    expect(text).not.toContain("character memory");
    expect(text.split("lost her brother").length - 1).toBe(1);
  });

  it("the card's kept habits still go in: they live in the same file but are not stories", () => {
    seedWinter();
    writeJson("characters/aria/memory.json", {
      v: 3, sources: [], inject: { enabled: true, maxTokens: 800, habitsMaxTokens: 250 }, nextSource: 1, nextHabit: 1,
      habits: [{ id: "k1", name: "Answers threats with silence", rule: "When someone threatens her, she says nothing and keeps working.", when: "a threat", on: true, state: "accepted", origin: "user", at: 1 }],
    });
    const { host } = mockHost();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    expect(textOf(L.llmRequest(ctx("next"), host))).toContain("keeps working");
  });
});

describe("card memory: lines of a story can be read, edited, removed and added by hand", () => {
  it("edits, removes and adds lines of a story, also when its chat is gone", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"], notes: ["n1"], said: ["s1"] });
    for (const f of ["chats/winter.meta.json", "chats/winter.jsonl", "litopys/chats/winter.json", "dashboard/state/winter.json"]) fs.rmSync(abs(f), { force: true });
    const put = (line: any) => route(host, "PUT", "/litopys/card-memory", { cardId: "aria", source: { id: "s1", line } });
    let v = put({ list: "facts", index: 0, text: "Aria lost her younger brother at the gate." }).json;
    expect(v.memory.sources[0].facts[0].text).toBe("Aria lost her younger brother at the gate.");
    v = put({ list: "facts", index: 1, remove: true }).json;
    expect(v.memory.sources[0].facts).toHaveLength(1);
    v = put({ list: "facts", add: true, text: "Aria hates crowded rooms.", subject: "Aria" }).json;
    expect(v.memory.sources[0].facts.map((f: any) => f.text)).toEqual(["Aria lost her younger brother at the gate.", "Aria hates crowded rooms."]);
    v = put({ list: "said", add: true, text: "I will come back for you.", who: "Aria", kind: "promise" }).json;
    expect(v.memory.sources[0].said.at(-1)).toMatchObject({ kind: "promise", who: "Aria" });
    v = put({ list: "arc", text: "A shorter summary." }).json;
    expect(v.memory.sources[0].arc).toBe("A shorter summary.");
    expect(put({ list: "facts", index: 9, remove: true }).status).toBe(400);
    expect(put({ list: "facts", index: 0, text: "" }).status).toBe(400);
    expect(put({ list: "nope", add: true, text: "x" }).status).toBe(400);
  });
});

describe("what a chat carries (the strip under the chat header, #107)", () => {
  it("reports the backstory and the chat's switches, with the exact texts, and no card memory", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"], said: ["s1"] });
    // a second story of the card, told in a chat that the new chat continues
    writeChat("spring", story(4, "p"), { title: "Spring market", characterId: "aria" });
    writeJson("litopys/chats/spring.json", { ...L.emptyChat("spring"), migrated: true, facts: [fact("f1", "Aria sells honey at the market.")], chapters: [{ id: "c1", from: "p1", to: "p4", count: 4, kind: "scene", text: "Aria sold honey.", label: "Honey", at: 1 }] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", promptBoard: { v: 1, off: ["plugin:said"] } });
    route(host, "POST", "/litopys/links", { chatId: "next", from: "spring" });
    const r = route(host, "GET", "/litopys/carries", undefined, { chatId: "next", speaker: "Aria" });
    expect(r.status).toBe(200);
    expect(r.json.off).toEqual(["plugin:said"]);
    expect(r.json.cardMemory).toBeUndefined();
    expect(r.json.backstory).toMatchObject({ from: "spring", title: "Spring market" });
    expect(r.json.backstory.text).toContain("Aria sold honey.");
    expect(route(host, "GET", "/litopys/carries", undefined, { chatId: "nope" }).status).toBe(404);
    // a chat with nothing to carry reports nulls
    writeChat("plain", story(2, "y"), { title: "Plain", characterId: "nobody" });
    const plain = route(host, "GET", "/litopys/carries", undefined, { chatId: "plain" }).json;
    expect(plain.backstory).toBeNull();
  });
});

describe("what a chat carries: the World DM", () => {
  it("reports the DM's level and the event waiting for the next reply; nothing when it is off", () => {
    seedWinter();
    const { host } = mockHost();
    writeChat("dm", story(2, "d"), { title: "DM", characterId: "aria" });
    expect(route(host, "GET", "/litopys/carries", undefined, { chatId: "dm" }).json.world).toBeNull();
    writeJson("world/state/dm.json", { v: 1, settings: { level: "director", insert: true }, event: { text: "A bell rings at the northern gate.", hard: false, sent: 0, retried: false, at: 1 } });
    let w = route(host, "GET", "/litopys/carries", undefined, { chatId: "dm" }).json.world;
    expect(w).toMatchObject({ level: "director", waiting: true, text: "A bell rings at the northern gate." });
    expect(w.tokens).toBeGreaterThan(0);
    writeJson("world/state/dm.json", { v: 1, settings: { level: "director", insert: true }, event: { text: "A bell rings.", sent: 1 } });
    w = route(host, "GET", "/litopys/carries", undefined, { chatId: "dm" }).json.world;
    expect(w).toMatchObject({ level: "director", waiting: false, tokens: 0 });
    writeJson("world/state/dm.json", { v: 1, settings: { level: "chronicler" }, event: null });
    expect(route(host, "GET", "/litopys/carries", undefined, { chatId: "dm" }).json.world).toMatchObject({ level: "chronicler", waiting: false });
  });
});

describe("the memory parts say what they are for (#110)", () => {
  it("the backstory says the chat continues the story and the characters remember it", () => {
    seedWinter();
    const { host } = mockHost();
    writeChat("cont", story(2, "y"), { title: "Cont", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "cont", from: "winter" });
    const text = textOf(L.llmRequest(ctx("cont"), host));
    expect(text).toContain("This chat CONTINUES that story. The characters remember it");
    expect(text).toContain("The opening messages of this chat may read like a first meeting");
  });
});

describe("the memory wording is editable (#113)", () => {
  const put = (host: any, body: Record<string, unknown>) => route(host, "PUT", "/litopys/config", body);

  it("the shipped wording is the default, and changing none of it marks nothing as custom", () => {
    const { host } = mockHost();
    const cfg = route(host, "GET", "/litopys/config").json;
    expect(cfg.remembers).toBe(L.REMEMBERS);
    expect(cfg.continues).toBe(L.CONTINUES);
    expect(cfg.custom).toEqual([]);
  });

  it("a changed sentence reaches the backstory and the story record, and only there", () => {
    seedWinter();
    const { host } = mockHost();
    writeChat("cont", story(2, "y"), { title: "Cont", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "cont", from: "winter" });
    const r = put(host, { continues: "Pick up where it ended.", remembers: "It happened; answer from it." });
    expect(r.json.custom).toEqual(["remembers", "continues"]);
    const cont = textOf(L.llmRequest(ctx("cont"), host));
    expect(cont).toContain("from the chat \"Winter watch\". Pick up where it ended.]");
    expect(cont).not.toContain("This chat CONTINUES that story");
    const own = textOf(L.llmRequest(ctx("winter", "Aria"), host));
    expect(own).toContain("[Story record (Litopys): what stays true. It happened; answer from it.]");
  });

  it("restoring one sentence brings the default back; an empty one counts as the default", () => {
    const { host } = mockHost();
    put(host, { continues: "Mine.", remembers: "Mine too." });
    const one = route(host, "DELETE", "/litopys/config/prompts", undefined, { key: "continues" }).json;
    expect(one.continues).toBe(L.CONTINUES);
    expect(one.custom).toEqual(["remembers"]);
    expect(put(host, { remembers: "  " }).json.remembers).toBe(L.REMEMBERS);
  });
});

describe("a continued chat that still opens with the card greeting (#113)", () => {
  const greet = (id: string, extra: Record<string, unknown> = {}) => ({ ...story(1, id)[0], id: `${id}1`, role: "char", greeting: true, ...extra });
  const opening = (host: any, chatId: string) => route(host, "GET", "/litopys/carries", undefined, { chatId }).json.opening;

  it("is reported for a linked chat whose first message is an unedited greeting", () => {
    seedWinter();
    const { host } = mockHost();
    writeChat("cont", [greet("c"), ...story(2, "d")], { title: "Cont", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "cont", from: "winter" });
    expect(opening(host, "cont")).toEqual({ messageId: "c1", title: "Winter watch" });
  });

  it("is not reported without a link, after the greeting was edited or replaced, or once the chat has moved on", () => {
    seedWinter();
    const { host } = mockHost();
    writeChat("plain", [greet("p")], { title: "Plain", characterId: "aria" });
    expect(opening(host, "plain")).toBeNull();
    writeChat("edited", [greet("e", { edited: true })], { title: "Edited", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "edited", from: "winter" });
    expect(opening(host, "edited")).toBeNull();
    writeChat("own", story(2, "o"), { title: "Own", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "own", from: "winter" });
    expect(opening(host, "own")).toBeNull();
    writeChat("long", [greet("l"), ...story(4, "k")], { title: "Long", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "long", from: "winter" });
    expect(opening(host, "long")).toBeNull();
  });
});
