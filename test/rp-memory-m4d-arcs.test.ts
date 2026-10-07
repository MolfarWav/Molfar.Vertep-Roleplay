import { describe, expect, it } from "bun:test";
import { chapterReply, L, line, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

function seed(chatId: string, n = 140, per = 10) {
  const msgs = story(n);
  writeChat(chatId, msgs);
  const ln = line(msgs);
  const chapters = [];
  for (let i = 0; i * per + per <= n - 20; i++) {
    const a = i * per;
    const b = a + per - 1;
    chapters.push({ id: "c" + (i + 1), from: msgs[a].id, to: msgs[b].id, count: per, sig: L.chapterSig(ln.slice(a, b + 1)), label: "Part " + (i + 1), text: "Aria and You argued about the harvest and the mill, part " + (i + 1) + ", and the miller lost his key.", kind: "scene", at: i });
  }
  writeJson(`litopys/chats/${chatId}.json`, { v: 2, chatId, migrated: true, chapters, facts: [], proposals: [], scene: { openFrom: null }, counters: { chapter: chapters.length, fact: 0, proposal: 0 }, rev: 1 });
  return { msgs, ln, chapters };
}

function makeChatFile(chatId: string, chapters: any[], extra: Record<string, unknown> = {}) {
  writeJson(`litopys/chats/${chatId}.json`, {
    v: 2, chatId, migrated: true, chapters, facts: [], proposals: [], scene: { openFrom: null },
    counters: { chapter: chapters.length, fact: 0, proposal: 0, arc: 0 }, rev: 1, ...extra,
  });
  return L.loadChatFile(mockHost().host.fs, chatId);
}

describe("arcs config", () => {
  it("defaults and arcThresholdOf", () => {
    writeJson("litopys/config.json", {});
    const cfg = L.loadConfig(mockHost().host.fs);
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcKeep).toBe(4);
    expect(cfg.arcThreshold).toBe(0);
    expect(cfg.arcSizeMin).toBe(5);
    expect(cfg.arcSizeMax).toBe(8);
    expect(cfg.arcWords).toBe(150);
    expect(L.arcThresholdOf(cfg)).toBe(1600);
    expect(L.arcThresholdOf({ ...cfg, budget: 1000, arcThreshold: 0 })).toBe(2000);
    expect(L.arcThresholdOf({ ...cfg, arcThreshold: 900 })).toBe(900);
  });

  it("patchConfig clamps and survives a reload", () => {
    const m = mockHost();
    L.patchConfig(m.host.fs, { arcMode: "weird", arcKeep: 0, arcThreshold: -5, arcSizeMin: 9, arcSizeMax: 3, arcWords: 5 });
    let cfg = L.loadConfig(m.host.fs);
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcKeep).toBe(1);
    expect(cfg.arcThreshold).toBe(0);
    expect(cfg.arcSizeMin).toBe(9);
    expect(cfg.arcSizeMax).toBe(9);
    expect(cfg.arcWords).toBe(40);
    
    L.patchConfig(m.host.fs, { arcKeep: 99, arcThreshold: 50 });
    cfg = L.loadConfig(m.host.fs);
    expect(cfg.arcKeep).toBe(50);
    expect(cfg.arcThreshold).toBe(200);
    
    // survive a reload
    cfg = L.loadConfig(m.host.fs);
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcKeep).toBe(50);
    expect(cfg.arcThreshold).toBe(200);
    expect(cfg.arcSizeMin).toBe(9);
    expect(cfg.arcSizeMax).toBe(9);
    expect(cfg.arcWords).toBe(40);
  });

  it("custom arc prompt is stored and used; resetPrompts restores default", () => {
    const m = mockHost();
    const custom = "You merge these chapters:\\n- Custom arc instructions.";
    L.patchConfig(m.host.fs, { arc: custom });
    let cfg = L.loadConfig(m.host.fs);
    expect(cfg.arc).toBe(custom);
    const req = L.buildArcRequest({ chapters: [{ label: "a", text: "b" }] }, cfg, { model: "" });
    expect(req.systemPrompt).toContain(custom);
    expect(req.systemPrompt).toContain("at most " + cfg.arcWords + " words");
    expect(req.systemPrompt).toContain(L.ARC_SHAPE);
    expect(req.reasoning).toBeUndefined();
    expect(req.model).toBeUndefined();
    
    const req2 = L.buildArcRequest({ chapters: [{ label: "a", text: "b" }] }, { ...cfg, model: "test/model" }, { model: "meta/model" });
    expect(req2.model).toBe("test/model");
    
    L.resetPrompts(m.host.fs);
    cfg = L.loadConfig(m.host.fs);
    expect(cfg.arc).toBe(L.DEFAULT_PROMPTS.arc);
    expect(L.customPrompts(m.host.fs)).toEqual([]);
  });
});

