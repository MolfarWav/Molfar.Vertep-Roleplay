/**
 * World DM (plugins/world, #52): the chronicler records people, places and facts from the
 * story into the chat's own world book; the engine plugin scans that book in its chat only,
 * copies it on a fork and removes it with the chat; the app's library never lists it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DICE_MODES, CHRONICLER_SYSTEM, backgroundsInput, splitItems, sensorCarry, placeKey, applyCarry, findPlace, hereInsert, hereOf, applyLevel, applyReport, behindOf, defaultBlocks, diceInsert, diceInsertAuto, diceMod, diceOutcome, DICE_TILTS, lifeInsert, lifeTier, rollFate, rollLife, rollFateAuto, seededRandom, classifyError, dmInput, takeUnread, dueIn, dueReason, emptyState, eventInsert, handleRoute, llmRequest, normalizeState, parseReply, sceneOf, shortText, systemFor, unreadMessages, sweepCandidates } from "../plugins/world/plugin.js";

// world.ts reaches engine.ts, which reads the frame URL at import time
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { libraryBooks } = await import("../src/lib/world");

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { handleRoute: Function };

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}

const msg = (i: number, role: string, text: string, name?: string) => ({ id: "m" + i, role, name: name ?? (role === "user" ? "Taras" : "Odarka"), text, swipe: 0 });
const STORY = [
  msg(0, "char", "Odarka stirs the pot."),
  msg(1, "user", "Who lives up the pass?"),
  msg(2, "char", "Old Maksym keeps the toll at the Red Tower. Nobody crosses without paying him."),
  msg(3, "user", "Then we go at night."),
  msg(4, "char", "Odarka nods. The tower's lantern glows above the pines."),
];

const seed = (msgs = STORY) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": msgs.map((m) => JSON.stringify(m)).join("\n") + "\n",
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  "settings.json": JSON.stringify({ model: "c/default" }),
});

const route = (h: ReturnType<typeof memHost>["host"], method: string, p: string, body?: unknown, query: Record<string, string> = {}, stash?: unknown) =>
  handleRoute({ method, path: p, query, body, ...(stash ? { stash } : {}) }, h) as any;

const REPORT = JSON.stringify({
  add: [
    { kind: "person", name: "Maksym", aliases: ["Old Maksym", "the toll keeper"], text: "Keeps the toll at the Red Tower; nobody crosses the pass without paying him." },
    { kind: "place", name: "Red Tower", aliases: [], text: "A tower up the pass with a lantern that glows above the pines." },
    { kind: "person", name: "Odarka", text: "The witch." },
    { kind: "person", name: "Taras", text: "The courier." },
  ],
  update: [],
  retire: [],
  summary: "The toll keeper and his tower.",
});

describe("world state", () => {
  it("normalizeState drops junk and keeps ids unique", () => {
    const s = normalizeState({
      settings: { level: "chaos!", everyN: 999 },
      entities: [
        { id: "n1", kind: "person", name: "A", text: "x", status: "active" },
        { id: "n1", kind: "person", name: "dup", text: "y" },
        { id: "bad", name: "B" },
        { id: "n7", kind: "weird", name: "C", text: "z", status: "past", aliases: ["C", "Cee", ""] },
      ],
      log: [1, { at: 1 }],
    }, "c1");
    expect(s.settings).toEqual({ level: "off", everyN: 50, recordsEveryN: 0, stagnation: 6, onTransition: true, onPlace: true, insert: true, textMax: 900, changesMax: 12, carrySource: "sensor", profile: "", dice: "", diceStat: "", diceChance: 0, diceTilt: "", diceLife: -1, diceShow: false });
    expect(s.entities.map((e) => [e.id, e.kind, e.status, e.aliases])).toEqual([["n1", "person", "active", []], ["n7", "fact", "past", ["Cee"]]]);
    expect(s.nextId).toBe(8);
    expect(s.log).toEqual([{ at: 1 }]);
    expect(s.bookId).toBe("world-c1");
  });

  it("unread messages and every-N count replies after the last one read", () => {
    const st = emptyState("c1");
    st.settings.everyN = 2;
    expect(dueIn(st, STORY)).toBe(0);
    st.lastKey = "m2#0";
    expect(unreadMessages(STORY, st.lastKey).map((m) => m.id)).toEqual(["m3", "m4"]);
    expect(dueIn(st, STORY)).toBe(1);
    // a message the DM read that is gone: read everything again
    expect(unreadMessages(STORY, "gone#0").length).toBe(5);
  });

  it("parseReply reads fenced JSON, thinking first, trailing commas", () => {
    expect(parseReply("<think>{no}</think>```json\n{\"add\":[],}\n```")).toEqual({ add: [] });
    expect(parseReply("not json")).toBe(null);
  });

  it("shortText keeps two sentences", () => {
    expect(shortText("He died. At the bridge. Long ago, in winter.")).toBe("He died. At the bridge.");
  });
});

describe("applyReport", () => {
  it("adds records, never the cards or the user, folds a known name into an update", () => {
    const st = emptyState("c1");
    const n = applyReport(st, parseReply(REPORT)!, { cards: ["Odarka"], userName: "Taras", now: 5 });
    expect(n).toBe(2);
    expect(st.entities.map((e) => [e.id, e.name])).toEqual([["n1", "Maksym"], ["n2", "Red Tower"]]);
    expect(st.entities[0]!.aliases).toEqual(["Old Maksym", "the toll keeper"]);
    // the same name again (by an alias) is an update, not a second record
    const again = applyReport(st, { add: [{ kind: "person", name: "old maksym", text: "Lost his toll to the bandits." }] }, { cards: [], userName: "", now: 6 });
    expect(again).toBe(1);
    expect(st.entities.length).toBe(2);
    expect(st.entities[0]!.text).toBe("Lost his toll to the bandits.");
  });

  it("retires a record short and leaves it retired", () => {
    const st = emptyState("c1");
    applyReport(st, parseReply(REPORT)!, { cards: [], userName: "", now: 1 });
    applyReport(st, { retire: [{ id: "n1", text: "The old toll keeper of the Red Tower. Bandits killed him on the third night. His lantern went out." }] }, { cards: [], userName: "", now: 2 });
    const m = st.entities.find((e) => e.id === "n1")!;
    expect(m.status).toBe("past");
    expect(m.text).toBe("The old toll keeper of the Red Tower. Bandits killed him on the third night.");
    expect(applyReport(st, { update: [{ id: "n1", text: "Alive after all." }] }, { cards: [], userName: "", now: 3 })).toBe(0);
  });

  it("caps the changes of one run", () => {
    const st = emptyState("c1");
    const add = Array.from({ length: 20 }, (_, i) => ({ kind: "place", name: "Place " + i, text: "A place." }));
    expect(applyReport(st, { add }, { cards: [], userName: "", now: 1 })).toBe(12);
    // the chat's own limits: fewer changes, shorter texts
    const small = emptyState("c1");
    small.settings.changesMax = 4;
    small.settings.textMax = 200;
    expect(applyReport(small, { add: add.map((a) => ({ ...a, text: "x".repeat(500) })) }, { cards: [], userName: "", now: 1 })).toBe(4);
    expect(small.entities[0]!.text.length).toBe(200);
  });

  it("dmInput lists the cast, the record and the new story", () => {
    const st = emptyState("c1");
    applyReport(st, parseReply(REPORT)!, { cards: [], userName: "", now: 1 });
    const text = dmInput({ cards: ["Odarka"], userName: "Taras", entities: st.entities, msgs: STORY.slice(3) });
    expect(text).toContain("own cards (do not record): Odarka.");
    expect(text).toContain("n1 · person · Maksym (Old Maksym, the toll keeper): Keeps the toll");
    expect(text).toContain("[Taras] Then we go at night.");
    expect(text).not.toContain("Who lives up the pass?");
  });
});

describe("routes", () => {
  it("off by default; settings refuse unfinished levels; switching on starts near the end", () => {
    const m = memHost(seed());
    // a chat with no state file counts as switched on (chronicler), until the player switches it off
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json).toMatchObject({ settings: { level: "chronicler", everyN: 5 }, records: 0 });
    expect(m.files["world/state/c1.json"]).toBeUndefined();
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "off" });
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "off" });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "boss" }).status).toBe(400);
    const on = route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1 }).json;
    expect(on.settings).toEqual({ level: "chronicler", everyN: 1, recordsEveryN: 0, stagnation: 6, onTransition: true, onPlace: true, insert: true, textMax: 900, changesMax: 12, carrySource: "sensor", profile: "", dice: "", diceStat: "", diceChance: 0, diceTilt: "", diceLife: -1, diceShow: false });
    // reads the last two messages (everyN * 2, at least 2), not the whole chat
    expect(JSON.parse(m.files["world/state/c1.json"]!).lastKey).toBe("m2#0");
  });

  it("a run asks the DM model, writes the world book and binds it to the chat", () => {
    const m = memHost({ ...seed(), "world/config.json": JSON.stringify({ model: "c/dm" }) });
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.key).toBe("world");
    expect(m.requests[0]!.spec.model).toBe("c/dm");
    expect(m.requests[0]!.spec.systemPrompt).toContain("world keeper");
    expect(m.requests[0]!.spec.messages[0].content).toContain("Old Maksym keeps the toll");
    m.results.world = { text: REPORT, model: "c/dm" };
    const done = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash).json;
    expect(done).toMatchObject({ ok: true, changes: 2, records: 2, dueIn: 1, lastSummary: "The toll keeper and his tower." });
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book).toMatchObject({ id: "world-c1", ownerChatId: "c1", globalActive: false, name: "World: The Pass" });
    expect(book.entries.map((e: any) => [e.uid, e.title, e.keys, e.status, e.memo])).toEqual([
      [1, "Maksym", ["Maksym", "Old Maksym", "the toll keeper"], "normal", "world:n1"],
      [2, "Red Tower", ["Red Tower"], "normal", "world:n2"],
    ]);
    expect(book.entries[0].content).toBe("Maksym: Keeps the toll at the Red Tower; nobody crosses the pass without paying him.");
    expect(JSON.parse(m.files["chats/c1.meta.json"]!).worldBookId).toBe("world-c1");
    // nothing new to read: no call
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "nothing new" });
  });

  it("keeps uids and the user's own entries in the book across runs; retired entries lose order", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    m.results.world = { text: REPORT };
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    book.entries.push({ uid: 9, title: "Mine", memo: "by hand", keys: ["x"], content: "x" });
    m.files["lorebooks/world-c1.json"] = JSON.stringify(book);
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(5, "char", "Bandits took the tower; Maksym is dead.")) + "\n";
    m.results.world = { text: JSON.stringify({ retire: [{ id: "n1", text: "The toll keeper of the Red Tower. Bandits killed him." }] }) };
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    const after = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(after.entries.map((e: any) => [e.uid, e.title, e.order])).toEqual([[9, "Mine", undefined], [1, "Maksym", 50], [2, "Red Tower", 100]]);
    expect(after.entries[1].memo).toBe("world:n1 (retired)");
  });

  it("peek shows the records, not the fronts or the event", () => {
    const m = memHost(seed());
    m.files["world/state/c1.json"] = JSON.stringify({ ...emptyState("c1"), settings: { level: "director", everyN: 5 },
      entities: [{ id: "n1", kind: "person", name: "Maksym", text: "Dead.", status: "past", at: 5 }, { id: "n2", kind: "place", name: "Tower", text: "Old.", at: 1 }],
      fronts: [{ id: "f1", name: "Secret cult", clock: 3, size: 6 }], event: { text: "The cult strikes.", hard: true } });
    const out = route(m.host, "GET", "/world/peek", undefined, { chatId: "c1" });
    expect(out.json.records.map((r: any) => [r.name, r.status])).toEqual([["Tower", "active"], ["Maksym", "past"]]);
    expect(JSON.stringify(out.json)).not.toContain("cult");
  });

  it("a failed run records the error and reads the same messages next time", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    m.results.world = { text: "Sorry, I cannot." };
    const out = route(m.host, "POST", "/world/update", { chatId: "c1" }).json;
    expect(out.ok).toBe(false);
    expect(out.code).toBe("not-json");
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.lastKey).toBe(null);
    expect(st.lastError.code).toBe("not-json");
    expect(st.lastError.details).toBe("Sorry, I cannot.");
    // the failed run is in the history too
    expect(st.log.at(-1).error).toBe("not-json");
    expect(m.files["lorebooks/world-c1.json"]).toBeUndefined();
  });

  it("the play model falls back to the sensor's, Litopys's, the chat's, then the app's", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests[0]!.spec.model).toBe("c/chat");
    m.files["litopys/config.json"] = JSON.stringify({ model: "c/lit" });
    expect(route(m.host, "GET", "/world/config", undefined, { chatId: "c1" }).json.play).toEqual({ model: "c/lit", from: "litopys" });
    m.files["dashboard/config.json"] = JSON.stringify({ sensorModel: "c/sensor" });
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json.play).toEqual({ model: "c/sensor", from: "sensor" });
    const put = route(m.host, "PUT", "/world/config", { model: "c/dm", maxTokens: 99999 }).json;
    expect([put.model, put.maxTokens, put.play]).toEqual(["c/dm", 8000, { model: "c/dm", from: "world" }]);
    // the build model: its own, else the chat's (no chat named: the app's default)
    expect(put.build).toEqual({ model: "c/default", from: "default" });
    const back = route(m.host, "PUT", "/world/config", { model: "", maxTokens: 1500 }).json;
    expect([back.model, back.buildModel, back.maxTokens]).toEqual(["", "", 1500]);
    expect(m.files["world/config.json"]).toBeUndefined();
  });
});

// ---------- levels above the chronicler (P1, P2) ----------
type Snap = { scene?: Record<string, unknown>; clock?: Record<string, unknown>; present?: string[]; threads?: unknown[] };
const dashState = (snaps: Record<string, Snap>) => JSON.stringify({ v: 2, chatId: "c1", snapshots: snaps });
const calm = (direction: string, extra: Snap = {}): Snap => ({ scene: { new: false, direction }, clock: { place: "Kitchen" }, present: ["Odarka"], ...extra });

describe("the scene from the Dashboard", () => {
  it("reads the newest snapshot on the active line and counts the turns since the scene changed", () => {
    const m = memHost({ ...seed(), "dashboard/state/c1.json": dashState({
      "m0#0": { ...calm("social"), scene: { new: true, direction: "social" } },
      "m2#0": calm("domestic"), "m4#0": calm("domestic"), "m9#0": calm("combat"),
    }) });
    expect(sceneOf(m.host.fs, "c1", STORY)).toEqual({ key: "m4#0", direction: "domestic", before: null, stagnant: 2, place: "Kitchen", present: ["Odarka"], chars: {}, places: ["Kitchen"], objects: [], left: null });
    expect(sceneOf(memHost(seed()).host.fs, "c1", STORY)).toBe(null);
  });

  it("dueReason: every N, stagnation by direction, a transition once, nothing when explicit", () => {
    const st = emptyState("c1");
    st.settings = { level: "director", everyN: 10, stagnation: 1, onTransition: true, insert: true };
    st.lastKey = null;
    const scene = (direction: string, stagnant: number, key = "m4#0") => ({ key, direction, before: null, stagnant });
    expect(dueReason(st, STORY, scene("social", 0))).toBe(null);
    expect(dueReason(st, STORY, scene("social", 1))).toBe("stagnation");
    // domestic waits twice as long; combat pauses the counter
    expect(dueReason(st, STORY, scene("domestic", 1))).toBe(null);
    expect(dueReason(st, STORY, scene("domestic", 2))).toBe("stagnation");
    st.settings.stagnation = 4;
    // travel half as long (2 of 4); the 3 unread replies cap the still stretch
    expect(dueReason(st, STORY, scene("travel", 2))).toBe("stagnation");
    expect(dueReason(st, STORY, scene("social", 9))).toBe(null);
    expect(dueReason(st, STORY, scene("combat", 20))).toBe(null);
    expect(dueReason(st, STORY, scene("transition", 0))).toBe("transition");
    st.transitionKey = "m4#0";
    expect(dueReason(st, STORY, scene("transition", 0))).toBe(null);
    // right after a run the still stretch starts again
    st.lastKey = "m3#0";
    expect(dueReason(st, STORY, scene("social", 9))).toBe(null);
    st.settings.everyN = 1;
    expect(dueReason(st, STORY, scene("explicit", 0))).toBe(null);
    expect(dueReason(st, STORY, null)).toBe("every");
  });
});

describe("fronts and events", () => {
  it("adds, ticks and retires fronts; a full clock stays full", () => {
    const st = emptyState("c1");
    applyLevel(st, { fronts: [{ op: "add", name: "Bandits of the pass", goal: "Take the toll", size: 4 }, { op: "add", name: "bandits of the pass" }] }, { level: "living", direction: null, now: 1 });
    expect(st.fronts).toEqual([{ id: "f1", name: "Bandits of the pass", goal: "Take the toll", clock: 0, size: 4, status: "active", at: 1 }]);
    applyLevel(st, { fronts: [{ op: "tick", id: "f1", by: 9 }, { op: "tick", name: "Bandits of the pass", by: 2 }, { op: "tick", id: "f1" }] }, { level: "living", direction: null, now: 2 });
    expect(st.fronts[0]!.clock).toBe(4);
    applyLevel(st, { fronts: [{ op: "retire", id: "f1" }] }, { level: "living", direction: null, now: 3 });
    expect(st.fronts[0]!.status).toBe("past");
  });

  it("an event is hard from director up, soft on living; none in an explicit scene, none in combat below antagonist", () => {
    const ev = { event: { text: "A rider brings a sealed letter." } };
    const st = emptyState("c1");
    applyLevel(st, ev, { level: "living", direction: "social", now: 1 });
    expect(st.event).toMatchObject({ text: "A rider brings a sealed letter.", hard: false, sent: 0 });
    for (const [level, direction, made] of [["director", "explicit", false], ["chaos", "explicit", false], ["director", "combat", false], ["antagonist", "combat", true], ["director", "social", true]] as const) {
      const s2 = emptyState("c1");
      applyLevel(s2, ev, { level, direction, now: 1 });
      expect([level, direction, !!s2.event]).toEqual([level, direction, made]);
      if (made) expect(s2.event!.hard).toBe(true);
    }
  });

  it("one shot: delivered drops it, missed once is sent again, missed twice is dropped", () => {
    const st = emptyState("c1");
    st.event = { text: "A knock.", hard: true, sent: 1, retried: false };
    applyLevel(st, { delivered: false }, { level: "director", direction: null, now: 1 });
    expect(st.event).toMatchObject({ sent: 0, retried: true });
    st.event!.sent = 1;
    applyLevel(st, { delivered: false, event: { text: "Another." } }, { level: "director", direction: null, now: 2 });
    // dropped, and the new one takes its place
    expect(st.event).toMatchObject({ text: "Another.", sent: 0, retried: false });
    st.event!.sent = 1;
    applyLevel(st, { delivered: true }, { level: "director", direction: null, now: 3 });
    expect(st.event).toBe(null);
  });

  it("the insert has the fixed shape; soft news is a may", () => {
    const hard = eventInsert({ text: "A knock at the door.", hard: true, sent: 0, retried: false })!;
    expect(hard.split("\n")).toEqual([
      "[WORLD EVENT: must happen in this reply]",
      "What: A knock at the door.",
      "How: bring it into this reply as part of the scene; the characters react in character.",
      "Do not: resolve it in this reply, explain where it came from, or mention a game master.",
    ]);
    expect(eventInsert({ text: "Prices rose.", hard: false, sent: 0, retried: false })).toContain("may come up");
  });

  it("each level has its own rules; the chronicler has no fronts", () => {
    expect(systemFor("chronicler")).not.toContain("fronts");
    expect(systemFor("living")).toContain("living world");
    expect(systemFor("antagonist")).toContain("where it hurts");
    expect(systemFor("chaos")).toContain("total chaos");
    expect(systemFor("director")).toContain('"delivered"');
  });
});

describe("the llmRequest hook", () => {
  const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go at night." }] }, turn: { op } });
  const withEvent = (level: string, extra: Record<string, string> = {}) => memHost({
    ...seed(), ...extra,
    "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level, everyN: 5, stagnation: 6, onTransition: true, insert: true }, event: { text: "A knock at the door.", hard: true, sent: 0, retried: false } }),
  });

  it("puts the event after the history, once", () => {
    const m = withEvent("director");
    const out = llmRequest(req(), m.host) as { messages: { role: string; content: string }[]; promptSources: any };
    expect(out.messages.length).toBe(2);
    expect(out.messages[1]!.content).toStartWith("We go at night.\n\n[WORLD EVENT: must happen in this reply]");
    expect(out.promptSources.parts[0]).toMatchObject({ kind: "plugin", label: "World DM" });
    expect(JSON.parse(m.files["world/state/c1.json"]!).event.sent).toBe(1);
    expect(llmRequest(req(), m.host)).toBe(null);
  });

  it("stays out of impersonate and continue, chronicler, a chat that switched it off, and an explicit scene (chaos too)", () => {
    expect(llmRequest(req("impersonate"), withEvent("director").host)).toBe(null);
    expect(llmRequest(req("continue"), withEvent("director").host)).toBe(null);
    expect(llmRequest(req(), withEvent("chronicler").host)).toBe(null);
    const offMeta = { "chats/c1.meta.json": JSON.stringify({ id: "c1", characterId: "odarka", promptBoard: { v: 1, off: ["plugin:world"] } }) };
    expect(llmRequest(req(), withEvent("director", offMeta).host)).toBe(null);
    const explicit = { "dashboard/state/c1.json": dashState({ "m4#0": calm("explicit") }) };
    expect(llmRequest(req(), withEvent("chaos", explicit).host)).toBe(null);
    const combat = { "dashboard/state/c1.json": dashState({ "m4#0": calm("combat") }) };
    expect(llmRequest(req(), withEvent("director", combat).host)).toBe(null);
    expect(llmRequest(req(), withEvent("antagonist", combat).host)).not.toBe(null);
  });
});

describe("the dice (code rolls before the reply)", () => {
  const diceProfile = (dice: string, extra: Record<string, unknown> = {}) => ({ id: "living", options: { dice, diceStat: "affection", diceChance: 100, ...extra } });
  const req = (extra: Record<string, unknown> = {}) => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "I take her hand." }] }, turn: { op: "send", ...extra } });
  const snap = (stats: Record<string, number>) => ({ ...calm("social"), present: ["Odarka"], chars: { Odarka: { stats } } });
  const withDice = (dice: string, extra: Record<string, string> = {}, level = "living") => {
    const m = memHost({
      ...seed(),
      "dashboard/state/c1.json": dashState({ "m4#0": snap({ affection: -100, comfort: 100 }) }),
      "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level, everyN: 5, stagnation: 6, onTransition: true, insert: true } }),
      ...extra,
    });
    route(m.host, "PUT", "/world/profiles", diceProfile(dice));
    return m;
  };

  it("maps 2d6 plus the modifier to four outcomes and the stat to -5..+5", () => {
    expect([2, 5, 6, 7, 8, 9, 10, 17].map((n) => diceOutcome(n))).toEqual(["miss", "miss", "no_but", "no_but", "yes_but", "yes_but", "full", "full"]);
    expect([-100, -50, 0, 9, 10, 100, 400, null].map((v) => diceMod(v as number))).toEqual([-5, -3, 0, 0, 1, 5, 5, 0]);
    expect(DICE_MODES).toEqual(["off", "flavour", "strict"]);
  });

  it("tilts the limits: kind, even and harsh move where each outcome starts", () => {
    expect(DICE_TILTS.even).toEqual([5, 7, 9]);
    expect([8, 9, 10, 11].map((n) => diceOutcome(n, DICE_TILTS.kind))).toEqual(["yes_but", "full", "full", "full"]);
    expect([8, 9, 10, 11].map((n) => diceOutcome(n, DICE_TILTS.harsh))).toEqual(["no_but", "yes_but", "yes_but", "full"]);
    expect(rollFate("k", 100, 0, DICE_TILTS.kind).outcome).toBe(diceOutcome((rollFate("k", 100, 0) as any).total, DICE_TILTS.kind));
    // a chat's own tilt over the profile's, and the log keeps the tilt used
    const m = withDice("flavour", {}, "living");
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceTilt: "harsh" }).json.dice.tilt).toBe("harsh");
    llmRequest(req(), m.host);
    expect(route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.rolls[0].tilt).toBe("harsh");
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceTilt: "" }).json.dice.tilt).toBe("even");
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceTilt: "nope" }).json.settings.diceTilt).toBe("");
  });

  it("rolls the same for the same seed and passes a chance gate", () => {
    expect(rollFate("a", 100, 2)).toEqual(rollFate("a", 100, 2));
    expect(seededRandom("a")()).toBe(seededRandom("a")());
    const rolls = Array.from({ length: 400 }, (_, i) => rollFate("s" + i, 25, 0));
    const on = rolls.filter((r) => r.gated).length;
    expect(on).toBeGreaterThan(60);
    expect(on).toBeLessThan(140);
    const totals = Array.from({ length: 300 }, (_, i) => rollFate("t" + i, 100, 0) as { total: number });
    expect(Math.min(...totals.map((r) => r.total))).toBeGreaterThanOrEqual(2);
    expect(Math.max(...totals.map((r) => r.total))).toBeLessThanOrEqual(12);
  });

  it("flavour and strict word the same roll differently; neither mentions the numbers to the player", () => {
    const roll = { gated: true, gate: 3, d1: 1, d2: 2, mod: -5, total: -2, outcome: "miss" } as any;
    const soft = diceInsert(roll, "flavour", "affection", "Odarka");
    const hard = diceInsert(roll, "strict", "affection", "Odarka");
    expect(soft).toContain("2d6 - 5 (affection of Odarka) = -2: miss");
    expect(soft).toContain("Never mention dice");
    expect(soft).toContain("bend it only where the character demands");
    expect(hard).toContain("This result binds");
    expect(hard).not.toContain("bend it");
  });

  it("is off unless the profile switches it on, and needs the DM above the chronicler", () => {
    expect(llmRequest(req(), withDice("off").host)).toBe(null);
    expect(llmRequest(req(), withDice("flavour", {}, "chronicler").host)).toBe(null);
    const out = llmRequest(req(), withDice("flavour").host) as { messages: { content: string }[]; promptSources: any };
    expect(out.messages[1]!.content).toStartWith("I take her hand.\n\n[FATE");
    expect(out.promptSources.parts).toHaveLength(1);
    expect(out.promptSources.parts[0]).toMatchObject({ kind: "plugin", label: "Dice" });
  });

  it("auto: one die for the scene, the outcome per person and stat, only what differs from the bare dice is listed", () => {
    const cast = [{ who: "Rhea", stats: { trust: 100, comfort: -100, attraction: 0, respect: 0, affection: 0 } }, { who: "Kael", stats: { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 } }];
    const roll = rollFateAuto("x", 100, cast) as any;
    expect(roll.gated).toBe(true);
    expect(roll.mod).toBe(0);
    expect(roll.by.Rhea.trust).toBe(diceOutcome(roll.total + 5));
    expect(roll.by.Rhea.comfort).toBe(diceOutcome(roll.total - 5));
    expect(roll.by.Kael.trust).toBe(roll.outcome);
    expect(rollFateAuto("x", 100, cast)).toEqual(roll);
    const text = diceInsertAuto({ gated: true, total: 7, outcome: "no_but", by: { Rhea: { trust: "full", comfort: "miss", attraction: "no_but", respect: "no_but", affection: "no_but" }, Kael: { trust: "no_but", comfort: "no_but", attraction: "no_but", respect: "no_but", affection: "no_but" } } }, "strict");
    expect(text).toContain("2d6 = 7: no, but.");
    expect(text).toContain("Rhea - full success: trust | miss: comfort");
    expect(text).not.toContain("Kael");
    expect(text).toContain("Anyone else, or a stat not listed: no, but");
    expect(text).toContain("This result binds");
    expect(text).not.toContain("yes, but =");
    // nobody to tell apart: the plain line, no choosing
    const flat = diceInsertAuto({ gated: true, total: 9, outcome: "yes_but", by: { Kael: { trust: "yes_but", comfort: "yes_but", attraction: "yes_but", respect: "yes_but", affection: "yes_but" } } }, "flavour");
    expect(flat).toContain("2d6 = 9: yes, but.");
    expect(flat).not.toContain("take the person");
    // the default stat is "auto": the log keeps what each person's stats gave
    const m = withDice("flavour", {}, "living");
    route(m.host, "PUT", "/world/profiles", { id: "living", options: { dice: "flavour", diceStat: "auto", diceChance: 100 } });
    const out = llmRequest(req(), m.host) as { promptSources: any };
    expect(out.promptSources.parts[0].text).toContain("Odarka - ");
    const log = route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.rolls;
    expect(log[0]).toMatchObject({ stat: "auto", who: "Odarka", inserted: true });
    expect(Object.keys(log[0].by.Odarka)).toEqual(["trust", "comfort", "attraction", "respect", "affection"]);
  });

  it("the note tells the model to keep an outcome the player already wrote and to apply the roll to what follows", () => {
    const roll = { gated: true, gate: 3, d1: 4, d2: 4, mod: 0, total: 8, outcome: "yes_but" } as any;
    for (const mode of ["flavour", "strict"]) {
      const text = diceInsert(roll, mode, "affection", "Odarka");
      expect(text).toContain("already says how their action ends, keep that as written");
      expect(text).toContain("how the others react and what it gains or costs");
      expect(text).toContain("ignore this note");
    }
  });

  it("life intervenes: its own roll, a d6 tier, off at 0, separate from the action's roll", () => {
    expect([1, 3, 4, 5, 6].map(lifeTier)).toEqual(["minor", "minor", "notable", "notable", "major"]);
    expect(rollLife("s", 0)).toEqual({ gated: false, gate: 0 });
    expect((rollLife("s", 100) as any).tier).toBeDefined();
    expect(rollLife("s", 100)).toEqual(rollLife("s", 100));
    const tiers = new Set(Array.from({ length: 200 }, (_, i) => (rollLife("t" + i, 100) as any).tier));
    expect([...tiers].sort()).toEqual(["major", "minor", "notable"]);
    const on = Array.from({ length: 400 }, (_, i) => rollLife("u" + i, 20).gated).filter(Boolean).length;
    expect(on).toBeGreaterThan(40);
    expect(on).toBeLessThan(120);
    expect(lifeInsert({ tier: "major" } as any)).toContain("the world intervenes in this reply, major");
    // through the hook: a Life part beside the Dice part, both in the Inspector, both in the log
    const m = withDice("flavour", {}, "living");
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceLife: 100 }).json.dice.life).toBe(100);
    const out = llmRequest(req(), m.host) as { promptSources: any };
    expect(out.promptSources.parts.map((p: any) => p.label)).toEqual(["Dice", "Life"]);
    const log = route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.rolls;
    expect(log.some((r: any) => r.kind === "life" && r.inserted === true)).toBe(true);
    // 0 in the chat means never, even where the profile says otherwise; -1 hands it back
    route(m.host, "PUT", "/world/profiles", { id: "living", options: { dice: "flavour", diceStat: "auto", diceChance: 100, diceLife: 100 } });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceLife: 0 }).json.dice.life).toBe(0);
    expect((llmRequest(req(), m.host) as any).promptSources.parts.map((p: any) => p.label)).toEqual(["Dice"]);
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceLife: -1 }).json.dice.life).toBe(100);
  });

  it("logs where each roll was made, and says whether the chat shows the marks", () => {
    const m = withDice("flavour", {}, "living");
    llmRequest(req(), m.host);
    const first = route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json;
    expect(first.show).toBe(false);
    expect(first.rolls[0]).toMatchObject({ op: "send", last: expect.stringContaining("#"), n: expect.any(Number), lastSwipes: expect.any(Number) });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", diceShow: true }).json.settings.diceShow).toBe(true);
    expect(route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.show).toBe(true);
  });

  it("lets the chat's own dice setting win over the profile, and shows the one in force", () => {
    const m = withDice("off");
    expect(llmRequest(req(), m.host)).toBe(null);
    const view = route(m.host, "PUT", "/world/settings", { chatId: "c1", dice: "strict", diceStat: "comfort", diceChance: 100 }).json;
    expect(view.settings).toMatchObject({ dice: "strict", diceStat: "comfort", diceChance: 100 });
    expect(view.dice).toEqual({ mode: "strict", stat: "comfort", chance: 100, tilt: "even", life: 0 });
    const out = llmRequest(req(), m.host) as { promptSources: any };
    expect(out.promptSources.parts[0].text).toContain("(comfort of Odarka)");
    expect(out.promptSources.parts[0].text).toContain("This result binds");
    // "" hands the decision back to the profile
    const back = route(m.host, "PUT", "/world/settings", { chatId: "c1", dice: "", diceStat: "", diceChance: 0 }).json;
    expect(back.dice).toEqual({ mode: "off", stat: "affection", chance: 100, tilt: "even", life: 0 });
    expect(llmRequest(req(), m.host)).toBe(null);
  });

  it("reads the speaker's number from the Dashboard and logs every roll, the quiet ones too", () => {
    const m = withDice("strict", { "dashboard/state/c1.json": dashState({ "m4#0": snap({ affection: 60 }) }) });
    const out = llmRequest(req(), m.host) as { promptSources: any };
    expect(out.promptSources.parts[0].text).toContain("(affection of Odarka)");
    const log = route(m.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.rolls;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ mode: "strict", stat: "affection", who: "Odarka", value: 60, mod: 3, inserted: true });
    const quiet = withDice("flavour");
    route(quiet.host, "PUT", "/world/profiles", diceProfile("flavour", { diceChance: 1 }));
    let silent = 0;
    for (let i = 0; i < 20; i++) {
      if (llmRequest(req({ swipe: i }), quiet.host) === null) silent++;
    }
    expect(silent).toBeGreaterThan(15);
    const qlog = route(quiet.host, "GET", "/world/dice", {}, { chatId: "c1" }).json.rolls;
    expect(qlog.some((r: any) => r.inserted === false)).toBe(true);
  });

  it("a swipe rolls again, a reload does not; it follows the DM's guards", () => {
    const a = withDice("flavour");
    const first = llmRequest(req({ swipe: 0 }), a.host) as { promptSources: any };
    const again = llmRequest(req({ swipe: 0 }), withDice("flavour").host) as { promptSources: any };
    expect(again.promptSources.parts[0].text).toBe(first.promptSources.parts[0].text);
    const texts = new Set(Array.from({ length: 12 }, (_, i) => (llmRequest(req({ swipe: i }), withDice("flavour").host) as any).promptSources.parts[0].text));
    expect(texts.size).toBeGreaterThan(2);
    expect(llmRequest({ ...req(), turn: { op: "impersonate" } }, withDice("flavour").host)).toBe(null);
    const offMeta = { "chats/c1.meta.json": JSON.stringify({ id: "c1", characterId: "odarka", promptBoard: { v: 1, off: ["plugin:world"] } }) };
    expect(llmRequest(req(), withDice("flavour", offMeta).host)).toBe(null);
    const explicit = { "dashboard/state/c1.json": dashState({ "m4#0": { ...snap({ affection: 10 }), scene: { new: false, direction: "explicit" } } }) };
    expect(llmRequest(req(), withDice("flavour", explicit).host)).toBe(null);
  });

  it("rides next to a pending event as its own part", () => {
    const m = withDice("flavour");
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    m.files["world/state/c1.json"] = JSON.stringify({ ...st, event: { text: "A knock at the door.", hard: false, sent: 0, retried: false } });
    const out = llmRequest(req(), m.host) as { promptSources: any };
    expect(out.promptSources.parts.map((p: any) => p.label)).toEqual(["World DM", "Dice"]);
  });
});

describe("a run above the chronicler", () => {
  it("director: sends fronts, threads and the direction, keeps the event; explicit freezes even World turn", () => {
    const dash = { "dashboard/state/c1.json": dashState({ "m4#0": calm("social", { threads: [{ id: "t1", text: "Cross the pass unseen", status: "open" }] }) }) };
    const m = memHost({ ...seed(), ...dash });
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "director", everyN: 1, fromStart: true });
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    const spec = m.requests[0]!.spec;
    expect(spec.systemPrompt).toContain("Your level: director");
    expect(spec.messages[0].content).toContain("Scene direction now (from the scene tracker): social.");
    expect(spec.messages[0].content).toContain("Open threads (what the characters care about now): Cross the pass unseen.");
    m.results.world = { text: JSON.stringify({ add: [], fronts: [{ op: "add", name: "Toll riders", goal: "Catch smugglers", size: 6 }], event: { text: "Riders with torches climb the road." }, summary: "Riders." }) };
    const done = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash).json;
    expect(done).toMatchObject({ ok: true, fronts: 1, eventWaiting: true, direction: "social", sensor: true });
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.event).toMatchObject({ text: "Riders with torches climb the road.", hard: true });
    expect(st.log.at(-1)).toMatchObject({ reason: "every", fronts: 1 });
    // an explicit scene: no run, not even a manual one
    m.files["dashboard/state/c1.json"] = dashState({ "m4#0": calm("explicit"), "m5#0": calm("explicit") });
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(5, "char", "...")) + "\n";
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "explicit" });
  });

  it("back to the chronicler drops a waiting event", () => {
    const m = memHost(seed());
    m.files["world/state/c1.json"] = JSON.stringify({ ...emptyState("c1"), settings: { level: "director", everyN: 5 }, event: { text: "x", hard: true, sent: 0 } });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler" }).json.eventWaiting).toBe(false);
  });
});

// ---------- P3 stage 1: what a run reads, tokens, errors, the hub's routes ----------
describe("P3: what a run reads", () => {
  const long = (i: number, n: number) => msg(i, i % 2 ? "user" : "char", "x".repeat(n));
  it("every unread message is read, long ones cut to a fair share, none dropped", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => long(i, 2400));
    const t = takeUnread(msgs);
    expect(t.msgs.length).toBe(10);
    expect(t.rest).toEqual([]);
    expect(t.cap).toBeLessThanOrEqual(800);
    const input = dmInput({ cards: [], userName: "Taras", entities: [], msgs: t.msgs, cap: t.cap });
    // all ten speak, none cut away
    expect(input.match(/\[(Taras|Odarka)\]/g)!.length).toBe(10);
  });
  it("far behind: the oldest part now, the rest waits, and the run sends no event", () => {
    const msgs = Array.from({ length: 60 }, (_, i) => long(i, 2400));
    const t = takeUnread(msgs);
    expect(t.msgs[0]!.id).toBe("m0");
    expect(t.rest.length).toBeGreaterThan(0);
    expect(behindOf(msgs).runs).toBeGreaterThan(1);
    const m = memHost(seed(msgs));
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "director", fromStart: true });
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json.behind.messages).toBe(t.rest.length);
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests[0]!.spec.messages[0].content).toContain("send no event");
    m.results.world = { text: JSON.stringify({ add: [], event: { text: "A rider comes." }, summary: "old part" }) };
    const out = route(m.host, "POST", "/world/update", { chatId: "c1" }, {}, { upTo: "m" + (t.msgs.length - 1) + "#0" }).json;
    expect(out.ok).toBe(true);
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.event).toBe(null);
    expect(st.lastKey).toBe("m" + (t.msgs.length - 1) + "#0");
    expect(st.log.at(-1).behind).toBe(t.rest.length);
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json.behind.runs).toBeGreaterThan(0);
  });
  it("a state saved with the DM off still starts reading from now when switched on", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", everyN: 1 });
    expect(m.files["world/state/c1.json"]).toBeDefined();
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler" });
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.lastKey).toBe("m2#0");
  });
});

describe("P3: tokens and errors", () => {
  const ran = (m: ReturnType<typeof memHost>, result: unknown, key = "world") => {
    m.results[key] = result;
    const r = route(m.host, "POST", "/world/update", { chatId: "c1" }, {}, key === "world_retry" ? { retry: true, upTo: "m4#0" } : undefined);
    return r.json ?? r;
  };
  it("a run keeps its tokens, time and limit; the chat keeps the total", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    const out = ran(m, { text: REPORT, model: "c/chat", genTimeMs: 1200, usage: { input: 900, output: 120, costTotal: 0.002, priced: true }, requestParams: { max_tokens: 2048, block: "plugin:world", from: { max_tokens: "model" } } });
    expect(out.lastRun.usage).toEqual({ input: 900, output: 120, cost: 0.002 });
    expect(out.lastRun.limit).toEqual({ max: 2048, block: "plugin:world", fromModel: true });
    expect(out.lastRun.ms).toBe(1200);
    expect(out.usage).toEqual({ input: 900, output: 120, cost: 0.002, runs: 1 });
    const runs = route(m.host, "GET", "/world/runs", undefined, { chatId: "c1" }).json;
    expect(runs.runs[0].summary).toBe("The toll keeper and his tower.");
  });
  it("all thinking, no answer: retries once with more room, by itself", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    const out = ran(m, { text: "", reasoning: "hmm...", requestParams: { max_tokens: 1500, from: { max_tokens: "request" } } });
    expect(out.__llmPending).toBe(true);
    expect(m.requests.at(-1)!.key).toBe("world_retry");
    expect(m.requests.at(-1)!.spec.presetParams.max_tokens).toBe(4500);
    const done = ran(m, { text: REPORT }, "world_retry");
    expect(done.ok).toBe(true);
    expect(done.lastRun.retried).toBe(true);
  });
  it("all thinking under the model's own block: no useless retry, the error names the block", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    const out = ran(m, { text: "", reasoning: "hmm", requestParams: { max_tokens: 2048, block: "plugin:world", from: { max_tokens: "model" } } });
    expect(out.code).toBe("thinking-block");
    expect(out.error).toContain("2048");
    expect(out.error.endsWith("..")).toBe(false);
  });
  it("errors read as one plain sentence with a code; the provider's text stays in details", () => {
    const glm = classifyError({ error: '400 {"error":"This model always thinks and does not support disabling reasoning"}' }, null);
    expect(glm.code).toBe("reasoning-off");
    expect(glm.details).toContain("400");
    expect(classifyError({ error: "HTTP 429 rate limited" }, null).code).toBe("rate");
    expect(classifyError({ error: "401 invalid api key" }, null).code).toBe("auth");
    expect(classifyError({ text: "" }, null).code).toBe("empty");
  });
});

describe("P3: the World section's routes", () => {
  it("lists chats with a DM, skips the ones that are off and empty or gone", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "living", fromStart: true });
    m.files["world/state/gone.json"] = JSON.stringify({ settings: { level: "living" } });
    m.files["chats/c2.meta.json"] = JSON.stringify({ id: "c2", title: "Off" });
    m.files["world/state/c2.json"] = JSON.stringify({ settings: { level: "off" } });
    const list = route(m.host, "GET", "/world/chats").json.chats;
    expect(list.map((c: any) => [c.chatId, c.title, c.level, c.cards])).toEqual([["c1", "The Pass", "living", ["Odarka"]]]);
    expect(list[0].errorAt).toBe(null);
    const st = JSON.parse(m.files["world/state/c1.json"]);
    st.lastError = { at: 1234, code: "rate", message: "Rate limited" };
    m.files["world/state/c1.json"] = JSON.stringify(st);
    const failed = route(m.host, "GET", "/world/chats").json.chats[0];
    expect([failed.error, failed.errorAt]).toEqual(["rate", 1234]);
  });
  it("tests the play model: works, or the plain reason", () => {
    const m = memHost(seed());
    expect(route(m.host, "POST", "/world/test", { chatId: "c1" }).__llmPending).toBe(true);
    expect(m.requests[0]!.spec.model).toBe("c/chat");
    m.results.world_test = { text: '{"ok":true}', model: "c/chat", requestParams: { max_tokens: 1500, from: {} } };
    expect(route(m.host, "POST", "/world/test", { chatId: "c1" }).json).toMatchObject({ ok: true, model: "c/chat", from: "chat", limit: { max: 1500 } });
    m.results.world_test = { text: "Hello! How can I help?" };
    expect(route(m.host, "POST", "/world/test", { chatId: "c1" }).json).toMatchObject({ ok: false, code: "not-json" });
  });
});

describe("P3 stage 2: profiles", () => {
  it("built-in profiles give the same prompts as the levels did", () => {
    const m = memHost(seed());
    const list = route(m.host, "GET", "/world/profiles").json.profiles;
    expect(list.map((p: any) => p.id)).toEqual(["chronicler", "living", "director", "antagonist", "chaos"]);
    expect(systemFor("chronicler")).toBe(CHRONICLER_SYSTEM);
    const dir = list.find((p: any) => p.id === "director");
    expect(dir.blocks.map((b: any) => b.key)).toEqual(["keeper", "level", "shared", "event"]);
    expect(dir.output).toContain('"fronts"');
    expect(dir.changed).toBe(false);
  });
  it("a changed block reaches the run and resets alone; the event block keeps {event}", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/profiles", { id: "director", blocks: { level: "Your level: gentle director. Only kind visitors." } });
    expect(route(m.host, "PUT", "/world/profiles", { id: "director", blocks: { event: "no placeholder" } }).status).toBe(400);
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "director", fromStart: true });
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests[0]!.spec.systemPrompt).toContain("gentle director");
    // the locked output is still there
    expect(m.requests[0]!.spec.systemPrompt).toContain('"delivered"');
    const back = route(m.host, "PUT", "/world/profiles", { id: "director", blocks: { level: null } }).json.profiles;
    expect(back.find((p: any) => p.id === "director").changed).toBe(false);
    expect(m.files["world/profiles/director.json"]).toBeUndefined();
  });
  it("an own profile runs on its base, with its event text; removing it falls back to the base", () => {
    const m = memHost(seed());
    const made = route(m.host, "PUT", "/world/profiles", { name: "Noir City", base: "antagonist", blocks: { event: "[NOIR: {event}]" }, defaults: { everyN: 2 } }).json;
    expect(made.id).toBe("p-noir-city");
    const v = route(m.host, "PUT", "/world/settings", { chatId: "c1", profile: "p-noir-city", fromStart: true }).json;
    expect([v.settings.level, v.settings.profile, v.settings.everyN, v.profile]).toEqual(["antagonist", "p-noir-city", 2, "p-noir-city"]);
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    st.event = { text: "A shot in the rain.", hard: true, sent: 0 };
    m.files["world/state/c1.json"] = JSON.stringify(st);
    const out = llmRequest({ key: "reply", request: { sessionId: "c1", messages: [{ role: "user", content: "hi" }] }, turn: { op: "send" } }, m.host) as any;
    expect(out.messages.at(-1).content).toContain("[NOIR: A shot in the rain.]");
    expect(route(m.host, "GET", "/world/profiles").json.profiles.find((p: any) => p.id === "p-noir-city").chats).toBe(1);
    route(m.host, "DELETE", "/world/profiles", undefined, { id: "p-noir-city" });
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests.at(-1)!.spec.systemPrompt).toContain(defaultBlocks("antagonist").level);
    expect(route(m.host, "DELETE", "/world/profiles", undefined, { id: "director" }).status).toBe(400);
  });
});

describe("P3 stage 2: records by hand", () => {
  it("add, change, retire, restore and delete; the book follows", () => {
    const m = memHost(seed());
    const add = route(m.host, "PUT", "/world/records", { chatId: "c1", op: "add", record: { kind: "place", name: "Salt Mill", aliases: ["the mill"], text: "An old mill by the river." } }).json.records;
    expect(add[0]).toMatchObject({ name: "Salt Mill", by: "player", status: "active" });
    const book = () => JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book().entries[0].keys).toEqual(["Salt Mill", "the mill"]);
    expect(JSON.parse(m.files["chats/c1.meta.json"]!).worldBookId).toBe("world-c1");
    expect(route(m.host, "PUT", "/world/records", { chatId: "c1", op: "add", record: { name: "the mill", text: "x" } }).status).toBe(409);
    const id = add[0].id;
    route(m.host, "PUT", "/world/records", { chatId: "c1", op: "update", record: { id, text: "A burnt mill by the river." } });
    expect(book().entries[0].content).toBe("Salt Mill: A burnt mill by the river.");
    route(m.host, "PUT", "/world/records", { chatId: "c1", op: "retire", record: { id } });
    expect(book().entries[0].memo).toContain("retired");
    route(m.host, "PUT", "/world/records", { chatId: "c1", op: "restore", record: { id } });
    const gone = route(m.host, "PUT", "/world/records", { chatId: "c1", op: "delete", record: { id } }).json.records;
    expect(gone).toEqual([]);
    expect(book().entries).toEqual([]);
  });
});

describe("the app's library", () => {
  it("never lists a chat's world book", () => {
    expect(libraryBooks([{ id: "a" }, { id: "world-c1", ownerChatId: "c1" }, { id: "b", ownerChatId: "" }]).map((b) => b.id)).toEqual(["a", "b"]);
  });
});

// ---------- the engine plugin: scope, fork, delete ----------
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "world-"));
  for (const d of ["characters/odarka", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Odarka", description: "A witch.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function fsHost() {
  return {
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
}
const call = (method: string, p: string, body?: unknown) => (eng.handleRoute({ method, path: p, query: {}, body }, fsHost()) as { json: Record<string, any> }).json;
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const readRel = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

function worldChat(): string {
  const id = call("POST", "/chats", { characterId: "odarka" }).meta.id as string;
  const lines = STORY.map((m) => JSON.stringify(m));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), lines.join("\n") + "\n");
  const meta = readRel("chats/" + id + ".meta.json");
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ ...meta, worldBookId: "world-" + id }));
  fs.writeFileSync(path.join(root, "lorebooks", "world-" + id + ".json"), JSON.stringify({
    id: "world-" + id, name: "World", ownerChatId: id, settings: {},
    entries: [{ uid: 1, title: "Maksym", keys: ["Maksym"], content: "Maksym keeps the toll.", enabled: true, order: 100, position: "before_char", memo: "world:n1" }],
  }));
  fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
  fs.writeFileSync(path.join(root, "world", "state", id + ".json"), JSON.stringify({ ...emptyState(id), lastKey: "m4#0" }));
  return id;
}
const allText = (p: any) => [p.systemPrompt ?? "", ...p.messages.map((m: any) => m.content)].join("\n");

describe("engine plugin: the chat's world book", () => {
  it("is scanned in its own chat, though no lorebookIds name it, and not in another", () => {
    const id = worldChat();
    expect(allText(call("POST", "/prompt/preview", { chatId: id, userText: "Where is Maksym?" }))).toContain("Maksym keeps the toll.");
    const other = call("POST", "/chats", { characterId: "odarka" }).meta.id as string;
    expect(allText(call("POST", "/prompt/preview", { chatId: other, userText: "Where is Maksym?" }))).not.toContain("Maksym keeps the toll.");
  });

  it("a fork gets its own copy; the DM's place moves back to the fork point", () => {
    const id = worldChat();
    const fork = call("POST", "/chats/" + id + "/fork", { messageId: "m2" }).meta as { id: string; worldBookId: string };
    expect(fork.worldBookId).toBe("world-" + fork.id);
    expect(readRel("lorebooks/world-" + fork.id + ".json")).toMatchObject({ id: "world-" + fork.id, ownerChatId: fork.id });
    expect(readRel("world/state/" + fork.id + ".json")).toMatchObject({ chatId: fork.id, bookId: "world-" + fork.id, lastKey: "m2#0" });
    expect(readRel("lorebooks/world-" + id + ".json").ownerChatId).toBe(id);
  });

  it("the prompt board lists the DM's events where its level sends any, and the chat can switch them off", () => {
    const id = worldChat();
    const board = () => (call("POST", "/prompt/preview", { chatId: id, userText: "Hi" }).sources.board as { key: string; state: string }[]).filter((b) => b.key === "plugin:world");
    expect(board()).toEqual([]);
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), JSON.stringify({ ...emptyState(id), settings: { level: "director", everyN: 5 } }));
    expect(board().map((b) => b.state)).toEqual(["on"]);
    call("PATCH", "/chats/" + id, { promptBoard: { v: 1, off: ["plugin:world"] } });
    expect(board().map((b) => b.state)).toEqual(["off"]);
  });

  it("goes with its chat when the chat is deleted", () => {
    const id = worldChat();
    call("DELETE", "/chats/" + id);
    expect(exists("lorebooks/world-" + id + ".json")).toBe(false);
    expect(exists("world/state/" + id + ".json")).toBe(false);
  });
});

describe("parseReply takes the answer, not a draft", () => {
  it("the last object with the reply's keys wins; braces in thinking and fences are skipped", () => {
    expect(parseReply('I think {maybe} then {"draft": 1}\n```json\n{"add":[],"summary":"final"}\n```')).toEqual({ add: [], summary: "final" });
    expect(parseReply('{"add":[{"name":"A","text":"x"}],"summary":"one"} and later {"summary":"two"}')!.summary).toBe("two");
    expect(parseReply('{"foo":1}')).toEqual({ foo: 1 });
    expect(parseReply("no json")).toBe(null);
  });
});

describe("P3 stage 2: profile options", () => {
  it("code clocks: the model's ticks are ignored, every N replies read each front moves by 1", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/profiles", { id: "living", options: { clocks: "code", clockEvery: 2, eventByClock: true } });
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "living", fromStart: true });
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    st.fronts = [{ id: "f1", name: "Toll war", goal: "Close the pass", clock: 0, size: 6, status: "active" }];
    m.files["world/state/c1.json"] = JSON.stringify(st);
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    const input = m.requests[0]!.spec.messages[0].content;
    expect(input).toContain("never send tick ops");
    expect(input).toContain("f1 Toll war: early");
    m.results.world = { text: JSON.stringify({ add: [], fronts: [{ op: "tick", id: "f1", by: 2 }], summary: "x" }) };
    route(m.host, "POST", "/world/update", { chatId: "c1" }, {}, { upTo: "m4#0" });
    const after = JSON.parse(m.files["world/state/c1.json"]!);
    // 3 replies read (m0, m2, m4): one tick, one reply carried over; the model's +2 ignored
    expect(after.fronts[0].clock).toBe(1);
    expect(after.clockReplies).toBe(1);
    expect(route(m.host, "GET", "/world/profiles").json.profiles.find((p: any) => p.id === "living").options).toEqual({ clocks: "code", clockEvery: 2, eventByClock: true, deck: false, dice: "off", diceStat: "auto", diceChance: 25, diceTilt: "even", diceLife: 0 });
  });
});

// ---------- on by default, the chat's limits, places and the records' cadence (#176) ----------
describe("the DM on by default", () => {
  it("a chat with no state file switches itself on at its first run and starts near the end", () => {
    const many = Array.from({ length: 14 }, (_, i) => msg(i, i % 2 ? "user" : "char", "Line " + i));
    const m = memHost(seed(many));
    const out = route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(out.__llmPending).toBe(true);
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.settings.level).toBe("chronicler");
    // the last everyN * 2 = 10 messages are read, not the whole story
    expect(st.lastKey).toBe("m3#0");
    expect(m.requests[0]!.spec.messages[0].content).toContain("Line 13");
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("Line 3");
  });

  it("a switch-off sticks; a save that only touches the dice does not switch the chat off", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", diceShow: true });
    expect(JSON.parse(m.files["world/state/c1.json"]!).settings).toMatchObject({ level: "chronicler", diceShow: true });
    const off = memHost(seed());
    route(off.host, "PUT", "/world/settings", { chatId: "c1", level: "off" });
    expect(route(off.host, "POST", "/world/update", { chatId: "c1", auto: true }).json).toEqual({ ok: true, skipped: "off" });
  });

  it("a chat whose only card is an assistant stays off until the player switches it on", () => {
    const m = memHost({ ...seed(), "characters/odarka/card.json": JSON.stringify({ name: "Odarka", extensions: { molfar_card_type: "assistant" } }) });
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json.settings.level).toBe("off");
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "off" });
    expect(m.files["world/state/c1.json"]).toBeUndefined();
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler" }).json.settings.level).toBe("chronicler");
  });
});

describe("the chat's limits in the prompt", () => {
  it("names the changes and the text size of this chat", () => {
    const st = emptyState("c1");
    st.settings.changesMax = 6;
    st.settings.textMax = 1200;
    const text = systemFor("chronicler", st.settings);
    expect(text).toContain("At most 6 changes in one reply, each text at most 1200 characters.");
    expect(systemFor("chronicler")).toContain("At most 12 changes in one reply, each text at most 900 characters.");
    expect(defaultBlocks("chronicler").keeper).toContain("{changes}");
  });

  it("bounds the settings", () => {
    const s = normalizeState({ settings: { level: "chronicler", textMax: 5, changesMax: 99, recordsEveryN: 500 } }, "c1").settings;
    expect([s.textMax, s.changesMax, s.recordsEveryN]).toEqual([200, 20, 50]);
  });
});

describe("runs when the story leaves a place, and the records' own cadence", () => {
  const scene = (place: string, stagnant = 0) => ({ key: "m4#0", direction: "social", before: null, stagnant, place });

  it("dueReason: place changed since the last run, two replies at least, once", () => {
    const st = emptyState("c1");
    st.settings = { ...st.settings, level: "director", everyN: 10 };
    st.lastPlace = placeKey("The Kitchen");
    expect(dueReason(st, STORY, scene("the kitchen."))).toBe(null);
    expect(dueReason(st, STORY, scene("The Garden"))).toBe("place");
    st.settings.onPlace = false;
    expect(dueReason(st, STORY, scene("The Garden"))).toBe(null);
    st.settings.onPlace = true;
    // one reply since the last run: not enough
    st.lastKey = "m3#0";
    expect(dueReason(st, STORY, scene("The Garden"))).toBe(null);
    // the first run ever has no place to compare with
    st.lastKey = null;
    delete st.lastPlace;
    expect(dueReason(st, STORY, scene("The Garden"))).toBe(null);
  });

  it("recordsEveryN: records-only runs between the full runs; the full count stays", () => {
    const st = emptyState("c1");
    st.settings = { ...st.settings, level: "director", everyN: 10, recordsEveryN: 2 };
    st.lastKey = "m1#0";
    st.levelKey = "m1#0";
    // m2, m3, m4: 2 replies since the last run
    expect(dueReason(st, STORY, null)).toBe("records");
    expect(dueIn(st, STORY)).toBe(0);
    st.lastKey = "m3#0";
    expect(dueReason(st, STORY, null)).toBe(null);
    expect(dueIn(st, STORY)).toBe(1);
    // the full run is still counted from its own key
    st.settings.everyN = 2;
    expect(dueReason(st, STORY, null)).toBe("every");
  });

  it("a place run writes records only: no fronts or event in the prompt, the full count and the place move on", () => {
    const m = memHost({ ...seed(), "dashboard/state/c1.json": dashState({ "m4#0": calm("social", { clock: { place: "The Garden" } }) }) });
    m.files["world/state/c1.json"] = JSON.stringify({ ...emptyState("c1"), lastPlace: "kitchen", settings: { ...emptyState("c1").settings, level: "director", everyN: 10, textMax: 900 } });
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.spec.systemPrompt).not.toContain("fronts");
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("Fronts");
    m.results.world = { text: REPORT, model: "c/dm" };
    route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash);
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.log.at(-1).reason).toBe("place");
    expect(st.lastPlace).toBe("the garden");
    expect(st.levelKey).toBeUndefined();
    expect(st.lastKey).toBe("m4#0");
  });
});

// ---------- places, things and what characters wear and carry (#176, step 2) ----------
describe("places, things and carry", () => {
  const place = (name: string, extra: Record<string, unknown> = {}) => ({ kind: "place", name, aliases: [], text: "A place.", ...extra });
  const base = () => {
    const st = emptyState("c1");
    st.settings.carrySource = "dm";
    applyReport(st, { add: [
      place("Mei's apartment", { aliases: ["Mei's place", "apartment"], text: "Third floor, a window on the courtyard. She lives alone." }),
      place("Living room", { size: "spot", inside: "Mei's apartment", text: "A sofa and a shelf." }),
      place("Café Lumen"),
      { kind: "thing", name: "Ceramic vase", aliases: ["vase"], text: "Bought at the market.", place: "Living room" },
      { kind: "thing", name: "Loyalty card", text: "Stamps.", place: "Café Lumen" },
      { kind: "thing", name: "Spare key", text: "Opens the apartment.", holder: "Ren" },
    ] }, { cards: [], userName: "", now: 1 });
    return st;
  };

  it("a place may be a spot inside another; a thing has a holder or a place, never both", () => {
    const st = base();
    expect(st.entities.map((e) => [e.name, e.size ?? null, e.inside ?? null, e.holder ?? null, e.place ?? null])).toEqual([
      ["Mei's apartment", null, null, null, null], ["Living room", "spot", "Mei's apartment", null, null], ["Café Lumen", null, null, null, null],
      ["Ceramic vase", null, null, null, "Living room"], ["Loyalty card", null, null, null, "Café Lumen"], ["Spare key", null, null, "Ren", null],
    ]);
    // the vase goes into Mei's bag: the new holder drops the place; later it is put on the cafe table: "" clears the holder
    applyReport(st, { update: [{ id: "n4", holder: "Mei Saito" }] }, { cards: [], userName: "", now: 2 });
    expect(st.entities[3]).toMatchObject({ holder: "Mei Saito" });
    expect(st.entities[3]!.place).toBeUndefined();
    applyReport(st, { update: [{ id: "n4", holder: "", place: "Café Lumen" }] }, { cards: [], userName: "", now: 3 });
    expect(st.entities[3]).toMatchObject({ place: "Café Lumen" });
    expect(st.entities[3]!.holder).toBeUndefined();
    // a person or a fact has no place; size only counts for places
    applyReport(st, { add: [{ kind: "person", name: "Ren the courier", text: "x", place: "Café Lumen", size: "spot" }] }, { cards: [], userName: "", now: 4 });
    expect(st.entities.at(-1)!.place).toBeUndefined();
    const again = normalizeState(JSON.parse(JSON.stringify(st)), "c1");
    expect(again.entities[1]).toMatchObject({ size: "spot", inside: "Mei's apartment" });
  });

  it("carry: only the user and the cards, a sent list replaces the old, a list left out stays", () => {
    const st = emptyState("c1");
    const ctx = { cards: ["Mei Saito"], userName: "Taras", now: 5 };
    expect(applyCarry(st, [
      { who: "mei saito", wearing: ["grey coat", "Grey coat", "black jeans"], carried: [{ what: "leather bag", where: "left shoulder" }, "phone"], nearby: ["umbrella"] },
      { who: "Ren", wearing: ["scarf"] },
      { who: "Taras", wearing: ["jacket"] },
    ], ctx)).toEqual(["Mei Saito", "Taras"]);
    expect(st.carry["Mei Saito"]).toEqual({ wearing: ["grey coat", "black jeans"], carried: [{ what: "leather bag", where: "left shoulder" }, { what: "phone" }], nearby: ["umbrella"], at: 5 });
    expect(st.carry.Ren).toBeUndefined();
    expect(applyCarry(st, [{ who: "Mei Saito", wearing: ["grey coat", "black jeans"] }], ctx)).toEqual([]);
    expect(applyCarry(st, [{ who: "Mei Saito", wearing: ["red raincoat"] }], ctx)).toEqual(["Mei Saito"]);
    expect(st.carry["Mei Saito"]!.carried.length).toBe(2);
    // a person with nothing left is dropped
    applyCarry(st, [{ who: "Taras", wearing: [], carried: [], nearby: [] }], ctx);
    expect(st.carry.Taras).toBeUndefined();
    // the state file keeps it, cut to the bounds
    const long = normalizeState({ carry: { A: { wearing: Array.from({ length: 30 }, (_, i) => "item " + i), carried: [], nearby: [] } } }, "c1");
    expect(long.carry.A!.wearing.length).toBe(12);
  });

  it("findPlace and hereOf: the scene's place, its parent, the things here and asleep, what people carry", () => {
    const st = base();
    st.carry = { "Mei Saito": { wearing: ["grey coat"], carried: [{ what: "leather bag", where: "left shoulder" }], nearby: ["umbrella"], at: 1 } };
    expect(findPlace(st.entities, "the living room.")!.name).toBe("Living room");
    expect(findPlace(st.entities, "Mei's apartment, living room")!.name).toBe("Living room");
    expect(findPlace(st.entities, "Mei's place")!.name).toBe("Mei's apartment");
    expect(findPlace(st.entities, "a highway")).toBe(null);
    const h = hereOf(st, { place: "Living room", present: ["Mei Saito"] }, []);
    expect([h.place!.name, h.parent!.name]).toEqual(["Living room", "Mei's apartment"]);
    expect(h.things.map((t) => t.name)).toEqual(["Ceramic vase"]);
    // the key is held by Ren, who is not in the scene: asleep, like the card in the cafe
    expect(h.asleep.map((t) => t.name).sort()).toEqual(["Loyalty card", "Spare key"]);
    expect(Object.keys(h.carry)).toEqual(["Mei Saito"]);
    // in the cafe the vase is not here
    const cafe = hereOf(st, { place: "Café Lumen", present: ["Mei Saito"] }, []);
    expect(cafe.things.map((t) => t.name)).toEqual(["Loyalty card"]);
    expect(cafe.asleep.map((t) => t.name)).toContain("Ceramic vase");
    // Ren arrives: the key wakes up with him
    expect(hereOf(st, { place: "Café Lumen", present: ["Mei Saito", "Ren"] }, []).held.Ren!.map((t) => t.name)).toEqual(["Spare key"]);
  });

  it("hereInsert: short, names place, things and clothes; nothing when nothing is known", () => {
    const st = base();
    st.carry = { "Mei Saito": { wearing: ["grey coat", "black jeans"], carried: [{ what: "leather bag", where: "left shoulder" }], nearby: [], at: 1 } };
    const text = hereInsert(hereOf(st, { place: "Living room", present: ["Mei Saito", "Ren"] }, []))!;
    expect(text).toContain("Place: Living room, in Mei's apartment.");
    expect(text).toContain("Third floor, a window on the courtyard.");
    expect(text).toContain("Things here: Ceramic vase.");
    expect(text).toContain("Mei Saito wears grey coat, black jeans; has leather bag (left shoulder).");
    expect(text).toContain("Ren has Spare key.");
    expect(text.length).toBeLessThanOrEqual(900);
    expect(hereInsert(hereOf(emptyState("c1"), { place: "A highway", present: [] }, []))).toBe(null);
  });

  it("the prompt names the place, the carry and the new rules; the keeper no longer skips what is worn", () => {
    const st = base();
    st.carry = { "Mei Saito": { wearing: ["grey coat"], carried: [], nearby: [], at: 1 } };
    const text = dmInput({ cards: ["Mei Saito"], userName: "Taras", entities: st.entities, msgs: STORY.slice(3), place: "Living room", carry: st.carry });
    expect(text).toContain("Where the scene is now (from the scene tracker): Living room.");
    expect(text).toContain("n2 · place · Living room [spot of Mei's apartment]");
    expect(text).toContain("n6 · thing · Spare key [held by Ren]");
    expect(text).toContain("Mei Saito: wearing grey coat; carried -; nearby -");
    expect(systemFor("chronicler")).toContain("carry: for the user's character");
    expect(systemFor("director")).toContain('"carry":[{"who"');
  });
});

describe("step 2 on the routes and the hook", () => {
  const dash = (place: string) => ({ "dashboard/state/c1.json": dashState({ "m4#0": calm("social", { clock: { place }, present: ["Odarka"] }) }) });
  const seeded = (place = "Living room") => {
    const m = memHost({ ...seed(), ...dash(place) });
    const st = emptyState("c1");
    st.settings = { ...st.settings, level: "chronicler", carrySource: "dm" };
    applyReport(st, { add: [
      { kind: "place", name: "Living room", aliases: ["living room"], text: "A sofa and a shelf." },
      { kind: "thing", name: "Ceramic vase", text: "Bought at the market.", place: "Living room" },
    ] }, { cards: [], userName: "", now: 1 });
    st.carry = { Odarka: { wearing: ["grey coat"], carried: [], nearby: [], at: 1 } };
    m.files["world/state/c1.json"] = JSON.stringify(st);
    return m;
  };
  const req = () => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go in." }] }, turn: { op: "send" } });

  it("the hook adds 'World · here' at the chronicler level too, and stays quiet when nothing matches or the board mutes it", () => {
    const out = llmRequest(req(), seeded().host) as { messages: { content: string }[]; promptSources: any };
    expect(out.promptSources.parts[0]).toMatchObject({ kind: "plugin", label: "World · here" });
    expect(out.messages[1]!.content).toContain("Things here: Ceramic vase.");
    expect(out.messages[1]!.content).toContain("Odarka wears grey coat.");
    // a place with no record and nobody carrying anything: nothing
    const quiet = memHost({ ...seed(), ...dash("A highway") });
    quiet.files["world/state/c1.json"] = JSON.stringify({ ...emptyState("c1"), settings: { ...emptyState("c1").settings, level: "chronicler" } });
    expect(llmRequest(req(), quiet.host)).toBe(null);
    const muted = seeded();
    muted.files["chats/c1.meta.json"] = JSON.stringify({ id: "c1", characterId: "odarka", promptBoard: { v: 1, off: ["plugin:world"] } });
    expect(llmRequest(req(), muted.host)).toBe(null);
    // the DM off still shows the world here (the book fills whatever the level, #185); only events and dice need a level
    const off = seeded();
    off.files["world/state/c1.json"] = JSON.stringify({ ...JSON.parse(off.files["world/state/c1.json"]!), settings: { level: "off" } });
    const offOut = llmRequest(req(), off.host) as any;
    expect(offOut.promptSources.parts.map((x: any) => x.label)).toEqual(["World · here"]);
  });

  it("sweep (#185): code offers the DM places and things the scene tracker met that the book lacks; asked once, also with the DM off", () => {
    const state = emptyState("c1");
    state.settings = { ...state.settings, level: "chronicler", everyN: 50 };
    state.lastKey = null;
    state.entities = [{ id: "n1", kind: "place", name: "School", aliases: [], text: "", status: "active" } as any];
    const scene = {
      key: "m4#0",
      direction: "social",
      before: null,
      stagnant: 2,
      place: "school corridor",
      present: ["Sina"],
      chars: {},
      places: ["school corridor", "the locked changing room", "School"],
      objects: [{ item: "pink soft knit cardigan", where: "on the bench" }],
      left: { place: "the locked changing room", objects: [{ item: "gym bag", where: "by the door" }] },
    };
    const c = sweepCandidates(state, scene as any);
    // "School" is in the book; the corridor and the changing room are not; two words of a name count as the same name
    expect(c.places).toEqual(["school corridor", "the locked changing room"]);
    expect(c.things).toEqual([
      { name: "pink soft knit cardigan", where: "on the bench", place: "school corridor" },
      { name: "gym bag", where: "by the door", place: "the locked changing room" },
    ]);
    const msgs = [msg(1, "user", "Hi"), msg(2, "char", "Hello"), msg(3, "user", "Go"), msg(4, "char", "Here.")];
    expect(dueReason(state, msgs as any, scene as any)).toBe("sweep");
    // nothing to offer: nothing is due
    expect(dueReason(state, msgs as any, { ...scene, places: [], objects: [], left: null } as any)).toBe(null);
    // the DM off: the sweep is still due, nothing else
    const off = { ...state, settings: { ...state.settings, level: "off" } };
    expect(dueReason(off as any, msgs as any, scene as any)).toBe("sweep");
    expect(dueReason(off as any, msgs as any, { ...scene, places: [], objects: [], left: null } as any)).toBe(null);
    // the DM reads the candidates, and what was offered is not offered again
    const input = dmInput({ cards: [], userName: "You", entities: state.entities, msgs: [], level: "chronicler", sweep: c } as any);
    expect(input).toContain("Named in the story by the scene tracker, with no record yet");
    expect(input).toContain("Places: school corridor; the locked changing room.");
    expect(input).toContain("Things: pink soft knit cardigan (on the bench, in school corridor); gym bag (by the door, in the locked changing room).");
    const asked = { ...state, sweepAsked: ["school corridor", "the locked changing room", "pink soft knit cardigan", "gym bag"] };
    expect(sweepCandidates(asked as any, scene as any)).toEqual({ places: [], things: [] });
    expect(normalizeState({ ...asked }, "c1").sweepAsked).toEqual(asked.sweepAsked);
  });

  it("a sweep with the DM off: a records-only run lists the names, the book fills, and nothing is asked twice (#185)", () => {
    const m = memHost({
      ...seed(),
      "world/config.json": JSON.stringify({ model: "c/dm" }),
      "dashboard/state/c1.json": dashState({
        "m2#0": { ...calm("domestic"), clock: { place: "the toll hut" } },
        "m4#0": { ...calm("domestic"), clock: { place: "the Red Tower gate" } },
      }),
    });
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "off" });
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    expect(first.__llmPending).toBe(true);
    const asked = m.requests[0]!.spec.messages[0].content as string;
    expect(asked).toContain("Places: the Red Tower gate; the toll hut.");
    // off reads as the chronicler: no fronts, no event in the run
    expect(m.requests[0]!.spec.systemPrompt).toContain("world keeper");
    expect(asked).not.toContain("Fronts");
    m.results.world = { text: JSON.stringify({ add: [{ kind: "place", name: "Toll hut", aliases: ["the toll hut"], text: "A hut by the pass." }], summary: "They reach the hut." }), model: "c/dm" };
    const done = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash).json;
    expect(done).toMatchObject({ ok: true, changes: 1 });
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.settings.level).toBe("off");
    expect(st.entities.map((e: any) => e.name)).toEqual(["Toll hut"]);
    // both names were offered, so neither is asked again, though only one became a record
    expect(st.sweepAsked).toEqual(["the Red Tower gate", "the toll hut"]);
    expect(route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }).json).toEqual({ ok: true, skipped: "nothing new" });
  });

  it("GET /world/here: the place, the things, who holds what, the carry and what the last run changed", () => {
    const m = seeded();
    const out = route(m.host, "GET", "/world/here", undefined, { chatId: "c1" }).json;
    expect(out).toMatchObject({ on: true, scenePlace: "Living room", present: ["Odarka", "Taras"] });
    expect(out.place.name).toBe("Living room");
    expect(out.things.map((t: any) => t.name)).toEqual(["Ceramic vase"]);
    expect(out.carry.Odarka.wearing).toEqual(["grey coat"]);
    expect(out.changed).toEqual({ at: 0, ids: [], carry: [] });
  });

  it("a run applies places, things and carry, counts the visit, remembers what changed, and the peek shows the fields", () => {
    const m = seeded("Café Lumen");
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    st.lastPlace = "living room";
    st.settings.level = "chronicler";
    m.files["world/state/c1.json"] = JSON.stringify(st);
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.spec.messages[0].content).toContain("Where the scene is now (from the scene tracker): Café Lumen.");
    m.results.world = { text: JSON.stringify({
      add: [{ kind: "place", name: "Café Lumen", aliases: ["the cafe"], text: "A small cafe with blue chairs." }],
      update: [{ id: "n2", holder: "Odarka" }],
      carry: [{ who: "Odarka", wearing: ["grey coat"], carried: [{ what: "vase in paper", where: "arms" }] }],
      summary: "The vase left the shelf.",
    }), model: "c/dm" };
    const done = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash).json;
    expect(done).toMatchObject({ ok: true, changes: 3 });
    const after = JSON.parse(m.files["world/state/c1.json"]!);
    expect(after.entities.find((e: any) => e.name === "Ceramic vase")).toMatchObject({ holder: "Odarka" });
    expect(after.entities.find((e: any) => e.name === "Ceramic vase").place).toBeUndefined();
    expect(after.entities.find((e: any) => e.name === "Café Lumen").visits).toBe(1);
    expect(after.carry.Odarka.carried).toEqual([{ what: "vase in paper", where: "arms" }]);
    expect(after.lastChange).toMatchObject({ ids: ["n3", "n2"], carry: ["Odarka"] });
    const peek = route(m.host, "GET", "/world/peek", undefined, { chatId: "c1" }).json.records;
    expect(peek.find((r: any) => r.name === "Ceramic vase")).toMatchObject({ holder: "Odarka" });
    expect(peek.find((r: any) => r.name === "Café Lumen")).toMatchObject({ visits: 1 });
    // the book says where the vase is
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book.entries.find((e: any) => e.title === "Ceramic vase").content).toBe("Ceramic vase (held by Odarka): Bought at the market.");
  });

  it("the player edits a record's place and holder by hand", () => {
    const m = seeded();
    const peek = route(m.host, "PUT", "/world/records", { chatId: "c1", op: "update", record: { id: "n2", holder: "Odarka" } }).json.records;
    expect(peek.find((r: any) => r.name === "Ceramic vase")).toMatchObject({ holder: "Odarka" });
    const added = route(m.host, "PUT", "/world/records", { chatId: "c1", op: "add", record: { kind: "place", name: "Kitchen", text: "Small.", size: "spot", inside: "Living room" } }).json.records;
    expect(added.find((r: any) => r.name === "Kitchen")).toMatchObject({ size: "spot", inside: "Living room" });
  });
});

describe("a place bound to a background (#176)", () => {
  it("only the player binds it; a spot without one takes its place's; the planner gets the place's other names", () => {
    const m = memHost({ ...seed(), "dashboard/state/c1.json": dashState({ "m4#0": calm("social", { clock: { place: "Living room" }, present: ["Odarka"] }) }) });
    const st = emptyState("c1");
    st.settings = { ...st.settings, level: "chronicler" };
    applyReport(st, { add: [
      { kind: "place", name: "Mei's apartment", aliases: ["apartment"], text: "Third floor.", background: "bg-1" },
      { kind: "place", name: "Living room", size: "spot", inside: "Mei's apartment", text: "A sofa.", background: "bg-2" },
    ] }, { cards: [], userName: "", now: 1 });
    // the DM's own reply never sets it
    expect(st.entities.every((e) => e.background === undefined)).toBe(true);
    m.files["world/state/c1.json"] = JSON.stringify(st);
    const put = (record: Record<string, unknown>) => route(m.host, "PUT", "/world/records", { chatId: "c1", op: "update", record }).json.records;
    expect(put({ id: "n2", background: "bg-room" }).find((r: any) => r.name === "Living room").background).toBe("bg-room");
    expect(route(m.host, "GET", "/world/here", undefined, { chatId: "c1" }).json.background).toBe("bg-room");
    // the spot loses its own: the place's one stays
    put({ id: "n1", background: "bg-home" });
    put({ id: "n2", background: "" });
    expect(route(m.host, "GET", "/world/here", undefined, { chatId: "c1" }).json.background).toBe("bg-home");
    // an id that cannot be an id is dropped
    expect(put({ id: "n2", background: "../x" }).find((r: any) => r.name === "Living room").background).toBeUndefined();
    const input = backgroundsInput({ places: route(m.host, "GET", "/world/backgrounds", undefined, { chatId: "c1" }).json.places, variants: 1, direction: "", lang: "" });
    expect(input).toContain("Mei's apartment (also called: apartment)");
    expect(input).toContain("Living room [inside Mei's apartment]");
  });
});

describe("who keeps what the characters wear and hold (#176)", () => {
  const snap = { "m4#0": calm("social", { clock: { place: "Living room" }, present: ["Odarka"], chars: { Odarka: { outfit: "grey coat, black jeans and white sneakers.", holding: "coffee cup" } } } as any) };
  const mem = () => {
    const m = memHost({ ...seed(), "dashboard/state/c1.json": dashState(snap) });
    const st = emptyState("c1");
    st.settings = { ...st.settings, level: "chronicler" };
    applyReport(st, { add: [{ kind: "place", name: "Living room", text: "A sofa." }, { kind: "thing", name: "Spare key", text: "Opens the door.", holder: "Odarka" }] }, { cards: [], userName: "", now: 1 });
    st.carry = { Odarka: { wearing: ["old DM list"], carried: [{ what: "bag" }], nearby: [], at: 1 } };
    m.files["world/state/c1.json"] = JSON.stringify(st);
    return m;
  };

  it("splitItems and sensorCarry read the sensor's free text, in three languages", () => {
    expect(splitItems("grey coat, black jeans and white sneakers.")).toEqual(["grey coat", "black jeans", "white sneakers"]);
    expect(splitItems("сіра куртка та джинси; кеди")).toEqual(["сіра куртка", "джинси", "кеди"]);
    expect(splitItems("серое пальто и шарф")).toEqual(["серое пальто", "шарф"]);
    expect(sensorCarry({ chars: { Odarka: { outfit: "coat", holding: "cup" }, Nobody: { outfit: "", holding: "" } } })).toEqual({ Odarka: { wearing: ["coat"], carried: [], nearby: [], hands: "cup", at: 0 } });
  });

  it("by default the sensor keeps it: /world/here and the note use its lines, the DM's old list is ignored", () => {
    const m = mem();
    const out = route(m.host, "GET", "/world/here", undefined, { chatId: "c1" }).json;
    expect(out.carrySource).toBe("sensor");
    expect(out.carry.Odarka).toMatchObject({ wearing: ["grey coat", "black jeans", "white sneakers"], hands: "coffee cup" });
    expect(out.sensor.Odarka.hands).toBe("coffee cup");
    const hook = llmRequest({ key: "reply", request: { sessionId: "c1", messages: [{ role: "user", content: "Go." }] }, turn: { op: "send" } }, m.host) as any;
    const text = hook.messages[0].content as string;
    expect(text).toContain("Odarka wears grey coat, black jeans, white sneakers; holds coffee cup; has Spare key.");
    expect(text).not.toContain("old DM list");
  });

  it("the DM is not asked for carry when the sensor keeps it, and its carry in a reply is ignored", () => {
    const sensorText = systemFor("chronicler", { ...emptyState("c1").settings, carrySource: "sensor" });
    expect(sensorText).not.toContain("- carry:");
    expect(sensorText).not.toContain('"carry"');
    expect(sensorText).toContain("Do not record what the characters wear or hold in their hands");
    const dmText = systemFor("director", { ...emptyState("c1").settings, carrySource: "dm" });
    expect(dmText).toContain("- carry:");
    expect(dmText).toContain('"carry":[...]');
    const m = mem();
    const first = route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("What the characters wear and carry now");
    m.results.world = { text: JSON.stringify({ add: [], carry: [{ who: "Odarka", wearing: ["red cloak"] }], summary: "x" }), model: "c/dm" };
    route(m.host, "POST", "/world/update", { chatId: "c1" }, {}, first.stash);
    expect(JSON.parse(m.files["world/state/c1.json"]!).carry.Odarka.wearing).toEqual(["old DM list"]);
  });

  it("the switch is a setting of the chat", () => {
    const m = mem();
    route(m.host, "PUT", "/world/settings", { chatId: "c1", carrySource: "dm" });
    expect(route(m.host, "GET", "/world/here", undefined, { chatId: "c1" }).json.carry.Odarka.wearing).toEqual(["old DM list"]);
    route(m.host, "PUT", "/world/settings", { chatId: "c1", carrySource: "weird" });
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json.settings.carrySource).toBe("sensor");
  });
});

describe("a saved world's records (#176)", () => {
  it("peek and records work on a library world: add, change, delete, written back to its file", () => {
    const m = memHost(seed());
    m.files["world/library/w-abc123.json"] = JSON.stringify({ v: 1, id: "w-abc123", name: "Carpatia", description: "", at: 1, from: null, settings: { level: "director" }, entities: [
      { id: "n1", kind: "place", name: "Old market", aliases: [], text: "Stalls.", status: "active", uid: 0 },
    ], fronts: [] });
    const peek = () => route(m.host, "GET", "/world/peek", undefined, { worldId: "w-abc123" }).json.records;
    expect(peek().map((r: any) => r.name)).toEqual(["Old market"]);
    const add = route(m.host, "PUT", "/world/records", { worldId: "w-abc123", op: "add", record: { kind: "place", name: "Red Tower", text: "A tower.", size: "spot", inside: "Old market" } }).json.records;
    expect(add.map((r: any) => r.name).sort()).toEqual(["Old market", "Red Tower"]);
    route(m.host, "PUT", "/world/records", { worldId: "w-abc123", op: "update", record: { id: "n1", text: "Stalls and a well." } });
    route(m.host, "PUT", "/world/records", { worldId: "w-abc123", op: "delete", record: { id: "n2" } });
    expect(peek()).toMatchObject([{ name: "Old market", text: "Stalls and a well." }]);
    expect(JSON.parse(m.files["world/library/w-abc123.json"]!)).toMatchObject({ name: "Carpatia", settings: { level: "director" } });
    // no chat is touched: no book, no state file
    expect(m.files["lorebooks/world-c1.json"]).toBeUndefined();
    expect(route(m.host, "GET", "/world/peek", undefined, { worldId: "w-nope99" }).status).toBe(404);
    expect(route(m.host, "PUT", "/world/records", { op: "add", record: { name: "x", text: "y" } }).status).toBe(400);
  });
});
