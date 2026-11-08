/**
 * #184 G1, G2, G4: a story saved as a book on the Data Bank shelf. The Litopys side builds the file from a chat's record;
 * the engine side (searchDatabank) filters it by speaker and scope.
 */
import { describe, expect, it } from "bun:test";
import { L, useRoot, story, writeChat, writeJson, readJson, exists, mockHost } from "./rp-memory-m2-kit";

useRoot();

const fact = (id: string, text: string, knownBy: unknown = "all", status = "active") => ({ id, text, subject: "world", knownBy, type: "event", weight: "everyday", pinned: false, status, origin: "migrated", at: 1, updatedAt: 1 });
const chapter = (id: string, label: string, text: string, cast?: string[]) => ({ id, from: id + "a", to: id + "b", count: 2, sig: "x", label, text, kind: "scene", at: 1, ...(cast ? { cast } : {}) });

/** A finished story: three chapters (one without a cast), an arc over the first two, four facts. */
function seed(chatId: string, title = "The Harbour") {
  writeChat(chatId, story(12), { title });
  const m = mockHost();
  const st = L.emptyChat(chatId);
  st.migrated = true;
  st.chapters = [
    chapter("c1", "The mill", "Aria and Bram found the mill burned.", ["Aria", "Bram"]),
    chapter("c2", "The cellar", "Aria opened the cellar with a brass key.", ["Aria"]),
    chapter("c3", "Old news", "A chapter from before casts were kept."),
  ];
  st.arcs = [{ id: "a1", chapterIds: ["c1", "c2"], from: "c1a", to: "c2b", label: "Winter", text: "Aria and Bram lost the mill and Aria found the cellar.", sig: "x", at: 1 }];
  st.facts = [fact("f1", "The harbour is closed for winter."), fact("f2", "The brass key opens the vault.", ["Aria"]), fact("f3", "Bram sold the map.", ["Bram", "You"]), fact("f4", "Gone fact.", "all", "removed"), fact("f5", "Empty list means anyone.", [])];
  L.saveChatFile(m.host.fs, st);
  return m;
}
const get = (m: ReturnType<typeof mockHost>, chatId: string) => L.handleRoute({ method: "GET", path: "/litopys/book", query: { chatId } }, m.host);
const save = (m: ReturnType<typeof mockHost>, body: Record<string, unknown>) => L.handleRoute({ method: "POST", path: "/litopys/book", body }, m.host);

