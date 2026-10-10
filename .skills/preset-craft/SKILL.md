---
name: preset-craft
description: Use when creating, editing, auditing, modernizing or porting a Roleplay preset (prompt sections, order, samplers). Triggers: "зроби пресет", "полагоди пресет", "аудит пресета", "modernize preset", "port preset", "fix sampler settings".
---
Without this skill, Molfar reads only section names, copies broken blocks between presets, and breaks prompt order. A preset is one prompt assembled from ordered sections plus samplers; every block must be read as real text before any edit.

## Procedure

1. **Confirm the target.** A preset is `apps/roleplay/data/presets/<id>.json`. Every preset is editable unless its `studio.readOnly` is true. To make a new one (or before a risky rewrite), read the source preset and write a copy under a new id in one `write_file` (a preset is small). Edits to an existing preset go through `json_set`.
2. **Read the structure in one call.** Run `json_get { path, pointers: ["/prompts", "/prompt_order"] }` on the preset. If either value comes back as a shape, repeat with the fields you need. Never read the whole file, never read `studio` unless the user asks for editor-only details.
3. **Read the real text.** Dump every section `content` you will touch with one `json_get` using pointers like `/prompts/3/content`. Never reason from section names alone.
4. **Read the format doc when a field is unknown.** `read_file { path: "apps/roleplay/docs/DATA-FORMATS.md" }` once, then act. Do not copy its tables into the skill or into chat.
5. **Plan the edits.** Decide all changes before writing: which `prompts[].content` change, which `prompt_order[].order[]` entries are added, moved, enabled or disabled, which sampler numbers change. A new section needs BOTH a `prompts` item and an `order` item in the order list the app reads: the one with `character_id` 100001, else the first non-empty one. Never add a second list.
6. **Apply in one call.** One `json_set` with every edit: content fields, order entries, sampler numbers. Never edit a preset twice for one task. Tell the user to change groups and conditions in the Presets page editor.
7. **Report.** What changed, what to try in a chat, in the user's language.

## Core craft rules

- **`prompt_order` is the truth.** Array order in `prompts` is storage; the model reads sections in `prompt_order[].order[].enabled` order. Locate blocks by `identifier`, never by array index.
- **Marker sections are slots, not text.** `main`, `charDescription`, `chatHistory`, `worldInfoBefore`, `postHistory` are filled by the app. A non-empty `content` on any marker except `main` REPLACES the filled text. Leave marker `content` empty unless the replacement is the point. A character card's `system_prompt` replaces `main`; its `post_history_instructions` fills `postHistory`. When a card and a preset fight, say so and let the user pick which wins.
- **Injections.** `injection_position: "absolute"` + `injection_depth` puts a section inside the chat, that many messages from the end. Without it the section sits where the order places it. Depth counts messages, not exchanges.
- **One question, one place.** A rule repeated in three sections reads as three tasks. Before adding a rule, check whether another active section already covers it. When two sections answer the same question differently, the model averages them; fix the conflict, not the wording.
- **A section with no trigger is a per-turn task.** Untriggered "when relevant" blocks push every response. Give every optional block a `Trigger:` line and a "otherwise do nothing" close, or move it behind an off-by-default toggle.
- **Same topic is not a duplicate.** Before calling two blocks redundant, compare them line by line. Each usually carries one unique sentence; move it before deleting the rest.
- **"Modern models don't need this" is a hypothesis.** Distilled models inherit slop from their teachers. Anti-slop lists, anti-quoting rules, and perception physics stay relevant until an A/B test shows otherwise. Keep the rule when in doubt.
- **Toggleability is not a cut reason.** Separate-but-similar modules exist so the user can switch them independently. Cut only text with no instruction: headers, empty intros, verbatim duplicates.
- **Literal task wording beats metaphor.** "Weave the tapestry of the story" is decoded as atmosphere by weak models and leaks words like "tapestry" into prose. Write what to do, when, and what not to do. Keep every style and nuance; change only how the block says it.
- **Options per chat are variables.** A block some chats want and others do not becomes a `toggle` variable in `studio.variables` plus `condition: "<name>"` on that section in `studio.sections` (the entry whose `id` is the section's `identifier`); a style axis (POV, tense, length) becomes a `choice` variable read as `{{name}}` or in `{{#if name == "value"}}…{{/if}}`. The user picks them per chat in the chat's Preset panel. Fields: DATA-FORMATS.md, "Variables". Never delete a block because only some chats need it.
- **The engine rolls dice, never the model.** If a preset asks the model to invent a random result, use the engine's macros instead: `{{roll:1d20}}`, `{{random::a::b::c}}`, `{{pick::a::b}}` (stable per chat). An LLM is a biased RNG.
- **Anti-omniscience is standing, not per-scene.** One "nobody saw" line drowns in history. Write the knowledge rule once in a high section: a character knows only what it witnessed, was told, or can infer, with perception limits (about 120° vision, walls muffle sound).
- **State stays bounded.** Persistent trackers should carry forward and apply only the change ("Trust +1: event"), never re-score everything fresh. Re-scoring drifts all numbers upward in any pleasant scene.
- **Samplers: the model's come first.** On engines with model parameters the workspace `model-params.json` (block `chat` of the model in use) wins over the preset's samplers unless the preset has `samplers_override_model: true`; the preset only fills fields the model leaves unset. When a user complains about repetition, short replies, or rambling, read BOTH: `model-params.json` (read only: it is protected; changing it asks the user, so suggest the change and point to Settings, under the model) and the preset's sampler fields. Change preset samplers in the same `json_set` as the prompt edits.
- **Read DATA-FORMATS.md for anything else.** The spec changes. Do not guess field names.

Load `references/design-invariants.md` before redesigning a preset's architecture or building a stateful tracker.

Load `references/audit-and-modernize.md` before auditing a large preset, shrinking one in place, or comparing two presets to borrow blocks.

Load `references/literal-rewrite.md` when a preset has persona framing, metaphorical rules, visible thought modules, mood-only styles, or theme/target families that need concrete rewrites.

Load `references/porting.md` when porting ideas from a SillyTavern-style preset export into this app's preset format.

## Final checklist before writing

Run in the head, not with tools:

1. Every changed `identifier` exists in both `prompts` and `prompt_order`, in the order list the app reads (100001, else the first non-empty one).
2. No marker section got an accidental non-empty `content`.
3. Every new in-chat section has absolute position and a depth.
4. No rule answers a question another active section already answers differently.
5. Every optional block has a trigger or is off by default.
6. No metaphorical vocabulary left in edited blocks.
7. Samplers were read before a style complaint was answered with prompt edits.
8. The `json_set` contains every edit; no second call planned.

Tell the user: what changed, which block now owns which rule, what sampler values changed if any, and what to try in a chat.
