/**
 * The entity registry (src/lib/entity-registry.js, docs/ENTITY-REGISTRY.md): names across scripts, resolving a word
 * to an entity, merge / apart / suggest, names out of messy cards, seeding, the file, and the copies in the plugins.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import * as R from "../src/lib/entity-registry.js";
import { generatedBlock, outOfDate, PLUGINS, withBlock } from "../scripts/sync-registry";

type Json = Record<string, any>;

/** A fake file store with the three calls a plugin's fs has. */
function memFs(files: Record<string, string> = {}) {
  return {
    files,
    read: (rel: string) => { if (!(rel in files)) throw new Error("ENOENT " + rel); return files[rel]; },
    write: (rel: string, text: string) => { files[rel] = text; },
    list: (rel: string) => Object.keys(files).filter((k) => k.startsWith(rel)),
  };
}
const people = (...names: string[]) => {
  const reg = R.regNew("c1");
  for (const n of names) R.regAdd(reg, { name: n });
  return reg;
};

describe("regFold and regTokens", () => {
  it("folds case, accents, punctuation and spaces", () => {
    expect(R.regFold("  Kaede-Fuji!  ")).toBe("kaede fuji");
    expect(R.regFold("Zoë  O'Neil")).toBe("zoe o neil");
    expect(R.regFold("Ёлка, Їжак")).toBe("елка іжак");
    expect(R.regFold(null)).toBe("");
  });
  it("keeps CJK marks and drops titles from the words of a name", () => {
    expect(R.regFold("が")).not.toBe("か");
    expect(R.regTokens("Queen Seraphina")).toEqual(["seraphina"]);
    expect(R.regTokens("Королева Серафіна")).toEqual(["серафіна"]);
    expect(R.regTokens("Lady Sir Dr")).toEqual([]);
    expect(R.REG_TITLES.has("sensei")).toBe(true);
    expect(R.REG_TITLES.has("пані")).toBe(true);
  });
});

describe("regTranslit", () => {
  const equal: [string, string][] = [
    ["Каэде", "Kaede"], ["Изабелла", "Isabella"], ["Эмбер", "Ember"], ["Рея", "Rhea"], ["Геральт", "Geralt"],
    ["Йор", "Yor"], ["Байонетта", "Bayonetta"], ["Денис", "Denis"], ["Сина", "Sina"], ["Мэй", "Mei"], ["Саки", "Saki"],
  ];
  for (const [a, b] of equal) it(`${a} = ${b}`, () => expect(R.regTranslit(a)).toBe(R.regTranslit(b)));

  it("Алиса and Alice are one letter apart (the a/e ending)", () => {
    expect(R.regTranslit("Алиса")).toBe("alisa");
    expect(R.regTranslit("Alice")).toBe("alise");
  });
  it("keeps Alice/Alex, Mark/Mary and Sina/Nina apart", () => {
    expect(R.regTranslit("Alice")).not.toBe(R.regTranslit("Alex"));
    expect(R.regTranslit("Mark")).not.toBe(R.regTranslit("Mary"));
    expect(R.regTranslit("Sina")).not.toBe(R.regTranslit("Nina"));
  });
  it("is the same for the same name in either script", () => {
    expect(R.regTranslit("Алекс")).toBe(R.regTranslit("Alex"));
    expect(R.regTranslit("Мария")).toBe(R.regTranslit("Maria"));
  });
});

