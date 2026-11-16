/**
 * #428: a record that leaves the story for good takes what hangs on it (event cards naming it, cast cards tied to it, its place among
 * a group's members, the card lorebook entry it is linked to), and the DM's memory learns from events the player swipes away: two
 * swipes drop the event, three dropped events raise a rule about the story, which the writer gets too. Records the player keeps on
 * purpose (pins, hand-written, brought back) reach the DM as examples.
 */
import { describe, expect, it } from "bun:test";
import {
  EVENT_SWIPES,
  answerProposal,
  applyLevel,
  applyReport,
  benchDue,
  bookMutes,
  emptyState,
  handleRoute,
  insertCeiling,
  keptRecords,
  learnEvidence,
  learnedInput,
  learnedView,
  llmRequest,
  raiseProposals,
  reconcile,
  writeBook,
  writerInsert,
  writerRules,
} from "../plugins/world/plugin.js";

const DAY = 86400000;
const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [] as string[], text, status: "active", uid: 0, at: 1, ...extra });

function memFs(files: Record<string, string> = {}) {
  return {
    files,
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, v: string) => {
        files[p] = v;
      },
      remove: (p: string) => {
        delete files[p];
      },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
  };
}

const VARYN = rec("n1", "person", "Varyn", "Captain of the guard, loyal to the duke.", { aliases: ["the captain"], weight: 2, link: { book: "card-book", uid: 7, title: "Varyn" } });
const GUARD = rec("n2", "group", "City guard", "The duke's guard.", { members: ["Varyn", "Oles"] });
function world(over: Record<string, unknown> = {}) {
  return {
    ...emptyState("c1"),
    settings: { ...emptyState("c1").settings, level: "director", cast: "normal", castDeck: true },
    nextId: 3,
    entities: [structuredClone(VARYN), structuredClone(GUARD)],
    deck: [{ id: "e1", text: "Varyn's men search the inn." }, { id: "e2", text: "A storm closes the pass." }, { id: "e3", text: "The captain asks for a bribe." }],
    cast: [
      { id: "c1", name: "Ilka", aliases: [], faction: "City guard", tie: "Varyn", want: "revenge", text: "Varyn's sergeant." },
      { id: "c2", name: "Bohdan", aliases: [], faction: "Smugglers", tie: "", want: "coin", text: "A smuggler." },
    ],
    ...over,
  } as any;
}
const msgs = Array.from({ length: 100 }, (_, k) => ({ id: "m" + k, role: k % 2 ? "char" : "user", name: k % 2 ? "Odarka" : "Taras", text: "The road goes on." }));

describe("a record that leaves the story for good", () => {
  it("drops the event cards naming it, the cast cards tied to it, and its place in the groups; the bench lets it go", () => {
    const s = world();
    expect(benchDue({ state: s, msgs, snaps: {}, reg: null, personIds: new Set(), freq: "normal" }).length).toBe(1);
    applyReport(s, { retire: [{ id: "n1", text: "Varyn died in the duel at the gate." }] }, { cards: ["Odarka"], userName: "Taras", now: 2 });
    const v = s.entities[0];
    expect(v.status).toBe("past");
    // e1 names him, e3 by his alias; e2 stays
    expect(s.deck.map((c: any) => c.id)).toEqual(["e2"]);
    expect(s.cast.map((c: any) => c.name)).toEqual(["Bohdan"]);
    expect(s.entities[1].members).toEqual(["Oles"]);
    expect(v.gone).toEqual({ events: 2, cards: ["Ilka"], groups: ["City guard"] });
    expect(benchDue({ state: s, msgs, snaps: {}, reg: null, personIds: new Set(), freq: "normal" })).toEqual([]);
  });

  it("a group that is gone takes its faction's cards", () => {
    const s = world();
    applyReport(s, { retire: [{ id: "n2", text: "The guard was disbanded." }] }, { cards: [], userName: "Taras", now: 2 });
    expect(s.cast.map((c: any) => c.name)).toEqual(["Bohdan"]);
    expect(s.entities[1].gone).toEqual({ events: 0, cards: ["Ilka"], groups: [] });
  });

  it("the book entry says it is gone, even when the DM gave no new text; the card entry it is linked to is muted", () => {
    const m = memFs();
    const s = world();
    applyReport(s, { retire: [{ id: "n1" }] }, { cards: [], userName: "Taras", now: 2 });
    writeBook(m.fs, s, "T");
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    const entry = book.entries.find((e: any) => e.title === "Varyn");
    expect(entry.content).toStartWith("Varyn (gone from the story): Captain of the guard");
    expect(book.mutes).toEqual(["card-book#7"]);
    expect(bookMutes(s)).toEqual(["card-book#7"]);
  });

  it("a restore by the player brings the person back into the groups and unmutes the card entry; the cards stay dropped", () => {
    const m = memFs({
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "T", characterId: "odarka" }),
      "chats/c1.jsonl": "",
    });
    const s = world();
    m.files["world/state/c1.json"] = JSON.stringify(s);
    const put = (op: string, record: object) => (handleRoute({ method: "PUT", path: "/world/records", query: {}, body: { chatId: "c1", op, record } }, { fs: m.fs } as any) as any).json;
    put("retire", { id: "n1", text: "Varyn left the city for good." });
    let st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.entities[0].gone.groups).toEqual(["City guard"]);
    expect(st.entities[1].members).toEqual(["Oles"]);
    expect(JSON.parse(m.files["lorebooks/world-c1.json"]!).mutes).toEqual(["card-book#7"]);
    const peek = put("restore", { id: "n1" });
    st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.entities[0].status).toBe("active");
    expect(st.entities[0].gone).toBeUndefined();
    expect(st.entities[1].members).toEqual(["Oles", "Varyn"]);
    expect(st.cast.map((c: any) => c.name)).toEqual(["Bohdan"]);
    expect(JSON.parse(m.files["lorebooks/world-c1.json"]!).mutes).toBeUndefined();
    expect(peek.records.find((r: any) => r.id === "n1").gone).toBeUndefined();
  });
});

