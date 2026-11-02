# Handoff: the character journal (Dashboard)

Status: design agreed with Sergey on 2026-11-02, nothing built yet. Target: the next Roleplay release (4.86.0).
Read `AGENTS.md` first; this file only adds what the task needs. Line numbers below are from `main` at `304530e`
(4.85.0) and will drift; every place is also named by its function.

When the work is done, delete this file in the same PR and move what stays true into `docs/DATA-FORMATS.md`,
`AGENTS.md` and the CHANGELOG.

## Why

The memory the story model gets is facts, numbers and perceptions: Litopys chapters and facts (what happened),
Dashboard notes and `said` (what a character saw, heard or was told about the player), stats turned into stock
phrases (`TIERS`), and recollections (`views`, what a character saw in a closed scene). Nothing says what a character
**thinks** of it and **wants** because of it. The model gets evidence but never the character's own conclusion, so
memory keeps the story consistent but barely changes how a character acts.

The journal is that missing layer: per character, first person, in the character's own voice. "Does not trust Sam"
is a lorebook line; "Sam is a jerk, he told me to come to the party and never showed up" is a journal line, because a
scene made it so.

## What the journal is

One journal per character per chat, shown per character in the Dashboard. Three parts, and **no new model call**:
each part is written by a call that already runs.

| Part | What | Written by | Lifetime | In the prompt |
|---|---|---|---|---|
| **Thought** | one line, first person, what the character thinks or feels right now | Dashboard sensor, every turn, for each present character | replaced each time; expires after `thoughtTurns` (default 3) turns without a new one | yes, while fresh |
| **People** | one line per person the character knows (the player included): how they see that person now | Dashboard sensor, only on a turn that changed how they see someone | replaced per person, not appended | yes, for the people in the scene |
| **Entries** | one entry per closed scene: what happened for me, how I feel, what I want now | Litopys chapter worker (`views`, extended) | kept with the chapter | already: "Litopys · recollections" / "latest recollection" |

Not in the journal: facts about the world (Litopys has them) and who the character is (card, Profile, Soul).
The journal holds only what nothing else holds: the character's stance.

## Decisions

- Sergey: the journal lives in the Dashboard, marked up per character, one per character present in the scene.
- Sergey: shown **only in the open Dashboard** (`dash-wide.tsx`), not in the strip or the phone sheet, at least for
  now: it is there for control and understanding. Read-only in the first version is acceptable; see UI.
- Sergey: the journal's insert must be visible in the prompt inspector as its own part.
- Sergey's concern, design answer: a thought must not stick the way quests do. So the sensor **never sees the previous
  thought** (it cannot copy it), and code expires a thought after `thoughtTurns` turns. The same cure as `Wants:`
  (a carried goal kept a character repeating "close ranks!"; fixed with `fresh`, see `characterBlock`).
- Entries stay where they are stored now: `views` on Litopys chapters. No migration. The Dashboard's journal view
  reads them through Litopys.
- Open, Sergey decides before step 3: the language of journal text. English matches the rest of memory and is
  cheaper; the story's language keeps the voice (Cecily's "Ну... нормально було" loses something in English).
  Recommendation: the story's language for thought and people lines, since voice is the point. Build it as one
  constant so it is a one-line switch.

## Data

### Thought: in the snapshot

`data/dashboard/state/<chatId>.json`, `snapshots["<msgId>#<swipe>"].chars[name]`, beside `mood`:

- `thought`: string, at most 200 characters, or null.
- `thoughtTurn`: the snapshot's turn number the thought was written on.

In `charEntry` (~line 3283): when the sensor gives `chars[name].thought`, take it and set `thoughtTurn` to this turn;
otherwise carry the old `thought` and `thoughtTurn` unchanged (do NOT add it to `TEXT_FIELDS`: those count as fresh
when present, and `fresh` means "seen this turn"). Snapshots are keyed by message and swipe, so swipes, edits and
deletes follow for free.

### People: a bag beside `notebook`

`journal[name] = [{ id, about, text, src, turn, by }]`

- `about`: the person's name as the story spells it, or the player's name.
- `text`: at most 200 characters.
- `src`: the snapshot key that wrote it (same role as a note's `src`: a swipe or an edit of that reply drops what it
  wrote; follow how `notebook` does it, e.g. ~line 2677 and `normalizeState`).
- `by`: `"sensor"` or `"user"` (a user-written line is never replaced by the sensor, like user notes `u…`).
- One line per `about`: a new sensor line for the same person replaces the old one.

