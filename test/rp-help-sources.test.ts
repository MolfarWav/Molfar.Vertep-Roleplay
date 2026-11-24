// The Help articles stay true to the code they cite (Molfar.Vertep#507). An article's `sources` quote the code that
// proves what it says; when a change removes or rewords that code, this test fails, so the article is read and updated
// in the same change instead of drifting for releases (the World DM levels article did for two). Line numbers are not
// checked here: they move with every edit, and `node scripts/validate-help.mjs src/lib/help-articles.json --repo .
// --fix-lines` re-points them.
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import articles from "../src/lib/help-articles.json";

const ROOT = join(import.meta.dir, "..");
// the same limits as scripts/validate-help.mjs
const LIMITS = { title: 60, short: 260, details: 1500, aliases: 300 } as const;
type Lang = { en: string; uk: string };
type Entry = { id: string; sources?: { path: string; quote: string }[] } & Partial<Record<keyof typeof LIMITS, Lang>>;
const entries = (articles as { entries: Entry[] }).entries;
const files = new Map<string, string>();
const read = (p: string) => {
  if (!files.has(p)) files.set(p, existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n") : "");
  return files.get(p) as string;
};

describe("Help articles", () => {
  it("every quoted source is still in its file", () => {
    const gone: string[] = [];
    for (const e of entries) {
      for (const s of e.sources ?? []) {
        // as the validator matches: the quote's words in order, any whitespace between them (a quote may span lines)
        const words = s.quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        if (!new RegExp(words.join("\\s+")).test(read(s.path))) gone.push(`${e.id}: ${s.path}: ${s.quote.slice(0, 80)}`);
      }
    }
    // a line here: the code an article cites changed. Read the article (en and uk), fix what is no longer true, cite the new code
    expect(gone).toEqual([]);
  });

  it("every article fits its limits in both languages", () => {
    const long: string[] = [];
    for (const e of entries) {
      for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
        const v = e[k];
        if (!v) continue;
        for (const lang of ["en", "uk"] as const) {
          if (!v[lang]) long.push(`${e.id}: ${k}.${lang} missing`);
          // Ukrainian runs longer: a quarter more room, as the validator gives it
          else if (v[lang].length > (lang === "uk" ? Math.round(LIMITS[k] * 1.25) : LIMITS[k])) long.push(`${e.id}: ${k}.${lang} is ${v[lang].length}`);
        }
      }
    }
    expect(long).toEqual([]);
  });
});
