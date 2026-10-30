/**
 * Sprite sets (issues #169 / #170): a card's sprites can belong to a character (a voice of a Narrator card) and an
 * outfit. The pure parts: reading a file name, resolving the sprite for a speaker and an outfit, picking the
 * speaker of a Narrator message, and planning a batch of files.
 */
import { describe, it, expect } from "bun:test";
import {
  detectExpressionLabels,
  emotionAssetName,
  hasSpriteSets,
  outfitsIn,
  parseEmotionAssetName,
  parseSpriteFile,
  resolveExpressionSprite,
  resolveSprite,
  spriteKey,
} from "../src/lib/expressions.js";
import { cardVoices } from "../src/lib/dialogue-voices.js";
import { lastSpeaker, pickSprite } from "../src/lib/sprite-pick.js";
import { batchFromNames, batchGroups, countClashes, mergeSprites, planBatch, setGroup, setSkip } from "../src/lib/sprite-batch.js";

const owners = [
  { label: "Aria", key: "Aria" },
  { label: "Bo Lin", key: "Bo Lin" },
  { label: "Narrator Card", key: "" },
];
const sp = (name: string, character?: string, outfit?: string) => ({ name, url: `u:${character ?? ""}/${outfit ?? "default"}/${name}`, ...(character ? { character } : {}), ...(outfit ? { outfit } : {}) });

describe("parseSpriteFile", () => {
  it("reads character, outfit and emotion", () => {
    expect(parseSpriteFile("Aria_joy_dress.png", owners)).toMatchObject({ character: "Aria", outfit: "dress", emotion: "joy", copy: null, known: true });
    expect(parseSpriteFile("Aria-dress-joy.webp", owners)).toMatchObject({ character: "Aria", outfit: "dress", emotion: "joy" });
    expect(parseSpriteFile("joy_pyjamas.png", owners)).toMatchObject({ character: "", outfit: "pyjamas", emotion: "joy" });
    expect(parseSpriteFile("joy.png", owners)).toMatchObject({ character: "", outfit: "", emotion: "joy" });
    expect(parseSpriteFile("Bo_Lin_sadness.png", owners)).toMatchObject({ character: "Bo Lin", outfit: "", emotion: "sadness" });
    expect(parseSpriteFile("Bo_sadness.png", owners)).toMatchObject({ character: "Bo Lin", emotion: "sadness" });
  });

  it("a trailing number is a duplicate marker, never an outfit", () => {
    expect(parseSpriteFile("joy2.png")).toMatchObject({ emotion: "joy", outfit: "", copy: 2 });
    expect(parseSpriteFile("joy (1).png")).toMatchObject({ emotion: "joy", outfit: "", copy: 1 });
    expect(parseSpriteFile("joy_3.png")).toMatchObject({ emotion: "joy", outfit: "", copy: 3 });
    expect(parseSpriteFile("Aria_joy_dress2.png", owners)).toMatchObject({ character: "Aria", outfit: "dress", emotion: "joy", copy: 2 });
    // numbers in front of the name are packaging, not an outfit
    expect(parseSpriteFile("001_joy.png")).toMatchObject({ emotion: "joy", outfit: "" });
  });

  it("the card's own name is the card itself, not an outfit", () => {
    expect(parseSpriteFile("Narrator_Card_anger.png", owners)).toMatchObject({ character: "", outfit: "", emotion: "anger" });
  });

  it("an unknown word becomes the outfit, an unknown emotion the last word", () => {
    expect(parseSpriteFile("blush_school_uniform.png")).toMatchObject({ emotion: "blush", outfit: "school uniform", known: true });
    expect(parseSpriteFile("Aria_wink.png", owners)).toMatchObject({ character: "Aria", emotion: "wink", outfit: "", known: false });
    expect(parseSpriteFile("sprites/expression_joy.png")).toMatchObject({ emotion: "joy", outfit: "" });
    expect(parseSpriteFile("Haha.png").emotion).toBe("haha");
  });

  it("a character is kept when it is the only word", () => {
    // a card with a voice called Joy: "joy.png" is the emotion
    expect(parseSpriteFile("joy.png", [{ label: "Joy", key: "Joy" }])).toMatchObject({ character: "", emotion: "joy" });
  });

  it("reads Cyrillic names", () => {
    expect(parseSpriteFile("Орися_joy_плаття.png", [{ label: "Орися", key: "Орися" }])).toMatchObject({ character: "Орися", outfit: "плаття", emotion: "joy" });
  });
});

