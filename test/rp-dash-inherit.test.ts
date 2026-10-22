/**
 * #100: a chat that continues another starts from that chat's end state: open threads, the characters'
 * numbers, the notes still alive and the names they call each other; the first sensor run reads on from it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-inherit-"));
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

/** An earlier chat with one sensor run: a promise kept, a note, a thread, a place. */
function playFirstChat(mock: ReturnType<typeof mockHost>) {
  writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "I kept my promise.")]);
  mock.push(
    reply({
      present: ["Aria"],
      minutes: 10,
      place: "Hall",
      events: [{ id: "kept_promise", weight: "significant", from: "user", to: "Aria", quote: "I kept my promise." }],
      chars: { Aria: { mood: "relieved", holding: "a key" } },
      learned: [{ who: "Aria", text: "The user keeps their word", how: "saw", weight: "important" }],
      names: [{ who: "Aria", calls: "stranger" }],
      threads: { open: [{ id: null, text: "Who has the key?" }] },
    }),
  );
  expect(update(mock, "c1").json.ok).toBe(true);
}

describe("a chat that continues another (#100)", () => {
  it("carries the end state in and the first sensor run reads on from it", () => {
    const mock = mockHost();
    playFirstChat(mock);
    const c1 = readStateFile("c1");
    const trust = c1.snapshots["m3#0"].chars.Aria.stats.trust;
    expect(trust).toBeGreaterThan(0);

    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    // before any run: the Dashboard of the new chat already shows the carried state, and says so
    const v0 = view(mock, "c2");
    expect(v0.inherit).toMatchObject({ from: "c1", title: "Chat c1", on: true, notes: 1, threads: 1, canSwitch: true });
    expect(v0.view.chars.Aria.stats.trust).toBe(trust);
    expect(v0.view.chars.Aria.notebook.map((n: any) => n.text)).toEqual(["The user keeps their word"]);
    expect(v0.view.threads.map((t: any) => t.text)).toEqual(["Who has the key?"]);
    // nothing was written by looking
    expect(fs.existsSync(stateFile("c2"))).toBe(false);

    // the first run of the new chat starts from the carried numbers and writes the carried state with it
    mock.push(reply({ present: ["Aria"], minutes: 5, place: "Garden" }));
    expect(update(mock, "c2").json.ok).toBe(true);
    expect(mock.requests.at(-1)!.req.messages[0].content).toContain("Open threads: ");
    expect(mock.requests.at(-1)!.req.messages[0].content).toContain("The user keeps their word");
    const c2 = readStateFile("c2");
    expect(c2.inherited).toMatchObject({ from: "c1", notes: 1, threads: 1 });
    const snap = c2.snapshots["n1#0"];
    expect(snap.base).toBeNull();
    expect(snap.chars.Aria.stats.trust).toBe(trust);
    expect(snap.turn).toBe(c1.snapshots["m3#0"].turn + 1);
    expect(snap.threads.map((t: any) => t.text)).toEqual(["Who has the key?"]);
    // the choice can no longer be switched
    expect(view(mock, "c2").inherit.canSwitch).toBe(false);
    // the source chat is untouched
    expect(readStateFile("c1")).toEqual(c1);
  });

  it("carries notes with a source and keeps ids unique", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [A("n1", "A new morning."), U("n2", "Hi")]);
    link("c1", "c2");
    mock.push(reply({ present: ["Aria"], learned: [{ who: "Aria", text: "The user likes tea", how: "heard", weight: "important" }] }));
    update(mock, "c2");
    const notes = readStateFile("c2").notebook.Aria;
    expect(notes.map((n: any) => n.src)).toEqual(["inherit", "n2#0"]);
    expect(notes[0].fromChat).toBe("c1");
    expect(new Set(notes.map((n: any) => n.id)).size).toBe(2);
  });

  it("start clean drops it, and it is not offered again", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    const out = drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: false } });
    expect(out.json.inherit).toMatchObject({ from: "c1", on: false });
    const v = view(mock, "c2");
    expect(v.view).toBeNull();
    expect(v.inherit).toMatchObject({ on: false, canSwitch: true });
    mock.push(reply({ present: ["Aria"], minutes: 5 }));
    update(mock, "c2");
    const c2 = readStateFile("c2");
    expect(c2.snapshots["n1#0"].chars.Aria.stats.trust).toBe(0);
    expect(c2.notebook.Aria).toBeUndefined();
    // and back on is refused once the chat has a snapshot of its own
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: true } }).status).toBe(409);
  });

  it("can be switched back on before the first run", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: false } });
    const out = drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: true } });
    expect(out.json.inherit).toMatchObject({ on: true, notes: 1, threads: 1 });
  });

  it("a chat that already has its own snapshots carries nothing when linked later", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [U("n1", "Hello."), A("n2", "Hm.")]);
    mock.push(reply({ present: ["Aria"], minutes: 1 }));
    update(mock, "c2");
    link("c1", "c2");
    const v = view(mock, "c2");
    expect(v.view.chars.Aria.notebook).toEqual([]);
    expect(v.inherit).toMatchObject({ on: false, canSwitch: false });
  });

  it("a chain takes the nearest chat's end state: a chat that carried and never ran passes it on", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    // c2 carries c1's state to its file by switching it explicitly on; c3 continues c2 with no run in between
    drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: true } });
    writeChat("c3", [A("k1", "Later.")]);
    fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { c2: { from: "c1", at: 1 }, c3: { from: "c2", at: 1 } } }));
    const v = view(mock, "c3");
    expect(v.inherit).toMatchObject({ from: "c2", on: true, notes: 1, threads: 1 });
    expect(v.view.chars.Aria.notebook.map((n: any) => n.text)).toEqual(["The user keeps their word"]);
  });

  it("no link, or a source with no Dashboard: nothing is carried and nothing changes", () => {
    const mock = mockHost();
    writeChat("c2", [A("n1", "A new morning.")]);
    expect(view(mock, "c2").inherit).toBeNull();
    writeChat("c0", [A("z1", "Old")]);
    link("c0", "c2");
    const v = view(mock, "c2");
    expect(v.inherit).toMatchObject({ from: "c0", on: false, notes: 0 });
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: true } }).status).toBe(404);
  });
});

