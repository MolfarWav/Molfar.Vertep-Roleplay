/**
 * #156: {{user}} and {{char}} in text that goes to a helper model as input are replaced with the chat's names.
 * The five copies of expandNames (litopys, relations, world, letters, agents) must agree; the helper requests
 * of litopys, relations and world get the real names. Stored data is never touched: only the request copy.
 */
import { describe, expect, it } from "bun:test";
import * as agents from "../plugins/agents/plugin.js";
import * as dash from "../plugins/relations/plugin.js";
import * as letters from "../plugins/letters/plugin.js";
import * as lit from "../plugins/litopys/plugin.js";
import * as world from "../plugins/world/plugin.js";

const COPIES: Record<string, (text: any, user: any, char: any) => any> = {
  litopys: lit.expandNames,
  relations: dash.expandNames,
  world: world.expandNames,
  letters: letters.expandNames,
  agents: agents.expandNames,
};

const CASES: [string, unknown, unknown, unknown][] = [
  ["Hi {{user}}!", "Taras", "Odarka", "Hi Taras!"],
  ["{{User}} and {{ user }} and {{USER}}", "Taras", "Odarka", "Taras and Taras and Taras"],
  ["{{char}} / {{ CHAR }} / {{  char  }}", "Taras", "Odarka", "Odarka / Odarka / Odarka"],
  ["{{user}} {{char}}", "", "Odarka", "{{user}} Odarka"],
  ["{{user}} {{char}}", "Taras", "", "Taras {{char}}"],
  ["{{user}} {{char}}", "  ", "  ", "{{user}} {{char}}"],
  ["no macros here", "Taras", "Odarka", "no macros here"],
  ["{{getvar::x}} {{if}} {{random::a::b}} {{username}}", "Taras", "Odarka", " {{if}} a {{username}}"],
  ["a{{// a note}}b {{setvar::mood::calm}}{{trim}}c {{random:x,y}}{{newline}}d {{getglobalvar::g}}", "Taras", "Odarka", "ab c x\nd "],
  ["{{if user}}yes{{/if}} {{persona}}", "Taras", "Odarka", "{{if user}}yes{{/if}} {{persona}}"],
  ["{{user}}", "A$&B $1", "", "A$&B $1"],
  ["{{user}} then {{user}}", 42, "Odarka", "{{user}} then {{user}}"],
  ["", "Taras", "Odarka", ""],
];

describe("expandNames: the five copies agree", () => {
  for (const [text, user, char, want] of CASES) {
    it(`${JSON.stringify(text)} with ${JSON.stringify(user)} / ${JSON.stringify(char)}`, () => {
      for (const [plugin, fn] of Object.entries(COPIES)) {
        expect({ plugin, out: fn(text, user, char) }).toEqual({ plugin, out: want });
      }
    });
  }

  it("returns non-string input unchanged", () => {
    for (const [plugin, fn] of Object.entries(COPIES)) {
      expect({ plugin, out: fn(undefined, "Taras", "Odarka") }).toEqual({ plugin, out: undefined });
      expect({ plugin, out: fn(null, "Taras", "Odarka") }).toEqual({ plugin, out: null });
      expect({ plugin, out: fn(7, "Taras", "Odarka") }).toEqual({ plugin, out: 7 });
    }
  });
});

/** A file store for the helper-name lookups: reads throw for a missing file, as the host does. */
function memFs(files: Record<string, string>) {
  return {
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p]!;
    },
    write: (p: string, s: string) => { files[p] = s; },
    remove: (p: string) => { delete files[p]; },
    list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
  };
}

