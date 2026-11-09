// The shell's Settings opens Roleplay on its settings page (Molfar.Vertep#334): the view name comes through the
// shell bridge's `onView`, and an engine without it is simply never told.
import { afterEach, describe, expect, it } from "bun:test";
import { onShellView } from "../src/lib/shell-bridge";

const g = globalThis as { window?: unknown };

afterEach(() => {
  delete g.window;
});

describe("onShellView", () => {
  it("passes the engine's view names on and stops when asked", () => {
    const heard: string[] = [];
    let listener: ((v: string) => void) | null = null;
    g.window = { chrysalisShell: { onView: (fn: (v: string) => void) => { listener = fn; return () => { listener = null; }; } } };
    const off = onShellView((v) => heard.push(v));
    listener!("settings");
    expect(heard).toEqual(["settings"]);
    off();
    expect(listener).toBeNull();
  });

  it("is a no-op on an engine without onView", () => {
    g.window = { chrysalisShell: {} };
    expect(() => onShellView(() => {})()).not.toThrow();
    g.window = {};
    expect(() => onShellView(() => {})()).not.toThrow();
  });

  it("survives an engine whose onView throws", () => {
    g.window = { chrysalisShell: { onView: () => { throw new Error("no"); } } };
    expect(() => onShellView(() => {})()).not.toThrow();
  });
});
