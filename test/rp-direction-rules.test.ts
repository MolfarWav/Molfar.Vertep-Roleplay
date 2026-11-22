// Direction (#496, phase 2): genre rules. Pure conditions, the decision (cooldown, payoff, 2d6), then the routes on a fake host:
// a rule queued after a report, its note on the next reply, the judgement (came / mentioned / missed), yielding to the lock and
// to World, a swipe asking for the same moment again, "Fire now", and the engine counting who comes in as present.
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
const msg = (id: string, role: string, text: string, more: Record<string, unknown> = {}) => JSON.stringify({ id, role, text, swipe: 0, ...more });
// three turns with Hana alone with the player: u1 r1 u2 r2 u3 r3
const LINES = [msg("g", "system", "Morning.", { greeting: true }), msg("u1", "user", "Hi."), msg("r1", "char", "Hana smiles."), msg("u2", "user", "Walk?"), msg("r2", "char", "Hana nods."), msg("u3", "user", "Roof?"), msg("r3", "char", "Hana and the wind.")];
function world(lines: string[], more: Files = {}): Files {
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, groupId: GROUP, userName: "Kaito" }),
    ["chats/" + CHAT + ".jsonl"]: lines.join("\n"),
    ["groups/" + GROUP + ".json"]: JSON.stringify({ id: GROUP, memberIds: ["hana", "yuzu", "mei"], generationMode: "narrator" }),
    "characters/hana/card.json": JSON.stringify({ name: "Hana Morimoto" }),
    "characters/yuzu/card.json": JSON.stringify({ name: "Yuzu Takane" }),
    "characters/mei/card.json": JSON.stringify({ name: "Mei Ishikawa" }),
    "direction/config.json": JSON.stringify({ v: 1, model: "nano/flash" }),
    ...more,
  };
}
type Host = { fs: ReturnType<typeof makeFs>; llm: { results: Record<string, unknown>; request: (k: string, r: any) => void }; asked: { key: string; req: any }[] };
function makeHost(files: Files): Host {
  const asked: { key: string; req: any }[] = [];
  return { fs: makeFs(files), llm: { results: {}, request: (key, req) => void asked.push({ key, req }) }, asked };
}
const post = (path: string, body: unknown, stash?: unknown) => ({ method: "POST", path, body, query: {}, ...(stash ? { stash } : {}) });
const put = (path: string, body: unknown) => ({ method: "PUT", path, body, query: {} });
const get = (path: string, query: Record<string, string>) => ({ method: "GET", path, query });
const stateOf = (files: Files) => JSON.parse(files["direction/state/" + CHAT + ".json"]!);
const report = (key: string, present: string[], tag = "alone_moment") => ({ key, at: 1, tag, present, sceneNew: false, model: "m", ms: 1 });

/** A chat with the director on, the rom-com set on (every chance sure: need 2) and reports for the first replies. */
function setup(lines = LINES, reports = [report("r1#0", ["hana"]), report("r2#0", ["hana"])], more: Files = {}) {
  const files = world(lines, more);
  const host = makeHost(files);
  d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
  d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "romcom" }), host);
  d.handleRoute(put("/direction/rules", { chatId: CHAT, rule: { id: "interrupted", need: 2 } }), host);
  files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), reports });
  return { files, host };
}
/** The director reads the newest reply and answers `answer`; returns the route's final answer. */
function runDirector(host: Host, answer: unknown) {
  const first = d.handleRoute(post("/direction/run", { chatId: CHAT }), host);
  expect(first.__llmPending).toBe(true);
  host.llm.results = { direction: { text: JSON.stringify(answer), model: "nano/flash" } };
  const done = d.handleRoute(post("/direction/run", { chatId: CHAT }, first.stash), host);
  host.llm.results = {};
  return done;
}
const reqOf = (op: string, text = "Hi.") => ({ key: "reply", request: { sessionId: CHAT, messages: [{ role: "user", content: text }] }, turn: { op } });

const rule = (id: string) => d.activeRules(d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { need: 2 } } })).find((r: any) => r.id === id);
const rowsOf = (reports: any[], total: number) => Array.from({ length: total }, (_, i) => ({ n: i + 1, key: "r" + (i + 1) + "#0", report: reports.find((r) => r.key === "r" + (i + 1) + "#0") || null }));
const rnd = () => 0.5;

