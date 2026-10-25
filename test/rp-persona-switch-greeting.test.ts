/**
 * Switching the persona of a chat nobody has answered yet re-reads {{user}} in its greeting.
 * Once a turn was sent, the transcript keeps the names it was written under.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const E = (await import(engineUrl)) as { handleRoute: Function };

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "persona-greeting-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }),
  );
  const card = (name: string, extra: Record<string, unknown>) => ({ spec: "chara_card_v2", name, description: "x", ...extra });
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "aria", "card.json"),
    JSON.stringify(card("Aria", { first_mes: "Hello, {{user}}! I am {{char}}.", alternate_greetings: ["Second hello, {{user}}."] })),
  );
  fs.mkdirSync(path.join(root, "characters", "bo"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "bo", "card.json"),
    JSON.stringify(card("Bo", { group_only_greetings: ["Bo greets {{user}}.", "Bo waves at {{user}}."] })),
  );
  fs.writeFileSync(
    path.join(root, "groups", "duo.json"),
    JSON.stringify({ id: "duo", name: "Duo", memberIds: ["bo"], mode: "list", mutedIds: [], openings: ["The hall waits for {{user}}."] }),
  );
  for (const [id, name] of [["ann", "Ann"], ["bea", "Bea"]]) {
    fs.writeFileSync(path.join(root, "personas", `${id}.json`), JSON.stringify({ id, name, description: "" }));
  }
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "ann" }));
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
const open = (id: string) => call("GET", `/chats/${id}`).json as { meta: Record<string, any>; messages: Array<Record<string, any>> };
const start = (body: Record<string, unknown>) => call("POST", "/chats", body).json.meta.id as string;

describe("persona switch before the first reply", () => {
  it("re-reads {{user}} and {{char}} in the greeting", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    expect(open(id).messages[0].text).toBe("Hello, Ann! I am Aria.");

    expect(call("PATCH", `/chats/${id}`, { personaId: "bea" }).status).toBe(200);
    const msg = open(id).messages[0];
    expect(msg.text).toBe("Hello, Bea! I am Aria.");
    expect(msg.swipes).toEqual(["Hello, {{user}}! I am {{char}}.", "Second hello, {{user}}."]);
    expect(open(id).meta.personaId).toBe("bea");
  });

  it("stays on the swipe the person picked", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    call("POST", `/chats/${id}/messages/${open(id).messages[0].id}/swipe`, { index: 1 });
    expect(open(id).messages[0].text).toBe("Second hello, Ann.");

    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    const msg = open(id).messages[0];
    expect(msg.text).toBe("Second hello, Bea.");
    expect(msg.swipe).toBe(1);
  });

  it("keeps the message id and does not bump the chat's activity time", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    const before = open(id);
    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    const after = open(id);
    expect(after.messages[0].id).toBe(before.messages[0].id);
    expect(after.meta.updatedAt).toBe(before.meta.updatedAt);
  });

  it("re-reads a group chat's narrator opening and keeps each member's pick", () => {
    const id = start({ groupId: "duo", personaId: "ann" });
    const before = open(id).messages;
    expect(before[0].text).toBe("The hall waits for Ann.");
    const bo = before.find((m) => m.charId === "bo")!;
    expect(bo.text).toContain("Ann");

    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    const after = open(id).messages;
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(after[0].text).toBe("The hall waits for Bea.");
    const boAfter = after.find((m) => m.charId === "bo")!;
    expect(boAfter.swipe).toBe(bo.swipe);
    expect(boAfter.text).toBe(bo.text.replace("Ann", "Bea"));
  });

  it("is a no-op for a persona that is already the chat's", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    const raw = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8");
    call("PATCH", `/chats/${id}`, { personaId: "ann" });
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).toBe(raw);
  });
});

describe("persona switch after the chat began", () => {
  const withTurn = (id: string) => {
    const file = path.join(root, "chats", `${id}.jsonl`);
    const user = { id: "u1", name: "Ann", charId: null, role: "user", text: "Hi Aria", at: Date.now() };
    fs.appendFileSync(file, `${JSON.stringify(user)}\n`);
  };

  it("leaves the greeting as written once someone has spoken", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    withTurn(id);
    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    const msgs = open(id).messages;
    expect(msgs[0].text).toBe("Hello, Ann! I am Aria.");
    expect(msgs[1].name).toBe("Ann");
  });

  it("leaves a greeting the person edited", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    const mid = open(id).messages[0].id;
    call("PATCH", `/chats/${id}/messages/${mid}`, { text: "My own opening for Ann." });
    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    expect(open(id).messages[0].text).toBe("My own opening for Ann.");
  });

  it("leaves a chat whose messages were deleted or moved (tainted)", () => {
    const id = start({ characterId: "aria", personaId: "ann" });
    const metaFile = path.join(root, "chats", `${id}.meta.json`);
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    fs.writeFileSync(metaFile, JSON.stringify({ ...meta, tainted: true }));
    call("PATCH", `/chats/${id}`, { personaId: "bea" });
    expect(open(id).messages[0].text).toBe("Hello, Ann! I am Aria.");
  });
});
