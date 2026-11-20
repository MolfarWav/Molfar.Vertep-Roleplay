/**
 * Meanwhile reaches the story (#449, M2a): the events a pass kept are read by Litopys as facts, for one reply at a time. Held here:
 * who gets them (the people they happened to and those who saw them, never the player's character, nothing while Meanwhile is off),
 * that nothing is stored in the chat's record, that a swipe takes them away, and that the "who knows what" note does not tell a
 * narrator an event nobody in the scene knows.
 */
import { describe, expect, it } from "bun:test";
import { L, A, U, mockHost, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MW = (await import(new URL("../plugins/meanwhile/plugin.js", import.meta.url).href)) as Record<string, any>;

useRoot();
const CHAT = "c1";

const entities = [
  { id: "user", kind: "person", name: "Mira", aliases: [], src: "persona" },
  { id: "p1", kind: "person", name: "Ada", aliases: [], src: "card" },
  { id: "p2", kind: "person", name: "Bram", aliases: [], src: "world" },
  { id: "p3", kind: "person", name: "Cora", aliases: [], src: "card" },
  { id: "l1", kind: "place", name: "the chapel", aliases: [], src: "world" },
];
const ev = (id: string, more: Record<string, unknown> = {}) => ({
  id, who: ["p1"], what: "Ada hides the old ledger under the chapel floor.", where: "l1", whereName: "the chapel", when: "", witnesses: [], visibility: "secret", effects: [],
  afterKey: "m4#0", at: 5, status: "active", ...more,
});
const seed = (events: unknown[], enabled = true) => {
  writeJson("registry/" + CHAT + ".json", { chatId: CHAT, from: null, entities, apart: [], suggest: [] });
  writeJson("meanwhile/config.json", { v: 1, enabled });
  writeJson("meanwhile/state/" + CHAT + ".json", { v: 1, chatId: CHAT, cursor: "m4#0", next: 9, passes: [{ key: "m4#0", at: 1, reason: "scene", ids: [] }], events, log: [], usage: { input: 0, output: 0, cost: 0, runs: 0 }, lastFailAt: 0 });
};
const msgs: Msg[] = [U("m1"), A("m2"), U("m3"), A("m4")];
const mk = () => {
  writeChat(CHAT, msgs, { userName: "Mira" });
  const h = mockHost();
  return h.host;
};
const canon = (n: string) => n;

describe("the events as facts", () => {
  it("nothing while Meanwhile is off; the facts of the active events when it is on", () => {
    const host = mk();
    seed([ev("m1")], false);
    expect(L.meanwhileFacts(host.fs, CHAT, canon)).toEqual([]);
    seed([ev("m1"), ev("m2", { who: ["p2"], what: "Bram pays the Guild in grain at the harbour.", witnesses: ["p3"], visibility: "local" }), ev("m3", { status: "undone" })]);
    const f = L.meanwhileFacts(host.fs, CHAT, canon);
    expect(f.map((x: { id: string }) => x.id)).toEqual(["mw:m1", "mw:m2"]);
    expect(f[0]).toMatchObject({ knownBy: ["Ada"], subject: "Ada", secret: true, origin: "meanwhile", status: "active", type: "event" });
    expect(f[1]).toMatchObject({ knownBy: ["Bram", "Cora"] });
    expect(f[1].secret).toBeUndefined();
  });

  it("never names the player's character, even when the file lists them", () => {
    const host = mk();
    seed([ev("m1", { who: ["user", "p1"], witnesses: ["user"] }), ev("m2", { who: ["user"] })]);
    const f = L.meanwhileFacts(host.fs, CHAT, canon);
    expect(f).toHaveLength(1);
    expect(f[0].knownBy).toEqual(["Ada"]);
  });

  it("uses the canonical name, the same as the worker does, and keeps the newest 30", () => {
    const host = mk();
    seed(Array.from({ length: 35 }, (_, i) => ev("m" + (i + 1))));
    const f = L.meanwhileFacts(host.fs, CHAT, (n: string) => (n === "Ada" ? "Ada Vale" : n));
    expect(f).toHaveLength(30);
    expect(f[0].id).toBe("mw:m6");
    expect(f[0].knownBy).toEqual(["Ada Vale"]);
  });

  it("is the same fact as the plugin's own draft, so the two copies do not drift", () => {
    const host = mk();
    const e = ev("m1", { who: ["p1", "p2"], witnesses: ["p3"] });
    seed([e]);
    const draft = MW.factDraft(e, MW.registryIndex(entities));
    const fact = L.meanwhileFacts(host.fs, CHAT, canon)[0];
    expect(fact).toMatchObject({ text: draft.text, subject: draft.subject, knownBy: draft.knownBy, type: draft.type, weight: draft.weight, origin: draft.origin });
    expect(fact.secret === true).toBe(draft.secret);
  });

  it("lays them over the record without touching it, and without Meanwhile changes nothing", () => {
    const host = mk();
    seed([ev("m1")]);
    const st = L.emptyChat(CHAT);
    st.facts.push({ id: "f1", text: "The mill is old.", subject: "world", knownBy: "all", type: "world", weight: "everyday", pinned: false, status: "active", at: 1, updatedAt: 1 });
    const laid = L.withMeanwhile(st, host.fs, CHAT, { userName: "Mira" });
    expect(laid.facts.map((x: { id: string }) => x.id)).toEqual(["f1", "mw:m1"]);
    expect(st.facts).toHaveLength(1);
    seed([ev("m1")], false);
    expect(L.withMeanwhile(st, host.fs, CHAT, { userName: "Mira" })).toBe(st);
    expect(L.withMeanwhile(null, host.fs, CHAT, {})).toBeNull();
  });
});

describe("who gets it in a reply", () => {
  const record = (host: ReturnType<typeof mk>) => {
    const st = L.emptyChat(CHAT);
    return L.withMeanwhile(st, host.fs, CHAT, { userName: "Mira" });
  };
  const line = L.activeLine(msgs);
  const cfg = { ...L.DEFAULT_CONFIG, budget: 800 };
  const insert = (st: unknown, over: Record<string, unknown>) => L.buildInsert({ st, line, dash: null, meta: { userName: "Mira" }, cfg, scanText: "", speakerName: "", ...over });
  const text = (r: { head?: string; tail?: string } | null) => (r ? `${r.head ?? ""}\n${r.tail ?? ""}` : "");

  it("a reply spoken by the one it happened to has it; another character's reply does not", () => {
    const host = mk();
    seed([ev("m1")]);
    const st = record(host);
    expect(text(insert(st, { speakerName: "Ada", voices: new Set(["ada"]) }))).toContain("Ada hides the old ledger");
    expect(text(insert(st, { speakerName: "Cora", voices: new Set(["cora"]) }))).not.toContain("Ada hides");
  });

  it("a narrator's reply has it only when someone who knows is in the scene", () => {
    const host = mk();
    seed([ev("m1")]);
    const st = record(host);
    const dashWith = (present: string[]) => ({ v: 2, chatId: CHAT, snapshots: { "m4#0": { present, clock: {} } } });
    expect(text(insert(st, { dash: dashWith(["Cora"]) }))).not.toContain("Ada hides");
    expect(text(insert(st, { dash: dashWith(["Cora", "Ada"]) }))).toContain("Ada hides");
  });

  it("the player's own turn (the player's name as the voice) never gets it", () => {
    const host = mk();
    seed([ev("m1")]);
    expect(text(insert(record(host), { speakerName: "Mira", voices: new Set(["mira"]) }))).not.toContain("Ada hides");
  });

  it("the trace names its row, so What fired does not show it as gone", () => {
    const host = mk();
    seed([ev("m1")]);
    const r = insert(record(host), { speakerName: "Ada", voices: new Set(["ada"]) });
    expect(JSON.stringify(r.trace)).toContain("mw:m1");
  });
});

describe("the who-knows-what note", () => {
  const people = ["Ada", "Cora"];
  const note = (present: string[]) => {
    const host = mk();
    seed([ev("m1")]);
    const st = L.withMeanwhile(L.emptyChat(CHAT), host.fs, CHAT, { userName: "Mira" });
    const line = L.activeLine([U("m1", "x"), { id: "m2", role: "char", name: present[0]!, text: "a", swipe: 0 } as Msg, { id: "m3", role: "char", name: present[1] ?? present[0]!, text: "b", swipe: 0 } as Msg]);
    return L.castKnowledgeFor({ st, line, dash: null, meta: { userName: "Mira" }, speakerName: "" });
  };

  it("says who keeps it secret when the knower and others are together", () => {
    expect(note(people)?.text).toContain("Only Ada knows (keeps it secret): Ada hides the old ledger");
  });

  it("does not list an event nobody in the scene knows, so a narrator is not told it", () => {
    const n = note(["Cora", "Mira"]);
    expect(n?.text ?? "").not.toContain("Ada hides");
  });
});

describe("a swipe takes the event away from the story", () => {
  it("the Meanwhile state settles on a read, and the facts are gone", () => {
    const host = mk();
    seed([ev("m1")]);
    expect(L.meanwhileFacts(host.fs, CHAT, canon)).toHaveLength(1);
    // the reply the pass read is swiped: m4 now has swipe 1
    writeChat(CHAT, [U("m1"), A("m2"), U("m3"), { ...A("m4"), swipe: 1 }], { userName: "Mira" });
    const r = MW.handleRoute({ method: "GET", path: "/meanwhile/state", query: { chatId: CHAT } }, host);
    expect(r.json.events).toEqual([]);
    expect(L.meanwhileFacts(host.fs, CHAT, canon)).toEqual([]);
  });
});

describe("the whole reply hook", () => {
  const ctx = (speakerName: string) => ({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] }, turn: { op: "send", chatId: CHAT, speakerName } });
  const textOf = (res: { messages: { content: string }[] } | null) => (res ? res.messages.map((m) => m.content).join("\n") : "");

  it("a reply of the one it happened to carries the event; another's does not; the record on disk is untouched", () => {
    const host = mk();
    seed([ev("m1")]);
    expect(textOf(L.llmRequest(ctx("Ada"), host))).toContain("Ada hides the old ledger");
    expect(textOf(L.llmRequest(ctx("Cora"), host))).not.toContain("Ada hides");
    expect(host.fs.list("litopys")).not.toContain("chats");
  });

  it("with Meanwhile switched off the same reply has nothing of it", () => {
    const host = mk();
    seed([ev("m1")], false);
    expect(textOf(L.llmRequest(ctx("Ada"), host))).not.toContain("Ada hides");
  });
});