describe("direction rules: conditions", () => {
  it("alone for N replies: the same single member, then someone else walks in (the longest away first)", () => {
    const reports = [report("r1#0", ["hana"]), report("r2#0", ["hana"]), report("r3#0", ["hana"])];
    const found = d.evalRule(rule("interrupted"), { rows: rowsOf(reports, 3), members, rnd });
    expect(found.ok).toBe(true);
    expect(found.who).toHaveLength(1);
    expect(["yuzu", "mei"]).toContain(found.who[0]);
    expect(found.with).toEqual(["hana"]);
    expect(found.why).toContain("alone with Hana Morimoto for 3 replies");
  });
  it("not when someone else was in the scene a reply ago, or the single member changed", () => {
    const a = [report("r1#0", ["hana", "mei"]), report("r2#0", ["hana"]), report("r3#0", ["hana"])];
    expect(d.evalRule(rule("interrupted"), { rows: rowsOf(a, 3), members, rnd }).ok).toBe(false);
    const b = [report("r1#0", ["hana"]), report("r2#0", ["yuzu"]), report("r3#0", ["hana"])];
    expect(d.evalRule(rule("interrupted"), { rows: rowsOf(b, 3), members, rnd }).ok).toBe(false);
  });
  it("a reply with no report breaks the run", () => {
    const reports = [report("r1#0", ["hana"]), report("r3#0", ["hana"])];
    expect(d.evalRule(rule("interrupted"), { rows: rowsOf(reports, 3), members, rnd }).ok).toBe(false);
  });
  it("nobody comes in when everyone is already here", () => {
    const reports = [report("r1#0", ["hana"]), report("r2#0", ["hana"]), report("r3#0", ["hana"])];
    const all = [{ id: "hana", name: "Hana" }];
    expect(d.evalRule(rule("interrupted"), { rows: rowsOf(reports, 3), members: all, rnd }).ok).toBe(false);
  });
  it("the nobody rule needs an empty scene for N replies and skips at_home", () => {
    const empty = [report("r1#0", [], "lesson"), report("r2#0", [], "lesson"), report("r3#0", [], "lesson")];
    expect(d.evalRule(rule("nobody"), { rows: rowsOf(empty, 3), members, rnd }).ok).toBe(true);
    const home = empty.map((r) => ({ ...r, tag: "at_home" }));
    expect(d.evalRule(rule("nobody"), { rows: rowsOf(home, 3), members, rnd }).ok).toBe(false);
  });
  it("the crowd rule: a break with two or fewer here, never in a lesson", () => {
    expect(d.evalRule(rule("crowd"), { rows: rowsOf([report("r1#0", ["hana", "mei"], "break")], 1), members, rnd }).ok).toBe(true);
    expect(d.evalRule(rule("crowd"), { rows: rowsOf([report("r1#0", ["hana", "mei", "yuzu"], "break")], 1), members, rnd }).ok).toBe(false);
    expect(d.evalRule(rule("crowd"), { rows: rowsOf([report("r1#0", ["hana"], "lesson")], 1), members, rnd }).ok).toBe(false);
  });
});

