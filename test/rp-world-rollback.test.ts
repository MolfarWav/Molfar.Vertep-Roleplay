/**
 * World DM rollback (#75): a swiped or deleted reply takes the world's changes with it. Before a run changes the world, a
 * snapshot is kept, keyed by the message the run reads up to; when that message leaves the chat's line the snapshot goes
 * back, the book is written again, an event the reply carried is due again, and the player's hand edits stay.
 */
import { describe, expect, it } from "bun:test";
import { coreOf, emptyState, eventLost, firstGone, handleRoute, llmRequest, loadSnaps, reconcile } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
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
    llm: { request: () => {}, results },
  };
  return { host, files, results };
}
type M = ReturnType<typeof memHost>;

const msg = (i: number, role: string, text: string, swipe = 0) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe });
const STORY = [
  msg(0, "char", "Odarka stirs the pot."),
  msg(1, "user", "Who lives up the pass?"),
  msg(2, "char", "Old Maksym keeps the toll at the Red Tower."),
  msg(3, "user", "Then we go at night."),
  msg(4, "char", "Odarka nods. The tower's lantern glows above the pines."),
];
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
const seed = (msgs: object[] = STORY) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": jsonl(msgs),
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  "settings.json": JSON.stringify({ model: "c/default" }),
});

const route = (m: M, method: string, p: string, body?: unknown, query: Record<string, string> = {}) =>
  handleRoute({ method, path: p, query, body }, m.host) as any;
const chat = (m: M) => m.files["chats/c1.jsonl"]!.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const setChat = (m: M, msgs: object[]) => { m.files["chats/c1.jsonl"] = jsonl(msgs); };
const state = (m: M) => JSON.parse(m.files["world/state/c1.json"]!);
const names = (m: M) => state(m).entities.map((e: any) => e.name);
const book = (m: M) => JSON.parse(m.files["lorebooks/world-c1.json"]!).entries.map((e: any) => e.title);

const REPORT1 = JSON.stringify({ add: [
  { kind: "person", name: "Maksym", aliases: ["Old Maksym"], text: "Keeps the toll at the Red Tower." },
  { kind: "place", name: "Red Tower", text: "A tower up the pass." },
], summary: "The tower." });
const REPORT2 = JSON.stringify({ add: [{ kind: "group", name: "Bandits", text: "They hold the lower road." }], summary: "Bandits." });

