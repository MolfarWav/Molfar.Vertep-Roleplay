// A persona's own book (Molfar.Vertep#463): the book travels inside the persona's file, comes back as a book of the library under a
// new id and a free name, and is linked; the persona's other links stay as ids.
import { describe, expect, it } from "bun:test";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const kept = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
(globalThis as any).fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
const P = await import("../src/lib/persona-book");
const { engineLorebookToUI } = await import("../src/lib/engine");
type Persona = import("../src/lib/types").Persona;

const persona = (over: Partial<Persona> = {}): Persona =>
  ({ id: "p1", name: "Ada", avatar: "", title: "", description: "A captain.", pronouns: "", lorebookIds: [], isDefault: false, folderId: null, binding: "default", boundCharacterIds: [], autoLock: false, createdAt: 1, ...over }) as Persona;

const ui = (id: string, name: string) =>
  engineLorebookToUI({ id, name, entries: [{ uid: 1, title: "The harbour", keys: ["harbour"], content: "Cold, grey and loud.", status: "normal", position: "before_char" }] } as never, id);

describe("what the tab shows and writes", () => {
  it("the own book is the own id when it is among the links; the rest are links", () => {
    expect(P.bookSetOf(persona({ ownLorebookId: "own", lorebookIds: ["a", "own", "b"] }))).toEqual({ ownId: "own", linkedIds: ["a", "b"] });
    // an own id the links do not hold is no own book (a hand-edited file)
    expect(P.bookSetOf(persona({ ownLorebookId: "own", lorebookIds: ["a"] }))).toEqual({ ownId: null, linkedIds: ["a"] });
    expect(P.bookSetOf(persona({ lorebookIds: ["a"] }))).toEqual({ ownId: null, linkedIds: ["a"] });
  });
  it("a change writes the own book first and no id twice", () => {
    expect(P.bookPatchOf({ ownId: "own", linkedIds: ["a", "own", "a"] })).toEqual({ ownLorebookId: "own", lorebookIds: ["own", "a"] });
    expect(P.bookPatchOf({ ownId: null, linkedIds: ["a"] })).toEqual({ ownLorebookId: null, lorebookIds: ["a"] });
  });
});

describe("free book names", () => {
  it("keeps a free name and counts up from 2 for a taken one, ignoring case and spaces", () => {
    expect(P.freeBookName("Harbour", ["Court"])).toBe("Harbour");
    expect(P.freeBookName(" Harbour ", ["harbour"])).toBe("Harbour (2)");
    expect(P.freeBookName("Harbour", ["Harbour", "Harbour (2)"])).toBe("Harbour (3)");
    expect(P.freeBookName("  ", [])).toBe("Book");
  });
});

describe("a persona with its own book, through a file and back", () => {
  it("export writes the book inline; import stores it under a new id, links it first and drops the old own id", async () => {
    const book = ui("old-own", "Ada's book");
    const exported = await P.personaForExport(persona({ ownLorebookId: "old-own", lorebookIds: ["old-own", "shared"] }), async (id) => (id === "old-own" ? book : null));
    expect(exported.ownLorebookId).toBe("old-own");
    expect((exported.lorebook as { name: string }).name).toBe("Ada's book");
    const file = JSON.parse(JSON.stringify(exported));
    const { record, book: adopted } = P.adoptInlineBook(file, "book_new", ["Ada's book", "Other"]);
    expect(adopted).not.toBeNull();
    expect(adopted?.id).toBe("book_new");
    expect(adopted?.name).toBe("Ada's book (2)");
    expect(adopted?.entries.length).toBe(1);
    expect(record.lorebook).toBeUndefined();
    expect(record.ownLorebookId).toBe("book_new");
    expect(record.lorebookIds).toEqual(["book_new", "shared"]);
  });
  it("a persona without an own book exports as it is, and a book the library lacks leaves no stray inline field", async () => {
    expect(await P.personaForExport(persona({ lorebookIds: ["a"] }), async () => null)).toEqual(persona({ lorebookIds: ["a"] }));
    const missing = await P.personaForExport(persona({ ownLorebookId: "gone", lorebookIds: ["gone"] }), async () => null);
    expect(missing.lorebook).toBeUndefined();
  });
  it("a record whose inline book is not a book comes back without it and without an own id that points at nothing", () => {
    const { record, book } = P.adoptInlineBook({ name: "Ada", ownLorebookId: "x", lorebookIds: ["x"], lorebook: { entries: "no" } }, "n1", []);
    expect(book).toBeNull();
    expect(record).toEqual({ name: "Ada", lorebookIds: ["x"] });
    // an old file with no inline book is untouched
    expect(P.adoptInlineBook({ name: "Ada", lorebookIds: ["a"] }, "n2", []).record).toEqual({ name: "Ada", lorebookIds: ["a"] });
  });
});