const CARD = JSON.stringify({ name: "Odarka" });
const solo = { id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" };

describe("helper requests get the real names", () => {
  it("litopys: the worker request carries the persona and the card name, not the raw macros", () => {
    const fsx = memFs({ "characters/odarka/card.json": CARD });
    const line = [
      { id: "m0", role: "char", name: "Odarka", text: "Odarka stirs the pot.", swipe: 0 },
      { id: "m1", role: "user", name: "Taras", text: "{{user}} asks {{char}} about the tower.", swipe: 0 },
      { id: "m2", role: "char", name: "Odarka", text: "{{ CHAR }} nods.", swipe: 0 },
    ];
    const work = { scene: { from: "m0", to: "m2", fromIdx: 0, toIdx: 2, count: 3, kind: "scene", label: "" }, replaces: null };
    const names = lit.helperNames(fsx, solo);
    expect(names).toEqual({ user: "Taras", char: "Odarka" });
    const req = lit.buildWorkerRequest(lit.emptyChat("c1"), work, line, {}, { ...lit.DEFAULT_CONFIG, ...lit.DEFAULT_PROMPTS }, solo, { names });
    const sent = req.messages[0].content as string;
    expect(sent).toContain("Taras asks Odarka about the tower.");
    expect(sent).toContain("Odarka nods.");
    expect(sent).not.toContain("{{user}}");
    expect(sent).not.toMatch(/\{\{\s*char\s*\}\}/i);
    // the stored line is not changed
    expect(line[1]!.text).toBe("{{user}} asks {{char}} about the tower.");
  });

  it("litopys: a group chat leaves {{char}} raw and the request has no name for it", () => {
    const fsx = memFs({ "groups/g1.json": JSON.stringify({ memberIds: ["odarka", "maksym"] }), "characters/odarka/card.json": CARD });
    const group = { id: "c2", groupId: "g1", characterId: "odarka", userName: "Taras" };
    expect(lit.helperNames(fsx, group)).toEqual({ user: "Taras", char: "" });
    const req = lit.buildArcRequest({ chapters: [{ label: "a", text: "{{user}} met {{char}}." }] }, { ...lit.DEFAULT_CONFIG, ...lit.DEFAULT_PROMPTS }, group, lit.helperNames(fsx, group));
    expect(req.messages[0].content).toContain("Taras met {{char}}.");
  });

  it("litopys: the persona name comes from the persona file when the chat has none", () => {
    const fsx = memFs({ "characters/odarka/card.json": CARD, "personas/p9.json": JSON.stringify({ name: "Ivanka" }) });
    expect(lit.helperNames(fsx, { id: "c3", characterId: "odarka", personaId: "p9" })).toEqual({ user: "Ivanka", char: "Odarka" });
  });

  it("relations: the names of a solo chat, and none for a group", () => {
    const fsx = memFs({ "characters/odarka/card.json": CARD, "groups/g1.json": JSON.stringify({ memberIds: ["odarka", "maksym"] }) });
    const text = "{{user}} rates {{char}} and {{char}}'s friend.";
    const names = dash.helperNames(fsx, solo);
    expect(names).toEqual({ user: "Taras", char: "Odarka" });
    expect(dash.expandNames(text, names.user, names.char)).toBe("Taras rates Odarka and Odarka's friend.");
    const grp = dash.helperNames(fsx, { id: "c2", groupId: "g1", characterId: "odarka", userName: "Taras" });
    expect(grp).toEqual({ user: "Taras", char: "" });
    // no persona name anywhere: the user stays raw (NO_USER_NAME is never sent)
    expect(dash.helperNames(fsx, { id: "c4", characterId: "odarka" }).user).toBe("");
  });

  it("world: the names of a solo chat; the card is read through the same member list the DM uses", () => {
    const fsx = memFs({ "characters/odarka/card.json": CARD, "groups/g1.json": JSON.stringify({ memberIds: ["odarka", "maksym"] }) });
    expect(world.helperNames(fsx, solo)).toEqual({ user: "Taras", char: "Odarka" });
    expect(world.helperNames(fsx, { id: "c2", groupId: "g1", characterId: "odarka", userName: "Taras" })).toEqual({ user: "Taras", char: "" });
    const text = "The DM greets {{user}} at the gate of {{char}}.";
    const n = world.helperNames(fsx, solo);
    expect(world.expandNames(text, n.user, n.char)).toBe("The DM greets Taras at the gate of Odarka.");
  });

  it("letters: an idle letter's request carries the card's name and the persona from the chat", () => {
    const req = letters.buildLetterRequest({
      why: "idle",
      card: { name: "Odarka", description: "{{char}} keeps the toll for {{user}}." },
      recent: ["Player: {{user}} waits."],
      summary: "",
      lang: "en",
      model: "",
      names: { user: "Taras", char: "Odarka" },
    });
    const sent = req.messages[0].content as string;
    expect(sent).toContain("Odarka keeps the toll for Taras.");
    expect(sent).toContain("Player: Taras waits.");
    expect(sent).not.toContain("{{");
  });
});
