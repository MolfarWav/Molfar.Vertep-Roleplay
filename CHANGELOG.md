# Changelog (Molfar Vertep fork)

Changes on top of upstream Roleplay 4.18.2 (`b509845`).

## 4.19.0

- Litopys (formerly Archivarius) ships with the app: a world-lore keeper that
  extracts world facts, a chronicle and a running recap from each chat into
  `data/litopys/store.json` and `data/vault-chats/<character>.md`, and a
  curator that proposes clean-ups for approval. It reads `data/archivarius/*`
  until its first save, and an Archivarius copy left in `plugins/` stops running
  (`"replaces": ["archivarius"]`; needs Molfar Vertep 0.2.0 or newer).
- Chat memory recall matches Ukrainian and Russian word forms: stems, stop
  words, the typographic apostrophe, rarer words weigh more. Before, only
  lowercase Latin words of 4+ letters could match, so Cyrillic memories never
  surfaced by text. Duplicate detection keeps Cyrillic letters too.
- Plugin panels: `select` and `model` field kinds (the model picker groups by
  endpoint), hints, placeholders, row counts and an Advanced section.
- Settings: the memory model uses the same searchable model picker.
- Themes: optional per-level heading colors, the Neon Tokyo Night theme and
  two neon heading CSS snippets.
- `docs/ARCHITECTURE.md`: a detailed file map for agents editing the app.
- App skills in `.skills/`: `edit-large-card`, `roleplay-ui-orchestrator`.
