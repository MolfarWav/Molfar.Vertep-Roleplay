/**
 * Direction phase 3b, the client (#496): people of the World in beats and genre rules. The beat editor's second chip group and what
 * goes back to the plugin, the card's "Takes part", the rule card's "Who comes" row (enabled, disabled with its reason, sends `from`,
 * restore), and the names of a World person in the callout, the Next chip, the log and the mark under the reply. Rendered to static
 * markup from states the plugin could have answered; the requests are checked with a fake fetch.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { PlanTabView, BeatEditor } = await import("../src/components/chat/direction-plan");
const { RulesTabView } = await import("../src/components/chat/direction-sheet");
const { DirectorBarView } = await import("../src/components/chat/director-bar");
const { DirectionLog } = await import("../src/components/chat/direction-log");
const { DirectionNoteView } = await import("../src/components/chat/direction-note");
const ui = await import("../src/lib/direction-ui");
const dir = await import("../src/lib/direction");
const { t: translate, DICTIONARIES } = await import("../src/lib/i18n");
const t = (key: any, vars?: any) => translate(key, "en", vars);
import type { BeatDraft, DirectionBeat, DirectionFire, DirectionNext, DirectionRule, DirectionState } from "../src/lib/direction";

const people = [
  { id: "n3", name: "Mr. Sato", text: "The strict maths teacher." },
  { id: "n7", name: "Aunt Mie", text: "Visits on Sundays.", noReturn: true },
];
const beat = (over: Partial<DirectionBeat> = {}): DirectionBeat => ({
  id: "b1", text: "The teacher walks in", who: ["yuzu"], npc: ["n3"], when: { kind: "replies", n: 5 }, wait: true, tries: 0, status: "waiting", left: 3, ...over,
});
const rule = (over: Partial<DirectionRule> = {}): DirectionRule => ({
  id: "interrupted", name: "Interrupted moment", kind: "interrupt", on: true, need: 8, cooldown: 5, k: 3, m: 4, from: "members", status: "ready", left: 0, tension: 0, ...over,
});
const base = (over: Partial<DirectionState> = {}, beats: DirectionBeat[] = [beat()]): DirectionState => ({
  config: { model: "mock/director" },
  chat: { on: true, lock: null, returning: null },
  scene: { source: "director", present: ["hana"], tag: "break" },
  report: { key: "m1#0", at: Date.now() - 60_000, tag: "break", present: ["hana"], sceneNew: false, model: "mock/director", ms: 600 },
  members: [{ id: "yuzu", name: "Yuzu" }, { id: "hana", name: "Hana" }],
  log: [{ at: Date.now() - 60_000, kind: "report", key: "m1#0", tag: "break", present: ["hana"], ms: 600 }],
  usage: { input: 1, output: 1, runs: 1 },
  rules: { set: "romcom", on: true, sets: [{ id: "romcom", name: "School rom-com" }], items: [rule()] },
  plan: { beats, whenKinds: ["replies", "tag", "place", "manual"], tags: ["lesson", "break", "event"], boundaryWait: 6, max: 20, textMax: 400 },
  world: { people },
  ...over,
});
const noop = () => {};
const planTab = (state: DirectionState, startEdit?: any) => renderToStaticMarkup(<PlanTabView state={state} onPlan={noop} onFire={noop} onSkipNext={noop} startEdit={startEdit} />);
const rulesTab = (state: DirectionState) => renderToStaticMarkup(<RulesTabView state={state} onSet={noop} onOn={noop} onRule={noop} onFire={noop} onSkip={noop} />);
const draft = (over: Partial<BeatDraft> = {}): BeatDraft => ({ text: "", who: [], npc: [], when: { kind: "replies", n: 3 }, wait: true, skipped: false, ...over });
const editor = (d: BeatDraft, state = base()) => renderToStaticMarkup(<BeatEditor state={state} title="New beat" draft={d} onChange={noop} onSave={noop} onCancel={noop} />);
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";
const radio = (html: string, label: string) => html.match(new RegExp(`<button[^>]*role="radio"[^>]*>${label}</button>`))?.[0] ?? "";
const chip = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-pressed[^>]*>(?:<svg[^>]*>.*?</svg>)?${label}`))?.[0] ?? "";
const isDisabled = (tag: string) => / disabled=""| data-disabled/.test(tag);
const next: DirectionNext = { id: "f1", rule: "interrupted", kind: "interrupt", who: [], npc: ["n3"], with: ["hana"], after: "m1#0", forced: false, at: 1, due: true };

describe("the beat editor: people from the World", () => {
  it("a second chip group under Who takes part, fed by the World, with its hint", () => {
    const html = editor(draft({ text: "x" }));
    expect(html).toContain('data-testid="beat-who"');
    expect(html).toContain('data-testid="beat-npc"');
    expect(html.indexOf('data-testid="beat-who"')).toBeLessThan(html.indexOf('data-testid="beat-npc"'));
    expect(html).toContain("People from the World");
    expect(html).toContain("They come in for the beat. They have no card: the note tells the model who they are, from the World’s record.");
    expect(chip(html, "Mr. Sato")).toContain('aria-pressed="false"');
    expect(chip(html, "Aunt Mie")).toContain("aria-pressed");
    // the member chips are still there
    expect(html).toContain(">Yuzu</button>");
  });

  it("a chosen person is pressed (check mark), the others are not", () => {
    const html = editor(draft({ text: "x", npc: ["n3"] }));
    expect(chip(html, "Mr. Sato")).toContain('aria-pressed="true"');
    expect(chip(html, "Aunt Mie")).toContain('aria-pressed="false"');
  });

  it("a person the World does not bring back is marked with a short visible word, and the hint says what it means", () => {
    const html = editor(draft({ text: "x" }));
    expect(html).toContain('data-testid="beat-npc-noreturn-n7"');
    expect(html).toContain("· not brought back");
    expect(html).not.toContain("beat-npc-noreturn-n3");
    expect(html).toContain("A person marked “not brought back” is never picked by a rule, but a beat you write can still bring them.");
    expect(editor(draft({ text: "x" }), base({ world: { people: [people[0]!] } }))).not.toContain("never picked by a rule");
  });

  it("no people in the World: one visible line says so, no chips", () => {
    const html = editor(draft({ text: "x" }), base({ world: { people: [] } }));
    expect(html).toContain('data-testid="beat-npc"');
    expect(html).toContain("No people in this chat’s World yet. The World keeps the people the story brings up");
    expect(html).not.toContain("They come in for the beat");
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("an older plugin without `world`: nothing new shows", () => {
    const st = base();
    delete st.world;
    const html = editor(draft({ text: "x" }), st);
    expect(html).not.toContain("beat-npc");
    expect(html).not.toContain("People from the World");
  });

  it("an id the World no longer has stays as a pressed chip that can be taken off", () => {
    const html = editor(draft({ text: "x", npc: ["n9"] }));
    expect(chip(html, "someone who has left the story")).toContain('aria-pressed="true"');
    expect(ui.draftToggle(draft({ npc: ["n9", "n3"] }), "npc", "n9").npc).toEqual(["n3"]);
  });

  it("pressing a chip adds the person to `npc`, pressing again takes it off; members stay in `who`", () => {
    const a = ui.draftToggle(draft({ who: ["yuzu"] }), "npc", "n3");
    expect(a).toMatchObject({ who: ["yuzu"], npc: ["n3"] });
    expect(ui.draftToggle(a, "npc", "n3").npc).toEqual([]);
    expect(ui.draftToggle(draft(), "who", "hana").who).toEqual(["hana"]);
  });

  it("the whole list goes back with `npc` on every beat and no server fields", () => {
    const list = ui.planDrafts(base({}, [beat(), beat({ id: "b2", npc: undefined, who: [] })]));
    expect(list[0]).toEqual({ id: "b1", text: "The teacher walks in", who: ["yuzu"], npc: ["n3"], when: { kind: "replies", n: 5 }, wait: true, skipped: false });
    expect(list[1]!.npc).toEqual([]);
    const sent = ui.planWithBeat(list, draft({ text: "  Aunt Mie visits ", npc: ["n7"] }));
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({ text: "Aunt Mie visits", who: [], npc: ["n7"], when: { kind: "replies", n: 3 }, wait: true, skipped: false });
    for (const d of sent) expect(Object.keys(d).every((k) => ["id", "text", "who", "npc", "when", "wait", "skipped"].includes(k))).toBe(true);
  });
});

describe("the beat card: Takes part", () => {
  it("lists members and World people together", () => {
    const html = planTab(base());
    expect(html).toContain("Takes part: Yuzu, Mr. Sato · After 5 replies · waits for a new scene");
  });
  it("a World person alone", () => {
    expect(planTab(base({}, [beat({ who: [] })]))).toContain("Takes part: Mr. Sato · After 5 replies");
  });
  it("an id that is no longer in the World reads as someone who has left the story", () => {
    const html = planTab(base({}, [beat({ who: [], npc: ["n3", "n99"] })]));
    expect(html).toContain("Takes part: Mr. Sato, someone who has left the story");
    expect(html).not.toContain("n99");
  });
  it("a beat with nobody named has no Takes part", () => {
    expect(planTab(base({}, [beat({ who: [], npc: [] })]))).not.toContain("Takes part");
  });
});

describe("the rule card: Who comes", () => {
  it("a segmented row Members / World people / Either between the status line and Numbers, with a hint", () => {
    const html = rulesTab(base());
    expect(html).toContain("Who comes");
    for (const l of ["Members", "World people", "Either"]) expect(radio(html, l), l).not.toBe("");
    expect(radio(html, "Members")).toContain('aria-checked="true"');
    expect(radio(html, "World people")).toContain('aria-checked="false"');
    expect(html).toContain("Who the rule may bring in: someone from the group, a person from this chat’s World, or either.");
    expect(html.indexOf("rule-status-interrupted")).toBeLessThan(html.indexOf("Who comes"));
    expect(html.indexOf("Who comes")).toBeLessThan(html.indexOf("Numbers"));
  });
  it("with people in the World all three options can be picked", () => {
    const html = rulesTab(base());
    for (const l of ["Members", "World people", "Either"]) expect(isDisabled(radio(html, l)), l).toBe(false);
    expect(html).not.toContain("rule-from-none-interrupted");
  });
  it("the picked value is the checked one", () => {
    expect(radio(rulesTab(base({ rules: { set: "romcom", on: true, sets: [], items: [rule({ from: "world" })] } })), "World people")).toContain('aria-checked="true"');
    expect(radio(rulesTab(base({ rules: { set: "romcom", on: true, sets: [], items: [rule({ from: "any" })] } })), "Either")).toContain('aria-checked="true"');
  });
  it("no people in the World: World people and Either are disabled and the reason is visible text", () => {
    const html = rulesTab(base({ world: { people: [] } }));
    expect(isDisabled(radio(html, "World people"))).toBe(true);
    expect(isDisabled(radio(html, "Either"))).toBe(true);
    expect(isDisabled(radio(html, "Members"))).toBe(false);
    expect(html).toContain('data-testid="rule-from-none-interrupted"');
    expect(html).toContain("The World has no people to bring in yet, so only Members can be picked.");
  });
  it("the director off or no model: the row is read-only like the rest, still with its words", () => {
    const off = rulesTab(base({ chat: { on: false, lock: null, returning: null } }));
    for (const l of ["Members", "World people", "Either"]) expect(isDisabled(radio(off, l)), l).toBe(true);
    const none = rulesTab(base({ config: { model: "" } }));
    expect(isDisabled(radio(none, "Members"))).toBe(true);
  });
  it("an older plugin (no `from` on the rule): the row is not shown", () => {
    const old = rule();
    delete old.from;
    const html = rulesTab(base({ rules: { set: "romcom", on: true, sets: [], items: [old] } }));
    expect(html).not.toContain("Who comes");
  });
  it("sends `from` with the rule id", async () => {
    const calls: any[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ rules: { set: "romcom", on: true } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    try {
      await dir.setDirectionRules("c1", { rule: { id: "interrupted", from: "world" } });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/direction/rules");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ chatId: "c1", rule: { id: "interrupted", from: "world" } });
  });
  it("Restore defaults counts `from`: it shows when only the choice differs, and sends members", () => {
    expect(ui.ruleEdited(rule())).toBe(false);
    expect(ui.ruleEdited(rule({ from: "world" }))).toBe(true);
    expect(ui.ruleEdited(rule({ from: undefined }))).toBe(false);
    expect(ui.ruleRestorePatch(rule({ from: "any" }))).toEqual({ need: 8, cooldown: 5, k: 3, m: 4, from: "members" });
    expect(ui.ruleRestorePatch(rule({ from: undefined }))).toEqual({ need: 8, cooldown: 5, k: 3, m: 4 });
    expect(ui.ruleRestorePatch(rule({ id: "custom" }))).toBeNull();
    const html = renderToStaticMarkup(<RulesTabView state={base({ rules: { set: "romcom", on: true, sets: [], items: [rule({ from: "world" })] } })} onSet={noop} onOn={noop} onRule={noop} onFire={noop} onSkip={noop} foldsOpen />);
    expect(html).toContain('data-testid="rule-restore-interrupted"');
    expect(rulesTab(base())).not.toContain("rule-restore");
  });
});

describe("a World person's name in the callout, the chip, the log and the mark", () => {
  it("the queued-note callout names a World person; with a member too, both", () => {
    expect(rulesTab(base({ next }))).toContain("Next reply: Mr. Sato walks in on Hana. (Interrupted moment)");
    expect(rulesTab(base({ next: { ...next, who: ["yuzu"] } }))).toContain("Next reply: Yuzu and Mr. Sato walks in on Hana.");
    // a beat: who is members and people
    const bt = { ...next, rule: "beat:b1", kind: "beat" as const, who: ["yuzu"], npc: ["n3"] };
    expect(planTab(base({ next: bt }))).toContain("Next reply: the beat «The teacher walks in» with Yuzu and Mr. Sato. (Plan)");
  });
  it("a person the World no longer has reads 'someone', never the id", () => {
    const html = rulesTab(base({ next: { ...next, npc: ["n99"] } }));
    expect(html).toContain("Next reply: someone walks in on Hana.");
    expect(html).not.toContain("n99");
  });
  it("the Next chip names the person", () => {
    const html = renderToStaticMarkup(<DirectorBarView state={base({ next })} running={false} onPickModel={noop} onToggle={noop} onReport={noop} onRelease={noop} onSkip={noop} />);
    expect(html).toContain("Next: Mr. Sato");
    expect(html).toContain("Queued for the next reply: Mr. Sato walks in on Hana");
  });
  it("the act lines work with a person who is not a member", () => {
    const st = base();
    expect(ui.nextAct(t, st, { ...next, kind: "return", with: [] }, "en")).toBe("Mr. Sato comes back");
    expect(ui.nextAct(t, st, { ...next, kind: "join" }, "en")).toBe("Mr. Sato joins Hana");
    expect(ui.whoNames(t, st, ["yuzu"], ["n3", "n99"])).toEqual(["Yuzu", "Mr. Sato", "someone"]);
    expect(ui.namesOf(st, [], 2, t, ["n3", "n7", "n3"])).toBe("Mr. Sato, Aunt Mie +1");
  });
  it("the log: a rule line, a beat line and a result carry the person's name", () => {
    const st = base();
    const w = (e: any) => ui.logWords(t, st, e, "en");
    expect(w({ kind: "rule", state: "fired", rule: "interrupted", who: [], npc: ["n3"], with: ["hana"], forced: true }).line).toBe("Interrupted moment: Mr. Sato walks in on Hana, fired by hand");
    expect(w({ kind: "rule", state: "fired", rule: "interrupted", who: [], npc: ["n3"], with: [], roll: { d1: 4, d2: 5, total: 9, need: 8 } }).line).toBe("Interrupted moment: Mr. Sato walks in");
    expect(w({ kind: "beat", state: "fired", beat: "b1", text: "The teacher walks in", who: ["yuzu"], npc: ["n3"] }).detail).toBe("Takes part: Yuzu and Mr. Sato");
    expect(w({ kind: "beat", state: "fired", beat: "b1", text: "x", who: [], npc: ["n3"] }).detail).toBe("Takes part: Mr. Sato");
    expect(w({ kind: "result", rule: "interrupted", result: "came", who: [], npc: ["n3"] }).line).toBe("Interrupted moment: Mr. Sato came");
    expect(w({ kind: "result", rule: "interrupted", result: "mentioned", who: [], npc: ["n3"] }).line).toBe("Interrupted moment: Mr. Sato was only mentioned");
    expect(w({ kind: "result", rule: "interrupted", result: "missed", who: [], npc: ["n99"] }).line).toBe("Interrupted moment: someone did not come");
    const html = renderToStaticMarkup(<DirectionLog state={base({ log: [{ at: Date.now(), kind: "result", rule: "interrupted", result: "came", who: [], npc: ["n3"] }] })} />);
    expect(html).toContain("Interrupted moment: Mr. Sato came");
  });
  it("the mark under the reply names the person (members and people together)", () => {
    const fire: DirectionFire = { id: "f1", rule: "interrupted", kind: "interrupt", who: [], npc: ["n3"], with: ["hana"], after: "m1#0", n: 4, roll: { d1: 4, d2: 5, total: 9, need: 8 }, tension: 0, hold: 0, payoff: false, result: "came", carrier: "m2#0", forced: false, why: "", at: 1 };
    const marks = (f: DirectionFire, people?: Record<string, string>) => ({ chatId: "c1", fires: [f], rules: { interrupted: "Interrupted moment" }, members: { yuzu: "Yuzu" }, ...(people ? { people } : {}) });
    const msg = { id: "m2", role: "char", activeSwipe: 0 } as any;
    expect(renderToStaticMarkup(<DirectionNoteView chatId="c1" message={msg} marks={marks(fire, { n3: "Mr. Sato" })} />)).toContain("Direction: Mr. Sato walks in (Interrupted moment, 2d6 = 9, needed 8) · came");
    expect(renderToStaticMarkup(<DirectionNoteView chatId="c1" message={msg} marks={marks({ ...fire, who: ["yuzu"] }, { n3: "Mr. Sato" })} />)).toContain("Yuzu and Mr. Sato walks in");
    // unknown in the store: "someone", not the id
    const lost = renderToStaticMarkup(<DirectionNoteView chatId="c1" message={msg} marks={marks(fire)} />);
    expect(lost).toContain("Direction: someone walks in");
    expect(lost).not.toContain("n3");
  });
  it("the marks store gets the World people's names", () => {
    dir.useDirectionMarks.setState({ chat: null });
    ui.publishMarks("c1", base({ fires: [{ id: "f1", rule: "interrupted", kind: "interrupt", who: [], npc: ["n3"], with: [], after: "", n: 1, roll: null, tension: 0, hold: 0, payoff: false, result: null, carrier: "m2#0", forced: true, why: "", at: 1 }] }));
    expect(dir.useDirectionMarks.getState().chat?.people).toEqual({ n3: "Mr. Sato", n7: "Aunt Mie" });
    dir.useDirectionMarks.setState({ chat: null });
  });
});

describe("words in both languages", () => {
  it("every new key exists in English and Ukrainian, with no Russian-only letters", () => {
    const keys = ["dir.someone", "dir.beat.leftStory", "dir.beat.npc.title", "dir.beat.npc.hint", "dir.beat.npc.none", "dir.beat.npc.noReturnHint", "dir.rule.from", "dir.rule.from.members", "dir.rule.from.world", "dir.rule.from.any", "dir.rule.from.hint", "dir.rule.from.none"];
    for (const k of keys) {
      expect((DICTIONARIES.en as any)[k], k).toBeTruthy();
      const uk = (DICTIONARIES.uk as any)[k] as string;
      expect(uk, k).toBeTruthy();
      expect(/[ыэёъ]/i.test(uk), `${k}: ${uk}`).toBe(false);
    }
  });
});