describe("direction rules: the decision", () => {
  const base = (over: any = {}) => ({ ...d.emptyState(CHAT), on: true, rules: d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { need: 2 } } }), reports: [report("r1#0", ["hana"]), report("r2#0", ["hana"]), report("r3#0", ["hana"])], ...over });
  const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "r" + (i + 1), swipe: 0, role: "char" }));
  const decide = (state: any, n = 3, extra: any = {}) => d.decideRules({ state, msgs: lines(n), members, chatId: CHAT, dashDirection: "", now: 1000, ...extra });

  it("fires the first rule that holds and logs why, the roll and who", () => {
    const r = decide(base());
    expect(r.fire).toMatchObject({ rule: "interrupted", kind: "interrupt", after: "r3#0", n: 3, tension: 1, hold: 5, payoff: false, forced: false });
    expect(r.fire.roll).toMatchObject({ need: 2 });
    expect(r.logs[0]).toMatchObject({ kind: "rule", state: "fired", rule: "interrupted" });
  });
  it("a missed roll is logged and nothing fires", () => {
    const state = base({ rules: d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { need: 13 } } }) });
    const r = decide(state);
    expect(r.fire).toBe(null);
    expect(r.logs[0]).toMatchObject({ state: "missed", rule: "interrupted" });
  });
  it("the same reply is decided once, and the roll is the same dice every time", () => {
    const a = decide(base(), 3);
    const again = decide(base({ fires: [a.fire] }));
    expect(again.fire).toBe(null);
    expect(d.roll2d6("x", 8)).toEqual(d.roll2d6("x", 8));
    expect(d.roll2d6("x", 8)).not.toEqual(d.roll2d6("y", 8));
  });
  it("the cooldown holds the rule for its replies, then it is ready again", () => {
    const first = decide(base()).fire;
    const four = decide(base({ fires: [first] }), 3);
    expect(four.fire).toBe(null);
    const status = (total: number) => d.ruleStatus(base({ fires: [first] }), rule("interrupted"), total);
    expect(status(3)).toMatchObject({ status: "cooldown", left: 5 });
    expect(status(7)).toMatchObject({ status: "cooldown", left: 1 });
    expect(status(8)).toMatchObject({ status: "ready", left: 0 });
  });
  it("every K-th firing adds the payoff silence, and the tension starts over", () => {
    const k3 = (tension: number, n: number) => ({ id: "f" + n, rule: "interrupted", kind: "interrupt", who: ["mei"], with: ["hana"], after: "r" + n + "#0", n, roll: null, tension, hold: 5, payoff: false, result: "came", carrier: "", forced: false, why: "", at: 1 });
    const state = base({ reports: [report("r19#0", ["hana"]), report("r20#0", ["hana"]), report("r21#0", ["hana"])], fires: [k3(1, 1), k3(2, 8)] });
    const lines21 = Array.from({ length: 21 }, (_, i) => ({ id: "r" + (i + 1), swipe: 0, role: "char" }));
    // the third firing: tension 3 = K, hold = cooldown 5 + M 4
    const third = d.decideRules({ state: { ...state, fires: [{ ...k3(1, 1) }, { ...k3(2, 8), after: "r8#0" }, ] }, msgs: lines21, members, chatId: CHAT, dashDirection: "", now: 2000 });
    expect(third.fire).toMatchObject({ tension: 3, payoff: true, hold: 9 });
    const after = base({ fires: [{ ...third.fire }] });
    expect(d.ruleStatus(after, rule("interrupted"), 24)).toMatchObject({ status: "payoff", left: 6 });
    // the one after the payoff counts from one again
    const next = d.decideRules({ state: { ...after, reports: [report("r30#0", ["hana"]), report("r29#0", ["hana"]), report("r28#0", ["hana"])] }, msgs: Array.from({ length: 30 }, (_, i) => ({ id: "r" + (i + 1), swipe: 0, role: "char" })), members, chatId: CHAT, dashDirection: "", now: 3000 });
    expect(next.fire).toMatchObject({ tension: 1, payoff: false });
  });
  it("nothing fires with the lock, in an explicit scene, with the director or the rules off, or with no report on the newest reply", () => {
    expect(decide(base({ lock: { ids: ["hana"], at: 1 } })).fire).toBe(null);
    expect(decide(base(), 3, { dashDirection: "explicit" }).fire).toBe(null);
    expect(decide(base({ on: false })).fire).toBe(null);
    expect(decide(base({ rules: { ...base().rules, on: false } })).fire).toBe(null);
    expect(decide(base({ reports: [report("r1#0", ["hana"]), report("r2#0", ["hana"])] })).fire).toBe(null);
  });
  it("a rule switched off does not fire; the others still can", () => {
    const state = base({ rules: d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { on: false } } }), reports: [report("r1#0", ["hana", "mei"], "break")] });
    const r = d.decideRules({ state, msgs: lines(1), members, chatId: CHAT, dashDirection: "", now: 1 });
    expect(r.fire).toBe(null);
    const crowd = d.decideRules({ state: { ...state, rules: d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { on: false }, crowd: { need: 2 } } }) }, msgs: lines(1), members, chatId: CHAT, dashDirection: "", now: 1 });
    expect(crowd.fire).toMatchObject({ rule: "crowd", kind: "join", who: ["yuzu"] });
  });
  it("edits are cleaned: numbers clamp, unknown things drop, k 0 turns the payoff off", () => {
    const rules = d.cleanRules({ set: "romcom", on: true, edits: { interrupted: { need: 99, cooldown: -4, k: 0, junk: 1 }, "bad id!": { need: 3 } } });
    expect(rules.edits).toEqual({ interrupted: { need: 13, cooldown: 0, k: 0 } });
    expect(d.activeRules(rules)[0].payoff).toBe(null);
    expect(d.cleanRules({ set: "nope", on: true })).toEqual({ set: "", on: false, edits: {} });
  });
});

