/**
 * The checker's codes in words (src/lib/agent-check-text.ts): every code the checker can emit has a sentence and a way out in
 * both languages, the card is named, and a code nobody wrote a line for falls back to the checker's own message.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { DICTIONARIES, t as tr, type Lang, type MsgKey } from "../src/lib/i18n";
import { CHECK_CODES, cardInMessage, explainCheck, isKnownCheckCode } from "../src/lib/agent-check-text";

const tin = (lang: Lang) => (key: MsgKey, vars?: Record<string, string | number>) => tr(key, lang, vars);
const codesIn = (file: string) => new Set([...fs.readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/['"`]([EW]_[A-Z_]+)['"`]/g)].map((m) => m[1]));

describe("every checker code has words", () => {
  it("the code list covers the checker in the app and the copy in the plugin", () => {
    const known = new Set<string>(CHECK_CODES);
    for (const file of ["../src/canvas-kit/boards/agent-check.js", "../plugins/agents/plugin.js"]) {
      for (const c of codesIn(file)) expect(known.has(c), `${c} in ${file}`).toBe(true);
    }
  });
  it("each code has a sentence and a fix in en and uk (the template codes use their own sentences)", () => {
    for (const lang of ["en", "uk"] as const) {
      for (const code of CHECK_CODES) {
        const x = explainCheck({ code, message: `"Ask": something {{x}}` , node: "n1" }, tin(lang));
        expect(x.what.length, `${lang} ${code} what`).toBeGreaterThan(10);
        if (!code.startsWith("E_TPL_")) expect(x.fix.length, `${lang} ${code} fix`).toBeGreaterThan(5);
        expect(x.what, `${lang} ${code}`).not.toContain("fg.ck.");
        expect(x.what, `${lang} ${code}`).not.toContain("{where}");
      }
    }
  });
  it("no key of the check texts is left without a Ukrainian line", () => {
    for (const k of Object.keys(DICTIONARIES.en).filter((x) => x.startsWith("fg.ck."))) expect((DICTIONARIES.uk as Record<string, string>)[k]).toBeTruthy();
  });
});

describe("explainCheck", () => {
  const en = tin("en");
  it("names the card from the lookup, else from the message, else says 'a card'", () => {
    const item = { code: "E_UNWIRED", message: 'Input "text" on "Ask the model" has no wire', node: "n2" };
    expect(explainCheck(item, en, "Plan").what).toBe("Card “Plan” has an input with no wire.");
    expect(explainCheck({ code: "E_UNWIRED", message: '"Ask the model": needs a wire', node: "n2" }, en).what).toContain("“Ask the model”");
    expect(explainCheck({ code: "E_UNWIRED", message: "no quotes here", node: "n2" }, en).what).toBe("A card has an input with no wire.");
  });
  it("a card with no node is not guessed from the message", () => {
    expect(explainCheck({ code: "E_UNWIRED", message: '"Ask": x' }, en).what).toStartWith("A card");
  });
  it("keeps the checker's words only where they hold numbers or names", () => {
    expect(explainCheck({ code: "E_PARAM", message: "count is a whole number from 1 to 20", node: "n1" }, en).detail).toBe("count is a whole number from 1 to 20");
    expect(explainCheck({ code: "E_CYCLE", message: "The wires make a loop" }, en).detail).toBeNull();
  });
  it("template codes carry the slot that is wrong", () => {
    const x = explainCheck({ code: "E_TPL_FIELD", message: "Template: {{nope}} is not a field here" }, en);
    expect(x.what).toContain("{{nope}}");
    expect(x.fix).toBe("");
  });
  it("an unknown code shows the checker's message as it is", () => {
    expect(isKnownCheckCode("E_NEW_ONE")).toBe(false);
    expect(explainCheck({ code: "E_NEW_ONE", message: "Something new" }, en)).toEqual({ what: "Something new", fix: "", detail: null });
  });
  it("cardInMessage reads a leading quoted name only", () => {
    expect(cardInMessage('"Ask": x')).toBe("Ask");
    expect(cardInMessage('Wire w1 points at "Ask"')).toBeUndefined();
  });
});
