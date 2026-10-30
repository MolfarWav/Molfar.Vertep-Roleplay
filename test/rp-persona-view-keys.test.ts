/**
 * The persona page keys the Description block and the Memory section by persona so each starts
 * fresh on a switch. Two siblings under one parent must not share a key: React then duplicates
 * the blocks and never removes the old ones (4.76.0: every persona opened stacked another
 * Description above the last).
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";

describe("personas-view keys", () => {
  it("gives the per-persona blocks different keys", () => {
    const src = fs.readFileSync(new URL("../src/components/views/personas-view.tsx", import.meta.url), "utf8");
    const keys = [...src.matchAll(/<(PersonaDescription|MemorySection)\s+key=\{([^}]+)\}/g)].map((m) => m[2]);
    expect(keys.length).toBe(2);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
