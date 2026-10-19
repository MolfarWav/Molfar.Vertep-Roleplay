/**
 * World DM (plugins/world, #52): the chronicler records people, places and facts from the
 * story into the chat's own world book; the engine plugin scans that book in its chat only,
 * copies it on a fork and removes it with the chat; the app's library never lists it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHRONICLER_SYSTEM, applyLevel, applyReport, behindOf, defaultBlocks, classifyError, dmInput, takeUnread, dueIn, dueReason, emptyState, eventInsert, handleRoute, llmRequest, normalizeState, parseReply, sceneOf, shortText, systemFor, unreadMessages } from "../plugins/world/plugin.js";

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
    expect(s.settings).toEqual({ level: "off", everyN: 50, stagnation: 6, onTransition: true, insert: true, profile: "" });
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
    expect(applyReport(st, { add }, { cards: [], userName: "", now: 1 })).toBe(8);
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
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json).toMatchObject({ settings: { level: "off", everyN: 5 }, records: 0 });
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "off" });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "boss" }).status).toBe(400);
    const on = route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1 }).json;
    expect(on.settings).toEqual({ level: "chronicler", everyN: 1, stagnation: 6, onTransition: true, insert: true, profile: "" });
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
    expect(sceneOf(m.host.fs, "c1", STORY)).toEqual({ key: "m4#0", direction: "domestic", before: null, stagnant: 2 });
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
