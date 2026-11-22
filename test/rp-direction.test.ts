// Direction (#496, phase 1): the director plugin. Pure rules first (precedence, names, reconcile, the lock and return lines),
// then the routes on a fake host: the two-pass model call, a swipe taking a report back, the lock and its release.
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as d from "../plugins/direction/plugin.js";

type Files = Record<string, string>;
const CHAT = "c1";
const GROUP = "grp_a";

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
function world(lines: string[], more: Files = {}): Files {
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, groupId: GROUP, userName: "Kaito" }),
    ["chats/" + CHAT + ".jsonl"]: lines.join("\n"),
    ["groups/" + GROUP + ".json"]: JSON.stringify({ id: GROUP, memberIds: ["hana", "yuzu", "mei"], generationMode: "narrator" }),
    "characters/hana/card.json": JSON.stringify({ name: "Hana Morimoto" }),
    "characters/yuzu/card.json": JSON.stringify({ name: "Yuzu Takane" }),
    "characters/mei/card.json": JSON.stringify({ name: "Mei Ishikawa" }),
    ["registry/" + CHAT + ".json"]: JSON.stringify({ entities: [{ id: "p1", kind: "person", name: "Юдзу", aliases: [{ text: "Yuzu-chan" }], src: "card", card: "yuzu" }] }),
    "direction/config.json": JSON.stringify({ v: 1, model: "nano/flash" }),
    ...more,
  };
}
const LINES = [msg("g", "system", "Morning.", { greeting: true }), msg("u1", "user", "I go to class."), msg("r1", "char", "Hana and Mei wait in the classroom.")];
type Host = { fs: ReturnType<typeof makeFs>; llm: { results: Record<string, unknown>; request: (k: string, r: any) => void }; asked: { key: string; req: any }[] };
function makeHost(files: Files): Host {
  const asked: { key: string; req: any }[] = [];
  return { fs: makeFs(files), llm: { results: {}, request: (key, req) => void asked.push({ key, req }) }, asked };
}
const post = (path: string, body: unknown, stash?: unknown) => ({ method: "POST", path, body, query: {}, ...(stash ? { stash } : {}) });
const put = (path: string, body: unknown) => ({ method: "PUT", path, body, query: {} });
const get = (path: string, query: Record<string, string>) => ({ method: "GET", path, query });
const stateOf = (files: Files) => JSON.parse(files["direction/state/" + CHAT + ".json"]!);

describe("direction: pure rules", () => {
  it("alone_moment wins over commute, break, lunch and club only with one member present", () => {
    expect(d.applyPrecedence("commute", 1)).toBe("alone_moment");
    expect(d.applyPrecedence("club", 1)).toBe("alone_moment");
    expect(d.applyPrecedence("date", 1)).toBe("date");
    expect(d.applyPrecedence("at_home", 1)).toBe("at_home");
    expect(d.applyPrecedence("commute", 2)).toBe("commute");
    expect(d.applyPrecedence("nonsense", 1)).toBe(null);
  });
  it("matches names by card name, first name and registry alias", () => {
    const named = d.memberNames([{ id: "hana", name: "Hana Morimoto" }, { id: "yuzu", name: "Yuzu Takane" }], [{ id: "p1", kind: "person", name: "Юдзу", aliases: [{ text: "Yuzu-chan" }], card: "yuzu" }]);
    expect(d.matchMembers(["Hana Morimoto"], named)).toEqual(["hana"]);
    expect(d.matchMembers(["hana"], named)).toEqual(["hana"]);
    expect(d.matchMembers(["Юдзу", "Yuzu-chan", "Kaito"], named)).toEqual(["yuzu"]);
    expect(d.matchMembers(["Hana Sato"], named)).toEqual(["hana"]);
  });
  it("reads the report out of fences and a thinking block", () => {
    expect(d.parseReport('<think>hm</think>```json\n{"tag":"lunch","present":["Hana"],"sceneNew":true}\n```')).toEqual({ tag: "lunch", present: ["Hana"], sceneNew: true });
    expect(d.parseReport("no json")).toBe(null);
  });
  it("a swipe or delete takes back reports and a return whose anchor is gone", () => {
    const st = { ...d.emptyState(CHAT), reports: [{ key: "r1#0", present: [], tag: null }, { key: "r2#0", present: [], tag: null }], returning: { ids: ["mei"], after: "r2#0", at: 1 } };
    const msgs = [{ id: "r1", swipe: 0, role: "char" }];
    const next = d.reconcile(st, msgs);
    expect(next.reports.map((r: any) => r.key)).toEqual(["r1#0"]);
    expect(next.returning).toBe(null);
  });
  it("the return rides only the first reply after the release, and its swipe", () => {
    const st = { ...d.emptyState(CHAT), returning: { ids: ["mei"], after: "r1#0", at: 1 } };
    const before = [{ id: "r1", swipe: 0, role: "char" }, { id: "u2", swipe: 0, role: "user" }];
    expect(d.returnDue(st, before, "send")).toBe(true);
    const after = [...before, { id: "r2", swipe: 0, role: "char" }];
    expect(d.returnDue(st, after, "send")).toBe(false);
    expect(d.returnDue(st, after, "swipe")).toBe(true);
  });
  it("lock and return lines name members and the player", () => {
    const members = [{ id: "hana", name: "Hana Morimoto" }, { id: "yuzu", name: "Yuzu Takane" }, { id: "mei", name: "Mei Ishikawa" }];
    const lock = d.sceneLines({ state: { ...d.emptyState(CHAT), lock: { ids: ["yuzu"], at: 1 } }, members, userName: "Kaito", msgs: [], op: "send" });
    expect(lock[0].label).toBe("Direction · lock");
    expect(lock[0].text).toContain("only Yuzu Takane is here with Kaito");
    const back = d.sceneLines({ state: { ...d.emptyState(CHAT), returning: { ids: ["hana", "mei"], after: "r1#0", at: 1 } }, members, userName: "Kaito", msgs: [{ id: "r1", swipe: 0, role: "char" }], op: "send" });
    expect(back[0].text).toContain("Hana Morimoto and Mei Ishikawa come back");
  });
});

