// Entry folders: the pure logic, the way a folder rides the book file (old files read as before, an unknown value is
// kept clean, the prompt engine's fields do not change), and the tree on the Entries tab.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const F = await import("../src/lib/lore-folders");
const { lorebookToEngine, engineLorebookToUI } = await import("../src/lib/engine");
const { EntryTree, visibleEntries } = await import("../src/components/lore/entry-tree");
type Entry = import("../src/lib/types").LoreEntry;

const entry = (id: string, over: Partial<Entry> = {}) => ({
  id, uid: Number(id.slice(1)), title: id, memo: "", keys: ["k"], keysRegex: false, secondaryKeys: [], logic: "AND_ANY", status: "normal",
  content: "some text here", position: "after_char", depth: 4, role: "system", order: 100, probability: 100, useProbability: false,
  group: "", groupWeight: 100, groupPrioritize: false, sticky: 0, cooldown: 0, delay: 0, enabled: true, characterFilter: [],
  characterFilterExclude: false, tagFilter: [], triggerFilters: [], nonRecursable: false, preventFurtherRecursion: false,
  delayUntilRecursion: false, ignoreBudget: false, scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null,
  wordFormsOverride: null, groupScoringOverride: null, automationId: "", matchSources: { description: false, personality: false, scenario: false, persona: false },
  ...over,
}) as Entry;

const book = (entries: Entry[]) => ({
  id: "b", name: "B", folderId: null, globalActive: false, linkedCharacterIds: [], entries, settings: {}, vectorized: {}, isEmbedded: false, formatTemplate: "",
}) as unknown as import("../src/lib/types").Lorebook;

describe("folder names", () => {
  it("keeps one line per level, at most 60 characters a level, at most three levels", () => {
    expect(F.cleanFolder("  05 - Characters  ")).toBe("05 - Characters");
    expect(F.cleanFolder("a/b\\c")).toBe("a/b/c");
    expect(F.cleanFolder(" a // b / ")).toBe("a/b");
    expect(F.cleanFolder("a/b/c/d/e")).toBe("a/b/c");
    expect(F.cleanFolder("/")).toBe("");
    expect(F.cleanFolder("two\n lines")).toBe("two lines");
    expect(F.cleanFolder("x".repeat(100))).toHaveLength(60);
    expect(F.cleanFolder(undefined)).toBe("");
    expect(F.cleanFolder(42)).toBe("");
  });

  it("a typed name that a folder has, in any letter case, is that folder", () => {
    expect(F.resolveFolderName("characters", ["Bestiary", "Characters"])).toBe("Characters");
    expect(F.resolveFolderName(" Places ", ["Characters"])).toBe("Places");
  });
});

describe("the folder list and the tree", () => {
  const all = [entry("e1", { folder: "05 - Characters", content: "aaaa" }), entry("e2", { folder: "10 - Places", enabled: false }), entry("e3", { folder: "05 - Characters", enabled: false }), entry("e4"), entry("e5", { folder: "02 - Guild" })];

  it("lists folders by natural order and counts what is in them", () => {
    const list = F.listFolders(all);
    expect(list.map((f) => f.name)).toEqual(["02 - Guild", "05 - Characters", "10 - Places"]);
    const chars = list.find((f) => f.name === "05 - Characters")!;
    expect(chars.total).toBe(2);
    expect(chars.on).toBe(1);
    expect(chars.tokens).toBeGreaterThan(0);
    expect(F.hasFolders(all)).toBe(true);
    expect(F.hasFolders([entry("e1"), entry("e2", { folder: "" })])).toBe(false);
  });

  it("a search leaves only the matches in each folder but the folder still counts all its entries", () => {
    const tree = F.buildTree(all, all.filter((e) => e.id === "e3" || e.id === "e4"));
    expect(tree.folders.map((f) => f.name)).toEqual(["05 - Characters"]);
    expect(tree.folders[0]!.entries.map((e) => e.id)).toEqual(["e3"]);
    expect(tree.folders[0]!.total).toBe(2);
    expect(tree.loose.map((e) => e.id)).toEqual(["e4"]);
  });
});

