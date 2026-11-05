/**
 * Voice colours of a chat (GET/POST /dashboard/voices): one colour per person of the chat's registry, all different,
 * kept in the chat, automatic for a card of several characters and on request for any other chat.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-voices-"));
  fs.mkdirSync(path.join(root, "registry"), { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

const host = {
  fs: {
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
};
type Ent = { id: string; name: string; src?: string; card?: string; merged?: string; aliases?: unknown[] };
function registry(chatId: string, entities: Ent[]) {
  const next = { p: entities.length + 1, o: 1, l: 1 };
  fs.writeFileSync(
    path.join(root, "registry", chatId + ".json"),
    JSON.stringify({ v: 1, chatId, from: null, next, entities: entities.map((e) => ({ kind: "person", aliases: [], src: "seen", ...e })), apart: [], suggest: [] }),
  );
}
const get = (chatId: string) => P.handleRoute({ method: "GET", path: "/dashboard/voices", query: { chatId } }, host).json;
const post = (body: Record<string, unknown>) => P.handleRoute({ method: "POST", path: "/dashboard/voices", query: {}, body }, host).json;
const colors = (r: any) => r.people.map((p: any) => p.color);

const user: Ent = { id: "user", name: "Denis", src: "persona" };
const cardTwo: Ent[] = [
  { id: "p1", name: "Kaede Fuji", src: "card", card: "k", aliases: [{ text: "Kaede", src: "card" }] },
  { id: "p2", name: "Sina Rose", src: "card", card: "k" },
];

describe("voice colours", () => {
  it("a card of several characters is on by itself; the user's character never takes a colour", () => {
    registry("c1", [user, ...cardTwo]);
    const r = get("c1");
    expect(r.active).toBe(true);
    expect(r.people.map((p: any) => p.id)).toEqual(["p1", "p2"]);
    expect(new Set(colors(r)).size).toBe(2);
    expect(r.people[0].aliases).toEqual(["Kaede"]);
  });

  it("a one-person chat is off until the user turns it on, and nothing is written meanwhile", () => {
    registry("c2", [user, { id: "p1", name: "Ilsa", src: "card", card: "i" }, { id: "p2", name: "Bo", src: "seen" }]);
    const r = get("c2");
    expect(r.active).toBe(false);
    expect(colors(r)).toEqual(["", ""]);
    expect(fs.existsSync(path.join(root, "dashboard/voices/c2.json"))).toBe(false);
    const on = post({ chatId: "c2", op: "on" });
    expect(on.active).toBe(true);
    expect(new Set(colors(on)).size).toBe(2);
    expect(get("c2").people.map((p: any) => p.color)).toEqual(colors(on));
  });

  it("colours stay with the person when more people arrive, and every colour is different past the palette", () => {
    registry("c3", [user, ...cardTwo]);
    const first = colors(get("c3"));
    const many = Array.from({ length: 20 }, (_, i) => ({ id: "p" + (i + 3), name: "Npc" + i }));
    registry("c3", [user, ...cardTwo, ...many]);
    const r = get("c3");
    expect(colors(r).slice(0, 2)).toEqual(first);
    expect(new Set(colors(r)).size).toBe(22);
    expect(colors(r).every((c: string) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });

  it("a merged person leaves the list and its colour is free again", () => {
    registry("c4", [user, ...cardTwo, { id: "p3", name: "Sina", merged: "p2" }]);
    const r = get("c4");
    expect(r.people.map((p: any) => p.id)).toEqual(["p1", "p2"]);
  });

  it("set picks a colour by hand, spread keeps it and gives the rest different colours", () => {
    registry("c5", [user, ...cardTwo, { id: "p3", name: "Bo" }]);
    get("c5");
    const taken = post({ chatId: "c5", op: "set", id: "p2", color: "#E06C75" });
    expect(taken.people[1]).toMatchObject({ color: "#e06c75", hand: true });
    const spread = post({ chatId: "c5", op: "spread" });
    expect(spread.people[1].color).toBe("#e06c75");
    expect(new Set(colors(spread)).size).toBe(3);
    const all = post({ chatId: "c5", op: "spread", all: true });
    expect(all.people.every((p: any) => !p.hand)).toBe(true);
    expect(new Set(colors(all)).size).toBe(3);
  });

  it("two people on the same colour: the one not picked by hand moves", () => {
    registry("c6", [user, ...cardTwo]);
    get("c6");
    post({ chatId: "c6", op: "set", id: "p2", color: colors(get("c6"))[0] });
    const r = get("c6");
    expect(r.people[0].color).not.toBe(r.people[1].color);
    expect(r.people[1].hand).toBe(true);
  });

  it("off stops an automatic chat; unset returns a person to the automatic colour", () => {
    registry("c7", [user, ...cardTwo]);
    expect(post({ chatId: "c7", op: "off" }).active).toBe(false);
    expect(get("c7").active).toBe(false);
    expect(post({ chatId: "c7", op: "auto" }).active).toBe(true);
    post({ chatId: "c7", op: "set", id: "p1", color: "#123456" });
    expect(post({ chatId: "c7", op: "unset", id: "p1" }).people[0].hand).toBe(false);
  });

  it("refuses a bad colour, an unknown person and a bad chat id", () => {
    registry("c8", [user, ...cardTwo]);
    expect(P.handleRoute({ method: "POST", path: "/dashboard/voices", query: {}, body: { chatId: "c8", op: "set", id: "p1", color: "red" } }, host).status).toBe(400);
    expect(P.handleRoute({ method: "POST", path: "/dashboard/voices", query: {}, body: { chatId: "c8", op: "set", id: "p9", color: "#112233" } }, host).status).toBe(400);
    expect(P.handleRoute({ method: "GET", path: "/dashboard/voices", query: { chatId: "../x" } }, host).status).toBe(400);
  });

  it("a chat with no registry yet answers with nobody", () => {
    const r = get("c9");
    expect(r.people).toEqual([]);
    expect(r.active).toBe(false);
  });
});

describe("voice names of imported cards", () => {
  it("a heading with a role in front is shown and matched by the name after it, never by 'The'", () => {
    registry("c10", [
      user,
      { id: "p1", name: "The Class Representative Yuki Tanaka", src: "card", card: "s", aliases: [{ text: "Yuki Tanaka", src: "card" }, { text: "Tanaka Yuki", src: "card" }] },
      { id: "p2", name: "The Gyaru Akari Hayashi", src: "card", card: "s", aliases: [{ text: "Akari Hayashi", src: "card" }] },
      { id: "p3", name: "Kaito Sato", src: "seen" },
    ]);
    const r = get("c10");
    expect(r.active).toBe(true);
    expect(r.people.map((p: any) => p.name)).toEqual(["Yuki Tanaka", "Akari Hayashi", "Kaito Sato"]);
    expect(r.people[0].aliases).toEqual(["Tanaka Yuki"]);
    expect(JSON.stringify(r.people)).not.toContain("The Class");
  });

  it("the name the Dashboard shows wins", () => {
    registry("c11", [user, { id: "p1", name: "Queen Seraphina", src: "card", card: "q" }, { id: "p2", name: "Isabella", src: "card", card: "q" }]);
    fs.mkdirSync(path.join(root, "dashboard/state"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/state/c11.json"), JSON.stringify({ personIds: { Seraphina: "p1" } }));
    expect(get("c11").people.map((p: any) => p.name)).toEqual(["Seraphina", "Isabella"]);
  });
});
