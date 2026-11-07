/**
 * #184 P7: a fact can be told to a whole group ("group:<slug>" in knownBy). A card tag "group: <name>" or "faction: <name>"
 * and a World DM record of kind group or place with `members` say who belongs. The insert, the narrator's brief, the worker's
 * Known facts and a snapshot book all read the group through the chat's canon; the leak check leaves such facts alone.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });
const MILL = "The guild meets at the old mill.";
const LEDGER = "Cora hides a ledger under the stairs.";

function seed(kind: "swap" | "narrator", tags: Record<string, string[]> = { aria: ["faction: Guild of Ravens"], bram: ["group:  guild of ravens "], cora: ["fantasy"] }) {
  for (const id of ["aria", "bram", "cora"]) writeJson(`characters/${id}/card.json`, { spec: "chara_card_v2", name: id[0].toUpperCase() + id.slice(1), description: "x", tags: tags[id] ?? [], extensions: {} });
  writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: kind === "narrator" ? "narrator" : "swap", memberIds: ["aria", "bram", "cora"] });
  writeChat("tav", [U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), C("m4", "Cora", "Cora waves."), U("m5", "Jude sits.")], { title: "Tavern", userName: "Jude", groupId: "g1" });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.facts = [
    { id: "f1", text: MILL, subject: "world", knownBy: ["group:guild-of-ravens"], type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 },
    { id: "f2", text: LEDGER, subject: "world", knownBy: ["Cora"], type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 },
  ];
  st.counters.fact = 2;
  writeJson("litopys/chats/tav.json", st);
}
const ctx = (speakerName: string) => ({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] }, turn: { op: "send", chatId: "tav", speakerName } });
const textOf = (res: any) => (res ? res.messages.map((m: any) => m.content).join("\n") : "");

describe("groups: the token and the members", () => {
  it("makes one token from a name, whatever the case, spaces and accents", () => {
    expect(L.groupToken("Guild of Ravens")).toBe("group:guild-of-ravens");
    expect(L.groupToken("  Guild   of RAVENS ")).toBe("group:guild-of-ravens");
    expect(L.groupToken("Café Étoile")).toBe("group:cafe-etoile");
    expect(L.groupToken("Гільдія Воронів")).toBe("group:гільдія-воронів");
    expect(L.groupToken("***")).toBe("");
    expect(L.isGroupToken("Group:X")).toBe(true);
    expect(L.isGroupToken("Aria")).toBe(false);
  });

  it("reads members from card tags, only those with the group: or faction: prefix", () => {
    seed("swap");
    const g = L.chatGroups(mockHost().host.fs, "tav", { groupId: "g1" }, null);
    expect(g.has("group:guild-of-ravens")).toBe(true);
    expect([...g.membersOf("group:guild-of-ravens")].sort()).toEqual(["aria", "bram"]);
    expect(g.nameOf("group:guild-of-ravens")).toBe("Guild of Ravens");
    expect(g.has("group:fantasy")).toBe(false);
  });

  it("is null when no tag and no record names a group", () => {
    seed("swap", {});
    expect(L.chatGroups(mockHost().host.fs, "tav", { groupId: "g1" }, null)).toBeNull();
  });

  it("reads members of a World group or place record, joined with the tags of the same name", () => {
    seed("swap");
    writeJson("world/state/tav.json", {
      entities: [
        { id: "n1", kind: "group", name: "Guild of Ravens", status: "active", members: ["Dock Hand"] },
        { id: "n2", kind: "place", name: "Harbour", status: "active", members: ["Mara"] },
        { id: "n3", kind: "group", name: "Old Watch", status: "past", members: ["Ghost"] },
        { id: "n4", kind: "person", name: "Tess", status: "active", members: ["Nobody"] },
      ],
    });
    const g = L.chatGroups(mockHost().host.fs, "tav", { groupId: "g1" }, null);
    expect([...g.membersOf("group:guild-of-ravens")].sort()).toEqual(["aria", "bram", "dock hand"]);
    expect([...g.membersOf("group:harbour")]).toEqual(["mara"]);
    expect(g.has("group:old-watch")).toBe(false);
    expect(g.has("group:tess")).toBe(false);
  });
});

describe("groups: who gets a fact told to a group", () => {
  it("a member's reply carries it, a non-member's does not, and the line names the group", () => {
    seed("swap");
    const aria = textOf(L.llmRequest(ctx("Aria"), mockHost().host));
    expect(aria).toContain(MILL);
    expect(aria).toContain("known to: Guild of Ravens (group)");
    expect(aria).not.toContain("group:guild-of-ravens");
    expect(aria).not.toContain(LEDGER);
    const bram = textOf(L.llmRequest(ctx("Bram"), mockHost().host));
    expect(bram).toContain(MILL);
    const cora = textOf(L.llmRequest(ctx("Cora"), mockHost().host));
    expect(cora).not.toContain(MILL);
    expect(cora).toContain(LEDGER);
  });

  it("without any group the token is just an unknown name: nobody gets the fact", () => {
    seed("swap", {});
    for (const who of ["Aria", "Bram", "Cora"]) expect(textOf(L.llmRequest(ctx(who), mockHost().host))).not.toContain(MILL);
  });

  it("a narrator voicing the cast gets it when a member is present, and the brief lists the members, not the token", () => {
    seed("narrator");
    writeJson("litopys/config.json", { castKnowledge: true });
    const text = textOf(L.llmRequest(ctx("Tavern"), mockHost().host));
    expect(text).toContain(MILL);
    expect(text).toContain("Only Aria and Bram know: " + MILL);
    expect(text).toContain("Only Cora knows: " + LEDGER);
  });
});

describe("groups: the chapter worker", () => {
  const scene = (ln: any[]) => ({ from: ln[0].id, to: ln[ln.length - 1].id, fromIdx: 0, toIdx: ln.length - 1, count: ln.length, kind: "scene", label: "" });
  const lineOf = () => L.activeLine([U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), U("m4", "Jude sits.")]);

  it("sees the groups of the people in the scene and the facts told to them", () => {
    seed("swap");
    const ln = lineOf();
    const canon = L.litCanon(mockHost().host.fs, "tav", { groupId: "g1", userName: "Jude" }, {}, false);
    const st = L.loadChatFile(mockHost().host.fs, "tav");
    const req = L.buildWorkerRequest(st, { scene: scene(ln) }, ln, {}, { model: "m" }, { userName: "Jude", groupId: "g1" }, { canon });
    const text = JSON.stringify(req);
    expect(text).toContain("Groups here");
    expect(text).toContain("Guild of Ravens = group:guild-of-ravens: ");
    expect(text).toContain(MILL);
  });

  it("keeps a real group token in knownBy and drops an invented one", () => {
    seed("swap");
    const ln = lineOf();
    const canon = L.litCanon(mockHost().host.fs, "tav", { groupId: "g1", userName: "Jude" }, {}, false);
    const st = L.emptyChat("tav");
    const parsed = L.parseWorkerReply(
      JSON.stringify({
        chapter: { label: "L", text: "T" },
        facts: [
          { op: "add", text: "A", subject: "world", knownBy: ["group:guild-of-ravens", "Aria"] },
          { op: "add", text: "B", subject: "world", knownBy: ["group:made-up"] },
        ],
      }),
    );
    L.applyWorkerResult(st, { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln, canon, witnesses: ["Aria", "Bram"] });
    expect(st.facts.map((f: any) => f.knownBy)).toEqual([["group:guild-of-ravens", "Aria"], ["Aria", "Bram"]]);
  });
});

describe("groups: a snapshot book", () => {
  it("copies the people the token names now, and keeps an unknown token so the passage stays hidden", () => {
    seed("swap");
    const g = L.chatGroups(mockHost().host.fs, "tav", { groupId: "g1" }, null);
    const st = L.loadChatFile(mockHost().host.fs, "tav");
    st.facts.push({ id: "f3", text: "Nobody knows this.", subject: "world", knownBy: ["group:made-up"], type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 });
    const by = Object.fromEntries(L.bookChunks(st, g).filter((c: any) => c.kind === "fact").map((c: any) => [c.ref, c.knownBy]));
    expect([...by.f1].sort()).toEqual(["aria", "bram"]);
    expect(by.f3).toEqual(["group:made-up"]);
    expect(L.bookChunks(st).find((c: any) => c.ref === "f1").knownBy).toEqual(["group:guild-of-ravens"]);
  });
});

describe("groups: the fact editor", () => {
  it("turns a typed \"group: Name\" into the token and keeps people as typed", () => {
    seed("swap");
    const { host } = mockHost();
    const r = L.handleRoute({ method: "POST", path: "/litopys/facts", body: { chatId: "tav", op: "add", text: "The ravens plan a heist.", knownBy: ["Group: Guild of Ravens", "group:guild-of-ravens", "Cora"] } }, host);
    expect(r.status).toBe(200);
    expect(r.json.facts.find((x: any) => x.text === "The ravens plan a heist.").knownBy).toEqual(["group:guild-of-ravens", "Cora"]);
  });
});
