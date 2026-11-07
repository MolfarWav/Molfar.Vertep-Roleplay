// #184 P5: review by risk. With `proposals: "risky"` everything Litopys proposes applies by itself with an Undo, except the
// risky ones, which wait with the reason: a merge that widens who knows a fact, a change to something pinned, edited, written
// by the user or key, a change or belief fact, a new fact that may contradict what the user pinned. Decided in code, 0 calls.
import { beforeEach, describe, expect, it } from "bun:test";
import { L, useRoot, readJson, writeJson, story, writeChat, mockHost, tick, chapterReply } from "./rp-memory-m2-kit";

useRoot();
const RISKY = { arcNotice: "done", proposals: "risky" };
const ASK = { arcNotice: "done", proposals: "ask" };
beforeEach(() => writeJson("litopys/config.json", RISKY));

const fact = (id: string, over: Record<string, any> = {}) => ({ id, text: "Fact " + id + " about the old mill.", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "chapter", at: 1, updatedAt: 1, ...over });
const chat = (facts: any[], proposals: any[] = []) => {
  const st = L.emptyChat("c1");
  st.migrated = true;
  st.facts = facts;
  st.proposals = proposals;
  st.counters.fact = facts.length;
  st.counters.proposal = proposals.length;
  return st;
};
const prop = (id: string, op: string, targets: string[], over: Record<string, any> = {}) => ({ id, op, targets, ...(op === "rewrite" || op === "merge" ? { text: "New wording " + id } : {}), reason: "test", status: "pending", at: 1, ...over });
const route = (m: any, body: Record<string, unknown>) => L.handleRoute({ method: "POST", path: "/litopys/proposals", body: { chatId: "c1", ...body } }, m.host);

describe("who would learn something by a merge (#184 P5)", () => {
  it("a restricted fact next to a public one widens; so do restricted sets that differ; equal sets and all-public do not", () => {
    const f = (knownBy: any) => fact("x", { knownBy });
    expect(L.widensKnowledge([f("all"), f("all")])).toBe(false);
    expect(L.widensKnowledge([f(["Aria"]), f(["Aria"])])).toBe(false);
    expect(L.widensKnowledge([f(["Aria"]), f("all")])).toBe(true);
    expect(L.widensKnowledge([f(["Aria"]), f(["Bram"])])).toBe(true);
    expect(L.widensKnowledge([f(["Aria", "Bram"]), f(["bram", "aria"])])).toBe(false);
    expect(L.widensKnowledge([f(["Aria"])])).toBe(false);
  });
});

describe("what is risky (#184 P5)", () => {
  const st = chat([
    fact("f1"),
    fact("f2"),
    fact("f3", { pinned: true }),
    fact("f4", { edited: true }),
    fact("f5", { origin: "user" }),
    fact("f6", { weight: "key" }),
    fact("f7", { type: "change" }),
    fact("f8", { type: "belief", holder: "Bram" }),
    fact("f9", { knownBy: ["Bram"] }),
  ]);
  it("routine changes are not", () => {
    expect(L.riskOf(st, prop("p1", "rewrite", ["f1"]))).toBe("");
    expect(L.riskOf(st, prop("p2", "retire", ["f1"]))).toBe("");
    expect(L.riskOf(st, prop("p3", "merge", ["f1", "f2"]))).toBe("");
    expect(L.riskOf(st, prop("p4", "pin", ["f6"]))).toBe("");
  });
  it("a merge that widens waits; so does any change to a pinned, edited, user-written or key fact, a change or a belief", () => {
    expect(L.riskOf(st, prop("p1", "merge", ["f1", "f9"]))).toBe("widens");
    for (const id of ["f3", "f4", "f5", "f6"]) expect(L.riskOf(st, prop("p", "retire", [id]))).toBe("protected");
    expect(L.riskOf(st, prop("p", "rewrite", ["f7"]))).toBe("kind");
    expect(L.riskOf(st, prop("p", "retire", ["f8"]))).toBe("kind");
    expect(L.riskOf(st, prop("p", "retire", ["gone"]))).toBe("");
  });
  it("a new fact: a change or a belief waits; one that restates what the user pinned about the same subject differently may contradict it", () => {
    expect(L.addRisk(st, { text: "Aria lost her left arm.", subject: "Aria", type: "change" })).toBe("change");
    expect(L.addRisk(st, { text: "Bram was lied to.", subject: "Bram", type: "belief" })).toBe("belief");
    const pinned = chat([fact("f1", { text: "Aria is loyal to the crown and never lies to the queen.", pinned: true })]);
    expect(L.addRisk(pinned, { text: "Aria is loyal to the rebels and always lies to the queen.", subject: "Aria", type: "trait" })).toBe("contradicts");
    expect(L.addRisk(pinned, { text: "Aria likes tea in the morning.", subject: "Aria", type: "trait" })).toBe("");
    expect(L.addRisk(pinned, { text: "Bram is loyal to the rebels and always lies to the queen.", subject: "Bram", type: "trait" })).toBe("");
  });
});