/** A chat that has had two runs: the first read m4, a reply m5 came, the second read m5. */
function twoRuns(): M {
  const m = memHost(seed());
  route(m, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
  m.results.world = { text: REPORT1 };
  route(m, "POST", "/world/update", { chatId: "c1" });
  setChat(m, [...STORY, msg(5, "char", "Bandits hold the lower road.")]);
  m.results.world = { text: REPORT2 };
  route(m, "POST", "/world/update", { chatId: "c1" });
  return m;
}

describe("snapshots", () => {
  it("each run keeps the world as it stood, keyed by the message it read up to", () => {
    const m = twoRuns();
    const snaps = loadSnaps(m.host.fs, "c1");
    expect(snaps.map((s: any) => s.upTo)).toEqual(["m4#0", "m5#0"]);
    expect(snaps[0].core.entities).toEqual([]);
    expect(snaps[1].core.entities.map((e: any) => e.name)).toEqual(["Maksym", "Red Tower"]);
    expect(snaps[1].core.lastKey).toBe("m4#0");
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });

  it("the core leaves out settings, the run history and the tokens spent", () => {
    const core = coreOf(JSON.parse(twoRuns().files["world/state/c1.json"]!));
    expect(Object.keys(core)).not.toContain("settings");
    expect(Object.keys(core)).not.toContain("log");
    expect(Object.keys(core)).not.toContain("usage");
    expect(Object.keys(core)).toContain("entities");
  });

  it("keeps the newest eight", () => {
    const m = memHost(seed());
    route(m, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    const msgs: object[] = [...STORY];
    for (let i = 0; i < 11; i++) {
      msgs.push(msg(5 + i, i % 2 ? "user" : "char", "More story " + i));
      setChat(m, msgs);
      m.results.world = { text: JSON.stringify({ add: [{ kind: "fact", name: "Fact " + i, text: "Something " + i }] }) };
      route(m, "POST", "/world/update", { chatId: "c1" });
    }
    const snaps = loadSnaps(m.host.fs, "c1");
    expect(snaps.length).toBe(8);
    expect(snaps.at(-1)!.upTo).toBe("m15#0");
  });
});

describe("a deleted reply", () => {
  it("takes its records, its book entries and its read position with it", () => {
    const m = twoRuns();
    setChat(m, STORY); // m5 deleted
    const out = route(m, "POST", "/world/rollback", { chatId: "c1" }).json;
    expect(out).toEqual({ ok: true, undone: 1, event: false });
    expect(names(m)).toEqual(["Maksym", "Red Tower"]);
    expect(state(m).lastKey).toBe("m4#0");
    expect(book(m)).toEqual(["Maksym", "Red Tower"]);
    expect(loadSnaps(m.host.fs, "c1").map((s: any) => s.upTo)).toEqual(["m4#0"]);
    // the run history says so, and keeps what it cost
    expect(state(m).log.map((r: any) => [r.key, !!r.undone])).toEqual([["m4#0", false], ["m5#0", true]]);
    expect(state(m).usage.runs).toBe(2);
  });

  it("deleting two replies puts back the older world", () => {
    const m = twoRuns();
    setChat(m, STORY.slice(0, 2)); // m2..m5 gone
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(2);
    expect(names(m)).toEqual([]);
    expect(state(m).lastKey).toBe(null);
    expect(book(m)).toEqual([]);
  });

  it("the next run reads the story again from the older point", () => {
    const m = twoRuns();
    setChat(m, [...STORY, msg(6, "char", "A different reply: the toll keeper laughs.")]);
    m.results.world = { text: JSON.stringify({ add: [{ kind: "fact", name: "Laughter", text: "He laughs." }], summary: "x" }) };
    const out = route(m, "POST", "/world/update", { chatId: "c1" }).json;
    expect(out.ok).toBe(true);
    // Bandits came from the reply that is gone; Laughter from the new one
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Laughter"]);
    expect(state(m).lastKey).toBe("m6#0");
  });

  it("an id given out before is not given out again", () => {
    const m = twoRuns();
    const next = state(m).nextId;
    setChat(m, STORY);
    route(m, "POST", "/world/rollback", { chatId: "c1" });
    expect(state(m).nextId).toBe(next);
  });
});

describe("a swiped reply", () => {
  it("another swipe showing undoes the run that read the first one", () => {
    const m = twoRuns();
    setChat(m, [...STORY, msg(5, "char", "A second take.", 1)]);
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(1);
    expect(names(m)).toEqual(["Maksym", "Red Tower"]);
  });

  it("a reply about to be written again (drop) undoes the run that read it", () => {
    const m = twoRuns();
    expect(route(m, "POST", "/world/rollback", { chatId: "c1", drop: "m5" }).json.undone).toBe(1);
    expect(names(m)).toEqual(["Maksym", "Red Tower"]);
  });

  it("a reply that nothing read is left alone", () => {
    const m = twoRuns();
    expect(route(m, "POST", "/world/rollback", { chatId: "c1", drop: "m6" }).json).toEqual({ ok: true, undone: 0, event: false });
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });
});

describe("what stays", () => {
  it("a record the player changed by hand since the run", async () => {
    const m = twoRuns();
    await new Promise((r) => setTimeout(r, 5));
    route(m, "PUT", "/world/records", { chatId: "c1", op: "update", record: { id: "n1", text: "Keeps the toll. Drinks." } });
    setChat(m, STORY);
    route(m, "POST", "/world/rollback", { chatId: "c1" });
    expect(state(m).entities.find((e: any) => e.id === "n1").text).toBe("Keeps the toll. Drinks.");
    expect(book(m)).toEqual(["Maksym", "Red Tower"]);
  });

  it("a record the player added by hand, and one the DM made that the player then edited", async () => {
    const m = twoRuns();
    await new Promise((r) => setTimeout(r, 5));
    route(m, "PUT", "/world/records", { chatId: "c1", op: "add", record: { kind: "fact", name: "House rule", text: "No swords in the hall." } });
    route(m, "PUT", "/world/records", { chatId: "c1", op: "update", record: { id: "n3", text: "They hold the lower road. Led by Ira." } });
    setChat(m, STORY);
    route(m, "POST", "/world/rollback", { chatId: "c1" });
    expect(names(m).sort()).toEqual(["Bandits", "House rule", "Maksym", "Red Tower"]);
    // the next record the DM makes does not take an id the player's record has
    const ids = state(m).entities.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state(m).nextId).toBeGreaterThan(Math.max(...ids.map((i: string) => Number(i.slice(1)))));
  });

  it("a record the player deleted stays deleted", async () => {
    const m = twoRuns();
    await new Promise((r) => setTimeout(r, 5));
    route(m, "PUT", "/world/records", { chatId: "c1", op: "delete", record: { id: "n2" } });
    setChat(m, [...STORY, msg(5, "char", "Bandits hold the lower road.", 1)]);
    route(m, "POST", "/world/rollback", { chatId: "c1" });
    expect(names(m)).toEqual(["Maksym"]);
    expect(book(m)).toEqual(["Maksym"]);
  });

  it("the settings, and the player's choice of model, level and counts", () => {
    const m = twoRuns();
    route(m, "PUT", "/world/settings", { chatId: "c1", everyN: 3 });
    setChat(m, STORY);
    route(m, "POST", "/world/rollback", { chatId: "c1" });
    expect(state(m).settings).toMatchObject({ level: "chronicler", everyN: 3 });
  });
});

describe("safe by default", () => {
  it("nothing changes while every message a run read is still on the line", () => {
    const m = twoRuns();
    const before = m.files["world/state/c1.json"];
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json).toEqual({ ok: true, undone: 0, event: false });
    expect(m.files["world/state/c1.json"]).toBe(before);
  });

  it("an empty read of the chat is a failed read, not a chat with nothing in it", () => {
    const m = twoRuns();
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(reconcile(m.host.fs, st, [], {})).toEqual({ undone: 0, event: false });
    expect(firstGone(loadSnaps(m.host.fs, "c1"), [], "")).toBe(-1);
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });

  it("a chat with no world, a bad id, a missing chat", () => {
    const m = memHost(seed());
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json).toEqual({ ok: true, undone: 0, event: false });
    expect(m.files["world/state/c1.json"]).toBeUndefined();
    expect(route(m, "POST", "/world/rollback", { chatId: "../x" }).status).toBe(400);
    expect(route(m, "POST", "/world/rollback", { chatId: "nochat" }).status).toBe(404);
  });

  it("an answer for a message that went away while the model worked is dropped", () => {
    const m = memHost(seed());
    route(m, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    const first = route(m, "POST", "/world/update", { chatId: "c1" });
    expect(first.__llmPending).toBe(true);
    // the reply the run was pinned to is swiped away meanwhile
    setChat(m, [...STORY.slice(0, 4), msg(4, "char", "Another take.", 1)]);
    m.results.world = { text: REPORT1 };
    const done = handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1" }, stash: first.stash }, m.host) as any;
    expect(done.json).toEqual({ ok: true, skipped: "story changed" });
    expect(names(m)).toEqual([]);
  });
});

