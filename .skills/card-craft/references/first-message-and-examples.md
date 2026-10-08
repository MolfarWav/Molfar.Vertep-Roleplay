# First Message, Examples, and Drift Vectors

Use when writing or repairing `first_mes`, `alternate_greetings`, `mes_example`, or when the card feels repetitive or generic despite a good personality.

## First message as a format contract

The opening is a scene and a strong demonstration. Anything structural that must persist should appear here or in an example.

Demonstrate:

- The intended prose/dialogue ratio.
- The intended ordinary reply length. A long atmospheric opening teaches the model to imitate that length forever. Keep the opening near ordinary length or add a shorter routine exchange in the examples.
- The opening register, without announcing a psychological summary.
- At least one standing pressure staged through action, environment, another person, or an obligation — not declared by narration.
- An ending the player can answer through action or dialogue: an NPC reaction, interruption, discovery, consequence, offer, or unresolved decision. Avoid a resolved summary and the repetitive "What do you do?"

Prefer a low-commitment opening for replayability: a real point of leverage the player may engage or ignore.

Alternate greetings expose meaningfully different pressures, relationships, or registers — not the same interaction in another backdrop.

Group cards: only the card as a whole carries the opening. The narrator may stage circumstances but never choose the player's response.

## Greeting test

1. Does the world have specific, relevant texture rather than a generic backdrop?
2. Would the character remain recognizable outside this location and premise?
3. Does established pressure affect present behavior without exposition dumping?
4. Is the pressure staged through the situation rather than declared?
5. Does the ending preserve player agency and offer more than one plausible response?

## Example dialogue

`mes_example` exists to demonstrate behavior, not to continue the greeting. Write three exchanges separated by `<START>`:

- One ordinary turn showing the baseline register and typical length.
- One under pressure, warmth plus conflict, or disagreement, showing the drift anchors in action.
- One showing recovery or a different register.

Rules:

- Turns are `{{user}}:` and `{{char}}:`. Never write the user's private thoughts or decisions; user turns can describe observable input or dialogue only.
- Keep user turns short and banal enough that the character's response carries the lesson.
- Show, do not describe. A poor example says "she was angry"; a good example shows the clipped sentence and the refusal.
- For groups, include one scene with at least two characters and run the voice-blind test.

## Drift vectors

A drift vector is a likely direction the model pulls a character when the card is silent. Choose only two or three exposed by this design. For each, write a positive anchor: where the behavior comes from, what it costs, what could change it, what the character does instead when the tempting generic response appears.

Common vectors:

- **Sycophancy:** stops disagreeing and mirrors the player. Anchor: a belief they defend and a situation where they accept being disliked.
- **Relationship override:** conflict vanishes when closeness appears. Anchor: how warmth coexists with unresolved conflict.
- **Competence collapse:** a skilled character becomes passive under emotion. Anchor: how competence changes shape under pressure without disappearing.
- **Voice convergence:** ensemble members settle into one register. Anchor: structural voice markers, not vocabulary.
- **Assistant leak:** offers options, summarizes, waits for instructions. Anchor: a scene-level agenda independent of the player.
- **Player authorship:** narrates the player's thoughts or actions. Anchor: observation-only language in examples.
- **Stall:** reacts and describes without changing anything. Anchor: a current want, deadline, intrusion, or consequence.
- **Instant moral normalization:** a difficult character becomes generic after one kind gesture. Anchor: how kindness is interpreted through their worldview and what real change requires.
- **Stock emotional language:** falls back on generic dramatic phrases. Anchor: character-specific verbal and physical habits.
- **False resolution:** closes scenes with a moral or summary. Anchor: unresolved, actionable endings in examples.

The anchors live in `personality` and are demonstrated in `mes_example`. A demonstrated anchor in the examples outweighs several new prohibition lines.

## Behavioral gates

Every specific reactive instruction is a gate. The more gates, the more scripted the model. The budget:

- 2 mechanics: critical moments where the character must respond a specific way (boundaries, hard stops, defining traits that cannot drift).
- 3 tendencies: directional, not prescriptive; the character leans this way but can surprise.
- 2–3 limits.
- 3 voice samples.

More gates require a literal open clause: "Invention, inconsistency under pressure, and unlisted facets are welcome. Never reduce this character to a checklist." Place it in `personality` and once inside each character dossier in a group card.

Specified outcomes close branches; specified mechanisms generate play. Cut biography and fixed world facts, keep psychological and reactive specificity.
