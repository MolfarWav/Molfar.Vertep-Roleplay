/**
 * Memory wave 1, the behaviour around the insert: arcs on by themselves for a new install (an existing one keeps
 * its choice and is offered the switch once), quiet proposals with an Undo, and the automatic Consolidate.
 */
import { describe, expect, it } from "bun:test";
import { L, chapterReply, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);

describe("arcs by themselves", () => {
  it("a new install merges automatically, and a chat file appearing later does not change that", () => {
    const { host } = mockHost();
    const cfg = route(host, "GET", "/litopys/config").json;
    expect(cfg.arcMode).toBe("auto");
    expect(cfg.arcNotice).toBe("done");
    writeJson("litopys/chats/c1.json", L.emptyChat("c1"));
    expect(route(host, "GET", "/litopys/config").json.arcMode).toBe("auto");
    expect(readJson("litopys/config.json").arcMode).toBe("auto");
  });

  it("an install that has chat records keeps asking and is offered the switch", () => {
    writeJson("litopys/chats/c1.json", L.emptyChat("c1"));
    const { host } = mockHost();
    const cfg = route(host, "GET", "/litopys/config").json;
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcNotice).toBe("pending");
  });

  it("an install with a saved config and no arc choice keeps asking and is offered the switch", () => {
    writeJson("litopys/config.json", { budget: 1500 });
    const cfg = L.loadConfig(mockHost().host.fs);
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcNotice).toBe("pending");
    expect(cfg.budget).toBe(1500);
  });

  it("a saved choice stays, and only 'ask' is offered the switch", () => {
    writeJson("litopys/config.json", { arcMode: "off" });
    expect(L.loadConfig(mockHost().host.fs)).toMatchObject({ arcMode: "off", arcNotice: "done" });
  });

  it("a saved 'auto' stays and nothing is offered", () => {
    writeJson("litopys/config.json", { arcMode: "auto" });
    expect(L.loadConfig(mockHost().host.fs)).toMatchObject({ arcMode: "auto", arcNotice: "done" });
  });

  it("answering the offer settles it for good, either way", () => {
    writeJson("litopys/config.json", { budget: 900 });
    const { host } = mockHost();
    expect(route(host, "GET", "/litopys/config").json.arcNotice).toBe("pending");
    const kept = route(host, "PUT", "/litopys/config", { arcNotice: "done" }).json;
    expect(kept).toMatchObject({ arcMode: "ask", arcNotice: "done" });
    expect(route(host, "GET", "/litopys/config").json.arcNotice).toBe("done");

    writeJson("litopys/config.json", { budget: 900 });
    const again = route(host, "GET", "/litopys/config").json;
    expect(again.arcNotice).toBe("pending");
    const on = route(host, "PUT", "/litopys/config", { arcMode: "auto" }).json;
    expect(on).toMatchObject({ arcMode: "auto", arcNotice: "done" });
    // asking again later by choice does not bring the offer back
    expect(route(host, "PUT", "/litopys/config", { arcMode: "ask" }).json).toMatchObject({ arcMode: "ask", arcNotice: "done" });
  });
});

const fact = (i: number, text: string, extra: Record<string, unknown> = {}) => ({
  id: "f" + i,
  text,
  subject: "Aria",
  knownBy: "all",
  type: "event",
  weight: "everyday",
  pinned: false,
  status: "active",
  at: 1,
  updatedAt: 1,
  ...extra,
});
const proposal = (i: number, op: string, targets: string[], extra: Record<string, unknown> = {}) => ({ id: "p" + i, op, targets, reason: "r", status: "pending", at: 1, ...extra });
const quiet = { ...L.DEFAULT_CONFIG, proposals: "quiet", pinLimit: 2, arcMode: "off" };

