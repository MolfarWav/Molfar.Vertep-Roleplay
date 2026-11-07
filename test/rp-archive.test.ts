/** #263: an archived chat is a status on the chat (meta.archived), read only on the engine side. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isArchived, suggestArchive } from "../src/lib/chat-list";

(globalThis as unknown as { location: unknown }).location ??= { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { chatPatchOf, engineChatToUI } = await import("../src/lib/engine");

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");
const lit = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as typeof import("../plugins/litopys/plugin.js");

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const host = () => ({
  fs: {
    root,
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
  log: () => {},
});
const call = (method: string, p: string, body?: unknown) =>
  eng.handleRoute({ method, path: p, query: {}, body }, host()) as { status?: number; json: Record<string, any> };
const newChat = () => (call("POST", "/chats", { characterId: "aria" }).json.meta as { id: string }).id;
const firstMessageId = (id: string) => (call("GET", "/chats/" + id).json.messages as { id: string }[])[0]!.id;

describe("an archived chat is read only on the engine side", () => {
  it("stores archived in the meta through PATCH, and Unarchive clears it", () => {
    const id = newChat();
    expect(call("PATCH", "/chats/" + id, { archived: true }).json.archived).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "chats", id + ".meta.json"), "utf8")).archived).toBe(true);
    expect(call("PATCH", "/chats/" + id, { archived: false }).json.archived).toBe(false);
  });

  it("refuses every route that changes the transcript with 409 archived", () => {
    const id = newChat();
    const mid = firstMessageId(id);
    call("PATCH", "/chats/" + id, { archived: true });
    const blocked: [string, string, unknown?][] = [
      ["POST", `/chats/${id}/send`, { text: "hi" }],
      ["POST", `/chats/${id}/next`, {}],
      ["POST", `/chats/${id}/swipe`, {}],
      ["POST", `/chats/${id}/continue`, {}],
      ["POST", `/chats/${id}/impersonate`, {}],
      ["POST", `/chats/${id}/reset`, {}],
      ["POST", `/chats/${id}/preset`, { presetId: "default" }],
      ["POST", `/chats/${id}/messages`, { role: "user", text: "x" }],
      ["PATCH", `/chats/${id}/messages/${mid}`, { text: "edited" }],
      ["DELETE", `/chats/${id}/messages/${mid}`],
      ["POST", `/chats/${id}/messages/${mid}/swipe`, {}],
      ["POST", `/chats/${id}/messages/${mid}/move`, { dir: 1 }],
    ];
    for (const [method, p, body] of blocked) {
      const out = call(method, p, body);
      expect([method + " " + p, out.status, out.json.error]).toEqual([method + " " + p, 409, "archived"]);
    }
    // nothing was written
    const msgs = call("GET", "/chats/" + id).json.messages as { id: string; text?: string }[];
    expect(msgs.length).toBe(1);
  });

  it("keeps reading, renaming, pinning, forking, Unarchive and deleting the chat open", () => {
    const id = newChat();
    const mid = firstMessageId(id);
    call("PATCH", "/chats/" + id, { archived: true });
    expect(call("GET", "/chats/" + id).status ?? 200).toBe(200);
    expect(call("PATCH", "/chats/" + id, { title: "The old road", pinned: true }).json.title).toBe("The old road");
    const fork = call("POST", `/chats/${id}/fork`, { messageId: mid });
    expect(fork.status).toBe(201);
    // the branch is a chat to play in: it does not inherit the archive
    expect((fork.json.meta as { archived?: boolean }).archived).toBeUndefined();
    expect(call("PATCH", "/chats/" + id, { archived: false }).json.archived).toBe(false);
    // and after Unarchive a write goes through the guard (it may fail for other reasons, never 409 archived)
    expect(call("POST", `/chats/${id}/messages`, { role: "user", text: "back" }).json.error).not.toBe("archived");
    call("PATCH", "/chats/" + id, { archived: true });
    expect((call("DELETE", "/chats/" + id).json as { ok?: boolean }).ok).toBe(true);
  });
});

describe("the client side of archived", () => {
  const meta = { id: "c1", title: "t", characterId: "aria", groupId: null, createdAt: 1 };
  it("reads archived from the meta and writes it back", () => {
    expect(isArchived(engineChatToUI({ ...meta, archived: true } as never, []))).toBe(true);
    expect(isArchived(engineChatToUI(meta as never, []))).toBe(false);
    expect(chatPatchOf({ archived: true })).toEqual({ archived: true });
    expect(chatPatchOf({ archived: false })).toEqual({ archived: false });
  });

  it("suggests archiving only a long chat that has been quiet for a week, never an archived or pinned one", () => {
    const now = 100 * 86_400_000;
    const old = now - 8 * 86_400_000;
    expect(suggestArchive({ updatedAt: old, messageCount: 150 }, now)).toBe(true);
    expect(suggestArchive({ updatedAt: old, messageCount: 99 }, now)).toBe(false);
    expect(suggestArchive({ updatedAt: now - 2 * 86_400_000, messageCount: 500 }, now)).toBe(false);
    expect(suggestArchive({ updatedAt: old, messageCount: 150, archived: true }, now)).toBe(false);
    expect(suggestArchive({ updatedAt: old, messageCount: 150, pinned: true }, now)).toBe(false);
    // a loaded transcript counts as well as the list's count
    expect(suggestArchive({ updatedAt: old, messages: new Array(120).fill(0) }, now)).toBe(true);
  });
});

describe("the links route archives the earlier chat (#263)", () => {
  const link = (chatId: string, from: string | null) => lit.linkRoute(host().fs as never, { chatId, from }) as { status: number; json: { links: Record<string, { from: string }>; archived: string[] } };
  const metaOf = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "chats", id + ".meta.json"), "utf8"));

  it("archives the earlier chat of a new link and says so, once", () => {
    const a = newChat();
    const b = newChat();
    const out = link(b, a);
    expect(out.status).toBe(200);
    expect(out.json.archived).toEqual([a]);
    expect(metaOf(a).archived).toBe(true);
    expect(metaOf(b).archived).toBeUndefined();
    // the same link again changes nothing and archives nothing
    call("PATCH", "/chats/" + a, { archived: false });
    expect(link(b, a).json.archived).toEqual([]);
    expect(metaOf(a).archived).toBeFalsy();
  });

  it("leaves the earlier chat alone when the switch is off, when a link is removed, or when it is archived already", () => {
    const a = newChat();
    const b = newChat();
    lit.patchConfig(host().fs as never, { archiveOnContinue: false });
    expect(link(b, a).json.archived).toEqual([]);
    expect(metaOf(a).archived).toBeFalsy();
    lit.patchConfig(host().fs as never, { archiveOnContinue: true });
    expect(link(b, null).json.archived).toEqual([]);
    call("PATCH", "/chats/" + a, { archived: true });
    expect(link(b, a).json.archived).toEqual([]);
    // the archived chat is untouched by the second write (still archived, meta intact)
    expect(metaOf(a).archived).toBe(true);
    expect(metaOf(a).id).toBe(a);
  });

  it("keeps the meta of the earlier chat as it was, apart from the flag", () => {
    const a = newChat();
    const b = newChat();
    call("PATCH", "/chats/" + a, { title: "The old road", pinned: true });
    const before = metaOf(a);
    link(b, a);
    expect(metaOf(a)).toEqual({ ...before, archived: true });
  });
});

describe("Litopys switch: archive the earlier chat when it is continued", () => {
  const fsx = () => host().fs;
  it("is on by default, and an off value survives a save", () => {
    expect(lit.loadConfig(fsx() as never).archiveOnContinue).toBe(true);
    lit.patchConfig(fsx() as never, { archiveOnContinue: false });
    expect(lit.loadConfig(fsx() as never).archiveOnContinue).toBe(false);
    lit.patchConfig(fsx() as never, { archiveOnContinue: true });
    expect(lit.loadConfig(fsx() as never).archiveOnContinue).toBe(true);
  });
});