describe("resolveSprite", () => {
  const girl = [sp("neutral", "Aria"), sp("joy", "Aria"), sp("neutral", "Aria", "pyjamas"), sp("sadness", "Aria", "pyjamas"), sp("neutral", "Bo Lin")];

  it("an old card (no fields) resolves exactly as before", () => {
    const old = [{ name: "joy", url: "a" }, { name: "neutral", url: "b" }, { name: "anger", url: "c" }];
    for (const text of ["She beams.", "He snarls.", "Nothing here."]) {
      const labels = detectExpressionLabels(text);
      expect(resolveSprite(labels, old)).toEqual(resolveExpressionSprite(labels, old));
    }
    expect(hasSpriteSets(old)).toBe(false);
  });

  it("takes the character's own pool", () => {
    expect(resolveSprite(["joy"], girl, { character: "Aria" })?.url).toBe("u:Aria/default/joy");
    expect(resolveSprite(["joy"], girl, { character: "Bo Lin" })?.url).toBe("u:Bo Lin/default/neutral");
    // case does not matter
    expect(resolveSprite(["joy"], girl, { character: "aria" })?.url).toBe("u:Aria/default/joy");
  });

  it("the outfit dominates the emotion", () => {
    // pyjamas has no joy: the neutral of the pyjamas, not the dress's joy
    expect(resolveSprite(["joy"], girl, { character: "Aria", outfit: "pyjamas" })?.url).toBe("u:Aria/pyjamas/neutral");
    expect(resolveSprite(["sadness"], girl, { character: "Aria", outfit: "Pyjamas" })?.url).toBe("u:Aria/pyjamas/sadness");
  });

  it("falls back: unknown outfit → default → any outfit", () => {
    expect(resolveSprite(["joy"], girl, { character: "Aria", outfit: "armor" })?.url).toBe("u:Aria/default/joy");
    const onlyDress = [sp("joy", "Aria", "dress"), sp("neutral", "Aria", "dress")];
    expect(resolveSprite(["joy"], onlyDress, { character: "Aria" })?.url).toBe("u:Aria/dress/joy");
  });

  it("shared sprites serve a character that has none of its own", () => {
    const mixed = [sp("neutral"), sp("joy"), sp("neutral", "Aria")];
    expect(resolveSprite(["joy"], mixed, { character: "Cy" })?.url).toBe("u:/default/joy");
    expect(resolveSprite(["joy"], mixed, { character: "Aria" })?.url).toBe("u:Aria/default/neutral");
    expect(resolveSprite(["joy"], mixed)?.url).toBe("u:/default/joy");
  });

  it("the card itself has no sprites when everything belongs to a character", () => {
    expect(resolveSprite(["joy"], girl, {})).toBeNull();
    expect(resolveSprite(["joy"], [], { character: "Aria" })).toBeNull();
  });

  it("the default expression applies inside the chosen outfit", () => {
    const set = [sp("happy", "Aria", "dress"), sp("calm", "Aria", "dress")];
    expect(resolveSprite([], set, { character: "Aria", outfit: "dress", defaultExpression: "calm" })?.name).toBe("calm");
  });

  it("lists outfits in order of appearance", () => {
    expect(outfitsIn(girl.filter((s) => s.character === "Aria"))).toEqual(["default", "pyjamas"]);
  });
});

