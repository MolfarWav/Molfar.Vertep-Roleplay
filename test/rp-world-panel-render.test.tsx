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

describe("SoFarTiles", () => {
  it("four tiles with their numbers, each with an id for the test hook", () => {
    const html = renderToStaticMarkup(<SoFarTiles records={12} retired={2} fronts={3} runs={18} />);
    for (const id of ["records", "retired", "fronts", "runs"]) expect(html).toContain(`data-testid="tile-${id}"`);
    expect(html).toContain('data-testid="world-facts"');
    expect(html).toContain(">12<");
    expect(html).toContain(">2<");
    expect(html).toContain(">3<");
    expect(html).toContain(">18<");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("grid-cols-2 @sm:grid-cols-4");
  });

  it("without fronts (no events at this level) there are three tiles and no fronts tile", () => {
    const html = renderToStaticMarkup(<SoFarTiles records={4} retired={0} runs={1} />);
    expect(html).not.toContain('data-testid="tile-fronts"');
    expect(html).toContain('data-testid="tile-records"');
    expect(html).toContain("grid-cols-3");
  });

  it("the tiles take their tones: records emerald, fronts pink, runs sky", () => {
    const html = renderToStaticMarkup(<SoFarTiles records={1} retired={1} fronts={1} runs={1} />);
    const tile = (id: string) => new RegExp(`<div[^>]*data-testid="tile-${id}"[^>]*>`).exec(html)?.[0] ?? "";
    expect(tile("records")).toContain("emerald");
    expect(tile("fronts")).toContain("pink");
    expect(tile("runs")).toContain("sky");
    expect(tile("retired")).toContain("slate");
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
