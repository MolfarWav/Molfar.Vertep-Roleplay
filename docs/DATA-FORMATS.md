# Data formats: characters, lorebooks, presets

The files under `data/` as the app writes and reads them. Agents (Molfar) and people editing files by
hand work from this page; the card, lorebook and preset skills in `.skills/` point here instead of
copying it. `test/rp-data-formats.test.ts` fails when the code writes a field this page does not name:
**a change to these formats updates this page in the same commit.**

Change files with the agent's `json_get` / `json_set` tools: one field at a time, the format kept,
committed. Never type a large JSON file out as text. Files whose name starts with `_` (for example
`data/lorebooks/_example.json`) are AI-only templates: copy one to make a real entity, never edit it.
Open pages pick up a changed file within about a second.

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
      "compiled":   { "at": 0, "hash": "" } }
| Key | What it is |
|---|---|
| `identity`, `appearance`, `background`, `relationships`, `notes.description` | Compiled into `description` as labeled lines (`Eyes: grey`), in this order: identity, appearance, origin and backstory, circles (`affiliations`, `circle`, `politics`, `religion`), relationships, notes. `identity.comment` is private: never compiled. `measurements` is bust-waist-hips. |
| `lists`, `behaviors`, `goals`, `trauma`, `sexuality`, `notes.personality` | Compiled into `personality`. Lists are joined with commas. |
| `sections` | Section switches. An off section keeps its fields and writes nothing. Keys: `appearance`, `personality` (the `lists`), `behaviors`, `goals`, `background` (origin and backstory), `circles`, `trauma`, `relationships`, `sexuality`. A missing key: `sexuality` follows the old `sexuality.enabled` (off by default, adult characters only), `trauma` and `circles` are on once one of their fields is filled, the rest are on. |
| `notes` | Text that fits no field; it follows the fields. Starting a profile moves the card's old text here, so nothing changes until fields are filled. |
| `free` | Free write: the profile is kept but no longer writes the card. |
| `compiled` | When the profile last wrote the card and an FNV-1a hash of `description` + `personality` as written. A different hash means the text was edited by hand; the tab then offers to keep the additions, rewrite, or switch to Free write. |

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
group's own books), and the books bound to the active persona.
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
| `utilityPrompts` | Prompts of app features (summary, impersonate, empty send…), lifted from `studio` for the engine. |
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
strings). A `choice` has `choices: [{ id, label, value }]` (`label` is what the user sees, `value`
the prompt text, which may hold macros), `multi` (several picks, values joined with `separator`,
default ", "), `display` (`list` or `buttons`), `defaults` (choice ids; none = the first option of a
single choice). Sections read a variable as `{{name}}` or `{{var:name}}`, in `{{#if}}` blocks and in
`condition`. Each chat keeps its own picks in `chats/<id>.meta.json`: `presetVars: { <presetId>:
{ <name>: value } }` (choice ids, a string otherwise; missing or unknown = the default), `presetAt`
(when the user last chose them: a new chat with the same character starts from that chat's preset
and picks) and `presetNotes` (what changed after which message, shown in the chat, never sent to the
model). Marinara presets (`type: "marinara_preset"`) import with their choice blocks as `choice`
variables. `frankenx` is the built-in read-only example: copy it to change its text.

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
