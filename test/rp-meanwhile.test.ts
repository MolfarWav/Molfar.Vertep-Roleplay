// Meanwhile, the pure part (#449, M1a): what an event may be, when a pass is due, the rollback, the prompt, the reader of the
// answer, and what Litopys and the panel get.
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as mw from "../plugins/meanwhile/plugin.js";

const entities = [
  { id: "user", kind: "person", name: "Mira", aliases: [] },
  { id: "p1", kind: "person", name: "Ada", aliases: [{ text: "Adelina", src: "card" }] },
  { id: "p2", kind: "person", name: "Bram", aliases: [] },
  { id: "p3", kind: "person", name: "Cora", aliases: [] },
  { id: "p4", kind: "person", name: "Dmytro", aliases: [], merged: "p2" },
  { id: "o1", kind: "thing", name: "the ledger", aliases: [] },
  { id: "l1", kind: "place", name: "the mill", aliases: [] },
  { id: "l2", kind: "place", name: "the harbour", aliases: [] },
];
const index = mw.registryIndex(entities);
const ctx = (present: string[] = ["Cora"], fronts: string[] = ["f1"]) => ({ index, present: mw.presentIds(index, present), fronts });
const ev = (more: Record<string, unknown> = {}) => ({
  who: ["p1"], what: "Ada burns the old ledger at the mill.", where: "l1", when: "that night", witnesses: [], visibility: "secret", effects: [], ...more,
});
const clean = (raw: unknown, c = ctx()) => mw.cleanEvent(raw, c);

describe("registry reading", () => {
  it("finds who is in the scene by name, alias or id, and follows a merge", () => {
    expect([...mw.presentIds(index, ["adelina", "BRAM"])].sort()).toEqual(["p1", "p2"]);
    expect([...mw.presentIds(index, ["p3"])]).toEqual(["p3"]);
    expect(index.resolve("p4").id).toBe("p2");
    expect(index.resolve("p9")).toBeNull();
  });
});

