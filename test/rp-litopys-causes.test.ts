/**
 * #178: cause-and-effect links between facts. A new fact may name the earlier fact it came from (`because`); when the
 * insert picks an effect it brings its cause along if there is room; Consolidate carries the links over.
 */
import { describe, expect, it } from "bun:test";
import { L, chapterReply, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };
const fact = (i: number, text: string, extra: Record<string, unknown> = {}) => ({
  id: "f" + i,
  text,
  subject: "world",
  knownBy: "all",
  type: "event",
  weight: "everyday",
  pinned: false,
  status: "active",
  at: i,
  updatedAt: i,
  ...extra,
});

describe("the worker: asking for a cause and reading it", () => {
  const ln = () => L.activeLine(story(10));
  const apply = (st: any, facts: unknown[], ctx: Record<string, unknown> = {}) =>
    L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts })), { now: 5, line: ln(), ...ctx });

  it("asks only when there is a known fact to point at, and not when causes are off", () => {
    const st = L.emptyChat("c1");
    const req = (cfg: Record<string, unknown>) => L.buildWorkerRequest(st, { ...work, scene: { ...work.scene } }, ln(), {}, { ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS, ...cfg }, { userName: "You" });
    expect(req({}).systemPrompt).not.toContain("because");
    st.facts.push(fact(1, "The river thawed."));
    const on = req({});
    expect(on.systemPrompt).toContain("Causes (optional, usually none)");
    expect(on.systemPrompt).toContain('"weight":"everyday|important|key","because":"f3"?}');
    const off = req({ causes: false });
    expect(off.systemPrompt).not.toContain("because");
    expect(off.systemPrompt).not.toContain("Causes (optional");
  });

  it("keeps a valid cause on an added fact", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "The river thawed."));
    st.counters.fact = 1;
    apply(st, [{ op: "add", text: "Jude lost his boat.", subject: "Jude", because: "f1" }]);
    expect(st.facts[1]).toMatchObject({ id: "f2", because: "f1" });
  });

  it("is tolerant: other spellings of the id, other keys, a text after the id", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "The river thawed."), fact(2, "The ferry sank."));
    st.counters.fact = 2;
    apply(st, [
      { op: "add", text: "Fact A about the boat.", because: "F1" },
      { op: "add", text: "Fact B about the cargo.", cause: 2 },
      { op: "add", text: "Fact C about the dock.", caused_by: "f2: the ferry sank" },
      { op: "add", text: "Fact D about the toll.", because: "1" },
    ]);
    expect(st.facts.slice(2).map((f: any) => f.because)).toEqual(["f1", "f2", "f2", "f1"]);
  });

  it("drops unknown ids, garbage and a missing field; the chapter is still written and every fact kept", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "The river thawed."));
    st.counters.fact = 1;
    const ch = apply(st, [
      { op: "add", text: "Unknown id fact.", because: "f99" },
      { op: "add", text: "Words, not an id.", because: "the river thawed" },
      { op: "add", text: "A list of causes.", because: ["f1", "f2"] },
      { op: "add", text: "An object cause.", because: { id: "f1" } },
      { op: "add", text: "Null cause.", because: null },
      { op: "add", text: "No cause at all." },
    ]);
    expect(ch.text).toBe("T");
    expect(st.facts).toHaveLength(7);
    expect(st.facts.slice(1).some((f: any) => "because" in f)).toBe(false);
    expect(st.worker.ok).toBe(true);
  });

  it("a fact never names itself", () => {
    const st = L.emptyChat("c1");
    st.counters.fact = 0;
    apply(st, [{ op: "add", text: "Born without a cause.", because: "f1" }]);
    expect(st.facts[0].id).toBe("f1");
    expect("because" in st.facts[0]).toBe(false);
  });

  it("ignores the field while causes are off", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "The river thawed."));
    st.counters.fact = 1;
    apply(st, [{ op: "add", text: "Jude lost his boat.", because: "f1" }], { causes: false });
    expect("because" in st.facts[1]).toBe(false);
  });

  it("a change that replaces a fact may carry a cause too, but not the replaced fact as its cause", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "Jude owns a boat.", { type: "change" }), fact(2, "The river thawed."));
    st.counters.fact = 2;
    apply(st, [
      { op: "update", id: "f1", text: "Jude lost his boat.", type: "change", because: "f2" },
    ]);
    const next = st.facts.find((f: any) => f.supersedes === "f1");
    expect(next.because).toBe("f2");
    const st2 = L.emptyChat("c2");
    st2.facts.push(fact(1, "Jude owns a boat.", { type: "change" }));
    st2.counters.fact = 1;
    apply(st2, [{ op: "update", id: "f1", text: "Jude lost his boat.", type: "change", because: "f1" }]);
    expect("because" in st2.facts.find((f: any) => f.supersedes === "f1")).toBe(false);
  });
});

