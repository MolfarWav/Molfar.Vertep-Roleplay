// The "Since your last reply" row of the Dashboard (SinceRow in src/components/dashboard/dash-tabs.tsx), rendered to
// static markup: hidden when nothing changed, the count with its red state for a stat that fell, and three chips
// with a "more" button behind them. The chip text follows the language setting, so the checks read the markup, not the words.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashChange } from "../src/lib/dash-changes";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SinceRow } = await import("../src/components/dashboard/dash-tabs");

const mood: DashChange = { kind: "mood", tab: "person", who: "Ember", negative: false, n: 1, from: "calm", to: "angry" };
const place: DashChange = { kind: "place", tab: "here", negative: false, n: 1, place: "Harbor" };
const fell: DashChange = { kind: "fell", tab: "person", who: "Ember", negative: true, n: 1, stats: ["trust"] };
const quest: DashChange = { kind: "quest", tab: "quests", negative: false, n: 1 };
const things: DashChange = { kind: "things", tab: "here", negative: false, n: 2 };
const rose: DashChange = { kind: "rose", tab: "person", who: "Ember", negative: false, n: 1, stats: ["respect"] };

const render = (changes: DashChange[]) => renderToStaticMarkup(<SinceRow changes={changes} onPick={() => {}} />);

/** The text inside the count badge. */
const countText = (html: string) => /data-testid="dash-since-count"[^>]*>([^<]*)<\/span>/.exec(html)?.[1];
/** The opening tag of the count badge, for its attributes and classes. */
const countTag = (html: string) => /<span[^>]*data-testid="dash-since-count"[^>]*>/.exec(html)?.[0] ?? "";

describe("SinceRow", () => {
  it("renders nothing when nothing changed", () => {
    expect(render([])).toBe("");
  });

  it("two changes: the title and the count show 2, and the count is not negative", () => {
    const html = render([mood, place]);
    expect(html).toContain('data-testid="dash-since-title"');
    expect(html).toContain('data-testid="dash-since-count"');
    expect(countText(html)).toBe("2");
    expect(countTag(html)).not.toContain("data-negative");
    expect(countTag(html)).toContain("bg-sky-600");
    expect(countTag(html)).not.toContain("bg-red-600");
  });

  it("a stat that fell: the count is marked negative and sits on bg-red-600", () => {
    const html = render([fell]);
    expect(countText(html)).toBe("1");
    expect(countTag(html)).toContain('data-negative="true"');
    expect(countTag(html)).toContain("bg-red-600");
  });

  it("five changes: the count shows 5, three chips and the more button are rendered", () => {
    const html = render([mood, place, quest, things, rose]);
    expect(countText(html)).toBe("5");
    // three chips, each with the dot before its text
    expect(html.match(/<span class="size-1\.5 shrink-0 rounded-full bg-current"/g)?.length).toBe(3);
    // the buttons are the three chips and the one "more" button, which is collapsed (aria-expanded false)
    expect(html.match(/<button /g)?.length).toBe(4);
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(1);
  });

  it("two changes show no more button", () => {
    const html = render([mood, place]);
    expect(html.match(/<button /g)?.length).toBe(2);
    expect(html).not.toContain("aria-expanded");
  });
});
