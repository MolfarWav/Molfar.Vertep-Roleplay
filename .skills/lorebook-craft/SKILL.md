---
name: lorebook-craft
description: Use when creating, expanding, fixing or planning a Roleplay lorebook (world info): a world from zero, new entries, lore that feels flat or does not fire. Triggers: "зроби лорбук", "розшир світ", "лор не спрацьовує", "create a lorebook", "world info entries".
---
# Lorebook Craft

Without a plan, lorebooks become a pile of isolated nouns: entries that never fire, duplicate facts spread across files, and hidden truth leaking into every message. This skill builds and fixes lorebooks as one system: plan the entries first, write them in one or two tool calls, check consistency in the head.

## Procedure

1. **Plan in the head before touching files.** Decide: new book or existing, which character links to it, and the entry list with purpose, anchors, and visibility. For a big world, show the user a short outline (entry titles only) and let them confirm. Never read app source code to do this.

2. **Load format details only when needed.** The fields this procedure touches: `entries`, `settings`, `uid`, `keys`, `status`, `content`, `position`, `order`, `secondaryKeys`, `group`, `sticky`, `cooldown`, recursion flags, `/studio/linkedLorebookIds` on the card. For any other field, or to check what one of these means, `read_file` `apps/roleplay/docs/DATA-FORMATS.md` once.

3. **New book — write a small skeleton, then append entries.**
   - One `json_get` on `apps/roleplay/data/lorebooks/_example.json` for `/settings`.
   - One `write_file` to `apps/roleplay/data/lorebooks/<id>.json`: `id`, `name`, `globalActive: false`, `entries: []`, `settings` from the example.
   - One `json_set` with one `append` to `/entries` per planned entry.
   - One `json_set` to append the book id to `apps/roleplay/data/characters/<character-id>/card.json` at `/studio/linkedLorebookIds`.

4. **Existing book — read entries, then edit in one call.**
   - One `json_get` on `apps/roleplay/data/lorebooks/<id>.json` for `/entries` (or the shape if the book is huge).
   - One `json_set` with all edits as `/entries/<index>/<field>` pointers.

5. **For architecture-heavy work**, load a reference before planning:
   - New substantial world: `references/world-spine.md`, then `references/entry-plan.md`.
   - Expanding or auditing an existing world: `references/consistency.md`, then `references/entry-plan.md`.
   - Fixing a flat or non-firing book: `references/entry-plan.md` only.

6. **Run the final checklist in the head** (no tool calls). Fix problems by editing the entry plan, not by adding more entries.

7. **Tell the user briefly** what changed and what to try in a chat.

## Craft rules

- Plan before prose. Each entry needs a purpose: a decision, behavior, or continuity problem it supports. Split when subjects activate in different contexts; merge when two entries always appear together.
- One topic per entry. Content is short, concrete, and answers what the thing is, how it connects to other canon, and what changes when it becomes relevant.
- Anchor entries. Each important entry connects to at least two other canon elements: a structural anchor (rule, boundary, institution) and a relational anchor (dependency, conflict, history, consequence). Name-dropping is not anchoring.
- Design keys for how people type. Ukrainian and Russian keys list inflected forms. Include the English or Latin name if the story uses one. Avoid broad common words that cause false positives.
- Keep constant entries few and short. Use them only for load-bearing facts that must apply every message. Do not use probability to hide a structural dependency.
- Separate knowledge layers: what is objectively true, who knows it, who believes a false version, and what evidence exists. Do not leak hidden truth through omniscient prose.
- Stable lore vs state. Lorebook content holds stable or slowly changing knowledge. Current location, inventory, relationship scores, and active conditions belong in chat state, not lorebook entries.
- Respect the token budget. Entries compete for context. `order` decides what survives when the budget runs out; give higher order to entries that matter most in active scenes.
- A flat book is not fixed by adding nouns. Diagnose the missing layer: no governing pressure, entries with no anchors, all facts equally visible, mechanics with no lived consequences.

## Reference files

- `references/world-spine.md` — load for a new substantial world: governing logic, topology, tensions, consequence chains.
- `references/entry-plan.md` — load when planning entries, designing keys, deciding constant vs keyed, recursion, and budget.
- `references/consistency.md` — load when expanding or auditing: canon ledger, contradiction classes, drift repair.

## Final checklist

Run in the head before the final write:

- Every planned entry has a purpose and at least one trigger scenario.
- Keys include inflected forms the user will actually type; no broad false-positive words.
- Constant entries are few and short; the rest are keyed or vectorized.
- Each important entry has two meaningful anchors, not just names mentioned.
- Hidden truth is not written into entries public characters would not know.
- No mutable state (inventory, relationship score, current location) stored as lore.
- Entry order reflects priority under token pressure.
- The book id is linked to the character card after creation.

Tell the user: what was created or changed, which book is linked, and one sentence on what to try in a chat (for example: mention the key phrase to trigger the new entry, or start a scene that crosses a boundary the entry defines).
