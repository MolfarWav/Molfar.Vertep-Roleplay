import { describe, it, expect } from "bun:test";
import { ALL, NO_FILTER, filterChats, characterOptions, personaOptions, chatHasCharacter, isFiltering } from "../src/lib/chat-filters";

const characters = [
  { id: "ember", name: "Ember" },
  { id: "liege", name: "Liege" },
  { id: "unused", name: "Unused" },
  { id: "grp", name: "Party", isGroup: true, members: ["ember", "liege"] },
];
const personas = [{ id: "vlad", name: "Vlad" }, { id: "mira", name: "Mira" }, { id: "idle", name: "Idle" }];
const chats = [
  { id: "1", characterId: "ember", personaId: "vlad" },
  { id: "2", characterId: "liege", personaId: "vlad" },
  { id: "3", characterId: "ember", personaId: "mira" },
  { id: "4", characterId: "grp", personaId: "mira" },
  { id: "5", characterId: "liege", personaId: null },
];

describe("chat filters", () => {
  it("no filter returns the same list", () => {
    expect(filterChats(chats, characters, NO_FILTER)).toBe(chats);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });

  it("filters by persona", () => {
    expect(filterChats(chats, characters, { personaId: "vlad", characterId: ALL }).map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("filters by character, and a group chat matches any member", () => {
    expect(filterChats(chats, characters, { personaId: ALL, characterId: "ember" }).map((c) => c.id)).toEqual(["1", "3", "4"]);
    expect(chatHasCharacter(chats[3]!, characters, "liege")).toBe(true);
    expect(chatHasCharacter(chats[3]!, characters, "unused")).toBe(false);
  });

  it("combines both filters", () => {
    expect(filterChats(chats, characters, { personaId: "mira", characterId: "ember" }).map((c) => c.id)).toEqual(["3", "4"]);
  });

  it("offers only personas and single characters that have chats", () => {
    expect(personaOptions(chats, personas).map((p) => p.id)).toEqual(["vlad", "mira"]);
    expect(characterOptions(chats, characters).map((c) => c.id)).toEqual(["ember", "liege"]);
  });
});
