/**
 * Molfar.Vertep#432: the plugins that read every regex script ("regex/*.json", 161 of them on a big workspace) ask the engine for all of
 * them in one `fs.readMany` call when it has one, and read them one call each when it has not (an older engine). Same scripts either way.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
const lit = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;
const rel = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rp-regex-many-"));
  fs.mkdirSync(path.join(root, "regex"), { recursive: true });
  for (let i = 0; i < 40; i++) {
    fs.writeFileSync(path.join(root, "regex", `s${i}.json`), JSON.stringify({ id: `s${i}`, scriptName: `s${i}`, flags: "g", replaceString: "", placement: ["ai_output"], promptOnly: true, findRegex: `<p${i}>[\\s\\S]*?</p${i}>`, order: i }));
  }
  fs.writeFileSync(path.join(root, "regex", "broken.json"), "{ not json");
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

/** A host fs that counts its calls; `many: false` is an engine without readMany. */
function counting(many: boolean) {
  const calls = { read: 0, readMany: 0 };
  const fsx: Record<string, any> = {
    list: (rel2 = ".") => fs.readdirSync(path.resolve(root, rel2)).sort(),
    read: (rel2: string) => { calls.read++; return fs.readFileSync(path.resolve(root, rel2), "utf8"); },
  };
  if (many) fsx.readMany = (paths: string[]) => { calls.readMany++; return paths.map((p) => { try { return fs.readFileSync(path.resolve(root, p), "utf8"); } catch { return null; } }); };
  return { fsx, calls };
}

describe("reading the regex scripts in one call (#432)", () => {
  it("the engine plugin takes one readMany call, and the same scripts as reading them one by one", () => {
    const a = counting(true);
    const b = counting(false);
    const fast = eng.loadRegexScripts(a.fsx);
    const slow = eng.loadRegexScripts(b.fsx);
    expect(a.calls).toEqual({ read: 0, readMany: 1 });
    expect(b.calls.read).toBe(41);
    expect(fast.length).toBe(40); // the broken file is left out in both
    expect(fast).toEqual(slow);
  });

  it("falls back to one call each when readMany throws or answers a list of the wrong length", () => {
    const a = counting(true);
    a.fsx.readMany = () => { throw new Error("over the limit"); };
    expect(eng.loadRegexScripts(a.fsx).length).toBe(40);
    expect(a.calls.read).toBe(41);
    const b = counting(true);
    b.fsx.readMany = () => ["only one"];
    expect(eng.loadRegexScripts(b.fsx).length).toBe(40);
  });

  it("Litopys and the Dashboard sensor read them in one call too, and cut the same text", () => {
    const meta = { id: "c1", presetId: "st", characterId: "aria" };
    const text = "<p3>plan</p3>She smiles.<p7>hm</p7>";
    const a = counting(true);
    expect(lit.storyView(a.fsx, meta)(text, "char")).toBe("She smiles.");
    expect(a.calls).toEqual({ read: 0, readMany: 1 });
    const b = counting(true);
    expect(rel.storyView(b.fsx, meta)(text, "char")).toBe("She smiles.");
    expect(b.calls).toEqual({ read: 0, readMany: 1 });
    expect(lit.storyView(counting(false).fsx, meta)(text, "char")).toBe("She smiles.");
  });
});
