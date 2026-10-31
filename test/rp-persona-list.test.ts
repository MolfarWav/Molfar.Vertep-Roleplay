import { describe, expect, it } from "bun:test";
import {
  NO_FOLDER, cleanTags, filterPersonas, folderNamesOf, moveToFolder, noFolderCount, personaLine, personaTagChips,
  personaTagCounts, personaTokens, profileFill, sortPersonas, tagsOf, withTag,
} from "../src/lib/persona-list";
import { estimateTokens } from "../src/lib/tokens";
import type { Persona, Tag } from "../src/lib/types";

const persona = (over: Partial<Persona> & { id: string; name: string }): Persona => ({
  avatar: "", title: "", description: "", pronouns: "", lorebookIds: [], isDefault: false, folderId: null,
  binding: "default", boundCharacterIds: [], autoLock: false, createdAt: 0, ...over,
});
const tag = (name: string, order: number, asFolder = false, visible = true): Tag => ({
  id: name, name, color: "#000", textColor: "#fff", visible, asFolder, order, scope: "persona",
});

describe("personaLine", () => {
  it("is occupation and age from the profile", () => {
    const p = persona({ id: "a", name: "A", title: "old title", profile: { identity: { occupation: "Backend engineer", age: "29" } } });
    expect(personaLine(p)).toBe("Backend engineer · 29");
  });
  it("holds up with only one of them", () => {
    expect(personaLine(persona({ id: "a", name: "A", profile: { identity: { occupation: "Archivist" } } }))).toBe("Archivist");
    expect(personaLine(persona({ id: "a", name: "A", profile: { identity: { age: 34 } } }))).toBe("34");
  });
  it("falls back to the title, then to nothing", () => {
    expect(personaLine(persona({ id: "a", name: "A", title: "  Mercenary  " }))).toBe("Mercenary");
    expect(personaLine(persona({ id: "a", name: "A", profile: { identity: {} } }))).toBe("");
  });
});

describe("profileFill", () => {
  it("counts the sections that have a field filled, out of nine", () => {
    expect(profileFill(persona({ id: "a", name: "A" })).label).toBe("0/9");
    const p = persona({
      id: "a", name: "A",
      profile: {
        identity: { first: "A", occupation: "x" }, // identity is not one of the nine
        appearance: { hair: "dark" },
        lists: { traits: ["brave"] },
        goals: { short: "  " },
        trauma: { triggers: [] },
        relationships: [{ name: "Mira", relation: "sister", notes: "" }],
      },
    });
    const f = profileFill(p);
    expect(f).toEqual({ filled: 3, total: 9, label: "3/9" });
  });
  it("reads a hand-written profile without throwing", () => {
    const p = persona({ id: "a", name: "A", profile: { appearance: "nope", lists: { traits: "brave, kind" }, relationships: "x" } });
    expect(profileFill(p).filled).toBe(1);
  });
});

describe("sortPersonas", () => {
  const list = [
    persona({ id: "a", name: "Beta", createdAt: 10 }),
    persona({ id: "b", name: "alpha", createdAt: 30 }),
    persona({ id: "c", name: "Gamma", createdAt: 20 }),
    persona({ id: "d", name: "Delta", createdAt: 20 }),
  ];
  const usage = new Map([["a", 5], ["c", 5], ["d", 1]]);
  const tokens = new Map([["a", 100], ["b", 300], ["c", 100]]);
  const ids = (s: Parameters<typeof sortPersonas>[1]) => sortPersonas(list, s, usage, tokens).map((p) => p.id).join("");
  it("recent: newest first, ties by name", () => expect(ids("recent")).toBe("bdca"));
  it("name: A-Z", () => expect(ids("name")).toBe("badc"));
  it("used: most chats first, then name", () => expect(ids("used")).toBe("acdb"));
  it("tokens: biggest first, then name", () => expect(ids("tokens")).toBe("bacd"));
  it("leaves the input alone", () => {
    const before = list.map((p) => p.id).join("");
    sortPersonas(list, "name", usage, tokens);
    expect(list.map((p) => p.id).join("")).toBe(before);
  });
});