describe("empty folders", () => {
  const all = [entry("e1"), entry("e2", { folder: "A" })];

  it("a listed folder exists with no entries, and shows in the tree unless a search is on", () => {
    expect(F.hasFolders([entry("e1")], ["Places"])).toBe(true);
    expect(F.hasFolders([entry("e1")], [" "])).toBe(false);
    const list = F.listFolders(all, ["Places"]);
    expect(list.map((f) => [f.name, f.total])).toEqual([["A", 1], ["Places", 0]]);
    const tree = F.buildTree(all, all, ["Places"]);
    expect(tree.folders.map((f) => f.name)).toEqual(["A", "Places"]);
    expect(tree.folders[1]!.entries).toEqual([]);
    expect(F.buildTree(all, all.slice(0, 1), []).folders).toEqual([]);
  });

  it("keeps the list clean: no repeats, no empty names, renames join", () => {
    expect(F.cleanFolderList(["A", "a", " ", 3, "B/C"])).toEqual(["A", "B/C"]);
    expect(F.addToFolderList(["A"], "b")).toEqual(["A", "b"]);
    expect(F.renameInFolderList(["A", "B"], "A", "B")).toEqual(["B"]);
    expect(F.renameInFolderList(["A", "B"], "A", "")).toEqual(["B"]);
  });

  it("an empty folder says so on screen", () => {
    const html = renderToStaticMarkup(<EntryTree {...treeProps({ tree: F.buildTree(all, all, ["Places"]), isOpen: () => true })} />);
    expect(html).toContain("Empty");
    expect(html).toContain("Nothing here yet");
  });
});

describe("changing folders", () => {
  const all = [entry("e1"), entry("e2", { folder: "A" }), entry("e3", { folder: "A" })];

  it("moves entries in and out and keeps the order of the array", () => {
    const moved = F.moveToFolder(all, ["e1", "e2"], "B");
    expect(moved.map((e) => [e.id, e.folder])).toEqual([["e1", "B"], ["e2", "B"], ["e3", "A"]]);
    const out = F.moveToFolder(moved, ["e1"], "");
    expect(out[0]).not.toHaveProperty("folder");
    expect(F.moveToFolder(all, ["e2"], "A")[1]).toBe(all[1]!);
  });

  it("renames a folder, and a name another folder has joins the two", () => {
    const merged = F.renameFolder(F.moveToFolder(all, ["e1"], "B"), "B", "A");
    expect(merged.every((e) => e.folder === "A")).toBe(true);
  });

  it("removing a folder keeps its entries", () => {
    const out = F.removeFolder(all, "A");
    expect(out).toHaveLength(3);
    expect(F.hasFolders(out)).toBe(false);
  });

  it("switches every entry of a folder on or off and leaves the others", () => {
    const off = F.setFolderEnabled(all, "A", false);
    expect(off.map((e) => e.enabled)).toEqual([true, false, false]);
    expect(F.setFolderEnabled(off, "A", false)[1]).toBe(off[1]!);
  });
});

describe("a folder in the book file", () => {
  it("is written next to the entry and read back", () => {
    const out = lorebookToEngine(book([entry("e1", { folder: "Places" }), entry("e2")])) as unknown as { entries: Record<string, unknown>[] };
    expect(out.entries[0]!.folder).toBe("Places");
    expect("folder" in out.entries[1]!).toBe(false);
    const back = engineLorebookToUI(out as never, "b");
    expect(back.entries[0]!.folder).toBe("Places");
    expect(back.entries[0]!.extra).toBeUndefined();
    expect(back.entries[1]!.folder).toBeUndefined();
  });

  it("a book file made before folders reads as no folders", () => {
    const old = { name: "Old", entries: [{ uid: 1, title: "t", keys: ["k"], content: "c", group: "one-of" }] };
    const ui = engineLorebookToUI(old as never, "b");
    expect(F.hasFolders(ui.entries)).toBe(false);
    expect(ui.entries[0]!.group).toBe("one-of");
  });

  it("a folder is not the group: one does not touch the other", () => {
    const out = lorebookToEngine(book([entry("e1", { folder: "Places", group: "weather" })])) as unknown as { entries: Record<string, unknown>[] };
    expect(out.entries[0]!.group).toBe("weather");
    expect(out.entries[0]!.folder).toBe("Places");
  });

  it("the book's folders list is written and read back clean, and an old book has none", () => {
    const b = { ...book([entry("e1")]), folders: ["Places", "places", "x/y"] };
    const out = lorebookToEngine(b) as unknown as { folders?: string[] };
    expect(out.folders).toEqual(["Places", "x/y"]);
    expect(engineLorebookToUI(out as never, "b").folders).toEqual(["Places", "x/y"]);
    expect("folders" in (lorebookToEngine(book([entry("e1")])) as object)).toBe(false);
    expect(engineLorebookToUI({ name: "Old", entries: [] } as never, "b").folders).toBeUndefined();
    expect(engineLorebookToUI({ name: "Odd", folders: "nope", entries: [] } as never, "b").folders).toBeUndefined();
  });

  it("a stray value is cleaned on the way out and never a non-string", () => {
    const ui = engineLorebookToUI({ name: "X", entries: [{ uid: 1, title: "t", content: "c", folder: 7 }, { uid: 2, title: "t", content: "c", folder: " a/b " }] } as never, "b");
    expect(ui.entries[0]!.folder).toBeUndefined();
    expect(ui.entries[1]!.folder).toBe("a/b");
  });
});

