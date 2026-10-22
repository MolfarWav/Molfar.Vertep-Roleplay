/**
 * Skills a character earns in a chat (#106): the chapter worker reports a habit it saw in a scene; a first sighting is
 * a candidate, a second chapter earns it, and an earned skill acts in this chat at once, can be switched off, rejected
 * or kept on the card. Most scenes give nothing.
 */
import { describe, expect, it } from "bun:test";
import { L, line, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const ctx = (chatId: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName },
});
const textOf = (res: any) => res.messages.map((m: any) => m.content).join("\n");
const SILENCE = { who: "Aria", name: "Answers threats with silence", rule: "When someone threatens her, she says nothing and keeps working.", when: "a threat is spoken", evidence: "Aria set down the knife and went on kneading the dough." };
const c = (chapterId: string, extra: Record<string, unknown> = {}) => ({ now: 5, chapterId, earnAfter: 2, userName: "You", sources: [], cardRules: [], ...extra });

function seedCard() {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
}

describe("chat skills: earning", () => {
  it("a first sighting is only a candidate; a second chapter earns it", () => {
    const st = L.emptyChat("c1");
    let r = L.applySkills(st, [SILENCE], c("c1"));
    expect(r).toMatchObject({ added: 1, earned: 0 });
    expect(st.skills[0]).toMatchObject({ id: "k1", who: "Aria", status: "proposed", seen: 1, on: true, chapters: ["c1"] });
    expect(st.skills[0].evidence).toEqual([{ text: SILENCE.evidence, chapter: "c1" }]);
    // the model says it again, in other words, in a later chapter
    r = L.applySkills(st, [{ ...SILENCE, name: "Silent under threat", rule: "If threatened she says nothing and keeps working.", evidence: "She did not answer the guard." }], c("c2"));
    expect(r).toMatchObject({ added: 0, reinforced: 1, earned: 1 });
    expect(st.skills).toHaveLength(1);
    expect(st.skills[0]).toMatchObject({ status: "active", seen: 2, chapters: ["c1", "c2"] });
    expect(st.skills[0].evidence).toHaveLength(2);
  });

  it("a reinforce by id counts; the same chapter written again is not a second sighting", () => {
    const st = L.emptyChat("c1");
    L.applySkills(st, [SILENCE], c("c1"));
    L.applySkills(st, [{ reinforce: "k1", evidence: "again" }], c("c1"));
    expect(st.skills[0]).toMatchObject({ seen: 1, status: "proposed" });
    L.applySkills(st, [{ reinforce: "k1", evidence: "again" }], c("c2"));
    expect(st.skills[0]).toMatchObject({ seen: 2, status: "active" });
  });

  it("the threshold is a setting; nothing is earned for the user's character, a repeat of the card, or a rejected habit", () => {
    const st = L.emptyChat("c1");
    L.applySkills(st, [SILENCE], c("c1", { earnAfter: 1 }));
    expect(st.skills[0].status).toBe("active");
    L.applySkills(st, [{ ...SILENCE, who: "You", name: "Mine", rule: "Something about the user's character here." }], c("c2"));
    L.applySkills(st, [{ who: "Aria", name: "Calm", rule: "She never raises her voice at anyone." }], c("c2", { cardRules: ["She never raises her voice at anyone."] }));
    expect(st.skills).toHaveLength(1);
    st.skills[0].status = "rejected";
    L.applySkills(st, [{ ...SILENCE, evidence: "again" }], c("c3"));
    expect(st.skills).toHaveLength(1);
    expect(st.skills[0].status).toBe("rejected");
  });

  it("at most two new candidates a chapter, and the chat keeps a dozen", () => {
    const st = L.emptyChat("c1");
    const habits = Array.from({ length: 4 }, (_, i) => ({ who: "Aria", name: "Habit " + i, rule: ["She hums at the window", "He counts the coins twice", "They lock the shutters at dusk", "She salts the bread before tasting it"][i] }));
    L.applySkills(st, habits, c("c1"));
    expect(st.skills).toHaveLength(2);
    for (let i = 0; i < 20; i++) L.applySkills(st, [{ who: "Aria", name: "N" + i, rule: "Unique rule " + "abcdefghijklmnopqrst"[i] + i * 977 + " zyxwv" + "qrstuvwxyz"[i % 10].repeat(4) }], c("c" + (i + 2)));
    expect(st.skills.filter((k: any) => k.status !== "rejected").length).toBeLessThanOrEqual(12);
  });

  it("the worker is asked about skills only while they are on, and sees the known ones", () => {
    const st = L.emptyChat("c1");
    L.applySkills(st, [SILENCE], c("c1"));
    const ln = line(story(10));
    const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };
    const on = L.buildWorkerRequest(st, work, ln, {}, { ...L.loadConfig({ read: () => { throw new Error("none"); } } as any), skills: true }, { userName: "You" });
    expect(on.systemPrompt).toContain("Skills (optional, usually none)");
    expect(on.systemPrompt).toContain('"skills":[');
    const off = L.buildWorkerRequest(st, work, ln, {}, { ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS, skills: false }, { userName: "You" });
    expect(off.systemPrompt).not.toContain("Skills (optional");
    expect(off.messages[0].content).not.toContain("Known skills");
    expect(L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, skills: [SILENCE] })).skills).toHaveLength(1);
    expect(L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" } })).skills).toEqual([]);
  });

  it("the chapter result applies them to the chat record and tells it in the activity log", () => {
    const st = L.emptyChat("c1");
    const ln = line(story(10));
    const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "Dough", text: "Aria kneaded the dough." }, skills: [SILENCE] }));
    L.applyWorkerResult(st, work, parsed, { now: 1, line: ln, skills: true, earnAfter: 1, userName: "You", sources: [], cardRules: [] });
    expect(st.skills[0].status).toBe("active");
    expect(st.activity.map((a: any) => a.kind)).toContain("skill.earn");
    const none = L.emptyChat("c2");
    L.applyWorkerResult(none, work, L.parseWorkerReply(JSON.stringify({ chapter: { label: "Quiet", text: "Nothing much happened." } })), { now: 1, line: ln, skills: true, earnAfter: 2, sources: [], cardRules: [] });
    expect(none.skills).toEqual([]);
  });
});

