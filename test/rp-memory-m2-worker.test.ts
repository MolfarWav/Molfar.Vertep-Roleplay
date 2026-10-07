import { describe, expect, it } from "bun:test";
import {
  L,
  useRoot,
  env,
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
  type Msg,
} from "./rp-memory-m2-kit";

useRoot();

const cfg = {
  recentMessages: 20,
  scene: { minMessages: 6, maxMessages: 40 },
};

function dashWith(snaps: Record<string, { place?: string; day?: number; time?: string; scene?: { new: boolean; label?: string }; present?: string[] }>) {
  return { snapshots: Object.fromEntries(Object.entries(snaps).map(([id, s]) => [id + "#0", { clock: { day: s.day ?? 1, time: s.time ?? null, place: s.place ?? null }, present: s.present ?? ["Aria"], ...(s.scene ? { scene: s.scene } : {}) }])) };
}

describe("findScenes", () => {
  it("starts a scene at a sensor boundary and labels it", () => {
    const msgs = story(20);
    const dash = dashWith({ m1: { place: "Hall", day: 1, time: "10:00", scene: { new: true, label: "Morning in Hall" } } });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m20", count: 20, kind: "scene", label: "Morning in Hall", place: "Hall", closed: false, open: true });
  });

  it("starts a scene at a place change, case-insensitive", () => {
    const msgs = story(20);
    const dash = dashWith({
      m1: { place: "Hall", day: 1, time: "10:00" },
      m10: { place: "GARDEN", day: 1, time: "11:00" },
    });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m9", count: 9, label: "Hall", place: "Hall", closed: true });
    expect(scenes[1]).toMatchObject({ from: "m10", to: "m20", count: 11, label: "GARDEN", place: "GARDEN", closed: false, open: true });
  });

  it("starts a scene at a clock jump of more than 6 hours but not exactly 6 hours", () => {
    const msgs = story(30);
    const dash = dashWith({
      m1: { place: "Hall", day: 1, time: "10:00" },
      m15: { place: "Hall", day: 1, time: "17:00" },
    });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m14" });
    expect(scenes[1]).toMatchObject({ from: "m15", to: "m30" });

    const dash2 = dashWith({
      m1: { place: "Hall", day: 1, time: "10:00" },
      m15: { place: "Hall", day: 1, time: "16:00" },
    });
    const scenes2 = L.findScenes(line(msgs), dash2, cfg);
    expect(scenes2).toHaveLength(1);
  });

  it("with no dashboard, boundaries every maxMessages", () => {
    const msgs = story(90);
    const scenes = L.findScenes(line(msgs), { snapshots: {} }, cfg);
    expect(scenes.map((s) => [s.from, s.to])).toEqual([["m1", "m40"], ["m41", "m80"], ["m81", "m90"]]);
  });

  it("merges a scene shorter than minMessages into the previous one", () => {
    const msgs = story(30);
    const dash = dashWith({
      m1: { place: "Hall", day: 1, time: "10:00" },
      m27: { place: "Garden", day: 1, time: "11:00" },
    });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m30", label: "Hall", place: "Garden" });
  });

  it("splits a scene longer than maxMessages into parts", () => {
    const msgs = story(100);
    // a dashboard that knows the chat but marks no boundary: one long scene
    const scenes = L.findScenes(line(msgs), { snapshots: { "m2#0": { clock: { day: 1, time: "10:00", place: "Hall" }, present: [] } } }, cfg);
    expect(scenes.map((s) => [s.from, s.to, s.kind])).toEqual([
      ["m1", "m34", "part"],
      ["m35", "m67", "part"],
      ["m68", "m100", "part"],
    ]);
    for (const s of scenes) expect(s.count).toBeLessThanOrEqual(40);
  });

  it("covers all messages with no gap or overlap", () => {
    const msgs = story(70);
    const dash = dashWith({
      m1: { place: "Hall", day: 1, time: "10:00" },
      m20: { place: "Garden", day: 1, time: "12:00" },
      m45: { place: "Tower", day: 1, time: "20:00" },
    });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    let idx = 0;
    for (const s of scenes) {
      expect(line(msgs)[s.fromIdx].id).toBe(s.from);
      expect(line(msgs)[s.toIdx].id).toBe(s.to);
      expect(s.fromIdx).toBe(idx);
      idx = s.toIdx + 1;
    }
    expect(idx).toBe(70);
  });

  it("a scene is closed once a later scene has begun, even inside the recent messages", () => {
    // 11 messages, recentMessages 20: the first scene is still closed (a live chat of the user's)
    const msgs = story(11);
    const dash = dashWith({
      m1: { place: "Glade", day: 1, time: "20:15" },
      m7: { place: "Cottage", day: 1, time: "20:50" },
    });
    const scenes = L.findScenes(line(msgs), { ...dash }, { ...cfg, scene: { minMessages: 4, maxMessages: 40 } });
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m6", closed: true, open: false });
    expect(scenes[1]).toMatchObject({ from: "m7", to: "m11", closed: false, open: true });
  });

  it("a later scene still shorter than minMessages keeps the earlier one open", () => {
    const msgs = story(12);
    const dash = dashWith({
      m1: { place: "Glade", day: 1, time: "20:15" },
      m10: { place: "Cottage", day: 1, time: "20:50" },
    });
    const scenes = L.findScenes(line(msgs), dash, { ...cfg, scene: { minMessages: 4, maxMessages: 40 } });
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ from: "m1", to: "m12", closed: false, open: true });
  });

  it("a short first scene (a greeting) joins the next one", () => {
    const msgs = story(20);
    const dash = dashWith({
      m1: { place: "Florin", day: 1, time: "10:00" },
      m3: { place: "Council hall", day: 1, time: "10:05" },
      m12: { place: "Garden", day: 1, time: "12:00" },
    });
    const scenes = L.findScenes(line(msgs), dash, cfg);
    expect(scenes.map((s) => [s.from, s.to])).toEqual([["m1", "m11"], ["m12", "m20"]]);
  });

  it("a reworded place is not a new scene; a different place is", () => {
    expect(L.samePlace("тракт на восток от ворот замка", "Восточный тракт от ворот замка")).toBe(true);
    expect(L.samePlace("Kitchen", "Kitchen, Alvrey's cottage")).toBe(true);
    expect(L.samePlace("the tavern", "THE TAVERN")).toBe(true);
    expect(L.samePlace("Alvrey's Secret Glade, Lumina Vale", "Alvrey's cottage")).toBe(false);
    expect(L.samePlace("двор", "покои")).toBe(false);
    const msgs = story(30);
    const dash = dashWith({
      m1: { place: "тракт на восток от ворот замка", day: 1, time: "10:00" },
      m15: { place: "Восточный тракт от ворот замка", day: 1, time: "10:30" },
    });
    expect(L.findScenes(line(msgs), dash, cfg)).toHaveLength(1);
  });

  it("hidden messages are not in the line", () => {
    const msgs = story(20);
    msgs[5].hidden = true;
    const scenes = L.findScenes(line(msgs), { snapshots: {} }, cfg);
    expect(line(msgs)).toHaveLength(19);
    expect(scenes[0]).toMatchObject({ count: 19 });
  });
});

