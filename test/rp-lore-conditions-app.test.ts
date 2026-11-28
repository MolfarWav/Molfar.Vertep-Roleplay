/**
 * The app's side of the extra conditions (Molfar.Vertep#547): they survive a save and a load, a card book export and its
 * import, and a translation adds words to an added key block.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { engineLorebookToUI, lorebookToEngine, lorebookToCharacterBook } = await import("../src/lib/engine");
const { applyBookResults, planBookJobs } = await import("../src/lib/card-translate");
const { patchScene } = await import("../src/lib/lore-conditions");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = (await import(new URL("../plugins/studio-import/plugin.js", import.meta.url).href)) as Record<string, any>;

const moreKeys = [{ logic: "NOT_ANY", keys: ["guard"] }, { logic: "AND_ALL", keys: [] }];
const sceneFilter = { places: ["Tavern"], placesExclude: true, present: ["Mira"], presentExclude: false, times: ["night"], weather: ["rain"], weatherExclude: false };
const stored = { id: "b", name: "Book", entries: [{ uid: 1, keys: ["door"], content: "c", moreKeys, sceneFilter }, { uid: 2, keys: ["x"], content: "d" }] };

describe("conditions through the app", () => {
  it("a save and a load keep them, a block still being filled included; an entry without them gets no fields", () => {
    const ui = engineLorebookToUI(stored as never, "b");
    expect(ui.entries[0]!.moreKeys).toEqual(moreKeys as never);
    expect(ui.entries[0]!.sceneFilter).toEqual(sceneFilter as never);
    const back = lorebookToEngine(ui);
    expect(back.entries[0]!.moreKeys).toEqual(moreKeys);
    expect(back.entries[0]!.sceneFilter).toEqual(sceneFilter);
    expect("moreKeys" in back.entries[1]!).toBe(false);
    expect("sceneFilter" in back.entries[1]!).toBe(false);
  });

  it("a card book carries them in Molfar's own extensions", () => {
    const book = lorebookToCharacterBook(engineLorebookToUI(stored as never, "b")) as { entries: { extensions: Record<string, unknown> }[] };
    expect(book.entries[0]!.extensions.molfar_more_keys).toEqual([moreKeys[0]]);
    expect(book.entries[0]!.extensions.molfar_scene).toEqual(sceneFilter);
    expect("molfar_more_keys" in book.entries[1]!.extensions).toBe(false);
  });

  it("the importer reads them back from a card book", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-cond-imp-"));
    try {
      const host = {
        fs: {
          root,
          read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
          write: (rel: string, text: string) => { const f = path.resolve(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); },
          list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
          remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
        },
        store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
        llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
        net: { request: () => {}, results: {} },
        log: () => {},
      };
      const book = lorebookToCharacterBook(engineLorebookToUI(stored as never, "b")) as { entries: unknown[] };
      const out = S.handleRoute({ method: "POST", path: "/import/batch", query: {}, body: { worldInfo: [{ name: "Book", entries: book.entries }] } }, host);
      const read = JSON.parse(host.fs.read("lorebooks/" + out.json.lorebooks[0] + ".json"));
      expect(read.entries[0].moreKeys).toEqual([moreKeys[0]]);
      expect(read.entries[0].sceneFilter).toEqual(sceneFilter);
      expect("moreKeys" in read.entries[1]).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a translation adds words to the block they came from", () => {
    const ui = engineLorebookToUI(stored as never, "b");
    const jobs = planBookJobs(ui);
    const answers = jobs.map((j) => (j.part === "moreKeys" ? "вартовий" : null));
    const out = applyBookResults(ui, jobs, answers);
    expect(out.entries[0]!.moreKeys![0]!.keys).toEqual(["guard", "вартовий"]);
    expect(ui.entries[0]!.moreKeys![0]!.keys).toEqual(["guard"]);
  });

  it("the last condition removed takes the field with it, and its except switch", () => {
    expect(patchScene({ sceneFilter: sceneFilter as never }, { places: [] }).sceneFilter!.placesExclude).toBe(false);
    expect(patchScene({ sceneFilter: { ...sceneFilter, present: [], times: [], weather: [] } as never }, { places: [] }).sceneFilter).toBeUndefined();
  });
});
