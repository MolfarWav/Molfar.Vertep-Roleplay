/**
 * The structured card (src/lib/profile.ts): what the profile compiles into the
 * card's text, the hand-edit check, and the round trip through the card format.
 */
import { describe, expect, it } from "bun:test";
// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { cardToCharacter, characterToCard } = await import("../src/lib/engine");
import {
  acceptDraft, acceptFill, acceptPersonaDraft, acceptPersonaFill, castOf, normalizeProfile, profileName, mergeFill, emptyFields, isMale, personaProfile, sectionOn, writePersona, adoptHandEdits, answersOf, applyAnswers, applyProfile, personaAdditions, personaEdited, compileProfile, compileProfileText, profileOf, profileOutOfDate, startProfile, textHash, withProfile,
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
        "Birthplace: Lviv\nBackstory: A surgeon who left the city.\n\nAffiliations: the Guild\n\n" +
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

describe("the persona questionnaire", () => {
  const empty = { first: "", family: "", nicknames: "", age: "", gender: "", pronouns: "", hair: "", eyes: "", body: "", attire: "", traits: "", flaws: "", occupation: "", summary: "", wants: "" };
  const answers = { ...empty, first: "Serhii", nicknames: "Molfar", age: "30", gender: "man", pronouns: "he", hair: "dark", traits: "curious, stubborn", flaws: "impatient", occupation: "bard", summary: "Came to the valley to find old songs.", wants: "slow-burn mystery" };

  it("keeps the old description as notes and compiles one text", () => {
    const patch = applyAnswers({ name: "User", description: "Likes tea.", profile: undefined }, answers, 3);
    expect(patch.name).toBe("Serhii");
    expect(patch.pronouns).toBe("he");
    expect(patch.description).toBe(
      "Full name: Serhii\nAlso called: Molfar\nOccupation: bard\nAge: 30\nGender: man (he)\n\nHair: dark\n\nBackstory: Came to the valley to find old songs.\n\nLikes tea.\n\nFlaws: impatient\nTraits: curious, stubborn",
    );
    expect(patch.description).not.toContain("slow-burn");
    const saved = { name: patch.name!, description: patch.description!, pronouns: "he", profile: patch.profile };
    expect(personaEdited(saved)).toBe(false);
    expect(answersOf(saved)).toEqual({ ...answers, nicknames: "Molfar", traits: "curious, stubborn" });
  });

  it("text added after the compiled lines survives the next save; an edit inside them is reported", () => {
    const first = applyAnswers({ name: "U", description: "", profile: undefined }, answers, 1);
    const edited = { name: "Serhii", description: `${first.description}\n\nHates mornings.`, profile: first.profile };
    expect(personaEdited(edited)).toBe(true);
    expect(personaAdditions(edited)).toBe("Hates mornings.");
    const again = applyAnswers(edited, { ...answers, age: "31" }, 2);
    expect(again.description).toContain("Age: 31");
    expect(again.description).toContain("Hates mornings.");
    expect(personaAdditions({ description: first.description!.replace("bard", "poet"), profile: first.profile })).toBeNull();
  });

  it("a persona without a profile starts from its name and pronouns", () => {
    expect(answersOf({ name: "Ann", pronouns: "she", profile: undefined })).toMatchObject({ first: "Ann", pronouns: "she" });
  });
});

describe("section switches", () => {
  it("trauma and circles start off until filled, sexuality follows its old switch, the rest are on", () => {
    expect(sectionOn({}, "trauma")).toBe(false)
    expect(sectionOn({}, "circles")).toBe(false)
    expect(sectionOn({}, "sexuality")).toBe(false)
    expect(sectionOn({}, "goals")).toBe(true)
    expect(sectionOn({ trauma: { coping: "drinks" } }, "trauma")).toBe(true)
    expect(sectionOn({ background: { religion: "none" } }, "circles")).toBe(true)
    expect(sectionOn({ sexuality: { enabled: true } }, "sexuality")).toBe(true)
    expect(sectionOn({ sexuality: { enabled: true }, sections: { sexuality: false } }, "sexuality")).toBe(false)
  })

  it("an off section keeps its fields and writes nothing", () => {
    const p: Profile = { appearance: { eyes: "grey" }, goals: { career: "captain" }, sections: { appearance: false } }
    expect(compileProfile(p)).toEqual({ description: "", personality: "Career goal: captain" })
    expect(p.appearance).toEqual({ eyes: "grey" })
  })

  it("compiles the new fields where they belong", () => {
    const p: Profile = {
      identity: { first: "Eva", birthday: "11/11" },
      appearance: { height: "144 cm", weight: "35 kg", measurements: "70-50-72" },
      background: { nationality: "Ironport", politics: "none" },
      trauma: { experiences: ["betrayal"], triggers: ["cold"], coping: "work" },
      sexuality: { romantic: "demiromantic", libido: "low" },
      sections: { sexuality: true },
    }
    const { description, personality } = compileProfile(p)
    expect(description).toBe("Full name: Eva\nBirthday: 11/11\n\nHeight: 144 cm\nWeight: 35 kg\nMeasurements: 70-50-72\n\nNationality: Ironport\n\nPolitical views: none")
    expect(personality).toBe("Trauma: betrayal\nTriggered by: cold\nCopes by: work\n\nRomantic orientation: demiromantic\nLibido: low")
  })
})

describe("Fill empty", () => {
  it("fills only empty fields and never the private comment", () => {
    const prev: Profile = { identity: { first: "Eva", comment: "mine" }, appearance: { eyes: "red" }, lists: { flaws: [] } }
    const fill: Profile = { identity: { first: "X", age: "19", comment: "no" }, appearance: { eyes: "blue", hair: "white" }, lists: { flaws: ["proud"] } }
    const next = mergeFill(prev, fill)
    expect(next.identity).toEqual({ first: "Eva", comment: "mine", age: "19" })
    expect(next.appearance).toEqual({ eyes: "red", hair: "white" })
    expect(next.lists).toEqual({ flaws: ["proud"] })
  })

  it("on a card: the text before goes to Versions", () => {
    const c = cardToCharacter(baseCard() as never)
    const next = { ...c, ...acceptFill(c, { kind: "fill", profile: { appearance: { hair: "white" } } }, 7) }
    expect(next.description).toBe("Hair: white\n\nold")
    expect(next.versions[0]!.label.startsWith("Before Fill empty")).toBe(true)
  })
})

describe("the persona profile", () => {
  it("a persona without a profile starts from its name and text", () => {
    expect(personaProfile({ name: "Ann", pronouns: "she", description: "Likes tea.", profile: undefined })).toMatchObject({ identity: { first: "Ann", pronouns: "she" }, notes: { description: "Likes tea." } })
  })

  it("writes one text, takes the name, and Free write leaves the text alone", () => {
    const patch = writePersona({ name: "User" }, { identity: { first: "Serhii", pronouns: "he" }, lists: { traits: ["calm"] } }, 1)
    expect(patch).toMatchObject({ name: "Serhii", pronouns: "he", description: "Full name: Serhii\nGender: (he)\n\nTraits: calm" })
    expect(personaEdited({ description: patch.description!, profile: patch.profile })).toBe(false)
    expect(writePersona({ name: "U" }, { free: true, identity: { first: "A" } }).description).toBeUndefined()
  })

  it("Structure it: sections replaced, both leftovers become the notes, the comment stays", () => {
    const patch = acceptPersonaDraft({ name: "U", profile: { identity: { first: "Old", comment: "mine" } } }, { profile: { identity: { first: "Ann" } }, leftover: { description: "World.", personality: "Rules." } }, 2)
    expect(patch.profile?.identity).toEqual({ first: "Ann", comment: "mine" })
    expect(patch.description).toBe("Full name: Ann\n\nWorld.\n\nRules.")
  })

  it("Fill empty keeps what the persona has", () => {
    const patch = acceptPersonaFill({ name: "Ann", pronouns: "", description: "", profile: { identity: { first: "Ann", age: "30" } } }, { kind: "fill", profile: { identity: { age: "99", gender: "woman" } } }, 3)
    expect(patch.profile?.identity).toMatchObject({ first: "Ann", age: "30", gender: "woman" })
  })
})

describe("the fields Fill empty asks for", () => {
  it("only switched-on sections, never relationships, one section on request", () => {
    const p: Profile = { identity: { first: "Eva" }, appearance: { eyes: "red" }, sections: { goals: false } }
    const all = emptyFields(p)
    expect(all.identity).not.toContain("first")
    expect(all.appearance).not.toContain("eyes")
    expect(all.appearance).toContain("measurements")
    expect(all.goals).toBeUndefined()
    expect(all.trauma).toBeUndefined()
    expect(all.relationships).toBeUndefined()
    expect(emptyFields(p, "circles")).toEqual({ background: ["affiliations", "circle", "politics", "religion"] })
  })
})

describe("fields that do not apply", () => {
  it("a male character is not offered measurements, from Gender or else the pronouns", () => {
    expect(isMale({ identity: { gender: "Male" } })).toBe(true)
    expect(isMale({ identity: { gender: "чоловік" } })).toBe(true)
    expect(isMale({ identity: { gender: "man (he)" } })).toBe(true)
    expect(isMale({ identity: { gender: "woman" } })).toBe(false)
    expect(isMale({ identity: { gender: "female" } })).toBe(false)
    expect(isMale({ identity: { pronouns: "he/him" } })).toBe(true)
    expect(isMale({ identity: { gender: "non-binary", pronouns: "he" } })).toBe(false)
    expect(emptyFields({ identity: { gender: "male" } }).appearance).not.toContain("measurements")
    expect(emptyFields({ identity: { gender: "female" } }).appearance).toContain("measurements")
  })
})

describe("a replacing fill", () => {
  it("overwrites filled fields and labels the version", () => {
    const c = cardToCharacter(baseCard() as never)
    const before = { ...c, ...applyProfile(c, { appearance: { eyes: "grey" } }, 1) }
    const next = { ...before, ...acceptFill(before, { kind: "fill", replace: true, profile: { appearance: { eyes: "violet" } } }, 2) }
    expect(profileOf(next)?.appearance).toEqual({ eyes: "violet" })
    expect(next.versions[0]!.label.startsWith("Before Read from picture")).toBe(true)
    expect(mergeFill({ appearance: { eyes: "grey" } }, { appearance: { eyes: "violet" } }).appearance).toEqual({ eyes: "grey" })
  })
})

// Discord report: after the built-in agent edited a card, its editor showed only
// "Script error" and the app froze. Hand- or model-written card.json may hold a
// list as one string, a number for a text, an object for a list: every screen
// reads a card through cardToCharacter and profileOf, so those two must hand
// out the types the form expects.
describe("cards written outside the app", () => {
  it("profileOf coerces wrong shapes instead of passing them to the form", () => {
    const card = {
      ...baseCard(),
      extensions: {
        molfar_profile: {
          identity: { first: "Kit", age: 19, nicknames: "Kitty, K" },
          lists: { strengths: "brave, kind\nloyal", flaws: [1, null, "rash"], fears: { a: 1 } },
          appearance: { eyes: ["green", "sharp"], hair: { color: "red" } },
          background: { affiliations: "the Guild" },
          sexuality: { turnOns: "rain" },
          sections: { trauma: "yes", appearance: true },
          relationships: { Mira: "sister", Bo: { relation: "friend", notes: 3 } },
          futureField: { keep: "me" },
        },
      },
    }
    const p = profileOf(cardToCharacter(card as never, "kit"))!
    expect(p.identity).toEqual({ first: "Kit", age: "19", nicknames: ["Kitty", "K"] })
    expect(p.lists).toEqual({ strengths: ["brave", "kind", "loyal"], flaws: ["1", "rash"] })
    expect(p.appearance).toEqual({ eyes: "green, sharp" })
    expect(p.background).toEqual({ affiliations: ["the Guild"] })
    expect(p.sexuality).toEqual({ turnOns: ["rain"] })
    expect(p.sections).toEqual({ appearance: true })
    expect(p.relationships).toEqual([
      { name: "Mira", relation: "sister", notes: "" },
      { name: "Bo", relation: "friend", notes: "3" },
    ])
    expect(p.futureField).toEqual({ keep: "me" })
    expect(compileProfile(p).personality).toContain("Strengths: brave, kind, loyal")
  })

  it("cardToCharacter hands out strings and lists whatever the file holds", () => {
    const c = cardToCharacter(
      {
        name: 42,
        description: ["not", "text"],
        tags: "elf, mage",
        alternate_greetings: "Hello there",
        first_mes: null,
        studio: {
          versions: "none",
          descVariants: [{ label: "Short", content: 7 }, "junk"],
          stats: [{ name: "Trust", initial: "5" }],
          depthPrompt: { text: "note", depth: "2", role: "narrator" },
          colors: "red",
          gallery: [{ url: "" }, { url: "data:image/png;base64,AA", type: "gif" }],
          expressions: [{ name: "joy" }, { url: "x" }],
          linkedLorebookIds: "book1",
          favorite: "yes",
        },
      } as never,
      "kit",
    )
    expect(c.name).toBe("42")
    expect(c.description).toBe("")
    expect(c.tags).toEqual(["elf", "mage"])
    expect(c.altGreetings).toEqual(["Hello there"])
    expect(c.firstMessage).toBe("")
    expect(c.versions).toEqual([])
    expect(c.descVariants).toEqual([{ id: "v0", label: "Short", content: "7" }])
    expect(c.stats).toEqual([{ id: "s0", name: "Trust", initial: 5, max: 100, color: "" }])
    expect(c.depthPrompt).toEqual({ text: "note", depth: 2, role: "system" })
    expect(c.colors).toEqual({ name: "", dialogue: "", bubble: "" })
    expect(c.gallery).toHaveLength(1)
    expect(c.gallery[0]!.type).toBe("image")
    expect(c.expressions).toEqual([{ name: "joy", url: null }])
    expect(c.linkedLorebookIds).toEqual(["book1"])
    expect(c.favorite).toBe(false)
  })
})

describe("several characters on one card (cast)", () => {
  const narrator: Profile = {
    identity: { first: "Aria" },
    appearance: { eyes: "green" },
    lists: { fears: ["the dark"] },
    notes: { description: "The tavern is the heart of the town.", personality: "" },
    cast: [
      { identity: { first: "Bram", family: "Holt" }, appearance: { hair: "red" }, behaviors: { speech: "loud" } },
      { identity: { nicknames: ["the Fox"] }, goals: { life: "steal the crown" } },
      { identity: { first: "" } },
    ],
  };

  it("each character gets its own part, the shared notes come last, an empty member writes nothing", () => {
    const out = compileProfile(narrator);
    expect(out.description).toBe(
      "### Aria\nFull name: Aria\n\nEyes: green\n\n### Bram Holt\nFull name: Bram Holt\n\nHair: red\n\n### the Fox\nAlso called: the Fox\n\nThe tavern is the heart of the town.",
    );
    expect(out.personality).toBe("### Aria\nFears: the dark\n\n### Bram Holt\nSpeech: loud\n\n### the Fox\nLife goal: steal the crown");
  });

  it("a cast that writes nothing leaves one character's text as it was", () => {
    const solo: Profile = { ...narrator, cast: [{ identity: { first: " " } }] };
    const { cast: _c, ...plain } = narrator;
    expect(compileProfile(solo)).toEqual(compileProfile(plain));
  });

  it("names: the full name, else a nickname, else the place in the cast", () => {
    expect(profileName({ identity: { title: "Dr.", first: "Elias", family: "Thorne" } })).toBe("Dr. Elias Thorne");
    expect(profileName({ identity: { nicknames: ["", "Eli"] } })).toBe("Eli");
    expect(profileName({}, 2)).toBe("Character 3");
  });

  it("normalizing: members are coerced like the profile; a member has no cast, Free write or stamp", () => {
    const p = normalizeProfile({ cast: [{ lists: { fears: "fire" }, cast: [{}], free: true, compiled: { hash: "x" }, v: 1, mine: 1 }, "junk", null] });
    expect(castOf(p)).toEqual([{ lists: { fears: ["fire"] }, mine: 1 }]);
    expect(normalizeProfile({ cast: "x" }).cast).toEqual([]);
  });

  it("the hand-edit check and keeping additions work over every part", () => {
    const c = { cardExtras: {}, description: "", personality: "" };
    const saved = { ...c, ...applyProfile(c, narrator, 1) };
    expect(profileOutOfDate(saved)).toBe(false);
    const edited = { ...saved, description: saved.description + "\nIt rains a lot." };
    expect(profileOutOfDate(edited)).toBe(true);
    const kept = adoptHandEdits(profileOf(edited)!, edited)!;
    expect(kept.notes!.description).toBe("The tavern is the heart of the town.\nIt rains a lot.");
    expect(castOf(kept).length).toBe(3);
  });

  it("survives the round trip through the card format", () => {
    const c = { cardExtras: {}, description: "", personality: "" };
    const ch = { ...cardToCharacter({ spec: "chara_card_v2", data: { name: "Tavern" } } as any), ...applyProfile(c, narrator, 1) };
    const back = cardToCharacter(characterToCard(ch as any) as any);
    expect(castOf(profileOf(back)!).map((m) => profileName(m))).toEqual(["Bram Holt", "the Fox", "Character 1"]);
    expect(back.description).toBe(ch.description);
  });
});
