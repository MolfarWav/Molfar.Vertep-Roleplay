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

describe("distinct voice colours", () => {
  const card = (id: string, dialogue = "") => ({ id, name: id, isGroup: false, colors: { name: "", dialogue, bubble: "" } }) as any;
  const group = (ids: string[], memberSettings: Record<string, { color?: string }> = {}) => ({ id: "g", isGroup: true, group: { memberIds: ids, memberSettings } }) as any;

  it("members without a colour fill the palette around the chosen ones, never twice", async () => {
    const { memberColor, VOICE_PALETTE } = await import("../src/lib/dialogue-voices");
    const cards = [card("a"), card("b", VOICE_PALETTE[0]!), card("c"), card("d")];
    const g = group(["a", "b", "c", "d"]);
    const got = cards.map((c) => memberColor(g, c, cards));
    expect(got[1]).toBe(VOICE_PALETTE[0]!);
    expect(new Set(got).size).toBe(4);
  });

  it("twelve members all differ", async () => {
    const { memberColor } = await import("../src/lib/dialogue-voices");
    const cards = Array.from({ length: 12 }, (_, i) => card("m" + i));
    const g = group(cards.map((c) => c.id));
    expect(new Set(cards.map((c) => memberColor(g, c, cards))).size).toBe(12);
  });

  it("without the cards a member still gets the palette by position", async () => {
    const { memberColor, VOICE_PALETTE } = await import("../src/lib/dialogue-voices");
    const g = group(["a", "b"]);
    expect(memberColor(g, card("b"))).toBe(VOICE_PALETTE[1]!);
  });

  it("a chat's people are found by any of their names, in either alphabet", async () => {
    const { peopleVoices, } = await import("../src/lib/chat-voices");
    const v = peopleVoices({ mode: "on", active: true, people: [
      { id: "p1", name: "Kaede Fuji", aliases: ["Каэде"], color: "#111111", hand: false },
      { id: "p2", name: "Sina Rose", aliases: [], color: "#222222", hand: false },
      { id: "p3", name: "Bo", aliases: [], color: "", hand: false },
    ] });
    expect(v.map((x) => x.name)).toEqual(["Kaede Fuji", "Sina Rose"]);
    expect(v[0]!.match.test("Каэде кивнула.")).toBe(true);
    expect(v[1]!.match.test("Kaede said")).toBe(false);
    expect(peopleVoices({ mode: "off", active: false, people: [{ id: "p1", name: "Kaede", aliases: [], color: "#111111", hand: false }] })).toEqual([]);
    expect(peopleVoices(null)).toEqual([]);
  });
});
