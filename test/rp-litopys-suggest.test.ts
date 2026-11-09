import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, story, line, tick } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, body: any) => L.handleRoute({ method: "POST", path: "/litopys/scenes", body }, host);
const view = (host: any, chatId: string) => L.handleRoute({ method: "GET", path: "/litopys/chat", query: { chatId } }, host).json;
const scenesReply = (scenes: { from: number; to: number; title?: string; why?: string }[]) =>
  JSON.stringify({ scenes: scenes.map((s) => ({ title: "Scene " + s.from, why: "it turns", ...s })) });

function record(chatId: string, n: number, extra: Record<string, unknown> = {}) {
  writeChat(chatId, story(n), { updatedAt: Date.now() });
  writeJson(`litopys/chats/${chatId}.json`, {
    ...L.emptyChat(chatId),
    migrated: true,
    counters: { chapter: 0, fact: 0, proposal: 0, arc: 0, habit: 0 },
    ...extra,
  });
}
const chapter = (id: string, from: string, to: string, n: number, extra: Record<string, unknown> = {}) => ({
  id,
  from,
  to,
  count: n,
  sig: L.chapterSig(line(story(30)).slice(Number(from.slice(1)) - 1, Number(to.slice(1)))),
  label: "Chapter " + id,
  text: "Something happened.",
  kind: "scene",
  at: 1,
  ...extra,
});

describe("what a scene already holds", () => {
  it("counts hand marks and current chapters as taken, not a stale chapter", () => {
    const l = line(story(30));
    const st = {
      ...L.emptyChat("c1"),
      marks: [{ id: "s1", from: "m3", to: "m5" }],
      chapters: [chapter("c1", "m10", "m14", 5), chapter("c2", "m20", "m24", 5, { stale: true })],
    };
    expect([...L.takenIdx(st, l)].sort((a, b) => a - b)).toEqual([2, 3, 4, 9, 10, 11, 12, 13]);
    expect(L.freeRuns(st, l)).toEqual([
      { fromIdx: 0, toIdx: 1 },
      { fromIdx: 5, toIdx: 8 },
      { fromIdx: 14, toIdx: 29 },
    ]);
  });
});

describe("parseSuggestReply", () => {
  it("reads a fenced answer and keeps only ordered, non-overlapping scenes inside the range", () => {
    const text = "```json\n" + scenesReply([{ from: 5, to: 9 }, { from: 1, to: 4 }, { from: 8, to: 12 }, { from: 14, to: 14 }, { from: 40, to: 50 }, { from: 11, to: 15 }]) + "\n```";
    expect(L.parseSuggestReply(text, 1, 30).map((s: any) => [s.from, s.to])).toEqual([[1, 4], [5, 9], [11, 15]]);
  });
  it("answers null when there is no scenes list, and an empty list when the model finds none", () => {
    expect(L.parseSuggestReply("I think there are three scenes.", 1, 30)).toBeNull();
    expect(L.parseSuggestReply('{"foo":1}', 1, 30)).toBeNull();
    expect(L.parseSuggestReply('{"scenes":[]}', 1, 30)).toEqual([]);
  });
});

