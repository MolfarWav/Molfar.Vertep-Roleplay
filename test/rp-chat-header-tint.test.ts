// The tinted icon button of the chat header (src/components/chat/header-tint.ts): 36 px, a border, and the tone's
// own fill and ink taken from TONES, so the two tones never share a look.
import { describe, expect, it } from "bun:test";
import { headerTint } from "../src/components/chat/header-tint";
import { TONES, type ToneName } from "../src/components/ui/tone";

const classes = (s: string) => s.split(/\s+/).filter(Boolean);

describe("headerTint", () => {
  it("sky: 36 px, a border, and the tone's fill and ink", () => {
    const cls = headerTint("sky");
    expect(cls).toContain("size-9");
    expect(classes(cls)).toContain("border");
    expect(cls).toContain(TONES.sky.fill);
    expect(cls).toContain(TONES.sky.ink);
  });

  it("teal: 36 px, a border, and the tone's fill and ink", () => {
    const cls = headerTint("teal");
    expect(cls).toContain("size-9");
    expect(classes(cls)).toContain("border");
    expect(cls).toContain(TONES.teal.fill);
    expect(cls).toContain(TONES.teal.ink);
  });

  it("sky and teal give different strings", () => {
    expect(headerTint("sky")).not.toBe(headerTint("teal"));
  });

  it("every tone carries its own fill and ink, and no other tone's", () => {
    const names = Object.keys(TONES) as ToneName[];
    for (const name of names) {
      const cls = headerTint(name);
      expect(cls).toContain(TONES[name].fill);
      expect(cls).toContain(TONES[name].ink);
      for (const other of names.filter((n) => n !== name)) {
        expect(cls).not.toContain(TONES[other].fill);
      }
    }
  });
});
