/**
 * Entity registry phase B1: every thing of the Dashboard (worn, held, lying in the scene) has one registry id (t1, t2 ...)
 * that follows it, and the scene's place has a place id (l1 ...). A thing is in one place only; the objects of a place the
 * story left wait under its id; a state from before the ids is migrated once.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-things-"));
  for (const d of ["chats", "dashboard", "litopys", "groups"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

function mockHost(replies: string[] = []) {
  const results: Record<string, unknown> = {};
  let pending: string[] = [];
  const queue = replies.slice();
  const requests: { key: string; req: any }[] = [];
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string, req: any) => {
        pending.push(key);
        requests.push({ key, req });
      },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const key of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] = { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 };
    }
    pending = [];
  };
  return { host, answer, requests, push: (...r: string[]) => queue.push(...r) };
}
type Mock = ReturnType<typeof mockHost>;

function drive(mock: Mock, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as any;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host);
  }
  return out;
}

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
function chat(id: string, turns: number) {
  const msgs: Msg[] = [];
  for (let i = 0; i < turns; i++) msgs.push({ id: "u" + i, role: "user", name: "You", text: "Go on " + i + "." }, { id: "a" + i, role: "char", name: "Aria", text: "She does something " + i + ".", swipe: 0 });
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, userName: "You", model: "chat/model", updatedAt: Date.now() }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}

const stateFile = (id: string) => path.join(root, "dashboard/state", id + ".json");
const readState = (id: string) => JSON.parse(fs.readFileSync(stateFile(id), "utf8"));
const readRegistry = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "registry", id + ".json"), "utf8"));
const snaps = (id: string) => Object.values(readState(id).snapshots as Record<string, any>).sort((a, b) => a.turn - b.turn);
const lastSnap = (id: string) => snaps(id).at(-1);

/** A story with the same people in every turn: each call is one more turn with the scripted sensor report. */
function story() {
  const mock = mockHost();
  let turn = 0;
  const play = (o: Record<string, unknown>) => {
    chat("c1", ++turn);
    mock.push(JSON.stringify({ minutes: 5, present: ["Aria", "Bram"], ...o }));
    const out = drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c1", op: "send" } });
    expect(out.json.ok).toBe(true);
    return lastSnap("c1");
  };
  const lastPrompt = () => String(mock.requests.at(-1)!.req.messages[0].content);
  return { mock, play, lastPrompt };
}
const itemsOf = (snap: any, who: string) => (snap.chars[who]?.items ?? []).map((i: any) => i.id + " " + i.text);
const objectsOf = (snap: any) => (snap.layout.objects ?? []).map((o: any) => o.id + " " + o.item + (o.where ? " (" + o.where + ")" : ""));