describe("direction rules: through the routes", () => {
  it("a report queues the note; the next reply carries it; the report after it says they came", () => {
    const { files, host } = setup();
    const done = runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(done.json.ok).toBe(true);
    const queued = stateOf(files).next;
    expect(queued).toMatchObject({ rule: "interrupted", kind: "interrupt", after: "r3#0", with: ["hana"] });
    expect(["yuzu", "mei"]).toContain(queued.who[0]);
    const view = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(view.next).toMatchObject({ rule: "interrupted", due: true });
    expect(view.scene.present).toContain(queued.who[0]);
    expect(view.rules.items.find((r: any) => r.id === "interrupted")).toMatchObject({ status: "cooldown", left: 5, kind: "interrupt" });
    // the next request: the note names who walks in on whom
    const who = members.find((m) => m.id === queued.who[0])!.name;
    const patch = d.llmRequest(reqOf("send"), host);
    expect(patch.messages[0].content).toContain(who + " walks in on Kaito and Hana Morimoto and interrupts the moment.");
    expect(patch.promptSources.parts[0].label).toBe("Direction · rule");
    // the reply is written, the director reads it: the one who walked in is present
    files["chats/" + CHAT + ".jsonl"] = [...LINES, msg("u4", "user", "Hi."), msg("r4", "char", who + " opens the door.")].join("\n");
    const second = runDirector(host, { tag: "alone_moment", present: ["Hana", who], sceneNew: false });
    expect(second.json.ok).toBe(true);
    const st = stateOf(files);
    expect(st.next).toBe(null);
    expect(st.fires[0]).toMatchObject({ result: "came", carrier: "r4#0" });
    expect(st.log.some((l: any) => l.kind === "result" && l.result === "came")).toBe(true);
    // spent: the following request carries nothing
    expect(d.llmRequest(reqOf("send"), host)).toBe(null);
  });
  it("the note missed: only a mention, or not even that", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    const who = members.find((m) => m.id === stateOf(files).next.who[0])!.name;
    files["chats/" + CHAT + ".jsonl"] = [...LINES, msg("u4", "user", "Hi."), msg("r4", "char", "Hana wonders where " + who.split(" ")[0] + " is.")].join("\n");
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(stateOf(files).fires[0].result).toBe("mentioned");
    const again = setup();
    runDirector(again.host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    again.files["chats/" + CHAT + ".jsonl"] = [...LINES, msg("u4", "user", "Hi."), msg("r4", "char", "Quiet.")].join("\n");
    runDirector(again.host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(stateOf(again.files).fires[0].result).toBe("missed");
  });
  it("the lock and the return come first: the rule's note yields", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: { ids: ["hana"] } }), host);
    const patch = d.llmRequest(reqOf("send"), host);
    expect(patch.messages[0].content).toContain("[SCENE: only Hana Morimoto is here with Kaito]");
    expect(patch.messages[0].content).not.toContain("walks in");
    const st = stateOf(files);
    expect(st.next).toBe(null);
    expect(st.fires[0].result).toBe("yielded");
  });
  it("World's event in this reply wins; a rule note comes only when World put nothing in", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    files["world/state/" + CHAT + ".json"] = JSON.stringify({ event: { text: "A storm", sent: 1, after: "r3#0" } });
    expect(d.llmRequest(reqOf("send"), host)).toBe(null);
    expect(stateOf(files).fires[0].result).toBe("yielded");
    // another decision, World quiet: delivered
    const free = setup();
    runDirector(free.host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    free.files["world/state/" + CHAT + ".json"] = JSON.stringify({ event: { text: "old", sent: 1, after: "r1#0" } });
    expect(d.llmRequest(reqOf("send"), free.host).messages[0].content).toContain("walks in");
  });
  it("a swipe of the carrier asks for the same moment again", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    const who = members.find((m) => m.id === stateOf(files).next.who[0])!.name;
    files["chats/" + CHAT + ".jsonl"] = [...LINES, msg("u4", "user", "Hi."), msg("r4", "char", who + " opens the door.")].join("\n");
    runDirector(host, { tag: "alone_moment", present: ["Hana", who], sceneNew: false });
    expect(stateOf(files).fires[0]).toMatchObject({ result: "came", carrier: "r4#0" });
    // the swipe: the last reply is written again, the note rides it again
    const patch = d.llmRequest(reqOf("swipe"), host);
    expect(patch.messages[0].content).toContain("walks in");
    expect(stateOf(files).fires[0]).toMatchObject({ result: null, carrier: "" });
    expect(stateOf(files).next).toMatchObject({ rule: "interrupted" });
  });
  it("deleting the reported reply takes the decision back, and with it the cooldown", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(stateOf(files).next).not.toBe(null);
    files["chats/" + CHAT + ".jsonl"] = LINES.slice(0, 6).join("\n");
    const view = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(view.next).toBe(null);
    expect(view.fires).toEqual([]);
    expect(view.rules.items.find((r: any) => r.id === "interrupted").status).toBe("ready");
  });
  it("Fire now queues a note with no roll, no cooldown and no tension; skip drops it", () => {
    const { files, host } = setup(LINES, [report("r3#0", ["hana"])]);
    const fired = d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), host);
    expect(fired.json.next).toMatchObject({ rule: "crowd", kind: "join", forced: true, after: "r3#0" });
    const st = stateOf(files);
    expect(st.fires[0]).toMatchObject({ forced: true, roll: null, hold: 0, tension: 0 });
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.rules.items.find((r: any) => r.id === "crowd").status).toBe("ready");
    expect(d.llmRequest(reqOf("send"), host).messages[0].content).toContain("joins Kaito and Hana Morimoto here.");
    const again = setup(LINES, [report("r3#0", ["hana"])]);
    d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), again.host);
    d.handleRoute(post("/direction/skip", { chatId: CHAT }), again.host);
    expect(stateOf(again.files).next).toBe(null);
    expect(stateOf(again.files).fires).toEqual([]);
    expect(d.llmRequest(reqOf("send"), again.host)).toBe(null);
  });
  it("Fire now says why it cannot: off, locked, everyone here, no scene, unknown rule", () => {
    const off = makeHost(world(LINES));
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), off).status).toBe(400);
    const { host } = setup(LINES, [report("r3#0", ["hana", "yuzu", "mei"])]);
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), host).json.error).toContain("everyone");
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "nope" }), host).json.error).toContain("unknown");
    const blind = setup(LINES, []);
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), blind.host).json.error).toContain("not known");
    d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: { ids: ["hana"] } }), host);
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "crowd" }), host).json.error).toContain("locked");
  });
  it("the set, the switch and the edits live in the chat; changing the set or switching off drops the queued note", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(stateOf(files).next).not.toBe(null);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, on: false }), host);
    expect(stateOf(files).next).toBe(null);
    expect(stateOf(files).rules).toMatchObject({ set: "romcom", on: false });
    expect(d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "nope" }), host).status).toBe(400);
    expect(d.handleRoute(put("/direction/rules", { chatId: CHAT, rule: { id: "ghost", need: 5 } }), host).status).toBe(400);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, on: true, rule: { id: "crowd", cooldown: 9, k: 2, m: 3 } }), host);
    const item = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.rules.items.find((r: any) => r.id === "crowd");
    expect(item).toMatchObject({ cooldown: 9, k: 2, m: 3 });
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "" }), host);
    expect(stateOf(files).rules.on).toBe(false);
  });
  it("without a set, or with Direction off, no rule note is ever queued or delivered", () => {
    const files = world(LINES);
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), reports: [report("r1#0", ["hana"]), report("r2#0", ["hana"])] });
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    expect(stateOf(files).next).toBe(null);
    expect(d.llmRequest(reqOf("send"), host)).toBe(null);
  });
});

describe("direction rules: the engine counts who comes in as present", () => {
  it("a queued note adds its member to the scene for the reply that carries it, and only for that reply", () => {
    const { files, host } = setup();
    runDirector(host, { tag: "alone_moment", present: ["Hana"], sceneNew: false });
    const who = stateOf(files).next.who[0];
    const fsx = makeFs(files);
    const meta = { id: CHAT, groupId: GROUP };
    const list = LINES.map((l) => JSON.parse(l));
    const scene = E.directionScene(fsx, meta, members, list);
    expect([...scene.present].sort()).toEqual(["hana", who].sort());
    const later = E.directionScene(fsx, meta, members, [...list, { id: "u4", role: "user", swipe: 0 }, { id: "r4", role: "char", swipe: 0, text: "x" }]);
    expect([...later.present]).toEqual(["hana"]);
  });
});
