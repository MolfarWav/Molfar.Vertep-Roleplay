/**
 * The agent checker (src/canvas-kit/boards/agent-check.js) must run where the runner plugin runs: the engine's
 * QuickJS sandbox, one file, no imports, no TextEncoder, no crypto.subtle. These tests run its source in a bare
 * context (only the language's own built-ins) and require the same answers as the imported module; they also keep
 * its envelope reader and its SHA-256 equal to the originals.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import mood from "./fixtures/mood-tracker.vertep-agent.json";
import keeper from "./fixtures/dungeon-keeper.vertep-agent.json";
import * as check from "../src/canvas-kit/boards/agent-check.js";
import { fromFile } from "../src/canvas-kit/graph";

const source = fs.readFileSync(new URL("../src/canvas-kit/boards/agent-check.js", import.meta.url), "utf8");

/** The file as a classic script: `export` removed, the public names collected on one object. */
function loadInBareContext(): Record<string, any> {
  const names = [...source.matchAll(/^export (?:const|function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  const script = source.replace(/^export /gm, "") + `\n;({ ${names.join(", ")} })`;
  const ctx = vm.createContext({}); // no TextEncoder, crypto, console, URL, Buffer
  return vm.runInContext(script, ctx) as Record<string, any>;
}

const copy = (f: unknown): any => JSON.parse(JSON.stringify(f));
const same = (x: unknown) => JSON.parse(JSON.stringify(x)); // across contexts, compare as plain data

describe("agent-check.js in a bare context", () => {
  const bare = loadInBareContext();

  it("the context really is bare", () => {
    expect(vm.runInContext("typeof TextEncoder + typeof crypto + typeof require + typeof process", vm.createContext({}))).toBe("undefinedundefinedundefinedundefined");
  });

  it("has no import and no async", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, ""); // comments may name what is absent
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\basync\b|\bawait\b|\bcrypto\b|\bTextEncoder\b/);
  });

  for (const [name, file] of [["mood-tracker", mood], ["dungeon-keeper", keeper]] as const) {
    it(`${name}: same report, no errors`, () => {
      const here = check.validateAgent(copy(file));
      expect(here.errors).toEqual([]);
      expect(same(bare.validateAgent(copy(file)))).toEqual(here);
    });
  }

  it("the same refusals on broken files", () => {
    const broken = copy(keeper);
    broken.agent.state.mana.max = -5;
    broken.agent.panels[0].widgets[0].bind = "gone";
    broken.edges.pop();
    const here = check.validateAgent(broken);
    expect(here.errors.length).toBeGreaterThan(2);
    expect(same(bare.validateAgent(copy(broken)))).toEqual(here);
  });

  it("compileAgent gives the same file", () => {
    const f = copy(mood);
    delete f.agent.derived;
    expect(same(bare.compileAgent(f))).toEqual(check.compileAgent(copy(f)));
  });
});

describe("agent-check.js parts", () => {
  it("sha256 equals node's on odd lengths, Cyrillic, emoji and a long text", () => {
    const bare = loadInBareContext();
    const texts = ["", "a", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(63), "x".repeat(64), "x".repeat(65), "Привіт, світе", "snow ☃ and 🙂 pair", "{\"a\":1}".repeat(5000)];
    for (const t of texts) {
      const hash = bare.agentHash({ nodes: [], edges: [], agent: { note: t } });
      const want = createHash("sha256").update(JSON.stringify({ agent: { note: t }, edges: [], nodes: [] })).digest("hex");
      expect(hash).toBe("sha256:" + want);
    }
  });

  it("readCanvasFile reads an envelope exactly as graph.ts fromFile does", () => {
    const cases: unknown[] = [mood, keeper, null, [], {}, { ...mood, version: 2 }, { ...mood, kind: 5 }, { ...mood, nodes: "x" },
      { ...mood, agent: "nope" }, { ...mood, nodes: [...mood.nodes, { ...mood.nodes[0] }] },
      { ...mood, nodes: [{ id: "a", type: "t", x: "1", y: 0, title: "t" }] }, { ...mood, edges: [{ id: "e", from: "zz:a", to: "in:b" }] },
      { ...mood, edges: [{ id: "e", from: "in:a", to: "ask:b", locked: true, extra: 1 }] },
      { ...mood, unknownKey: 1, nodes: mood.nodes.map((n) => ({ ...n, subtitle: "s", note: "n", junk: 1 })) }];
    for (const c of cases) expect(check.readCanvasFile(c)).toEqual(fromFile(c));
  });
});
