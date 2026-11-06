import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, story, line, chapterReply, tick } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, body: any) => L.handleRoute({ method: "POST", path: "/litopys/chat-config", body }, host);
const view = (host: any, chatId: string) => L.handleRoute({ method: "GET", path: "/litopys/chat", query: { chatId } }, host);
const base = { ...L.DEFAULT_CONFIG, scene: { minMessages: 6, maxMessages: 40 }, recentMessages: 30, pinLimit: 5, cutMode: "fit", sceneKeep: 2 };

// a sensor flag at message 11 and another at 15: a four-message scene in the middle that only a flag started
const flagged = () => ({
  snapshots: Object.fromEntries(["m11", "m15"].map((id) => [id + "#0", { clock: { day: 1, time: null, place: "Hall" }, present: ["Aria"], scene: { new: true, label: "Turn" } }])),
});

describe("cleanChatConfig and withChatConfig (#122 part 2)", () => {
  it("keeps only known keys, clamps them and drops junk", () => {
    expect(L.cleanChatConfig(null)).toEqual({});
    expect(L.cleanChatConfig("x")).toEqual({});
    expect(L.cleanChatConfig({ scene: { minMessages: 999, maxMessages: 2 }, recentMessages: 1, pinLimit: "7", cutMode: "weird", sceneKeep: 5, budget: 5, enabled: false })).toEqual({
      scene: { minMessages: 40, maxMessages: 10 },
      recentMessages: 6,
      pinLimit: 7,
      sceneKeep: 5,
    });
    expect(L.cleanChatConfig({ cutMode: "scenes", scene: {}, recentMessages: null })).toEqual({ cutMode: "scenes" });
  });

  it("returns the global object itself when the chat sets nothing, else lays the chat's keys over it", () => {
    expect(L.withChatConfig(base, { config: {} })).toBe(base);
    expect(L.withChatConfig(base, null)).toBe(base);
    const own = L.withChatConfig(base, { config: { scene: { minMessages: 2 }, recentMessages: 12 } });
    expect(own.scene).toEqual({ minMessages: 2, maxMessages: 40 });
    expect(own.recentMessages).toBe(12);
    expect(own.pinLimit).toBe(5);
    // the global config is not touched
    expect(base.scene.minMessages).toBe(6);
  });

  it("a maximum below the minimum rises to the minimum, whichever side the chat set", () => {
    expect(L.withChatConfig(base, { config: { scene: { maxMessages: 10 } } }).scene.maxMessages).toBe(10);
    expect(L.withChatConfig({ ...base, scene: { minMessages: 20, maxMessages: 40 } }, { config: { scene: { maxMessages: 10 } } }).scene).toEqual({ minMessages: 20, maxMessages: 20 });
  });

  it("a shorter minimum keeps a short flag-only scene that the global one folds back", () => {
    const folded = L.findScenes(line(story(30)), flagged(), base, []);
    const kept = L.findScenes(line(story(30)), flagged(), L.withChatConfig(base, { config: { scene: { minMessages: 2 } } }), []);
    expect(kept.length).toBeGreaterThan(folded.length);
    expect(kept.some((s: any) => s.from === "m11" && s.to === "m14")).toBe(true);
  });

  it("recent messages and the cut mode of the chat decide its cut", () => {
    const st = { ...L.emptyChat("c1"), chapters: [{ id: "c1", from: "m1", to: "m40", count: 40, sig: L.chapterSig(line(story(40))), label: "All", text: "x", kind: "scene", at: 1 }] };
    expect(L.cutCount(st, line(story(50)), base)).toBe(20);
    expect(L.cutCount(st, line(story(50)), L.withChatConfig(base, { config: { recentMessages: 10 } }))).toBe(40);
  });
});

