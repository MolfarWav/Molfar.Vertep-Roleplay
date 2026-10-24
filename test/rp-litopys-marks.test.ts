import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, story, line, chapterReply, tick } from "./rp-memory-m2-kit";

useRoot();

const cfg = { recentMessages: 20, scene: { minMessages: 6, maxMessages: 40 } };
const route = (host: any, body: any) => L.handleRoute({ method: "POST", path: "/litopys/scenes", body }, host);

describe("findScenes with marks", () => {
  it("keeps a short marked scene on its own and closes it", () => {
    const scenes = L.findScenes(line(story(30)), { snapshots: {} }, cfg, [{ id: "s1", from: "m10", to: "m13" }]);
    expect(scenes.map((s: any) => [s.from, s.to, s.marked, s.closed])).toEqual([
      ["m1", "m9", false, true],
      ["m10", "m13", true, true],
      ["m14", "m30", false, false],
    ]);
  });

  it("a mark at the end of the chat is closed at once", () => {
    const scenes = L.findScenes(line(story(12)), { snapshots: {} }, cfg, [{ id: "s1", from: "m9", to: "m12" }]);
    expect(scenes.at(-1)).toMatchObject({ from: "m9", to: "m12", marked: true, closed: true });
  });

  it("drops the sensor's boundaries inside the marked range", () => {
    const dash = { snapshots: Object.fromEntries([["m1", "Hall"], ["m11", "Yard"], ["m12", "Hall"]].map(([id, place]) => [id + "#0", { clock: { day: 1, time: null, place }, present: ["Aria"] }])) };
    const scenes = L.findScenes(line(story(30)), dash, cfg, [{ id: "s1", from: "m10", to: "m14" }]);
    expect(scenes.find((s: any) => s.marked)).toMatchObject({ from: "m10", to: "m14" });
  });

  it("without marks the same short scene is folded into the one before (the reported case)", () => {
    const scenes = L.findScenes(line(story(30)), { snapshots: {} }, cfg, []);
    expect(scenes).toHaveLength(1);
  });

  it("ignores a mark whose messages are gone and overlapping marks", () => {
    const marks = [{ id: "s1", from: "nope", to: "m5" }, { id: "s2", from: "m10", to: "m13" }, { id: "s3", from: "m12", to: "m16" }];
    expect(L.markRanges(line(story(30)), marks).map((r: any) => r.id)).toEqual(["s2"]);
  });
});

describe("POST /litopys/scenes", () => {
  it("marks a scene, makes the chapters over it stale, and the worker writes it as important", () => {
    writeChat("c1", story(30), { updatedAt: Date.now() });
    writeJson("litopys/chats/c1.json", {
      ...L.emptyChat("c1"),
      migrated: true,
      chapters: [{ id: "c1", from: "m1", to: "m30", count: 30, sig: L.chapterSig(line(story(30))), label: "All", text: "Everything.", kind: "scene", at: 1 }],
      counters: { chapter: 1, fact: 0, proposal: 0, arc: 0, skill: 0 },
    });
    const m = mockHost();
    const r = route(m.host, { chatId: "c1", op: "mark", from: "m10", to: "m13" });
    expect(r.status).toBe(200);
    expect(r.json.marks).toEqual([{ id: "s1", fromNo: 10, toNo: 13 }]);
    expect(readJson("litopys/chats/c1.json").chapters[0].stale).toBe(true);
    // one model call per tick
    const requests = [
      ...tick(m, [chapterReply("Start", "Early part.")]).requests,
      ...tick(m, [chapterReply("Rescue", "Marko pulled her out of the alley.")]).requests,
    ];
    expect(requests.map((x) => x.key)).toEqual(["lit_c1_m1_m9", "lit_c1_m10_m13"]);
    const rescue = requests.find((x) => x.key === "lit_c1_m10_m13");
    expect(rescue).toBeTruthy();
    expect(rescue!.req.systemPrompt).toContain("marked this scene as important");
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters.find((c: any) => c.to === "m13")).toMatchObject({ from: "m10", marked: true, label: "Rescue" });
  });

  it("refuses an overlap, a reversed range, an unknown message and an edited chapter; unmark frees it", () => {
    writeChat("c1", story(30));
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true, chapters: [{ id: "c1", from: "m20", to: "m24", count: 5, sig: "x", label: "Mine", text: "Mine.", kind: "scene", at: 1, edited: true }] });
    const { host } = mockHost();
    expect(route(host, { chatId: "c1", op: "mark", from: "m10", to: "m13" }).status).toBe(200);
    expect(route(host, { chatId: "c1", op: "mark", from: "m12", to: "m15" }).status).toBe(409);
    expect(route(host, { chatId: "c1", op: "mark", from: "m13", to: "m10" }).status).toBe(400);
    expect(route(host, { chatId: "c1", op: "mark", from: "zz", to: "m10" }).status).toBe(400);
    expect(route(host, { chatId: "c1", op: "mark", from: "m21", to: "m23" }).status).toBe(409);
    const un = route(host, { chatId: "c1", op: "unmark", id: "s1" });
    expect(un.status).toBe(200);
    expect(un.json.marks).toEqual([]);
    expect(route(host, { chatId: "c1", op: "unmark", id: "s1" }).status).toBe(404);
  });
});
