---
name: edit-large-card
description: Use when reading or changing fields of a Roleplay character card or lorebook: one field, example dialogues, a new lorebook, linking a book to a character, a new avatar, background or gallery picture. Triggers: "поправ картку", "зміни опис персонажа", "додай запис у лорбук", "знайди в лорбуку", "зроби аватар", "намалюй фон", "edit card", "lorebook entry", "make an avatar".
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
- Group: `apps/roleplay/data/groups/<id>.json` (not a card: members, shared scenario,
  openings, per-member settings, the group's own books; fields in DATA-FORMATS, "Groups").
- Files starting with `_` are AI-only templates: copy, never edit.
- A book with `ownerChatId` (`world-<chatId>.json`) is one chat's world book, kept by the World DM:
  never link it to a card or remove that field. Its records live in `data/world/state/<chatId>.json`
  (DATA-FORMATS, "World DM"); entries with a `world:` memo are rewritten from there on the next run.
- Never ask for or print `/avatar` or `/studio/avatar` (base64 images). Leave
  `/extensions/molfar_soul` to the Soul tab.
- `/extensions/molfar_translation` keeps the texts from before a translation
  (for "Restore original"): leave it alone. To translate a card, point the user
  to Translate in the character editor instead of rewriting fields one by one.
- `/studio/expressions` holds the emotion images (base64): never print it.
- A card with `/extensions/molfar_profile` (the Profile tab) has `description` and
  `personality` WRITTEN from that profile: change the profile's fields (DATA-FORMATS,
  "The profile"), not the two texts, or the next edit in the Profile tab overwrites yours.
  With the field changes, set `/extensions/molfar_profile/compiled` to `null`: the app then
  rewrites the two texts from the profile on its next load. When the profile has `"free": true`,
  edit the texts as usual. A section switched off
  in `sections` (`"trauma": false`) keeps its fields but writes nothing into the text.
- A narrator card may describe several characters in one profile: the profile's own fields are
  the first character, `/extensions/molfar_profile/cast` is a list of the others (same keys).
  To change or add a second character, edit `/extensions/molfar_profile/cast/<n>/...` or append
  to `cast`; the texts get a `### Name` part per character. Shared world text stays in the
  profile's `notes`.
- A card exported with "Mark the profile sections" (the default) carries a heading before each part of
  `description` and `personality` (`## Identity`, `## Appearance`, `## Personality`, `## Behaviors`, ...; a cast
  uses `####` inside its `### Name` parts). The app takes them out again when such a file is imported. In a
  card that is already installed the two texts have no headings: never add them by hand, and do not move
  text between them.
- The model a card's tasks (Structure it, Fill empty, the Soul rating) run on is not in `card.json`: it is in
  `characters/<id>/card-tasks.json` (`model`, `maxInput`, `maxOutput`), written by the editor's Save changes.
  Leave that file alone.
- The editor keeps a change as a draft until the user presses Save changes: a card you edit on disk while
  it is open in the editor can meet a draft, and the user then chooses which version to keep.

## The calls
1. Read: ONE `json_get` with every pointer you need, for example
   `pointers: ["/name", "/description", "/personality", "/scenario", "/first_mes", "/mes_example", "/studio/linkedLorebookIds", "/extensions/molfar_profile"]`.
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

## Pictures: avatar, background, gallery
1. Write the prompt from the card: ONE `json_get` of `/name`, `/description` (and
   `/extensions/molfar_profile/appearance` when there is a profile). Describe the look in English,
   no names. An avatar is a portrait: face and shoulders, plain or soft background.
2. `image_generate` with `list: true` first: the user's image models with what each is for.
   Take the one whose "for" fits (backgrounds, characters…) and pass its ref as `model`; with no
   fitting one, leave `model` out. A model marked "write tags" (ComfyUI, Forge) wants comma-separated Danbooru tags
   (`1girl, solo, silver hair, ...`) instead of sentences; a "prompt guidance" line under a model is
   the user's own rule for that server, follow it. Paid models ask the user on their own;
   a skip is final for this task.
3. Put the returned `/v1/assets/<id>` URL where it belongs, in ONE write:
   - Avatar: `json_set` on the card, `/avatar` and `/studio/avatar` both set to the URL. This
     replaces the old portrait; to keep it, append the URL to `/studio/altAvatars` instead.
   - Gallery: `{ pointer: "/studio/gallery", op: "append", value: { "id": "gal_<8 letters>", "url": "<url>", "type": "image", "caption": "<a few words>" } }`.
   - Background: `json_set` on `apps/roleplay/data/library.json`, `{ pointer: "/backgrounds", op: "append", value: { "id": "bg_<8 letters>", "name": "<name>", "url": "<url>", "type": "image", "folderId": null, "fitting": "cover" } }`;
     the user picks it in the chat's background menu.
4. Report with the URL as a Markdown image (`![Jude](/v1/assets/<id>)`) so the user sees it.
