 import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, writeDash, story, line, chapterReply, tick } from "./rp-memory-m2-kit";

useRoot();

function route(host: any, method: string, path: string, body?: any, query?: any) {
  return L.handleRoute({ method, path, query, body }, host);
}

function seedRecord(chatId: string, extra: any = {}) {
  writeJson(`litopys/chats/${chatId}.json`, { ...L.emptyChat(chatId), ...extra });
}

describe("facts", () => {
  it("adds a fact with defaults and tracks rev/activity", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "The mill is old" });
    expect(r.status).toBe(200);
    expect(r.json.rev).toBe(1);
    const f = r.json.facts.find((x: any) => x.text === "The mill is old");
    expect(f.subject).toBe("world");
    expect(f.knownBy).toBe("all");
    expect(f.type).toBe("event");
    expect(f.weight).toBe("everyday");
    expect(f.origin).toBe("user");
    expect(f.status).toBe("active");
    expect(r.json.activity.at(-1).kind).toBe("fact.add");
    expect(readJson("litopys/chats/c1.json").rev).toBe(1);
  });

  it("rejects empty text", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "" });
    expect(r.status).toBe(400);
  });

  it("rejects bad type and weight", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "x", type: "foo" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "x", weight: "huge" }).status).toBe(400);
  });

  it("accepts knownBy all or a deduplicated name list", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    const all = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "a", knownBy: "all" });
    expect(all.status).toBe(200);
    const list = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "b", knownBy: ["Aria", "aria", "Bran"] });
    expect(list.json.facts.at(-1).knownBy).toEqual(["Aria", "Bran"]);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "add", text: "c", knownBy: [] }).status).toBe(400);
  });

  it("edits a fact and sets edited flag", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f1", text: "Old", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1000, updatedAt: 1000 }] });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "edit", id: "f1", text: "New" });
    expect(r.status).toBe(200);
    const f = r.json.facts.find((x: any) => x.id === "f1");
    expect(f.text).toBe("New");
    expect(f.edited).toBe(true);
    expect(f.updatedAt).toBeGreaterThan(f.at);
    expect(r.json.activity.at(-1).kind).toBe("fact.edit");
    expect(readJson("litopys/chats/c1.json").rev).toBe(1);
  });

  it("rejects edit with nothing to change", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f1", text: "Old", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1000, updatedAt: 1000 }] });
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "edit", id: "f1" }).status).toBe(400);
  });

  it("returns 404 for unknown fact and 409 for superseded", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f1", text: "Old", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "superseded", src: { from: null, to: null }, origin: "chapter", at: 1000, updatedAt: 1000 }] });
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "edit", id: "f99", text: "x" }).status).toBe(404);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "edit", id: "f1", text: "x" }).status).toBe(409);
  });

  it("blocks moving a pinned fact onto a subject already at pin limit", () => {
    writeJson("litopys/config.json", { pinLimit: 2 });
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 3, proposal: 0 }, facts: [
      { id: "f1", text: "a", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "b", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f3", text: "c", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
    ] });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "edit", id: "f3", subject: "Aria" });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("pin limit");
    expect(r.json.limit).toBe(2);
    expect(r.json.pinned.length).toBe(2);
  });

  it("pins active facts and supports replace within the limit", () => {
    writeJson("litopys/config.json", { pinLimit: 2 });
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 3, proposal: 0 }, facts: [
      { id: "f1", text: "a", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "b", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f3", text: "c", subject: "Aria", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
    ] });
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f1" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f2" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f3" }).status).toBe(409);
    const replace = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f3", replace: "f1" });
    expect(replace.status).toBe(200);
    expect(replace.json.facts.find((x: any) => x.id === "f3").pinned).toBe(true);
    expect(replace.json.facts.find((x: any) => x.id === "f1").pinned).toBe(false);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "unpin", id: "f2" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f1" }).status).toBe(200);
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f9", text: "r", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "retired", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }] });
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f9" }).status).toBe(409);
  });

  it("retires, restores and deletes facts", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 2, proposal: 0 }, facts: [
      { id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "b", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "retired", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
    ] });
    const { host } = mockHost();
    const retired = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "retire", id: "f1" });
    expect(retired.status).toBe(200);
    expect(retired.json.facts.find((x: any) => x.id === "f1").status).toBe("retired");
    expect(retired.json.facts.find((x: any) => x.id === "f1").pinned).toBe(false);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "retire", id: "f1" }).status).toBe(409);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "restore", id: "f1" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "restore", id: "f1" }).status).toBe(409);
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "restore", id: "f2" }).status).toBe(200);
    const del = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "delete", id: "f1" });
    expect(del.status).toBe(200);
    expect(del.json.facts.some((x: any) => x.id === "f1")).toBe(false);
  });

  it("expires pending proposals when retiring or deleting a fact", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 1 }, facts: [{ id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }], proposals: [{ id: "p1", op: "retire", targets: ["f1"], status: "pending", at: 1 }] });
    const { host } = mockHost();
    route(host, "POST", "/litopys/facts", { chatId: "c1", op: "retire", id: "f1" });
    let st = readJson("litopys/chats/c1.json");
    expect(st.proposals[0].status).toBe("expired");
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 1 }, facts: [{ id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }], proposals: [{ id: "p1", op: "retire", targets: ["f1"], status: "pending", at: 1 }] });
    route(host, "POST", "/litopys/facts", { chatId: "c1", op: "delete", id: "f1" });
    st = readJson("litopys/chats/c1.json");
    expect(st.proposals[0].status).toBe("expired");
  });

  it("rejects unknown op, bad chatId, missing chat and missing record", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/facts", { chatId: "c1", op: "fly" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/facts", { chatId: "../x", op: "add", text: "x" }).status).toBe(400);
    seedRecord("ghost");
    expect(route(host, "POST", "/litopys/facts", { chatId: "ghost", op: "add", text: "x" }).status).toBe(404);
    writeChat("bare", story(2));
    expect(route(host, "POST", "/litopys/facts", { chatId: "bare", op: "add", text: "x" }).status).toBe(404);
  });
});