Add `"journal"` to the bag lists in `normalizeState` (~1555), `applyInherit` and `dropInherit` (~1658, 1672): a chat
that continues another carries its people lines like its notes (#100), and "Start clean" drops them. The thought is
not carried.

### Entries: Litopys `views`, extended

`plugins/litopys/plugin.js`:

1. **1:1 scenes.** `viewsOn = cast.length >= 2` in `buildWorkerRequest` (~1126) and the same test in `applyWorker`
   (~2208, `cleanViews`) become `>= 1`. A scene with the player and one character now gets her entry. Update the
   comment on `RECOLLECTIONS_RULE` and the hint text `lit.set.recollectionsHint` (en, uk), which say "two or more".
2. **Wants.** `RECOLLECTIONS_RULE` (~301) already asks for "how it left them feeling". Add what they want or mean to
   do now because of it. Keep the existing ban on anything the character did not witness.
3. **Voice (optional, measure first).** The worker's `Characters` section is names only, so every view sounds the
   same. Add one short line per character (at most 200 characters): the soul's `coping` plus the temperament words,
   or the card's Profile personality line, whichever is cheaper to reach from Litopys. If it costs more than ~60 input
   tokens per character, skip it and say so.

`VIEW_CHARS` (300) and `VIEWS_MAX` (8) stay. `recollectBudget` already sizes the prompt blocks.

## Sensor (Dashboard plugin, `plugins/relations/plugin.js`)

- `DEFAULT_PROMPTS.sensor` (~611): in the `Scene:` block, extend the `chars` rule with `thought`; in the `Knowledge:`
  block, add the people rule. Draft wording (tune it, keep it short):
  - thought: "For each present character, one short line in first person: what they think or feel right now about
    what just happened, in their own voice and true to who they are. Never repeat an earlier thought; write it from
    the new messages only. Leave it out when the new messages give them nothing to think about."
  - people: "people: when the new messages change how a present character sees someone (another character or the
    user's character), one short line in first person on how they see that person now, with the reason the text
    shows. Only a real change; most turns have none. It replaces their earlier line about that person."
  - Both: written from the character's own values, not from whether the user's character would like it. A grudge, a
    doubt or mixed feelings are fine. This line is the guard against the journal turning into flattery.
- `OUTPUT_SHAPE` (~757): `chars.name.thought: "text"` and a top-level
  `"people": [ { "who": "name", "about": "name or user", "text": "text" } ]`.
- **Prompt versions.** The current default must go into `PAST_DEFAULT_PROMPTS.sensor` (~754) as `SENSOR_PROMPT_16`,
  built by `.replace()` from the new default like `SENSOR_PROMPT_15` is (~692). Otherwise users on the old default do
  not get the new rules and users who edited it get silently overwritten. Check `SENSOR_PARTS` / `SENSOR_HEADINGS`
  (~722, 732): the new text must stay inside existing headed blocks so the per-block editor still splits the default.
- `previousStateText` (~2421): **do not** show the thought. Show each present character's people line about the
  others present and the player, so the sensor replaces rather than duplicates.
- `applySensor` (~3644): keep `people` only for present characters, never with `who` = the player's character, and
  `about` must be someone known (present, in the notebook, or the player). At most 2 per turn. Count drops in
  `keptOut` the way notes do.
- Fast mode gets the same rules through the shared prompt and shape; check `fastTokens` and say in the PR what the
  extra output costs.
- The leak check (#184 P3) reads the reply, not the journal; no change needed, but a test should show a thought is
  written only for present characters.

## Prompt insert and the inspector

A new block, after the character's "How X is right now" block and before `said`, for each character in focus:

```
[What <name> thinks and feels (journal): their own view, in their own words. Let it colour what they do; never quote it.
Right now: <thought>
About <user>: <line>
About <other present>: <line>]
```

- `Right now` only while `turn - thoughtTurn < thoughtTurns`.
- People lines only about those in the scene (the player always counts). Order: the player first.
- Budget: `journal.maxTokens`, default 120 per focused character, cut people lines from the end, never the thought.
- Its own `promptSources` part, label **`Dashboard · journal`** (see ~4727 for the existing parts), so the prompt
  inspector shows it separately. Also in `GET /dashboard/preview` (`previewInsert`).
- Off switches: Dashboard settings "Journal" (config `journal.inject`, default on), and a Prompt board key
  `plugin:journal` per chat, the way `plugin:said` works.
- Note the token counter here is `characters / 3.2` (Dashboard) and Ukrainian text is ~2 characters per token: if
  journal text is in the story's language, count it with the script-aware estimate instead (§13.2 of the owner's
  memory notes), or the budget will undercount by ~40%.
- The history reserve must know the new block. Since 4.85.0 (`7e2f552`) the engine plugin
  (`plugins/engine/plugin.js`, `hookInsertBreakdown`) lists every block as a row with a ceiling read from the
  plugin's own config (the Dashboard rows are `dashboard` and `dashboard said`). Add a `dashboard journal` row:
  `journal.maxTokens` × the focus count the Dashboard can use, only when `journal.on` and `journal.inject` are on and
  the chat has not muted `plugin:journal`. Test it in `test/rp-hook-reserve.test.ts`.

## UI: the open Dashboard only

`src/components/dashboard/dash-wide.tsx` (~179-200: the grid with `Notebook` and the threads box). Add a **Journal**
box for the focused character (the one `focus` already selects), tone `memory` like the Notebook, icon e.g.
`BookOpenText`:

1. **Right now**: the thought, with how many turns ago; greyed with "faded" when it no longer goes into the prompt.
2. **People**: one row per person, name chip + line; sensor lines and user lines marked differently.
3. **Entries**: the character's `views` from closed chapters, newest first, with the chapter label. The existing
   Litopys route already sends them: `GET /litopys/chat?chatId=` → `chapters[].views` (`chatView`, ~4995). A line
   saying which of them the next reply carries (the latest goes in the tail) is a plus.

Not in `dash-strip.tsx`, not in `dash-phone.tsx`. Visible in both the normal and the full-screen open Dashboard
(`rp.dashFull`), unless Sergey says full-screen only.

Editing: version 1 may be read-only. If time allows, people lines get edit / remove / add like notes (reuse the
notebook's editing pattern and routes as a model; user lines carry `by: "user"`).

Strings: every new label through `t()` with **en and uk** in `src/lib/i18n.ts` (the Dashboard already does this).
`src/lib/dashboard.ts`: add `thought`, `thoughtTurn`, `thoughtFresh` and `journal` to `DashChar`; `viewOf` (~5554)
sends them.

## Settings

Dashboard settings (`dash-settings.tsx`), a "Journal" fold:

- Journal on/off (config `journal.on`, default on): off = the sensor is not asked for `thought` and `people`, nothing
  is injected, the box says it is off.
- In the prompt (`journal.inject`, default on).
- Thought lasts N turns (`thoughtTurns`, 1-10, default 3).
- Budget per character (`journal.maxTokens`, 40-400, default 120).

## Tests

- `rp-dashboard.test.ts`: thought written, carried, expired after `thoughtTurns`; the sensor's previous state has no
  thought; a swipe drops its thought and people lines; people line replaced per `about`; a user line survives; a
  people line for an absent character or from the player is kept out; insert text and the `Dashboard · journal`
  label; budget cutting; off switches; inherit and Start clean.
- `rp-recollections.test.ts`: views in a 1:1 scene; the rule asks for wants.
- The sensor prompt: the new default differs from `SENSOR_PROMPT_16`, and a stored `SENSOR_PROMPT_16` upgrades.
- UI: a render test for the Journal box in `DashWide` if the folder has a pattern for it (see `test/*.test.tsx`).

## Done means

`bun run typecheck`, `bun test test/` all pass, the open Dashboard checked in a browser (Journal box with data,
empty, off, full-screen), one live chat on a paid model where the inspector shows `Dashboard · journal` and the
thought changes and fades. CHANGELOG under Unreleased, `docs/DATA-FORMATS.md` (Dashboard state: `thought`,
`thoughtTurn`, `journal`; Litopys views in 1:1 scenes), `AGENTS.md` line 84 (the Dashboard components) mentions the
Journal box. This handoff deleted. Work on a `claude/*` branch, PR to `main`; no tag (Sergey's).

## Do not

- Do not show the sensor the previous thought.
- Do not move `views` out of Litopys chapters.
- Do not put the journal in the strip or the phone sheet.
- Do not let the journal be written from "what the user's character would like": the character's own values only.
- No new model call.

## After this (not now)

- A `stance` on Litopys facts (`{fact, who, stance}`): a character's view of a shared fact; also where false beliefs
  (#184 P4) would live.
- Carrying the journal into card memory on import (`cardMemory` sources).
