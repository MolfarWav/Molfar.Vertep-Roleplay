// #184 P4: a lie in the Said list shows who still takes it as true, with one button per name to say they know the
// truth now. A lie that is still covered shows nothing of it (no spoiler). Static markup; data attributes and counts.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashChar, SaidNote } from "../src/lib/dashboard";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SaidBlock } = await import("../src/components/dashboard/dash-said");

const lie = (over: Partial<SaidNote> = {}): SaidNote => ({ id: "s1", text: "The debt is paid.", kind: "lie", hidden: true, turn: 3, source: "chat", ...over });
const char = (said: SaidNote[], editable = true) =>
  ({ cls: "ally", name: null, notebook: [], history: [], series: [], said, ...(editable ? { saidRemoved: [] } : {}) }) as unknown as DashChar;
const render = (c: DashChar) => renderToStaticMarkup(<SaidBlock name="Aria" char={c} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("believers of a lie in the Said list (#184 P4)", () => {
  it("a covered lie shows nothing of who believes it", () => {
    const html = render(char([lie({ believers: ["Bram"] })]));
    expect(html).not.toContain('data-testid="dash-said-believers"');
    expect(html).not.toContain("Bram");
  });

  it("an open lie lists each believer as a button of its own, with a label that says what it does", () => {
    const html = render(char([lie({ hidden: false, believers: ["Bram", "Cora"] })]));
    expect(html).toContain('data-testid="dash-said-believers"');
    expect(count(html, "<button")).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Bram");
    expect(html).toContain("Cora");
    expect(html).toContain('aria-label="Bram knows the truth now"');
  });

  it("no believers, or an older plugin that cannot edit: no row", () => {
    expect(render(char([lie({ hidden: false })]))).not.toContain('data-testid="dash-said-believers"');
    expect(render(char([lie({ hidden: false, believers: ["Bram"] })], false))).not.toContain('data-testid="dash-said-believers"');
  });
});

describe("the lie toggle in the row menu (#184 P4)", () => {
  it("is part of the markup as a menu item only through the menu, so the row itself still renders for a user-marked lie", () => {
    const html = render(char([lie({ hidden: false, userLie: true, believers: ["Bram"] })]))
    expect(html).toContain('data-testid="dash-said-believers"')
  })
})
