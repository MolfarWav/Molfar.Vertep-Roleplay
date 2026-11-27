/**
 * Molfar.Vertep#539 step 1: the word-for-word index keeps where each passage lies, not its text. A picked passage is read
 * from the chat through the chat store, so a long chat kept in parts is indexed whole, a reply reads only the part its
 * passage lies in, an edited part is found stale by its rev and a passage whose words changed is left out until the tick
 * rebuilds, and a v2 index (with its text file) keeps answering until then.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import * as S from "../src/lib/chat-store.js";
import { L, abs, exists, mockHost, readJson, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = Record<string, any>;
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });
const CLOAK = "Aria wore the turquoise cloak with a silver clasp shaped like a heron.";
const ASK = "Do you remember the turquoise cloak, the silver clasp shaped like a heron?";
const filler = (i: number, reps = 1) => Array.from({ length: reps }, (_, k) => `Day ${i} passed; the bell rang at noon, the cart rolled on${k ? " again" : ""}.`).join(" ");

/** A host whose reads of old parts are counted. */
function host() {
  const m = mockHost();
  const reads: string[] = [];
  const read = m.host.fs.read;
  m.host.fs.read = (rel: string) => {
    if (/\.parts\/\d+\.jsonl$/.test(rel)) reads.push(rel.replace(/^.*\.parts\//, ""));
    return read(rel);
  };
  return { m, fsx: m.host.fs as M, reads };
}

/** `first` saved through the chat store (parts of 100 messages past the 200 of the tail), the cloak at message 151. */
function longChat(fsx: M, n: number, reps: number) {
  const msgs: Msg[] = [];
  for (let i = 1; i <= n; i++) msgs.push(i % 2 ? U(`u${i}`, filler(i, reps)) : C(`a${i}`, "Aria", filler(i, reps)));
  msgs[150] = C("cloak", "Aria", CLOAK);
  S.chatSave(fsx, "first", { id: "first", title: "Chat first", userName: "Jude", createdAt: 1, updatedAt: 1 }, msgs);
  return msgs;
}

function link(m: M, from: string, to: string) {
  L.handleRoute({ method: "POST", path: "/litopys/links", query: {}, body: { chatId: to, from } }, m.host);
}

const ctx = (userText: string) => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: userText }] },
  turn: { op: "send", chatId: "now", speakerName: "Aria" },
});
const textOf = (res: M | null) => (res ? res.messages.map((x: M) => x.content).join("\n") : "");

function setup(n = 600, reps = 1) {
  const h = host();
  longChat(h.fsx, n, reps);
  writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude" });
  writeJson("litopys/config.json", { verbatim: true });
  link(h.m, "first", "now");
  return h;
}

