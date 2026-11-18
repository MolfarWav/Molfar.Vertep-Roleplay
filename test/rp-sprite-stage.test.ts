/**
 * The sprite stage (Molfar.Vertep#456): several sprite windows in one chat. The pure parts: who can be shown, who
 * spoke last and who is in the scene, which window holds whom (a leaver blanks a window, a newcomer takes a free
 * one), and the saved layout.
 */
import { describe, it, expect } from "bun:test";
import {
  MAX_WINDOWS,
  addWindow,
  arrange,
  assignSlots,
  contributions,
  defaultLayout,
  layoutKey,
  loadLayout,
  memberSprite,
  normalizeLayout,
  outfitsFor,
  patchWindow,
  removeWindow,
  resolveWindows,
  sameName,
  sceneKeys,
  speakerOf,
  stageMembers,
} from "../src/lib/sprite-stage.js";
import type { Character, Message } from "../src/lib/types.js";

const sprite = (name: string, character?: string, outfit?: string) => ({ name, url: `/${character ?? "card"}-${name}-${outfit ?? "d"}.png`, character, outfit });

function card(id: string, name: string, extra: Partial<Character> = {}): Character {
  return {
    id, name, isGroup: false, expressions: [sprite("neutral"), sprite("joy"), sprite("anger")], defaultExpression: "neutral",
    ...extra,
  } as unknown as Character;
}
const group = (ids: string[]): Character => ({ id: "g", name: "Group", isGroup: true, members: ids, group: { memberIds: ids }, expressions: [] }) as unknown as Character;

let n = 0;
function say(characterId: string | null, content: string): Message {
  n++;
  return { id: `m${n}`, role: "assistant", characterId, swipes: [{ id: `s${n}`, content }], activeSwipe: 0 } as unknown as Message;
}
const user = (content: string): Message => ({ id: `u${++n}`, role: "user", characterId: null, swipes: [{ id: "s", content }], activeSwipe: 0 }) as unknown as Message;

// the chat's column on a 1280 x 800 page with a 300 px side rail
const AREA = { x: 300, y: 46, w: 700, h: 750 };
const sat = card("a", "Satsuki Kamiya");
const rei = card("b", "Reine");
const shu = card("c", "Shuna");
const shi = card("d", "Shino");
const all = [sat, rei, shu, shi];

describe("stageMembers", () => {
  it("a group lists its members that own sprites, in the chat's order", () => {
    const bare = card("e", "NoPics", { expressions: [] });
    const m = stageMembers(group(["a", "b", "e", "c"]), [...all, bare], ["c", "a", "b"]);
    expect(m.map((x) => x.name)).toEqual(["Shuna", "Satsuki Kamiya", "Reine"]);
    expect(m[0]!.outfitKey).toBe("@c");
  });
  it("a Narrator card lists the voices that own sprites, and itself when it has shared sprites", () => {
    const nar = card("n", "Narrator", {
      voices: [{ name: "Aria", color: "" }, { name: "Bo", color: "" }, { name: "Cy", color: "" }],
      expressions: [sprite("joy", "Aria"), sprite("joy", "Bo")],
    });
    expect(stageMembers(nar, [nar]).map((x) => x.key)).toEqual(["v:aria", "v:bo"]);
    const shared = { ...nar, expressions: [...nar.expressions, sprite("neutral")] } as Character;
    expect(stageMembers(shared, [shared]).map((x) => x.key)).toEqual(["v:aria", "v:bo", "c:n"]);
  });
  it("a plain card is its own single member; a card without sprites has none", () => {
    expect(stageMembers(sat, [sat]).map((x) => x.key)).toEqual(["c:a"]);
    expect(stageMembers(card("z", "Z", { expressions: [] }), [])).toEqual([]);
  });
});