describe("events the player swipes away", () => {
  // the event rode the reply m3 (it followed m2); a swipe writes m3 again
  const chat = [
    { id: "m1", role: "user", name: "Taras", text: "a" },
    { id: "m2", role: "char", name: "Odarka", text: "b" },
    { id: "m2b", role: "user", name: "Taras", text: "c" },
    { id: "m3", role: "char", name: "Odarka", text: "Riders burst in." },
  ];
  const sent = (over: Record<string, unknown> = {}) => ({ text: "Riders burst into the inn, swords drawn.", hard: false, sent: 1, retried: false, after: "m2b#0", ...over });

  it("one swipe sends it again; the second drops it, with a signal and a line in the memory's log", () => {
    const m = memFs();
    const s = world({ event: sent() });
    let r = reconcile(m.fs, s, chat, { drop: "m3" });
    expect(r.event).toBe(true);
    expect(s.event).toMatchObject({ sent: 0, swiped: 1 });
    expect(s.signals.map((g: any) => [g.op, g.kind])).toEqual([["swipe", "event"]]);
    s.event = { ...s.event, sent: 1, after: "m2b#0" };
    r = reconcile(m.fs, s, chat, { drop: "m3" }) as any;
    expect(EVENT_SWIPES).toBe(2);
    expect(r.rejected).toBe(true);
    expect(s.event).toBeNull();
    expect(s.signals.map((g: any) => g.op)).toEqual(["swipe", "swipe", "reject"]);
    expect(s.signals[2].text).toBe("Riders burst into the inn, swords drawn.");
    expect(s.learned.log.at(-1)).toMatchObject({ act: "reject", key: "words", text: "Riders burst into the inn, swords drawn." });
  });

  it("a deleted reply is not a swipe: the event waits, nothing is counted", () => {
    const m = memFs();
    const s = world({ event: sent() });
    reconcile(m.fs, s, chat.slice(0, 3), {});
    expect(s.event).toMatchObject({ sent: 0 });
    expect(s.event.swiped).toBeUndefined();
    expect(s.signals).toBeUndefined();
  });

  it("an event the story took is a kept signal", () => {
    const s = world({ event: sent() });
    applyLevel(s, { delivered: true }, { level: "director", at: 5 } as any);
    expect(s.event).toBeNull();
    expect(s.signals.map((g: any) => [g.op, g.kind])).toEqual([["kept", "event"]]);
  });

  it("three dropped events, a third or more of those sent, raise a rule in words about the story; the answer makes it a story rule", () => {
    const now = 50 * DAY;
    const sig = (op: string, text: string, i: number) => ({ at: now - DAY + i, op, kind: "event", name: text.slice(0, 20), madeBy: "dm", text });
    const s = world({ signals: [sig("reject", "Bandits ambush the cart.", 1), sig("reject", "Wolves attack at night.", 2), sig("kept", "A letter arrives.", 3), sig("reject", "Raiders burn the farm.", 4)] });
    const ev = learnEvidence(s, now).find((c: any) => c.kind === "event") as any;
    expect(ev).toMatchObject({ key: "words", ev: { n: 3, total: 4, share: 75, kind: "event" } });
    // two are not enough
    expect(learnEvidence(world({ signals: s.signals.slice(0, 3) }), now).some((c: any) => c.kind === "event")).toBe(false);
    raiseProposals(s, now);
    const p = s.learned.proposals[0];
    expect(p).toMatchObject({ key: "words", state: "pending", ev: { kind: "event" } });
    p.text = "Do not interrupt calm travel with sudden attacks.";
    p.state = "ready";
    const m = memFs();
    expect(answerProposal(m.fs, s, p.id, "chat", now, false)).toBe("");
    expect(s.learned.rules[0]).toMatchObject({ text: "Do not interrupt calm travel with sudden attacks.", about: "story", scope: "chat" });
    expect(s.learned.answered.at(-1)).toMatchObject({ key: "words", kind: "event" });
  });
});

