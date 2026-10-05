// Litopys by hand: add, retire, restore a fact and rewrite the story so far.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const L = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "litopys-edit-"));
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats/c1.meta.json"), JSON.stringify({ id: "c1", title: "t", characterId: "aria" }));
  fs.writeFileSync(path.join(root, "chats/c1.jsonl"), "");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const host = () => ({
  fs: {
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  llm: { request: () => {}, results: {} },
  log: () => {},
});
const call = (method: string, p: string, body?: unknown, query: Record<string, string> = {}) => L.handleRoute({ method, path: p, body, query }, host());
const lore = () => call("GET", "/litopys/state", undefined, { chatId: "c1" }).json.lore;

describe("litopys by hand", () => {
  it("adds a fact to a chat with no lore yet, refuses a duplicate, retires and restores it", () => {
    const added = call("POST", "/litopys/facts", { chatId: "c1", action: "add", text: "The well is dry." });
    expect(added.json).toMatchObject({ ok: true, status: "active", text: "The well is dry." });
    expect(call("POST", "/litopys/facts", { chatId: "c1", action: "add", text: "the well is  dry." }).status).toBe(409);
    expect(call("POST", "/litopys/facts", { chatId: "c1", action: "add", text: "  " }).status).toBe(400);
    const id = added.json.id;
    expect(call("POST", "/litopys/facts", { chatId: "c1", action: "retire", id }).json.status).toBe("retired");
    expect(call("POST", "/litopys/facts", { chatId: "c1", action: "restore", id }).json.status).toBe("active");
    const facts = lore().worldFacts;
    expect(facts.length).toBe(1);
    expect(facts[0]).toMatchObject({ kind: "manual", status: "active" });
  });

  it("rewrites and clears the story so far; an unknown chat is refused", () => {
    expect(call("POST", "/litopys/story", { chatId: "c1", text: " They reached the gate. " }).json.storySoFar).toBe("They reached the gate.");
    expect(lore().storySoFar).toBe("They reached the gate.");
    expect(call("POST", "/litopys/story", { chatId: "c1", text: "" }).json.storySoFar).toBeNull();
    expect(call("POST", "/litopys/story", { chatId: "nope", text: "x" }).status).toBe(404);
    expect(call("POST", "/litopys/story", { chatId: "c1" }).status).toBe(400);
  });
});

describe("litopys prompt insert", () => {
  it("stays out of the prompt until the user switches it on", () => {
    call("POST", "/litopys/facts", { chatId: "c1", action: "add", text: "The well is dry." });
    const ask = () => L.llmRequest({ key: "reply", request: { sessionId: "c1", systemPrompt: "S" } }, host());
    expect(ask()).toBeNull();
    call("PUT", "/litopys/config", { enabled: true, values: { inject: "on" } });
    expect(ask().systemPrompt).toContain("The well is dry.");
    call("PUT", "/litopys/config", { values: { inject: "off" } });
    expect(ask()).toBeNull();
  });
});
