/**
 * Card habits (#106): short rule blocks for how a character acts, kept in characters/<id>/memory.json next to the
 * stories. The routes that add, change, confirm and remove them, and the prompt block "Litopys · character habits":
 * only the habits that are on and confirmed, once, under their own budget, stable between replies, the speaker's
 * own card in a group, and nothing broken by a deleted chat.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const put = (host: any, habit: Record<string, unknown>, cardId = "aria") => route(host, "PUT", "/litopys/card-memory", { cardId, habit });
const ctx = (chatId: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName },
});
const textOf = (res: any) => res.messages.map((m: any) => m.content).join("\n");

function seedCard(id = "aria", name = "Aria", description = "A quiet courier.") {
  writeJson(`characters/${id}/card.json`, { spec: "chara_card_v2", name, description, extensions: {} });
}
const SILENCE = { name: "Answers threats with silence", rule: "When someone threatens her, she says nothing and keeps working.\nShe never raises her voice.", when: "a threat is spoken" };

describe("card habits: the routes", () => {
  it("adds a habit by hand, changes it, switches it and removes it; the file keeps keys it does not know", () => {
    seedCard();
    writeJson("characters/aria/memory.json", { v: 1, next: 0, sources: [], changes: [{ id: "a1", kind: "scar", text: "Scar on the left palm" }] });
    const { host } = mockHost();
    const added = put(host, SILENCE);
    expect(added.status).toBe(200);
    expect(added.json.memory.habits).toEqual([expect.objectContaining({ id: "k1", name: SILENCE.name, on: true, origin: "user", state: "accepted" })]);
    expect(added.json.habitsTokens).toBeGreaterThan(0);
    expect(added.json.habitsBudget).toBe(250);

    put(host, { id: "k1", rule: "She stays silent and keeps working.", on: false });
    let file = readJson("characters/aria/memory.json");
    expect(file.habits[0]).toMatchObject({ id: "k1", rule: "She stays silent and keeps working.", on: false });
    expect(file.changes).toEqual([{ id: "a1", kind: "scar", text: "Scar on the left palm" }]);

    // an id is not reused while the counter says it was taken
    route(host, "DELETE", "/litopys/card-memory", undefined, { cardId: "aria", habitId: "k1" });
    expect(readJson("characters/aria/memory.json").habits).toEqual([]);
    put(host, { name: "Counts the exits", rule: "On entering a room she notes every door and window." });
    file = readJson("characters/aria/memory.json");
    expect(file.habits.map((k: any) => k.id)).toEqual(["k2"]);
  });

  it("refuses what cannot be a habit: no name or rule, a repeat of a rule, an unknown id, too many", () => {
    seedCard();
    const { host } = mockHost();
    expect(put(host, { name: "Only a name" }).status).toBe(400);
    expect(put(host, { rule: "Only a rule, no name at all." }).status).toBe(400);
    expect(put(host, SILENCE).status).toBe(200);
    expect(put(host, { ...SILENCE, name: "Same rule again" }).status).toBe(400);
    expect(put(host, { id: "k9", on: false }).status).toBe(404);
    expect(put(host, { id: "k1", name: "" }).status).toBe(400);
    expect(route(host, "DELETE", "/litopys/card-memory", undefined, { cardId: "aria", habitId: "k9" }).status).toBe(404);
    const filled = Array.from({ length: 29 }, (_, i) => ({ id: "k" + (i + 2), name: "Habit " + (i + 2), rule: "Rule " + (i + 2) + " is its own habit" }));
    const file = readJson("characters/aria/memory.json");
    writeJson("characters/aria/memory.json", { ...file, habits: [...file.habits, ...filled] });
    expect(put(host, { name: "One more", rule: "A thirty-first rule that goes nowhere." }).status).toBe(400);
  });

  it("keeps a rule to six lines and a name and a when to one short line", () => {
    seedCard();
    const { host } = mockHost();
    const lines = Array.from({ length: 9 }, (_, i) => "Line " + (i + 1) + " of the rule");
    const r = put(host, { name: "N".repeat(200), rule: lines.join("\n"), when: "w".repeat(400) + "\nsecond" });
    const k = r.json.memory.habits[0];
    expect(k.rule.split("\n")).toHaveLength(6);
    expect(k.name.length).toBeLessThanOrEqual(80);
    expect(k.when.length).toBeLessThanOrEqual(160);
    expect(k.when).not.toContain("\n");
  });

  it("a proposal from a story waits: it is stored as proposed with its origin, and only a yes makes it a habit", () => {
    seedCard();
    const { host } = mockHost();
    const r = put(host, { ...SILENCE, state: "proposed", origin: "story", from: { chatId: "winter", title: "Winter watch", at: 5 } });
    expect(r.json.memory.habits[0]).toMatchObject({ state: "proposed", origin: "story", from: { chatId: "winter", title: "Winter watch", at: 5 } });
    // nothing turns an accepted habit back into a proposal
    put(host, { id: "k1", state: "accepted" });
    put(host, { id: "k1", state: "proposed" });
    expect(readJson("characters/aria/memory.json").habits[0].state).toBe("accepted");
  });
});

describe("card habits: the prompt block", () => {
  it("gives a chat of the card its habits as their own part, with no story and no Litopys record needed", () => {
    seedCard();
    const { host } = mockHost();
    put(host, SILENCE);
    put(host, { name: "Counts the exits", rule: "On entering a room she notes every door and window." });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const res = L.llmRequest(ctx("next"), host);
    const text = textOf(res);
    expect(text).toContain("[Character habits: how Aria acts");
    expect(text).toContain("- Answers threats with silence: When someone threatens her, she says nothing and keeps working. She never raises her voice. (When: a threat is spoken)");
    expect(text).toContain("- Counts the exits: On entering a room");
    expect(res.promptSources.parts.map((p: any) => p.label)).toEqual(["Litopys · character habits"]);
    expect(readJson("litopys/insert/next.json").cardHabits).toMatchObject({ cardId: "aria", habits: ["k1", "k2"] });
  });

  it("gives nothing for a proposal, a habit that is off, a chat with the switch off, or a card with no habits", () => {
    seedCard();
    const { host } = mockHost();
    put(host, { ...SILENCE, state: "proposed", origin: "molfar" });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    put(host, { id: "k1", state: "accepted", on: false });
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    put(host, { id: "k1", on: true });
    expect(L.llmRequest(ctx("next"), host)).not.toBeNull();
    writeChat("off", story(2, "y"), { title: "Off", characterId: "aria", promptBoard: { v: 1, off: ["plugin:cardhabits"] } });
    expect(L.llmRequest(ctx("off"), host)).toBeNull();
    seedCard("bram", "Bram");
    writeChat("bram", story(2, "z"), { title: "Bram", characterId: "bram" });
    expect(L.llmRequest(ctx("bram", "Bram"), host)).toBeNull();
  });

  it("is the same text on every reply (the prompt cache holds) and the same after the source chat is gone", () => {
    seedCard();
    const { host } = mockHost();
    put(host, { ...SILENCE, origin: "story", from: { chatId: "winter", title: "Winter watch", at: 5 } });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const a = textOf(L.llmRequest(ctx("next"), host));
    writeChat("next", story(8, "x"), { title: "Next", characterId: "aria" });
    expect(textOf(L.llmRequest(ctx("next"), host))).toBe(a);
    expect(readJson("characters/aria/memory.json").habits[0].from.title).toBe("Winter watch");
  });

  it("keeps to its budget and leaves out a habit that only repeats the card's own text", () => {
    seedCard("aria", "Aria", "She never raises her voice. A quiet courier who answers threats with silence.");
    const { host } = mockHost();
    put(host, { name: "Calm voice", rule: "She never raises her voice." });
    for (let i = 0; i < 6; i++) put(host, { name: "Habit " + i, rule: "A long habit about topic " + i + ", " + "word ".repeat(20) + "number " + i * 31337 });
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const wide = L.cardHabitsFor({ fsx: host.fs, meta: { characterId: "aria" }, speakerName: "Aria", chosen: [] });
    expect(wide.dupes).toBe(1);
    expect(wide.text).not.toContain("Calm voice");
    route(host, "PUT", "/litopys/card-memory", { cardId: "aria", inject: { habitsMaxTokens: 100 } });
    const small = L.cardHabitsFor({ fsx: host.fs, meta: { characterId: "aria" }, speakerName: "Aria", chosen: [] });
    expect(small.tokens).toBeLessThanOrEqual(100);
    expect(small.habits.length).toBeLessThan(wide.habits.length);
  });

  it("in a group only the speaker's own card gives its habits", () => {
    seedCard();
    seedCard("bram", "Bram");
    writeJson("groups/duo.json", { id: "duo", memberIds: ["aria", "bram"] });
    const { host } = mockHost();
    put(host, SILENCE);
    put(host, { name: "Bram's habit", rule: "He hums while he thinks and stops when he lies." }, "bram");
    writeChat("g", story(2, "x"), { title: "Duo", groupId: "duo" });
    expect(textOf(L.llmRequest(ctx("g", "Aria"), host))).toContain("Answers threats with silence");
    expect(textOf(L.llmRequest(ctx("g", "Aria"), host))).not.toContain("hums while he thinks");
    expect(textOf(L.llmRequest(ctx("g", "Bram"), host))).toContain("hums while he thinks");
  });

  it("a fact in the card memory that repeats a habit's rule is left out of the memory block", () => {
    seedCard();
    writeChat("winter", story(8), { title: "Winter watch", characterId: "aria" });
    writeJson("litopys/chats/winter.json", {
      ...L.emptyChat("winter"),
      migrated: true,
      facts: [
        { id: "f1", text: "She says nothing and keeps working when someone threatens her.", subject: "Aria", knownBy: "all", type: "event", weight: "key", pinned: false, status: "active", updatedAt: 1 },
        { id: "f2", text: "Aria carries a brass key on a cord.", subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", updatedAt: 2 },
      ],
    });
    const { host } = mockHost();
    route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", facts: ["f1", "f2"] });
    put(host, SILENCE);
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const text = textOf(L.llmRequest(ctx("next"), host));
    expect(text).toContain("brass key on a cord");
    expect(text.split("says nothing and keeps working").length - 1).toBe(1);
    expect(text).toContain("[Character habits");
  });

  it("the chat's carries report the habits with their tokens and text", () => {
    seedCard();
    const { host } = mockHost();
    put(host, SILENCE);
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const r = route(host, "GET", "/litopys/carries", undefined, { chatId: "next", speaker: "Aria" });
    expect(r.json.cardHabits).toMatchObject({ cardId: "aria", name: "Aria", habits: ["k1"] });
    expect(r.json.cardHabits.tokens).toBeGreaterThan(0);
    expect(r.json.cardMemory).toBeNull();
  });
});
