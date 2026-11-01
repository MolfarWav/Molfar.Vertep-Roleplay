// The entry panel's pure logic: the three-way "When it appears" mapping onto the stored status, the key chips, the
// recursion wait value, and the one-line summary each fold shows while closed. English is checked here; the Ukrainian
// strings are covered by the i18n parity test.
import { describe, expect, it } from "bun:test";
import { t, type MsgKey, type Vars } from "../src/lib/i18n";
import {
  addKeys, appearanceOf, commitKeyDraft, groupsSummary, hasChainLimits, matchSummary, onlyWhenSummary, parseKeys, removeKey,
  serializeKeys, splitKeyDraft, staysSummary, statusOf, triOf, triValue, waitsOf, waitsValue, whereSummary, type Tr,
} from "../src/lib/lore-entry";

const en: Tr = (key: MsgKey, vars?: Vars) => t(key, "en", vars);

describe("When it appears", () => {
  it("maps the three choices onto the stored status and back", () => {
    expect(statusOf("always")).toBe("constant");
    expect(statusOf("keys")).toBe("normal");
    expect(statusOf("meaning")).toBe("vectorized");
    for (const s of ["constant", "normal", "vectorized"] as const) expect(statusOf(appearanceOf(s))).toBe(s);
  });

  it("an imported status the editor does not name reads as When mentioned", () => {
    expect(appearanceOf("something-else" as never)).toBe("keys");
  });
});

describe("keys as chips", () => {
  it("parses a comma-separated text: trimmed, empty parts dropped", () => {
    expect(parseKeys(" tide ,, low water ,")).toEqual(["tide", "low water"]);
    expect(parseKeys("")).toEqual([]);
  });

  it("serializes back to the comma text, and parse of serialize is the same list", () => {
    const keys = ["tide", "low water"];
    expect(serializeKeys(keys)).toBe("tide, low water");
    expect(parseKeys(serializeKeys(keys))).toEqual(keys);
  });

  it("a comma while typing turns the parts before it into keys and keeps the rest in the box", () => {
    expect(splitKeyDraft("tide, low")).toEqual({ add: ["tide"], rest: " low" });
    expect(splitKeyDraft("tide")).toEqual({ add: [], rest: "tide" });
    expect(splitKeyDraft("a, b,")).toEqual({ add: ["a", "b"], rest: "" });
  });

  it("Enter commits everything in the box, commas or not", () => {
    expect(commitKeyDraft("harbour guild, dockmaster")).toEqual(["harbour guild", "dockmaster"]);
  });

  it("adds keys once: no duplicates, no blanks, the order kept", () => {
    expect(addKeys(["tide"], [" tide ", "", "low water"])).toEqual(["tide", "low water"]);
    expect(addKeys(["tide"], ["Tide"])).toEqual(["tide", "Tide"]);
  });

  it("removes the key at an index and leaves the rest in order", () => {
    expect(removeKey(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(removeKey(["a"], 0)).toEqual([]);
  });
});

describe("recursion wait", () => {
  it("true is level 1, a number is that level, false is off; 0 writes false back", () => {
    expect(waitsOf(true)).toBe(1);
    expect(waitsOf(3)).toBe(3);
    expect(waitsOf(false)).toBe(0);
    expect(waitsValue(0)).toBe(false);
    expect(waitsValue(2)).toBe(2);
  });
});

describe("tri-state", () => {
  it("Book default is null; On and Off are the booleans", () => {
    expect(triOf(null)).toBe("book");
    expect(triOf(true)).toBe("on");
    expect(triOf(false)).toBe("off");
    expect(triValue("book")).toBeNull();
    expect(triValue("on")).toBe(true);
    expect(triValue("off")).toBe(false);
  });
});

describe("fold summaries (closed folds show one line)", () => {
  it("Where it goes: position, role, order; the budget note only when set", () => {
    expect(whereSummary({ positionLabel: "after char", roleLabel: null, order: 100, ignoreBudget: false }, en)).toBe("after char · order 100");
    expect(whereSummary({ positionLabel: "@4 depth", roleLabel: "system", order: 5, ignoreBudget: true }, en)).toBe("@4 depth · system · order 5 · ignores budget");
  });

  it("Only when: the defaults read as no second keys, any speaker, 100%", () => {
    const base = { secondaryCount: 0, probability: 100, speakers: [], speakerExclude: false, tags: [], kinds: [] };
    expect(onlyWhenSummary(base, en)).toBe("no second keys · any speaker · 100%");
    expect(onlyWhenSummary({ ...base, secondaryCount: 1 }, en)).toBe("1 second key · any speaker · 100%");
    expect(onlyWhenSummary({ ...base, secondaryCount: 2, speakers: ["Mira"], speakerExclude: true, tags: ["guard"], kinds: ["Normal"], probability: 40 }, en))
      .toBe("2 second keys · all but Mira · tags guard · replies Normal · 40%");
    expect(onlyWhenSummary({ ...base, speakers: ["Mira", "Tomas"] }, en)).toBe("no second keys · only Mira, Tomas · 100%");
  });

  it("How long it stays: each part says what is set, or that it is not", () => {
    expect(staysSummary({ sticky: 0, cooldown: 0, delay: 0 }, en)).toBe("no sticky · no cooldown · no delay");
    expect(staysSummary({ sticky: 3, cooldown: 0, delay: 2 }, en)).toBe("sticky 3 · no cooldown · delay 2");
  });

  it("Groups and chains: the group name or none, then whether chains are limited", () => {
    expect(groupsSummary({ group: "", chainLimits: false }, en)).toBe("no group · chains allowed");
    expect(groupsSummary({ group: " weather ", chainLimits: true }, en)).toBe("group weather · chain limits");
  });

  it("How its keys match: book defaults until something is overridden", () => {
    const none = { caseSensitive: null, wholeWords: null, wordForms: null, scanDepth: null, sources: [], automationId: "" };
    expect(matchSummary(none, en)).toBe("book defaults");
    expect(matchSummary({ ...none, caseSensitive: true, scanDepth: 4, sources: ["description"], automationId: "x" }, en))
      .toBe("Case sensitive: On · scan depth 4 · also in description · automation id");
    expect(matchSummary({ ...none, wholeWords: false }, en)).toBe("Whole words: Off");
  });

  it("a chain limit is a non-recursable entry, a prevent-further one, or a wait above zero", () => {
    const plain = { nonRecursable: false, preventFurtherRecursion: false, delayUntilRecursion: false };
    expect(hasChainLimits(plain)).toBe(false);
    expect(hasChainLimits({ ...plain, nonRecursable: true })).toBe(true);
    expect(hasChainLimits({ ...plain, preventFurtherRecursion: true })).toBe(true);
    expect(hasChainLimits({ ...plain, delayUntilRecursion: 2 })).toBe(true);
    expect(hasChainLimits({ ...plain, delayUntilRecursion: true })).toBe(true);
  });
});
