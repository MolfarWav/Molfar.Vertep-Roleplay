/**
 * The memory trace (issue #184, P6): the insert file keeps why each fact and chapter was in or out of the last reply, as ids
 * and codes; GET /litopys/trace joins the texts, the names of who knows a fact and the registry ids of the people when
 * someone looks. These tests pin the reasons, the ids, that reading changes no file, and that the stored trace stays small.
 */
import { describe, expect, it } from "bun:test";
import { L, exists, mockHost, readJson, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });
const route = (host: any, path: string, query: Record<string, string> = {}) => L.handleRoute({ method: "GET", path, query }, host);

const FACTS: Array<{ text: string; knownBy: "all" | string[] }> = [
  { text: "The harbour is closed for the winter.", knownBy: "all" },
  { text: "The brass key opens the hidden vault.", knownBy: ["Jude"] },
  { text: "Bram sold the old map to a stranger.", knownBy: ["Bram"] },
  { text: "The password at the cellar door is thistle.", knownBy: ["Aria", "Bram"] },
];

function seed(facts = FACTS, config?: Record<string, unknown>) {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "A grim innkeeper.", extensions: {} });
  writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: "swap", memberIds: ["aria", "bram"] });
  writeChat("tav", [U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), U("m4", "Jude sits.")], { title: "Tavern", userName: "Jude", groupId: "g1" });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.facts = facts.map((f, i) => ({ id: "f" + (i + 1), text: f.text, subject: "world", knownBy: f.knownBy, type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 }));
  st.counters.fact = facts.length;
  writeJson("litopys/chats/tav.json", st);
  if (config) writeJson("litopys/config.json", config);
}

const send = (speakerName: string, op = "send") =>
  L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] }, turn: { op, chatId: "tav", speakerName } }, mockHost().host);

describe("memory trace: why the last insert carried what it did", () => {
  it("a character's reply: its own and shared facts in, the others out with the reason 'speaker'", () => {
    seed();
    send("Aria");
    const { host } = mockHost();
    const r = route(host, "/litopys/trace", { chatId: "tav" });
    expect(r.status).toBe(200);
    const t = r.json.trace;
    expect(t.one).toBe(true);
    expect(t.op).toBe("send");
    expect(t.speaker.name).toBe("Aria");
    expect(t.speaker.id).toMatch(/^p\d+$/);
    const by = (id: string) => t.facts.find((f: any) => f.id === id);
    expect(by("f1")).toMatchObject({ state: "in", by: "all" });
    expect(by("f4")).toMatchObject({ state: "in" });
    expect(by("f4").by.map((p: any) => p.name)).toEqual(["Aria", "Bram"]);
    expect(by("f2")).toMatchObject({ state: "out", why: "speaker" });
    expect(by("f3")).toMatchObject({ state: "out", why: "speaker" });
    expect(t.n.hidden).toBe(2);
    expect(t.facts.every((f: any) => f.text)).toBe(true);
  });

  it("a reply that voices several is marked so, and carries what anyone present knows", () => {
    seed();
    writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: "narrator", memberIds: ["aria", "bram"] });
    send("");
    const t = route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json.trace;
    expect(t.one).toBe(false);
    expect(t.facts.find((f: any) => f.id === "f3")).toMatchObject({ state: "in" });
  });

  it("facts the budget leaves out are marked 'budget' with their rank, the ones that fit with theirs", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ text: "Fact number " + (i + 1) + " says something long enough to take room in the insert, about the road and the weather.", knownBy: "all" as const }));
    seed(many, { budget: 200 });
    send("Aria");
    const t = route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json.trace;
    const inn = t.facts.filter((f: any) => f.state === "in");
    const out = t.facts.filter((f: any) => f.state === "out" && f.why === "budget");
    expect(inn.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(0);
    expect(inn.length + t.n.drop).toBe(60);
    expect(inn.every((f: any) => f.why === "rank" && f.rank >= 1)).toBe(true);
    expect(Math.min(...out.map((f: any) => f.rank))).toBeGreaterThan(Math.max(...inn.map((f: any) => f.rank)));
    expect(t.full).toBe(false);
  });

  it("reading the trace changes no file and makes no registry", () => {
    seed();
    send("Aria");
    const before = JSON.stringify(readJson("litopys/insert/tav.json"));
    const regExisted = exists("registry/tav.json");
    route(mockHost().host, "/litopys/trace", { chatId: "tav" });
    expect(JSON.stringify(readJson("litopys/insert/tav.json"))).toBe(before);
    expect(exists("registry/tav.json")).toBe(regExisted);
  });

  it("a chat with no insert yet has no trace; an unknown chat is a 404", () => {
    seed();
    expect(route(mockHost().host, "/litopys/trace", { chatId: "tav" }).json.trace).toBeNull();
    expect(route(mockHost().host, "/litopys/trace", { chatId: "nope" }).status).toBe(404);
  });

  it("the stored trace stays small even for a thousand facts", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ text: "Fact number " + (i + 1) + " about the harbour and the winter road.", knownBy: i % 3 ? ("all" as const) : ["Bram"] }));
    seed(many);
    send("Aria");
    const file = JSON.stringify(readJson("litopys/insert/tav.json").trace);
    expect(file.length).toBeLessThan(6000);
  });
});
