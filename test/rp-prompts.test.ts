/**
 * Plugin prompts: every prompt sent to a model ships as a default in the
 * plugin code, is written in English, and (when it makes the model write text
 * for the user) says which language to write in. The summary prompt follows
 * the Litopys pattern: settings keep it only when the user changed it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const litopysUrl = new URL("../plugins/litopys/plugin.js", import.meta.url).href;
const relationsUrl = new URL("../plugins/relations/plugin.js", import.meta.url).href;

const CYRILLIC = /[Ѐ-ӿ]/;
const LANGUAGE_LINE = /\blanguage\b/i;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }),
  );
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "aria", "card.json"),
    JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night", first_mes: "Welcome in, {{user}}.", mes_example: "" }),
  );
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  writeSettings({ model: null, personaId: "you" });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const writeSettings = (s: Record<string, unknown>) => fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify(s));
const readSettings = () => JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")) as { ui?: { summary?: { prompt?: string } } };

type Req = { key: string; req: { messages: { role: string; content: string }[] } };

function mockHost(reply = "MOCK-REPLY") {
  const results: Record<string, unknown> = {};
  const requests: Req[] = [];
  const host = {
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
    llm: {
      request: (key: string, req: Req["req"]) => { requests.push({ key, req }); },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const resolve = () => {
    for (const { key } of requests) {
      results[key] = { text: reply, model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } };
    }
  };
  return { host, requests, resolve };
}

async function drive(pluginUrl: string, req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>) {
  const mod = (await import(pluginUrl)) as { handleRoute: Function };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as Record<string, unknown>)[k];
  const call = { method: req.method, path: req.path, query: {}, body: req.body } as Record<string, unknown>;
  let out = mod.handleRoute(call, mock.host) as { status?: number; json?: Record<string, unknown>; __llmPending?: boolean; stash?: unknown };
  for (let pass = 0; out && out.__llmPending && pass < 3; pass++) {
    if (out.stash && typeof out.stash === "object") call.stash = out.stash;
    mock.resolve();
    out = mod.handleRoute(call, mock.host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown> };
}

/** A chat with enough turns that compacting has something to fold. */
async function chatWithTurns(mock: ReturnType<typeof mockHost>) {
  await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, mock);
  const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
  await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } }, mock);
  await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "more talk" } }, mock);
  return id;
}

/** The system prompt the summarizer was given on the last compact call. */
async function summaryInstructions(mock: ReturnType<typeof mockHost>, id: string) {
  const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/compact`, body: { keepRecent: 2 } }, mock);
  expect(r.status).toBe(200);
  const req = mock.requests.filter((x) => x.key === "summary").at(-1)!;
  return req.req.messages[0]!.content;
}

describe("plugin prompts: English, with a language line where the model writes for the user", () => {
  it("the Litopys scribe and curator defaults", async () => {
    const r = await drive(litopysUrl, { method: "GET", path: "/litopys/config" }, mockHost());
    for (const key of ["scribePrompt", "curatePrompt"]) {
      const text = r.json[key] as string;
      expect(text.length, key).toBeGreaterThan(100);
      expect(CYRILLIC.test(text), `${key} has Cyrillic`).toBe(false);
      expect(LANGUAGE_LINE.test(text), `${key} has no language line`).toBe(true);
    }
  });

  it("the dashboard sensor default", async () => {
    const r = await drive(relationsUrl, { method: "GET", path: "/dashboard/config" }, mockHost());
    const text = r.json.sensor as string;
    expect(text.length).toBeGreaterThan(500);
    expect(CYRILLIC.test(text), "sensor has Cyrillic").toBe(false);
    expect(LANGUAGE_LINE.test(text), "sensor has no language line").toBe(true);
    expect(text).toContain("in the language the story is written in");
  });

  it("the dashboard soul rating default", async () => {
    const r = await drive(relationsUrl, { method: "GET", path: "/dashboard/config" }, mockHost());
    const text = r.json.soul as string;
    expect(text.length).toBeGreaterThan(500);
    expect(CYRILLIC.test(text), "soul has Cyrillic").toBe(false);
    expect(LANGUAGE_LINE.test(text), "soul has no language line").toBe(true);
    expect(text).toContain("in the language of the story");
    expect(text).toContain("cardType");
    expect(text).toContain("single");
    expect(text).toContain("narrator");
    expect(text).toContain("group");
    expect(text).toContain("assistant");
    expect(text).toContain("When the message lists souls this card already has, do what the message says about them");
    expect(text).toContain("Always give cardType.");
  });

  it("the summary default", async () => {
    const r = await drive(engineUrl, { method: "GET", path: "/settings/summary-prompt" }, mockHost());
    const text = r.json.prompt as string;
    expect(CYRILLIC.test(text)).toBe(false);
    expect(LANGUAGE_LINE.test(text)).toBe(true);
    expect(text).toContain("in the language the story is written in");
    for (const past of r.json.past as string[]) expect(CYRILLIC.test(past)).toBe(false);
    expect(r.json.past).toContain(
      "You keep the running summary of a roleplay between {{user}} and {{char}}. Rewrite it so it covers everything so far: the summary you are given plus the new messages. Keep names, relationships, promises, places, possessions, injuries, and unresolved threads; drop small talk and repetition. Past tense, third person, plain prose, at most {{words}} words. Reply with only the summary.",
    );
  });

  it("the memory-extract prompt", async () => {
    const m = mockHost("[]");
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/memories/extract` }, m);
    const asked = m.requests.filter((x) => x.key === "memory").at(-1)!.req.messages[0]!.content;
    const prompt = asked.slice(0, asked.indexOf("Transcript:"));
    expect(prompt.length).toBeGreaterThan(100);
    expect(CYRILLIC.test(prompt)).toBe(false);
    expect(LANGUAGE_LINE.test(prompt)).toBe(true);
    expect(prompt).toContain("Write each memory in the language the conversation is written in.");
  });

  it("the image-prompt writer stays English on purpose", async () => {
    const m = mockHost("A barista at night.");
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    for (const mode of ["scene", "character", "face", "user", "background"]) {
      await drive(engineUrl, { method: "POST", path: `/chats/${id}/image-prompt`, body: { mode } }, m);
      const asked = m.requests.filter((x) => x.key === "imgprompt").at(-1)!.req.messages[0]!.content;
      expect(CYRILLIC.test(asked), mode).toBe(false);
      expect(asked, mode).toContain("Write the image prompt in English, whatever language the story is in.");
    }
  });
});

