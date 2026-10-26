# Help articles

The Help ("?" in the rail) shows every tip that has a `help` group. A tip is one or two sentences. An
**article** is the long version of a tip: it opens behind the "More" button of the same item, with a
"Where to find it" line, plain-words text, and "See also" links. Articles live in one data file,
`src/lib/help-articles.json`, so a new article is a file change, not a code change.

## How an article reaches the app

`TIPS` in `src/lib/guide-tips.ts` is `mergeArticles(HAND_TIPS, articles.entries)` (`src/lib/guide.ts`):

- An entry with `extends: "<tip id>"` adds `details`, `where`, `related` and its `aliases` (as search
  words) to that tip. The tip keeps its own title and body, which What's new and the tours show.
  A tip that had no `help` group is listed under the entry's `group`.
- An entry without `extends` (or whose `extends` is not a tip) becomes a tip of its own: title, `short` as
  the body, `aliases` as keywords.
- `related` may name another article by its `kb.*` id; it is turned into the id of the tip that article
  landed on. Only ids that are listed in the help become links.
- `sources` is not read by the app. It is the proof for review.

## The entry

```json
{
  "id": "kb.profile",
  "group": "characters",
  "title": { "en": "Profile (card tab)", "uk": "Профіль (вкладка картки)" },
  "aliases": { "en": "profile structure it fill empty", "uk": "профіль профілю структурувати" },
  "short": { "en": "...", "uk": "..." },
  "where": { "en": "Open a card, then the Profile tab.", "uk": "..." },
  "details": { "en": "Paragraph one.\n\nParagraph two.\n\n- a list item\n- another", "uk": "..." },
  "related": ["kb.persona", "help.card-editor"],
  "extends": "help.card-editor",
  "sources": [{ "path": "docs/DATA-FORMATS.md", "lines": "69-73", "quote": "Every save COMPILES it into" }]
}
```

Limits (checked by the validator): `title` 60 characters, `short` 260 (Ukrainian 325), `details` 1500
(1875), `aliases` 300, `where` 200. English has no Cyrillic; Ukrainian does. `details` is plain text:
a blank line between paragraphs, a line starting with `- ` is a list item, nothing else.

## Rules for the text

- Every claim is in the code, in the docs or in the UI strings, and has a `sources` entry: a file, a line
  range and a quote of 8 to 160 characters copied exactly from it. A feature with no screen is not an article.
- Written for a player, not a developer: what the screen offers, what to press, what happens, what is on
  by default, what it does not do. No file paths, file names, JSON keys, function names or backticks
  (`{{user}}`-style macros are fine). Those belong in `sources`.
- UI labels exactly as the app shows them, in quotes. Ukrainian text uses the Ukrainian label when the
  Ukrainian UI has one; the English label otherwise (this app's rule, see AGENTS.md).
- Ukrainian sentences up to 20 words; verbs, not verbal nouns; one term for one thing.
- A change to a feature that has an article updates the article and its `sources` in the same change.

## Checking

```
node scripts/validate-help.mjs src/lib/help-articles.json --repo .
node scripts/validate-help.mjs src/lib/help-articles.json --repo . --fix-lines
```

The validator checks the schema, that `extends` and `related` ids exist, that every quote is in its file at
the stated lines, and the plain-words rules above (no code in the text, no "Навички", sentences of the
Ukrainian text over 20 words as warnings). `--fix-lines` re-finds each quote and rewrites the line numbers;
use it after other work moved lines in the files the articles cite. A quote that is nowhere in the file is
still an error: the claim has to be re-read and rewritten.

`bun test test/rp-guide.test.ts` covers the merge, the search ranking, that every link leads to a listed tip,
and the plain-words rules on the file.
