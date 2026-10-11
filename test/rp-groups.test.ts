/**
 * Groups live in groups/<id>.json, not among the cards: deleting a group goes through
 * DELETE /groups/<id>, which takes the group's chats with it and leaves the members alone.
 * groupToCharacter describes a group by its own members, not by every card.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Character } from "../src/lib/types";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const E = (await import(engineUrl)) as { handleRoute: Function };
// engine.ts reads the frame URL at load
(globalThis as { location?: unknown }).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost" };
const { groupToCharacter } = await import("../src/lib/engine");

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "groups-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }),
  );
  for (const [id, name] of [["aria", "Aria"], ["bo", "Bo"]] as const) {
    fs.mkdirSync(path.join(root, "characters", id), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify({ spec: "chara_card_v2", name, description: "x", first_mes: "Hi." }));
  }
  fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [] }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const host = {
  fs: {
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
  log: () => {},
};
const call = (method: string, p: string, body?: unknown) => {
  const out = E.handleRoute({ method, path: p, query: {}, body }, host) as { status?: number; json?: Record<string, any> };
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, any> };
};
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

describe("DELETE /groups/<id>", () => {
  it("removes the group and its chats, keeps the members and their solo chats", () => {
    const g = call("POST", "/chats", { groupId: "duo" }).json.meta.id as string;
    const solo = call("POST", "/chats", { characterId: "aria" }).json.meta.id as string;
    expect(exists(`chats/${g}.meta.json`)).toBe(true);

    expect(call("DELETE", "/groups/duo").json.ok).toBe(true);
    expect(exists("groups/duo.json")).toBe(false);
    expect(exists(`chats/${g}.meta.json`)).toBe(false);
    expect(exists(`chats/${g}.jsonl`)).toBe(false);
    expect(exists(`chats/${solo}.meta.json`)).toBe(true);
    expect(exists("characters/aria/card.json")).toBe(true);
    expect(exists("characters/bo/card.json")).toBe(true);
  });

  it("DELETE /characters/<group id> never touched the group (the old bug's route)", () => {
    call("DELETE", "/characters/duo");
    expect(exists("groups/duo.json")).toBe(true);
  });
});

describe("groupToCharacter", () => {
  const card = (id: string, name: string) => ({ id, name, avatar: `${id}.png` }) as unknown as Character;
  it("names only this group's members, in the group's order", () => {
    const all = [card("cy", "Cy"), card("bo", "Bo"), card("aria", "Aria")]
    const c = groupToCharacter({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], favorite: true }, all)
    expect(c.description).toBe("Group chat with Aria, Bo.")
    expect(c.avatar).toBe("aria.png")
    expect(c.favorite).toBe(true)
    expect(c.isGroup).toBe(true)
  });
});

describe("group settings reach the prompt and the chat", () => {
  const entry = (key: string, content: string) => ({ uid: 1, title: content, keys: [key], content, enabled: true, order: 100, position: "before_char" });
  const seed = (g: Record<string, unknown>) => {
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({
      id: "default", name: "Default", prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512,
      prompts: [
        { identifier: "worldInfoBefore", name: "WI", marker: true, role: "system", enabled: true },
        { identifier: "scenario", name: "Scenario", marker: true, role: "system", enabled: true },
        { identifier: "chatHistory", name: "History", marker: true, enabled: true },
      ],
    }));
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [], ...g }));
    for (const [id, owner] of [["ba", "aria"], ["bb", "bo"]] as const) {
      fs.writeFileSync(path.join(root, "lorebooks", `${id}.json`), JSON.stringify({ id, name: id, settings: {}, entries: [entry("tower", `LORE-${owner}`)] }));
      const card = JSON.parse(fs.readFileSync(path.join(root, "characters", owner, "card.json"), "utf8"));
      card.scenario = `SCEN-${owner}`;
      card.studio = { embeddedLorebookId: id };
      fs.writeFileSync(path.join(root, "characters", owner, "card.json"), JSON.stringify(card));
    }
  };
  const peek = () => {
    const id = call("POST", "/chats", { groupId: "duo" }).json.meta.id as string;
    call("PATCH", `/chats/${id}`, { lorebookIds: ["ba", "bb"] });
    fs.appendFileSync(path.join(root, "chats", `${id}.jsonl`), JSON.stringify({ id: "u1", role: "user", name: "You", text: "the tower" }) + "\n");
    return JSON.stringify(call("POST", "/prompt/preview", { chatId: id }).json);
  };

  it("by default every member's book fires", () => {
    seed({});
    const all = peek();
    expect(all).toContain("LORE-aria");
    expect(all).toContain("LORE-bo");
  });
  it("memberBooks speaker: only the speaker's book (list mode: aria first)", () => {
    seed({ memberBooks: "speaker" });
    const all = peek();
    expect(all).toContain("LORE-aria");
    expect(all).not.toContain("LORE-bo");
  });
  it("memberBooks off: no member's book", () => {
    seed({ memberBooks: "off" });
    const all = peek();
    expect(all).not.toContain("LORE-aria");
    expect(all).not.toContain("LORE-bo");
  });
  it("a muted member's book stays out", () => {
    seed({ mutedIds: ["bo"] });
    expect(peek()).not.toContain("LORE-bo");
  });
  it("the shared scenario replaces the members' own", () => {
    seed({ scenario: "SCEN-SHARED" });
    const all = peek();
    expect(all).toContain("SCEN-SHARED");
    expect(all).not.toContain("SCEN-aria");
  });
  it("openings: the group's narrated one, then each member's by choice", () => {
    seed({ openings: ["The tavern is loud.", "Rain outside."], memberSettings: { aria: { opening: 0 }, bo: { opening: "none" } } });
    const msgs = call("POST", "/chats", { groupId: "duo" }).json.messages as { name: string; text: string; swipes: string[]; charId: string | null }[];
    expect(msgs.map((m) => m.name)).toEqual(["Narrator", "Aria"]);
    expect(msgs[0]!.swipes).toEqual(["The tavern is loud.", "Rain outside."]);
    expect(msgs[1]!.text).toBe("Hi.");
  });
  it("talkativeness: the group's value wins over the card's", () => {
    seed({ mode: "natural", memberSettings: { aria: { talkativeness: 0 }, bo: { talkativeness: 1 } } });
    const id = call("POST", "/chats", { groupId: "duo" }).json.meta.id as string;
    fs.appendFileSync(path.join(root, "chats", `${id}.jsonl`), JSON.stringify({ id: "u1", role: "user", name: "You", text: "hello" }) + "\n");
    // a peek takes the most likely pick
    const r = call("POST", "/prompt/preview", { chatId: id }).json;
    expect(JSON.stringify(r)).toContain("Bo");
  });
});

describe("narrator mode", () => {
  const narrate = (g: Record<string, unknown> = {}) => {
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "natural", mutedIds: [], generationMode: "narrator", ...g }));
    for (const [id, desc] of [["aria", "{{char}} is a mage."], ["bo", "{{char}} is a thief."]] as const) {
      const card = JSON.parse(fs.readFileSync(path.join(root, "characters", id, "card.json"), "utf8"));
      card.description = desc;
      fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify(card));
    }
    return call("POST", "/chats", { groupId: "duo" }).json.meta.id as string;
  };

  it("one prompt carries every unmuted member's card, {{char}} read as that card", () => {
    const id = narrate();
    const all = JSON.stringify(call("POST", "/prompt/preview", { chatId: id }).json);
    expect(all).toContain("Aria is a mage.");
    expect(all).toContain("Bo is a thief.");
    expect(all).toContain("You narrate the scene");
  });

  it("a muted member stays out of the narrator's prompt", () => {
    const id = narrate({ mutedIds: ["bo"] });
    const all = JSON.stringify(call("POST", "/prompt/preview", { chatId: id }).json);
    expect(all).toContain("Aria is a mage.");
    expect(all).not.toContain("Bo is a thief.");
  });

  it("a send makes one reply, carried by the group itself", () => {
    const id = narrate();
    const requests: unknown[] = [];
    const llm = host.llm as { request: (k: string, r: unknown) => void; results: Record<string, unknown> };
    const prevRequest = llm.request;
    llm.request = (_k, r) => { requests.push(r); };
    try {
      const req: Record<string, unknown> = { method: "POST", path: `/chats/${id}/send`, query: {}, body: { text: "Hello both." } };
      const a = E.handleRoute(req, host) as { stash?: unknown; json?: Record<string, any> };
      expect(requests.length).toBe(1);
      if (a.stash) req.stash = a.stash;
      llm.results.reply = { text: 'Aria nods. "Welcome."\n\nBo grins. "Hey."', model: "m" };
      const b = E.handleRoute(req, host) as { json?: Record<string, any> };
      expect(b.json?.reply?.charId).toBe("duo");
      expect(b.json?.reply?.name).toBe("Duo");
      expect(b.json?.queue).toBeUndefined();
    } finally {
      llm.request = prevRequest;
      delete llm.results.reply;
    }
  });
});
