/**
 * A chat's transcript on disk (src/lib/chat-store.js, Molfar.Vertep#537): the chosen text is stored once, a long chat
 * keeps its older messages in closed parts and a send rewrites only the live tail, a reader that comes in the middle of a
 * save sees no hole, and the copies pasted into the plugins match the source.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import * as S from "../src/lib/chat-store.js";
import { PLUGINS, outOfDate } from "../scripts/sync-chat-store";
import { env, useRoot, mockHost, abs, exists, readJson } from "./rp-memory-m2-kit";

useRoot();

const LIMIT = 4 * 1024 * 1024;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = Record<string, any>;

/** A host fs on the temp dir, with stat (as the engine's) and a log of every write. */
function host(opts: { limited?: boolean } = {}) {
  const m = mockHost();
  const fsx = m.host.fs;
  const writes: string[] = [];
  const write = fsx.write;
  fsx.write = (rel: string, content: string) => {
    if (opts.limited && Buffer.byteLength(content) >= LIMIT) throw new Error("fs.write content too large (4MB)");
    writes.push(rel);
    write(rel, content);
  };
  fsx.stat = (rel: string | string[]) => {
    const one = (r: string) => {
      try {
        const st = fs.statSync(path.resolve(env.root, r));
        return { size: st.isDirectory() ? 0 : st.size, mtimeMs: Math.floor(st.mtimeMs), dir: st.isDirectory() };
      } catch {
        return null;
      }
    };
    return Array.isArray(rel) ? rel.map(one) : one(rel);
  };
  return { m, fsx, writes };
}

