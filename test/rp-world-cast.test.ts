/**
 * World DM cast (#424): a person who has been away comes back. Silence is counted by the registry id first (the Dashboard's
 * scene), then by names; a 2d6 plus the silence and the person's weight sets how big the return is; the writing model gets a
 * firm note; code checks the person came and asks once more, stricter; a swipe rolls the same; every step is in the log.
 */
import { describe, expect, it } from "bun:test";
import {
  applyBench, benchConstant, benchDue, benchEntries, castIdentity, castThreshold, emptyState, entranceInsert, handleRoute, judgeEntrance, llmRequest, normalizeState,
  planEntrance, rollEntrance, silenceOf, weightOf, writeBook,
} from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, any> = {};
  const asked: string[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string) => { asked.push(key); }, results },
  };
  return { host, files, results, asked };
}
type M = ReturnType<typeof memHost>;

const msg = (i: number, role: string, text: string, swipe = 0) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe });
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
/** n messages alternating user and char; none names Olya. */
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, k) => msg(from + k, (from + k) % 2 === 0 ? "user" : "char", "The road goes on, nothing new."));
const KEY = (i: number) => "m" + i + "#0";
/** 100 messages are 50 replies, past the longest threshold (normal: 30, up to a quarter more). */
const N = 100;

const OLYA = { id: "n1", kind: "person", name: "Olya", aliases: ["Olya K"], text: "Taras's best friend from school. She writes to him often.", status: "active", uid: 0, at: 1, weight: 1, relation: "ally" };
const REG = (extra: object[] = []) => JSON.stringify({
  v: 1, chatId: "c1", from: null, next: { p: 4, o: 1, l: 1 }, apart: [], suggest: [],
  entities: [
    { id: "user", kind: "person", name: "Taras", aliases: [], src: "persona" },
    { id: "p1", kind: "person", name: "Odarka", aliases: [], src: "card" },
    { id: "p2", kind: "person", name: "Olya", aliases: [{ text: "Olechka", src: "world" }], src: "world" },
    { id: "p3", kind: "person", name: "Maksym", aliases: [{ text: "Olechka", src: "seen" }], src: "world" },
    ...extra,
  ],
});

function setup(msgs: object[], over: Record<string, unknown> = {}, files: Record<string, string> = {}): M {
  const st = { ...emptyState("c1"), settings: { level: "chronicler", everyN: 5, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "normal" }, entities: [OLYA], nextId: 2, regIds: { n1: "p2" }, ...over };
  return memHost({
    "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
    "chats/c1.jsonl": jsonl(msgs),
    "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    "settings.json": JSON.stringify({ model: "c/default" }),
    "registry/c1.json": REG(),
    "world/state/c1.json": JSON.stringify(st),
    ...files,
  });
}
const state = (m: M) => JSON.parse(m.files["world/state/c1.json"]!);
const rolls = (m: M) => (m.files["world/dice/c1.json"] ? JSON.parse(m.files["world/dice/c1.json"]!).rolls : []);
const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go on." }] }, turn: { op } });
const text = (out: any) => (out ? out.messages[out.messages.length - 1].content : "");
const reg = () => JSON.parse(REG());

describe("the shape of a person record", () => {
  const norm = (entities: object[]) => normalizeState({ entities }, "c1").entities;
  it("keeps relation, weight, link and the switch on a person; drops what is not allowed", () => {
    const [p] = norm([{ ...OLYA, link: { book: "b1", uid: 12, title: "Olya" }, noReturn: true }]);
    expect(p).toMatchObject({ relation: "ally", weight: 1, link: { book: "b1", uid: 12, title: "Olya" }, noReturn: true, status: "active" });
    const [bad] = norm([{ ...OLYA, relation: "boss", weight: 5, link: { book: "b1", uid: "x" } }]);
    expect(bad).not.toHaveProperty("relation");
    expect(bad).not.toHaveProperty("weight");
    expect(bad).not.toHaveProperty("link");
  });
  it("a place carries none of it; a group has a relation and a weight but no link or switch", () => {
    const [place] = norm([{ id: "n2", kind: "place", name: "Tower", text: "x", relation: "ally", weight: 2, noReturn: true }]);
    expect(place).not.toHaveProperty("relation");
    expect(place).not.toHaveProperty("noReturn");
    const [group] = norm([{ id: "n3", kind: "group", name: "Bandits", text: "x", relation: "enemy", weight: 2, noReturn: true, link: { book: "b", uid: 1 } }]);
    expect(group).toMatchObject({ relation: "enemy", weight: 2 });
    expect(group).not.toHaveProperty("noReturn");
    expect(group).not.toHaveProperty("link");
  });
  it("dormant is a status of its own; an unknown one is active", () => {
    expect(norm([{ ...OLYA, status: "dormant" }])[0]!.status).toBe("dormant");
    expect(norm([{ ...OLYA, status: "asleep" }])[0]!.status).toBe("active");
  });
  it("no weight means what the relation says", () => {
    expect(weightOf({ relation: "family" })).toBe(2);
    expect(weightOf({ relation: "rival" })).toBe(1);
    expect(weightOf({ relation: "neutral" })).toBe(0);
    expect(weightOf({})).toBe(0);
    expect(weightOf({ relation: "family", weight: 0 })).toBe(0);
  });
  it("a file from before the setting stays off; bad values too", () => {
    expect(normalizeState({}, "c1").settings.cast).toBe("off");
    expect(normalizeState({ settings: { cast: "loud" } }, "c1").settings.cast).toBe("off");
    expect(normalizeState({ settings: { cast: "often" } }, "c1").settings.cast).toBe("often");
  });
});

