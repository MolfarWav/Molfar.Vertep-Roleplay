/**
 * #51: Consolidate facts. One model call per batch of a chat's active facts proposes merges of
 * duplicates and fixes of contradictions; they wait in the Ledger's proposals and nothing
 * changes until the user accepts one.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

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