const treeProps = (over = {}) => ({
    tree: F.buildTree([], []), searching: false, isOpen: () => true, onToggle: () => {}, limitOf: () => 50, onMore: () => {},
    selecting: false, selected: [] as string[], onSelectMany: () => {}, renderRow: (e: Entry) => <li key={e.id} data-row={e.id}>{e.title}</li>,
    toneOf: () => undefined, onDropEntries: () => {}, onAddFolder: () => {}, onAddHere: () => {}, onEnableAll: () => {}, onRename: () => {}, onRemove: () => {}, ...over,
});

describe("the tree on screen", () => {
  const all = [entry("e1", { folder: "Characters", title: "Alpha" }), entry("e2", { folder: "Characters", enabled: false, title: "Beta" }), entry("e3", { title: "Loose one" })];
  const props = (over = {}) => ({
    tree: F.buildTree(all, all), searching: false, isOpen: (n: string) => n === "Characters", onToggle: () => {}, limitOf: () => 50, onMore: () => {},
    selecting: false, selected: [] as string[], onSelectMany: () => {}, renderRow: (e: Entry) => <li key={e.id} data-row={e.id}>{e.title}</li>,
    toneOf: () => undefined, onDropEntries: () => {}, onAddFolder: () => {}, onAddHere: () => {}, onEnableAll: () => {}, onRename: () => {}, onRemove: () => {}, ...over,
  });

  it("an open folder shows its entries, a closed one only its head", () => {
    const open = renderToStaticMarkup(<EntryTree {...props()} />);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("Alpha");
    expect(open).toContain("Loose one");
    const shut = renderToStaticMarkup(<EntryTree {...props({ isOpen: () => false })} />);
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).not.toContain("Alpha");
    expect(shut).toContain("Loose one");
  });

  it("the head carries the name, the count and how many are on", () => {
    const html = renderToStaticMarkup(<EntryTree {...props()} />);
    expect(html).toContain("Characters");
    expect(html).toContain("2 entries");
    expect(html).toContain("1 on");
  });

  it("a search says how many of the folder match", () => {
    const tree = F.buildTree(all, [all[0]!]);
    expect(renderToStaticMarkup(<EntryTree {...props({ tree, searching: true })} />)).toContain("1 of 2 entries");
  });

  it("a folder past the limit offers more, and select all takes only what is shown", () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(`e${i + 10}`, { folder: "Big", title: `Row ${i}` }));
    const tree = F.buildTree(many, many);
    const html = renderToStaticMarkup(<EntryTree {...props({ tree, isOpen: () => true })} />);
    expect(html).toContain("Show 10 more");
    expect(visibleEntries(tree, () => true, () => 50)).toHaveLength(50);
    expect(visibleEntries(tree, () => false, () => 50)).toHaveLength(0);
  });

  it("while selecting, a folder has a checkbox that is checked when all its shown entries are", () => {
    const html = renderToStaticMarkup(<EntryTree {...props({ selecting: true, selected: ["e1", "e2"] })} />);
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });
});

