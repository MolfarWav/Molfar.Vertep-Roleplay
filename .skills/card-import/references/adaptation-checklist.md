# Adaptation Checklist

Load this reference only when the card needs adaptation, not for a straight file import. It is the list of checks to apply while planning the write, before calling write_file or json_set.

## Text fields

- [ ] `description` has appearance and world facts, not personality rules.
- [ ] `personality` has how the character thinks, feels, and behaves.
- [ ] `scenario` has the starting situation, not backstory.
- [ ] `first_mes` opens the chat and gives the user something to react to.
- [ ] Extra openings are in `alternate_greetings`, not crowded into `first_mes`.
- [ ] Example dialogue is in `mes_example`, not `description`.

## Platform syntax

- [ ] HTML tags removed or converted to plain text.
- [ ] CSS and inline styles removed; their meaning kept only as plain text if crucial.
- [ ] Lua/trigger scripts removed; their effect described in prose or dropped.
- [ ] Image tags and asset references removed; report them.
- [ ] Macros this app does not run (see the Macros section of DATA-FORMATS.md) replaced with the plain meaning; `{{char}}`, `{{user}}`, `{{random}}`, `{{pick}}`, `{{roll}}`, `{{setvar}}`/`{{getvar}}` kept.
- [ ] Regex: carried over as a regex script only when the user wants it; if it guarded content, the content is a normal lorebook entry with plain keys.

## Behaviour rules

- [ ] Always-on rules are in `system_prompt` or `post_history_instructions`, not `description`.
- [ ] Binding limits are short and few.
- [ ] One clause says the traits are anchors, not a checklist.
- [ ] The world does not wait for the user: one sentence in `scenario` says NPCs and events continue on their own.
- [ ] Relationship start state is explicit.

## Lorebook

- [ ] One topic per entry.
- [ ] Always-on entries are few, short, and load-bearing.
- [ ] Keys include the inflected forms the user will type in the card's language.
- [ ] Framing lore `before_char`, supporting detail `after_char`; higher `order` for what must survive the budget.
- [ ] The book id is appended to the character's `/studio/linkedLorebookIds`.

## Preservation

- [ ] Unknown top-level fields kept.
- [ ] `extensions` kept with all its keys.
- [ ] Anything that could not be carried over is listed for the user report.

## Report

- [ ] What was created or changed.
- [ ] What to try in a new chat.
- [ ] One line about scripts, HTML, or assets that were dropped.