describe("silence is counted by the id first", () => {
  const ident = (st: any, r = reg()) => castIdentity(st, r, st.entities[0]);
  const st = () => ({ ...emptyState("c1"), entities: [OLYA], regIds: { n1: "p2" } });

  it("counts the replies since a message named her", () => {
    const msgs = [...filler(4), msg(4, "user", "Say hi to Olya."), ...filler(7, 5)];
    // m5.. are 7 messages: m5 char, m6 user, m7 char, m8 user, m9 char, m10 user, m11 char -> replies m5 m7 m9 m11 = 4
    expect(silenceOf(ident(st()), OLYA, msgs as any, {}, reg(), {})).toBe(4);
  });
  it("a nickname the registry ties to her counts; the same nickname of another person does not", () => {
    // Olechka is an alias of p2 (Olya) and of p3 (Maksym): shared, so it counts for nobody
    const msgs = [...filler(3), msg(3, "user", "Olechka called."), ...filler(6, 4)];
    expect(silenceOf(ident(st()), OLYA, msgs as any, {}, reg(), {})).toBe(4);
    // a nickname only she has
    const own = { ...reg(), entities: reg().entities.map((e: any) => (e.id === "p3" ? { ...e, aliases: [] } : e)) };
    expect(silenceOf(ident(st(), own), OLYA, msgs as any, {}, own, {})).toBe(3);
  });
  it("the Dashboard's scene counts by id even when the name is a nickname nobody wrote in the text", () => {
    const msgs = [...filler(10)];
    const snaps = { [KEY(5)]: { present: ["Lelia"] } };
    expect(silenceOf(ident(st()), OLYA, msgs as any, snaps, reg(), {})).toBeGreaterThan(3);
    // the Dashboard's own table says Lelia is p2
    expect(silenceOf(ident(st()), OLYA, msgs as any, snaps, reg(), { Lelia: "p2" })).toBe(2);
  });
  it("a Dashboard name that is another person's id is not her, even if a word matches", () => {
    const msgs = [...filler(10)];
    const snaps = { [KEY(7)]: { present: ["Olya K"] } };
    // "Olya K" is her alias on the record, but the Dashboard says this one is p3
    expect(silenceOf(ident(st()), OLYA, msgs as any, snaps, reg(), { "Olya K": "p3" })).toBeGreaterThan(2);
  });
  it("a record with no registry id is the person the registry knows under its name (an older record), so its own name still counts", () => {
    const s = { ...emptyState("c1"), entities: [OLYA], regIds: {} };
    const ident = castIdentity(s, reg(), OLYA);
    expect(ident.id).toBe("p2");
    const msgs = [...filler(3), msg(3, "user", "Olya called."), ...filler(4, 4)];
    expect(silenceOf(ident, OLYA, msgs as any, {}, reg(), {})).toBe(2);
    // ...and the Dashboard's scene finds her by that id
    expect(silenceOf(ident, OLYA, filler(10) as any, { [KEY(7)]: { present: ["Lelia"] } }, reg(), { Lelia: "p2" })).toBe(1);
  });
  it("a record with no registry id falls back to its own names", () => {
    const s = { ...emptyState("c1"), entities: [OLYA], regIds: {} };
    const msgs = [...filler(3), msg(3, "user", "Olya K is late."), ...filler(4, 4)];
    expect(silenceOf(castIdentity(s, null, OLYA), OLYA, msgs as any, {}, null, {})).toBe(2);
  });
  it("a short ending on a long name still counts (a case ending)", () => {
    const e = { ...OLYA, name: "Oksana", aliases: [] };
    const s = { ...emptyState("c1"), entities: [e], regIds: {} };
    const msgs = [...filler(2), msg(2, "user", "I met Oksanu today."), ...filler(4, 3)];
    expect(silenceOf(castIdentity(s, null, e), e, msgs as any, {}, null, {})).toBe(2);
  });
  it("a person the registry marks as a card is not on the bench", () => {
    const r = { ...reg(), entities: reg().entities.map((e: any) => (e.id === "p2" ? { ...e, src: "card" } : e)) };
    expect(castIdentity(st(), r, OLYA).own).toBe(true);
  });
});

