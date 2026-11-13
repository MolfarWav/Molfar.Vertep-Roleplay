/**
 * Group dynamics (interruptions, own goals, voices, Spotlight): the prompt lines, the cleaning of a member's voice,
 * the silent-turn count and the weighted pick, and how a group and a chat's own turns carry the settings.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const E = (await import(engineUrl)) as {
  handleRoute: Function;
  groupDynamicsText: (g: unknown, one: string | null, userName: string) => string;
  groupVoicesText: (g: unknown, voiced: { id: string; name: string }[]) => string;
  cleanVoice: (v: unknown) => { quirks: string[]; lines: string[] } | null;
  silentTurns: (msgs: unknown[], members: { id: string; name: string }[], narrating: boolean, scan?: number) => Map<string, number>;
  spotlightLine: (members: { id: string; name: string }[], silent: Map<string, number>) => string;
  groupTurnPlan: Function;
};
(globalThis as { location?: unknown }).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost" };
const { chatGroupSettings, mergeChatTurns, NEW_GROUP_DYNAMICS } = await import("../src/lib/engine");

const members = [{ id: "aria", name: "Aria" }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }];
const reply = (charId: string, name: string, text = "...") => ({ id: Math.random().toString(36), role: "char", charId, name, text });

describe("dynamics lines", () => {
  it("nothing for a group with no dials (older groups play as before)", () => {
    expect(E.groupDynamicsText({}, null, "You")).toBe("");
    expect(E.groupDynamicsText({ banter: "off", pushback: "off" }, "Aria", "You")).toBe("");
    expect(E.groupDynamicsText({ banter: "nonsense" }, null, "You")).toBe("");
  });
  it("can and should read differently", () => {
    const can = E.groupDynamicsText({ banter: "can", pushback: "can" }, null, "You");
    const should = E.groupDynamicsText({ banter: "should", pushback: "should" }, null, "You");
    expect(can).toContain("Characters can interrupt each other");
    expect(can).toContain("they can object, bargain, or refuse outright");
    expect(should).toContain("Characters should interrupt each other");
    expect(should).toContain("they object, bargain, or refuse outright");
    expect(should).toContain("tension with You");
    expect(should).not.toContain("can object");
  });
  it("one writer is named instead of 'characters'", () => {
    const one = E.groupDynamicsText({ banter: "can", pushback: "should" }, "Aria", "You");
    expect(one).toContain("Aria can cut in");
    expect(one).toContain("Aria acts on their own goals");
    expect(one).not.toContain("Characters");
  });
});

describe("voices", () => {
  it("cleans a voice: at most 2 habits and 5 lines, trimmed, blanks dropped", () => {
    const v = E.cleanVoice({ quirks: [" fragments ", "", "no questions", "third"], lines: ["a", " ", "b", "c", "d", "e", "f"] });
    expect(v).toEqual({ quirks: ["fragments", "no questions"], lines: ["a", "b", "c", "d", "e"] });
    expect(E.cleanVoice({ quirks: [], lines: [" "] })).toBeNull();
    expect(E.cleanVoice("x")).toBeNull();
    expect(E.cleanVoice(null)).toBeNull();
    expect(E.cleanVoice({ lines: ["x".repeat(500)] })!.lines[0]!.length).toBe(240);
  });
  it("one row per member that has notes, none when nobody does", () => {
    const g = { memberSettings: { aria: { voice: { quirks: ["talks in fragments"], lines: ["Fine.", "Not my problem."] } }, cy: { voice: { quirks: ["starts with Look,"] } } } };
    const txt = E.groupVoicesText(g, members);
    expect(txt).toContain("Aria. Habits: talks in fragments. Sounds like: \"Fine.\" / \"Not my problem.\"");
    expect(txt).toContain("Cy. Habits: starts with Look,.");
    expect(txt).not.toContain("Bo.");
    expect(E.groupVoicesText({ memberSettings: {} }, members)).toBe("");
    expect(E.groupVoicesText({}, members)).toBe("");
  });
});

describe("silent turns and Spotlight", () => {
  it("counts the replies since a member's own reply", () => {
    const msgs = [reply("aria", "Aria"), reply("bo", "Bo"), reply("bo", "Bo"), reply("bo", "Bo")];
    const s = E.silentTurns(msgs, members, false);
    expect(s.get("aria")).toBe(3);
    expect(s.get("bo")).toBe(0);
    expect(s.get("cy")).toBe(4);
  });
  it("greetings and pictures are not turns", () => {
    const msgs = [reply("aria", "Aria"), { ...reply("bo", "Bo"), greeting: true }, { ...reply("bo", "Bo"), picture: "x" }];
    expect(E.silentTurns(msgs, members, false).get("aria")).toBe(0);
  });
  it("narrator replies count for the names they mention", () => {
    const msgs = [reply("grp", "Duo", "Aria laughs."), reply("grp", "Duo", "Bo frowns."), reply("grp", "Duo", "Bo leaves.")];
    const s = E.silentTurns(msgs, members, true);
    expect(s.get("aria")).toBe(2);
    expect(s.get("bo")).toBe(0);
    expect(s.get("cy")).toBe(3);
  });
  it("the line names at most two members, and only after six quiet turns", () => {
    const silent = new Map([["aria", 2], ["bo", 6], ["cy", 9]]);
    const line = E.spotlightLine(members, silent);
    expect(line).toBe("Cy has been quiet for 9 turns; give them a natural way into the scene. Bo has been quiet for 6 turns; give them a natural way into the scene.");
    expect(E.spotlightLine(members, new Map([["aria", 5]]))).toBe("");
  });
  it("a silent member is picked more often with Spotlight on, never when it is off, and a named member still wins", () => {
    const withCard = members.map((m) => ({ ...m, card: { extensions: { talkativeness: 0.7 } } }));
    const silent = new Map([["aria", 0], ["bo", 0], ["cy", 6]]);
    const run = (g: Record<string, unknown>, text: string) => {
      const picks: Record<string, number> = { aria: 0, bo: 0, cy: 0 };
      let seed = 1;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 3000; i++) picks[E.groupTurnPlan({ mode: "natural", memberIds: ["aria", "bo", "cy"], allowSelfResponses: true, ...g }, withCard, null, text, rnd, silent)[0].id]!++;
      return picks;
    };
    const off = run({}, "hello");
    const on = run({ spotlight: true }, "hello");
    expect(on.cy!).toBeGreaterThan(off.cy! * 1.3);
    expect(Math.abs(off.cy! - 1000)).toBeLessThan(120);
    expect(run({ spotlight: true }, "what do you think, Aria?").aria).toBe(3000);
  });
  it("a muted member is not boosted", () => {
    const withCard = members.map((m) => ({ ...m, card: { extensions: { talkativeness: 0.7 } } }));
    const plan = E.groupTurnPlan({ mode: "natural", spotlight: true, memberIds: ["aria", "bo", "cy"], mutedIds: ["cy"], allowSelfResponses: true }, withCard, null, "hi", null, new Map([["cy", 6]]));
    expect(plan[0].id).not.toBe("cy");
  });
});

describe("the group and the chat carry the settings", () => {
  it("older groups play with everything off, new ones start on", () => {
    const old = chatGroupSettings({ name: "g", memberIds: [] });
    expect([old.banter, old.pushback, old.spotlight]).toEqual(["off", "off", false]);
    const fresh = chatGroupSettings({ name: "g", memberIds: [], ...NEW_GROUP_DYNAMICS });
    expect([fresh.banter, fresh.pushback, fresh.spotlight]).toEqual(["can", "can", true]);
  });
  it("a chat's own turns win, and equal-to-group keys are dropped", () => {
    const g = { name: "g", memberIds: [], ...NEW_GROUP_DYNAMICS };
    expect(mergeChatTurns(g, undefined, { banter: "should" })).toEqual({ banter: "should" });
    expect(chatGroupSettings(g, { banter: "off" }).banter).toBe("off");
    expect(mergeChatTurns(g, { banter: "should" }, { banter: "can" })).toBeUndefined();
    expect(mergeChatTurns(g, undefined, { spotlight: false })).toEqual({ spotlight: false });
    expect(mergeChatTurns(g, { spotlight: false }, { spotlight: true })).toBeUndefined();
  });
});

describe("in the prompt", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gdyn-"));
    for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({
      id: "default", name: "Default", temperature: 0.8, openai_max_tokens: 512, openai_max_context: 8192,
      prompts: [
        { identifier: "scenario", name: "Scenario", marker: true, role: "system" },
        { identifier: "chatHistory", name: "History", marker: true },
      ],
      prompt_order: [{ character_id: 100000, order: [
        { identifier: "scenario", enabled: true },
        { identifier: "chatHistory", enabled: true },
      ] }],
    }));
    for (const [id, name] of [["aria", "Aria"], ["bo", "Bo"]] as const) {
      fs.mkdirSync(path.join(root, "characters", id), { recursive: true });
      fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify({ spec: "chara_card_v2", name, description: `${name} lives.`, first_mes: "Hi." }));
    }
    fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
  });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const call = (method: string, p: string, body?: unknown) => (E.handleRoute({ method, path: p, query: {}, body }, host) as { json?: Record<string, any> })?.json ?? {};
  const group = (g: Record<string, unknown>) =>
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "natural", mutedIds: [], ...g }));
  const peek = (turns?: Record<string, unknown>, history: Record<string, unknown>[] = []) => {
    const id = call("POST", "/chats", { groupId: "duo", ...(turns ? { turns } : {}) }).meta.id as string;
    fs.appendFileSync(path.join(root, "chats", `${id}.jsonl`), history.map((m) => JSON.stringify(m) + "\n").join("") + JSON.stringify({ id: "u1", role: "user", name: "You", text: "go" }) + "\n");
    return JSON.stringify(call("POST", "/prompt/preview", { chatId: id }));
  };

  it("an older group's prompt carries none of it", () => {
    group({ generationMode: "narrator" });
    const all = peek();
    expect(all).toContain("You narrate the scene");
    expect(all).not.toContain("interrupt");
    expect(all).not.toContain("own goals");
    expect(all).not.toContain("[Voices");
  });
  it("narrator: the lines and the voices ride with the scene text", () => {
    group({ generationMode: "narrator", banter: "can", pushback: "should", memberSettings: { aria: { voice: { quirks: ["talks in fragments"], lines: ["Fine."] } } } });
    const all = peek();
    expect(all).toContain("Characters can interrupt each other");
    expect(all).toContain("Characters act on their own goals");
    expect(all).toContain("Aria. Habits: talks in fragments.");
    expect(all).not.toContain("Bo. Habits");
  });
  it("a chat's own turns override the group", () => {
    group({ generationMode: "narrator", banter: "should" });
    expect(peek({ banter: "off" })).not.toContain("interrupt");
  });
  it("swap: only the speaker's voice, and the speaker is named", () => {
    group({ generationMode: "swap", banter: "can", memberSettings: { aria: { voice: { lines: ["Aria line"] } }, bo: { voice: { lines: ["Bo line"] } } } });
    const all = peek();
    expect(all).toContain("Aria can cut in");
    expect(all).toContain("Aria line");
    expect(all).not.toContain("Bo line");
  });
  it("Spotlight: a narrator group is asked to bring in a member quiet for six turns", () => {
    group({ generationMode: "narrator", spotlight: true });
    const history = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, role: "char", charId: "duo", name: "Duo", text: "Aria argues again." }));
    const all = peek(undefined, history);
    expect(all).toContain("Bo has been quiet for 6 turns");
    expect(all).not.toContain("Aria has been quiet");
  });
});
