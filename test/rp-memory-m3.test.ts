import { describe, expect, it } from "bun:test";
import {
  L,
  useRoot,
  exists,
  readText,
  readJson,
  writeJson,
  U,
  A,
  story,
  writeChat,
  writeDash,
  line,
  mockHost,
  tick,
  chapterReply,
} from "./rp-memory-m2-kit";

useRoot();

const baseCfg = {
  enabled: true,
  insert: true,
  budget: 800,
  recentMessages: 20,
  scene: { minMessages: 6, maxMessages: 40 },
};

it("coveredCount / cutCount", () => {
  const msgs = story(12);
  const ln = line(msgs);
  const st = L.emptyChat("c1");

  expect(L.coveredCount(st, [])).toBe(0);
  expect(L.cutCount(st, [], { ...baseCfg, recentMessages: 4 })).toBe(0);

  st.chapters = [{ id: "c1", from: "m1", to: "m4", count: 4, kind: "scene", text: "x" }];
  expect(L.coveredCount(st, ln)).toBe(4);

  st.chapters = [{ id: "c1", from: "m1", to: "m12", count: 12, kind: "scene", text: "x" }];
  expect(L.coveredCount(st, ln)).toBe(12);

  st.chapters = [
    { id: "c1", from: "m1", to: "m3", count: 3, kind: "scene", text: "x" },
    { id: "c2", from: "m5", to: "m8", count: 4, kind: "scene", text: "x" },
  ];
  expect(L.coveredCount(st, ln)).toBe(3);

  st.chapters = [{ id: "c1", from: "m1", to: "m5", count: 5, kind: "scene", text: "x", stale: true }];
  expect(L.coveredCount(st, ln)).toBe(0);

  st.chapters = [
    { id: "c1", from: "gone", to: "gone", count: 1, kind: "scene", text: "x" },
    { id: "c2", from: "m1", to: "m3", count: 3, kind: "scene", text: "x" },
  ];
  expect(L.coveredCount(st, ln)).toBe(3);

  st.chapters = [{ id: "c1", from: "m1", to: "m6", count: 6, kind: "merged", text: "x" }];
  expect(L.coveredCount(st, ln)).toBe(6);

  st.chapters = [{ id: "c1", from: "m1", to: "m12", count: 12, kind: "scene", text: "x" }];
  expect(L.cutCount(st, ln, { ...baseCfg, recentMessages: 4 })).toBe(8);
  expect(L.cutCount(st, ln, { ...baseCfg, recentMessages: 20 })).toBe(0);
});

