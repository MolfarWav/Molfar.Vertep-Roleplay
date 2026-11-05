/**
 * #184 "embeddings visible and cheap": vectors know which model made them, the coverage of a chat is told by
 * GET /litopys/vectors, a click on POST /litopys/vectors fills the gaps in batches, and a reply's trace says whether
 * it was ranked by meaning and why not.
 */
import { describe, expect, it } from "bun:test";
import { L, useRoot, line, story, writeChat, writeJson, readJson, exists, mockHost, tick } from "./rp-memory-m2-kit";
import { meaningState, retryMinutes, roughTokens, semVerdict, setupOf, toEmbed } from "../src/lib/vectors";

useRoot();

const fact = (id: string, text: string, status = "active") => ({ id, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status, origin: "migrated", at: 1, updatedAt: 1 });
const chapter = (id: string, text: string) => ({ id, from: id + "a", to: id + "b", count: 2, sig: "x", label: "", text, kind: "scene", at: 1 });
const stored = (text: string, m?: string, vector = [0.1, 0.2]) => ({ hash: L.fnv1a(text), vector, ...(m ? { m } : {}) });

/** A chat with 2 chapters, 3 active facts and 1 removed fact. */
function seed(chatId: string, extra = 0) {
  writeChat(chatId, story(12));
  const m = mockHost();
  const st = L.emptyChat(chatId);
  st.migrated = true;
  st.chapters = [chapter("c1", "The mill burned down."), chapter("c2", "A duke arrived at dusk.")];
  st.facts = [fact("f1", "The mill wheel is broken."), fact("f2", "Aria distrusts strangers."), fact("f3", "Bram owes a debt."), fact("f4", "Gone fact.", "removed")];
  for (let i = 0; i < extra; i++) st.facts.push(fact("x" + i, `Extra fact number ${i}.`));
  L.saveChatFile(m.host.fs, st);
  return m;
}
const view = (chatId: string, m: ReturnType<typeof mockHost>) => L.handleRoute({ method: "GET", path: "/litopys/vectors", query: { chatId } }, m.host);

