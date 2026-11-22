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
const { actLine, barMode, errorKey, fireBlockedKey, fireFor, lastRun, logWords, markText, namesOf, presenceOf, ruleStatusLine, tagKey } = await import("../src/lib/direction-ui");
const { RuleNumbers, RulesTabView } = await import("../src/components/chat/direction-sheet");
const { DirectionNoteView } = await import("../src/components/chat/direction-note");
const { DirectionLog } = await import("../src/components/chat/director-bar");
const { clampRuleNumber, needPercent } = await import("../src/lib/direction");
const { t: translate } = await import("../src/lib/i18n");
const t = (key: any, vars?: any) => translate(key, "en", vars);
const { autoGroupName, moveInOrder, pickCharacters, tagCounts } = await import("../src/lib/group-picker");
const { DICTIONARIES } = await import("../src/lib/i18n");
import type { DirectionFire, DirectionRule, DirectionState } from "../src/lib/direction";

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
  it("with a report: the scene chip names the tag and who is here, the model chip and the Rules button show", () => {
    const html = bar(base());
    expect(html).toContain('data-mode="report"');
    expect(html).toContain("Alone moment");
    expect(html).toContain("with Yuzu");
    expect(html).toContain('data-testid="director-model"');
    expect(html).toContain('data-testid="director-rules"');
    expect(html).toContain("Rules");
    expect(html).toContain('data-testid="director-switch"');
    expect(html).not.toContain("director-need-model");
  });

  it("several here: the chip says how many", () => {
    const html = bar(base({ scene: { source: "director", present: ["yuzu", "hana", "aoi"], tag: "lesson" } }));
    expect(html).toContain("Lesson");
    expect(html).toContain("3 here");
  });

  it("no model: a tonal 'Pick a model', the switch disabled with its reason in words, no scene chip, no Rules button", () => {
    const html = bar(base({ config: { model: "" }, chat: { on: false, lock: null, returning: null } }));
    expect(html).toContain('data-mode="no-model"');
    expect(html).toContain("Pick a model");
    expect(html).toContain("Pick a model first");
    expect(html).toContain('data-testid="director-need-model"');
    expect(html).not.toContain('data-testid="director-scene"');
    expect(html).not.toContain('data-testid="director-rules"');
    expect(/data-testid="director-switch"[^>]*data-disabled|data-disabled[^>]*data-testid="director-switch"|disabled=""[^>]*data-testid="director-switch"|data-testid="director-switch"[^>]*disabled=""/.test(html)).toBe(true);
  });

  it("off: folds to the icon, 'Direction: off' and the switch", () => {
    const html = bar(base({ chat: { on: false, lock: null, returning: null } }));
    expect(html).toContain('data-mode="off"');
    expect(html).toContain("Direction: off");
    expect(html).toContain('data-testid="director-switch"');
    expect(html).not.toContain('data-testid="director-scene"');
    expect(html).not.toContain('data-testid="director-model"');
    expect(html).not.toContain('data-testid="director-rules"');
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

// ---------- genre rules (phase 2) ----------

const rule = (over: Partial<DirectionRule> = {}): DirectionRule => ({
  id: "interrupted", name: "Interrupted moment", kind: "interrupt", on: true, need: 8, cooldown: 5, k: 3, m: 4, status: "ready", left: 0, tension: 0, ...over,
});
const withRules = (items: DirectionRule[], over: Partial<DirectionState> = {}, rules: Partial<NonNullable<DirectionState["rules"]>> = {}): DirectionState =>
  base({ rules: { set: "romcom", on: true, sets: [{ id: "romcom", name: "School rom-com" }], items, ...rules }, ...over });
const tab = (state: DirectionState, foldsOpen = false) =>
  renderToStaticMarkup(<RulesTabView state={state} onSet={noop} onOn={noop} onRule={noop} onFire={noop} onSkip={noop} foldsOpen={foldsOpen} />);
const isDisabled = (tag: string) => / disabled=""| data-disabled/.test(tag);
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";

describe("the chance of a roll", () => {
  it("2d6 at least n: the table of percents, 13 = never", () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => needPercent[n])).toEqual([100, 97, 92, 83, 72, 58, 42, 28, 17, 8, 3]);
    expect(needPercent[13]).toBe(0);
  });
  it("a number is rounded and kept inside the plugin's range", () => {
    expect(clampRuleNumber("need", 1)).toBe(2);
    expect(clampRuleNumber("need", 99)).toBe(13);
    expect(clampRuleNumber("cooldown", -4)).toBe(0);
    expect(clampRuleNumber("cooldown", 31)).toBe(30);
    expect(clampRuleNumber("k", 10.6)).toBe(10);
    expect(clampRuleNumber("m", 20.4)).toBe(20);
  });
});