describe("pickWork", () => {
  it("a chapter written before its scene grew is followed by one for the rest", () => {
    const msgs = story(20);
    const ln = line(msgs);
    const dash = dashWith({
      m1: { place: "Florin", day: 1, time: "10:00" },
      m3: { place: "Council hall", day: 1, time: "10:05" },
      m12: { place: "Garden", day: 1, time: "12:00" },
    });
    const st = L.emptyChat("c1");
    st.chapters.push({ id: "c1", from: "m1", to: "m2", count: 2, sig: L.chapterSig(ln.slice(0, 2)), label: "Florin", text: "x", kind: "scene", at: 1 });
    const work = L.pickWork(st, ln, dash, cfg);
    expect(work).toMatchObject({ replaces: null, scene: { from: "m3", to: "m11", fromIdx: 2, count: 9 } });
  });

  it("a scene its own chapter covers needs no work", () => {
    const msgs = story(20);
    const ln = line(msgs);
    const dash = dashWith({ m1: { place: "Hall", day: 1, time: "10:00" }, m12: { place: "Garden", day: 1, time: "12:00" } });
    const st = L.emptyChat("c1");
    st.chapters.push({ id: "c1", from: "m1", to: "m11", count: 11, sig: L.chapterSig(ln.slice(0, 11)), label: "Hall", text: "x", kind: "scene", at: 1 });
    expect(L.pickWork(st, ln, dash, cfg)).toBeNull();
  });
});

