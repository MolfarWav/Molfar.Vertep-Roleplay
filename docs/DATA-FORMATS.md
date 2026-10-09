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
| `extensions` | Free object for other tools. Known keys: `molfar_card_type` (`narrator`, `single`, `group`, `assistant`, `other`), `molfar_soul` (the dashboard's Soul tab, `docs/SOUL.md`: leave it to that tab). Imported cards carry others (`world`, `talkativeness`, `fav`, `chub`…): keep them. |
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
| `expressions`, `defaultExpression` | Sprite images per emotion: `[{ name, url }]`, and the one shown by default. |
| `gallery` | `[{ id, url, type: "image" | "video", caption }]`. |
| `voiceProvider`, `voiceId` | Text-to-speech voice. |
| `characterRegexIds` | Regex scripts that apply only to this character. |
| `css` | Custom CSS for this character's chat. |
| `favorite`, `folderId`, `createdAt`, `lastChatAt` | Library state: leave them alone. |

## Lorebooks: `data/lorebooks/<id>.json`

The id is the file name without `.json`, repeated in `"id"`. A chat uses: every book with
`globalActive: true`, the character's `studio.embeddedLorebookId`, every id in the character's
`studio.linkedLorebookIds`, and the books bound to the active persona. The book's own
`linkedCharacterIds` only feeds a counter in the list: link from the character's side.

### Book fields
| Field | What it is |
|---|---|
| `id`, `name` | Id (= file name) and display name. |
| `globalActive` | `true`: in every chat. |
| `linkedCharacterIds` | Display only (see above). |
| `entries` | The entries, below. |
| `settings` | Scan settings: `scanDepth` (messages scanned for keys), `contextPercent` and `budgetCap` (how much room entries may take), `minActivations`, `maxRecursion`, `insertionStrategy` (`character_first` …), `caseSensitive`, `wholeWords`, `groupScoring`, `recursiveScan`, `includeNames`, `overflowAlert`. Copy them from `_example.json`. |
| `vectorized` | Embedding settings for `vectorized` entries. |
| `isEmbedded` | The book came inside a card. |
| `formatTemplate` | Optional wrapper for each inserted entry. |
| `folderId` | Library folder. |

### Entry fields
| Field | What it is |
|---|---|
| `uid` | Number, unique in the book: 1, 2, 3… |
| `title`, `memo` | Name and a note for people; not sent. |
| `keys` | Words that fire the entry. Ukrainian and Russian: list the inflected forms people will type (`вежа`, `вежі`, `вежу`, `вежею`). |
| `keysRegex` | `true`: keys are regular expressions. |
| `secondaryKeys`, `selectiveLogic` | Optional second key list and how it combines with `keys`: `AND_ANY`, `AND_ALL`, `NOT_ANY`, `NOT_ALL`. |
| `status` | `"normal"` fires on a key, `"constant"` is sent every message (keep those few and short), `"vectorized"` fires by meaning. The source of truth: never write the old `constant` boolean. |
| `content` | The text inserted when the entry fires: short, concrete, one topic. |
| `enabled` | `true` or `false` (a boolean, not a string). |
| `position` | `before_char` or `after_char` (around the character definition), `at_depth` (inside the chat, `depth` messages from the end). |
| `depth`, `role` | For `at_depth`: how deep, and as which role (`system`, `user`, `assistant`). |
| `order` | Higher is inserted later (closer to the end) and wins when the budget runs out. Default 100. |
| `probability` | Percent chance to fire when keyed; omit for always. |
| `group`, `groupWeight`, `groupPrioritize` | Entries in one group: only one fires, picked by weight or priority. |
| `sticky`, `cooldown`, `delay` | Timed effects, in messages: stays on, waits before firing again, waits before the first firing. |
| `characterFilter`, `characterFilterExclude`, `tagFilter`, `triggerFilters` | Fire only for (or never for) these characters, tags or generation types. |
| `nonRecursable`, `preventFurtherRecursion`, `delayUntilRecursion` | How entries trigger each other. |
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
| `studio` | The editor's full copy of the preset: `sections` (with `injectionTriggers`, `groupId`, `condition`), `groups`, `samplers` (`{ value, enabled }` pairs; the engine reads only `seed`, `stopStrings`, `logitBias` and `assistantPrefill` from here), `worldInfo` settings, `utilityPrompts`. |
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

## Macros and regex scripts

Card fields, lorebook entries and preset sections may use macros; the engine expands them when it
builds the prompt. Names are case-insensitive.
- `{{char}}`, `{{user}}`: the character's and the persona's names. `{{newline}}`, `{{trim}}`.
- `{{roll:1d20}}` (also `2d6+1`, or a bare `20`): a dice roll by the engine. `{{random::a::b::c}}`
  picks one each time; `{{pick::a::b::c}}` picks once and keeps it for that chat. Use these instead
  of asking the model to invent random results.
- `{{setvar::name::value}}`, `{{getvar::name}}`, `{{addvar::name::n}}`, `{{incvar::name}}`,
  `{{decvar::name}}`: variables kept per chat.

Regex scripts are `data/regex/<id>.json` (copy `data/regex/_example.json`): `findRegex`,
`replaceString`, `placement` (`user_input`, `ai_output`, `prompt`, `display`), `scope` (`global`,
`character`, `chat`, `preset`) with `scopeTargetId`, `minDepth` / `maxDepth`. A script with
placement `display` hides or restyles text on screen only; `prompt` changes what the model gets.
