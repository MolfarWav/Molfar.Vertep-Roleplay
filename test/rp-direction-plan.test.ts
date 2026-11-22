// Direction (#496, phase 3a): the beat plan. Cleaning, the decision (conditions, the wait for a scene boundary, order, retries), the
// routes on a fake host (the plan, Fire now), the note on the reply, the engine counting a beat's people as present, and a swipe or a
// delete taking a beat back.
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as d from "../plugins/direction/plugin.js";

const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as { directionScene: Function };

type Files = Record<string, string>;
const CHAT = "c1";
const GROUP = "grp_a";
const members = [{ id: "hana", name: "Hana Morimoto" }, { id: "yuzu", name: "Yuzu Takane" }, { id: "mei", name: "Mei Ishikawa" }];

function makeFs(files: Files) {
  return {
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p];
    },
    write: (p: string, t: string) => void (files[p] = t),
    list: (dir: string) => Object.keys(files).filter((p) => p.startsWith(dir + "/")).map((p) => p.slice(dir.length + 1)),
    remove: (p: string) => void delete files[p],
  };
}
const msg = (id: string, role: string, text: string, more: Record<string, unknown> = {}) => ({ id, role, text, swipe: 0, ...more });
/** n replies: u1 r1 u2 r2 ... after a greeting. */
function lines(n: number) {
  const out: any[] = [msg("g", "system", "Morning.", { greeting: true })];
  for (let i = 1; i <= n; i++) out.push(msg("u" + i, "user", "Go on " + i), msg("r" + i, "char", "Reply " + i));
  return out;
}
const jsonl = (list: any[]) => list.map((m) => JSON.stringify(m)).join("\n");
function world(list: any[], more: Files = {}): Files {
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, groupId: GROUP, userName: "Kaito" }),
    ["chats/" + CHAT + ".jsonl"]: jsonl(list),
    ["groups/" + GROUP + ".json"]: JSON.stringify({ id: GROUP, memberIds: ["hana", "yuzu", "mei"], generationMode: "narrator" }),
    "characters/hana/card.json": JSON.stringify({ name: "Hana Morimoto" }),
    "characters/yuzu/card.json": JSON.stringify({ name: "Yuzu Takane" }),
    "characters/mei/card.json": JSON.stringify({ name: "Mei Ishikawa" }),
    "direction/config.json": JSON.stringify({ v: 1, model: "nano/flash" }),
    ...more,
  };
}
type Host = { fs: ReturnType<typeof makeFs>; llm: { results: Record<string, unknown>; request: (k: string, r: any) => void } };
const makeHost = (files: Files): Host => ({ fs: makeFs(files), llm: { results: {}, request: () => {} } });
const post = (path: string, body: unknown) => ({ method: "POST", path, body, query: {} });
const put = (path: string, body: unknown) => ({ method: "PUT", path, body, query: {} });
const get = (path: string, query: Record<string, string>) => ({ method: "GET", path, query });
const stateOf = (files: Files) => JSON.parse(files["direction/state/" + CHAT + ".json"]!);
const report = (n: number, present: string[], tag = "break", sceneNew = false) => ({ key: "r" + n + "#0", at: 1, tag, present, sceneNew, model: "m", ms: 1 });
const reports = (n: number, present = ["hana"], tag = "break") => Array.from({ length: n }, (_, i) => report(i + 1, present, tag));
const beat = (more: Record<string, unknown> = {}) => ({ id: "b1", text: "The bell rings and the class empties.", who: [], when: { kind: "replies", n: 2 }, wait: true, addedN: 0, ...more });
/** A state with the switch on, the given plan and reports; msgs for `n` replies. */
function mk(n: number, beats: any[], reps = reports(n), more: Record<string, unknown> = {}) {
  const state = d.cleanState({ on: true, reports: reps, plan: { beats }, ...more }, CHAT);
  return { state, msgs: lines(n) };
}
const decide = (s: { state: any; msgs: any[] }, over: Record<string, unknown> = {}) => d.decideBeat({ state: s.state, msgs: s.msgs, members, dashDirection: "", dashPlace: "", dashMoved: false, now: 1000, ...over });

