# Roleplay UI map (where a change goes)

Pick the lightest layer that can carry the change. Most requests end in layer 1.

## Layer 1 — `apps/roleplay/data/` (live in ~1s, never conflicts with updates)
- `settings.json` — `{ model, personaId, ui }`. Whole AppSettings: themeMode + activeThemeId, fonts, scale, hotkeys, display/chat/streaming, TTS, translation, summary, memory. Edit any key, UI applies live.
- `library.json` — `{ qrSets, themes, backgrounds, tags, folders, connectionProfiles }`. Theme presets, backgrounds, quick-replies, tags, folders.
- `characters/<id>/card.json`, `chats/*.jsonl + .meta.json`, `groups/`, `presets/`, `lorebooks/`, `regex/`, `personas/`, `databank/` — content entities. Keep shapes identical; hydrate is tolerant, not a migrator. Files starting with `_` are AI-only templates, copy to non-underscore name to create.

## Layer 2 — new plugin `apps/roleplay/plugins/<your-id>/`
- `manifest.json` {permissions} + `plugin.js` (ESM only: `export function handleRoute(req, host)`). Routes live under `/v1/apps/roleplay/<path>`, first responder wins, so namespace own prefix. Permissions: routes, tools, llm, store, fs, schedule, hooks, network.
- Never edit `plugins/engine/`, `plugins/studio-import/`, `plugins/tools/` unless user asked. New folder = no merge conflicts.

## Layer 3 — `apps/roleplay/src/` (needs user approval, triggers ~5s browser rebuild + `app_check`)
- `src/components/shell/app-shell.tsx` — frame, mounts ThemeApplier.
- `src/components/views/` — tab views incl. `settings-view.tsx` (Themes picker, Prose Colors, Custom CSS).
- `src/components/chat/` — message list, composer, bubbles.
- `src/components/character/` — cards, galleries, variants.
- `src/components/settings/` — settings controls.
- `src/components/theme-applier.tsx` — applies CSS vars to `<html>` from settings + library themes.
- `src/lib/store.ts` — Zustand state + hydrate; `src/lib/types.ts` — ThemePreset/AppSettings shapes; `src/lib/seed.ts` — defaults only (editing it does NOT change live UI).
- `src/globals.css` (`@import "tailwindcss"`) + `src/shadcn-theme.css` — theme vars; `index.html` — entries only.
- Stack: React 19 + Tailwind v4 (built in) + Zustand + `@phosphor-icons/react` (verify name by grep, phosphor is not lucide).
