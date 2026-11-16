/**
 * The cast deck, step 4 of #424: a card of a person the story has not met is drawn like a person who comes back (silence, 2d6, a firm
 * note, a judge), the pick by relevance, the card that becomes a record when the person is in the story, and what a miss leaves.
 */
import { describe, expect, it } from "bun:test";
import { castStatus, deckEntranceInsert, deckStatus, drawCard, emptyState, judgeEntrance, llmRequest, normalizeState, planDeckEntrance, pickCard } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, any> = {};
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
    llm: { request: () => {}, results },
  };
  return { host, files };
}
type M = ReturnType<typeof memHost>;

const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, k) => msg(from + k, (from + k) % 2 === 0 ? "user" : "char", "The road goes on, nothing new."));
const KEY = (i: number) => "m" + i + "#0";
/** 100 messages are 50 replies, past the longest threshold (normal: 30, up to a quarter more). */
const N = 100;

const card = (over: Record<string, unknown> = {}) => ({ id: "c1", name: "Halyna", aliases: ["Hala"], faction: "Toll guild", tie: "Maksym", want: "Wants the pass closed.", text: "A tall woman with a ledger. She counts everything. She is Maksym's cousin.", relation: "rival", ...over });
const GUILD = { id: "n1", kind: "group", name: "Toll guild", aliases: [], text: "Keeps the tolls.", status: "active", uid: 0, at: 1 };
// not on the bench (the player switched "bring back" off), so only the deck is in play
const MAKSYM = { id: "n2", kind: "person", name: "Maksym", aliases: [], text: "The toll keeper.", status: "active", uid: 0, at: 1, noReturn: true };
const REG = JSON.stringify({
  v: 1, chatId: "c1", from: null, next: { p: 3, o: 1, l: 1 }, apart: [], suggest: [],
  entities: [
    { id: "user", kind: "person", name: "Taras", aliases: [], src: "persona" },
    { id: "p1", kind: "person", name: "Odarka", aliases: [], src: "card" },
    { id: "p2", kind: "person", name: "Maksym", aliases: [], src: "world" },
  ],
});

function setup(msgs: object[], over: Record<string, unknown> = {}, files: Record<string, string> = {}): M {
  const st = { ...emptyState("c1"), settings: { level: "chronicler", everyN: 5, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "normal", castDeck: true }, entities: [GUILD, MAKSYM], nextId: 3, regIds: { n2: "p2" }, cast: [card()], ...over };
  return memHost({
    "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
    "chats/c1.jsonl": jsonl(msgs),
    "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    "settings.json": JSON.stringify({ model: "c/default" }),
    "registry/c1.json": REG,
    "world/state/c1.json": JSON.stringify(st),
    ...files,
  });
}
const state = (m: M) => JSON.parse(m.files["world/state/c1.json"]!);
const rolls = (m: M) => (m.files["world/dice/c1.json"] ? JSON.parse(m.files["world/dice/c1.json"]!).rolls : []);
const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go on." }] }, turn: { op } });
const text = (out: any) => (out ? out.messages[out.messages.length - 1].content : "");
const say = (m: M, ...lines: object[]) => { m.files["chats/c1.jsonl"] += lines.map((l) => JSON.stringify(l)).join("\n") + "\n"; };
const replies = (msgs: object[]) => msgs.filter((x: any) => x.role === "char").length;