describe("cleanEvent", () => {
  it("accepts a plain event and names the place", () => {
    const r = clean(ev());
    expect(r.ok).toBe(true);
    expect(r.event).toMatchObject({ who: ["p1"], where: "l1", whereName: "the mill", visibility: "secret", witnesses: [] });
  });

  it("drops an event that names the player's character, anyone in the scene, an unknown id or a thing", () => {
    expect(clean(ev({ who: ["user"] })).ok).toBe(false);
    expect(clean(ev({ who: ["p3"] })).reason).toMatch(/in the scene/);
    expect(clean(ev({ witnesses: ["p3"] })).ok).toBe(false);
    expect(clean(ev({ who: ["p9"] })).reason).toMatch(/unknown id/);
    expect(clean(ev({ who: ["o1"] })).ok).toBe(false);
    expect(clean(ev({ who: ["Ada"] })).ok).toBe(false);
    expect(clean(ev({ who: [] })).reason).toMatch(/no who/);
  });

  it("follows a merged id to its target and does not list a person twice", () => {
    const r = clean(ev({ who: ["p4", "p2"] }));
    expect(r.event.who).toEqual(["p2"]);
  });

  it("checks what, visibility and where", () => {
    expect(clean(ev({ what: "Too short" })).ok).toBe(false);
    expect(clean(ev({ what: "x".repeat(281) })).reason).toMatch(/too long/);
    expect(clean(ev({ visibility: "famous" })).ok).toBe(false);
    expect(clean(ev({ where: "l9" })).reason).toMatch(/unknown place/);
    expect(clean(ev({ where: "o1" })).ok).toBe(true); // free text that is not a place id stays as words
    expect(clean(ev({ where: "on the road to the harbour" })).event.whereName).toBe("on the road to the harbour");
    expect(clean("nope").ok).toBe(false);
  });

  it("takes effects only from the list, with real ids, about people the event involves", () => {
    const e = clean(ev({
      who: ["p1", "p2"],
      effects: [
        { type: "front_clock", front: "f1" },
        { type: "relation", a: "p1", b: "p2", change: "cooler" },
        { type: "npc_moved", who: "p2", to: "l2" },
      ],
    }));
    expect(e.ok).toBe(true);
    expect(e.event.effects).toHaveLength(3);
    const only = (effect: unknown) => clean(ev({ who: ["p1", "p2"], effects: [effect] }));
    expect(only({ type: "front_clock", front: "f7" }).ok).toBe(false);
    expect(only({ type: "kill", who: "p1" }).ok).toBe(false);
    expect(only({ type: "relation", a: "p1", b: "p1", change: "closer" }).ok).toBe(false);
    expect(only({ type: "relation", a: "p1", b: "p3", change: "closer" }).ok).toBe(false); // p3 is in the scene
    // one side in the event is enough: Elena begs Bram, and Bram is only named
    expect(clean(ev({ who: ["p1"], effects: [{ type: "relation", a: "p1", b: "p2", change: "cooler" }] })).ok).toBe(true);
    expect(clean(ev({ who: ["p1"], effects: [{ type: "relation", a: "p2", b: "p5", change: "cooler" }] })).ok).toBe(false);
    expect(only({ type: "relation", a: "p1", b: "p2", change: "marry" }).ok).toBe(false);
    expect(only({ type: "npc_moved", who: "p3", to: "l1" }).ok).toBe(false);
    expect(only({ type: "npc_moved", who: "p1", to: "Rome" }).ok).toBe(false);
    expect(only({ type: "injury_healed", who: "p2" }).ok).toBe(true);
    expect(only({ type: "item_moved", item: "o1", to: "l2" }).ok).toBe(true);
    expect(only({ type: "item_moved", item: "o1", to: "p2" }).ok).toBe(true);
    expect(only({ type: "item_moved", item: "o1", to: "p3" }).ok).toBe(false);
    expect(only({ type: "item_moved", item: "o9", to: "l1" }).ok).toBe(false);
    expect(clean(ev({ effects: Array(4).fill({ type: "front_clock", front: "f1" }) })).reason).toMatch(/too many effects/);
  });
});

describe("buildEvents", () => {
  it("numbers the survivors, drops the failed whole, limits to k and skips a repeat", () => {
    const list = [
      ev(),
      ev({ who: ["user"] }),
      ev({ what: "ADA burns the old ledger at the mill." }),
      ev({ who: ["p2"], what: "Bram sells a horse at the harbour market." }),
      ev({ who: ["p2"], what: "Bram meets a stranger at the gate by night." }),
    ];
    const r = mw.buildEvents(list, ctx(), { k: 2, afterKey: "m5#0", next: 4, now: 99 });
    expect(r.events.map((e: { id: string }) => e.id)).toEqual(["m4", "m5"]);
    expect(r.events[0]).toMatchObject({ afterKey: "m5#0", at: 99, status: "active" });
    expect(r.next).toBe(6);
    expect(r.dropped.map((d: { index: number }) => d.index)).toEqual([1, 2, 4]);
    expect(r.dropped[2].reason).toMatch(/over the limit/);
    expect(mw.buildEvents("not a list", ctx(), {}).events).toEqual([]);
  });
});

