// Speakers the chat's people list does not know (Molfar.Vertep#477): found beside a speech verb, coloured by their name.
// Made-up replies shaped like the reported ones; no real chat is kept in the repository.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { adhocColor, speakerNameIn } from "../src/lib/adhoc-voices";
import { cardVoices } from "../src/lib/dialogue-voices";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Markdown, DialogueVoices } = await import("../src/components/markdown");

const RED = "e06c75";
const mk = (list: [string, string][]) => cardVoices({ voices: list.map(([name, color]) => ({ name, color: `#${color}` })) });
const colors = (md: string, voices = mk([["Рика", RED]])) =>
  [...renderToStaticMarkup(<DialogueVoices.Provider value={voices}><Markdown content={md} /></DialogueVoices.Provider>).matchAll(/<q(?: style="([^"]*)")?>/g)]
    .map((m) => /#([0-9a-f]{6})/i.exec(m[1] ?? "")?.[1] ?? "theme");

describe("speakerNameIn", () => {
  it("takes a capitalised name right after or before a speech verb, in Russian, Ukrainian and English", () => {
    expect(speakerNameIn(" негромко, почти про себя говорит Эш, и голос её звучит ровно.")).toBe("Эш");
    expect(speakerNameIn(" произносит Лихан, указывая пальцем на прогалину.")).toBe("Лихан");
    expect(speakerNameIn(" мовить Тарас, і голос його тремтить.")).toBe("Тарас");
    expect(speakerNameIn(' Bo said, and his voice cracked.')).toBe("Bo");
    expect(speakerNameIn(" said Bo quietly.")).toBe("Bo");
    expect(speakerNameIn(" Эш говорит тихо.")).toBe("Эш");
    expect(speakerNameIn(" говорит Каел Ворн, не поднимая глаз.")).toBe("Каел Ворн");
  });
  it("needs the verb to be beside the name, and a name that is not a pronoun or a common opener", () => {
    expect(speakerNameIn(" говорит она, глядя на Ворна.")).toBeNull();
    expect(speakerNameIn(" She said, looking at Mary.")).toBeNull();
    expect(speakerNameIn(" Тогда говорит она.")).toBeNull();
    expect(speakerNameIn(" Он идёт к Ворну.")).toBeNull();
  });
});

describe("adhocColor", () => {
  it("is the same for the same name and keeps away from the colours in use", () => {
    expect(adhocColor("Эш", [])).toBe(adhocColor("Эш", []));
    expect(adhocColor("Эш", [])).not.toBe(adhocColor("Лихан", []));
    const near = adhocColor("Эш", []);
    expect(adhocColor("Эш", [near])).not.toBe(near);
  });
});

describe("two people nobody listed, in one reply", () => {
  const md =
    "— Привал, — произносит Рика, и её голос слышен чётко.\n\n" +
    "— Здесь пахнет чужим железом, — негромко говорит Эш, и голос её звучит ровно. — И земля помнит.\n\n" +
    "— Тропа там, — произносит Лихан, указывая пальцем. — Дерн срезан.\n\n" +
    "— Нужно идти, — бросает она.";

  it("each gets a colour of their own, different from the listed voice and from each other", () => {
    const c = colors(md);
    expect(c[0]).toBe(RED);
    expect(c[1]).not.toBe("theme");
    expect(c[2]).toBe(c[1]); // the second speech of the same remark
    expect(c[3]).not.toBe("theme");
    expect(new Set([c[0], c[1], c[3]]).size).toBe(3);
  });
  it("the same name has the same colour in another message, and a pronoun after it finds it", () => {
    const first = colors(md);
    const second = colors("— Ладно, — говорит Эш, и её плечи опускаются.\n\n— Иду, — говорит она.");
    expect(second[0]).toBe(first[1]);
    expect(second[1]).toBe(first[1]); // "она": Эш was named beside a "её" in this message, Рика is not in it
  });
  it("without any voice in the chat nothing is painted", () => {
    const plain = renderToStaticMarkup(<Markdown content={"— Привал, — говорит Эш."} />);
    expect(plain).not.toContain("--tap-quotes: color-mix");
  });
  it("a listed voice keeps its colour and its name wins over a speech tag of someone else", () => {
    const c = colors("— Привал, — говорит Рика. — Идём.\n\n— Да, — говорит Эш.");
    expect(c[0]).toBe(RED);
    expect(c[1]).toBe(RED);
    expect(c[2]).not.toBe(RED);
  });
});

describe("a short quote inside a sentence is a term, not speech (#477)", () => {
  const qs = (md: string) => [...renderToStaticMarkup(<Markdown content={md} />).matchAll(/<q>([\s\S]*?)<\/q>/g)].map((m) => m[1]);
  it("one or two words after a plain word, with no dash after them, are left as plain text", () => {
    expect(qs("Она дотрагивается до «бондажа» и злополучного лифа.")).toEqual([]);
    expect(qs("Она назвала это «предательством».")).toEqual([]);
    expect(qs('He called it "treason" and left.')).toEqual([]);
    expect(qs("the so-called “golden rule” of the guild")).toEqual([]);
  });
  it("speech stays speech: a colon, a dash, a speech verb, the start of a line, or more than two words", () => {
    expect(qs("Она кивнула: «Да».")).toHaveLength(1);
    expect(qs("«Да», — сказала она.")).toHaveLength(1);
    expect(qs('"Yes," she said.')).toHaveLength(1);
    expect(qs("Она сказала «да» и ушла.")).toHaveLength(1);
    expect(qs('He whispered "no" and turned.')).toHaveLength(1);
    expect(qs("Она ответила «я не пойду туда одна» и ушла.")).toHaveLength(1);
    expect(qs('Rhea steps forward. "Come." She waits.')).toHaveLength(1);
  });
  it("a term does not take a voice's colour", () => {
    const voices = mk([["Рика", RED]]);
    const html = renderToStaticMarkup(<DialogueVoices.Provider value={voices}><Markdown content={"Рика касается «бондажа». — Идём, — говорит Рика."} /></DialogueVoices.Provider>);
    expect([...html.matchAll(/<q(?: style="[^"]*")?>/g)]).toHaveLength(1);
  });
});