describe("the Rules tab", () => {
  it("a genre picked and the rules on: the genre row, the switch with its words, one card per rule", () => {
    const html = tab(withRules([rule(), rule({ id: "nobody", name: "Someone comes by", kind: "return" }), rule({ id: "crowd", name: "Friends join the break", kind: "join" })]));
    expect(html).toContain("Genre");
    expect(html).toContain("School rom-com");
    expect(html).toContain("On: a rule may fire after any reply.");
    for (const id of ["interrupted", "nobody", "crowd"]) expect(html).toContain(`data-testid="rule-${id}"`);
    expect(html).toContain("When you are alone with one member for a few replies, someone walks in on you.");
    expect(html).toContain("When nobody is around for a few replies, someone comes by.");
    expect(html).toContain("In a break, lunch or club with one or two present, a friend joins.");
    expect(html).toContain("Numbers");
  });

  it("no genre: the reason is in words, nothing to switch", () => {
    const html = tab(withRules([], {}, { set: "", on: false }));
    expect(html).toContain("Pick a genre first.");
    expect(isDisabled(tagOf(html, "rules-switch"))).toBe(true);
  });

  it("Direction off: the same screen read-only, with the reason", () => {
    const html = tab(withRules([rule()], { chat: { on: false, lock: null, returning: null } }));
    expect(html).toContain("Needs the director on in this chat.");
    expect(isDisabled(tagOf(html, "rule-switch-interrupted"))).toBe(true);
    expect(html).toContain('aria-disabled="true"');
  });

  it("each status in words: ready, cooling down, quiet for the payoff, tension, off", () => {
    expect(ruleStatusLine(t, rule())).toBe("Ready");
    expect(ruleStatusLine(t, rule({ tension: 2 }))).toBe("Ready · Tension 2 of 3");
    expect(ruleStatusLine(t, rule({ status: "cooldown", left: 3, tension: 1 }))).toBe("Cooling down: 3 more replies · Tension 1 of 3");
    expect(ruleStatusLine(t, rule({ status: "cooldown", left: 1 }))).toBe("Cooling down: 1 more reply");
    expect(ruleStatusLine(t, rule({ status: "payoff", left: 6 }))).toBe("Quiet for the payoff: 6 more replies");
    expect(ruleStatusLine(t, rule({ status: "off", on: false }))).toBe("Off");
    const html = tab(withRules([rule({ status: "payoff", left: 6 })]));
    expect(html).toContain("Quiet for the payoff: 6 more replies");
    expect(html).toContain('data-status="payoff"');
  });

  it("Fire now is enabled when someone is away; each reason it is not is shown in words", () => {
    const ok = tab(withRules([rule()]));
    expect(isDisabled(tagOf(ok, "rule-fire-interrupted"))).not.toBe(true);
    expect(ok).not.toContain("rule-blocked-interrupted");

    const locked = tab(withRules([rule()], { chat: { on: true, lock: { ids: ["yuzu"], at: 1 }, returning: null }, scene: { source: "lock", present: ["yuzu"], tag: null } }));
    expect(isDisabled(tagOf(locked, "rule-fire-interrupted"))).toBe(true);
    expect(locked).toContain("The scene is locked.");

    const off = tab(withRules([rule()], { chat: { on: false, lock: null, returning: null } }));
    expect(isDisabled(tagOf(off, "rule-fire-interrupted"))).toBe(true);
    expect(off).toContain("Direction is off in this chat.");

    const all = tab(withRules([rule()], { scene: { source: "director", present: ["yuzu", "hana", "aoi", "mei"], tag: "lesson" } }));
    expect(isDisabled(tagOf(all, "rule-fire-interrupted"))).toBe(true);
    expect(all).toContain("Nobody is away to bring in.");

    const unknown = tab(withRules([rule()], { scene: { source: "none", present: [], tag: null } }));
    expect(unknown).toContain("The scene is not known yet: wait for a report.");
    expect(fireBlockedKey(base())).toBeNull();
  });

  it("a queued note: the callout names who and which rule, with Skip; by hand says so", () => {
    const next = { id: "f1", rule: "interrupted", kind: "interrupt" as const, who: ["hana"], with: ["yuzu"], after: "m1#0", forced: false, at: 1, due: true };
    const html = tab(withRules([rule()], { next }));
    expect(html).toContain("Next reply: Hana walks in on Yuzu. (Interrupted moment)");
    expect(html).toContain('data-testid="rules-skip"');
    const hand = tab(withRules([rule()], { next: { ...next, forced: true } }));
    expect(hand).toContain("(Interrupted moment, fired by hand)");
    expect(tab(withRules([rule()], { next: null }))).not.toContain("rules-next");
    expect(tab(withRules([rule()], { next: { ...next, due: false } }))).not.toContain("rules-next");
  });

  it("the Numbers fold: the chance with its percent, cooldown, payoff K and M, each with a hint", () => {
    const html = tab(withRules([rule()]), true);
    expect(html).toContain("2d6 needed");
    expect(html).toContain("At least 8 on 2d6: about 42% of rolls.");
    expect(html).toContain("Cooldown (replies)");
    expect(html).toContain("Replies the rule stays quiet after it fires.");
    expect(html).toContain("Payoff every");
    expect(html).toContain("Then quiet (replies)");
    expect(html).toContain('min="2" max="13"');
    expect(html).toContain('min="0" max="30"');
    expect(html).toContain('min="0" max="10"');
    expect(html).toContain('min="0" max="20"');
  });

  it("13 says it never fires; Restore defaults shows only when a number differs from the built-in one", () => {
    const never = renderToStaticMarkup(<RuleNumbers rule={rule({ need: 13 })} locked={false} onRule={noop} />);
    expect(never).toContain("Never fires");
    expect(never).toContain('data-testid="rule-restore-interrupted"');
    const plain = renderToStaticMarkup(<RuleNumbers rule={rule()} locked={false} onRule={noop} />);
    expect(plain).not.toContain("rule-restore");
    const edited = renderToStaticMarkup(<RuleNumbers rule={rule({ cooldown: 9 })} locked={false} onRule={noop} />);
    expect(edited).toContain("Restore defaults");
  });
});

