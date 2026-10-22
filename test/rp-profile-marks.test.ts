/**
 * Section headings in the exported card text (GitHub #105): the layout, that taking them out gives the plain
 * text back, that a card without its profile reads back into one, and that a card which only happens to use
 * headings like these is left alone.
 */
import { describe, expect, it } from "bun:test";
// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { characterToExportCard } = await import("../src/lib/engine");
import { adoptMarkedSections, applyProfile, compileProfile, compileProfileMarked, hasMarks, markedExport, profileFromMarked, profileOf, unmarkText, type Profile } from "../src/lib/profile";
import type { Character } from "../src/lib/types";

const elias: Profile = {
  identity: { title: "Dr.", first: "Elias", family: "Thorne", nicknames: ["Eli"], occupation: "Surgeon", age: "34", gender: "man", pronouns: "he" },
  appearance: { eyes: "grey, tired", height: "185 cm", marks: "a scar over the left brow\nand a burn on the wrist" },
  lists: { strengths: ["patient", "sharp"], fears: ["fire"] },
  behaviors: { speech: "dry, short sentences", quirks: "taps the table" },
  goals: { life: "find his sister" },
  background: { birthplace: "Lviv", affiliations: ["the Guild"], summary: "A surgeon who left the city.", religion: "none" },
  trauma: { experiences: ["the fire"], coping: "work" },
  relationships: [{ name: "Mira", relation: "sister", notes: "missing" }, { name: "Oleh", relation: "", notes: "" }],
  sexuality: { orientation: "bi", turnOns: ["competence"], boundaries: "slow" },
  sections: { sexuality: true },
  notes: { description: "Smells of iodine.", personality: "Never lies about a diagnosis." },
};

