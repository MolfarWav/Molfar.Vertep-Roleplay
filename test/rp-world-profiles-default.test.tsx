// The default profile in the Profiles tab, rendered to static markup (no DOM library here): the editor's header shows
// either the long tag (this one is the default) or the button that makes it one. The list row's tag is not rendered here:
// the list reads a zustand store, which a server render takes from its initial state. The language is whatever the store says; the checks use test ids, not words.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { ProfileEditor } = await import("../src/components/world/world-profiles");
type Profile = import("../src/lib/world").WorldProfile;

const profile = (id: string, base: Profile["base"], isDefault: boolean, builtIn = true): Profile => ({
  id,
  builtIn,
  base,
  name: builtIn ? "" : "Calm",
  description: "",
  defaults: { everyN: 5, stagnation: 6, onTransition: true, insert: true },
  options: { clocks: "model", clockEvery: 6, eventByClock: false, deck: false, dice: "off", diceStat: "auto", diceChance: 25, diceTilt: "even", diceLife: 0, dicePace: 0 },
  blocks: [{ key: "keeper", text: "keeper text", default: "keeper text", changed: false }],
  output: "{}",
  changed: false,
  chats: 0,
  default: isDefault,
});

const editor = (p: Profile) => renderToStaticMarkup(<ProfileEditor profile={p} onDirty={() => {}} onGone={() => {}} onOpenProfile={() => {}} />);
const count = (html: string, id: string) => html.split(`data-testid="${id}"`).length - 1;

describe("the default profile in the Profiles tab", () => {
  it("a profile that is not the default offers the button; the default shows the tag instead", () => {
    const other = editor(profile("director", "director", false));
    expect(count(other, "profile-make-default")).toBe(1);
    expect(count(other, "profile-default-mark")).toBe(0);
    const current = editor(profile("director", "director", true));
    expect(count(current, "profile-make-default")).toBe(0);
    expect(count(current, "profile-default-mark")).toBe(1);
  });

  it("an own profile gets the same button", () => {
    expect(count(editor(profile("p-calm", "living", false, false)), "profile-make-default")).toBe(1);
  });
});
