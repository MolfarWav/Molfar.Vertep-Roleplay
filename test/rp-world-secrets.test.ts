/**
 * World DM secret threads (Molfar.Vertep#545): the DM keeps up to three hidden through-lines. The reply model gets only
 * the events dealt for one (at most one in three, past the deck) and a quiet hint on its own timer. Their text leaves the
 * plugin only through GET /world/secrets.
 */
import { describe, expect, it } from "bun:test";
import { applyLevel, emptyState, handleRoute, llmRequest, normalizeState, systemFor, SECRET_LABEL } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}
type Mem = ReturnType<typeof memHost>;

const msg = (i: number) => ({ id: "m" + i, role: i % 2 ? "user" : "char", name: i % 2 ? "Taras" : "Odarka", text: "Line " + i + " of the story.", swipe: 0 });
const line = (n: number) => Array.from({ length: n }, (_, i) => msg(i));
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";

const seed = (n = 6, extra: Record<string, string> = {}) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": jsonl(line(n)),
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  "settings.json": JSON.stringify({ model: "c/default" }),
  ...extra,
});

const IDEA = "The ferryman is Odarka's lost brother.";
const HINT = "A ferry token with her mother's mark";
const thread = (over: Record<string, unknown> = {}) => ({ id: "s1", idea: IDEA, surfaced: [], hint: HINT, status: "active", by: "dm", at: 1, ...over });
const settings = (over: Record<string, unknown> = {}) => ({ level: "director", everyN: 1, stagnation: 0, onTransition: false, insert: true, secrets: 1, hintEvery: 2, ...over });
const stateFile = (over: Record<string, unknown> = {}, set: Record<string, unknown> = {}) => JSON.stringify({ ...emptyState("c1"), settings: settings(set), ...over });

const route = (m: Mem, method: string, path: string, body?: unknown, query: Record<string, string> = {}, stash?: unknown) =>
  handleRoute({ method, path, query, body, ...(stash ? { stash } : {}) }, m.host) as any;
