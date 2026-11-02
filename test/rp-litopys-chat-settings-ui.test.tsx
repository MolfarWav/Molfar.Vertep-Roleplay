// #122: the "This chat" tab of the story record shows each setting with the global value to follow.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SettingsTab, ownCount, settingAction } = await import("../src/components/library/ledger-settings");

const global = { cutMode: "fit", recentMessages: 100, sceneKeep: 2, pinLimit: 5, budget: 800, scene: { minMessages: 6, maxMessages: 40 } };
const chat = (own: Record<string, unknown>, cutMode = "fit") =>
  ({ chatId: "c1", rebuilding: null, chatConfig: { own, value: { ...global, ...own }, global: { ...global, cutMode } } }) as never;
/** Whether the reset button is switched off: its tag without the class list, which mentions disabled: variants. */
const resetOff = (html: string) => /disabled/.test((/<button[^>]*data-testid="lit-chat-reset"[^>]*>/.exec(html)?.[0] ?? "").replace(/class="[^"]*"/, ""));
const render = (c: never) => renderToStaticMarkup(<SettingsTab chat={c} onChat={() => {}} onRefresh={() => {}} />);

describe("ownCount", () => {
  it("counts the settings a chat set for itself", () => {
    expect(ownCount(undefined)).toBe(0);
    expect(ownCount({})).toBe(0);
    expect(ownCount({ pinLimit: 3, scene: { maxMessages: 20 } })).toBe(2);
  });
});

describe("settingAction (what leaving a field does)", () => {
  it("an emptied field clears the key, so the chat follows the global value again", () => {
    expect(settingAction("", 30, 10, 200)).toEqual({ kind: "clear", show: "" });
    expect(settingAction("  ", 30, 10, 200)).toEqual({ kind: "clear", show: "" });
  });
  it("an empty field with nothing set does nothing", () => {
    expect(settingAction("", undefined, 10, 200)).toEqual({ kind: "none", show: "" });
  });
  it("a number is rounded, kept inside the limits and set; the same number again does nothing", () => {
    expect(settingAction("30", undefined, 10, 200)).toEqual({ kind: "set", n: 30, show: "30" });
    expect(settingAction("3", 30, 10, 200)).toEqual({ kind: "set", n: 10, show: "10" });
    expect(settingAction("9999", undefined, 6, 200)).toEqual({ kind: "set", n: 200, show: "200" });
    expect(settingAction("12.6", undefined, 1, 40)).toEqual({ kind: "set", n: 13, show: "13" });
    expect(settingAction("30", 30, 10, 200)).toEqual({ kind: "none", show: "30" });
  });
});

describe("the chat settings tab", () => {
  it("shows empty fields with the global value as the placeholder, and the reset button off", () => {
    const html = render(chat({}));
    expect(html).toContain('data-testid="lit-chat-settings"');
    expect(html).toContain('placeholder="40"'); // scene max
    expect(html).toContain('placeholder="100"'); // recent messages
    expect(html).toContain("Follows the global setting (40)");
    expect(resetOff(html)).toBe(true);
  });
  it("shows what the chat set, marks it as this chat only, and turns the reset button on", () => {
    const html = render(chat({ scene: { maxMessages: 20 } }));
    expect(html).toContain('value="20"');
    expect(html).toContain("This chat only (global: 40)");
    expect(resetOff(html)).toBe(false);
  });
  it("asks for the scenes kept after the cut, not the recent messages, when the global cut is by scenes", () => {
    expect(render(chat({}, "scenes"))).toContain('data-testid="lit-chat-sceneKeep"');
    expect(render(chat({}, "fit"))).not.toContain('data-testid="lit-chat-sceneKeep"');
    expect(render(chat({}, "fit"))).toContain('data-testid="lit-chat-recent"');
  });
  it("says so when the engine has no per-chat settings", () => {
    expect(render({ chatId: "c1" } as never)).toContain("no per-chat settings");
  });
});
