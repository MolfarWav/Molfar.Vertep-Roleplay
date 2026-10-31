/**
 * The persona page is keyed by persona id (so each persona starts with its own state), and the
 * Memory section inside it by persona too. Two siblings under one parent must not share a key:
 * React then duplicates the blocks and never removes the old ones (4.76.0: every persona opened
 * stacked another Description above the last).
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(new URL(`../src/components/${p}`, import.meta.url), "utf8");

describe("persona page keys", () => {
  it("keys the page by the persona", () => {
    expect(read("views/personas-view.tsx")).toMatch(/<PersonaPage\s+key=\{p\.id\}/);
  });
  it("gives the per-persona blocks different keys", () => {
    const src = ["views/personas-view.tsx", "persona/persona-page.tsx", "persona/persona-tabs.tsx", "persona/persona-profile.tsx"].map(read).join("\n");
    const keys = [...src.matchAll(/<(PersonaPage|PersonaDescriptionField|MemorySection)\s+key=\{([^}]+)\}/g)].map((m) => m[2]);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