describe("the die and the threshold", () => {
  it("the threshold is the frequency's number within a quarter, fixed for a person", () => {
    for (const [f, base] of [["rare", 60], ["normal", 30], ["often", 15]] as const) {
      const t = castThreshold(f, "c1", "n1");
      expect(t).toBeGreaterThanOrEqual(Math.round(base * 0.75));
      expect(t).toBeLessThanOrEqual(Math.round(base * 1.25));
      expect(castThreshold(f, "c1", "n1")).toBe(t);
    }
    expect(castThreshold("off", "c1", "n1")).toBe(0);
  });
  it("2d6 plus the silence step (0 to 3) plus the weight; the same seed rolls the same", () => {
    const a = rollEntrance("seed", 30, 30, 0);
    expect(a.mod).toBe(0);
    expect(a.total).toBe(a.d[0] + a.d[1]);
    expect(rollEntrance("seed", 30, 30, 0)).toEqual(a);
    expect(rollEntrance("seed", 45, 30, 0).mod).toBe(1);
    const big = rollEntrance("seed", 200, 30, 2);
    expect(big.mod).toBe(3);
    expect(big.total).toBe(big.d[0] + big.d[1] + 3 + 2);
  });
  it("bands: up to 6 small, 7 to 9 medium, 10 and more big", () => {
    const bands = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = rollEntrance("s" + i, 90, 30, 2);
      expect(r.band).toBe(r.total <= 6 ? "small" : r.total <= 9 ? "medium" : "big");
      bands.add(r.band);
    }
    expect(bands.has("big")).toBe(true);
  });
});

describe("who is due", () => {
  const base = (over: object = {}, msgs: object[] = filler(N)) => ({ state: { ...emptyState("c1"), entities: [OLYA], regIds: { n1: "p2" }, ...over } as any, msgs: msgs as any, snaps: {}, reg: reg(), personIds: {}, freq: "normal" });
  it("a long-silent person is due; an off frequency, a young chat and the gap hold her back", () => {
    expect(benchDue(base()).map((x: any) => x.rec.id)).toEqual(["n1"]);
    expect(benchDue({ ...base(), freq: "off" })).toEqual([]);
    expect(benchDue(base({}, filler(8)))).toEqual([]);
    // 5 replies after the last return is inside the gap of 10; 49 is not
    expect(benchDue(base({ lastEntrance: { id: "n1", n: 45, band: "small", ok: true } }))).toEqual([]);
    expect(benchDue(base({ lastEntrance: { id: "n1", n: 1, band: "small", ok: true } })).length).toBe(1);
  });
  it("a person switched off, dormant, retired or a place never comes", () => {
    for (const e of [{ ...OLYA, noReturn: true }, { ...OLYA, status: "dormant" }, { ...OLYA, status: "past" }, { ...OLYA, kind: "place" }]) expect(benchDue(base({ entities: [e] }))).toEqual([]);
  });
  it("the heaviest and longest silent goes first", () => {
    const rita = { ...OLYA, id: "n2", name: "Rita", aliases: [], weight: 2, relation: "family" };
    const r = reg();
    r.entities.push({ id: "p9", kind: "person", name: "Rita", aliases: [], src: "world" });
    const out = benchDue({ ...base({ entities: [OLYA, rita], regIds: { n1: "p2", n2: "p9" } }), reg: r });
    expect(out.map((x: any) => x.rec.id)).toEqual(["n2", "n1"]);
  });
  it("planEntrance gives a band from the roll, or from the Life tier", () => {
    const b = base();
    const plan = planEntrance({ ...b, seed: "s" })!;
    expect(plan).toMatchObject({ id: "n1", name: "Olya", via: "silence", sent: 0 });
    expect(["small", "medium", "big"]).toContain(plan.band);
    expect(plan.d).toHaveLength(2);
    expect(planEntrance({ ...b, seed: "s", lifeTier: "major" })).toMatchObject({ band: "big", via: "life", tier: "major" });
    expect(planEntrance({ ...b, seed: "s", lifeTier: "minor" })!.band).toBe("small");
    expect(planEntrance({ ...b, state: { ...b.state, entrance: plan }, seed: "s" })).toBe(null);
  });
});

