/** What the app says after an agent file is installed: a new agent waits, an update says whether it asks for more. */
import { describe, expect, it } from "bun:test";
import { installMessage } from "../src/lib/agent-install";
import type { InstallReply } from "../src/lib/agents";
import { t as tr, type MsgKey, type Vars } from "../src/lib/i18n";

const en = (key: MsgKey, vars?: Vars) => tr(key, "en", vars);
const uk = (key: MsgKey, vars?: Vars) => tr(key, "uk", vars);
const reply = (o: Partial<InstallReply>): InstallReply => ({ id: "a", updated: false, needs: [], granted: [], missing: [], unsupported: [], warnings: [], ...o });

describe("installMessage", () => {
  it("a new agent is told to be allowed below", () => {
    expect(installMessage(en, "Scene plan", reply({ missing: ["llm"] }))).toBe("“Scene plan” installed. Allow it below.");
  });
  it("an update that asks for more says how many new permissions", () => {
    expect(installMessage(en, "Scene plan", reply({ updated: true, missing: ["write:prompt"] }))).toMatch(/asks for 1 new permission: allow it below/);
    expect(installMessage(en, "Scene plan", reply({ updated: true, missing: ["write:prompt", "read:lastReply"] }))).toMatch(/2 new permissions: allow them below/);
  });
  it("an update that asks for nothing new says so", () => {
    expect(installMessage(en, "Scene plan", reply({ updated: true }))).toMatch(/Nothing new to allow/);
  });
  it("a need this version cannot give is not counted as something to allow", () => {
    expect(installMessage(en, "Scene plan", reply({ updated: true, missing: ["read:state.mood"], unsupported: ["read:state.mood"] }))).toMatch(/Nothing new to allow/);
  });
  it("is in Ukrainian with the right plural", () => {
    expect(installMessage(uk, "План", reply({ updated: true, missing: ["a", "b"] }))).toMatch(/2 нові дозволи/);
    expect(installMessage(uk, "План", reply({ updated: true, missing: ["a", "b", "c", "d", "e"] }))).toMatch(/5 нових дозволів/);
  });
});