describe("direction plan: cleaning", () => {
  it("keeps beats with text, drops the rest, clamps the condition and never takes the server's fields from nowhere", () => {
    const plan = d.cleanPlan({ beats: [beat(), { id: "b2", text: "  " }, beat({ id: "b1", text: "dup" }), beat({ id: "b3", when: { kind: "tag", tag: "nope" } }), beat({ id: "b4", when: { kind: "place", place: " the roof " } }), beat({ id: "b5", when: { kind: "replies", n: 999 }, who: ["hana", "bad id!"] }), { text: "no id" }] });
    expect(plan.beats.map((b: any) => b.id)).toEqual(["b1", "b3", "b4", "b5"]);
    expect(plan.beats[1].when).toEqual({ kind: "replies", n: 3 });
    expect(plan.beats[2].when).toEqual({ kind: "place", place: "the roof" });
    expect(plan.beats[3].when.n).toBe(200);
    expect(plan.beats[3].who).toEqual(["hana"]);
  });
  it("an old state without a plan gets an empty one, and at most 20 beats stay", () => {
    expect(d.cleanState({ on: true }, CHAT).plan).toEqual({ beats: [] });
    const many = Array.from({ length: 30 }, (_, i) => beat({ id: "b" + i }));
    expect(d.cleanPlan({ beats: many }).beats.length).toBe(20);
  });
});

describe("direction plan: the decision", () => {
  it("a replies beat is due after N replies from when it was added, then waits for a scene boundary", () => {
    const s = mk(4, [beat({ addedN: 2 })]);
    const out = decide(s);
    expect(out.fire).toBeNull();
    expect(out.beats[0].dueKey).toBe("r4#0");
    expect(out.beats[0].dueN).toBe(4);
    expect(out.logs.map((l: any) => l.state)).toEqual(["due"]);
  });
  it("not due while the replies have not passed", () => {
    const out = decide(mk(3, [beat({ addedN: 2 })]));
    expect(out.fire).toBeNull();
    expect(out.beats).toBeNull();
  });
  it("a due beat fires at once when the director reads a new scene", () => {
    const reps = [...reports(3), { ...report(4, ["hana"]), sceneNew: true }];
    const out = decide(mk(4, [beat({ addedN: 2 })], reps));
    expect(out.fire.rule).toBe("beat:b1");
    expect(out.fire.kind).toBe("beat");
    expect(out.fire.why).toContain("the scene changed");
    expect(out.fire.after).toBe("r4#0");
  });
  it("the Dashboard's new scene on the newest reply counts as a boundary too", () => {
    expect(decide(mk(4, [beat({ addedN: 2 })]), { dashMoved: true }).fire).not.toBeNull();
  });
  it("a due beat fires anyway after six replies without a boundary", () => {
    const s = mk(10, [beat({ addedN: 2, dueKey: "r4#0", dueN: 4, dueWhy: "2 replies passed" })]);
    const out = decide(s);
    expect(out.fire.why).toContain("waited 6 replies");
    const early = mk(9, [beat({ addedN: 2, dueKey: "r4#0", dueN: 4, dueWhy: "2 replies passed" })]);
    expect(decide(early).fire).toBeNull();
  });
  it("a scene change that came before the beat was due does not count", () => {
    const reps = [{ ...report(1, ["hana"]), sceneNew: true }, ...reports(4).slice(1)];
    expect(decide(mk(4, [beat({ addedN: 2 })], reps)).fire).toBeNull();
  });
  it("a beat set not to wait fires as soon as it is due; so does a place beat", () => {
    expect(decide(mk(4, [beat({ addedN: 2, wait: false })])).fire).not.toBeNull();
    const place = beat({ when: { kind: "place", place: "roof" } });
    expect(decide(mk(3, [place]), { dashPlace: "School roof" }).fire.why).toContain("School roof");
    expect(decide(mk(3, [place]), { dashPlace: "Classroom" }).fire).toBeNull();
  });
  it("a tag beat is due when the director reads that scene kind", () => {
    const b = beat({ when: { kind: "tag", tag: "alone_moment" }, wait: false });
    expect(decide(mk(3, [b], reports(3, ["hana"], "break"))).fire).toBeNull();
    expect(decide(mk(3, [b], reports(3, ["hana"], "alone_moment"))).fire.why).toBe("the scene is alone_moment");
  });
  it("a manual beat never fires by itself", () => {
    expect(decide(mk(30, [beat({ when: { kind: "manual" }, wait: false })], reports(30)))).toEqual({ fire: null, beats: null, logs: [] });
  });
  it("only the first unfinished beat is looked at; the next one counts from when the first ended", () => {
    const first = beat({ id: "b1", when: { kind: "manual" } });
    const second = beat({ id: "b2", text: "Second", when: { kind: "replies", n: 0 }, wait: false });
    expect(decide(mk(5, [first, second])).fire).toBeNull();
    // the first was delivered at reply 5: the second (n = 2) is not due at 6, due at 7
    const done = [{ id: "fa", rule: "beat:b1", kind: "beat", who: [], with: [], after: "r5#0", n: 5, roll: null, tension: 0, hold: 0, payoff: false, result: "sent", carrier: "r6#0", forced: false, why: "", at: 1 }];
    const second2 = { ...second, when: { kind: "replies", n: 2 } };
    expect(decide(mk(6, [first, second2], reports(6), { fires: done })).fire).toBeNull();
    expect(decide(mk(7, [first, second2], reports(7), { fires: done })).beats).not.toBeNull();
  });
  it("holds in an explicit scene, under the lock, with the switch off and with a note queued", () => {
    const s = mk(4, [beat({ addedN: 2, wait: false })]);
    expect(decide(s, { dashDirection: "explicit" }).fire).toBeNull();
    // it is marked due, so it goes when the scene leaves explicit
    expect(decide(s, { dashDirection: "explicit" }).beats[0].dueKey).toBe("r4#0");
    expect(decide({ ...s, state: { ...s.state, lock: { ids: ["hana"], at: 1 } } }).fire).toBeNull();
    expect(decide({ ...s, state: { ...s.state, on: false } }).fire).toBeNull();
    expect(decide({ ...s, state: { ...s.state, next: { id: "x", rule: "interrupted", kind: "interrupt", who: ["yuzu"], with: [], after: "r4#0", forced: false, at: 1 } } }).fire).toBeNull();
  });
  it("the people of a beat who are in the group go with the fire; unknown ids are left out", () => {
    const out = decide(mk(4, [beat({ addedN: 2, wait: false, who: ["yuzu", "ghost"] })], reports(4, ["hana"])));
    expect(out.fire.who).toEqual(["yuzu"]);
    expect(out.fire.with).toEqual(["hana"]);
  });
});