describe("direction: routes", () => {
  it("does nothing while off, or with no model", () => {
    const files = world(LINES);
    const host = makeHost(files);
    expect(d.handleRoute(post("/direction/run", { chatId: CHAT }), host).json.reason).toBe("off");
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    files["direction/config.json"] = JSON.stringify({ v: 1, model: "" });
    expect(d.handleRoute(post("/direction/run", { chatId: CHAT }), host).json.reason).toBe("no-model");
    expect(host.asked.length).toBe(0);
  });
  it("one call reads the newest reply; the report is tied to it and a swipe takes it back", () => {
    const files = world(LINES);
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    const first = d.handleRoute(post("/direction/run", { chatId: CHAT }), host);
    expect(first.__llmPending).toBe(true);
    expect(host.asked[0].req.model).toBe("nano/flash");
    expect(host.asked[0].req.messages[0].content).toContain("REPLY: Hana and Mei wait in the classroom.");
    host.llm.results.direction = { text: '{"tag":"lesson","present":["Hana","Mei Ishikawa"],"sceneNew":true}', model: "nano/flash" };
    const done = d.handleRoute(post("/direction/run", { chatId: CHAT }, first.stash), host);
    expect(done.json.ok).toBe(true);
    expect(done.json.report).toMatchObject({ key: "r1#0", tag: "lesson", present: ["hana", "mei"], sceneNew: true });
    host.llm.results = {};
    expect(d.handleRoute(post("/direction/run", { chatId: CHAT }), host).json.reason).toBe("done");
    // a swipe: the reply is written again with swipe 1, the old report goes
    files["chats/" + CHAT + ".jsonl"] = [...LINES.slice(0, 2), msg("r1", "char", "Only Yuzu is there.", { swipe: 1 })].join("\n");
    const view = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(view.report).toBe(null);
    expect(stateOf(files).reports).toEqual([]);
  });
  it("the scene comes from the lock first, then the director, then the Dashboard", () => {
    const files = world(LINES, { ["dashboard/state/" + CHAT + ".json"]: JSON.stringify({ snapshots: { a: { turn: 1, present: ["Юдзу"] } } }) });
    const host = makeHost(files);
    // switch off: the engine does not limit the scene, so the bar shows nothing as limited
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.scene).toMatchObject({ source: "none", present: [] });
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.scene).toMatchObject({ source: "dashboard", present: ["yuzu"] });
    d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: { ids: ["mei", "nobody"] } }), host);
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.scene).toMatchObject({ source: "lock", present: ["mei"] });
  });
  it("releasing the lock lets the others back on the next reply, once", () => {
    const files = world(LINES);
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: { ids: ["yuzu"] } }), host);
    const req = (op: string) => ({ key: "reply", request: { sessionId: CHAT, messages: [{ role: "user", content: "Hi." }] }, turn: { op } });
    expect(d.llmRequest(req("send"), host).messages[0].content).toContain("[SCENE: only Yuzu Takane is here with Kaito]");
    d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: null }), host);
    expect(stateOf(files).returning).toMatchObject({ ids: ["hana", "mei"], after: "r1#0" });
    const patch = d.llmRequest(req("send"), host);
    expect(patch.messages[0].content).toContain("Hana Morimoto and Mei Ishikawa come back");
    expect(patch.promptSources.parts[0].label).toBe("Direction · return");
    // a reply after it: the return is spent
    files["chats/" + CHAT + ".jsonl"] = [...LINES, msg("u2", "user", "Hi."), msg("r2", "char", "They come in.")].join("\n");
    expect(d.llmRequest(req("send"), host)).toBe(null);
  });
  it("a lock needs a member of the group", () => {
    const host = makeHost(world(LINES));
    expect(d.handleRoute(put("/direction/chat", { chatId: CHAT, lock: { ids: ["nobody"] } }), host).status).toBe(400);
  });
});
