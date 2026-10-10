import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, story } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any) => L.handleRoute({ method, path, query: {}, body }, host);

/** An earlier chat "old" with two chapters and some facts, and a fresh chat "new" with no record. */
function seed() {
  writeChat("old", story(20), { title: "The mill" });
  writeChat("new", story(2, "n"), { title: "After the mill" });
  writeJson("litopys/chats/old.json", {
    ...L.emptyChat("old"),
    migrated: true,
    chapters: [
      { id: "c1", from: "m1", to: "m10", count: 10, kind: "scene", text: "Aria found the mill.", label: "The mill", at: 1 },
      { id: "c2", from: "m11", to: "m20", count: 10, kind: "scene", text: "Aria burned the mill down.", label: "Fire", at: 2 },
    ],
    facts: [
      { id: "f1", text: "Aria fears fire.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: true, status: "active", updatedAt: 1 },
      { id: "f2", text: "The miller is Aria's uncle.", subject: "world", knownBy: "all", type: "relation", weight: "key", pinned: false, status: "active", updatedAt: 2 },
      { id: "f3", text: "Only Bram knows the vault code.", subject: "Bram", knownBy: ["Bram"], type: "event", weight: "key", pinned: false, status: "active", updatedAt: 3 },
      { id: "f4", text: "A retired fact.", subject: "world", knownBy: "all", type: "event", weight: "key", pinned: false, status: "retired", updatedAt: 4 },
    ],
  });
}

const ctx = (chatId: string) => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName: "Aria" },
});

describe("chat links", () => {
  it("sets, lists and removes the chat a chat continues", () => {
    seed();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/links", { chatId: "new", from: "old" });
    expect(r.status).toBe(200);
    expect(r.json.links.new.from).toBe("old");
    expect(readJson("litopys/links.json").v).toBe(1);
    expect(route(host, "GET", "/litopys/links").json.links.new.from).toBe("old");
    const list = route(host, "GET", "/litopys/chats").json.items;
    expect(list.find((c: any) => c.id === "new").continues).toBe("old");
    expect(list.find((c: any) => c.id === "old").continues).toBeNull();
    expect(route(host, "POST", "/litopys/links", { chatId: "new", from: null }).json.links).toEqual({});
  });

  it("refuses itself, missing chats and loops", () => {
    seed();
    writeChat("third", story(2, "t"));
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/links", { chatId: "new", from: "new" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/links", { chatId: "new", from: "nope" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/links", { chatId: "nope", from: "old" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/links", { chatId: "../x", from: "old" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/links", { chatId: "new", from: "old" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/links", { chatId: "third", from: "new" }).status).toBe(200);
    // old -> new -> third: old may not continue third
    const loop = route(host, "POST", "/litopys/links", { chatId: "old", from: "third" });
    expect(loop.status).toBe(400);
    expect(loop.json.error).toContain("loop");
    // an earlier chat may be continued by several
    writeChat("fourth", story(2, "q"));
    expect(route(host, "POST", "/litopys/links", { chatId: "fourth", from: "old" }).status).toBe(200);
  });

  it("drops a link whose chat is gone", () => {
    seed();
    writeJson("litopys/links.json", { v: 1, links: { new: { from: "gone", at: 1 }, old: { from: "new", at: 1 } } });
    expect(L.loadLinks(mockHost().host.fs)).toEqual({ old: { from: "new", at: 1 } });
  });
});

describe("backstory", () => {
  it("a new chat with no record of its own gets the earlier story before its first reply", () => {
    seed();
    const m = mockHost();
    route(m.host, "POST", "/litopys/links", { chatId: "new", from: "old" });
    const res = L.llmRequest(ctx("new"), m.host);
    expect(res).not.toBeNull();
    expect(res.messages).toHaveLength(3);
    expect(res.messages[0].content).toBe("sys");
    const text = res.messages[1].content as string;
    expect(res.messages[1].role).toBe("system");
    expect(text).toContain('[Backstory (Litopys)');
    expect(text).toContain('"The mill"');
    // story order, the last chapter included
    expect(text.indexOf("Aria found the mill.")).toBeLessThan(text.indexOf("Aria burned the mill down."));
    expect(text).toContain("Aria fears fire.");
    expect(text).toContain("The miller is Aria's uncle.");
    // a fact only Bram knows stays out while Bram is not here; retired facts never come
    expect(text).not.toContain("vault code");
    expect(text).not.toContain("retired");
    const side = readJson("litopys/insert/new.json");
    expect(side.backstory).toMatchObject({ from: "old", chapters: 2 });
    expect(side.tokens).toBe(0);
  });

  it("goes before the chat's own record, and a tight budget keeps the last chapter first", () => {
    seed();
    writeChat("new", story(30, "n"), { title: "After the mill" });
    writeJson("litopys/chats/new.json", {
      ...L.emptyChat("new"),
      migrated: true,
      chapters: [{ id: "c1", from: "n1", to: "n10", count: 10, kind: "scene", text: "Aria rebuilt the mill.", label: "Rebuilt", at: 3 }],
    });
    const m = mockHost();
    route(m.host, "POST", "/litopys/links", { chatId: "new", from: "old" });
    const res = L.llmRequest(ctx("new"), m.host);
    expect(res.messages).toHaveLength(4);
    expect(res.messages[1].content).toContain("[Backstory (Litopys)");
    expect(res.messages[2].content).toContain("[Story record (Litopys)");
    expect(res.messages[2].content).toContain("Aria rebuilt the mill.");

    // one token short of the whole block: the oldest chapter, added last, is the one left out
    writeJson("litopys/config.json", { linkBudget: L.estimateTokens(res.messages[1].content) - 1 });
    const tight = L.llmRequest(ctx("new"), mockHost().host);
    const back = tight.messages[1].content as string;
    expect(back).toContain("Aria burned the mill down.");
    expect(back).not.toContain("Aria found the mill.");
  });

  it("is off with a budget of 0 or without a link", () => {
    seed();
    const m = mockHost();
    expect(L.llmRequest(ctx("new"), m.host)).toBeNull();
    route(m.host, "POST", "/litopys/links", { chatId: "new", from: "old" });
    writeJson("litopys/config.json", { linkBudget: 0 });
    expect(L.llmRequest(ctx("new"), mockHost().host)).toBeNull();
  });
});