describe("the book builder", () => {
  it("makes a chunk for each chapter, arc and active fact, with who knew it", () => {
    const m = seed("bk1");
    const chunks = L.bookChunks(L.loadChatFile(m.host.fs, "bk1"));
    expect(chunks.map((c: any) => [c.kind, c.ref])).toEqual([["chapter", "c1"], ["chapter", "c2"], ["chapter", "c3"], ["arc", "a1"], ["fact", "f1"], ["fact", "f2"], ["fact", "f3"], ["fact", "f5"]]);
    expect(chunks.map((c: any) => c.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const by = Object.fromEntries(chunks.map((c: any) => [c.ref, c]));
    expect(by.c1.text).toBe("The mill: Aria and Bram found the mill burned.");
    expect(by.c1.cast).toEqual(["Aria", "Bram"]);
    expect(by.c3.cast).toBeUndefined();
    // an arc is read by whoever was in any chapter of it; one chapter with no cast makes it unfiltered
    expect(by.a1.cast).toEqual(["Aria", "Bram"]);
    expect(by.f1.knownBy).toBe("all");
    expect(by.f2.knownBy).toEqual(["Aria"]);
    expect(by.f5.knownBy).toBe("all");
  });

  it("an arc over a chapter with no cast has no cast", () => {
    const m = seed("bk2");
    const st = L.loadChatFile(m.host.fs, "bk2");
    st.arcs[0].chapterIds = ["c1", "c3"];
    expect(L.bookChunks(st).find((c: any) => c.kind === "arc").cast).toBeUndefined();
  });

  it("the preview counts what a book would hold and offers the chats that continue this one", () => {
    const m = seed("bk3");
    writeChat("later", story(4), { title: "Later" });
    writeJson("litopys/links.json", { v: 1, links: { later: { from: "bk3", at: 1 } } });
    const r = get(m, "bk3").json;
    expect(r).toMatchObject({ chatId: "bk3", title: "The Harbour", chapters: 3, arcs: 1, facts: 4, capped: false, readers: ["later"], books: [] });
    expect(r.tokens).toBeGreaterThan(20);
    expect(get(m, "nope").status).toBe(404);
  });
});

describe("saving a book", () => {
  it("writes one Data Bank file that is a frozen copy, read only by the chosen chats", () => {
    const m = seed("bk4");
    writeChat("other", story(4), { title: "Other" });
    const r = save(m, { chatId: "bk4", readers: ["other"] });
    expect(r.status).toBe(200);
    const file = readJson(`databank/${r.json.id}.json`);
    expect(file).toMatchObject({ kind: "snapshot", name: "The Harbour", scope: "chat", scopeTargetId: "other", scopeChatIds: ["other"], enabled: true });
    expect(file.source).toMatchObject({ chatId: "bk4", title: "The Harbour", version: 1, family: r.json.id });
    expect(file.chunks).toHaveLength(8);
    expect(file.size).toBe(file.chunks.reduce((n: number, c: any) => n + c.text.length, 0));
    // the chat changing later does not touch the book
    const st = L.loadChatFile(m.host.fs, "bk4");
    st.facts[0].text = "Changed.";
    L.saveChatFile(m.host.fs, st);
    expect(readJson(`databank/${r.json.id}.json`).chunks.find((c: any) => c.ref === "f1").text).toBe("The harbour is closed for winter.");
    expect(get(m, "bk4").json.books).toHaveLength(1);
  });

  it("needs a chat that reads it, and a chat with something to save", () => {
    const m = seed("bk5");
    expect(save(m, { chatId: "bk5", readers: [] }).status).toBe(400);
    expect(save(m, { chatId: "bk5", readers: ["ghost"] }).status).toBe(400);
    expect(save(m, { chatId: "nope", readers: ["bk5"] }).status).toBe(404);
    writeChat("empty", story(4), { title: "Empty" });
    const e = L.emptyChat("empty");
    e.migrated = true;
    L.saveChatFile(m.host.fs, e);
    expect(save(m, { chatId: "empty", readers: ["bk5"] }).status).toBe(400);
  });

  it("an update is the next version: the old one is switched off and stays", () => {
    const m = seed("bk6");
    writeChat("r", story(4), { title: "R" });
    const first = save(m, { chatId: "bk6", readers: ["r"], name: "My book" }).json;
    const st = L.loadChatFile(m.host.fs, "bk6");
    st.facts.push(fact("f9", "A new fact after the first save."));
    L.saveChatFile(m.host.fs, st);
    const second = save(m, { chatId: "bk6", readers: ["r"], update: first.id }).json;
    expect(second).toMatchObject({ version: 2, name: "My book v2" });
    expect(readJson(`databank/${first.id}.json`).enabled).toBe(false);
    const next = readJson(`databank/${second.id}.json`);
    expect(next).toMatchObject({ enabled: true });
    expect(next.source).toMatchObject({ family: first.id, version: 2 });
    expect(next.chunks).toHaveLength(9);
    // a third version continues the count and names the family by its base name
    const third = save(m, { chatId: "bk6", readers: ["r"], update: second.id }).json;
    expect(third).toMatchObject({ version: 3, name: "My book v3" });
    expect(exists(`databank/${first.id}.json`)).toBe(true);
    expect(save(m, { chatId: "bk6", readers: ["r"], update: "bk_nope" }).status).toBe(404);
  });
});

describe("a book reaches the whole chain (#288)", () => {
  it("a chat reads a book saved for a chat many links back, not only three", async () => {
    const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
    const m = mockHost();
    const links: Record<string, any> = {};
    for (let i = 2; i <= 6; i++) {
      writeChat("s" + i, story(2, "s" + i), { title: "S" + i });
      links["s" + i] = { from: "s" + (i - 1), at: i };
    }
    writeChat("s1", story(2, "s1"), { title: "S1" });
    writeJson("litopys/links.json", { v: 1, links });
    expect(engine.chatChain(m.host.fs, "s6")).toEqual(["s5", "s4", "s3", "s2", "s1"]);
    expect(engine.chatChain(m.host.fs, "s1")).toEqual([]);
  });
});
