# Entity registry: one id per person, thing and place

Status: design, phase A in work. Issue: MolfarWav/Molfar.Vertep#240 (with #212, #236). Owner's decisions 2026-11-04.

## Why

The features were built one by one and pass **words** to each other. Each store has its own ids or none:

| Feature | Persons | Things | Places |
|---|---|---|---|
| Dashboard (sensor, `plugins/relations`) | keyed by the name string: stats, notebook, events, edges; a card soul has `aliases` | worn and held items have ids (#236); scene objects are words | the scene place and "at" are free text |
| World DM (`plugins/world`) | NPC records `n3` with aliases; card characters are skipped by name; carry is keyed by name | records `n3`, but `holder` is a **name** | records `n3`, but `inside` is a **name** |
| Litopys (`plugins/litopys`) | `subject`, `knownBy` are names | inside fact text | inside fact text |
| Cards, groups, narrator voices | the card name, group members, `### Name` sections | | |
| Forge agents, the planned RPG app (#123) | would read Dashboard fields by name | | |

So one person becomes two ("Sina Rose" and "Sina" in a real chat, both rated from zero; "Fallen Queen Turned Public Use Slave", a card title, became a second Seraphina), a sword in the Dashboard and the same sword in the World DM are unrelated, and the World DM cannot say who holds a thing in a way the Dashboard understands. The owner's direction: ids decided by code wherever possible, words only for showing; the same ids later go to the RPG app and the Forge.

## Shape

One file per chat: `data/registry/<chatId>.json`.

```json
{
  "v": 1,
  "chatId": "cmw1...",
  "from": "cmvz...",
  "next": { "p": 6, "t": 1, "l": 1 },
  "entities": [
    { "id": "user", "kind": "person", "name": "Denis", "aliases": [], "src": "persona" },
    { "id": "p1", "kind": "person", "name": "Kaede Fuji", "aliases": [{ "text": "Kaede", "src": "card" }, { "text": "Каэде", "src": "seen" }], "src": "card", "card": "kaede-fuji" },
    { "id": "p4", "kind": "person", "name": "Sina", "aliases": [], "src": "seen", "merged": "p1" }
  ],
  "apart": [["p2", "p5"]],
  "suggest": [{ "a": "p5", "b": "p2", "why": "first name" }]
}
```

- `kind`: `person` now (phase A); `thing` and `place` in phase B. Ids: `p1`, `t1`, `l1`; the user's character is always `user`.
- `src`: where the entity came from: `persona`, `card`, `soul`, `group`, `seen` (the story), `world` (a World DM record, phase B), `user` (made by hand).
- `merged`: an entity merged into another; every lookup of it returns the target, so old references keep working.
- `apart`: pairs the user said are different people; never matched to each other again.
- `suggest`: pairs that might be one person; the Dashboard offers "Same as X? Merge / Different".
- A chat that continues another (the Dashboard's inheritance) starts from that chat's registry (`from`), so people stay the same. A registry shared by every chat of a world can come later.

## Finding the entity a word means

One function, `resolveName(registry, text, kind)`, kept as one block of code that `scripts/sync-registry.ts` copies into each plugin that needs it (plugins cannot import each other); a test fails when a copy differs, as `sync-agents-plugin` does for the agents block. Steps, the first hit wins:

1. an alias or name exactly (case-insensitive, spaces and punctuation folded);
2. the same after transliteration (Cyrillic, Ukrainian and Latin letters to one key: Каэде and Kaede, Рея and Rhea);
3. a single word that is the first or last word of exactly one person's name or alias ("Sina" for "Sina Rose"); titles do not count ("Queen", "Sir", "Lady", "Dr" ...);
3b. a text of two or more words (titles removed) whose words all sit, in order, inside exactly one person's name or alias ("Rhea Faeth" in "Queen of Elves Rhea Faeth"), or the reverse, a name of two or more words inside the text;
4. one letter off for names of 6 letters or more, when exactly one entity is that close;
5. nothing: the caller decides (a new person, or nothing for a thing that is only mentioned).

Two candidates at the same step is no match (the caller creates the entity and the pair goes to `suggest`). A pair in `apart` never matches. When a story spelling is found by steps 2-4 it is saved as an alias (`src: "seen"`), so the next lookup is exact.

## Where names come from (imported cards are not tidy)

Most imported cards do not state names precisely, so nothing here is required and nothing is trusted alone:

- the card name, and the part before a separator when it reads like a title: "Kyomi - Arranged Marriage" gives "Kyomi", "Vaela — Twilight Bloom" gives "Vaela". A card name that is a title or a narrator ("Campus Sluts", "The Apartment (Portal Six)", "Narrator: Sakura Academy Isekai") does **not** become a person by itself: a person is made only when the story or the sensor uses the name for one;
- `### Name` sections (a card of several characters gives a person per section; a heading may put a role before the name, "Queen of Elves Rhea Faeth": up to six words if it reads as a name, and the trailing name, the last two capitalized words or the last word, is an alias; a card with two or more such sections is never a person itself);
- lines like `Name:`, `Full name:`, `Also called:`, `Nickname(s):`, `Aliases:` (and their Ukrainian and Russian forms);
- a card soul's `aliases`, group members, narrator voices, the persona's name for `user`;
- an older registry made before the card reader read these headings is repaired on load (`regPrune`, `regReconcile`): a card entity the cards no longer produce goes when nothing refers to it (the Dashboard's `personIds` count), and a soul or story entity that now resolves to a card person is merged into it;
- the story itself: every name the sensor reports, resolved by the steps above, so the registry grows from use even when the card says nothing.

## Bridges

Phase A, persons:
- **Dashboard**: the sensor's names go through `resolveName` before a character is made (today `canonName`); the Characters block of the sensor input lists each person with their aliases; a new person with a weak candidate goes to `suggest`; merge and "different person" in the Dashboard's character list (stats, notebook, history, items of the merged one go to the target; its other spelling becomes an alias).
- **World DM**: "characters with their own cards" and a thing's holder are resolved through the registry, so the DM records neither a card character as an NPC nor a holder under a second spelling.
- **Litopys**: `subject` and `knownBy` are resolved when facts are written.

Phase B, things and places:
- registry kinds `thing` and `place`; Dashboard items and scene objects get a `ref` to the registry; World DM records become registry entities (their `n` id kept as `world`); `holder` and `inside` become ids; the scene place is an id when the World DM knows it.

Phase C, outside:
- the Forge reads and writes Dashboard fields by id; the RPG app contract carries ids with names for display (`{ v, entities: [{ id, kind, name }] }`), so "silver sword" handed to the RPG app comes back as the same `t3`.

## Dashboard UI for phase A (plan, before code)

Where: the Person tab of the Dashboard (`src/components/dashboard/dash-tabs.tsx` `PersonPanel`) and the side strip, on the character the user is looking at. The header of `AttitudeCard` (`src/components/dashboard/dash-cards.tsx`) already has "Remove from the Dashboard" (`UserMinus`) for "the same person is listed twice"; merge belongs next to it. Steps from a chat: click a portrait in the strip (or open the Dashboard), then the header button: two steps, each labelled.

1. **The header button becomes a small menu** (`src/components/ui/dropdown-menu.tsx`, trigger: icon button with `aria-label` "Manage {name}", 40 px on phones): "Same person as..." (a list of the other characters with portrait and name; picking one opens `src/components/ui/confirm.tsx` saying what moves: relationship, notes, history and things go to the chosen one, this name becomes another name of theirs) and "Remove from the Dashboard" (the existing action and dialog, destructive).
2. **A suggestion callout** at the top of `PersonPanel` when the registry suggests a pair with the focused character: soft background, border and icon in the people tone (as other callouts in the Dashboard), one line "{name} may be the same person as {other}" with the reason ("same first name", "same name in another alphabet", "one letter apart"), and two buttons: "Merge into {other}" (tonal primary) and "Different people" (outline). On phones the buttons stack full width, 40 px. The "Since your last reply" row gets a chip for it, so the user sees it without opening the person.
3. **States:** none (nothing shown), suggestion, working (buttons disabled, spinner on the pressed one), done (toast "Merged into {other}" / "Kept apart"; the merged portrait disappears, the target's numbers show the merged history), error (toast with the reason; nothing changed). A merge is confirmed first; there is no undo in phase A (the dialog says so). "Different people" needs no confirmation (it only stops the suggestion).
4. Strings in English and Ukrainian (`src/lib/i18n.ts`); guide page `.skills/guide/pages/dashboard.md` updated.

Variants considered: (a) menu in the header plus the callout (chosen: the action sits on the thing it changes, and the suggestion comes to the user); (b) a "Cast" section in Dashboard settings with all characters (one place for everything, but far from where a duplicate is noticed); (c) dragging one portrait onto another (quick with a mouse, invisible and awkward on phones).

## Phase B in detail: things and places

**Things.** One id per thing, wherever it is: on someone, in someone's hands, lying in the scene, or recorded by the World DM.
- Registry kind `thing`, ids `t1, t2 ...`. The Dashboard's worn and held items (today `i1, i2` per character) and the scene's objects (today plain words) both carry the registry id as their `id`; an old snapshot's items and objects get registered when read.
- The sensor sees every thing with its id: `Wearing: t3 white top; t4 pleated skirt`, `Holding: t7 axe`, `Objects here: t9 sneakers (at the entrance)`. It reports `see` / `off` for worn and held things as today, and objects as `{ add: [{ text, where }], move: [{ id, where }], remove: [id] }`. Putting a thing down is `off` with `where`: the same id moves to the objects. Picking one up or putting it on is `see` with the object's id: the same id leaves the objects. Handing a thing to someone is `off` on one and `see` with the id on the other. A thing is in one place only: code removes it from wherever it was when it shows up elsewhere, so a thing cannot be held and lying around at once, and nothing is "set down" unless the sensor said where.
- Words are a fallback only, as now: a report without an id is matched to a listed thing by the registry's resolver within the scene (the character's items, then the objects), and a new thing gets a new id.
- The World DM's thing records (`n3`) are linked to the registry the same way as its persons (`regIds`), so a sword the World DM recorded and the sword in Kaede's hands are one `t5`; `holder` is a person's display name resolved through the registry (phase A) and, when the thing is linked, the World DM can say who holds it from the Dashboard's items.

**Places.** Registry kind `place`, ids `l1, l2 ...`. The scene place the sensor reports (`clock.place`) is resolved to a place id and kept beside the text (`clock.placeId`); the World DM's place records are linked to the same ids, and "is this the same place" (today `samePlace`, a comparison of words) compares ids first. A spot inside a place ("by the window") stays text in phase B.

**Order and measures.** B1 the Dashboard (ids for items and objects, the sensor protocol for objects, migration), B2 the World DM (thing and place records linked, holder and place by registry, `hereOf` by ids). The replay corpus counts duplicates and phantom objects as now and gets one more check: the same thing keeps one id across hands and the floor (the Kaede sneakers: worn, taken off at the entrance, still `t#` there).

## Measured, not guessed

`scripts/sensor-replay.ts` with the local corpus gets cases with name variants (Kaede and Каэде, Sina and Sina Rose, a card title as a speaker) and a count of duplicate persons; the two chats with real duplicates are replayed before and after.

## Related

#212 (clothes and objects: duplicates, a removal that never lands, a Russian chat), #185 (outfit as changes), #236 (the sensor reads whole replies, the item ledger), #123 (RPG app: action checks and ids), #184 (memory and who knows what).