/** A chat of 40 messages; the facts are about different things, the scan names only what the effect says. */
function pool(count: number, links: Record<string, string>, extra: Record<string, Record<string, unknown>> = {}) {
  const topics = "harbour orchard bell forge mill ferry tower cellar garden market chapel bridge".split(" ");
  const facts = Array.from({ length: count }, (_, i) =>
    fact(i + 1, i === 0 ? "The river thawed early." : `The ${topics[i % topics.length]} number ${i + 1} stands unchanged near the old crossing ${i + 1}.`, { ...(links["f" + (i + 1)] ? { because: links["f" + (i + 1)] } : {}), ...(extra["f" + (i + 1)] ?? {}) }),
  );
  const st = { ...L.emptyChat("t"), facts };
  const line = L.activeLine(story(40));
  return { st, line, facts };
}
const insertOf = (p: any, budget: number, scan: string, cfg: Record<string, unknown> = {}) =>
  L.buildInsert({ st: p.st, line: p.line, dash: null, meta: { userName: "You" }, cfg: { ...L.DEFAULT_CONFIG, budget, ...cfg }, scanText: scan, speakerName: "Aria", used: {} });

describe("recall: the cause rides after its effect", () => {
  // f5 (effect) is the only match; f1 (cause) shares no word with the scan
  const SCAN = "tell me about the chapel number 5";
  const p = pool(24, { f5: "f1" });
  // the smallest budgets from 200 up where the plain insert has room for one more fact, and where it has not
  const budgets = Array.from({ length: 200 }, (_, i) => 200 + i);
  const outcome = (b: number) => {
    const base = insertOf(p, b, SCAN, { causes: false });
    return !base.full && base.factIds.includes("f5") && !base.factIds.includes("f1") ? insertOf(p, b, SCAN).causes : null;
  };
  const room = budgets.find((b) => outcome(b)?.pulled === 1);
  const tight = budgets.find((b) => outcome(b)?.missed === 1);

  it("pulls the cause in right after the effect when it fits, without losing a fact it already had", () => {
    expect(room).toBeDefined();
    const base = insertOf(p, room!, SCAN, { causes: false });
    const ins = insertOf(p, room!, SCAN);
    expect(ins.factIds[ins.factIds.indexOf("f5") + 1]).toBe("f1");
    expect(ins.causes).toEqual({ pulled: 1, missed: 0, together: 0 });
    expect(base.factIds.every((id: string) => ins.factIds.includes(id))).toBe(true);
    expect(ins.tokens).toBeLessThanOrEqual(room!);
    expect(ins.tail).toContain("The river thawed early");
  });

  it("does not, when the budget is full: the insert is the same as without links", () => {
    expect(tight).toBeDefined();
    const base = insertOf(p, tight!, SCAN, { causes: false });
    const ins = insertOf(p, tight!, SCAN);
    expect(ins.factIds).toEqual(base.factIds);
    expect(ins.tail).toBe(base.tail);
    expect(ins.causes).toEqual({ pulled: 0, missed: 1, together: 0 });
  });

  it("never pushes out a fact, whatever the budget", () => {
    for (const b of budgets) {
      const base = insertOf(p, b, SCAN, { causes: false });
      const ins = insertOf(p, b, SCAN);
      if (!base.factIds.includes("f5")) {
        expect(ins.factIds).toEqual(base.factIds);
        continue;
      }
      expect(base.factIds.every((id: string) => ins.factIds.includes(id))).toBe(true);
      expect(ins.factIds.length - base.factIds.length).toBeLessThanOrEqual(1);
      expect(ins.tokens).toBeLessThanOrEqual(b);
    }
  });

  it("a cause is never picked alone: the effect is not in the insert, the cause is not either", () => {
    const base = insertOf(p, 200, "something else entirely about nothing", { causes: false });
    const ins = insertOf(p, 200, "something else entirely about nothing");
    expect(ins.factIds).toEqual(base.factIds);
    expect(ins.factIds.includes("f5")).toBe(false);
    expect(ins.factIds.includes("f1")).toBe(false);
  });

  it("a retired, replaced or unknown cause is not pulled in", () => {
    for (const status of ["retired", "superseded"]) {
      const q = pool(24, { f5: "f1" }, { f1: { status } });
      const ins = insertOf(q, room!, SCAN);
      expect(ins.factIds.includes("f1")).toBe(false);
      expect(ins.causes).toEqual({ pulled: 0, missed: 0, together: 0 });
    }
    const gone = pool(24, { f5: "f99" });
    expect(insertOf(gone, room!, SCAN).factIds.includes("f99")).toBe(false);
  });

  it("a cause nobody present knows is not pulled in", () => {
    const q = pool(24, { f5: "f1" }, { f1: { knownBy: ["Zed"], subject: "Zed" } });
    expect(insertOf(q, room!, SCAN).factIds.includes("f1")).toBe(false);
  });

  it("one cause for two effects comes once", () => {
    const q = pool(24, { f5: "f1", f6: "f1" });
    const ins = insertOf(q, room! + 40, "the chapel number 5 and the bridge number 6");
    expect(ins.factIds.filter((id: string) => id === "f1").length).toBeLessThanOrEqual(1);
  });

  it("is off with causes: false, and a chat with no links gets the same insert and no causes key in the file", () => {
    const off = insertOf(p, room!, SCAN, { causes: false });
    expect(off.factIds.includes("f1")).toBe(false);
    const plain = pool(24, {});
    const a = insertOf(plain, room!, SCAN);
    const b = insertOf(plain, room!, SCAN, { causes: false });
    expect(a.factIds).toEqual(b.factIds);
    expect(L.causeRecord(undefined, a)).toEqual({});
  });

  it("the full record needs no pulling", () => {
    const ins = insertOf(p, 16000, SCAN);
    expect(ins.full).toBe(true);
    expect(ins.factIds).toContain("f1");
  });

  it("counts what causes did, over the replies of a chat", () => {
    const one = L.causeRecord(undefined, { causes: { pulled: 1, missed: 0, together: 0 } });
    expect(one).toEqual({ causes: { pulled: 1, missed: 0, together: 0 }, causeStats: { replies: 1, pulled: 1, missed: 0, together: 0 } });
    const two = L.causeRecord(one, { causes: { pulled: 0, missed: 1, together: 2 } });
    expect(two.causeStats).toEqual({ replies: 2, pulled: 1, missed: 1, together: 2 });
    // a reply with no link in play keeps the total and says nothing for itself
    const three = L.causeRecord(two, { causes: { pulled: 0, missed: 0, together: 0 } });
    expect(three.causeStats).toEqual(two.causeStats);
    expect(three.causes).toEqual({ pulled: 0, missed: 0, together: 0 });
  });
});

