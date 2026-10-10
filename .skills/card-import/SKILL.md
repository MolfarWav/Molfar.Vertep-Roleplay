---
name: card-import
description: Use only when the card or lorebook comes from another platform or as pasted card text into Roleplay (a new card from an idea is card-craft). Triggers: "імпортуй картку", "перенеси карту", "адаптуй картку", "import this card", "port this character", "convert this lorebook".
---
# Card Import

Without this skill, imported cards carry platform-specific syntax that this app does not run, lorebook entries land in the wrong fields, and scripts or HTML get silently lost. This skill reads foreign exports, maps them to this app's formats, and reports what could not be carried over.

## Procedure

1. Determine what the user has. If it is a FILE in a format the app imports (PNG card V2/V3 with embedded book, JSON card, chub.ai or CharacterHub link, SillyTavern world info, preset, backup), tell them: Characters page → Import button, or Marketplace page to search chub.ai. Stop there unless the import also needs adaptation.
2. If the user pasted text or has a format Import does not know (Wyvern lorebook export, RisuAI module, JanitorAI bio/definition, plain-text sheet), proceed by hand.
3. Load `references/platforms.md` once to identify the source layout and its field mapping. For a Wyvern lorebook, also load `references/wyvern-lorebook.md`.
4. Read `apps/roleplay/docs/DATA-FORMATS.md` once (read_file) before writing any field you do not know. Do not guess field names.
5. Read the source with one read_file (or json_get with many pointers if it is large). Extract everything in one pass.
6. Plan the adaptation against `references/adaptation-checklist.md`. Do not read more files.
7. Write:
   - New card: one write_file of a small JSON at `apps/roleplay/data/characters/<id>/card.json`. Fields go at the TOP level, not under `data`. Use a short id based on the character name.
   - New lorebook: one write_file of `apps/roleplay/data/lorebooks/<id>.json` with `"entries": []`, then ONE json_set appending every entry, then append the book id to the card's `/studio/linkedLorebookIds`.
   - Existing card or book: ONE json_set with all edits.
8. Keep unknown top-level fields and `extensions` of an imported card. Never strip them.
9. Tell the user what changed, what to try, and what could not be carried over.

## Core craft rules

### Field mapping

- Map source `description` content to the card fields that match its role: appearance and world go to `description`; inner traits, drives, and manner go to `personality`; the starting situation goes to `scenario`; opening words go to `first_mes`. If the source has one undifferentiated block, split it by content, not by source ordering.
- Voice samples go to `mes_example` (the best two or three). Side details and facts needed only in some scenes go to lorebook entries, not into the card body: a bloated card makes the model recite it.
- A source book's always-on entries become `status: "constant"`. Keep those few and short. Normal keyed entries become `status: "normal"`.
- Ukrainian and Russian keys match every form of their words: write one base form (`вежа` also fires on `вежі`, `вежу`, `вежею`). A key of several words fires when the words stand side by side in that order, each in any form. List extra forms only when the stem changes (`дім` / `дому`, `людина` / `люди`) and for words of 3 letters or fewer, which match only exactly. Do not transliterate; use the natural language of the card.

### Platform syntax to strip or replace

- Remove or neutralise: HTML tags and CSS in card text, image tags that resolve to nothing, Lua/trigger scripts. Macros: this app runs `{{char}}`, `{{user}}`, `{{random}}`, `{{pick}}`, `{{roll}}` and the `{{setvar}}` family (list in the Macros section of DATA-FORMATS.md): keep those, and write any other macro as its plain meaning. A simple regex can become a regex script here; report the rest.
- If an expression or script controlled behaviour, decide whether the behaviour belongs in `personality`, a lorebook entry, or `first_mes`. Do not reimplement scripts.
- Keep decorative content only if it survives as plain text. If it does not, drop it and report.

### Prompt and preset carryover

- If the source card has an always-on instruction block that applies to the whole chat, put it in `system_prompt` or `post_history_instructions`, not in `description`.
- `post_history_instructions` is sent after the chat history as the last instruction. Use it for one or two binding rules, not for world facts.

### What makes the result work

- `description` answers who the character is and what they look like; `personality` answers how they think, feel, and behave; `scenario` answers where and how the story starts.
- `first_mes` is the opening message of a new chat. It should set the scene and give the user something to react to. Alternate openings go in `alternate_greetings`.
- A character's traits are anchors, not a script. If the source is a dense trait dossier, add one clause to `personality` or `post_history_instructions`: traits are a starting point, not a checklist; the character may show unlisted facets.
- Scenarios must not wait for the user: the world and recurring NPCs continue, act on their own, and create consequences. One sentence at the end of `scenario` does this.
- Relationship start state is explicit. If the user and character begin as strangers, say so in `scenario` or `first_mes`. Do not let the model invent shared history.

### Lorebook craft

- One responsibility per entry. An entry answers what the thing is, how it connects, what changes when it becomes relevant.
- Always-on entries are load-bearing: world rules, a character's binding limits. Short, few, and placed before the character.
- Keys are terms the user or model will naturally type. Avoid broad common words that fire constantly.
- Placement: framing lore (world rules) `position: "before_char"`, supporting detail `"after_char"`. Within a position, higher `order` inserts later and wins when the budget runs out.

## Pre-write checklist

Run in the head, not with tools:

- Every source field has a destination; nothing important silently dropped.
- Unknown top-level fields and `extensions` kept.
- Platform syntax removed or converted to plain meaning.
- The card text is in the language of the source or the language the user asked for.
- Lorebook entries one topic each; keys in base forms (word forms match on their own).
- The book id lands in the character's `/studio/linkedLorebookIds`.
- The result fits the app's top-level card layout, not a nested `data` object.

## Tell the user

State what was created or changed, what to try in a new chat, and one line about anything that could not be carried over (scripts, HTML, assets).
