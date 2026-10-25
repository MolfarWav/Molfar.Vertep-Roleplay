// Dialogue set off by dashes (Russian, Ukrainian, French) is tinted like quoted speech, and a Narrator
// card's voices are found when the narration spells a name in the other script (Ember / Эмбер).
// Found in a chat where only the first reply, with "quotes", was coloured.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cardVoices, voiceMatcher } from "../src/lib/dialogue-voices";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Markdown, DialogueVoices } = await import("../src/components/markdown");

const voices = cardVoices({ voices: [{ name: "Rhea Faeth", color: "#111111" }, { name: "Ember", color: "#222222" }, { name: "Isabella Falafel", color: "#333333" }] });
const paint = (md: string, v = voices) => renderToStaticMarkup(<DialogueVoices.Provider value={v}><Markdown content={md} /></DialogueVoices.Provider>);
const quotes = (md: string, v = voices) => [...paint(md, v).matchAll(/<q(?: style="[^"]*")?>(.*?)<\/q>/gs)].map((m) => m[1]!.replace(/<[^>]+>/g, "").replace(/&quot;/g, "\""));
const colors = (md: string) => [...paint(md).matchAll(/<q(?: style="([^"]*)")?>/g)].map((m) => /#([0-9a-f]{6})/i.exec(m[1] ?? "")?.[1] ?? "theme");

describe("voiceMatcher across scripts", () => {
  it("finds a Latin name written in Cyrillic, with endings", () => {
    expect(voiceMatcher("Ember")!.test("Эмбер вскрикивает.")).toBe(true);
    expect(voiceMatcher("Ember")!.test("Она посмотрела на Эмбера.")).toBe(true);
    expect(voiceMatcher("Isabella Falafel")!.test("Изабелла перехватывает топор.")).toBe(true);
    expect(voiceMatcher("Rhea Faeth")!.test("Рея делает шаг. Рею трясёт.")).toBe(true);
  });
  it("finds a Cyrillic name written in Latin", () => {
    expect(voiceMatcher("Ембер")!.test("Ember laughs.")).toBe(true);
  });
  it("does not take a common word or a lower-case word for a name", () => {
    expect(voiceMatcher("Rhea")!.test("Река течёт. Они шли вдоль реки.")).toBe(false);
    expect(voiceMatcher("Mark")!.test("Он поставил отметку.")).toBe(false);
  });
  it("keeps the old same-script rules", () => {
    expect(voiceMatcher("Bo")!.test("Bob waves.")).toBe(false);
    expect(voiceMatcher("Aria")!.test("Aria's staff")).toBe(true);
  });
});

describe("dialogue after dashes", () => {
  it("tints a line that opens with a dash, to the end of the line", () => {
    expect(quotes("Рея кивает.\n— Идём отсюда.")).toEqual(["— Идём отсюда."]);
  });
  it("leaves the author's words between dashes out of the speech", () => {
    expect(quotes("— Человек, — произносит она. Голос тих. — Судьба шутит.")).toEqual(["— Человек,", "— Судьба шутит."]);
    expect(quotes("— Ты, — сказала Рея, — не права.")).toEqual(["— Ты,", "— не права."]);
  });
  it("a dash inside a sentence is not a break, and a dash after a word does not open speech", () => {
    expect(quotes("— Я — Рея, королева.")).toEqual(["— Я — Рея, королева."]);
    expect(quotes("Это место — ловушка.")).toEqual([]);
  });
  it("a dash after a colon opens speech", () => {
    expect(quotes("Она сказала тихо: — Беги.")).toEqual(["— Беги."]);
  });
  it("ends at a line break and at a <br>, and keeps bold inside the speech", () => {
    expect(quotes("— Раз.\nИ тишина.\n— Два.")).toEqual(["— Раз.", "— Два."]);
    expect(quotes("— Это **важно**, слышишь?")).toEqual(["— Это важно, слышишь?"]);
  });
  it("leaves quoted speech alone, quote marks inside a dash line included", () => {
    expect(quotes('"Hi," she said.')).toEqual(['"Hi,"']);
    expect(quotes('— Он сказал «беги» и ушёл.')).toEqual(["— Он сказал «беги» и ушёл."]);
  });
  it("tints a streamed dash line before it ends", () => {
    expect(quotes("— Он сказал, что")).toEqual(["— Он сказал, что"]);
  });
});

describe("a Russian reply of a Narrator card with Latin voices", () => {
  const reply = [
    "Эмбер делает шаг к королеве, голос срывается на шепот:",
    "— Рея, это же человек! Он даже не выглядит сильным!",
    "",
    "Изабелла, не сводя глаз с двери, говорит ровным тоном:",
    "— Сильный или нет, но он единственный, кто стоит между нами и минотаврихой.",
  ].join("\n");
  it("colours each dash line by the speaker named on the line before", () => {
    expect(colors(reply)).toEqual(["222222", "333333"]);
  });
  it("a speaker named after the speech wins over the carried one", () => {
    expect(colors("Изабелла смотрит.\n— Беги, — сказала Эмбер.")).toEqual(["222222"]);
  });
});
