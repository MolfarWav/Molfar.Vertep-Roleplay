/**
 * Souls on the card (src/lib/soul.ts): the round trip through the card format,
 * the ranges of the contract, the spectrum bands and the draft for Molfar.
 */
import { describe, expect, it } from "bun:test";
// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { cardToCharacter, characterToCard } = await import("../src/lib/engine");
import {
  clampSoul, molfarDraftText, minorOf, soulsOf, spectrumBand, stableJson, validSoulName, withMinor, withSouls,
  type Soul, type SoulMap,
} from "../src/lib/soul";
import { ASK_MOLFAR_MAX } from "../src/lib/shell-bridge";
import { DICTIONARIES } from "../src/lib/i18n";
import { SPECTRA, TRAITS, STATS, CLASSES, PRONOUNS } from "../src/lib/soul";

const medli: Soul = {
  class: "ally",
  pronouns: "she",
  traits: { shyness: 72 },
  futureField: { keep: "me" },
  locked: true,
  ratedBy: "user",
};

const baseCard = () => ({
  spec: "chara_card_v2",
  name: "Nest",
  description: "d",
  extensions: { talkativeness: "0.5", other_mod: { a: 1 } },
  nickname: "x",
});

/** card → character → patch → card → character, like a save and a reload. */
function roundTrip(char: ReturnType<typeof cardToCharacter>, souls: SoulMap) {
  const patched = { ...char, ...withSouls(char, souls) };
  return cardToCharacter(characterToCard(patched) as never, patched.id);
}

describe("soulsOf", () => {
  it("is empty for a card without souls and tolerates junk", () => {
    expect(soulsOf({})).toEqual({});
    expect(soulsOf({ cardExtras: { extensions: "no" } })).toEqual({});
    expect(soulsOf({ cardExtras: { extensions: { molfar_soul: [] } } })).toEqual({});
    expect(soulsOf({ cardExtras: { extensions: { molfar_soul: { characters: { A: "x", B: { class: "ally" } } } } } }))
      .toEqual({ B: { class: "ally" } });
  });

  it("never lets a soul called __proto__ in", () => {
    const raw = JSON.parse('{"extensions":{"molfar_soul":{"characters":{"__proto__":{"class":"ally"},"Ok":{}}}}}');
    expect(Object.keys(soulsOf({ cardExtras: raw }))).toEqual(["Ok"]);
    expect(validSoulName("__proto__")).toBe(false);
    expect(validSoulName("  ")).toBe(false);
    expect(validSoulName("Medli")).toBe(true);
  });
});

describe("withSouls round trip", () => {
  it("keeps the souls, the other extensions keys, the other card keys and unknown soul keys", () => {
    const char = cardToCharacter(baseCard() as never, "nest");
    const again = roundTrip(char, { Medli: medli });
    expect(soulsOf(again)).toEqual({ Medli: medli });
    expect((soulsOf(again).Medli as Soul).futureField).toEqual({ keep: "me" });
    const ext = again.cardExtras!.extensions as Record<string, unknown>;
    expect(ext.talkativeness).toBe("0.5");
    expect(ext.other_mod).toEqual({ a: 1 });
    expect((ext.molfar_soul as { v: number }).v).toBe(1);
    expect(again.cardExtras!.nickname).toBe("x");
  });

  it("saving twice keeps everything", () => {
    const char = cardToCharacter(baseCard() as never, "nest");
    const once = roundTrip(char, { Medli: medli });
    const twice = roundTrip(once, { Medli: medli, Garrett: { class: "neutral" } });
    expect(Object.keys(soulsOf(twice))).toEqual(["Medli", "Garrett"]);
    const ext = twice.cardExtras!.extensions as Record<string, unknown>;
    expect(ext.other_mod).toEqual({ a: 1 });
    expect(ext.talkativeness).toBe("0.5");
  });

  it("works on a card with no extras at all", () => {
    const char = cardToCharacter({ spec: "chara_card_v2", name: "Bare" } as never, "bare");
    expect(char.cardExtras).toBeUndefined();
    const again = roundTrip(char, { Bare: { class: "romantic" } });
    expect(soulsOf(again)).toEqual({ Bare: { class: "romantic" } });
  });

  it("keeps unknown keys of molfar_soul itself", () => {
    const char = cardToCharacter({ ...baseCard(), extensions: { molfar_soul: { v: 1, characters: { A: {} }, rings: [1] } } } as never, "n");
    const again = roundTrip(char, { A: { class: "ally" } });
    const mol = (again.cardExtras!.extensions as Record<string, any>).molfar_soul;
    expect(mol.rings).toEqual([1]);
    expect(mol.characters.A.class).toBe("ally");
  });

  it("no souls removes molfar_soul and keeps the rest of extensions", () => {
    const char = cardToCharacter(baseCard() as never, "nest");
    const withOne = roundTrip(char, { Medli: medli });
    const none = roundTrip(withOne, {});
    const ext = none.cardExtras!.extensions as Record<string, unknown>;
    expect("molfar_soul" in ext).toBe(false);
    expect(ext.other_mod).toEqual({ a: 1 });
    expect(soulsOf(none)).toEqual({});
  });

  it("no souls drops extensions when molfar_soul was all it held", () => {
    const char = cardToCharacter({ spec: "chara_card_v2", name: "Bare", extensions: { molfar_soul: { v: 1, characters: { A: {} } } } } as never, "bare");
    const none = roundTrip(char, {});
    expect(none.cardExtras).toBeUndefined();
    expect("extensions" in characterToCard(none)).toBe(false);
  });

  it("does not touch an empty extensions object it did not fill", () => {
    const char = cardToCharacter({ spec: "chara_card_v2", name: "Bare", extensions: {} } as never, "bare");
    expect(withSouls(char, {}).cardExtras).toEqual(char.cardExtras);
  });
});

