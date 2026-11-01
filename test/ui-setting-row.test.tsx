// SettingRow, NumControl and Segmented (moved from components/world). Rendered to static markup: no DOM library here,
// so the click paths are checked by their markup (role, aria-checked, the button type) rather than by clicking.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SettingRow, NumControl, Segmented } = await import("../src/components/ui/setting-row");

describe("SettingRow", () => {
  it("renders the label and the control", () => {
    const html = renderToStaticMarkup(
      <SettingRow label="Changes per run">
        <span>CONTROL</span>
      </SettingRow>
    );
    expect(html).toContain("Changes per run");
    expect(html).toContain("CONTROL");
  });

  it("with info: an (i) button with an aria-label naming the row, and data-testid setting-info", () => {
    const html = renderToStaticMarkup(
      <SettingRow label="Temperature" info="Long explanation">
        <span>x</span>
      </SettingRow>
    );
    expect(html).toMatch(/<button[^>]*data-testid="setting-info"/);
    // the label text comes from i18n (en or uk, by the browser or the store), so match its shape
    expect(html).toMatch(/aria-label="(More about: |Докладніше: )Temperature"/);
  });

  it("without info: no (i)", () => {
    const html = renderToStaticMarkup(
      <SettingRow label="Temperature">
        <span>x</span>
      </SettingRow>
    );
    expect(html).not.toContain("setting-info");
  });

  it("status renders as a muted caption under the row", () => {
    const html = renderToStaticMarkup(
      <SettingRow label="Dice" status="Off in this chat">
        <span>x</span>
      </SettingRow>
    );
    expect(html).toContain("Off in this chat");
    expect(html).toContain("text-caption text-muted-foreground");
  });

  it("off dims the whole row (opacity-60), and a row that is on is not dimmed", () => {
    const off = renderToStaticMarkup(
      <SettingRow label="Dice" off status="Turn the DM on first">
        <span>x</span>
      </SettingRow>
    );
    expect(off).toMatch(/^<div class="flex flex-col opacity-60"/);
    const on = renderToStaticMarkup(
      <SettingRow label="Dice">
        <span>x</span>
      </SettingRow>
    );
    expect(on).toMatch(/^<div class="flex flex-col"/);
    expect(on).not.toContain("opacity-60");
  });

  it("rows pad themselves (px-4) and keep a 44 px minimum, 48 px on a phone", () => {
    const html = renderToStaticMarkup(
      <SettingRow label="Dice">
        <span>x</span>
      </SettingRow>
    );
    expect(html).toContain("px-4");
    expect(html).toContain("min-h-11");
    expect(html).toContain("max-md:min-h-12");
  });
});

describe("NumControl", () => {
  it("renders a number input with its value and aria-label", () => {
    const html = renderToStaticMarkup(<NumControl label="Max changes" value={8} min={1} max={20} onCommit={() => {}} />);
    expect(html).toMatch(/<input[^>]*type="number"/);
    expect(html).toMatch(/<input[^>]*value="8"/);
    expect(html).toMatch(/<input[^>]*aria-label="Max changes"/);
    expect(html).toContain("h-10 w-20");
    expect(html).toContain("md:h-8");
  });

  it("is disabled when asked", () => {
    const html = renderToStaticMarkup(<NumControl label="Max" value={8} min={1} max={20} disabled onCommit={() => {}} />);
    expect(html).toMatch(/<input[^>]*disabled=""/);
  });
});

describe("Segmented", () => {
  const options = [
    { id: "off" as const, label: "Off" },
    { id: "hint" as const, label: "Hint" },
    { id: "bind" as const, label: "Bind" },
  ];

  it("is a radiogroup with one radio per option, and aria-checked on the active one only", () => {
    const html = renderToStaticMarkup(<Segmented label="Dice" value="hint" options={options} onChange={() => {}} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Dice"');
    expect(html.match(/role="radio"/g)?.length).toBe(3);
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*>Hint<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-checked="false"[^>]*>Off<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-checked="false"[^>]*>Bind<\/button>/);
  });

  it("the active option has a border and a heavier weight, not only a shade", () => {
    const html = renderToStaticMarkup(<Segmented label="Dice" value="off" options={options} onChange={() => {}} />);
    const active = /<button[^>]*aria-checked="true"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(active.split(/\s+/)).toEqual(expect.arrayContaining(["ring-1", "ring-border", "font-medium", "shadow-sm", "bg-background", "text-body"]));
  });

  it("the options are real buttons (native click, Enter and Space)", () => {
    const html = renderToStaticMarkup(<Segmented label="Dice" value="off" options={options} onChange={() => {}} />);
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(3);
  });
});