describe("chapters", () => {
  const msgs = story(8);
  const sig = L.chapterSig(line(msgs).slice(0, 8));

  function seedChapter() {
    writeChat("c1", msgs);
    writeDash("c1", { m5: { scene: { new: true } } });
    seedRecord("c1", { counters: { chapter: 1, fact: 0, proposal: 0 }, chapters: [{ id: "c1", from: "m1", to: "m8", count: 8, kind: "scene", label: "Old mill", text: "Summary.", sig, at: 1 }] });
  }

  it("edits a chapter, re-signs and clears stale", () => {
    seedChapter();
    const st = readJson("litopys/chats/c1.json");
    st.chapters[0].stale = true;
    writeJson("litopys/chats/c1.json", st);
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "edit", id: "c1", text: "Updated summary." });
    expect(r.status).toBe(200);
    const ch = r.json.chapters.find((x: any) => x.id === "c1");
    expect(ch.text).toBe("Updated summary.");
    expect(ch.edited).toBe(true);
    expect(ch.stale).toBe(false);
    expect(readJson("litopys/chats/c1.json").chapters[0].sig).toBe(sig);
    expect(route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "edit", id: "c1", text: "" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "edit", id: "cx", text: "x" }).status).toBe(404);
  });

  it("rewrite marks stale and wakes the worker", () => {
    seedChapter();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "rewrite", id: "c1" });
    expect(r.status).toBe(200);
    const ch = r.json.chapters.find((x: any) => x.id === "c1");
    expect(ch.stale).toBe(true);
    expect(ch.edited).toBe(false);
    expect(readJson("litopys/wake.json")["c1"]).toBeGreaterThan(0);
    seedRecord("c1", { counters: { chapter: 1, fact: 0, proposal: 0 }, chapters: [{ id: "c2", from: "m1", to: "m8", count: 8, kind: "merged", label: "Old summary", text: "Old.", sig, at: 1 }] });
    writeChat("c1", msgs);
    expect(route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "rewrite", id: "c2" }).status).toBe(400);
  });

  it("delete removes a chapter and optionally keeps the scene gone", () => {
    seedChapter();
    const { host } = mockHost();
    const r1 = route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "delete", id: "c1" });
    expect(r1.status).toBe(200);
    expect(r1.json.chapters.some((x: any) => x.id === "c1")).toBe(false);
    expect(readJson("litopys/wake.json")["c1"]).toBeGreaterThan(0);
    writeChat("c2", msgs);
    writeDash("c2", { m5: { scene: { new: true } } });
    seedRecord("c2", { counters: { chapter: 1, fact: 0, proposal: 0 }, chapters: [{ id: "c1", from: "m1", to: "m8", count: 8, kind: "scene", label: "x", text: "y.", sig, at: 1 }] });
    const r2 = route(host, "POST", "/litopys/chapters", { chatId: "c2", op: "delete", id: "c1", keepGone: true });
    expect(r2.status).toBe(200);
    expect(readJson("litopys/chats/c2.json").skipScenes.length).toBe(1);
    expect(r2.json.skipped).toEqual([{ fromNo: 1, toNo: 8 }]);
  });

  it("blocks chapter edits while rebuilding", () => {
    seedChapter();
    const { host } = mockHost();
    route(host, "POST", "/litopys/rebuild", { chatId: "c1" });
    const r = route(host, "POST", "/litopys/chapters", { chatId: "c1", op: "edit", id: "c1", text: "x" });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("rebuilding");
  });
});

