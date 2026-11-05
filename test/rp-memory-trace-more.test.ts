/**
 * The memory trace, second part (issue #184 P6): the worker's left-out fact ops with a reason, and the short ring of
 * the replies before the newest one, in Litopys and in the Data Bank.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";
import { bankFor } from "../src/lib/memory-trace";

useRoot();

const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };
const fact = (i: number, text: string, extra: Record<string, unknown> = {}) => ({
  id: "f" + i, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", at: i, updatedAt: i, ...extra,
});
const apply = (st: any, facts: unknown[], ctx: Record<string, unknown> = {}) =>
  L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts })), { now: 5, line: L.activeLine(story(10)), ...ctx });
const route = (host: any, path: string, query: Record<string, string> = {}) => L.handleRoute({ method: "GET", path, query }, host);

describe("memory trace: what the worker left out of its last scene", () => {
  it("names each reason: a near copy, only the card, no room, a gone fact, a proposal already waiting", () => {
    const st = L.emptyChat("c1");
    st.facts.push(fact(1, "The river thawed early this year."), fact(2, "Old Tam keeps the ferry."));
    st.counters.fact = 2;
    apply(
      st,
      [
        { op: "add", text: "The river thawed early this year.", subject: "world" },
        { op: "add", text: "Aria is a quiet courier from the north.", subject: "Aria" },
        { op: "update", id: "f77", text: "Nothing" },
        { op: "retire", id: "f2", reason: "Tam left" },
        { op: "retire", id: "f2", reason: "Tam left again" },
      ],
      { sources: ["Aria is a quiet courier from the north."] },
    );
    const sk = st.worker.skips;
    expect(sk.map((s: any) => s.why)).toEqual(["dup", "source", "gone", "same"]);
    expect(sk[0].text).toContain("river thawed");
    expect(sk[2].id).toBe("f77");
    expect(sk[3].id).toBe("f2");
    // the rest of the numbers still add up
    expect(st.worker.facts).toMatchObject({ got: 5, added: 0, skipped: 1 });
    expect(st.worker.chapter).toBe("c1");
  });

  it("a ninth fact in one scene is left out with the reason 'cap', with everything after it", () => {
    const st = L.emptyChat("c1");
    const ops = Array.from({ length: 11 }, (_, i) => ({ op: "add", text: "Distinct happening number " + (i + 1) + " by the lake of " + ["Oslo", "Riga", "Tver", "Brno", "Graz", "Pula", "Nice", "Metz", "Bari", "Lviv", "Kyiv"][i], subject: "world" }));
    apply(st, ops);
    expect(st.worker.facts.added).toBe(8);
    expect(st.worker.skips.map((s: any) => s.why)).toEqual(["cap", "cap", "cap"]);
  });

  it("keeps at most 12 left-out ops and nothing when none was left out", () => {
    const st = L.emptyChat("c1");
    apply(st, Array.from({ length: 30 }, (_, i) => ({ op: "update", id: "f" + (100 + i), text: "x" })));
    expect(st.worker.skips.length).toBe(12);
    const clean = L.emptyChat("c2");
    apply(clean, [{ op: "add", text: "A single new thing happened at the gate.", subject: "world" }]);
    expect(clean.worker.skips).toBeUndefined();
  });

  it("GET /litopys/trace hands the skips on, and nothing when there are none", () => {
    writeChat("tav", story(4), { title: "T", userName: "You" });
    const st = L.emptyChat("tav");
    st.migrated = true;
    st.facts.push(fact(1, "The river thawed early this year."));
    st.counters.fact = 1;
    apply(st, [{ op: "add", text: "The river thawed early this year.", subject: "world" }]);
    writeJson("litopys/chats/tav.json", st);
    const { host } = mockHost();
    // a reply with a trace has to exist: the route answers nothing without one
    L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }] }, turn: { op: "send", chatId: "tav", speakerName: "" } }, host);
    const w = route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json.worker;
    expect(w.skips).toEqual([{ why: "dup", text: "The river thawed early this year.", id: "" }]);
    expect(w.chapter).toBe("c1");
  });
});

describe("memory trace: the ring of earlier replies", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });
  const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
  const seed = () => {
    writeChat("tav", [U("m1", "Jude knocks."), U("m2", "Jude sits.")], { title: "T", userName: "Jude" });
    const st = L.emptyChat("tav");
    st.migrated = true;
    st.facts.push(fact(1, "The harbour is closed for the winter."));
    st.counters.fact = 1;
    writeJson("litopys/chats/tav.json", st);
  };
  const send = (op = "send") => L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }] }, turn: { op, chatId: "tav", speakerName: "" } }, mockHost().host);

  it("keeps the newest in the insert file and the four before it in the ring, newest first", () => {
    seed();
    let t = 1_000_000;
    Date.now = () => (t += 5000);
    for (let i = 0; i < 7; i++) send(i % 2 ? "next" : "send");
    const r = route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json;
    expect(r.replies.length).toBe(5);
    expect(r.replies.map((x: any) => x.at)).toEqual([...r.replies.map((x: any) => x.at)].sort((a: number, b: number) => b - a));
    expect(r.trace.at).toBe(r.replies[0].at);
    // the second newest is what the first look-back shows, and it differs from the newest
    const back1 = route(mockHost().host, "/litopys/trace", { chatId: "tav", back: "1" }).json;
    expect(back1.back).toBe(1);
    expect(back1.trace.at).toBe(r.replies[1].at);
    expect(back1.trace.op).toBe(r.replies[1].op);
    expect(back1.trace.op).not.toBe(r.trace.op);
    // a number past the ring falls back to the oldest it has
    expect(route(mockHost().host, "/litopys/trace", { chatId: "tav", back: "99" }).json.back).toBe(4);
    expect(readJson("litopys/trace-ring/tav.json").list.length).toBe(4);
  });

  it("a ring file stays small and a chat with a single reply has no ring", () => {
    seed();
    let t = 5_000_000;
    Date.now = () => (t += 5000);
    send();
    expect(route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json.replies.length).toBe(1);
    for (let i = 0; i < 9; i++) send();
    const size = JSON.stringify(readJson("litopys/trace-ring/tav.json")).length;
    expect(size).toBeLessThan(12_000);
  });
});

describe("memory trace: pairing a reply with the Data Bank's entry", () => {
  const e = (at: number, file: string) => ({ at, gen: "send", off: false, hits: [{ file, n: 1, score: 3, state: "in" as const }], scoped: [], scopedMore: 0 });
  const file = { ...e(5000, "c.txt"), prev: [e(4000, "b.txt"), e(3000, "a.txt")] };

  it("takes the entry a moment before the reply, not a later one and not a far one", () => {
    expect(bankFor(file, 5200, 0)?.hits[0].file).toBe("c.txt");
    expect(bankFor(file, 4300, 1)?.hits[0].file).toBe("b.txt");
    expect(bankFor(file, 3100, 2)?.hits[0].file).toBe("a.txt");
    expect(bankFor(file, 2000, 0)).toBeNull();
    expect(bankFor(file, 90_000, 0)).toBeNull();
  });
  it("with no Litopys reply it counts entries instead; no file, no entry", () => {
    expect(bankFor(file, null, 1)?.hits[0].file).toBe("b.txt");
    expect(bankFor(null, 5000, 0)).toBeNull();
  });
});