describe("clampSoul", () => {
  it("clamps ranges to integers and keeps unknown keys", () => {
    const s = clampSoul({
      class: "hostile",
      start: { trust: 99, comfort: -99, attraction: 3.6, hostility: 250 },
      traits: { shyness: 140, dominance: -4, patience: 50.4 },
      spectra: { introvert_extrovert: 101, pessimist_optimist: -1 },
      pulseBase: { arousal: 400 },
      mystery: 7,
    });
    expect(s.start).toEqual({ trust: 20, comfort: -20, attraction: 4, hostility: 100 });
    expect(s.traits).toEqual({ shyness: 100, dominance: 0, patience: 50 });
    expect(s.spectra).toEqual({ introvert_extrovert: 100, pessimist_optimist: 0 });
    expect(s.pulseBase).toEqual({ arousal: 100 });
    expect(s.mystery).toBe(7);
  });

  it("drops hostility outside the hostile class, bad enums and non-finite numbers", () => {
    const s = clampSoul({ class: "ally", start: { hostility: 30, trust: Number.NaN } as never, pronouns: "xe" as never });
    expect(s.start).toEqual({});
    expect(s.pronouns).toBeUndefined();
    expect(clampSoul({ class: "weird" as never }).class).toBeUndefined();
  });

  it("limits rules, aliases and coping", () => {
    const rules = Array.from({ length: 20 }, (_, i) => ({ cue: ` cue ${i} `, event: "raised_voice", stat: "comfort", x: i === 0 ? 9 : 1.5 }));
    const s = clampSoul({
      triggers: [...rules, { cue: "  ", event: "e", stat: "trust", x: 2 }],
      values: [{ cue: "kept word", event: "kept_promise", stat: "trust", x: 0.2 }],
      aliases: ["A", "a", " B ", "", ...Array.from({ length: 20 }, (_, i) => `n${i}`)],
      coping: "x".repeat(500),
    });
    expect(s.triggers).toHaveLength(12);
    expect(s.triggers![0]).toMatchObject({ cue: "cue 0", x: 3 });
    expect(s.values![0]!.x).toBe(1);
    expect(s.aliases).toHaveLength(16);
    expect(s.aliases!.slice(0, 2)).toEqual(["A", "B"]);
    expect(s.coping).toHaveLength(300);
  });

  it("leaves a clean soul alone", () => {
    expect(clampSoul(medli)).toEqual(medli);
  });
});

describe("spectrumBand", () => {
  it("has its edges where the contract puts them", () => {
    expect([0, 24, 25, 44, 45, 55, 56, 75, 76, 100].map(spectrumBand)).toEqual([
      "farLeft", "farLeft", "left", "left", "middle", "middle", "right", "right", "farRight", "farRight",
    ]);
  });
});

