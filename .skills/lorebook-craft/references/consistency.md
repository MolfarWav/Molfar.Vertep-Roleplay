# Consistency, Expansion, and Drift Repair

Load when expanding an existing book or auditing one that feels contradictory or flat.

## Canon-fact ledger

Maintain a short mental ledger of load-bearing invariants: facts whose silent change would break identity, chronology, causality, geography, institutions, relationships, or system rules. For each fact, note when useful:

- scope;
- source authority;
- confidence or evidence status;
- known exceptions;
- dependent entries.

The ledger is a check, not a second lorebook. It lives in the head or a short outline, never as an extra lorebook file.

## Contradiction classes

Check new or changed entries against:

1. identity and naming;
2. chronology and age;
3. geography and travel;
4. system rules and exceptions;
5. institutional powers and limits;
6. faction wants and dependencies;
7. relationship history;
8. knowledge visibility;
9. cause and consequence;
10. adjacent entries.

Not every mismatch is an error. It may be rumor, propaganda, obsolete knowledge, deception, regional variation, or unreliable narration. Mark the interpretation explicitly in the entry's content rather than smoothing it away: "the harbor folk believe..." instead of silently presenting the belief as fact.

## Expand procedure

1. Read the entries relevant to the affected subsystem — the ones the new material will anchor to. One json_get on `/entries` is enough.
2. Refresh the mental ledger.
3. State what the expansion must add and what it must not change.
4. Run new elements through the world's governing logic, or explain the intentional exception.
5. Anchor each new entry backward into existing canon.
6. Check visibility: who knows, suspects, disputes, or misrepresents the addition?
7. Run the contradiction classes.
8. Surface conflicts and options to the user before committing canon-changing choices.
9. Write all changes in one json_set.

## Distinguish two failures

### Contradiction drift

New material conflicts with established facts or changes ownership silently. Repair by comparing against the ledger and getting an explicit user ruling on which version is canon.

### Flattening drift

New material is technically consistent but disconnected, generic, or inert. Repair by backward anchoring, consequence chains, visibility design, and named tensions. Adding detail does not fix flattening; connection does.

## Expansion hooks

Leave deliberate, bounded openings in entries:

- disputed account;
- unstable boundary;
- unresolved dependency;
- deadline;
- unclaimed resource;
- missing witness;
- institution with conflicting mandates;
- exception whose cause is unknown.

A hook should enable future additions without making current canon vague. Write hooks as questions or tensions inside entries, not as empty placeholders.

## Knowledge visibility

World truth and character knowledge are different layers. Track:

- what is objectively true in canon;
- who knows it;
- who believes a false version;
- what evidence exists;
- how the player could learn it;
- what changes if it becomes public.

Do not write omniscient prose into entries that public characters would not have access to. If the narrator is limited, the lorebook must not leak what the narrator cannot know.

## When to ask the user

Ask before committing canon-changing choices:

- two existing entries conflict and both are in active use;
- the expansion would retcon a fact the user's chats already depend on;
- the user asks for a change that breaks the world's governing logic;
- a hidden truth must become public, or a public fact must become false.

Do not ask about phrasing, key selection, or entry order; those are craft decisions.
