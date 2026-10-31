import { describe, expect, it } from "bun:test";
import { PERSONA_SECTIONS, SECTION_DOT, SECTION_TINT, addGallery, isSection, portraitPrompt, removeGallery } from "../src/lib/persona-page";
import { mergeTasks, sameTasks } from "../src/lib/card-tasks";

describe("gallery", () => {
  it("adds at the end and never twice", () => {
    expect(addGallery(undefined, "a")).toEqual(["a"]);
    expect(addGallery(["a", "b"], "a")).toEqual(["b", "a"]);
  });
  it("removes one and leaves the input alone", () => {
    const list = ["a", "b"];
    expect(removeGallery(list, "a")).toEqual(["b"]);
    expect(removeGallery(undefined, "a")).toEqual([]);
    expect(list).toEqual(["a", "b"]);
  });
});

describe("portraitPrompt", () => {
  it("builds from the profile and ends with the style", () => {
    const p = { name: "Denis Kovalenko", pronouns: "he/him", profile: { identity: { first: "Denis", age: "29", gender: "male" }, appearance: { hair: "dark", eyes: "grey", attire: "a hoodie", marks: "scar" } } };
    const s = portraitPrompt(p, "oil painting");
    expect(s).toBe("Denis, 29 years old, male, grey eyes, dark hair, wearing a hoodie, oil painting");
  });
  it("falls back to the name and the default style without a profile", () => {
    expect(portraitPrompt({ name: "Iryna", pronouns: "" })).toStartWith("Iryna, portrait");
  });
});

describe("sections", () => {
  it("every section has a tint and a dot", () => {
    for (const s of PERSONA_SECTIONS) { expect(SECTION_TINT[s]).toBeTruthy(); expect(SECTION_DOT[s]).toBeTruthy(); }
    expect(isSection("profile")).toBe(true);
    expect(isSection("nope")).toBe(false);
  });
});

describe("card tasks of an owner", () => {
  it("merge drops empty values and keeps the rest", () => {
    expect(mergeTasks({ model: "a/b", maxInput: 900 }, { model: undefined })).toEqual({ maxInput: 900 });
    expect(mergeTasks({}, { maxOutput: 0 })).toEqual({});
    expect(mergeTasks({ model: "a/b" }, { maxInput: 1200 })).toEqual({ model: "a/b", maxInput: 1200 });
  });
  it("same ignores unset against zero or empty", () => {
    expect(sameTasks({}, { model: "" })).toBe(true);
    expect(sameTasks({ model: "x" }, {})).toBe(false);
  });
});
