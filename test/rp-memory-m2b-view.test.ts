import { describe, expect, it } from "bun:test";
import { useRoot, L, readText, writeJson, story, writeChat, mockHost, tick, chapterReply } from "./rp-memory-m2-kit";

useRoot();

const get = (path: string, query: Record<string, string> = {}) =>
  L.handleRoute({ method: "GET", path, query }, mockHost().host) as { status: number; json: any } | null;

function chatFile(chatId: string, extra: Record<string, unknown> = {}) {
  const msgs = story(12);
  writeChat(chatId, msgs, { title: "The mill", characterId: "aria" });
  writeJson("characters/aria/card.json", { name: "Aria" });
  writeJson(`litopys/chats/${chatId}.json`, {
    v: 2,
    chatId,
    migrated: true,
    chapters: [{ id: "c1", from: "m1", to: "m6", count: 6, sig: "x", label: "Arrival", text: "Aria let You in.", kind: "scene", at: 5, stale: true }],
    facts: [
      { id: "f1", text: "The mill is cold.", subject: "world", knownBy: "all", type: "world", weight: "everyday", pinned: false, status: "active", src: { from: "m1", to: "m6" }, origin: "chapter", at: 5, updatedAt: 5 },
      { id: "f2", text: "Aria lost her ring.", subject: "Aria", knownBy: ["Aria"], type: "event", weight: "key", pinned: false, pinProposed: true, status: "retired", src: { from: "m1", to: "m6" }, origin: "chapter", at: 5, updatedAt: 6 },
    ],
    proposals: [
      { id: "p1", op: "retire", targets: ["f1"], reason: "old", status: "pending", at: 7 },
      { id: "p2", op: "retire", targets: ["f2"], reason: "old", status: "rejected", at: 7 },
    ],
    scene: { openFrom: "m7", label: "Cellar" },
    counters: { chapter: 1, fact: 2, proposal: 2 },
    worker: { lastRunAt: 99, lastScene: { from: "m1", to: "m6" }, ok: false, error: "model timeout", ms: 12, retryAt: 1000 },
    ...extra,
  });
}

describe("Litopys read-only view", () => {
  it("GET /litopys/chats lists chats with counts, subject name and worker status", () => {
    chatFile("one");
    writeChat("two", story(4), { title: "Empty", updatedAt: 1 });
    writeChat("tmp", story(4), { title: "Temp", temporary: true });
    writeJson("groups/g1.json", { name: "The Mill Folk" });
    writeChat("grp", story(4), { title: "Group chat", groupId: "g1", updatedAt: 2 });

    const r = get("/litopys/chats")!;
    expect(r.status).toBe(200);
    const items = r.json.items;
    expect(items.map((x: any) => x.id)).toEqual(["one", "grp", "two"]);
    const one = items[0];
    expect(one).toMatchObject({ title: "The mill", name: "Aria", hasData: true, chapters: 1, facts: 1, proposals: 1 });
    expect(one.worker).toMatchObject({ ok: false, error: "model timeout", lastRunAt: 99 });
    expect(items[1].name).toBe("The Mill Folk");
    expect(items[2]).toMatchObject({ hasData: false, chapters: 0, facts: 0, proposals: 0, worker: null });
  });

  it("GET /litopys/chat returns chapters with message numbers, facts, proposals, scene and worker", () => {
    chatFile("one");
    const r = get("/litopys/chat", { chatId: "one" })!;
    expect(r.status).toBe(200);
    const j = r.json;
    expect(j).toMatchObject({ chatId: "one", title: "The mill", name: "Aria", messages: 12, hasData: true, migrated: true });
    expect(j.chapters).toEqual([
      { id: "c1", label: "Arrival", text: "Aria let You in.", kind: "scene", count: 6, fromNo: 1, toNo: 6, place: undefined, at: 5, stale: true, edited: false },
    ]);
    expect(j.facts.map((f: any) => f.id)).toEqual(["f1", "f2"]);
    expect(j.facts[1].pinProposed).toBe(true);
    expect(j.proposals).toHaveLength(2);
    expect(j.scene).toEqual({ openFrom: "m7", label: "Cellar" });
    expect(j.sceneFromNo).toBe(7);
    expect(j.worker).toEqual({ lastRunAt: 99, ok: false, lastScene: { from: "m1", to: "m6", fromNo: 1, toNo: 6 }, error: "model timeout", ms: 12, retryAt: 1000 });
  });

  it("a chapter whose messages are gone has no message numbers", () => {
    chatFile("one", { chapters: [{ id: "c1", from: "gone", to: "gone2", count: 3, sig: "x", label: "Lost", text: "t", kind: "scene", at: 1 }] });
    const j = get("/litopys/chat", { chatId: "one" })!.json;
    expect(j.chapters[0]).toMatchObject({ fromNo: 0, toNo: 0 });
  });

  it("a chat without a Litopys file returns an empty view; an unknown or unsafe id is a 404", () => {
    writeChat("plain", story(4), { title: "Plain" });
    const j = get("/litopys/chat", { chatId: "plain" })!.json;
    expect(j).toMatchObject({ hasData: false, chapters: [], facts: [], proposals: [], worker: null, messages: 4 });
    expect(get("/litopys/chat", { chatId: "nope" })!.status).toBe(404);
    expect(get("/litopys/chat", { chatId: "../litopys/config" })!.status).toBe(404);
    expect(get("/litopys/chat", {})!.status).toBe(404);
  });

  it("the view only reads: no files are created or changed by either route", () => {
    chatFile("one");
    writeChat("plain", story(4));
    const file = readText("litopys/chats/one.json");
    get("/litopys/chats");
    get("/litopys/chat", { chatId: "one" });
    get("/litopys/chat", { chatId: "plain" });
    expect(readText("litopys/chats/one.json")).toBe(file);
    expect(() => readText("litopys/chats/plain.json")).toThrow();
  });

  it("a chapter the worker just wrote shows up in the view", () => {
    writeChat("live", story(70), { title: "Live" });
    const m = mockHost();
    tick(m, [chapterReply("First", "Aria agreed to help.", [{ op: "add", text: "Aria agreed to help.", subject: "Aria", knownBy: "all", type: "event", weight: "important" }])]);
    const j = get("/litopys/chat", { chatId: "live" })!.json;
    expect(j.chapters.length).toBeGreaterThan(0);
    expect(j.chapters[0].fromNo).toBe(1);
    expect(j.facts[0].text).toBe("Aria agreed to help.");
    expect(j.worker.ok).toBe(true);
  });
});