describe("buildEvents against earlier events", () => {
  const earlier = [{ who: ["p1"], what: "Ada lying on the road slowly moves the fingers of her right hand, her pulse thin." }];
  const run = (list: unknown[], before = earlier) => mw.buildEvents(list, ctx(), { afterKey: "m9#0", earlier: before });

  it("drops an event about the same person that says the same again, even a little reworded", () => {
    const r = run([ev({ what: "Ada, lying on the road, slowly moves the fingers of her right hand." })]);
    expect(r.events).toEqual([]);
    expect(r.dropped).toEqual([{ index: 0, reason: "repeats an earlier event" }]);
  });
  it("keeps a step further, an event about someone else and the same words on another person", () => {
    const r = run([
      ev({ what: "Ada opens her eyes, the gaze still dull, and looks for the light." }),
      ev({ who: ["p2"], what: "Ada, lying on the road, slowly moves the fingers of her right hand." }),
    ]);
    expect(r.events.length).toBe(2);
  });
  it("counts the events of the same pass and ignores everything when nothing earlier is given", () => {
    const twice = [ev({ what: "Bram carries the sacks to the harbour at dawn." }), ev({ what: "Bram carries the sacks to the harbour at dawn again." })];
    expect(mw.buildEvents(twice.map((e) => ({ ...e, who: ["p2"] })), ctx(), {}).events.length).toBe(1);
    expect(run([ev({ what: "Ada, lying on the road, slowly moves the fingers of her right hand." })], []).events.length).toBe(1);
  });
  it("measures the shared words", () => {
    expect(mw.overlap("the mill burns", "The Mill burns!")).toBe(1);
    expect(mw.overlap("the mill burns", "a horse sold")).toBe(0);
    expect(mw.overlap("", "x")).toBe(0);
  });
});

const snap = (day: number, time: string, isNew = false) => ({ clock: { day, time }, scene: { new: isNew } });
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "m" + (i + 1), role: i % 2 ? "user" : "assistant" }));
const cfg = (more = {}) => mw.cleanConfig({ enabled: true, ...more });

describe("dueReason", () => {
  const snaps = (spec: Record<string, unknown>) => spec;
  const state = (cursor = "") => ({ ...mw.emptyState("c"), cursor });

  it("is off by default and in a fight", () => {
    const s = snaps({ "m1#0": snap(1, "10:00"), "m2#0": snap(1, "10:10"), "m3#0": snap(1, "10:20") });
    expect(mw.dueReason({ state: state(), cfg: mw.cleanConfig({}), msgs: msgs(3), snaps: s }).reason).toBe("off");
    expect(mw.dueReason({ state: state(), cfg: cfg(), msgs: msgs(3), snaps: s, inCombat: true }).reason).toBe("combat");
    expect(mw.dueReason({ state: state(), cfg: cfg(), msgs: msgs(3), snaps: {} }).reason).toBe("no-dashboard");
  });

  it("waits for a few replies after the cursor", () => {
    const s = snaps({ "m1#0": snap(1, "10:00"), "m2#0": snap(2, "10:00", true), "m3#0": snap(2, "10:10") });
    expect(mw.dueReason({ state: state("m2#0"), cfg: cfg(), msgs: msgs(3), snaps: s }).reason).toBe("few");
  });

  it("runs when a new scene began since the cursor", () => {
    const s = snaps({ "m1#0": snap(1, "10:00"), "m2#0": snap(1, "10:05", true), "m3#0": snap(1, "10:10") });
    const r = mw.dueReason({ state: state(), cfg: cfg(), msgs: msgs(3), snaps: s });
    expect(r).toMatchObject({ due: true, reason: "scene", to: "m3#0", replies: 3 });
  });

  it("runs when the story clock moved by the span, and not before", () => {
    const quiet = snaps({ "m1#0": snap(1, "10:00"), "m2#0": snap(1, "12:00"), "m3#0": snap(1, "15:00") });
    expect(mw.dueReason({ state: state("m1#0"), cfg: cfg(), msgs: msgs(3), snaps: quiet })).toMatchObject({ due: false, reason: "quiet", spanMinutes: 300 });
    const jump = snaps({ "m1#0": snap(1, "10:00"), "m2#0": snap(1, "12:00"), "m3#0": snap(2, "05:00") });
    const r = mw.dueReason({ state: state("m1#0"), cfg: cfg(), msgs: msgs(3), snaps: jump });
    expect(r).toMatchObject({ due: true, reason: "clock", from: "m1#0", spanMinutes: 19 * 60 });
  });

  it("a scene that began before the cursor does not count again", () => {
    const s = snaps({ "m1#0": snap(1, "10:00", true), "m2#0": snap(1, "10:05"), "m3#0": snap(1, "10:10"), "m4#0": snap(1, "10:15") });
    expect(mw.dueReason({ state: state("m2#0"), cfg: cfg(), msgs: msgs(4), snaps: s }).due).toBe(false);
  });
});

