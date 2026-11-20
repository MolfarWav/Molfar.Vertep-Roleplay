// Who "she" is in a reply (Molfar.Vertep#477). The texts are made up to have the shape of the replies the owner sent
// (dash dialogue and quotes, the speaker named once, then only a pronoun); no real chat is kept in the repository.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cardVoices } from "../src/lib/dialogue-voices";
import { genderCue, learnGender, voiceOfGender } from "../src/lib/speaker-gender";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Markdown, DialogueVoices } = await import("../src/components/markdown");

const RED = "e06c75";
const TEAL = "56b6c2";
const PURPLE = "c678dd";
const mk = (list: [string, string][]) => cardVoices({ voices: list.map(([name, color]) => ({ name, color: `#${color}` })) });
const colors = (md: string, voices: ReturnType<typeof mk>) =>
  [...renderToStaticMarkup(<DialogueVoices.Provider value={voices}><Markdown content={md} /></DialogueVoices.Provider>).matchAll(/<q(?: style="([^"]*)")?>/g)]
    .map((m) => /#([0-9a-f]{6})/i.exec(m[1] ?? "")?.[1] ?? "theme");

describe("genderCue", () => {
  it("reads English, Russian and Ukrainian pronouns, whole words only", () => {
    expect(genderCue("she turns and her eyes narrow")).toBe("f");
    expect(genderCue("— сказал он, и его голос дрогнул")).toBe("m");
    expect(genderCue("говорит она, и её голос звучит ровно")).toBe("f");
    expect(genderCue("— мовила вона, і її голос тремтів")).toBe("f");
    expect(genderCue("— мовив він, і його голос")).toBe("m");
    expect(genderCue("the sheet and the hero")).toBeNull();
  });
  it("says nothing when both genders are in the text", () => {
    expect(genderCue("she looks at him")).toBeNull();
    expect(genderCue("Она смотрит на него")).toBeNull();
  });
});

describe("learning who is a she", () => {
  const v = mk([["Рика", RED], ["Каел", TEAL]]);
  it("a line that names one voice and carries one gender teaches it; two names teach nothing", () => {
    const book = new Map();
    learnGender("— произносит Рика, и её голос звучит спокойно.", v, book);
    expect(book.get("Рика")).toBe("f");
    learnGender("Рика смотрит на Каела, и его взгляд тяжёл.", v, book);
    expect(book.has("Каел")).toBe(false);
    expect(voiceOfGender("f", v, book)?.name).toBe("Рика");
    expect(voiceOfGender("m", v, book)).toBeNull();
  });
  it("two voices of one gender give no answer", () => {
    const two = mk([["Рика", RED], ["Ада", TEAL]]);
    const book = new Map();
    learnGender("говорит Рика, и её голос", two, book);
    learnGender("говорит Ада, и её голос", two, book);
    expect(voiceOfGender("f", two, book)).toBeNull();
  });
});

describe("a quote whose line names nobody, in the colour of the voice its pronoun points at", () => {
  it("dash dialogue in Russian: named once, then only 'она', 'её', and a name said inside the speech", () => {
    const voices = mk([["Рика", RED], ["Каел Ворн", TEAL]]);
    const md =
      "— Они назовут это предательством, — произносит Рика, и её голос звучит спокойно. — Если я не приду, они объявят меня падшей.\n\n" +
      "Она делает шаг вперёд. Подошва ботинка хрустит по кирпичу.\n\n" +
      "— Я не прошу тебя быть моим учителем, Каел Ворн, — её губы трогает короткая усмешка. — И я не ищу нового хозяина.\n\n" +
      "Она останавливается, глядя ему в лицо.\n\n" +
      "— Если тебе нужно знать, откуда мы взялись, я расскажу, — говорит она. — Я расскажу всё.";
    expect(colors(md, voices)).toEqual([RED, RED, RED, RED, RED, RED]);
  });

  it("two speakers of different genders alternate and each pronoun finds its own", () => {
    const voices = mk([["Рика", RED], ["Каел", TEAL]]);
    const md =
      "— Привал, — произносит Рика, и её голос слышен чётко.\n\n" +
      "— Здесь пахнет железом, — говорит Каел, и его рука сжимается.\n\n" +
      "— Нужно идти, — бросает она.\n\n" +
      "— Да, — кивает он.";
    expect(colors(md, voices)).toEqual([RED, TEAL, RED, TEAL]);
  });

  it("English quotes: 'she says' after a line that named Rhea beside a 'her'", () => {
    const voices = mk([["Rhea", RED], ["Bo", TEAL]]);
    const md = 'Rhea nods, her eyes bright. "Yes, I can."\n\n"Come on," she says.\n\n"Fine," he mutters.';
    expect(colors(md, voices)).toEqual([RED, RED, "theme"]);
  });

  it("Ukrainian: вона after Арія", () => {
    const voices = mk([["Арія", RED], ["Тарас", PURPLE]]);
    const md = "— Ходімо, — мовить Арія, і її голос тремтить.\n\n— Зачекай, — каже вона.";
    expect(colors(md, voices)).toEqual([RED, RED]);
  });

  it("with two voices of the same gender it does not guess; the old rule stays", () => {
    const voices = mk([["Рика", RED], ["Ада", TEAL]]);
    const md = "— Привал, — произносит Рика, и её голос слышен.\n\n— Идём, — говорит Ада, и её шаг лёгок.\n\n— Хорошо, — отвечает она.";
    expect(colors(md, voices)).toEqual([RED, TEAL, "theme"]);
  });

  it("a name in the line still wins over a pronoun", () => {
    const voices = mk([["Рика", RED], ["Ада", TEAL]]);
    const md = "— Привал, — произносит Рика, и её голос слышен.\n\n— Хорошо, — говорит Ада, и её шаг лёгок. — Идём.";
    expect(colors(md, voices)).toEqual([RED, TEAL, TEAL]);
  });
});
