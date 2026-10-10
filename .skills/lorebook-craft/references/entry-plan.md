# Entry Plan, Keys, and Budget

Load when planning entries, designing keys, deciding constant vs keyed, and fixing a book that does not fire.

## Plan before prose

For each proposed entry, record:

- **Purpose:** what decision, behavior, or continuity problem it supports.
- **Subject:** entity, rule, location, institution, relationship, event, custom, or disputed account.
- **Stability:** immutable canon, slowly changing condition, or current state (current state does not belong in a lorebook).
- **Visibility:** public fact, restricted knowledge, rumor, false belief, disputed history, or authorial truth.
- **Anchors:** at least two meaningful connections when the world is large enough.
- **Activation concept:** when this knowledge becomes useful during play.
- **Risk:** likely contradiction, duplication, spoiler leak, or over-broad activation.

Only after the plan is coherent, write entries.

## Entry classes

Common classes:

- governing rules and exceptions;
- places and boundaries;
- institutions and factions;
- important people as world actors;
- relationships between forces;
- history with present consequences;
- customs, law, economy, technology, or magic;
- terminology and names;
- restricted truth, rumors, and false models;
- expansion hooks and unresolved pressures.

Do not create one entry per noun automatically. Split when subjects activate under different contexts or contain different visibility levels. Merge when two entries would always appear together and repeat the same responsibility.

## Key design

Keys fire the entry when the user or model types them. Design for natural use:

- Ukrainian and Russian keys match every form of their words: write one base form (`вежа` also fires on `вежі`, `вежу`, `вежею`). A key of several words fires when the words stand side by side in that order, each in any form. List extra forms only when the stem changes (`дім` / `дому`, `людина` / `люди`) and for words of 3 letters or fewer, which match only exactly.
- Include the English or Latin name if the story uses one.
- Include aliases only when they add real recall; do not pad keys with variants no one will type.
- Avoid broad common words that cause false positives ("дім", "дорога", "місто" alone are too broad; "дім старої ткалі" is not).
- Use `secondaryKeys` with `AND_ANY` or `AND_ALL` when an entry should fire only in combination with another concept.
- Use `keysRegex: true` only for patterns word forms cannot express, and only when you are sure the regex matches only the intended text. Regex keys get no word-form matching.
- Test each entry mentally: the exact expected trigger, a natural paraphrase or alias, and a near miss that should not trigger.

## Constant vs keyed vs vectorized

- **Constant** entries are sent every message. Keep them few and short: the core premise the model must never forget, such as "this world has no electricity" or "the patron's curse blocks lying." If a fact can wait until the story touches it, it is not constant.
- **Keyed** (status `normal`) is the default for retrievable knowledge: locations, factions, customs, people, history. The model gets the entry only when it is relevant, saving context.
- **Vectorized** (status `vectorized`) fires by meaning, not exact words. Use for concepts the user will describe without the entry's exact terms, or for lore that should appear when the story veers close to its theme. Requires the book's `vectorized` settings to be configured.

Do not use probability to hide a structural dependency. If a fact must be known for the story to make sense, make it constant or keyed with reliable keys, not probabilistic.

## Order and budget

Entries compete for context. The book's `settings.contextPercent` and `budgetCap` limit how much room entries may take. `order` (default 100) decides insertion order and which entries survive when the budget runs out: higher order is inserted later and wins.

Give higher order to entries that matter most in active scenes: the current location, the active faction, the person being spoken to. Lower order to background history and rarely-triggered context.

## Groups

Entries in one `group` (with `groupWeight` or `groupPrioritize`) allow only one to fire at a time. Use groups for mutually exclusive states of one subject, such as a faction leader's public reputation vs private guilt, or a room in its clean state vs after a search. Do not group unrelated entries.

## Recursion flags

- `nonRecursable: true` — the entry's content cannot trigger other entries. Use for entries whose text names many other lore terms but should not cascade.
- `preventFurtherRecursion: true` — stops the scan chain after this entry fires. Use for terminal facts that close a topic.
- `delayUntilRecursion` — for entries that should only appear when another entry has already fired.

These flags keep a chain of entries from flooding context. Use them deliberately, not on every entry.

## Stable lore vs state

Lorebook content holds stable or slowly changing knowledge. Current location, present inventory, relationship score, active condition, open task status, and rapidly changing ownership do not belong in lorebook entries. If the story needs such state, it lives in the chat or a separate tracker, not in world info.

## Audit tests

Flag and fix:

- island entries with no meaningful anchors;
- duplicate ownership across card, lorebook, and scenario;
- mechanics with no lived consequences;
- texture with no operational meaning;
- all-knowing entries that collapse mystery;
- contradictions hidden as silent rewrites;
- false beliefs presented as authorial truth;
- entries created only because a proper noun exists;
- high-churn state stored as lore;
- tensions already resolved by the card's description.

Adding detail does not fix a flat book. Fix anchors, visibility, and consequence chains first.
