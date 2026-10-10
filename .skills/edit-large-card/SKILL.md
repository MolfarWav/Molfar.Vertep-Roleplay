---
name: edit-large-card
description: Use when reading or changing fields of a Roleplay character card or lorebook: one field, example dialogues, a new lorebook, linking a book to a character. Triggers: "поправ картку", "зміни опис персонажа", "додай запис у лорбук", "знайди в лорбуку", "edit card", "lorebook entry".
---

# Cards and lorebooks: the call order

Every step resends the whole conversation, so do not explore. Do not read the app's code, do not
run git, jq or python, do not list folders you do not need, never type a large JSON file out as
text. A typical task is: one json_get, at most two writes, a short report.

The fields and their meaning are in `apps/roleplay/docs/DATA-FORMATS.md`. Read it with one
`read_file` when the task touches a field you do not know; trust it over memory. For writing the
texts themselves load `card-craft` (characters) or `lorebook-craft` (worlds).

## Paths
- Card: `apps/roleplay/data/characters/<id>/card.json` (id = folder name; fields at the TOP level,
  not under `/data`).
- Lorebook: `apps/roleplay/data/lorebooks/<id>.json` (id = file name, repeated in `"id"`).
- Files starting with `_` are AI-only templates: copy, never edit.
- Never ask for or print `/avatar` or `/studio/avatar` (base64 images). Leave
  `/extensions/molfar_soul` to the Soul tab.
- `/extensions/molfar_translation` keeps the texts from before a translation
  (for "Restore original"): leave it alone. To translate a card, point the user
  to Translate in the character editor instead of rewriting fields one by one.
- `/studio/expressions` holds the emotion images (base64): never print it.

## The calls
1. Read: ONE `json_get` with every pointer you need, for example
   `pointers: ["/name", "/description", "/personality", "/scenario", "/first_mes", "/mes_example", "/studio/linkedLorebookIds"]`.
   A value too big comes back as its shape: ask again for the part you need. If a linked book
   matters, json_get its `/entries` in the same reply.
2. Write the new texts in your head, in the card's language.
3. A new lorebook: `write_file` a small book with `"entries": []` (`settings` copied from
   `_example.json`), then ONE `json_set` with `{ pointer: "/entries", op: "append", value: {...} }`
   per entry (`uid` 1, 2, 3…, `enabled: true` as a boolean). A change to one entry:
   `json_set` on `/entries/<index>/<field>`; never renumber `uid`. Ukrainian and Russian keys: one
   base form each, word forms match on their own (DATA-FORMATS, `keys`).
4. ONE `json_set` on the card with every field change, plus the link when a book is new:
   `{ pointer: "/studio/linkedLorebookIds", op: "append", value: "<book id>" }` (json_set creates a
   missing `studio`; the book's own `linkedCharacterIds` is display only).
5. Report what changed. json_set and write_file commit on their own and open chats pick the change
   up within a second: do not read the file back or check with git. A write_file refusal means the
   JSON text is broken: fix the text, never patch the file afterwards.
