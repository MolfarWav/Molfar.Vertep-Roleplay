import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canShowMe, compareVersions, GUIDE_BASELINE, HELP_GROUPS, markSeen, markTourDone, mergeArticles, resetTours, searchHelp, tipText, tourFor, tourSteps, whatsNew,
  type ArticleEntry, type Tip, type Tour,
} from "../src/lib/guide";
import { APP_VERSION, TIPS, TOURS } from "../src/lib/guide-tips";
import articles from "../src/lib/help-articles.json";

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

  it("help search lists grouped tips, matches every word in either language, keeps group order", () => {
    const h = (id: string, help: Tip["help"], en: string, uk: string, kw?: string): Tip => ({
      id, help, title: { en, uk }, body: { en: "", uk: "" }, keywords: kw ? { en: kw, uk: "" } : undefined,
    });
    const tips = [h("w", "world", "Lorebooks", "Лорбуки", "world info"), h("c", "chat", "Swipes", "Свайпи"), tip("no-group")];
    expect(searchHelp(tips, "").map((t) => t.id)).toEqual(["c", "w"]);
    expect(searchHelp(tips, "world INFO").map((t) => t.id)).toEqual(["w"]);
    expect(searchHelp(tips, "лорб").map((t) => t.id)).toEqual(["w"]);
    expect(searchHelp(tips, "lore swipe")).toEqual([]);
  });

  it("falls back to English when a translation is empty", () => {
    expect(tipText({ en: "Hi", uk: "" }, "uk")).toBe("Hi");
  });
});