describe("the note", () => {
  const en = { id: "n1", name: "Olya", band: "medium", silence: 41, via: "silence", sent: 0, retried: false };
  it("is firm: she comes in this reply, the form is the writer's, the scale is named", () => {
    const t = entranceInsert(en as any, OLYA as any);
    expect(t).toStartWith("[CAST: Olya (");
    expect(t).toContain("41 replies");
    expect(t).toContain("in this reply");
    expect(t).toContain("an invitation, a visit");
    expect(t).toContain("Never mention this note");
  });
  it("after a miss it is shorter and stricter", () => {
    const t = entranceInsert({ ...en, retried: true } as any, OLYA as any);
    expect(t).toContain("must appear in this one");
    expect(t).not.toContain("41 replies");
  });
});

describe("the hook: the whole way", () => {
  it("at the chronicler's level, with no events switch, a long-silent person is announced and logged", () => {
    const m = setup(filler(N));
    const out = llmRequest(req(), m.host);
    expect(text(out)).toContain("[CAST: Olya");
    expect((out as any).promptSources.parts[0]).toMatchObject({ label: "Cast" });
    const s = state(m);
    expect(s.entrance).toMatchObject({ id: "n1", sent: 1, after: KEY(N - 1) });
    expect(rolls(m).at(-1)).toMatchObject({ kind: "cast", inserted: true, id: "n1", who: "Olya", via: "silence", weight: 1, n: N, op: "send" });
    expect(rolls(m).at(-1).result).toBeUndefined();
    expect(rolls(m).at(-1).d).toHaveLength(2);
  });
  it("nothing when the DM is off, the cast is off, or the chat has no state file", () => {
    expect(llmRequest(req(), setup(filler(N), { settings: { level: "off", cast: "normal" } }).host)).toBe(null);
    expect(llmRequest(req(), setup(filler(N), { settings: { level: "chronicler", cast: "off", insert: true } }).host)).toBe(null);
    const m = setup(filler(N));
    delete m.files["world/state/c1.json"];
    expect(llmRequest(req(), m.host)).toBe(null);
  });
  it("a swipe of the reply that carried it sends it again with the same dice; the first try stays in the roll", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    const first = state(m).entrance;
    // the reply is written (m60), then swiped
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N, "char", "Odarka looks up.")) + "\n";
    const out = llmRequest(req("swipe"), m.host);
    expect(text(out)).toContain("[CAST: Olya");
    const again = state(m).entrance;
    expect(again.d).toEqual(first.d);
    expect(again.band).toBe(first.band);
    expect(again.retried).toBe(false);
  });
  it("she came: done, the gap starts, the log says so", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N, "char", "A message from Olya: she is coming.")) + "\n" + JSON.stringify(msg(N + 1, "user", "Good.")) + "\n";
    expect(llmRequest(req(), m.host)).toBe(null);
    const s = state(m);
    expect(s.entrance).toBeUndefined();
    expect(s.lastEntrance).toMatchObject({ id: "n1", ok: true });
    expect(rolls(m).filter((r: any) => r.kind === "cast")).toHaveLength(1);
    expect(rolls(m).at(-1)).toMatchObject({ kind: "cast", id: "n1", result: "came" });
  });
  it("she did not come: a stricter second note, then she is let go and the counter stays", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N, "char", "The road goes on.")) + "\n" + JSON.stringify(msg(N + 1, "user", "Onward.")) + "\n";
    const out = llmRequest(req(), m.host);
    expect(text(out)).toContain("must appear in this one");
    expect(state(m).entrance).toMatchObject({ retried: true, sent: 1 });
    expect(rolls(m).filter((r: any) => r.kind === "cast")[0]).toMatchObject({ result: "again" });
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N + 2, "char", "Still the road.")) + "\n" + JSON.stringify(msg(N + 3, "user", "Onward.")) + "\n";
    expect(llmRequest(req(), m.host)).toBe(null);
    const s = state(m);
    expect(s.entrance).toBeUndefined();
    expect(s.lastEntrance).toMatchObject({ id: "n1", ok: false });
    expect(rolls(m).filter((r: any) => r.kind === "cast").map((r: any) => r.result)).toEqual(["again", "missed"]);
    // she is still silent and still on the bench: she is due again once the gap has passed
    const stateAfter = s;
    const chatNow = m.files["chats/c1.jsonl"]!.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(benchDue({ state: stateAfter, msgs: chatNow, snaps: {}, reg: reg(), personIds: {}, freq: "normal" }).length).toBe(0);
    expect(benchDue({ state: { ...stateAfter, lastEntrance: undefined }, msgs: chatNow, snaps: {}, reg: reg(), personIds: {}, freq: "normal" }).length).toBe(1);
  });
  it("judgeEntrance by the Dashboard: she was in the scene of the carrier by her id", () => {
    const s: any = { ...emptyState("c1"), entities: [OLYA], regIds: { n1: "p2" }, entrance: { id: "n1", name: "Olya", band: "small", silence: 40, via: "silence", sent: 1, retried: false, after: KEY(1) } };
    const msgs = [msg(0, "user", "a"), msg(1, "user", "b"), msg(2, "char", "The door opens and a girl steps in.")] as any;
    const out = judgeEntrance(s, msgs, { [KEY(2)]: { present: ["Lelia"] } }, reg(), { Lelia: "p2" });
    expect(out).toMatchObject({ ok: true, again: false });
  });
  it("not in combat; a waiting DM event goes first; the player's switch drops a waiting entrance", () => {
    const combat = setup(filler(N), { direction: "combat" });
    // the scene reads the Dashboard: put a combat scene there
    combat.files["dashboard/state/c1.json"] = JSON.stringify({ snapshots: { [KEY(N - 1)]: { scene: { direction: "combat" }, present: [], clock: {} } } });
    expect(llmRequest(req(), combat.host)).toBe(null);
    const ev = setup(filler(N), { settings: { level: "director", cast: "normal", insert: true, everyN: 5 }, event: { text: "A knock.", hard: true, sent: 0, retried: false } });
    const out = llmRequest(req(), ev.host);
    expect(text(out)).toContain("WORLD EVENT");
    expect(text(out)).not.toContain("[CAST");
    const off = setup(filler(N + 1), { entrance: { id: "n1", name: "Olya", band: "small", silence: 40, via: "silence", sent: 0, retried: false }, entities: [{ ...OLYA, noReturn: true }] });
    expect(llmRequest(req(), off.host)).toBe(null);
    expect(state(off).entrance).toBeUndefined();
  });
  it("the Life die becomes the return when someone is overdue (its tier sets the band)", () => {
    // find a swipe seed where Life gates: life chance 100 gates always
    const m = setup(filler(N), { settings: { level: "living", cast: "normal", insert: true, everyN: 5, dice: "flavour", diceStat: "auto", diceChance: 0, diceLife: 100, dicePace: 0 } });
    const out = llmRequest(req(), m.host);
    const t = text(out);
    expect(t).toContain("[CAST: Olya");
    expect(t).not.toContain("[LIFE");
    expect(state(m).entrance.via === "silence" || state(m).entrance.via === "life").toBe(true);
    expect(rolls(m).find((r: any) => r.kind === "life")).toMatchObject({ inserted: false, cast: "n1" });
  });
});