describe("worker through tick", () => {
  it("makes one call for a 70-message story and stores the chapter", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    const reply = chapterReply("The Mill", "Aria found tracks by the old mill. Bram promised to return at dusk.");
    const { requests } = tick(m, [reply]);
    expect(requests).toHaveLength(1);
    expect(requests[0].key).toBe("lit_c1_m1_m40");
    const req = requests[0].req;
    expect(req.reasoning).toBeUndefined();
    expect(req.presetParams.max_tokens).toBe(2000);
    expect(req.model).toBe("chat/model");
    expect(req.systemPrompt).toContain("in the language the story is written in");
    expect(req.systemPrompt).toContain("Output shape");
    expect(req.messages[0].content).toContain("Scene messages");
    expect(req.messages[0].content).toContain("[Aria]");
    expect(req.messages[0].content).toContain("[You]");

    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0]).toMatchObject({
      from: "m1",
      to: "m40",
      count: 40,
      kind: "scene",
      label: "The Mill",
      text: "Aria found tracks by the old mill. Bram promised to return at dusk.",
    });
    expect(st.chapters[0].sig).toBe(L.chapterSig(line(story(70)).slice(0, 40)));
    expect(st.worker.ok).toBe(true);
    expect(st.worker.lastScene).toEqual({ from: "m1", to: "m40" });
    expect(st.scene.openFrom).toBe("m41");
  });

  it("uses the config model when set", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/config.json", { model: "x/y" });
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    expect(m.requests[0].req.model).toBe("x/y");
  });

  it("cuts each message text to 1500 chars", () => {
    const msgs = story(70);
    msgs[0].text = "x".repeat(2000);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    const content = m.requests[0].req.messages[0].content;
    const lineForMsg = content.split("\n").find((l: string) => l.startsWith("[You]"));
    expect(lineForMsg).toContain("x".repeat(1500));
    expect(lineForMsg).not.toContain("x".repeat(1501));
  });

  it("does not call again when no other closed scene exists", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    const r2 = tick(m);
    expect(r2.requests).toHaveLength(0);
  });

  it("with 150 messages, each tick handles the oldest chapterless scene first", () => {
    writeChat("c1", story(150), { updatedAt: Date.now() });
    const m = mockHost();
    const r1 = tick(m, [chapterReply("S1", "Chapter one.")]);
    expect(r1.requests).toHaveLength(1);
    expect(r1.requests[0].key).toBe("lit_c1_m1_m40");
    const r2 = tick(m, [chapterReply("S2", "Chapter two.")]);
    expect(r2.requests).toHaveLength(1);
    expect(r2.requests[0].key).toBe("lit_c1_m41_m80");
    const r3 = tick(m, [chapterReply("S3", "Chapter three.")]);
    expect(r3.requests).toHaveLength(1);
    expect(r3.requests[0].key).toBe("lit_c1_m81_m120");
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters.map((c: any) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("with two chats, one call per tick, newer chat first", () => {
    writeChat("aaa", story(70), { updatedAt: Date.now() - 5000 });
    writeChat("bbb", story(70), { updatedAt: Date.now() - 1000 });
    const m = mockHost();
    const r1 = tick(m, [chapterReply("T", "X")]);
    expect(r1.requests).toHaveLength(1);
    expect(r1.requests[0].key).toContain("bbb");
    const r2 = tick(m, [chapterReply("T", "X")]);
    expect(r2.requests).toHaveLength(1);
    expect(r2.requests[0].key).toContain("aaa");
  });

  it("includes previous chapter text and filtered known facts", () => {
    const msgs = story(130);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("S1", "Chapter one.")]);
    tick(m, [chapterReply("S2", "Chapter two.")]);
    // First chapter stored, second call should include first chapter text
    const content = m.requests[1].req.messages[0].content;
    expect(content).toContain("Previous chapter");
    expect(content).toContain("Chapter one.");
  });

  it("known facts filtering by subject, knownBy, and world", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [
        { id: "f1", text: "Aria likes flowers.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 },
        { id: "f2", text: "The old mill is haunted.", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 },
        { id: "f3", text: "Bram knows a secret.", subject: "Bram", knownBy: ["Aria"], type: "event", weight: "everyday", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 },
        { id: "f4", text: "Cade has a plan.", subject: "Cade", knownBy: ["Cade"], type: "event", weight: "everyday", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 },
      ],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 4, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    const content = m.requests[0].req.messages[0].content;
    expect(content).toContain("Known facts");
    expect(content).toContain("f1: Aria likes flowers.");
    expect(content).toContain("f2: The old mill is haunted.");
    expect(content).toContain("f3: Bram knows a secret.");
    expect(content).not.toContain("f4: Cade has a plan.");
  });
});