describe("show me (#87)", () => {
  const yes = { hasChats: true, narrow: false };
  const none = { hasChats: false, narrow: false };
  it("needs a chat for a chat panel, the editor and the open chat; not for the rest", () => {
    expect(canShowMe(undefined, none)).toBe(true);
    expect(canShowMe({ view: "home" }, none)).toBe(true);
    expect(canShowMe({ view: "lorebooks", detail: true }, none)).toBe(true);
    expect(canShowMe({ view: "chat" }, none)).toBe(false);
    expect(canShowMe({ view: "chat" }, yes)).toBe(true);
    expect(canShowMe({ view: "chat", panel: "dashboard" }, none)).toBe(false);
    expect(canShowMe({ view: "chat", panel: "editor" }, none)).toBe(false);
    expect(canShowMe({ view: "chat", panel: "reference" }, none)).toBe(true);
  });
  it("a narrow-only panel counts only on a narrow screen", () => {
    const tipOpen = { view: "chat" as const, narrowPanel: "chat-menu" as const };
    expect(canShowMe(tipOpen, { hasChats: false, narrow: true })).toBe(false);
    expect(canShowMe(tipOpen, { hasChats: false, narrow: false })).toBe(false); // view 'chat' itself needs the chat
    expect(canShowMe({ view: "home", narrowPanel: "chat-menu" }, { hasChats: false, narrow: false })).toBe(true);
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

  it("What's new tips that point at something can be opened", () => {
    for (const t of TIPS) if (t.since && t.target) expect(t.open, t.id).toBeTruthy();
  });

  it("help tips have a known group, can be shown, and there are enough of them", () => {
    const help = TIPS.filter((t) => t.help);
    expect(help.length).toBeGreaterThanOrEqual(30);
    for (const t of help) {
      expect(HELP_GROUPS, t.id).toContain(t.help!);
      if (t.target) expect(t.open, t.id).toBeTruthy();
    }
    for (const g of HELP_GROUPS) expect(help.some((t) => t.help === g), g).toBe(true);
  });

  it("every tour place is reported by a screen", () => {
    const glob = new Bun.Glob("src/components/**/*.tsx");
    let src = "";
    for (const f of glob.scanSync({ cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") })) {
      src += readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    }
    for (const tour of TOURS) expect(src.includes(`'${tour.place}'`) && src.includes("useGuidePlace("), tour.place).toBe(true);
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
      // a row component that sets data-guide={guide} from a prop: guide={cond ? 'target' : ...} or const guide = ...
      new RegExp(`(?:\\bguide=\\{|const guide = )[^}\\n]*'${target.replace(".", "\\.")}'`).test(src) ||
      (target.startsWith("nav.") && src.includes("data-guide={`nav.${")) ||
      // section titles: data-guide={`${section}.title`} (page) and {`${drawer}.title`} (drawer)
      (target.endsWith(".title") && src.includes("data-guide={`${section}.title`}"));
    for (const t of TIPS) if (t.target) expect(marked(t.target), t.target).toBe(true);
  });
});

describe("help search ranking", () => {
  const h = (id: string, help: Tip["help"], en: string, kw = "", body = "", details = ""): Tip => ({
    id, help, title: { en, uk: en }, body: { en: body, uk: "" }, keywords: { en: kw, uk: "" }, details: details ? { en: details, uk: "" } : undefined,
  });
  const tips = [
    h("body", "chat", "Swipes", "", "see the profile of a reply"),
    h("kw", "world", "Persona", "profile who you play"),
    h("title", "setup", "Profile (card tab)"),
    h("mention", "characters", "Several characters in one Profile"),
    h("long", "story", "Notebook", "", "", "your profile can change what is kept"),
  ];
  it("puts a title match before keywords, the body and the long text", () => {
    expect(searchHelp(tips, "profile").map((t) => t.id)).toEqual(["title", "mention", "kw", "body", "long"]);
  });
  it("accepts the start of a word and ranks it above the middle of one", () => {
    const list = [h("mid", "chat", "Improvements"), h("start", "chat", "Profile")];
    expect(searchHelp(list, "prof").map((t) => t.id)).toEqual(["start"]);
    expect(searchHelp([h("a", "chat", "Unprofessional"), h("b", "chat", "Profile")], "prof").map((t) => t.id)).toEqual(["b", "a"]);
  });
  it("still needs every word, and finds a word only the long text has", () => {
    expect(searchHelp(tips, "profile persona").map((t) => t.id)).toEqual(["kw"]);
    expect(searchHelp(tips, "kept").map((t) => t.id)).toEqual(["long"]);
  });
  it("reads the help title too, so the article's name finds a tip that keeps an older title", () => {
    const old: Tip = { ...h("x", "chat", "Skills are now Habits"), helpTitle: { en: "Habits of a character", uk: "Звички персонажа" } };
    expect(searchHelp([old], "character").map((t) => t.id)).toEqual(["x"]);
    expect(searchHelp([old], "звички").map((t) => t.id)).toEqual(["x"]);
  });
  it("ties keep group order, then registry order", () => {
    const list = [h("w", "world", "Alpha"), h("c", "chat", "Alpha"), h("c2", "chat", "Alpha")];
    expect(searchHelp(list, "alpha").map((t) => t.id)).toEqual(["c", "c2", "w"]);
  });
});

describe("mergeArticles", () => {
  const base: Tip[] = [
    { id: "help.soul", help: "characters", title: { en: "Soul", uk: "Душа" }, body: { en: "short", uk: "коротко" }, keywords: { en: "mood", uk: "настрій" } },
    { id: "new.habits", since: "4.67.0", title: { en: "Habits", uk: "Звички" }, body: { en: "habit body", uk: "звички" } },
  ];
  const entry = (id: string, extra: Partial<ArticleEntry> = {}): ArticleEntry => ({
    id, group: "story", title: { en: `T ${id}`, uk: `Т ${id}` }, aliases: { en: "alias", uk: "псевдонім" },
    short: { en: "s", uk: "к" }, details: { en: "d", uk: "д" }, ...extra,
  });
  it("adds the long text to the tip it extends and keeps that tip's own title and body", () => {
    const out = mergeArticles(base, [entry("kb.soul", { extends: "help.soul", where: { en: "w", uk: "д" }, related: ["new.habits"] })]);
    const soul = out.find((t) => t.id === "help.soul")!;
    expect(soul.title).toEqual({ en: "Soul", uk: "Душа" });
    expect(soul.helpTitle).toEqual({ en: "T kb.soul", uk: "Т kb.soul" });
    expect(soul.body.en).toBe("short");
    expect(soul.helpBody).toEqual({ en: "s", uk: "к" });
    expect(soul.details?.en).toBe("d");
    expect(soul.where?.en).toBe("w");
    expect(soul.related).toEqual(["new.habits"]);
    expect(soul.keywords).toEqual({ en: "mood alias", uk: "настрій псевдонім" });
    expect(out.length).toBe(base.length);
  });
  it("lists an extended tip that had no help group under the article's group", () => {
    const out = mergeArticles(base, [entry("kb.habits", { group: "characters", extends: "new.habits" })]);
    const habits = out.find((t) => t.id === "new.habits")!;
    expect(habits.help).toBe("characters");
    expect(habits.since).toBe("4.67.0");
  });
  it("turns a related id that names an article into the tip that article landed on", () => {
    const out = mergeArticles(base, [
      entry("kb.soul", { extends: "help.soul", related: ["kb.habits", "kb.soul", "kb.profile"] }),
      entry("kb.habits", { extends: "new.habits", group: "characters" }),
      entry("kb.profile"),
    ]);
    expect(out.find((t) => t.id === "help.soul")!.related).toEqual(["new.habits", "kb.profile"]);
  });
  it("an entry without extends, or with an unknown one, becomes a tip of its own", () => {
    const out = mergeArticles(base, [entry("kb.profile"), entry("kb.ghost", { extends: "help.nope" })]);
    const profile = out.find((t) => t.id === "kb.profile")!;
    expect(profile).toMatchObject({ help: "story", title: { en: "T kb.profile" }, body: { en: "s" }, keywords: { en: "alias" }, details: { en: "d" } });
    expect(out.map((t) => t.id)).toEqual(["help.soul", "new.habits", "kb.profile", "kb.ghost"]);
  });
  it("does not change the tips it was given, and carries no sources", () => {
    const copy = structuredClone(base);
    const out = mergeArticles(base, [entry("kb.soul", { extends: "help.soul", sources: [{ path: "x" }] } as never)]);
    expect(base).toEqual(copy);
    expect(JSON.stringify(out)).not.toContain("sources");
  });
});

describe("help articles file", () => {
  const entries = articles.entries as unknown as (ArticleEntry & { sources?: unknown[] })[];
  const handIds = new Set(TIPS.filter((t) => !t.details || !entries.some((e) => e.id === t.id)).map((t) => t.id));

  it("ids are unique, each has both languages, and none repeats a tip", () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const e of entries) {
      expect(e.id, e.id).toMatch(/^kb\./);
      expect(HELP_GROUPS, e.id).toContain(e.group);
      for (const field of ["title", "aliases", "short", "details"] as const)
        for (const lang of ["en", "uk"] as const) expect(e[field][lang]?.trim(), `${e.id} ${field} ${lang}`).toBeTruthy();
      if (!e.extends) expect(handIds.has(e.id), `${e.id} repeats a tip id`).toBe(false);
    }
  });

  it("every extends and related id points at a tip or an article", () => {
    const known = new Set([...TIPS.map((t) => t.id), ...entries.map((e) => e.id)]);
    for (const e of entries) {
      if (e.extends) expect(known.has(e.extends), `${e.id} extends ${e.extends}`).toBe(true);
      for (const r of e.related ?? []) {
        expect(known.has(r), `${e.id} related ${r}`).toBe(true);
        expect(r, `${e.id} relates to itself`).not.toBe(e.id);
        expect(r, `${e.id} relates to the tip it extends`).not.toBe(e.extends);
      }
    }
  });

  it("every link of every tip leads to a listed tip", () => {
    const listed = new Set(TIPS.filter((t) => t.help).map((t) => t.id));
    for (const t of TIPS) for (const r of t.related ?? []) expect(listed.has(r), `${t.id} links to ${r}`).toBe(true);
  });

  it("reaches the registry: every article is a tip with its long text, listed in the help", () => {
    for (const e of entries) {
      const tip = TIPS.find((t) => t.id === (e.extends ?? e.id));
      expect(tip?.details?.en, e.id).toBe(e.details.en);
      expect(tip?.help, e.id).toBeTruthy();
    }
  });

  it("the text is for a player: no code formatting, file paths or identifiers", () => {
    const bad = [/`/, /\b(?:data|characters|chats|personas|groups|lorebooks|litopys|dashboard)\/[\w<>{}.-]+/i, /\.(?:json|tsx?|mjs)\b/, /\b[a-z]+_[a-z_]+\b/, /\b[a-z]+[A-Z][A-Za-z]+\b/];
    for (const e of entries)
      for (const field of ["short", "details", "where"] as const)
        for (const lang of ["en", "uk"] as const) {
          const text = (e[field]?.[lang] ?? "").replace(/\{\{[^}]*\}\}/g, "");
          for (const re of bad) expect(re.test(text), `${e.id} ${field}.${lang} matches ${re}: ${text.match(re)?.[0]}`).toBe(false);
        }
  });
});
