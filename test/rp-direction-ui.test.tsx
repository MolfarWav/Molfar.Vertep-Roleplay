/**
 * Direction's screens (#496): the director bar in each state (no model, off, running, a report, locked, an error), the
 * presence marks on the member chips, the pure helpers behind them, and the member picker of "New group". The bar is rendered
 * to static markup from a state the plugin could have answered; popovers are closed there, so the checks read the bar itself.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { DirectorBarView } = await import("../src/components/chat/director-bar");
const { PresenceMark } = await import("../src/components/chat/group-member-bar");
const { barMode, errorKey, lastRun, namesOf, presenceOf, tagKey } = await import("../src/lib/direction-ui");
const { autoGroupName, moveInOrder, pickCharacters, tagCounts } = await import("../src/lib/group-picker");
const { DICTIONARIES } = await import("../src/lib/i18n");
import type { DirectionState } from "../src/lib/direction";

const members = [
  { id: "yuzu", name: "Yuzu" },
  { id: "hana", name: "Hana" },
  { id: "aoi", name: "Aoi" },
  { id: "mei", name: "Mei" },
];
const base = (over: Partial<DirectionState> = {}): DirectionState => ({
  config: { model: "mock/director" },
  chat: { on: true, lock: null, returning: null },
  scene: { source: "director", present: ["yuzu"], tag: "alone_moment" },
  report: { key: "m1#0", at: Date.now() - 60_000, tag: "alone_moment", present: ["yuzu"], sceneNew: true, model: "mock/director", ms: 640 },
  members,
  log: [{ at: Date.now() - 60_000, kind: "report", key: "m1#0", tag: "alone_moment", present: ["yuzu"], ms: 640, usage: { input: 900, output: 40 } }],
  usage: { input: 900, output: 40, runs: 1 },
  ...over,
});
const noop = () => {};
const bar = (state: DirectionState, running = false) =>
  renderToStaticMarkup(<DirectorBarView state={state} running={running} onPickModel={noop} onToggle={noop} onReport={noop} onRelease={noop} />);

describe("the director bar", () => {
  it("with a report: the scene chip names the tag and who is here, the model chip and the log button show", () => {
    const html = bar(base());
    expect(html).toContain('data-mode="report"');
    expect(html).toContain("Alone moment");
    expect(html).toContain("with Yuzu");
    expect(html).toContain('data-testid="director-model"');
    expect(html).toContain('data-testid="director-log"');
    expect(html).toContain('data-testid="director-switch"');
    expect(html).not.toContain("director-need-model");
  });

  it("several here: the chip says how many", () => {
    const html = bar(base({ scene: { source: "director", present: ["yuzu", "hana", "aoi"], tag: "lesson" } }));
    expect(html).toContain("Lesson");
    expect(html).toContain("3 here");
  });

  it("no model: a tonal 'Pick a model', the switch disabled with its reason in words, no scene chip, no log", () => {
    const html = bar(base({ config: { model: "" }, chat: { on: false, lock: null, returning: null } }));
    expect(html).toContain('data-mode="no-model"');
    expect(html).toContain("Pick a model");
    expect(html).toContain("Pick a model first");
    expect(html).toContain('data-testid="director-need-model"');
    expect(html).not.toContain('data-testid="director-scene"');
    expect(html).not.toContain('data-testid="director-log"');
    expect(/data-testid="director-switch"[^>]*data-disabled|data-disabled[^>]*data-testid="director-switch"|disabled=""[^>]*data-testid="director-switch"|data-testid="director-switch"[^>]*disabled=""/.test(html)).toBe(true);
  });

  it("off: folds to the icon, 'Direction: off' and the switch", () => {
    const html = bar(base({ chat: { on: false, lock: null, returning: null } }));
    expect(html).toContain('data-mode="off"');
    expect(html).toContain("Direction: off");
    expect(html).toContain('data-testid="director-switch"');
    expect(html).not.toContain('data-testid="director-scene"');
    expect(html).not.toContain('data-testid="director-model"');
    expect(html).not.toContain('data-testid="director-log"');
  });

  it("running: the scene chip pulses and says it is reading", () => {
    const html = bar(base(), true);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("Reading the scene");
  });

  it("no report yet: the chip says so", () => {
    const html = bar(base({ report: null, log: [], scene: { source: "dashboard", present: ["yuzu", "hana"], tag: null } }));
    expect(html).toContain('data-mode="empty"');
    expect(html).toContain("No report yet");
  });

  it("an error after the last report: 'No report' in the error tone", () => {
    const html = bar(base({ log: [{ at: Date.now(), kind: "error", reason: "bad-reply", message: "no json" }, ...base().log] }));
    expect(html).toContain('data-mode="error"');
    expect(html).toContain("No report");
    expect(html).toContain("text-destructive");
  });

  it("an error older than the report does not count", () => {
    const st = base({ log: [...base().log, { at: Date.now() - 600_000, kind: "error", reason: "error" }] });
    expect(barMode(st)).toBe("report");
  });

  it("locked: a lock chip 'Only Yuzu' with its release button, before the scene chip", () => {
    const html = bar(base({ chat: { on: true, lock: { ids: ["yuzu"], at: 1 }, returning: null }, scene: { source: "lock", present: ["yuzu"], tag: "alone_moment" } }));
    expect(html).toContain('data-testid="director-lock"');
    expect(html).toContain("Only Yuzu");
    expect(html).toContain('aria-label="Release the lock"');
    expect(html.indexOf("director-lock")).toBeLessThan(html.indexOf("director-scene"));
  });

  it("the label hides below 480 px but the icon group keeps its aria-label", () => {
    const html = bar(base());
    expect(html).toContain("max-[479px]:hidden");
    expect(html).toContain('aria-label="Direction"');
  });
});

describe("presence on the member chips", () => {
  it("none known: no marks at all", () => {
    expect(presenceOf({ source: "none", present: [], tag: null }, "yuzu")).toBe("unknown");
    expect(presenceOf(null, "yuzu")).toBe("unknown");
    expect(renderToStaticMarkup(<PresenceMark presence="unknown" />)).toBe("");
  });
  it("director or Dashboard: present, or away with a door mark", () => {
    const scene = { source: "director" as const, present: ["yuzu"], tag: null };
    expect(presenceOf(scene, "yuzu")).toBe("here");
    expect(presenceOf(scene, "hana")).toBe("away");
    expect(renderToStaticMarkup(<PresenceMark presence="away" />)).toContain("presence-away");
    expect(renderToStaticMarkup(<PresenceMark presence="here" />)).toBe("");
  });
  it("a lock: the others are locked out, with a lock mark", () => {
    const scene = { source: "lock" as const, present: ["yuzu"], tag: null };
    expect(presenceOf(scene, "hana")).toBe("locked");
    expect(renderToStaticMarkup(<PresenceMark presence="locked" />)).toContain("presence-locked");
  });
});

describe("helpers", () => {
  it("names: all, or the first two and a count", () => {
    const st = base();
    expect(namesOf(st, ["yuzu"])).toBe("Yuzu");
    expect(namesOf(st, ["yuzu", "hana"])).toBe("Yuzu, Hana");
    expect(namesOf(st, ["yuzu", "hana", "aoi", "mei"])).toBe("Yuzu, Hana +2");
  });
  it("the newest run is the first report or error in the log", () => {
    expect(lastRun([{ at: 3, kind: "on" }, { at: 2, kind: "error" }, { at: 1, kind: "report" }])?.kind).toBe("error");
    expect(lastRun([])).toBeNull();
  });
  it("tags and errors map to keys that exist in both languages", () => {
    for (const k of [tagKey(null), tagKey("lesson"), tagKey("alone_moment"), tagKey("group_out"), errorKey("bad-reply"), errorKey("no-model"), errorKey("x")]) {
      expect(DICTIONARIES.en[k], k).toBeTruthy();
      expect(DICTIONARIES.uk[k], k).toBeTruthy();
    }
  });
});

const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, tags: [], isGroup: false, favorite: false, lastChatAt: 0, ...extra }) as any;
const cast = [
  card("a", "Hana", { tags: ["school", "romance"], favorite: true, lastChatAt: 30 }),
  card("b", "Aoi", { tags: ["school"], lastChatAt: 10 }),
  card("c", "Yuzu", { tags: ["comedy"], favorite: true, lastChatAt: 20 }),
  card("d", "Mei", { tags: ["fantasy", "school"] }),
];
const counts = new Map([["d", 5], ["a", 2]]);
const names = (l: any[]) => l.map((c) => c.name);

describe("the member picker's filters", () => {
  const all = { query: "", scope: "all" as const, tags: [] as string[], sort: "name" as const };
  it("sorts by name, by recent use and by number of chats", () => {
    expect(names(pickCharacters(cast, all, counts))).toEqual(["Aoi", "Hana", "Mei", "Yuzu"]);
    expect(names(pickCharacters(cast, { ...all, sort: "recent" }, counts))).toEqual(["Hana", "Yuzu", "Aoi", "Mei"]);
    expect(names(pickCharacters(cast, { ...all, sort: "chats" }, counts))).toEqual(["Mei", "Hana", "Aoi", "Yuzu"]);
  });
  it("searches names and tags; favourites and recent narrow the list", () => {
    expect(names(pickCharacters(cast, { ...all, query: "ha" }, counts))).toEqual(["Hana"]);
    expect(names(pickCharacters(cast, { ...all, query: "fantasy" }, counts))).toEqual(["Mei"]);
    expect(names(pickCharacters(cast, { ...all, scope: "fav" }, counts))).toEqual(["Hana", "Yuzu"]);
    expect(names(pickCharacters(cast, { ...all, scope: "recent" }, counts))).toEqual(["Aoi", "Hana", "Yuzu"]);
  });
  it("tag chips narrow to characters that carry every picked tag; nothing left is an empty list", () => {
    expect(names(pickCharacters(cast, { ...all, tags: ["school"] }, counts))).toEqual(["Aoi", "Hana", "Mei"]);
    expect(names(pickCharacters(cast, { ...all, tags: ["school", "romance"] }, counts))).toEqual(["Hana"]);
    expect(pickCharacters(cast, { ...all, query: "zzz" }, counts)).toEqual([]);
  });
  it("the tag chips count and order the tags", () => {
    expect(tagCounts(cast)[0]).toEqual({ tag: "school", n: 3 });
  });
  it("the speaking order moves one step and stops at the ends; a blank name is made from the first three", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(autoGroupName(cast)).toBe("Group: Hana, Aoi, Yuzu");
  });
});