describe("Suggest scenes", () => {
  it("reads the messages in no scene, shows the model's scenes by message number, and saving makes them marks", () => {
    record("c1", 32);
    const m = mockHost();
    const started = route(m.host, { chatId: "c1", op: "suggest" });
    expect(started.status).toBe(200);
    expect(started.json.sceneSuggest).toMatchObject({ state: "working", free: 32, scenes: [] });
    const first = tick(m, [scenesReply([{ from: 1, to: 9, title: "The deck" }, { from: 10, to: 18, title: "The cocoon" }, { from: 19, to: 28, title: "The duel" }])]);
    expect(first.requests).toHaveLength(1);
    expect(first.requests[0].key).toMatch(/^lit_scn_c1_/);
    const prompt = first.requests[0].req.messages[0].content as string;
    expect(prompt).toContain("#1 [You]");
    expect(prompt).toContain("#32 [");
    tick(m);
    const v = view(m.host, "c1").sceneSuggest;
    expect(v.state).toBe("done");
    expect(v.scenes.map((s: any) => [s.fromNo, s.toNo, s.title])).toEqual([[1, 9, "The deck"], [10, 18, "The cocoon"], [19, 28, "The duel"]]);

    const saved = route(m.host, { chatId: "c1", op: "mark-many", ranges: v.scenes.slice(0, 2).map((s: any) => ({ from: s.from, to: s.to, title: s.title })) });
    expect(saved.status).toBe(200);
    expect(saved.json.marks).toEqual([{ id: "s1", fromNo: 1, toNo: 9, title: "The deck" }, { id: "s2", fromNo: 10, toNo: 18, title: "The cocoon" }]);
    // the suggestion is spent; the saved messages no longer count as free
    expect(saved.json.sceneSuggest).toMatchObject({ state: "idle", free: 14 });
  });

  it("asks again from where the last scene ended when a run is longer than one request", () => {
    // no scene boundary of its own, so no chapter work comes before the suggestion
    L.DEFAULT_CONFIG.scene.maxMessages = 200;
    record("c2", 90);
    const m = mockHost();
    route(m.host, { chatId: "c2", op: "suggest" });
    const a = tick(m, [scenesReply([{ from: 1, to: 15 }, { from: 16, to: 30 }, { from: 31, to: 36 }])]);
    expect((a.requests[0].req.messages[0].content as string).split("\n").filter((x) => x.startsWith("#")).length).toBe(L.SUGGEST_BATCH);
    // the second request starts at message 37, the one after the last scene
    const b = tick(m, [scenesReply([{ from: 37, to: 60 }, { from: 61, to: 70 }])]);
    const second = (b.requests[0].req.messages[0].content as string).split("\n").filter((x) => x.startsWith("#"));
    expect(second[0].startsWith("#37 ")).toBe(true);
    expect(second.at(-1)?.startsWith("#76 ")).toBe(true);
    L.DEFAULT_CONFIG.scene.maxMessages = 40;
  });

  it("leaves messages that a scene or a chapter holds out of what the model reads", () => {
    record("c3", 30, { marks: [{ id: "s1", from: "m1", to: "m10" }], chapters: [chapter("c0", "m1", "m10", 10, { marked: true }), chapter("c1", "m11", "m20", 10)], counters: { chapter: 2, fact: 0, proposal: 0, arc: 0, habit: 0 } });
    const m = mockHost();
    route(m.host, { chatId: "c3", op: "suggest" });
    const r = tick(m, [scenesReply([{ from: 21, to: 25 }])]);
    const lines = (r.requests[0].req.messages[0].content as string).split("\n").filter((x) => x.startsWith("#"));
    expect(lines).toHaveLength(10);
    expect(lines[0].startsWith("#21 ")).toBe(true);
  });

  it("refuses when every message is in a scene, and while one is running", () => {
    record("c4", 12, { marks: [{ id: "s1", from: "m1", to: "m12" }] });
    const m = mockHost();
    expect(route(m.host, { chatId: "c4", op: "suggest" }).status).toBe(409);
    record("c5", 12);
    expect(route(m.host, { chatId: "c5", op: "suggest" }).status).toBe(200);
    expect(route(m.host, { chatId: "c5", op: "suggest" }).status).toBe(409);
    expect(route(m.host, { chatId: "c5", op: "suggest-cancel" }).json.sceneSuggest.state).toBe("idle");
  });

  it("says so when the model's answer cannot be read, and the reader can clear it", () => {
    record("c6", 12);
    const m = mockHost();
    route(m.host, { chatId: "c6", op: "suggest" });
    tick(m, ["Sorry, I cannot do that."]);
    tick(m);
    const v = view(m.host, "c6").sceneSuggest;
    expect(v.state).toBe("failed");
    expect(v.error).toContain("invalid");
    expect(route(m.host, { chatId: "c6", op: "suggest-clear" }).json.sceneSuggest.state).toBe("idle");
  });

  it("drops a suggested scene that overlaps a scene saved by hand after the answer came", () => {
    record("c7", 20);
    const m = mockHost();
    route(m.host, { chatId: "c7", op: "suggest" });
    tick(m, [scenesReply([{ from: 1, to: 8 }, { from: 9, to: 16 }])]);
    tick(m);
    route(m.host, { chatId: "c7", op: "mark", from: "m5", to: "m8" });
    expect(view(m.host, "c7").sceneSuggest.scenes.map((s: any) => s.fromNo)).toEqual([9]);
  });
});

describe("mark-many", () => {
  it("saves all or none: an overlapping range refuses the lot", () => {
    record("c8", 30, { marks: [{ id: "s1", from: "m10", to: "m14" }] });
    const m = mockHost();
    const bad = route(m.host, { chatId: "c8", op: "mark-many", ranges: [{ from: "m1", to: "m5" }, { from: "m12", to: "m16" }] });
    expect(bad.status).toBe(409);
    expect(readJson("litopys/chats/c8.json").marks).toHaveLength(1);
    expect(route(m.host, { chatId: "c8", op: "mark-many", ranges: [{ from: "m1", to: "m5" }, { from: "m3", to: "m8" }] }).status).toBe(409);
    expect(route(m.host, { chatId: "c8", op: "mark-many", ranges: [] }).status).toBe(400);
  });

  it("makes the chapters over the saved scenes stale, and refuses over a chapter the reader edited", () => {
    record("c9", 30, { chapters: [chapter("c1", "m1", "m30", 30)], counters: { chapter: 1, fact: 0, proposal: 0, arc: 0, habit: 0 } });
    const m = mockHost();
    expect(route(m.host, { chatId: "c9", op: "mark-many", ranges: [{ from: "m1", to: "m9" }, { from: "m10", to: "m18" }] }).status).toBe(200);
    expect(readJson("litopys/chats/c9.json").chapters[0].stale).toBe(true);
    record("c10", 30, { chapters: [chapter("c1", "m1", "m30", 30, { edited: true })], counters: { chapter: 1, fact: 0, proposal: 0, arc: 0, habit: 0 } });
    expect(route(m.host, { chatId: "c10", op: "mark-many", ranges: [{ from: "m1", to: "m9" }] }).status).toBe(409);
  });
});