describe("the book", () => {
  it("a bench stub of a weighty person is always in the prompt, the heaviest eight; a dormant one is out", () => {
    const stubs = Array.from({ length: 10 }, (_, i) => ({ ...OLYA, id: "n" + (i + 1), name: "P" + i, aliases: [], weight: i < 2 ? 2 : 1, link: { book: "b", uid: i + 1, title: "P" + i }, at: i }));
    const st: any = { ...emptyState("c1"), entities: [...stubs, { ...OLYA, id: "n11", name: "Zed", weight: 2, status: "dormant" }, { ...OLYA, id: "n12", name: "Quiet", weight: 0, link: { book: "b", uid: 99, title: "Quiet" } }] };
    expect(benchConstant(st).size).toBe(8);
    expect(benchConstant(st).has("n12")).toBe(false);
    expect(benchConstant(st).has("n11")).toBe(false);
    const m = memHost({});
    writeBook(m.host.fs, st, "T");
    const entries = JSON.parse(m.files["lorebooks/world-c1.json"]!).entries;
    expect(entries.filter((e: any) => e.status === "constant").length).toBe(8);
    expect(entries.find((e: any) => e.title === "Zed").enabled).toBe(false);
    expect(entries.find((e: any) => e.title === "Quiet").enabled).toBe(true);
  });
});

