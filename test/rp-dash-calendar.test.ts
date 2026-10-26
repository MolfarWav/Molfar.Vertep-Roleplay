/**
 * #113: the Dashboard says a date and a running clock, not only "Day N". The date comes from the text when it states
 * one, else from today; the user can set it or hide it; a continued chat goes on with the earlier chat's calendar.
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

describe("calendar arithmetic", () => {
  it("reads whole dates only and adds days across months, years and leap days", () => {
    expect(P.parseYmd("2026-10-26")).toBe("2026-10-26");
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-2026", "", null, "2026-10-26T10:00"]) expect(P.parseYmd(bad)).toBeNull();
    expect(P.addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(P.addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(P.addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(P.addDays("1893-06-12", 40)).toBe("1893-07-22");
    expect(P.dateWords("2026-10-26")).toBe("Monday 26 October 2026");
  });

  it("the date of a story day follows the calendar, and is nothing when hidden or missing", () => {
    const cal = { start: "2026-10-26", src: "today" };
    expect(P.dateOf(cal, 1)).toBe("2026-10-26");
    expect(P.dateOf(cal, 3)).toBe("2026-10-28");
    expect(P.dateOf({ ...cal, off: true }, 3)).toBeNull();
    expect(P.dateOf(undefined, 1)).toBeNull();
  });
});

describe("the clock", () => {
  it("never goes back a day, and a part of the day starts a running clock marked approximate", () => {
    const t = P.advanceClock(null, { time: "evening", day: 4, minutes: 25 }, "send");
    expect(t).toMatchObject({ day: 4, time: "19:25", band: "evening", approx: true });
    // a model that writes "day 1" in a continued chat does not reset the count
    expect(P.advanceClock(t, { day: 1, minutes: 5 }, "send")).toMatchObject({ day: 4, time: "19:30" });
    // the same part of the day again: the clock stands; another part sets it to that part's start
    expect(P.advanceClock(t, { time: "evening", minutes: 5 }, "send")).toMatchObject({ time: "19:30", approx: true });
    expect(P.advanceClock(t, { time: "night" }, "send")).toMatchObject({ time: "23:00", band: "night", approx: true });
    // an exact time is not approximate, and past midnight the day moves
    const exact = P.advanceClock(t, { time: "23:40", minutes: 30 }, "send");
    expect(exact).toMatchObject({ day: 5, time: "00:10", band: "night" });
    expect(exact.approx).toBeUndefined();
    // nothing known: no clock is made up
    expect(P.advanceClock(null, { minutes: 5 }, "send").time).toBeNull();
  });
});

describe("the chat's calendar", () => {
  it("starts from today on the day the first reading found, and the date moves with the days", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { time: "evening", minutes: 10 });
    const s = readStateFile("c1");
    expect(s.calendar).toEqual({ start: today, src: "today" });
    let v = view(mock, "c1");
    expect(v.view.clock).toMatchObject({ day: 1, time: "19:10", approx: true, date: today });
    expect(v.view.calendar).toEqual({ source: "today", off: false });
    // eight hours later it is the next day
    writeChat("c1", [...three(), A("m4", "Later."), U("m5", "Sleep.")]);
    run(mock, "c1", { minutes: 600 });
    v = view(mock, "c1");
    expect(v.view.clock).toMatchObject({ day: 2, date: P.addDays(today, 1) });
    expect(v.view.scenes.every((x: any) => x.date === P.dateOf(readStateFile("c1").calendar, x.day))).toBe(true);
  });

  it("a date the text states moves the calendar; a made-up one is ignored; the user's own stands", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { date: "1893-06-12", time: "morning" });
    expect(readStateFile("c1").calendar).toEqual({ start: "1893-06-12", src: "text" });
    expect(view(mock, "c1").view.clock.date).toBe("1893-06-12");
    // not a date: nothing changes
    writeChat("c1", [...three(), A("m4", "x"), U("m5", "y")]);
    run(mock, "c1", { date: "June 13th, I think" });
    expect(readStateFile("c1").calendar.start).toBe("1893-06-12");
    // the user sets the date of today's story day; the text no longer moves it
    const set = drive(mock, { method: "POST", path: "/dashboard/calendar", body: { chatId: "c1", date: "2031-05-02" } });
    expect(set.json).toMatchObject({ ok: true, date: "2031-05-02", calendar: { source: "user", off: false } });
    writeChat("c1", [...three(), A("m4", "x"), U("m5", "y"), A("m6", "z"), U("m7", "w")]);
    run(mock, "c1", { date: "1893-06-20" });
    expect(view(mock, "c1").view.clock.date).toBe("2031-05-02");
  });

  it("the calendar route: set, hide, show, automatic again, and refuse a bad date", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { time: "day" });
    const call = (body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/calendar", body: { chatId: "c1", ...body } });
    expect(call({ date: "2031-05-02" }).json.date).toBe("2031-05-02");
    expect(view(mock, "c1").view.clock.date).toBe("2031-05-02");
    expect(call({ off: true }).json.calendar).toEqual({ source: "user", off: true });
    expect(view(mock, "c1").view.clock.date).toBeNull();
    // hidden: the model gets the day in words again
    expect(mock.host.fs.read("dashboard/state/c1.json")).toContain('"off": true');
    expect(call({ off: false }).json.calendar.off).toBe(false);
    expect(call({ date: null }).json).toMatchObject({ date: today, calendar: { source: "today" } });
    expect(call({ date: "2031-02-30" }).status).toBe(400);
    expect(drive(mock, { method: "POST", path: "/dashboard/calendar", body: { chatId: "nope" } }).status).toBe(400);
  });

  it("the sensor and the main model are told the date", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { time: "evening", minutes: 10 });
    writeChat("c1", [...three(), A("m4", "x"), U("m5", "y")]);
    run(mock, "c1", { minutes: 5 });
    const asked = mock.requests.at(-1)!.req.messages[0].content as string;
    // an approximate time is told as the part of the day only
    expect(asked).toContain(`Previous state\nEvening, day 1 (${P.dateWords(today)}).`);
    expect(mock.requests.at(-1)!.req.systemPrompt).toContain('"date": "YYYY-MM-DD"');
  });
});

describe("a chat that continues another", () => {
  it("goes on with the earlier calendar and day count, and Start clean drops them", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { time: "evening", day: 6, date: "1893-06-12" });
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    expect(view(mock, "c2").view.calendar).toEqual({ source: "text", off: false });
    run(mock, "c2", { day: 1, time: "morning" });
    const c2 = readStateFile("c2");
    expect(c2.calendar).toMatchObject({ start: "1893-06-07", src: "text" });
    expect(view(mock, "c2").view.clock).toMatchObject({ day: 6, date: "1893-06-12" });

    writeChat("c3", [A("p1", "Another start.")]);
    link("c1", "c3");
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c3", on: false } }).json.ok).toBe(true);
    expect(readStateFile("c3").calendar).toBeUndefined();
    run(mock, "c3", { time: "morning" });
    expect(readStateFile("c3").calendar).toEqual({ start: today, src: "today" });
  });
});