describe("molfarDraftText", () => {
  const character = { id: "nest", name: "Nest" };
  it("names the card, the sources and the one file to write", () => {
    const text = molfarDraftText({ character, names: ["Garrett"], lorebookIds: ["book1"], chatIds: ["c1", "c2"] });
    expect(text).toContain('"Nest" (id nest)');
    expect(text).toContain("Characters: Garrett.");
    expect(text).toContain("data/characters/nest/card.json");
    expect(text).toContain("book1");
    expect(text).toContain("data/dashboard/soul-drafts/nest.json");
    expect(text).toContain('"by": "molfar"');
    expect(text.endsWith(" ")).toBe(true);
  });

  it("says 'its main characters' when no names are given", () => {
    expect(molfarDraftText({ character, names: [], lorebookIds: [], chatIds: [] })).toContain("Characters: its main characters.");
  });

  it("stays within the limit however much it is given", () => {
    const text = molfarDraftText({
      character: { id: "n".repeat(60), name: "N".repeat(200) },
      names: Array.from({ length: 200 }, (_, i) => `Character with a long name number ${i}`),
      lorebookIds: Array.from({ length: 100 }, (_, i) => `lorebook-${i}-${"x".repeat(50)}`),
      chatIds: ["a", "b", "c", "d", "e"],
    });
    expect(text.length).toBeLessThanOrEqual(ASK_MOLFAR_MAX);
    expect(text).toContain("data/dashboard/soul-drafts/");
  });
});

describe("stableJson", () => {
  it("ignores key order and undefined values", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] }, u: undefined })).toBe(stableJson({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }));
  });
});

describe("soul strings", () => {
  it("every stat, trait, spectrum word, class and pronoun has an English and a Ukrainian label", () => {
    const keys = [
      ...STATS.map((s) => `soul.stat.${s}`),
      ...TRAITS.map((s) => `soul.trait.${s}`),
      ...SPECTRA.flatMap(([, l, r]) => [`soul.spec.${l}`, `soul.spec.${r}`]),
      ...CLASSES.map((s) => `soul.class.${s}`),
      ...PRONOUNS.map((s) => `soul.pron.${s}`),
    ];
    for (const k of keys) {
      expect((DICTIONARIES.en as Record<string, string>)[k], k).toBeTruthy();
      expect((DICTIONARIES.uk as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});

describe("minor names", () => {
  const withBoth = () => {
    const char = cardToCharacter({ ...baseCard(), extensions: { ...baseCard().extensions, molfar_soul: { v: 1, characters: { A: { class: "ally" } }, rings: [1] } } } as never, "n");
    return char;
  };

  it("minorOf reads the list tolerantly: trimmed, unique case-insensitively, at most 64", () => {
    expect(minorOf({})).toEqual([]);
    expect(minorOf({ cardExtras: { extensions: { molfar_soul: { minor: "no" } } } })).toEqual([]);
    expect(minorOf({ cardExtras: { extensions: { molfar_soul: { minor: [" Guard ", "guard", "", 3, "Cook"] } } } })).toEqual(["Guard", "Cook"]);
    const many = Array.from({ length: 80 }, (_, i) => `n${i}`);
    expect(minorOf({ cardExtras: { extensions: { molfar_soul: { minor: many } } } })).toHaveLength(64);
  });

  it("withMinor keeps characters, unknown keys and other extensions", () => {
    const char = withBoth();
    const next = { ...char, ...withMinor(char, [" стражник ", "Стражник", "Cook"]) };
    expect(minorOf(next)).toEqual(["стражник", "Cook"]);
    expect(soulsOf(next)).toEqual({ A: { class: "ally" } });
    const ext = next.cardExtras!.extensions as Record<string, any>;
    expect(ext.other_mod).toEqual({ a: 1 });
    expect(ext.molfar_soul.rings).toEqual([1]);
  });

  it("withSouls keeps minor", () => {
    const char = { ...withBoth(), ...withMinor(withBoth(), ["Cook"]) };
    const saved = { ...char, ...withSouls(char, { A: { class: "ally" }, B: {} }) };
    expect(minorOf(saved)).toEqual(["Cook"]);
    const none = { ...saved, ...withSouls(saved, {}) };
    expect(minorOf(none)).toEqual(["Cook"]);
    expect(soulsOf(none)).toEqual({});
  });

  it("an empty list drops minor, and the bag when nothing else is in it", () => {
    const char = cardToCharacter({ spec: "chara_card_v2", name: "Bare" } as never, "bare");
    const one = { ...char, ...withMinor(char, ["Cook"]) };
    expect(minorOf(one)).toEqual(["Cook"]);
    const cleared = { ...one, ...withMinor(one, []) };
    expect(cleared.cardExtras).toBeUndefined();
    const kept = { ...withBoth(), ...withMinor(withBoth(), []) };
    expect(soulsOf(kept)).toEqual({ A: { class: "ally" } });
  });

  it("round-trips through the card format", () => {
    const char = cardToCharacter(baseCard() as never, "nest");
    const again = cardToCharacter(characterToCard({ ...char, ...withMinor(char, ["Cook"]) }) as never, "nest");
    expect(minorOf(again)).toEqual(["Cook"]);
    expect((again.cardExtras!.extensions as Record<string, unknown>).other_mod).toEqual({ a: 1 });
  });
});
