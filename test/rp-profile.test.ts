/**
 * The structured card (src/lib/profile.ts): what the profile compiles into the
 * card's text, the hand-edit check, and the round trip through the card format.
 */
import { describe, expect, it } from "bun:test";
// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { cardToCharacter, characterToCard } = await import("../src/lib/engine");
import {
  acceptDraft, adoptHandEdits, applyProfile, compileProfile, compileProfileText, profileOf, profileOutOfDate, startProfile, textHash, withProfile,
  type Profile,
} from "../src/lib/profile";

const elias: Profile = {
  identity: { title: "Dr.", first: "Elias", family: "Thorne", nicknames: ["Eli", " "], age: "34", gender: "man", pronouns: "he", comment: "private: never compiled" },
  appearance: { eyes: "grey, tired", hair: "", height: "185 cm" },
  lists: { strengths: ["patient", "sharp"], flaws: [], fears: ["fire"] },
  behaviors: { speech: "dry, short sentences" },
  goals: { life: "find his sister" },
  background: { birthplace: "Lviv", affiliations: ["the Guild"], summary: "A surgeon who left the city." },
  relationships: [{ name: "Mira", relation: "sister", notes: "missing" }, { name: " ", relation: "x", notes: "" }],
  sexuality: { enabled: false, orientation: "bi" },
  notes: { description: "Smells of iodine.", personality: "" },
  futureField: { keep: "me" },
};

const baseCard = () => ({
  spec: "chara_card_v2",
  name: "Elias",
  description: "old",
  personality: "",
  extensions: { talkativeness: "0.5", other_mod: { a: 1 } },
});

describe("compileProfile", () => {
  it("writes labeled lines and skips empty fields", () => {
    const { description, personality } = compileProfile(elias);
    expect(description).toBe(
      "Full name: Dr. Elias Thorne\nAlso called: Eli\nAge: 34\nGender: man (he)\n\n" +
        "Eyes: grey, tired\nHeight: 185 cm\n\n" +
        "Birthplace: Lviv\nAffiliations: the Guild\nBackstory: A surgeon who left the city.\n\n" +
        "Relationships:\n- Mira (sister): missing\n\nSmells of iodine.",
    );
    expect(personality).toBe("Strengths: patient, sharp\nFears: fire\n\nSpeech: dry, short sentences\n\nLife goal: find his sister");
    expect(description + personality).not.toContain("private");
    expect(personality).not.toContain("Orientation");
  });

  it("adds the sexuality block only when it is switched on", () => {
    const on = compileProfile({ ...elias, sexuality: { enabled: true, orientation: "bi", turnOns: ["wit"] } });
    expect(on.personality.endsWith("Orientation: bi\nTurn-ons: wit")).toBe(true);
  });

  it("an empty profile compiles to nothing, a persona gets one text", () => {
    expect(compileProfile({})).toEqual({ description: "", personality: "" });
    expect(compileProfileText({ identity: { first: "Ann" }, lists: { traits: ["kind"] } })).toBe("Full name: Ann\n\nTraits: kind");
  });
});

describe("applying a profile", () => {
  it("compiles the fields, stamps the hash and keeps other extensions", () => {
    const c = cardToCharacter(baseCard() as never);
    const patch = applyProfile(c, elias, 42);
    const next = { ...c, ...patch };
    expect(next.description).toBe(compileProfile(elias).description);
    expect(profileOf(next)?.compiled).toEqual({ at: 42, hash: textHash(next.description, next.personality) });
    expect(profileOutOfDate(next)).toBe(false);
    const ext = next.cardExtras?.extensions as Record<string, unknown>;
    expect(ext.other_mod).toEqual({ a: 1 });
    // a hand edit shows; Free write turns the check off
    expect(profileOutOfDate({ ...next, description: `${next.description}!` })).toBe(true);
    const free = { ...next, ...applyProfile(next, { ...profileOf(next)!, free: true }), description: "mine" };
    expect(free.description).toBe("mine");
    expect(profileOutOfDate(free)).toBe(false);
  });

  it("survives the card format round trip with unknown keys", () => {
    const c = cardToCharacter(baseCard() as never);
    const saved = characterToCard({ ...c, ...applyProfile(c, elias, 1) });
    const back = profileOf(cardToCharacter(saved as never));
    expect(back?.futureField).toEqual({ keep: "me" });
    expect(back?.identity?.first).toBe("Elias");
    expect(back?.v).toBe(1);
  });

  it("removing the profile leaves an empty extensions bag, not a missing one", () => {
    const only = withProfile({ cardExtras: { extensions: { molfar_profile: { v: 1 } } } }, null);
    expect(only.cardExtras).toEqual({ extensions: {} });
  });

  it("starting a profile changes no text", () => {
    const c = { description: "Tall. Quiet.", personality: "Kind." };
    expect(compileProfile(startProfile(c))).toEqual({ description: "Tall. Quiet.", personality: "Kind." });
  });

  it("text added after the compiled lines becomes notes; an edit inside them does not", () => {
    const p: Profile = { identity: { first: "Ann" } };
    const { description } = compileProfile(p);
    expect(adoptHandEdits(p, { description: `${description}\n\nLoves rain.`, personality: "Shy." })?.notes).toEqual({ description: "Loves rain.", personality: "Shy." });
    expect(adoptHandEdits(p, { description: "Full name: Anna", personality: "" })).toBeNull();
  });

  it("reads a broken profile tolerantly", () => {
    const p = profileOf({ cardExtras: { extensions: { molfar_profile: { identity: "x", relationships: [1, { name: "A" }] } } } });
    expect(p?.identity).toBeUndefined();
    expect(p?.relationships).toEqual([{ name: "A", relation: "", notes: "" }]);
    expect(compileProfile(p!).description).toBe("Relationships:\n- A");
  });
});

describe("accepting a Structure it draft", () => {
  it("replaces the sections, keeps the comment and unknown keys, files the old text as a version", () => {
    const c = cardToCharacter(baseCard() as never);
    const before = { ...c, ...applyProfile(c, { identity: { first: "Old", comment: "mine" }, goals: { life: "gone" }, futureField: 1 }, 1) };
    const patch = acceptDraft(before, { profile: { identity: { first: "Elias" }, lists: { flaws: ["proud"] } }, leftover: { description: "World: guilds rule." } }, 5);
    const next = { ...before, ...patch };
    const p = profileOf(next)!;
    expect(p.identity).toEqual({ first: "Elias", comment: "mine" });
    expect(p.goals).toBeUndefined();
    expect(p.futureField).toBe(1);
    expect(p.notes).toEqual({ description: "World: guilds rule.", personality: "" });
    expect(next.description).toBe("Full name: Elias\n\nWorld: guilds rule.");
    expect(next.personality).toBe("Flaws: proud");
    expect(next.versions[0]!.snapshot.description).toBe(before.description);
    expect(next.versions[0]!.label.startsWith("Before Structure it")).toBe(true);
    expect(profileOutOfDate(next)).toBe(false);
  });
});
