/**
 * #184 step 8 (#264): word-for-word passages of the earlier chats of the chat's chain. On by default; found by rare shared
 * words; the whole chain, not three chats; the speaker filter of the story applies; its own small budget; never a guess.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, exists, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });
const CLOAK = "Aria wore the turquoise cloak with a silver clasp shaped like a heron.";

/** A filler line that shares no rare word with anything else. */
const filler = (i: number) => `Day ${i} passed; the bell rang at noon${i % 7 === 0 ? " and the rain fell" : ""}, the cart rolled on.`;

function oldChat(id: string, withCloak: boolean, extra: Msg[] = []) {
  const msgs: Msg[] = [];
  for (let i = 1; i <= 450; i++) msgs.push(i % 2 ? U(`${id}u${i}`, filler(i)) : C(`${id}a${i}`, "Aria", filler(i)));
  if (withCloak) msgs.splice(6, 1, C(`${id}cloak`, "Aria", CLOAK));
  msgs.push(...extra);
  writeChat(id, msgs, { title: "Chat " + id, userName: "Jude" });
  return msgs;
}

/** first <- second <- third <- fourth <- fifth <- now: the cloak is five chats back, past the backstory's three. */
function chainOf(ids: string[]) {
  const m = mockHost();
  let prev: string | null = null;
  for (const id of ids) {
    if (prev) L.handleRoute({ method: "POST", path: "/litopys/links", query: {}, body: { chatId: id, from: prev } }, m.host);
    prev = id;
  }
  return m;
}

const ctx = (userText: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: userText }] },
  turn: { op: "send", chatId: "now", speakerName },
});
const textOf = (res: any) => (res ? res.messages.map((m: any) => m.content).join("\n") : "");
const labels = (res: any) => (res && res.promptSources ? res.promptSources.parts.map((p: any) => p.label) : []);

function setup(extraCfg: Record<string, unknown> = { verbatim: true }) {
  const ids = ["first", "second", "third", "fourth", "fifth", "now"];
  oldChat("first", true);
  for (const id of ids.slice(1, 5)) oldChat(id, false);
  writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude" });
  writeJson("litopys/config.json", extraCfg);
  return chainOf(ids);
}

