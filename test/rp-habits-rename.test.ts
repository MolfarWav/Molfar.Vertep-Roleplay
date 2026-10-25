/**
 * Habits were called skills until 4.67.0. Files written before the rename keep working: a card's memory.json,
 * a chat's Litopys record, the Litopys settings and a chat's Prompt board switch are read under their old keys
 * and written back under the new ones. The card-memory route sends a code with each refusal so the app can say it
 * in the user's language.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const put = (host: any, habit: Record<string, unknown>) => route(host, "PUT", "/litopys/card-memory", { cardId: "aria", habit });
const ctx = (chatId: string) => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName: "Aria" },
});
const OLD = { id: "k3", name: "Answers threats with silence", rule: "When someone threatens her, she says nothing and keeps working.", on: true, origin: "user", state: "accepted" };

function seedCard() {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
}

describe("habits: files from before the rename", () => {
  it("a card's old skills, counter and room become habits and are saved under the new keys", () => {
    seedCard();
    writeJson("characters/aria/memory.json", { v: 1, next: 0, sources: [], skills: [OLD], nextSkill: 3, inject: { skillsMaxTokens: 400 } });
    const { host } = mockHost();
    const view = route(host, "GET", "/litopys/card-memory", undefined, { cardId: "aria" });
    expect(view.json.memory.habits).toEqual([expect.objectContaining({ id: "k3", name: OLD.name })]);
    expect(view.json.habitsBudget).toBe(400);
    expect(put(host, { name: "Counts the exits", rule: "On entering a room she notes every door and window." }).status).toBe(200);
    const file = readJson("characters/aria/memory.json");
    expect(file.habits.map((k: any) => k.id)).toEqual(["k3", "k4"]);
    expect(file.nextHabit).toBe(4);
    expect(file.inject.habitsMaxTokens).toBe(400);
    expect("skills" in file || "nextSkill" in file || "skillsMaxTokens" in file.inject).toBe(false);
  });

  it("a chat record's old skills list and counter are read as habits", () => {
    writeJson("litopys/chats/old.json", { v: 2, chatId: "old", chapters: [], facts: [], proposals: [], skills: [{ id: "k2", who: "Aria", name: "n", rule: "r", status: "active" }], counters: { chapter: 1, skill: 2 } });
    const { host } = mockHost();
    const st = L.loadChatFile(host.fs, "old");
    expect(st.habits).toHaveLength(1);
    expect(st.counters.habit).toBe(2);
    expect("skills" in st).toBe(false);
  });

  it("the old Litopys settings are read when the new ones are not there", () => {
    writeJson("litopys/config.json", { skills: false, skillsEarnAfter: 4 });
    const { host } = mockHost();
    expect(L.loadConfig(host.fs)).toMatchObject({ habits: false, habitsEarnAfter: 4 });
  });

  it("a chat whose old switch turned the skills off keeps its habits off", () => {
    seedCard();
    writeJson("characters/aria/memory.json", { v: 1, next: 0, sources: [], skills: [OLD], nextSkill: 3 });
    const { host } = mockHost();
    writeChat("on", story(2, "x"), { title: "On", characterId: "aria" });
    expect(L.llmRequest(ctx("on"), host)).not.toBeNull();
    writeChat("off", story(2, "y"), { title: "Off", characterId: "aria", promptBoard: { v: 1, off: ["plugin:cardskills"] } });
    expect(L.llmRequest(ctx("off"), host)).toBeNull();
    expect(engine.cleanPromptBoard({ off: ["plugin:cardskills", "plugin:said"] }).off).toEqual(["plugin:cardhabits", "plugin:said"]);
  });

  it("a worker reply that still says skills is understood", () => {
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "a", text: "b" }, facts: [], skills: [{ who: "Aria", name: "n", rule: "r" }] }));
    expect(parsed.habits).toHaveLength(1);
  });
});

describe("habits: refusals carry a code", () => {
  it("full, repeat, empty and missing", () => {
    seedCard();
    const { host } = mockHost();
    expect(put(host, { name: "Only a name" }).json).toMatchObject({ code: "empty" });
    const { id: _id, ...fresh } = OLD;
    expect(put(host, fresh).status).toBe(200);
    expect(put(host, { ...fresh, name: "Again" }).json).toMatchObject({ code: "repeat" });
    expect(put(host, { id: "k9", on: false }).json).toMatchObject({ code: "missing" });
    const file = readJson("characters/aria/memory.json");
    const filled = Array.from({ length: 29 }, (_, i) => ({ id: "k" + (i + 2), name: "Habit " + (i + 2), rule: "Rule " + (i + 2) + " is its own habit" }));
    writeJson("characters/aria/memory.json", { ...file, habits: [...file.habits, ...filled] });
    expect(put(host, { name: "One more", rule: "A thirty-first rule that goes nowhere." }).json).toMatchObject({ code: "full", max: 30 });
  });
});
