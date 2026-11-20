// Meanwhile, the routes (M1b): a pass end to end on a fake host: the two-pass model call, the retry, the log, the cooldown,
// the rollback by a swipe and what the state route shows under each spoiler setting.
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as mw from "../plugins/meanwhile/plugin.js";

type Files = Record<string, string>;
const CHAT = "c1";

function makeFs(files: Files) {
  return {
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p];
    },
    write: (p: string, t: string) => void (files[p] = t),
    list: (d: string) => Object.keys(files).filter((p) => p.startsWith(d + "/")).map((p) => p.slice(d.length + 1)),
    remove: (p: string) => void delete files[p],
  };
}

const snap = (day: number, time: string, more: Record<string, unknown> = {}) => ({ clock: { day, time, place: "the mill" }, present: ["Cora", "Mira"], scene: { new: false }, ...more });

function world(more: Files = {}): Files {
  const msgs = [1, 2, 3, 4].map((i) => JSON.stringify({ id: "m" + i, role: i % 2 ? "assistant" : "user", swipe: 0 })).join("\n");
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, model: "chat/model" }),
    ["chats/" + CHAT + ".jsonl"]: msgs,
    "settings.json": JSON.stringify({ model: "app/model" }),
    ["dashboard/state/" + CHAT + ".json"]: JSON.stringify({
      personIds: { cora: "p3", mira: "user" },
      snapshots: { "m1#0": snap(1, "10:00"), "m2#0": snap(1, "10:10"), "m3#0": snap(1, "10:20", { scene: { new: true } }), "m4#0": snap(1, "10:30") },
    }),
    ["registry/" + CHAT + ".json"]: JSON.stringify({
      entities: [
        { id: "user", kind: "person", name: "Mira", src: "persona" },
        { id: "p1", kind: "person", name: "Ada", src: "card", card: "card-ada" },
        { id: "p2", kind: "person", name: "Bram", src: "world" },
        { id: "p3", kind: "person", name: "Cora", src: "card", card: "card-cora" },
        { id: "l1", kind: "place", name: "the mill" },
        { id: "l2", kind: "place", name: "the harbour" },
      ],
    }),
    ["world/state/" + CHAT + ".json"]: JSON.stringify({
      fronts: [{ id: "f1", name: "The Guild", goal: "take the harbour", clock: 2, size: 6, status: "active" }],
      entities: [{ id: "n1", kind: "person", name: "Bram", status: "active", text: "owes the Guild" }],
      regIds: { n1: "p2" },
    }),
    ...more,
  };
}

const good = (more: Record<string, unknown> = {}) =>
  JSON.stringify({ events: [{ who: ["p1"], what: "Ada hides the old ledger under the chapel floor.", where: "l2", when: "at night", witnesses: [], visibility: "secret", effects: [{ type: "front_clock", front: "f1" }], ...more }] });

type Host = { fs: ReturnType<typeof makeFs>; llm: { results: Record<string, unknown>; request: (k: string, r: any) => void }; asked: { key: string; req: any }[] };
function makeHost(files: Files): Host {
  const asked: { key: string; req: any }[] = [];
  return { fs: makeFs(files), llm: { results: {}, request: (key, req) => void asked.push({ key, req }) }, asked };
}

/** Runs a route to its end, answering each model call with the next of `answers` (an object of the result, or a string for its text). */
function drive(host: Host, req: any, answers: (string | Record<string, unknown>)[] = []) {
  let stash: unknown;
  host.llm.results = {};
  for (let i = 0; i < 6; i++) {
    const out = mw.handleRoute({ ...req, stash }, host);
    if (!out || !out.__llmPending) return out;
    const last = host.asked[host.asked.length - 1]!;
    const a = answers.shift();
    host.llm.results = { ...host.llm.results, [last.key]: typeof a === "string" ? { text: a, model: "m/x" } : (a ?? { error: "no answer scripted" }) };
    stash = out.stash;
  }
  throw new Error("too many passes");
}
const run = (host: Host, answers: (string | Record<string, unknown>)[], force = false) =>
  drive(host, { method: "POST", path: "/meanwhile/run", body: { chatId: CHAT, ...(force ? { force: true } : {}) } }, answers);