describe("filterPersonas", () => {
  const list = [
    persona({ id: "a", name: "Denis", title: "engineer", tags: ["Everyman", "Main", "Modern"] }),
    persona({ id: "b", name: "Kael", profile: { identity: { occupation: "Information broker" } }, tags: ["Mage", "Fantasy"] }),
    persona({ id: "c", name: "Iryna" }),
    persona({ id: "d", name: "Odd", tags: "oops" as never }),
  ];
  const base = { query: "", tags: [], folder: null, folderNames: ["Main", "Fantasy"] };
  const ids = (f: Partial<typeof base> & { folder?: string | null }) => filterPersonas(list, { ...base, ...f }).map((p) => p.id).join("");
  it("no filter shows everyone, even one with broken tags", () => expect(ids({})).toBe("abcd"));
  it("the query matches name, line, title and tags", () => {
    expect(ids({ query: "kae" })).toBe("b");
    expect(ids({ query: "broker" })).toBe("b");
    expect(ids({ query: "ENGINEER" })).toBe("a");
    expect(ids({ query: "modern" })).toBe("a");
  });
  it("all chosen tags must be there", () => {
    expect(ids({ tags: ["Everyman", "Modern"] })).toBe("a");
    expect(ids({ tags: ["Everyman", "Mage"] })).toBe("");
  });
  it("a folder is its tag; No folder is none of the folder tags", () => {
    expect(ids({ folder: "Main" })).toBe("a");
    expect(ids({ folder: NO_FOLDER })).toBe("cd");
  });
});

describe("tags", () => {
  const list = [persona({ id: "a", name: "A", tags: ["x", "y", "x"] }), persona({ id: "b", name: "B", tags: ["x"] }), persona({ id: "c", name: "C" })];
  it("counts personas per tag", () => expect([...personaTagCounts(list)]).toEqual([["x", 2], ["y", 1]]));
  it("cleans what a file may hold", () => {
    expect(cleanTags([" a ", "a", 3, "", "b"])).toEqual(["a", "b"]);
    expect(cleanTags("a, b")).toBeUndefined();
    expect(tagsOf({ tags: undefined })).toEqual([]);
  });
  it("chips: registry order, hidden left out, unknown tags last A-Z", () => {
    const registry = [tag("y", 0), tag("x", 1, false, false)];
    expect(personaTagChips(list, registry).map((c) => c.name)).toEqual(["y"]);
    const more = [...list, persona({ id: "d", name: "D", tags: ["b", "a"] })];
    expect(personaTagChips(more, [tag("y", 0)]).map((c) => c.name)).toEqual(["y", "a", "b", "x"]);
    expect(personaTagChips(more, [tag("y", 0)])[1]?.tag).toBeUndefined();
  });
  it("adds and removes one tag, or says nothing changes", () => {
    expect(withTag({ tags: ["a"] }, "b", true)).toEqual(["a", "b"]);
    expect(withTag({ tags: ["a"] }, "a", true)).toBeNull();
    expect(withTag({ tags: ["a"] }, "a", false)).toEqual([]);
    expect(withTag({}, "a", false)).toBeNull();
  });
});

describe("folders", () => {
  const folders = [tag("Main", 0, true), tag("Fantasy", 1, true)];
  it("a move leaves the other folders and keeps plain tags", () => {
    expect(moveToFolder({ tags: ["Main", "Noir"] }, "Fantasy", folders)).toEqual(["Noir", "Fantasy"]);
    expect(moveToFolder({ tags: ["Main", "Noir"] }, null, folders)).toEqual(["Noir"]);
  });
  it("lists the folders a persona sits in, and counts those in none", () => {
    expect(folderNamesOf({ tags: ["Fantasy", "Main", "Noir"] }, folders)).toEqual(["Main", "Fantasy"]);
    expect(noFolderCount([{ tags: ["Main"] }, { tags: ["Noir"] }, {}], folders)).toBe(2);
  });
});

describe("personaTokens", () => {
  it("is the description's token estimate", () => {
    const description = "A tired backend engineer who likes long walks.";
    expect(personaTokens({ description })).toBe(estimateTokens(description));
    expect(personaTokens({ description: "" })).toBe(0);
  });
});