describe("when a card is drawn", () => {
  const base = (over: Record<string, unknown> = {}, msgs: object[] = filler(N)) => {
    const st = normalizeState({ settings: { level: "chronicler", cast: "normal", castDeck: true }, entities: [GUILD, MAKSYM], nextId: 3, cast: [card()], ...over }, "c1") as any;
    return { state: st, msgs: msgs as any, snaps: {}, reg: JSON.parse(REG), personIds: {}, freq: "normal", seed: "s1", place: null, present: [] as string[] };
  };

  it("after the silence of the Frequency, as a scale from 2d6; the entrance is the card's", () => {
    const en = planDeckEntrance(base() as any);
    expect(en).toMatchObject({ id: "c1", src: "deck", name: "Halyna", faction: "Toll guild", tie: "Maksym", via: "silence", weight: 0, sent: 0, n: replies(filler(N)), silence: replies(filler(N)) });
    expect(["small", "medium", "big"]).toContain(en!.band);
    expect(en!.d).toHaveLength(2);
    expect(en!.pick).toBe("random");
  });

  it("the same seed rolls the same, another seed may not", () => {
    const a = planDeckEntrance(base() as any)!;
    const b = planDeckEntrance(base() as any)!;
    expect(b.d).toEqual(a.d);
    expect(b.band).toBe(a.band);
  });

  it("not with the switch off, the cast off, an empty deck, a young chat, a short silence or another entrance waiting", () => {
    expect(planDeckEntrance(base({ settings: { level: "chronicler", cast: "normal", castDeck: false } }) as any)).toBeNull();
    expect(planDeckEntrance({ ...base(), freq: "off" } as any)).toBeNull();
    expect(planDeckEntrance(base({ cast: [] }) as any)).toBeNull();
    expect(planDeckEntrance(base({}, filler(8)) as any)).toBeNull();
    const young = base({}, filler(40));
    expect(planDeckEntrance(young as any)).toBeNull();
    expect(planDeckEntrance(base({ entrance: { id: "n2", band: "small", silence: 1, via: "silence", sent: 0 } }) as any)).toBeNull();
  });

  it("the silence counts from the last entrance of any kind, and the gap after it is kept", () => {
    const r = replies(filler(N));
    expect(planDeckEntrance(base({ lastEntrance: { id: "n2", n: r - 5, band: "small", res: "came" } }) as any)).toBeNull();
    expect(planDeckEntrance(base({ lastEntrance: { id: "n2", n: r - 20, band: "small", res: "came" } }) as any)).toBeNull();
    expect(planDeckEntrance(base({ lastEntrance: { id: "n2", n: 0, band: "small", res: "came" } }) as any)).not.toBeNull();
  });

  it("a card whose name the world got meanwhile is let go", () => {
    const b = base({ entities: [GUILD, MAKSYM, { id: "n3", kind: "person", name: "Hala", aliases: [], text: "x", status: "active", uid: 0, at: 1 }], nextId: 4, cast: [card(), card({ id: "c2", name: "Ivan", aliases: [] })] });
    const en = planDeckEntrance(b as any);
    expect(en!.name).toBe("Ivan");
    expect(b.state.cast.map((c: any) => c.id)).toEqual(["c2"]);
  });
});