describe("pickSprite (a Narrator card)", () => {
  const voices = cardVoices({ voices: [{ name: "Aria", color: "" }, { name: "Bo", color: "" }] });
  const card = {
    expressions: [sp("neutral", "Aria"), sp("joy", "Aria"), sp("neutral", "Bo"), sp("anger", "Bo"), sp("neutral", "Aria", "pyjamas"), sp("neutral"), sp("fear")],
    defaultExpression: "neutral",
  };

  it("shows the voice that speaks last, with its own emotion", () => {
    const text = "Aria: She grins, delighted.\nBo: He snarls, furious.";
    expect(lastSpeaker(text, voices, card.expressions)?.name).toBe("Bo");
    expect(pickSprite(text, card, voices)?.sprite.url).toBe("u:Bo/default/anger");
    const flipped = "Bo: He snarls, furious.\nAria: She grins, delighted.";
    expect(pickSprite(flipped, card, voices)?.sprite.url).toBe("u:Aria/default/joy");
  });

  it("the emotion comes from the speaker's lines, not the whole message", () => {
    const text = "Bo: He snarls, furious.\nThe rain fell.\nAria: Hmm, fine.";
    // Aria's own lines say nothing: the whole message decides (anger), but inside Aria's set there is none → neutral
    expect(pickSprite(text, card, voices)?.sprite.url).toBe("u:Aria/default/neutral");
  });

  it("a message without an attributable line uses the shared sprites", () => {
    const p = pickSprite("The wind howled and she was afraid.", card, voices);
    expect(p?.character).toBe("");
    expect(p?.sprite.url).toBe("u:/default/fear");
  });

  it("an outfit chosen for the chat or set on the card applies to the speaker", () => {
    const text = "Aria: She grins, delighted.";
    expect(pickSprite(text, card, voices, { Aria: "pyjamas" })?.sprite.url).toBe("u:Aria/pyjamas/neutral");
    expect(pickSprite(text, { ...card, outfit: "pyjamas" }, voices)?.sprite.url).toBe("u:Aria/pyjamas/neutral");
    expect(pickSprite(text, card, voices, { Aria: "pyjamas" })?.outfits).toEqual(["default", "pyjamas"]);
    // another speaker's choice does not leak
    expect(pickSprite(text, card, voices, { Bo: "pyjamas" })?.sprite.url).toBe("u:Aria/default/joy");
  });

  it("a voice with no sprites of its own is passed over", () => {
    const withCy = cardVoices({ voices: [{ name: "Aria", color: "" }, { name: "Cy", color: "" }] });
    expect(pickSprite("Aria: Hello.\nCy: Hi.", card, withCy)?.character).toBe("Aria");
  });

  it("an old card with voices still resolves as before", () => {
    const old = { expressions: [{ name: "joy", url: "a" }, { name: "neutral", url: "b" }], defaultExpression: "neutral" };
    expect(pickSprite("Aria: She grins.", old, voices)?.sprite.url).toBe("a");
    expect(pickSprite("x", { expressions: [] }, voices)).toBeNull();
  });
});

describe("CHARX asset names", () => {
  it("encodes the plain case as the emotion alone", () => {
    expect(emotionAssetName({ name: "joy" })).toBe("joy");
    expect(emotionAssetName({ name: "joy", outfit: "default" })).toBe("joy");
    expect(emotionAssetName({ name: "joy", outfit: "dress" })).toBe("dress__joy");
    expect(emotionAssetName({ name: "joy", character: "Aria", outfit: "dress" })).toBe("Aria__dress__joy");
    expect(emotionAssetName({ name: "joy", character: "Aria" })).toBe("Aria__default__joy");
  });

  it("round trips", () => {
    for (const s of [{ name: "joy" }, { name: "joy", outfit: "dress" }, { name: "joy", outfit: "school uniform" }, { name: "joy", character: "Aria" }, { name: "joy", character: "Bo Lin", outfit: "dress 2" }]) {
      const back = parseEmotionAssetName(emotionAssetName(s));
      expect(back).toEqual(s);
    }
  });

  it("names from other tools stay plain; stray underscores do not split", () => {
    expect(parseEmotionAssetName("Yrel_angry")).toEqual({ name: "Yrel_angry" });
    expect(parseEmotionAssetName("__x")).toEqual({ name: "__x" });
    expect(parseEmotionAssetName(emotionAssetName({ name: "a__b", outfit: "c__d" }))).toEqual({ name: "a_b", outfit: "c_d" });
  });
});

