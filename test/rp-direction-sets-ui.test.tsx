/**
 * Direction phase 4, the client (#496): the genre select (nine sets), rule sentences composed from a rule's `when`, the defaults
 * the state carries, the nine new scene kinds, the ready-made beats and the draft from the cards. Rendered to static markup from
 * states the plugin could have answered; the requests are checked with a fake fetch.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error plain JS plugin
import * as plugin from "../plugins/direction/plugin.js";

(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { PlanTabView, BeatEditor } = await import("../src/components/chat/direction-plan");
const { RulesTabView, RuleNumbers } = await import("../src/components/chat/direction-sheet");
const { GenreSelect } = await import("../src/components/chat/genre-select");
const ui = await import("../src/lib/direction-ui");
const dir = await import("../src/lib/direction");
const { t: translate, DICTIONARIES } = await import("../src/lib/i18n");
const t = (key: any, vars?: any) => translate(key, "en", vars);
const tu = (key: any, vars?: any) => translate(key, "uk", vars);
import type { BeatDraft, DirectionBeat, DirectionBeatTemplate, DirectionRule, DirectionState } from "../src/lib/direction";

const NINE = ["romcom", "harem", "slice", "drama", "thriller", "detective", "steamy", "adventure", "horror"];
const NEW_TAGS = ["work", "meal", "downtime", "argument", "travel", "danger", "investigation", "secret", "night"];
const sets = NINE.map((id) => ({ id, name: plugin.SETS[id].name }));

const rule = (over: Partial<DirectionRule> = {}): DirectionRule => ({
  id: "followed", name: "Someone is watching", kind: "interrupt", on: true, need: 9, cooldown: 6, k: 3, m: 4, from: "members", status: "ready", left: 0, tension: 0,
  when: { alone: 3 }, defaults: { need: 9, cooldown: 6, k: 3, m: 4, from: "members" }, ...over,
});
const beat = (over: Partial<DirectionBeat> = {}): DirectionBeat => ({
  id: "b1", text: "The lights fail", who: [], npc: [], when: { kind: "replies", n: 5 }, wait: true, tries: 0, status: "waiting", left: 3, ...over,
});
const tpls: DirectionBeatTemplate[] = [
  { id: "clock", text: "Word comes that they have less time than they thought.", when: { kind: "replies", n: 6 }, wait: true },
  { id: "betrayal", text: "One of the people they trust has been acting against them.", when: { kind: "replies", n: 14 }, wait: true },
  { id: "escape", text: "They have to leave this place now, and quietly.", when: { kind: "tag", tag: "danger" }, wait: false },
];
const base = (over: Partial<DirectionState> = {}, beats: DirectionBeat[] = []): DirectionState => ({
  config: { model: "mock/director" },
  chat: { on: true, lock: null, returning: null },
  scene: { source: "director", present: ["hana"], tag: "danger" },
  report: { key: "m1#0", at: Date.now() - 60_000, tag: "danger", present: ["hana"], sceneNew: false, model: "mock/director", ms: 600 },
  members: [{ id: "yuzu", name: "Yuzu" }, { id: "hana", name: "Hana" }],
  log: [{ at: Date.now() - 60_000, kind: "report", key: "m1#0", tag: "danger", present: ["hana"], ms: 600 }],
  usage: { input: 1, output: 1, runs: 1 },
  rules: { set: "thriller", on: true, sets, items: [rule()] },
  plan: {
    beats, whenKinds: ["replies", "tag", "place", "manual"], tags: ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event", "danger", "secret", "night"],
    templates: tpls, boundaryWait: 6, max: 20, textMax: 400,
  },
  ...over,
});
const noop = () => {};
const rulesTab = (state: DirectionState, foldsOpen = false) => renderToStaticMarkup(<RulesTabView state={state} onSet={noop} onOn={noop} onRule={noop} onFire={noop} onSkip={noop} foldsOpen={foldsOpen} />);
const planTab = (state: DirectionState, extra: Record<string, unknown> = {}) => renderToStaticMarkup(<PlanTabView state={state} onPlan={noop} onFire={noop} onSkipNext={noop} {...extra} />);
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";
const isDisabled = (tag: string) => / disabled=""| data-disabled/.test(tag);
const textOf = (html: string, testid: string) => html.match(new RegExp(`data-testid="${testid}"[^>]*>([\\s\\S]*?)</(?:p|div|span|button)>`))?.[1]?.replace(/<[^>]+>/g, "") ?? "";
const dd = (over: Partial<BeatDraft> = {}): BeatDraft => ({ text: "Hana finds the letter", who: ["hana"], npc: [], when: { kind: "replies", n: 5 }, wait: true, skipped: false, ...over });

let realFetch: typeof fetch | null = null;
function fakeFetch(answer: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  realFetch = globalThis.fetch;
  const calls: { url: string; method?: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answer(String(url), init);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return calls;
}
afterEach(() => {
  if (realFetch) globalThis.fetch = realFetch;
  realFetch = null;
});

describe("the genre select", () => {
  it("None first, then the nine genres by their names in the app's language", () => {
    const en = ui.genreOptions(t, sets);
    expect(en.map((o) => o.id)).toEqual(["none", ...NINE]);
    expect(en.map((o) => o.label)).toEqual(["None", "School rom-com", "Harem", "Slice of life", "Drama", "Thriller", "Detective", "Steamy romance", "Adventure", "Horror"]);
    const uk = ui.genreOptions(tu, sets);
    expect(uk[0]?.label).toBe("Немає");
    expect(uk[5]?.label).toBe("Трилер");
    expect(uk.every((o) => !/[ыэёъ]/i.test(o.label))).toBe(true);
  });

  it("a set with no string of its own keeps the plugin's name", () => {
    expect(ui.setName(t, { id: "future", name: "Space opera" })).toBe("Space opera");
    expect(ui.ruleTitle(t, { id: "future", name: "A new rule" })).toBe("A new rule");
  });

  it("the Rules tab shows a select (not a row of buttons) with the chat's genre; no genre reads None", () => {
    const html = rulesTab(base());
    const trigger = tagOf(html, "rules-genre");
    expect(trigger).toContain("select-trigger");
    expect(html).toContain("Thriller");
    expect(html).not.toContain('radiogroup" aria-label="Genre"');
    expect(rulesTab(base({ rules: { set: "", on: false, sets, items: [] } }))).toContain("None");
  });

  it("the genre select is read-only while the director is off or has no model", () => {
    expect(isDisabled(tagOf(rulesTab(base({ chat: { on: false, lock: null, returning: null } })), "rules-genre"))).toBe(true);
    expect(isDisabled(tagOf(rulesTab(base({ config: { model: "" } })), "rules-genre"))).toBe(true);
    expect(isDisabled(tagOf(rulesTab(base()), "rules-genre"))).toBe(false);
  });

  it("picking maps to the set's id, None to an empty set, and goes out as PUT /direction/rules", async () => {
    expect(ui.setFromGenreValue("none")).toBe("");
    expect(ui.setFromGenreValue("horror")).toBe("horror");
    expect(ui.genreValue("", sets)).toBe("none");
    expect(ui.genreValue("horror", sets)).toBe("horror");
    expect(ui.genreValue("gone", sets)).toBe("none");
    const calls = fakeFetch(() => ({ body: { rules: { set: "horror", on: true } } }));
    await dir.setDirectionRules("c1", { set: ui.setFromGenreValue("horror") });
    await dir.setDirectionRules("c1", { set: ui.setFromGenreValue("none") });
    expect(calls.map((c) => [c.method, c.body])).toEqual([["PUT", { chatId: "c1", set: "horror" }], ["PUT", { chatId: "c1", set: "" }]]);
  });

  it("the shared select renders the picked name for the group editor too", () => {
    const html = renderToStaticMarkup(<GenreSelect label="Default genre" value="detective" sets={sets} onChange={noop} testId="g" />);
    expect(html).toContain("Detective");
    expect(html).toContain('aria-label="Default genre"');
  });

  it("the group editor's list: the plugin's sets, else the rom-com entry", async () => {
    fakeFetch(() => ({ body: { sets: sets.map((s) => ({ ...s, tags: [], rules: [], templates: 3 })) } }));
    expect((await dir.fetchDirectionSets()).map((s) => s.id)).toEqual(NINE);
    fakeFetch(() => ({ status: 404, body: { error: "not found" } }));
    expect(await dir.fetchDirectionSets()).toEqual(dir.FALLBACK_SETS);
    expect(dir.FALLBACK_SETS.map((s) => s.id)).toEqual(["romcom"]);
    fakeFetch(() => ({ body: { sets: [] } }));
    expect(await dir.fetchDirectionSets()).toEqual(dir.FALLBACK_SETS);
  });
});

describe("rule names and sentences", () => {
  it("every rule of every set has a name in both languages", () => {
    const ids = Object.values(plugin.SETS).flatMap((s: any) => s.rules.map((r: any) => r.id));
    expect(ids).toHaveLength(27);
    for (const id of ids) {
      expect((DICTIONARIES.en as any)[`dir.rulename.${id}`], id).toBeTruthy();
      const uk = (DICTIONARIES.uk as any)[`dir.rulename.${id}`] as string;
      expect(uk, id).toBeTruthy();
      expect(/[ыэёъ]/i.test(uk), `${id}: ${uk}`).toBe(false);
    }
    for (const id of NINE) {
      expect((DICTIONARIES.en as any)[`dir.set.${id}`], id).toBeTruthy();
      expect(/[ыэёъ]/i.test((DICTIONARIES.uk as any)[`dir.set.${id}`]), id).toBe(false);
    }
  });

  it("each shape of `when` becomes words: alone, nobody, a kind, a kind with a head count, a head count, not a kind", () => {
    const s = (when: any, kind: any = "interrupt", id = "x") => ui.ruleSentence(t, { id, kind, when }, "en");
    expect(s({ alone: 3 })).toBe("When you are alone with one member for 3 replies, someone walks in on the moment.");
    expect(s({ alone: 1 })).toBe("When you are alone with one member for 1 reply, someone walks in on the moment.");
    expect(s({ empty: 3 }, "return")).toBe("When nobody is around for 3 replies, someone who is away comes back.");
    expect(s({ tag: ["meal", "group_out", "event"], max: 2 }, "join")).toBe("When the scene is meal, outing, or event and 2 or fewer members are here, someone joins the group.");
    expect(s({ tag: ["danger"] }, "join")).toBe("When the scene is danger, someone joins the group.");
    expect(s({ max: 1 }, "join")).toBe("When 1 or fewer members are here, someone joins the group.");
    expect(s({ empty: 2, tagNot: ["at_home", "night"] }, "return")).toBe("When nobody is around for 2 replies, unless the scene is at home or night, someone who is away comes back.");
  });

  it("an unreadable or missing condition falls back to what the rule does", () => {
    expect(ui.ruleSentence(t, { id: "x", kind: "join", when: undefined }, "en")).toBe("Someone joins the group.");
    expect(ui.ruleSentence(t, { id: "x", kind: "return", when: { min: 2 } as any }, "en")).toBe("Someone who is away comes back.");
    expect(ui.ruleSentence(t, { id: "x", kind: "join", when: { tag: ["nope"] } }, "en")).toBe("Someone joins the group.");
  });

  it("the three rom-com rules keep their own sentences", () => {
    expect(ui.ruleSentence(t, { id: "interrupted", kind: "interrupt", when: { alone: 3 } }, "en")).toBe("When you are alone with one member for a few replies, someone walks in on you.");
    expect(ui.ruleSentence(t, { id: "nobody", kind: "return", when: { empty: 3, tagNot: ["at_home"] } }, "en")).toBe("When nobody is around for a few replies, someone comes by.");
    expect(ui.ruleSentence(t, { id: "crowd", kind: "join", when: { tag: ["break", "lunch", "club"], max: 2 } }, "en")).toBe("In a break, lunch or club with one or two present, a friend joins.");
  });

  it("all 27 real rules compose a clean sentence in both languages", () => {
    for (const set of Object.values(plugin.SETS) as any[]) {
      for (const r of set.rules) {
        const rr = { id: r.id, kind: r.do.kind, when: r.when };
        for (const [tr, lang] of [[t, "en"], [tu, "uk"]] as const) {
          const text = ui.ruleSentence(tr, rr, lang);
          expect(text, `${lang} ${r.id}`).toMatch(/\.$/);
          expect(text, `${lang} ${r.id}`).not.toMatch(/[{}]|undefined|NaN/);
          if (lang === "uk") expect(/[ыэёъ]/i.test(text), `${r.id}: ${text}`).toBe(false);
        }
      }
    }
    expect(ui.ruleSentence(tu, { id: "worst", kind: "interrupt", when: { alone: 3 } }, "uk")).toBe("Коли ви 3 відповіді лишаєтеся наодинці з одним учасником, хтось заходить посеред моменту.");
    expect(ui.ruleSentence(tu, { id: "overheard", kind: "join", when: { tag: ["argument", "secret"], max: 2 } }, "uk")).toBe("Коли сцена — сварка або таємниця, а присутніх учасників не більше ніж 2, хтось долучається до групи.");
  });

  it("the card shows the composed sentence and the localized name", () => {
    const html = rulesTab(base({ rules: { set: "thriller", on: true, sets, items: [rule({ id: "ally", name: "An ally arrives", kind: "join", when: { tag: ["danger"], max: 2 } }), rule({ id: "romcom-x", name: "Plugin's own name", kind: "return", when: { empty: 3 } })] } }));
    expect(textOf(html, "rule-sentence-ally")).toBe("When the scene is danger and 2 or fewer members are here, someone joins the group.");
    expect(html).toContain("An ally arrives");
    expect(html).toContain("Plugin&#x27;s own name");
    expect(textOf(html, "rule-sentence-romcom-x")).toBe("When nobody is around for 3 replies, someone who is away comes back.");
  });
});

describe("defaults come from the rule", () => {
  it("a rule with `defaults` is edited only when a number differs from them, for any set", () => {
    expect(ui.ruleEdited(rule())).toBe(false);
    expect(ui.ruleEdited(rule({ need: 7 }))).toBe(true);
    expect(ui.ruleEdited(rule({ k: 0 }))).toBe(true);
    expect(ui.ruleEdited(rule({ from: "world" }))).toBe(true);
    // the same id with another default is not edited: the plugin decides
    expect(ui.ruleEdited(rule({ id: "interrupted", need: 9, cooldown: 6, k: 3, m: 4 }))).toBe(false);
  });

  it("Restore sends the rule's own defaults (and `from` back to members)", () => {
    expect(ui.ruleRestorePatch(rule({ need: 4, from: "any" }))).toEqual({ need: 9, cooldown: 6, k: 3, m: 4, from: "members" });
    expect(ui.ruleRestorePatch(rule({ from: undefined, need: 4 }))).toEqual({ need: 9, cooldown: 6, k: 3, m: 4 });
    const html = renderToStaticMarkup(<RuleNumbers rule={rule({ cooldown: 1 })} locked={false} onRule={noop} />);
    expect(html).toContain('data-testid="rule-restore-followed"');
    expect(renderToStaticMarkup(<RuleNumbers rule={rule()} locked={false} onRule={noop} />)).not.toContain("rule-restore");
  });

  it("an older plugin (no `defaults`) falls back to the rom-com table; an unknown id has no restore", () => {
    const old = (over: Partial<DirectionRule>) => { const r = rule(over); delete r.defaults; return r; };
    expect(ui.ruleEdited(old({ id: "interrupted", need: 8, cooldown: 5, k: 3, m: 4 }))).toBe(false);
    expect(ui.ruleEdited(old({ id: "interrupted", need: 7, cooldown: 5, k: 3, m: 4 }))).toBe(true);
    expect(ui.ruleRestorePatch(old({ id: "crowd" }))).toEqual({ need: 9, cooldown: 6, k: 0, m: 0, from: "members" });
    expect(ui.ruleRestorePatch(old({ id: "followed" }))).toBeNull();
    expect(ui.ruleEdited(old({ id: "followed", need: 2 }))).toBe(false);
  });
});

describe("the nine new scene kinds", () => {
  it("all nineteen kinds are listed and have words in English and Ukrainian", () => {
    expect(dir.DIRECTION_TAGS).toHaveLength(19);
    expect(dir.DIRECTION_BASE_TAGS).toHaveLength(10);
    for (const k of NEW_TAGS) expect(dir.DIRECTION_TAGS as readonly string[]).toContain(k);
    expect([...dir.DIRECTION_TAGS]).toEqual([...plugin.TAGS]);
    for (const k of dir.DIRECTION_TAGS) {
      expect((DICTIONARIES.en as any)[`dir.tag.${k}`], k).toBeTruthy();
      const uk = (DICTIONARIES.uk as any)[`dir.tag.${k}`] as string;
      expect(uk, k).toBeTruthy();
      expect(/[ыэёъ]/i.test(uk), `${k}: ${uk}`).toBe(false);
    }
    expect(t(ui.tagKey("investigation"))).toBe("Investigation");
    expect(tu(ui.tagKey("argument"))).toBe("Сварка");
  });

  it("the Scene select is fed by the chat's kinds; an older plugin offers the base ten", () => {
    expect(ui.planTags(base())).toContain("danger");
    expect(ui.planTags(base())).toHaveLength(13);
    const older = base();
    older.plan = { ...older.plan!, tags: undefined as any };
    expect(ui.planTags(older)).toEqual([...dir.DIRECTION_BASE_TAGS]);
    const html = renderToStaticMarkup(<BeatEditor state={base()} title="New beat" draft={dd({ when: { kind: "tag", tag: "argument" } })} onChange={noop} onSave={noop} onCancel={noop} />);
    // the chat's kinds do not list `argument`, but a beat waiting for it still reads in words
    expect(html).toContain("Argument");
    expect(html).not.toContain(">argument<");
  });

  it("the new kinds read in words wherever a tag shows: the beat's when, the status, the log, the scene", () => {
    expect(ui.beatWhenText(t, { kind: "tag", tag: "night" })).toBe("When the scene is: Night");
    expect(ui.beatStatusLine(t, beat({ when: { kind: "tag", tag: "secret" } }), 6)).toBe("Waiting for the scene: Secret");
    const line = ui.logWords(t, base(), { at: 1, kind: "report", key: "m1#0", tag: "travel", present: ["hana"] } as any, "en").line;
    expect(line).toBe("Travel · Hana");
  });
});

describe("ready-made beats", () => {
  it("From the genre sits beside Add beat and is enabled with a genre", () => {
    const html = planTab(base());
    expect(html).toContain("From the genre");
    expect(isDisabled(tagOf(html, "plan-from-genre"))).toBe(false);
    expect(html).not.toContain("plan-from-genre-reason");
    expect(html.indexOf("plan-add")).toBeLessThan(html.indexOf("plan-from-genre"));
  });

  it("no genre: disabled, with the visible line", () => {
    const st = base({ rules: { set: "", on: false, sets, items: [] } });
    st.plan = { ...st.plan!, templates: [] };
    const html = planTab(st);
    expect(isDisabled(tagOf(html, "plan-from-genre"))).toBe(true);
    expect(textOf(html, "plan-from-genre-reason")).toBe("Pick a genre in Rules to get ready-made beats.");
  });

  it("an older plugin (no `templates`) shows neither new button", () => {
    const st = base();
    delete st.plan!.templates;
    const html = planTab(st);
    expect(html).not.toContain("plan-from-genre");
    expect(html).not.toContain("plan-draft-btn");
    expect(html).toContain('data-testid="plan-add"');
  });

  it("the list: text and when in words; a used text is marked 'in the plan' and cannot be picked", () => {
    const html = planTab(base({}, [beat({ text: "word comes that they have LESS time  than they thought." })]), { startPicker: true });
    expect(html).toContain('data-testid="plan-templates"');
    expect(html).toContain("Ready-made beats");
    for (const x of tpls) expect(html).toContain(x.text);
    expect(html).toContain("After 6 replies · waits for a new scene");
    expect(html).toContain("When the scene is: Danger");
    const used = tagOf(html, "tpl-clock");
    expect(isDisabled(used)).toBe(true);
    expect(used).toContain('data-used="true"');
    expect(html).toContain("in the plan");
    expect(isDisabled(tagOf(html, "tpl-betrayal"))).toBe(false);
    expect(isDisabled(tagOf(html, "tpl-escape"))).toBe(false);
    expect(html).not.toContain("plan-templates-used");
  });

  it("every text already used: the list says so", () => {
    const html = planTab(base({}, tpls.map((x, i) => beat({ id: "u" + i, text: x.text }))), { startPicker: true });
    expect(html).toContain("Every ready-made beat of this genre is already in the plan.");
    for (const x of tpls) expect(isDisabled(tagOf(html, `tpl-${x.id}`))).toBe(true);
  });

  it("picking opens the inline editor with the text, when and wait filled in, nobody ticked", () => {
    const d = ui.draftFromTemplate(tpls[2]!);
    expect(d).toEqual({ text: tpls[2]!.text, who: [], npc: [], when: { kind: "tag", tag: "danger" }, wait: false, skipped: false });
    expect(d.when).not.toBe(tpls[2]!.when);
    const html = planTab(base(), { startEdit: { key: "new", draft: d } });
    expect(html).toContain('data-testid="beat-editor"');
    expect(html).toContain("They have to leave this place now, and quietly.");
    expect(html).not.toContain('data-testid="plan-templates"');
    // the picked beat is saved like any beat: the whole list, the new one without an id
    const saved = ui.planWithBeat(ui.planDrafts(base({}, [beat()])), { ...d, who: ["hana"] });
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual({ text: tpls[2]!.text, who: ["hana"], npc: [], when: { kind: "tag", tag: "danger" }, wait: false, skipped: false });
    expect("id" in saved[1]!).toBe(false);
  });

  it("at the cap From the genre is disabled and the full line says why", () => {
    const many = Array.from({ length: 20 }, (_, i) => beat({ id: "m" + i, text: "Beat " + i }));
    const html = planTab(base({}, many));
    expect(isDisabled(tagOf(html, "plan-from-genre"))).toBe(true);
    expect(isDisabled(tagOf(html, "plan-draft-btn"))).toBe(true);
    expect(html).toContain("A plan holds at most 20 beats.");
  });
});

describe("draft from the cards", () => {
  it("the button: enabled with a model", () => {
    const html = planTab(base());
    expect(html).toContain("Draft from the cards");
    expect(isDisabled(tagOf(html, "plan-draft-btn"))).toBe(false);
    expect(html).not.toContain("plan-draft-need-model");
  });

  it("no director model: disabled with the visible reason", () => {
    const html = planTab(base({ config: { model: "" } }));
    expect(isDisabled(tagOf(html, "plan-draft-btn"))).toBe(true);
    expect(textOf(html, "plan-draft-need-model")).toBe("Pick a director model first.");
  });

  it("busy: the label changes, the button cannot be pressed twice, a line says it can take a minute", () => {
    const html = planTab(base(), { startBusy: true });
    expect(html).toContain("Reading the cards…");
    const btn = tagOf(html, "plan-draft-btn");
    expect(isDisabled(btn)).toBe(true);
    expect(btn).toContain('aria-busy="true"');
    expect(html).toContain("This can take a minute.");
  });

  it("an error: the reason line in words (and the plugin's message under it)", () => {
    const html = planTab(base(), { startDraftError: { reason: "bad-reply", message: "no beats in the answer" } });
    expect(html).toContain('role="alert"');
    expect(textOf(html, "plan-draft-error")).toContain("Draft failed: The model’s answer could not be read.");
    expect(textOf(html, "plan-draft-error-detail")).toBe("no beats in the answer");
    for (const [reason, text] of [["empty", "The model gave no usable beats. Try again."], ["error", "The call failed. Try again."], ["no-model", "No director model is picked."], ["not-group", "A draft needs a group chat."], ["weird", "The call failed. Try again."]] as const) {
      expect(t(ui.draftErrorKey(reason))).toBe(text);
    }
  });

  const drafted = [dd({ text: "Hana finds the letter", who: ["hana"] }), dd({ text: "Yuzu picks a fight", who: ["yuzu", "hana"], when: { kind: "tag", tag: "argument" } }), dd({ text: "A storm cuts the power", who: [], when: { kind: "replies", n: 12 } })];

  it("the Draft card: one row per beat with a ticked checkbox, who and when in words, the hint that it is not saved", () => {
    const html = planTab(base(), { startDraft: { beats: drafted } });
    expect(html).toContain('data-testid="plan-draft"');
    expect(textOf(html, "plan-draft-title")).toBe("Draft from the cards");
    expect(textOf(html, "plan-draft-hint")).toContain("It is not saved: closing the sheet drops it.");
    for (let i = 0; i < 3; i++) {
      expect(html).toContain(`data-testid="draft-row-${i}"`);
      expect(tagOf(html, `draft-tick-${i}`)).toContain('aria-checked="true"');
    }
    expect(html).toContain("Hana finds the letter");
    expect(html).toContain("Takes part: Hana · After 5 replies");
    expect(html).toContain("Takes part: Yuzu, Hana · When the scene is: Argument");
    expect(html).toContain("After 12 replies");
    expect(textOf(html, "plan-draft-add")).toBe("Add 3 to the plan");
    expect(isDisabled(tagOf(html, "plan-draft-add"))).toBe(false);
    expect(textOf(html, "plan-draft-discard")).toBe("Discard");
    expect(html).not.toContain("plan-draft-reason");
    // the card sits above the beat list and the buttons
    expect(html.indexOf("plan-draft\"")).toBeLessThan(html.indexOf("plan-add"));
  });

  it("an unticked beat is not counted; with none ticked Add is disabled and says why", () => {
    const one = planTab(base(), { startDraft: { beats: drafted, ticked: [true, false, true] } });
    expect(tagOf(one, "draft-tick-1")).toContain('aria-checked="false"');
    expect(textOf(one, "plan-draft-add")).toBe("Add 2 to the plan");
    const none = planTab(base(), { startDraft: { beats: drafted, ticked: [false, false, false] } });
    expect(isDisabled(tagOf(none, "plan-draft-add"))).toBe(true);
    expect(textOf(none, "plan-draft-reason")).toBe("Tick at least one beat to add it.");
  });

  it("over the 20-beat cap: Add is disabled and the reason names how many to untick", () => {
    expect(ui.overCap(18, 3, 20)).toBe(1);
    expect(ui.overCap(17, 3, 20)).toBe(0);
    const eighteen = Array.from({ length: 18 }, (_, i) => beat({ id: "m" + i, text: "Beat " + i }));
    const html = planTab(base({}, eighteen), { startDraft: { beats: drafted } });
    expect(isDisabled(tagOf(html, "plan-draft-add"))).toBe(true);
    expect(textOf(html, "plan-draft-reason")).toBe("The plan holds at most 20 beats. Untick 1 or delete some from the plan.");
    const ok = planTab(base({}, eighteen), { startDraft: { beats: drafted, ticked: [true, true, false] } });
    expect(isDisabled(tagOf(ok, "plan-draft-add"))).toBe(false);
  });

  it("adding appends the kept beats to the plan: the existing ones keep their ids, the new ones have none", async () => {
    const st = base({}, [beat({ id: "b1" })]);
    const kept = drafted.filter((_, i) => i !== 1);
    const list = ui.planWithDraft(ui.planDrafts(st), kept);
    expect(list.map((b) => b.id)).toEqual(["b1", undefined, undefined]);
    expect(list.map((b) => "id" in b)).toEqual([true, false, false]);
    expect(list.slice(1).map((b) => b.text)).toEqual(["Hana finds the letter", "A storm cuts the power"]);
    const calls = fakeFetch(() => ({ body: { plan: { beats: [] } } }));
    await dir.setDirectionPlan("c1", list);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/direction/plan");
    expect(calls[0]!.body.chatId).toBe("c1");
    expect(calls[0]!.body.beats).toHaveLength(3);
    expect(calls[0]!.body.beats[0].id).toBe("b1");
    expect(calls[0]!.body.beats[1]).toEqual({ text: "Hana finds the letter", who: ["hana"], npc: [], when: { kind: "replies", n: 5 }, wait: true, skipped: false });
    expect(calls[0]!.body.beats[2].id).toBeUndefined();
  });

  it("the draft route: a good answer becomes drafts, a refusal keeps its reason, a missing route is 'no-plugin'", async () => {
    let calls = fakeFetch(() => ({ body: { ok: true, beats: [{ text: "Hana finds the letter", who: ["hana"], npc: [], when: { kind: "replies", n: 5 }, wait: true }], model: "mock/director" } }));
    const good = await dir.draftDirectionPlan("c1");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/direction/draft");
    expect(calls[0]!.body).toEqual({ chatId: "c1" });
    expect(good.ok).toBe(true);
    expect(good.beats?.[0]).toEqual({ text: "Hana finds the letter", who: ["hana"], npc: [], when: { kind: "replies", n: 5 }, wait: true, skipped: false });
    calls = fakeFetch(() => ({ body: { ok: false, reason: "empty", message: "the model gave no usable beats" } }));
    expect(await dir.draftDirectionPlan("c1")).toEqual({ ok: false, reason: "empty", message: "the model gave no usable beats" });
    calls = fakeFetch(() => ({ status: 404, body: { ok: false, reason: "no-chat" } }));
    expect((await dir.draftDirectionPlan("c1")).reason).toBe("no-chat");
    calls = fakeFetch(() => ({ status: 404, body: { error: "not found" } }));
    expect((await dir.draftDirectionPlan("c1")).reason).toBe("no-plugin");
    calls = fakeFetch(() => ({ body: { ok: true, beats: [] } }));
    expect((await dir.draftDirectionPlan("c1")).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("words for phase 4 in both languages", () => {
  it("every new string exists in English and Ukrainian, keeps its placeholders, has no Russian-only letters", () => {
    const keys = Object.keys(DICTIONARIES.en).filter((k) => /^dir\.(plan\.(fromGenre|inPlan|templateAria|close|draft)|rule\.(when|do|compose))/.test(k));
    expect(keys.length).toBeGreaterThan(25);
    for (const k of keys) {
      const en = (DICTIONARIES.en as any)[k] as string;
      const uk = (DICTIONARIES.uk as any)[k] as string;
      expect(uk, k).toBeTruthy();
      expect(/[ыэёъ]/i.test(uk), `${k}: ${uk}`).toBe(false);
      const ph = (s: string) => [...new Set(s.match(/\{\w+(?=[|}])/g) ?? [])].sort().join(",");
      expect(ph(uk), k).toBe(ph(en));
    }
  });

  it("Ukrainian calls a beat 'момент' in the new plan strings", () => {
    for (const k of ["dir.plan.fromGenreTitle", "dir.plan.draftPick", "dir.plan.draftCap", "dir.plan.draftNone", "dir.plan.draftErr.empty"]) {
      expect(/біт|бiт/i.test((DICTIONARIES.uk as any)[k]), k).toBe(false);
    }
    expect(tu("dir.plan.draftPick", { text: "x" })).toContain("момент");
  });
});