describe("which card", () => {
  const cards = [card({ id: "c1", name: "Aa", aliases: [], tie: "", faction: "Crows" }), card({ id: "c2", name: "Bb", aliases: [], tie: "Odarka", faction: "Toll guild" }), card({ id: "c3", name: "Cc", aliases: [], tie: "Maksym", faction: "Merchants" })];
  const world = (over: Record<string, unknown> = {}) => normalizeState({ settings: { castDeck: true }, entities: [GUILD, MAKSYM], nextId: 3, cast: cards, fronts: [], ...over }, "c1") as any;
  const ctx = (over: Record<string, unknown> = {}) => ({ msgs: filler(20) as any, snaps: {}, reg: JSON.parse(REG), personIds: {}, place: null, present: [] as string[], seed: "s1", ...over });

  it("the card whose tie is in the scene comes first", () => {
    expect(pickCard(world(), ctx({ present: ["Taras", "Odarka"] }))).toMatchObject({ card: { id: "c2" }, pick: "tie" });
  });

  it("a person of the cast seen on stage in the newest message counts as in the scene", () => {
    const msgs = [...filler(10), msg(10, "user", "x"), msg(11, "char", "Maksym raises a hand.")];
    expect(pickCard(world(), ctx({ msgs }))).toMatchObject({ card: { id: "c3" }, pick: "tie" });
  });

  it("then the faction of a front that is stirred or half full", () => {
    const fronts = [{ id: "f1", name: "Crows", goal: "x", clock: 3, size: 6, status: "active" }, { id: "f2", name: "Merchants", goal: "x", clock: 1, size: 6, status: "active" }];
    expect(pickCard(world({ fronts }), ctx())).toMatchObject({ card: { id: "c1" }, pick: "front" });
    fronts[1]!.stirred = true as any;
    fronts[0]!.clock = 0;
    expect(pickCard(world({ fronts }), ctx())).toMatchObject({ card: { id: "c3" }, pick: "front" });
  });

  it("then a faction that belongs to the scene's place; a tie in the scene still wins", () => {
    const place = { id: "n9", kind: "place", name: "Red Tower", members: ["Merchants"], text: "A tower." };
    expect(pickCard(world(), ctx({ place }))).toMatchObject({ card: { id: "c3" }, pick: "place" });
    expect(pickCard(world(), ctx({ place: { ...place, members: [], text: "The Toll guild holds this tower." } }))).toMatchObject({ card: { id: "c2" }, pick: "place" });
    expect(pickCard(world(), ctx({ place, present: ["Odarka"] }))).toMatchObject({ card: { id: "c2" }, pick: "tie" });
  });

  it("the rest is chance, fixed by the seed", () => {
    const a = pickCard(world(), ctx());
    expect(a!.pick).toBe("random");
    expect(pickCard(world(), ctx())!.card.id).toBe(a!.card.id);
    const ids = new Set(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((seed) => pickCard(world(), ctx({ seed }))!.card.id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("the note and the record", () => {
  it("the note names who they are, what they want, who they come through, and says nobody knows them", () => {
    const note = deckEntranceInsert({ band: "medium" } as any, card());
    expect(note).toContain("[CAST: Halyna is new to the story and comes into it in this reply");
    expect(note).toContain("A tall woman with a ledger.");
    expect(note).toContain("What they want: Wants the pass closed.");
    expect(note).toContain("They know Maksym");
    expect(note).toContain("Nobody has met them before");
    expect(note).toContain("Never mention this note.");
    expect(deckEntranceInsert({ band: "small" } as any, card({ tie: "" }))).toContain("They come on behalf of Toll guild.");
  });

  it("a drawn card is a person record with its text and relation, a member of its faction, and leaves the deck", () => {
    const s = normalizeState({ settings: { textMax: 900 }, entities: [GUILD, MAKSYM], nextId: 3, cast: [card(), card({ id: "c2", name: "Ivan", aliases: [] })] }, "c1") as any;
    const rec = drawCard(s, s.cast[0], 5)!;
    expect(rec).toMatchObject({ id: "n3", kind: "person", name: "Halyna", aliases: ["Hala"], status: "active", relation: "rival", at: 5 });
    expect(rec.text).toContain("She counts everything.");
    expect(s.nextId).toBe(4);
    expect(s.cast.map((c: any) => c.id)).toEqual(["c2"]);
    expect(s.entities.find((e: any) => e.id === "n1").members).toEqual(["Halyna"]);
  });

  it("a long card is cut at the end of a sentence to the chat's text limit", () => {
    const long = "A sentence of some length goes here. ".repeat(40);
    const s = normalizeState({ settings: { textMax: 300 }, entities: [], nextId: 1, cast: [card({ text: long })] }, "c1") as any;
    const rec = drawCard(s, s.cast[0], 5)!;
    expect(rec.text.length).toBeLessThanOrEqual(300);
    expect(rec.text.endsWith(".")).toBe(true);
  });

  it("a name the world already has leaves no second record; the card goes", () => {
    const s = normalizeState({ entities: [GUILD, MAKSYM, { id: "n3", kind: "person", name: "Halyna", aliases: [], text: "x", status: "active", uid: 0, at: 1 }], nextId: 4, cast: [card()] }, "c1") as any;
    expect(drawCard(s, s.cast[0], 5)).toBeNull();
    expect(s.cast).toBeUndefined();
    expect(s.entities.length).toBe(3);
  });
});

describe("the hook: the whole way", () => {
  it("a long silence brings a card: the note goes in with the card's text, the log says who, why, the dice and the tie", () => {
    const m = setup(filler(N));
    const out = llmRequest(req(), m.host);
    expect(text(out)).toContain("[CAST: Halyna is new to the story");
    expect(text(out)).toContain("They know Maksym");
    expect((out as any).promptSources.parts.at(-1)).toMatchObject({ label: "Cast" });
    const s = state(m);
    expect(s.entrance).toMatchObject({ id: "c1", src: "deck", sent: 1, after: KEY(N - 1), tie: "Maksym", faction: "Toll guild" });
    expect(rolls(m).at(-1)).toMatchObject({ kind: "cast", inserted: true, id: "c1", who: "Halyna", src: "deck", tie: "Maksym", faction: "Toll guild", pick: "random", via: "silence", weight: 0 });
    expect(rolls(m).at(-1).d).toHaveLength(2);
    // the card is not a record yet, and not in the book
    expect(s.entities.map((e: any) => e.name)).toEqual(["Toll guild", "Maksym"]);
    expect(s.cast.length).toBe(1);
  });

  it("the card is not in the prompt before it is drawn", () => {
    const m = setup(filler(20));
    const out = llmRequest(req(), m.host);
    expect(JSON.stringify(out)).not.toContain("Halyna");
  });

  it("when she shows up in the next reply she is a record, a member of her faction, in the registry and in the world book; the card is gone", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    say(m, msg(N, "user", "We go on."), msg(N + 1, "char", "Halyna stepped in with her ledger and said Maksym had sent her."));
    expect(llmRequest(req(), m.host)).toBeNull();
    const s = state(m);
    expect(s.entrance).toBeUndefined();
    expect(s.cast).toBeUndefined();
    const rec = s.entities.find((e: any) => e.name === "Halyna");
    expect(rec).toMatchObject({ id: "n3", kind: "person", status: "active", relation: "rival" });
    expect(s.entities.find((e: any) => e.id === "n1").members).toEqual(["Halyna"]);
    expect(s.lastEntrance).toMatchObject({ id: "n3", res: "came", ok: true, src: "deck" });
    expect(s.regIds.n3).toBeDefined();
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book.entries.some((e: any) => e.memo === "world:n3")).toBe(true);
    expect(rolls(m).find((r: any) => r.kind === "cast").result).toBe("came");
  });

  it("only named, with the Dashboard saying she is not in the scene: a mention, and she is a record all the same", () => {
    const m = setup(filler(N), {}, { "dashboard/state/c1.json": JSON.stringify({ snapshots: {}, personIds: {} }) });
    llmRequest(req(), m.host);
    say(m, msg(N, "user", "We go on."), msg(N + 1, "char", "Somebody said Halyna was on her way."));
    const dash = JSON.parse(m.files["dashboard/state/c1.json"]!);
    dash.snapshots[KEY(N + 1)] = { present: ["Odarka"] };
    m.files["dashboard/state/c1.json"] = JSON.stringify(dash);
    llmRequest(req(), m.host);
    const s = state(m);
    expect(s.lastEntrance).toMatchObject({ res: "mentioned", src: "deck" });
    expect(s.entities.some((e: any) => e.name === "Halyna")).toBe(true);
    expect(s.cast).toBeUndefined();
  });

  it("a reply that does not name her: asked again, stricter; missed twice, the card stays in the deck", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    say(m, msg(N, "user", "We go on."), msg(N + 1, "char", "Odarka looks at the road."));
    const again = llmRequest(req(), m.host);
    expect(text(again)).toContain("must appear in this one");
    expect(state(m).entrance).toMatchObject({ id: "c1", retried: true, sent: 1 });
    expect(rolls(m).find((r: any) => r.kind === "cast").result).toBe("again");
    say(m, msg(N + 2, "user", "Go on."), msg(N + 3, "char", "The wind picks up."));
    llmRequest(req(), m.host);
    const s = state(m);
    expect(s.entrance).toBeUndefined();
    expect(s.cast.map((c: any) => c.id)).toEqual(["c1"]);
    expect(s.lastEntrance).toMatchObject({ id: "c1", res: "missed", src: "deck" });
    expect(s.entities.some((e: any) => e.name === "Halyna")).toBe(false);
  });

  it("the DM wrote her meanwhile: no second record, the card goes", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    const s0 = state(m);
    s0.entities.push({ id: "n3", kind: "person", name: "Halyna", aliases: [], text: "The DM's own line.", status: "active", uid: 0, at: 2 });
    s0.nextId = 4;
    m.files["world/state/c1.json"] = JSON.stringify(s0);
    say(m, msg(N, "user", "We go on."), msg(N + 1, "char", "Halyna came in."));
    llmRequest(req(), m.host);
    const s = state(m);
    expect(s.entities.filter((e: any) => e.name === "Halyna").length).toBe(1);
    expect(s.entities.find((e: any) => e.name === "Halyna").text).toBe("The DM's own line.");
    expect(s.cast).toBeUndefined();
  });

  it("the player removed the card while it waited: nothing goes in, nothing breaks", () => {
    const m = setup(filler(N));
    llmRequest(req(), m.host);
    const s0 = state(m);
    s0.cast = [];
    s0.entrance = { ...s0.entrance, sent: 0 };
    delete s0.entrance.after;
    m.files["world/state/c1.json"] = JSON.stringify(s0);
    const out = llmRequest(req(), m.host);
    expect(JSON.stringify(out ?? {})).not.toContain("[CAST");
    expect(state(m).entrance).toBeUndefined();
  });

  it("nothing with the deck switched off, though the bench works as before", () => {
    const m = setup(filler(N), { settings: { level: "chronicler", insert: true, cast: "normal", castDeck: false } });
    expect(JSON.stringify(llmRequest(req(), m.host) ?? {})).not.toContain("[CAST");
  });

  it("a person who is due from the bench comes first; the deck waits", () => {
    const olya = { id: "n3", kind: "person", name: "Olya", aliases: [], text: "A friend.", status: "active", uid: 0, at: 1, weight: 1, relation: "ally" };
    const m = setup(filler(N), { entities: [GUILD, MAKSYM, olya], nextId: 4 });
    const out = llmRequest(req(), m.host);
    expect(text(out)).toContain("[CAST: Olya");
    expect(state(m).entrance).toMatchObject({ id: "n3" });
    expect(state(m).entrance.src).toBeUndefined();
  });

  it("with the Life die on, the card still comes by its silence (the die itself picks only from the bench)", () => {
    const m = setup(filler(N), { settings: { level: "living", insert: true, cast: "normal", castDeck: true, diceLife: 100, dice: "light" } });
    const out = llmRequest(req(), m.host);
    expect(text(out)).toContain("[CAST: Halyna");
  });
});

describe("the judge on its own", () => {
  it("a missing card is a miss and leaves nothing behind", () => {
    const s = normalizeState({ entities: [GUILD], nextId: 2, cast: [], entrance: { id: "c1", src: "deck", name: "Halyna", band: "small", silence: 40, via: "silence", sent: 1, after: "m5#0" }, settings: { castDeck: true } }, "c1") as any;
    const msgs = [...filler(6), msg(6, "user", "x"), msg(7, "char", "Halyna.")];
    const r = judgeEntrance(s, msgs as any, {}, JSON.parse(REG), {})!;
    expect(r.res).toBe("missed");
    expect(s.lastEntrance).toMatchObject({ id: "c1", res: "missed", src: "deck" });
  });
});

describe("the status", () => {
  it("says the switch, the cards left by faction, loose ones and when the next can start; never who they are", () => {
    const s = normalizeState({ chatId: "c1", settings: { castDeck: true, castPer: 3 }, entities: [GUILD], nextId: 2, cast: [card(), card({ id: "c2", name: "Ivan", aliases: [], tie: "" }), card({ id: "c3", name: "Zoya", aliases: [], faction: "Crows" })] }, "c1") as any;
    const d = deckStatus(s, "normal", 12);
    expect(d).toMatchObject({ on: true, switch: true, left: 3, loose: 1, per: 3, silence: 12, wait: 0 });
    expect(d.factions).toEqual([{ name: "Toll guild", n: 2 }, { name: "Crows", n: 1 }]);
    expect(d.threshold).toBeGreaterThanOrEqual(23);
    expect(JSON.stringify(d)).not.toContain("Halyna");
    expect(deckStatus(s, "off", 12).on).toBe(false);
    expect(deckStatus(s, "normal", 3).wait).toBe(3);
  });

  it("the cast route carries it", () => {
    const m = setup(filler(N));
    const st = castStatus(m.host.fs as any, "c1");
    expect(st.deck).toMatchObject({ on: true, left: 1, loose: 0 });
  });
});