describe("rollback", () => {
  const base = () => {
    const a = mw.buildEvents([ev()], ctx(), { afterKey: "m2#0", next: 1 });
    const b = mw.buildEvents([ev({ who: ["p2"], what: "Bram sells a horse at the harbour market." })], ctx(), { afterKey: "m4#0", next: a.next });
    let st = mw.emptyState("c");
    st = mw.recordPass(st, { events: a.events, next: a.next, key: "m2#0", at: 1, reason: "scene" });
    st = mw.recordPass(st, { events: b.events, next: b.next, key: "m4#0", at: 2, reason: "clock" });
    return st;
  };

  it("keeps everything while the line holds", () => {
    const r = mw.reconcile(base(), msgs(4).map((m) => ({ ...m, swipe: 0 })));
    expect(r.undone).toEqual([]);
    expect(r.state.cursor).toBe("m4#0");
  });

  it("a swipe takes back the pass that read the swiped reply and moves the cursor back", () => {
    const line = [...msgs(3), { id: "m4", swipe: 1 }].map((m) => ({ swipe: 0, ...m }));
    const r = mw.reconcile(base(), line);
    expect(r.undone.map((e: { id: string }) => e.id)).toEqual(["m2"]);
    expect(r.state.cursor).toBe("m2#0");
    expect(r.state.passes.map((p: { key: string }) => p.key)).toEqual(["m2#0"]);
    expect(r.state.events.find((e: { id: string }) => e.id === "m2").status).toBe("undone");
    // the same state again undoes nothing more
    expect(mw.reconcile(r.state, line).undone).toEqual([]);
  });

  it("a delete far back takes both passes and clears the cursor; dropUndone erases what the caller retired", () => {
    const r = mw.reconcile(base(), [{ id: "m1", swipe: 0 }]);
    expect(r.undone).toHaveLength(2);
    expect(r.state.cursor).toBe("");
    const kept = mw.dropUndone(r.state, ["m1"]);
    expect(kept.events.map((e: { id: string }) => e.id)).toEqual(["m2"]);
  });

  it("does not change the state it is given", () => {
    const st = base();
    const copy = JSON.stringify(st);
    mw.reconcile(st, []);
    expect(JSON.stringify(st)).toBe(copy);
  });
});

describe("state and config", () => {
  it("clamps the config and repairs a broken state file", () => {
    expect(mw.cleanConfig({ k: 99, clockHours: 0, spoilers: "x", model: "a b" })).toMatchObject({ enabled: false, k: 6, clockHours: 1, spoilers: "hints", model: "" });
    expect(mw.cleanConfig({ spoilers: "all", k: 2 })).toMatchObject({ spoilers: "all", k: 2 });
    expect(mw.cleanState("junk", "c")).toEqual(mw.emptyState("c"));
    const st = mw.cleanState({ cursor: "m1#0", events: [{ id: "m1", what: "x", status: "weird" }, { id: "", what: "y" }, 5], passes: [{}, { key: "m1#0" }] }, "c");
    expect(st.events).toHaveLength(1);
    expect(st.events[0].status).toBe("active");
    expect(st.passes).toHaveLength(1);
    expect(st.next).toBeGreaterThanOrEqual(2);
  });
});