describe("housekeeping does not wipe the world", () => {
  it("deleting old history from the top (delete above) keeps every record", () => {
    const m = twoRuns();
    setChat(m, chat(m).slice(3)); // m0..m2 gone, the run that read m4 and the one that read m5 still have their messages; m4 stays
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(0);
    // even when the message a run read is among the deleted ones
    setChat(m, chat(m).slice(2)); // m3, m4 gone too: the first run's message is gone, the second run's is not
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(0);
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });

  it("trimming everything the runs read still keeps the world", () => {
    const m = twoRuns();
    setChat(m, [msg(5, "char", "Bandits hold the lower road."), msg(6, "user", "Then we run.")].slice(1));
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(0);
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });

  it("a reply deleted after the top was trimmed still goes back", () => {
    const m = twoRuns();
    setChat(m, chat(m).slice(2)); // m2.. kept
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(0);
    setChat(m, chat(m).slice(0, -1)); // m5 deleted
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(1);
    expect(names(m)).toEqual(["Maksym", "Red Tower"]);
  });

  it("reading the other swipes of an old reply leaves the world alone", () => {
    const m = twoRuns();
    setChat(m, chat(m).map((x: any) => (x.id === "m4" ? { ...x, swipe: 1, text: "An older reply, another take." } : x)));
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json.undone).toBe(0);
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
  });
});

