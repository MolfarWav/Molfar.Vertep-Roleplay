---
name: card-habits
description: Use when the user asks to suggest, write, review or tidy a Roleplay character's habits (the "Habits" block of the card's Memory tab): short rules for how the character acts, reused in every chat. Triggers: "навички персонажа", "запропонуй навичку", "скіл для картки", "як вона поводиться", "card habits", "suggest a habit", "behaviour rules for this character".
---
# Card habits

A card's habit is NOT an ability ("reads lips", "casts fire"). It is a short rule block for how and what the character does in a situation: a habit, a reaction, a way of acting that should hold in every chat of the card. Like your own habits, in small: a name, a few lines, an optional "when". The user confirms each one; the app puts the confirmed, switched-on habits into every chat of the card as one small part of the prompt (about 250 tokens in all), so every habit must earn its place.

## What a good habit is

- Behaviour you can act on: "When someone threatens her, she says nothing and keeps working. She never raises her voice." Not a trait ("is calm"), not a fact ("lost her brother"), not a line to quote.
- Reusable: true in any story with this card. A thing that happened once belongs in the card's stories (Litopys), not here.
- New: not already said by `description`, `personality`, the Soul or another habit. A habit that only repeats the card is dropped by the app, so writing it is wasted.
- Short: 1-6 lines (up to 700 characters), a name up to 80 characters, `when` one short line (up to 160), only if it really limits the rule ("a threat is spoken"). Third person or the character's name; no "you".
- At most 30 habits on a card; aim for 3-8 that matter. Suggest at most 4 at a time.

## Procedure

1. **Read, once.** One `json_get` on `apps/roleplay/data/characters/<id>/card.json` with `pointers: ["/name", "/description", "/personality", "/scenario", "/extensions/molfar_profile"]`, and one on `apps/roleplay/data/characters/<id>/memory.json` with `pointers: ["/habits", "/nextHabit", "/sources"]` (the file may not exist: then there is nothing yet). A story in `/sources` (its `arc`, `facts`, `said`) is the best ground for a habit: what the character did that should become a habit. If the user names a chat, say that the Memory tab can import it first; do not read the chat files.
2. **Think in the head.** List 2-4 candidates, drop what repeats the card or an existing habit, drop one-off facts.
3. **Write proposals, never accepted habits.** New file: `write_file` `{"v":1,"sources":[],"habits":[]}` first. Then ONE `json_set` with one `append` to `/habits` per habit:
   `{ "id": "k<n>", "name": "...", "rule": "line one\nline two", "when": "...", "on": true, "origin": "molfar", "state": "proposed" }`
   where `n` is above every id already in the file and above `nextHabit`. When a habit comes from a story add `"from": { "chatId": "<id>", "title": "<the story's title>", "at": 0 }`.
4. **Report in a few lines**: the names and one line of rule each, and that they wait in the card's Memory tab, block Habits, under "Waiting for your yes", where the user accepts, edits or dismisses them. Nothing reaches a chat before that.

## Changing what exists

An accepted habit belongs to the user. Do not edit or delete one unless they ask; if they do, change that habit's fields with `json_set` on `/habits/<index>/<field>` and leave `state`, `on` and `origin` alone. To suggest a better wording, write a new proposal and say which habit it replaces.

## Do not

- Do not copy habit text into `description`, the Soul or the lorebook: the app already avoids saying a line twice, and a second copy only costs tokens.
- Do not write `state: "accepted"`, ever.
- Do not read the app's code or the chats to find "what she does"; the card, its profile and its stories are enough. If they are not, ask the user one question.