describe("regNew, regAdd, regUser, regAlias, regGet", () => {
  it("makes an empty registry", () => {
    expect(R.regNew("c1", "c0")).toEqual({ v: 1, chatId: "c1", from: "c0", next: { p: 1, o: 1, l: 1 }, entities: [], apart: [], suggest: [] });
    expect(R.regNew("c1").from).toBeNull();
  });
  it("adds entities with the next id by kind and dedupes aliases", () => {
    const reg = R.regNew("c1");
    const a = R.regAdd(reg, { name: "Kaede Fuji", src: "card", card: "kaede", aliases: ["Kaede", "kaede", "Kaede Fuji", { text: "Каэде", src: "seen" }, ""] })!;
    expect(a).toMatchObject({ id: "p1", kind: "person", name: "Kaede Fuji", src: "card", card: "kaede" });
    expect(a.aliases).toEqual([{ text: "Kaede", src: "card" }, { text: "Каэде", src: "seen" }]);
    expect(R.regAdd(reg, { name: "Sina" })!.id).toBe("p2");
    expect(R.regAdd(reg, { kind: "thing", name: "Silver sword" })!.id).toBe("o1");
    expect(R.regAdd(reg, { kind: "place", name: "Tavern" })!.id).toBe("l1");
    expect(R.regAdd(reg, { name: "  " })).toBeNull();
    expect(reg.next).toEqual({ p: 3, o: 2, l: 2 });
  });
  it("makes the user and keeps old names as aliases", () => {
    const reg = R.regNew("c1");
    expect(R.regUser(reg, "Denis")).toMatchObject({ id: "user", kind: "person", name: "Denis", src: "persona" });
    R.regUser(reg, "Denis");
    expect(reg.entities).toHaveLength(1);
    R.regUser(reg, "Den");
    expect(reg.entities[0]).toMatchObject({ name: "Den", aliases: [{ text: "Denis", src: "persona" }] });
    R.regUser(reg, "Denis");
    expect(reg.entities[0]).toMatchObject({ name: "Denis", aliases: [{ text: "Den", src: "persona" }] });
    expect(R.regUser(reg, "")!.name).toBe("Denis");
  });
  it("adds an alias once and never the name; on a merged id it goes to the target", () => {
    const reg = people("Kaede Fuji", "Kaede");
    expect(R.regAlias(reg, "p1", "Kae", "user")).toBe(true);
    expect(R.regAlias(reg, "p1", "KAE", "user")).toBe(false);
    expect(R.regAlias(reg, "p1", "kaede fuji")).toBe(false);
    expect(R.regAlias(reg, "p1", "  ")).toBe(false);
    expect(R.regAlias(reg, "p9", "x")).toBe(false);
    R.regMerge(reg, "p2", "p1");
    expect(R.regAlias(reg, "p2", "Fuji-san", "seen")).toBe(true);
    expect(R.regGet(reg, "p1")!.aliases.map((a: Json) => a.text)).toEqual(["Kae", "Kaede", "Fuji-san"]);
  });
  it("follows merged to the final target and survives a cycle", () => {
    const reg = people("A One", "B Two", "C Three");
    R.regMerge(reg, "p1", "p2");
    R.regMerge(reg, "p2", "p3");
    expect(R.regGet(reg, "p1")!.id).toBe("p3");
    expect(R.regGet(reg, "nope")).toBeNull();
    reg.entities[2].merged = "p1";
    expect(R.regGet(reg, "p1")).toBeNull();
  });
});