describe("who spoke, who is in the scene", () => {
  const members = stageMembers(group(["a", "b", "c", "d"]), all);
  it("a member's last line is their last message; the newest message names the speaker", () => {
    const said = contributions(members, [say("a", "hello"), say("b", "I am so angry!"), user("hm"), say("c", "ok")]);
    expect(said.get("m:c")!.ago).toBe(0);
    expect(said.get("m:b")!.ago).toBe(1);
    expect(said.get("m:b")!.text).toBe("I am so angry!");
    expect(said.get("m:d")).toBeNull();
    expect(speakerOf(members, said)).toBe("m:c");
  });
  it("a narrator message gives each voice its own lines, and the last voice speaking is the speaker", () => {
    const nar = card("n", "Narrator", { voices: [{ name: "Aria", color: "" }, { name: "Bo", color: "" }], expressions: [sprite("joy", "Aria"), sprite("anger", "Bo")] });
    const ms = stageMembers(nar, [nar]);
    const said = contributions(ms, [say("n", "Aria: Oh, how lovely!\nThe rain falls.\nBo: Get out. I am furious."), say("n", "Aria: yes")]);
    expect(said.get("v:aria")).toMatchObject({ ago: 0, text: "Aria: yes" });
    expect(said.get("v:bo")!.ago).toBe(1);
    expect(speakerOf(ms, contributions(ms, [say("n", "Aria: hi\nBo: no")]))).toBe("v:bo");
  });
  it("a picture message is not a turn", () => {
    const pic = { ...say("a", ""), picture: true } as Message;
    expect(contributions(members, [say("b", "hi"), pic]).get("m:b")!.ago).toBe(0);
  });
  it("the scene is the Dashboard's present list when it names members", () => {
    const said = contributions(members, [say("a", "x"), say("b", "y")]);
    expect(sceneKeys(members, said, ["Reine", "Shuna"])).toEqual(["m:b", "m:c"]);
    expect(sceneKeys(members, said, ["Satsuki"])).toEqual(["m:a"]);
  });
  it("without it, the scene is who spoke in the last messages, newest first; a chat with no history shows everyone", () => {
    const said = contributions(members, [say("a", "x"), say("b", "y")]);
    expect(sceneKeys(members, said, null)).toEqual(["m:b", "m:a"]);
    expect(sceneKeys(members, said, ["Nobody Known"])).toEqual(["m:b", "m:a"]);
    expect(sceneKeys(members, contributions(members, []), null)).toEqual(["m:a", "m:b", "m:c", "m:d"]);
  });
  it("sameName matches a first name against a full name", () => {
    expect(sameName("Satsuki", "Satsuki Kamiya")).toBe(true);
    expect(sameName("satsuki kamiya", "Satsuki Kamiya")).toBe(true);
    expect(sameName("Sat", "Satsuki Kamiya")).toBe(false);
    expect(sameName("", "x")).toBe(false);
  });
});

describe("slots: who holds which window", () => {
  it("fills free windows in the scene's order", () => {
    expect(assignSlots(["w1", "w2", "w3"], {}, ["a", "b"])).toEqual({ w1: "a", w2: "b" });
  });
  it("a member keeps their window; a leaver blanks it; a newcomer takes the first free one", () => {
    const first = assignSlots(["w1", "w2", "w3", "w4"], {}, ["a", "b", "c", "d"]);
    expect(first).toEqual({ w1: "a", w2: "b", w3: "c", w4: "d" });
    const left = assignSlots(["w1", "w2", "w3", "w4"], first, ["a", "c", "d"]);
    expect(left).toEqual({ w1: "a", w3: "c", w4: "d" });
    expect(left.w2).toBeUndefined();
    // the scene's order changes, nobody moves; a newcomer fills the blank
    expect(assignSlots(["w1", "w2", "w3", "w4"], left, ["d", "e", "a", "c"])).toEqual({ w1: "a", w2: "e", w3: "c", w4: "d" });
  });
  it("more people than windows: the ones who came first in the scene's order are shown", () => {
    expect(assignSlots(["w1", "w2"], {}, ["a", "b", "c"])).toEqual({ w1: "a", w2: "b" });
  });
  it("a member with a window of their own is not given a second", () => {
    expect(assignSlots(["w1"], {}, ["a", "b"], new Set(["a"]))).toEqual({ w1: "b" });
  });
});

