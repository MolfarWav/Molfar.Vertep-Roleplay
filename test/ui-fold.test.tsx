// Fold: a foldable settings block. There is no DOM library in this repo, so these render to static markup. A click
// cannot be simulated here, but the trigger is a real <button> (base-ui Collapsible.Trigger), so click, Enter and
// Space open it natively; the tests check the markup and the stored state the click would write.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Fold, foldNestingMessage, readFoldOpen, writeFoldOpen } = await import("../src/components/ui/fold");
const { TONES } = await import("../src/components/ui/tone");

/** A Map-backed localStorage, installed for one test and removed after it. */
function fakeStorage(): Map<string, string> {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  };
  return map;
}

const g = globalThis as unknown as { localStorage?: unknown };
let hadStorage = false;
let prevStorage: unknown;
beforeEach(() => {
  hadStorage = "localStorage" in g;
  prevStorage = g.localStorage;
});
afterEach(() => {
  if (hadStorage) g.localStorage = prevStorage;
  else delete g.localStorage;
});

const BODY = "Body text inside the fold";
const page = (props: Partial<Parameters<typeof Fold>[0]> = {}) =>
  renderToStaticMarkup(
    <Fold id="limits" title="Limits" summary="800 characters" {...props}>
      <p>{BODY}</p>
    </Fold>
  );

/** The opening tag of the fold's root element, to read its classes. */
const rootTag = (html: string, id: string) => new RegExp(`<div[^>]*data-testid="fold-${id}"[^>]*>`).exec(html)?.[0] ?? "";
const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1] ?? "";

describe("Fold", () => {
  it("is closed by default: aria-expanded false, the summary shown, the content not rendered", () => {
    fakeStorage();
    const html = page();
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).toContain("800 characters");
    expect(html).toContain("Limits");
    expect(html).not.toContain(BODY);
    expect(html).toContain('data-testid="fold-limits"');
    expect(html).toContain('data-slot="fold"');
  });

  it("opens with defaultOpen: aria-expanded true, the summary hidden, the content rendered", () => {
    fakeStorage();
    const html = page({ defaultOpen: true });
    expect(html).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(html).not.toContain("800 characters");
    expect(html).toContain(BODY);
  });

  it("a stored '1' beats defaultOpen=false (what a remount reads after a toggle)", () => {
    const store = fakeStorage();
    store.set("rp.fold.limits", "1");
    const html = page({ defaultOpen: false });
    expect(html).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(html).toContain(BODY);
  });

  it("a stored '0' beats defaultOpen=true", () => {
    const store = fakeStorage();
    store.set("rp.fold.limits", "0");
    const html = page({ defaultOpen: true });
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).not.toContain(BODY);
  });

  it("a stored value of another fold does not leak in", () => {
    const store = fakeStorage();
    store.set("rp.fold.other", "1");
    expect(page({ defaultOpen: false })).toMatch(/<button[^>]*aria-expanded="false"/);
  });

  it("a throwing localStorage does not crash and falls back to defaultOpen", () => {
    (g as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    };
    expect(() => page({ defaultOpen: true })).not.toThrow();
    expect(page({ defaultOpen: true })).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(page({ defaultOpen: false })).toMatch(/<button[^>]*aria-expanded="false"/);
  });

  it("a missing localStorage (no global at all) falls back to defaultOpen", () => {
    delete g.localStorage;
    expect(page({ defaultOpen: true })).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(page()).toMatch(/<button[^>]*aria-expanded="false"/);
  });

  it("readFoldOpen and writeFoldOpen round-trip through rp.fold.<id> as '1' and '0'", () => {
    const store = fakeStorage();
    expect(readFoldOpen("dice", true)).toBe(true);
    expect(readFoldOpen("dice", false)).toBe(false);
    writeFoldOpen("dice", true);
    expect(store.get("rp.fold.dice")).toBe("1");
    expect(readFoldOpen("dice", false)).toBe(true);
    writeFoldOpen("dice", false);
    expect(store.get("rp.fold.dice")).toBe("0");
    expect(readFoldOpen("dice", true)).toBe(false);
  });

  it("writeFoldOpen does not throw when storage is missing or throws", () => {
    delete g.localStorage;
    expect(() => writeFoldOpen("x", true)).not.toThrow();
    (g as { localStorage?: unknown }).localStorage = { setItem: () => { throw new Error("full"); } };
    expect(() => writeFoldOpen("x", true)).not.toThrow();
  });

  it("draws a tone square only with a tone", () => {
    fakeStorage();
    const square = `class="size-2.5 shrink-0 rounded-sm ${TONES.sky.square}"`;
    expect(page({ tone: "sky" })).toContain(square);
    expect(page()).not.toContain("size-2.5 shrink-0 rounded-sm");
  });

  it("draws the icon in the tone's ink, muted without a tone", () => {
    fakeStorage();
    const Icon = (props: { className?: string; "aria-hidden"?: string }) => <svg data-icon="yes" className={props.className} aria-hidden={props["aria-hidden"]} />;
    const withTone = renderToStaticMarkup(<Fold id="ic" title="T" tone="violet" icon={Icon as never}><p>x</p></Fold>);
    expect(withTone).toContain('data-icon="yes"');
    expect(withTone).toContain(TONES.violet.ink.split(" ")[0]!);
    const plain = renderToStaticMarkup(<Fold id="ic2" title="T" icon={Icon as never}><p>x</p></Fold>);
    expect(plain).toContain("text-muted-foreground");
  });

  it("shows the count pill only when the count is above zero", () => {
    fakeStorage();
    expect(page({ count: 3 })).toContain(">3</span>");
    expect(page({ count: 0 })).not.toContain("tabular-nums");
    expect(page()).not.toContain("tabular-nums");
  });

  it("the caret is in the foreground colour, and turns when open", () => {
    fakeStorage();
    expect(page()).toContain("text-foreground");
    expect(page()).not.toContain("rotate-180");
    expect(page({ defaultOpen: true })).toContain("rotate-180");
  });

  it("the box has its own border, radius and fill by default", () => {
    fakeStorage();
    const cls = classOf(rootTag(page(), "limits"));
    expect(cls).toContain("rounded-xl");
    expect(cls).toContain("bg-card");
    expect(cls.split(/\s+/)).toContain("border");
  });

  it("flat has no box of its own: no border, radius or card fill, only the top hairline", () => {
    fakeStorage();
    const cls = classOf(rootTag(page({ flat: true }), "limits"));
    const tokens = cls.split(/\s+/);
    expect(tokens).not.toContain("border");
    expect(tokens).not.toContain("rounded-xl");
    expect(tokens).not.toContain("bg-card");
    expect(tokens).not.toContain("overflow-hidden");
    expect(cls).toContain("border-t");
  });

  it("the nesting message names both folds, and nothing is said for a top-level fold", () => {
    expect(foldNestingMessage("dice", null)).toBeNull();
    expect(foldNestingMessage("dice", "limits")).toBe("Fold inside Fold (dice in limits): flatten it");
  });

  it("a fold inside a fold still renders both (the warning is an effect, not in the markup)", () => {
    fakeStorage();
    const html = renderToStaticMarkup(
      <Fold id="outer" title="Outer" defaultOpen>
        <Fold id="inner" title="Inner" defaultOpen>
          <p>{BODY}</p>
        </Fold>
      </Fold>
    );
    expect(html).toContain('data-testid="fold-outer"');
    expect(html).toContain('data-testid="fold-inner"');
    expect(html).toContain(BODY);
  });
});
