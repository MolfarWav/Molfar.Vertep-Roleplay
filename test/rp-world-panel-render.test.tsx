// SoFarTiles and DiceFields, rendered to static markup (no DOM library here): the tiles and their numbers, and the dice
// block with its fold only when the dice are on. The language is whatever the store says; the checks do not depend on it.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SoFarTiles } = await import("../src/components/world/world-so-far");
const { DiceFields } = await import("../src/components/world/dice-fields");

const base = { stat: "auto" as const, tilt: "even" as const, chance: 30, life: 10 };
const dice = (mode: "off" | "flavour" | "strict", extra: Partial<Parameters<typeof DiceFields>[0]> = {}) =>
  renderToStaticMarkup(
    <DiceFields mode={mode} {...base} onChange={() => {}} {...extra}>
      <p>ROLL LOG</p>
    </DiceFields>
  );

const kinds = { person: 12, place: 3, group: 2, thing: 0 };
const tiles = (extra: Partial<Parameters<typeof SoFarTiles>[0]> = {}) =>
  renderToStaticMarkup(<SoFarTiles kinds={kinds} notes={0} archive={0} runs={18} onOpen={() => {}} {...extra} />);
// the opening tag of a tile (a button for the kinds, the archive and the notes; a div for fronts and runs)
const tileTag = (html: string, id: string) => new RegExp(`<(?:button|div)[^>]*data-testid="tile-${id}"[^>]*>`).exec(html)?.[0] ?? "";

describe("SoFarTiles", () => {
  it("four type tiles in a row with their numbers, then the runs; each has an id for the test hook", () => {
    const html = tiles({ fronts: 3 });
    for (const id of ["person", "place", "group", "thing", "fronts", "runs"]) expect(html).toContain(`data-testid="tile-${id}"`);
    expect(html).toContain('data-testid="world-facts"');
    for (const n of [">12<", ">3<", ">2<", ">0<", ">18<"]) expect(html).toContain(n);
    expect(html).toContain("tabular-nums");
    expect(html).toContain("@sm:grid-cols-4");
  });

  it("the archive and the old notes show only while there is something; fronts only when the level has events", () => {
    const none = tiles();
    for (const id of ["archive", "fact", "fronts"]) expect(none).not.toContain(`data-testid="tile-${id}"`);
    const some = tiles({ archive: 5, notes: 2, fronts: 1 });
    for (const id of ["archive", "fact", "fronts"]) expect(some).toContain(`data-testid="tile-${id}"`);
  });

  it("a type tile is a button that says what it opens; a plain count is not a button", () => {
    const html = tiles({ fronts: 1 });
    expect(tileTag(html, "person")).toContain("<button");
    expect(tileTag(html, "person")).toContain("12");
    expect(html).toMatch(/aria-label="[^"]*12[^"]*"/);
    expect(tileTag(html, "runs").startsWith("<div")).toBe(true);
    expect(tileTag(html, "fronts").startsWith("<div")).toBe(true);
  });

  it("a type with no records is dimmed, not hidden", () => {
    const html = tiles();
    expect(tileTag(html, "thing")).toContain("opacity-60");
    expect(tileTag(html, "person")).not.toContain("opacity-60");
  });

  it("each type has its own tone, fronts are orange and runs neutral", () => {
    const html = tiles({ fronts: 1, archive: 1, notes: 1 });
    expect(tileTag(html, "person")).toContain("pink");
    expect(tileTag(html, "place")).toContain("teal");
    expect(tileTag(html, "group")).toContain("violet");
    expect(tileTag(html, "thing")).toContain("amber");
    expect(tileTag(html, "fact")).toContain("sky");
    expect(tileTag(html, "archive")).toContain("slate");
    expect(tileTag(html, "fronts")).toContain("orange");
    expect(tileTag(html, "runs")).not.toContain("sky");
    expect(tileTag(html, "runs")).not.toContain("pink");
  });
});

describe("DiceFields", () => {
  it("off: the mode radio group with Off checked, the explanation, and no details fold", () => {
    const html = dice("off");
    expect(html).toContain('data-testid="dice-options"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>[^<]*/);
    expect(html).toContain('data-testid="dice-mode-hint"');
    expect(html).not.toContain('data-testid="fold-dice-details"');
    expect(html).not.toContain("ROLL LOG");
  });

  it("on: the details fold is there (closed, with its summary) and the roll log follows it", () => {
    const html = dice("flavour");
    expect(html).toContain('data-testid="fold-dice-details"');
    expect(html).toMatch(/data-testid="fold-dice-details"/);
    expect(html).toContain("30%");
    expect(html).toContain("ROLL LOG");
    const radios = [...html.matchAll(/role="radio"[^>]*aria-checked="(true|false)"/g)].map((m) => m[1]);
    expect(radios).toEqual(["false", "true", "false"]);
  });

  it("the picked mode is the one aria-checked (strict = the third button)", () => {
    const html = dice("strict");
    const radios = [...html.matchAll(/role="radio"[^>]*aria-checked="(true|false)"/g)].map((m) => m[1]);
    expect(radios).toEqual(["false", "false", "true"]);
  });

  it("disabled: every radio button is disabled", () => {
    const html = dice("flavour", { disabled: true });
    const buttons = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b).toContain("disabled");
  });
});
