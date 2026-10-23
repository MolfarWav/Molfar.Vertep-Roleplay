/**
 * A narrator card with several characters (GitHub #115): Structure it files the cast, parts of a long card are
 * matched to characters by name, and Fill empty works on any character of the card, found in the text by name.
 */
import { describe, expect, it } from "bun:test";
import { draftFromReply, handleRoute, mergeProposals, namesIn, partsAbout } from "../plugins/profile/plugin.js";
// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { acceptDraft, acceptFill, castOf, compileProfile, isBlankProfile, personName, profileOf } = await import("../src/lib/profile");

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}

const block = (name: string, filler = "") => `[${name}\n\nAge: 21 years old\n\nAppearance:\n\nPorcelain skin.${filler}\n\nPersonality:\n\nBold.]`;
const narrator = {
  spec: "chara_card_v2",
  name: "Campus",
  description: [block("Alice Yamada"), block("Carolina Bell"), block("Beatriz Miller")].join("\n\n"),
  personality: "",
};

describe("Structure it on a narrator card", () => {
  it("tells the model about the cast and files the other characters", () => {
    const m = memHost({ "characters/c/card.json": JSON.stringify(narrator) });
    const req = { method: "POST", path: "/profile/structure", query: {}, body: { characterId: "c" } };
    handleRoute(req, m.host);
    expect(m.requests[0]!.spec.systemPrompt).toContain("`cast`");
    m.results.structure = {
      text: JSON.stringify({
        profile: { identity: { first: "Alice", family: "Yamada" } },
        cast: [{ identity: { first: "Carolina", family: "Bell" }, appearance: { skin: "porcelain" } }, { identity: { first: "Beatriz", family: "Miller" } }, {}],
        leftover: { description: "", personality: "" },
      }),
    };
    const out = handleRoute(req, m.host) as { json: { ok: boolean; draft: Record<string, any> } };
    expect(out.json.ok).toBe(true);
    expect(out.json.draft.cast.map((x: any) => x.identity.first)).toEqual(["Carolina", "Beatriz"]);
    expect(JSON.parse(m.files["profile-drafts/c.json"]!).cast).toHaveLength(2);
  });

  it("a reply that only lists the cast makes its first the profile; one character has no cast", () => {
    const d = draftFromReply({ text: '{"cast":[{"identity":{"first":"A"}},{"identity":{"first":"B"}}]}' }, 1) as Record<string, any>;
    expect(d.profile.identity.first).toBe("A");
    expect(d.cast.map((x: any) => x.identity.first)).toEqual(["B"]);
    expect(draftFromReply({ text: '{"profile":{"identity":{"first":"A"}}}' }, 1)).not.toHaveProperty("cast");
  });

  it("a persona is one character: no cast in the draft", () => {
    const m = memHost({ "personas/me.json": JSON.stringify({ id: "me", name: "S", description: "A bard." }) });
    const req = { method: "POST", path: "/profile/structure", query: {}, body: { personaId: "me" } };
    handleRoute(req, m.host);
    expect(m.requests[0]!.spec.systemPrompt).toContain("leave `cast` out");
    m.results.structure = { text: '{"profile":{"identity":{"first":"S"}},"cast":[{"identity":{"first":"X"}}]}' };
    handleRoute(req, m.host);
    expect(JSON.parse(m.files["profile-drafts/persona-me.json"]!)).not.toHaveProperty("cast");
  });

  it("parts of a long card: the next part's lead carries the names found so far", () => {
    const long = { ...narrator, description: [block("Alice Yamada", " " + "x".repeat(2500)), block("Carolina Bell", " " + "y".repeat(2500))].join("\n\n") };
    const m = memHost({ "characters/c/card.json": JSON.stringify(long) });
    const send = (part: number) => handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "c", part, limits: { inputChars: 3000 } } }, m.host) as { json?: { done: boolean; parts: number } };
    send(0);
    expect(m.requests[0]!.spec.messages[0].content).toContain("Part 1 of 2");
    m.results.structure = { text: '{"profile":{"identity":{"first":"Alice","family":"Yamada"},"appearance":{"skin":"porcelain"}}}' };
    expect(send(0).json?.done).toBe(false);
    delete m.results.structure;
    send(1);
    expect(m.requests.at(-1)!.spec.messages[0].content).toContain("Characters found in the earlier parts: Alice Yamada");
    m.results.structure = { text: '{"profile":{"identity":{"first":"Carolina","family":"Bell"}}}' };
    expect(send(1).json?.done).toBe(true);
    const saved = JSON.parse(m.files["profile-drafts/c.json"]!);
    expect(saved.profile.identity.first).toBe("Alice");
    expect(saved.cast.map((x: any) => x.identity.first)).toEqual(["Carolina"]);
    expect(saved.partial).toBeUndefined();
  });
});