describe("verbatim recall over a chat kept in parts (#539)", () => {
  it("keeps no text copy, and a passage never crosses a part", () => {
    const { fsx } = setup();
    const head = readJson("litopys/recall/first.json");
    expect(head.v).toBe(3);
    expect(exists("litopys/recall/first.t.json")).toBe(false);
    expect(head.q).toBeUndefined();
    const list = readJson("litopys/recall/first.q.json");
    expect(list.built).toBe(head.built);
    expect(list.q.length).toBe(head.n);
    expect(list.q.every((q: M) => typeof q.h === "string" && !("t" in q))).toBe(true);
    const msgs = S.chatRead(fsx, "first")!.msgs;
    const partOf = new Map(msgs.map((x: M) => [x.id, S.chatOrigin(x)?.n ?? 0]));
    expect(new Set(partOf.values()).size).toBeGreaterThan(2);
    expect(list.q.every((q: M) => partOf.get(q.a) === partOf.get(q.b))).toBe(true);
  });

  it("a reply reads only the part of the passage it uses", () => {
    const { m, reads } = setup();
    reads.length = 0;
    const res = L.llmRequest(ctx(ASK), m.host);
    expect(textOf(res)).toContain(CLOAK);
    // the cloak is message 151: the second part of 100
    expect(reads).toEqual(["2.jsonl"]);
    L.llmRequest(ctx("Nothing in common here, only a plain greeting."), m.host);
    expect(reads).toEqual(["2.jsonl"]);
  });

  it("a chat past the old 3.5 MB limit is indexed and recalled, its index under the write cap", () => {
    // 3200 messages of about 1300 characters: about 4 MB of text, which v2 could not keep in a file
    const { m } = setup(3200, 22);
    const head = readJson("litopys/recall/first.json");
    const text = S.chatRead(m.host.fs, "first")!.msgs.reduce((t: number, x: M) => t + String(x.text).length, 0);
    expect(text).toBeGreaterThan(3_500_000);
    expect(fs.statSync(abs("litopys/recall/first.json")).size).toBeLessThan(3_500_000);
    expect(exists("litopys/recall/first.none.json")).toBe(false);
    expect(head.cut).toBeUndefined();
    expect(textOf(L.llmRequest(ctx(ASK), m.host))).toContain(CLOAK);
  });

  it("an edited old message: its passage is left out, the tick sees the part's new rev and rebuilds", () => {
    const { m, fsx } = setup();
    const rc = S.chatRead(fsx, "first")!;
    rc.msgs[150].text = "Aria wore the crimson mantle with a golden brooch shaped like a falcon.";
    S.chatSave(fsx, "first", rc.meta, rc.msgs);
    // the index still points at the old words; the passage's text no longer matches, so nothing changed is shown as old
    const stale = textOf(L.llmRequest(ctx(ASK), m.host));
    expect(stale).not.toContain("turquoise cloak with");
    expect(stale).not.toContain("crimson");
    expect(L.recallRefresh(fsx)).toBe("first");
    expect(L.recallRefresh(fsx)).toBe(null);
    expect(textOf(L.llmRequest(ctx("Do you remember the crimson mantle, the golden brooch shaped like a falcon?"), m.host))).toContain("crimson mantle");
  });

  it("a long message cut into pieces reads back to the same text, piece for piece", () => {
    const h = host();
    const msgs: Msg[] = [];
    for (let i = 1; i <= 420; i++) msgs.push(i % 2 ? U(`u${i}`, filler(i, 1 + (i % 9) * 4)) : C(`a${i}`, "Aria", filler(i, 1 + (i % 5) * 7)));
    S.chatSave(h.fsx, "first", { id: "first", title: "T", userName: "Jude", createdAt: 1, updatedAt: 1 }, msgs);
    const built = L.recallBuild(S.chatRead(h.fsx, "first")!.msgs, null);
    expect(built.chunks.some((c: M) => c.o || Number.isInteger(c.e))).toBe(true);
    const index = { v: 3, built: 5, z: built.z, p: built.p };
    writeJson("litopys/recall/first.q.json", { v: 3, built: 5, q: built.chunks.map(({ t, ...rest }: M) => rest) });
    const ps = L.recallPassages(h.fsx, "first", index);
    for (let i = 0; i < built.chunks.length; i++) expect(ps.text(i)?.t).toBe(built.chunks[i].t);
    // a list of another build (a save caught in the middle) is not used
    expect(L.recallPassages(h.fsx, "first", { ...index, built: 6 }).text(0)).toBe(null);
  });

  it("a build that ran out of time is not tried again on every tick", () => {
    const { fsx } = setup();
    const head = readJson("litopys/recall/first.json");
    fsx.remove("litopys/recall/first.json");
    // what a build leaves when the call is stopped in the middle: its marker, written before the work
    writeJson("litopys/recall/first.none.json", { v: 3, rev: head.rev, sig: head.sig, trying: true });
    expect(L.recallRefresh(fsx)).toBe(null);
    expect(exists("litopys/recall/first.json")).toBe(false);
    // the chat's text changes: tried again
    const rc = S.chatRead(fsx, "first")!;
    rc.msgs.push(U("late", "One more line."));
    S.chatSave(fsx, "first", rc.meta, rc.msgs);
    expect(L.recallRefresh(fsx)).toBe("first");
    expect(exists("litopys/recall/first.json")).toBe(true);
    expect(exists("litopys/recall/first.none.json")).toBe(false);
  });
});