describe("prompt and answer", () => {
  const input = {
    k: 3,
    scene: { place: "the mill", present: ["Cora", "Mira"] },
    span: 9 * 60,
    fronts: [{ id: "f1", name: "The Guild", goal: "take the harbour", clock: 2, size: 6 }],
    npcs: [{ id: "p2", name: "Bram", goal: "pay a debt", where: "the harbour" }],
    absent: [{ id: "p1", name: "Ada", goal: "hide the ledger" }],
    places: [{ id: "l1", name: "the mill" }, { id: "l2", name: "the harbour" }],
    recent: ["Bram sold a horse."],
  };

  it("builds a request that names the ids, the time and the limit, and keeps the player out", () => {
    const p = mw.buildPrompt(input);
    expect(p.system).toContain("up to 3");
    expect(p.system).toContain("never the player's character");
    expect(p.user).toContain("p2 Bram: wants pay a debt; at the harbour");
    expect(p.user).toContain("f1 The Guild: wants take the harbour (clock 2/6)");
    expect(p.user).toContain("about 9 hours");
    expect(p.user).toContain("Bram sold a horse.");
    expect(p.tokens).toBeGreaterThan(300);
    expect(p.tokens).toBeLessThan(900);
  });

  it("caps the lists and survives empty input", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, name: "Name" + i }));
    const p = mw.buildPrompt({ ...input, npcs: many, absent: many, places: many.map((m) => ({ ...m, id: "l" + m.id.slice(1) })) });
    expect(p.user.match(/^- p\d+ Name/gm)?.length).toBe(12 + 10);
    expect(p.user.match(/^- l\d+ Name/gm)?.length).toBe(12);
    expect(mw.buildPrompt({}).user).toContain("Nobody else is in the scene");
  });

  it("spans in words", () => {
    expect(mw.spanWords(30)).toBe("30 minutes");
    expect(mw.spanWords(540)).toBe("about 9 hours");
    expect(mw.spanWords(3 * 1440)).toBe("3 days");
  });

  it("reads the events, whatever surrounds them", () => {
    const body = JSON.stringify({ events: [ev()] });
    expect(mw.parseEvents(body)).toHaveLength(1);
    expect(mw.parseEvents("```json\n" + body + "\n```")).toHaveLength(1);
    expect(mw.parseEvents("<think>{\"events\": []}</think>" + body)).toHaveLength(1);
    expect(mw.parseEvents("Draft {a:1}. Final: " + body.replace("]}", ",]}"))).toHaveLength(1);
    expect(mw.parseEvents("{\"events\":[]}")).toEqual([]);
    expect(mw.parseEvents("no json here")).toBeNull();
    expect(mw.parseEvents('{"other": 1}')).toBeNull();
  });
});

describe("what the app gets", () => {
  const made = (more = {}) => mw.buildEvents([ev({ who: ["p1", "p2"], witnesses: [], ...more })], ctx([]), { afterKey: "m2#0" }).events[0];

  it("a fact names only the people it happened to and those who saw it, never the player", () => {
    const f = mw.factDraft(made({ witnesses: ["p3"] }), index);
    expect(f.knownBy).toEqual(["Ada", "Bram", "Cora"]);
    expect(f.knownBy).not.toContain("Mira");
    expect(f).toMatchObject({ origin: "meanwhile", personaUnaware: true, secret: true, eventId: "m1", type: "event" });
    expect(mw.factDraft(made({ visibility: "public" }), index).secret).toBe(false);
    // even a hand-made event that lists the player yields no name for them
    const rogue = { ...made(), who: ["user", "p1"] };
    expect(mw.factDraft(rogue, index).knownBy).toEqual(["Ada"]);
  });

  it("the panel shows nothing, a hint or everything, by the spoiler setting", () => {
    const e = made({ witnesses: ["p3"] });
    expect(mw.spoilerView(e, "none", index)).toEqual({ id: "m1", visibility: "secret", status: "active" });
    const hint = mw.spoilerView(e, "hints", index);
    expect(hint).toMatchObject({ who: ["Ada", "Bram"], where: "the mill" });
    expect(hint.what).toBeUndefined();
    expect(hint.witnesses).toBeUndefined();
    const all = mw.spoilerView(e, "all", index);
    expect(all.what).toContain("Ada burns");
    expect(all.witnesses).toEqual(["Cora"]);
  });

  it("answers only its own paths", () => {
    expect(mw.handleRoute({ path: "/world/state", method: "GET" }, {})).toBeNull();
  });
});