describe("direction plan: what came of it", () => {
  const fired = (who: string[], result: string | null = null, n = 4) => ({ id: "f1", rule: "beat:b1", kind: "beat", who, with: [], after: "r" + n + "#0", n, roll: null, tension: 0, hold: 0, payoff: false, result, carrier: result ? "r" + (n + 1) + "#0" : "", forced: false, why: "", at: 1 });
  const queued = (who: string[]) => ({ id: "f1", rule: "beat:b1", kind: "beat", who, with: [], after: "r4#0", forced: false, at: 1 });

  it("a beat with nobody to find is `sent` and finished", () => {
    const s = mk(5, [beat()], reports(5), { fires: [fired([])], next: queued([]) });
    const after = d.judgeNext(s.state, report(5, ["hana"]), s.msgs, d.memberNames(members, []));
    expect(after.fires[0].result).toBe("sent");
    expect(d.beatOutcome(after, after.plan.beats[0]).status).toBe("delivered");
  });
  it("came: the one it brought is in the next report", () => {
    const s = mk(5, [beat({ who: ["yuzu"] })], reports(5), { fires: [fired(["yuzu"])], next: queued(["yuzu"]) });
    const after = d.judgeNext(s.state, report(5, ["hana", "yuzu"]), s.msgs, d.memberNames(members, []));
    expect(after.fires[0].result).toBe("came");
    expect(d.beatOutcome(after, after.plan.beats[0]).status).toBe("delivered");
  });
  it("a miss is tried once more at once, with a stricter note; a second miss gives the beat up", () => {
    const missed = { ...fired(["yuzu"], "missed"), carrier: "r5#0" };
    const s = mk(5, [beat({ who: ["yuzu"], dueKey: "r4#0", dueN: 4 })], reports(5), { fires: [missed] });
    const retry = decide(s);
    expect(retry.fire.why).toContain("again after a miss");
    const note = d.beatNote({ next: { ...retry.fire, who: ["yuzu"] }, beat: s.state.plan.beats[0], members, userName: "Kaito", tries: 1 });
    expect(note).toContain("left out of the last reply");
    const second = [missed, { ...fired(["yuzu"], "missed", 5), id: "f2", carrier: "r6#0" }];
    const t = mk(6, [beat({ id: "b1", who: ["yuzu"], dueKey: "r4#0", dueN: 4 }), beat({ id: "b2", text: "Next", when: { kind: "replies", n: 0 }, wait: false, addedN: 6 })], reports(6), { fires: second });
    expect(d.beatOutcome(t.state, t.state.plan.beats[0]).status).toBe("failed");
    expect(decide(t).fire.rule).toBe("beat:b2");
  });
  it("yielding to World or the lock is not a miss: the beat stays and goes again at once", () => {
    const yielded = { ...fired([], "yielded"), carrier: "" };
    const s = mk(5, [beat({ dueKey: "r4#0", dueN: 4 })], reports(5), { fires: [yielded] });
    expect(d.beatOutcome(s.state, s.state.plan.beats[0])).toMatchObject({ status: "open", tries: 0, retry: true });
    expect(decide(s).fire).not.toBeNull();
  });
});