describe("folder colours and dropping entries", () => {
  it("keeps only known tones for clean names", () => {
    expect(F.cleanFolderTones({ Places: "teal", places: "sky", "A/B": "pink", X: "neon", Y: "amber", " ": "sky" })).toEqual({ Places: "teal", "A/B": "pink" });
    expect(F.cleanFolderTones(["sky"])).toEqual({});
    expect(F.cleanFolderTones(null)).toEqual({});
  });

  it("a colour follows its folder through a rename and goes with a removal", () => {
    expect(F.setFolderTone({ A: "sky" }, "A", "B", "sky")).toEqual({ B: "sky" });
    expect(F.setFolderTone({ A: "sky", B: "teal" }, "A", "B", "pink")).toEqual({ B: "pink" });
    expect(F.setFolderTone({ A: "sky" }, "A", "A", undefined)).toEqual({});
    expect(F.setFolderTone({ A: "sky", B: "teal" }, "A", "", undefined)).toEqual({ B: "teal" });
  });

  it("rides the book file, and an old book or a stray value has none", () => {
    const out = lorebookToEngine({ ...book([entry("e1")]), folderTones: { Places: "teal", Bad: "neon" } }) as unknown as { folderTones?: Record<string, string> };
    expect(out.folderTones).toEqual({ Places: "teal" });
    expect(engineLorebookToUI(out as never, "b").folderTones).toEqual({ Places: "teal" });
    expect("folderTones" in (lorebookToEngine(book([entry("e1")])) as object)).toBe(false);
    expect(engineLorebookToUI({ name: "Odd", folderTones: "x", entries: [] } as never, "b").folderTones).toBeUndefined();
  });

  const all = [entry("e1", { folder: "Characters" }), entry("e2")];
  const props = (over = {}) => ({
    tree: F.buildTree(all, all), searching: false, isOpen: () => true, onToggle: () => {}, limitOf: () => 50, onMore: () => {},
    selecting: false, selected: [] as string[], onSelectMany: () => {}, renderRow: (e: Entry) => <li key={e.id}>{e.title}</li>,
    toneOf: () => undefined, onDropEntries: () => {}, onAddFolder: () => {}, onAddHere: () => {}, onEnableAll: () => {}, onRename: () => {}, onRemove: () => {}, ...over,
  });

  it("a folder wears its colour; with none it stays amber", () => {
    expect(renderToStaticMarkup(<EntryTree {...props({ toneOf: () => "teal" })} />)).toContain("text-teal-700");
    expect(renderToStaticMarkup(<EntryTree {...props()} />)).toContain("text-amber-500");
  });
});