it("buildInsert fill order, knownBy, budget and layout", () => {
  const msgs = story(12);
  const ln = line(msgs);
  const dash = {
    snapshots: {
      "m12#0": { present: ["Aria"], clock: { day: 1, time: null, place: null } },
    },
  };
  const cfg = { ...baseCfg, recentMessages: 4 };
  const meta = { userName: "You" };

  const emptySt = L.emptyChat("c1");
  expect(L.buildInsert({ st: emptySt, line: ln, dash, meta, cfg, scanText: "" })).toBeNull();

  const st = L.emptyChat("c1");
  st.chapters = [
    { id: "c1", from: "m1", to: "m4", count: 4, kind: "scene", text: "Aria entered the mill.", label: "The mill" },
    { id: "c2", from: "m5", to: "m8", count: 4, kind: "scene", text: "Bram waited outside.", label: "Outside" },
    { id: "c3", from: "m9", to: "m12", count: 4, kind: "scene", text: "The wheel broke.", label: "Wheel" },
  ];
  st.facts = [
    { id: "f1", text: "Aria carries a silver pin.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: true, status: "active" },
    { id: "f2", text: "Aria scarred her hand.", subject: "Aria", knownBy: "all", type: "change", weight: "important", pinned: false, status: "active" },
    { id: "f3", text: "The mill wheel turns slowly.", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active" },
    { id: "f4", text: "Bram owes a debt to a duke.", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active" },
    { id: "f5", text: "Bram knows a secret.", subject: "world", knownBy: ["Bram"], type: "event", weight: "everyday", pinned: false, status: "active" },
    { id: "f6", text: "The mill wheel broke.", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { chapter: "c3" } },
    { id: "f7", text: "Aria saw the mill.", subject: "world", knownBy: ["Aria"], type: "event", weight: "everyday", pinned: false, status: "active" },
  ];

  const scanText = "mill wheel turns";
  const ins = L.buildInsert({ st, line: ln, dash, meta, cfg, scanText, speakerName: "Aria" });
  expect(ins).not.toBeNull();
  expect(ins.text).toContain("Aria carries a silver pin.");
  expect(ins.text).toContain("Aria scarred her hand.");
  expect(ins.text).toContain("The mill wheel turns slowly.");
  expect(ins.text).toContain("Bram waited outside.");
  expect(ins.text).toContain("Aria entered the mill.");
  expect(ins.text).not.toContain("The mill wheel broke.");
  expect(ins.text).not.toContain("Bram knows a secret.");

  const f1Idx = ins.text.indexOf("Aria carries a silver pin.");
  const f2Idx = ins.text.indexOf("Aria scarred her hand.");
  const f3Idx = ins.text.indexOf("The mill wheel turns slowly.");
  const f7Idx = ins.text.indexOf("Aria saw the mill.");
  const f4Idx = ins.text.indexOf("Bram owes a debt to a duke.");
  expect(f1Idx).toBeLessThan(f2Idx);
  expect(f2Idx).toBeLessThan(f3Idx);
  expect(f3Idx).toBeLessThan(f7Idx);
  expect(f7Idx).toBeLessThan(f4Idx);

  const earlierIdx = ins.text.indexOf("Earlier chapters:");
  const factsIdx = ins.text.indexOf("Facts:");
  expect(earlierIdx).not.toBe(-1);
  expect(factsIdx).not.toBe(-1);
  expect(earlierIdx).toBeLessThan(factsIdx);

  const c1Idx = ins.text.indexOf("Aria entered the mill.");
  const c2Idx = ins.text.indexOf("Bram waited outside.");
  expect(c1Idx).toBeLessThan(c2Idx);

  expect(ins.text).toContain("(known to: Aria)");
  expect(ins.text).not.toContain("(known to: all)");

  const withBram = L.buildInsert({ st, line: ln, dash, meta, cfg, scanText, speakerName: "Bram" });
  expect(withBram.text).toContain("Bram knows a secret.");

  const small = L.emptyChat("c2");
  small.chapters = [{ id: "c1", from: "m1", to: "m4", count: 4, kind: "scene", text: "Aria entered.", label: "Entry" }];
  small.facts = [{ id: "f1", text: "x".repeat(500), subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active" }];
  const smallIns = L.buildInsert({ st: small, line: line(story(8)), dash: { snapshots: {} }, meta, cfg: { ...cfg, budget: 200 }, scanText: "" });
  expect(smallIns).not.toBeNull();
  expect(smallIns.tokens).toBeLessThanOrEqual(200);
  expect(smallIns.text).not.toContain("x".repeat(500));
});

it("llmRequest insert placement and sidecar", () => {
  writeChat("c1", story(30), { updatedAt: Date.now() });
  writeJson("litopys/chats/c1.json", {
    v: 2,
    chatId: "c1",
    migrated: true,
    chapters: [{ id: "c1", from: "m1", to: "m10", count: 10, kind: "scene", text: "Aria found the mill.", label: "The mill", at: 1 }],
    facts: [],
    proposals: [],
    scene: { openFrom: null },
    counters: { chapter: 1, fact: 0, proposal: 0 },
  });

  const ctx = {
    key: "reply",
    request: { messages: [{ role: "system", content: "sys1" }, { role: "system", content: "sys2" }, { role: "user", content: "hello" }] },
    turn: { op: "send", chatId: "c1", speakerName: "Aria" },
  };

  expect(L.llmRequest({ ...ctx, key: "summary" }, mockHost().host)).toBeNull();
  expect(L.llmRequest({ ...ctx, turn: { ...ctx.turn, op: "impersonate" } }, mockHost().host)).toBeNull();

  writeJson("litopys/config.json", { insert: false });
  expect(L.llmRequest(ctx, mockHost().host)).toBeNull();

  writeJson("litopys/config.json", {});
  const m = mockHost();
  const before = readText("litopys/chats/c1.json");
  const res = L.llmRequest(ctx, m.host);
  expect(res).not.toBeNull();
  expect(res.messages).toHaveLength(4);
  expect(res.messages[0]).toMatchObject({ role: "system", content: "sys1" });
  expect(res.messages[1]).toMatchObject({ role: "system", content: "sys2" });
  expect(res.messages[2].role).toBe("system");
  expect(res.messages[2].content.startsWith("[Story record (Litopys)")).toBe(true);
  expect(res.messages[3]).toMatchObject({ role: "user", content: "hello" });

  expect(exists("litopys/insert/c1.json")).toBe(true);
  const insert = readJson("litopys/insert/c1.json");
  expect(insert.tokens).toBeGreaterThan(0);
  expect(typeof insert.chapters).toBe("number");
  expect(typeof insert.facts).toBe("number");
  expect(readText("litopys/chats/c1.json")).toBe(before);
});

it("sweepMigrate through tick imports the old vault and deletes it", () => {
  writeChat("old", story(10), { updatedAt: undefined });
  writeJson("chats/old.memories.json", [
    { text: "The mill is old" },
    { text: "Bram knows the mill", pinned: true },
    { text: "The mill is old" },
  ]);
  const metaBefore = readText("chats/old.meta.json");
  const m = mockHost();
  const r = tick(m);
  expect(r.requests).toHaveLength(0);
  expect(exists("litopys/chats/old.json")).toBe(true);
  expect(exists("chats/old.memories.json")).toBe(false);

  const st = readJson("litopys/chats/old.json");
  const facts = st.facts.filter((f: any) => f.status === "active");
  expect(facts).toHaveLength(2);
  expect(facts.every((f: any) => f.origin === "migrated")).toBe(true);
  expect(facts.some((f: any) => f.text === "The mill is old" && f.weight === "everyday")).toBe(true);
  expect(facts.some((f: any) => f.text === "Bram knows the mill" && f.weight === "important" && f.pinned === true)).toBe(true);

  expect(readText("chats/old.meta.json")).toBe(metaBefore);
});

it("fixMigratedWeights downgrades unedited important migrated facts once", () => {
  const st = L.emptyChat("c1");
  st.facts = [
    { id: "f1", origin: "migrated", weight: "important", pinned: false, at: 100, updatedAt: 100 },
    { id: "f2", origin: "migrated", weight: "important", pinned: false, at: 100, updatedAt: 200 },
    { id: "f3", origin: "migrated", weight: "important", pinned: true, at: 100, updatedAt: 100 },
    { id: "f4", origin: "chapter", weight: "important", at: 100, updatedAt: 100 },
  ];
  expect(L.fixMigratedWeights(st)).toBe(true);
  expect(st.facts[0].weight).toBe("everyday");
  expect(st.facts[1].weight).toBe("important");
  expect(st.facts[2].weight).toBe("important");
  expect(st.facts[3].weight).toBe("important");
  expect(st.v2fix).toBe(true);
  expect(L.fixMigratedWeights(st)).toBe(false);
});

it("repeatsSource skips card and lorebook sentences and counts them", () => {
  writeChat("c1", story(70), { characterId: "aria", lorebookIds: ["worldbook"], updatedAt: Date.now() });
  writeJson("characters/aria/card.json", {
    name: "Aria",
    description: "Aria is a travelling scribe who keeps a silver pen.",
    personality: "Curious",
    scenario: "At the mill",
    first_mes: "Hello.",
  });
  writeJson("lorebooks/worldbook.json", {
    id: "worldbook",
    name: "World",
    entries: [
      { content: "The old mill stands on the river bend.", enabled: true },
      { content: "Disabled text that should not be used.", enabled: false },
    ],
  });

  const host = mockHost().host;
  const sentences = L.sourceSentences(host.fs, { characterId: "aria", lorebookIds: ["worldbook"] });
  expect(sentences).toContain("Aria is a travelling scribe who keeps a silver pen.");
  expect(sentences).toContain("The old mill stands on the river bend.");
  expect(sentences).not.toContain("Disabled text that should not be used.");

  const m = mockHost();
  tick(m, [
    chapterReply("The Mill", "Aria found tracks by the old mill.", [
      { op: "add", text: "Aria is a travelling scribe who keeps a silver pen.", subject: "Aria" },
      { op: "add", text: "The old mill stands on the river bend.", subject: "world" },
      { op: "add", text: "Aria speaks three languages fluently.", subject: "Aria" },
    ]),
  ]);

  const st = readJson("litopys/chats/c1.json");
  expect(st.facts).toHaveLength(1);
  expect(st.facts[0].text).toBe("Aria speaks three languages fluently.");
  expect(st.worker.facts).toMatchObject({ got: 3, added: 1, skipped: 2 });
});

function writeDashWithNotes(
  chatId: string,
  turns: Record<string, number>,
  notebook: Record<string, any[]>,
) {
  const snapshots: Record<string, any> = {};
  for (const [msgId, turn] of Object.entries(turns)) {
    snapshots[`${msgId}#0`] = { clock: { day: 1, time: null, place: null }, present: ["Aria"], turn };
  }
  writeJson(`dashboard/state/${chatId}.json`, { v: 2, chatId, snapshots, notebook });
}

it("moveNotes turns aged important dashboard notes into facts", () => {
  writeChat("c1", story(5), { updatedAt: Date.now() });
  writeDashWithNotes("c1", { m5: 50 }, {
    Aria: [
      { id: "n1", text: "Aria distrusts Bram.", src: "m1#0", turn: 10, weight: "important" },
      { id: "n2", text: "The sky is blue.", src: "m1#0", turn: 10, weight: "everyday" },
      { id: "n3", text: "Aria noted a locked door.", src: "m1#0", turn: 45, weight: "important" },
    ],
  });
  tick(mockHost());
  const st1 = readJson("litopys/chats/c1.json");
  expect(st1.facts).toHaveLength(1);
  expect(st1.facts[0]).toMatchObject({
    text: "Aria distrusts Bram.",
    subject: "You",
    knownBy: ["Aria"],
    type: "relation",
    weight: "important",
    origin: "dashboard",
    src: { from: null, to: null },
  });
  expect(st1.fromNotes).toContain("n1");

  tick(mockHost());
  const st1b = readJson("litopys/chats/c1.json");
  expect(st1b.facts).toHaveLength(1);

  writeChat("c2", story(5), { updatedAt: Date.now() });
  writeDashWithNotes("c2", { m5: 50 }, {
    Aria: [{ id: "n1", text: "Aria distrusts Bram.", src: "m1#0", turn: 10, weight: "important" }],
  });
  writeJson("dashboard/notes/c2.json", { edits: { n1: { retired: true } } });
  tick(mockHost());
  const st2 = readJson("litopys/chats/c2.json");
  expect(st2.facts).toHaveLength(0);

  writeChat("c3", story(5), { updatedAt: Date.now() });
  writeDashWithNotes("c3", { m5: 50 }, {
    Aria: [{ id: "n1", text: "Aria distrusts Bram.", src: "m1#0", turn: 30, weight: "important" }],
  });
  writeJson("dashboard/config.json", { noteAgeTurns: 15 });
  tick(mockHost());
  const st3 = readJson("litopys/chats/c3.json");
  expect(st3.facts).toHaveLength(1);
  expect(st3.facts[0].text).toBe("Aria distrusts Bram.");
});

it("rebuild drops chapters and chapter/migrated facts, keeps user and dashboard facts", () => {
  writeChat("c1", story(70), { updatedAt: Date.now() });
  writeJson("litopys/chats/c1.json", {
    v: 2,
    chatId: "c1",
    migrated: true,
    chapters: [{ id: "c1", from: "m1", to: "m40", count: 40, kind: "scene", text: "Old chapter.", label: "Old", at: 1 }],
    facts: [
      { id: "f1", text: "Chapter fact.", origin: "chapter", status: "active", subject: "world", knownBy: "all", type: "event", weight: "everyday" },
      { id: "f2", text: "Migrated fact.", origin: "migrated", status: "active", subject: "world", knownBy: "all", type: "event", weight: "everyday" },
      { id: "f3", text: "User fact.", origin: "user", status: "active", subject: "world", knownBy: "all", type: "event", weight: "important" },
      { id: "f4", text: "Dashboard fact.", origin: "dashboard", status: "active", subject: "You", knownBy: ["Aria"], type: "relation", weight: "important" },
    ],
    proposals: [{ id: "p1", op: "rewrite", targets: ["f1"], status: "pending" }],
    fromNotes: ["n1"],
    worker: { ok: true, lastRunAt: 1 },
    cut: { count: 20, upTo: "m20", at: 1 },
    counters: { chapter: 1, fact: 4, proposal: 1 },
  });
  writeJson("litopys/insert/c1.json", { at: 1, tokens: 100, facts: 1, chapters: 1, cut: 20 });

  const missing = L.handleRoute({ method: "POST", path: "/litopys/rebuild", body: { chatId: "missing" } }, mockHost().host);
  expect(missing).toEqual({ status: 404, json: { error: "chat not found" } });

  const res = L.handleRoute({ method: "POST", path: "/litopys/rebuild", body: { chatId: "c1" } }, mockHost().host);
  expect(res.status).toBe(200);
  expect(res.json).toEqual({ scenes: 1 });

  const st = readJson("litopys/chats/c1.json");
  expect(st.chapters).toHaveLength(0);
  expect(st.proposals).toHaveLength(0);
  expect(st.facts).toHaveLength(2);
  expect(st.facts.map((f: any) => f.text).sort()).toEqual(["Dashboard fact.", "User fact."]);
  expect(st.fromNotes).toEqual(["n1"]);
  expect(st.worker).toBeUndefined();
  expect(st.cut).toBeUndefined();
  expect(exists("litopys/insert/c1.json")).toBe(false);
});

it("chatView includes cut, lastInsert, rebuildScenes and worker.facts", () => {
  writeChat("c1", story(30), { updatedAt: Date.now() });
  writeJson("litopys/chats/c1.json", {
    v: 2,
    chatId: "c1",
    migrated: true,
    chapters: [{ id: "c1", from: "m1", to: "m10", count: 10, kind: "scene", text: "Aria found the mill.", label: "The mill", at: 1 }],
    facts: [],
    proposals: [],
    scene: { openFrom: null },
    worker: { ok: true, lastRunAt: 1, facts: { got: 5, added: 3, skipped: 2 } },
    counters: { chapter: 1, fact: 0, proposal: 0 },
  });

  const host = mockHost().host;
  L.llmRequest(
    {
      key: "reply",
      request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] },
      turn: { op: "send", chatId: "c1", speakerName: "Aria" },
    },
    host,
  );

  const view = L.chatView(host.fs, "c1");
  expect(view.cut).toEqual({ count: 10, upTo: "m10" });
  expect(view.lastInsert).not.toBeNull();
  expect(view.lastInsert.tokens).toBeGreaterThan(0);
  expect(view.lastInsert.chapters).toBeGreaterThanOrEqual(1);
  expect(view.rebuildScenes).toBe(0);
  expect(view.worker).toMatchObject({ ok: true, facts: { got: 5, added: 3, skipped: 2 } });
});