describe("parseWorkerReply", () => {
  it("parses plain JSON", () => {
    const r = L.parseWorkerReply(chapterReply("L", "Text here."));
    expect(r).toEqual({ chapter: { label: "L", text: "Text here." }, facts: [] });
  });

  it("parses a fenced json reply with prose", () => {
    const r = L.parseWorkerReply('Here is the result:\n```json\n{"chapter":{"label":"L","text":"T"}}\n```\nHope that helps!');
    expect(r.chapter.label).toBe("L");
    expect(r.chapter.text).toBe("T");
  });

  it("parses chapter and facts, keeps chapter when cut inside facts", () => {
    const reply = '{"chapter":{"label":"L","text":"T"},"facts":[{"op":"add","text":"Fact one"},{"op":"add","text":"Fact tw';
    const r = L.parseWorkerReply(reply);
    expect(r).not.toBeNull();
    expect(r.chapter).toEqual({ label: "L", text: "T" });
    expect(r.facts[0]).toEqual({ op: "add", text: "Fact one" });
    // what is left of the cut-off op has no text, so applying it adds nothing
    expect(r.facts.slice(1).every((f: any) => !f.text)).toBe(true);
  });

  it("returns null when cut inside chapter text", () => {
    const r = L.parseWorkerReply('{"chapter":{"label":"L","text":"T');
    expect(r).toBeNull();
  });

  it("returns null when no chapter", () => {
    expect(L.parseWorkerReply('{"facts":[]}')).toBeNull();
    expect(L.parseWorkerReply("garbage")).toBeNull();
  });

  it("cuts label to 80 and text to 1500, at most 12 ops", () => {
    const label = "a".repeat(100);
    const text = "b".repeat(2000);
    const facts = Array.from({ length: 15 }, (_, i) => ({ op: "add", text: `Fact ${i}` }));
    const r = L.parseWorkerReply(JSON.stringify({ chapter: { label, text }, facts }));
    expect(r.chapter.label).toHaveLength(80);
    expect(r.chapter.text).toHaveLength(1500);
    expect(r.facts).toHaveLength(12);
  });
});

