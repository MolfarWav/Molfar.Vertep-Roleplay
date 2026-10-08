# Platform Export Layouts and Field Mapping

Load this reference when the source is a pasted card, a foreign export, or anything the app's Import button does not handle. Field names here describe the SOURCE format. Map them to this app's fields using `apps/roleplay/docs/DATA-FORMATS.md`, not by copying names.

## JanitorAI

Two surfaces: the public Bio (marketing text, rich-text/HTML) and the private character definition.

### Bio

- The public text on the card page, often HTML (`<p>`, `<strong>`, `<span style>`, `<details>`) and emoji.
- It is advertising for people, not instructions for the model: at most it feeds `creator_notes`. The definition is the source of the character's behaviour.

### Private definition

- Usually one large text block holding personality, appearance, scenario, and examples.
- Sections may be marked with headings like `Personality:`, `Scenario:`, `Appearance:`, or with no headings at all.
- Example dialogue uses `{{char}}` and `{{user}}` placeholders, same as this app.
- If the definition has separate rule blocks that apply every turn, move them to `system_prompt` or `post_history_instructions`, not `description`.

### Janitor lorebook envelope

A Janitor lorebook export wraps entries like this:

```json
{
  "extensions": {},
  "entries": [
    {
      "keys": ["trigger"],
      "content": "...",
      "enabled": true,
      "insertion_order": 10,
      "constant": false,
      "selective": false,
      "name": "Entry name",
      "comment": "Entry name",
      "case_sensitive": false,
      "use_regex": false,
      "mode": "normal"
    }
  ]
}
```

Mapping to this app's lorebook entries:

- `keys` -> `keys`.
- `content` -> `content`.
- `name` or `comment` -> `title` and `memo`.
- `constant: true` -> `status: "constant"`. For constant entries the source uses `"keys": [""]`.
- `insertion_order` -> `order` (higher inserts later).
- `enabled` -> `enabled` as a boolean.
- `case_sensitive` -> the book setting, not the entry field, in this app.
- `use_regex` -> `keysRegex: true` on the entry.
- Drop `mode`, `selective` as separate source concepts; use `status` and `secondaryKeys`/`selectiveLogic` when the source genuinely has second-key logic.

## RisuAI

- Cards are `chara_card_v3` (JSON, PNG, or a `.charx` zip with assets). The app's Import handles
  V3 PNG and JSON files: send the user there. By hand only for pasted fields or a Module.
- V3 nests the fields under `data` (`data.description`, `data.first_mes`, `data.character_book`).
  This app writes them FLAT at the top level.
- `data.extensions.risuai` may hold Lua or trigger scripts, custom HTML/CSS for the chat, and
  asset references. None of it runs here: report it, and carry only plain meaning into text fields.
- `data.assets` (images, emotion sprites) are files in the package; pasted text cannot carry them.
  Tell the user to import the file instead.
- Some authors structure `description` with their own tags or headings (`<appearance>`,
  `[Personality]`, W++ `character(...)` blocks). These are author conventions, not a format: split
  the content by meaning into `description`, `personality` and `scenario`; plain tags may stay.

### RisuAI Module

A Module bundles lore, regex, CSS and trigger scripts; it is not a character card.

- Lore entries -> a lorebook here (keys, content, always-on -> `status: "constant"`).
- Regex -> this app has regex scripts (`apps/roleplay/data/regex/`, see DATA-FORMATS.md): carry a
  simple find/replace over only if the user wants it; report the rest.
- CSS and scripts cannot run here: report them.

## Other V3 exporters

Apps that export `chara_card_v3` JSON or PNG: use Import. When the user pastes the JSON instead,
read the fields under `data` and write them flat; keep `extensions` as they are.

## SillyTavern

V2 and V3 cards with world info embedded. The app's Import button already handles PNG and JSON SillyTavern cards, so only use this section when a user pastes the raw JSON.

- V2 flat card: fields at the top level, same layout this app uses.
- Embedded world info: an object with `entries` keyed by string uid. Map each entry as a lorebook entry.
- `extensions` may hold SillyTavern-specific data. Keep it if the card is imported as a file; when rebuilding by hand, preserve unknown `extensions` keys.

## Plain-text sheets

Users paste character sheets with lines like:

```
Name: ...
Age: ...
Appearance: ...
Personality: ...
Background: ...
Scenario: ...
First message: ...
```

Mapping:

- Appearance/background -> `description`.
- Personality -> `personality`.
- Scenario -> `scenario`.
- First message -> `first_mes`.
- Other opening lines -> `alternate_greetings`.

Do not invent fields for leftover lines. If a line has no home, fold it into `description` or `personality` where it fits.
