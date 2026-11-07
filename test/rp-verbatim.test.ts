/**
 * #184 step 8 (#264): word-for-word passages of the earlier chats of the chat's chain. Off by default; found by rare shared
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
  it("is off by default: no part, no index, nothing written", () => {
    const m = setup({});
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
    expect(ids({}, "now").some((r) => r.id === "litopys verbatim")).toBe(false);
    expect(ids({ verbatim: true }, "first").some((r) => r.id === "litopys verbatim")).toBe(false);
    writeJson("chats/now.meta.json", { ...readJson("chats/now.meta.json"), promptBoard: { off: ["plugin:verbatim"] } });
    expect(ids({ verbatim: true }, "now").some((r) => r.id === "litopys verbatim")).toBe(false);
  });
});