describe("verbatim recall: when it speaks", () => {
  it("is on by default: a chat with no setting of its own finds the passage", () => {
    const m = setup({});
    expect(L.loadConfig(m.host.fs).verbatim).toBe(true);
    const res = L.llmRequest(ctx("What colour was the turquoise cloak with the silver clasp?"), m.host);
    expect(labels(res)).toContain("Litopys · earlier, word for word");
  });

  it("switched off: no part, no index, nothing written", () => {
    const m = setup({ verbatim: false });
    const res = L.llmRequest(ctx("What colour was the turquoise cloak with the silver clasp?"), m.host);
    expect(labels(res)).not.toContain("Litopys · earlier, word for word");
    expect(exists("litopys/recall/first.json")).toBe(false);
  });

  it("finds a passage five chats back by its rare words and says it is older than the facts", () => {
    const m = setup();
    const res = L.llmRequest(ctx("Do you remember the turquoise cloak, the silver clasp shaped like a heron?"), m.host);
    const text = textOf(res);
    expect(labels(res)).toContain("Litopys · earlier, word for word");
    expect(text).toContain("word for word");
    expect(text).toContain("newer and win");
    expect(text).toContain(CLOAK);
    expect(text).toContain('From "Chat first"');
    const rec = readJson("litopys/insert/now.json").verbatim;
    expect(rec).toMatchObject({ chunks: 1, chats: 1 });
    expect(rec.rows[0]).toMatchObject({ c: "first" });
  });

  it("says nothing for a question that shares no rare word, or only one", () => {
    const m = setup();
    expect(labels(L.llmRequest(ctx("How was your day, did the bell ring at noon?"), m.host))).not.toContain("Litopys · earlier, word for word");
    expect(labels(L.llmRequest(ctx("What about the heron by the river today?"), m.host))).not.toContain("Litopys · earlier, word for word");
  });

  it("keeps out of a chat that starts clean, and out of one with the switch off", () => {
    const m = setup();
    writeJson("dashboard/state/now.json", { snapshots: {}, inherited: { off: true } });
    expect(labels(L.llmRequest(ctx("the turquoise cloak, the silver clasp, the heron"), m.host))).not.toContain("Litopys · earlier, word for word");
    writeJson("dashboard/state/now.json", { snapshots: {} });
    const meta = readJson("chats/now.meta.json");
    writeJson("chats/now.meta.json", { ...meta, promptBoard: { off: ["plugin:verbatim"] } });
    expect(labels(L.llmRequest(ctx("the turquoise cloak, the silver clasp, the heron"), m.host))).not.toContain("Litopys · earlier, word for word");
  });

  it("respects its budget", () => {
    const m = setup({ verbatim: true, verbatimBudget: 150 });
    const text = textOf(L.llmRequest(ctx("the turquoise cloak, the silver clasp, the heron"), m.host));
    const start = text.indexOf("[Earlier in this story, word for word");
    expect(start).toBeGreaterThan(-1);
    // the language note rides once on whichever memory block comes first: it is not this part's
    const part = text.slice(start, text.indexOf("\n(These memory notes"));
    expect(L.estimateTokens(part)).toBeLessThanOrEqual(150);
  });

  it("clamps a silly budget", () => {
    const m = setup({ verbatim: true, verbatimBudget: 99999 });
    expect(L.loadConfig(m.host.fs).verbatimBudget).toBe(L.VERBATIM_MAX);
    const put = L.handleRoute({ method: "PUT", path: "/litopys/config", query: {}, body: { verbatimBudget: 5, verbatim: "on" } }, m.host);
    expect(put.status).toBe(200);
    expect(L.loadConfig(m.host.fs)).toMatchObject({ verbatim: true, verbatimBudget: L.VERBATIM_MIN });
  });
});

describe("verbatim recall: who may read a passage", () => {
  function witnessedBy(cast: string[]) {
    writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A courier.", extensions: {} });
    oldChat("first", true);
    writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude", characterId: "aria" });
    writeJson("litopys/chats/first.json", {
      ...L.emptyChat("first"),
      migrated: true,
      chapters: [{ id: "c1", from: "firstu1", to: "firstu23", count: 24, kind: "scene", text: "Days passed.", label: "Days", at: 1, cast, sig: "x" }],
    });
    writeJson("litopys/config.json", { verbatim: true });
    // the chapter's signature is only checked by the tick; the build reads the cast of a chapter that is not stale
    return chainOf(["first", "now"]);
  }
  const ask = "the turquoise cloak, the silver clasp, the heron";

  it("a character who did not witness the scene does not get its passage, one who did gets it", () => {
    const m = witnessedBy(["Bram"]);
    L.recallIndexChat(m.host.fs, "first");
    expect(textOf(L.llmRequest(ctx(ask, "Aria"), m.host))).not.toContain(CLOAK);
    const m2 = witnessedBy(["Aria", "Bram"]);
    L.recallIndexChat(m2.host.fs, "first");
    expect(textOf(L.llmRequest(ctx(ask, "Aria"), m2.host))).toContain(CLOAK);
  });
});