describe("resolveName", () => {
  it("1: exact fold of a name or alias", () => {
    const reg = people("Kaede Fuji");
    R.regAlias(reg, "p1", "Kae");
    expect(R.resolveName(reg, "KAEDE  fuji")).toEqual({ id: "p1", step: 1 });
    expect(R.resolveName(reg, "kae!")).toEqual({ id: "p1", step: 1 });
  });
  it("2: the same after transliteration", () => {
    const reg = people("Kaede", "Rhea", "Bayonetta");
    expect(R.resolveName(reg, "Каэде")).toEqual({ id: "p1", step: 2 });
    expect(R.resolveName(reg, "Рея")).toEqual({ id: "p2", step: 2 });
    expect(R.resolveName(reg, "Байонетта")).toEqual({ id: "p3", step: 2 });
  });
  it("3: a single word that is the first or last word of one name; titles do not count", () => {
    const reg = people("Sina Rose", "Kaede Fuji", "Queen Seraphina");
    expect(R.resolveName(reg, "Sina")).toEqual({ id: "p1", step: 3 });
    expect(R.resolveName(reg, "Fuji")).toEqual({ id: "p2", step: 3 });
    expect(R.resolveName(reg, "Seraphina")).toEqual({ id: "p3", step: 3 });
    expect(R.resolveName(reg, "Lady Seraphina")).toEqual({ id: "p3", step: 3 });
    expect(R.resolveName(reg, "Queen")).toBeNull();
    expect(R.resolveName(reg, "Sir")).toBeNull();
    expect(R.resolveName(reg, "Rose Fuji")).toBeNull();
  });
  it("3: a first name shared by two is ambiguous", () => {
    const reg = people("Sina Rose", "Sina Lee");
    expect(R.resolveName(reg, "Sina")).toEqual({ ambiguous: ["p1", "p2"] });
    expect(R.resolveName(reg, "Rose")).toEqual({ id: "p1", step: 3 });
  });
  it("4: one letter off for names of 6 letters or more", () => {
    const reg = people("Seraphina", "Cat");
    expect(R.resolveName(reg, "Seraphine")).toEqual({ id: "p1", step: 4 });
    expect(R.resolveName(reg, "Seraphinas")).toEqual({ id: "p1", step: 4 });
    expect(R.resolveName(reg, "Cot")).toBeNull();
    expect(R.resolveName(reg, "Seraphyne")).toBeNull();
  });
  it("3: Алиса finds Alice and Alice Yamada (a single word one letter off in another alphabet, same first letter)", () => {
    expect(R.resolveName(people("Alice"), "Алиса")).toEqual({ id: "p1", step: 3 });
    expect(R.resolveName(people("Alice Yamada"), "Алиса")).toEqual({ id: "p1", step: 3 });
  });
  it("4: a full name one letter off in another alphabet", () => {
    expect(R.resolveName(people("Alice Yamada"), "Алиса Ямада")).toEqual({ id: "p1", step: 4 });
  });
  it("keeps Alice/Alex, Mark/Mary, Sina/Nina apart", () => {
    expect(R.resolveName(people("Alice"), "Alex")).toBeNull();
    expect(R.resolveName(people("Mark"), "Mary")).toBeNull();
    expect(R.resolveName(people("Nina"), "Sina")).toBeNull();
    expect(R.resolveName(people("Nina"), "Сина")).toBeNull();
    expect(R.resolveName(people("Sina"), "Нина")).toBeNull();
  });
  it("two at the same step is ambiguous; nothing found is null; empty text is null", () => {
    const reg = people("Marta Stone", "Marta Reed");
    R.regAlias(reg, "p1", "Mar");
    expect(R.resolveName(reg, "Marta")).toEqual({ ambiguous: ["p1", "p2"] });
    expect(R.resolveName(reg, "Zed")).toBeNull();
    expect(R.resolveName(reg, "  !! ")).toBeNull();
    expect(R.resolveName(reg, "Sina", "thing")).toBeNull();
  });
  it("skips merged entities as candidates but a merged name points to the target", () => {
    const reg = people("Sina Rose", "Sina");
    R.regMerge(reg, "p2", "p1");
    expect(R.resolveName(reg, "Sina")).toEqual({ id: "p1", step: 1 });
    reg.entities[0].aliases = [];
    expect(R.resolveName(reg, "Sina")).toEqual({ id: "p1", step: 1 }); // the merged entity's own name still answers, as the target
    expect(R.resolveName(reg, "Sina Rose")).toEqual({ id: "p1", step: 1 });
  });
  it("notWith skips candidates the user marked apart from that id", () => {
    const reg = people("Sina Rose", "Sina Lee", "Tom");
    expect(R.resolveName(reg, "Sina")).toEqual({ ambiguous: ["p1", "p2"] });
    R.regApart(reg, "p1", "p2");
    expect(R.resolveName(reg, "Sina", "person", "p1")).toEqual({ id: "p1", step: 3 });
    expect(R.resolveName(reg, "Sina Lee", "person", "p1")).toBeNull();
    expect(R.resolveName(reg, "Sina Lee", "person", "p3")).toEqual({ id: "p2", step: 1 });
  });
  it("the user is a candidate like the others", () => {
    const reg = people("Kaede");
    R.regUser(reg, "Denis");
    expect(R.resolveName(reg, "Денис")).toEqual({ id: "user", step: 2 });
  });
});

describe("regLearn", () => {
  it("stores a story spelling as a `seen` alias so the next lookup is exact", () => {
    const reg = people("Kaede Fuji");
    expect(R.resolveName(reg, "Каэде")!).toMatchObject({ step: 3 });
    expect(R.regLearn(reg, "p1", "Каэде")).toBe(true);
    expect(R.regGet(reg, "p1")!.aliases).toEqual([{ text: "Каэде", src: "seen" }]);
    expect(R.resolveName(reg, "Каэде")).toEqual({ id: "p1", step: 1 });
    expect(R.regLearn(reg, "p1", "Каэде")).toBe(false);
    expect(R.regLearn(reg, "p1", "Queen")).toBe(false);
  });
});

