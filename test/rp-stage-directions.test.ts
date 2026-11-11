/**
 * Stage directions (Molfar.Vertep#368): [[text]] in a user message is cut out of the words, kept on the
 * message as `directions`, and carried by the prompt as an out-of-character instruction at the end of the
 * request, for the reply to that message only.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");
const client = await import("../src/lib/stage-directions.ts");

type Part = { kind: string; label: string; detail?: string; text: string; key?: string };
type Preview = {
  messages: { role: string; content: string }[];
  sources: { parts: Part[]; omitted: { label: string; reason: string; key?: string }[]; board: { key: string; state: string }[] };
};

let root: string;
const PRESET = {
  id: "fx", name: "FX",
  prompts: [
    { identifier: "main", name: "Main", role: "system", content: "You narrate {{char}}'s story.", marker: true },
    { identifier: "chatHistory", name: "Chat history", marker: true },
  ],
  prompt_order: [{ character_id: 100001, order: [{ identifier: "main", enabled: true }, { identifier: "chatHistory", enabled: true }] }],
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "stage-dir-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "presets", "fx.json"), JSON.stringify(PRESET));
  fs.writeFileSync(path.join(root, "presets", "fxu.json"), JSON.stringify({ ...PRESET, id: "fxu", name: "FXU", studio: { stageDirectionsRole: "user" } }));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "Taras", description: "A courier." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function host() {
  return {
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
  };
}
const call = (method: string, p: string, body?: unknown) =>
  (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;

type Seed = { role: string; text: string; directions?: string[] };
function chat(messages: Seed[], extra: Record<string, unknown> = {}, presetId = "fx"): string {
  const meta = call("POST", "/chats", { characterId: "aria", presetId }).meta as { id: string };
  const file = path.join(root, "chats", meta.id + ".meta.json");
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), ...extra }));
  const lines = messages.map((m, i) => JSON.stringify({ id: "m" + i, role: m.role, name: m.role === "user" ? "Taras" : "Aria", text: m.text, swipes: [m.text], swipe: 0, ...(m.directions ? { directions: m.directions } : {}) }));
  fs.writeFileSync(path.join(root, "chats", meta.id + ".jsonl"), lines.join("\n") + "\n");
  return meta.id;
}
const preview = (chatId: string, userText = "") => call("POST", "/prompt/preview", { chatId, ...(userText ? { userText } : {}) }) as unknown as Preview;
const dirPart = (p: Preview) => p.sources.parts.find((x) => x.label === "Stage directions");

describe("splitDirections", () => {
  it("cuts [[...]] out of the words and returns them in order", () => {
    expect(eng.splitDirections("I open the door. [[Make her suspicious.]] Then I wait.")).toEqual({
      text: "I open the door. Then I wait.", directions: ["Make her suspicious."],
    });
    expect(eng.splitDirections("[[one]] hello [[two]]")).toEqual({ text: "hello", directions: ["one", "two"] });
  });
  it("leaves text without double brackets exactly as it was", () => {
    const raw = "  I say [hello]  and (wave).\n\n  ";
    expect(eng.splitDirections(raw)).toEqual({ text: raw, directions: [] });
  });
  it("only a direction: no words left", () => {
    expect(eng.splitDirections("[[Skip to the evening.]]")).toEqual({ text: "", directions: ["Skip to the evening."] });
  });
  it("a markdown link and an empty or unclosed pair are not directions", () => {
    expect(eng.splitDirections("see [[docs]](http://x) and [[]] and [[open").directions).toEqual([]);
  });
  it("multi-line, capped in number and length", () => {
    expect(eng.splitDirections("[[a\nb]]").directions).toEqual(["a\nb"]);
    const many = Array.from({ length: 12 }, (_, i) => `[[d${i}]]`).join(" ");
    expect(eng.splitDirections(many).directions).toHaveLength(8);
    expect(eng.splitDirections("[[" + "x".repeat(3000) + "]]").directions[0]).toHaveLength(2000);
  });
  it("the page's copy behaves the same", () => {
    for (const s of ["I go [[be rude]] home.", "[[a]] b [[c]]", "plain", "[[x]](u)", "[[only]]", "a [[1\n2]] b"]) {
      expect(client.splitDirections(s)).toEqual(eng.splitDirections(s));
    }
  });
  it("withDirections puts the brackets back so the engine cuts out the same directions", () => {
    for (const s of ["I go [[be rude]] home.", "[[a]] b [[c]]", "[[only]]", "plain"]) {
      const cut = client.splitDirections(s);
      const again = eng.splitDirections(client.withDirections(cut.text, cut.directions));
      expect(again).toEqual(cut);
    }
    expect(client.withDirections("", ["a", "b"])).toBe("[[a]] [[b]]");
    expect(client.withDirections(" hi ", [])).toBe("hi");
  });
});

describe("the prompt", () => {
  const story: Seed[] = [{ role: "char", text: "Hi." }, { role: "user", text: "I walk in.", directions: ["Aria is hiding a secret."] }];

  it("carries the newest user message's directions last, as a system instruction, with a part and a board row", () => {
    const p = preview(chat(story));
    const last = p.messages[p.messages.length - 1];
    expect(last.role).toBe("system");
    expect(last.content).toContain("Aria is hiding a secret.");
    expect(last.content).toContain("out of character");
    // the user's words stay clean
    const user = p.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    expect(user).toContain("I walk in.");
    expect(user).not.toContain("secret");
    expect(dirPart(p)?.key).toBe("stageDirections");
    expect(p.sources.board.find((b) => b.key === "stageDirections")?.state).toBe("on");
  });

  it("the preset may ask for a user-role message", () => {
    const p = preview(chat(story, {}, "fxu"));
    const last = p.messages[p.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toContain("Aria is hiding a secret.");
    expect(dirPart(p)?.detail).toBe("as a user message");
  });

  it("only the newest user message counts: an older one's directions are gone from the request", () => {
    const p = preview(chat([
      { role: "user", text: "First.", directions: ["Old instruction."] },
      { role: "char", text: "Reply." },
      { role: "user", text: "Second." },
    ]));
    expect(JSON.stringify(p.messages)).not.toContain("Old instruction.");
    expect(dirPart(p)).toBeUndefined();
    expect(p.sources.board.find((b) => b.key === "stageDirections")?.state).toBe("empty");
  });

  it("the chat can switch it off: named in omitted, not sent", () => {
    const p = preview(chat(story, { promptBoard: { v: 1, off: ["stageDirections"] } }));
    expect(JSON.stringify(p.messages)).not.toContain("secret");
    expect(p.sources.omitted.find((o) => o.key === "stageDirections")?.reason).toBe("off for this chat");
    expect(p.sources.board.find((b) => b.key === "stageDirections")?.state).toBe("off");
  });

  it("a message of directions alone is no turn of the story, but its directions still go out", () => {
    const p = preview(chat([{ role: "char", text: "Hi." }, { role: "user", text: "", directions: ["Skip to the evening."] }]));
    expect(p.messages.some((m) => m.role === "user" && m.content.trim() === "")).toBe(false);
    expect(p.messages[p.messages.length - 1].content).toContain("Skip to the evening.");
  });

  it("peek with typed text splits it the same way", () => {
    const p = preview(chat([{ role: "char", text: "Hi." }]), "I wave. [[She waves back warmly.]]");
    expect(JSON.stringify(p.messages)).toContain("She waves back warmly.");
    expect(p.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")).toContain("I wave.");
    expect(p.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")).not.toContain("warmly");
  });
});

describe("the messages", () => {
  it("PATCH: typed [[...]] joins the kept ones, a sent list replaces them", () => {
    const id = chat([{ role: "char", text: "Hi." }, { role: "user", text: "I walk in.", directions: ["keep me"] }]);
    const edited = call("PATCH", `/chats/${id}/messages/m1`, { text: "I stroll in. [[and add me]]" }).message as { text: string; directions: string[] };
    expect(edited.text).toBe("I stroll in.");
    expect(edited.directions).toEqual(["keep me", "and add me"]);
    const trimmed = call("PATCH", `/chats/${id}/messages/m1`, { directions: ["and add me"] }).message as { directions?: string[] };
    expect(trimmed.directions).toEqual(["and add me"]);
    const none = call("PATCH", `/chats/${id}/messages/m1`, { directions: [] }).message as { directions?: string[] };
    expect(none.directions).toBeUndefined();
  });
});
