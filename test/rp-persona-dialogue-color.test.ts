// A persona's dialogue colour travels from the stored persona file to the UI persona.
import { describe, expect, it } from "bun:test";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { enginePersonaToUI } = await import("../src/lib/engine");

describe("persona dialogue colour", () => {
  it("is read from the stored persona", () => {
    expect(enginePersonaToUI({ id: "p1", name: "Eli", dialogueColor: "#ffb454" }, null).dialogueColor).toBe("#ffb454");
  });
  it("is absent when it is empty or was never set", () => {
    expect("dialogueColor" in enginePersonaToUI({ id: "p1", name: "Eli", dialogueColor: "" }, null)).toBe(false);
    expect("dialogueColor" in enginePersonaToUI({ id: "p1", name: "Eli" }, null)).toBe(false);
  });
});
