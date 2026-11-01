// The entry panel, rendered to static markup (no DOM library here): the always-visible part, the five sibling folds with
// their summaries, the key chips and the row that says which entry the panel shows. Clicks and Escape are checked by
// their markup (the aria, the button types), not by running them.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { EntryEditor } = await import("../src/components/lore/entry-editor");
const { EntryRowHead } = await import("../src/components/lore/entry-row-head");
const { KeyChips } = await import("../src/components/lore/key-chips");
const { t } = await import("../src/lib/i18n");
type Entry = import("../src/lib/types").LoreEntry;

/** the text in either language: the store picks the language, the test does not */
const either = (key: Parameters<typeof t>[0]) => [t(key, "en"), t(key, "uk")];
const hasEither = (html: string, key: Parameters<typeof t>[0]) => either(key).some((s) => html.includes(s));

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "e1", title: "Smuggler routes", memo: "", keys: ["tide"], keysRegex: false, secondaryKeys: [], logic: "AND_ANY",
  status: "normal", content: "Three routes run through the old quarter.", position: "after_char", depth: 4, role: "system",
  order: 100, probability: 100, useProbability: false, group: "", groupWeight: 100, groupPrioritize: false, sticky: 0,
  cooldown: 0, delay: 0, enabled: true, characterFilter: [], characterFilterExclude: false, tagFilter: [], triggerFilters: [],
  nonRecursable: false, preventFurtherRecursion: false, delayUntilRecursion: false, ignoreBudget: false,
  scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null, wordFormsOverride: null,
  groupScoringOverride: null, automationId: "", matchSources: { description: false, personality: false, scenario: false, persona: false },
  ...over,
} as unknown as Entry);

const noop = () => {};

/** Renders `render` with one fold remembered as open (localStorage `rp.fold.<id>` = "1"), then puts the storage back. */
function withOpenFold<T>(id: string, render: () => T): T {
  const g = globalThis as unknown as { localStorage?: unknown };
  const had = "localStorage" in g;
  const prev = g.localStorage;
  g.localStorage = { getItem: (k: string) => (k === `rp.fold.${id}` ? "1" : null), setItem: () => {}, removeItem: () => {} };
  try {
    return render();
  } finally {
    if (had) g.localStorage = prev;
    else delete g.localStorage;
  }
}
const panel = (e: Entry) => renderToStaticMarkup(
  <EntryEditor entry={e} onChange={noop} onDelete={noop} onDuplicate={noop} onCopyToBook={noop} onClose={noop} />,
);

