import { describe, expect, it } from "bun:test";

const { personaFrame } = await import(new URL("../plugins/engine/plugin.js", import.meta.url).href);

describe("the persona text in the prompt says who knows it", () => {
  it("puts one line before the sheet naming the player's character", () => {
    const out = personaFrame("Taras", "Tailor. Sewed a dress with military stripes.");
    expect(out).toStartWith("[Taras is the player's character.");
    expect(out).toContain("known to you, the narrator");
    expect(out).toContain("one who has not met Taras knows none of it");
    expect(out).toEndWith("\nTailor. Sewed a dress with military stripes.");
  });
  it("keeps the sheet itself unchanged", () => {
    const sheet = "Line one.\n\nLine two {{char}}.";
    expect(personaFrame("A", sheet).endsWith("\n" + sheet)).toBe(true);
  });
  it("adds nothing to an empty persona", () => {
    expect(personaFrame("Taras", "")).toBe("");
    expect(personaFrame("Taras", "  \n ")).toBe("  \n ");
  });
  it("falls back to a plain phrase when the name is empty", () => {
    expect(personaFrame("", "x")).toStartWith("[This is the player's character.");
  });
  it("is short (about 45 tokens)", () => {
    expect(personaFrame("Taras", "x").length).toBeLessThan(330);
  });
});