describe("verbatim recall: the index", () => {
  it("cuts chunks at chapter borders and carries the chapter's cast", () => {
    const msgs = oldChat("first", true);
    const st = {
      ...L.emptyChat("first"),
      chapters: [
        { id: "c1", from: "firstu1", to: "firstu11", count: 11, kind: "scene", cast: ["Aria"], text: "x", at: 1 },
        { id: "c2", from: "firsta12", to: "firsta24", count: 13, kind: "scene", text: "y", at: 2 },
      ],
    };
    const built = L.recallBuild(msgs, st);
    expect(built.chunks.length).toBeGreaterThan(1);
    const crossing = built.chunks.filter((c: any) => c.a === "firstu1" || c.b === "firsta12");
    expect(crossing.every((c: any) => !(c.a === "firstu1" && c.b === "firsta12"))).toBe(true);
    expect(built.chunks.filter((c: any) => c.c).every((c: any) => c.c[0] === "Aria")).toBe(true);
    expect(built.chunks.some((c: any) => !c.c)).toBe(true);
  });

  it("indexes only rare stems, and a long chat gets bigger chunks instead of thousands of them", () => {
    const msgs = oldChat("first", true);
    const built = L.recallBuild(msgs, null);
    expect(Object.keys(built.p).some((s) => s.startsWith("turquoi"))).toBe(true);
    expect(Object.keys(built.p).some((s) => s === "passed")).toBe(false);
    const long: Msg[] = [];
    for (let i = 0; i < 6000; i++) long.push(i % 2 ? U("u" + i, "Line " + i + " " + "word ".repeat(200)) : C("a" + i, "Aria", "Reply " + i + " " + "text ".repeat(200)));
    const big = L.recallBuild(long, null);
    expect(big.chunks.length).toBeLessThanOrEqual(2400);
    expect(big.chunks.length).toBeGreaterThan(1000);
  });

  it("is rebuilt by the tick when the chat's record has a new revision, and swept with the chat", () => {
    const m = setup();
    L.llmRequest(ctx("the turquoise cloak, the silver clasp, the heron"), m.host);
    expect(readJson("litopys/recall/first.json").rev).toBe(0);
    writeJson("litopys/chats/first.json", { ...L.emptyChat("first"), migrated: true, rev: 7 });
    L.recallRefresh(m.host.fs);
    expect(readJson("litopys/recall/first.json").rev).toBe(7);
    const store = { chats: {} };
    L.pruneOrphans(m.host.fs, store, ["now.jsonl", "second.jsonl", "third.jsonl", "fourth.jsonl", "fifth.jsonl"]);
    expect(exists("litopys/recall/first.json")).toBe(false);
    expect(exists("litopys/recall/first.t.json")).toBe(false);
  });
});

describe("verbatim recall: the index is made when the chat is archived", () => {
  it("a new link builds the earlier chat's index at once, before any reply asks for it", () => {
    oldChat("first", true);
    writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude" });
    writeJson("litopys/config.json", {});
    expect(exists("litopys/recall/first.json")).toBe(false);
    chainOf(["first", "now"]);
    expect(exists("litopys/recall/first.json")).toBe(true);
    expect(exists("litopys/recall/first.t.json")).toBe(true);
  });

  it("with the switch off the link builds nothing", () => {
    oldChat("first", true);
    writeChat("now", [U("n1", "Hello again.")], { title: "Now", userName: "Jude" });
    writeJson("litopys/config.json", { verbatim: false });
    chainOf(["first", "now"]);
    expect(exists("litopys/recall/first.json")).toBe(false);
  });

  it("the tick builds a missing index, one chat at a time, and does not retry a chat with nothing to index", () => {
    const m = setup();
    m.host.fs.remove("litopys/recall/first.json");
    m.host.fs.remove("litopys/recall/first.t.json");
    expect(L.recallRefresh(m.host.fs)).toBe("first");
    expect(exists("litopys/recall/first.json")).toBe(true);
    writeChat("empty", [], { title: "Empty", userName: "Jude" });
    writeChat("after", [U("a1", "Hi.")], { title: "After", userName: "Jude" });
    L.handleRoute({ method: "POST", path: "/litopys/links", query: {}, body: { chatId: "after", from: "empty" } }, m.host);
    expect(exists("litopys/recall/empty.json")).toBe(false);
    expect(exists("litopys/recall/empty.none.json")).toBe(true);
    for (const id of ["first", "second", "third", "fourth"]) L.recallRefresh(m.host.fs);
    expect(L.recallRefresh(m.host.fs)).toBe(null);
    L.pruneOrphans(m.host.fs, { chats: {} }, ["now.jsonl"]);
    expect(exists("litopys/recall/empty.none.json")).toBe(false);
  });
});