describe("coverage view: GET /litopys/vectors", () => {
  it("counts active facts and chapters with text, and says none have vectors", () => {
    const m = seed("cov1");
    const r = view("cov1", m);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ chatId: "cov1", state: "none", items: 5, have: 0, missing: 5, other: 0 });
    // four characters a token, rounded up
    expect(r.json.tokens).toBe(Math.ceil(["The mill burned down.", "A duke arrived at dusk.", "The mill wheel is broken.", "Aria distrusts strangers.", "Bram owes a debt."].join("").length / 4));
  });

  it("is partial with some vectors, all with every one", () => {
    const m = seed("cov2");
    writeJson("litopys/vectors/cov2.json", { c1: stored("The mill burned down."), f1: stored("The mill wheel is broken.") });
    expect(view("cov2", m).json).toMatchObject({ state: "partial", have: 2, missing: 3 });
    writeJson("litopys/vectors/cov2.json", {
      c1: stored("The mill burned down."), c2: stored("A duke arrived at dusk."), f1: stored("The mill wheel is broken."),
      f2: stored("Aria distrusts strangers."), f3: stored("Bram owes a debt."),
    });
    expect(view("cov2", m).json).toMatchObject({ state: "all", have: 5, missing: 0, tokens: 0 });
  });

  it("a text edited since is missing again", () => {
    const m = seed("cov3");
    writeJson("litopys/vectors/cov3.json", { f1: stored("The old text.") });
    expect(view("cov3", m).json).toMatchObject({ have: 0, missing: 5 });
  });

  it("vectors of another model count as 'other', not as missing, and say so", () => {
    const m = seed("cov4");
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "new-model", via: "Local", dim: 2 });
    writeJson("litopys/vectors/cov4.json", {
      c1: stored("The mill burned down.", "old-model"), c2: stored("A duke arrived at dusk.", "new-model"),
      f1: stored("The mill wheel is broken.", "old-model"),
    });
    const r = view("cov4", m).json;
    expect(r).toMatchObject({ state: "other", other: 2, missing: 2, have: 1, model: "new-model", via: "Local" });
    expect(toEmbed(r)).toBe(4);
  });

  it("an old vector with no model counts for any model, unless its length differs from what the engine makes now", () => {
    const m = seed("cov5");
    writeJson("litopys/vectors/cov5.json", { c1: stored("The mill burned down.", undefined, [1, 2, 3]), c2: stored("A duke arrived at dusk.", undefined, [1, 2]) });
    expect(view("cov5", m).json).toMatchObject({ have: 2, other: 0 });
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "m", dim: 2 });
    expect(view("cov5", m).json).toMatchObject({ have: 1, other: 1 });
  });

  it("a failed call within the hour reads as failing, with the minutes left", () => {
    const m = seed("cov6");
    const at = Date.now() - 10 * 60000;
    writeJson("litopys/embed-status.json", { ok: false, checkedAt: at });
    const r = view("cov6", m).json;
    expect(r.state).toBe("failing");
    expect(retryMinutes(r, at + 10 * 60000)).toBe(50);
    // an hour on, it is a normal gap again
    writeJson("litopys/embed-status.json", { ok: false, checkedAt: Date.now() - 61 * 60000 });
    expect(view("cov6", m).json.state).toBe("none");
  });

  it("answers 404 for a chat that does not exist or a bad id", () => {
    const m = mockHost();
    expect(L.handleRoute({ method: "GET", path: "/litopys/vectors", query: { chatId: "nope" } }, m.host).status).toBe(404);
    expect(L.handleRoute({ method: "GET", path: "/litopys/vectors", query: { chatId: "../x" } }, m.host).status).toBe(404);
    expect(L.handleRoute({ method: "POST", path: "/litopys/vectors", body: { chatId: "nope" } }, m.host).status).toBe(404);
  });
});