describe("the player's edits", () => {
  const route = (m: M, body: object) => handleRoute({ method: "PUT", path: "/world/records", query: {}, body }, m.host) as any;
  it("sets and clears relation and weight, and the switch; a place takes none", () => {
    const m = setup(filler(10));
    route(m, { chatId: "c1", op: "update", record: { id: "n1", relation: "family", weight: 2, noReturn: true } });
    expect(state(m).entities[0]).toMatchObject({ relation: "family", weight: 2, noReturn: true, by: "player" });
    route(m, { chatId: "c1", op: "update", record: { id: "n1", weight: null, relation: "", noReturn: false } });
    const e = state(m).entities[0];
    expect(e).not.toHaveProperty("weight");
    expect(e).not.toHaveProperty("relation");
    expect(e).not.toHaveProperty("noReturn");
    route(m, { chatId: "c1", op: "add", record: { kind: "place", name: "Mill", text: "A mill.", relation: "ally", weight: 2 } });
    expect(state(m).entities[1]).not.toHaveProperty("weight");
  });
  it("the records the client reads carry relation, weight, link and the switch, so a save from the form does not clear them", () => {
    const m = setup(filler(10), { entities: [{ ...OLYA, link: { book: "bk1", uid: 1, title: "Olya" }, noReturn: true }] });
    const peek = (handleRoute({ method: "GET", path: "/world/peek", query: { chatId: "c1" }, body: undefined }, m.host) as any).json;
    expect(peek.records[0]).toMatchObject({ relation: "ally", weight: 1, link: { book: "bk1", uid: 1, title: "Olya" }, noReturn: true });
    // and what the edit route answers is the same list
    const after = route(m, { chatId: "c1", op: "update", record: { id: "n1", text: "A new line." } }).json;
    expect(after.records[0]).toMatchObject({ relation: "ally", weight: 1, noReturn: true });
  });
  it("a dormant record can be woken with restore", () => {
    const m = setup(filler(10), { entities: [{ ...OLYA, status: "dormant" }] });
    route(m, { chatId: "c1", op: "restore", record: { id: "n1" } });
    expect(state(m).entities[0].status).toBe("active");
  });
  it("the settings route takes the frequency and the testing switch, and a new switch-on starts on normal", () => {
    const m = memHost({
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "T", characterId: "odarka", userName: "Taras" }),
      "chats/c1.jsonl": jsonl(filler(4)),
      "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    });
    const put = (body: object) => handleRoute({ method: "PUT", path: "/world/settings", query: {}, body }, m.host) as any;
    put({ chatId: "c1", level: "chronicler" });
    expect(state(m).settings.cast).toBe("normal");
    put({ chatId: "c1", cast: "rare", castShow: true });
    expect(state(m).settings).toMatchObject({ cast: "rare", castShow: true });
    put({ chatId: "c1", cast: "off" });
    expect(state(m).settings.cast).toBe("off");
    expect(state(m).entrance).toBeUndefined();
  });
});

