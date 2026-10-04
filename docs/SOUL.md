# Soul: who a character is, for the relationship dashboard

A soul tells the `relations` plugin how one character reacts: her class toward the user,
where her attitude starts, her traits and spectra, and the cues that hit her harder.
Everything that HAPPENS in a story lives in the chat state (`data/dashboard/state/`);
the soul never changes during play.

## Where it lives

Top level of the card, `data/characters/<id>/card.json`:

```json
"extensions": { "molfar_soul": { "v": 1, "characters": { "<name>": { ...soul } }, "minor": ["стражник"] } }
```

Merge into an existing `extensions` object; keep every other key. One card may hold
several souls: a narrator card keeps one per NPC, keyed by the name the story uses (the
spelling its chats use; other spellings and transliterations go to `aliases`).
`minor`: names seen in play that get no soul on purpose (minor figures, the narrator); the
Soul tab no longer offers them. Up to 64 strings.
Only the card editor (tab "Soul") writes this. The plugin reads it and never writes cards.

## One soul (every field optional; unknown keys are kept)

| Field | Shape | Meaning |
|---|---|---|
| `class` | `romantic` \| `ally` \| `neutral` \| `hostile` | Relationship class toward the user. Missing = `neutral`. Only `hostile` has a hostility meter. |
| `pronouns` | `she` \| `he` \| `they` | Used in the words injected into the prompt. Missing = `they`. |
| `aliases` | up to 8 strings | Other spellings of the name the story may use (`Medli`, `Медлі`, `Медли`). Matched case-insensitively; as a last resort names are also compared transliterated to Latin. |
| `start` | `{ trust, comfort, attraction, respect, affection }` integers −20…20, plus `hostility` 0…100 for a hostile class | Attitude toward the user when the story begins, as the card and its first message set it up (a sworn advisor already trusts and respects; a rival distrusts). Missing = 0 (stranger). |
| `traits` | `{ dominance, confidence, shyness, patience, curiosity }` integers 0…100 | Fixed temperament. `shyness` > 60 caps trust and comfort growth at +1 per turn. `curiosity` above 60 raises resting excitement. |
| `spectra` | `{ introvert_extrovert, cautious_reckless, reserved_emotional, lawful_rebellious, suspicious_trusting, pessimist_optimist }` integers 0…100 (0 = the left word, 100 = the right word, 50 = middle) | Tilt how fast a stat grows (see below). |
| `triggers` | up to 12 `{ cue, event, stat, x }` | Things that hurt her more: `cue` in plain words, `event` an id from the event vocabulary, `stat` the stat it hits, `x` 1.5 or 2. |
| `values` | up to 12 `{ cue, event, stat, x }` | Things she prizes: same shape as triggers. |
| `coping` | text, up to 300 characters | How she behaves under strain; goes into the prompt as one line. |
| `pulseBase` | `{ arousal }` 0…100 | Resting arousal; missing = 9. |
| `locked` | boolean | Set by the editor on save: traits and spectra are fixed. |
| `ratedBy` | `"auto"` \| `"molfar"` \| `"user"` | Who set the values last. |

Stats a trigger or value may name: `trust`, `comfort`, `attraction`, `respect`, `affection`,
`excitement`, `arousal`, `hostility`. Event ids: `GET /dashboard/config` returns the vocabulary
(`events[].id`), or see `EVENT_ROWS` in `plugins/relations/plugin.js`.

Which spectrum tilts which gain (bands: <25 ×0.75 · 25…49 ×0.9 · 50 ×1 · 51…75 ×1.1 · >75 ×1.25):
trust ← `suspicious_trusting`; comfort ← `introvert_extrovert`; attraction ← `cautious_reckless`;
respect ← `lawful_rebellious` (inverted: a lawful character respects faster);
affection ← `reserved_emotional`. Every harm ← `pessimist_optimist` inverted (an optimist is hurt less).

## Proposals: automatic rating and Molfar

Only main characters get a soul: the card's own character, and for a narrator card the named
recurring characters its card and lorebooks describe. Minor figures the story model brings in
(guards, servants, passers-by) play without one: every multiplier is x1, start values 0.