describe("proposals", () => {
  function seedProposal(proposal: any, facts: any[] = [{ id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }]) {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: facts.length, proposal: 1 }, facts, proposals: [proposal] });
  }

  it("rejects a pending proposal", () => {
    seedProposal({ id: "p1", op: "retire", targets: ["f1"], status: "pending", at: 1 });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "reject" });
    expect(r.status).toBe(200);
    expect(r.json.proposals[0].status).toBe("rejected");
    expect(r.json.proposals[0].settledAt).toBeGreaterThan(0);
    expect(r.json.activity.at(-1).kind).toBe("proposal.reject");
  });

  it("accepts a rewrite proposal", () => {
    seedProposal({ id: "p1", op: "rewrite", targets: ["f1"], text: "Rewritten fact", status: "pending", at: 1 });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(200);
    expect(r.json.proposals[0].status).toBe("accepted");
    expect(r.json.facts.find((x: any) => x.id === "f1").text).toBe("Rewritten fact");
  });

  it("accepts a retire proposal", () => {
    seedProposal({ id: "p1", op: "retire", targets: ["f1"], status: "pending", at: 1 });
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(200);
    expect(r.json.facts.find((x: any) => x.id === "f1").status).toBe("retired");
  });

  it("accepts a merge proposal", () => {
    const facts = [
      { id: "f1", text: "a", subject: "Aria", knownBy: ["Aria"], type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "b", subject: "Aria", knownBy: ["Bran"], type: "event", weight: "key", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
    ];
    seedProposal({ id: "p1", op: "merge", targets: ["f1", "f2"], text: "Merged fact", status: "pending", at: 1 }, facts);
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(200);
    const merged = r.json.facts.find((x: any) => x.text === "Merged fact");
    expect(merged.weight).toBe("key");
    expect(merged.knownBy).toEqual(["Aria", "Bran"]);
    expect(merged.pinned).toBe(true);
    expect(r.json.facts.find((x: any) => x.id === "f1").status).toBe("retired");
    expect(r.json.facts.find((x: any) => x.id === "f1").mergedInto).toBe(merged.id);
  });

  it("accepts a pin proposal and respects the limit with replace", () => {
    writeJson("litopys/config.json", { pinLimit: 2 });
    const facts = [
      { id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "b", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f3", text: "c", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
    ];
    const pin = (id: string, f: string) => ({ id, op: "pin", targets: [f], status: "pending", at: 1 });
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 3, proposal: 3 }, facts, proposals: [pin("p1", "f1"), pin("p2", "f2"), pin("p3", "f3")] });
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" }).status).toBe(200);
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p2", op: "accept" }).status).toBe(200);
    const over = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p3", op: "accept" });
    expect(over.status).toBe(409);
    expect(over.json.error).toBe("pin limit");
    expect(over.json.pinned.map((f: any) => f.id).sort()).toEqual(["f1", "f2"]);
    expect(readJson("litopys/chats/c1.json").proposals[2].status).toBe("pending");
    const rep = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p3", op: "accept", replace: "f1" });
    expect(rep.status).toBe(200);
    const after = readJson("litopys/chats/c1.json");
    expect(after.facts.filter((f: any) => f.pinned).map((f: any) => f.id).sort()).toEqual(["f2", "f3"]);
    expect(after.proposals[2].status).toBe("accepted");
  });

  it("returns target gone and expires the proposal when the target is no longer active", () => {
    // retiring through the route would expire the proposal first; a target retired otherwise is the case here
    seedProposal({ id: "p1", op: "rewrite", targets: ["f1"], text: "x", status: "pending", at: 1 }, [{ id: "f1", text: "a", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "retired", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }]);
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("target gone");
    expect(readJson("litopys/chats/c1.json").proposals[0].status).toBe("expired");
  });

  it("rejects non-pending, unknown or badly operated proposals", () => {
    seedProposal({ id: "p1", op: "rewrite", targets: ["f1"], text: "x", status: "accepted", settledAt: 1, at: 1 });
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" }).status).toBe(409);
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p99", op: "accept" }).status).toBe(404);
    expect(route(host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "vote" }).status).toBe(400);
  });
});