describe("risky mode applies the routine and keeps the rest waiting (#184 P5)", () => {
  it("applies pin, rewrite, retire and merge by itself with an Undo, and leaves the risky ones with the reason", () => {
    const st = chat(
      [fact("f1"), fact("f2"), fact("f3"), fact("f4"), fact("f5"), fact("f6", { knownBy: ["Bram"] }), fact("f7", { pinned: true })],
      [prop("p1", "rewrite", ["f1"]), prop("p2", "retire", ["f2"]), prop("p3", "merge", ["f3", "f4"]), prop("p4", "pin", ["f5"]), prop("p5", "merge", ["f4", "f6"]), prop("p6", "retire", ["f7"])],
    );
    const n = L.applyRisky(st, { proposals: "risky", pinLimit: 5 }, 100);
    const by = Object.fromEntries(st.proposals.map((p: any) => [p.id, p]));
    expect(by.p1).toMatchObject({ status: "accepted", auto: true });
    expect(by.p2).toMatchObject({ status: "accepted", auto: true });
    expect(by.p3).toMatchObject({ status: "accepted", auto: true });
    expect(by.p4).toMatchObject({ status: "accepted", auto: true });
    expect(n).toBe(4);
    // f4 was merged by p3 already, so the merge p5 no longer has its target: it is left alone, still pending
    expect(by.p5.status).toBe("pending");
    expect(by.p6).toMatchObject({ status: "pending", why: "protected" });
    expect(st.facts.find((f: any) => f.id === "f1").text).toBe("New wording p1");
    expect(st.facts.find((f: any) => f.id === "f2").status).toBe("retired");
    expect(st.facts.find((f: any) => f.id === "f5").pinned).toBe(true);
    expect(st.activity.filter((a: any) => a.kind === "proposal.auto")).toHaveLength(4);
  });

  it("a widening merge waits with why 'widens' and is not applied", () => {
    const st = chat([fact("f1", { knownBy: ["Aria"] }), fact("f2")], [prop("p1", "merge", ["f1", "f2"])]);
    expect(L.applyRisky(st, { proposals: "risky", pinLimit: 5 }, 100)).toBe(0);
    expect(st.proposals[0]).toMatchObject({ status: "pending", why: "widens" });
    expect(st.facts.filter((f: any) => f.status === "active")).toHaveLength(2);
  });

  it("does nothing in ask mode (every proposal waits) and in quiet mode it still leaves a retire and a merge", () => {
    const st = chat([fact("f1"), fact("f2")], [prop("p1", "retire", ["f1"]), prop("p2", "merge", ["f1", "f2"])]);
    expect(L.applyRisky(st, { proposals: "ask" }, 1)).toBe(0);
    expect(L.applyRisky(st, { proposals: "quiet" }, 1)).toBe(0);
    expect(st.proposals.every((p: any) => p.status === "pending")).toBe(true);
  });
});

