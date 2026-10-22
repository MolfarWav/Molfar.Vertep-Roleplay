/**
 * The card's long memory (memory bridge, #102): characters/<id>/memory.json, the import of a chat
 * (preview and write), the prompt block, and the rule that no line reaches the model twice (Litopys,
 * its backstory, the Dashboard, the card's own text) and that a deleted chat breaks nothing.
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
const textOf = (res: any) => res.messages.map((m: any) => m.content).join("\n");

describe("card memory: the prompt block", () => {
  it("gives a new chat of the card the arc, facts, notes and said from an imported story, as its own part", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"], notes: ["n1"], said: ["s1"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const res = L.llmRequest(ctx("next"), host);
    const text = textOf(res);
    expect(text).toContain("[What Aria remembers from earlier stories (character memory):");
    expect(text).toContain("Winter watch: Aria guarded the northern gate");
    expect(text).toContain("Facts: Aria lost her brother at the northern gate.; Aria carries a brass key on a cord.");
    expect(text).toContain("Notes: The courier trusts nobody with the key.");
    expect(text).toContain("Said: vow “I will not leave the gate.”");
    expect(res.promptSources.parts.map((p: any) => p.label)).toContain("Litopys · character memory");
    expect(readJson("litopys/insert/next.json").cardMemory).toMatchObject({ cardId: "aria", sources: ["s1"] });
  });

  it("never says a line twice: the chat's own Litopys fact, a near copy, the card's own text and the Dashboard", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"], notes: ["n1"] });
    // the new chat's own record already holds the first fact, nearly word for word, and one that distinguishes nothing
    writeChat("next", story(6, "x"), { title: "Next", characterId: "aria" });
    writeJson("litopys/chats/next.json", { ...L.emptyChat("next"), migrated: true, facts: [fact("f1", "Aria lost her brother at the northern gate!", { weight: "key", pinned: true })] });
    // the Dashboard of the new chat already holds the note
    writeJson("dashboard/state/next.json", { v: 2, chatId: "next", snapshots: {}, notebook: { Aria: [{ id: "n1", text: "The courier trusts nobody with the key.", how: "saw", turn: 2, src: "x4#0" }] } });
    const text = textOf(L.llmRequest(ctx("next"), host));
    expect(text.split("lost her brother at the northern gate").length - 1).toBe(1);
    expect(text).toContain("brass key on a cord");
    // the note is in the Dashboard's part (another plugin): here it must not repeat
    expect(text).not.toContain("Notes: The courier trusts nobody");
    // the card's own description is not repeated either
    const res = route(host, "PUT", "/litopys/card-memory", { cardId: "aria", source: { id: "s1", on: true } });
    expect(res.status).toBe(200);
    writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "Aria carries a brass key on a cord. A quiet courier.", extensions: {} });
    expect(textOf(L.llmRequest(ctx("next"), host))).not.toContain("brass key on a cord.;");
  });

  it("skips a source that is the chat itself or one in its backstory chain, and a story that is still told by Litopys", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    // the chat the source came from asks: it carries its own story, the card adds nothing
    expect(L.llmRequest(ctx("winter"), host)?.messages.some((m: any) => String(m.content).includes("character memory"))).not.toBe(true);
    // a chat that continues it gets the story as Litopys backstory, and the card does not repeat it
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    route(host, "POST", "/litopys/links", { chatId: "next", from: "winter" });
    const text = textOf(L.llmRequest(ctx("next"), host));
    expect(text).toContain("[Backstory (Litopys)");
    expect(text).not.toContain("character memory");
    expect(text.split("lost her brother").length - 1).toBe(1);
  });

  it("a deleted chat breaks nothing: the same block, the source reads as kept", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"], said: ["s1"] });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const before = textOf(L.llmRequest(ctx("next"), host));
    for (const f of ["chats/winter.meta.json", "chats/winter.jsonl", "litopys/chats/winter.json", "dashboard/state/winter.json"]) fs.rmSync(abs(f), { force: true });
    expect(exists("characters/aria/memory.json")).toBe(true);
    expect(textOf(L.llmRequest(ctx("next"), host))).toBe(before);
    const v = route(host, "GET", "/litopys/card-memory", undefined, { cardId: "aria" }).json;
    expect(v.memory.sources[0]).toMatchObject({ chatId: "winter", title: "Winter watch" });
    expect(v.chats.find((c: any) => c.id === "winter")).toBeUndefined();
  });

  it("keeps to its budget, can be switched off for a chat, and a source that is off gives nothing", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"], notes: ["n1"], said: ["s1"] });
    route(host, "PUT", "/litopys/card-memory", { cardId: "aria", inject: { maxTokens: 100 } });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const small = L.cardMemoryFor({ fsx: host.fs, chatId: "next", meta: { characterId: "aria" }, speakerName: "Aria", chosen: [], dash: {}, overlay: null, line: [] });
    expect(small.tokens).toBeLessThanOrEqual(100);
    writeChat("off", story(2, "y"), { title: "Off", characterId: "aria", promptBoard: { v: 1, off: ["plugin:cardmemory"] } });
    expect(L.llmRequest(ctx("off"), host)).toBeNull();
    route(host, "PUT", "/litopys/card-memory", { cardId: "aria", source: { id: "s1", on: false } });
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
  });

  it("a story marked as its own canon is injected only when the chat chooses it", () => {
    seedWinter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    route(host, "PUT", "/litopys/card-memory", { cardId: "aria", source: { id: "s1", canon: "separate" } });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria", memory: { sources: { s1: true } } });
    expect(textOf(L.llmRequest(ctx("next"), host))).toContain("northern gate");
  });

  it("in a group only the speaker's card talks", () => {
    seedWinter();
    seedCard("bram", "Bram");
    writeJson("groups/g1.json", { id: "g1", name: "Duo", memberIds: ["aria", "bram"] });
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1"] });
    writeChat("grp", story(2, "g"), { title: "Group", groupId: "g1" });
    expect(textOf(L.llmRequest(ctx("grp", "Aria"), host))).toContain("northern gate");
    expect(L.llmRequest(ctx("grp", "Bram"), host)).toBeNull();
  });
});