describe("verbatim recall: the Fired panel counts it over the whole chat", () => {
  it("counts the replies that carried a passage, takes back a swiped one, and reports the last", () => {
    const m = setup();
    const ask = "the turquoise cloak, the silver clasp, the heron";
    L.llmRequest(ctx(ask), m.host);
    L.llmRequest(ctx("Nothing in common here, only a plain greeting."), m.host);
    let log = L.handleRoute({ method: "GET", path: "/litopys/fired", query: { chatId: "now" } }, m.host).json.log;
    expect(log.verbatim).toMatchObject({ n: 1, chunks: 1, chats: 1 });
    expect(log.replies).toBeGreaterThanOrEqual(1);
    L.llmRequest({ ...ctx(ask), turn: { op: "swipe", chatId: "now", speakerName: "Aria" } }, m.host);
    log = L.handleRoute({ method: "GET", path: "/litopys/fired", query: { chatId: "now" } }, m.host).json.log;
    expect(log.verbatim.n).toBe(1);
    L.llmRequest(ctx(ask), m.host);
    log = L.handleRoute({ method: "GET", path: "/litopys/fired", query: { chatId: "now" } }, m.host).json.log;
    expect(log.verbatim.n).toBe(2);
  });
});

describe("verbatim recall: door B, an old chapter opened by meaning (#264)", () => {
  const ASK = "What happened to the heron near the harbour?"; // one rare word only: the word rule alone lets nothing in
  const unit = (k: number, n = 8) => Array.from({ length: n }, (_, i) => (i === k ? 1 : 0));

  /** first <- now; `first` has six chapters with a vector each, the cloak lies in chapter c1 (messages 1 to 15). */
  function withVectors(extraCfg: Record<string, unknown>, vecIdx = [0, 1, 2, 3, 4, 5]) {
    const msgs = oldChat("first", true);
    writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude" });
    const chapters = vecIdx.map((_, k) => ({ id: "c" + (k + 1), from: msgs[k * 15]!.id, to: msgs[k * 15 + 14]!.id, count: 15, kind: "scene", text: `Chapter ${k + 1} of the road.`, label: "L", at: k, sig: "x" }));
    writeJson("litopys/chats/first.json", { ...L.emptyChat("first"), migrated: true, chapters });
    const vectors: Record<string, unknown> = {};
    chapters.forEach((c, k) => (vectors[c.id] = { hash: L.fnv1a(c.text), vector: unit(vecIdx[k]!), m: "model-a" }));
    writeJson("litopys/vectors/first.json", vectors);
    writeJson("litopys/config.json", { verbatim: true, ...extraCfg });
    return chainOf(["first", "now"]);
  }
  const withScan = (text: string, vec: number[] | null, model = "model-a") => {
    const c = ctx(text);
    return { ...c, turn: { ...c.turn, ...(vec ? { scanVec: vec, scanModel: model } : {}) } };
  };

  it("is off by default: the same scene brings nothing", () => {
    const m = withVectors({});
    expect(labels(L.llmRequest(withScan(ASK, unit(0)), m.host))).not.toContain("Litopys · earlier, word for word");
  });

  it("opens the chapter nearest by meaning and takes the passage that shares a rare word with the scene", () => {
    const m = withVectors({ verbatimMeaning: true, verbatimMeaningZ: 2 });
    const res = L.llmRequest(withScan(ASK, unit(0)), m.host);
    expect(textOf(res)).toContain(CLOAK);
    const row = readJson("litopys/insert/now.json").verbatim.rows[0];
    expect(row).toMatchObject({ c: "first", n: 1, w: 0 });
    expect(row.z).toBeGreaterThanOrEqual(2);
  });

  it("brings nothing when the scene's vector points at another chapter, has no vector, or is of another model", () => {
    const m = withVectors({ verbatimMeaning: true, verbatimMeaningZ: 2 });
    expect(textOf(L.llmRequest(withScan(ASK, unit(3)), m.host))).not.toContain(CLOAK);
    expect(textOf(L.llmRequest(withScan(ASK, null), m.host))).not.toContain(CLOAK);
    expect(textOf(L.llmRequest(withScan(ASK, unit(0), "model-b"), m.host))).not.toContain(CLOAK);
  });

  it("the default line (4 deviations) is out of reach of a short story: a pool of six cannot lie that far out", () => {
    const m = withVectors({ verbatimMeaning: true });
    expect(L.loadConfig(m.host.fs).verbatimMeaningZ).toBe(4);
    expect(textOf(L.llmRequest(withScan(ASK, unit(0)), m.host))).not.toContain(CLOAK);
  });

  it("never lets a passage in by meaning alone: the chapter is open but the scene shares no rare word with it", () => {
    const m = withVectors({ verbatimMeaning: true, verbatimMeaningZ: 2 });
    expect(textOf(L.llmRequest(withScan("How are the horses doing in the stable today, friend?", unit(0)), m.host))).not.toContain(CLOAK);
  });

  it("the meaning setting and its line are kept and clamped", () => {
    const m = withVectors({});
    L.handleRoute({ method: "PUT", path: "/litopys/config", query: {}, body: { verbatimMeaning: true } }, m.host);
    expect(L.loadConfig(m.host.fs).verbatimMeaning).toBe(true);
    writeJson("litopys/config.json", { verbatimMeaning: true, verbatimMeaningZ: 99 });
    expect(L.loadConfig(m.host.fs).verbatimMeaningZ).toBe(8);
  });
});