describe("chat skills: acting, and the user's say", () => {
  function seedEarned(on = true) {
    seedCard();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const st = L.emptyChat("next");
    L.applySkills(st, [SILENCE], c("c1", { earnAfter: 1 }));
    st.skills[0].on = on;
    writeJson("litopys/chats/next.json", st);
  }

  it("an earned skill acts in this chat at once, as the skills part, with no skill on the card", () => {
    seedEarned();
    const { host } = mockHost();
    const res = L.llmRequest(ctx("next"), host);
    expect(textOf(res)).toContain("- Answers threats with silence: When someone threatens her");
    expect(res.promptSources.parts.map((p: any) => p.label)).toContain("Litopys · character skills");
    // a candidate does not act, a skill switched off does not, the chat switch turns the part off
    const st = readJson("litopys/chats/next.json");
    st.skills[0].status = "proposed";
    writeJson("litopys/chats/next.json", st);
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    st.skills[0].status = "active";
    st.skills[0].on = false;
    writeJson("litopys/chats/next.json", st);
    expect(L.llmRequest(ctx("next"), host)).toBeNull();
    // not in another chat of the card
    writeChat("other", story(2, "y"), { title: "Other", characterId: "aria" });
    st.skills[0].on = true;
    writeJson("litopys/chats/next.json", st);
    expect(L.llmRequest(ctx("other"), host)).toBeNull();
  });

  it("the routes: switch off, accept early, edit, reject", () => {
    seedCard();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const st = L.emptyChat("next");
    L.applySkills(st, [SILENCE], c("c1"));
    writeJson("litopys/chats/next.json", st);
    const { host } = mockHost();
    const call = (body: any) => route(host, "POST", "/litopys/skills", { chatId: "next", id: "k1", ...body });
    expect(call({ op: "accept" }).json.skills[0]).toMatchObject({ status: "active" });
    expect(call({ op: "on", on: false }).json.skills[0]).toMatchObject({ on: false });
    expect(call({ op: "edit", rule: "She says nothing." }).json.skills[0]).toMatchObject({ rule: "She says nothing.", edited: true });
    expect(call({ op: "edit", name: "" }).status).toBe(400);
    expect(call({ op: "nope" }).status).toBe(400);
    expect(call({ op: "reject" }).json.skills).toEqual([]);
    expect(call({ op: "accept" }).status).toBe(404);
  });

  it("keeping it puts the skill on the card, where it acts in every chat, and the chat does not say it twice", () => {
    seedEarned();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/skills", { chatId: "next", id: "k1", op: "keep" });
    expect(r.status).toBe(200);
    const mem = readJson("characters/aria/memory.json");
    expect(mem.skills).toEqual([expect.objectContaining({ name: SILENCE.name, origin: "story", state: "accepted", from: expect.objectContaining({ chatId: "next", title: "Next" }) })]);
    expect(readJson("litopys/chats/next.json").skills[0].kept).toMatchObject({ cardId: "aria" });
    expect(textOf(L.llmRequest(ctx("next"), host)).split("Answers threats with silence").length - 1).toBe(1);
    // another chat of the card now gets it
    writeChat("other", story(2, "y"), { title: "Other", characterId: "aria" });
    expect(textOf(L.llmRequest(ctx("other"), host))).toContain("Answers threats with silence");
    // keeping again is harmless; a candidate cannot be kept
    expect(route(host, "POST", "/litopys/skills", { chatId: "next", id: "k1", op: "keep" }).status).toBe(200);
    expect(readJson("characters/aria/memory.json").skills).toHaveLength(1);
  });

  it("a candidate cannot be kept, and the chat view lists the skills without the rejected", () => {
    seedCard();
    writeChat("next", story(2, "x"), { title: "Next", characterId: "aria" });
    const st = L.emptyChat("next");
    L.applySkills(st, [SILENCE], c("c1"));
    writeJson("litopys/chats/next.json", st);
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/skills", { chatId: "next", id: "k1", op: "keep" }).status).toBe(400);
    expect(route(host, "GET", "/litopys/chat", undefined, { chatId: "next" }).json.skills).toHaveLength(1);
  });

  it("the setting turns the watching off and the earn threshold is clamped", () => {
    const { host } = mockHost();
    expect(L.loadConfig(host.fs)).toMatchObject({ skills: true, skillsEarnAfter: 2 });
    const cfg = L.patchConfig(host.fs, { skills: false, skillsEarnAfter: 99 });
    expect(cfg).toMatchObject({ skills: false, skillsEarnAfter: 5 });
  });
});
