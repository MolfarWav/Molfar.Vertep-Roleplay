// NumTile (components/ui/setting-row.tsx) and ToggleChip (components/ui/toggle-chip.tsx), rendered to static markup.
// No DOM library here, so clicks are not simulated: the markup carries the roles, aria attributes and button types.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { NumTile } = await import("../src/components/ui/setting-row");
const { ToggleChip } = await import("../src/components/ui/toggle-chip");

const inputTag = (html: string) => /<input[^>]*>/.exec(html)?.[0] ?? "";
const buttonTag = (html: string) => /<button[^>]*>/.exec(html)?.[0] ?? "";

describe("NumTile", () => {
  it("shows the label", () => {
    const html = renderToStaticMarkup(<NumTile label="Note age" value={50} min={5} max={500} onCommit={() => {}} />);
    expect(html).toContain("Note age");
  });

  it("shows the hint under the label when one is given", () => {
    const html = renderToStaticMarkup(
      <NumTile label="Note age" hint="5 to 500" value={50} min={5} max={500} onCommit={() => {}} />
    );
    expect(html).toContain("5 to 500");
    expect(html).toContain("text-caption text-muted-foreground");
  });

  it("has no hint line when none is given", () => {
    const html = renderToStaticMarkup(<NumTile label="Note age" value={50} min={5} max={500} onCommit={() => {}} />);
    expect(html).not.toContain("text-caption");
  });

  it("with info: an (i) button with data-testid setting-info and an aria-label naming the tile", () => {
    const html = renderToStaticMarkup(
      <NumTile label="Note age" info="Long explanation" value={50} min={5} max={500} onCommit={() => {}} />
    );
    expect(html).toMatch(/<button[^>]*data-testid="setting-info"/);
    // the label text comes from i18n (en or uk, by the browser or the store), so match its shape
    expect(html).toMatch(/aria-label="(More about: |Докладніше: )Note age"/);
  });

  it("without info: no (i)", () => {
    const html = renderToStaticMarkup(<NumTile label="Note age" value={50} min={5} max={500} onCommit={() => {}} />);
    expect(html).not.toContain("setting-info");
  });

  it("the input is a number field with its value and its aria-label equal to the label", () => {
    const html = renderToStaticMarkup(<NumTile label="Note age" value={50} min={5} max={500} onCommit={() => {}} />);
    const input = inputTag(html);
    expect(input).toMatch(/type="number"/);
    expect(input).toMatch(/value="50"/);
    expect(input).toContain('aria-label="Note age"');
  });

  it("disabled makes the input disabled and dims the tile", () => {
    const html = renderToStaticMarkup(
      <NumTile label="Note age" value={50} min={5} max={500} disabled onCommit={() => {}} />
    );
    expect(inputTag(html)).toMatch(/\sdisabled=""/);
    expect(html).toMatch(/<div[^>]*data-slot="num-tile"[^>]*opacity-60/);
  });

  it("not disabled: the input is not disabled and the tile is not dimmed", () => {
    const html = renderToStaticMarkup(<NumTile label="Note age" value={50} min={5} max={500} onCommit={() => {}} />);
    expect(inputTag(html)).not.toMatch(/\sdisabled=""/);
    expect(html).not.toContain("opacity-60");
  });
});

describe("ToggleChip", () => {
  it("pressed: aria-pressed true, a check icon (svg), and the children", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).toContain('aria-pressed="true"');
    expect(html).toContain("<svg");
    expect(html).toContain("Group A");
  });

  it("not pressed: aria-pressed false and no check icon", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed={false} onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).toContain('aria-pressed="false"');
    expect(html).not.toContain("<svg");
    expect(html).toContain("Group A");
  });

  it("is a button of type button", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed={false} onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).toMatch(/^<button type="button"/);
  });

  it("disabled is passed through to the button", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed={false} disabled onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).toMatch(/\sdisabled=""/);
  });

  it("not disabled by default", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed={false} onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).not.toMatch(/\sdisabled=""/);
  });

  it("pressed uses the tone's chip fill (violet here), not the outline", () => {
    const html = renderToStaticMarkup(
      <ToggleChip pressed tone="violet" onPressedChange={() => {}}>
        Group A
      </ToggleChip>
    );
    expect(buttonTag(html)).toContain("bg-violet-500/12");
  });
});
