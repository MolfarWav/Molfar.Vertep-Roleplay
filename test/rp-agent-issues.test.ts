/**
 * The checker's codes in plain words (src/lib/agent-issues.ts): every code the checker can emit has a sentence and a way
 * out in English and Ukrainian, the card name is filled in, and a code with no text falls back to the checker's message.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { ISSUE_CODES, issueText } from "../src/lib/agent-issues";
import { t as tr, type Lang, type MsgKey, type Vars } from "../src/lib/i18n";

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
// every code written in the checker's sources; the template codes (E_TPL_*) have their own texts in the panel form
const emitted = (): string[] => {
  const src = [read("../plugins/agents/plugin.js"), read("../src/lib/forge.ts"), read("../src/lib/agent-template.ts")].join("\n");
  return [...new Set([...src.matchAll(/['"`]((?:E|W)_[A-Z_]+)['"`]/g)].map((m) => m[1]!))].filter((c) => !c.startsWith("E_TPL_")).sort();
};
const tFor = (lang: Lang) => (key: MsgKey, vars?: Vars) => tr(key, lang, vars);
const words = (s: string) => s.trim().split(/\s+/).length;

describe("issueText", () => {
  it("covers every code the checker can emit (a new code fails here)", () => {
    expect([...ISSUE_CODES].sort()).toEqual(emitted());
  });

  for (const lang of ["en", "uk"] as Lang[]) {
    it(`gives each code a short sentence and a way out in ${lang}`, () => {
      for (const code of ISSUE_CODES) {
        const s = issueText(code, tFor(lang), { card: "Pick a mood" });
        expect(s.plain, code).toBe(true);
        for (const part of [s.what, s.fix]) {
          expect(part.trim().length, code).toBeGreaterThan(8);
          expect(part, code).not.toMatch(/\{\w+/);
          expect(part, code).not.toContain("ag.issue.");
          for (const sentence of part.split(/(?<=[.!?])\s+/)) expect(words(sentence), `${code}: ${sentence}`).toBeLessThanOrEqual(25);
        }
      }
    });
  }

  it("names the card when it is known, and says 'this card' when not", () => {
    for (const lang of ["en", "uk"] as Lang[]) {
      expect(issueText("E_UNWIRED", tFor(lang), { card: "Scene plan" }).what).toContain("Scene plan");
      const generic = issueText("E_UNWIRED", tFor(lang)).what;
      expect(generic).toContain(tr("ag.issue.thisCard", lang));
      expect(generic).not.toContain("{card}");
    }
  });

  it("falls back to the checker's message for a code with no text", () => {
    expect(issueText("E_TPL_FIELD", tFor("en")).plain).toBe(false);
    expect(issueText("E_SOMETHING_NEW", tFor("uk")).plain).toBe(false);
  });
});