describe("arcPlan", () => {
  it("below threshold: over false, run is oldest run", () => {
    const chapters = Array.from({ length: 8 }, (_, i) => ({ id: "c" + (i + 1), from: "m" + (i * 10 + 1), to: "m" + (i * 10 + 10), count: 10, sig: "sig" + (i + 1), label: "L" + (i + 1), text: "x".repeat(100), kind: "scene", at: i }));
    const st = { chapters, arcs: [], facts: [], proposals: [], scene: { openFrom: null }, counters: {} };
    const line = Array.from({ length: 100 }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "char" : "user", name: "n", text: "t" }));
    const cfg = { arcKeep: 4, arcThreshold: 200, arcSizeMin: 5, arcSizeMax: 8, arcWords: 150, budget: 800, recentMessages: 20 };
    const plan = L.arcPlan(st, line, cfg);
    expect(plan.over).toBe(false);
    // four older chapters are fewer than arcSizeMin
    expect(plan.run).toBeNull();
    expect(L.arcPlan(st, line, { ...cfg, arcKeep: 2 }).run.map((c: any) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
  });

  it("arcKeep: newest 4 never join; with keep 10 and 12 chapters, older=2, run null", () => {
    const chapters = Array.from({ length: 12 }, (_, i) => ({ id: "c" + (i + 1), from: "m" + (i * 10 + 1), to: "m" + (i * 10 + 10), count: 10, sig: "sig" + (i + 1), label: "L" + (i + 1), text: "x".repeat(100), kind: "scene", at: i }));
    const st = { chapters, arcs: [], facts: [], proposals: [], scene: { openFrom: null }, counters: {} };
    const line = Array.from({ length: 140 }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "char" : "user", name: "n", text: "t" }));
    const cfg = { arcKeep: 10, arcThreshold: 200, arcSizeMin: 5, arcSizeMax: 8, arcWords: 150, budget: 800, recentMessages: 20 };
    const plan = L.arcPlan(st, line, cfg);
    expect(plan.older).toBe(2);
    expect(plan.run).toBeNull();
  });

  it("a stale chapter stops the cut; an edited chapter joins a run", () => {
    const chapters = Array.from({ length: 12 }, (_, i) => ({ id: "c" + (i + 1), from: "m" + (i * 10 + 1), to: "m" + (i * 10 + 10), count: 10, sig: "sig" + (i + 1), label: "L" + (i + 1), text: "x".repeat(100), kind: "scene", at: i }));
    chapters[2].stale = true;
    const st = { chapters, arcs: [], facts: [], proposals: [], scene: { openFrom: null }, counters: {} };
    const line = Array.from({ length: 140 }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "char" : "user", name: "n", text: "t" }));
    const cfg = { arcKeep: 0, arcThreshold: 200, arcSizeMin: 5, arcSizeMax: 8, arcWords: 150, budget: 800, recentMessages: 20 };
    const plan = L.arcPlan(st, line, cfg);
    expect(plan.cut).toBe(20);
    expect(plan.run).toBeNull();

    chapters[2].stale = false;
    chapters[2].edited = true;
    expect(L.arcPlan(st, line, cfg).run.map((c: any) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  });

  it("held chapters never join; tokens count fresh arc once", () => {
    const chapters = Array.from({ length: 10 }, (_, i) => ({ id: "c" + (i + 1), from: "m" + (i * 10 + 1), to: "m" + (i * 10 + 10), count: 10, sig: "sig" + (i + 1), label: "L" + (i + 1), text: "x".repeat(100), kind: "scene", at: i }));
    const arcMembers = chapters.slice(0, 5);
    const arc = { id: "a1", chapterIds: arcMembers.map(c => c.id), from: "m1", to: "m50", label: "Arc", text: "arc text", sig: L.arcSig(arcMembers), at: 1 };
    const st = { chapters, arcs: [arc], facts: [], proposals: [], scene: { openFrom: null }, counters: { arc: 1 } };
    const line = Array.from({ length: 120 }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "char" : "user", name: "n", text: "t" }));
    const cfg = { arcKeep: 0, arcThreshold: 200, arcSizeMin: 3, arcSizeMax: 5, arcWords: 150, budget: 800, recentMessages: 20 };
    const plan = L.arcPlan(st, line, cfg);
    expect(plan.run?.map((c: any) => c.id)).toEqual(["c6", "c7", "c8", "c9", "c10"]);
    const chapterTokens = chapters.slice(5).reduce((n, c) => n + L.estimateTokens("- " + c.label + ": " + c.text), 0);
    expect(plan.tokens).toBe(L.estimateTokens("- Arc: arc text") + chapterTokens);
  });
});

