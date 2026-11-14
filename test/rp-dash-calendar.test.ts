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
    // the first reading names a part of the day: the clock starts at that part's start (the minutes are not added on top)
    const t = P.advanceClock(null, { time: "evening", day: 4, minutes: 25 }, "send");
    expect(t).toMatchObject({ day: 4, time: "19:00", band: "evening", approx: true });
    // a model that writes "day 1" in a continued chat does not reset the count
    expect(P.advanceClock(t, { day: 1, minutes: 5 }, "send")).toMatchObject({ day: 4, time: "19:05" });
    // the same part of the day again: the clock stands and the minutes move it; another part sets it to that part's start
    expect(P.advanceClock(t, { time: "evening", minutes: 5 }, "send")).toMatchObject({ time: "19:05", approx: true });
    expect(P.advanceClock(t, { time: "night" }, "send")).toMatchObject({ time: "23:00", band: "night", approx: true });
    // an exact time is not approximate, and is where the clock stands; past midnight the minutes move the day
    const exact = P.advanceClock(t, { time: "23:40", minutes: 30 }, "send");
    expect(exact).toMatchObject({ day: 4, time: "23:40", band: "night" });
    expect(exact.approx).toBeUndefined();
    expect(P.advanceClock(exact, { minutes: 30 }, "send")).toMatchObject({ day: 5, time: "00:10", band: "night" });
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
    expect(v.view.clock).toMatchObject({ day: 1, time: "19:00", approx: true, date: today });
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