describe("entry panel", () => {
  it("is a non-modal dialog named after the entry panel, with the title inline", () => {
    const html = panel(entry());
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');
    expect(hasEither(html, "lore.ed.panel")).toBe(true);
    expect(html).toContain('value="Smuggler routes"');
  });

  it("has a Close button and a More menu trigger, each named", () => {
    const html = panel(entry());
    expect(hasEither(html, "lore.ed.close")).toBe(true);
    expect(html).toMatch(/aria-haspopup="menu"/);
    expect(hasEither(html, "lore.ed.menu")).toBe(true);
  });

  it("the always-visible part is content, When it appears (three choices) and keys, in that order", () => {
    const html = panel(entry());
    const content = html.indexOf(t("lore.ed.content", "en"));
    const appears = html.indexOf(t("lore.ed.appears", "en"));
    const keys = html.indexOf(t("lore.ed.keys", "en"));
    const where = html.indexOf(t("lore.ed.where", "en"));
    expect(content).toBeGreaterThan(-1);
    expect(appears).toBeGreaterThan(content);
    expect(keys).toBeGreaterThan(appears);
    expect(where).toBeGreaterThan(keys);
    expect(html.match(/role="radio"[^>]*aria-checked="true"/g)?.length).toBeGreaterThan(0);
  });

  it("When it appears is a radio group of three, with the status word of the current entry checked", () => {
    const html = panel(entry({ status: "constant" }));
    expect(html).toMatch(new RegExp(`aria-label="${t("lore.ed.appears", "en")}"`));
    const radios = html.match(/<button[^>]*role="radio"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(radios.length).toBeGreaterThanOrEqual(3);
    const checked = radios.find((r) => r.includes('aria-checked="true"'));
    expect(checked).toContain(t("lore.status.constant", "en"));
  });

  it("the no-keys warning shows for a When-mentioned entry without keys, and not otherwise", () => {
    expect(hasEither(panel(entry({ keys: [] })), "lore.ed.noKeysWarn")).toBe(true);
    expect(hasEither(panel(entry({ keys: [], status: "constant" })), "lore.ed.noKeysWarn")).toBe(false);
  });

  it("the token count is shown next to the content", () => {
    const html = panel(entry());
    expect(html).toMatch(/\d+ tokens|\d+ токенів/);
  });
});

describe("the five folds", () => {
  it("are five sibling folds, each with its own id, and none inside another", () => {
    const html = panel(entry());
    const folds = html.match(/data-slot="fold"/g) ?? [];
    expect(folds.length).toBe(5);
    for (const id of ["lore-entry-where", "lore-entry-only-when", "lore-entry-stays", "lore-entry-groups", "lore-entry-match"]) {
      expect(html).toContain(`data-testid="fold-${id}"`);
    }
  });

  it("each fold shows its summary while closed: the default lines of an entry", () => {
    const html = panel(entry());
    expect(html).toContain("after char");
    expect(html).toContain("no second keys");
    expect(html).toContain("no sticky");
    expect(html).toContain("no group");
    expect(html).toContain("book defaults");
  });

  it("the fold titles are the five names of the brief", () => {
    const html = panel(entry());
    for (const key of ["lore.ed.where", "lore.ed.onlyWhen", "lore.ed.stays", "lore.ed.groupsChains", "lore.ed.matchKeys"] as const) {
      expect(hasEither(html, key)).toBe(true);
    }
  });

  it("Chance is named once, inside the Only when fold, and nowhere else", () => {
    const chance = t("lore.ed.trigger", "en");
    expect(chance).toBe("Chance");
    // closed: no fold body is rendered, so no Chance field is on the page
    expect(panel(entry()).split(chance).length - 1).toBe(0);
    // open (its remembered state is "1"): the field is there, exactly once
    const open = withOpenFold("lore-entry-only-when", () => panel(entry()));
    expect(open.split(`>${chance}<`).length - 1).toBe(1);
  });

  it("the position summary shows the depth and the role only where the position is At depth", () => {
    const html = panel(entry({ position: "at_depth", depth: 6, role: "user" }));
    expect(html).toContain("@6 depth");
    expect(html).toContain(t("lore.ed.role.user", "en"));
    expect(panel(entry()).split(t("lore.ed.role.user", "en")).length - 1).toBe(0);
  });
});

describe("the entry row", () => {
  const base = entry();
  const row = (open: boolean) => renderToStaticMarkup(
    <EntryRowHead e={base} open={open} selecting={false} checked={false} onCheck={noop} onToggle={noop} onEnable={noop} />,
  );

  it("opens a dialog: aria-haspopup dialog, aria-expanded says whether the panel shows it", () => {
    expect(row(true)).toMatch(/aria-haspopup="dialog"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*aria-haspopup="dialog"/);
    expect(row(false)).toMatch(/aria-expanded="false"/);
  });
});

describe("key chips", () => {
  const chips = (keys: string[]) => renderToStaticMarkup(
    <KeyChips keys={keys} onChange={noop} label="Keys" placeholder="Type a word" />,
  );

  it("each key is a chip with a remove button named after it", () => {
    const html = chips(["tide", "low water"]);
    expect(html).toContain("tide");
    expect(html).toContain("low water");
    expect(html).toMatch(/aria-label="(Remove tide|Прибрати: tide)"/);
    expect(html).toMatch(/aria-label="(Remove low water|Прибрати: low water)"/);
  });

  it("the input carries the field's name and hides its placeholder once there are keys", () => {
    expect(chips([])).toContain('placeholder="Type a word"');
    expect(chips(["tide"])).not.toContain('placeholder="Type a word"');
  });
});
