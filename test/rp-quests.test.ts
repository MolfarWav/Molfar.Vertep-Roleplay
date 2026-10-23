/**
 * #117 (from #94 and #86): threads are quests. A kind for each (main, side, everyday), steps under a main one,
 * a new one above its limit waits as a proposal instead of vanishing, a thread the story leaves alone gets a
 * proposal to close, and everyday ones end by themselves.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
const setConfig = (cfg: Record<string, unknown>) => fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, ...cfg }));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-quests-"));
  for (const d of ["chats", "characters/aria", "dashboard", "litopys"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: { class: "ally" } } } } }));
  setConfig({});
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
    llm: { request: (key: string, req: any) => { const s = { key, req }; requests.push(s); pending.push(s); }, results, embed: () => {}, embedResults: {} },
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
type Mock = ReturnType<typeof mockHost>;
function drive(mock: Mock, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
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
type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[]) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now() }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
const view = (m: Mock) => drive(m, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
const notes = (m: Mock, body: Record<string, unknown>) => drive(m, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });

// turn n of the chat is read when it has 2n+1 messages
let turns = 0;
function play(mock: Mock, threads: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  turns += 1;
  const msgs: Msg[] = [];
  for (let i = 1; i <= 2 * turns + 1; i++) msgs.push(i % 2 ? U("m" + i, "Line " + i + ".") : A("m" + i, "Reply " + i + "."));
  writeChat("c1", msgs);
  mock.push(reply({ present: ["Aria"], minutes: 1, ...(threads ? { threads } : {}), ...extra }));
  drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c1", op: "send" } });
  return view(mock);
}
beforeEach(() => {
  turns = 0;
});
const open = (v: any) => v.threads.filter((t: any) => t.status === "open");
const item = (text: string, kind?: string, parent?: string, id: string | null = null) => ({ id, text, ...(kind ? { kind } : {}), ...(parent ? { parent } : {}) });

describe("kinds and steps from the sensor's report", () => {
  it("a new thread carries its kind; no kind, or an odd one, is a side quest", () => {
    const mock = mockHost();
    const v = play(mock, { open: [item("Find the key", "main"), item("Water the plants", "everyday"), item("Who is the stranger?"), item("Odd one", "epic")] });
    // the limit of main is 1, side 3: all four fit (everyday is not counted)
    expect(open(v).map((t: any) => [t.text, t.kind])).toEqual([["Find the key", "main"], ["Water the plants", "everyday"], ["Who is the stranger?", "side"], ["Odd one", "side"]]);
    expect(v.proposals).toEqual([]);
  });

  it("a step goes under an open main quest; under anything else it is a side quest", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main"), item("A side line", "side")] });
    const v = play(mock, {
      open: [item("Find the key", "main", undefined, "t1"), item("A side line", "side", undefined, "t2"), item("Search the cellar", "side", "t1"), item("Step under a side", "side", "t2")],
    });
    const by = (text: string) => v.threads.find((t: any) => t.text === text);
    expect(by("Search the cellar")).toMatchObject({ parent: "t1" });
    expect(by("Step under a side").parent).toBeUndefined();
  });

  it("a kept thread keeps its kind and parent even when the report repeats it without them", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const v = play(mock, { open: [item("Find the key", undefined, undefined, "t1")] });
    expect(open(v)[0]).toMatchObject({ id: "t1", kind: "main" });
  });

  it("old snapshots (no kind) read as side quests", () => {
    expect(P.questKind({ id: "t1", text: "x", status: "open" })).toBe("side");
    expect(P.questKind({ kind: "main" })).toBe("main");
    expect(P.questKind({ kind: "nonsense" })).toBe("side");
  });

  it("a step goes with its main quest when that is resolved, and comes back when it is reopened", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Search the cellar", "side", "t1")] });
    // the owner closes the main quest: its open step closes with it, it is not left as a side quest
    notes(mock, { op: "thread-edit", id: "t1", status: "resolved" });
    const v = view(mock);
    expect(open(v)).toEqual([]);
    expect(v.threads.find((t: any) => t.text === "Search the cellar")).toMatchObject({ status: "resolved", parent: "t1" });
    notes(mock, { op: "thread-edit", id: "t1", status: "open" });
    expect(open(view(mock)).map((t: any) => [t.text, t.parent])).toEqual([["Find the key", undefined], ["Search the cellar", "t1"]]);
  });

  it("a step whose main quest is no longer main stands alone", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Search the cellar", "side", "t1")] });
    notes(mock, { op: "thread-edit", id: "t1", kind: "side" });
    expect(open(view(mock)).map((t: any) => [t.text, t.parent])).toEqual([["Find the key", undefined], ["Search the cellar", undefined]]);
  });
});

describe("the limits and the proposal queue (#86)", () => {
  it("a new quest above its limit waits as a proposal, once, with its kind", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const v = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    expect(open(v).map((t: any) => t.text)).toEqual(["Find the key"]);
    expect(v.proposals).toMatchObject([{ type: "open", why: "limit", kind: "main", text: "Take the throne" }]);
    // the sensor repeating it does not queue it twice
    const v2 = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    expect(v2.proposals.length).toBe(1);
  });

  it("steps are limited per main quest", () => {
    setConfig({ maxSteps: 1 });
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const v = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Step one", "side", "t1"), item("Step two", "side", "t1")] });
    expect(open(v).filter((t: any) => t.parent).length).toBe(1);
    expect(v.proposals).toMatchObject([{ type: "open", parent: "t1", text: "Step two" }]);
  });

  it("accepting opens it; a full kind needs the quest it replaces", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const v = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    const id = v.proposals[0].id;
    const refused = notes(mock, { op: "proposal-accept", id });
    expect(refused.status).toBe(409);
    expect(open(view(mock)).length).toBe(1);
    const done = notes(mock, { op: "proposal-accept", id, replace: "t1" });
    expect(done.status).toBe(200);
    const after = view(mock);
    expect(open(after).map((t: any) => [t.text, t.kind, t.by])).toEqual([["Take the throne", "main", undefined]]);
    expect(after.threads.find((t: any) => t.id === "t1").status).toBe("resolved");
    expect(after.proposals).toEqual([]);
  });

  it("accepting with room just opens it", () => {
    setConfig({ maxMain: 2 });
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main"), item("A", "main"), item("B", "main")] });
    const v = view(mock);
    expect(v.proposals.length).toBe(1);
    // free a place first, then accept without a replacement
    notes(mock, { op: "thread-edit", id: "t2", status: "resolved" });
    expect(notes(mock, { op: "proposal-accept", id: v.proposals[0].id }).status).toBe(200);
    expect(open(view(mock)).map((t: any) => t.text)).toEqual(["Find the key", "B"]);
  });

  it("a rejected proposal is gone and the same text is not proposed again", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const v = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    expect(notes(mock, { op: "proposal-reject", id: v.proposals[0].id }).status).toBe(200);
    expect(view(mock).proposals).toEqual([]);
    const v2 = play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    expect(v2.proposals).toEqual([]);
  });

  it("the owner adding a quest at a full limit queues it instead of failing", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    const r = notes(mock, { op: "thread-add", text: "Take the throne", kind: "main" });
    expect(r.status).toBe(200);
    expect(r.json.queued).toBe(true);
    expect(r.json.view.proposals).toMatchObject([{ type: "open", by: "user", kind: "main", text: "Take the throne" }]);
    const id = r.json.view.proposals[0].id;
    expect(notes(mock, { op: "proposal-accept", id, replace: "t1" }).status).toBe(200);
    expect(open(view(mock)).map((t: any) => [t.text, t.kind])).toEqual([["Take the throne", "main"]]);
  });

  it("the owner's add and edit validate kind and parent", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main"), item("A side line", "side")] });
    expect(notes(mock, { op: "thread-add", text: "x", kind: "epic" }).status).toBe(400);
    expect(notes(mock, { op: "thread-add", text: "x", parent: "t2" }).status).toBe(400);
    expect(notes(mock, { op: "thread-add", text: "Search the cellar", parent: "t1" }).status).toBe(200);
    expect(notes(mock, { op: "thread-edit", id: "t2", kind: "everyday" }).status).toBe(200);
    expect(view(mock).threads.find((t: any) => t.id === "t2").kind).toBe("everyday");
    expect(notes(mock, { op: "thread-edit", id: "t2", parent: "t2" }).status).toBe(400);
    expect(notes(mock, { op: "thread-edit", id: "t2", parent: "t1" }).status).toBe(200);
    expect(view(mock).threads.find((t: any) => t.id === "t2").parent).toBe("t1");
    expect(notes(mock, { op: "thread-edit", id: "t2", parent: null }).status).toBe(200);
    expect(view(mock).threads.find((t: any) => t.id === "t2").parent).toBeUndefined();
  });

  it("the limits are settings, clamped", () => {
    const mock = mockHost();
    const put = (b: Record<string, unknown>) => drive(mock, { method: "PUT", path: "/dashboard/config", body: b }).json;
    const j = put({ maxMain: 9, maxSteps: 0, everydayTurns: 99, retireAfter: 99 });
    expect([j.maxMain, j.maxSteps, j.everydayTurns, j.retireAfter]).toEqual([2, 1, 30, 10]);
    const k = put({ maxMain: 1, maxSteps: 4, everydayTurns: 8, retireAfter: 3 });
    expect([k.maxMain, k.maxSteps, k.everydayTurns, k.retireAfter]).toEqual([1, 4, 8, 3]);
    const stored = JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
    expect(stored.maxMain).toBeUndefined();
    expect(stored.retireAfter).toBeUndefined();
  });
});

describe("threads left open (#86)", () => {
  const keep = (...ids: string[]) => ({ open: ids.map((id) => item("Who took the letter?", undefined, undefined, id)) });

  it("a thread the checks leave alone gets a close proposal, once", () => {
    setConfig({ threadCheckEvery: 1, retireAfter: 2 });
    const mock = mockHost();
    play(mock, { open: [item("Who took the letter?")] });
    const v2 = play(mock, keep("t1"));
    expect(v2.proposals).toEqual([]);
    const v3 = play(mock, keep("t1"));
    expect(v3.proposals).toMatchObject([{ type: "close", why: "stale", threadId: "t1", text: "Who took the letter?" }]);
    const v4 = play(mock, keep("t1"));
    expect(v4.proposals.length).toBe(1);
  });

  it("accepting closes the thread; keeping it waits as long again, then asks again", () => {
    setConfig({ threadCheckEvery: 1, retireAfter: 2 });
    const mock = mockHost();
    play(mock, { open: [item("Who took the letter?")] });
    play(mock, keep("t1"));
    const v3 = play(mock, keep("t1"));
    expect(notes(mock, { op: "proposal-reject", id: v3.proposals[0].id }).status).toBe(200);
    expect(view(mock).proposals).toEqual([]);
    expect(play(mock, keep("t1")).proposals).toEqual([]);
    const again = play(mock, keep("t1"));
    expect(again.proposals).toMatchObject([{ type: "close", threadId: "t1" }]);
    expect(notes(mock, { op: "proposal-accept", id: again.proposals[0].id }).status).toBe(200);
    const done = view(mock);
    expect(done.threads.find((t: any) => t.id === "t1").status).toBe("resolved");
    expect(done.proposals).toEqual([]);
  });

  it("a reworded thread starts over, and 0 never asks", () => {
    setConfig({ threadCheckEvery: 1, retireAfter: 2 });
    const mock = mockHost();
    play(mock, { open: [item("Who took the letter?")] });
    play(mock, keep("t1"));
    const v = play(mock, { open: [item("Who took the letter, and why?", undefined, undefined, "t1")] });
    expect(v.proposals).toEqual([]);
    setConfig({ threadCheckEvery: 1, retireAfter: 0 });
    for (let i = 0; i < 4; i++) expect(play(mock, { open: [item("Who took the letter, and why?", undefined, undefined, "t1")] }).proposals).toEqual([]);
  });

  it("everyday quests are never proposed for closing; they end by themselves", () => {
    setConfig({ threadCheckEvery: 1, retireAfter: 1, everydayTurns: 3 });
    const mock = mockHost();
    play(mock, { open: [item("Feed the cat", "everyday")] });
    const same = { open: [item("Feed the cat", "everyday", undefined, "t1")] };
    expect(open(play(mock, same)).length).toBe(1);
    expect(play(mock, same).proposals).toEqual([]);
    // turn 4: three turns after it opened (turn 1)
    const v = play(mock, same);
    expect(open(v).length).toBe(0);
    expect(v.threads[0]).toMatchObject({ id: "t1", status: "resolved", resolvedAt: 4 });
    expect(v.proposals).toEqual([]);
  });

  it("no more than five everyday quests stay open", () => {
    const mock = mockHost();
    const v = play(mock, { open: ["a", "b", "c", "d", "e", "f", "g"].map((x) => item("Chore " + x, "everyday")) });
    expect(open(v).map((t: any) => t.text)).toEqual(["Chore c", "Chore d", "Chore e", "Chore f", "Chore g"]);
  });
});

describe("what the sensor and the story model read", () => {
  it("the sensor sees each thread's kind and how full the limits are", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main"), item("Water the plants", "everyday")] });
    play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Water the plants", "everyday", undefined, "t2"), item("Search the cellar", "side", "t1")] });
    const input = mock.requests.at(-1)!.req.messages[0].content as string;
    expect(input).toContain('Open threads: t1 [main] "Find the key", t2 [everyday] "Water the plants"');
    expect(input).toContain("Open thread limits: main 1/1, side 0/3, steps per main thread 4 (everyday threads are not counted).");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("Give each new thread a kind");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("parent set to that main thread's id");
  });

  it("the reply gets main quests first with their steps, then side ones; everyday stay out", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main"), item("A side line", "side"), item("Feed the cat", "everyday")] });
    play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("A side line", "side", undefined, "t2"), item("Feed the cat", "everyday", undefined, "t3"), item("Search the cellar", "side", "t1")] });
    const turn = { op: "send", speakerName: "Aria", targetId: "", userText: "hi" };
    const ins = P.buildInsert(mock.host.fs, "c1", turn, P.loadConfig ? P.loadConfig(mock.host.fs) : { injection: {} });
    expect(ins.text).toContain("[Open threads the story can move toward: Find the key (next steps: Search the cellar); A side line.]");
    expect(ins.text).not.toContain("Feed the cat");
  });

  it("the previous default sensor prompt still counts as the default", () => {
    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    const before = past.at(-1)!;
    expect(before).toContain("up to the open thread limit given in the input");
    expect(before).not.toContain("Give each new thread a kind");
    expect(before.replace("- Keep open threads, up to the open thread limit given in the input: unanswered questions or promises that drive the story. A question, greeting or order with nothing at stake is not a thread.", P.DEFAULT_PROMPTS.sensor.match(/- Keep open threads, up to the open thread limits[\s\S]*?parent set to that main thread's id\. Only main threads have steps\./)![0])).toBe(P.DEFAULT_PROMPTS.sensor);
  });

  it("proposals ride the state file, not the snapshot, and a rebuilt state starts without them", () => {
    const mock = mockHost();
    play(mock, { open: [item("Find the key", "main")] });
    play(mock, { open: [item("Find the key", "main", undefined, "t1"), item("Take the throne", "main")] });
    const st = readStateFile("c1");
    expect(st.proposals.length).toBe(1);
    expect(st.counters.proposal).toBe(1);
    expect(Object.values(st.snapshots).every((s: any) => s.proposals === undefined)).toBe(true);
  });
});
