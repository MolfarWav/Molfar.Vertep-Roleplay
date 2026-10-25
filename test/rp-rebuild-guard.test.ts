/**
 * A rebuild from scratch must never leave a chat with an empty record: with no closed scene there is nothing to
 * write from, and a generation that wrote no chapter is not swapped over one that has chapters
 * (the owner lost two chapters and their facts that way, 2026-10-22).
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

function seed() {
  writeChat("jude", story(8), { title: "Jude", characterId: "jude" });
  const st = L.emptyChat("jude");
  st.migrated = true;
  st.chapters = [{ id: "c1", from: "m1", to: "m6", count: 6, label: "Glade", text: "Kael arrived in the glade.", kind: "scene", at: 1 }];
  st.facts = [{ id: "f1", text: "Kael arrived through a tear in the sky.", subject: "Kael", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active", origin: "chapter", at: 1, updatedAt: 1 }];
  st.counters = { chapter: 1, fact: 1, proposal: 0, arc: 0, habit: 0 };
  writeJson("litopys/chats/jude.json", st);
}

describe("rebuild guard", () => {
  it("refuses to start when the chat has no closed scene, and touches nothing", () => {
    seed();
    const { host } = mockHost();
    const r = L.handleRoute({ method: "POST", path: "/litopys/rebuild", query: {}, body: { chatId: "jude" } }, host);
    expect(r.status).toBe(409);
    expect(r.json.none).toBe(true);
    const st = readJson("litopys/chats/jude.json");
    expect(st.rebuild).toBeUndefined();
    expect(st.chapters).toHaveLength(1);
    expect(st.facts).toHaveLength(1);
  });

  it("a rebuild that wrote no chapter is dropped, the record in use stays", () => {
    seed();
    const st = readJson("litopys/chats/jude.json");
    // a rebuild already started (before the fix, or by an older version) with nothing to write
    st.rebuild = { startedAt: 1, chapters: [], facts: [], proposals: [], carried: [], skipScenes: [], counters: { chapter: 1, fact: 1, proposal: 0 } };
    writeJson("litopys/chats/jude.json", st);
    const m = mockHost();
    tick(m);
    const after = readJson("litopys/chats/jude.json");
    expect(after.rebuild).toBeUndefined();
    expect(after.chapters.map((c: any) => c.id)).toEqual(["c1"]);
    expect(after.facts.map((f: any) => f.id)).toEqual(["f1"]);
    expect(after.activity.map((a: any) => a.kind)).toContain("rebuild.abort");
  });
});
