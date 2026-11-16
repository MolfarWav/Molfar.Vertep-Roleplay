/** The tidy-up log line (#424, step 3): which thing, archived or woken, and what decided it. */
import { describe, expect, it } from "bun:test";
import type { WorldTidyLine } from "../src/lib/world";

(globalThis as any).location ??= { origin: "http://localhost", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "", hash: "" };
const { tidyLine } = await import("../src/components/world/world-tidy");
const { t } = await import("../src/lib/i18n");

const line = (extra: Partial<WorldTidyLine>, lang: "en" | "uk" = "en") =>
  tidyLine(((key: any, vars?: any) => t(key, lang, vars)) as any, { at: 1, n: 30, id: "n1", name: "Cup of noodles", act: "archive", count: 1, via: "code", ...extra });

describe("tidyLine", () => {
  it("an archive says how often the thing was named in the last ten replies", () => {
    expect(line({})).toBe("Cup of noodles: to the Archive (named in 1 of the last 10 replies)");
  });
  it("a wake by the code says the same count; a wake by the DM says the DM named it", () => {
    expect(line({ act: "wake", count: 2 })).toBe("Cup of noodles: woken (named in 2 of the last 10 replies)");
    expect(line({ act: "wake", via: "dm", count: 0 })).toBe("Cup of noodles: woken (the DM named it again)");
  });
  it("Ukrainian has the three lines", () => {
    expect(line({}, "uk")).toContain("в Архів");
    expect(line({ act: "wake", count: 2 }, "uk")).toContain("повернута");
    expect(line({ act: "wake", via: "dm" }, "uk")).toContain("майстер назвав її знову");
  });
});
