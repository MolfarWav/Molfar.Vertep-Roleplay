import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  compareVersions, GUIDE_BASELINE, markSeen, markTourDone, resetTours, tipText, tourFor, tourSteps, whatsNew,
  type Tip, type Tour,
} from "../src/lib/guide";
import { APP_VERSION, TIPS, TOURS } from "../src/lib/guide-tips";

const tip = (id: string, since?: string): Tip => ({
  id, since, target: id, title: { en: id, uk: id }, body: { en: id, uk: id },
});

describe("guide", () => {
  it("compares versions by number", () => {
    expect(compareVersions("4.45.0", "4.46.0")).toBe(-1);
    expect(compareVersions("4.100.0", "4.46.0")).toBe(1);
    expect(compareVersions("4.46", "4.46.0")).toBe(0);
  });

  it("a fresh install gets no What's new and records the version", () => {
    const r = whatsNew([tip("a", "4.44.0")], undefined, "4.46.0", false);
    expect(r.tips).toEqual([]);
    expect(r.lastVersion).toBe("4.46.0");
  });

  it("someone who played before the guide gets everything after the baseline, oldest first", () => {
    const tips = [tip("c", "4.46.0"), tip("a", "4.44.0"), tip("old", GUIDE_BASELINE), tip("tour")];
    expect(whatsNew(tips, undefined, "4.46.0", true).tips.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("after that only newer, unseen tips up to this build", () => {
    const tips = [tip("a", "4.44.0"), tip("b", "4.47.0"), tip("c", "4.47.0"), tip("future", "4.48.0")];
    const state = { lastVersion: "4.46.0", seen: ["c"] };
    expect(whatsNew(tips, state, "4.47.0", true).tips.map((t) => t.id)).toEqual(["b"]);
    expect(whatsNew(tips, { lastVersion: "4.47.0" }, "4.47.0", true).tips).toEqual([]);
  });

  it("starts a tour once, and never when tours are off", () => {
    const tours: Tour[] = [{ id: "t", place: "chat", steps: ["x"] }];
    expect(tourFor(tours, "chat", undefined)?.id).toBe("t");
    expect(tourFor(tours, "canvas.links", undefined)).toBeNull();
    expect(tourFor(tours, "chat", markTourDone(undefined, "t"))).toBeNull();
    expect(tourFor(tours, "chat", { showTours: false })).toBeNull();
    expect(tourFor(tours, "chat", resetTours(markTourDone(undefined, "t")))?.id).toBe("t");
  });

  it("state updates keep other fields and do not repeat ids", () => {
    const s = markSeen({ seen: ["a"], showTours: false }, ["a", "b"], "4.46.0");
    expect(s).toEqual({ seen: ["a", "b"], showTours: false, lastVersion: "4.46.0" });
  });

  it("falls back to English when a translation is empty", () => {
    expect(tipText({ en: "Hi", uk: "" }, "uk")).toBe("Hi");
  });
});

describe("guide registry", () => {
  it("APP_VERSION matches the manifest", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(APP_VERSION).toBe(manifest.version);
  });

  it("tip ids are unique and every tip has both languages", () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    for (const t of TIPS) {
      for (const lang of ["en", "uk"] as const) {
        expect(t.title[lang], `${t.id} title ${lang}`).toBeTruthy();
        expect(t.body[lang], `${t.id} body ${lang}`).toBeTruthy();
      }
    }
  });

  it("every tour step is a known tip and no tip is newer than this build", () => {
    for (const tour of TOURS) expect(tourSteps(tour, TIPS).length, tour.id).toBe(tour.steps.length);
    for (const t of TIPS) if (t.since) expect(compareVersions(t.since, APP_VERSION), t.id).toBeLessThanOrEqual(0);
  });

  it("What's new tips can be opened", () => {
    for (const t of TIPS) if (t.since) expect(t.open, t.id).toBeTruthy();
  });

  it("every target is marked somewhere in the UI", () => {
    const glob = new Bun.Glob("src/**/*.tsx");
    let src = "";
    for (const f of glob.scanSync({ cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") })) {
      src += readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    }
    // rail items are marked in a loop: data-guide={`nav.${item.key}`}
    const marked = (target: string) =>
      src.includes(`data-guide="${target}"`) ||
      // a card marked only while it is the first / the history one: data-guide={cond ? 'target' : ...}
      src.includes(`data-guide={`) && new RegExp(`data-guide=\{[^}\n]*'${target.replace(".", "\.")}'`).test(src) ||
      (target.startsWith("nav.") && src.includes("data-guide={`nav.${"));
    for (const t of TIPS) expect(marked(t.target), t.target).toBe(true);
  });
});
