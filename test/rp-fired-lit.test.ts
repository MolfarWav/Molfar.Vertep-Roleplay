/**
 * "What fired" for Litopys (#253): in how many replies each fact went into the prompt, a swipe that replaces the reply before it,
 * the route that joins the texts, and the file going with the chat.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const fact = (i: number, text: string) => ({ id: "f" + i, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", at: i, updatedAt: i });
const seed = () => {
  writeChat("tav", [U("m1", "Jude knocks."), U("m2", "Jude sits.")], { title: "T", userName: "Jude" });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.facts.push(fact(1, "The harbour is closed for the winter."), fact(2, "Old Tam keeps the ferry."));
  st.counters.fact = 2;
  writeJson("litopys/chats/tav.json", st);
};
const send = (op = "send") => L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }] }, turn: { op, chatId: "tav", speakerName: "" } }, mockHost().host);
const fired = () => L.handleRoute({ method: "GET", path: "/litopys/fired", query: { chatId: "tav" } }, mockHost().host);

describe("what fired: Litopys counters", () => {
  it("answers null before the first reply, then counts the facts that went in", () => {
    seed();
    expect(fired().json.log).toBeNull();
    send();
    send("next");
    const log = fired().json.log;
    expect(log.replies).toBe(2);
    expect(log.facts.map((f: any) => f.n)).toEqual([2, 2]);
    expect(log.facts[0].text.length).toBeGreaterThan(0);
    expect(log.facts[0].by).toBe("all");
  });

  it("a swipe replaces the reply before it, and a tool reply that is not a reply (impersonate) counts nothing", () => {
    seed();
    send();
    send("swipe");
    expect(fired().json.log.replies).toBe(1);
    expect(fired().json.log.facts.map((f: any) => f.n)).toEqual([1, 1]);
    send("impersonate");
    expect(fired().json.log.replies).toBe(1);
  });

  it("a fact deleted since is marked gone, and the file stays small", () => {
    seed();
    for (let i = 0; i < 10; i++) send();
    const st = readJson("litopys/chats/tav.json");
    st.facts = st.facts.filter((f: any) => f.id !== "f1");
    writeJson("litopys/chats/tav.json", st);
    const f1 = fired().json.log.facts.find((f: any) => f.id === "f1");
    expect(f1.gone).toBe(true);
    expect(JSON.stringify(readJson("litopys/fired/tav.json")).length).toBeLessThan(3000);
  });

  it("a bad chat id is a 404", () => {
    expect(L.handleRoute({ method: "GET", path: "/litopys/fired", query: { chatId: "../x" } }, mockHost().host).status).toBe(404);
  });
});