describe("the batch planner", () => {
  const names = ["Aria_joy_dress.png", "Aria_joy_pyjamas.png", "Aria_joy_pyjamas2.png", "joy.png", "joy2.png", "Bo_sadness.png"];
  const files = () => batchFromNames(names, owners);

  it("groups by character and outfit", () => {
    const g = batchGroups(files());
    expect(g.map((x) => `${x.character}/${x.outfit || "default"}:${x.ids.length}`)).toEqual(["Aria/dress:1", "Aria/pyjamas:2", "/default:2", "Bo Lin/default:1"]);
  });

  it("counts what replaces the card's sprites and what shares a slot inside the batch", () => {
    const existing = [sp("joy"), sp("neutral", "Aria", "dress")];
    expect(countClashes(files(), existing)).toEqual({ replaces: 1, shared: 2 });
    // a skipped file is not a clash
    const f = setSkip(files(), [2, 4], true);
    expect(countClashes(f, existing)).toEqual({ replaces: 1, shared: 0 });
  });

  it("replace: the last file of a slot wins and takes over the card's sprite", () => {
    const existing = [sp("joy")];
    const p = planBatch(files(), existing, "replace");
    expect(p.adds.map((a) => a.id)).toEqual([0, 2, 4, 5]);
    expect(p).toMatchObject({ replaced: 1, moved: 0, dropped: 2 });
  });

  it("both: later files go to '<outfit> 2'", () => {
    const existing = [sp("joy")];
    const p = planBatch(files(), existing, "both");
    expect(p.adds.map((a) => `${a.character}/${a.outfit || "default"}/${a.name}`)).toEqual([
      "Aria/dress/joy", "Aria/pyjamas/joy", "Aria/pyjamas 2/joy", "/default 2/joy", "/default 3/joy", "Bo Lin/default/sadness",
    ]);
    expect(p).toMatchObject({ replaced: 0, moved: 3, dropped: 0 });
  });

  it("skip: a file whose slot is taken is left out", () => {
    const p = planBatch(files(), [sp("joy")], "skip");
    expect(p.adds.map((a) => a.id)).toEqual([0, 1, 5]);
    expect(p.dropped).toBe(3);
  });

  it("editing a group moves its files; skipped files are not planned", () => {
    let f = files();
    f = setGroup(f, [3, 4], { character: "Bo Lin", outfit: "coat" });
    expect(batchGroups(f).map((x) => `${x.character}/${x.outfit || "default"}`)).toContain("Bo Lin/coat");
    f = setSkip(f, [0], true);
    expect(planBatch(f, [], "replace").adds.some((a) => a.id === 0)).toBe(false);
  });

  it("merges stored pictures into the card: replaced in place, new ones at the end", () => {
    const existing = [sp("joy"), sp("neutral", "Aria")];
    const { list, replaced } = mergeSprites(existing, [
      { name: "joy", character: "", outfit: "", url: "new1" },
      { name: "joy", character: "Aria", outfit: "dress", url: "new2" },
      { name: "JOY", character: "", outfit: "default", url: "new3" },
    ]);
    expect(replaced).toBe(1);
    expect(list).toHaveLength(3);
    expect(list[0]!.url).toBe("new3");
    expect(list[2]).toEqual({ name: "joy", url: "new2", character: "Aria", outfit: "dress" });
    expect(new Set(list.map(spriteKey)).size).toBe(3);
  });

  it("440 files stay cheap to plan", () => {
    const many = Array.from({ length: 440 }, (_, i) => `Aria_${["joy", "anger", "sadness", "fear"][i % 4]}_outfit${i % 11 === 0 ? "" : `_${String.fromCharCode(97 + (i % 11))}`}.png`);
    const f = batchFromNames(many, owners);
    const t0 = performance.now();
    const p = planBatch(f, [], "both");
    expect(p.adds).toHaveLength(440);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