describe("compileProfileMarked", () => {
  it("puts a heading before each section's lines, in the order the text is written", () => {
    const { description, personality } = compileProfileMarked(elias);
    const heads = (t: string) => t.split("\n").filter((l) => /^#{2,4} /.test(l));
    expect(heads(description)).toEqual(["## Identity", "## Appearance", "## Background", "## Circles", "## Relationships", "## Notes"]);
    expect(heads(personality)).toEqual(["## Personality", "## Behaviors", "## Goals", "## Trauma", "## Sexuality", "## Notes"]);
    expect(description.startsWith("## Identity\nFull name: Dr. Elias Thorne")).toBe(true);
    expect(personality).toContain("## Behaviors\nSpeech: dry, short sentences\nQuirks: taps the table");
  });

  it("leaves out a section that writes nothing", () => {
    const { description } = compileProfileMarked({ identity: { first: "Mira" } });
    expect(description).toBe("## Identity\nFull name: Mira");
  });

  it("taking the headings out gives the plain compiled text exactly", () => {
    const marked = compileProfileMarked(elias);
    const plain = compileProfile(elias);
    expect(unmarkText(marked.description)).toBe(plain.description);
    expect(unmarkText(marked.personality)).toBe(plain.personality);
  });

  it("a cast keeps its ### parts and puts the headings inside each; the shared notes come last", () => {
    const cast: Profile = {
      identity: { first: "Mira" }, appearance: { hair: "red" }, lists: { traits: ["bold"] }, notes: { description: "Shared." },
      cast: [{ identity: { first: "Oleh" }, behaviors: { speech: "slow" }, notes: { personality: "Quiet." } }],
    };
    const marked = compileProfileMarked(cast);
    expect(marked.description).toBe("### Mira\n#### Identity\nFull name: Mira\n\n#### Appearance\nHair: red\n\n### Oleh\n#### Identity\nFull name: Oleh\n\n## Notes\nShared.");
    expect(marked.personality).toBe("### Mira\n#### Personality\nTraits: bold\n\n### Oleh\n#### Behaviors\nSpeech: slow\n\n#### Notes\nQuiet.");
    expect(unmarkText(marked.description)).toBe(compileProfile(cast).description);
    expect(unmarkText(marked.personality)).toBe(compileProfile(cast).personality);
  });
});

describe("profileFromMarked", () => {
  it("reads an export back into a profile that compiles to the same text", () => {
    const marked = compileProfileMarked(elias);
    const back = profileFromMarked(marked.description, marked.personality);
    expect(back).not.toBeNull();
    const again = compileProfile(back!);
    expect(again).toEqual(compileProfile(elias));
    expect(back!.lists?.strengths).toEqual(["patient", "sharp"]);
    expect(back!.appearance?.marks).toBe("a scar over the left brow\nand a burn on the wrist");
    expect(back!.relationships).toEqual([{ name: "Mira", relation: "sister", notes: "missing" }, { name: "Oleh", relation: "", notes: "" }]);
    expect(back!.identity?.gender).toBe("man");
    expect(back!.identity?.pronouns).toBe("he");
  });

  it("a text with a line no field owns is not the profile's: nothing is rebuilt", () => {
    const marked = compileProfileMarked(elias);
    expect(profileFromMarked(marked.description.replace("## Identity\n", "## Identity\nLikes jazz\n"), marked.personality)).toBeNull();
    // a line after a field goes on being that field's value, and the text still reads back as it was
    const longer = marked.description.replace("Age: 34", "Age: 34\nLikes jazz");
    expect(compileProfile(profileFromMarked(longer, marked.personality)!).description).toBe(unmarkText(longer));
    expect(profileFromMarked("## Appearance\nWears a cape\nHair: black", "")).toBeNull();
  });

  it("text before the first heading, or a heading twice, is not the profile's", () => {
    expect(profileFromMarked("Hello\n## Identity\nFull name: A", "")).toBeNull();
    expect(profileFromMarked("## Identity\nFull name: A\n\n## Identity\nFull name: B", "")).toBeNull();
  });

  it("does not take a label that is only an object property name", () => {
    expect(profileFromMarked("## Appearance\nconstructor: yes", "")).toBeNull();
  });
});

const card = (over: Partial<Character>): Pick<Character, "cardExtras" | "description" | "personality"> => ({ description: "", personality: "", cardExtras: undefined, ...over });

describe("adoptMarkedSections", () => {
  it("a card with no headings is left alone", () => {
    expect(adoptMarkedSections(card({ description: "Full name: A", personality: "Traits: b" }))).toBeNull();
  });

  it("an export that lost its profile gets it back, and its text loses the headings", () => {
    const marked = compileProfileMarked(elias);
    const patch = adoptMarkedSections(card({ description: marked.description, personality: marked.personality }), 1000);
    expect(patch).not.toBeNull();
    expect(patch!.description).toBe(compileProfile(elias).description);
    expect(patch!.personality).toBe(compileProfile(elias).personality);
    const built = profileOf({ cardExtras: patch!.cardExtras });
    expect(built?.compiled?.at).toBe(1000);
    expect(built?.identity?.first).toBe("Dr. Elias Thorne");
  });

  it("an export that kept its profile just loses the headings", () => {
    const own = applyProfile({ cardExtras: undefined }, elias, 5);
    const marked = compileProfileMarked(elias);
    const patch = adoptMarkedSections(card({ description: marked.description, personality: marked.personality, cardExtras: own.cardExtras }));
    expect(patch).toEqual({ description: own.description, personality: own.personality });
  });

  it("a card that merely uses headings like these is never touched (community cards do)", () => {
    const description = "## Appearance\nTall, dark hair, always in black.\n\n## Background\nGrew up on the coast.";
    const personality = "## Personality\nBold and kind.";
    expect(adoptMarkedSections(card({ description, personality }))).toBeNull();
  });

  it("a card whose profile text was edited by hand after the export keeps its headings", () => {
    const own = applyProfile({ cardExtras: undefined }, elias, 5);
    const marked = compileProfileMarked(elias);
    const edited = marked.description.replace("Age: 34", "Age: 35");
    expect(adoptMarkedSections(card({ description: edited, personality: marked.personality, cardExtras: own.cardExtras }))).toBeNull();
  });

  it("hasMarks sees the headings and nothing else", () => {
    expect(hasMarks("## Notes\nx")).toBe(true);
    expect(hasMarks("#### Goals\nx")).toBe(true);
    expect(hasMarks("## Chapter one\nx")).toBe(false);
    expect(hasMarks("Notes\nx")).toBe(false);
  });
});

describe("characterToExportCard", () => {
  const base = (): Character => {
    const own = applyProfile({ cardExtras: undefined }, elias, 5);
    return { id: "c1", name: "Elias", description: own.description, personality: own.personality, scenario: "", firstMessage: "Hi.", altGreetings: [], groupGreetings: [], exampleDialogue: "", systemPromptOverride: "", postHistoryInstructions: "", tags: [], favorite: false, descVariants: [], personalityVariants: [], scenarioVariants: [], versions: [], gallery: [], expressions: [], depthPrompt: { text: "", depth: 4, role: "system" }, colors: { name: "", dialogue: "", bubble: "" }, cardExtras: own.cardExtras, linkedLorebookIds: [], embeddedLorebookId: null } as unknown as Character;
  };

  it("marks the sections in the exported description and personality, in the envelope and in data", () => {
    const out = characterToExportCard(base(), [], { markSections: true }) as unknown as { description: string; personality: string; data: { description: string; personality: string } };
    expect(out.description.startsWith("## Identity\n")).toBe(true);
    expect(out.data.description).toBe(out.description);
    expect(out.data.personality).toBe(out.personality);
    expect(out.personality).toContain("## Behaviors");
  });

  it("the switch off gives the plain text", () => {
    const c = base();
    const out = characterToExportCard(c, [], { markSections: false }) as unknown as { description: string };
    expect(out.description).toBe(c.description);
  });

  it("the live card is not changed by exporting it", () => {
    const c = base();
    const before = c.description;
    characterToExportCard(c, [], { markSections: true });
    expect(c.description).toBe(before);
  });

  it("a card with Free write, or hand edits since the profile wrote it, exports as it is", () => {
    const c = base();
    expect(markedExport({ ...c, description: `${c.description}\nextra by hand` })).toBeNull();
    const free = { ...c, cardExtras: { extensions: { molfar_profile: { ...elias, free: true } } } } as unknown as Character;
    expect(markedExport(free)).toBeNull();
  });

  it("a card with no profile exports as it is", () => {
    const c = { ...base(), cardExtras: undefined } as Character;
    const out = characterToExportCard(c, [], { markSections: true }) as unknown as { description: string };
    expect(out.description).toBe(c.description);
  });
});