describe("worker", () => {
  it("ask mode: no request without merge", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "ask" });
    seed("ch1");
    const m = mockHost();
    const { requests } = tick(m, []);
    expect(requests.length).toBe(0);
  });

  it("failure reply sets arcFail, adds activity, retries after retryAt", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    seed("ch2");
    const m = mockHost();
    tick(m, [{ error: "boom" }]);
    let st = readJson("litopys/chats/ch2.json");
    expect(st.arcFail.error).toBe("boom");
    expect(st.activity.some((a: any) => a.kind === "arc.fail")).toBe(true);
    expect(tick(m, []).requests.length).toBe(0);
    
    // set retryAt to past
    st = readJson("litopys/chats/ch2.json");
    st.arcFail.retryAt = Date.now() - 1000;
    writeJson("litopys/chats/ch2.json", st);
    const { requests } = tick(m, [JSON.stringify({ arc: { label: "x", text: "ok" } })]);
    expect(requests.length).toBe(1);
  });

  it("parseArcReply accepts flat, chapter, fenced; garbage null", () => {
    expect(L.parseArcReply('{"label":"x","text":"y"}')).toEqual({ label: "x", text: "y" });
    expect(L.parseArcReply('{"chapter":{"label":"x","text":"y"}}')).toEqual({ label: "x", text: "y" });
    expect(L.parseArcReply('```json\n{"arc":{"label":"x","text":"y"}}\n```')).toEqual({ label: "x", text: "y" });
    expect(L.parseArcReply("garbage")).toBeNull();
  });

  it("chapter work comes first", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    const { ln, chapters } = seed("ch3");
    const st = L.loadChatFile(mockHost().host.fs, "ch3");
    // make last chapter stale to create chapter work
    st.chapters[0].stale = true;
    writeJson("litopys/chats/ch3.json", st);
    const m = mockHost();
    const { requests } = tick(m, [chapterReply("ch", "text")]);
    expect(requests.length).toBe(1);
    expect(requests[0].key.startsWith("lit_")).toBe(true);
  });

  it("deleting member chapter makes arc stale and re-merges; deleting all but one drops arc", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    seed("ch4");
    const m = mockHost();
    tick(m, [JSON.stringify({ arc: { label: "x", text: "ok" } })]);
    let st = readJson("litopys/chats/ch4.json");
    expect(st.arcs[0].chapterIds.length).toBe(8);
    
    // delete one member
    L.chapterRoute(m.host.fs, { chatId: "ch4", op: "delete", id: "c3", keepGone: true });
    expect(L.chatView(m.host.fs, "ch4").arcs[0].stale).toBe(true);
    tick(m, [JSON.stringify({ arc: { label: "x", text: "ok2" } })]);
    st = readJson("litopys/chats/ch4.json");
    expect(st.arcs[0].chapterIds.length).toBe(7);
    
    // delete all but one
    const members = st.arcs[0].chapterIds;
    for (const id of members.slice(0, -1)) {
      L.chapterRoute(m.host.fs, { chatId: "ch4", op: "delete", id, keepGone: true });
    }
    tick(m, []);
    st = readJson("litopys/chats/ch4.json");
    expect(st.arcs.length).toBe(0);
    expect(st.activity.some((a: any) => a.kind === "arc.drop")).toBe(true);
  });

  it("rebuild: arcRoute 409, arcWork null, finishRebuild clears", () => {
    writeChat("ch5", story(100));
    const st = makeChatFile("ch5", Array.from({ length: 8 }, (_, i) => ({ id: "c" + (i + 1), from: "m" + (i * 10 + 1), to: "m" + (i * 10 + 10), count: 10, sig: "sig", label: "L", text: "t", kind: "scene", at: 0 })));
    st.rebuild = { startedAt: Date.now(), chapters: [], facts: [], proposals: [], carried: [], counters: { chapter: 0, fact: 0, proposal: 0 }, skipScenes: [] };
    writeJson("litopys/chats/ch5.json", st);
    const m = mockHost();
    expect(L.arcRoute(m.host.fs, { chatId: "ch5", op: "merge", from: "c1", to: "c8" }).status).toBe(409);
    const line = Array.from({ length: 100 }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "char" : "user", name: "n", text: "t" }));
    expect(L.arcWork(st, line, L.loadConfig(m.host.fs), Date.now())).toBeNull();
    
    st.arcs = [{ id: "a1", chapterIds: ["c1", "c2"], from: "m1", to: "m20", label: "a", text: "t", sig: "x", at: 1 }];
    st.arcAsk = { chapterIds: ["c1", "c2"], at: 1 };
    st.arcSnooze = { tokens: 100, at: 1 };
    writeJson("litopys/chats/ch5.json", st);
    L.finishRebuild(st, Date.now());
    expect(st.arcs).toEqual([]);
    expect(st.arcAsk).toBeUndefined();
    expect(st.arcSnooze).toBeUndefined();
  });
});