A proposal never touches `card.json`. It is one file per card,
`data/dashboard/soul-drafts/<characterId>.json`:

```json
{ "v": 1, "at": 1791059367670, "by": "auto", "model": "provider/model-id",
  "note": "one or two lines on what was chosen and why",
  "characters": { "Medli": { "class": "ally", "pronouns": "she", "aliases": ["Медли"],
    "start": { "trust": 5, "respect": 10, "affection": 10 },
    "traits": { "dominance": 15, "confidence": 30, "shyness": 72, "patience": 60, "curiosity": 80 },
    "spectra": { "introvert_extrovert": 30, "cautious_reckless": 35, "reserved_emotional": 75,
                 "lawful_rebellious": 40, "suspicious_trusting": 45, "pessimist_optimist": 65 },
    "triggers": [ { "cue": "shouting", "event": "raised_voice", "stat": "comfort", "x": 1.5 } ],
    "values": [ { "cue": "a kept word", "event": "kept_promise", "stat": "trust", "x": 1.5 } ],
    "coping": "sings when it is hard; hides her hands in her feathers" } } }
```

- `by`: `auto` (the plugin's own rating call) or `molfar` (written by Molfar).
- `minor`: names seen in play that the rating judged minor or the narrator (no soul). Accepting
  the proposal adds them to the card's `minor` list.
- `error`: the rating failed; `characters` is empty. The Soul tab shows it with Retry.
- `dismissedAt`: the user dismissed the proposal; `characters` is empty. Nothing is rated
  automatically for this card again (the "Rate now" button still works).
- Until the user accepts or dismisses it, a proposal is used in play for every name the card
  has no soul for (a provisional soul). The user accepts one soul at a time (Save on that
  character: the editor writes it into the card and the plugin removes that name from the
  proposal) or all at once (Accept all); the file is deleted when no name is left.

The plugin rates by itself (setting "Rate characters automatically", on by default) after a
card is imported, and on the first update of a chat whose card has no soul and no proposal
file. In that update it rates first, then runs the sensor with the new souls, so start values
count from the first snapshot. One call per card, on the sensor model (empty = the chat's model).

Molfar ("Rate with Molfar" in the Soul tab) writes the same file with `"by": "molfar"`.
Rate from what the sources say: the card's description, personality, scenario and first
message; the lorebooks the card and its chats use (`data/lorebooks/<id>.json`, entries that
describe the character); recent chat messages when nothing else describes her. Start values
come from how the card and its first message set up the relationship (within ±20); 0 only
where they give no lean; 50 means "no lean" for a trait or spectrum. Key each soul by the
spelling the story's chats use (`GET /dashboard/guests` lists the names seen); other spellings
go to `aliases`; put seen names that deserve no soul in `minor`. Write `cue`, `coping` and
`note` in the story's language; ids and keys stay English. Never edit `card.json` or `src/`.

## Routes (plugin `relations`)

- `POST /dashboard/soul/rate` with `{ characterId, chatId?, auto? }` → `{ ok, draft }`: rates the
  card's main characters and writes the proposal file. With `auto: true` it runs only when the
  setting is on and the card has no soul and no proposal file (else `{ skipped: true }`).
- `GET /dashboard/soul-draft?characterId=<id>` → `{ draft }` (normalized, or `null`).
  `DELETE` the same path dismisses it (writes `dismissedAt`); `DELETE ...&accepted=1` removes the file;
  `DELETE ...&accepted=1&name=<name>` removes only that name (the file goes when none is left).
- `GET /dashboard/guests?characterId=<id>` → `{ guests, seen }`: `seen` = every name the sensor saw
  present in this card's chats, most seen first; `guests` = those seen in at least 2 snapshots with
  no soul (card or live proposal, aliases and transliteration included), not in the card's or the
  proposal's `minor`, not the user's name.
- `POST /dashboard/soul/effects` with `{ soul }` → `{ effects }`: what the soul changes in play
  (brakes, multipliers, resting values), computed by the same code as the physics.