describe("quiet proposals", () => {
  it("asks by default and applies nothing", () => {
    const st = { ...L.emptyChat("c"), facts: [fact(1, "old")], proposals: [proposal(1, "rewrite", ["f1"], { text: "new" })] };
    expect(L.DEFAULT_CONFIG.proposals).toBe("ask");
    expect(L.applyQuiet(st, { ...L.DEFAULT_CONFIG }, 5)).toBe(0);
    expect(st.facts[0].text).toBe("old");
    expect(st.proposals[0].status).toBe("pending");
  });

  it("applies a rewrite and a pin, keeps them as accepted proposals, and writes an Activity row for each", () => {
    const st = {
      ...L.emptyChat("c"),
      facts: [fact(1, "Aria is a courier."), fact(2, "Aria guards the gate.")],
      proposals: [proposal(1, "rewrite", ["f1"], { text: "Aria is a royal courier." }), proposal(2, "pin", ["f2"])],
    };
    expect(L.applyQuiet(st, quiet, 9)).toBe(2);
    expect(st.facts[0]).toMatchObject({ text: "Aria is a royal courier.", updatedAt: 9 });
    // the wording is the worker's, not the user's: it may still be proposed to change
    expect(st.facts[0].edited).toBeUndefined();
    expect(st.facts[1].pinned).toBe(true);
    expect(st.proposals.map((p: any) => [p.status, p.auto])).toEqual([["accepted", true], ["accepted", true]]);
    const rows = st.activity.filter((a: any) => a.kind === "proposal.auto");
    expect(rows.map((a: any) => [a.by, a.data.op, a.ids])).toEqual([["worker", "rewrite", ["p1", "f1"]], ["worker", "pin", ["p2", "f2"]]]);
  });

  it("never retires or merges, and leaves what the user owns", () => {
    const st = {
      ...L.emptyChat("c"),
      facts: [fact(1, "a"), fact(2, "b"), fact(3, "mine", { edited: true }), fact(4, "pinned", { pinned: true }), fact(5, "c"), fact(6, "d"), fact(7, "e", { subject: "Bram" })],
      proposals: [
        proposal(1, "retire", ["f1"]),
        proposal(2, "merge", ["f1", "f2"], { text: "ab" }),
        proposal(3, "rewrite", ["f3"], { text: "theirs" }),
        proposal(4, "rewrite", ["f4"], { text: "theirs" }),
        proposal(5, "rewrite", ["f5"], { text: "c" }),
        // two pins fill Aria's limit of 2 (f4 is already pinned): the next one waits
        proposal(6, "pin", ["f5"]),
        proposal(7, "pin", ["f6"]),
        proposal(8, "pin", ["f7"]),
      ],
    };
    st.facts.push(fact(8, "x", { pinned: true }));
    const n = L.applyQuiet(st, quiet, 9);
    const by = Object.fromEntries(st.proposals.map((p: any) => [p.id, p.status]));
    expect(by).toMatchObject({ p1: "pending", p2: "pending", p3: "pending", p4: "pending", p5: "pending", p6: "pending", p7: "pending" });
    // only Bram's pin fits
    expect(by.p8).toBe("accepted");
    expect(n).toBe(1);
    expect(st.facts.find((f: any) => f.id === "f3").text).toBe("mine");
    expect(st.facts.find((f: any) => f.id === "f1").status).toBe("active");
  });

  it("undo takes a rewrite and a pin back, and refuses when the fact changed since", () => {
    writeChat("c", story(4));
    writeJson("litopys/chats/c.json", { ...L.emptyChat("c"), migrated: true, facts: [fact(1, "Aria is a courier."), fact(2, "Aria guards the gate."), fact(3, "Aria sleeps.")], proposals: [proposal(1, "rewrite", ["f1"], { text: "Aria is a royal courier." }), proposal(2, "pin", ["f2"]), proposal(3, "rewrite", ["f3"], { text: "Aria rests." })] });
    const { host } = mockHost();
    const st = L.loadChatFile(host.fs, "c");
    L.applyQuiet(st, quiet, 9);
    L.saveChatFile(host.fs, st);
    const undo = (id: string) => route(host, "POST", "/litopys/proposals", { chatId: "c", id, op: "undo" });

    const r1 = undo("p1");
    expect(r1.status).toBe(200);
    const after = readJson("litopys/chats/c.json");
    expect(after.facts[0].text).toBe("Aria is a courier.");
    expect(after.proposals[0]).toMatchObject({ status: "rejected", undone: true });
    expect(after.activity.some((a: any) => a.kind === "proposal.undo" && a.by === "user")).toBe(true);
    expect(undo("p1").status).toBe(409);

    expect(undo("p2").status).toBe(200);
    expect(readJson("litopys/chats/c.json").facts[1].pinned).toBe(false);

    // the user edited f3 after the rewrite: the undo must not overwrite that
    route(host, "POST", "/litopys/facts", { chatId: "c", op: "edit", id: "f3", text: "Aria dreams." });
    const r3 = undo("p3");
    expect(r3.status).toBe(409);
    expect(readJson("litopys/chats/c.json").facts[2].text).toBe("Aria dreams.");
    // an ordinary proposal has nothing to undo
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c", id: "nope", op: "undo" }).status).toBe(404);
  });

  for (const mode of ["ask", "quiet"]) {
    it(`a key fact from a chapter: proposals "${mode}" ${mode === "quiet" ? "pins it by itself" : "leaves the pin for the user"}`, () => {
      writeChat("w", story(30));
      writeJson("litopys/config.json", { arcMode: "off", proposals: mode, scene: { minMessages: 6, maxMessages: 10 } });
      tick(mockHost(), [chapterReply("Mill", "Aria found tracks by the mill.", [{ op: "add", text: "Aria swore never to leave the gate.", subject: "Aria", knownBy: "all", type: "trait", weight: "key" }])]);
      const st = readJson("litopys/chats/w.json");
      const key = st.facts.find((f: any) => f.text.startsWith("Aria swore"));
      expect(key).toBeDefined();
      const pin = st.proposals.find((p: any) => p.op === "pin");
      if (mode === "quiet") {
        expect(key.pinned).toBe(true);
        expect(pin).toMatchObject({ status: "accepted", auto: true });
        expect(st.activity.some((a: any) => a.kind === "proposal.auto")).toBe(true);
      } else {
        expect(key.pinned).toBe(false);
        expect(pin.status).toBe("pending");
        expect(st.activity.some((a: any) => a.kind === "proposal.auto")).toBe(false);
      }
    });
  }
});

