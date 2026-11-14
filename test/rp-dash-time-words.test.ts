/**
 * Molfar.Vertep#406: the Dashboard clock follows the time the chat states. Code reads the explicit phrases of the player (how long,
 * what time, a jump of days) in Ukrainian, Russian and English, a named time is where the clock stands (minutes are not added on
 * top), an invented day is not taken, and the scene line of the next reply carries the jump the player has just written.
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

const clock = (time: string, day = 1, approx = false) => ({ day, time, minutes: 0, band: null, place: null, weather: null, ...(approx ? { approx: true } : {}) });
const none = P.readTimeWords("");

describe("readTimeWords: the time the story text states, outside direct speech (Molfar.Vertep#406)", () => {
  const read = (text: string) => P.readTimeWords(text);

  it("reads how long, in Ukrainian, Russian and English", () => {
    expect(read("*Через півгодини я пішов до кафе.*").minutes).toBe(30);
    expect(read("Я пішов до кафе через півгодини").minutes).toBe(30);
    expect(read("*Вышел оттуда через 5 минут и отправился в спальню.*").minutes).toBe(5);
    expect(read("*Спустя два часа она вернулась.*").minutes).toBe(120);
    expect(read("Через годину він повернувся.").minutes).toBe(60);
    expect(read("He left. Twenty minutes later it started to rain.").minutes).toBe(20);
    expect(read("After 3 hours they stopped.").minutes).toBe(180);
    expect(read("Минуло п'ять хвилин.").minutes).toBe(5);
    expect(read("*Спустя буквально пару минут он вернулся.*").minutes).toBe(2);
    expect(read("*Через пару часов она позвонила.*").minutes).toBe(120);
  });

  it("half an hour is half an hour, not an hour and half an hour", () => {
    expect(read("Half an hour later, he left.").minutes).toBe(30);
    expect(read("An hour and a half later, he left.").minutes).toBe(90);
  });

  it("reads a time of day and the next day", () => {
    expect(read("*На наступний день, о 9:30, Арія прокинулась.*")).toMatchObject({ time: "09:30", days: 1 });
    expect(read("*Наступного ранку він встав.*")).toMatchObject({ days: 1, band: "morning", time: null });
    expect(read("*Которая прервалась только на следующее утро.*")).toMatchObject({ days: 1, band: "morning" });
    expect(read("The next morning at 9 am it rained.")).toMatchObject({ time: "09:00", days: 1, band: "morning" });
    expect(read("*Вони зустрілися о 9 вечора.*").time).toBe("21:00");
    expect(read("*Прокинувся о 3 ночі.*").time).toBe("03:00");
    expect(read("He came at 14:20 and left at 15:05.").time).toBe("15:05");
  });

  it("reads days passed", () => {
    expect(read("Три дні потому все змінилося. Через три дні вони поїхали.").days).toBe(3);
    expect(read("Three days later, they arrived.").days).toBe(3);
    expect(read("Через тиждень вона написала.").days).toBe(7);
    expect(read("It was day 5 of the trip.").dayNo).toBe(5);
  });

  it("ignores direct speech, so a promise is not time that passed", () => {
    expect(read('"Приходь через годину о 9:30" - *сказав він і вийшов.*').hits).toEqual([]);
    expect(read("«Через годину буду» — *кинув він.*").hits).toEqual([]);
    expect(read("— Через годину буду, — сказав він.\n*Він вийшов.*").hits).toEqual([]);
    expect(read('He said "see you at 9:30 tomorrow, in an hour" and left.').hits).toEqual([]);
  });

  it("does not take other words for time, and reads text a model writes with braille blanks", () => {
    expect(read("*Через дорогу стояла машина. В 2 раза больше.*").hits).toEqual([]);
    expect(read("Он пришёл после обеда и ушёл после работы.").hits).toEqual([]);
    expect(read("Слова⠀падают⠀на⠀пол⠀через⠀минуту⠀тишины").minutes).toBe(1);
  });

  it("has nothing for a text without time words", () => {
    expect(none).toMatchObject({ minutes: 0, time: null, days: 0, dayNo: 0, hits: [] });
  });
});

describe("advanceClock: a time the text names is where the clock stands (Molfar.Vertep#406)", () => {
  it("does not add the minutes to a named time: 09:00 and 480 minutes is 09:00, not 17:00", () => {
    // from a real chat: "the next morning" and "minutes: 480" for the night's sleep
    const c = P.advanceClock(clock("17:00", 3), { time: "09:30", day: 4, minutes: 480 }, "send", P.readTimeWords("*Наступного дня, о 9:30, він встав.*"));
    expect(c).toMatchObject({ day: 4, time: "09:30", band: "morning" });
    const w = P.advanceClock(clock("00:54", 3, true), { time: "morning", minutes: 480 }, "send", none);
    // the minutes land inside the morning: that moment (00:54 + 8 h), not the start of the morning
    expect(w).toMatchObject({ day: 3, time: "08:54", band: "morning", approx: true });
  });

  it("an exact time that is the Previous state's own time is a copy: the minutes move it", () => {
    expect(P.advanceClock(clock("19:04"), { time: "19:04", minutes: 5 }, "send", none)).toMatchObject({ time: "19:09" });
    // but the same exact time after an approximate one is a time the text gave
    expect(P.advanceClock(clock("19:00", 1, true), { time: "19:00", minutes: 5 }, "send", none)).toMatchObject({ time: "19:00" });
    expect(P.advanceClock(clock("19:00", 1, true), { time: "19:00", minutes: 5 }, "send", none).approx).toBeUndefined();
  });

  it("a part of the day the minutes reach is that moment, not the start of the part", () => {
    expect(P.advanceClock(clock("07:00"), { time: "late morning", minutes: 200 }, "send", none)).toMatchObject({ day: 1, time: "10:20", band: "late morning", approx: true });
    // minutes that do not reach it: the start of the part
    expect(P.advanceClock(clock("07:00"), { time: "evening", minutes: 20 }, "send", none)).toMatchObject({ time: "19:00", band: "evening" });
    // across midnight, the day moves once
    expect(P.advanceClock(clock("23:00", 2), { time: "night", minutes: 90 }, "send", none)).toMatchObject({ day: 3, time: "00:30" });
    expect(P.advanceClock(clock("23:00", 2), { time: "night", day: 3, minutes: 90 }, "send", none)).toMatchObject({ day: 3, time: "00:30" });
  });

  it("how far the clock moved is what the minutes field shows", () => {
    expect(P.advanceClock(clock("17:00", 3), { time: "09:30", day: 4, minutes: 3 }, "send", P.readTimeWords("Наступного дня о 9:30")).minutes).toBe(720);
    expect(P.advanceClock(clock("10:00"), { time: "10:40", minutes: 3 }, "send", none).minutes).toBe(40);
  });

  it("an invented day is not taken: sleeping through a night is not a new day", () => {
    // from a real chat: "day 3" and "late morning" after the story went to sleep at night in day 2
    const slept = P.advanceClock(clock("00:25", 2, true), { time: "late morning", day: 3, minutes: 480 }, "send", none);
    expect(slept).toMatchObject({ day: 2, time: "11:00", band: "late morning" });
    // the text says the day jumped: taken
    expect(P.advanceClock(clock("17:00", 2), { time: "19:00", day: 3 }, "send", P.readTimeWords("*Наступного дня, о 19:00, вони зустрілися.*"))).toMatchObject({ day: 3, time: "19:00" });
    // the clock passed midnight: taken
    expect(P.advanceClock(clock("23:00", 2), { time: "07:00", day: 3 }, "send", none)).toMatchObject({ day: 3, time: "07:00" });
  });

  it("a jump of more than a day needs the text behind it", () => {
    expect(P.advanceClock(clock("12:00", 2), { day: 7 }, "send", none).day).toBe(3);
    expect(P.advanceClock(clock("12:00", 2), { day: 7 }, "send", P.readTimeWords("Five days later, they met.")).day).toBe(7);
    expect(P.advanceClock(clock("12:00", 2), { day: 7 }, "send", P.readTimeWords("It was day 7.")).day).toBe(7);
    // the first reading of a chat sets the count as it is read; a call with no reading of the text (undefined) is not checked
    expect(P.advanceClock(null, { day: 4 }, "send", none).day).toBe(4);
    expect(P.advanceClock(clock("12:00", 2), { day: 7 }, "send").day).toBe(7);
  });
});

describe("withTimeHints: what the text says fills what the sensor missed", () => {
  it("a stated duration beats the sensor's guess, and a time it names is the time", () => {
    const hint = P.readTimeWords("*Через півгодини я пішов до кафе.*");
    expect(P.withTimeHints({ minutes: 3 }, clock("19:00"), hint)).toMatchObject({ minutes: 30 });
    expect(P.withTimeHints({ minutes: 45 }, clock("19:00"), hint)).toMatchObject({ minutes: 45 });
    expect(P.withTimeHints({}, clock("19:00"), P.readTimeWords("*Наступного дня, о 9:30.*"))).toMatchObject({ time: "09:30", day: 2 });
    // the sensor's own day, when it is further, stands (the clamp is advanceClock's)
    expect(P.withTimeHints({ day: 5 }, clock("19:00"), P.readTimeWords("Через два дні."))).toMatchObject({ day: 5 });
  });

  it("a part of the day the sensor guessed is dropped when the text only says how long", () => {
    const o = P.withTimeHints({ time: "evening", minutes: 3 }, clock("19:10"), P.readTimeWords("Через годину вона пішла."));
    expect(o.time).toBeUndefined();
    expect(o.minutes).toBe(60);
    // an exact time the sensor read from the text stays
    expect(P.withTimeHints({ time: "20:10", minutes: 3 }, clock("19:10"), P.readTimeWords("Через годину вона пішла.")).time).toBe("20:10");
  });

  it("'the next morning' right after midnight is the same calendar day's morning", () => {
    const hint = P.settleHint(clock("00:54", 3), P.readTimeWords("*Квартира затихла до наступного ранку.*"));
    expect(hint.days).toBe(0);
    expect(P.advanceClock(clock("00:54", 3), P.withTimeHints({ day: 4, minutes: 480 }, clock("00:54", 3), hint), "send", hint)).toMatchObject({ day: 3, time: "08:54", band: "morning" });
    // in the evening it is the next day
    const evening = P.settleHint(clock("22:00", 3), P.readTimeWords("*Квартира затихла до наступного ранку.*"));
    expect(evening.days).toBe(1);
    expect(P.advanceClock(clock("22:00", 3), P.withTimeHints({ minutes: 480 }, clock("22:00", 3), evening), "send", evening)).toMatchObject({ day: 4, time: "09:00" });
  });

  it("nothing found: the report is untouched", () => {
    const out = { minutes: 4, place: "hall" };
    expect(P.withTimeHints(out, clock("19:00"), none)).toBe(out);
    expect(P.withTimeHints(out, clock("19:00"), undefined)).toBe(out);
  });
});

describe("the sensor run and the reply prompt follow the player's words about time (Molfar.Vertep#406)", () => {
  const eveningThen = () => {
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then.")]);
    const mock = mockHost([reply({ present: ["Aria"], time: "19:00", day: 1, date: "2026-10-26", place: "the tavern" })]);
    update(mock, "c1");
    return mock;
  };

  it("the sensor input carries the phrases code found, as hints", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*Через півгодини я пішов до кафе.*"), A("m4", "Ok.")]);
    mock.push(reply({ present: ["Aria"], minutes: 3 }));
    update(mock, "c1");
    const input = String(mock.requests.at(-1)!.req.messages[0].content);
    expect(input).toContain("Time words");
    expect(input).toContain('"через півгодини" = 30 minutes');
  });

  it("a stated half hour moves the clock even when the sensor guessed 3 minutes", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*Через півгодини я пішов до кафе.*"), A("m4", "Ok.")]);
    mock.push(reply({ present: ["Aria"], minutes: 3 }));
    update(mock, "c1");
    expect(view(mock, "c1").view.clock).toMatchObject({ day: 1, time: "19:30" });
  });

  it("'the next day, 9:30' is 09:30 on the next day, not 17:00 (the sensor added 480 minutes)", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*На наступний день, о 9:30, я прокинувся.*"), A("m4", "Ok.")]);
    mock.push(reply({ present: ["Aria"], time: "morning", minutes: 480 }));
    update(mock, "c1");
    expect(view(mock, "c1").view.clock).toMatchObject({ day: 2, time: "09:30", date: "2026-10-27" });
  });

  it("a reply's own narration is a hint for the sensor but does not move the clock by itself", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "Fine."), A("m4", "Через годину стемніє, подумала вона.")]);
    mock.push(reply({ present: ["Aria"], minutes: 4 }));
    update(mock, "c1");
    expect(String(mock.requests.at(-1)!.req.messages[0].content)).toContain("Time words");
    expect(view(mock, "c1").view.clock).toMatchObject({ time: "19:04" });
  });

  it("the scene line of the next reply already has the jump the player just wrote", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*На наступний день, о 9:30, я прокинувся.*")]);
    const line = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "", targetId: "", userText: "*На наступний день, о 9:30, я прокинувся.*" }, { injection: {} }).text);
    expect(line).toContain("Tuesday 27 October 2026, 09:30, morning");
    expect(line).not.toContain("19:00");
    // the stored snapshot is not touched: the sensor reads the line after the reply
    expect(view(mock, "c1").view.clock).toMatchObject({ day: 1, time: "19:00" });
  });

  it("a request whose line is not in the chat file yet counts too", () => {
    const mock = eveningThen();
    const line = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "", targetId: "", userText: "*Через дві години я повернувся.*" }, { injection: {} }).text);
    expect(line).toContain("21:00");
  });

  it("a promise in speech, or a line with no time words, leaves the clock as it is", () => {
    const mock = eveningThen();
    const speech = '"Приходь через годину, о 9:30"';
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", speech)]);
    const line = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "", targetId: "", userText: speech }, { injection: {} }).text);
    expect(line).toContain("19:00");
    expect(line).not.toContain("09:30");
  });

  it("once the sensor has read the line, the next reply does not move the clock a second time", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*Через годину я пішов.*"), A("m4", "Ok.")]);
    mock.push(reply({ present: ["Aria"], minutes: 60 }));
    update(mock, "c1");
    const after = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "", targetId: "", userText: "Next." }, { injection: {} }).text);
    expect(after).toContain("20:00");
    expect(after).not.toContain("21:00");
  });

  it("a swipe moves the clock by the line before the swiped reply, never by the reply's own words", () => {
    const mock = eveningThen();
    writeChat("c1", [U("m1", "Hello."), A("m2", "Evening, then."), U("m3", "*Через дві години я повернувся.*"), A("m4", "Через три дні.")]);
    const line = sceneOf(P.buildInsert(mock.host.fs, "c1", { op: "swipe", speakerName: "", targetId: "m4", userText: "" }, { injection: {} }).text);
    expect(line).toContain("21:00");
  });
});