describe("verbatim recall: what the Memory view and the engine see", () => {
  it("the trace route lists the passages of the newest reply", () => {
    const m = setup();
    L.llmRequest(ctx("the turquoise cloak, the silver clasp, the heron"), m.host);
    const r = L.handleRoute({ method: "GET", path: "/litopys/trace", query: { chatId: "now" } }, m.host);
    // a reply with only a word-for-word part has no trace of facts: the route says so, the insert file keeps the passage
    expect(readJson("litopys/insert/now.json").verbatim.rows.length).toBe(1);
    expect(r.status).toBe(200);
    const rows = L.verbatimRows ? L.verbatimRows(m.host.fs, readJson("litopys/insert/now.json")) : [];
    expect(rows[0]).toMatchObject({ chat: "first", title: "Chat first" });
    expect(rows[0].text).toContain("turquoise");
  });

  it("the engine reserves a row for it only when it is on and the chat continues another", async () => {
    const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
    setup();
    const ids = (cfg: Record<string, unknown>, chat: string) => {
      writeJson("litopys/config.json", cfg);
      return (E.hookInsertBreakdown(mockHost().host.fs, chat, readJson(`chats/${chat}.meta.json`), 100000) as Array<{ id: string; tokens: number }>);
    };
    const on = ids({ verbatim: true, verbatimBudget: 300 }, "now");
    expect(on.find((r) => r.id === "litopys verbatim")?.tokens).toBe(300);
    expect(ids({}, "now").find((r) => r.id === "litopys verbatim")?.tokens).toBe(400);
    expect(ids({ verbatim: false }, "now").some((r) => r.id === "litopys verbatim")).toBe(false);
    expect(ids({ verbatim: true }, "first").some((r) => r.id === "litopys verbatim")).toBe(false);
    writeJson("chats/now.meta.json", { ...readJson("chats/now.meta.json"), promptBoard: { off: ["plugin:verbatim"] } });
    expect(ids({ verbatim: true }, "now").some((r) => r.id === "litopys verbatim")).toBe(false);
  });
});