describe("backstory along a chain (0.9.5)", () => {
  /** old -> mid -> new: "mid" has its own chapter and repeats one of old's facts. */
  function chain() {
    seed();
    writeChat("mid", story(10, "k"), { title: "Ashes" });
    writeJson("litopys/chats/mid.json", {
      ...L.emptyChat("mid"),
      migrated: true,
      chapters: [{ id: "c1", from: "k1", to: "k10", count: 10, kind: "scene", text: "Aria left the valley.", label: "Road", at: 5 }],
      facts: [
        { id: "f1", text: "Aria fears fire.", subject: "Aria", knownBy: "all", type: "trait", weight: "important", pinned: true, status: "active", updatedAt: 6 },
        { id: "f2", text: "Aria owes Bram a debt.", subject: "world", knownBy: "all", type: "relation", weight: "key", pinned: false, status: "active", updatedAt: 7 },
      ],
    });
    const m = mockHost();
    route(m.host, "POST", "/litopys/links", { chatId: "mid", from: "old" });
    route(m.host, "POST", "/litopys/links", { chatId: "new", from: "mid" });
    return m;
  }

  it("reads back past the direct predecessor, oldest first, a shared fact once", () => {
    const m = chain();
    const text = L.llmRequest(ctx("new"), m.host).messages[1].content as string;
    expect(text.indexOf('"The mill"')).toBeGreaterThan(-1);
    expect(text.indexOf("Aria burned the mill down.")).toBeLessThan(text.indexOf("Aria left the valley."));
    expect(text).toContain('[Backstory (Litopys), older: the story before "Ashes", from the chat "The mill"');
    expect(text).toContain('[Backstory (Litopys): the earlier story this chat continues, from the chat "Ashes"');
    expect(text.split("Aria fears fire.").length - 1).toBe(1);
    expect(text).toContain("Aria owes Bram a debt.");
    expect(readJson("litopys/insert/new.json").backstory).toMatchObject({ from: "mid", chain: ["old", "mid"] });
  });

  it("keeps to the one budget, the nearest chat first in line for it", () => {
    chain();
    writeJson("litopys/config.json", { linkBudget: 120 });
    const res = L.llmRequest(ctx("new"), mockHost().host);
    const text = res.messages[1].content as string;
    expect(L.estimateTokens(text)).toBeLessThanOrEqual(122);
    expect(text).toContain("Aria left the valley.");
  });

  it("stops after three chats back", () => {
    chain();
    writeChat("first", story(4, "z"), { title: "Before" });
    writeJson("litopys/chats/first.json", {
      ...L.emptyChat("first"),
      migrated: true,
      chapters: [{ id: "c1", from: "z1", to: "z4", count: 4, kind: "scene", text: "Aria was born.", label: "Birth", at: 0 }],
    });
    writeChat("fourth", story(2, "q"), { title: "Later" });
    const m = mockHost();
    route(m.host, "POST", "/litopys/links", { chatId: "old", from: "first" });
    route(m.host, "POST", "/litopys/links", { chatId: "fourth", from: "new" });
    writeJson("litopys/chats/new.json", {
      ...L.emptyChat("new"),
      migrated: true,
      chapters: [{ id: "c1", from: "n1", to: "n2", count: 2, kind: "scene", text: "Aria came home.", label: "Home", at: 8 }],
    });
    const text = L.llmRequest(ctx("fourth"), m.host).messages[1].content as string;
    expect(text).toContain("Aria came home.");
    expect(text).toContain("Aria burned the mill down.");
    expect(text).not.toContain("Aria was born.");
  });
});