describe("taking an automatic change back (#184 P5)", () => {
  it("undo of a retire brings the fact back; it refuses when the fact changed since", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    const m = mockHost();
    const st = chat([fact("f1")], [prop("p1", "retire", ["f1"])]);
    L.applyRisky(st, { proposals: "risky", pinLimit: 5 }, 100);
    writeJson("litopys/chats/c1.json", st);
    expect(route(m, { op: "undo", id: "p1" }).status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    expect(after.facts[0].status).toBe("active");
    expect(after.proposals[0]).toMatchObject({ status: "rejected", undone: true });
    expect(route(m, { op: "undo", id: "p1" }).status).toBe(409);
  });

  it("undo of a merge removes the merged fact, restores the parts and puts the causes back", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    const m = mockHost();
    const st = chat([fact("f1"), fact("f2"), fact("f3", { because: "f1" })], [prop("p1", "merge", ["f1", "f2"])]);
    L.applyRisky(st, { proposals: "risky", pinLimit: 5 }, 100);
    const merged = st.facts.find((f: any) => f.origin === "merge");
    expect(merged).toBeTruthy();
    expect(st.facts.find((f: any) => f.id === "f3").because).toBe(merged.id);
    writeJson("litopys/chats/c1.json", st);
    expect(route(m, { op: "undo", id: "p1" }).status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    expect(after.facts.find((f: any) => f.origin === "merge")).toBeUndefined();
    const byId = Object.fromEntries(after.facts.map((f: any) => [f.id, f]));
    expect(byId.f1).toMatchObject({ status: "active", pinned: false });
    expect(byId.f1.mergedInto).toBeUndefined();
    expect(byId.f2).toMatchObject({ status: "active", pinned: false });
    expect(byId.f3.because).toBe("f1");
  });

  it("undo of a merge refuses when the merged fact was edited since", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    const m = mockHost();
    const st = chat([fact("f1"), fact("f2")], [prop("p1", "merge", ["f1", "f2"])]);
    L.applyRisky(st, { proposals: "risky", pinLimit: 5 }, 100);
    st.facts.find((f: any) => f.origin === "merge").edited = true;
    writeJson("litopys/chats/c1.json", st);
    expect(route(m, { op: "undo", id: "p1" }).status).toBe(409);
  });
});

