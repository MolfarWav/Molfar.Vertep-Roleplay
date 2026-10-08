# Review Checklist and Stress Test

Use as a read-only review before the final write, after the card text is planned. Run in the head; do not re-read files to verify.

## Structure and ownership

- Each responsibility has one owner: `description`, `personality`, `scenario`, `first_mes`, `mes_example` do not restate each other.
- `description` holds identity and world; `personality` holds thinking, feeling, behavior. No duplication.
- The card never writes the player's private thoughts, dialogue, decisions, or voluntary actions.
- Unknown or imported fields outside the touched set were left alone.
- The id is lowercase latin with dashes; `spec` is `"chara_card_v2"`.

## Behavior

- No player authorship anywhere, including `first_mes` and `mes_example`.
- The character has a scene-level want that exists without the player.
- Every recurring NPC has an independent goal and scene-level initiative.
- Goals, fears, and drift anchors agree; no anchor restates a fear verbatim.
- Relationship change has observable conditions, tells, setbacks, and costs.
- Voices stay identifiable with names hidden; examples cover more than one register.
- The opening demonstrates ordinary length and ends on an actionable beat.
- Standing pressure appears through situation and behavior, not labels.
- Gate budget holds, and open space grows with the gate count.
- No fixed turn counter for relationship change.

## Scenario

- Premise has one binding rule.
- The inciting situation is concrete and recent ("just", "has just been").
- The relationship start is explicit: zero or undefined.
- The final paragraph states that NPCs and the world continue without the player.

## Efficiency

- Repetition and inert prose were cut before adding depth.
- Trait lists were replaced with causal links or compressed.
- The card does not restate the data format document.
- If the world no longer fits, the user was told to load `lorebook-craft`.

## Stress test (cold prediction)

Predict one or two outputs for a minimal prompt and check against the planned text:

- **Silence** (`*sits in silence*`): the card must not author the player's interior or next action.
- **Stall** (`.`): some current pressure or agenda must keep the scene moving.
- **Casual register** (a routine request): the response length and tone match ordinary play, not a cinematic monologue.
- **Disagreement** (disagree twice with a belief): the character defends the belief or accepts being disliked, not fold.
- **Conflict plus warmth** (warmth during an unresolved disagreement): conflict persists without consequence erasure.
- **Competence pressure** (a skilled character under emotional strain): skill changes shape, does not vanish.
- **Format durability** (three ordinary turns): the character stays in voice without a required block to maintain.

A predicted failure means the draft is missing a positive anchor or a demonstration, not that another prohibition line is needed.

## Report

Before the final write, hold a short mental report: card defects, likely drift surfaces, and the smallest fix for each. The written reply to the user stays short: what changed, where the card lives, one thing to try.
