# Literal rewrite of persona-framed or metaphorical presets

Use when a preset addresses the model as a named persona ("You are the Weaver"), writes rules as metaphor ("sever that thread"), or has mood-only styles. Goal: precise task wording with the SAME breadth. Do not cut features.

## Why

- Persona framing was a soft jailbreak and voice stabilizer for old models. Current models do not need it, and it adds a role-play layer between rule and execution.
- Models copy vocabulary from the system prompt into prose. Words like "tapestry" and "weave" are known slop; the anti-slop block often fails to ban the very words the preset seeds.
- A metaphor is decoded differently per model; weak models read it as atmosphere and ignore it.
- Literal wording reduces misreading. Long-chat drift comes from history outweighing the system prompt, which needs depth-placed rules and trackers, not wording alone.

## Rewrite rules

1. **Addressee.** "You" is the narrator. Remove personas, gods, and first-person mandates.
2. **Vocabulary map.** Persona name → narrator. weave/tapestry → story, response, scene. thread → plotline, detail. Keep "the Human", `{{user}}`, `{{char}}`.
3. **Per-block contract.** Each block states what to do, when it applies, and what not to do.
4. **Checkable actions only.** Replace mood phrases ("timeless pace") with verifiable actions ("end the scene on an open question between characters").
5. **Neutral examples.** Models copy examples verbatim. Make genre-specific devices conditional.
6. **No lost payload.** Every original rule maps into the new text or is reported as dropped, with the reason.
7. **Wrapper tags are structure.** Renaming layout tags is safe. Renaming emitted tags (tracker ledgers matched by regex) must change the emitting template and every matching regex together.

## Roles first

Define roles in the first block that uses "the Human", which is often a primer above the core. Include:

- The Human is the real person; plays `{{user}}`.
- You are the narrator, co-writer; write the world and every character except `{{user}}`.
- `{{char}}` is the card's main character or characters, not the title text.
- NPCs are everyone else.

Do not hard-code control of `{{user}}` in Roles. A Control Directive family (Human-only, Guided, full-auto) sets that. Write "Control over `{{user}}` as defined by the active Control Directive; by default belongs to the Human." The Human's newest explicit OOC instruction stays first in priority.

## Style-family review

For each selectable style, judge whether a model can execute it:

- Concrete instructions (sentence length, dialogue format) work. Mood-only styles do not; rewrite into devices.
- Separate three axes: Formatting (how text looks), Style (how it is written), Length (budget and time covered). Each family controls only its axis. Length blocks that carry manner rules ("tight punchy dialogue") fight the selected style; move manner out of Length.
- Pull formatting out of styles into one format section: classic RP (`*actions*`, `"dialogue"`) or prose (unmarked narration), with an optional speaker-tags add-on. Both formats forbid separately marked thought lines.
- Check each style against active core rules: momentum vs pacing gate, POV, anti-slop, thought bans. A style that forces first person silently overrides the POV selector.
- A style helps only if it changes something visible. One active style is 150–200 tokens; the risk is contradiction, not size.

## Thoughts: hidden channel, never visible lines

Visible character thoughts leak into chat history; the model reuses them as dialogue and NPCs react to unspoken content. Keep the value through a hidden block:

1. Delete colored/stylized thought modules; strip thought mentions from display modules.
2. Add one block that emits `<inner_voice character="Name">…</inner_voice>` after the story text: first person, at most about 50 words, per present non-user character with something worth thinking, character knowledge only, private. Ban repeating a thought as dialogue or narration.
3. Name the tag something other than `thoughts` or `thinking` (frontends parse those as reasoning).
4. Offer a regex script for the tag (`apps/roleplay/data/regex/`, copy `_example.json`): placement `display` hides it on screen, placement `prompt` with `minDepth` strips it from older messages the model reads back. Add it only when the user agrees.

## Theme/goal families → Story Focus

Whole-story theme families ("guide the narrative to pose a moral question") get ignored or played on-the-nose. Rebuild as:

- **Focus = what the scene spends its text on.** Single-select, one or none. Each focus is a turn-level choice rule: "when a moment can go either way, choose X; avoid Z". Candidate set: Humor, Romance & Bond, Intimacy, Action, Drama & Conflict, Mystery & Intrigue, Everyday Life, Deep Questions.
- **Modifiers = how the scene is coloured.** Multi-select, usable with any focus. Write each as "whatever the scene is doing, add X". Never "guide the narrative toward X" — that is a second focus.
- Keep other axes out: pacing, world, harshness, explicitness, prose craft. A focus never raises explicitness; that belongs to the NSFW level.
- Resolve modifier conflicts with one priority rule: focus > modifier; inside a scene of its own group the home modifier wins; otherwise the one that fits the moment wins, and the loser yields for that moment only.

## Triggered tools, not standing drives

A block with no trigger is read as a task every response. Restructure sections into one PICK ONE level (the constant setting) plus tools whose text opens with `Trigger:` and says "otherwise do nothing". Drop hard timers; they turn a tool into constant pressure.

Examples:

- Pacing: levels Glacial / Slow / Natural / Fast, plus triggered tools Time Skip (Human-requested only), Quiet Beat, Cliffhanger (scene end only).
- World: one gap-filler block for when the card is silent, plus genre blocks OFF by default with Core + Texture template; at most two genres, the second contributes Texture only.
- NSFW: explicitness levels such as Fade / Sensual / Explicit. The level sets HOW a scene is written, never WHETHER it happens. Triggered tools: Intimacy Craft ON; Stamina & Aftermath, Multisensory, Nonhuman Bodies OFF. Merge per-species anatomy into one card-first block.
- Length: ceilings, not targets. Stop early when the beat is done; never pad to reach a number; short dialogue lines do not count toward paragraph limits. Delete "Rigid" variants — models cannot count words exactly, and the real hard cap is the API max-tokens setting.

## Contradiction review after every draft

Check against known failure shapes:

- PICK ONE blocks must be self-contained ("Everything in Explicit, plus…" is empty when Explicit is off).
- A tool must not contradict a level.
- A premise vs base rules: a base rule written for "everyone" also binds the premise's outsider; scope it to locals.
- "Overrides any tool below" does not reach blocks placed above it. Write such lines as structure, not triggers.
- A block against its own stated purpose.
- A header promise the block does not keep.
- Rules that pin the character or world beyond the card; defer to the card.
- A "simply/plainly" rule with no examples; add 3–4.
- Time-moving tools that narrate what `{{user}}` did, breaking the Control Directive. Trigger only on a Human-requested skip.
- The last-read gate at depth 0 beats every level above it. Make it defer to the active level.
- Two tools at opposite levels. Scale the tool per level.

Apply fixes as a separate `json_set` after the user approves the drafts. Report only real contradictions, not taste.