describe("the carried banner strings (#100)", () => {
  it("exist in English and Ukrainian and fill their values", async () => {
    const { t } = await import("../src/lib/i18n");
    const p = { title: "Winter watch", notes: 12, threads: 2 };
    for (const key of ["dash.carried.on", "dash.carried.line"] as const) {
      for (const lang of ["en", "uk"] as const) {
        const s = t(key, lang, p);
        expect(s).toContain("Winter watch");
        expect(s).toContain("12");
        expect(s).not.toContain("{");
      }
    }
  });
});

describe("the background catch-up and a carried state (#100)", () => {
  it("leaves a chat that only holds a greeting alone, so the choice to start clean stays open; a user message ends the wait", () => {
    const mock = mockHost();
    playFirstChat(mock);
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
    const out = drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c2", op: "catchup" } });
    expect(out.json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(1);
    expect(view(mock, "c2").inherit.canSwitch).toBe(true);
    writeChat("c2", [A("n1", "A new morning."), U("n2", "Hi")]);
    mock.push(reply({ present: ["Aria"], minutes: 1 }));
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c2", op: "catchup" } }).json.ok).toBe(true);
    expect(view(mock, "c2").inherit.canSwitch).toBe(false);
  });
});

describe("linking late: rebuild the Dashboard on top of the earlier chat (#100)", () => {
  it("a chat that read turns before it was linked can be rebuilt on the earlier state, once, keeping a copy", () => {
    const mock = mockHost();
    playFirstChat(mock);
    const trust = readStateFile("c1").snapshots["m3#0"].chars.Aria.stats.trust;
    // c2 played on its own first: it reads the greeting as a first meeting
    writeChat("c2", [A("n1", "A stranger lies in the glade."), U("n2", "Who are you?")]);
    mock.push(reply({ present: ["Aria"], minutes: 1, learned: [{ who: "Aria", text: "A stranger lies in the glade.", how: "saw", weight: "key" }], names: [{ who: "Aria", calls: "stranger" }] }));
    update(mock, "c2");
    link("c1", "c2");
    const v = view(mock, "c2");
    expect(v.inherit).toMatchObject({ from: "c1", on: false, canSwitch: false, canRebase: true });
    // refused where it does not apply
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: true } }).status).toBe(409);

    const out = drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", rebase: true } });
    expect(out.json).toMatchObject({ ok: true, rebuilt: true });
    expect(out.json.inherit).toMatchObject({ on: true, canRebase: false });
    expect(fs.existsSync(path.join(root, "dashboard/rebase/c2.json"))).toBe(true);
    const st = readStateFile("c2");
    expect(Object.keys(st.snapshots)).toEqual([]);
    expect(st.notebook.Aria.map((n: any) => n.text)).toEqual(["The user keeps their word"]);

    // the next read goes on from the carried numbers and the carried name, and the greeting's own note is gone
    mock.push(reply({ present: ["Aria"], minutes: 1 }));
    expect(update(mock, "c2").json.ok).toBe(true);
    const after = readStateFile("c2");
    expect(after.snapshots["n2#0"].chars.Aria.stats.trust).toBe(trust);
    expect(after.notebook.Aria.map((n: any) => n.text)).toEqual(["The user keeps their word"]);
    // a second rebuild is refused: it already took its start from the earlier chat
    expect(drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", rebase: true } }).status).toBe(409);
  });
});
