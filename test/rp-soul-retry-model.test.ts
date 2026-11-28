/** #505: "Choose another model" on a failed soul rating. The rating runs on the model the request names (the pick, or
 *  the editor's unsaved choice); without one it follows the saved chain, card tasks before the Dashboard's sensor. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
const put = (rel: string, value: unknown) => {
  const full = path.resolve(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value));
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "soul-model-"));
  put("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A barista." });
  put("settings.json", { model: "c/default", ui: { cardTasks: { model: "c/app" } } });
  put("dashboard/config.json", { sensorModel: "c/sensor" });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

/** The model of the one rating call the route asks for. */
function rated(body: Record<string, unknown>): string {
  const asked: { model?: string }[] = [];
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        fs.mkdirSync(path.dirname(path.resolve(root, rel)), { recursive: true });
        fs.writeFileSync(path.resolve(root, rel), content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: (_key: string, spec: { model?: string }) => { asked.push(spec); }, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  P.handleRoute({ query: {}, method: "POST", path: "/dashboard/soul/rate", body: { characterId: "aria", ...body } }, host);
  expect(asked).toHaveLength(1);
  return asked[0]!.model ?? "";
}

describe("the model a soul rating runs on", () => {
  it("follows the saved chain: the card's own, the app-wide card tasks, the sensor's", () => {
    expect(rated({})).toBe("c/app");
    put("characters/aria/card-tasks.json", { model: "c/own" });
    expect(rated({})).toBe("c/own");
    fs.rmSync(path.join(root, "characters/aria/card-tasks.json"));
    put("settings.json", { model: "c/default" });
    expect(rated({})).toBe("c/sensor");
  });

  it("takes the model the request names over the saved chain", () => {
    put("characters/aria/card-tasks.json", { model: "c/own" });
    expect(rated({ taskModel: "c/picked" })).toBe("c/picked");
    expect(rated({ names: ["Aria"], taskModel: "c/picked" })).toBe("c/picked");
  });

  it("ignores a model name that is not one", () => {
    expect(rated({ taskModel: "two words" })).toBe("c/app");
    expect(rated({ taskModel: 7 })).toBe("c/app");
  });
});
