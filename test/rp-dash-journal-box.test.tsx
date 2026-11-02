// The Journal box of the open Dashboard (dash-journal.tsx), rendered to static markup: the thought with its age and
// the faded mark, the people lines with who wrote them, the Litopys entries with the one the next reply carries, the
// off line, and the pure helpers beside it (chapter entries, the settings defaults, the place in the prompt order).
// The checks read data attributes and element counts, not the words, since the words follow the language setting.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashChar, JournalSettings } from "../src/lib/dashboard";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { JournalView, journalEntries } = await import("../src/components/dashboard/dash-journal");
const { DEFAULT_JOURNAL, journalOf } = await import("../src/lib/dashboard");
const { requestOrder } = await import("../src/lib/prompt-order");

const on: JournalSettings = { on: true, inject: true, thoughtTurns: 3, maxTokens: 120 };
const char = (over: Record<string, unknown> = {}) =>
  ({ cls: "ally", name: null, notebook: [], history: [], series: [], thought: null, thoughtTurn: null, thoughtFresh: true, journal: [], ...over }) as unknown as DashChar;
const entry = (id: string, label: string, text: string, toNo: number) => ({ id, label, text, toNo, at: toNo });
const render = (c: DashChar, extra: { journal?: JournalSettings; entries?: ReturnType<typeof entry>[] | null } = {}) =>
  renderToStaticMarkup(<JournalView name="Aria" char={c} turn={7} journal={extra.journal ?? on} entries={extra.entries ?? null} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the Journal box: right now", () => {
  it("a fresh thought is shown plainly, not greyed", () => {
    const html = render(char({ thought: "I do not trust him.", thoughtTurn: 5, thoughtFresh: true }));
    expect(html).toContain('data-testid="dash-journal-thought"');
    expect(html).toContain('data-fresh="true"');
    expect(html).toContain("I do not trust him.");
    expect(html).not.toContain("opacity-60");
  });

  it("a faded thought is greyed and says so: it no longer goes into the prompt", () => {
    const html = render(char({ thought: "Later.", thoughtTurn: 1, thoughtFresh: false }));
    expect(html).toContain('data-fresh="false"');
    expect(html).toContain("opacity-60");
  });

  it("no thought: a short empty line, and the box stays", () => {
    const html = render(char());
    expect(html).not.toContain('data-testid="dash-journal-thought"');
    expect(html).toContain('data-testid="dash-journal"');
  });
});

describe("the Journal box: people and entries", () => {
  it("one row per person line, the sensor's and the user's marked apart", () => {
    const html = render(char({
      journal: [
        { id: "p1", about: "Bram", text: "Says too little.", by: "sensor", turn: 5 },
        { id: "p2", about: "Mira", text: "Trust her with the key.", by: "user", turn: 6 },
      ],
    }));
    expect(count(html, 'data-testid="dash-journal-line"')).toBe(2);
    expect(html).toContain('data-by="sensor"');
    expect(html).toContain('data-by="user"');
    expect(html).toContain("Bram");
    expect(html).toContain("Trust her with the key.");
  });

  it("the entries newest first, the newest one marked as the one the next reply carries", () => {
    const html = render(char(), { entries: [entry("c2", "Chapter two", "Second.", 20), entry("c1", "Chapter one", "First.", 10)] });
    expect(count(html, 'data-testid="dash-journal-entry"')).toBe(2);
    expect(count(html, 'data-next="true"')).toBe(1);
    expect(html.indexOf("Chapter two")).toBeLessThan(html.indexOf("Chapter one"));
  });

  it("entries still loading or failed: no Entries section at all", () => {
    const html = render(char(), { entries: null });
    expect(count(html, "<section")).toBe(3); // the box, Right now, People
    expect(html).not.toContain('data-testid="dash-journal-entry"');
  });

  it("entries loaded and none: the Entries section with its empty line", () => {
    const html = render(char(), { entries: [] });
    expect(count(html, "<section")).toBe(4); // and Entries
    expect(html).not.toContain('data-testid="dash-journal-entry"');
  });
});

describe("the Journal box: off", () => {
  it("off shows one line and no sections", () => {
    const html = render(char({ thought: "Hidden.", thoughtTurn: 6, journal: [{ id: "p", about: "Bram", text: "x", by: "sensor", turn: 6 }] }), { journal: { ...on, on: false } });
    expect(html).toContain('data-testid="dash-journal-off"');
    expect(html).not.toContain('data-testid="dash-journal"');
    expect(html).not.toContain("Hidden.");
  });
});

describe("the journal's pure helpers", () => {
  it("journalEntries: this character's views only, newest chapter first, empty texts left out", () => {
    const chapters = [
      { id: "a", label: "Old", toNo: 4, at: 1, views: [{ who: "Aria", text: "Remembers the gate." }] },
      { id: "b", label: "New", toNo: 12, at: 2, views: [{ who: "Bram", text: "Not hers." }, { who: "Aria", text: " Kept the key. " }] },
      { id: "c", label: "Blank", toNo: 9, at: 3, views: [{ who: "Aria", text: "   " }] },
      { id: "d", label: "No views", toNo: 15, at: 4 },
    ] as unknown as Parameters<typeof journalEntries>[0];
    const out = journalEntries(chapters, "Aria");
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
    expect(out[0]!.text).toBe("Kept the key.");
    expect(journalEntries(null, "Aria")).toEqual([]);
  });

  it("journalOf: an older engine's view gets the defaults, a newer one its own values", () => {
    expect(journalOf({})).toEqual(DEFAULT_JOURNAL);
    expect(DEFAULT_JOURNAL).toEqual({ on: true, inject: true, thoughtTurns: 3, maxTokens: 120 });
    expect(journalOf({ journal: { on: false, inject: true, thoughtTurns: 5, maxTokens: 60 } })).toEqual({ on: false, inject: true, thoughtTurns: 5, maxTokens: 60 });
    expect(journalOf(null)).toEqual(DEFAULT_JOURNAL);
  });

  it("the journal sits in the prompt right after what characters said", () => {
    const part = (key: string) => ({ kind: "x", label: key, text: key, located: true, key });
    const parts = [part("history")];
    const spans = [{ msg: 0, start: 0, end: 5, part: 0 }];
    const board = ["plugin:journal", "plugin:said", "history"].map((key) => ({ item: { key } }));
    expect(requestOrder(board, parts, spans).map((r) => r.item.key)).toEqual(["history", "plugin:said", "plugin:journal"]);
  });
});