describe("regMerge, regApart, regSuggest", () => {
  it("merges: the name and aliases become aliases of the target, the pair's suggestion goes", () => {
    const reg = people("Sina Rose", "Sina");
    R.regAlias(reg, "p2", "Sinny", "card");
    expect(R.regSuggest(reg, "p2", "p1", "first name")).toBe(true);
    expect(R.regMerge(reg, "p2", "p1")).toBe(true);
    expect(reg.entities[1].merged).toBe("p1");
    expect(R.regGet(reg, "p1")!.aliases).toEqual([{ text: "Sina", src: "merged" }, { text: "Sinny", src: "card" }]);
    expect(reg.suggest).toEqual([]);
  });
  it("refuses user as the source, itself, an apart pair, a second merge, or a missing id", () => {
    const reg = people("Tom", "Tim", "Sam");
    R.regUser(reg, "Denis");
    expect(R.regMerge(reg, "user", "p1")).toBe(false);
    expect(R.regMerge(reg, "p1", "p1")).toBe(false);
    expect(R.regMerge(reg, "p1", "nope")).toBe(false);
    R.regApart(reg, "p1", "p2");
    expect(R.regMerge(reg, "p2", "p1")).toBe(false);
    expect(R.regMerge(reg, "p3", "p1")).toBe(true);
    expect(R.regMerge(reg, "p3", "p2")).toBe(false);
    expect(R.regMerge(reg, "p1", "user")).toBe(true); // someone may be merged into the user
  });
  it("a merge moves the source's apart pairs and suggestions to the target", () => {
    const reg = people("A One", "B Two", "C Three", "D Four");
    R.regApart(reg, "p2", "p3");
    R.regSuggest(reg, "p2", "p4", "x");
    R.regMerge(reg, "p2", "p1");
    expect(reg.apart).toEqual([["p1", "p3"]]);
    expect(reg.suggest).toEqual([{ a: "p1", b: "p4", why: "x" }]);
    expect(R.regMerge(reg, "p3", "p1")).toBe(false); // now apart
  });
  it("apart records an unordered pair once, drops its suggestion, and is never suggested again", () => {
    const reg = people("A One", "B Two");
    R.regSuggest(reg, "p1", "p2", "why");
    expect(R.regApart(reg, "p2", "p1")).toBe(true);
    R.regApart(reg, "p1", "p2");
    expect(reg.apart).toEqual([["p1", "p2"]]);
    expect(reg.suggest).toEqual([]);
    expect(R.regSuggest(reg, "p1", "p2", "again")).toBe(false);
    expect(R.regApart(reg, "p1", "p1")).toBe(false);
    expect(R.regApart(reg, "p1", "nope")).toBe(false);
  });
  it("suggest ignores a pair already suggested (either order), a merged entity, itself and a missing id", () => {
    const reg = people("A One", "B Two", "C Three");
    expect(R.regSuggest(reg, "p1", "p2", "first name")).toBe(true);
    expect(R.regSuggest(reg, "p2", "p1", "again")).toBe(false);
    expect(R.regSuggest(reg, "p1", "p1", "")).toBe(false);
    expect(R.regSuggest(reg, "p1", "nope", "")).toBe(false);
    R.regMerge(reg, "p3", "p1");
    expect(R.regSuggest(reg, "p3", "p2", "x")).toBe(false);
    expect(reg.suggest).toEqual([{ a: "p1", b: "p2", why: "first name" }]);
  });
});

