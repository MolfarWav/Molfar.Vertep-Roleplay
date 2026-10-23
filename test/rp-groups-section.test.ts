// Groups are a rail section of their own: a card opened from anywhere lands in
// its own section, a group in Groups and a character in Characters.
import { beforeAll, describe, expect, it } from "bun:test";

describe("openCard", () => {
  const store = new Map<string, string>();
  let useApp: any;
  beforeAll(async () => {
    (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    (globalThis as any).fetch = () => Promise.reject(new Error("offline"));
    useApp = (await import("../src/lib/store")).useApp;
  });
  const card = (id: string, isGroup = false) => ({ id, name: id, tags: [], isGroup });

  it("opens a group in Groups and a character in Characters", () => {
    useApp.setState({ characters: [card("solo"), card("party", true)], view: "home", drawer: null, activeCharacterId: null });
    useApp.getState().openCard("party");
    expect(useApp.getState().view).toBe("groups");
    expect(useApp.getState().activeCharacterId).toBe("party");
    useApp.setState({ view: "home", drawer: null });
    useApp.getState().openCard("solo");
    expect(useApp.getState().view).toBe("characters");
    expect(useApp.getState().activeCharacterId).toBe("solo");
  });
});
