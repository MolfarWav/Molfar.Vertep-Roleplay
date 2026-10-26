# Data formats: characters, lorebooks, presets

The files under `data/` as the app writes and reads them. Agents (Molfar) and people editing files by
hand work from this page; the card, lorebook and preset skills in `.skills/` point here instead of
copying it. `test/rp-data-formats.test.ts` fails when the code writes a field this page does not name:
**a change to these formats updates this page in the same commit.**

Change files with the agent's `json_get` / `json_set` tools: one field at a time, the format kept,
committed. Never type a large JSON file out as text. Files whose name starts with `_` (for example
`data/lorebooks/_example.json`) are AI-only templates: copy one to make a real entity, never edit it.
Open pages pick up a changed file within about a second.

`data/.cache/` holds files the app rebuilds on its own (the character index the app starts from:
`.cache/characters-index/<n>.json`). It stays on this device: no git, backup or sync. Never edit
it; deleting it is safe and only makes the next start slower. A card changed by hand or by Molfar
shows in the list on the next start or refresh: the index re-reads any card whose size or change
time moved.

## Characters: `data/characters/<id>/card.json`

The folder name is the character id. The card is Character Card V2 written FLAT: the fields sit at
the top level, not under `data`.

### Card fields
| Field | What it is |
|---|---|
| `spec` | Always `"chara_card_v2"`. |
| `name` | Display name; `{{char}}` in prompts. |
| `description` | Who the character is: appearance, background, the world around them. |
| `personality` | How they think, feel and behave. |
| `scenario` | Where and how the story starts; the situation, not the backstory. |
| `first_mes` | The opening message of a new chat. |
| `alternate_greetings` | More opening messages (array of strings); a chat can start from any. |
| `group_only_greetings` | Openings used only in group chats (array of strings). |
| `mes_example` | Example dialogue: blocks that start with `<START>`, turns as `{{user}}: …` and `{{char}}: …`. |
| `system_prompt` | Replaces the preset's main prompt for this character (leave empty to keep the preset's). |
| `post_history_instructions` | Sent after the chat history, as the last instruction. |
| `creator_notes` | Notes for people; never sent to the model. |
| `creator` | Author name. |
| `character_version` | Version string of the card. |
| `tags` | Array of strings. |
| `avatar` | The portrait as a base64 data URL or a stored media URL. Tens of KB: never print or send it. |
| `extensions` | Free object for other tools. Known keys: `molfar_card_type` (`narrator`, `single`, `group`, `assistant`, `other`), `molfar_soul` (the dashboard's Soul tab, `docs/SOUL.md`: leave it to that tab). `molfar_profile` (the editor's Profile tab, below). `molfar_translation` (written by Translate: `{ target, provider, at, original: { <field>: <text before the translation> } }`, used by "Restore original"; leave it alone). `talkativeness` (0..1, how readily the character speaks up in a group; missing or SillyTavern's usual 0.5 means unset, and groups then guess it from `description` + `personality`). Imported cards carry others (`world`, `fav`, `chub`…): keep them. |
| `studio` | The app's own bag, below. |

Unknown top-level fields from an imported card are kept as they are and written back.

### The `studio` bag
An imported card may have no `studio` yet; json_set creates it when you set a key inside.
| Key | What it is |
|---|---|
| `avatar` | Same image as `avatar` above. Never print it. |
| `altAvatars` | Other portraits (URLs or data URLs). |
| `linkedLorebookIds` | Lorebook ids this character uses (array). **This is how a book is linked to a character.** |
| `embeddedLorebookId` | The book that came inside an imported card, or `null`. Also in scope. |
| `depthPrompt` | `{ text, depth, role }`: a note inserted `depth` messages from the end of the chat. |
| `descVariants`, `personalityVariants`, `scenarioVariants` | Alternate texts for the field: `[{ id, label, content }]`; a chat picks one in its own settings. |
| `versions` | Saved snapshots: `[{ id, label, savedAt, snapshot }]`. |
| `stats` | Tracked bars: `[{ id, name, initial, max, color }]`. |
| `colors` | `{ name, dialogue, bubble }` CSS colors for this character's messages. |
| `voices` | `[{ name, color }]`: whom a Narrator-type card (`molfar_card_type` `narrator`) speaks as. In a chat each voice's quoted speech takes its `color` (empty = the app's palette by position). The speaker is the name that leads a paragraph before a colon (`**Aria:** "..."`), else the first name in the line outside quotes; a line naming nobody keeps the previous speaker. Dialogue after a dash (`— text`, with the author's words between two dashes) is tinted like quoted speech, and a name is also found in the other script (`Ember` = `Эмбер`). Absent or empty: one dialogue colour as before. Display only: it never reaches the prompt. Code: `src/lib/dialogue-voices.ts` (`cardVoices`, `leadVoiceIn`). |
| `expressions`, `defaultExpression` | Sprite images per emotion: `[{ name, url }]` (`url` is a data URL inside card.json; imports downscale them so the file stays under the 4 MB a plugin may write), and the one shown by default. |
| `gallery` | `[{ id, url, type: "image" \| "video", caption }]`. `url` is `/v1/assets/<id>` (the engine's asset store; images added since Roleplay 4.43.0 and generated pictures) or a data URL (older items; they move to the asset store on the next gallery add). |
| `voiceProvider`, `voiceId` | Text-to-speech voice. |
| `characterRegexIds` | Regex scripts that apply only to this character. |
| `css` | Custom CSS for this character's chat. |
| `favorite`, `folderId`, `createdAt`, `lastChatAt` | Library state: leave them alone. |

### The profile: `extensions.molfar_profile`
The editor's Profile tab: the card split into fields, modeled on Lorebary's character editor. It is
the editing form only. Every save COMPILES it into `description` and `personality`, which stay what
the prompt, presets and every export use; other clients see plain text. Empty fields never reach the
text. Every key is optional; unknown keys are kept. Code: `src/lib/profile.ts`.

    { "v": 1,
      "identity":   { "first": "", "family": "", "title": "", "occupation": "", "nicknames": [], "age": "", "birthday": "", "gender": "", "pronouns": "", "comment": "" },
      "appearance": { "face": "", "eyes": "", "hair": "", "body": "", "height": "", "weight": "", "measurements": "", "skin": "", "marks": "", "attire": "", "voice": "", "scent": "", "other": "" },
      "lists":      { "strengths": [], "flaws": [], "traits": [], "values": [], "fears": [], "wishes": [], "secrets": [], "petPeeves": [], "guiltyPleasures": [], "coreBeliefs": [] },
      "behaviors":  { "speech": "", "quirks": "", "habits": "", "motivations": "", "social": "", "underStress": "", "bodyLanguage": "", "hobbies": "" },
      "goals":      { "life": "", "shortTerm": "", "career": "", "growth": "", "relationships": "", "unfinished": "" },
      "background": { "birthplace": "", "nationality": "", "ethnicity": "", "culture": "", "socialClass": "", "location": "", "living": "", "neighborhood": "", "summary": "",
                      "affiliations": [], "circle": "", "politics": "", "religion": "" },
      "trauma":     { "experiences": [], "triggers": [], "coping": "" },
      "relationships": [ { "name": "", "relation": "", "notes": "" } ],
      "sexuality":  { "enabled": false, "orientation": "", "romantic": "", "relationshipStyle": "", "libido": "", "position": "", "experience": "",
                      "turnOns": [], "turnOffs": [], "kinks": [], "boundaries": "", "notes": "" },
      "sections":   { "appearance": true, "personality": true, "behaviors": true, "goals": true, "background": true, "circles": false, "trauma": false, "relationships": true, "sexuality": false },
      "notes":      { "description": "", "personality": "" },
      "free": false,
      "compiled":   { "at": 0, "hash": "" },
      "cast":       [ { "identity": { "first": "" }, "appearance": {}, "lists": {}, "behaviors": {}, "goals": {}, "background": {}, "trauma": {},
                        "relationships": [], "sexuality": {}, "sections": {}, "notes": { "description": "", "personality": "" } } ] }
| Key | What it is |
|---|---|
| `identity`, `appearance`, `background`, `relationships`, `notes.description` | Compiled into `description` as labeled lines (`Eyes: grey`), in this order: identity, appearance, origin and backstory, circles (`affiliations`, `circle`, `politics`, `religion`), relationships, notes. `identity.comment` is private: never compiled. `measurements` is bust-waist-hips. |
| `lists`, `behaviors`, `goals`, `trauma`, `sexuality`, `notes.personality` | Compiled into `personality`. Lists are joined with commas. |
| `sections` | Section switches. An off section keeps its fields and writes nothing. Keys: `appearance`, `personality` (the `lists`), `behaviors`, `goals`, `background` (origin and backstory), `circles`, `trauma`, `relationships`, `sexuality`. A missing key: `sexuality` follows the old `sexuality.enabled` (off by default, adult characters only), `trauma` and `circles` are on once one of their fields is filled, the rest are on. |
| `notes` | Text that fits no field; it follows the fields. Starting a profile moves the card's old text here, so nothing changes until fields are filled. |
| `free` | Free write: the profile is kept but no longer writes the card. |
| `cast` | More characters on the same card (a narrator card that describes several people). Each member has the same keys as the profile itself, except `free`, `compiled`, `v` and `cast`. The profile's own fields are the first character. With a member that writes something, both texts are written in parts: `### <name>` and that character's lines, the first character first, then each member in order. The profile's own `notes` come after all parts as shared text; a member's `notes` stay inside its part. The name is `title first family`, else the first nickname, else `Character <n>`. A member that writes nothing is skipped; with no such member, the text is the same as without `cast`. Structure it on a card that describes several named characters files the first as the profile and the rest as `cast` (the draft in `profile-drafts/<id>.json` has `cast`); it is offered while every member is still blank. Fill empty works on any character: a member is found in the text by the name in its Identity (the draft carries `member`, its place in `cast`, 1 = the first); Read from picture fills the first character only. |
| `compiled` | When the profile last wrote the card and an FNV-1a hash of `description` + `personality` as written. A different hash means the text was edited by hand; the tab then offers to keep the additions, rewrite, or switch to Free write. |

**Section headings in exports.** The live `description` and `personality` are the plain compiled text above.
When a card is exported (PNG, CHARX, JSON) with "Mark the profile sections" on (the default, kept per browser),
the exported text gets a heading before each section's lines, so another client shows where a line comes from:
`description`: `## Identity`, `## Appearance`, `## Background`, `## Circles`, `## Relationships`, `## Notes`;
`personality`: `## Personality`, `## Behaviors`, `## Goals`, `## Trauma`, `## Sexuality`, `## Notes`. A section that writes
nothing has no heading. With a `cast`, each `### <name>` part keeps its place and has `####` headings inside, and the
shared notes come last under `## Notes`. The exported card still carries `extensions.molfar_profile`. A card with
Free write, or whose text was edited by hand after the profile wrote it, is exported as it is. Taking the heading
lines out gives exactly the plain text. On load, a card whose text carries these headings loses them: with the
profile on the card when the text without them is what the profile wrote (the hash in `compiled`); without the
profile, when the lines read back into a profile that compiles to exactly the same text (a line no field owns, text
before the first heading or a cast stops it, and the card is left as it came). Code: `compileProfileMarked`,
`adoptMarkedSections` in `src/lib/profile.ts`.

**The model for a card's tasks.** Not part of the card: `characters/<id>/card-tasks.json`
(`{ "model": "<ref>", "maxInput": <tokens>, "maxOutput": <tokens> }`, every key optional; the file is absent when
the card has no choice of its own). It is read and written by the profile plugin (`GET/PUT /profile/card-tasks`)
and saved by the editor's Save changes. Structure it, Fill empty and the Soul rating run on: the model in the
request (an unsaved pick) -> the card's `model` -> the app-wide `ui.cardTasks.model` in `settings.json` (Settings,
Card tasks) -> the Dashboard's `sensorModel` -> the app's default `model`. The editor sends the model's real limits
with a request (`limits: { inputChars, outputTokens }`); a card longer than `inputChars` is read in parts
(`/profile/structure` with `part`, answers `{ part, parts, done }`) and the parts' proposals are merged into one draft.

**The card's long memory.** Not part of the card either: `characters/<id>/memory.json`, written by the Litopys
plugin (`GET/PUT/DELETE /litopys/card-memory`, `POST /litopys/card-memory/preview` and `/import`) and edited in the
card's Memory tab; it is never in `card.json` or in an export. Shape: `{ "v": 1, "next": <n>, "sources": [ { "id":
"s1", "chatId", "title", "importedAt", "on": true, "canon": "main"|"separate", "arc": "<a short summary>", "facts":
[{ "text", "subject" }], "notes": [{ "who", "how", "text" }], "said": [{ "who", "text", "kind" }] } ], "inject": {
"enabled": true, "maxTokens": 400 } }`. A source is a snapshot taken when a chat is imported (the arc, the
strongest facts, the character's own live notes and said lines of that chat); it keeps `chatId` and a copy of the
`title` and never reads the chat again, so deleting the chat changes nothing. Keys the app does not know are kept
when it saves the file. The `arc` of a source is the text built from the chat's arcs and chapters, or, when the import
dialog sent `arcText`, the text the user settled on there (up to 1500 characters): the dialog can ask the model for a
summary of the whole chat (`POST /litopys/story-summary { chatId, op: "start"|"cancel" }`, a job on the chat's
record in `litopys/chats/<chatId>.json`: `storySummary: { state: "working"|"done"|"failed", at, sig, text?, model?,
error? }`; `sig` is the record it was written from, so the preview says `stale` once a chapter changed; its prompt is
`summary` in the Litopys config). Nothing reaches the card but what the user ticks. In a reply the Litopys plugin builds one part, "Litopys · character memory" (own Prompt
board switch `plugin:cardmemory`), after the backstory and before the story so far: for the card of a chat (in a
group, the speaker's card), skipping a source whose `chatId` is the chat itself or a chat of its backstory chain,
a source that is off, and a `separate` canon unless the chat's meta `memory.sources[<id>]` is `true`; a line is left
out when the chat's Litopys record or its chain's (active facts), the story so far, the notes and said lines the chat carried
in at its start, the card's own text or an earlier source already say it (Dice similarity 0.85, or contained); the
Dashboard's live notes are not compared, so the text above the history stays the same from reply to reply and the
provider's prompt cache holds. Budget `inject.maxTokens` (100 to 1500, default 400).

**The card's habits** (#106; called skills until Roleplay 4.67.0, and files with the old keys `skills`, `nextSkill`,
`inject.skillsMaxTokens` are still read and are written back with the new ones) are in the same file, key `habits`: short rule blocks for how the character acts (not
abilities): `{ "id": "k1", "name": "<up to 80 characters>", "rule": "<1 to 6 lines, one per \n>", "when": "<optional,
one line>", "on": true, "origin": "user"|"molfar"|"story", "state": "accepted"|"proposed", "from": { "chatId",
"title", "at" } }` (`from` only when a story or a chat gave it; the title is a copy, the chat may be gone). At most 30;
the counter `nextHabit` keeps ids from being reused; `inject.habitsMaxTokens` (50 to 800, default 250) is their room.
A `proposed` habit (written by Molfar or proposed from a story) waits in the Memory tab for the user's yes and is
never injected before it; an accepted habit that is `on` is. Routes: `PUT /litopys/card-memory` with `habit: {
name, rule, when? }` (add), `{ id, name?, rule?, when?, on?, state?: "accepted" }` (change or confirm) and
`DELETE ...?cardId=&habitId=`. In a reply the Litopys plugin builds one more part, "Litopys · character habits"
(own Prompt board switch `plugin:cardhabits`), right after the character memory: the card's habits that are on and
accepted, in the order of the file, until the room is spent; a habit whose every sentence the card's own text or a
line already in the prompt says is left out, and a memory fact that only repeats a habit's rule is left out of the
memory part. The text depends only on the file and the card, so it does not move between replies. A habit needs
no imported story and no Litopys record.

**Habits earned in a chat.** Litopys also watches for them: when it writes a scene's chapter it may report a habit a
character clearly showed (most scenes give none). They are kept in the chat's own record,
`litopys/chats/<chatId>.json`, key `habits` (counter `counters.habit`): `{ "id": "k1", "who": "<character>", "name",
"rule", "when", "status": "proposed"|"active"|"rejected", "on": true, "seen": <chapters>, "chapters": ["c1", ...],
"evidence": [{ "text", "chapter" }] (the last three), "origin": "chapter", "earnedAt", "kept": { "cardId", "at" } }`.
A first sighting is a `proposed` candidate; seen in `habitsEarnAfter` different chapters (Litopys setting, default 2,
1 to 5; `habits: false` stops the watching) it becomes `active` and then acts in this chat at once, in the same
"Litopys · character habits" part (after the card's own habits; one the card already keeps is not said twice). The
user can accept it early, switch it off, edit it, reject it (a tombstone: it does not come back) or keep it on the
card (`POST /litopys/habits { chatId, id, op: "on"|"accept"|"reject"|"edit"|"keep" }`), which copies it into
`characters/<id>/memory.json` as an accepted habit with `origin: "story"` and `from`. A candidate never acts. The
activity log notes "habit.seen" and "habit.earn". Not for the user's character, not for what the card says; at most
two new candidates a chapter and twelve live ones a chat.

**Scenes set apart by hand.** `litopys/chats/<chatId>.json`, key `marks`: `[{ "id": "s1", "from": "<message id>", "to": "<message id>", "at": <ms> }]`.
A marked run of messages is always a scene of its own: the sensor's boundaries inside it are dropped, `scene.minMessages`
does not fold it into the scene before, it counts as closed even at the end of the chat, its chapter carries
`marked: true` and the chapter worker is told it is a turning point. `POST /litopys/scenes { chatId, op: "mark", from, to }`
or `{ chatId, op: "unmark", id }`; chapters over the same messages (not ones the user edited: those refuse the call) are marked
stale and rewritten for the new layout. Overlapping marks and marks whose messages are gone are ignored.

**Litopys config: `litopys/config.json`.** Only the keys the user changed need to be there; the plugin fills the rest
(`GET/PUT /litopys/config`). The ones that decide what the memory does:
- `budget` (200 to 16000, default 800): the most tokens the story record may take in a reply. When every known fact and
  every chapter before the cut (a fresh arc in place of its chapters) fit, all of it is sent with no ranking (the
  chapters in story order above the history, the facts below it: the sidecar `litopys/insert/<chatId>.json` has
  `full: true`, and the Prompt board part says "full record"). When it does not fit, chapters and arcs are held at
  least 40% of what is left after the pinned facts, the facts of those present and the chapter just before the cut,
  and what one kind leaves unused goes to the other; at most 60 ranked chapters. An item goes in whole or not at all.
- `arcMode` (`ask`, `auto`, `off`): `auto` merges older chapters into an arc by itself (it only adds the arc over its
  chapters; nothing is deleted), `ask` offers the merge in the Library. A new install is `auto`. The first time the
  config is read, an install that already has Litopys data (a config file, chat records or the 1.x store) is written
  down as keeping its choice (`ask` when it never made one) with `arcNotice: "pending"`: the Library offers the switch
  once, and either answer, or any choice of `arcMode`, sets `arcNotice` to `done`.
- `proposals` (`ask`, default, or `quiet`): in `quiet` a `pin` or a `rewrite` proposed by the chapter worker or by
  Consolidate is applied at once. The proposal stays in the chat's `proposals` as `status: "accepted", auto: true`
  with an `undo` note, and the chat's Activity gets a `proposal.auto` row; `POST /litopys/proposals { chatId, id, op: "undo" }`
  takes it back (the proposal becomes `rejected` with `undone: true`, a `proposal.undo` row is written) and refuses
  with 409 `changed since` when the fact was changed after it. Never a `retire` or a `merge`; a rewrite of a fact the
  user wrote, edited or pinned, and a pin past the pin limit, stay pending. (The Dashboard's own proposals are another plugin and
  are not touched.)
- `autoConsolidate` (`true`, `false`, or `null` = on only while `proposals` is `quiet`): starts Consolidate facts by
  itself when the chat's active facts grew by 30 or more since the last run (`consolidateAt: { active, at }` on the
  chat record, set by every run) and none is running and none of its proposals waits. Its proposals follow `proposals`.

To change a profiled card's text, change the profile fields and leave `description` / `personality`
alone (the next save in the app would rewrite them), or set `free: true` first. A profile written
outside the tab (Molfar, a hand edit) leaves `compiled` out (or sets it to `null`): the next time the
app loads, it writes `description` and `personality` from the profile and keeps the old text as a
version. A profile that would write nothing is left alone.
"Structure it" (button in the tab) asks the model to split the card's text into fields and files a
proposal in `data/profile-drafts/<id>.json` (`kind: "structure"`); accepting it replaces the profile's
sections, puts the text that fit no field in `notes`, and saves the old text as a version.
"Fill empty" asks the model for the empty fields of the switched-on sections (or one section) and files
`kind: "fill"`; accepting it writes only fields that are still empty, never relationships, and saves the
old text as a version. The portrait goes along to the engine's Vision model (Settings) unless the request names a model; "Read from picture" (`replace: true`) rewrites filled appearance fields.

## Personas: `data/personas/<id>.json`

The user's side of a chat. `name` is `{{user}}`; `description` is what the prompt's persona part
carries; also `title`, `pronouns`, `avatar`, `lorebookIds` (books bound to the persona), `binding`,
`boundCharacterIds`, `autoLock`, `folderId`, `createdAt`. `profile` (optional) is the same shape as a
card's `molfar_profile`, written by the Personas page's five questions, its Profile section, Structure it
and Fill empty (drafts in `data/profile-drafts/persona-<id>.json`): `description` is then compiled from all
of it as one text (`identity.comment` holds the private "what I want from stories" note and is never
compiled; both notes texts go into `notes.description`). Text added by hand after the compiled lines is kept on the next save; an edit inside
them is replaced after the app asks.

## Groups: `data/groups/<id>.json`

A group is not a card: it names its members (cards stay where they are) and how they share a chat. A group
chat's meta has `groupId` and no `characterId`. Deleting a group deletes its chats; its members stay.
Edit groups in the app's group editor (Characters, Groups); every field below is optional except the first two.

| Field | What it is |
|---|---|
| `name`, `memberIds` | The group's name; member card ids in speaking order. |
| `mode` | Who answers: `natural` (whoever the user names, else one pick by talkativeness), `list` (everyone in order), `manual` (only a triggered member). |
| `mutedIds` | Members that get no turns; their card and books stay out of the prompt and they bring no opening. |
| `generationMode` | `narrator` (one reply voices every unmuted member, stored with the group's id as `charId`; new groups start here), `swap` (the speaker's card only; the default when the field is absent) or `append` (every unmuted member's card). |
| `colorDialogue` | Colour each member's dialogue in this group's chats (default on): `memberSettings.<id>.color`, else the card's dialogue colour, else a palette colour by position. |
| `allowSelfResponses`, `autoMode`, `autoDelaySec` | The same member may answer twice in a row; the group keeps talking on its own every N seconds. |
| `favorite`, `avatar`, `tags`, `note` | Library fields; `avatar` empty = the members' portraits; `note` is never sent to the model. |
| `scenario` | Shared scenario: replaces every member's own scenario in this group's chats. |
| `openings` | Narrated lines a new chat opens with (the first shows, the others are swipes). |
| `memberSettings` | `{ <memberId>: { talkativeness?, opening?, color? } }`: talkativeness 0..1 wins over the card's; `opening` is `"group"` (default: the card's group-only greetings), `"none"`, or a number (that greeting of the card: 0 = first message, then the alternates); `color` is the member's dialogue colour here. |
| `embeddedLorebookId`, `linkedLorebookIds` | The group's own books, scanned in every chat of the group. |
| `memberBooks` | Members' books in this group: `all` (default), `speaker` (only the current speaker's), `off`. Global and persona books always stay. |
| `openingMessage` | Older field: a system line at the start of a new chat. |

`mode`, `generationMode`, `mutedIds`, `allowSelfResponses`, `autoMode`, `autoDelaySec` and the order of `memberIds`
are the defaults for the group's chats. A chat can override any of them in its meta, `chats/<id>.meta.json`:
`turns: { generationMode?, mode?, allowSelfResponses?, autoMode?, autoDelaySec?, mutedIds?, order? }`. A key set
there wins for that chat only; a missing key follows the group, so a change to the group reaches every chat that
did not change that key. `order` lists member ids in this chat's speaking order (members it does not name go
last). Set with `PATCH /chats/<id>` `{ turns }` (the whole object; `null` = follow the group again) or at creation,
`POST /chats` `{ groupId, turns }`. A narrator always answers, whatever `mode` says.

### Per-chat prompt switches
A chat's meta can have a `promptBoard` object, `{ v: 1, off?: string[], history? }`, listing prompt parts this
chat leaves out. Absent = everything on (today's behaviour). Keys in `off` are `section:<id>` (a preset section),
`book:<lorebookId>`, `databank`, `authorNote`, `plugin:litopys`, `plugin:relations`. `section:chatHistory` is
never allowed. `history` filters the chat history sent with every request, `{ lastN, only, thinking }`
(defaults `{ lastN: 0, only: "all", thinking: true }`, stored only when it differs): `only` keeps the
player's (`user`) or the character's (`char`) messages, `lastN > 0` keeps the last N of those, and
`thinking: false` strips `<think>`/`<thinking>` blocks (and the preset's reasoning tags) from the text;
it applies after the Litopys cut and before the context-budget trim. Forks inherit `promptBoard` (`fork`
copies the whole meta). Plugins honour their own key. Set with `PATCH /chats/<id>` `{ promptBoard }`
(`null` = back to everything on). The prompt preview (`POST /prompt/preview`) returns `sources.board`,
the ordered list of switchable things (`{ key, label, kind, state }`, state `on`, `off`, `preset-off`,
`condition`, `not-this-generation` or `empty`), and every part and omitted row carries the `key` it
belongs to.

## Lorebooks: `data/lorebooks/<id>.json`

The id is the file name without `.json`, repeated in `"id"`. A chat uses: every book with
`globalActive: true`, the character's `studio.embeddedLorebookId`, every id in the character's
`studio.linkedLorebookIds` (in a group chat: every member's, filtered by the group's `memberBooks`, plus the
group's own books), the books bound to the active persona, and the chat's own world book (the chat meta's
`worldBookId`, below).
Links live on the card (or the group) only; the book's old `linkedCharacterIds` field is not read.

### Book fields
| Field | What it is |
|---|---|
| `id`, `name` | Id (= file name) and display name. |
| `globalActive` | `true`: in every chat. |
| `linkedCharacterIds` | Old field, not read (see above). |
| `entries` | The entries, below. |
| `settings` | Scan settings: `scanDepth` (messages scanned for keys), `contextPercent` and `budgetCap` (how much room entries may take), `minActivations` (fewer entries fired: scan deeper into the chat until this many fire), `minActivationsDepthMax` (how deep that may go, 0 = the whole chat), `maxRecursion`, `insertionStrategy` (`character_first`: entries of the character's books come first and claim the budget first; `global_first`: global books first; `evenly`: by `order` only), `caseSensitive`, `wholeWords`, `groupScoring`, `recursiveScan`, `includeNames` (the scan reads "Name: text", so a name can be a key), `overflowAlert`, `wordForms` (Cyrillic keys match every form of their words; absent = on). Copy them from `_example.json`. |
| `vectorized` | Embedding settings for `vectorized` entries. |
| `isEmbedded` | The book came inside a card. |
| `formatTemplate` | Optional wrapper for each inserted entry: `{{original}}` marks the entry's text (`[Lore: {{original}}]`); empty = unwrapped. |
| `folderId` | Library folder. |
| `ownerChatId` | Set only on a chat's world book (World DM): the chat that owns it. Such a book is never in the Lorebooks library or any picker; only that chat scans it (through its meta's `worldBookId`), a fork gets its own copy and deleting the chat deletes the book. Never set it on another book. |

### Entry fields
| Field | What it is |
|---|---|
| `uid` | Number, unique in the book: 1, 2, 3… Never renumber: timed effects and vectors key on it. |
| `title`, `memo` | Name and a note for people; not sent. |
| `keys` | Words that fire the entry, matched as whole words. Ukrainian and Russian keys match every form of their words: one base form is enough (`вежа` fires on `вежі`, `вежу`, `вежею`); a key of several words fires when those words stand side by side in that order, each in any form (`Червона Вежа` fires on `до Червоної Вежі`). Words of 3 letters or fewer match only exactly. |
| `keysRegex` | `true`: keys are regular expressions. |
| `secondaryKeys`, `selectiveLogic` | Optional second key list and how it combines with `keys`: `AND_ANY`, `AND_ALL`, `NOT_ANY`, `NOT_ALL`. |
| `status` | `"normal"` fires on a key, `"constant"` is sent every message (keep those few and short), `"vectorized"` fires by meaning. The source of truth: never write the old `constant` boolean. |
| `content` | The text inserted when the entry fires: short, concrete, one topic. |
| `enabled` | `true` or `false` (a boolean, not a string). |
| `position` | `before_char` or `after_char` (around the character definition), `before_em` / `after_em` (around the example dialogues), `before_an` / `after_an` (around the author's note; without a note they go in at depth 4), `at_depth` (inside the chat, `depth` messages from the end). When the preset has no place for a position, the entry joins the end of the system block. |
| `depth`, `role` | For `at_depth`: how deep, and as which role (`system`, `user`, `assistant`). |
| `order` | Higher is inserted later (closer to the end) and wins when the budget runs out. Default 100. |
| `probability` | Percent chance to fire when keyed; omit for always. |
| `group`, `groupWeight`, `groupPrioritize` | Entries in one group: only one fires, picked by weight or priority. |
| `sticky`, `cooldown`, `delay` | Timed effects, in messages: stays on, waits before firing again, waits before the first firing. |
| `characterFilter`, `characterFilterExclude`, `tagFilter`, `triggerFilters` | Fire only when the speaking character is in `characterFilter` (ids or names) or has a tag from `tagFilter`; `characterFilterExclude: true` turns it into "never for them". `triggerFilters`: only on these generation types (`normal`, `continue`, `impersonate`, `swipe`, `regenerate`, `quiet`). Empty lists = no filter. |
| `nonRecursable`, `preventFurtherRecursion`, `delayUntilRecursion` | How entries trigger each other. |
| `scanDepthOverride`, `caseSensitiveOverride`, `wholeWordsOverride`, `wordFormsOverride`, `groupScoringOverride` | Per-entry overrides of the book settings; `null` = the book setting. `wordFormsOverride: false` makes a Cyrillic key match only the exact text. |
| `ignoreBudget` | Insert even when the budget is used up. |
| `matchSources` | `{ description, personality, scenario, persona }`: also scan these texts for keys. |
| `automationId` | Quick-reply automation to run when it fires. |

A new book: write the book with `"entries": []`, then add every entry with ONE json_set
(`{ pointer: "/entries", op: "append", value: {…} }` per entry), then append the id to the
character's `/studio/linkedLorebookIds`.

## World DM: `data/world/`

The World DM plugin (`plugins/world/`) keeps the world around the characters for one chat. Off unless the
player switches it on for that chat. It writes:

- `lorebooks/world-<chatId>.json`: the chat's world book, a normal lorebook with `ownerChatId`. One entry per
  record, `memo` `world:<recordId>` (`world:n3 (retired)` once retired), `keys` = the name and aliases,
  `content` = "Name: text". The DM rewrites only entries whose memo starts with `world:`; any other entry in
  the book is left alone.
- the chat meta's `worldBookId`: names that book; the engine adds it to the chat's scope before every reply.
- `world/state/<chatId>.json`: `{ v: 1, chatId, bookId, settings: { level, everyN, stagnation, onTransition,
  insert }, lastKey, nextId, entities: [{ id, kind, name, aliases, text, status, uid, at? }], nextFront,
  fronts: [{ id, name, goal, clock, size, status, at? }], event, direction?, transitionKey?, log: [{ at, key,
  reason, changes, fronts, summary }], lastRunAt?, lastModel?, lastError? }`.
  - `level`: `off`, `chronicler` (records only), `living` (fronts tick off screen, soft news), `director`,
    `antagonist`, `chaos` (a hard event for the next reply).
  - Triggers: `everyN` = after that many new replies (1-50, default 5); `stagnation` = when the scene stood still
    that many replies (0 = never, default 6; x2 at home, x0.5 on the road, paused in a fight); `onTransition` = right
    after a time skip. The last two need the Relationship dashboard. Nothing runs in an explicit scene.
  - `insert`: `false` keeps the DM running but sends the story model no events (also the chat's prompt board key
    `plugin:world`).
  - `lastKey` = `<messageId>#<swipe>` of the newest message the DM has read; `kind` is `person`, `place`, `group`,
    `thing` or `fact`; `status` `active` or `past` (retired: kept, text cut to two sentences); `uid` = its entry in
    the world book.
  - A front: `id` f1.., a goal and a clock `clock`/`size` (`size` 4, 6 or 8; full = the goal comes true).
  - `event`: `{ text, hard, sent, retried, at?, sentAt? }` or null: added after the chat history of the next reply
    (`sent` counts the replies that carried it); the next run checks the story, sends a missed one once more, then
    drops it.
  - `direction`: the scene direction the DM named last (used when the Dashboard has none); `transitionKey`: the
    Dashboard snapshot of the last time skip it ran on.