describe("summary prompt: the plugin owns the default, settings keep only a changed one", () => {
  const defaultPrompt = async () => (await drive(engineUrl, { method: "GET", path: "/settings/summary-prompt" }, mockHost())).json as { prompt: string; past: string[] };
  const withSummaryPrompt = (prompt: unknown) =>
    writeSettings({ model: null, personaId: "you", ui: { summary: { mode: "auto", interval: 40, keepRecent: 6, targetLength: 300, ...(prompt === undefined ? {} : { prompt }) } } });
  const expand = (t: string) => t.split("{{words}}").join("300").split("{{user}}").join("You").split("{{char}}").join("Aria").split("{{summary}}").join("");

  it("a missing, empty or whitespace-only stored prompt uses the current default", async () => {
    const { prompt } = await defaultPrompt();
    for (const stored of [undefined, "", "  \n "]) {
      withSummaryPrompt(stored);
      const m = mockHost("SUMMARY");
      const id = await chatWithTurns(m);
      expect(await summaryInstructions(m, id), JSON.stringify(stored)).toBe(expand(prompt));
    }
  });

  it("a stored copy of a past default (even with CRLF or extra spacing) uses the current default", async () => {
    const { prompt, past } = await defaultPrompt();
    expect(past.length).toBeGreaterThan(0);
    for (const old of past) {
      for (const stored of [old, old.replace(/ /g, "  ") + "\n", old.replace(/\. /g, ".\r\n")]) {
        withSummaryPrompt(stored);
        const m = mockHost("SUMMARY");
        const id = await chatWithTurns(m);
        expect(await summaryInstructions(m, id)).toBe(expand(prompt));
      }
    }
  });

  it("a custom prompt is used as written", async () => {
    withSummaryPrompt("Summarize {{char}} and {{user}} in {{words}} words.");
    const m = mockHost("SUMMARY");
    const id = await chatWithTurns(m);
    expect(await summaryInstructions(m, id)).toBe("Summarize Aria and You in 300 words.");
  });

  it("saving the default (or a past one) stores nothing; saving a custom prompt stores it", async () => {
    const { prompt, past } = await defaultPrompt();
    const save = async (p: string) => {
      const r = await drive(engineUrl, { method: "PUT", path: "/settings", body: { ui: { themeMode: "dark", summary: { keepRecent: 6, prompt: p } } } }, mockHost());
      expect(r.status).toBe(200);
      return readSettings().ui!.summary!.prompt;
    };
    expect(await save(prompt)).toBe("");
    expect(await save(past[0]!)).toBe("");
    expect(await save(prompt.replace(/ /g, "  "))).toBe("");
    expect(await save("My own summary prompt.")).toBe("My own summary prompt.");
    // the rest of ui rides through untouched
    expect((readSettings().ui as Record<string, unknown>).themeMode).toBe("dark");
  });

  it("the update step clears a stored past default and keeps a custom prompt", async () => {
    const { past } = await defaultPrompt();
    const mod = (await import(engineUrl)) as { onAppUpdate: Function };
    withSummaryPrompt(past[0]);
    const r1 = mod.onAppUpdate({ from: "4.19.1", to: "4.19.2" }, mockHost().host) as { upgraded: string[] };
    expect(readSettings().ui!.summary!.prompt).toBe("");
    expect(r1.upgraded).toContain("settings.json summary prompt");
    withSummaryPrompt("Custom.");
    mod.onAppUpdate({ from: "4.19.1", to: "4.19.2" }, mockHost().host);
    expect(readSettings().ui!.summary!.prompt).toBe("Custom.");
    // already up to date: nothing is touched
    withSummaryPrompt(past[0]);
    mod.onAppUpdate({ from: "4.19.2", to: "4.19.2" }, mockHost().host);
    expect(readSettings().ui!.summary!.prompt).toBe(past[0]);
  });
});
