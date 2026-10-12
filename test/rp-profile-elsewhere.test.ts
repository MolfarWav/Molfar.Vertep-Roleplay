// A profile written outside the Profile tab (Molfar) leaves `compiled` out; the app writes the card's
// text from it on its next load.
import { describe, expect, it } from "bun:test";
import { compileIfWrittenElsewhere } from "../src/lib/profile.ts";

const card = (profile: unknown) => ({ cardExtras: { extensions: { molfar_profile: profile } } });

describe("a profile written elsewhere", () => {
  it("is compiled once: the texts and the hash come back", () => {
    const patch = compileIfWrittenElsewhere(card({ v: 1, appearance: { eyes: "grey" }, lists: { fears: ["the dark"] } }), 1)!;
    expect(patch.description).toContain("grey");
    expect(patch.personality).toContain("the dark");
    const p = (patch.cardExtras!.extensions as { molfar_profile: { compiled: { hash: string } } }).molfar_profile;
    expect(p.compiled.hash).toBeTruthy();
    expect(compileIfWrittenElsewhere(patch as never)).toBeNull();
  });
  it("leaves alone a compiled, free, empty or missing profile", () => {
    expect(compileIfWrittenElsewhere(card({ v: 1, appearance: { eyes: "grey" }, compiled: { at: 1, hash: "x" } }))).toBeNull();
    expect(compileIfWrittenElsewhere(card({ v: 1, appearance: { eyes: "grey" }, free: true }))).toBeNull();
    expect(compileIfWrittenElsewhere(card({ v: 1 }))).toBeNull();
    expect(compileIfWrittenElsewhere({ cardExtras: undefined })).toBeNull();
  });
  it("a null `compiled` counts as left out", () => {
    expect(compileIfWrittenElsewhere(card({ v: 1, appearance: { eyes: "grey" }, compiled: null }))).not.toBeNull();
  });
});
