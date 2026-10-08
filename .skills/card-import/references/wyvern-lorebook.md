# Wyvern Lorebook (Lexicon) Mapping

Load this reference when the source is a Wyvern lorebook/lexicon export. This app's Import button does not know this format; convert by hand.

## Container format

Wyvern exports look like this:

```json
{
  "entries": {
    "0": { ...entry... },
    "1": { ...entry... }
  }
}
```

The root is an object with `entries` keyed by STRING uid. Each key equals `str(entry.uid)`. A bare array root is a broken export; wrap it before mapping.

## Entry fields and their meaning

A Wyvern entry is SillyTavern World-Info V2 compatible. The fields that matter for mapping:

| Source field | What it does | This app's field |
|---|---|---|
| `uid` | Unique number | `uid` (number, starting at 1 in the new book) |
| `key` | Primary keywords | `keys` |
| `keysecondary` | Second key list when `selective` is true | `secondaryKeys` |
| `selective` | Uses second-key logic | presence of `secondaryKeys` |
| `selectiveLogic` | AND/AND_ALL/NOT logic | `selectiveLogic` |
| `constant` | Always-on, no keys | `status: "constant"` |
| `content` | The prose the model reads | `content` |
| `comment` | Human title or memo | `title` and `memo` |
| `disable` | Disabled but kept | `enabled: false` |
| `position` | 0 before char, 1 after char, 4 in chat | `position`: 0 -> `before_char`, 1 -> `after_char`, 4 -> `at_depth` with `depth` and `role` |
| `order` | Insertion order | `order` |
| `probability` | 0-100 activation chance | `probability` (omit for 100) |
| `cooldown`, `sticky`, `delay` | Message-count gates | same names in this app |
| `caseSensitive` | Key case matching | book setting, not entry field, in this app |
| `matchWholeWords` | Whole-word matching | book setting |
| `ignoreBudget` | Insert even when budget used | `ignoreBudget` |

### `extensions.wyvern`

Every Wyvern entry carries:

```json
"extensions": { "wyvern": { "priority": 10, "position": "before_char", "insertion_order": 10 } }
```

- `position` mirrors the source `position` field as a string.
- `insertion_order` mirrors `order`.
- `role: "system"` appears only on `in_chat` entries.

When converting, read the STRING `extensions.wyvern.position` as the authoritative placement if it conflicts with the numeric `position`.

## Runtime semantics worth preserving

- **Global ON** = keyword scan over recent messages. **Global OFF** = only fires when pulled in by a location/scenario include; still needs a keyword unless Constant.
- **Before Char** = framing lore at the top of the context. Use this app's `position: "before_char"` and a high `order` for world rules.
- **After Char** = supporting lore after the character block. Use `position: "after_char"`.
- **In Chat** = situational info injected at depth. Use `position: "at_depth"` with `depth` and `role: "system"`.
- **Activation Chance** = `probability`. Keep graded probabilities (40-90) for soft lore instead of turning everything on or off.
- Delay/Sticky/Cooldown are message-count gates. Map them directly.

## Conversion procedure

1. Read the source file with one read_file or json_get.
2. Write the destination book as a small file with `"entries": []`.
3. One json_set with an append per entry. For each entry:
   - New `uid` starting at 1, in source order.
   - `keys` from `key`; if the source key list is empty and the entry is not constant, drop the entry or make it `enabled: false`.
   - `status: "constant"` when `constant` is true, otherwise `"normal"`.
   - `position` from the string `extensions.wyvern.position`; `at_depth` entries get `depth` from the source and `role: "system"`.
   - `enabled: !disable`.
   - `order`, `probability`, `cooldown`, `sticky`, `delay`, `ignoreBudget` copied when present.
   - `title` and `memo` from `comment`.
4. Append the book id to the character's `/studio/linkedLorebookIds`.
5. Report any entry that relied on Wyvern's location/scenario include system: this app links books to characters, not to locations. Put the effects of an include into the scenario or a constant entry.

## Wyvern patterns that port well

- Disabled keyless entries as section markers: keep them as `enabled: false` with empty keys so the book's structure is visible to the user in the editor.
- Graded probabilities for optional lore: keep them.
- Selective second-key logic for disambiguation: map to `secondaryKeys` and `selectiveLogic`.
- Keyword fan-out with many synonyms: keep, but trim keys that are too broad for this app's scan.

## What cannot be carried over

Wyvern's location/environment/party-condition gating has no direct equivalent. Report it and suggest putting the gated content into the scenario field of the relevant card or into a constant entry when it is always relevant.