describe("the click: POST /litopys/vectors", () => {
  const post = (chatId: string, m: ReturnType<typeof mockHost>) => L.handleRoute({ method: "POST", path: "/litopys/vectors", body: { chatId } }, m.host);

  it("does nothing, and spends nothing, until it is posted", () => {
    const m = seed("emb1");
    tick(m);
    tick(m);
    expect(m.embeds).toHaveLength(0);
    expect(exists("litopys/embed-want/emb1.json")).toBe(false);
  });

  it("fills every gap, stores the model, and ends with state 'all'", () => {
    const m = seed("emb2");
    expect(post("emb2", m).json.state).toBe("working");
    m.host.llm.embedInfo = { lit_emb_emb2: { model: "mock-embed", via: "Mock" } };
    tick(m);
    const v = readJson("litopys/vectors/emb2.json");
    expect(Object.keys(v).sort()).toEqual(["c1", "c2", "f1", "f2", "f3"]);
    expect(Object.values(v).every((e: any) => e.m === "mock-embed")).toBe(true);
    expect(view("emb2", m).json).toMatchObject({ state: "all", have: 5, model: "mock-embed", via: "Mock" });
    expect(exists("litopys/embed-want/emb2.json")).toBe(false);
  });

  it("goes on in batches of 64 until nothing is missing", () => {
    const m = seed("emb3", 80);
    post("emb3", m);
    m.host.llm.embedInfo = { lit_emb_emb3: { model: "mock-embed", via: "Mock" } };
    tick(m);
    expect(m.embeds.length).toBe(2);
    expect(m.embeds[0].texts).toHaveLength(64);
    expect(m.embeds[1].texts).toHaveLength(85 - 64);
    expect(view("emb3", m).json).toMatchObject({ state: "all", items: 85, have: 85 });
  });

  it("gives up on a failed call: the state says failing and the request is gone", () => {
    const m = seed("emb4");
    (m as any).embedder = () => null;
    post("emb4", m);
    tick(m);
    expect(view("emb4", m).json.state).toBe("failing");
    expect(exists("litopys/embed-want/emb4.json")).toBe(false);
    expect(m.embeds).toHaveLength(1);
  });

  it("with another model's vectors, 'embed again' replaces only those", () => {
    const m = seed("emb5");
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "new-model", dim: 2 });
    writeJson("litopys/vectors/emb5.json", { c1: stored("The mill burned down.", "old-model"), c2: stored("A duke arrived at dusk.", "new-model", [9, 9]) });
    post("emb5", m);
    m.host.llm.embedInfo = { lit_emb_emb5: { model: "new-model", via: "Local" } };
    tick(m);
    const v = readJson("litopys/vectors/emb5.json");
    expect(v.c2.vector).toEqual([9, 9]);
    expect(v.c1.m).toBe("new-model");
    expect(view("emb5", m).json.state).toBe("all");
  });

  it("nothing to embed starts nothing; a second click while working changes nothing", () => {
    const m = seed("emb6");
    writeJson("litopys/vectors/emb6.json", {
      c1: stored("The mill burned down."), c2: stored("A duke arrived at dusk."), f1: stored("The mill wheel is broken."),
      f2: stored("Aria distrusts strangers."), f3: stored("Bram owes a debt."),
    });
    expect(post("emb6", m).json.state).toBe("all");
    expect(exists("litopys/embed-want/emb6.json")).toBe(false);
    const m2 = seed("emb7");
    post("emb7", m2);
    const first = readJson("litopys/embed-want/emb7.json");
    post("emb7", m2);
    expect(readJson("litopys/embed-want/emb7.json")).toEqual(first);
  });

  it("a request for a chat that is gone is dropped by the tick", () => {
    const m = seed("emb8");
    post("emb8", m);
    L.handleRoute({ method: "POST", path: "/litopys/rebuild", body: { chatId: "emb8" } }, m.host);
    writeJson("litopys/embed-want/ghost.json", { more: true, at: 0, batch: null });
    tick(m);
    expect(exists("litopys/embed-want/ghost.json")).toBe(false);
  });
});

describe("vectors are compared only within one model", () => {
  const facts = ["f1", "f2", "f3", "f4", "f5"].map((id) => fact(id, "Text " + id));
  const mk = (m: string | undefined) => Object.fromEntries(facts.map((f, i) => [f.id, stored(f.text, m, [1 - i * 0.2, i * 0.2])]));
  const run = (vectors: unknown, scanModel: string | undefined) => {
    const st = L.emptyChat("cmp");
    st.facts = facts;
    return L.buildInsert({ st, line: line(story(12)), dash: { snapshots: {} }, meta: { userName: "You" }, cfg: { enabled: true, insert: true, budget: 200, recentMessages: 20 }, scanText: "zzz", speakerName: "Aria", scanVec: [1, 0], scanModel, vectors });
  };

  it("counts the candidates with a usable vector in the trace", () => {
    expect(run(mk("a"), "a").trace.sem).toEqual({ scan: true, have: 5, seen: 5 });
    expect(run(mk("a"), "b").trace.sem).toEqual({ scan: true, have: 0, seen: 5 });
    // no model recorded on either side: compared as before
    expect(run(mk(undefined), "b").trace.sem.have).toBe(5);
    expect(run(mk("a"), undefined).trace.sem.have).toBe(5);
  });
});