describe("automatic Consolidate", () => {
  const seed = (chatId: string, count: number, record: Record<string, unknown> = {}) => {
    writeChat(chatId, story(30));
    writeJson(`litopys/chats/${chatId}.json`, {
      ...L.emptyChat(chatId),
      migrated: true,
      facts: Array.from({ length: count }, (_, i) => fact(i + 1, `Aria remembers detail number ${i + 1}.`, { subject: i % 3 ? "Aria" : "Bram" })),
      counters: { chapter: 0, fact: count, proposal: 0, arc: 0 },
      ...record,
    });
  };
  const cfgOf = (o: Record<string, unknown> = {}) => ({ ...L.DEFAULT_CONFIG, arcMode: "off", ...o });
  const facts = (n: number) => ({ ...L.emptyChat("t"), facts: Array.from({ length: n }, (_, i) => fact(i + 1, "x" + i)) });

  it("is off by default and on with quiet proposals, unless the setting says otherwise", () => {
    expect(L.autoConsolidateDue(facts(40), cfgOf())).toBe(false);
    expect(L.autoConsolidateDue(facts(40), cfgOf({ proposals: "quiet" }))).toBe(true);
    expect(L.autoConsolidateDue(facts(40), cfgOf({ proposals: "quiet", autoConsolidate: false }))).toBe(false);
    expect(L.autoConsolidateDue(facts(40), cfgOf({ proposals: "ask", autoConsolidate: true }))).toBe(true);
  });

  it("waits for 30 new active facts since the last run, and for the minimum", () => {
    const on = cfgOf({ autoConsolidate: true });
    expect(L.autoConsolidateDue(facts(29), on)).toBe(false);
    expect(L.autoConsolidateDue(facts(30), on)).toBe(true);
    expect(L.autoConsolidateDue({ ...facts(59), consolidateAt: { active: 30, at: 1 } }, on)).toBe(false);
    expect(L.autoConsolidateDue({ ...facts(60), consolidateAt: { active: 30, at: 1 } }, on)).toBe(true);
    // facts that are not active do not count
    const old = { ...facts(40), facts: facts(40).facts.map((f: any, i: number) => (i < 15 ? { ...f, status: "retired" } : f)) };
    expect(L.autoConsolidateDue(old, on)).toBe(false);
  });

  it("does not start while a run is working, a rebuild is going, or one of its own proposals is pending", () => {
    const on = cfgOf({ autoConsolidate: true });
    expect(L.autoConsolidateDue({ ...facts(40), consolidate: { state: "working" } }, on)).toBe(false);
    expect(L.autoConsolidateDue({ ...facts(40), rebuild: { chapters: [] } }, on)).toBe(false);
    expect(L.autoConsolidateDue({ ...facts(40), proposals: [proposal(1, "retire", ["f1"], { origin: "consolidate" })] }, on)).toBe(false);
    // a worker's proposal of another origin does not hold it back
    expect(L.autoConsolidateDue({ ...facts(40), proposals: [proposal(1, "rewrite", ["f1"], { text: "y" })] }, on)).toBe(true);
    expect(L.autoConsolidateDue({ ...facts(40), consolidate: { state: "failed", error: "x", at: 1 } }, on)).toBe(true);
  });

  it("a tick starts it, sends the batch, and the proposals follow the proposals mode (quiet: a rewrite lands, a retire waits)", () => {
    seed("a", 34);
    writeJson("litopys/config.json", { arcMode: "off", proposals: "quiet" });
    const m = mockHost();
    const { requests } = tick(m, [JSON.stringify({ ops: [{ op: "rewrite", id: "f1", text: "Bram remembers detail number 1, clearly.", reason: "clearer" }, { op: "retire", id: "f2", reason: "dup" }] })]);
    expect(requests.some((r) => r.key.startsWith("lit_cons_a_"))).toBe(true);
    const st = readJson("litopys/chats/a.json");
    expect(st.consolidateAt.active).toBe(34);
    expect(st.consolidate).toMatchObject({ state: "done", proposed: 2 });
    expect(st.facts.find((f: any) => f.id === "f1").text).toBe("Bram remembers detail number 1, clearly.");
    expect(st.proposals.find((p: any) => p.op === "rewrite")).toMatchObject({ status: "accepted", auto: true, origin: "consolidate" });
    expect(st.proposals.find((p: any) => p.op === "retire").status).toBe("pending");
    expect(st.facts.find((f: any) => f.id === "f2").status).toBe("active");
    expect(st.activity.find((a: any) => a.kind === "consolidate.ask")).toMatchObject({ by: "worker", data: { auto: true, facts: 34 } });
    // the next tick finds no 30 new facts and its own proposal still waiting: it does not start again
    const again = tick(mockHost(), []);
    expect(again.requests).toHaveLength(0);
  });

  it("in ask mode the same run leaves every proposal waiting", () => {
    seed("b", 34);
    writeJson("litopys/config.json", { arcMode: "off", proposals: "ask", autoConsolidate: true });
    tick(mockHost(), [JSON.stringify({ ops: [{ op: "rewrite", id: "f1", text: "Changed.", reason: "r" }] })]);
    const st = readJson("litopys/chats/b.json");
    expect(st.facts.find((f: any) => f.id === "f1").text).toBe("Aria remembers detail number 1.");
    expect(st.proposals).toMatchObject([{ op: "rewrite", status: "pending", origin: "consolidate" }]);
  });

  it("a manual Consolidate resets the count of new facts", () => {
    seed("c", 25);
    expect(L.consolidateRoute(mockHost().host.fs, { chatId: "c", op: "start" }).status).toBe(200);
    expect(readJson("litopys/chats/c.json").consolidateAt.active).toBe(25);
    expect(readJson("litopys/chats/c.json").activity.find((a: any) => a.kind === "consolidate.ask").by).toBe("user");
  });
});
