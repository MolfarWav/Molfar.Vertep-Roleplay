/**
 * #490: the user corrects the Dashboard clock by hand. POST /dashboard/clock changes the newest reading; the next reading goes on
 * from it, and a time the sensor names on its own does not move it unless the player's own line states a time.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-calendar-"));
  for (const d of ["chats", "characters/aria", "dashboard", "litopys"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: { class: "ally" } } } } }));
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

function mockHost(replies: string[] = []) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; req: any }[] = [];
  let pending: { key: string; req: any }[] = [];
  const queue = replies.slice();
  const host = {
    fs: {
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
    llm: {
      request: (key: string, req: any) => {
        const s = { key, req };
        requests.push(s);
        pending.push(s);
      },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const { key } of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] = { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 };
    }
    pending = [];
  };
  return { host, requests, answer, push: (...r: string[]) => queue.push(...r) };
}

function drive(mock: ReturnType<typeof mockHost>, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as any;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host);
  }
  return out;
}
const update = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "POST", path: "/dashboard/update", body: { chatId, op: "send" } });
const view = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "GET", path: "/dashboard/state", query: { chatId, view: "1" } }).json;
const stateFile = (id: string) => path.join(root, "dashboard/state", id + ".json");
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(stateFile(id), "utf8"));

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const link = (from: string, chatId: string) => fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { [chatId]: { from, at: 1 } } }));
const reply = (o: Record<string, unknown>) => JSON.stringify(o);


const today = P.localToday();
const run = (mock: ReturnType<typeof mockHost>, chatId: string, out: Record<string, unknown>) => {
  mock.push(reply({ present: ["Aria"], ...out }));
  expect(update(mock, chatId).json.ok).toBe(true);
};
const three = () => [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Good evening.")];
const grow = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? A("m" + (i + 1), "Reply " + (i + 1)) : U("m" + (i + 1), "Line " + (i + 1))));

const clockOf = (id: string) => {
  const s = readStateFile(id);
  const keys = Object.keys(s.snapshots);
  return s.snapshots[keys[keys.length - 1]!].clock;
};
const edit = (m: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(m, { method: "POST", path: "/dashboard/clock", body: { chatId: "c1", ...body } });

describe("advanceClock after a hand edit", () => {
  const hand = { day: 2, time: "09:30", band: "morning", minutes: 0, place: null, weather: null, hand: true };
  it("keeps the user's time against a time the sensor names, and lets minutes move it", () => {
    expect(P.advanceClock(hand, { time: "16:45", minutes: 10 }, "send")).toMatchObject({ day: 2, time: "09:40", hand: true });
    expect(P.advanceClock(hand, { time: "evening" }, "send")).toMatchObject({ time: "09:30", hand: true });
  });
  it("takes a time the player's own line states, and drops the mark", () => {
    const hint = P.readTimeWords("We met at 18:30.");
    expect(hint.time).toBe("18:30");
    const out = P.withTimeHints({ time: "09:31" }, hand, hint);
    const c = P.advanceClock(hand, out, "send", hint);
    expect(c).toMatchObject({ day: 2, time: "18:30" });
    expect(c.hand).toBeUndefined();
  });
  it("is unchanged for a clock nobody edited", () => {
    const plain = { ...hand, hand: undefined };
    expect(P.advanceClock(plain, { time: "16:45" }, "send")).toMatchObject({ time: "16:45" });
  });
});

describe("POST /dashboard/clock", () => {
  it("sets the time and the day on the newest reading and marks it", () => {
    writeChat("c1", three());
    const mock = mockHost();
    run(mock, "c1", { time: "14:00", minutes: 5 });
    const r = edit(mock, { time: "09:30", day: 3 });
    expect(r.json).toMatchObject({ ok: true, clock: { time: "09:30", day: 3, band: "morning", minutes: 0, hand: true } });
    expect(clockOf("c1")).toMatchObject({ time: "09:30", day: 3, hand: true });
    expect(view(mock, "c1").view.clock).toMatchObject({ time: "09:30", day: 3, hand: true });
    // the scene line of the next reply carries it
    const turn = { op: "send", speakerName: "", targetId: "", userText: "hi" };
    const insert = P.buildInsert(mock.host.fs, "c1", turn, { injection: {} }).text as string;
    const scene = insert.split(String.fromCharCode(10)).find((l) => l.startsWith("[Background, the scene:")) ?? "";
    expect(scene).toContain("09:30");
    expect(scene).toContain("morning");
  });

  it("a day alone keeps the time; a time alone keeps the day", () => {
    writeChat("c1", three());
    const mock = mockHost();
    run(mock, "c1", { time: "14:00", day: 2 });
    expect(edit(mock, { day: 5 }).json.clock).toMatchObject({ time: "14:00", day: 5, hand: true });
    expect(edit(mock, { time: "7:05" }).json.clock).toMatchObject({ time: "07:05", day: 5, band: "morning", hand: true });
  });

  it("auto drops the mark and keeps the value", () => {
    writeChat("c1", three());
    const mock = mockHost();
    run(mock, "c1", { time: "14:00" });
    edit(mock, { time: "09:30" });
    const r = edit(mock, { auto: true });
    expect(r.json.clock.time).toBe("09:30");
    expect(r.json.clock.hand).toBeUndefined();
    expect(clockOf("c1").hand).toBeUndefined();
  });

  it("refuses a bad time or day, an empty request, a missing chat and a chat with no reading", () => {
    writeChat("c1", three());
    const mock = mockHost();
    expect(edit(mock, { time: "09:30" }).status).toBe(400); // no reading yet
    run(mock, "c1", { time: "14:00" });
    for (const body of [{ time: "25:00" }, { time: "9:60" }, { time: "noon" }, { day: 0 }, { day: 1.5 }, { day: "x" }, {}]) expect(edit(mock, body).status).toBe(400);
    expect(drive(mock, { method: "POST", path: "/dashboard/clock", body: { chatId: "nope", time: "09:30" } }).status).toBe(400);
    expect(clockOf("c1").time).toBe("14:00");
  });

  it("the next reading goes on from the edit: the sensor's own time does not move it, a time in the player's line does", () => {
    writeChat("c1", three());
    const mock = mockHost();
    run(mock, "c1", { time: "14:00", minutes: 5 });
    edit(mock, { time: "09:30" });
    // a new exchange; the sensor drifts to 16:45 and says 10 minutes passed
    writeChat("c1", [...three(), A("m4", "Tea."), U("m5", "More tea.")]);
    run(mock, "c1", { time: "16:45", minutes: 10 });
    expect(clockOf("c1")).toMatchObject({ time: "09:40", hand: true });
    // the player states a time: that is where the clock stands, and the mark goes
    writeChat("c1", [...three(), A("m4", "Tea."), U("m5", "More tea."), A("m6", "Sure."), U("m7", "We left at 18:30 sharp.")]);
    run(mock, "c1", { time: "09:45", minutes: 5 });
    const c = clockOf("c1");
    expect(c.time).toBe("18:30");
    expect(c.hand).toBeUndefined();
  });
});
