// "Reset look and local settings" resets what its dialog lists (appearance settings, themes, quick replies,
// tags) and leaves the library collections that carry user data (folders, backgrounds, connection profiles):
// they are written through to the engine, so emptying them would delete them for good.
import { beforeAll, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
let useApp: any;

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).fetch = () => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  useApp = (await import("../src/lib/store")).useApp;
});

describe("reset look and local settings", () => {
  it("empties quick replies and tags, keeps folders, backgrounds and connection profiles, goes Home", () => {
    const folder = { id: "f1", name: "Fantasy", color: "#8ec9a8" };
    const background = { id: "b1", name: "Forest", url: "/x.png", type: "image", folderId: null, fitting: "cover" };
    const profile = { id: "p1", name: "Cheap", modelId: "m" };
    useApp.setState({
      folders: [folder],
      backgrounds: [background],
      connectionProfiles: [profile],
      qrSets: [{ id: "q1", name: "Set", replies: [] }],
      tags: [{ id: "t1", name: "Tag", color: "#fff", textColor: "#000", visible: true, asFolder: false, order: 0 }],
      view: "characters",
    });
    useApp.getState().resetAll();
    const s = useApp.getState();
    expect(s.qrSets).toEqual([]);
    expect(s.tags).toEqual([]);
    expect(s.folders).toEqual([folder]);
    expect(s.backgrounds).toEqual([background]);
    expect(s.connectionProfiles).toEqual([profile]);
    expect(s.view).toBe("home");
  });
});
