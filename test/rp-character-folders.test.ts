import { describe, expect, it } from "bun:test";
import { folderCounts, folderTags, inFolder, moveToFolder, noFolder, removeFromFolder, resolveFolder } from "../src/lib/character-folders";
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

describe("folder membership", () => {
  const folders = folderTags(tags); // campaign, often used

  it("a card with no folder tag is under No folder; a tag that is not a folder does not count", () => {
    expect(noFolder({ tags: [] }, folders)).toBe(true);
    expect(noFolder({ tags: ["noir"] }, folders)).toBe(true);
    expect(noFolder({ tags: ["noir", "campaign"] }, folders)).toBe(false);
    expect(cards.filter((c) => noFolder(c, folders)).length).toBe(1);
  });

  it("moving to a folder adds its tag and keeps the card's other folders", () => {
    expect(moveToFolder(["noir"], "campaign", folders)).toEqual(["noir", "campaign"]);
    expect(moveToFolder(["campaign"], "often used", folders)).toEqual(["campaign", "often used"]);
  });

  it("moving to a folder the card is already in does not double the tag", () => {
    expect(moveToFolder(["campaign"], "campaign", folders)).toEqual(["campaign"]);
  });

  it("No folder (null) takes every folder tag off and leaves the other tags", () => {
    expect(moveToFolder(["campaign", "noir", "often used"], null, folders)).toEqual(["noir"]);
    expect(moveToFolder([], null, folders)).toEqual([]);
  });

  it("removing from one folder leaves the card in its other folders", () => {
    expect(removeFromFolder(["campaign", "often used"], "campaign")).toEqual(["often used"]);
    expect(removeFromFolder(["noir"], "campaign")).toEqual(["noir"]);
  });

  it("the helpers return new arrays and leave the card's tags as they were", () => {
    const own = ["campaign", "noir"];
    moveToFolder(own, null, folders);
    removeFromFolder(own, "campaign");
    moveToFolder(own, "often used", folders);
    expect(own).toEqual(["campaign", "noir"]);
  });
});
