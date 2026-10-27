// The fonts a reply may name (Molfar Vertep issue #126): shipped with the app,
// Latin + Cyrillic, and the style filter lets the names through.
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { REPLY_FONTS } from "../src/lib/reply-fonts";
import { safeDeclarations } from "../src/lib/safe-style";

const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
const slug = (family: string) => family.toLowerCase().replace(/ /g, "-");

describe("reply fonts", () => {
  for (const { family } of REPLY_FONTS) {
    it(`${family}: a dependency, with Latin and Cyrillic regular imported`, () => {
      const id = `@fontsource/${slug(family)}`;
      expect(pkg.dependencies[id]).toBeDefined();
      for (const subset of ["latin", "cyrillic"]) {
        expect(main).toContain(`import "${id}/${subset}-400.css";`);
      }
    });
    it(`${family}: font-family survives the style filter`, () => {
      expect(safeDeclarations(`font-family:'${family}',cursive`)).toBe(`font-family:'${family}',cursive`);
    });
  }
  it("every imported file exists in the installed package", () => {
    const files = [...main.matchAll(/import "(@fontsource\/[^"]+\.css)";/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(REPLY_FONTS.length * 2);
    for (const f of files) expect(existsSync(new URL(`../node_modules/${f}`, import.meta.url))).toBe(true);
  });
});
