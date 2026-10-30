import { describe, expect, it } from "bun:test";
import { folderCounts, folderTags, inFolder, resolveFolder } from "../src/lib/character-folders";
import type { Tag } from "../src/lib/types";

const tag = (name: string, order: number, asFolder: boolean): Tag => ({ id: name, name, color: "#000", textColor: "#fff", visible: true, asFolder, order });
const tags = [tag("often used", 2, true), tag("campaign", 0, true), tag("noir", 1, false), tag("  ", 3, true)];
const cards = [
  { tags: ["campaign", "noir"] },
  { tags: ["campaign", "often used"] },
  { tags: ["often used", "often used"] },
  { tags: [] },
];

describe("character folders", () => {
  it("only tags marked as folders, in the manager's order", () => {
    expect(folderTags(tags).map((t) => t.name)).toEqual(["campaign", "often used"]);
  });

  it("a card sits in every folder it has a tag for; All hides nothing", () => {
    const folders = folderTags(tags);
    expect(cards.filter((c) => inFolder(c, "campaign")).length).toBe(2);
    expect(cards.filter((c) => inFolder(c, "often used")).length).toBe(2);
    expect(cards.filter((c) => inFolder(c, null)).length).toBe(cards.length);
    expect(inFolder(cards[1]!, "campaign") && inFolder(cards[1]!, "often used")).toBe(true);
    expect([...folderCounts(cards, folders)]).toEqual([["campaign", 2], ["often used", 2]]);
  });

  it("a folder that is no longer one resets the choice to All", () => {
    const folders = folderTags(tags);
    expect(resolveFolder("campaign", folders)).toBe("campaign");
    expect(resolveFolder("noir", folders)).toBeNull();
    expect(resolveFolder("campaign", folderTags(tags.map((t) => ({ ...t, asFolder: false }))))).toBeNull();
    expect(resolveFolder(null, folders)).toBeNull();
  });
});