describe("worker", () => {
  function seedWorkerChat(extra: any = {}) {
    // m1..m8 is a closed scene (min 6 messages), m9.. the open one
    writeChat("c1", story(16));
    writeDash("c1", { m9: { scene: { new: true } } });
    seedRecord("c1", { migrated: true, ...extra });
  }

  it("turns an update on an edited change fact into a rewrite proposal", () => {
    seedWorkerChat({ counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f1", text: "Bran has a scar", subject: "Bran", knownBy: "all", type: "change", weight: "important", pinned: false, status: "active", edited: true, src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 }] });
    const m = mockHost();
    tick(m, [chapterReply("The mill", "Aria waits.", [{ op: "update", id: "f1", text: "Bran has a new scar" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.proposals.length).toBe(1);
    expect(st.proposals[0].op).toBe("rewrite");
    expect(st.facts.find((x: any) => x.id === "f1").text).toBe("Bran has a scar");
  });

  it("supersedes an unedited change fact immediately", () => {
    seedWorkerChat({ counters: { chapter: 0, fact: 1, proposal: 0 }, facts: [{ id: "f1", text: "Bran has a scar", subject: "Bran", knownBy: "all", type: "change", weight: "important", pinned: false, status: "active", edited: false, src: { from: null, to: null }, origin: "chapter", at: 1, updatedAt: 1 }] });
    const m = mockHost();
    tick(m, [chapterReply("The mill", "Aria waits.", [{ op: "update", id: "f1", text: "Bran has a new scar" }])]);
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts.find((x: any) => x.id === "f1").status).toBe("superseded");
    const next = st.facts.find((x: any) => x.status === "active" && x.supersedes === "f1");
    expect(next.text).toBe("Bran has a new scar");
  });

  it("proposes a pin for a new key fact but does not pin it", () => {
    seedWorkerChat();
    const m = mockHost();
    tick(m, [chapterReply("The mill", "Aria waits.", [{ op: "add", text: "The door is locked", weight: "key" }])]);
    const st = readJson("litopys/chats/c1.json");
    const f = st.facts.find((x: any) => x.text === "The door is locked");
    expect(f.pinProposed).toBe(true);
    expect(f.pinned).toBe(false);
    expect(st.proposals.some((p: any) => p.op === "pin" && p.targets[0] === f.id)).toBe(true);
  });

  it("records worker activity and clears inFlight after writing a chapter", () => {
    seedWorkerChat();
    const m = mockHost();
    tick(m, [chapterReply("The old mill", "Aria waited by the door while the wind rose.")]);
    const st = readJson("litopys/chats/c1.json");
    const act = st.activity.find((a: any) => a.by === "worker" && a.kind === "chapter.write");
    expect(act).toBeTruthy();
    expect(act.ids[0]).toMatch(/^c/);
    expect(st.worker.lastProgressAt).toBeGreaterThan(0);
    expect(st.inFlight).toBeUndefined();
  });

  it("shows inFlight and working state while a request is in flight", () => {
    seedWorkerChat();
    const m = mockHost();
    L.onTick({ pluginId: "litopys" }, m.host);
    const r = route(m.host, "GET", "/litopys/chat", undefined, { chatId: "c1" });
    expect(r.status).toBe(200);
    expect(r.json.worker.state).toBe("working");
    expect(r.json.worker.inFlight).toBeTruthy();
    expect(r.json.worker.inFlight.fromNo).toBeGreaterThan(0);
  });
});

describe("workerState", () => {
  it("returns working for a recent inFlight", () => {
    expect(L.workerState({ inFlight: { since: 1000 } }, 1, 0, 5000).state).toBe("working");
  });

  it("returns retry when failed and retryAt is in the future", () => {
    expect(L.workerState({ worker: { ok: false, retryAt: 5000 } }, 0, 0, 1000).state).toBe("retry");
  });

  it("returns idle when there is no work and no inFlight", () => {
    expect(L.workerState({}, 0, 0, 1000).state).toBe("idle");
  });

  it("returns queued when work is left and something moved recently", () => {
    expect(L.workerState({ worker: { lastProgressAt: 500 } }, 2, 0, 2000).state).toBe("queued");
  });

  it("returns queued from a recent global beat", () => {
    expect(L.workerState({}, 2, 5000, 6000).state).toBe("queued");
  });

  it("returns stalled with stalledFor when work is left and nothing moved", () => {
    const now = 200000;
    const s = L.workerState({ worker: { lastProgressAt: 100 } }, 2, 0, now);
    expect(s.state).toBe("stalled");
    expect(s.stalledFor).toBe(now - 100);
  });
});

describe("concurrency", () => {
  it("saveChatFile loses a race when the disk rev changed", () => {
    writeChat("c1", story(2));
    seedRecord("c1");
    const { host } = mockHost();
    const a = L.loadChatFile(host.fs, "c1");
    const b = L.loadChatFile(host.fs, "c1");
    a.activity.push({ at: 1, kind: "x" });
    expect(L.saveChatFile(host.fs, a)).toBe(true);
    expect(a.rev).toBe(1);
    expect(L.saveChatFile(host.fs, b)).toBe(false);
    expect(readJson("litopys/chats/c1.json").rev).toBe(1);
  });
});

describe("rebuild", () => {
  function seedRebuildable() {
    const msgs = story(16);
    writeChat("c1", msgs);
    writeDash("c1", { m9: { scene: { new: true } } });
    const sig = L.chapterSig(line(msgs).slice(0, 8));
    seedRecord("c1", { counters: { chapter: 1, fact: 4, proposal: 0 }, chapters: [{ id: "c1", from: "m1", to: "m8", count: 8, kind: "scene", label: "Old", text: "Old.", sig, at: 1, edited: true }], facts: [
      { id: "f1", text: "user fact", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 },
      { id: "f2", text: "chapter fact", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", src: { from: "m1", to: "m8", chapter: "c1" }, origin: "chapter", at: 1, updatedAt: 1 },
      { id: "f3", text: "pinned fact", subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: true, status: "active", src: { from: null, to: null }, origin: "chapter", at: 1, updatedAt: 1 },
      { id: "f4", text: "dashboard fact", subject: "You", knownBy: ["Aria"], type: "relation", weight: "important", pinned: false, status: "active", src: { from: null, to: null }, origin: "dashboard", at: 1, updatedAt: 1 },
    ] });
  }

  it("starts a rebuild keeping edited chapters and user-carried facts", () => {
    seedRebuildable();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/rebuild", { chatId: "c1" });
    expect(r.status).toBe(200);
    expect(r.json.scenes).toBe(1);
    const st = readJson("litopys/chats/c1.json");
    expect(st.rebuild.chapters.length).toBe(1);
    expect(st.rebuild.chapters[0].id).toBe("c1");
    expect(st.rebuild.facts.map((f: any) => f.id).sort()).toEqual(["f1", "f3", "f4"]);
    expect(st.rebuild.carried.sort()).toEqual(["f1", "f3", "f4"]);
    expect(st.activity.at(-1).kind).toBe("rebuild.start");
  });

  it("finishRebuild keeps current state of carried facts and drops deleted ones", () => {
    seedRebuildable();
    route(mockHost().host, "POST", "/litopys/rebuild", { chatId: "c1" });
    let st = L.loadChatFile(mockHost().host.fs, "c1");
    const f1 = st.facts.find((f: any) => f.id === "f1");
    f1.text = "edited user fact";
    f1.edited = true;
    st.facts = st.facts.filter((f: any) => f.id !== "f3");
    const now = Date.now();
    L.finishRebuild(st, now);
    expect(st.rebuild).toBeUndefined();
    expect(st.chapters.length).toBe(1);
    expect(st.facts.find((f: any) => f.id === "f1").text).toBe("edited user fact");
    expect(st.facts.some((f: any) => f.id === "f3")).toBe(false);
    expect(st.facts.some((f: any) => f.id === "f4")).toBe(true);
    expect(st.activity.at(-1).kind).toBe("rebuild.finish");
  });
});

describe("review fixes", () => {
  const fact = (id: string, subject: string, pinned: boolean) => ({ id, text: "fact " + id, subject, knownBy: "all", type: "event", weight: "everyday", pinned, status: "active", src: { from: null, to: null }, origin: "user", at: 1, updatedAt: 1 });

  it("an edited chapter never goes stale and keeps the cut moving when its messages change", () => {
    const msgs = story(16);
    writeChat("c1", msgs);
    const sig = L.chapterSig(line(msgs).slice(0, 8));
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true, counters: { chapter: 1, fact: 0, proposal: 0 }, chapters: [{ id: "c1", from: "m1", to: "m8", count: 8, kind: "scene", label: "Mine", text: "My words.", sig, at: 1, edited: true }] });
    const changed = line(msgs.map((m) => (m.id === "m3" ? { ...m, text: "A swipe changed this." } : m)));
    const st = L.loadChatFile(mockHost().host.fs, "c1");
    expect(L.markStale(st, changed)).toBe(false);
    expect(st.chapters[0].stale).toBeUndefined();
    expect(L.coveredCount(st, changed)).toBe(8);
    // its last message gone: still held, by its count
    expect(L.coveredCount(st, changed.filter((m: any) => m.id !== "m8"))).toBe(8);
  });

  it("a kept-gone scene whose last message is gone is still skipped by its count", () => {
    const msgs = story(16);
    const st = { ...L.emptyChat("c1"), skipScenes: [{ from: "m1", to: "m8", count: 8 }] };
    const ln = line(msgs.filter((m) => m.id !== "m8"));
    expect(L.skipRanges(st, ln)).toEqual([{ fromIdx: 0, toIdx: 7, orphan: false, partial: false }]);
  });

  it("an accepted rewrite becomes the user's wording", () => {
    writeChat("c1", story(2));
    seedRecord("c1", { counters: { chapter: 0, fact: 1, proposal: 1 }, facts: [fact("f1", "Aria", false)], proposals: [{ id: "p1", op: "rewrite", targets: ["f1"], text: "Aria owns the mill.", status: "pending", at: 1 }] });
    const r = route(mockHost().host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(200);
    expect(r.json.facts[0]).toMatchObject({ text: "Aria owns the mill.", edited: true });
  });

  it("a merge keeps only a pin of its own subject", () => {
    writeChat("c1", story(2));
    writeJson("litopys/config.json", { pinLimit: 1 });
    seedRecord("c1", {
      counters: { chapter: 0, fact: 3, proposal: 1 },
      facts: [fact("f1", "Aria", false), fact("f2", "Bran", true), fact("f3", "Aria", true)],
      proposals: [{ id: "p1", op: "merge", targets: ["f1", "f2"], text: "Aria and Bran share the mill.", status: "pending", at: 1 }],
    });
    const r = route(mockHost().host, "POST", "/litopys/proposals", { chatId: "c1", id: "p1", op: "accept" });
    expect(r.status).toBe(200);
    const merged = r.json.facts.find((f: any) => f.origin === "merge");
    expect(merged.subject).toBe("Aria");
    expect(merged.pinned).toBe(false);
    expect(r.json.facts.filter((f: any) => f.pinned && f.subject === "Aria" && f.status === "active")).toHaveLength(1);
  });

  it("a stale inFlight is dropped once no work is left", () => {
    writeChat("c1", story(4));
    seedRecord("c1", { migrated: true, inFlight: { key: "lit_c1_m1_m4", from: "m1", to: "m4", fromNo: 1, toNo: 4, since: 1 } });
    const m = mockHost();
    tick(m);
    expect(readJson("litopys/chats/c1.json").inFlight).toBeUndefined();
    expect(route(m.host, "GET", "/litopys/chat", undefined, { chatId: "c1" }).json.worker.state).toBe("idle");
  });
});

describe("portraits", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  it("stores a small image per lower-cased name and removes it", () => {
    const { host } = mockHost();
    const set = route(host, "POST", "/litopys/portraits", { name: "Aria", url: png });
    expect(set.status).toBe(200);
    expect(set.json).toEqual({ aria: { name: "Aria", url: png } });
    expect(route(host, "GET", "/litopys/portraits").json.aria.url).toBe(png);
    expect(route(host, "POST", "/litopys/portraits", { name: "ARIA", url: null }).json).toEqual({});
  });
  it("refuses anything but a small png, jpeg or webp data URL", () => {
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/portraits", { name: "Aria", url: "https://example.com/a.png" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/portraits", { name: "Aria", url: "data:image/svg+xml;base64,PHN2Zz4=" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/portraits", { name: "Aria", url: "data:image/png;base64," + "A".repeat(400001) }).status).toBe(400);
    expect(route(host, "POST", "/litopys/portraits", { name: "", url: png }).status).toBe(400);
  });
});

describe("chapter size check (M4d)", () => {
  // m1..m8 closed (min 6 messages), m9.. open; story() lines are about 7 words each
  const seed = () => {
    writeChat("c1", story(16));
    writeDash("c1", { m9: { scene: { new: true } } });
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true });
  };
  const long = Array.from({ length: 30 }, (_, i) => `Aria walked the long road number ${i} and thought about the harvest.`).join(" ");

  it("a chapter longer than its messages is asked again, once, shorter; the second answer is kept", () => {
    seed();
    const m = mockHost();
    const ln = line(story(16));
    const limit = L.sizeLimit(ln, { fromIdx: 0, toIdx: 7 });
    const sent = tick(m, [chapterReply("Road", long), chapterReply("Road", "Aria and You talked about the harvest.")]).requests;
    expect(sent.map((x: any) => x.key)).toEqual(["lit_c1_m1_m8", "lit_c1_m1_m8_short"]);
    expect(sent[1].req.systemPrompt).toContain(`at most ${limit} words`);
    const st = readJson("litopys/chats/c1.json");
    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0].text).toBe("Aria and You talked about the harvest.");
    expect(st.sizeRetry).toBeUndefined();
    expect(st.inFlight).toBeUndefined();
  });

  it("a short chapter is kept at once", () => {
    seed();
    const sent = tick(mockHost(), [chapterReply("Talk", "Aria and You talked.")]).requests;
    expect(sent).toHaveLength(1);
    expect(readJson("litopys/chats/c1.json").chapters).toHaveLength(1);
  });

  it("the retry is kept even when still long", () => {
    seed();
    tick(mockHost(), [chapterReply("Road", long), chapterReply("Road", long)]);
    expect(readJson("litopys/chats/c1.json").chapters).toHaveLength(1);
  });

  it("counts words, not spaces or punctuation", () => {
    expect(L.wordCount("  Aria — went   home.  ")).toBe(3);
    expect(L.sizeLimit(line(story(2)), { fromIdx: 0, toIdx: 1 })).toBe(20);
  });
});

