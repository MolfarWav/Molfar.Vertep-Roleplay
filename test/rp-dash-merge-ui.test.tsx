// Merging two Dashboard characters that are one person (docs/ENTITY-REGISTRY.md, phase A): the suggestion callout, the
// "Possible duplicate" change, and the "Manage {name}" trigger in a person's header, rendered to static markup.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashChar, DashView } from "../src/lib/dashboard";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SuggestCallout, SuggestCalloutView, ManagePerson } = await import("../src/components/dashboard/dash-merge");
const { AttitudeCard } = await import("../src/components/dashboard/dash-cards");
const { DashCtx } = await import("../src/components/dashboard/dash-context");
const { sinceChanges } = await import("../src/lib/dash-changes");
const { suggestionsFor } = await import("../src/lib/dashboard");

const stats = { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 };
const char = (editable: boolean): DashChar =>
  ({
    cls: "neutral", stats, pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: "strangers", prevConstellation: null,
    mood: null, moodWas: null, condition: null, outfit: null, holding: null, goal: null, leads: null, blindSpot: null, compact: false, pronouns: null,
    rated: true, pulseBase: { excitement: 0, arousal: 0 }, prev: null, notebook: [], name: null, history: [], series: [],
    retired: editable ? [] : undefined,
  }) as unknown as DashChar;
const names = ["Sina", "Sina Rose", "Bram"];
const view = (suggest?: DashView["suggest"], editable = true): DashView =>
  ({
    key: "k", turn: 5, at: 0, op: null, partial: false, sensorModel: "", stale: false, clock: null, present: names, order: names,
    events: [], threads: [], edges: [], chars: Object.fromEntries(names.map((n) => [n, char(editable)])),
    usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 }, lastError: null, insert: null, insertEnabled: true, mode: "sensor", suggest,
  }) as unknown as DashView;

const pair = [{ a: "Sina", b: "Sina Rose", why: "same first name" }];
/** A dashboard context that only carries what these components read. */
const withDash = (v: DashView, node: React.ReactNode) =>
  renderToStaticMarkup(<DashCtx.Provider value={{ view: v, act: async () => true } as never}>{node}</DashCtx.Provider>);

describe("suggestion callout", () => {
  it("shows for a focused person in a pair and names both people", () => {
    const html = withDash(view(pair), <SuggestCallout focus="Sina" />);
    expect(html).toContain('data-testid="dash-suggest"');
    expect(html).toContain("Sina");
    expect(html).toContain("Sina Rose");
    expect(html).toContain('data-testid="dash-suggest-merge"');
    expect(html).toContain('data-testid="dash-suggest-apart"');
  });

  it("shows for the other side of the pair too, naming the first person", () => {
    const html = withDash(view(pair), <SuggestCallout focus="Sina Rose" />);
    expect(html).toContain('data-testid="dash-suggest"');
    expect(html).toContain("Sina");
  });

  it("renders nothing for someone outside every pair, without suggestions, or when the notes cannot be edited", () => {
    expect(withDash(view(pair), <SuggestCallout focus="Bram" />)).toBe("");
    expect(withDash(view(undefined), <SuggestCallout focus="Sina" />)).toBe("");
    expect(withDash(view([]), <SuggestCallout focus="Sina" />)).toBe("");
    expect(withDash(view(pair, false), <SuggestCallout focus="Sina" />)).toBe("");
  });

  it("ignores a pair that names someone who is gone", () => {
    expect(suggestionsFor(view([{ a: "Sina", b: "Nobody", why: "same name" }]), "Sina")).toEqual([]);
  });

  it("while a request runs both buttons are off and the pressed one has the spinner", () => {
    const html = renderToStaticMarkup(<SuggestCalloutView name="Sina" other="Sina Rose" why="one letter apart" busy="merge" onMerge={() => {}} onApart={() => {}} />);
    expect(html.match(/<button[^>]* disabled=""/g)?.length).toBe(2);
    expect(html.match(/animate-spin/g)?.length).toBe(1);
    expect(html).toContain('aria-busy="true"');
    const idle = renderToStaticMarkup(<SuggestCalloutView name="Sina" other="Sina Rose" busy={null} onMerge={() => {}} onApart={() => {}} />);
    expect(idle).not.toMatch(/<button[^>]* disabled=""/);
    expect(idle).not.toContain("animate-spin");
  });
});

describe("Possible duplicate change", () => {
  it("sinceChanges lists one change per suggested pair, on the Person tab, about the first name", () => {
    const list = sinceChanges(view(pair), null, "Bram").filter((c) => c.kind === "duplicate");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ tab: "person", who: "Sina", negative: false, n: 1 });
  });

  it("lists none without suggestions", () => {
    expect(sinceChanges(view(undefined), null, "Sina").some((c) => c.kind === "duplicate")).toBe(false);
  });
});

describe("Manage trigger in the header", () => {
  const card = (v: DashView) => withDash(v, <AttitudeCard name="Sina" char={v.chars.Sina} avatars={{}} />);

  it("is there with its aria-label when the notes are editable and there is someone else", () => {
    const html = card(view(pair));
    expect(html).toContain('data-testid="dash-manage"');
    expect(html).toContain('aria-label="Manage Sina"');
  });

  it("is hidden when the notes cannot be edited", () => {
    expect(card(view(pair, false))).not.toContain('data-testid="dash-manage"');
  });

  it("is hidden for the only character", () => {
    const only = { ...view(pair), order: ["Sina"], chars: { Sina: char(true) } } as unknown as DashView;
    expect(withDash(only, <ManagePerson name="Sina" />)).toBe("");
  });
});
