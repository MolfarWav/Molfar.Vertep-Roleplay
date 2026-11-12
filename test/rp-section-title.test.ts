import { describe, expect, it } from "bun:test";
import { sectionItemOf } from "../src/components/shell/sections";

describe("the title of a section drawer", () => {
  it("is Canvas on the Canvas boards that are not Agents", () => {
    expect(sectionItemOf("canvas", "links")?.labelKey).toBe("nav.canvas");
    expect(sectionItemOf("canvas", "prompt")?.labelKey).toBe("nav.canvas");
    expect(sectionItemOf("canvas")?.labelKey).toBe("nav.canvas");
  });
  it("is Agents while the Agents board is open (it shares the canvas key)", () => {
    expect(sectionItemOf("canvas", "agents")?.labelKey).toBe("nav.agents");
  });
  it("leaves every other section alone", () => {
    expect(sectionItemOf("lorebooks", "agents")?.labelKey).toBe("nav.lorebooks");
  });
});