describe("regCardNames", () => {
  const names = (name: string, description = "") => R.regCardNames({ name, description });
  const one = (name: string) => names(name).persons.map((p: Json) => p.name);

  it("a plain name is a person", () => {
    expect(names("Kaede Fuji")).toEqual({ persons: [{ name: "Kaede Fuji", aliases: [] }], cardIsPerson: true });
    expect(one("Sina Rose")).toEqual(["Sina Rose"]);
    expect(one("JESS HARRISON")).toEqual(["JESS HARRISON"]);
    expect(one("Queen Seraphina")).toEqual(["Queen Seraphina"]);
    expect(R.regTokens("Queen Seraphina")).toEqual(["seraphina"]);
  });
  it("takes the part before a separator", () => {
    expect(one("Kyomi - Arranged Marriage")).toEqual(["Kyomi"]);
    expect(one("Vaela — Twilight Bloom")).toEqual(["Vaela"]);
    expect(one("Aria (Dark Elf)")).toEqual(["Aria"]);
    expect(one("Mira | Fox Girl")).toEqual(["Mira"]);
  });
  it("a narrator, a scenario or a long title is not a person", () => {
    for (const n of ["The Apartment (Portal Six)", "Narrator: Sakura Academy Isekai", "Kakehashi Gakuen — Narrator", "Рассказчик", "Оповідач світу",
      "You Are A Foreign Student In Japan, And The Girls...", "Fallen Queen Turned Public Use Slave", "{{char}}", ""]) {
      expect(names(n)).toEqual({ persons: [], cardIsPerson: false });
    }
  });
  it("two or more name sections make the card name not a person, and each section is a person", () => {
    const desc = "A dorm.\n### Sakura\nShy.\n### Mei\nLoud.\n### Appearance\nTall.";
    expect(names("Campus Sluts", desc)).toEqual({ persons: [{ name: "Sakura", aliases: [] }, { name: "Mei", aliases: [] }], cardIsPerson: false });
    expect(R.regCardNames({ data: { name: "Campus Sluts", description: desc } }).persons).toHaveLength(2);
  });
  it("a section heading that names a part of the text is not a person", () => {
    const d = names("Kaede Fuji", "## Personality\nCalm.\n### Appearance\nTall.\n## Background\nx");
    expect(d.persons).toEqual([{ name: "Kaede Fuji", aliases: [] }]);
  });
  it("reads Name, Full name and alias lines in English, Russian and Ukrainian", () => {
    const en = names("Carolina", "**Name:** Carolina Reyes\nNicknames: Ali, Bubblegum (Carolina's teasing name), Princess Pink\nAKA: Caro or Lina; the red one");
    expect(en.persons).toEqual([{ name: "Carolina Reyes", aliases: ["Carolina", "Ali", "Bubblegum", "Princess Pink", "Caro", "Lina", "the red one"] }]);
    const ru = names("Аня", "Полное имя: Анна Соколова\nПрозвище: Анька, Соня\nТакже известна как: Белка");
    expect(ru.persons).toEqual([{ name: "Анна Соколова", aliases: ["Аня", "Анька", "Соня", "Белка"] }]);
    const uk = names("Оля", "Повне ім'я: Ольга Коваль\nПрізвисько: Олька\nТакож відома як: Лісичка");
    expect(uk.persons).toEqual([{ name: "Ольга Коваль", aliases: ["Оля", "Олька", "Лісичка"] }]);
    expect(names("Rin", "- Aliases: Rinny, Rin-chan\n").persons).toEqual([{ name: "Rin", aliases: ["Rinny", "Rin-chan"] }]);
  });
  it("a Name line of a section names that section's person; lines before any heading go to the first person", () => {
    const d = names("Campus", "Aliases: Girls\n### Sakura\nName: Sakura Tanaka\nAka: Saki\n### Mei\nNickname: Meimei");
    expect(d.persons).toEqual([{ name: "Sakura Tanaka", aliases: ["Sakura", "Saki", "Girls"] }, { name: "Mei", aliases: ["Meimei"] }]);
  });
  it("a card that is not a person but has a Name line gives that person; placeholders are ignored", () => {
    expect(names("Narrator", "Name: Hana Ito\nAliases: {{user}}, Hana").persons).toEqual([{ name: "Hana Ito", aliases: ["Hana"] }]);
    expect(names("Narrator", "Name: {{char}}").persons).toEqual([]);
    expect(names("Kaede Fuji", "Aliases: {{char}}, Kae").persons).toEqual([{ name: "Kaede Fuji", aliases: ["Kae"] }]);
  });
  it("accepts the V2 shape with data and tolerates junk", () => {
    expect(R.regCardNames({ spec: "chara_card_v2", data: { name: "Sina Rose", description: "Nickname: Sin" } }).persons).toEqual([{ name: "Sina Rose", aliases: ["Sin"] }]);
    expect(R.regCardNames(null)).toEqual({ persons: [], cardIsPerson: false });
    expect(R.regCardNames({})).toEqual({ persons: [], cardIsPerson: false });
    expect(R.regCardNames({ name: 5, description: 7 }).persons).toEqual([]);
  });
});

describe("regSeed", () => {
  const cards = [
    { id: "kaede", card: { name: "Kaede Fuji", description: "Aliases: Kae" } },
    { id: "campus", card: { name: "Campus Sluts", description: "### Sakura\nx\n### Mei\ny" } },
    { name: "Narrator: Sakura Academy Isekai", description: "" },
  ];
  it("makes the persona, card people and soul people once, with sources", () => {
    const reg = R.regNew("c1");
    R.regSeed(reg, { cards, personaName: "Denis", souls: { Kaede: { aliases: ["Каэде"] }, Ren: {} } });
    const by = Object.fromEntries(reg.entities.map((e: Json) => [e.name, e]));
    expect(Object.keys(by)).toEqual(["Denis", "Kaede Fuji", "Sakura", "Mei", "Ren"]);
    expect(by.Denis).toMatchObject({ id: "user", src: "persona" });
    expect(by["Kaede Fuji"]).toMatchObject({ id: "p1", src: "card", card: "kaede" });
    expect(by["Kaede Fuji"].aliases.map((a: Json) => a.text)).toEqual(["Kae", "Kaede", "Каэде"]);
    expect(by.Sakura).toMatchObject({ src: "card", card: "campus" });
    expect(by.Ren.src).toBe("soul");
  });
  it("is idempotent", () => {
    const reg = R.regNew("c1");
    const args = { cards, personaName: "Denis", souls: { Kaede: { aliases: ["Каэде"] }, Ren: {}, Sina: { aliases: ["Sin"] } } };
    R.regSeed(reg, args);
    const once = JSON.stringify(reg);
    R.regSeed(reg, args);
    R.regSeed(reg, args);
    expect(JSON.stringify(reg)).toBe(once);
  });
  it("a card person equal to the persona is not a second person; a spelling found by a fuzzy step is kept as an alias", () => {
    const reg = R.regNew("c1");
    R.regSeed(reg, { cards: [{ name: "Denis" }, { name: "Kaede Fuji" }, { name: "Каэде" }], personaName: "Denis" });
    expect(reg.entities.map((e: Json) => e.id)).toEqual(["user", "p1"]);
    expect(R.regGet(reg, "p1")!.aliases).toEqual([{ text: "Каэде", src: "card" }]);
  });
  it("tolerates empty input", () => {
    const reg = R.regNew("c1");
    R.regSeed(reg, {});
    R.regSeed(reg, { cards: [null as never, 4 as never], souls: null as never });
    expect(reg.entities).toEqual([]);
  });
});

