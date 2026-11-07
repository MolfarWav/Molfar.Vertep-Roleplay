// The "what changed" line under the newest reply (#184 P8): when the Dashboard's view belongs to a reply, how the
// folded summary is cut, and the line itself rendered to static markup in each state that must hide it.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { changesLineVisible, sortChanges, summaryOf, viewIsOfReply, type DashChange } from "../src/lib/dash-changes";
import { DICTIONARIES } from "../src/lib/i18n";
import type { DashChar, DashView } from "../src/lib/dashboard";
import type { Message } from "../src/lib/types";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { ChangesNote } = await import("../src/components/chat/changes-note");
const { DashCtx } = await import("../src/components/dashboard/dash-context");

const msg = (o: Partial<Message> = {}): Message => ({ id: "m2", role: "assistant", activeSwipe: 0, swipes: [], ...o } as Message);
const change = (kind: DashChange["kind"], extra: Partial<DashChange> = {}): DashChange => ({ kind, tab: "person", negative: kind === "fell", n: 1, ...extra });

describe("viewIsOfReply", () => {
  it("is true only for the reply whose snapshot is the newest one", () => {
    expect(viewIsOfReply({ key: "m2#0", stale: false }, msg())).toBe(true);
    // the previous reply's view, while the new reply has no snapshot yet
    expect(viewIsOfReply({ key: "m0#0", stale: false }, msg())).toBe(false);
    expect(viewIsOfReply({ key: "m2#0", stale: true }, msg())).toBe(false);
  });
  it("follows the swipe: another swipe has its own key", () => {
    expect(viewIsOfReply({ key: "m2#1", stale: false }, msg({ activeSwipe: 0 }))).toBe(false);
    expect(viewIsOfReply({ key: "m2#1", stale: false }, msg({ activeSwipe: 1 }))).toBe(true);
  });
  it("is false without a view and for a message that is not a reply", () => {
    expect(viewIsOfReply(null, msg())).toBe(false);
    expect(viewIsOfReply({ key: "m2#0", stale: false }, msg({ role: "user" }))).toBe(false);
  });
});

describe("summaryOf and sortChanges", () => {
  const ada = (kind: DashChange["kind"]) => change(kind, { who: "Ada" });
  it("spells out two changes and counts the rest", () => {
    const list = [change("quest"), change("place"), change("things"), change("carry")];
    expect(summaryOf(list)).toMatchObject({ more: 2, who: null });
    expect(summaryOf(list).head).toEqual(list.slice(0, 2));
    expect(summaryOf(list.slice(0, 2)).more).toBe(0);
    expect(summaryOf([])).toEqual({ head: [], more: 0, who: null });
  });
  it("names the character once when the spelled-out changes are about one", () => {
    expect(summaryOf([ada("fell"), ada("mood")]).who).toBe("Ada");
    expect(summaryOf([ada("fell")]).who).toBe("Ada");
    // the third change is not spelled out: it does not matter who it is about
    expect(summaryOf([ada("fell"), ada("mood"), change("quest")]).who).toBe("Ada");
    expect(summaryOf([ada("fell"), change("fell", { who: "Bram" })]).who).toBeNull();
    expect(summaryOf([ada("mood"), change("quest")]).who).toBeNull();
  });
  it("puts what fell first and keeps the rest in order", () => {
    const list = [change("mood"), change("place", { tab: "here" }), change("fell"), change("quest", { tab: "quests" })];
    expect(sortChanges(list).map((c) => c.kind)).toEqual(["fell", "mood", "place", "quest"]);
  });
});

const char = (o: Partial<DashChar> = {}): DashChar => ({
  cls: "neutral", stats: { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 }, pulse: { excitement: 0, arousal: 0 }, hostility: null,
  constellation: "strangers", prevConstellation: null, mood: "tense", moodWas: "calm", condition: null, outfit: null, holding: null, goal: null, leads: null,
  blindSpot: null, compact: false, pronouns: null, rated: true, pulseBase: { excitement: 0, arousal: 0 }, prev: null, notebook: [], name: null, history: [], series: [], ...o,
} as DashChar);
const view = (o: Partial<DashView> = {}): DashView => ({
  key: "m2#0", turn: 5, at: 0, op: null, partial: false, sensorModel: "", stale: false, clock: null, present: ["Ada"], order: ["Ada"],
  events: [], threads: [], edges: [], chars: { Ada: char() }, usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 }, lastError: null, insert: null, insertEnabled: true, mode: "sensor", ...o,
} as DashView);

/** Trust fell and the mood moved since the snapshot before. */
const moved = (o: Partial<DashView> = {}) =>
  view({ chars: { Ada: char({ prev: { stats: { trust: 10, comfort: 0, attraction: 0, respect: 0, affection: 0 }, pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: null } as DashChar["prev"] }) }, ...o });

const render = (v: DashView | null, o: { last?: boolean; status?: string; message?: Message } = {}) => {
  const dash = { status: o.status ?? "ready", view: v, focus: "Ada", here: null } as never;
  return renderToStaticMarkup(
    <DashCtx.Provider value={dash}>
      <ChangesNote chatId="c1" message={o.message ?? msg()} last={o.last ?? true} />
    </DashCtx.Provider>,
  );
};

describe("ChangesNote", () => {
  it("shows a folded button with the summary under the newest reply", () => {
    const html = render(moved());
    expect(html).toContain('data-testid="changes-note"');
    expect(html).toContain('aria-expanded="false"');
    // one character, so the name comes once, in front of what fell and the mood
    expect(html).toContain("Ada · trust fell, mood calm → tense");
    expect(html).not.toContain('data-testid="changes-note-body"');
  });
  it("hides when there are no changes, the view is another reply's, or the reply is not the newest message", () => {
    expect(render(view({ chars: { Ada: char({ mood: "calm", moodWas: "calm" }) } }))).toBe("");
    expect(render(moved({ key: "m0#0" }))).toBe("");
    expect(render(moved({ stale: true }))).toBe("");
    expect(render(moved(), { last: false })).toBe("");
    expect(render(moved(), { status: "loading" })).toBe("");
    expect(render(null)).toBe("");
  });
});

describe("changesLineVisible", () => {
  const ok = { last: true, on: true, ready: true, writing: false, updating: false, ofReply: true, count: 2 };
  it("shows when everything holds", () => {
    expect(changesLineVisible(ok)).toBe(true);
  });
  it("hides when any one condition fails: older reply, setting off, Dashboard not ready, reply being written, update running, another reply's view, nothing changed", () => {
    for (const off of [{ last: false }, { on: false }, { ready: false }, { writing: true }, { updating: true }, { ofReply: false }, { count: 0 }]) {
      expect(changesLineVisible({ ...ok, ...off })).toBe(false);
    }
  });
});

describe("strings", () => {
  it("every new key exists in English and Ukrainian", () => {
    for (const k of ["dash.since.moodOf", "dash.since.line", "dash.since.hint", "dash.since.setting", "dash.since.settingHint", "dash.since.sumWho", "dash.since.sumMood", "dash.since.sumFell", "dash.since.sumRose"] as const) {
      expect(DICTIONARIES.en[k]).toBeTruthy();
      expect(DICTIONARIES.uk[k]).toBeTruthy();
    }
  });
});