describe("Consolidate carries the links", () => {
  const seed = (facts: unknown[]) => {
    writeJson("litopys/config.json", { arcMode: "off" });
    writeChat("c", story(30));
    writeJson("litopys/chats/c.json", {
      v: 2, chatId: "c", migrated: true, chapters: [], facts, proposals: [], scene: { openFrom: null },
      counters: { chapter: 0, fact: facts.length, proposal: 0, arc: 0 }, rev: 1,
    });
  };
  const merge = (ids: string[], text = "Merged sentence.") => {
    const st = readJson("litopys/chats/c.json");
    st.proposals.push({ id: "p1", op: "merge", targets: ids, text, reason: "x", status: "pending", at: 1 });
    st.counters.proposal = 1;
    writeJson("litopys/chats/c.json", st);
    const res = L.proposalRoute(mockHost().host.fs, { chatId: "c", op: "accept", id: "p1" });
    expect(res.status ?? 200).toBe(200);
    return readJson("litopys/chats/c.json");
  };

  it("the survivor keeps the cause of a part, and the effects of a part now name the survivor", () => {
    seed([fact(1, "The river thawed."), fact(2, "Jude lost his boat.", { because: "f1" }), fact(3, "Jude has no boat.", { because: "f1" }), fact(4, "Jude walks to town.", { because: "f2" })]);
    const st = merge(["f2", "f3"], "Jude lost his boat when the river thawed.");
    const merged = st.facts.find((f: any) => f.origin === "merge");
    expect(merged.because).toBe("f1");
    expect(st.facts.find((f: any) => f.id === "f4").because).toBe(merged.id);
    // the parts stay as they were, readable
    expect(st.facts.find((f: any) => f.id === "f2")).toMatchObject({ status: "retired", because: "f1", mergedInto: merged.id });
  });

  it("a link between two parts becomes no link at all; a link back from the cause is not made into a loop", () => {
    seed([fact(1, "Ice broke."), fact(2, "The river thawed.", { because: "f1" }), fact(3, "The ice went out.", { because: "f2" })]);
    const st = merge(["f2", "f3"], "The ice went out and the river thawed.");
    const merged = st.facts.find((f: any) => f.origin === "merge");
    expect(merged.because).toBe("f1");
    seed([fact(1, "Ice broke.", { because: "f2" }), fact(2, "The river thawed."), fact(3, "The ice went out.", { because: "f1" })]);
    const st2 = merge(["f2", "f3"], "The ice went out and the river thawed.");
    const m2 = st2.facts.find((f: any) => f.origin === "merge");
    // f3's cause f1 itself names a part (f2) as its cause: taking it would make a loop
    expect(m2.because).toBeUndefined();
    expect(st2.facts.find((f: any) => f.id === "f1").because).toBe(m2.id);
  });

  it("deleting a fact clears the links that named it, retiring does not", () => {
    seed([fact(1, "The river thawed."), fact(2, "Jude lost his boat.", { because: "f1" })]);
    const fs = mockHost().host.fs;
    L.factRoute(fs, { chatId: "c", op: "retire", id: "f1" });
    expect(readJson("litopys/chats/c.json").facts[1].because).toBe("f1");
    L.factRoute(fs, { chatId: "c", op: "delete", id: "f1" });
    expect("because" in readJson("litopys/chats/c.json").facts[0]).toBe(false);
  });

  it("a link to a fact left behind goes when a rebuild or a branch is made", () => {
    const st = L.emptyChat("c");
    const facts = [fact(1, "A."), fact(2, "B.", { because: "f1" }), fact(3, "C.", { because: "f9" }), fact(4, "D.", { because: "f4" })];
    st.rebuild = { startedAt: 1, chapters: [], facts, proposals: [], carried: [], counters: { chapter: 0, fact: 4, proposal: 0 }, queue: { next: 0 } };
    L.finishRebuild(st, 2);
    expect(st.facts.map((f: any) => f.because)).toEqual([undefined, "f1", undefined, undefined]);
  });
});

describe("the worker run end to end", () => {
  it("a reply with a cause lands on the fact; a reply with a wrong one still writes the chapter", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2, chatId: "c1", migrated: true, chapters: [], facts: [{ ...fact(1, "The river thawed.", { subject: "Aria" }) }], proposals: [], scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 0, arc: 0 }, rev: 1,
    });
    const m = mockHost();
    const reply = chapterReply("Thaw", "Jude lost the boat.", [
      { op: "add", text: "Jude lost his boat.", subject: "Jude", because: "f1" },
      { op: "add", text: "Jude is angry.", subject: "Jude", because: "zz" },
    ]);
    const { requests } = tick(m, [reply]);
    expect(requests).toHaveLength(1);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.facts.find((f: any) => f.text === "Jude lost his boat.").because).toBe("f1");
    expect("because" in st.facts.find((f: any) => f.text === "Jude is angry.")).toBe(false);
  });
});
