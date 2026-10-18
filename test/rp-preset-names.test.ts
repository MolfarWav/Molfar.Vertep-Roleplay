/** #42: the built-in Molfar preset's section names read plainly (no "━", no "(PICK ONE)"). */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";

const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");

describe("plain section names", () => {
  it("drops the dash and the pick-one note, keeps what follows its dot", () => {
    expect(E.plainSectionName("━📜 Directives (PICK ONE)")).toBe("📜 Directives");
    expect(E.plainSectionName("━🚧 Plot Progression (PICK ONE pace)")).toBe("🚧 Plot Progression");
    expect(E.plainSectionName("━🧠 Reasoning (PICK ONE · non-thinking models)")).toBe("🧠 Reasoning (non-thinking models)");
    expect(E.plainSectionName("Reading Level (CEFR)")).toBe("Reading Level (CEFR)");
  });

  it("renames only a read-only built-in copy, sections and prompts alike", () => {
    const preset = { prompts: [{ name: "━👥 Roles" }], studio: { readOnly: true, sections: [{ name: "━👥 Roles" }, { name: "Plain" }] } };
    const out = E.withPlainSectionNames(preset)!;
    expect(out.prompts[0].name).toBe("👥 Roles");
    expect(out.studio.sections.map((s: { name: string }) => s.name)).toEqual(["👥 Roles", "Plain"]);
    expect(E.withPlainSectionNames({ ...preset, studio: { ...preset.studio, readOnly: false } })).toBeNull();
    expect(E.withPlainSectionNames(out)).toBeNull();
  });

  it("the shipped templates are already plain", () => {
    for (const f of ["data/presets/molfar.json", "data/presets/_molfar.json"]) {
      const p = JSON.parse(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"));
      expect(E.withPlainSectionNames(p)).toBeNull();
    }
  });
});