describe("verbatim recall: an index of the version before (#539)", () => {
  function v2(fsx: M) {
    const msgs: Msg[] = [];
    for (let i = 1; i <= 120; i++) msgs.push(i % 2 ? U(`u${i}`, filler(i)) : C(`a${i}`, "Aria", filler(i)));
    msgs[6] = C("cloak", "Aria", CLOAK);
    writeChat("first", msgs, { title: "Chat first", userName: "Jude" });
    writeChat("now", [U("n1", "Hello again.")], { title: "Now", userName: "Jude" });
    writeJson("litopys/config.json", { verbatim: false });
    link({ host: { fs: fsx } }, "first", "now");
    const built = L.recallBuild(msgs, null);
    const chunks = built.chunks.map(({ t, a, b, c, k }: M) => ({ t, a, b, ...(c ? { c } : {}), ...(k ? { k } : {}) }));
    writeJson("litopys/recall/first.json", { v: 2, rev: 0, built: 1, n: chunks.length, title: "Chat first", p: built.p });
    writeJson("litopys/recall/first.t.json", { v: 2, chunks });
    writeJson("litopys/config.json", { verbatim: true });
  }

  it("still answers from its text file, and the tick rebuilds it as v3 and drops the file", () => {
    const h = host();
    v2(h.fsx);
    expect(textOf(L.llmRequest(ctx(ASK), h.m.host))).toContain(CLOAK);
    expect(L.recallRefresh(h.fsx)).toBe("first");
    expect(readJson("litopys/recall/first.json").v).toBe(3);
    expect(exists("litopys/recall/first.t.json")).toBe(false);
    expect(textOf(L.llmRequest(ctx(ASK), h.m.host))).toContain(CLOAK);
  });

  it("a chat v2 gave up on (its marker) is tried once more", () => {
    const h = host();
    v2(h.fsx);
    h.fsx.remove("litopys/recall/first.json");
    h.fsx.remove("litopys/recall/first.t.json");
    writeJson("litopys/recall/first.none.json", { v: 2, rev: 0 });
    expect(L.recallRefresh(h.fsx)).toBe("first");
    expect(readJson("litopys/recall/first.json").v).toBe(3);
  });
});