describe("routes", () => {
  it("merge refusals", () => {
    const cfg = { arcKeep: 4, arcThreshold: 200, arcSizeMin: 5, arcSizeMax: 8, arcWords: 150, budget: 800, recentMessages: 20 };
    writeJson("litopys/config.json", cfg);
    const { ln, chapters } = seed("ch6");
    const m = mockHost();
    
    // unknown chapter
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "cX", to: "c8" }).status).toBe(404);
    // one chapter
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c1", to: "c1" }).status).toBe(400);
    // after the cut (40 recent messages: the cut is at 100, c11-c12 are after it)
    L.patchConfig(m.host.fs, { recentMessages: 40 });
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c10", to: "c12" }).status).toBe(409);
    L.patchConfig(m.host.fs, { recentMessages: 20 });
    // already in arc
    L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c1", to: "c8" });
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c2", to: "c9" }).json.error).toBe("a merge is already waiting");
    tick(m, [JSON.stringify({ arc: { label: "x", text: "ok" } })]);
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c2", to: "c9" }).status).toBe(409);
    // off
    L.patchConfig(m.host.fs, { arcMode: "off" });
    expect(L.arcRoute(m.host.fs, { chatId: "ch6", op: "merge", from: "c9", to: "c12" }).status).toBe(409);
  });

  it("cancel snoozes; snooze sets tokens; offer returns after growth", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "ask" });
    seed("ch7");
    const m = mockHost();
    let view = L.chatView(m.host.fs, "ch7");
    const s = view.arcState.suggested;
    expect(s).toBeTruthy();
    
    // cancel a queued merge
    L.arcRoute(m.host.fs, { chatId: "ch7", op: "merge", from: s.fromChapter, to: s.toChapter });
    L.arcRoute(m.host.fs, { chatId: "ch7", op: "cancel" });
    expect(readJson("litopys/chats/ch7.json").arcAsk).toBeUndefined();
    view = L.chatView(m.host.fs, "ch7");
    expect(view.arcState.suggested).toBeNull();
    expect(view.arcState.snoozed).toBe(true);
    expect(readJson("litopys/chats/ch7.json").arcSnooze.tokens).toBe(L.arcPlan(L.loadChatFile(m.host.fs, "ch7"), line(story(140)), L.loadConfig(m.host.fs)).tokens);
    
    // the older part grows a little: still snoozed
    const st = readJson("litopys/chats/ch7.json");
    st.chapters[0].text += " A little more.";
    writeJson("litopys/chats/ch7.json", st);
    view = L.chatView(m.host.fs, "ch7");
    expect(view.arcState.snoozed).toBe(true);
    expect(view.arcState.suggested).toBeNull();
    // and by more than another threshold (200 tokens): offered again
    st.chapters[1].text += " growing".repeat(120);
    writeJson("litopys/chats/ch7.json", st);
    view = L.chatView(m.host.fs, "ch7");
    expect(view.arcState.suggested).toBeTruthy();
  });

  it("rewrite marks stale and next tick sends lita_<chatId>_a1_", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    seed("ch8");
    const m = mockHost();
    tick(m, [JSON.stringify({ arc: { label: "x", text: "ok" } })]);
    expect(readJson("litopys/chats/ch8.json").arcs[0].stale).toBeFalsy();
    
    L.arcRoute(m.host.fs, { chatId: "ch8", op: "rewrite", id: "a1" });
    expect(readJson("litopys/chats/ch8.json").arcs[0].stale).toBe(true);
    const { requests } = tick(m, [JSON.stringify({ arc: { label: "x", text: "ok2" } })]);
    expect(requests[0].key.startsWith("lita_ch8_a1_")).toBe(true);
  });
});

