// Who speaks up in a group: the card's talkativeness, else a guess from its text. The engine and the
// group editor each carry the rule (plugins cannot import src/); this keeps them the same.
import { describe, expect, it } from "bun:test";
import { cardTalkativeness, guessTalkativeness, TALK_DOWN, TALK_UP } from "../src/lib/talkativeness.ts";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { guessTalkativeness: (t: string) => number; talkativeness: (c: unknown) => number };

const TEXTS = [
  "",
  "A shy, quiet librarian. Reserved with strangers.",
  "Loud, cheerful and chatty; the life of every party, confident and playful.",
  "Мовчазна, сором’язлива дівчина, стримана з усіма.",
  "Балакучий і веселий бард, зухвалий жартівник.",
  "Застенчивая и молчаливая, но очень общительная с друзьями.",
  "Unsociable and cold.",
];

describe("talkativeness", () => {
  it("the engine and the app guess the same", () => {
    for (const t of TEXTS) expect(eng.guessTalkativeness(t)).toBe(guessTalkativeness(t));
  });
  it("shy cards speak less, chatty cards more, in every language", () => {
    expect(guessTalkativeness(TEXTS[0])).toBe(0.5);
    expect(guessTalkativeness(TEXTS[1])).toBeLessThan(0.5);
    expect(guessTalkativeness(TEXTS[2])).toBeGreaterThan(0.7);
    expect(guessTalkativeness(TEXTS[3])).toBeLessThan(0.5);
    expect(guessTalkativeness(TEXTS[4])).toBeGreaterThan(0.5);
    expect(guessTalkativeness(TEXTS[6])).toBeLessThan(0.5);
  });
  it("a card's own value wins, except SillyTavern's usual 0.5; the group's wins over both", () => {
    expect(cardTalkativeness("0.8")).toBe(0.8);
    expect(cardTalkativeness("0.5")).toBeNull();
    expect(cardTalkativeness(undefined)).toBeNull();
    const shy = { description: "", personality: TEXTS[1] };
    expect(eng.talkativeness({ ...shy, extensions: { talkativeness: "0.5" } })).toBe(guessTalkativeness(TEXTS[1]));
    expect(eng.talkativeness({ ...shy, extensions: { talkativeness: 0.9 } })).toBe(0.9);
    expect(eng.talkativeness({ ...shy, extensions: { talkativeness: 0.5 }, __talkSet: true })).toBe(0.5);
  });
  it("lists hold no duplicates", () => {
    expect(new Set(TALK_UP).size).toBe(TALK_UP.length);
    expect(new Set(TALK_DOWN).size).toBe(TALK_DOWN.length);
  });
});