describe("direction plan: routes and delivery", () => {
  function setup(n = 4, extra: Files = {}) {
    const files = world(lines(n), extra);
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), reports: reports(n) });
    return { files, host };
  }
  const reqOf = (op: string, text = "Hi.") => ({ key: "reply", request: { sessionId: CHAT, messages: [{ role: "user", content: text }] }, turn: { op } });

  it("PUT /direction/plan: new beats get an id and count from now; the state returns their status", () => {
    const { files, host } = setup(4);
    const res = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "The bell rings.", who: ["yuzu"], when: { kind: "replies", n: 2 }, wait: true }, { text: "   " }] }), host);
    expect(res.json.plan.beats.length).toBe(1);
    const b = res.json.plan.beats[0];
    expect(b.id).toMatch(/^b[a-z0-9]+$/);
    expect(b.addedN).toBe(4);
    const st = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(st.plan.beats[0]).toMatchObject({ id: b.id, status: "waiting", left: 2, who: ["yuzu"] });
    expect(stateOf(files).plan.beats[0].dueKey).toBe("");
  });
  it("an edit that changes `when` makes the beat not due; a delete takes its firings and its queued note", () => {
    const { files, host } = setup(4);
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "A", when: { kind: "replies", n: 0 }, wait: false }] }), host).json.plan.beats[0].id;
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host).json.next.rule).toBe("beat:" + id);
    expect(stateOf(files).fires.length).toBe(1);
    const gone = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [] }), host);
    expect(gone.json.plan.beats).toEqual([]);
    expect(stateOf(files).next).toBeNull();
    expect(stateOf(files).fires).toEqual([]);
  });
  it("skipping a beat drops its queued note and lets the next one count from now", () => {
    const { files, host } = setup(4);
    const ids = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "A", when: { kind: "manual" } }, { text: "B", when: { kind: "replies", n: 2 } }] }), host).json.plan.beats.map((x: any) => x.id);
    d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: ids[0] }), host);
    const beats = stateOf(files).plan.beats.map((x: any) => ({ ...x, skipped: x.id === ids[0] }));
    d.handleRoute(put("/direction/plan", { chatId: CHAT, beats }), host);
    const s = stateOf(files);
    expect(s.next).toBeNull();
    expect(s.plan.beats[0].skipped).toBe(true);
    expect(s.plan.beats[0].skipN).toBe(4);
    const st = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(st.plan.beats.map((x: any) => x.status)).toEqual(["skipped", "waiting"]);
    expect(st.plan.beats[1].left).toBe(2);
  });
  it("Fire now queues the beat, the reply carries its note, and the people it names count as present for the engine", () => {
    const { files, host } = setup(4);
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "Yuzu brings a cake and everyone sings.", who: ["yuzu"], when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
    const fired = d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host);
    expect(fired.json.next).toMatchObject({ rule: "beat:" + id, kind: "beat", who: ["yuzu"], forced: true });
    const parsed = lines(4).map((m) => m);
    expect(E.directionScene(host.fs, { id: CHAT, groupId: GROUP }, members, parsed).present.has("yuzu")).toBe(true);
    const out = d.llmRequest(reqOf("send"), host);
    const text = out.messages[0].content;
    expect(text).toContain("Yuzu brings a cake and everyone sings.");
    expect(text).toContain("Who: Yuzu Takane takes part");
    expect(out.promptSources.parts[0].label).toBe("Direction · beat");
    // a delivered beat on a later report: yuzu came
    const run = stateOf(files);
    expect(run.fires[0].forced).toBe(true);
  });
  it("a beat yields to a World event already in the reply and is tried again", () => {
    const { files, host } = setup(4, { ["world/state/" + CHAT + ".json"]: JSON.stringify({ event: { sent: 1, after: "r4#0" } }) });
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "Rain starts.", when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
    d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host);
    expect(d.llmRequest(reqOf("send"), host)).toBeNull();
    const s = stateOf(files);
    expect(s.fires[0].result).toBe("yielded");
    expect(d.beatOutcome(d.cleanState(s, CHAT), d.cleanState(s, CHAT).plan.beats[0])).toMatchObject({ status: "open", retry: true });
  });
  it("Fire now refuses a finished beat, an unknown beat and a locked scene", () => {
    const { files, host } = setup(4);
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "A", when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: "nope" }), host).status).toBe(400);
    files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), lock: { ids: ["hana"], at: 1 } });
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host).status).toBe(400);
    files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), lock: null, plan: { beats: stateOf(files).plan.beats.map((b: any) => ({ ...b, skipped: true })) } });
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host).json.error).toContain("finished");
  });
  it("a report that makes a beat due, then a director run with a new scene queues it (the run route end to end)", () => {
    const { files, host } = setup(3);
    d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "The bell rings.", when: { kind: "replies", n: 1 }, wait: true }] }), host);
    // reply 4 arrives; the director reads it as a new scene: due and fired on the same report
    files["chats/" + CHAT + ".jsonl"] = jsonl(lines(4));
    const first = d.handleRoute(post("/direction/run", { chatId: CHAT }), host);
    expect(first.__llmPending).toBe(true);
    host.llm.results = { direction: { text: JSON.stringify({ tag: "break", present: ["Hana"], sceneNew: true }), model: "nano/flash" } };
    const done = d.handleRoute({ ...post("/direction/run", { chatId: CHAT }), stash: first.stash }, host);
    expect(done.json.ok).toBe(true);
    const s = stateOf(files);
    expect(s.next).toMatchObject({ kind: "beat", after: "r4#0" });
    expect(s.log.map((l: any) => l.kind + ":" + (l.state || ""))).toEqual(expect.arrayContaining(["beat:due", "beat:fired"]));
  });
  it("a beat is decided before the rules: with both ready only the beat goes", () => {
    const { files, host } = setup(4);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "romcom" }), host);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, rule: { id: "interrupted", need: 2 } }), host);
    d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "The bell rings.", when: { kind: "replies", n: 0 }, wait: false }] }), host);
    const first = d.handleRoute(post("/direction/run", { chatId: CHAT, force: true }), host);
    host.llm.results = { direction: { text: JSON.stringify({ tag: "alone_moment", present: ["Hana"], sceneNew: false }), model: "nano/flash" } };
    d.handleRoute({ ...post("/direction/run", { chatId: CHAT, force: true }), stash: first.stash }, host);
    const s = stateOf(files);
    expect(s.next.kind).toBe("beat");
    expect(s.fires.filter((f: any) => f.kind !== "beat").length).toBe(0);
  });
  it("deleting the reply a beat became due on makes it not due; swiping the carrier brings its note back", () => {
    const due = mk(4, [beat({ dueKey: "r4#0", dueN: 4, dueWhy: "x" })]);
    const gone = d.reconcile(due.state, lines(3));
    expect(gone.plan.beats[0].dueKey).toBe("");
    const carried = { id: "f1", rule: "beat:b1", kind: "beat", who: [], with: [], after: "r4#0", n: 4, roll: null, tension: 0, hold: 0, payoff: false, result: "sent", carrier: "r5#0", forced: false, why: "", at: 1 };
    const s = mk(5, [beat()], reports(5), { fires: [carried] });
    // the carrier reply is deleted and nothing follows the anchor: the beat is queued again
    const back = d.reconcile(s.state, lines(4));
    expect(back.next).toMatchObject({ rule: "beat:b1", kind: "beat" });
    expect(back.fires[0].result).toBeNull();
  });
  it("a swipe of the reply that carried a beat brings its note again", () => {
    const { files, host } = setup(5);
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "Rain starts.", when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
    files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), fires: [{ id: "f1", rule: "beat:" + id, kind: "beat", who: [], with: [], after: "r4#0", n: 4, roll: null, tension: 0, hold: 0, payoff: false, result: "sent", carrier: "r5#0", forced: true, why: "", at: 1 }] });
    const out = d.llmRequest(reqOf("swipe"), host);
    expect(out.messages[0].content).toContain("Rain starts.");
  });
});
