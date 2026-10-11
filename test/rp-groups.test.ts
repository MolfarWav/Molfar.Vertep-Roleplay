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
