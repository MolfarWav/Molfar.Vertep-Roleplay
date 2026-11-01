// The Lorebooks chips, the entry row and the Rules tab, rendered to static markup (no DOM library here). Text is
// checked in both languages, since the language comes from the browser or the store.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { FilterChip } = await import("../src/components/lore/filter-chip");
const { EntryRowHead } = await import("../src/components/lore/entry-row-head");
const { BookSettings } = await import("../src/components/lore/book-settings");
const { BookUsedBy } = await import("../src/components/lore/book-used-by");
const { t } = await import("../src/lib/i18n");
type Lore = import("../src/lib/types").Lorebook;
type Entry = import("../src/lib/types").LoreEntry;

/** the text in either language: the store picks the language, the test does not */
const either = (key: Parameters<typeof t>[0]) => [t(key, "en"), t(key, "uk")];
const hasEither = (html: string, key: Parameters<typeof t>[0]) => either(key).some((s) => html.includes(s));

const settings = {
  scanDepth: 6, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2, insertionStrategy: "character_first",
  caseSensitive: false, wholeWords: true, groupScoring: false, recursiveScan: false, includeNames: true, overflowAlert: true,
  wordForms: true, minActivationsDepthMax: 0,
} as unknown as Lore["settings"];
const book = (over: Partial<Lore> = {}) => ({ id: "b1", name: "Book", globalActive: false, linkedCharacterIds: [], entries: [], settings, formatTemplate: "", ...over }) as unknown as Lore;

describe("filter chips", () => {
  it("a chip is a toggle: aria-pressed, its label and its count", () => {
    const html = renderToStaticMarkup(<FilterChip pressed onClick={() => {}} count={3}>Always on</FilterChip>);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"/);
    expect(html).toContain("Always on");
    expect(html).toContain(">3<");
    expect(html).toContain("font-semibold");
  });

  it("an unpressed chip says so and is 40 px tall on a phone", () => {
    const html = renderToStaticMarkup(<FilterChip pressed={false} onClick={() => {}}>On</FilterChip>);
    expect(html).toMatch(/aria-pressed="false"/);
    expect(html).toContain("max-md:h-10");
  });
});

describe("entry row", () => {
  const base = { id: "e1", title: "Smuggler routes", keys: [] as string[], content: "some text", status: "normal", enabled: true, position: "after_char", depth: 4, order: 100, probability: 100, sticky: 0, cooldown: 0, delay: 0, delayUntilRecursion: false, characterFilter: [], tagFilter: [], triggerFilters: [], group: "" } as unknown as Entry;
  const row = (e: Entry) => renderToStaticMarkup(<EntryRowHead e={e} open={false} selecting={false} checked={false} onCheck={() => {}} onToggle={() => {}} onEnable={() => {}} />);

  it("a keyed entry without keys shows the plain warning, not a tiny red word", () => {
    const html = row(base);
    expect(hasEither(html, "lore.needsKeys")).toBe(true);
    expect(html).not.toContain("text-destructive");
  });

  it("an entry with keys shows them and no warning", () => {
    const html = row({ ...base, keys: ["tide", "low water"] } as Entry);
    expect(html).toContain("tide");
    expect(hasEither(html, "lore.needsKeys")).toBe(false);
  });

  it("the status chip carries the status word of the entry", () => {
    const html = row({ ...base, status: "constant", keys: [] } as unknown as Entry);
    expect(either("lore.status.constant").some((s) => html.includes(s))).toBe(true);
    expect(hasEither(html, "lore.needsKeys")).toBe(false);
  });

  it("the switch is named after the entry", () => {
    const html = row({ ...base, keys: ["x"] } as Entry);
    expect(html).toContain("Smuggler routes");
    expect(html).toMatch(/role="switch"/);
  });
});

describe("Rules tab", () => {
  it("four task cards, each with its heading", () => {
    const html = renderToStaticMarkup(<BookSettings book={book()} onUpdate={() => {}} />);
    for (const key of ["lore.rules.reads", "lore.rules.fits", "lore.rules.order", "lore.rules.wrapper"] as const) {
      expect(hasEither(html, key)).toBe(true);
    }
    expect(html).toContain('data-variant="tinted"');
  });

  it("the max recursion row is dimmed and says why while recursive scan is off", () => {
    const off = renderToStaticMarkup(<BookSettings book={book()} onUpdate={() => {}} />);
    expect(off).toMatch(/opacity-60/);
    expect(hasEither(off, "lore.set.recursionOff")).toBe(true);
    const on = renderToStaticMarkup(<BookSettings book={book({ settings: { ...settings, recursiveScan: true } as Lore["settings"] })} onUpdate={() => {}} />);
    expect(hasEither(on, "lore.set.recursionOff")).toBe(false);
  });

  it("insertion strategy is a three-way choice, a radio group", () => {
    const html = renderToStaticMarkup(<BookSettings book={book()} onUpdate={() => {}} />);
    expect(html.match(/role="radio"/g)?.length).toBe(3);
  });

  it("a template without the entry placeholder warns, one with it does not", () => {
    const bad = renderToStaticMarkup(<BookSettings book={book({ formatTemplate: "Lore: text" })} onUpdate={() => {}} />);
    expect(hasEither(bad, "lore.set.formatMissing")).toBe(true);
    const good = renderToStaticMarkup(<BookSettings book={book({ formatTemplate: "[Lore: {{original}}]" })} onUpdate={() => {}} />);
    expect(hasEither(good, "lore.set.formatMissing")).toBe(false);
  });

  it("keeps the data-testid of the old block", () => {
    const html = renderToStaticMarkup(<BookSettings book={book()} onUpdate={() => {}} />);
    expect(html).toContain('data-testid="book-settings"');
  });
});

describe("Used by tab", () => {
  it("no card: the empty line, not a list", () => {
    const html = renderToStaticMarkup(<BookUsedBy bookId="b1" characters={[]} />);
    expect(hasEither(html, "lore.usedBy.empty")).toBe(true);
    expect(html).not.toContain("<ul");
  });
});
