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