describe("the Next chip in the bar", () => {
  const next = { id: "f1", rule: "interrupted", kind: "interrupt" as const, who: ["hana"], with: ["yuzu"], after: "m1#0", forced: false, at: 1, due: true };
  it("a queued note: 'Next: Hana' with a skip button", () => {
    const html = renderToStaticMarkup(<DirectorBarView state={withRules([rule()], { next })} running={false} onPickModel={noop} onToggle={noop} onReport={noop} onRelease={noop} onSkip={noop} />);
    expect(html).toContain('data-testid="director-next"');
    expect(html).toContain("Next: Hana");
    expect(html).toContain('data-testid="director-next-skip"');
    expect(html).toContain('aria-label="Skip this note"');
  });
  it("nothing queued, or Direction off: no chip", () => {
    expect(bar(withRules([rule()]))).not.toContain("director-next");
    expect(bar(withRules([rule()], { next, chat: { on: false, lock: null, returning: null } }))).not.toContain("director-next");
  });
  it("the Rules button shows a dot while the rules are on", () => {
    expect(bar(withRules([rule()]))).toContain("size-1.5 rounded-full bg-cta");
    expect(bar(withRules([rule()], {}, { on: false }))).not.toContain("size-1.5 rounded-full bg-cta");
  });
});

describe("the log in words", () => {
  const st = withRules([rule()]);
  const roll = { d1: 4, d2: 5, total: 9, need: 8 };
  const words = (e: any) => logWords(t, st, { at: Date.now(), ...e }, "en");
  it("a rule fired: who, the reason and the dice", () => {
    const w = words({ kind: "rule", state: "fired", rule: "interrupted", roll, who: ["hana"], with: ["yuzu"], why: "alone with Yuzu for 3 replies" });
    expect(w.line).toBe("Interrupted moment: Hana walks in on Yuzu");
    expect(w.detail).toBe("alone with Yuzu for 3 replies. 2d6 = 9, needed 8");
  });
  it("a rule that rolled and missed; fired by hand", () => {
    expect(words({ kind: "rule", state: "missed", rule: "interrupted", roll: { d1: 3, d2: 3, total: 6, need: 8 }, who: ["hana"], with: [] }).line).toBe("Interrupted moment: roll 2d6 = 6, needed 8, nothing happens");
    expect(words({ kind: "rule", state: "fired", rule: "interrupted", roll: null, who: ["hana"], with: ["yuzu"], forced: true }).line).toBe("Interrupted moment: Hana walks in on Yuzu, fired by hand");
  });
  it("results: came, only mentioned, did not come, and the three ways a note yields", () => {
    expect(words({ kind: "result", rule: "interrupted", result: "came", who: ["hana"] }).line).toBe("Interrupted moment: Hana came");
    expect(words({ kind: "result", rule: "interrupted", result: "mentioned", who: ["hana"] }).line).toBe("Interrupted moment: Hana was only mentioned");
    expect(words({ kind: "result", rule: "interrupted", result: "missed", who: ["hana"] }).line).toBe("Interrupted moment: Hana did not come");
    expect(words({ kind: "result", rule: "interrupted", result: "yielded", by: "world" }).line).toBe("Interrupted moment: the note yielded to World");
    expect(words({ kind: "result", rule: "interrupted", result: "yielded", by: "direction" }).line).toBe("Interrupted moment: the note yielded to the lock or the return");
    expect(words({ kind: "result", rule: "interrupted", result: "yielded", by: "empty" }).line).toBe("Interrupted moment: the note was dropped");
  });
  it("genre switched, skipped", () => {
    expect(words({ kind: "rules", set: "romcom", on: true }).line).toBe("Genre: School rom-com, rules on");
    expect(words({ kind: "rules", set: "", on: false }).line).toBe("Genre removed");
    expect(words({ kind: "skip", rule: "interrupted", who: ["hana", "aoi"] }).line).toBe("Skipped: Interrupted moment, Hana and Aoi");
  });
  it("the log list carries the new lines next to the old ones", () => {
    const html = renderToStaticMarkup(
      <DirectionLog state={withRules([rule()], { log: [{ at: Date.now(), kind: "result", rule: "interrupted", result: "came", who: ["hana"] }, ...base().log] })} />,
    );
    expect(html).toContain("Interrupted moment: Hana came");
    expect(html).toContain("Alone moment");
  });
});