describe("resolveWindows", () => {
  const members = stageMembers(group(["a", "b", "c"]), all);
  it("speaker, next-in-scene and named windows", () => {
    const layout = normalizeLayout({
      windows: [
        { id: "w1", who: "speaker" },
        { id: "w2", who: "auto" },
        { id: "w3", who: "m:c" },
        { id: "w4", who: "m:gone" },
      ],
    });
    const v = resolveWindows(layout, members, "m:a", ["m:a", "m:b", "m:c"]);
    // the speaker is in the spotlight (w1) and the named one has a window (w3): the next in the scene is the other
    expect(v.shows).toEqual({ w1: "m:a", w2: "m:b", w3: "m:c", w4: null });
    expect(v.slots).toEqual({ w2: "m:b" });
  });
  it("the spotlight window takes the speaker out of the others, who do not move", () => {
    const layout = normalizeLayout({ windows: [{ id: "w1", who: "speaker" }, { id: "w2", who: "auto" }, { id: "w3", who: "auto" }] });
    const first = resolveWindows(layout, members, "m:a", ["m:a", "m:b", "m:c"]);
    expect(first.shows).toEqual({ w1: "m:a", w2: "m:b", w3: "m:c" });
    // m:c speaks: w1 follows, and the one who was in w3 is replaced by the previous speaker; w2 stays
    const next = resolveWindows({ ...layout, slots: first.slots }, members, "m:c", ["m:c", "m:a", "m:b"]);
    expect(next.shows).toEqual({ w1: "m:c", w2: "m:b", w3: "m:a" });
    // without a spotlight window, nobody is taken out
    const plain = normalizeLayout({ windows: [{ id: "w1", who: "auto" }, { id: "w2", who: "auto" }] });
    expect(resolveWindows(plain, members, "m:a", ["m:a", "m:b"]).shows).toEqual({ w1: "m:a", w2: "m:b" });
  });
  it("a named window's member is left out of the auto windows", () => {
    const layout = normalizeLayout({ windows: [{ id: "w1", who: "auto" }, { id: "w2", who: "m:a" }] });
    expect(resolveWindows(layout, members, null, ["m:a", "m:b"]).shows).toEqual({ w1: "m:b", w2: "m:a" });
  });
});

describe("what a window shows", () => {
  const ms = stageMembers(group(["a", "b"]), all);
  it("the emotion comes from the member's own last line and stays when they are quiet", () => {
    const said = contributions(ms, [say("b", "I am so angry!"), say("a", "hello")]);
    expect(memberSprite(ms[1]!, said.get("m:b")!, undefined)!.sprite.name).toBe("anger");
    expect(memberSprite(ms[0]!, null, undefined)!.sprite.name).toBe("neutral");
  });
  it("each group member has an outfit of their own", () => {
    const outfits = { "@b": "pyjamas" };
    const dressed = card("b", "Reine", { expressions: [sprite("neutral"), sprite("neutral", undefined, "pyjamas")] });
    const m = stageMembers(group(["a", "b"]), [sat, dressed]);
    expect(memberSprite(m[1]!, null, outfits)!.outfit).toBe("pyjamas");
    expect(memberSprite(m[0]!, null, outfits)!.outfit).toBe("default");
    expect(outfitsFor(outfits, "b", true)).toEqual({ "@b": "pyjamas", "": "pyjamas" });
    expect(outfitsFor(outfits, "a", true)).toBe(outfits);
    expect(outfitsFor(outfits, "b", false)).toBe(outfits);
  });
});