describe("merging the parts of a long card", () => {
  const alice = { identity: { first: "Alice", family: "Yamada" }, appearance: { hair: "black" } };
  it("matches characters by name and adds new ones to the cast", () => {
    const a = { profile: alice, leftover: { description: "w1" } };
    const b = { profile: { identity: { first: "Alice" }, appearance: { eyes: "brown" } }, cast: [{ identity: { first: "Carolina", family: "Bell" } }], leftover: { description: "w2" } };
    const m = mergeProposals(a, b) as Record<string, any>;
    expect(m.profile.appearance).toEqual({ hair: "black", eyes: "brown" });
    expect(namesIn(m)).toEqual(["Alice Yamada", "Carolina Bell"]);
    expect(m.leftover.description).toBe("w1\n\nw2");
    // the next part starts with Carolina: she is found, not added twice
    const c = mergeProposals(m, { profile: { identity: { first: "Carolina" }, goals: { life: "x" } } }) as Record<string, any>;
    expect(c.cast).toHaveLength(1);
    expect(c.cast[0].goals).toEqual({ life: "x" });
  });

  it("a part that names nobody continues the last character", () => {
    const a = { profile: alice, cast: [{ identity: { first: "Carolina" } }] };
    const m = mergeProposals(a, { profile: { goals: { life: "x" } } }) as Record<string, any>;
    expect(m.cast[0].goals).toEqual({ life: "x" });
    expect(m.profile.goals).toBeUndefined();
  });

  it("one character across parts still makes no cast", () => {
    const m = mergeProposals({ profile: alice }, { profile: { identity: { family: "Yamada" }, goals: { life: "x" } } }) as Record<string, any>;
    expect(m).not.toHaveProperty("cast");
    expect(m.profile.goals).toEqual({ life: "x" });
  });
});

describe("POST /profile/fill for another character of the card", () => {
  const files = () => ({ "characters/c/card.json": JSON.stringify(narrator), "settings.json": JSON.stringify({ model: "c/m" }) });
  const body = { characterId: "c", fields: { appearance: ["hair"] }, member: { index: 1, name: "Carolina Bell" }, image: { data: "AAAA", mimeType: "image/png" } };

  it("names the character, sends no portrait, and files a draft marked with the member", () => {
    const m = memHost(files());
    const req = { method: "POST", path: "/profile/fill", query: {}, body };
    const first = handleRoute(req, m.host) as { stash: Record<string, unknown> };
    const spec = m.requests[0]!.spec;
    expect(spec.images).toBeUndefined();
    expect(spec.messages[0].content).toContain("Fill the fields for Carolina Bell only");
    expect(first.stash.member).toBe(1);
    m.results.fill = { text: '{"profile":{"appearance":{"hair":"sky-blue"}}}' };
    const out = handleRoute({ ...req, stash: first.stash }, m.host) as { json: { draft: Record<string, any> } };
    expect(out.json.draft.member).toBe(1);
    expect(out.json.draft.profile).toEqual({ appearance: { hair: "sky-blue" } });
  });

  it("without a valid member it fills the card's own character as before", () => {
    const m = memHost(files());
    handleRoute({ method: "POST", path: "/profile/fill", query: {}, body: { ...body, member: { index: 0, name: "x" } } }, m.host);
    expect(m.requests[0]!.spec.images).toHaveLength(1);
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("Fill the fields for");
  });

  it("reads the parts of a long card that mention the name", () => {
    const long = { name: "N", description: ["Alice only text. ".repeat(60), "Beatriz Miller lives here. ".repeat(60)].join("\n\n"), personality: "" };
    const part = partsAbout(long, 1200, "Beatriz Miller");
    expect(part).toContain("Beatriz Miller lives here");
    expect(part).not.toContain("Alice only");
    expect(partsAbout(long, 1200, "Nobody Zzz")).toContain("Alice only");
  });
});

describe("accepting a cast and a member fill on the card", () => {
  const card = (cardExtras: Record<string, unknown> = {}) => ({ cardExtras, versions: [], description: "d", personality: "p", scenario: "", firstMessage: "", exampleDialogue: "", systemPromptOverride: "", postHistoryInstructions: "" }) as any;

  it("Structure it's cast becomes the profile's cast and the text has one part per character", () => {
    const patch = acceptDraft(card(), { profile: { identity: { first: "Alice" }, goals: { life: "a" } }, cast: [{ identity: { first: "Carolina" }, goals: { life: "c" } }], leftover: { description: "", personality: "" } } as any);
    const p = profileOf({ cardExtras: patch.cardExtras } as any)!;
    expect(castOf(p).map((m) => personName(m))).toEqual(["Carolina"]);
    expect(compileProfile(p).description).toContain("### Carolina");
  });

  it("a fill goes to its own character of the cast and leaves the first alone", () => {
    const start = { identity: { first: "Alice" }, cast: [{ identity: { first: "Carolina" } }, { identity: { first: "Beatriz" } }] };
    const patch = acceptFill(card({ extensions: { molfar_profile: start } }), { kind: "fill", member: 2, profile: { appearance: { hair: "purple" }, identity: { first: "Other" } } } as any);
    const p = profileOf({ cardExtras: patch.cardExtras } as any)!;
    expect(castOf(p)[1]!.appearance).toEqual({ hair: "purple" });
    // a name that is already there is not replaced
    expect(personName(castOf(p)[1]!)).toBe("Beatriz");
    expect(castOf(p)[0]!.appearance).toBeUndefined();
    expect(p.appearance).toBeUndefined();
  });

  it("a fill whose place is gone changes nothing", () => {
    const start = { identity: { first: "Alice" }, cast: [{ identity: { first: "Carolina" } }] };
    const patch = acceptFill(card({ extensions: { molfar_profile: start } }), { kind: "fill", member: 5, profile: { appearance: { hair: "x" } } } as any);
    const p = profileOf({ cardExtras: patch.cardExtras } as any)!;
    expect(p.appearance).toBeUndefined();
    expect(castOf(p)[0]!.appearance).toBeUndefined();
  });

  it("knows a blank character from a filled one", () => {
    expect(isBlankProfile({})).toBe(true);
    expect(isBlankProfile({ identity: { first: " " }, lists: { traits: [] }, sections: { sexuality: false } })).toBe(true);
    expect(isBlankProfile({ goals: { life: "x" } })).toBe(false);
  });
});