describe("the bench: people from the cards' lorebooks", () => {
  const BOOK = {
    id: "bk1",
    name: "Odarka's life",
    entries: [
      { uid: 1, title: "Olya", keys: ["Olya"], content: "Olya is Taras's best friend from school.", enabled: true },
      { uid: 2, title: "The mill", keys: ["mill"], content: "An old mill by the river.", enabled: true },
      { uid: 3, title: "Rita", keys: ["Rita"], content: "Rita is Taras's mother.", enabled: true },
      { uid: 4, title: "The informer", keys: ["informer"], content: "The informer is a village elder who sells secrets.", enabled: true, secret: { knownBy: [], cover: "", reveal: [] } },
      { uid: 5, title: "Off", keys: ["off"], content: "Disabled entry.", enabled: false },
    ],
  };
  const files = () => ({ "characters/odarka/card.json": JSON.stringify({ name: "Odarka", studio: { linkedLorebookIds: ["bk1"] } }), "lorebooks/bk1.json": JSON.stringify(BOOK) });
  const chatMeta = { id: "c1", title: "T", characterId: "odarka", userName: "Taras" };
  const ANSWER = JSON.stringify({ people: [
    { entry: 1, name: "Olya", aliases: ["Olechka", "Olya K"], line: "Taras's best friend from school.", relation: "ally", weight: 1 },
    { entry: 3, name: "Rita", aliases: [], line: "Taras's mother.", relation: "family", weight: 2 },
    { entry: 99, name: "Ghost", aliases: [], line: "No such entry.", relation: "ally", weight: 1 },
    { entry: 1, name: "Odarka", aliases: [], line: "A card character.", relation: "ally", weight: 1 },
  ] });
  const fresh = (extra: Record<string, string> = {}) => memHost({
    ...files(),
    "chats/c1.meta.json": JSON.stringify(chatMeta),
    "chats/c1.jsonl": jsonl(filler(4)),
    ...extra,
  });
  const route = (m: M, body: object) => {
    const r = handleRoute({ method: "POST", path: "/world/bench", query: {}, body }, m.host) as any;
    return r.json ?? r;
  };

  it("offers only enabled, secret-free entries with a uid", () => {
    const m = fresh();
    const list = benchEntries(m.host.fs, chatMeta);
    expect(list.map((e: any) => e.title)).toEqual(["Olya", "The mill", "Rita"]);
    expect(list[0]).toMatchObject({ book: "bk1", uid: 1 });
  });
  it("one call; the people become linked records; a card character, a bad entry number and nothing else do not", () => {
    const m = fresh();
    const first = route(m, { chatId: "c1" });
    expect(first.__llmPending).toBe(true);
    expect(m.asked).toEqual(["world_bench"]);
    m.results.world_bench = { text: ANSWER, model: "b/build", genTimeMs: 10 };
    const out = route(m, { chatId: "c1" });
    expect(out).toMatchObject({ ok: true, cast: "normal" });
    const s = state(m);
    const by = (n: string) => s.entities.find((e: any) => e.name === n);
    expect(by("Olya")).toMatchObject({ kind: "person", link: { book: "bk1", uid: 1, title: "Olya" }, relation: "ally", weight: 1, aliases: ["Olechka", "Olya K"] });
    expect(by("Rita")).toMatchObject({ relation: "family", weight: 2 });
    expect(by("Ghost")).toBeUndefined();
    expect(by("Odarka")).toBeUndefined();
    // each joined the registry, so the cast can follow them by id
    expect(Object.keys(s.regIds).length).toBe(s.entities.filter((e: any) => e.kind === "person").length);
    // the stubs of weight 1 and 2 are always in the prompt; the book fires the full entry by its keys as before
    const entries = JSON.parse(m.files["lorebooks/world-c1.json"]!).entries;
    expect(entries.filter((e: any) => e.status === "constant").map((e: any) => e.title).sort()).toEqual(["Olya", "Rita"]);
  });
  it("a person the world already has gets the link, not a second record", () => {
    const m = fresh({ "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level: "chronicler", cast: "off" }, entities: [{ ...OLYA, weight: undefined, relation: undefined }], nextId: 2 }) });
    m.results.world_bench = { text: ANSWER, model: "b/build", genTimeMs: 10 };
    route(m, { chatId: "c1" });
    const olyas = state(m).entities.filter((e: any) => e.name === "Olya");
    expect(olyas).toHaveLength(1);
    expect(olyas[0]).toMatchObject({ id: "n1", link: { uid: 1 }, relation: "ally", weight: 1, text: OLYA.text });
    // the player had switched the cast off: pressing the button turns it on at normal
    expect(state(m).settings.cast).toBe("normal");
  });
  it("a chat with no lorebook people has nothing to adopt and makes no call", () => {
    const m = memHost({ "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }), "chats/c1.meta.json": JSON.stringify(chatMeta), "chats/c1.jsonl": jsonl(filler(4)) });
    expect(route(m, { chatId: "c1" })).toMatchObject({ ok: true, none: true });
    expect(m.asked).toEqual([]);
  });
  it("a model error is reported and nothing is written", () => {
    const m = fresh();
    m.results.world_bench = { text: "no json here", model: "b/build", genTimeMs: 10 };
    expect(route(m, { chatId: "c1" })).toMatchObject({ ok: false, code: "not-json" });
    expect(state(m).entities).toEqual([]);
  });
  it("Start: a bench step before the fronts drafts the people; accepting them registers each", () => {
    const m = fresh({ "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level: "living", cast: "normal" } }) });
    const start = (body: object) => {
      const r = handleRoute({ method: "POST", path: "/world/start", query: {}, body }, m.host) as any;
      return r.json ?? r;
    };
    const begun = start({ chatId: "c1", begin: true, recipe: "from-cards" });
    const total = begun.draft.total;
    let last: any;
    for (let i = 0; i < total; i++) {
      for (const k of Object.keys(m.results)) delete m.results[k];
      // every step answers with the same text: the bench step reads "people", the others read their own keys and find none
      m.results.world_build = { text: JSON.stringify({ add: [], fronts: [], people: JSON.parse(ANSWER).people }), model: "b/build", genTimeMs: 10 };
      last = start({ chatId: "c1" });
    }
    expect(last.draft.done).toBe(total);
    const names = last.draft.entities.map((e: any) => e.name).sort();
    expect(names).toEqual(["Olya", "Rita"]);
    expect(last.draft.entities.find((e: any) => e.name === "Olya")).toMatchObject({ id: expect.stringMatching(/^d/), link: { book: "bk1", uid: 1 }, weight: 1 });
    const accepted = (handleRoute({ method: "PUT", path: "/world/draft", query: {}, body: { chatId: "c1", op: "accept" } }, m.host) as any).json;
    expect(accepted.ok).toBe(true);
    const s = state(m);
    expect(s.entities.map((e: any) => e.name).sort()).toEqual(["Olya", "Rita"]);
    expect(Object.keys(s.regIds).sort()).toEqual(s.entities.map((e: any) => e.id).sort());
    expect(JSON.parse(m.files["registry/c1.json"]!).entities.map((e: any) => e.name)).toContain("Olya");
  });
  it("a Start that turns the bench off, or has no people in the books, has no bench step", () => {
    const m = fresh();
    const begin = (body: object) => ((handleRoute({ method: "POST", path: "/world/start", query: {}, body }, m.host) as any).json).draft;
    const withBench = begin({ chatId: "c1", begin: true, recipe: "from-cards" }).total;
    const without = begin({ chatId: "c1", begin: true, recipe: "from-cards", bench: false }).total;
    expect(withBench).toBe(without + 1);
  });
  it("applyBench alone: skip names, own cards by the registry, the cap", () => {
    const st: any = { ...emptyState("c1"), entities: [], nextId: 1 };
    const entries = [{ book: "b", uid: 1, title: "A", text: "x" }];
    const out = { people: [{ entry: 1, name: "Taras", line: "the user", relation: "ally", weight: 1 }, { entry: 1, name: "Nina", line: "a neighbour", relation: "boss", weight: 7 }] };
    const res = applyBench(st, null, entries, out, { skip: ["Taras"] });
    expect(res.added).toEqual(["Nina"]);
    // a relation or weight outside the lists is dropped, not stored
    expect(st.entities[0]).not.toHaveProperty("relation");
    expect(st.entities[0]).not.toHaveProperty("weight");
  });
});

describe("the cast status route (for testing)", () => {
  const get = (m: M) => (handleRoute({ method: "GET", path: "/world/cast", query: { chatId: "c1" }, body: undefined }, m.host) as any).json;
  it("lists the bench with the silence so far, who is due, the entrance and the last one", () => {
    const m = setup(filler(N));
    const st = get(m);
    expect(st).toMatchObject({ freq: "normal", replies: N / 2, entrance: null, last: null, lorePeople: 0 });
    expect(st.people).toHaveLength(1);
    expect(st.people[0]).toMatchObject({ id: "n1", name: "Olya", weight: 1, relation: "ally", byId: true, off: false, due: true, silence: N / 2 });
    expect(st.people[0].threshold).toBeGreaterThan(0);
    llmRequest(req(), m.host);
    expect(get(m).entrance).toMatchObject({ id: "n1", sent: 1 });
  });
  it("off says so and counts nobody as due", () => {
    const m = setup(filler(N), { settings: { level: "chronicler", cast: "off", insert: true } });
    expect(get(m)).toMatchObject({ freq: "off", wait: 0 });
    expect(get(m).people[0].due).toBe(false);
  });
  it("the wait after a return is counted down in replies", () => {
    const m = setup(filler(N), { lastEntrance: { id: "n1", n: N / 2 - 4, band: "small", ok: true } });
    expect(get(m).wait).toBe(6);
  });
});