/** n engine-shaped messages: user and character in turn, the replies with a swipe or two now and then. */
function chat(n: number, size = 80, prefix = "m"): M[] {
  return Array.from({ length: n }, (_, i) => {
    const id = prefix + (i + 1);
    const text = (i % 2 ? "Aria answers " : "You say ") + "line " + (i + 1) + " " + "about the harvest ".repeat(Math.max(1, Math.floor(size / 18)));
    if (i % 2 === 0) return { id, name: "You", role: "user", text, at: 1000 + i, swipes: [text], swipe: 0 };
    const swipes = i % 7 === 1 ? ["An earlier take " + i, text, "A later take " + i] : [text];
    const swipe = swipes.indexOf(text);
    return { id, name: "Aria", charId: "aria", role: "char", text, at: 1000 + i, swipes, swipe, extra: { model: "x/y", swipeMeta: swipes.map(() => ({ model: "x/y" })) } };
  });
}
const meta = (id: string, extra: M = {}) => ({ id, title: "Test", characterId: "aria", userName: "You", createdAt: 1, updatedAt: 1, ...extra });
const ids = (msgs: M[]) => msgs.map((m) => m.id);
const lines = (rel: string) => fs.readFileSync(abs(rel), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const partFiles = (id: string) => (exists(`chats/${id}.parts`) ? fs.readdirSync(abs(`chats/${id}.parts`)).sort((a, b) => parseInt(a) - parseInt(b)) : []);
/** Save, then read back the way every plugin does. */
function roundTrip(fsx: M, id: string, msgs: M[], mt: M = meta(id)) {
  S.chatSave(fsx, id, mt, msgs);
  return S.chatRead(fsx, id)!;
}

describe("one copy of the chosen text", () => {
  it("a reply's chosen swipe is stored as null and comes back whole", () => {
    const m = { id: "a", role: "char", text: "Two", swipes: ["One", "Two", "Three"], swipe: 1, extra: { swipeMeta: [{}, {}, {}] } };
    const packed = S.chatPack(m);
    expect(packed.swipes).toEqual(["One", null, "Three"]);
    expect(packed.text).toBe("Two");
    expect(m.swipes).toEqual(["One", "Two", "Three"]); // the message itself is not changed
    expect(S.chatUnpack(JSON.parse(JSON.stringify(packed)))).toEqual(m);
  });
  it("a message with one version stores no swipes", () => {
    const m = { id: "u", role: "user", text: "Hello", swipes: ["Hello"], swipe: 0 };
    const packed = S.chatPack(m);
    expect("swipes" in packed).toBe(false);
    expect(S.chatUnpack(JSON.parse(JSON.stringify(packed)))).toEqual(m);
  });
  it("a greeting keeps both: its swipes are raw, its text has the macros filled in", () => {
    const m = { id: "g", role: "char", greeting: true, text: "Hello, Mira.", swipes: ["Hello, {{user}}.", "Hi, {{user}}."], swipe: 0 };
    expect(S.chatPack(m)).toBe(m);
    expect(S.chatUnpack({ ...m, swipes: [...m.swipes] })).toEqual(m);
  });
  it("a message without swipes or a swipe index is left as it is", () => {
    const m = { id: "s", role: "system", text: "A note." };
    expect(S.chatPack(m)).toBe(m);
    expect(S.chatUnpack({ ...m })).toEqual(m);
  });
  it("a long chat with many single-version messages is about a third smaller on disk", () => {
    const { fsx } = host();
    const msgs = chat(120, 1500);
    const before = msgs.map((m) => JSON.stringify(m)).join("\n").length;
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    const after = fs.readFileSync(abs("chats/c1.jsonl"), "utf8").length;
    expect(after).toBeLessThan(before * 0.6);
    expect(S.chatRead(fsx, "c1")!.msgs).toEqual(msgs);
  });
});

describe("a short chat", () => {
  it("stays one file, and its meta carries what the chat list shows", () => {
    const { fsx } = host();
    const msgs = chat(30);
    const back = roundTrip(fsx, "c1", msgs);
    expect(back.msgs).toEqual(msgs);
    expect(exists("chats/c1.parts")).toBe(false);
    const t = readJson("chats/c1.meta.json").transcript;
    expect(t).toMatchObject({ v: 1, count: 30, hasUser: true, parts: [] });
    expect(t.preview).toBe(msgs[29].text.slice(0, 160));
    expect(t.tailSize).toBe(fs.statSync(abs("chats/c1.jsonl")).size);
  });
  it("an old file with both copies reads as before and takes the new shape on its first save", () => {
    const { fsx } = host();
    const msgs = chat(40);
    fs.writeFileSync(abs("chats/c1.meta.json"), JSON.stringify(meta("c1")));
    fs.writeFileSync(abs("chats/c1.jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
    const old = S.chatRead(fsx, "c1")!;
    expect(old.msgs).toEqual(msgs);
    S.chatSave(fsx, old.meta.id, old.meta, old.msgs);
    expect(lines("chats/c1.jsonl").filter((l) => "swipes" in l).every((l) => l.swipes.includes(null))).toBe(true);
    expect(S.chatRead(fsx, "c1")!.msgs).toEqual(msgs);
  });
  it("a line that does not parse is left out, the rest is read", () => {
    const { fsx } = host();
    const msgs = chat(6);
    fs.writeFileSync(abs("chats/c1.meta.json"), JSON.stringify(meta("c1")));
    const text = msgs.map((m) => JSON.stringify(m));
    text.splice(3, 0, "{not json");
    fs.writeFileSync(abs("chats/c1.jsonl"), text.join("\n") + "\n");
    expect(ids(S.chatRead(fsx, "c1")!.msgs)).toEqual(ids(msgs));
  });
});

describe("a long chat in parts", () => {
  it("keeps its older messages in closed parts and the newest in the tail", () => {
    const { fsx } = host();
    const msgs = chat(450);
    const back = roundTrip(fsx, "c1", msgs);
    expect(back.msgs).toEqual(msgs);
    expect(partFiles("c1")).toEqual(["1.jsonl", "2.jsonl", "3.jsonl"]);
    expect(lines("chats/c1.parts/1.jsonl").map((m) => m.id)).toEqual(ids(msgs.slice(0, 100)));
    expect(lines("chats/c1.jsonl").map((m) => m.id)).toEqual(ids(msgs.slice(300)));
    const t = readJson("chats/c1.meta.json").transcript;
    expect(t.count).toBe(450);
    expect(t.parts.map((p: M) => [p.n, p.count, p.first, p.last])).toEqual([[1, 100, "m1", "m100"], [2, 100, "m101", "m200"], [3, 100, "m201", "m300"]]);
    expect(t.tailFirst).toBe("m301");
  });
  it("a send rewrites only the tail and the meta", () => {
    const { fsx, writes } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    const chatNow = S.chatRead(fsx, "c1")!;
    writes.length = 0;
    chatNow.msgs.push({ id: "new1", role: "user", name: "You", text: "And then?", at: 9, swipes: ["And then?"], swipe: 0 });
    S.chatSave(fsx, "c1", chatNow.meta, chatNow.msgs);
    expect(writes).toEqual(["chats/c1.jsonl", "chats/c1.meta.json"]);
    // a save of a copied array reads the parts to tell, and still writes only the tail
    writes.length = 0;
    const again = S.chatRead(fsx, "c1")!;
    S.chatSave(fsx, "c1", again.meta, [...again.msgs, { id: "new2", role: "char", name: "Aria", text: "Then the mill.", at: 10, swipes: ["Then the mill."], swipe: 0 }]);
    expect(writes).toEqual(["chats/c1.jsonl", "chats/c1.meta.json"]);
  });
  it("a tail that grows too long closes a new part, written before the tail gives its messages up", () => {
    const { fsx, writes } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(300));
    expect(partFiles("c1")).toEqual(["1.jsonl"]);
    const c = S.chatRead(fsx, "c1")!;
    writes.length = 0;
    c.msgs.push(...chat(1, 80, "x"));
    S.chatSave(fsx, "c1", c.meta, c.msgs);
    expect(writes).toEqual(["chats/c1.parts/2.jsonl", "chats/c1.meta.json", "chats/c1.jsonl", "chats/c1.meta.json"]);
    expect(lines("chats/c1.jsonl").length).toBe(101);
    expect(S.chatRead(fsx, "c1")!.msgs.length).toBe(301);
  });
  it("an edit of an old message rewrites its part only", () => {
    const { fsx, writes } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    const c = S.chatRead(fsx, "c1")!;
    writes.length = 0;
    c.msgs[150] = { ...c.msgs[150], text: "Edited.", swipes: ["Edited."], swipe: 0 };
    S.chatSave(fsx, "c1", c.meta, c.msgs);
    expect(writes).toEqual(["chats/c1.parts/2.jsonl", "chats/c1.meta.json"]);
    expect(S.chatRead(fsx, "c1")!.msgs[150].text).toBe("Edited.");
  });
  it("a deleted last message of a part moves the part's end, and keeps its number", () => {
    const { fsx } = host();
    const msgs = chat(450);
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    const c = S.chatRead(fsx, "c1")!;
    const kept = c.msgs.filter((m) => m.id !== "m100");
    S.chatSave(fsx, "c1", c.meta, kept);
    expect(partFiles("c1")).toEqual(["1.jsonl", "2.jsonl", "3.jsonl"]);
    expect(lines("chats/c1.parts/1.jsonl").map((m) => m.id)).toEqual(ids(msgs.slice(0, 99)));
    expect(ids(S.chatRead(fsx, "c1")!.msgs)).toEqual(ids(kept));
  });
  it("a deletion across two parts joins them; an emptied part goes", () => {
    const { fsx } = host();
    const msgs = chat(450);
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    let c = S.chatRead(fsx, "c1")!;
    // m100 (part 1's last) and m101 (part 2's first) both go: part 1 runs on into part 2
    let kept = c.msgs.filter((m) => m.id !== "m100" && m.id !== "m101");
    S.chatSave(fsx, "c1", c.meta, kept);
    expect(readJson("chats/c1.meta.json").transcript.parts.map((p: M) => p.n)).toEqual([1, 3]);
    expect(partFiles("c1")).toEqual(["1.jsonl", "3.jsonl"]);
    expect(ids(S.chatRead(fsx, "c1")!.msgs)).toEqual(ids(kept));
    // every message of part 3 goes
    c = S.chatRead(fsx, "c1")!;
    kept = c.msgs.filter((m) => !/^m(2[0-9][0-9]|300)$/.test(m.id) || m.id === "m200");
    S.chatSave(fsx, "c1", c.meta, kept);
    expect(ids(S.chatRead(fsx, "c1")!.msgs)).toEqual(ids(kept));
  });
  it("a chat cut back below the limit is one file again", () => {
    const { fsx } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    const c = S.chatRead(fsx, "c1")!;
    const kept = c.msgs.slice(0, 120);
    S.chatSave(fsx, "c1", c.meta, kept);
    expect(exists("chats/c1.parts")).toBe(false);
    expect(readJson("chats/c1.meta.json").transcript.parts).toEqual([]);
    expect(ids(S.chatRead(fsx, "c1")!.msgs)).toEqual(ids(kept));
  });
  it("a meta written without the record still finds its parts, and the next save puts things right", () => {
    const { fsx } = host();
    const msgs = chat(450);
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    const mt = readJson("chats/c1.meta.json");
    delete mt.transcript;
    fs.writeFileSync(abs("chats/c1.meta.json"), JSON.stringify(mt));
    const c = S.chatRead(fsx, "c1")!;
    expect(ids(c.msgs)).toEqual(ids(msgs));
    S.chatSave(fsx, "c1", c.meta, c.msgs);
    expect(partFiles("c1")).toEqual(["4.jsonl", "5.jsonl", "6.jsonl"]);
    expect(S.chatRead(fsx, "c1")!.msgs).toEqual(msgs);
  });
  it("a 5 MB chat saves under the engine's 4 MB write cap", () => {
    const { fsx } = host({ limited: true });
    const msgs = chat(700, 7500);
    expect(Buffer.byteLength(msgs.map((m) => JSON.stringify(m)).join("\n"))).toBeGreaterThan(5 * 1024 * 1024);
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    expect(S.chatRead(fsx, "c1")!.msgs).toEqual(msgs);
  });
  it("chatRemove takes the tail and every part", () => {
    const { fsx } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    S.chatRemove(fsx, "c1");
    expect(exists("chats/c1.jsonl") || exists("chats/c1.parts")).toBe(false);
    expect(exists("chats/c1.meta.json")).toBe(true);
  });
});

describe("a reader in the middle of a save", () => {
  /** Every write of the save is followed by a read; whatever the reader sees must hold every message the old and the new
   *  chat share, once each and in order. */
  function watch(start: M[], change: (msgs: M[]) => M[]) {
    const { fsx } = host();
    S.chatSave(fsx, "c1", meta("c1"), start);
    const c = S.chatRead(fsx, "c1")!;
    const next = change(c.msgs);
    const both = new Set(ids(start).filter((x) => ids(next).includes(x)));
    const seen: string[][] = [];
    const write = fsx.write;
    fsx.write = (rel: string, content: string) => {
      seen.push(ids(S.chatMessages(fsx, "c1")));
      write(rel, content);
    };
    S.chatSave(fsx, "c1", c.meta, next);
    fsx.write = write;
    seen.push(ids(S.chatMessages(fsx, "c1")));
    const order = ids(next);
    for (const view of seen) {
      expect(new Set(view).size).toBe(view.length);
      for (const x of both) expect(view).toContain(x);
      const common = view.filter((x) => both.has(x));
      expect(common).toEqual(order.filter((x) => both.has(x)));
    }
    expect(seen.at(-1)).toEqual(order);
  }
  it("when a part closes", () => watch(chat(300), (m) => [...m, ...chat(1, 80, "x")]));
  it("when parts join", () => watch(chat(450), (m) => m.filter((x) => x.id !== "m100" && x.id !== "m101")));
  it("when the chat becomes one file again", () => watch(chat(450), (m) => m.slice(0, 150)));
  it("when a chat grows past the limit at once (an import)", () => watch(chat(150), (m) => [...m, ...chat(300, 80, "y")]));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eng = (await import("../plugins/engine/plugin.js")) as any;
describe("the engine", () => {
  it("lists chats from their metas, and reads a tail changed behind the meta's back", () => {
    const { m, fsx } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    S.chatSave(fsx, "c2", meta("c2"), chat(4));
    const reads: string[] = [];
    const read = fsx.read;
    fsx.read = (rel: string) => {
      reads.push(rel);
      return read(rel);
    };
    let list = eng.handleRoute({ method: "GET", path: "/chats", query: {} }, m.host).json.chats;
    const c1 = list.find((c: M) => c.id === "c1");
    expect(c1).toMatchObject({ messageCount: 450, hasUser: true });
    expect(c1.transcript).toBeUndefined();
    expect(reads.filter((r) => r.endsWith(".jsonl"))).toEqual([]);
    fs.appendFileSync(abs("chats/c2.jsonl"), JSON.stringify({ id: "z", role: "char", name: "Aria", text: "Added by hand." }) + "\n");
    list = eng.handleRoute({ method: "GET", path: "/chats", query: {} }, m.host).json.chats;
    expect(list.find((c: M) => c.id === "c2")).toMatchObject({ messageCount: 5, preview: "Added by hand." });
  });
  it("a message added to a long chat writes the tail and the meta, a deleted chat takes its parts", () => {
    const { m, fsx, writes } = host();
    S.chatSave(fsx, "c1", meta("c1"), chat(450));
    writes.length = 0;
    const r = eng.handleRoute({ method: "POST", path: "/chats/c1/messages", query: {}, body: { role: "user", text: "Hello again." } }, m.host);
    expect(r.status).toBe(201);
    expect(writes.filter((w) => w.startsWith("chats/"))).toEqual(["chats/c1.jsonl", "chats/c1.meta.json"]);
    expect(S.chatRead(fsx, "c1")!.msgs.length).toBe(451);
    eng.handleRoute({ method: "DELETE", path: "/chats/c1", query: {} }, m.host);
    expect(exists("chats/c1.jsonl") || exists("chats/c1.parts") || exists("chats/c1.meta.json")).toBe(false);
  });
  it("GET /chats/:id gives every message in its full shape", () => {
    const { m, fsx } = host();
    const msgs = chat(450);
    S.chatSave(fsx, "c1", meta("c1"), msgs);
    expect(eng.handleRoute({ method: "GET", path: "/chats/c1", query: {} }, m.host).json.messages).toEqual(msgs);
  });
});

describe("the copies in the plugins", () => {
  it("every plugin that touches transcripts carries the current store", () => {
    expect(PLUGINS.length).toBe(10);
    expect(outOfDate()).toEqual([]);
  });
  it("no plugin reads or writes a transcript file outside the store", () => {
    for (const rel of PLUGINS) {
      const src = fs.readFileSync(rel, "utf8");
      const outside = src.slice(0, src.indexOf("// ==== BEGIN GENERATED: src/lib/chat-store.js")) + src.slice(src.indexOf("// ==== END GENERATED: chat-store ===="));
      expect(outside).not.toMatch(/fsx\.(read|write)\("chats\/" \+ \w+ \+ "\.jsonl"/);
    }
  });
});
