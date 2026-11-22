/**
 * Direction phase 3a, the client (#496): the Plan tab (cards per status, the inline editor and what each "When" sends, the
 * list that goes back to the plugin), the queued beat in the callout and the bar's Next chip, the log lines and the mark under
 * the carrier reply. Rendered to static markup from states the plugin could have answered; the list changes (move, skip,
 * delete, save) are pure functions of the list, checked as such.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { PlanTabView, BeatEditor } = await import("../src/components/chat/direction-plan");
const { RulesTabView } = await import("../src/components/chat/direction-sheet");
const { DirectorBarView, DirectionLog } = await import("../src/components/chat/director-bar");
const { DirectionNoteView } = await import("../src/components/chat/direction-note");
const ui = await import("../src/lib/direction-ui");
const { t: translate, DICTIONARIES } = await import("../src/lib/i18n");
const t = (key: any, vars?: any) => translate(key, "en", vars);
import type { BeatDraft, DirectionBeat, DirectionFire, DirectionState } from "../src/lib/direction";

const members = [
  { id: "yuzu", name: "Yuzu" },
  { id: "hana", name: "Hana" },
  { id: "aoi", name: "Aoi" },
];
const beat = (over: Partial<DirectionBeat> = {}): DirectionBeat => ({
  id: "b1", text: "Yuzu bursts in with news about the festival", who: ["yuzu"], when: { kind: "replies", n: 5 }, wait: true, tries: 0, status: "waiting", left: 3, ...over,
});
const base = (beats: DirectionBeat[], over: Partial<DirectionState> = {}): DirectionState => ({
  config: { model: "mock/director" },
  chat: { on: true, lock: null, returning: null },
  scene: { source: "director", present: ["hana"], tag: "break" },
  report: { key: "m1#0", at: Date.now() - 60_000, tag: "break", present: ["hana"], sceneNew: false, model: "mock/director", ms: 600 },
  members,
  log: [{ at: Date.now() - 60_000, kind: "report", key: "m1#0", tag: "break", present: ["hana"], ms: 600 }],
  usage: { input: 1, output: 1, runs: 1 },
  rules: { set: "romcom", on: true, sets: [{ id: "romcom", name: "School rom-com" }], items: [] },
  plan: { beats, whenKinds: ["replies", "tag", "place", "manual"], tags: ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event"], boundaryWait: 6, max: 20, textMax: 400 },
  ...over,
});
const noop = () => {};
const tab = (state: DirectionState, startEdit?: any) =>
  renderToStaticMarkup(<PlanTabView state={state} onPlan={noop} onFire={noop} onSkipNext={noop} startEdit={startEdit} />);
const isDisabled = (tag: string) => / disabled=""| data-disabled/.test(tag);
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";
const next = { id: "f1", rule: "beat:b1", kind: "beat" as const, who: ["yuzu"], with: ["hana"], after: "m1#0", forced: false, at: 1, due: true };

describe("the Plan tab: cards", () => {
  it("one card per beat, in order, with its number, text, who and when in plain words", () => {
    const html = tab(base([beat(), beat({ id: "b2", text: "A storm starts", who: [], when: { kind: "place", place: "roof" }, wait: true, status: "behind" })]));
    expect(html).toContain('data-testid="plan-tab"');
    expect(html.indexOf("beat-b1")).toBeLessThan(html.indexOf("beat-b2"));
    expect(html).toContain("Yuzu bursts in with news about the festival");
    expect(html).toContain("Takes part: Yuzu · After 5 replies · waits for a new scene");
    expect(html).toContain("When the place is: roof");
    expect(html).toContain("A beat is something you want to happen in the story");
  });

  it("each status in words", () => {
    const line = (b: Partial<DirectionBeat>) => ui.beatStatusLine(t, beat(b), 6);
    expect(line({ status: "waiting", left: 3 })).toBe("Waiting: 3 more replies");
    expect(line({ status: "waiting", left: 1 })).toBe("Waiting: 1 more reply");
    expect(line({ status: "waiting", left: undefined, met: true, when: { kind: "replies", n: 0 } })).toBe("Its moment has come: due after the next reply");
    expect(line({ status: "waiting", when: { kind: "tag", tag: "break" } })).toBe("Waiting for the scene: Break");
    expect(line({ status: "waiting", when: { kind: "place", place: "roof" } })).toBe("Waiting until the place is: roof");
    expect(line({ status: "waiting", when: { kind: "manual" } })).toBe("Waits for you: use Fire now");
    expect(line({ status: "due", left: 4 })).toBe("Due: waiting for a new scene, 4 more replies at most");
    expect(line({ status: "due", left: 0 })).toBe("Due: goes with the next reply");
    expect(line({ status: "queued" })).toBe("Goes with the next reply");
    expect(line({ status: "delivered", result: "came" })).toBe("Delivered: came");
    expect(line({ status: "delivered", result: "mentioned" })).toBe("Delivered: only mentioned");
    expect(line({ status: "delivered", result: "sent" })).toBe("Delivered: went in");
    expect(line({ status: "failed", tries: 2 })).toBe("Did not land after two tries");
    expect(line({ status: "skipped" })).toBe("Skipped");
    expect(line({ status: "behind" })).toBe("After the beats before it");
  });

  it("the card carries the status, a dot and the words; a finished beat has no Fire now", () => {
    const html = tab(base([beat({ id: "w", status: "delivered", result: "came" }), beat({ id: "x", status: "failed", tries: 2 }), beat({ id: "y", status: "skipped" }), beat({ id: "z", status: "queued" }), beat({ id: "v" })]));
    for (const [id, st] of [["w", "delivered"], ["x", "failed"], ["y", "skipped"], ["z", "queued"], ["v", "waiting"]]) expect(html).toContain(`data-testid="beat-${id}" data-status="${st}"`);
    expect(html).toContain("Delivered: came");
    expect(html).toContain("size-2 shrink-0 rounded-full bg-emerald-500");
    expect(html).toContain("bg-destructive");
    for (const id of ["w", "x", "y", "z"]) expect(html).not.toContain(`beat-fire-${id}`);
    expect(html).toContain('data-testid="beat-fire-v"');
    // Unskip only on a skipped beat; Skip on an open one; none on a delivered one
    expect(html).toContain("Unskip");
    expect(html).not.toContain('data-testid="beat-skip-w"');
    expect(html).toContain('data-testid="beat-skip-v"');
  });

  it("the hold reason is visible text: Direction off, scene locked, explicit scene", () => {
    expect(tab(base([beat({ hold: "off" })]))).toContain("Direction is off in this chat, so it waits.");
    expect(tab(base([beat({ hold: "lock" })]))).toContain("The scene is locked, so it waits.");
    expect(tab(base([beat({ status: "due", left: 0, hold: "explicit" })]))).toContain("An explicit scene is on, so it waits.");
    expect(tab(base([beat()]))).not.toContain("so it waits.");
  });

  it("Fire now: enabled when the scene is known; each reason it is not is shown in words", () => {
    const ok = tab(base([beat()]));
    expect(isDisabled(tagOf(ok, "beat-fire-b1"))).not.toBe(true);
    expect(ok).not.toContain("beat-blocked-b1");
    const off = tab(base([beat()], { chat: { on: false, lock: null, returning: null } }));
    expect(isDisabled(tagOf(off, "beat-fire-b1"))).toBe(true);
    expect(off).toContain("Direction is off in this chat.");
    const locked = tab(base([beat()], { chat: { on: true, lock: { ids: ["yuzu"], at: 1 }, returning: null }, scene: { source: "lock", present: ["yuzu"], tag: null } }));
    expect(isDisabled(tagOf(locked, "beat-fire-b1"))).toBe(true);
    expect(locked).toContain("The scene is locked.");
    const unknown = tab(base([beat()], { scene: { source: "none", present: [], tag: null } }));
    expect(isDisabled(tagOf(unknown, "beat-fire-b1"))).toBe(true);
    expect(unknown).toContain("The scene is not known yet: wait for a report.");
    // "everyone is here" does not block a beat: it may be event-only
    expect(ui.beatFireBlockedKey(base([beat()], { scene: { source: "director", present: ["yuzu", "hana", "aoi"], tag: null } }))).toBeNull();
  });

  it("Move up is off on the first beat and Move down on the last; icon buttons are named", () => {
    const html = tab(base([beat(), beat({ id: "b2" })]));
    expect(isDisabled(tagOf(html, "beat-up-b1"))).toBe(true);
    expect(isDisabled(tagOf(html, "beat-down-b1"))).not.toBe(true);
    expect(isDisabled(tagOf(html, "beat-down-b2"))).toBe(true);
    expect(html).toContain('aria-label="Move up"');
    expect(html).toContain('aria-label="Move down"');
    expect(html).toContain('aria-label="Delete"');
    expect(html).toContain('data-testid="beat-edit-b1"');
  });

  it("an empty plan: what a beat is, an example and a primary Add beat; no list", () => {
    const html = tab(base([]));
    expect(html).toContain('data-testid="plan-empty"');
    expect(html).toContain("No beats yet");
    expect(html).toContain("For example:");
    expect(html).toContain('data-testid="plan-add"');
    expect(html).toContain("bg-cta");
    expect(html).not.toContain("data-status=");
  });

  it("with beats the Add button is tonal and the empty card is gone", () => {
    const html = tab(base([beat()]));
    expect(html).not.toContain("plan-empty");
    expect(tagOf(html, "plan-add")).toContain("bg-cta/15");
  });

  it("20 beats: Add is disabled and the reason is shown", () => {
    const many = Array.from({ length: 20 }, (_, i) => beat({ id: `b${i}`, text: `Beat ${i}` }));
    const html = tab(base(many));
    expect(isDisabled(tagOf(html, "plan-add"))).toBe(true);
    expect(html).toContain("A plan holds at most 20 beats. Delete one to add another.");
    expect(tab(base(many.slice(0, 19)))).not.toContain("plan-full");
  });

  it("Direction off or no model: the plan is still shown and says it runs only while Direction is on", () => {
    const off = tab(base([beat()], { chat: { on: false, lock: null, returning: null } }));
    expect(off).toContain("The plan runs only while Direction is on in this chat. You can edit it now.");
    expect(off).toContain('data-testid="beat-b1"');
    const none = tab(base([beat()], { config: { model: "" } }));
    expect(none).toContain("The plan runs only once a director model is picked.");
    expect(tab(base([beat()]))).not.toContain("plan-reason");
  });
});

describe("the Plan tab: the editor", () => {
  const draft = (over: Partial<BeatDraft> = {}): BeatDraft => ({ text: "", who: [], when: { kind: "replies", n: 3 }, wait: true, skipped: false, ...over });
  const editor = (d: BeatDraft) => renderToStaticMarkup(<BeatEditor state={base([])} title="New beat" draft={d} onChange={noop} onSave={noop} onCancel={noop} />);

  it("opens in place: textarea with its example, member chips with the hint, When, wait switch, Save and Cancel", () => {
    const html = tab(base([beat()]), { key: "new", draft: draft() });
    expect(html).toContain('data-testid="beat-editor"');
    expect(html).toContain("What happens");
    expect(html).toContain("e.g. Yuzu bursts in with news about the festival");
    for (const m of ["Yuzu", "Hana", "Aoi"]) expect(html).toContain(`>${m}</button>`);
    expect(html).toContain("Members who are away come in for it.");
    expect(html).toContain("After some replies");
    expect(html).toContain('data-testid="beat-wait"');
    expect(html).toContain('data-testid="beat-save"');
    expect(html).toContain('data-testid="beat-cancel"');
    // the Add button gives way to the editor
    expect(html).not.toContain('data-testid="plan-add"');
  });

  it("editing a beat replaces its card with the editor, filled", () => {
    const b = beat();
    const html = tab(base([b, beat({ id: "b2", text: "Second beat" })]), { key: "b1", draft: ui.draftOf(b) });
    expect(html).toContain('data-testid="beat-editor"');
    expect(html).not.toContain('data-testid="beat-b1"');
    expect(html).toContain('data-testid="beat-b2"');
    expect(html).toContain(">Yuzu bursts in with news about the festival</textarea>");
    expect(html).toContain('aria-pressed="true"');
  });

  it("Save is disabled with a visible reason while the text is empty, and ready with a text", () => {
    const empty = editor(draft());
    expect(isDisabled(tagOf(empty, "beat-save"))).toBe(true);
    expect(empty).toContain("Write what happens to save the beat.");
    expect(editor(draft({ text: "   " }))).toContain("Write what happens");
    const ok = editor(draft({ text: "A storm starts" }));
    expect(isDisabled(tagOf(ok, "beat-save"))).not.toBe(true);
    expect(ok).not.toContain("beat-issue");
    expect(ui.draftIssue(draft({ text: "x", when: { kind: "place", place: " " } }))).toBe("dir.beat.issue.place");
    expect(editor(draft({ text: "x", when: { kind: "place", place: "" } }))).toContain("Write the place words to save the beat.");
  });

  it("When 'After some replies': a number tile 0-200 and the wait switch", () => {
    const html = editor(draft({ text: "x" }));
    expect(html).toContain('min="0" max="200"');
    expect(html).toContain("Counted from when the beat before it ends. 0 = at once.");
    expect(html).toContain('data-testid="beat-wait"');
    expect(html).toContain("Once its time has come it waits up to 6 replies for a new place or a time jump, then goes anyway.");
    expect(html).not.toContain("beat-tag");
    expect(html).not.toContain("beat-place");
  });

  it("When 'Scene': a select of the scene kinds in plain words and the wait switch", () => {
    const html = editor(draft({ text: "x", when: { kind: "tag", tag: "group_out" } }));
    expect(html).toContain('data-testid="beat-tag"');
    expect(html).toContain("Outing");
    expect(html).toContain('data-testid="beat-wait"');
    expect(html).not.toContain('min="0" max="200"');
    for (const tag of ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event"]) expect(DICTIONARIES.en[ui.tagKey(tag as any)], tag).toBeTruthy();
  });

  it("When 'Place': a text input with an example, no wait switch, the line that it goes at once", () => {
    const html = editor(draft({ text: "x", when: { kind: "place", place: "roof" } }));
    expect(html).toContain('data-testid="beat-place"');
    expect(html).toContain('placeholder="e.g. roof, café"');
    expect(html).toContain('value="roof"');
    expect(html).toContain("Goes the moment the story is there");
    expect(html).not.toContain('data-testid="beat-wait"');
  });

  it("When 'By hand': nothing to fill, no wait switch, the line that it only goes when fired", () => {
    const html = editor(draft({ text: "x", when: { kind: "manual" } }));
    expect(html).toContain("Only when you fire it");
    expect(html).not.toContain('data-testid="beat-wait"');
    expect(html).not.toContain("beat-tag");
    expect(html).not.toContain("beat-place");
    expect(html).not.toContain('min="0" max="200"');
  });

  it("each When variant sends exactly the plugin's shape, with no server fields", () => {
    const send = (d: Partial<BeatDraft>) => ui.cleanDraft({ ...draft({ text: "  Go  " }), ...d });
    expect(send({}).text).toBe("Go");
    expect(send({ when: { kind: "replies", n: 7.4 } }).when).toEqual({ kind: "replies", n: 7 });
    expect(send({ when: { kind: "replies", n: 999 } }).when).toEqual({ kind: "replies", n: 200 });
    expect(send({ when: { kind: "replies", n: -2 } }).when).toEqual({ kind: "replies", n: 0 });
    expect(send({ when: { kind: "tag", tag: "date" } }).when).toEqual({ kind: "tag", tag: "date" });
    expect(send({ when: { kind: "place", place: "  café " } }).when).toEqual({ kind: "place", place: "café" });
    expect(send({ when: { kind: "manual" } }).when).toEqual({ kind: "manual" });
    expect(Object.keys(send({ id: "b1" })).sort()).toEqual(["id", "skipped", "text", "when", "wait", "who"].sort());
    expect("id" in send({})).toBe(false);
    // switching the kind gives the new kind its first value
    expect(ui.draftWhenKind(draft({ text: "x" }), "tag", ["lesson", "break"]).when).toEqual({ kind: "tag", tag: "lesson" });
    expect(ui.draftWhenKind(draft({ text: "x" }), "place", []).when).toEqual({ kind: "place", place: "" });
    expect(ui.draftWhenKind(draft({ text: "x" }), "manual", []).when).toEqual({ kind: "manual" });
    expect(ui.draftWhenKind(draft({ text: "x", when: { kind: "tag", tag: "date" } }), "tag", ["lesson"]).when).toEqual({ kind: "tag", tag: "date" });
  });
});

describe("the list that goes back to the plugin", () => {
  const beats = [beat({ id: "a", text: "A" }), beat({ id: "b", text: "B", status: "skipped" }), beat({ id: "c", text: "C", who: ["hana"], wait: false })];
  const list = ui.planDrafts(base(beats));
  const ids = (l: BeatDraft[]) => l.map((x) => x.id);
  it("the whole list, without server fields; a skipped beat is sent as skipped", () => {
    expect(ids(list)).toEqual(["a", "b", "c"]);
    expect(list[1]!.skipped).toBe(true);
    expect(list[2]).toEqual({ id: "c", text: "C", who: ["hana"], when: { kind: "replies", n: 5 }, wait: false, skipped: false });
    for (const d of list) expect(Object.keys(d).every((k) => ["id", "text", "who", "when", "wait", "skipped"].includes(k))).toBe(true);
  });
  it("move up and down reorder the list that is sent; the ends stay", () => {
    expect(ids(ui.planMoved(list, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(ui.planMoved(list, "b", 1))).toEqual(["a", "c", "b"]);
    expect(ids(ui.planMoved(list, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(ui.planMoved(list, "c", 1))).toEqual(["a", "b", "c"]);
    expect(ids(ui.planMoved(list, "zzz", 1))).toEqual(["a", "b", "c"]);
  });
  it("skip and unskip flip one beat; delete removes it", () => {
    expect(ui.planWithSkip(list, "a", true).map((x) => x.skipped)).toEqual([true, true, false]);
    expect(ui.planWithSkip(list, "b", false).map((x) => x.skipped)).toEqual([false, false, false]);
    expect(ids(ui.planWithout(list, "b"))).toEqual(["a", "c"]);
  });
  it("a new beat goes last without an id; an edited one is replaced in place", () => {
    const added = ui.planWithBeat(list, { text: " New ", who: [], when: { kind: "manual" }, wait: true, skipped: false });
    expect(ids(added)).toEqual(["a", "b", "c", undefined]);
    expect(added[3]!.text).toBe("New");
    const edited = ui.planWithBeat(list, { ...list[0]!, text: "A2" });
    expect(edited.map((x) => x.text)).toEqual(["A2", "B", "C"]);
  });
});

describe("a queued beat: the callout and the bar's Next chip", () => {
  const withNext = (n: any = next, over: Partial<DirectionState> = {}) => base([beat({ status: "queued" })], { next: n, ...over });
  it("both tabs' callout says it is a beat, with its text and who", () => {
    const plan = tab(withNext());
    expect(plan).toContain('data-testid="plan-next"');
    expect(plan).toContain('data-kind="beat"');
    expect(plan).toContain("Next reply: the beat «Yuzu bursts in with news about the festival» with Yuzu. (Plan)");
    expect(plan).toContain('data-testid="plan-skip"');
    const rules = renderToStaticMarkup(<RulesTabView state={withNext()} onSet={noop} onOn={noop} onRule={noop} onFire={noop} onSkip={noop} />);
    expect(rules).toContain('data-testid="rules-next"');
    expect(rules).toContain("Next reply: the beat «Yuzu bursts in with news about the festival» with Yuzu. (Plan)");
  });
  it("by hand and with nobody named", () => {
    expect(tab(withNext({ ...next, forced: true, who: [] }))).toContain("Next reply: the beat «Yuzu bursts in with news about the festival». (Plan, fired by hand)");
    expect(tab(withNext({ ...next, due: false }))).not.toContain("plan-next");
    expect(tab(base([beat()]))).not.toContain("plan-next");
  });
  it("the chip says 'Next: beat «text»' with a skip button; a rule's chip is as before", () => {
    const html = renderToStaticMarkup(<DirectorBarView state={withNext()} running={false} onPickModel={noop} onToggle={noop} onReport={noop} onRelease={noop} onSkip={noop} />);
    expect(html).toContain('data-testid="director-next"');
    expect(html).toContain("Next: beat «Yuzu bursts in with news about the fest…»");
    expect(html).toContain('data-testid="director-next-skip"');
    expect(html).toContain("Queued for the next reply: the beat «");
    const rule = renderToStaticMarkup(<DirectorBarView state={withNext({ ...next, rule: "interrupted", kind: "interrupt" })} running={false} onPickModel={noop} onToggle={noop} onReport={noop} onRelease={noop} onSkip={noop} />);
    expect(rule).toContain("Next: Yuzu");
    expect(rule).not.toContain("Next: beat");
  });
});

describe("the log and the mark with beats", () => {
  const st = base([beat({ id: "b1", text: "Yuzu bursts in with news about the festival" })]);
  const words = (e: any) => ui.logWords(t, st, { at: Date.now(), ...e }, "en");
  it("a beat is due; a beat goes with the next reply (by hand or by its condition)", () => {
    expect(words({ kind: "beat", state: "due", beat: "b1", text: "A storm starts", why: "5 replies passed" }).line).toBe("Beat «A storm starts» is due (5 replies passed)");
    expect(words({ kind: "beat", state: "due", beat: "b1", text: "A storm starts" }).line).toBe("Beat «A storm starts» is due");
    const fired = words({ kind: "beat", state: "fired", beat: "b1", text: "A storm starts", who: ["yuzu", "hana"], why: "a new scene" });
    expect(fired.line).toBe("Beat «A storm starts» goes with the next reply (a new scene)");
    expect(fired.detail).toBe("Takes part: Yuzu and Hana");
    expect(words({ kind: "beat", state: "fired", beat: "b1", text: "A storm starts", who: [], why: "fired by hand", forced: true }).line).toBe("Beat «A storm starts» goes with the next reply (fired by hand)");
  });
  it("a beat's result line names the beat by its text (from the plan); sent reads 'went in'", () => {
    expect(words({ kind: "result", rule: "beat:b1", result: "came", who: ["yuzu"] }).line).toBe("Beat «Yuzu bursts in with news about the festival»: Yuzu came");
    expect(words({ kind: "result", rule: "beat:b1", result: "mentioned", who: ["yuzu"] }).line).toContain("was only mentioned");
    expect(words({ kind: "result", rule: "beat:b1", result: "missed", who: ["yuzu"] }).line).toContain("did not come");
    expect(words({ kind: "result", rule: "beat:b1", result: "sent", who: [] }).line).toBe("Beat «Yuzu bursts in with news about the festival»: went in");
    expect(words({ kind: "result", rule: "beat:b1", result: "yielded", by: "world" }).line).toContain("yielded to World");
    expect(words({ kind: "result", rule: "beat:gone", result: "sent", who: [] }).line).toBe("A beat that is gone: went in");
    expect(words({ kind: "skip", rule: "beat:b1", who: [] }).line).toBe("Skipped: Beat «Yuzu bursts in with news about the festival»");
    expect(words({ kind: "skip", rule: "beat:b1", who: ["yuzu"] }).line).toContain("Skipped: Beat «Yuzu");
  });
  it("the log list shows the beat lines next to the old ones", () => {
    const html = renderToStaticMarkup(<DirectionLog state={base([beat()], { log: [{ at: Date.now(), kind: "beat", state: "due", beat: "b1", text: "A storm starts", why: "x" }, ...base([]).log] })} />);
    expect(html).toContain('data-kind="beat"');
    expect(html).toContain("Beat «A storm starts» is due (x)");
    expect(html).toContain("Break");
  });

  const fire = (over: Partial<DirectionFire> = {}): DirectionFire => ({
    id: "f1", rule: "beat:b1", kind: "beat", who: ["yuzu"], with: ["hana"], after: "m1#0", n: 4, roll: null, tension: 0, hold: 0, payoff: false, result: "came", carrier: "m2#0", forced: false, why: "5 replies passed", at: 1, ...over,
  });
  const msg = (id: string, swipe = 0) => ({ id, role: "char", activeSwipe: swipe }) as any;
  const marks = (fires: DirectionFire[]) => ({ chatId: "c1", fires, rules: { "beat:b1": "A storm starts" }, members: { yuzu: "Yuzu" } });
  it("the mark under the carrier reply: 'Direction: beat «text» · came'", () => {
    const html = renderToStaticMarkup(<DirectionNoteView chatId="c1" message={msg("m2")} marks={marks([fire()])} />);
    expect(html).toContain("Direction: beat «A storm starts» · came");
    expect(renderToStaticMarkup(<DirectionNoteView chatId="c1" message={msg("m3")} marks={marks([fire()])} />)).toBe("");
  });
  it("each result of a beat on the mark; one still open has none", () => {
    const m = (r: DirectionFire["result"]) => ui.markText(t, fire({ result: r }), "A storm starts", ["Yuzu"], "en");
    expect(m("mentioned")).toBe("Direction: beat «A storm starts» · only mentioned");
    expect(m("missed")).toBe("Direction: beat «A storm starts» · did not come");
    expect(m("sent")).toBe("Direction: beat «A storm starts» · went in");
    expect(m("yielded")).toBe("Direction: beat «A storm starts» · yielded");
    expect(m(null)).toBe("Direction: beat «A storm starts»");
  });
  it("the marks store gets the beat texts under their ledger ids", () => {
    const published = { rules: { ...Object.fromEntries((st.rules?.items ?? []).map((r) => [r.id, r.name])), ...Object.fromEntries((st.plan?.beats ?? []).map((b) => [ui.beatRuleId(b.id), b.text])) } };
    expect(published.rules["beat:b1"]).toBe("Yuzu bursts in with news about the festival");
  });
});

describe("words in both languages", () => {
  it("every key the Plan tab, the log and the World switch use exists in English and Ukrainian, with no Russian-only letters", () => {
    const keys = Object.keys(DICTIONARIES.en).filter((k) => k.startsWith("dir.beat.") || k.startsWith("dir.plan") || ["dir.mark.beat", "dir.result.sent", "dir.log.sent", "dir.log.skipBare", "dir.next.chipBeat", "world.cast.boundary", "world.cast.boundaryHint", "world.cast.boundaryWait"].includes(k) || k.startsWith("dir.log.beat"));
    expect(keys.length).toBeGreaterThan(80);
    for (const k of keys) {
      const uk = (DICTIONARIES.uk as any)[k] as string;
      expect(uk, k).toBeTruthy();
      expect(/[ыэёъ]/i.test(uk), `${k}: ${uk}`).toBe(false);
    }
  });
});