describe("originals (M4d)", () => {
  it("GET /litopys/messages gives the range read-only, with numbers and names", () => {
    writeChat("c1", story(10));
    const { host } = mockHost();
    const r = route(host, "GET", "/litopys/messages", undefined, { chatId: "c1", from: "m3", to: "m5" });
    expect(r.status).toBe(200);
    expect(r.json.items.map((m: any) => [m.id, m.no, m.name])).toEqual([["m3", 3, "You"], ["m4", 4, "Aria"], ["m5", 5, "You"]]);
    expect(r.json.more).toBe(false);
    expect(route(host, "GET", "/litopys/messages", undefined, { chatId: "c1", from: "gone" }).status).toBe(404);
    expect(route(host, "GET", "/litopys/messages", undefined, { chatId: "../x", from: "m1" }).status).toBe(400);
  });

  it("GET /litopys/search looks in the original messages, newest first, with the chapter that holds a hit", () => {
    const msgs = story(10);
    writeChat("c1", msgs);
    writeJson("litopys/chats/c1.json", {
      ...L.emptyChat("c1"),
      migrated: true,
      chapters: [{ id: "c1", from: "m1", to: "m6", count: 6, kind: "scene", label: "Harvest", text: "x", sig: L.chapterSig(line(msgs).slice(0, 6)) }],
    });
    const { host } = mockHost();
    const r = route(host, "GET", "/litopys/search", undefined, { chatId: "c1", q: "LINE 4 " });
    expect(r.status).toBe(200);
    expect(r.json.hits.map((h: any) => h.no)).toEqual([4]);
    expect(r.json.hits[0].chapter).toMatchObject({ id: "c1", label: "Harvest" });
    const all = route(host, "GET", "/litopys/search", undefined, { chatId: "c1", q: "harvest" }).json.hits;
    expect(all.map((h: any) => h.no)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(all[0].chapter).toBeNull();
    expect(route(host, "GET", "/litopys/search", undefined, { chatId: "c1", q: "a" }).status).toBe(400);
  });
});
