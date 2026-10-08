# Porting a SillyTavern-style preset into this Roleplay app

Use when the user brings a preset from SillyTavern or a similar frontend. A SillyTavern preset JSON
file goes through the import on the Presets page (or a backup zip): the shape is
the same, so tell the user to import it first and then improve it here. Port by hand only when the
user pastes sections as text or wants the ideas of a preset merged into one they already use.

## What carries over as it is
- Section text (`prompts[].content`), roles, markers, and `injection_position` / `injection_depth`
  (SillyTavern writes `injection_position: 1` for in-chat; here it is `"absolute"`).
- The reading order: the source's `prompt_order`, not the order of its `prompts` array.
- Samplers as top-level numbers. Extra samplers (`dry_*`, `xtc_*`, `mirostat_*`...) are sent when
  set: keep them only if the user's model provider supports them.
- Macros the app runs: `{{char}}`, `{{user}}`, `{{random}}`, `{{pick}}`, `{{roll}}`, `{{setvar}}` /
  `{{getvar}}` and their family (the Macros section of DATA-FORMATS.md). Other macros: rewrite as
  plain instructions, never leave an unknown `{{...}}` in text.
- Off-by-default sections stay off; single-select families stay single-select.

## What needs work
- Regex packs travel separately from the preset. A block that emits a tag for a regex to hide needs
  a regex script here (`apps/roleplay/data/regex/`, copy `_example.json`; placement `display` hides
  it on screen, `prompt` strips it from what the model reads). Ask the user before adding one.
- Persona frames and jailbreak phrasing: rewrite per `literal-rewrite.md`, state the plain
  instruction.
- XML-style wrapper tags are fine when they structure the prompt; keep open and close in balance.
- A huge `main`: keep the core rules in `main`, move optional blocks into their own sections so the
  user can toggle them.

## Procedure
1. Read the source once (`read_file`, or `json_get` of `/prompts` and `/prompt_order` if large).
2. Decide which sections carry, in which order, and what each loses (macros, regex, framing).
3. New preset: one `write_file` with `name`, `prompts`, `prompt_order` (one list,
   `character_id` 100000) and the samplers. Into an existing preset: one `json_set` that appends the
   `prompts` items and their `order` items to the list the app reads.
4. Report what was carried, what was dropped and why, and what to test in a chat.

## Pitfalls
- A section can be in `prompts` but missing from the order list, or present but disabled: carry
  only what was enabled, unless the user asks.
- Locate sections by `identifier`, never by array index.
- Marker sections with non-empty `content` replace what the app would fill in: check every marker
  you carry.