describe("a new fact that waits (#184 P5)", () => {
  const replyWith = (ops: any[]) => chapterReply("T", "X", ops);

  it("a change fact waits as a proposal to add it, an ordinary fact is added, and accepting adds the change with a new id", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [replyWith([
      { op: "add", text: "Aria likes the old mill.", subject: "Aria", knownBy: "all", type: "trait", weight: "everyday" },
      { op: "add", text: "Aria lost her left arm in the fire.", subject: "Aria", knownBy: "all", type: "change", weight: "important" },
    ])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts.map((f: any) => f.text)).toEqual(["Aria likes the old mill."]);
    const wait = st.proposals.find((p: any) => p.op === "add");
    expect(wait).toMatchObject({ status: "pending", why: "change", targets: [] });
    expect(wait.facts[0]).toMatchObject({ text: "Aria lost her left arm in the fire.", type: "change", subject: "Aria", origin: "chapter" });
    expect(wait.facts[0].id).toBeUndefined();
    expect(route(m, { op: "accept", id: wait.id }).status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    const made = after.facts.find((f: any) => f.type === "change");
    expect(made).toMatchObject({ id: "f2", status: "active", text: "Aria lost her left arm in the fire." });
    expect(after.proposals.find((p: any) => p.id === wait.id).status).toBe("accepted");
  });

  it("rejecting it adds nothing", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [replyWith([{ op: "add", text: "Aria lost her left arm in the fire.", subject: "Aria", knownBy: "all", type: "change", weight: "important" }])]);
    const wait = readJson("litopys/chats/c1.json").proposals.find((p: any) => p.op === "add");
    expect(route(m, { op: "reject", id: wait.id }).status).toBe(200);
    expect(readJson("litopys/chats/c1.json").facts).toHaveLength(0);
  });

  it("a new version of a change fact waits, and accepting it retires the old one", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", { ...chat([fact("f1", { type: "change", text: "Aria lost her left arm in the fire." })]), chapters: [] });
    const m = mockHost();
    tick(m, [replyWith([{ op: "update", id: "f1", text: "Aria lost her left arm and her left eye in the fire.", type: "change" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts.find((f: any) => f.id === "f1").status).toBe("active");
    const wait = st.proposals.find((p: any) => p.op === "add");
    expect(wait).toMatchObject({ why: "change", status: "pending" });
    expect(wait.facts[0].supersedes).toBe("f1");
    expect(route(m, { op: "accept", id: wait.id }).status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    expect(after.facts.find((f: any) => f.id === "f1").status).toBe("superseded");
    expect(after.facts.find((f: any) => f.supersedes === "f1")).toMatchObject({ status: "active", type: "change" });
  });

  it("in ask mode a change fact is added at once, as before", () => {
    writeJson("litopys/config.json", ASK);
    writeChat("c1", story(70), { updatedAt: Date.now() });
    tick(mockHost(), [replyWith([{ op: "add", text: "Aria lost her left arm in the fire.", subject: "Aria", knownBy: "all", type: "change", weight: "important" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(1);
    expect(st.proposals.filter((p: any) => p.op === "add")).toHaveLength(0);
  });
});

describe("a new belief waits (#184 P5)", () => {
  const dash = (said: any, turn = 50) => writeJson("dashboard/state/c1.json", { v: 2, chatId: "c1", snapshots: { "m5#0": { clock: { day: 1, time: null, place: null }, present: ["Aria", "Bram"], turn } }, notebook: {}, said });
  const lie = (over: Record<string, any> = {}) => ({ id: "s1", text: "The debt is paid.", kind: "lie", hidden: true, heardBy: ["Bram", "Cora"], turn: 10, src: "m1#0", source: "chat", ...over });

  it("one proposal for a lie holds the beliefs of everyone who heard it; accepting makes them, and it is asked only once", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    dash({ Aria: [lie()] });
    const m = mockHost();
    tick(m);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(0);
    const waits = st.proposals.filter((p: any) => p.op === "add");
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ why: "belief", status: "pending" });
    expect(waits[0].facts.map((d: any) => d.holder)).toEqual(["Bram", "Cora"]);
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").proposals.filter((p: any) => p.op === "add")).toHaveLength(1);
    expect(route(m, { op: "accept", id: waits[0].id }).status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    expect(after.facts.map((f: any) => [f.type, f.holder, f.status])).toEqual([["belief", "Bram", "active"], ["belief", "Cora", "active"]]);
    expect(after.facts[0].lie).toBe("s1");
  });

  it("a person who learns the truth before the answer drops out of the question; with no one left it is closed", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    dash({ Aria: [lie()] });
    tick(mockHost());
    writeJson("dashboard/notes/c1.json", { edits: { s1: { exposed: ["Bram"] } } });
    tick(mockHost());
    const st = readJson("litopys/chats/c1.json");
    const wait = st.proposals.find((p: any) => p.op === "add");
    expect(wait.status).toBe("pending");
    expect(wait.facts.map((d: any) => d.holder)).toEqual(["Cora"]);
    writeJson("dashboard/notes/c1.json", { edits: { s1: { retired: true } } });
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").proposals.find((p: any) => p.op === "add").status).toBe("expired");
  });
});

describe("the default of a new install (#184 P5)", () => {
  it("a new install reviews only the risky ones; an install that already has data keeps what it had", () => {
    const fresh = mockHost();
    const res = L.handleRoute({ method: "GET", path: "/litopys/config" }, fresh.host);
    expect(res.json.proposals).toBe("risky");
  });
  it("an install whose config already chose is left alone", () => {
    writeJson("litopys/config.json", { arcNotice: "done", proposals: "quiet" });
    expect(L.handleRoute({ method: "GET", path: "/litopys/config" }, mockHost().host).json.proposals).toBe("quiet");
    writeJson("litopys/config.json", { model: "x/y" });
    expect(L.handleRoute({ method: "GET", path: "/litopys/config" }, mockHost().host).json.proposals).toBe("ask");
  });
});

describe("a draft that waited in an older shape (#184 P5)", () => {
  it("accepting a draft with only a text gives the fact the fields the record relies on", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    const m = mockHost();
    const st = chat([], [{ id: "p1", op: "add", targets: [], facts: [{ text: "A bare draft." }], text: "A bare draft.", why: "change", reason: "t", status: "pending", at: 1 }]);
    writeJson("litopys/chats/c1.json", st);
    expect(route(m, { op: "accept", id: "p1" }).status).toBe(200);
    expect(readJson("litopys/chats/c1.json").facts[0]).toMatchObject({ id: "f1", text: "A bare draft.", subject: "world", knownBy: "all", type: "event", weight: "everyday", status: "active" });
  });
});