describe("buildInsert", () => {
  it("stale arc never inserted; chapters are", () => {
    const { ln, chapters } = seed("ch9");
    const st = L.loadChatFile(mockHost().host.fs, "ch9");
    st.arcs = [{ id: "a1", chapterIds: ["c1", "c2", "c3", "c4", "c5"], from: "m1", to: "m50", label: "Arc", text: "arc text", sig: L.arcSig(chapters.slice(0, 5)), at: 1, stale: true }];
    const cfg = { ...L.loadConfig(mockHost().host.fs), budget: 4000 };
    const ins = L.buildInsert({ st, line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "mill", speakerName: "Aria" });
    expect(ins.arcs).toBe(0);
    expect(ins.chapters).toBeGreaterThan(0);
    expect(ins.text).toContain("Part 1");
  });

  it("arc with members after cut is not inserted", () => {
    const { ln, chapters } = seed("ch10");
    const st = L.loadChatFile(mockHost().host.fs, "ch10");
    st.arcs = [{ id: "a1", chapterIds: ["c1", "c2", "c3", "c4", "c5"], from: "m1", to: "m50", label: "Arc", text: "arc text", sig: L.arcSig(chapters.slice(0, 5)), at: 1 }];
    // 100 recent messages: the cut is at 40, c5 (41-50) is still in the prompt
    const cfg = { ...L.loadConfig(mockHost().host.fs), budget: 4000, recentMessages: 100 };
    const ins = L.buildInsert({ st, line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "mill", speakerName: "Aria" });
    expect(ins.arcs).toBe(0);
  });
});