describe("the event", () => {
  const withEvent = (msgs: object[], extra: Record<string, unknown> = {}) => memHost({
    ...seed(msgs),
    "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level: "director", everyN: 5, stagnation: 6, onTransition: true, insert: true },
      event: { text: "A knock at the door.", hard: true, sent: 0, retried: false }, ...extra }),
  });
  const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go at night." }] }, turn: { op } });
  const sentEvent = (out: unknown) => JSON.stringify(out || "").includes("WORLD EVENT");

  it("notes the message the reply follows", () => {
    const m = withEvent(STORY);
    expect(sentEvent(llmRequest(req(), m.host))).toBe(true);
    expect(state(m).event).toMatchObject({ sent: 1, after: "m4#0" });
  });

  it("a deleted reply: the event rides the next one", () => {
    const m = withEvent(STORY);
    llmRequest(req(), m.host);
    setChat(m, [...STORY, msg(5, "char", "A knock. Odarka opens.")]);
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json).toEqual({ ok: true, undone: 0, event: false });
    setChat(m, STORY); // the reply is deleted
    expect(route(m, "POST", "/world/rollback", { chatId: "c1" }).json).toEqual({ ok: true, undone: 0, event: true });
    expect(state(m).event).toEqual({ text: "A knock at the door.", hard: true, sent: 0, retried: false });
    expect(sentEvent(llmRequest(req(), m.host))).toBe(true);
  });

  it("a swiped reply: the new swipe carries the event again", () => {
    const m = withEvent(STORY);
    llmRequest(req(), m.host);
    setChat(m, [...STORY, msg(5, "char", "A knock. Odarka opens.")]);
    // the reply m5 is written again: the request comes with the reply in the chat and op swipe
    expect(sentEvent(llmRequest(req("swipe"), m.host))).toBe(true);
    expect(state(m).event).toMatchObject({ sent: 1, after: "m4#0" });
  });

  it("a kept reply keeps the event delivered", () => {
    const m = withEvent(STORY);
    llmRequest(req(), m.host);
    setChat(m, [...STORY, msg(5, "char", "A knock. Odarka opens.")]);
    expect(llmRequest(req(), m.host)).toBe(null);
    expect(state(m).event.sent).toBe(1);
  });

  it("an event sent before this existed is never called lost", () => {
    expect(eventLost({ text: "x", sent: 1 } as any, STORY, "")).toBe(false);
    expect(eventLost({ text: "x", sent: 0, after: "m4#0" } as any, STORY, "")).toBe(false);
    expect(eventLost({ text: "x", sent: 1, after: "m4#0" } as any, STORY, "")).toBe(true);
    expect(eventLost({ text: "x", sent: 1, after: "m1#0" } as any, STORY, "")).toBe(false);
    expect(eventLost({ text: "x", sent: 1, after: "m1#0" } as any, STORY, "m2")).toBe(true);
    expect(eventLost({ text: "x", sent: 1, after: "gone#0" } as any, STORY, "")).toBe(true);
  });

  it("the swipe also takes back what the runs read of the reply (the llmRequest hook)", () => {
    const m = twoRuns();
    expect(names(m)).toEqual(["Maksym", "Red Tower", "Bandits"]);
    llmRequest(req("swipe"), m.host);
    expect(names(m)).toEqual(["Maksym", "Red Tower"]);
    expect(book(m)).toEqual(["Maksym", "Red Tower"]);
  });
});