describe("rules about the story reach the writer", () => {
  const story = { id: "r1", scope: "chat", text: "Keep the romance slow.", about: "story", source: "player", at: 5 };
  const book = { id: "r2", scope: "chat", text: "Leave out passing strangers.", source: "player", at: 4 };

  it("the DM's block splits book rules from story rules; only story rules go to the writer, and only while both switches are on", () => {
    const L = { next: 3, rules: [story, book], proposals: [], answered: [], applied: [], log: [] };
    const set = { ...emptyState("c1").settings };
    const text = learnedInput(set, L, { rules: [] });
    expect(text).toContain("follow it when you record):\n- Leave out passing strangers.");
    expect(text).toContain("follow it when you choose events and the direction):\n- Keep the romance slow.");
    expect(writerRules(set, L, { rules: [] }).map((r: any) => r.id)).toEqual(["r1"]);
    expect(writerRules({ ...set, learnWriter: false }, L, { rules: [] })).toEqual([]);
    expect(writerRules({ ...set, learn: false }, L, { rules: [] })).toEqual([]);
    expect(writerInsert(writerRules(set, L, { rules: [] }))).toContain("- Keep the romance slow.");
    expect(writerInsert([])).toBe("");
  });

  it("the hook adds the wishes to the reply's request, and the ceiling makes room for them", () => {
    const L = { next: 3, rules: [story], proposals: [], answered: [], applied: [], log: [] };
    const m = memFs({
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "T", characterId: "odarka" }),
      "chats/c1.jsonl": JSON.stringify({ id: "m1", role: "user", name: "Taras", text: "Hi" }) + "\n",
      "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { ...emptyState("c1").settings, level: "chronicler" }, learned: L }),
    });
    const out = llmRequest({ key: "reply", request: { sessionId: "c1", messages: [{ role: "user", content: "Hi" }] }, turn: { op: "send" } }, { fs: m.fs, log: () => {} }) as any;
    expect(out.promptSources.parts.map((p: any) => p.label)).toContain("World · wishes");
    expect(insertCeiling({ chatId: "c1" }, { fs: m.fs }).ceilings.map((r: any) => r.id)).toContain("world wishes");
    // with the writer switch off: neither
    m.files["world/state/c1.json"] = JSON.stringify({ ...emptyState("c1"), settings: { ...emptyState("c1").settings, level: "chronicler", learnWriter: false }, learned: L });
    const off = llmRequest({ key: "reply", request: { sessionId: "c1", messages: [{ role: "user", content: "Hi" }] }, turn: { op: "send" } }, { fs: m.fs, log: () => {} }) as any;
    expect((off?.promptSources.parts ?? []).map((p: any) => p.label)).not.toContain("World · wishes");
    expect(insertCeiling({ chatId: "c1" }, { fs: m.fs }).ceilings.map((r: any) => r.id)).not.toContain("world wishes");
  });
});

describe("records the player keeps on purpose", () => {
  it("pins, hand-written and brought-back records are named to the DM as examples, newest first, only while they are in the book", () => {
    const s = world({
      entities: [rec("n1", "place", "Mill", "x"), rec("n2", "person", "Oles", "y"), rec("n3", "thing", "Map", "z", { status: "past" })],
      signals: [
        { at: 1, op: "pin", kind: "place", name: "Mill", madeBy: "dm" },
        { at: 2, op: "add", kind: "person", name: "Oles", madeBy: "player" },
        { at: 3, op: "pin", kind: "thing", name: "Map", madeBy: "dm" },
        { at: 4, op: "delete", kind: "thing", name: "Cup", madeBy: "dm" },
      ],
    });
    expect(keptRecords(s).map((e: any) => e.name)).toEqual(["Oles", "Mill"]);
    expect(learnedInput(s.settings, null, { rules: [] }, s)).toBe("Records this player keeps on purpose (pinned, written or brought back by hand), examples of what they want recorded: Oles, Mill.");
    expect(learnedInput({ ...s.settings, learn: false }, null, { rules: [] }, s)).toBe("");
    const m = memFs();
    expect(learnedView(m.fs, s).kept.map((k: any) => k.name)).toEqual(["Oles", "Mill"]);
  });
});