describe("applying worker results", () => {
  it("add stores a fact with defaults and key weight pins proposed", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    const reply = chapterReply("T", "X", [
      { op: "add", text: "A fact.", subject: "", knownBy: "all", type: "event", weight: "everyday" },
      { op: "add", text: "Key fact.", subject: "Aria", knownBy: "all", type: "invalid", weight: "key" },
    ]);
    tick(m, [reply]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(2);
    expect(st.facts[0]).toMatchObject({
      id: "f1",
      text: "A fact.",
      subject: "world",
      knownBy: "all",
      type: "event",
      weight: "everyday",
      status: "active",
      origin: "chapter",
      src: { from: "m1", to: "m40", chapter: "c1" },
    });
    expect(st.facts[1]).toMatchObject({ id: "f2", text: "Key fact.", type: "event", weight: "key", pinProposed: true, pinned: false });
  });

  it("skips near-duplicate adds for the same subject but not different subjects", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f0", text: "Aria found tracks by the old mill.", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 0, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [
      { op: "add", text: "Aria found tracks by the old mill.", subject: "Aria" },
      { op: "add", text: "Aria found tracks by the old mill.", subject: "Bram" },
    ])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(2); // f0 + new one for Bram
    expect(st.counters.fact).toBe(1);
  });

  it("caps adds at 8", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    const facts = Array.from({ length: 10 }, (_, i) => ({ op: "add", text: `Fact ${i}` }));
    tick(m, [chapterReply("T", "X", facts)]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(8);
  });

  it("update of ordinary fact creates a pending proposal and leaves text unchanged", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f1", text: "Old text.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "update", id: "f1", text: "New text." }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts[0].text).toBe("Old text.");
    expect(st.proposals).toHaveLength(1);
    expect(st.proposals[0]).toMatchObject({ op: "rewrite", targets: ["f1"], text: "New text.", status: "pending" });
  });

  it("does not duplicate an identical update proposal", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f1", text: "Old text.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [{ id: "p1", op: "rewrite", targets: ["f1"], text: "New text.", status: "pending", at: 1 }],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 1 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "update", id: "f1", text: "New text." }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.proposals).toHaveLength(1);
  });

  it("update with type change supersedes at once", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f1", text: "Lost an arm.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "update", id: "f1", text: "Lost both arms.", type: "change" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts[0].status).toBe("superseded");
    expect(st.facts[1]).toMatchObject({ id: "f2", text: "Lost both arms.", type: "change", supersedes: "f1", status: "active" });
  });

  it("update of a fact whose type is change also applies at once", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f1", text: "Lost an arm.", subject: "Aria", knownBy: "all", type: "change", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "update", id: "f1", text: "Lost both arms." }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts[0].status).toBe("superseded");
    expect(st.facts[1]).toMatchObject({ id: "f2", text: "Lost both arms.", type: "change", supersedes: "f1", status: "active" });
  });

  it("retire creates a pending retire proposal only", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts: [{ id: "f1", text: "Old fact.", subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }],
      proposals: [],
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 0 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "retire", id: "f1", reason: "Outdated." }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts[0].status).toBe("active");
    expect(st.proposals).toHaveLength(1);
    expect(st.proposals[0]).toMatchObject({ op: "retire", targets: ["f1"], reason: "Outdated.", status: "pending" });
  });

  it("ignores ops with unknown ids", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "update", id: "f999", text: "No." }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(0);
    expect(st.proposals).toHaveLength(0);
    expect(st.counters.fact).toBe(0);
  });

  it("caps proposals at 100", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const facts = Array.from({ length: 1 }, (_, i) => ({ id: `f${i + 1}`, text: `Fact ${i}`, subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }));
    const proposals = Array.from({ length: 100 }, (_, i) => ({ id: `p${i + 1}`, op: "retire", targets: [`f${(i % 1) + 1}`], status: i < 99 ? "pending" : "resolved", at: 1 }));
    writeJson("litopys/chats/c1.json", {
      v: 2,
      chatId: "c1",
      migrated: true,
      chapters: [],
      facts,
      proposals,
      scene: { openFrom: null },
      counters: { chapter: 0, fact: 1, proposal: 100 },
    });
    const m = mockHost();
    tick(m, [chapterReply("T", "X", [{ op: "retire", id: "f1", reason: "R" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.proposals.length).toBeLessThanOrEqual(100);
    expect(st.proposals).toHaveLength(100);
  });
});

describe("failure and retry", () => {
  it("records an error and waits about 10 minutes", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [{ error: "HTTP 500" }]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.worker.ok).toBe(false);
    expect(st.worker.error).toBe("HTTP 500");
    expect(typeof st.worker.retryAt).toBe("number");
    expect(st.worker.retryAt).toBeGreaterThan(Date.now() + 500000);
    expect(st.chapters).toHaveLength(0);
    expect(st.counters.chapter).toBe(0);
  });

  it("garbage text also records a failure", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, ["not json"]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.worker.ok).toBe(false);
    expect(st.worker.error).toContain("invalid");
  });

  it("does not retry before retryAt", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [{ error: "HTTP 500" }]);
    const r2 = tick(m);
    expect(r2.requests).toHaveLength(0);
  });

  it("retries after retryAt and clears error on success", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [{ error: "HTTP 500" }]);
    const st = readJson("litopys/chats/c1.json");
    st.worker.retryAt = Date.now() - 1000;
    writeJson("litopys/chats/c1.json", st);
    const r2 = tick(m, [chapterReply("T", "X")]);
    expect(r2.requests).toHaveLength(1);
    const st2 = readJson("litopys/chats/c1.json");
    expect(st2.worker.ok).toBe(true);
    expect(st2.worker.error).toBeUndefined();
    expect(st2.worker.retryAt).toBeUndefined();
    expect(st2.chapters).toHaveLength(1);
  });

  it("with another chat available, serves the other while retry pending", () => {
    writeChat("aaa", story(70), { updatedAt: Date.now() - 5000 });
    writeChat("bbb", story(70), { updatedAt: Date.now() - 1000 });
    const m = mockHost();
    tick(m, [{ error: "HTTP 500" }]); // bbb fails
    const r2 = tick(m, [chapterReply("T", "X")]);
    expect(r2.requests).toHaveLength(1);
    expect(r2.requests[0].key).toContain("aaa");
  });
});