describe("the mark under a reply", () => {
  const fire = (over: Partial<DirectionFire> = {}): DirectionFire => ({
    id: "f1", rule: "interrupted", kind: "interrupt", who: ["yuzu"], with: ["hana"], after: "m1#0", n: 4, roll: { d1: 4, d2: 5, total: 9, need: 8 },
    tension: 1, hold: 5, payoff: false, result: "came", carrier: "m2#0", forced: false, why: "", at: 1, ...over,
  });
  const msg = (id: string, swipe: number, role = "char") => ({ id, role, activeSwipe: swipe }) as any;
  let marks: any = null;
  const mark = (m: any, chatId = "c1") => renderToStaticMarkup(<DirectionNoteView chatId={chatId} message={m} marks={marks} />);
  const publish = (fires: DirectionFire[], chatId = "c1") => {
    marks = { chatId, fires, rules: { interrupted: "Interrupted moment" }, members: { yuzu: "Yuzu", hana: "Hana" } };
  };

  it("one line: who, the rule, the dice, how it ended", () => {
    publish([fire()]);
    const html = mark(msg("m2", 0));
    expect(html).toContain('data-testid="direction-note"');
    expect(html).toContain("Direction: Yuzu walks in (Interrupted moment, 2d6 = 9, needed 8) · came");
  });
  it("found by the carrier reply and its swipe only", () => {
    publish([fire({ carrier: "m2#1" })]);
    expect(mark(msg("m2", 0))).toBe("");
    expect(mark(msg("m2", 1))).toContain("Yuzu walks in");
    expect(mark(msg("m3", 1))).toBe("");
    expect(mark(msg("m2", 1, "user"))).toBe("");
    expect(mark(msg("m2", 1), "other-chat")).toBe("");
  });
  it("verbs per kind, by hand, and each result", () => {
    expect(markText(t, fire({ kind: "join", who: ["yuzu"] }), "Friends", ["Yuzu"], "en")).toContain("Yuzu joins (Friends, 2d6 = 9, needed 8) · came");
    expect(markText(t, fire({ kind: "return" }), "Someone comes by", ["Yuzu"], "en")).toContain("Yuzu comes back");
    expect(markText(t, fire({ forced: true, roll: null, result: null }), "Interrupted moment", ["Yuzu"], "en")).toBe("Direction: Yuzu walks in (Interrupted moment, fired by hand)");
    expect(markText(t, fire({ result: "mentioned" }), "R", ["Yuzu"], "en")).toMatch(/· only mentioned$/);
    expect(markText(t, fire({ result: "missed" }), "R", ["Yuzu"], "en")).toMatch(/· did not come$/);
    expect(markText(t, fire({ result: "yielded" }), "R", ["Yuzu"], "en")).toMatch(/· yielded$/);
  });
  it("a chat without firings shows nothing", () => {
    marks = null;
    expect(mark(msg("m2", 0))).toBe("");
    expect(fireFor(null, "c1", "m2", 0)).toBeNull();
    expect(actLine(t, "return", ["Yuzu", "Hana"], [], "en")).toBe("Yuzu and Hana comes back");
  });
});