describe("layout", () => {
  it("a new chat starts with one window that follows the speaker", () => {
    const l = defaultLayout();
    expect(l.windows).toHaveLength(1);
    expect(l.windows[0]).toMatchObject({ who: "speaker", folded: false, transparent: false });
  });
  it("normalizing survives garbage and caps the windows", () => {
    expect(normalizeLayout("nope").windows).toHaveLength(1);
    expect(normalizeLayout({ windows: [] }).windows).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, who: "auto" }));
    expect(normalizeLayout({ windows: many }).windows).toHaveLength(MAX_WINDOWS);
    const l = normalizeLayout({ windows: [{ id: "a", x: "far", h: 300 }, { id: "a" }], slots: { a: "m:x", zzz: "m:y" } });
    expect(l.windows).toEqual([{ id: "a", who: "speaker", x: null, y: null, h: 300, folded: false, transparent: false }]);
    expect(l.slots).toEqual({ a: "m:x" });
  });
  it("windows sit in front of the text unless the layout says otherwise", () => {
    expect(defaultLayout().place).toBe("front");
    expect(normalizeLayout({ windows: [{ id: "a" }], place: "behind" }).place).toBe("behind");
    expect(normalizeLayout({ windows: [{ id: "a" }], place: "reserve" }).place).toBe("reserve");
    expect(normalizeLayout({ windows: [{ id: "a" }], place: "sideways" }).place).toBe("front");
    expect(normalizeLayout({ windows: [{ id: "a" }] }).place).toBe("front");
    expect(defaultLayout().visible).toBe(100);
    expect(normalizeLayout({ windows: [{ id: "a" }], visible: 10 }).visible).toBe(35);
    expect(normalizeLayout({ windows: [{ id: "a" }], visible: 55.4 }).visible).toBe(55);
    expect(normalizeLayout({ windows: [{ id: "a" }], visible: "x" }).visible).toBe(100);
    expect(defaultLayout().scrim).toBe(55);
    expect(normalizeLayout({ windows: [{ id: "a" }], scrim: 140 }).scrim).toBe(100);
    expect(normalizeLayout({ windows: [{ id: "a" }], scrim: -3 }).scrim).toBe(0);
    expect(normalizeLayout({ windows: [{ id: "a" }], scrim: "x" }).scrim).toBe(55);
  });
  it("the old single window's place carries over into the first window", () => {
    const store = { getItem: (k: string) => ({ "expr-panel-pos": '{"x":40,"y":60}', "expr-panel-height": "300", "expr-panel-minimized": "true" } as Record<string, string>)[k] ?? null };
    expect(loadLayout("c1", store).windows[0]).toMatchObject({ x: 40, y: 60, h: 300, folded: true });
    const saved = { getItem: (k: string) => (k === layoutKey("c1") ? JSON.stringify({ windows: [{ id: "w1", who: "auto", transparent: true }] }) : null) };
    expect(loadLayout("c1", saved).windows[0]).toMatchObject({ who: "auto", transparent: true });
    expect(loadLayout("c1", null).windows).toHaveLength(1);
  });
  it("add, remove and patch windows; the first cannot be removed", () => {
    let l = defaultLayout();
    for (let i = 0; i < 10; i++) l = addWindow(l, AREA);
    expect(l.windows).toHaveLength(MAX_WINDOWS);
    expect(new Set(l.windows.map((w) => w.id)).size).toBe(MAX_WINDOWS);
    expect(l.windows[1]!.who).toBe("auto");
    const less = removeWindow(l, "w2");
    expect(less.windows).toHaveLength(MAX_WINDOWS - 1);
    expect(removeWindow(defaultLayout(), "w1").windows).toHaveLength(1);
    expect(patchWindow(defaultLayout(), "w1", { transparent: true }).windows[0]!.transparent).toBe(true);
  });
  it("arrangements keep every window inside the chat's column", () => {
    for (const count of [1, 2, 4, 6, 8]) {
      let l = defaultLayout();
      while (l.windows.length < count) l = addWindow(l, AREA);
      for (const w of l.windows.slice(1)) expect(w.x!).toBeGreaterThanOrEqual(0);
      for (const kind of ["row", "grid"] as const) {
        const a = arrange(l, kind, AREA);
        for (const w of a.windows) {
          expect(w.x!).toBeGreaterThanOrEqual(AREA.x);
          expect(w.y!).toBeGreaterThanOrEqual(AREA.y);
          expect(w.x! + w.h! * 0.6).toBeLessThanOrEqual(AREA.x + AREA.w + 1);
          expect(w.y! + w.h!).toBeLessThanOrEqual(AREA.y + AREA.h);
        }
      }
    }
    const row = arrange(addWindow(defaultLayout(), AREA), "row", AREA);
    expect(row.windows[0]!.y).toBe(row.windows[1]!.y);
    expect(row.windows[0]!.x!).toBeLessThan(row.windows[1]!.x!);
  });
});
