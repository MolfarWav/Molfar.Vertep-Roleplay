import { describe, expect, it } from "bun:test";
import { MAX_TEXT_CHARS, baseName, composeBrief, fieldsFor, parsePersonaFile } from "../src/lib/persona-new";

describe("baseName", () => {
  it("drops the folder and the last extension", () => {
    expect(baseName("Ada Lovelace.txt")).toBe("Ada Lovelace");
    expect(baseName("C:\\notes\\ada.v2.md")).toBe("ada.v2");
    expect(baseName(".hidden")).toBe(".hidden");
  });
});

describe("parsePersonaFile", () => {
  it("reads our backup array as personas", () => {
    const f = parsePersonaFile("personas-backup.json", JSON.stringify([{ name: "A", description: "x" }, { name: "B" }]));
    expect(f.kind).toBe("personas");
    expect(f.personas?.length).toBe(2);
  });
  it("reads one object with a name and a description", () => {
    const f = parsePersonaFile("x.json", JSON.stringify({ name: "Ada", description: "A captain." }));
    expect(f.kind).toBe("personas");
    expect(f.personas).toEqual([{ name: "Ada", description: "A captain." }]);
    expect(f.name).toBe("Ada");
  });
  it("reads a { name: description } object", () => {
    const f = parsePersonaFile("x.json", JSON.stringify({ Ada: "captain", Bo: "cook" }));
    expect(f.kind).toBe("personas");
    expect(f.personas).toEqual([{ name: "Ada", description: "captain" }, { name: "Bo", description: "cook" }]);
  });
  it("shows any other JSON as pretty text and names it from the name field or the file", () => {
    const a = parsePersonaFile("notes.json", JSON.stringify({ hair: "red", age: 30 }));
    expect(a.kind).toBe("json");
    expect(a.name).toBe("notes");
    expect(a.text).toBe(JSON.stringify({ hair: "red", age: 30 }, null, 2));
    const b = parsePersonaFile("notes.json", JSON.stringify({ name: "Ada", hair: "red" }));
    expect(b.kind).toBe("json");
    expect(b.name).toBe("Ada");
    // an array with a record that is not a persona is not a backup
    expect(parsePersonaFile("x.json", JSON.stringify([{ name: "A" }, 5])).kind).toBe("json");
  });
  it("treats text, a broken JSON and a bare number as text", () => {
    expect(parsePersonaFile("Ada.txt", "Ada is a captain.\r\nShe sails.")).toMatchObject({ kind: "text", name: "Ada", text: "Ada is a captain.\nShe sails.", cut: false });
    expect(parsePersonaFile("bad.json", "{ not json").kind).toBe("text");
    expect(parsePersonaFile("n.json", "42").kind).toBe("text");
  });
  it("cuts a long text and says so", () => {
    const f = parsePersonaFile("long.md", "x".repeat(MAX_TEXT_CHARS + 500));
    expect(f.cut).toBe(true);
    expect(f.text.length).toBe(MAX_TEXT_CHARS);
    expect(parsePersonaFile("ok.md", "x".repeat(MAX_TEXT_CHARS)).cut).toBe(false);
  });
});

describe("composeBrief", () => {
  const draft = { angle: "Dreamer", name: "Ada", pronouns: "she/her", summary: "A tired ferry captain.", traits: ["calm", "dry"], detail: "A scar on her palm." };
  it("lists name, summary, detail, traits, answers and the wish", () => {
    const text = composeBrief(draft, [{ q: "Where?", a: "River" }, { q: "Skipped?", a: "" }], "make her funny");
    expect(text).toBe("Name: Ada\nPronouns: she/her\nA tired ferry captain.\nA scar on her palm.\nTraits: calm, dry\nWhere?: River\nWish: make her funny");
  });
  it("leaves out what is empty", () => {
    expect(composeBrief({ ...draft, pronouns: undefined, detail: "", traits: [] }, [], "  ")).toBe("Name: Ada\nA tired ferry captain.");
  });
});

describe("fieldsFor", () => {
  const profile = { identity: { first: "Ada" }, appearance: { hair: "grey" }, behaviors: { habits: "tea" } };
  it("a quick sketch asks for nothing", () => expect(fieldsFor("quick", profile)).toEqual({}));
  it("a full portrait fills looks, personality and goals only, and only the empty ones", () => {
    const f = fieldsFor("full", profile);
    expect(Object.keys(f).sort()).toEqual(["appearance", "goals", "lists"]);
    expect(f.appearance).not.toContain("hair");
    expect(f.appearance).toContain("eyes");
  });
  it("a deep dive asks for every empty field of the sections that are on", () => {
    const f = fieldsFor("deep", profile);
    expect(Object.keys(f)).toEqual(expect.arrayContaining(["identity", "appearance", "lists", "behaviors", "goals", "background"]));
    expect(f.behaviors).not.toContain("habits");
    expect(f.identity).not.toContain("first");
  });
});
