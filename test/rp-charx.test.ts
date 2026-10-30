/**
 * CHARX export (src/lib/charx.ts): the package holds card.json (V3) and the
 * pictures as files, in the layout this app's own charx import reads back.
 */
import { describe, expect, it } from "bun:test";
import { unzipSync } from "fflate";
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { cardToCharacter } = await import("../src/lib/engine");
const { buildCharx, cardJson, readImage } = await import("../src/lib/charx");

const png = (n: number) => "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, n]).toString("base64");

describe("buildCharx", () => {
  it("puts the portrait, emotions and gallery images in assets/ and points card.json at them", async () => {
    const c = cardToCharacter({
      spec: "chara_card_v2", name: "Myra", description: "A herbalist.",
      extensions: { molfar_profile: { v: 1, identity: { first: "Myra" } } },
      avatar: png(1),
      studio: {
        expressions: [{ name: "joy", url: png(2) }, { name: "joy!", url: png(3) }, { name: "sad", url: "https://gone.example/x.png" }],
        gallery: [{ id: "g1", url: png(4), type: "image", caption: "Forest" }, { id: "g2", url: png(5), type: "video", caption: "clip" }],
        versions: [{ id: "v", label: "old", savedAt: 1, snapshot: { description: "secret draft" } }],
        colors: { name: "#f00", dialogue: "", bubble: "" },
      },
    } as never);
    const read = async (url: string) => (url.startsWith("data:") ? readImage(url) : null);
    const files = unzipSync(await buildCharx(c, [], read));
    const card = JSON.parse(new TextDecoder().decode(files["card.json"]));
    expect(card.spec).toBe("chara_card_v3");
    expect(card.data.name).toBe("Myra");
    expect(card.data.extensions.molfar_profile.identity.first).toBe("Myra");
    expect(card.data.assets).toEqual([
      { type: "icon", name: "main", uri: "embeded://assets/icon/images/main.png", ext: "png" },
      { type: "emotion", name: "joy", uri: "embeded://assets/emotion/images/joy.png", ext: "png" },
      { type: "emotion", name: "joy!", uri: "embeded://assets/emotion/images/joy_2.png", ext: "png" },
      { type: "other", name: "Forest", uri: "embeded://assets/other/images/Forest.png", ext: "png" },
    ]);
    expect([...files["assets/emotion/images/joy_2.png"]!]).toEqual([0x89, 0x50, 0x4e, 0x47, 3]);
    // the pictures and the edit history are not carried twice (or at all) in card.json
    expect(card.data.avatar).toBeUndefined();
    expect(card.data.studio.expressions).toBeUndefined();
    expect(card.data.studio.versions).toBeUndefined();
    expect(card.data.studio.colors.name).toBe("#f00");
    expect(JSON.stringify(card)).not.toContain("secret draft");
  });

  it("a sprite of a character or an outfit carries both in its asset name; the plain case keeps the emotion alone", async () => {
    const c = cardToCharacter({
      spec: "chara_card_v2", name: "Narrator", description: "d",
      studio: {
        outfit: "pyjamas",
        expressions: [
          { name: "joy", url: png(1) },
          { name: "joy", url: png(2), outfit: "dress" },
          { name: "joy", url: png(3), character: "Aria", outfit: "dress" },
          { name: "joy", url: png(4), character: "Aria" },
        ],
      },
    } as never);
    expect(c.expressions[2]).toMatchObject({ character: "Aria", outfit: "dress" });
    const files = unzipSync(await buildCharx(c, [], async (url) => readImage(url)));
    const card = JSON.parse(new TextDecoder().decode(files["card.json"]));
    expect(card.data.assets.filter((a: { type: string }) => a.type === "emotion").map((a: { name: string; uri: string }) => [a.name, a.uri])).toEqual([
      ["joy", "embeded://assets/emotion/images/joy.png"],
      ["dress__joy", "embeded://assets/emotion/images/dress__joy.png"],
      ["Aria__dress__joy", "embeded://assets/emotion/images/Aria__dress__joy.png"],
      ["Aria__default__joy", "embeded://assets/emotion/images/Aria__default__joy.png"],
    ]);
    // the card's default outfit stays in card.json; the sprite list does not
    expect(card.data.studio.outfit).toBe("pyjamas");
    expect(card.data.studio.expressions).toBeUndefined();
  });

  it("the JSON export is the V2 card", () => {
    const c = cardToCharacter({ spec: "chara_card_v2", name: "A", description: "d" } as never);
    expect(JSON.parse(cardJson(c, [])).spec).toBe("chara_card_v2");
    // no export carries the edit history
    const withHistory = cardToCharacter({ spec: "chara_card_v2", name: "A", description: "d", studio: { versions: [{ id: "v", label: "x", savedAt: 1, snapshot: { description: "old secret" } }] } } as never);
    expect(cardJson(withHistory, [])).not.toContain("old secret");
    expect(withHistory.versions).toHaveLength(1);
  });
});
