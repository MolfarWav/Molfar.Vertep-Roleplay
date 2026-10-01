---
name: roleplay-ui-orchestrator
description: Orchestrate any Roleplay tab UI/layout change (views, shell, chat, theme, settings). Triggers: зміни UI рольплей, поправ верстку, перестав панель, roleplay layout, тема не застосовується
---

Without this skill UI/layout changes in Roleplay land in the wrong layer (src instead of data, or engine plugin instead of a new one) and break build, hot-reload, or future updates.

1. Read the task, then read `apps/roleplay/docs/ARCHITECTURE.md` section 1.4 and `apps/roleplay/data/README.md` to decide the layer: `data/` for content/settings, new `apps/roleplay/plugins/<your-id>/` for backend behavior, `src/` only when the UI shape itself must change. See `references/ui-map.md`.
2. Locate the target with one `grep` over `apps/roleplay/src` (never ten single reads): views in `src/components/views/`, frame in `src/components/shell/app-shell.tsx`, chat in `src/components/chat/`, character in `src/components/character/`, settings in `src/components/settings/` + `src/components/views/settings-view.tsx`, state in `src/lib/store.ts`, shapes in `src/lib/types.ts`, defaults in `src/lib/seed.ts`, theme in `src/components/theme-applier.tsx` + `src/globals.css` + `apps/roleplay/data/settings.json` + `apps/roleplay/data/library.json`.
3. Create a checkpoint with `checkpoint` action `create` for app `roleplay` with label of the change before touching `src/`.
4. If the change needs `src/` or `index.html`, ask once with `ask_user` and wait for approval (protected paths, one approval per request per app). On deny, solve via `data/` or a new plugin and explain why `src/` is not needed.
5. Never edit `apps/roleplay/plugins/engine/` unless the user asked; prefer a NEW plugin folder `apps/roleplay/plugins/<your-id>/` with own manifest + `plugin.js` (ESM `export function handleRoute`, namespaced routes).
6. Read the file with `read_file` before rewriting it; keep edits surgical with `edit_file`. Verify imports exist first with `grep` (icons are `@phosphor-icons/react`, not lucide; Tailwind v4 is built in, do not install it; state via `useState` or Zustand in `src/lib/store.ts`).
7. A plugin that calls the model passes an explicit model; never rely on engine default. Follow two-phase `host.llm.request` / `host.llm.results` without writing on pass A.
8. After every `src/` or `package.json` change run `app_check` for app `roleplay`; if `package.json` changed run `app_deps` first, then `app_check`.
9. On failure: `git` reverts the change first (`revert`), confirms `app_check` is green again, then retries smaller. After two failed attempts on the same fix, stop and report tries + hypothesis.
10. State which files you will touch before editing, and at the end list every file changed. Never claim "saved" for memory; use `memory_propose` only for durable gotchas.

Known traps:
- `app_check` fails with unknown icon -> cause: lucide name used -> fix: `grep` `@phosphor-icons/react` in `apps/roleplay/src` for a verified name and reuse it.
- Theme change does nothing -> cause: edited `seed.ts` defaults instead of live `data/settings.json` (`themeMode`, `activeThemeId`) + `data/library.json` themes, or missed `theme-applier.tsx` CSS vars -> fix: edit live data files, keep shapes identical, see `references/ui-map.md`.
- Page looks stale after save -> cause: hot-update chain broke -> fix: `app_rebuild`, do not stack edits on a stale build.
- State resets on every save -> cause: module-level state instead of component state -> fix: keep state in component `useState` (Fast Refresh preserves it) or Zustand store.
- Silent plugin (no output, no error) -> cause: wrong export shape or missing permission -> fix: check `manifest.json` permissions and that `plugin.js` uses ESM exports; hot-reload is by mtime.
- Edit blocked or update conflict fear -> cause: edited shipped `src/` file when `data/` could carry it -> fix: prefer `data/` (never conflicts, live in ~1s), then new plugin, then `src/`.

Done means:
- `app_check` for `roleplay` returns ok and `app_console` (level `error`) shows no new errors from the open page.
- The user can see the layout/theme change live; `git status`/`diff` lists only intended files.
- If anything could not be verified (no page open, build timeout), say so plainly.
