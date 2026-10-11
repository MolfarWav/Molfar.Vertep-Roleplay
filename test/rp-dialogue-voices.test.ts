/** Narrator messages colour each quote by the member named in its line. */
import { describe, expect, it } from "bun:test";
import { firstVoiceIn, voiceMatcher, type DialogueVoice } from "../src/lib/dialogue-voices";

const v = (name: string): DialogueVoice => ({ name, color: name, match: voiceMatcher(name)! });

describe("voiceMatcher", () => {
  it("matches the first word as a whole word", () => {
    expect(voiceMatcher("Aria Vale")!.test("Aria nods.")).toBe(true);
    expect(voiceMatcher("Aria")!.test("Aria's staff")).toBe(true);
    expect(voiceMatcher("Bo")!.test("Bob waves.")).toBe(false);
    expect(voiceMatcher("Mark")!.test("Marker")).toBe(false);
  });
  it("finds Ukrainian inflected forms of a name ending in a vowel", () => {
    const m = voiceMatcher("Єва")!;
    for (const w of ["Єва", "Єви", "Єві", "Єву", "Євою"]) expect(m.test(`Сказала ${w} тихо.`)).toBe(true);
    expect(m.test("Євген прийшов.")).toBe(false);
  });
});

describe("firstVoiceIn", () => {
  it("picks the member named first in the text", () => {
    const voices = [v("Aria"), v("Bo")];
    expect(firstVoiceIn("Bo looks at Aria.", voices)?.name).toBe("Bo");
    expect(firstVoiceIn("Nobody here.", voices)).toBeNull();
  });
});
