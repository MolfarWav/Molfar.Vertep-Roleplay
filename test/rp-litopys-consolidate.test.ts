/**
 * #51: Consolidate facts. One model call per batch of a chat's active facts proposes merges of
 * duplicates and fixes of contradictions; they wait in the Ledger's proposals and nothing
 * changes until the user accepts one.
 */
import { describe, expect, it } from "bun:test";
import { L, line, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const fact = (i: number, text: string, subject = "Aria") => ({
  id: "f" + i,
  text,
  subject,
  knownBy: "all",
  type: "event",
  weight: "everyday",
  pinned: false,
  status: "active",
  at: 1,
  updatedAt: 1,
});

function seed(chatId: string, count = 24) {
  writeJson("litopys/config.json", { arcMode: "off" });
  writeChat(chatId, story(30));
  const facts = Array.from({ length: count }, (_, i) => fact(i + 1, `Aria remembers detail number ${i + 1}.`, i % 3 ? "Aria" : "Bram"));
  writeJson(`litopys/chats/${chatId}.json`, {
    v: 2, chatId, migrated: true, chapters: [], facts, proposals: [], scene: { openFrom: null },
    counters: { chapter: 0, fact: count, proposal: 0, arc: 0 }, rev: 1,
  });
}

const reply = (ops: unknown[]) => JSON.stringify({ ops });
const start = (chatId: string) => L.consolidateRoute(mockHost().host.fs, { chatId, op: "start" });

describe("batches and parsing", () => {
  it("keeps one subject's facts together and caps a batch", () => {
    const st = { facts: [...Array.from({ length: 70 }, (_, i) => fact(i + 1, "a", "Aria")), ...Array.from({ length: 10 }, (_, i) => fact(100 + i, "b", "Bram"))] };
    const b = L.consolidateBatches(st);
    expect(b.every((x: string[]) => x.length <= L.CONSOLIDATE_BATCH)).toBe(true);
    expect(b.flat().length).toBe(80);
    const bram = b.find((x: string[]) => x.includes("f100"));
    expect(["f100", "f101", "f109"].every((id) => bram.includes(id))).toBe(true);
  });

  it("drops unknown ids, empty texts and one-fact merges", () => {
    const ops = L.parseConsolidateReply(
      "```json\n" +
        reply([
          { op: "merge", ids: ["f1", "f2"], text: "Aria remembers both.", reason: "same" },
          { op: "merge", ids: ["f1", "zz"], text: "x" },
          { op: "rewrite", id: "f3", text: "" },
          { op: "retire", id: "f4", reason: "f5 says otherwise" },
          { op: "retire", id: "nope" },
        ]) +
        "\n```",
      ["f1", "f2", "f3", "f4", "f5"],
    );
    expect(ops).toEqual([
      { op: "merge", targets: ["f1", "f2"], text: "Aria remembers both.", reason: "same" },
      { op: "retire", targets: ["f4"], reason: "f5 says otherwise" },
    ]);
    expect(L.parseConsolidateReply("no json here", ["f1"])).toBeNull();
  });

  // #488: a sentence over the limit was cut to 300 characters and stored mid-word
  it("drops a merge or rewrite over the limit instead of cutting it", () => {
    const long = `Aria ${"remembers the long evening ".repeat(15)}`;
    expect(long.length).toBeGreaterThan(L.CONSOLIDATE_TEXT_MAX);
    const ops = L.parseConsolidateReply(
      reply([
        { op: "merge", ids: ["f1", "f2"], text: long },
        { op: "rewrite", id: "f3", text: long },
        { op: "merge", ids: ["f1", "f2"], text: "Aria remembers both." },
      ]),
      ["f1", "f2", "f3"],
    );
    expect(ops).toEqual([{ op: "merge", targets: ["f1", "f2"], text: "Aria remembers both.", reason: "" }]);
  });
});

describe("what a merge must do (#488)", () => {
  const st = () => ({
    facts: [
      fact(1, "Ada showed Vlad the laptop and taught her the touchpad."),
      fact(2, "Vlad brewed coffee in a copper cezve for Ada."),
      fact(3, "Reina must pay 340,000 yen to the clinic by noon on the 19th."),
      fact(4, "Reina paid the 340,000 yen clinic bill in cash at 10:52."),
    ],
    proposals: [],
    counters: { proposal: 0 },
  });

  it("is not proposed when it only glues its parts (as long as they are together)", () => {
    const s = st();
    const glued = "Ada showed Vlad the laptop and taught her the touchpad, and Vlad brewed coffee in a copper cezve for Ada.";
    expect(L.addConsolidateProposals(s, [{ op: "merge", targets: ["f1", "f2"], text: glued, reason: "same scene" }], 5)).toBe(0);
    expect(s.proposals).toHaveLength(0);
  });

  it("is proposed when it is shorter than its parts together", () => {
    const s = st();
    const dense = "Reina paid the 340,000 yen clinic bill in cash at 10:52, before the noon deadline.";
    expect(L.addConsolidateProposals(s, [{ op: "merge", targets: ["f3", "f4"], text: dense, reason: "deadline met" }], 5)).toBe(1);
    expect(s.proposals[0]).toMatchObject({ op: "merge", targets: ["f3", "f4"], status: "pending", origin: "consolidate" });
  });

  it("a rewrite that only rewords the fact is not proposed; a tense fix and a cut-off fact are", () => {
    const old = "Marco collapsed from exhaustion and his burns after the paramedics arrived, telling Chihiro he would go into reconnaissance with her.";
    const same = "Marco collapsed from exhaustion and his burns after the paramedics arrived, having told Chihiro he would go into reconnaissance with her.";
    const s = { facts: [fact(1, old), fact(2, "Reina must pay 340,000 yen to the clinic by noon on the 19th.")], proposals: [], counters: { proposal: 0 } };
    expect(L.isNearCopy(old, same)).toBe(true);
    expect(L.addConsolidateProposals(s, [{ op: "rewrite", targets: ["f1"], text: same, reason: "unclear" }], 5)).toBe(0);
    expect(L.addConsolidateProposals(s, [{ op: "rewrite", targets: ["f1"], text: old, reason: "unclear" }], 5)).toBe(0);
    const tense = "Reina paid 340,000 yen to the clinic at 10:52, before the noon deadline on the 19th.";
    expect(L.isNearCopy("Reina must pay 340,000 yen to the clinic by noon on the 19th.", tense)).toBe(false);
    expect(L.addConsolidateProposals(s, [{ op: "rewrite", targets: ["f2"], text: tense, reason: "deadline met" }], 5)).toBe(1);
    // a fact stored cut off is rewritten whole even when the whole sentence is close to it
    const cutOff = { ...fact(3, "Ada showed Vlad the laptop and taught her the touchpad. ".repeat(6).slice(0, L.CONSOLIDATE_TEXT_MAX - 1) + "a"), origin: "merge" };
    expect(L.looksCut(cutOff)).toBe(true);
    const s2 = { facts: [cutOff], proposals: [], counters: { proposal: 0 } };
    const whole = cutOff.text + "ll.";
    expect(L.isNearCopy(cutOff.text, whole)).toBe(true);
    expect(L.addConsolidateProposals(s2, [{ op: "rewrite", targets: ["f3"], text: whole, reason: "cut off" }], 5)).toBe(1);
  });

  it("the prompt asks for a rewrite only when the meaning changes", () => {
    expect(L.CONSOLIDATE_PROMPT).toContain("never propose one only to change words");
  });

  it("the prompt rewrites stale plans, keeps history, keeps details and names the limit", () => {
    expect(L.CONSOLIDATE_PROMPT).toContain("still to come");
    expect(L.CONSOLIDATE_PROMPT).toContain("rewrite it as what happened");
    expect(L.CONSOLIDATE_PROMPT).toContain("is history");
    expect(L.CONSOLIDATE_PROMPT).toContain("only a pure duplicate");
    expect(L.CONSOLIDATE_PROMPT).toContain("keeps every concrete detail");
    expect(L.CONSOLIDATE_PROMPT).toContain("shorter than the facts it joins");
    expect(L.CONSOLIDATE_PROMPT).toContain(String(L.CONSOLIDATE_TEXT_MAX));
    expect(L.CONSOLIDATE_PROMPT).toContain("{cut off:");
  });
});

describe("fold and cut-off facts (#488)", () => {
  const small = (i: number, text: string, extra: Record<string, unknown> = {}) => ({ ...fact(i, text), ...extra });
  const st = () => ({
    facts: [
      small(1, "Vlad taught Ada the washing machine: a spoon of powder, the switch at 15."),
      small(2, "Vlad brewed coffee for Ada in a copper cezve with cream."),
      small(3, "Vlad showed Ada the laptop and the touchpad."),
      small(4, "Ada is a goddess who moved into Vlad's flat.", { weight: "key" }),
      small(5, "Ada keeps her true name secret.", { secret: true }),
      small(6, "Vlad's neighbour Sanych lent a lamp.", { knownBy: ["Vlad", "Sanych"] }),
    ],
    proposals: [],
    counters: { proposal: 0 },
  });
  const foldOf = (targets: string[], text: string) => ({ op: "merge", fold: true, targets, text, reason: "one evening" });
  const dense = "Vlad showed Ada the household: the washing machine (powder, switch at 15), cezve coffee, the laptop.";

  it("a fold reply is read as a merge marked fold", () => {
    const ops = L.parseConsolidateReply(reply([{ op: "fold", ids: ["f1", "f2", "f3"], text: dense, reason: "r" }]), ["f1", "f2", "f3"]);
    expect(ops).toEqual([{ op: "merge", targets: ["f1", "f2", "f3"], text: dense, reason: "r", fold: true }]);
  });

  it("is proposed only with the switch on, and only of small facts of one subject the same people know", () => {
    expect(L.addConsolidateProposals(st(), [foldOf(["f1", "f2", "f3"], dense)], 5)).toBe(0);
    const s = st();
    expect(L.addConsolidateProposals(s, [foldOf(["f1", "f2", "f3"], dense)], 5, undefined, { fold: true })).toBe(1);
    expect(s.proposals[0]).toMatchObject({ op: "merge", fold: true, targets: ["f1", "f2", "f3"], status: "pending" });
    // a key fact, a secret, other knowers, another subject: never folded
    for (const bad of [["f1", "f4"], ["f1", "f5"], ["f1", "f6"]]) {
      expect(L.addConsolidateProposals(st(), [foldOf(bad, "Short.")], 5, undefined, { fold: true })).toBe(0);
    }
    const other = st();
    other.facts[1] = { ...other.facts[1], subject: "Bram" };
    expect(L.addConsolidateProposals(other, [foldOf(["f1", "f2"], "Short.")], 5, undefined, { fold: true })).toBe(0);
  });

  it("the request has the fold rule and marks small facts only when the switch is on", () => {
    const facts = st().facts;
    const off = L.buildConsolidateRequest(facts, { ...L.DEFAULT_CONFIG }, {}, null);
    expect(off.systemPrompt).not.toContain("- fold:");
    expect(off.messages[0].content).not.toContain("(small)");
    const on = L.buildConsolidateRequest(facts, { ...L.DEFAULT_CONFIG, foldFacts: true }, {}, null);
    expect(on.systemPrompt).toContain("- fold:");
    expect(on.systemPrompt).toContain('"op":"fold"');
    expect(on.messages[0].content).toContain("f1 [Aria] (small)");
    expect(on.messages[0].content).not.toContain("f4 [Aria] (small)");
    expect(on.messages[0].content).not.toContain("f5 [Aria] (small)");
    expect(L.DEFAULT_CONFIG.foldFacts).toBe(false);
  });

  it("a merged fact stored cut off is shown with the texts it was made from", () => {
    const cutText = `Reina turned back toward the coffee stand, fearing one careless word ${"could spread her secret ".repeat(12)}`.slice(0, 300).trimEnd();
    const cutFact = { ...fact(7, cutText), origin: "merge", merges: ["f8", "f9"] };
    expect(L.looksCut(cutFact)).toBe(true);
    expect(L.looksCut({ ...cutFact, text: "A whole sentence." })).toBe(false);
    expect(L.looksCut({ ...cutFact, origin: "chapter" })).toBe(false);
    const parts: Record<string, string> = { f8: "Reina turned back toward the stand.", f9: "She left for the bank before eleven." };
    const req = L.buildConsolidateRequest([cutFact], { ...L.DEFAULT_CONFIG }, {}, null, {}, (f: any) => f.merges.map((id: string) => parts[id]));
    expect(req.messages[0].content).toContain("{cut off: Reina turned back toward the stand. | She left for the bank before eleven.}");
  });
});

describe("the Consolidate run", () => {
  it("refuses under the minimum", () => {
    seed("few", 5);
    const res = start("few");
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("too few facts");
  });

  it("proposes a merge and a retire; nothing changes until accepted", () => {
    seed("c1");
    expect(start("c1").status).toBe(200);
    const m = mockHost();
    const { requests } = tick(m, [reply([
      { op: "merge", ids: ["f2", "f3"], text: "Aria remembers details 2 and 3.", reason: "duplicates" },
      { op: "retire", id: "f5", reason: "contradicted by f6" },
    ])]);
    expect(requests.length).toBe(1);
    expect(requests[0]!.req.messages[0].content).toContain("f2 [Aria]");
    let st = readJson("litopys/chats/c1.json");
    expect(st.consolidate).toMatchObject({ state: "done", proposed: 2 });
    expect(st.facts.every((f: { status: string }) => f.status === "active")).toBe(true);
    const merge = st.proposals.find((p: { op: string }) => p.op === "merge");
    expect(merge).toMatchObject({ targets: ["f2", "f3"], status: "pending", origin: "consolidate" });
    expect(st.activity.some((a: { kind: string }) => a.kind === "consolidate.done")).toBe(true);

    // accepting the merge: one new fact, the two retired into it
    const acc = L.proposalRoute(m.host.fs, { chatId: "c1", op: "accept", id: merge.id });
    expect(acc.status).toBe(200);
    st = readJson("litopys/chats/c1.json");
    const merged = st.facts.find((f: { origin?: string }) => f.origin === "merge");
    expect(merged.text).toBe("Aria remembers details 2 and 3.");
    expect(st.facts.find((f: { id: string }) => f.id === "f2").status).toBe("retired");
  });

  it("a second run does not repeat a pending proposal", () => {
    seed("c2");
    start("c2");
    const m = mockHost();
    const ops = [{ op: "retire", id: "f5", reason: "dup" }];
    tick(m, [reply(ops)]);
    start("c2");
    tick(m, [reply(ops)]);
    const st = readJson("litopys/chats/c2.json");
    expect(st.proposals.filter((p: { op: string }) => p.op === "retire").length).toBe(1);
    expect(st.consolidate.proposed).toBe(0);
  });

  it("a failed reply stops the run and says why", () => {
    seed("c3");
    start("c3");
    tick(mockHost(), [{ error: "rate limited" }]);
    const st = readJson("litopys/chats/c3.json");
    expect(st.consolidate).toMatchObject({ state: "failed", error: "rate limited" });
    expect(st.proposals.length).toBe(0);
    // and it can be started again
    expect(start("c3").status).toBe(200);
  });

  it("cancel stops a run in progress", () => {
    seed("c4");
    start("c4");
    const res = L.consolidateRoute(mockHost().host.fs, { chatId: "c4", op: "cancel" });
    expect(res.status).toBe(200);
    expect(res.json.consolidate.state).toBe("idle");
    expect(tick(mockHost(), []).requests.length).toBe(0);
  });
});

// #153: a merge must not lose when and in which scene its parts were told
describe("story anchors on a merge", () => {
  const msgs = story(30);
  const ln = line(msgs);
  const chapters = [
    { id: "c1", from: "m1", to: "m10", count: 10, kind: "scene", label: "Arrival", text: "x", at: 1 },
    { id: "c2", from: "m11", to: "m20", count: 10, kind: "scene", label: "Cafe", text: "x", at: 1 },
    { id: "c3", from: "m21", to: "m30", count: 10, kind: "scene", label: "Leaving", text: "x", at: 1 },
  ];
  const snap = (clock: Record<string, unknown>) => ({ clock, present: ["Aria"] });
  const dash = {
    snapshots: {
      "m1#0": snap({ day: 2, time: "14:10", date: "2026-03-04" }),
      "m11#0": snap({ day: 2, time: "17:00", approx: true }),
      "m21#0": snap({ day: 2, time: "21:40", date: "2026-03-04" }),
    },
  };
  const st = {
    chapters,
    facts: [
      { ...fact(1, "Aria's jacket was held for her."), src: { from: "m1", to: "m10", chapter: "c1" } },
      { ...fact(2, "Aria's jacket was held for her again."), src: { from: "m21", to: "m30", chapter: "c3" } },
      { ...fact(3, "Aria likes tea."), src: { from: null, to: null } },
    ],
    proposals: [] as any[],
    counters: { proposal: 0 },
  };
  const anchorsOf = L.factAnchors(st, ln, dash);

  it("names the scene and the clock, and leaves out what it does not know", () => {
    expect(anchorsOf(st.facts[0])).toEqual([{ scene: 1, of: 3, chapter: "c1", day: 2, date: "2026-03-04", time: "14:10" }]);
    expect(L.anchorText(anchorsOf(st.facts[0]!)[0])).toBe("scene 1, 2026-03-04 14:10");
    expect(anchorsOf(st.facts[2])).toEqual([]);
    // no Dashboard at all: the scene alone
    expect(L.factAnchors(st, ln, { snapshots: {} })(st.facts[1])).toEqual([{ scene: 3, of: 3, chapter: "c3" }]);
    expect(L.anchorText({ scene: 2, day: 2, time: "17:00", approx: true })).toBe("scene 2, day 2 ~17:00");
  });

  it("shows the anchors to the model and tells it to keep the count", () => {
    const req = L.buildConsolidateRequest(st.facts, {}, {}, anchorsOf);
    const body = req.messages[0].content as string;
    expect(body).toContain("f1 [Aria] Aria's jacket was held for her. {scene 1, 2026-03-04 14:10}");
    expect(body).toContain("f2 [Aria] Aria's jacket was held for her again. {scene 3, 2026-03-04 21:40}");
    expect(body.endsWith("f3 [Aria] Aria likes tea.")).toBe(true);
    expect(req.systemPrompt).toContain("keep how many times and when");
    // without anchors the lines are as before
    expect(L.buildConsolidateRequest(st.facts, {}, {}).messages[0].content).not.toContain("{scene");
  });

  it("a merge proposal carries the anchors of its parts, in story order, once each", () => {
    const own = { ...st, proposals: [] as any[], counters: { proposal: 0 } };
    const added = L.addConsolidateProposals(own, [{ op: "merge", targets: ["f2", "f1"], text: "Twice: on arrival and on leaving, Aria's jacket was held.", reason: "same" }], 5, anchorsOf);
    expect(added).toBe(1);
    expect(own.proposals[0].whens.map((a: { scene: number }) => a.scene)).toEqual([1, 3]);
    // a rewrite or a retire has none
    const other = { ...st, proposals: [] as any[], counters: { proposal: 0 } };
    L.addConsolidateProposals(other, [{ op: "retire", targets: ["f1"], reason: "x" }], 5, anchorsOf);
    expect(other.proposals[0].whens).toBeUndefined();
  });

  it("accepting the merge stores them, and a later pass reads them back", () => {
    writeJson("litopys/config.json", { arcMode: "off" });
    writeChat("w1", msgs);
    const facts = [...st.facts, ...Array.from({ length: 20 }, (_, i) => fact(10 + i, `Aria remembers other thing ${i}.`, "Bram"))];
    writeJson("litopys/chats/w1.json", {
      v: 2, chatId: "w1", migrated: true, chapters: chapters.map((c) => ({ ...c, sig: L.chapterSig(ln.slice(Number(c.from.slice(1)) - 1, Number(c.to.slice(1)))) })),
      facts, proposals: [], scene: { openFrom: null }, counters: { chapter: 3, fact: 40, proposal: 0, arc: 0 }, rev: 1,
    });
    writeJson("dashboard/state/w1.json", { v: 2, chatId: "w1", snapshots: dash.snapshots });
    expect(start("w1").status).toBe(200);
    const m = mockHost();
    const { requests } = tick(m, [reply([{ op: "merge", ids: ["f1", "f2"], text: "Twice: on arrival and on leaving, Aria's jacket was held.", reason: "same" }])]);
    expect(requests[0]!.req.messages[0].content).toContain("{scene 1, 2026-03-04 14:10}");
    let s2 = readJson("litopys/chats/w1.json");
    const prop = s2.proposals.find((p: { op: string }) => p.op === "merge");
    expect(prop.whens.length).toBe(2);
    expect(L.proposalRoute(m.host.fs, { chatId: "w1", op: "accept", id: prop.id }).status).toBe(200);
    s2 = readJson("litopys/chats/w1.json");
    const merged = s2.facts.find((f: { origin?: string }) => f.origin === "merge");
    expect(merged.whens.map((a: { scene: number }) => a.scene)).toEqual([1, 3]);
    expect(L.factAnchors(s2, ln, dash)(merged).length).toBe(2);
  });
});
