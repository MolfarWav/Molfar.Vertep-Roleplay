// A Narrator-type card speaks as several characters: each one's lines take that voice's colour
// (Molfar Vertep issue #93). The speaker comes from the text.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cardVoices, leadVoiceIn, VOICE_PALETTE } from "../src/lib/dialogue-voices";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Markdown, DialogueVoices } = await import("../src/components/markdown");

const voices = cardVoices({ voices: [{ name: "Aria", color: "#111111" }, { name: "Bo Lin", color: "#222222" }, { name: "Cy", color: "" }] });
const paint = (md: string) => renderToStaticMarkup(<DialogueVoices.Provider value={voices}><Markdown content={md} /></DialogueVoices.Provider>);
/** The colour each quote got, in order: the voice's hex, or "theme" for a quote left in the theme's colour. */
const colors = (md: string) =>
  [...paint(md).matchAll(/<q(?: style="([^"]*)")?>/g)].map((m) => /#([0-9a-f]{6})/i.exec(m[1] ?? "")?.[1] ?? "theme");

describe("cardVoices", () => {
  it("takes a colour from the list, else the palette by position, and skips unusable names", () => {
    expect(voices.map((v) => v.color)).toEqual(["#111111", "#222222", VOICE_PALETTE[2]!]);
    expect(cardVoices({ voices: [{ name: " ", color: "" }, { name: "X", color: "" }] })).toEqual([]);
    expect(cardVoices({})).toEqual([]);
  });
});

describe("leadVoiceIn", () => {
  it("finds a name that opens the line before a colon, markup or not", () => {
    for (const line of ['Aria: "Hi."', 'Aria: ', '*Aria*: hi', 'Aria : hi', '"Aria:" hi']) expect(leadVoiceIn(line, voices)?.name, line).toBe("Aria");
    expect(leadVoiceIn("Bo says: hi", voices)).toBeNull();
    expect(leadVoiceIn("Aria nods. Bo: hi", voices)).toBeNull();
    expect(leadVoiceIn("Ariana: hi", voices)).toBeNull();
  });
});

describe("a Narrator reply, painted by speaker", () => {
  it("colours each paragraph by the name that leads it", () => {
    expect(colors('**Aria:** "Hello there."\n\n**Bo Lin:** "Hi."\n\n**Cy:** "Yo."')).toEqual(["111111", "222222", VOICE_PALETTE[2]!.slice(1)]);
  });
  it("colours by the first name in the line when nothing leads", () => {
    expect(colors('Aria turns. "Hello there."\n\nBo grins and says "Hi."')).toEqual(["111111", "222222"]);
  });
  it("a leading name beats one mentioned later, and a name inside a quote is not the speaker", () => {
    expect(colors('Bo: "Ask Aria."')).toEqual(["222222"]);
    expect(colors('"Aria, wait!" Bo shouts.')).toEqual(["222222"]);
  });
  it("a line that names nobody keeps the previous speaker; before anyone is named the theme colour stays", () => {
    expect(colors('"Who goes there?"\nAria: "Me."\n"And you?"')).toEqual(["theme", "111111", "111111"]);
  });
  it("a reply that never names a speaker is left in the theme's colour, and a card with no voices is untouched", () => {
    expect(colors('"One." "Two."')).toEqual(["theme", "theme"]);
    const plain = renderToStaticMarkup(<Markdown content={'Aria: "Hi."'} />);
    expect(plain).not.toContain("--tap-quotes");
  });
  it("works across a <br> and inside emphasis", () => {
    expect(colors('Aria: "One."  \nBo: "Two."')).toEqual(["111111", "222222"]);
    expect(colors('*Aria smiles.* "Hello." **Bo:** "Hm."')).toEqual(["111111", "111111"]);
  });
});

describe("voices on the card", () => {
  it("are saved in the studio bag and read back; none means no key", async () => {
    const { cardToCharacter, characterToCard } = await import("../src/lib/engine");
    const card = { name: "Narrator", studio: { voices: [{ name: " Aria ", color: "#111111" }, { name: "", color: "#222222" }, { name: "Bo", color: 5 }, "junk"] } } as never;
    const c = cardToCharacter(card, "narrator");
    expect(c.voices).toEqual([{ name: "Aria", color: "#111111" }, { name: "Bo", color: "" }]);
    const saved = characterToCard(c) as { studio: { voices?: unknown } };
    expect(saved.studio.voices).toEqual(c.voices);
    expect((characterToCard({ ...c, voices: [] }) as { studio: { voices?: unknown } }).studio.voices).toBeUndefined();
  });
});