const state = (host: Host) => mw.handleRoute({ method: "GET", path: "/meanwhile/state", query: { chatId: CHAT } }, host).json;
const enable = (host: Host, more: Record<string, unknown> = {}) => mw.handleRoute({ method: "PUT", path: "/meanwhile/config", body: { enabled: true, ...more } }, host);

describe("the routes", () => {
  it("ignores other paths and refuses a bad request", () => {
    expect(mw.handleRoute({ method: "GET", path: "/world/state" }, makeHost({}))).toBeNull();
    expect(mw.handleRoute({ method: "GET", path: "/meanwhile/nope" }, makeHost({})).status).toBe(404);
    expect(mw.handleRoute({ method: "POST", path: "/meanwhile/run", body: { chatId: "../x" } }, makeHost({})).status).toBe(400);
    expect(mw.handleRoute({ method: "POST", path: "/meanwhile/run", body: { chatId: "zz" } }, makeHost({})).status).toBe(404);
  });

  it("is off until the switch is on, and asks no model while off", () => {
    const h = makeHost(world());
    expect(run(h, []).json).toEqual({ ok: false, reason: "off" });
    expect(h.asked).toHaveLength(0);
  });

  it("a due pass asks once with the people it may use, keeps what passes and writes the log", () => {
    const h = makeHost(world());
    enable(h);
    const r = run(h, [good()]);
    expect(r.json).toMatchObject({ ok: true, kept: 1, offered: 1, dropped: 0 });
    expect(h.asked).toHaveLength(1);
    const req = h.asked[0]!.req;
    expect(req.model).toBe("chat/model");
    expect(req.presetParams.max_tokens).toBe(1500);
    expect(req.reasoning).toBeUndefined();
    const user = req.messages[0].content as string;
    expect(user).toContain("p1 Ada");
    expect(user).toContain("p2 Bram: wants owes the Guild");
    expect(user).toContain("f1 The Guild");
    expect(user).not.toContain("p3 Cora"); // in the scene
    expect(user).not.toContain("user Mira");
    const st = JSON.parse(h.fs.read("meanwhile/state/" + CHAT + ".json"));
    expect(st).toMatchObject({ cursor: "m4#0", next: 2 });
    expect(st.events[0]).toMatchObject({ id: "m1", afterKey: "m4#0", who: ["p1"], status: "active" });
    expect(st.log[0]).toMatchObject({ reason: "scene", from: "", to: "m4#0", offered: 1, kept: 1, model: "m/x" });
    expect(st.usage.runs).toBe(1);
    // the same replies are not read again
    expect(run(h, [good()]).json).toMatchObject({ ok: false, reason: "few" });
  });

  it("the model in force follows the chain: this plugin's, then the World's, the sensor's, Litopys's, the chat's, the app's", () => {
    const h = makeHost(world({ "world/config.json": JSON.stringify({ model: "world/m" }) }));
    expect(mw.modelFor(h.fs, mw.cleanConfig({}), { model: "chat/model" })).toEqual({ model: "world/m", from: "world" });
    expect(mw.modelFor(h.fs, mw.cleanConfig({ model: "own/m" }), null)).toEqual({ model: "own/m", from: "meanwhile" });
    expect(mw.modelFor(makeFs({}), mw.cleanConfig({}), null)).toEqual({ model: "", from: "none" });
    const g = makeHost(world());
    expect(mw.modelFor(g.fs, mw.cleanConfig({}), { model: "chat/model" })).toEqual({ model: "chat/model", from: "chat" });
  });

  it("says why it did not run: nobody to act, no model", () => {
    const files = world();
    files["registry/" + CHAT + ".json"] = JSON.stringify({ entities: [{ id: "user", kind: "person", name: "Mira", src: "persona" }, { id: "p3", kind: "person", name: "Cora", src: "card", card: "k" }] });
    const h = makeHost(files);
    enable(h);
    expect(run(h, []).json).toMatchObject({ reason: "nobody" });
    const g = makeHost(world({ "settings.json": "{}", ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT }) }));
    enable(g);
    expect(run(g, []).json).toMatchObject({ reason: "no-model" });
    expect(g.asked).toHaveLength(0);
  });

  it("the per-card switch keeps a card's character out of the prompt", () => {
    const h = makeHost(world());
    enable(h, { offCards: ["card-ada"] });
    run(h, [good({ who: ["p2"] })]);
    const user = h.asked[0]!.req.messages[0].content as string;
    expect(user).not.toContain("p1 Ada");
    expect(user).toContain("p2 Bram");
  });

  it("an event with someone from the scene is dropped, the rest stay, the log says why", () => {
    const h = makeHost(world());
    enable(h);
    const both = JSON.stringify({ events: [JSON.parse(good()).events[0], { who: ["p3"], what: "Cora leaves the mill quietly at dawn.", where: "l1", when: "", witnesses: [], visibility: "local", effects: [] }] });
    expect(run(h, [both]).json).toMatchObject({ ok: true, kept: 1, offered: 2, dropped: 1 });
    const log = state(h).log[0];
    // the reason says the name, not the id
    expect(log.dropped[0]).toMatch(/Cora is in the scene/);
  });

  it("an empty answer is retried once with more room; a rate limit once as it was", () => {
    const h = makeHost(world());
    enable(h);
    const r = run(h, [{ text: "", reasoning: "hmm", model: "m/x" }, good()]);
    expect(r.json.ok).toBe(true);
    expect(h.asked.map((a) => a.key)).toEqual(["meanwhile", "meanwhile_retry"]);
    expect(h.asked[1]!.req.presetParams.max_tokens).toBe(6000);
    expect(state(h).log[0].retried).toBe(true);
    const g = makeHost(world());
    enable(g);
    expect(run(g, [{ error: "HTTP 429 rate limit" }, good()]).json.ok).toBe(true);
    expect(g.asked[1]!.req.presetParams.max_tokens).toBe(1500);
  });

  it("a failure is logged, the cursor stays, the next pass waits (a cooldown) unless it is forced", () => {
    const h = makeHost(world());
    enable(h);
    expect(run(h, ["no json at all"]).json).toMatchObject({ ok: false, reason: "bad-reply" });
    let st = JSON.parse(h.fs.read("meanwhile/state/" + CHAT + ".json"));
    expect(st.cursor).toBe("");
    expect(st.log[0].error).toMatch(/^bad-reply/);
    expect(run(h, []).json).toMatchObject({ reason: "cooldown" });
    expect(run(h, [good()], true).json.ok).toBe(true);
    st = JSON.parse(h.fs.read("meanwhile/state/" + CHAT + ".json"));
    expect(st.lastFailAt).toBe(0);
    // an error and an answer that stays empty after the retry
    const g = makeHost(world());
    enable(g);
    expect(run(g, [{ error: "boom" }]).json).toMatchObject({ ok: false, reason: "error" });
    const e = makeHost(world());
    enable(e);
    expect(run(e, [{ text: "" }, { text: "" }]).json).toMatchObject({ ok: false, reason: "empty" });
  });

  it("force runs a quiet chat; a clock jump runs by itself", () => {
    const quiet = world();
    quiet["dashboard/state/" + CHAT + ".json"] = JSON.stringify({ personIds: {}, snapshots: { "m1#0": snap(1, "10:00"), "m2#0": snap(1, "10:10"), "m3#0": snap(1, "10:20"), "m4#0": snap(1, "10:30") } });
    const h = makeHost(quiet);
    enable(h);
    expect(run(h, []).json).toMatchObject({ reason: "quiet" });
    expect(run(h, [good()], true).json.ok).toBe(true);
    expect(state(h).log[0].reason).toBe("manual");
    const jump = world();
    jump["dashboard/state/" + CHAT + ".json"] = JSON.stringify({ personIds: {}, snapshots: { "m1#0": snap(1, "08:00"), "m2#0": snap(1, "10:00"), "m3#0": snap(1, "12:00"), "m4#0": snap(2, "01:00") } });
    const g = makeHost(jump);
    enable(g);
    expect(run(g, [good()]).json.ok).toBe(true);
    expect(state(g).log[0].reason).toBe("clock");
  });

  it("a swipe of the reply a pass read takes its events back and the cursor with them", () => {
    const files = world();
    const h = makeHost(files);
    enable(h);
    run(h, [good()]);
    expect(state(h).events).toHaveLength(1);
    files["chats/" + CHAT + ".jsonl"] = [1, 2, 3].map((i) => JSON.stringify({ id: "m" + i, role: "assistant", swipe: 0 })).concat(JSON.stringify({ id: "m4", role: "assistant", swipe: 1 })).join("\n");
    const v = state(h);
    expect(v.events).toEqual([]);
    expect(JSON.parse(h.fs.read("meanwhile/state/" + CHAT + ".json"))).toMatchObject({ cursor: "", events: [], passes: [] });
    // the log keeps the pass but says it was taken back
    expect(v.log[0]).toMatchObject({ kept: 1, undone: true });
  });
});