describe("role-prefixed headings (a card of several characters)", () => {
  const desc = [
    "### Queen of Elves Rhea Faeth", "Full name: Queen of Elves Rhea Faeth", "Occupation: Queen of Damorae", "",
    "### Maid and Familiar of Rhea Ember Feath", "Full name: Maid and Familiar of Rhea Ember Feath", "Age: 20", "",
    "### Royal Knight Isabella Falafel", "Full name: Royal Knight Isabella Falafel", "Backstory: A knight.",
  ].join("\r\n");
  const card = { name: "Summoned to the Queen", description: desc };
  it("reads every heading, whatever the line ending, and the card title is no person", () => {
    const n = R.regCardNames(card);
    expect(n.cardIsPerson).toBe(false);
    expect(n.persons).toEqual([
      { name: "Queen of Elves Rhea Faeth", aliases: ["Rhea Faeth"] },
      { name: "Maid and Familiar of Rhea Ember Feath", aliases: ["Ember Feath"] },
      { name: "Royal Knight Isabella Falafel", aliases: ["Isabella Falafel"] },
    ]);
    expect(R.regCardNames({ name: card.name, description: desc.replace(/\r\n/g, "\n") }).persons).toHaveLength(3);
  });
  it("the trailing name is the last two capitalized words, else the last word; a title is not part of it", () => {
    const one = (h: string) => R.regCardNames({ name: "T", description: `### ${h}\nx\n### Zed Zeta\ny` }).persons[0]!;
    expect(one("Dark Lord Sauron").aliases).toEqual(["Sauron"]);
    expect(one("Королева ельфів Рея Фаетх").aliases).toEqual(["Рея Фаетх"]);
    expect(one("Rhea Faeth").aliases).toEqual([]);
  });
  it("a long heading that is a sentence is not a name", () => {
    const n = R.regCardNames({ name: "Kaede Fuji", description: "### Her relationship With The Player\nx\n### How She Talks To Others Often\ny" });
    expect(n.persons.map((p: Json) => p.name)).toEqual(["Kaede Fuji"]);
  });
  it("a guidelines section is no person", () => {
    const n = R.regCardNames({ name: "Ava Mir", description: "Name: Ava Mir\n## Characterization Guidelines\nx" });
    expect(n.persons.map((p: Json) => p.name)).toEqual(["Ava Mir"]);
  });
  it("souls resolve to the sections: one entity per person", () => {
    const reg = R.regNew("c1");
    R.regSeed(reg, { cards: [{ id: "q", card }], souls: { "Rhea Faeth": {}, Ember: {}, "Isabella Falafel": {} } });
    expect(reg.entities.map((e: Json) => e.name)).toEqual(["Queen of Elves Rhea Faeth", "Maid and Familiar of Rhea Ember Feath", "Royal Knight Isabella Falafel"]);
    expect(reg.entities.every((e: Json) => e.src === "card")).toBe(true);
    expect(R.resolveName(reg, "Ember")).toMatchObject({ id: "p2" });
    expect(R.resolveName(reg, "Rhea")).toEqual({ id: "p1", step: 3 });
  });
});

describe("resolveName, step 3b: several words inside one name", () => {
  const reg = people("Queen of Elves Rhea Faeth", "Maid and Familiar of Rhea Ember Feath");
  it("the text is inside a longer name", () => {
    expect(R.resolveName(reg, "Rhea Faeth")).toEqual({ id: "p1", step: 3.5 });
    expect(R.resolveName(reg, "Ember Feath")).toEqual({ id: "p2", step: 3.5 });
  });
  it("a longer text holds a name of two or more words", () => {
    const r = people("Rhea Faeth", "Ember Feath");
    expect(R.resolveName(r, "Queen of Elves Rhea Faeth")).toEqual({ id: "p1", step: 3.5 });
    expect(R.resolveName(r, "Queen Rhea Faeth of Damorae")).toEqual({ id: "p1", step: 3.5 });
  });
  it("order matters, a missing word is no match, two candidates are ambiguous, a single name is not a part", () => {
    expect(R.resolveName(reg, "Faeth Rhea")).toBeNull();
    expect(R.resolveName(reg, "Ember Rhea")).toBeNull();
    expect(R.resolveName(people("Alice Yamada Cooper", "Alice Brooks Cooper"), "Alice Cooper")).toEqual({ ambiguous: ["p1", "p2"] });
    expect(R.resolveName(people("Kaede"), "Kaede Fuji")).toBeNull();
    expect(R.resolveName(people("Alice Yamada"), "Alice Cooper")).toBeNull();
  });
});

