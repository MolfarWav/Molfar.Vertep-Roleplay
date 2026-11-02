/**
 * #207: how the Dashboard clock reaches the chat prompt. The line "[Background, the scene: ...]" is built from the
 * snapshot before the reply being written; a story that jumps to the next morning must move the day on, and a scene
 * where the user's character is alone must still carry the clock.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-clock-"));
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
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const three = () => [U("m1", "Hello."), A("m2", "I will not run."), U("m3", "Promise?")];
const said = (who: string, text: string, kind = "promise", extra: Record<string, unknown> = {}) => ({ who, text, kind, ...extra });


const sceneOf = (text: string) => text.split(String.fromCharCode(10)).find((l) => l.startsWith("[Background, the scene:")) ?? "";
const turn = { op: "send", speakerName: "", targetId: "", userText: "hi" };

describe("advanceClock: a stated time earlier than the clock is the next day (#207)", () => {
  const clock = (time: string, day = 1) => ({ day, time, minutes: 0, band: null, place: null, weather: null });
  it("'the next morning' after 23:30 moves the day on and does not rewind the same day", () => {
    const c = P.advanceClock(clock("23:30"), { time: "morning", minutes: 0 }, "send");
    expect(c.day).toBe(2);
    expect(c.time).toBe("09:00");
  });
  it("an exact time far before the clock is the next day; just after midnight too", () => {
    expect(P.advanceClock(clock("23:00"), { time: "07:00" }, "send")).toMatchObject({ day: 2, time: "07:00" });
    expect(P.advanceClock(clock("23:00"), { time: "00:30" }, "send")).toMatchObject({ day: 2, time: "00:30" });
  });
  it("a small step back is a correction of the same day", () => {
    expect(P.advanceClock(clock("23:00"), { time: "22:00" }, "send")).toMatchObject({ day: 1, time: "22:00" });
  });
  it("a day the sensor states is not counted twice", () => {
    expect(P.advanceClock(clock("23:00"), { day: 2, time: "07:00" }, "send")).toMatchObject({ day: 2, time: "07:00" });
  });
  it("the same part of the day, or a later one, never moves the day", () => {
    expect(P.advanceClock(clock("19:20"), { time: "evening", minutes: 5 }, "send")).toMatchObject({ day: 1, time: "19:25" });
    expect(P.advanceClock(clock("10:00"), { time: "evening" }, "send")).toMatchObject({ day: 1, time: "19:00" });
    expect(P.advanceClock(clock("10:00"), { time: "19:40" }, "send")).toMatchObject({ day: 1, time: "19:40" });
  });
});

describe("the clock line in the reply prompt (#207)", () => {
  it("carries the date, the exact time and the part of the day of the snapshot before the reply", () => {
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "Still here.")]);
    const mock = mockHost([reply({ present: ["Aria"], time: "19:40", day: 1, date: "2026-10-26", place: "the tavern" })]);
    update(mock, "c1");
    const line = sceneOf(P.buildInsert(mock.host.fs, "c1", turn, { injection: {} }).text);
    expect(line).toContain("Monday 26 October 2026, 19:40, evening");
    expect(line).toContain("the tavern");
  });

  it("a swipe takes the clock of the snapshot before the swiped reply, not of the reply itself", () => {
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then.")]);
    const mock = mockHost([
      reply({ present: ["Aria"], time: "19:40", day: 1, date: "2026-10-26" }),
      reply({ present: ["Aria"], minutes: 240 }),
    ]);
    update(mock, "c1");
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "Later."), A("m4", "Night falls.")]);
    update(mock, "c1");
    const send = sceneOf(P.buildInsert(mock.host.fs, "c1", turn, { injection: {} }).text);
    const swipe = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "swipe", speakerName: "", targetId: "m4", userText: "" }, { injection: {} }).text);
    expect(send).toContain("23:40");
    expect(swipe).toContain("19:40");
    expect(swipe).not.toContain("23:40");
  });

  it("an hour worked out from the part of the day is told as 'about', so the story model does not invent its own (#207)", () => {
    writeChat("c1", [U("m1", "Hello."), A("m2", "Good morning."), U("m3", "Hm.")]);
    const mock = mockHost([reply({ present: ["Aria"], time: "morning", day: 1, date: "2026-10-26" })]);
    update(mock, "c1");
    expect(sceneOf(P.buildInsert(mock.host.fs, "c1", turn, { injection: {} }).text)).toContain("Monday 26 October 2026, about 09:00, morning");
  });

  it("is still there when the user's character is alone (nobody present)", () => {
    writeChat("c1", [U("m1", "I walk on."), A("m2", "The road is empty."), U("m3", "I keep walking.")]);
    const mock = mockHost([reply({ present: [], time: "14:10", day: 3, date: "2026-10-28", place: "the north road", weather: "wind" })]);
    update(mock, "c1");
    const ins = P.buildInsert(mock.host.fs, "c1", turn, { injection: {} });
    expect(ins).not.toBeNull();
    expect(sceneOf(ins.text)).toContain("Wednesday 28 October 2026");
    expect(sceneOf(ins.text)).toContain("14:10");
    expect(sceneOf(ins.text)).toContain("the north road");
    expect(ins.focus).toEqual([]);
  });
});
