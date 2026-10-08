# Design invariants for Roleplay presets

Apply these without re-deriving them on every pass. Each rule states what it is for and when it binds.

## The engine rolls dice, never the model

An LLM asked to "roll d20" returns a biased number that fits its narrative preference. When a preset needs randomness, inject it as a concrete result the model only applies. In this app the engine expands dice and choice macros before the model sees the prompt: `{{roll:1d20}}` (or `2d6+1`), `{{random::calm::storm::fog}}` (new pick every time), `{{pick::a::b}}` (picked once, kept for the chat). Write the table, let a macro choose the row, and tell the model to apply the result. Never leave "roll for surprise" in a prompt.

## State goes to a bounded tracker, not to prose memory

A model that re-reads six stat numbers from chat history drifts them all upward in any pleasant scene, because "re-evaluate" reads as "find something that changed." Two rules fix this:

- Carry forward by default: copy the previous numbers and apply only deltas listed on a change-log line. `none` is the normal result.
- Cap frequency: Routine scenes move at most one stat by 1; Significant scenes are roughly 1 in 10 responses. Do not let the model classify significance itself without a frequency bound.

Never write "if the scene mattered, a stat probably moved." That is inflation pressure.

Keep the tracker after the prose so each delta is judged against what the response actually wrote. Delete rules that reference history longer than the context window the model can see.

## Progression ownership is explicit; never the user's job

The most common RP failure is the model offloading momentum: "what do you do next?", stalling, waiting for ideas. The preset must own progression in every section that touches pacing. A response ends on an open question between characters, a new event, or a completed beat that invites reply — never on a question TO the user about what should happen. When the user's character must decide, that decision is the beat; the model writes everything up to the decision point and stops without narrating the decision.

## Anti-omniscience is a standing gate

Writing "nobody saw it" into the scene where the user does something unobserved fails: the line drowns, and three turns later an NPC knows the secret. Put the knowledge rule once in a section near the top of the active order:

- A character knows only what it witnessed, was told, or can infer from evidence.
- Perception is physical: about 120° forward vision, walls and doors muffle sound, voices carry about 10–20 m.
- A reaction to knowledge the character cannot have is an error, even if the knowledge is in the chat history.

This binds every character, including the narrator's view of the user's private actions.

## Fewer sections beat more sections

Every enabled section is read on every response. A section that repeats a rule costs tokens and lowers compliance with the original. Before adding a block, ask: does an active section already own this? If yes, edit that section. A preset with 12 active sections all pushing "something must happen" produces over-eventfulness; one section with a clear trigger produces the same effect when needed.

## Selectable surface is product, not weight

Toggles the user can switch are features. Defaulting a module OFF is not the same as removing it. When modernizing, preserve every genuine selector (style, POV, NSFW level, display modules, trait trackers) as an off-by-default section or a single-select family. Cut only text that carries no instruction.

When a family is mutually exclusive, it must be one question with one answer. If tiers each set a different axis (one sets explicitness, one sets pacing, one sets theme), they are not tiers; split them into one axis each, so any combination can be expressed.

## Killswitches are per-model, not monolithic

A fix that stops Gemini from staccato-chopping may make DeepSeek terse. When a preset carries model-specific fixes, keep them as separate off-by-default sections named after the symptom they fix. The user enables the one that matches their current model. Do not merge them into the core.

## Depth-0 gates are the last word

A style rule placed high above a long chat dilutes, and the model imitates its own earlier slop. A short preflight at `injection_depth: 0` (absolute, so it sits immediately before generation) can restate the three rules that matter most in the final assembled prompt. Keep it to signposts, not a second constitution. A gate at depth 0 outranks every level above it, so make it defer to active levels when a level sets a different number.