describe("regPrune and regReconcile: a registry made by the old card reader", () => {
  const card = { name: "Summoned to the Queen", description: "### Queen of Elves Rhea Faeth\nFull name: Queen of Elves Rhea Faeth\n### Maid and Familiar of Rhea Ember Feath\nx\n### Royal Knight Isabella Falafel\nx" };
  const old = () => {
    const reg = R.regNew("c1");
    R.regAdd(reg, { name: "Summoned to the Queen", src: "card", card: "q" });
    R.regAdd(reg, { name: "Queen of Elves Rhea Faeth", src: "card", card: "q" });
    R.regAdd(reg, { name: "Rhea Faeth", src: "soul" });
    R.regAdd(reg, { name: "Ember", src: "soul" });
    R.regAdd(reg, { name: "Isabella Falafel", src: "soul" });
    return reg;
  };
  it("drops the unreferenced card title, merges souls into the sections", () => {
    const reg = old();
    expect(R.regPrune(reg, [{ id: "q", card }], [])).toBe(1);
    R.regSeed(reg, { cards: [{ id: "q", card }], souls: { "Rhea Faeth": {}, Ember: {}, "Isabella Falafel": {} } });
    const live = reg.entities.filter((e: Json) => !e.merged);
    expect(live.map((e: Json) => e.name)).toEqual(["Queen of Elves Rhea Faeth", "Maid and Familiar of Rhea Ember Feath", "Royal Knight Isabella Falafel"]);
    expect(R.regGet(reg, "p3")!.id).toBe("p2");
    expect(R.regGet(reg, "p4")!.name).toBe("Maid and Familiar of Rhea Ember Feath");
    expect(R.regGet(reg, "p5")!.name).toBe("Royal Knight Isabella Falafel");
    const once = JSON.stringify(reg);
    R.regPrune(reg, [{ id: "q", card }], []);
    R.regSeed(reg, { cards: [{ id: "q", card }], souls: { "Rhea Faeth": {} } });
    expect(JSON.stringify(reg)).toBe(once);
  });
  it("keeps what is referenced: kept ids, merge targets, entities of cards that were not given", () => {
    const reg = old();
    expect(R.regPrune(reg, [{ id: "q", card }], ["p1"])).toBe(0);
    expect(R.regPrune(reg, [{ id: "other", card: { name: "Kaede Fuji" } }], [])).toBe(0);
    expect(R.regPrune(reg, [], [])).toBe(0);
    const reg2 = old();
    R.regMerge(reg2, "p3", "p1");
    expect(R.regPrune(reg2, [{ id: "q", card }], [])).toBe(0);
  });
  it("does not merge a soul that fits two card people, or one marked apart", () => {
    const reg = R.regNew("c1");
    R.regAdd(reg, { name: "Alice Yamada", src: "card" });
    R.regAdd(reg, { name: "Alice Cooper", src: "card" });
    R.regAdd(reg, { name: "Alice", src: "soul" });
    expect(R.regReconcile(reg)).toBe(0);
    const r2 = people("Sina Rose");
    R.regAdd(r2, { name: "Sina", src: "seen" });
    R.regApart(r2, "p1", "p2");
    expect(R.regReconcile(r2)).toBe(0);
  });
});