describe("an event follows a message of the line", () => {
  const ctxOp = (op: string, speakerName = "Ada") => ({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] }, turn: { op, chatId: CHAT, speakerName } });
  const textOf = (res: { messages: { content: string }[] } | null) => (res ? res.messages.map((m) => m.content).join("\n") : "");

  it("meanwhileFacts drops an event whose message is off the line, and one that follows the reply being replaced", () => {
    const host = mk();
    seed([ev("m1", { afterKey: "m4#0" }), ev("m2", { afterKey: "m2#0", what: "Ada writes a long letter to the guild." })]);
    expect(L.meanwhileFacts(host.fs, CHAT, canon).map((x: { id: string }) => x.id)).toEqual(["mw:m1", "mw:m2"]);
    expect(L.meanwhileFacts(host.fs, CHAT, canon, { keys: new Set(["m1#0", "m2#0", "m3#0", "m4#0"]) })).toHaveLength(2);
    expect(L.meanwhileFacts(host.fs, CHAT, canon, { keys: new Set(["m1#0", "m2#0", "m3#0"]) }).map((x: { id: string }) => x.id)).toEqual(["mw:m2"]);
    expect(L.meanwhileFacts(host.fs, CHAT, canon, { keys: new Set(["m1#0", "m2#0", "m3#0", "m4#0"]), replacing: "m4#0" }).map((x: { id: string }) => x.id)).toEqual(["mw:m2"]);
  });

  it("a regenerate of the reply the event follows does not carry it; a new reply and a regenerate of another do", () => {
    const host = mk();
    seed([ev("m1", { afterKey: "m4#0" })]);
    expect(textOf(L.llmRequest(ctxOp("swipe"), host))).not.toContain("Ada hides");
    expect(textOf(L.llmRequest(ctxOp("send"), host))).toContain("Ada hides");
    // the pass followed an earlier reply (m2): replacing m4 keeps it
    seed([ev("m1", { afterKey: "m2#0" })]);
    expect(textOf(L.llmRequest(ctxOp("swipe"), host))).toContain("Ada hides");
  });

  it("a deleted message takes its event out of the reply before the Meanwhile state settles", () => {
    const host = mk();
    seed([ev("m1", { afterKey: "m4#0" })]);
    writeChat(CHAT, [U("m1"), A("m2"), U("m3")], { userName: "Mira" });
    expect(textOf(L.llmRequest(ctxOp("send"), host))).not.toContain("Ada hides");
  });
});
