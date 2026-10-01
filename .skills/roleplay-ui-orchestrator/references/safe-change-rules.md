# Safe change rules for Roleplay UI work

1. Data first: theme/fonts/layout content that `settings.json` / `library.json` already drive stays in `data/`. Proof: `grep` the key in `src/lib/store.ts` and `src/lib/types.ts` before reaching for `src/`.
2. Protected paths: `src/` and `index.html` change only after user approval in a card, once per request per app. Deny means: solve in `data/` or a new plugin.
3. Read before rewrite: `read_file` the target (slice for >100KB JSON via offset/limit, or grep the field). Never replace AGENTS.md / README wholesale; extend or add a file next to it.
4. Imports: `grep` the package or file first; import only verified names.
5. Model calls from plugins pass explicit model; two-phase llm/net pattern, no writes on pass A.
6. Verify: `app_deps` after package.json change, then `app_check`; read `app_console` level error. Stale page -> `app_rebuild`. Broken app -> `git revert` first, confirm green, then retry smaller. Two failed attempts -> stop and report.
7. Economy: batch lookups (one grep over folder), do not re-read unchanged files in the session.