describe("regLoad and regSave", () => {
  it("names the file after the chat", () => {
    expect(R.regPath("cmw1")).toBe("registry/cmw1.json");
    expect(R.regPath("../x/y")).toBe("registry/___x_y.json");
  });
  it("saves and loads", () => {
    const fsx = memFs();
    const reg = people("Kaede Fuji");
    R.regUser(reg, "Denis");
    R.regSave(fsx, reg);
    expect(Object.keys(fsx.files)).toEqual(["registry/c1.json"]);
    expect(R.regLoad(fsx, "c1")).toEqual(reg);
  });
  it("a missing file gives a fresh registry", () => {
    expect(R.regLoad(memFs(), "c1", null)).toEqual(R.regNew("c1"));
    expect(R.regLoad(memFs(), "c1", "c0")).toEqual(R.regNew("c1", "c0"));
  });
  it("a chat that continues another starts from that chat's registry", () => {
    const fsx = memFs();
    const old = people("Kaede Fuji", "Sina");
    old.chatId = "c0";
    R.regApart(old, "p1", "p2");
    R.regSave(fsx, old);
    const next = R.regLoad(fsx, "c1", "c0");
    expect(next).toMatchObject({ chatId: "c1", from: "c0" });
    expect(next.entities.map((e: Json) => e.name)).toEqual(["Kaede Fuji", "Sina"]);
    expect(next.apart).toEqual([["p1", "p2"]]);
    expect(next.next.p).toBe(3);
    expect(fsx.files["registry/c1.json"]).toBeUndefined(); // loading writes nothing
    expect(R.regLoad(fsx, "c1", "gone")).toEqual(R.regNew("c1", "gone"));
  });
  it("its own file wins over `from`", () => {
    const fsx = memFs();
    R.regSave(fsx, people("Old One"));
    const mine = people("Mine");
    R.regSave(fsx, { ...mine, chatId: "c2", from: "c1" });
    expect(R.regLoad(fsx, "c2", "c1").entities.map((e: Json) => e.name)).toEqual(["Mine"]);
  });
  it("a broken file gives a fresh registry", () => {
    for (const text of ["{ not json", "null", "[]", "42", ""]) {
      expect(R.regLoad(memFs({ "registry/c1.json": text }), "c1")).toEqual(R.regNew("c1"));
    }
  });
  it("drops malformed entities, keeps ids unique, recomputes next, repairs merges", () => {
    const text = JSON.stringify({
      v: 1, chatId: "other", next: { p: 1 },
      entities: [
        { id: "p3", kind: "person", name: "Kaede", aliases: [{ text: "Kae", src: "card" }, "Kae", { text: "kaede" }, 5], src: "card" },
        { id: "p3", kind: "person", name: "Duplicate id" },
        { id: "p7", kind: "person", name: "Sina", merged: "p3" },
        { id: "x1", kind: "person", name: "Bad id" },
        { id: "p9", kind: "thing", name: "Wrong letter for kind" },
        { id: "p10", kind: "person", name: "" },
        { id: "p11", kind: "person", name: "Cycle A", merged: "p12" },
        { id: "p12", kind: "person", name: "Cycle B", merged: "p11" },
        { id: "p13", kind: "person", name: "Dangling", merged: "p99" },
        { id: "user", kind: "person", name: "Denis", merged: "p3" },
        { id: "o2", kind: "thing", name: "Sword" },
        "junk", null,
      ],
      apart: [["p3", "p7"], ["p3", "p3"], ["p3", "zz"], "x", ["p3", "p7"]],
      suggest: [{ a: "p3", b: "p13", why: "x" }, { a: "p3", b: "gone" }, null],
    });
    const reg = R.regLoad(memFs({ "registry/c1.json": text }), "c1", "c0");
    expect(reg.chatId).toBe("c1");
    expect(reg.entities.map((e: Json) => e.id)).toEqual(["p3", "p7", "p11", "p12", "p13", "user", "o2"]);
    expect(reg.entities[0].aliases).toEqual([{ text: "Kae", src: "card" }]);
    expect(reg.entities.find((e: Json) => e.id === "p7").merged).toBe("p3");
    expect(reg.entities.find((e: Json) => e.id === "p13").merged).toBeUndefined();
    expect(reg.entities.find((e: Json) => e.id === "user").merged).toBeUndefined();
    expect(R.regGet(reg, "p11")).not.toBeNull();
    expect(reg.next).toEqual({ p: 14, o: 3, l: 1 });
    expect(reg.apart).toEqual([["p3", "p7"]]);
    expect(reg.suggest).toEqual([{ a: "p3", b: "p13", why: "x" }]);
    expect(R.regAdd(reg, { name: "New" })!.id).toBe("p14");
  });
});

describe("the copies in the plugins", () => {
  it("each plugin carries exactly the source (run: bun scripts/sync-registry.ts)", () => {
    expect(PLUGINS).toEqual(["plugins/relations/plugin.js", "plugins/world/plugin.js", "plugins/litopys/plugin.js"]);
    expect(outOfDate()).toEqual([]);
  });
  it("the block is the source without `export`, and replacing it twice gives the same file", () => {
    const block = generatedBlock();
    expect(block).not.toMatch(/^export /m);
    expect(block).toContain("function resolveName(");
    for (const rel of PLUGINS) {
      const now = fs.readFileSync(new URL("../" + rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
      const once = withBlock(now, block)!;
      expect(once).toBe(now);
      expect(withBlock(once, block)).toBe(once);
    }
    expect(withBlock("no markers here", block)).toBeNull();
  });
});
