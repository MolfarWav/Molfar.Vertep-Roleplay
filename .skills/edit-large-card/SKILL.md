---
name: edit-large-card
description: Use when reading or changing a character card, lorebook or other data JSON of the Roleplay app that is large (over ~100 KB) or on one line. Triggers: "поправ картку", "зміни опис персонажа", "додай запис у лорбук", "знайди в лорбуку", "edit card", "lorebook entry".
---

# Editing big cards and lorebooks without drowning in them

A card can pass 100 KB. A lorebook can be several MB. Loading one whole into your context wastes it and pushes the actual task out. Work on the one field you need.

## 0. Know the layout first
- Read `apps/roleplay/AGENTS.md` and `apps/roleplay/data/README.md`. They name the real paths and field shapes. Trust them over this skill where they differ.
- Files starting with `_` (for example `_example.json`) are AI-only templates. Copy one to create an entity. Never edit the template itself.

## 1. Measure before you read
Run in bash (`cd /workspace` first):
```bash
f=apps/roleplay/data/characters/<id>/card.json
wc -c "$f"; wc -l "$f"; head -c 300 "$f"; echo
```
- One line and many KB means minified JSON. Then `read_file` and `grep` return the whole file as one line. **Do not use them on it.** Use `jq` or `python3` below.
- Many lines means pretty JSON. `grep` for the field, then `read_file` with `offset`/`limit` around it works fine.

## 2. Look at the structure, not the content
```bash
jq 'keys' "$f"
jq '.data | keys' "$f"                                   # V2 cards keep fields under .data
jq '.data.character_book.entries | length' "$f"
jq -r '.data.description' "$f" | head -c 2000            # one field, capped
```
- Never print fields that hold base64 (avatars, embedded images). Check a field's size first: `jq '.data.description | length' "$f"`.
- If `jq` fails on an expression, use the `python3` form: `python3 -c "import json;d=json.load(open('$f',encoding='utf-8'));print(list(d['data'].keys()))"`.

## 3. Find the entry you need
```bash
# lorebook entries whose keys or content mention a word (case-insensitive)
jq -c '.data.character_book.entries | to_entries[]
  | select((.value.keys // [] | join(" ") | test("вежа";"i")) or (.value.content | test("вежа";"i")))
  | {i: .key, keys: .value.keys, len: (.value.content | length)}' "$f"
```
Standalone lorebooks (SillyTavern format) keep entries in an object under `.entries`, keyed by uid, not in a list. Check with `jq '.entries | type' "$f"` and adapt the path.

## 4. Change it with a script that keeps the file's format
Write the new text to a file first: a heredoc keeps quotes, apostrophes and newlines safe. Then change exactly one path:

```bash
cat > /tmp/new.txt <<'TXT'
The new description text, any quotes ' " and newlines are fine here.
TXT
python3 - "$f" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = p.read_text(encoding="utf-8")
doc = json.loads(raw)

doc["data"]["description"] = pathlib.Path("/tmp/new.txt").read_text(encoding="utf-8").rstrip("\n")
# lorebook entry instead:  doc["data"]["character_book"]["entries"][7]["content"] = ...

one_line = raw.strip().count("\n") == 0
lines = raw.splitlines()
indent = next((len(l) - len(l.lstrip(" ")) for l in lines[1:] if l.startswith(" ")), 2)
escaped = "\\u04" in raw or "\\u0" in raw            # the file stores non-ASCII as \uXXXX
out = json.dumps(doc, ensure_ascii=escaped, separators=(",", ":")) if one_line \
      else json.dumps(doc, ensure_ascii=escaped, indent=indent)
p.write_text(out + ("\n" if raw.endswith("\n") else ""), encoding="utf-8")
print("ok", len(raw), "->", len(out) + (1 if raw.endswith("\n") else 0))
PY
```
- Keeping the separators, indent and escaping of the original keeps the git diff to the field you changed.
- A small edit in a **pretty** file is also fine with `edit_file`, when `oldText` is unique.

## 5. Verify, then commit
```bash
jq empty "$f" && echo valid
```
- Run `git` with `diff --stat`: only this file, with a small change. A diff covering the whole file means the format changed: redo step 4 and match the original format.
- Changes made in bash are not committed automatically. Commit with `git` `commit -m "roleplay: <character> description rewritten"`.
- Open chats pick the change up within about a second. No reload is needed.

## Lorebook keys: Ukrainian and Russian
When you add or change entry keys, the words must match inflected forms (`Київ`, `Києві`, `Києва`). Load the skill `cyrillic-text-matching`: it explains which forms the matcher catches and when aliases are needed.
