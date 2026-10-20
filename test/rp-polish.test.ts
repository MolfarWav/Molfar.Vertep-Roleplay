// Polish my message (GitHub #15): the chat's model rewrites the player's draft and the
// composer gets it back as a fill, never sent.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_POLISH_PROMPT, DEFAULT_UTILITY_PROMPTS } from "../src/lib/seed";

const P = (await import(new URL("../plugins/polish/plugin.js", import.meta.url).href)) as Record<string, any>;

let root = "";
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rp-polish-"));
  for (const d of ["chats", "presets", "characters/ava"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "characters/ava/card.json"), JSON.stringify({ name: "Ava" }));
  fs.writeFileSync(path.join(root, "chats/c1.meta.json"), JSON.stringify({ characterId: "ava", userName: "Vlad", model: "chat/model", presetId: "p1" }));
  fs.writeFileSync(
    path.join(root, "chats/c1.jsonl"),
    [{ role: "char", name: "Ava", text: "She looked at him." }, { role: "user", name: "Vlad", text: "*I nodded.*" }].map((m) => JSON.stringify(m)).join("\n") + "\n",
  );
  fs.writeFileSync(path.join(root, "presets/p1.json"), JSON.stringify({ studio: { utilityPrompts: { polish: "" } } }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function mockHost(reply: { text?: string; error?: { message: string } }) {
  const results: Record<string, unknown> = {};
  const requests: Array<{ key: string; req: any }> = [];
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: () => {},
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: () => {},
    },
    llm: { request: (key: string, req: any) => void requests.push({ key, req }), results },
  };
  /** Like the engine's runPluginRoute: pass, run the asked calls, pass again. */
  const drive = (body: unknown, chatId = "c1") => {
    const req: any = { method: "POST", path: "/polish/chats/" + chatId, query: {}, body };
    let out = P.handleRoute(req, host);
    if (out?.__llmPending) {
      if (out.stash) req.stash = out.stash;
      for (const { key } of requests) results[key] = { model: "chat/model", usage: {}, text: reply.text ?? "", ...(reply.error ? { error: reply.error } : {}) };
      out = P.handleRoute(req, host);
    }
    return out;
  };
  return { host, requests, drive };
}

describe("polish plugin", () => {
  it("answers in the engine's route shape { status, json }", () => {
    const m = mockHost({ text: '*Я медленно выдернул руку из-под дивана.*' });
    const out = m.drive({ text: "*Я выдернул руку из под дивана*" });
    // the engine drops any other shape: a `body` field reached the page as an empty 200 (#15)
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ text: "*Я медленно выдернул руку из-под дивана.*", model: "chat/model" });
    expect(out.body).toBeUndefined();
  });

  it("asks the model the page sent, with the built-in prompt for a blank preset prompt", () => {
    const m = mockHost({ text: "ok" });
    m.drive({ text: "draft", model: "page/model" });
    expect(m.requests).toHaveLength(1);
    const ask = m.requests[0]!.req;
    expect(ask.model).toBe("page/model");
    expect(ask.systemPrompt).toBe(P.DEFAULT_POLISH.split("{{user}}").join("Vlad"));
    expect(ask.messages[0].content).toContain("Characters in this chat: Ava.");
    expect(ask.messages[0].content).toContain("Ava: She looked at him.");
    expect(ask.messages[0].content.endsWith("Draft to rewrite:\ndraft")).toBe(true);
  });

  it("falls back to the chat's saved model and uses the preset's own prompt", () => {
    fs.writeFileSync(path.join(root, "presets/p1.json"), JSON.stringify({ studio: { utilityPrompts: { polish: "Tidy {{user}}'s text." } } }));
    const m = mockHost({ text: "ok" });
    m.drive({ text: "draft" });
    expect(m.requests[0]!.req.model).toBe("chat/model");
    expect(m.requests[0]!.req.systemPrompt).toBe("Tidy Vlad's text.");
  });

  it("says why on a failed or empty answer, and refuses bad input", () => {
    expect(mockHost({ error: { message: "rate limited" } }).drive({ text: "x" })).toEqual({ status: 502, json: { error: "rate limited" } });
    expect(mockHost({ text: "  " }).drive({ text: "x" }).status).toBe(502);
    expect(mockHost({ text: "y" }).drive({ text: "  " }).status).toBe(400);
    expect(mockHost({ text: "y" }).drive({ text: "x" }, "nope").status).toBe(404);
  });

  it("cleans reasoning, fences and lead-ins off the answer", () => {
    expect(P.cleanPolish("<think>hmm</think>\n*Done.*")).toBe("*Done.*");
    expect(P.cleanPolish("```\n*Done.*\n```")).toBe("*Done.*");
    expect(P.cleanPolish("Here is the polished message: *Done.*")).toBe("*Done.*");
    expect(P.cleanPolish('*She said* "hi"')).toBe('*She said* "hi"');
  });

  it("ships the same default prompt as the preset editor", () => {
    expect(DEFAULT_POLISH_PROMPT).toBe(P.DEFAULT_POLISH);
    expect(DEFAULT_UTILITY_PROMPTS.polish).toBe(P.DEFAULT_POLISH);
  });
});

describe("polishDraft", () => {
  const store = new Map<string, string>();
  let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = () => Promise.reject(new Error("offline"));
  let useApp: any;
  beforeAll(async () => {
    (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    (globalThis as any).fetch = (url: string, init?: RequestInit) => fetchImpl(String(url), init);
    useApp = (await import("../src/lib/store")).useApp;
  });
  const chat = (id: string) => ({ id, characterId: null, title: id, messages: [], presetId: null, personaId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 });

  it("puts the polished text in as a fill over the draft it started from", async () => {
    useApp.setState({ chats: [chat("A")], composerDrafts: {}, streaming: null });
    let sent: any = null;
    fetchImpl = async (url, init) => {
      sent = { url, body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ text: "Polished." }), { status: 200, headers: { "content-type": "application/json" } });
    };
    useApp.getState().polishDraft("A", "polishd");
    expect(useApp.getState().streaming?.chatId).toBe("A");
    await new Promise((r) => setTimeout(r, 10));
    expect(sent.url).toContain("/polish/chats/A");
    expect(sent.body.text).toBe("polishd");
    const fill = useApp.getState().composerDrafts.A;
    expect(fill).toMatchObject({ text: "Polished.", base: "polishd", kind: "polish" });
    expect(useApp.getState().streaming).toBeNull();
  });
});