- The Relationship dashboard's snapshot has `scene.direction` (`domestic`, `social`, `intrigue`, `investigation`,
  `travel`, `combat`, `explicit`, `transition`) and, in an explicit scene, `scene.before` (the direction it
  interrupted). The DM reads them from `dashboard/state/<chatId>.json`.
- `world/config.json`: only what differs from `{ model: "", buildModel: "", maxTokens: 1500, imageModel: "",
  autoBackground: false }` (`model` = the play model after replies, `buildModel` = the model of a Start, empty = the
  fallbacks the World section shows; `imageModel` = the backgrounds' image model, empty = the app's; `autoBackground`
  = new chats in a world switch backgrounds by scene).
- Backgrounds of a world: a folder of the app's Backgrounds library (`library.json`, `backgrounds`: `{ id, name,
  url, type, folderId, fitting, tags? }`), linked as `backgroundFolderId` in the chat's state and in a saved world.
  `name` is an English snake_case place name (`tavern`, `tavern_2`), `tags` English words for kind, time, weather
  and mood; new images are stored as WebP in the engine's asset store (`url` = `/v1/assets/<id>`), never as data
  URLs in `library.json`. The chat meta's `autoBackground: { on, folderId }` lets the Dashboard sensor pick the
  image that fits the scene (its snapshot's `background` = the image's name); the app then sets `backgroundId`.

- Start (building a world before play): `state.draft` holds a Start in progress or waiting for the player
  (`{ recipe, cardIds, answers, lang, steps, done, entities, fronts, deck, at, error? }`); it reaches the world only
  when the player accepts it. `state.origin` says where the world came from (`cards` / `recipe` with the recipe and
  card ids, `library` with the world id, `chat` with the chat it was carried from). `state.deck`: the events deck
  (`[{ id: "e1", text }]`, profile option `deck`): the DM's events come only from it, each card used once.
- `world/recipes/<id>.json`: what a Start builds. `{ name, description, mode?, questions: [{ id, text, options?,
  default? }], sections: [{ id, kinds, max, prompt }], fronts: { count, prompt } }`. `mode` is `"learn"` (the default:
  each section reads every 6000-character chunk of the cards and records what the texts say) or `"invent"` (the
  cards are the input, the world is new: each section is one call that reads a short brief, each card's fields cut
  short and only the titles of its books' entries, and the build prompt says to invent, never retell). Built in:
  `from-cards` (invent: setting, people, trouble, then fronts) and `interview` (invent); a file with a built-in's id
  replaces it (without `mode` it becomes a learning recipe), any other id adds one.
- `world/library/w-<id>.json`: a saved world: `{ v: 1, id, name, description, at, from: { chatId, title },
  settings, entities, fronts, deck }`. "New chat in this world" copies it (or another chat's world) into a chat's
  state: records and fronts as they stand, clocks included; the run fields start fresh. `from` is null for a world
  built without a chat.
- `world/library/w-<id>.draft.json`: a world being built without a chat ("New world" in the Worlds tab): `{ name,
  description, at, settings, draft, usage, log }`, the same draft as a chat's start. Accepting it writes
  `w-<id>.json` and removes this file; discarding removes it. The Worlds list shows it until then.
- The chat meta's `worldScenario: { text, mode }`: the chat's own scenario, set from the World section. `mode`
  `replace` (default) puts it in place of the card's (or group's) scenario in every prompt of this chat, `append`
  adds it after. A chat's own first message is written into the greeting as its first swipe; the card's
  greetings stay behind it as swipes.

To change a record, edit it in the state file (`entities`): the next run writes the book from there and
overwrites hand edits to `world:` entries. Entries of your own in the book stay. Never remove `ownerChatId`.

## Presets: `data/presets/<id>.json`

A preset is the prompt the model gets around the chat, plus sampler settings. The file uses the
SillyTavern prompt-list shape. Every preset is editable, `default` included, unless its
`studio.readOnly` is `true`; the user's default is the one with `studio.isDefault: true`. To try
something risky, copy the preset to a new id first.

### Fields
| Field | What it is |
|---|---|
| `id`, `name` | Id (= file name) and display name. |
| `prompts` | The sections: `[{ identifier, name, role, marker, content, injection_position?, injection_depth? }]`. |
| `prompt_order` | `[{ character_id, order: [{ identifier, enabled }] }]`: the order and on/off state. The app reads the list with `character_id` 100001 first, then any non-empty one; it writes 100000. |
| `temperature`, `top_p`, `top_k`, `min_p`, `repetition_penalty`, `frequency_penalty`, `presence_penalty`, `seed`, `stop` | Samplers this preset asks for. On an engine with model parameters (0.9.2+) the MODEL's values win: they live in the workspace `model-params.json`, set in Settings under the model (Molfar asks the user before changing that file); the preset fills only what the model leaves unset. Change the preset's values HERE. |
| `samplers_override_model` | `true`: this preset's samplers win over the model's parameters (the editor's switch, `studio.samplersOverrideModel`). |
| `openai_max_tokens`, `openai_max_context` | Reply length limit and context size, in tokens. When the model's context window and its max output are known (0.9.2+), those are used instead. |
| `reasoning`, `reasoningTags`, `thinkingBudget` | Reasoning effort (`low`, `medium`, `high`), the tags of inline thinking, its token budget. |
| `utilityPrompts` | Prompts of app features (summary, impersonate, empty send, polish…), lifted from `studio` for the engine. `polish` (#15) is the instruction for Polish in the composer: the chat's model corrects and enriches the player's draft. Blank or missing = the built-in prompt (`plugins/polish/plugin.js`). |
| `studio` | The editor's full copy of the preset: `sections` (with `injectionTriggers`, `groupId`, `condition`), `groups`, `variables` (see Variables), `description`, `samplers` (`{ value, enabled }` pairs; the engine reads only `seed`, `stopStrings`, `logitBias` and `assistantPrefill` from here), `worldInfo` settings, `utilityPrompts`. |
| other numbers (`top_a`, `typical_p`, `dry_*`, `xtc_*`, `dynatemp_*`, `mirostat_*` …) | Extra samplers from imported presets; sent when set. |

### Sections
- `identifier`: unique in the preset. `marker: true` marks a slot the app fills: `main` (main prompt,
  editable text), `charDescription`, `charPersonality`, `scenario`, `personaDescription`,
  `dialogueExamples`, `chatHistory`, `worldInfoBefore`, `worldInfoAfter`, `postHistory`, `nsfw`.
  `main` holds the main prompt text; a character's `system_prompt` replaces it unless the section
  forbids overrides (`studio.sections[].forbidOverrides`). Every other marker is filled from the chat
  (the card's fields, the persona, world info, the card's `post_history_instructions`), and a
  NON-EMPTY `content` there REPLACES that text: leave marker `content` empty unless you mean it.
- `role`: `system`, `user` or `assistant`.
- `injection_position: "absolute"` with `injection_depth`: the section goes inside the chat, that
  many messages from the end; without it the section sits where it is in the order.
- The text of a section is `prompts[].content`; its place and on/off state are in `prompt_order`.
  A new section needs both: a `prompts` item and an `order` item. Section groups and conditions
  live only in `studio.sections` / `studio.groups`: change them in the editor.
- `studio.sections[].condition` turns a section on or off by a variable: `name` (on when set and
  not false/0/no/off), `!name` (the opposite), `name==value`, `name!=value`.

### Variables (options the user picks per chat)
`studio.variables`: `[{ id, name, label, type, defaultValue, question? }]`. `type`: `choice`,
`toggle` (`"true"`/`"false"`), `text`, `number`, `slider`, older `dropdown` / `multi` (`options`:
strings). A `choice` has `choices: [{ id, label, value, hint? }]` (`label` is what the user sees, `value`
the prompt text, which may hold macros, `hint` an optional plain line, about 160 characters, shown to
the player on the option and never sent to the model), `multi` (several picks, values joined with `separator`,
default ", "), `display` (`list` or `buttons`), `defaults` (choice ids; none = the first option of a
single choice). Sections read a variable as `{{name}}` or `{{var:name}}`, in `{{#if}}` blocks and in
`condition`. Each chat keeps its own picks in `chats/<id>.meta.json`: `presetVars: { <presetId>:
{ <name>: value } }` (choice ids, a string otherwise; missing or unknown = the default), `presetAt`
(when the user last chose them: a new chat with the same character starts from that chat's preset
and picks) and `presetNotes` (what changed after which message, shown in the chat, never sent to the
model). Marinara presets (`type: "marinara_preset"`) import with their choice blocks as `choice`
variables. `frankenx`, `molfar` and `vertep-lite` are the built-in read-only presets: copy one to change its text. `vertep-lite` is generated by `scripts/vertep-lite.ts` (edit the script, run `bun scripts/vertep-lite.ts`, never the JSON by hand); its micro plan rides in `<plan>` tags that the preset's `reasoningTags` split into the thinking block. Molfar's regex scripts (`data/regex/molfar-*.json`, scope `preset`) hide its `<molfar_plan>`, `<inner_voice>` and `<focus_log>` blocks; an update adds them from `data/_molfar-regex.json` when missing.

## App settings: image generation

`data/settings.json` → `ui.imageGen` holds the Image Generation tab. Besides `enabled`, `model`, `promptPrefix`, `negativePrompt`, `interactive` and `saveToGallery` it has `promptStyle` (`"auto"` or absent, `"description"`, `"tags"`: how the picture prompt is written) and `modelApi` (the `api` of the picked image model, written by the app; with `promptStyle` auto, `comfyui` and `a1111` mean Danbooru tags, anything else a description). Engine 1.2.1+ also gives the app `modelStyle` (`"tags"` or `"description"`: the image server's own Prompt style in the engine's Settings > Images, which beats the `modelApi` rule) and `modelInstructions` (the server's prompt guidance, up to 1,000 characters, passed to whoever writes the prompt). The app refreshes all three at start and when the Image Generation tab shows the model.

## Macros and regex scripts

Card fields, lorebook entries and preset sections may use macros; the engine expands them when it
builds the prompt. Names are case-insensitive.
- `{{char}}`, `{{user}}`: the character's and the persona's names. `{{newline}}`, `{{trim}}`.
- `{{roll:1d20}}` (also `2d6+1`, or a bare `20`): a dice roll by the engine. `{{random::a::b::c}}`
  picks one each time; `{{pick::a::b::c}}` picks once and keeps it for that chat. Use these instead
  of asking the model to invent random results.
- `{{setvar::name::value}}`, `{{getvar::name}}`, `{{addvar::name::n}}`, `{{incvar::name}}`,
  `{{decvar::name}}`: variables kept per chat.
- `{{name}}` / `{{var:name}}`: a preset variable (see Presets). `{{#if name == "value"}}…{{else if
  other}}…{{else}}…{{/if}}` keeps one branch: `==`, `!=`, `contains`, `not contains`, `&&`, `||`,
  `!`, parentheses, `name == "a" || "b"`; a bare name is true when set and not false/0/no/off. Names
  read `{{user}}`, `{{char}}`, preset variables, then chat variables; comparisons ignore case and a
  choice matches by its value or its label.

Regex scripts are `data/regex/<id>.json` (copy `data/regex/_example.json`): `findRegex`,
`replaceString`, `placement` (`user_input`, `ai_output`, `prompt`, `display`), `scope` (`global`,
`character`, `chat`, `preset`) with `scopeTargetId`, `minDepth` / `maxDepth`. A script with
placement `display` hides or restyles text on screen only; `prompt` changes what the model gets.

## Dashboard state: `data/dashboard/state/<chatId>.json`

Written by the Dashboard plugin, one file per chat. Besides `snapshots` (one per message key), `notebook` (what each
character saw, heard or guessed), `names` and `history`:

- `calendar` (#113): `{ start: "YYYY-MM-DD", src: "text" | "today" | "user", off?: true, inherited?: true }`, the date of story day 1. A snapshot keeps only the day number (`clock.day`); the date of a day is `start` plus `day - 1`, worked out when read, so moving the calendar moves every day at once. `src: "text"` = the sensor read a whole date in the text (its `date` key, `YYYY-MM-DD`, or null); `today` = counted from the clock of the machine; `user` = set by the user and never moved by the text; `off` hides the date; `inherited` = carried from the earlier chat of a continued one (dropped with the rest of the inherited state). `clock.time` may be a time guessed from the part of the day, then `clock.approx: true`. `POST /dashboard/calendar { chatId, date?, off? }` (`date` null = automatic again); `GET /dashboard/state` has `calendar` (where it stands) and `clock.date`.
- `said`: `{ "<character>": [ { id: "s1", text, kind, hidden?, turn, src, source: "chat" } ] }`, what the character said
  and is held to (#98). `kind` is `vow`, `promise`, `threat`, `confession`, `secret`, `order`, `refusal`, `lie` or
  `other`; a `lie` is stored `hidden: true` (the user sees it only after revealing). `src` is the message key that wrote
  it (the entry counts only while that message is on the chat's line), `source` is `chat` today and may be another kind
  of writer later. Its own part in the reply prompt (`Dashboard · said`), not the notebook's budget. The sensor
  reports it in the `said` list; `said.perTurn` (1-4, default 1; the sensor also gives each a `strength` 1-3 and only 2 or 3 is kept, one kind per speaker within 3 turns counts once, a speaker holds about 8 live entries, a line the Notebook holds is skipped) and `said.inject` are in `data/dashboard/config.json`.
- Threads are quests (#117). A thread in a snapshot's `threads` is `{ id, text, since, status: open|resolved, kind?,
  parent?, checked?, keptAt?, by?, resolvedAt? }`. `kind` is `main`, `side` or `everyday` (missing = `side`, so every
  older file reads as side quests); `parent` is the id of an open main quest and makes the thread a step of it (a step
  closes with its main quest while that is resolved and is open again if it is reopened; when the parent is gone or no
  longer main, the step stands alone). Limits (config): `maxMain` 1-2 (default 1), `maxThreads` 1-6 side quests
  (default 3), `maxSteps` 1-6 per main quest (default 4); everyday ones are not counted, at most 5 stay open and each
  is closed by code after `everydayTurns` (0-30, default 8; 0 = never). `checked` counts Thread checks the story left
  the thread unchanged; at `retireAfter` (0-10, default 3; 0 = never) a main or side quest gets a `close` proposal.
  `keptAt` is the turn the owner said "keep open".
- `proposals`: `[ { id: "p1", type: "open"|"close", why: "limit"|"stale", turn, text, kind?, parent?, threadId? } ]`,
  at most 8, newest last; `proposalsDropped` counts unanswered ones pushed out. An `open` proposal is a new quest that
  did not fit its limit (it is kept, not lost); a `close` proposal is a quest the story left alone. The owner's
  answers live in the notes overlay `data/dashboard/notes/<chatId>.json` (`threads.dismissed` ids, `threads.queued`
  quests the owner added at a full limit, `threads.added[].kind|parent|proposed`, `threads.edits[id].kind|parent|keptAt`),
  never in this file. Ops of `POST /dashboard/notes`: `thread-add {text, kind?, parent?}` (a full limit queues it),
  `thread-edit {id, text?, status?, kind?, parent?}`, `proposal-accept {id, replace?}` (a full kind names the open quest
  it replaces) and `proposal-reject {id}`. The sensor's `threads.open` items may carry `kind` and `parent`; a kept
  thread ignores them.
- Event ids the vocabulary does not have (#86): the sensor's id is first matched to the nearest known event (words of
  the id compared by stem, at least half of each side's words, a tie means no match: `jealousy` is `jealous_scene`,
  `check_on_her` is `checked_on_her`); what is still unknown counts as `other`. Those ids are counted across all chats
  in `data/dashboard/other-seen.json`: `{ v: 1, seen: { "<id>": { n, at, quote } } }` (30 most seen ids,
  lower-case words joined by `_`), listed in `GET /dashboard/config` as `otherSeen` without the ones that are events by
  now; `DELETE /dashboard/other-seen {id?}` forgets one or all. A `significant` event with an empty quote counts as
  `routine` (a `pivotal` one is kept); `keptOut.noQuote` says how many in the last report.
- `inherited` (#100): present when the chat continues another one (the link in `data/litopys/links.json`):
  `{ from, title, at, turn, notes, threads, snap }` with `snap` = the earlier chat's last snapshot (numbers, moods,
  scene, open threads) that the first sensor run reads on from; or `{ off: true, from, title }` after "Start clean".
  Carried notebook, names and `said` entries have `src: "inherit"` and `fromChat`. Start clean also turns the Litopys
  backstory of that chat off.

## Agents: `data/agents/<id>.vertep-agent.json` (checked and run by the Agents plugin; no screen writes it yet)

An agent is data, not code: one Canvas file (`vertep-canvas` v1) with `kind: "agent"` and an `agent` header,
checked by `validateAgent` (`src/canvas-kit/boards/agent-check.js`) before anything runs it. The same function serves the
editor, the install screen and the runner. It is plain synchronous JavaScript with no imports, because the engine's QuickJS
sandbox loads one file per plugin and has no `TextEncoder` or `crypto.subtle` (the hash is a hand-written SHA-256); the
editor imports it typed through `agent-check.d.ts`, and `agent.ts` only adds the Canvas board on top. Design notes: issue #127 in Molfar.Vertep.

```json
{ "format": "vertep-canvas", "version": 1, "kind": "agent", "title": "Mood tracker",
  "agent": { "formatVersion": 1, "id": "mood-tracker", "version": "1.0.0", "name": "…", "description": "…", "author": "…",
             "trigger": { "when": "after", "everyN": 1, "keywords": [] },
             "models": { "fast": { "hint": "cheap, answers in JSON" } },
             "limits": { "maxCalls": 1, "concurrency": 1 },
             "derived": { "needs": ["llm", "read:lastReply"], "maxCalls": 1, "hash": "sha256:…" } },
  "nodes": [ … ], "edges": [ … ] }
```

- `agent.id` is a lowercase slug (2-41 characters). `trigger.when` is `before`, `parallel`, `after` or `manual`.
  `models` names roles (`fast`), never a model id and never a key: the user maps a role to a connection at install.
- `derived` is computed from the cards: `needs` (permission tokens, sorted), `maxCalls` (model calls per run) and
  `hash` (sha256 of the header without `derived`, the cards without `x`/`y`, and the wires). A file whose `derived`
  disagrees with its cards is refused (`E_NEEDS_MISMATCH`, `E_CALLS_MISMATCH`, `E_HASH`), so a file cannot ask for
  more than the install screen showed. `compileAgent` fills it.
- Permission tokens: `llm`, `read:<source>` (`lastReply`, `lastUserMessage`, `history`, `card`, `persona`, `summary`,
  `authorNote`, `myPrevious`, `preGenInjections`, `parallelResults`), `read:state.<field>`, `write:state.<field>`
  (the Dashboard's fields), `read:own.<field>`, `write:own.<field>` (the agent's own state), `write:prompt`,
  `show:note`, `show:choices`, `show:panel` (the agent has a `panels` section).
- Ports are derived from a card's `params` (one input per `{{slot}}`, one output per JSON `shape` field) and use only
  `A-Z a-z 0-9 _ -`. Wire types are `text`, `number`, `flag`, `signal`; an output feeds an input of the same type, an input
  takes one wire, and the wires make no loop.
- Cards: `agent.input` (exactly one; `params.give`), `agent.output` (one or more; `params.kind` = `state-patch`,
  `note`, `prompt-insert` or `choices`, optional `params.show`), `text.template`, `model.ask` (`role`, `prompt`,
  `answer.as` = `text`, `yesno` or `json` with `shape`, `maxTokens`), `data.parse`, `logic.if` (outputs `yes`, `no`,
  `unknown`; missing data is Unknown, never No), `logic.merge`, `write.state` (`field`, `as`, optional `when` signal),
  `note`, and four cards for the agent's own state (below). A card of an unknown type is kept and warned about (`W_UNKNOWN_TYPE`); the agent will not run.
- Code cards, no model and no permission, 0 model calls: `random.dice` (`count` 1 to 20, default 1; `sides` 2 to 1000,
  default 20; optional `bonus` -1000 to 1000; optional `when` signal; outputs `total` (number) and `rolls` (text,
  "4, 17")), `random.pick` (`items`: 2 to 40 `{ text, weight? }`, a weight 1 to 100 or 1 when absent; optional `when`; outputs
  `text` and `index`, 1-based), `text.extract` (`pattern` of up to 200 characters, optional `flags` from `i`, `m`, `s`, `group`
  0 to 9 and not above the pattern's groups, `all`: every match up to 20 joined with `join` (default `, `); input `in`;
  outputs `match`, and `none` (signal) when nothing matched, so the match path is skipped) and `text.cut` (`keep` `first`
  or `last`, `unit` `chars`, `words` or `lines`, `n` 1 to 20000; input `in`, output `text`). A bad parameter is `E_PARAM`, a
  pattern that does not compile `E_REGEX`. A pattern with a repeated group that holds a repeat or a choice, or a back
  reference, is `E_REGEX_RISK`: such a pattern can run for very long on a short text, and the plugin sandbox would be stopped
  after seconds. Dice and picks are seeded: the host passes `ctx.seed` = chat id, agent id and the turn key (`id#swipe`), so every
  pass of one run rolls the same, a regenerated reply with the same swipe repeats its roll, and a new swipe rolls again.
- Input sources read by the host (`give[].source`, permission `read:<source>`): `litopysFacts` (the chat's active Litopys
  facts, pinned first then the newest, `limit` 1 to 60, default 20, one "- fact" line each; missing when Litopys has no
  record for the chat) and `lorebook` (entries of the books the chat uses, in this order: the card's embedded and linked
  books, the chat's own and its world book, then the global ones; entries that are enabled and constant, or whose keys appear
  in the last six messages; `limit` 1 to 20, default 8, "- title: text" lines). The lorebook source is an approximation of the
  app's scan: keys are plain text, regular-expression keys, groups, probability and timed effects are not applied, and a group
  chat reads only the first character's books.
- `params.show` on an Output, where a result may appear: `state-patch` → `log`, `feed`, `top1`, `top2`, `float`, `toast`;
  `note` → `note`, `log`, `feed`, `top1`, `float`; `prompt-insert` → `inspector`, `note`; `choices` → `bottom`, `log`,
  `float`. Anything else is `E_SHOW_NOT_ALLOWED`. A `parallel` agent cannot insert into the prompt (`E_PARALLEL_INSERT`).
- Own state (`agent.state`): fields the agent declares, kept apart from the Dashboard. A field is `{ "type": "number",
  "min", "max", "start" }`, `text`, `flag`, or `{ "type": "list", "item": { "name": "text", "level": "number" }, "max": 20 }`
  (a list must have `max`, 1 to 500, and 1 to 8 entry fields; at most 40 fields). Field names start with a letter and use
  `A-Z a-z 0-9 _ -`. Numbers are kept by code, not by the model: the model reports events, `logic.if` checks, the
  state cards count, and a number stays inside its `min`/`max`.
- State cards, each with the field in `params.field`: `state.read` (`as`; output `value`), `state.set` (`as`; input `value`),
  `state.add` (number field only; a fixed `amount` or a wire into the optional `by`), `state.list` (`op` = `add`, `update`
  or `remove`; `item` repeats the entry shape; `key` names the entry field that finds the entry for `update`/`remove`; the
  inputs are the entry fields, or just `key` for `remove`). The three writers take an optional `when` signal and give
  `done`. A card that names a missing field is `E_STATE_UNKNOWN`; a type that does not match the schema is `E_STATE_TYPE`.
- Panels (`agent.panels`, at most 4): `{ "id", "title", "place": "float" | "top1" | "top2", "widgets": [ … ] }`, at most
  20 widgets. A panel describes, never runs: widgets `meter`, `number`, `counter` (a number field), `table` (a list
  field and its `columns`), `list`, `log` (a list field), `text` (a text field), `actions` (1 to 8 `{ label, send }`;
  `send` is put into the composer, nothing is sent by itself) and `html`. `bind` must name a state field of the right
  type (`E_BIND`); an unknown widget or bad `actions` is `E_WIDGET`.
- `html` widget: `template` up to 8192 characters, an optional `height` of the frame (a whole number of pixels, 40 to 600, default 80; else `E_WIDGET`), slots `{{field}}`, `{{#each list}}…{{/each}}` (the entry's fields
  inside, no nested `each`) and `{{#if field}}…{{/if}}`. The checker refuses a template with a slot that is not a field
  (`E_TPL_FIELD`), an unclosed block (`E_TPL_UNCLOSED`), or markup that can run code or load something
  (`E_TPL_FORBIDDEN`: script, frames, forms, `<link>`, event handlers, `src`/`href`, `url()`, `@import`). The check is
  deliberately loose and is not the only guard: the renderer must still escape every value and show the result in the
  sealed `srcdoc` frame without scripts. The app does this (`src/lib/agent-template.ts`, `components/chat/agent-html.tsx`):
  values are escaped, an `{{#each}}` takes at most 50 entries, a flag prints ✓ or –, a missing field prints nothing,
  the frame has `sandbox=""` and a `Content-Security-Policy` of `default-src 'none'; style-src 'unsafe-inline'; img-src data:`,
  and a template the checker would refuse is not drawn. The widget shows in the floating window; a bar above the chat
  skips it. `templateProblems(template, state)` of the checker is what the editor shows while the template is typed.
- Trial run (editor only): `runAgent(file, { …, explain: true }, answers)` also returns `wires`, `{ "<node>:<port>": { state: "value", value } | { state: "skip" | "wait" | "missing" } }` for every output port. The runner plugin never sets `explain`. `src/lib/agent-dry.ts` loops the executor, answering each model request from the person's text or an example.
- Presets, `data/agents/presets/<id>.json` (written by the engine plugin, not yet by any screen):
  `{ "format": "vertep-agent-preset", "version": 1, "id", "name", "items": [ { "agent": "<agent id>", "on": true,
  "phase": "before" | "parallel" | "after" | "manual", "wait"?: false } ] }`. `wait: false` (only read for an agent that runs
  `before` the reply) means the reply does not wait for it: it runs beside the reply and its hint goes into the next reply;
  absent = the reply waits and the hint goes into this reply. A preset names agents, never holds them, and gives no
  permissions (the user confirmed those when installing the agent). The order of `items` is the order inside a phase;
  `phase` is optional (the agent's own `trigger.when` then applies); at most 50 items, an agent once. Routes:
  `GET /agent-presets`, `GET|PUT|DELETE /agent-presets/<id>` (PUT cleans the file and refuses one without `items`).
- The default preset, `data/agents/settings.json` `{ "defaultPreset": "<preset id>" | null }`, `GET|PUT /agent-settings`.
  A chat with no binding follows it.
- A chat's binding, meta `agents`: `{ "v": 1, "preset"?, "own"?, "show"? }`. With `preset` and no `own` the chat follows the
  preset live (a change to the preset reaches it at once). The first change made in the chat (turn an agent off, add or
  remove one, reorder, change a phase, pick another place to show) writes `own`, a copy of the items as they were, and from
  then on the chat does not follow the preset; `own: []` means "no agents". `show` maps an agent id to the place the user
  chose (`log`, `feed`, `top1`, `top2`, `float`, `toast`, `note`, `bottom`, `inspector`); whether that place suits the
  agent's Output is checked when it runs. The chat's Agents tab offers only the places in the agent's `places`. A `note` shown in `feed` is drawn as a plain muted line under the reply instead of a card. A preset or an agent that is gone does not break the chat: the entry is
  skipped. Forks copy the binding with the rest of the meta. Set whole with `PATCH /chats/<id>` `{ agents }` (`null` = back
  to the default) or at creation, `POST /chats` `{ agents }`. Better, one change at a time: `POST /chats/<id>/agents`
  `{ op }` with `op` = `preset` (`preset`: id or null; drops `own`), `reset` (drops `own` and `show`), `add` (`agent`, `phase?`),
  `remove`, `toggle` (`on`), `phase`, `move` (`to`: position), `show` (`place`: a place or null), `wait` (`wait`: false = the reply does
  not wait for this agent, true = it does); it answers what runs now,
  as does `GET /chats/<id>/agents`: `{ presetId, presetMissing, followsPreset, items: [ { agent, on, phase?, show } ] }`.
### Running an agent (`agent-run.js`)

`runAgent(file, ctx, answers)` in `src/canvas-kit/boards/agent-run.js` runs a checked file for one turn. It is pure: it never
calls a model or touches a file, and it is called again with more `answers` until it is done, like the engine's two-phase
generation. `ctx` = `{ inputs, own, dash, chat }`: `inputs` is what the host read for the Input card, by `give` id; `own` the
agent's own fields; `dash` the Dashboard fields (`state` sources and `state` operands read these); `chat` = `{ messageCount,
lastSpeaker }`. `answers` = `{ <model.ask card id>: { text } | { error } }`. The result is one of:
- `{ status: "need", requests }`: the `model.ask` calls that can run now (all independent ones at once), each `{ node, role,
  prompt, maxTokens }`. The prompt already carries the format the card expects (YES/NO on the first line, or JSON in the
  card's `shape`).
- `{ status: "done", writes, outputs, calls, trace }`: `writes` are staged changes (`dash.set`, `own.set`, `own.add`,
  `list.add`, `list.update`, `list.remove`), applied by the host only after a successful run, with
  `applyWrites(schema, own, writes)`; `outputs` are what the Output cards produced (`state-patch`, `prompt-insert`, `note`,
  `choices`, each with its `show`); `trace` says for every card whether it ran, was skipped or waited.
- `{ status: "failed", reason, node }`: a model call failed, an answer did not fit the card's `shape`, or `data.parse` failed
  with no `failed` wire.

A wire carries a value, or *skipped* (that path did not fire), or *missing* (an empty field, an unread source). A card that
needs a value and gets either is skipped, and so is everything that depends only on it; a skipped card costs nothing.
`logic.if` is the exception: missing data is `unknown` there, never `no` (a rule on a number that is not there answers
Unknown; `isSet` and `isMissing` ask exactly that). A YES/NO answer the executor cannot read is `unknown` too. `applyWrites`
keeps numbers inside the field's `min`/`max` (and a card's `maxStep`), refuses a wrong type or a missing field, and a full
list takes no new entry; each refusal is returned, nothing throws. `agent-run.js` shares the sandbox rules of the checker
(no async, no globals) and its only import is the checker; the runner plugin carries both pasted together.

### The runner: `plugins/agents`

The Agents plugin installs checked agent files and runs them: after a reply, before it (inside the plugin's `llmRequest` hook) and
beside it (a call the app makes when a send starts). The routes below and the hook are the whole interface. Files, all under `data/agents/`: `<id>.vertep-agent.json` (the installed, compiled agent),
`grants/<id>.json` (`{ v: 1, needs: [...] }`, what the user confirmed), `config.json` (`{ model?, models?: { <role>: <model> } }`),
`state/<chatId>/<id>.json` (`{ v: 1, own, last, before }`: the agent's own fields in that chat, the text it left for its
`myPrevious`, and the state and message id before its last run), `runs/<chatId>.json` (`{ v: 1, runs }`, the newest 100) and
`inserts/<chatId>.json` (`{ v: 1, items }`, hints waiting for the next reply).
- `PUT /agents/install` `{ file, grant? }`: checks the file (a file that lies in `derived` is refused with the checker's
  errors and nothing is stored; one without `derived` is compiled), stores it and answers `{ id, needs, granted, missing,
  unsupported, warnings }`. `grant`: `true` or a list of permissions the user confirmed. A new version keeps the permissions
  already confirmed for what it still asks; it runs only when everything it asks for is confirmed.
- `GET /agents/list` (each agent also carries `places`: where the chat may move its results, from its Outputs and panels, the author's default first), `POST /agents/grant` `{ id, tokens }`, `DELETE /agents/<id>`, `GET|PUT /agents/config`. `agents/config.json` also holds the user's own choices per agent, never the agent's file: `byAgent: { <id>: { models?: { <role>: <model> }, maxCalls? } }` (`PUT` with `byAgent` replaces the whole map; `maxCalls` 1 to 50). The list carries them as `own` (with the agent's `models`, the roles its author named). The model for a question is the agent's own `models[role]`, then the app-wide `models[role]`, then `model`, then the rest of the chain below. An agent whose cards can make more calls than its `maxCalls` is blocked (`blocker`: "Can make up to N model calls a run, over your limit of M for this agent") and does not run; removing the agent drops its entry, an update keeps it.
- `POST /agents/run` `{ chatId, agent? }`: runs the agents the chat uses (its binding, see above) that are set to run `after` a
  reply, in the engine's two-phase style: it asks the models and is called again with the answers. The model for a question is
  the agent's own `byAgent[id].models[role]`, else the `models[role]` of `config.json`, else its `model`, else the Dashboard sensor's, else the chat's, else the app's. Skipped
  and why: not installed, off, waiting for permission, trigger (`everyN`, `keywords`) did not fire, already ran for this reply.
  `agent` runs that one agent by hand whatever its trigger says. A failed run is logged and leaves the state as it was.
  A regenerated reply replaces the run of the same message instead of counting twice (only the newest run is undone this way).
  `phase` (default `after`) is `after` or `parallel`: with `parallel` the call comes from the app when a send starts, carries
  `userText` (what the user wrote, not saved yet) and runs the agents set to run `parallel`, and those set to run `before` with
  `wait: false`. They read the saved chat and that text as the last user message; a hint they leave goes into the next
  reply. An agent set to run `before` the reply with `wait` on runs in the request hook of a `send` (not on a swipe, continue or
  a group member's turn, which reuse the hint of the last run): it reads the saved chat plus the message as the model gets it,
  and its hint is added to this reply. If it fails, the reply goes without the hint and the failure is in the log
  (`phase: "before"`); the app shows it with a Run again button, which runs that agent by hand (`agent`). The run of the same
  message is not repeated (`already ran for this message`); the number of replies for `everyN` counts the one being made.
  The runner carries the answers of earlier rounds in the stash (route) or in the hook's ctx (`stash`), because the engine hands
  a plugin only the newest round's answers.
  Rounds: every question that can be asked now is asked in one round, so cards side by side cost one round, not many; a
  question that needs an earlier answer waits for the next round. The plugin's `manifest.json` carries
  `limits: { passes: 8, concurrency: 3 }`, which the engine reads (the engine release after 1.4.2; an older engine keeps 3 passes and
  runs an agent with more than two model calls in a row never to the end). The checker refuses an agent with more than
  `AGENT_MAX_ROUNDS` (7) model calls on one path (`E_ROUNDS`), and a run that is still asking after the seventh round fails
  with that reason in the log instead of vanishing. The engine runs the questions of one round up to three at a time, at least
  250 ms apart, and tries a question again after a 429.
- `GET /agents/state?chatId&agent` (the agent's own fields), `DELETE` the same (start over), `GET /agents/runs?chatId`, `GET /agents/panels?chatId` (the panels of the chat's agents that are on and allowed, each with its state schema, its state and the state before the last run; the app draws them in `top1`, `top2` or the floating button).
- **Drafts.** A file Molfar (or anyone) writes to `data/agents/drafts/<name>.vertep-agent.json` waits there for the user. The
  Agents sheet lists the drafts with what an install would say about each (`errors` and `warnings`, the checker's own codes
  and messages) and an Install button; a draft with errors cannot be installed. `GET /agents/drafts` (`{ drafts: [{ name, id,
  title, description, needs, maxCalls, installed, errors, warnings }] }`, at most 50), `POST /agents/drafts/install { name }`
  (the same reply as `PUT /agents/install`; the user still has to allow), `DELETE /agents/drafts/<name>`. The file needs no
  `agent.derived`: the check fills it in. The draft stays after install, so a fixed file can be installed again as an update.
  The editor (Canvas, tab Agents) also uses `GET /agents/drafts/<name>` (`{ name, file }`, or `{ name, text }` when the file is
  not JSON), `PUT /agents/drafts/<name> { file }` (saved as it stands; not checked, work in progress may have errors) and
  `POST /agents/drafts/copy { id }` (a copy of an installed agent as a draft, without `derived`; a draft of that name that is
  already there is kept and returned with `existing: true`). A name is 1 to 100 characters: letters, digits, `_`, `-`.
- **The editor (the Forge).** Canvas has a third tab, Agents: the drafts as a list, a new agent from a ready recipe, and one
  agent as cards on its own board (`forge/agent-board.tsx`: a row for each port, wires from port to port; the Chat links board of the kit is unchanged) with a form for the picked card and a tab for the agent itself (name, id, trigger,
  its own state fields, panels by forms with the JSON folded below; renaming a state field renames it in the cards and panels too). It checks the file as it changes with the same checker the plugin uses, saves the draft
  after a short pause, and installs it through the drafts route; Install is off while the check has errors. The recipes it starts
  from are the skill's JSON files, copied into `src/lib/forge-recipes.ts` by `bun scripts/sync-agent-recipes.ts` (a test fails
  when the copy is old). A phone gets the cards as a list and the same forms in a sheet.
- **Choices.** An Output `choices` (up to 6 lines, one per choice) belongs to the reply it was made for. While that reply is the
  last message of the chat, `bottom` (also the default) shows the choices as buttons above the composer, `float` puts them in the
  floating card, `log` under the agent's line of the run log. A tap puts the text in the composer; it never sends. Once the user
  writes, the buttons are gone.
- **Hint for the next reply.** An Output `prompt-insert` is kept in `inserts/<chatId>.json` and added to the end of the last user
  message of the next reply request (`position` is not used yet), with the agent's label, for as long as the agent is on in
  the chat; the agent's next run replaces it.
- **Not yet.** Dashboard fields (`read:state.*`, `write:state.*`), the sources `preGenInjections` and `parallelResults`, the triggers
  `before` and `parallel`, the source `summary`. An agent that needs them installs but does not run, and says so.
- The plugin carries a generated copy of `agent-check.js` and `agent-run.js` between two marker lines; after editing either,
  run `bun scripts/sync-agents-plugin.ts` (a test fails when the copy is old).

Errors the checker raises: `E_ENVELOPE`, `E_FORMAT_VERSION`, `E_ID`, `E_TRIGGER`, `E_DUP_NODE`, `E_PORT_ID`,
`E_ROLE`, `E_IF_EMPTY`, `E_IF_OP`, `E_IF_OPERAND`, `E_INPUT_COUNT`, `E_OUTPUT_COUNT`, `E_SHOW_NOT_ALLOWED`,
`E_EDGE_NODE`, `E_EDGE_PORT`, `E_EDGE_DIRECTION`, `E_TYPE`, `E_TWO_WIRES`, `E_UNWIRED`, `E_CYCLE`, `E_ROUNDS`, `E_BUDGET`,
`E_STATE_FIELD`, `E_STATE_LIMIT`, `E_STATE_UNKNOWN`, `E_STATE_TYPE`, `E_STATE_OP`, `E_PANEL`, `E_WIDGET`, `E_BIND`,
`E_TPL_FIELD`, `E_TPL_UNCLOSED`, `E_TPL_FORBIDDEN`; the derived-field errors `E_NEEDS_MISMATCH`, `E_CALLS_MISMATCH`, `E_HASH`; warnings
`W_UNKNOWN_TYPE`, `W_ISLAND`. Tests: `test/rp-agent-board.test.ts`, `test/rp-agent-run.test.ts` and `test/rp-agent-check-sandbox.test.ts` (runs the source in a bare context; examples: `test/fixtures/mood-tracker.vertep-agent.json`, and `dungeon-keeper.vertep-agent.json` with own state and a panel).