describe("verbatim recall: door B orders a chapter's passages by meaning (#539)", () => {
  const unit = (k: number, n = 8) => Array.from({ length: n }, (_, i) => (i === k ? 1 : 0));
  const SCENE = "What happened to the heron near the harbour?"; // one rare word: only door B can bring a passage
  const EARLY = "Aria pointed at a grey heron standing in the reeds at dawn.";
  const LATE = "Jude found the heron feather tucked inside the old letter.";

  /** first <- now; chapter c1 (messages 1 to 30) holds two passages with "heron", far apart; six chapters with vectors. */
  function withChapters() {
    const h = host();
    const msgs: Msg[] = [];
    for (let i = 1; i <= 180; i++) msgs.push(i % 2 ? U(`u${i}`, filler(i, 3)) : C(`a${i}`, "Aria", filler(i, 3)));
    msgs[1] = C("early", "Aria", EARLY);
    msgs[27] = U("late", LATE);
    writeChat("first", msgs, { title: "Chat first", userName: "Jude" });
    writeChat("now", [U("n1", "Hello again."), C("n2", "Aria", "Hello, Jude.")], { title: "Now", userName: "Jude" });
    const chapters = [0, 1, 2, 3, 4, 5].map((k) => ({ id: "c" + (k + 1), from: msgs[k * 30]!.id, to: msgs[k * 30 + 29]!.id, count: 30, kind: "scene", text: `Chapter ${k + 1} of the road.`, label: "L", at: k, sig: L.chapterSig(msgs.slice(k * 30, k * 30 + 30)) }));
    // the tick checks each chapter against its messages: the sig keeps them valid
    writeJson("litopys/chats/first.json", { ...L.emptyChat("first"), migrated: true, chapters });
    const vectors: Record<string, unknown> = {};
    chapters.forEach((c, k) => (vectors[c.id] = { hash: L.fnv1a(c.text), vector: unit(k), m: "model-a" }));
    writeJson(".cache/litopys/vectors/first.json", vectors);
    writeJson("litopys/config.json", { verbatim: true, verbatimMeaning: true, verbatimMeaningZ: 2 });
    link(h.m, "first", "now");
    return h;
  }
  const scene = () => {
    const c = ctx(SCENE);
    return { ...c, turn: { ...c.turn, scanVec: unit(0), scanModel: "model-a" } };
  };
  const row = () => readJson("litopys/insert/now.json").verbatim.rows[0];

  it("takes the first by words while the passages have no vectors, and asks for the chapter's", () => {
    const { m } = withChapters();
    expect(textOf(L.llmRequest(scene(), m.host))).toContain(EARLY);
    expect(row().cos).toBeUndefined();
    const want = readJson("litopys/embed-want/rv_first.json");
    expect(want.more).toBe(true);
    const q = readJson("litopys/recall/first.q.json").q;
    expect(want.hs.length).toBe(q.filter((x: M) => x.k === "c1").length);
  });

  it("the tick embeds them, keeps them by hash, and the next reply takes the passage nearest to the scene", () => {
    const { m } = withChapters();
    L.llmRequest(scene(), m.host);
    L.onTick({}, m.host);
    const sent = m.embeds.find((e: M) => e.key === "lit_rv_first");
    expect(sent).toBeTruthy();
    const texts: string[] = sent.texts;
    expect(texts.some((t) => t.includes(LATE))).toBe(true);
    m.host.llm.embedResults.lit_rv_first = texts.map((t) => (t.includes(LATE) ? unit(0) : unit(3)));
    m.host.llm.embedInfo = { lit_rv_first: { model: "model-a", via: "Mock" } };
    L.onTick({}, m.host);
    delete m.host.llm.embedResults.lit_rv_first;
    expect(exists("litopys/embed-want/rv_first.json")).toBe(false);
    expect(Object.keys(L.loadRecallVectors(m.host.fs, "first")).length).toBe(texts.length);
    const res = L.llmRequest(scene(), m.host);
    expect(textOf(res)).toContain(LATE);
    expect(row()).toMatchObject({ of: 2, n: 1, w: 0 });
    expect(row().cos).toBeCloseTo(1, 2);
    expect(L.verbatimRows(m.host.fs, readJson("litopys/insert/now.json"))[0].closest).toEqual({ of: 2, cos: 1 });
  });

  it("vectors of another model are not used, and are asked for again", () => {
    const { m } = withChapters();
    L.llmRequest(scene(), m.host);
    L.onTick({}, m.host);
    const texts: string[] = m.embeds.find((e: M) => e.key === "lit_rv_first").texts;
    m.host.llm.embedResults.lit_rv_first = texts.map((t) => (t.includes(LATE) ? unit(0) : unit(3)));
    m.host.llm.embedInfo = { lit_rv_first: { model: "model-b", via: "Mock" } };
    L.onTick({}, m.host);
    delete m.host.llm.embedResults.lit_rv_first;
    expect(textOf(L.llmRequest(scene(), m.host))).toContain(EARLY);
    expect(readJson("litopys/embed-want/rv_first.json").more).toBe(true);
  });

  it("the vectors and the request go with the chat", () => {
    const { m } = withChapters();
    L.llmRequest(scene(), m.host);
    writeJson(".cache/litopys/recall-vectors/first.json", { abc: { vector: [1, 0], m: "model-a" } });
    L.pruneOrphans(m.host.fs, { chats: {} }, ["now.jsonl"]);
    expect(exists(".cache/litopys/recall-vectors/first.json")).toBe(false);
    expect(exists("litopys/embed-want/rv_first.json")).toBe(false);
  });
});
