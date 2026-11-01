// FolderStrip, CardMarkers and MoveToFolderItems of the Characters list, rendered to static markup (no DOM
// library here). The words depend on the browser language, so the checks accept both the en and the uk text.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tag } from "../src/lib/types";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { CardMarkers, FolderStrip } = await import("../src/components/views/characters-list-parts");

const folder = (id: string, name: string, order: number): Tag => ({ id, name, color: "#000", textColor: "#fff", visible: true, asFolder: true, order });
const folders = [folder("f1", "Campaign", 0), folder("f2", "Noir", 1)];

const strip = (over: Partial<Parameters<typeof FolderStrip>[0]> = {}) => renderToStaticMarkup(
  <FolderStrip
    folders={folders}
    counts={new Map([["Campaign", 3], ["Noir", 1]])}
    total={9}
    favourites={2}
    unfiled={4}
    folder={null}
    unfiledOn={false}
    favOn={false}
    onFolder={() => {}}
    onUnfiled={() => {}}
    onFavourites={() => {}}
    onNew={() => {}}
    {...over}
  />,
);

describe("FolderStrip", () => {
  it("renders the block with All, Favourites, every folder with its count, No folder and New folder", () => {
    const html = strip();
    expect(html).toContain('data-testid="folder-strip"');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="folder-all"/);
    expect(html).toMatch(/data-testid="folder-favourites"/);
    expect(html).toMatch(/data-testid="folder-none"/);
    expect(html).toMatch(/data-testid="folder-new"/);
    expect(html.match(/data-testid="folder-chip"/g)?.length).toBe(2);
    expect(html).toContain("Campaign");
    expect(html).toContain("Noir");
    expect(html).toContain(">9<");
    expect(html).toContain(">4<");
  });

  it("is shown with no folder yet: the strip is always there, only the folder chips are missing", () => {
    const html = strip({ folders: [] });
    expect(html).toContain('data-testid="folder-strip"');
    expect(html).not.toContain('data-testid="folder-chip"');
    expect(html).toContain('data-testid="folder-new"');
  });

  it("the chosen folder is pressed and All is not; the dashed New folder chip is dashed", () => {
    const html = strip({ folder: "Noir" });
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="folder-chip"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="folder-all"/);
    expect(html).toMatch(/data-testid="folder-new"[^>]*class="[^"]*border-dashed/);
  });

  it("No folder and Favourites show their own pressed state", () => {
    expect(strip({ unfiledOn: true })).toMatch(/aria-pressed="true"[^>]*data-testid="folder-none"/);
    expect(strip({ favOn: true })).toMatch(/aria-pressed="true"[^>]*data-testid="folder-favourites"/);
  });
});

describe("CardMarkers", () => {
  it("the lorebook is an emerald chip with its word and the icon's label", () => {
    const html = renderToStaticMarkup(<CardMarkers lore sprites={false} />);
    expect(html).toMatch(/Lore|Лорбук/);
    expect(html).toContain("emerald");
    expect(html).toMatch(/aria-label="(Has a lorebook|Має лорбук)"/);
    expect(html).not.toContain("violet");
  });

  it("the sprites are a violet chip with its word and the icon's label", () => {
    const html = renderToStaticMarkup(<CardMarkers lore={false} sprites />);
    expect(html).toMatch(/Sprites|Спрайти/);
    expect(html).toContain("violet");
    expect(html).toMatch(/aria-label="(Has sprites|Має спрайти)"/);
    expect(html).not.toContain("emerald");
  });

  it("nothing is drawn for a card with neither", () => {
    expect(renderToStaticMarkup(<CardMarkers lore={false} sprites={false} />)).toBe("");
  });
});
