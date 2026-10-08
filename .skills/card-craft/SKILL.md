---
name: card-craft
description: Use when creating a new character card or improving an existing one (depth, first message, examples, flat or repetitive behavior). Triggers: "зроби картку персонажа", "покращ персонажа", "персонаж плаский", "new character card", "improve my character", "fix first message".
---
# Card Craft

A card without a causal character core, a demonstrated first message, and gate balance will feel flat, scripted, or out of character within a few replies. This skill builds or repairs cards as one coherent behavioral system, not a list of traits.

## Procedure

1. **Frame the request.** Identify: new card or existing, character idea or canon, language, intended player role, and the known failure (flat, repetitive, speaks for the user, out of character). Ask at most one compact question when a missing choice changes the result.
2. **Load the card and the format.** For an existing card, one `json_get` with every text pointer: `/name`, `/description`, `/personality`, `/scenario`, `/first_mes`, `/mes_example`, `/alternate_greetings`, `/tags`, `/creator_notes`, `/system_prompt`, `/post_history_instructions`, `/extensions/molfar_card_type`, `/studio/descVariants`, `/studio/personalityVariants`, `/studio/scenarioVariants`. Never request `/avatar` or `/studio/avatar`. The fields this skill writes are named below; `read_file` `apps/roleplay/docs/DATA-FORMATS.md` once only for another field. Load at most the references the task needs: `references/depth-method.md` for a serious, flat or long-arc character or an ensemble; `references/first-message-and-examples.md` when writing or fixing `first_mes`, greetings or `mes_example`; `references/review-checklist.md` when the user asks for a review of a card. Then plan the text in your head before writing.
3. **Design the behavioral core.** For the lead (and each recurring character in a group card): one formative pressure, surface/true/refused goals, one or two meaningful fears, two or three drift vectors (the list is in the Core craft rules below), and one inner contradiction. Skip a full psychological build for minor NPCs; give them a goal and one voice marker.
4. **Write the field texts.** `description`: identity, appearance, world, current pressure. `personality`: thinking, feeling, protective strategies, registers, change conditions. `scenario`: the living-world four beats. `first_mes`: demonstrates ordinary length, register, and an actionable ending. `mes_example`: three exchanges covering two registers, one under pressure. Never write the player's thoughts, dialogue, or decisions.
5. **Write the card in as few calls as possible.** New card: one `write_file` to `apps/roleplay/data/characters/<id>/card.json` with `spec`, `name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`, `alternate_greetings`, `tags`, `creator_notes`, and `extensions.molfar_card_type` when relevant. The id is lowercase latin with dashes. Do not write `avatar`. Existing card: one `json_set` with an edit for every changed pointer. If the user wants to keep the old text, write a variant under `/studio/descVariants`, `/studio/personalityVariants`, or `/studio/scenarioVariants` instead of overwriting. Never touch `/studio/avatar` or `extensions.molfar_soul`.
6. **Run the checklist in your head** (next section). Fix issues by editing the planned text before the write; do not re-read the file to verify.
7. **Tell the user** what changed, where the card lives, and one concrete thing to try in a chat to feel the difference.

## Core craft rules

- **Split description and personality.** Description is who and what (appearance, role, world, current situation). Personality is how they think, feel, and behave. Do not repeat facts from one in the other.
- **Behavioral gates are a budget.** Every "always does X", "never does Y", or fixed reaction is a gate. A good card has 2 mechanics (must-happen moments) + 3 tendencies (leans this way) for behavior, 2–3 limits, and 3 voice samples at most. The more gates, the more explicit open space you must give: "Invention, inconsistency under pressure, and unlisted facets are welcome. Never reduce this character to a checklist."
- **Causality over trait lists.** Every important trait must connect to a formative pressure and change observable behavior. A trait that never changes a choice is inert prose. Cut it.
- **Known-IP characters.** Name the source work explicitly (`From [work] by [author]`). Treat trait lists as recognition anchors, not a script; add the counter-clause above. The model already knows the character; the card's job is to focus that knowledge, not replace it.
- **Drift vectors define the edges.** Choose the two or three most likely failure directions for this character (sycophancy, relationship override, competence collapse, assistant leak, stall, player authorship) and write a positive anchor for each. Put anchors in `personality` and demonstrate them in `mes_example`.
- **Living-world scenario.** The `scenario` field has four beats: a one-sentence premise with its binding rule; an inciting situation that just happened; a relationship that starts at zero or stays undefined; and a final paragraph stating that NPCs and the world continue without the player. That final paragraph is the highest-leverage line against the world shrinking to a two-person stage.
- **First message is a contract.** It must show ordinary reply length, the intended prose/dialogue ratio, the opening register, and an ending the player can act on. A long atmospheric monologue teaches the model to write long atmospheric monologues forever. When in doubt, keep the opening near ordinary length.
- **Examples prevent drift better than rules.** `mes_example` blocks demonstrate how the character handles warmth plus conflict, disagreement, pressure, and ordinary turns. Show the positive anchors in action. Use `{{user}}:` and `{{char}}:` turns separated by `<START>`.
- **Language follows the field.** Write every field in the language of the existing card or the one the user asks for. Dialogue examples mostly in that language.
- **Group cards.** Each member needs one goal, one voice marker, and one relationship-specific behavior. The opening belongs to the card as a whole. Run the voice-blind test: with names removed, a line should still suggest its speaker.
- **When the world outgrows the card.** If setting, cast, factions, or recurring knowledge no longer fit in the card without bloat, say so and load the `lorebook-craft` skill for the world. Do not stuff the card.

## Checklist (run in your head before the final write)

- Every field has one owner; no fact is repeated in `description` and `personality`.
- The card never writes the player's thoughts, dialogue, decisions, or voluntary actions.
- The character has a scene-level goal that does not wait for the player.
- Drift anchors are written as positive behavior, not only prohibitions.
- The first message is near ordinary length and ends on an actionable beat.
- `mes_example` covers two registers and shows behavior under pressure.
- Gate budget holds: at most 2 mechanics + 3 tendencies + 3 voice samples + 2–3 limits, and open space grows with the gate count.
- Relationship change has observable conditions and costs, not a turn counter.
- No field restates the data format; when a needed field is unknown, the format doc was read rather than guessed.
- If `extensions.molfar_card_type` exists, it matches the actual card shape and was not copied blindly.