describe("a thing keeps one registry id", () => {
  it("taken off with a place and picked up again: the same id, in the registry and in the Previous state", () => {
    const { play, lastPrompt } = story();
    let snap = play({ chars: { Aria: { outfit: { see: [{ text: "white sneakers" }, { text: "grey skirt" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual(["t1 white sneakers", "t2 grey skirt"]);
    snap = play({ chars: { Aria: { outfit: { off: [{ id: "t1", where: "at the entrance" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual(["t2 grey skirt"]);
    expect(objectsOf(snap)).toEqual(["t1 white sneakers (at the entrance)"]);
    snap = play({ chars: { Aria: { mood: "calm" } } });
    expect(lastPrompt()).toContain("Wearing: t2 grey skirt");
    expect(lastPrompt()).toContain("Objects here: t1 white sneakers (at the entrance).");
    // she puts them on again by their id
    snap = play({ chars: { Aria: { outfit: { see: [{ id: "t1" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual(["t2 grey skirt", "t1 white sneakers"]);
    expect(objectsOf(snap)).toEqual([]);
    const reg = readRegistry("c1");
    expect(reg.entities.filter((e: any) => e.kind === "thing").map((e: any) => e.id)).toEqual(["t1", "t2"]);
  });

  it("an axe handed from one character to another moves its id", () => {
    const { play } = story();
    play({ chars: { Aria: { holding: { see: [{ text: "an axe" }] } } } });
    const snap = play({ chars: { Aria: { holding: { off: [{ id: "t1" }] } }, Bram: { holding: { see: [{ id: "t1" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual([]);
    expect(itemsOf(snap, "Bram")).toEqual(["t1 an axe"]);
    expect(objectsOf(snap)).toEqual([]);
  });

  it("a see on the receiver alone is enough: the thing leaves the giver, and is never held twice", () => {
    const { play } = story();
    play({ chars: { Aria: { holding: { see: [{ text: "an axe" }] } } } });
    const snap = play({ chars: { Bram: { holding: { see: [{ id: "t1" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual([]);
    expect(itemsOf(snap, "Bram")).toEqual(["t1 an axe"]);
    expect(snap.chars.Aria.holding).toBeNull();
  });

  it("a thing is never both held and lying around: picked up from the floor by id, or reported lying while held", () => {
    const { play } = story();
    play({ chars: { Aria: { holding: { see: [{ text: "an axe" }] } } } });
    let snap = play({ chars: { Aria: { holding: { off: [{ id: "t1", where: "on the floor" }] } } } });
    expect(objectsOf(snap)).toEqual(["t1 an axe (on the floor)"]);
    snap = play({ chars: { Bram: { holding: { see: [{ id: "t1" }] } } } });
    expect(objectsOf(snap)).toEqual([]);
    expect(itemsOf(snap, "Bram")).toEqual(["t1 an axe"]);
    // the sensor lists it among the objects again by mistake: the holder wins
    snap = play({ objects: { add: [{ id: "t1", where: "on the table" }, { text: "axe", where: "on the table" }] } });
    expect(objectsOf(snap)).toEqual([]);
    expect(itemsOf(snap, "Bram")).toEqual(["t1 an axe"]);
  });

  it("off without where takes the thing off her and invents no place", () => {
    const { play } = story();
    play({ chars: { Aria: { outfit: { see: [{ text: "red scarf" }] } } } });
    const snap = play({ chars: { Aria: { outfit: { off: [{ id: "t1" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual([]);
    expect(objectsOf(snap)).toEqual([]);
    expect(snap.chars.Aria.outfit).toBeNull();
  });

  it("words without an id find the lying thing; an object add by words after an off without where is the same thing", () => {
    const { play } = story();
    play({ chars: { Aria: { outfit: { see: [{ text: "white sneakers" }] } } } });
    let snap = play({ chars: { Aria: { outfit: { off: [{ id: "t1" }] } } }, objects: { add: [{ text: "sneakers", where: "by the door" }] } });
    expect(objectsOf(snap)).toEqual(["t1 white sneakers (by the door)"]);
    // she picks them up again, said in words only
    snap = play({ chars: { Aria: { holding: { see: [{ text: "sneakers" }] } } } });
    expect(itemsOf(snap, "Aria")).toEqual(["t1 white sneakers"]);
    expect(objectsOf(snap)).toEqual([]);
    // a new object is new; move and remove work by id
    snap = play({ objects: { add: [{ text: "oil lamp", where: "on the shelf" }] } });
    expect(objectsOf(snap)).toEqual(["t2 oil lamp (on the shelf)"]);
    snap = play({ objects: { move: [{ id: "t2", where: "on the table" }] } });
    expect(objectsOf(snap)).toEqual(["t2 oil lamp (on the table)"]);
    snap = play({ objects: { remove: ["t2"] } });
    expect(objectsOf(snap)).toEqual([]);
  });

  it("the older sensor formats still work: { add, remove } for clothes, { item } for objects", () => {
    const { play } = story();
    play({ chars: { Aria: { outfit: { add: ["pink cardigan", "grey jeans"] } } }, objects: { add: [{ item: "armchair", where: "by the window" }] } });
    const snap = play({ chars: { Aria: { outfit: { remove: ["cardigan"] } } }, objects: { add: [{ item: "cardigan", where: "on the sofa" }], remove: ["armchair"] } });
    expect(itemsOf(snap, "Aria")).toEqual(["t2 grey jeans"]);
    expect(objectsOf(snap)).toEqual(["t1 pink cardigan (on the sofa)"]);
  });
});

describe("places", () => {
  it("the place id is kept, a respelling of the same place is not a move, another place is", () => {
    const { play } = story();
    let snap = play({ place: "the hall", objects: { add: [{ text: "oil lamp", where: "on the shelf" }] } });
    expect(snap.clock.placeId).toBe("l1");
    snap = play({ place: "hall" });
    expect(snap.clock.placeId).toBe("l1");
    expect(objectsOf(snap)).toEqual(["t1 oil lamp (on the shelf)"]);
    snap = play({ place: "the garden" });
    expect(snap.clock.placeId).toBe("l2");
    expect(objectsOf(snap)).toEqual([]);
    expect(readRegistry("c1").entities.filter((e: any) => e.kind === "place").map((e: any) => e.id)).toEqual(["l1", "l2"]);
  });

  it("leaving a place keeps its objects under the place id, and coming back returns them; a thing taken along is not left behind", () => {
    const { play } = story();
    play({ place: "the hall", objects: { add: [{ text: "oil lamp", where: "on the shelf" }, { text: "brass key", where: "on the floor" }] } });
    let snap = play({ place: "the garden", objects: { add: [{ text: "watering can", where: "by the gate" }] } });
    expect(objectsOf(snap)).toEqual(["t3 watering can (by the gate)"]);
    expect(snap.layout.byPlace.l1.map((o: any) => o.id)).toEqual(["t1", "t2"]);
    // back in the hall: its objects are there again, the garden's wait
    snap = play({ place: "the hall" });
    expect(objectsOf(snap)).toEqual(["t1 oil lamp (on the shelf)", "t2 brass key (on the floor)"]);
    expect(snap.layout.byPlace.l2.map((o: any) => o.id)).toEqual(["t3"]);
    expect(snap.layout.byPlace.l1).toBeUndefined();
    // she takes the key and walks out: it is hers, not left in the hall
    snap = play({ chars: { Aria: { holding: { see: [{ id: "t2" }] } } } });
    snap = play({ place: "the garden" });
    expect(itemsOf(snap, "Aria")).toEqual(["t2 brass key"]);
    expect(objectsOf(snap)).toEqual(["t3 watering can (by the gate)"]);
    expect(snap.layout.byPlace.l1.map((o: any) => o.id)).toEqual(["t1"]);
  });

  it("without place ids the words decide, as before", () => {
    expect(P.advanceClock({ place: "the hall" }, { place: "the hall" }, "send").place).toBe("the hall");
  });
});

describe("a state from before the registry ids", () => {
  it("gets stable ids across snapshots, and is written back with them", () => {
    const { play } = story();
    play({ place: "the hall", chars: { Aria: { outfit: { see: [{ text: "white sneakers" }, { text: "grey skirt" }] } } } });
    play({ chars: { Aria: { outfit: { off: [{ id: "t1", where: "at the entrance" }] } } } });
    play({ chars: { Aria: { mood: "calm" } } });
    // make the file look like an older one: i1, i2 per character, objects without ids, no place ids, no registry
    const st = readState("c1");
    for (const sn of Object.values(st.snapshots as Record<string, any>)) {
      for (const c of Object.values(sn.chars as Record<string, any>)) {
        c.items = (c.items ?? []).map((i: any) => ({ ...i, id: i.text.includes("sneakers") ? "i1" : "i2" }));
        c.itemSeq = 2;
      }
      sn.layout.objects = (sn.layout.objects ?? []).map((o: any) => ({ item: o.item, where: o.where }));
      delete sn.clock.placeId;
    }
    delete st.thingIds;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st));
    fs.rmSync(path.join(root, "registry"), { recursive: true, force: true });

    const mock = mockHost();
    chat("c1", 4);
    mock.push(JSON.stringify({ minutes: 5, present: ["Aria"], chars: { Aria: { outfit: { see: [{ id: "i1" }] } } } }));
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c1", op: "send" } }).json.ok).toBe(true);

    const all = snaps("c1");
    const idsOf = (sn: any, text: string) => [...(sn.chars.Aria.items ?? []), ...(sn.layout.objects ?? [])].filter((x: any) => (x.text ?? x.item).includes(text)).map((x: any) => x.id);
    // the skirt is the same thing in every snapshot (the migrated three and the new one)
    const skirt = all.map((sn) => idsOf(sn, "skirt")[0]);
    expect(new Set(skirt).size).toBe(1);
    expect(skirt[0]).toMatch(/^t\d+$/);
    // the sneakers: worn in the first snapshot, lying in the second and third, and the sensor's old id i1 puts them on again in the fourth
    const sneakers = all.map((sn) => idsOf(sn, "sneakers")[0]);
    expect(sneakers[0]).toMatch(/^t\d+$/);
    expect(new Set(sneakers).size).toBe(1);
    expect(all.at(-1).chars.Aria.items.map((i: any) => i.text)).toContain("white sneakers");
    expect(all.at(-1).layout.objects).toEqual([]);
    // the ids were written back, with the place ids and the registry
    expect(all.every((sn) => /^l\d+$/.test(sn.clock.placeId))).toBe(true);
    expect(readRegistry("c1").entities.filter((e: any) => e.kind === "thing").length).toBeGreaterThanOrEqual(2);
    expect(Object.values(readState("c1").thingIds as Record<string, string>)).toContain(skirt[0]);
  });
});
