// The "context window too small" notice (lib/context-notice.ts): parsing the engine's finding and the words it picks.
import { describe, expect, it } from "bun:test";
import { DICTIONARIES, t as translate, type MsgKey } from "../src/lib/i18n";
import { contextNotice, parseTooSmall, replyTakesMost } from "../src/lib/context-notice";

const en = (key: MsgKey, vars?: Record<string, string | number>) => translate(key, "en", vars);

describe("parseTooSmall", () => {
  it("reads the engine's object and rejects anything else", () => {
    expect(parseTooSmall({ window: 66000, need: 70000, budget: 50000, reply: 12000 })).toEqual({ window: 66000, need: 70000, budget: 50000, reply: 12000 });
    expect(parseTooSmall({ window: 32768, need: 1, budget: 0, reply: 1024, windowKnown: false })?.windowKnown).toBe(false);
    for (const bad of [null, undefined, "x", 7, {}, { window: "a", need: 1, budget: 1, reply: 1 }, { window: 1, need: -1, budget: 1, reply: 1 }]) {
      expect(parseTooSmall(bad)).toBeNull();
    }
  });
});

describe("contextNotice", () => {
  it("names the numbers and the ways out", () => {
    const n = contextNotice({ window: 66000, need: 70000, budget: 50000, reply: 4000 }, en as never);
    expect(n.title).toBe("The context window is too small");
    expect(n.description).toContain("70,000");
    expect(n.description).toContain("50,000");
    expect(n.description).toMatch(/Max output tokens/);
    expect(n.description).toMatch(/Older messages were dropped/);
  });

  it("when the reply reserve takes most of the window, says to lower it", () => {
    const ts = { window: 4000, need: 30, budget: 0, reply: 3900 };
    expect(replyTakesMost(ts)).toBe(true);
    expect(contextNotice(ts, en as never).description).toContain("3,900");
    expect(replyTakesMost({ window: 66000, need: 1, budget: 1, reply: 12000 })).toBe(false);
  });

  it("an unknown window is said once", () => {
    const d = contextNotice({ window: 32768, need: 40000, budget: 30000, reply: 1024, windowKnown: false }, en as never).description;
    expect(d).toContain("not known");
  });

  it("both languages have every key with the same placeholders", () => {
    for (const k of ["ctx.small.title", "ctx.small.body", "ctx.small.reply", "ctx.small.unknown", "ctx.small.open"] as MsgKey[]) {
      const a = DICTIONARIES.en[k];
      const b = DICTIONARIES.uk[k];
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      expect(ph(b)).toBe(ph(a));
    }
  });
});