describe("POST /litopys/chat-config", () => {
  it("saves the overrides, shows them next to the global values, and clears them with null", () => {
    writeChat("c1", story(30));
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true });
    const { host } = mockHost();
    const r = route(host, { chatId: "c1", config: { scene: { minMessages: 3 }, recentMessages: 15, junk: 1 } });
    expect(r.status).toBe(200);
    expect(r.json.chatConfig).toEqual({ scene: { minMessages: 3 }, recentMessages: 15 });
    expect(r.json.globalConfig.scene).toEqual(L.DEFAULT_CONFIG.scene);
    expect(readJson("litopys/chats/c1.json").config).toEqual({ scene: { minMessages: 3 }, recentMessages: 15 });
    expect(readJson("litopys/chats/c1.json").activity.at(-1).kind).toBe("chat.config");
    // the same values again change nothing (no new activity row)
    const rows = readJson("litopys/chats/c1.json").activity.length;
    expect(route(host, { chatId: "c1", config: { recentMessages: 15, scene: { minMessages: 3 } } }).status).toBe(200);
    expect(readJson("litopys/chats/c1.json").activity.length).toBe(rows);
    const gone = route(host, { chatId: "c1", config: null });
    expect(gone.status).toBe(200);
    expect(gone.json.chatConfig).toEqual({});
    expect("config" in readJson("litopys/chats/c1.json")).toBe(false);
  });

  it("the chat's view counts scenes and the pin limit with the chat's own values", () => {
    writeChat("c1", story(30));
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true });
    writeJson("dashboard/state/c1.json", flagged());
    const { host } = mockHost();
    const before = view(host, "c1").json;
    route(host, { chatId: "c1", config: { scene: { minMessages: 2 }, pinLimit: 2 } });
    const after = view(host, "c1").json;
    expect(after.pinLimit).toBe(2);
    expect(before.pinLimit).toBe(L.DEFAULT_CONFIG.pinLimit);
    expect(after.rebuildScenes).toBeGreaterThan(before.rebuildScenes);
  });

  it("refuses a bad body, a chat without a record and a rebuild in progress", () => {
    writeChat("c1", story(30));
    const { host } = mockHost();
    expect(route(host, { chatId: "c1", config: "x" }).status).toBe(400);
    expect(route(host, { chatId: "../x", config: {} }).status).toBe(400);
    expect(route(host, { chatId: "c1", config: { recentMessages: 9 } }).status).toBe(404);
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true, rebuild: { startedAt: 1, chapters: [], facts: [], proposals: [], carried: [], skipScenes: [], marks: [], counters: { chapter: 0, fact: 0, proposal: 0 } } });
    expect(route(host, { chatId: "c1", config: { recentMessages: 9 } }).status).toBe(409);
  });

  it("one chat's settings do not reach another chat", () => {
    writeChat("c1", story(30));
    writeChat("c2", story(30));
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true });
    writeJson("litopys/chats/c2.json", { ...L.emptyChat("c2"), migrated: true });
    const { host } = mockHost();
    route(host, { chatId: "c1", config: { pinLimit: 1 } });
    expect(view(host, "c2").json.pinLimit).toBe(L.DEFAULT_CONFIG.pinLimit);
  });
});

describe("the chapter worker reads the chat's own settings", () => {
  it("writes the short scene for a chat with a short minimum, and folds it back for one without", () => {
    for (const id of ["c1", "c2"]) {
      writeChat(id, story(30), { updatedAt: Date.now() });
      writeJson("litopys/chats/" + id + ".json", { ...L.emptyChat(id), migrated: true });
      writeJson("dashboard/state/" + id + ".json", flagged());
    }
    const m = mockHost();
    route(m.host, { chatId: "c1", config: { scene: { minMessages: 2 } } });
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) keys.push(...tick(m, [chapterReply("Part " + i, "Something happened.")]).requests.map((x) => x.key));
    expect(keys.some((k) => k === "lit_c1_m11_m14")).toBe(true);
    expect(keys.some((k) => k === "lit_c2_m11_m14")).toBe(false);
  });
});