// a world's own calendar (#272): named months of any length, weekday names, an era, any year
describe("a world's own calendar", () => {
  const MOONS = { months: [{ name: "Frostmoon", days: 30 }, { name: "Thawmoon", days: 28 }, { name: "Greenmoon", days: 31 }], weekdays: ["Moonday", "Fireday", "Earthday"], era: "AR" };
  const present = { y: 1204, m: 3, d: 30, wd: 1 };

  it("cleanCustom keeps a sound calendar and refuses the rest", () => {
    expect(P.cleanCustom(MOONS)).toEqual(MOONS);
    expect(P.cleanCustom({ months: [{ name: "  Frost   moon ", days: 30 }] })).toEqual({ months: [{ name: "Frost moon", days: 30 }] });
    for (const bad of [null, {}, { months: [] }, { months: [{ name: "", days: 30 }] }, { months: [{ name: "A", days: 0 }] }, { months: [{ name: "A", days: 101 }] },
      { months: [{ name: "A", days: 1.5 }] }, { months: Array.from({ length: 25 }, (_, i) => ({ name: "M" + i, days: 30 })) },
      { months: [{ name: "A", days: 30 }], weekdays: Array.from({ length: 15 }, (_, i) => "D" + i) }])
      expect(P.cleanCustom(bad)).toBeNull();
    // the start must exist in the calendar
    expect(P.cleanCustomStart({ y: 1204, m: 2, d: 28 }, MOONS)).toEqual({ y: 1204, m: 2, d: 28 });
    for (const bad of [{ y: 1204, m: 2, d: 29 }, { y: 1204, m: 4, d: 1 }, { y: 1204.5, m: 1, d: 1 }, { y: 1204, m: 1, d: 0 }, { y: 2e6, m: 1, d: 1 }]) expect(P.cleanCustomStart(bad, MOONS)).toBeNull();
  });

  it("days walk through the months, the year turns over, and the weekdays cycle", () => {
    const cal = { custom: MOONS, cstart: { y: 1204, m: 1, d: 29 }, src: "user" };
    expect(P.customDateOf(cal, 1)).toMatchObject({ y: 1204, m: 1, d: 29, text: "Moonday 29 Frostmoon 1204 AR" });
    expect(P.customDateOf(cal, 3)).toMatchObject({ m: 2, d: 1, month: "Thawmoon", weekday: "Earthday" });
    expect(P.customDateOf(cal, 4).weekday).toBe("Moonday");
    // 30 + 28 + 31 = 89 days a year: day 62 is the last of Greenmoon... day 63 the first of the next year
    expect(P.customDateOf({ ...cal, cstart: { y: 1204, m: 1, d: 1 } }, 89)).toMatchObject({ y: 1204, m: 3, d: 31 });
    expect(P.customDateOf({ ...cal, cstart: { y: 1204, m: 1, d: 1 } }, 90)).toMatchObject({ y: 1205, m: 1, d: 1 });
    // a year before zero is still a year, a hidden calendar says nothing, a broken one says nothing
    expect(P.customDateOf({ ...cal, cstart: { y: -3, m: 3, d: 31 } }, 2)).toMatchObject({ y: -2, m: 1, d: 1 });
    expect(P.customDateOf({ ...cal, off: true }, 1)).toBeNull();
    expect(P.customDateOf({ custom: { months: [] }, cstart: { y: 1, m: 1, d: 1 } }, 1)).toBeNull();
    expect(P.dateOf(cal, 1)).toBeNull();
    expect(P.dateTextOf(cal, 1)).toBe("Moonday 29 Frostmoon 1204 AR");
    expect(P.dateTextOf({ start: "2031-05-02", src: "user" }, 1)).toBe(P.dateWords("2031-05-02"));
    expect(P.dateTextOf(null, 1)).toBeNull();
  });

  it("customStartFor puts day 1 so that today's story day has the date the user gave", () => {
    const custom = P.cleanCustom(MOONS);
    for (const day of [1, 2, 5, 40, 200]) {
      const start = P.customStartFor(custom, present, day);
      expect(P.customDateOf({ custom, cstart: start }, day)).toMatchObject({ y: 1204, m: 3, d: 30, weekday: "Fireday" });
    }
  });

  it("the route sets it, the clock and the prompt carry it, the text does not move it, automatic puts the real calendar back", () => {
    const mock = mockHost();
    writeChat("c1", three());
    run(mock, "c1", { time: "evening", minutes: 10 });
    const call = (body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/calendar", body: { chatId: "c1", ...body } });
    const set = call({ custom: MOONS, present });
    expect(set.json).toMatchObject({ ok: true, date: null, dateText: "Fireday 30 Greenmoon 1204 AR", calendar: { source: "user", off: false, custom: MOONS } });
    const v = view(mock, "c1").view;
    expect(v.clock).toMatchObject({ day: 1, date: null, dateText: "Fireday 30 Greenmoon 1204 AR" });
    expect(v.scenes.every((x: any) => x.dateText && x.date === null)).toBe(true);
    // a Gregorian date in the text does not move it
    writeChat("c1", [...three(), A("m4", "x"), U("m5", "y")]);
    run(mock, "c1", { date: "1893-06-20", minutes: 5 });
    expect(readStateFile("c1").calendar.custom).toEqual(MOONS);
    expect(mock.requests.at(-1)!.req.messages[0].content as string).toContain("day 1 (Fireday 30 Greenmoon 1204 AR)");
    // hidden and shown again, still its own
    expect(call({ off: true }).json.calendar).toMatchObject({ off: true, custom: MOONS });
    expect(view(mock, "c1").view.clock.dateText).toBeUndefined();
    expect(call({ off: false }).json.dateText).toBe("Fireday 30 Greenmoon 1204 AR");
    // refused: a bad calendar, a date that does not exist in it
    expect(call({ custom: { months: [] }, present }).status).toBe(400);
    expect(call({ custom: MOONS, present: { y: 1204, m: 2, d: 30 } }).status).toBe(400);
    expect(call({ custom: MOONS }).status).toBe(400);
    // a real date replaces it, and automatic goes back to today's
    expect(call({ date: "2031-05-02" }).json).toMatchObject({ date: "2031-05-02", dateText: P.dateWords("2031-05-02") });
    call({ custom: MOONS, present });
    expect(call({ custom: null }).json).toMatchObject({ date: today, calendar: { source: "today" } });
    expect(readStateFile("c1").calendar.custom).toBeUndefined();
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
    // the earlier chat ended on the evening of day 6 and the new one opens on "a new morning": that is day 7 (#207);
    // the sensor's own "day 1" is a count it cannot know, and never sets the day back
    expect(view(mock, "c2").view.clock).toMatchObject({ day: 7, date: "1893-06-13" });

    writeChat("c3", [A("p1", "Another start.")]);
    link("c1", "c3");
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c3", on: false } }).json.ok).toBe(true);
    expect(readStateFile("c3").calendar).toBeUndefined();
    run(mock, "c3", { time: "morning" });
    expect(readStateFile("c3").calendar).toEqual({ start: today, src: "today" });
  });
});