describe("staleness", () => {
  it("editing a message marks chapter stale and rebuilds in place", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "Old text.")]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0].stale).toBeUndefined();

    msgs[5].text = "CHANGED TEXT about the old mill.";
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const r2 = tick(m, [chapterReply("T2", "New text.")]);
    expect(r2.requests).toHaveLength(1);
    const st2 = readJson("litopys/chats/c1.json");
    expect(st2.chapters).toHaveLength(1);
    expect(st2.chapters[0].id).toBe("c1");
    expect(st2.chapters[0].text).toBe("New text.");
    expect(st2.chapters[0].sig).toBe(L.chapterSig(line(msgs).slice(0, 40)));
    expect(st2.chapters[0].stale).toBeUndefined();
  });

  it("a stale chapter with edited: true is not rebuilt", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "Old text.")]);
    const st = readJson("litopys/chats/c1.json");
    st.chapters[0].edited = true;
    writeJson("litopys/chats/c1.json", st);
    msgs[5].text = "CHANGED";
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const r2 = tick(m);
    expect(r2.requests).toHaveLength(0);
    const st2 = readJson("litopys/chats/c1.json");
    expect(st2.chapters[0].stale).toBe(true);
  });

  it("a stale merged chapter is never rebuilt", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "Old text.")]);
    const st = readJson("litopys/chats/c1.json");
    st.chapters[0].kind = "merged";
    writeJson("litopys/chats/c1.json", st);
    msgs[5].text = "CHANGED";
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const r2 = tick(m);
    expect(r2.requests).toHaveLength(0);
    const st2 = readJson("litopys/chats/c1.json");
    expect(st2.chapters[0].stale).toBe(true);
  });

  it("deleting the message that ends a chapter rebuilds that chapter in place, not a second one", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "Old text.")]);
    writeChat("c1", msgs.filter((x) => x.id !== "m40"), { updatedAt: Date.now() });
    const r2 = tick(m, [chapterReply("T", "New text.")]);
    expect(r2.requests).toHaveLength(1);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0]).toMatchObject({ id: "c1", from: "m1", text: "New text." });
    expect(st.chapters[0].stale).toBeUndefined();
  });

  it("an edited chapter whose last message is gone stays as it is, stale, and is not duplicated", () => {
    const msgs = story(70);
    writeChat("c1", msgs, { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "My own text.")]);
    const st0 = readJson("litopys/chats/c1.json");
    st0.chapters[0].edited = true;
    writeJson("litopys/chats/c1.json", st0);
    writeChat("c1", msgs.filter((x) => x.id !== "m40"), { updatedAt: Date.now() });
    expect(tick(m).requests).toHaveLength(0);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0]).toMatchObject({ text: "My own text.", stale: true, edited: true });
  });

  it("a chapter whose scene has not changed is never stale", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    const m = mockHost();
    tick(m, [chapterReply("T", "Old text.")]);
    const r2 = tick(m);
    expect(r2.requests).toHaveLength(0);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters[0].stale).toBeUndefined();
  });
});

describe("switches", () => {
  it("enabled: false makes no call and writes nothing", () => {
    writeChat("c1", story(70), { updatedAt: Date.now() });
    writeJson("litopys/config.json", { enabled: false });
    const m = mockHost();
    const r = tick(m);
    expect(r.requests).toHaveLength(0);
    expect(exists("litopys/chats/c1.json")).toBe(false);
  });

  it("skips temporary chats, old chats, and chats without updatedAt", () => {
    writeChat("tmp", story(70), { updatedAt: Date.now(), temporary: true });
    writeChat("old", story(70), { updatedAt: Date.now() - 8 * 24 * 3600 * 1000 });
    writeChat("noupd", story(70), { updatedAt: undefined });
    const m = mockHost();
    const r = tick(m);
    expect(r.requests).toHaveLength(0);
  });

  it("has no llmRequest export", () => {
    expect(L.llmRequest).toBeUndefined();
  });
});