describe("nested folders", () => {
  const all = [
    entry("e1", { folder: "Places" }),
    entry("e2", { folder: "Places/Taverns", content: "tavern text" }),
    entry("e3", { folder: "Places/Taverns/Cellars", enabled: false }),
    entry("e4", { folder: "Places2" }),
    entry("e5", { folder: "Characters" }),
    entry("e6"),
  ];

  it("path helpers", () => {
    expect(F.folderLeaf("A/B/C")).toBe("C");
    expect(F.folderParent("A/B/C")).toBe("A/B");
    expect(F.folderParent("A")).toBe("");
    expect(F.folderDepth("A")).toBe(0);
    expect(F.folderDepth("A/B/C")).toBe(2);
    expect(F.folderAncestors("A/B/C")).toEqual(["A", "A/B"]);
    expect(F.folderAncestors("A")).toEqual([]);
    expect(F.inFolder("A/B", "A")).toBe(true);
    expect(F.inFolder("AB", "A")).toBe(false);
    expect(F.renamePath("A/B/C", "A", "X")).toBe("X/B/C");
    expect(F.renamePath("A/B", "A", "")).toBe("B");
    expect(F.renamePath("Z", "A", "X")).toBe("Z");
  });

  it("lists a folder right before the ones below it, counts include them, a parent exists with only children", () => {
    const list = F.listFolders(all, ["Empty/Inner"]);
    expect(list.map((f) => f.name)).toEqual(["Characters", "Empty", "Empty/Inner", "Places", "Places/Taverns", "Places/Taverns/Cellars", "Places2"]);
    const places = list.find((f) => f.name === "Places")!;
    expect([places.total, places.on]).toEqual([3, 2]);
    expect(list.find((f) => f.name === "Places/Taverns")!.total).toBe(2);
    expect(list.find((f) => f.name === "Empty")!.total).toBe(0);
  });

  it("the tree has a parent for every shown folder, and a search keeps the way down to a match", () => {
    const tree = F.buildTree(all, all.filter((e) => e.id === "e3"));
    expect(tree.folders.map((f) => f.name)).toEqual(["Places", "Places/Taverns", "Places/Taverns/Cellars"]);
    expect(tree.folders[0]!.entries).toEqual([]);
    expect(tree.folders[0]!.total).toBe(3);
    expect(tree.folders[2]!.entries.map((e) => e.id)).toEqual(["e3"]);
  });

  it("renaming a folder takes the ones below it along", () => {
    const out = F.renameFolder(all, "Places", "Maps");
    expect(out.map((e) => e.folder)).toEqual(["Maps", "Maps/Taverns", "Maps/Taverns/Cellars", "Places2", "Characters", undefined]);
    expect(F.renameFolder(all, "Places/Taverns", "Inns").map((e) => e.folder).slice(0, 3)).toEqual(["Places", "Inns", "Inns/Cellars"]);
    expect(F.renameInFolderList(["Places/Taverns", "Other"], "Places", "Maps")).toEqual(["Maps/Taverns", "Other"]);
    expect(F.setFolderTone({ Places: "sky", "Places/Taverns": "pink" }, "Places", "Maps", "teal")).toEqual({ Maps: "teal", "Maps/Taverns": "pink" });
    expect(F.setFolderTone({ A: "sky", "A/B": "pink" }, "A/B", "A", undefined)).toEqual({ A: "sky" });
  });

  it("removing a folder moves its entries and subfolders up one level", () => {
    expect(F.removeFolder(all, "Places").map((e) => e.folder)).toEqual([undefined, "Taverns", "Taverns/Cellars", "Places2", "Characters", undefined]);
    expect(F.removeFolder(all, "Places/Taverns").map((e) => e.folder).slice(0, 3)).toEqual(["Places", "Places", "Places/Cellars"]);
  });

  it("switching a folder on or off reaches the folders below", () => {
    const out = F.setFolderEnabled(all, "Places", false);
    expect(out.map((e) => e.enabled)).toEqual([false, false, false, true, true, true]);
  });

  it("a typed path goes under an existing folder in any letter case", () => {
    expect(F.resolveFolderName("places/taverns/Attic", ["Places", "Places/Taverns"])).toBe("Places/Taverns/Attic");
    expect(F.resolveFolderName("PLACES", ["Places/Taverns"])).toBe("Places");
    expect(F.resolveFolderName("new/one", ["Places"])).toBe("new/one");
  });

  const props = (over = {}) => ({
    tree: F.buildTree(all, all), searching: false, isOpen: (n: string) => n === "Places" || n === "Places/Taverns", onToggle: () => {}, limitOf: () => 50, onMore: () => {},
    selecting: false, selected: [] as string[], onSelectMany: () => {}, renderRow: (e: Entry) => <li key={e.id} data-row={e.id}>{e.title}</li>,
    toneOf: () => undefined, onDropEntries: () => {}, onAddFolder: () => {}, onAddHere: () => {}, onEnableAll: () => {}, onRename: () => {}, onRemove: () => {}, ...over,
  });

  it("shows a subfolder inside its open parent by its own name, and hides it while the parent is folded", () => {
    const html = renderToStaticMarkup(<EntryTree {...props()} />);
    expect(html).toContain('data-folder="Places/Taverns"');
    expect(html).toContain(">Taverns<");
    expect(html).not.toContain('data-folder="Places/Taverns/Cellars"><');
    const folded = renderToStaticMarkup(<EntryTree {...props({ isOpen: () => false })} />);
    expect(folded).not.toContain('data-folder="Places/Taverns"');
    expect(folded).toContain('data-folder="Places"');
  });

  it("select-all-visible takes only what is on screen: nothing under a folded parent", () => {
    const tree = F.buildTree(all, all);
    const ids = (open: string[]) => visibleEntries(tree, (n) => open.includes(n), () => 50).map((e) => e.id).sort();
    expect(ids(["Places/Taverns"])).toEqual(["e6"]);
    expect(ids(["Places", "Places/Taverns"])).toEqual(["e2", "e1", "e6"].sort());
  });
});