const stateOf = (m: Mem) => JSON.parse(m.files["world/state/c1.json"]!);
const reply = (m: Mem, op = "send") =>
  llmRequest({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go in." }] }, turn: { op } }, m.host) as any;
const hintOf = (out: any) => out?.promptSources.parts.find((p: any) => p.label === SECRET_LABEL)?.text ?? null;
/** Run the DM once with `report` as the model's answer. */
function run(m: Mem, report: object) {
  const first = route(m, "POST", "/world/update", { chatId: "c1" });
  m.results.world = { text: JSON.stringify(report) };
  const done = route(m, "POST", "/world/update", { chatId: "c1" }, {}, first.stash).json;
  delete m.results.world;
  return done;
}

describe("the DM run", () => {
  it("says nothing about threads when the chat has none, and nothing below the event levels", () => {
    expect(systemFor("director", settings({ secrets: 0 }), false)).not.toContain("Secret threads");
    expect(systemFor("director", settings(), false)).toContain("keep up to 1 hidden through-line of this story");
    expect(systemFor("director", settings(), true)).not.toContain("Secret threads");
    expect(systemFor("chronicler", settings(), false)).not.toContain("Secret threads");
    const m = memHost(seed(6, { "world/state/c1.json": stateFile({ lastKey: "m1#0" }, { secrets: 0 }) }));
    run(m, { secrets: [{ op: "add", idea: IDEA, hint: HINT }], summary: "x" });
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("Secret threads");
    expect(stateOf(m).secrets).toBeUndefined();
  });

  it("adds a thread up to the limit, keeps the first hint waiting and no text outside the spoiler route", () => {
    const m = memHost(seed(6, { "world/state/c1.json": stateFile({ lastKey: "m1#0" }) }));
    const done = run(m, { secrets: [{ op: "add", idea: IDEA, hint: HINT }, { op: "add", idea: "A second one", hint: "x" }], summary: "The ferryman is her brother." });
    expect(m.requests[0]!.spec.messages[0].content).toContain("Secret threads (only yours): none yet.");
    const st = stateOf(m);
    expect(st.secrets.map((x: any) => [x.id, x.idea, x.status])).toEqual([["s1", IDEA, "active"]]);
    expect(st.secretMark).toEqual({ after: "m5#0", id: "" });
    expect(st.log.at(-1).summary).toBe("");
    expect(done.secrets).toEqual({ count: 1, nextIn: 2, held: null });
    expect(JSON.stringify(done)).not.toContain("ferryman");
    expect(JSON.stringify(route(m, "GET", "/world/state", undefined, { chatId: "c1" }).json)).not.toContain("ferryman");
    const seen = route(m, "GET", "/world/secrets", undefined, { chatId: "c1" }).json;
    expect(seen.secrets[0]).toMatchObject({ id: "s1", idea: IDEA, hint: HINT, hintUsed: false });
    expect(seen.log.map((r: any) => r.what)).toEqual(["added"]);
  });

  it("updates a thread with a new hint, and finishes it", () => {
    const m = memHost(seed(6, { "world/state/c1.json": stateFile({ lastKey: "m1#0", secrets: [thread({ hintAfter: "m3#0" })] }) }));
    run(m, { secrets: [{ op: "update", id: "s1", surfaced: "A token was found.", hint: "He hums her song" }], summary: "s" });
    expect(m.requests[0]!.spec.messages[0].content).toContain("hint given to the story, write a new one: " + HINT);
    expect(stateOf(m).secrets[0]).toMatchObject({ surfaced: ["A token was found."], hint: "He hums her song" });
    expect(stateOf(m).secrets[0].hintAfter).toBeUndefined();
    // a live thread: the run's summary is not kept, whatever the run did
    expect(stateOf(m).log.at(-1).summary).toBe("");
    m.files["chats/c1.jsonl"] = jsonl(line(8));
    run(m, { secrets: [{ op: "done", id: "s1" }], summary: "s" });
    expect(stateOf(m).secrets[0].status).toBe("done");
  });

  it("lets at most one event in three serve a thread, past the deck", () => {
    const opts = { level: "director", secrets: true, useDeck: true };
    const st = normalizeState({ settings: settings(), secrets: [thread()], deck: [{ id: "e1", text: "A card event." }] }, "c1") as any;
    applyLevel(st, { event: { text: "A boat with her mark drifts in.", secret: "s1" } }, opts);
    expect(st.event.text).toBe("A boat with her mark drifts in.");
    expect(st.deck.length).toBe(1);
    expect(st.secretOrigins).toEqual(["s1"]);
    // the next two may not be a thread's: such an event is dropped
    for (const n of [1, 2]) {
      st.event = null;
      applyLevel(st, { event: { text: "Again the ferryman.", secret: "s1" } }, opts);
      expect(st.event).toBe(null);
      applyLevel(st, { event: { deck: "e1" } }, opts);
      expect(st.event.text).toBe("A card event.");
      st.deck = [{ id: "e1", text: "A card event." }];
      expect(st.secretOrigins.length).toBe(Math.min(2, n + 1));
    }
    st.event = null;
    applyLevel(st, { event: { text: "The ferryman calls her name.", secret: "s1" } }, opts);
    expect(st.event.text).toBe("The ferryman calls her name.");
    expect(st.secretLog.filter((r: any) => r.what === "event-dropped").length).toBe(2);
  });
});

describe("the hint", () => {
  const withThread = (n: number, mark: string, extra: Record<string, string> = {}, set: Record<string, unknown> = {}) =>
    memHost(seed(n, { "world/state/c1.json": stateFile({ secrets: [thread()], secretMark: { after: mark, id: "" } }, set), ...extra }));

  it("waits its timer, goes once with no secret in it, comes again on a swipe, and is not repeated", () => {
    // m5 is the player's line the reply follows: one reply (m4) since m3
    expect(hintOf(reply(withThread(6, "m3#0")))).toBe(null);
    const m = withThread(6, "m1#0");
    const text = hintOf(reply(m));
    expect(text).toContain(HINT + ".");
    expect(text).not.toContain("brother");
    expect(stateOf(m).secrets[0].hintAfter).toBe("m5#0");
    expect(JSON.parse(m.files["world/dice/c1.json"]!).rolls.at(-1)).toMatchObject({ kind: "secret", inserted: true });
    expect(m.files["world/dice/c1.json"]).not.toContain(HINT);
    // the reply landed and is swiped: the same hint again
    m.files["chats/c1.jsonl"] = jsonl(line(7));
    expect(hintOf(reply(m, "swipe"))).toBe(text);
    // later turns: the used hint stays used until the DM writes a new one
    m.files["chats/c1.jsonl"] = jsonl(line(12));
    expect(hintOf(reply(m))).toBe(null);
  });

  it("is off with hintEvery 0, below the event levels, and with the insert switched off", () => {
    expect(hintOf(reply(withThread(6, "m1#0", {}, { hintEvery: 0 })))).toBe(null);
    expect(hintOf(reply(withThread(6, "m1#0", {}, { level: "chronicler" })))).toBe(null);
    expect(hintOf(reply(withThread(6, "m1#0", {}, { insert: false })))).toBe(null);
    expect(hintOf(reply(withThread(6, "m1#0", {}, { secrets: 0 })))).toBe(null);
  });

  it("waits behind a DM event, a Direction note and a fight, and says why", () => {
    const held = (m: Mem) => {
      expect(hintOf(reply(m))).toBe(null);
      return stateOf(m).secretLog.at(-1);
    };
    const event = withThread(6, "m1#0");
    event.files["world/state/c1.json"] = stateFile({ secrets: [thread()], secretMark: { after: "m1#0", id: "" }, event: { text: "A knock.", hard: true, sent: 0, retried: false } });
    expect(held(event)).toMatchObject({ what: "held", why: "event", id: "s1" });
    expect(held(withThread(6, "m1#0", { "direction/state/c1.json": JSON.stringify({ v: 1, on: true, next: { id: "x", rule: "r", who: [], after: "m4#0" } }) }))).toMatchObject({ why: "direction" });
    const fight = { "dashboard/state/c1.json": JSON.stringify({ v: 2, chatId: "c1", snapshots: { "m4#0": { scene: { new: false, direction: "combat" }, clock: { place: "Yard" }, present: [] } } }) };
    expect(held(withThread(6, "m1#0", fight))).toMatchObject({ why: "fight" });
    // the same reply asked again logs it once
    const again = withThread(6, "m1#0", fight);
    reply(again);
    reply(again);
    expect(stateOf(again).secretLog.length).toBe(1);
  });
});

describe("the player's side", () => {
  const made = () => memHost(seed(6, { "world/state/c1.json": stateFile({ secrets: [thread()], secretMark: { after: "m5#0", id: "" } }) }));
  const post = (m: Mem, body: object) => route(m, "POST", "/world/secrets", { chatId: "c1", ...body });

  it("sends the next hint on request, whatever the timer", () => {
    const m = made();
    expect(post(m, { op: "next", id: "s1" }).json.next).toBe("s1");
    expect(hintOf(reply(m))).toContain(HINT);
    expect(stateOf(m).secretNext).toBeUndefined();
  });

  it("edits and drops a thread", () => {
    const m = made();
    expect(post(m, { op: "edit", id: "s1", idea: "He is only a ferryman.", hint: "He counts coins" }).json.secrets[0]).toMatchObject({ idea: "He is only a ferryman.", hint: "He counts coins", by: "player" });
    expect(post(m, { op: "drop", id: "s1" }).json.secrets).toEqual([]);
    expect(post(m, { op: "drop", id: "s1" }).status).toBe(404);
  });

  it("a rollback takes the DM's thread back and keeps what the player changed since", async () => {
    const gone = memHost(seed(6, { "world/state/c1.json": stateFile({ lastKey: "m1#0" }) }));
    run(gone, { secrets: [{ op: "add", idea: IDEA, hint: HINT }], summary: "s" });
    gone.files["chats/c1.jsonl"] = jsonl(line(5));
    route(gone, "POST", "/world/rollback", { chatId: "c1" });
    expect(stateOf(gone).secrets).toBeUndefined();

    const kept = memHost(seed(6, { "world/state/c1.json": stateFile({ lastKey: "m1#0", secrets: [thread()] }) }));
    run(kept, { secrets: [{ op: "update", id: "s1", surfaced: "Seen.", hint: "New one" }], summary: "s" });
    await Bun.sleep(5);
    post(kept, { op: "edit", id: "s1", idea: "My own idea." });
    kept.files["chats/c1.jsonl"] = jsonl(line(5));
    route(kept, "POST", "/world/rollback", { chatId: "c1" });
    expect(stateOf(kept).secrets[0]).toMatchObject({ idea: "My own idea.", by: "player" });
  });

  it("saves the three settings", () => {
    const m = memHost(seed());
    const out = route(m, "PUT", "/world/settings", { chatId: "c1", level: "director", secrets: 7, hintEvery: 99, secretShow: true }).json;
    expect(out.settings).toMatchObject({ secrets: 3, hintEvery: 30, secretShow: true });
    expect(route(m, "GET", "/world/dice", undefined, { chatId: "c1" }).json.secretShow).toBe(true);
  });
});
