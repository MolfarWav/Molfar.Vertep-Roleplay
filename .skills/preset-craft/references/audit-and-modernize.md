# Audit and modernize a preset in place

## Fast audit of a large preset

Goal: produce a diagnosis in one pass, not a row-by-row catalogue.

1. `json_get { path, pointers: ["/prompts", "/prompt_order"] }`.
2. Resolve the ACTIVE order: the `prompt_order` entry with `character_id` 100001, then any non-empty one. Read enabled identifiers in order.
3. Pull every enabled section's `content` with one `json_get` (or two if the value came back as a shape).
4. Count active characters, not active sections. Empty sections, headers, and placeholders exaggerate the real rule count.
5. Reconstruct the core in plain language: what does the assembled prompt actually instruct, in reading order? Do not quote block names.
6. Build a contradiction table across active AND selectable modules: agency vs POV variants, forced momentum vs pacing gates, a style that forces first person, two sections that both define endings, a "combine all active tiers" receiver when tiers are single-select.
7. Check the sampler fields. A preset that rambles or stalls may have a sampler problem, not a prompt problem.
8. Report: decisive diagnosis first, then active core summary, then conflicts with exact identifiers, then the smallest fix list. Keep the full text dump as an appendix or omit it.

## Modernize in place

1. Read the active target completely: the selected order plus every enabled block's text. Never prune from names.
2. Two independent checks before deleting anything:
   - Structural: every `prompt_order` reference to the block, every other block that names it, wrapper open/close pairs.
   - Semantic: which behaviors the block really owns. Compare line by line with the block you think covers it. Same topic is not a duplicate; each block usually has one unique sentence.
3. Present candidates as a table: identifier, unique payload, verdict (cut / merge / keep / user's taste), savings estimate. Let the user pick rows. Execute exactly the approved rows in one `json_set`, then stop.
4. When merging, move every unique sentence from the removed block into the kept one before deleting. Renumber lists.
5. When deleting a section that owns a wrapper tag, transfer the wrapper close to the next retained section and verify balanced counts.
6. Prefer one compact replacement under a stable existing identifier. Delete superseded objects and their order entries; do not leave an off-by-default graveyard.
7. Replace visible reasoning transcripts with a silent preflight at depth 0: 8–12 terse signposts covering latest user intent, agency, scene continuity, POV limits, character fidelity, next beat, physical plausibility, and output constraints. Forbid visible analysis and checklist narration.
8. Preserve toggle independence. Two modules that look similar exist so the user can switch them independently; merging them removes a product feature.
9. After the edit, verify in the head: every order identifier exists, no deleted name remains, wrapper counts balance, the replacement is active at the intended depth. Do NOT read the file back with a tool; the json_set result is the verification.

## Compare before borrowing

Use when the user asks what another preset contributes. Read-only.

1. Resolve the target's active order and read the blocks that govern the candidate's domain.
2. Read the source preset. Exclude formatting, regex, display markup, and reasoning transcripts unless explicitly asked.
3. For each candidate, answer three questions: unique payload (exact rule absent from the target), compatibility (which active target blocks it reinforces or fights), causal benefit (what concrete failure it reduces). Same topic is not enough; quote the unique rule.
4. Verdict: borrow / borrow compact core / keep source-only / reject. Never import a whole block by default; carry only the minimal semantic rule that survives the target's ownership, POV, agency and continuity model. Strip source-specific tags, macros, and jailbreak language.
5. Run an adversarial second pass over the borrow rows against all active target rules. Downgrade when the benefit is already supplied or the block would add another compulsory engine.
6. Report shortlist and rejected near-misses separately. State it is a static review, not behavioral proof; A/B test before calling a borrowed rule successful.
7. Wait for the user's selection. On approval, edit only those rows in one `json_set`.

Pitfall: eloquence is not novelty. A director-style preset often says the target's existing rules more cleanly; importing the whole prose duplicates pressure without adding behavior. Borrow only the rule the target genuinely lacks.