describe("the state view and the config", () => {
  it("shows what the spoiler setting allows, in the events and in the log", () => {
    const h = makeHost(world());
    enable(h, { spoilers: "all" });
    run(h, [good()]);
    let v = state(h);
    expect(v.events[0]).toMatchObject({ id: "m1", what: expect.stringContaining("Ada hides"), who: ["Ada"] });
    expect(v.log[0].events[0].who).toEqual(["Ada"]);
    expect(v.model).toEqual({ model: "chat/model", from: "chat" });
    mw.handleRoute({ method: "PUT", path: "/meanwhile/config", body: { spoilers: "hints" } }, h);
    v = state(h);
    expect(v.events[0].what).toBeUndefined();
    expect(v.events[0].who).toEqual(["Ada"]);
    mw.handleRoute({ method: "PUT", path: "/meanwhile/config", body: { spoilers: "none" } }, h);
    v = state(h);
    expect(v.events[0]).toEqual({ id: "m1", visibility: "secret", status: "active" });
    expect(v.log[0].events[0]).toEqual({ id: "m1", visibility: "secret" });
    expect(v.usage.runs).toBe(1);
  });

  it("the config is cleaned on the way in and merged with what was there", () => {
    const h = makeHost({});
    const r = mw.handleRoute({ method: "PUT", path: "/meanwhile/config", body: { enabled: true, k: 99, offCards: ["a", "b c", 5, "a"] } }, h).json;
    expect(r.config).toMatchObject({ enabled: true, k: 6, offCards: ["a"], spoilers: "hints" });
    expect(mw.handleRoute({ method: "PUT", path: "/meanwhile/config", body: { k: 2 } }, h).json.config).toMatchObject({ enabled: true, k: 2 });
    expect(mw.handleRoute({ method: "GET", path: "/meanwhile/config" }, h).json.config.k).toBe(2);
  });
});

describe("who is in the scene", () => {
  it("the Dashboard's name map resolves a spelling the registry names do not match", () => {
    const index = mw.registryIndex([{ id: "p3", kind: "person", name: "Cora", aliases: [] }]);
    expect([...mw.presentIds(index, ["Кора"], { кора: "p3" })]).toEqual(["p3"]);
    expect([...mw.presentIds(index, ["Кора"], {})]).toEqual([]);
  });
});
