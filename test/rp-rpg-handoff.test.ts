import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { buildEncounter, cleanFoes, cleanResult, gatherParty, handleRoute, newEncounterId, noteFromResult, parseFoeReply } from "../plugins/rpg/plugin.js";

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dir, "fixtures/rpg-contract", f), "utf8"));

function host(files: Record<string, unknown> = {}, rpg?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  const requests: Record<string, unknown> = {};
  const results: Record<string, unknown> = {};
  return {
    store,
    requests,
    results,
    fs: {
      read: (p: string) => {
        const v = store.get(p);
        if (v === undefined) throw new Error("not found");
        return v;
      },
      write: (p: string, v: string) => void store.set(p, v),
      remove: (p: string) => void store.delete(p),
      list: (d: string) => [...store.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1)),
    },
    llm: { request: (k: string, r: unknown) => void (requests[k] = r), results },
    peer: rpg
      ? { apps: () => [{ app: "rpg" }], read: (_a: string, rel: string) => { const n = rel.replace(/^results\//, ""); if (!(n in rpg)) throw new Error("peer read refused: not found"); return rpg[n]; } }
      : undefined,
  };
}

const chatFiles = (extra: Record<string, unknown> = {}) => ({
  "chats/c1.meta.json": { characterId: "card1", personaId: "pers1" },
  "chats/c1.jsonl": [{ id: "m1", role: "user", text: "hi" }, { id: "m2", role: "char", text: "Goblins knocked a cart over by the mill. Fog.", swipe: 0 }].map((m) => JSON.stringify(m)).join("\n"),
  "personas/pers1.json": { name: "Vlad" },
  "dashboard/state/c1.json": { snapshots: { "m2#0": { present: ["Medli", "Vlad", "Ember", "Goblin"], place: "the mill" } }, personIds: { Medli: "p1", Ember: "p2" } },
  "characters/card1/card.json": { name: "Medli", extensions: { molfar_soul: { characters: { Medli: { aliases: ["Мед"], traits: { shyness: 70, confidence: 30 }, spectra: { cautious_reckless: 25 } } } } } },
  ...extra,
});

test("an encounter id is a view name and later ones sort after earlier ones", () => {
  const a = newEncounterId(1790000000000, () => 0.5);
  const b = newEncounterId(1790000600000, () => 0.1);
  expect(a).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
  expect(a < b).toBe(true);
});

test("opponents are cut to six, named, levelled within 1..10, and the archetype is from the list", () => {
  const foes = cleanFoes(Array.from({ length: 9 }, (_, i) => ({ name: "Foe " + i, level: 99, archetype: "dragon", description: "<b>x</b>" })).concat([{ name: "", level: 1 } as never]));
  expect(foes.length).toBe(6);
  expect(foes[0]).toMatchObject({ level: 10, archetype: "balanced", description: "x" });
  expect(cleanFoes("x")).toEqual([]);
});

test("the model's answer is read from plain JSON, a fenced one or prose around it; nothing else passes", () => {
  const body = '{"foes":[{"name":"Scout","description":"quick","level":2,"archetype":"scout"}]}';
  expect(parseFoeReply(body)?.[0].name).toBe("Scout");
  expect(parseFoeReply("```json\n" + body + "\n```")?.[0].archetype).toBe("scout");
  expect(parseFoeReply("Here you go: " + body + " Enjoy")?.length).toBe(1);
  expect(parseFoeReply("no json")).toBeNull();
  expect(parseFoeReply('{"foes":[]}')).toBeNull();
  expect(parseFoeReply('{"foes": [')).toBeNull();
});

test("the party: the persona is the hero, the Dashboard's present people follow, the Soul numbers come from the card, the foe is not a member", () => {
  const g = gatherParty(host(chatFiles()).fs, "c1")!;
  expect(g.party.map((p) => [p.id, p.name, p.hero])).toEqual([["user", "Vlad", true], ["p1", "Medli", false], ["p2", "Ember", false], ["p-goblin", "Goblin", false]]);
  expect(g.party[1].soul).toEqual({ traits: { shyness: 70, confidence: 30 }, spectra: { cautious_reckless: 25 } });
  expect(g.party[2].soul).toBeNull();
  expect(g.place).toBe("the mill");
  expect(g.scene).toContain("Goblins knocked a cart");
  expect(gatherParty(host().fs, "nope")).toBeNull();
});

test("the built encounter has the shape of the contract's example and survives its own checks", () => {
  const ex = fx("encounter.example.json");
  const built = buildEncounter({ id: ex.id, chatId: ex.chatId, messageId: ex.messageId, skin: ex.skin, language: ex.language, scene: ex.scene, place: ex.place, party: ex.party, foes: ex.foes, stakes: ex.stakes, now: ex.at });
  expect(built).toEqual(ex);
  const hostile = buildEncounter({ id: "enc-x", chatId: "c", messageId: "m", skin: "steampunk", language: "fr", scene: "<i>s</i>".repeat(500), place: "p".repeat(200), party: Array.from({ length: 9 }, (_, i) => ({ id: "p" + i, name: "n" + i })), foes: [], stakes: { flee: false, defeat: 9 }, now: 5 });
  expect(hostile.party.length).toBe(4);
  expect(hostile.scene.length).toBeLessThanOrEqual(400);
  expect(hostile.skin).toBe("fantasy");
  expect(hostile.language).toBe("en");
  expect(hostile.stakes).toEqual({ flee: false, defeat: 4 });
});

test("POST /rpg/encounter writes the outbox file, refuses no opponents, and keeps only the newest twenty", () => {
  const h = host(chatFiles());
  const none = handleRoute({ path: "/rpg/encounter", method: "POST", body: { chatId: "c1", foes: [] } }, h);
  expect(none?.status).toBe(400);
  const ids: string[] = [];
  for (let i = 0; i < 23; i++) {
    const r = handleRoute({ path: "/rpg/encounter", method: "POST", body: { chatId: "c1", foes: [{ name: "Scout", archetype: "scout" }], stakes: { flee: true, defeat: 2 }, skin: "fantasy", language: "uk" } }, h);
    ids.push((r?.json as { id: string }).id);
  }
  const files = [...h.store.keys()].filter((k) => k.startsWith("rpg-outbox/"));
  expect(files.length).toBe(20);
  const last = JSON.parse(h.store.get(`rpg-outbox/${ids[ids.length - 1]}.json`)!);
  expect(last).toMatchObject({ contract: "0.1", chatId: "c1", language: "uk", place: "the mill" });
  expect(last.party[0]).toMatchObject({ id: "user", hero: true });
  expect(last.foes[0].name).toBe("Scout");
});

test("POST /rpg/foes is two-phase: it asks the model once, then answers with opponents or a plain reason", () => {
  const h = host(chatFiles({ "settings.json": { model: "prov/model" } }));
  const first = handleRoute({ path: "/rpg/foes", method: "POST", body: { chatId: "c1" } }, h) as { __llmPending?: boolean };
  expect(first.__llmPending).toBe(true);
  const req = h.requests.foes as { model: string; systemPrompt: string; messages: { content: string }[] };
  expect(req.model).toBe("prov/model");
  expect(req.messages[0].content).toContain("Medli");
  expect(req.messages[0].content).toContain("the mill");
  expect(req.systemPrompt).toContain("Never give numbers");
  h.results.foes = { text: '{"foes":[{"name":"Goblin scout","level":2,"archetype":"scout"}]}' };
  expect((handleRoute({ path: "/rpg/foes", method: "POST", body: { chatId: "c1" } }, h)?.json as { foes: unknown[] }).foes.length).toBe(1);
  h.results.foes = { text: "sorry" };
  expect((handleRoute({ path: "/rpg/foes", method: "POST", body: { chatId: "c1" } }, h)?.json as { ok: boolean }).ok).toBe(false);
  h.results.foes = { error: "no model providers are available" };
  expect((handleRoute({ path: "/rpg/foes", method: "POST", body: { chatId: "c1" } }, h)?.json as { code?: string }).code).toBe("no-model");
});

test("a result is read, checked and turned into a note; a newer major version is refused in plain words", () => {
  const ex = fx("result.example.json");
  const c = cleanResult(ex);
  expect(c.ok).toBe(true);
  if (!c.ok) return;
  expect(c.value.party[0].injuries).toEqual([{ zone: "arms", severity: "light" }]);
  const note = noteFromResult(c.value, "en");
  expect(note).toContain("Fight result:");
  expect(note).toContain("Injuries last after the fight: Vlad");
  expect(noteFromResult(c.value, "uk")).toContain("Результат бою:");
  const bad = cleanResult({ ...ex, contract: "2.0" });
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.reason).toContain("update the older app");
  expect(cleanResult({ ...ex, outcome: "draw" }).ok).toBe(false);
  expect(cleanResult({ ...ex, party: [{ id: "u", name: "V", hp: 99, hpMax: 5, injuries: [{ zone: "tail", severity: "light" }] }] })).toMatchObject({ ok: true, value: { party: [{ hp: 5, injuries: [] }] } });
});

test("GET /rpg/results shows this chat's results only, marks the ones dealt with, and says closed without access", () => {
  const ex = fx("result.example.json");
  const other = { ...ex, encounterId: "enc-zzzzzzzz-aaaa" };
  const base = chatFiles({
    "rpg-outbox/enc-lzk3w9a2-x4f1.json": { ...fx("encounter.example.json"), chatId: "c1" },
    "rpg-outbox/enc-zzzzzzzz-aaaa.json": { ...fx("encounter.example.json"), id: "enc-zzzzzzzz-aaaa", chatId: "other-chat" },
  });
  const h = host(base, { "enc-lzk3w9a2-x4f1.json": JSON.stringify(ex), "enc-zzzzzzzz-aaaa.json": JSON.stringify(other) });
  const r = handleRoute({ path: "/rpg/results", method: "GET", query: { chatId: "c1" } }, h)?.json as { state: string; results: { id: string; seen: boolean; note?: string }[] };
  expect(r.state).toBe("ready");
  expect(r.results.map((x) => x.id)).toEqual(["enc-lzk3w9a2-x4f1"]);
  expect(r.results[0].seen).toBe(false);
  expect(r.results[0].note).toContain("Fight result:");
  handleRoute({ path: "/rpg/seen", method: "POST", body: { id: "enc-lzk3w9a2-x4f1" } }, h);
  expect((handleRoute({ path: "/rpg/results", method: "GET", query: { chatId: "c1" } }, h)?.json as { results: { seen: boolean }[] }).results[0].seen).toBe(true);
  expect(handleRoute({ path: "/rpg/results", method: "GET", query: { chatId: "c1" } }, host(base))?.json).toEqual({ state: "closed", results: [] });
  expect(handleRoute({ path: "/rpg/seen", method: "POST", body: { id: "Bad Id" } }, h)?.status).toBe(400);
});

test("the plugin answers only its own paths", () => {
  expect(handleRoute({ path: "/other", method: "GET" }, host())).toBeNull();
  expect(handleRoute({ path: "/rpg/party", method: "GET", query: { chatId: "../x" } }, host())?.status).toBe(400);
});