describe("the trace says whether the reply was ranked by meaning", () => {
  const ask = (m: ReturnType<typeof mockHost>, chatId: string, turn: Record<string, unknown>) =>
    L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "S" }, { role: "user", content: "Hello." }] }, turn: { op: "send", chatId, speakerName: "Aria", ...turn } }, m.host);
  const trace = (m: ReturnType<typeof mockHost>, chatId: string) => L.handleRoute({ method: "GET", path: "/litopys/trace", query: { chatId } }, m.host).json.trace;
  const setup = (chatId: string) => {
    const m = seed(chatId);
    writeJson("litopys/config.json", { enabled: true, insert: true, budget: 200, recentMessages: 6 });
    return m;
  };

  it("no vectors file: novec", () => {
    const m = setup("tr1");
    ask(m, "tr1", {});
    expect(trace(m, "tr1").sem).toMatchObject({ scan: false, why: "novec" });
  });

  it("a vectors file but no scan vector: noscan, or failing when the last call failed", () => {
    const m = setup("tr2");
    writeJson("litopys/vectors/tr2.json", {});
    ask(m, "tr2", {});
    expect(trace(m, "tr2").sem).toMatchObject({ scan: false, why: "noscan" });
    writeJson("litopys/embed-status.json", { ok: false, checkedAt: Date.now() });
    ask(m, "tr2", {});
    expect(trace(m, "tr2").sem).toMatchObject({ scan: false, why: "failing" });
  });

  it("a scan vector: used, with the model and how many candidates had a vector", () => {
    const m = setup("tr3");
    writeJson("litopys/vectors/tr3.json", { f1: stored("The mill wheel is broken.", "mock-embed", [1, 0]) });
    ask(m, "tr3", { scanVec: [1, 0], scanModel: "mock-embed" });
    const sem = trace(m, "tr3").sem;
    expect(sem).toMatchObject({ scan: true, model: "mock-embed" });
    expect(sem.have).toBe(1);
    expect(sem.seen).toBeGreaterThanOrEqual(3);
    // the same reply seen from the other model: its vector is not counted
    ask(m, "tr3", { scanVec: [1, 0], scanModel: "other-embed" });
    expect(trace(m, "tr3").sem.have).toBe(0);
  });
});

describe("the card's pure parts", () => {
  const v = (over: Record<string, unknown> = {}) => ({ chatId: "c", state: "partial", items: 10, have: 4, missing: 6, other: 0, tokens: 3140, model: "m", via: "v", failing: null, ...over }) as any;

  it("shows 'off' when the engine has no embeddings connection, but never hides work in progress", () => {
    expect(meaningState(null, "ready")).toBeNull();
    expect(meaningState(v(), "none")).toBe("off");
    expect(meaningState(v(), "ready")).toBe("partial");
    expect(meaningState(v(), "unknown")).toBe("partial");
    expect(meaningState(v({ state: "working" }), "none")).toBe("working");
  });

  it("reads the engine's providers", () => {
    expect(setupOf({ providers: [{ id: "openrouter", ready: false }] })).toBe("none");
    expect(setupOf({ providers: [{ id: "openrouter", ready: false }, { id: "lan", ready: true, local: true }] })).toBe("ready");
    expect(setupOf({ model: "x" })).toBe("unknown");
    expect(setupOf(null)).toBe("unknown");
  });

  it("rounds a cost for reading", () => {
    expect(roughTokens(0)).toBe(10);
    expect(roughTokens(68)).toBe(70);
    expect(roughTokens(3140)).toBe(3100);
    expect(roughTokens(48210)).toBe(48000);
  });

  it("turns a trace's sem into one verdict", () => {
    expect(semVerdict(null)).toBeNull();
    expect(semVerdict({ scan: true, have: 312, seen: 480, why: "", model: "m" })).toEqual({ kind: "yes", have: 312, seen: 480 });
    expect(semVerdict({ scan: true, have: 2, seen: 480, why: "", model: "m" })).toEqual({ kind: "few", have: 2, seen: 480 });
    expect(semVerdict({ scan: false, have: 0, seen: 0, why: "novec", model: "" })).toEqual({ kind: "no", why: "novec" });
    expect(semVerdict({ scan: false, have: 0, seen: 0, why: "whatever", model: "" })).toEqual({ kind: "no", why: "noscan" });
  });
});
