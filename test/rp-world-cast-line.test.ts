/** The cast's log line (also the mark under the reply): who, how big, why, the dice, and what came of it (#424, step 2.5). */
import { describe, expect, it } from "bun:test";
import type { WorldDiceRoll } from "../src/lib/world";

// the shell's engine client reads `location` when it loads: give it one before the component is imported
(globalThis as any).location ??= { origin: "http://localhost", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "", hash: "" };
const { castLine } = await import("../src/components/world/world-cast");
const { t } = await import("../src/lib/i18n");

const line = (extra: Partial<WorldDiceRoll>, lang: "en" | "uk" = "en") =>
  castLine(((key: any, vars?: any) => t(key, lang, vars)) as any, { at: 1, kind: "cast", op: "send", mode: "flavour", stat: "auto", who: "Olya", value: null, chance: 0, gated: true, gate: 0, inserted: true, id: "n1", via: "silence", band: "medium", silence: 40, threshold: 30, weight: 1, d: [3, 4], mod: 1, total: 9, ...extra } as WorldDiceRoll);

describe("castLine", () => {
  it("a mention reads as such, not as she came", () => {
    const text = line({ result: "mentioned" });
    expect(text).toContain("only mentioned, not on stage");
    expect(text).not.toContain("· came");
    expect(line({ result: "came" })).toEndWith("· came");
  });

  it("how long ago she was last named is in the line only when the log has it", () => {
    expect(line({ seen: 3, result: "mentioned" })).toContain("last named 3 replies ago");
    expect(line({ result: "came" })).not.toContain("last named");
  });

  it("a die that was raised to medium says why", () => {
    expect(line({ floor: true, result: "came" })).toContain("raised to medium: last time was only a mention");
    expect(line({ result: "came" })).not.toContain("raised to medium");
  });

  it("the Life die's line carries the same marks, and Ukrainian has every new string", () => {
    expect(line({ via: "life", tier: "notable", seen: 2, result: "mentioned" })).toContain("last named 2 replies ago");
    const uk = line({ seen: 3, floor: true, result: "mentioned" }, "uk");
    expect(uk).toContain("лише згадали");
    expect(uk).toContain("остання згадка 3");
    expect(uk).toContain("піднято до середнього");
  });
});
