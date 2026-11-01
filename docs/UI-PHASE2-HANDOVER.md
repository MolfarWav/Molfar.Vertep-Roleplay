# Roleplay front redesign: phase 2 hand-over

Branch `claude/rp-design-foundation`. All decisions are in `docs/UI-CATALOG.md` (sections 8 to 10); mocks in `docs/ui-mocks/`
(open `docs/ui-mocks/index.html` over a local `python -m http.server`). Build each screen to match its mock, on the real tokens.

## Done (stages 1 and 2)
- `07ed9cf` type tokens (`text-caption/body/heading/title/display`) + a ratchet test on `text-[Npx]`; `cn()` knows the font-size classes.
- `0fd1d8a` button ladder (`tonal`, `onImage`, size `lg`), `Card` with a border, `ui/tone.ts` shared tone map.
- `89b2548` `Fold`, `SettingRow` (+ `NumControl`, `Segmented`), `Section` in `src/components/ui/`.
- `3b1c4af`, `c024c84`, `778bf4f`, `a48862b` World DM panel as three task cards (variant C), CHANGELOG entry without a version bump.

## Done in the phase 2 run (branch pushed after each stage; none verified in a browser, no engine here)
- Stage 1 `88af37f` Sensor tab: summary card, three task cards, NumTile and ToggleChip (`ui/`), `dashboard/sensor-summary.ts`; long labels shortened in en and uk.
- Stage 2 `b9b46bd` chat: header name 20 px heading font and 40 px avatar, tinted sky and teal header icons (`chat/header-tint.ts`), side portrait grows into the free margin (`--ls-col-w` grid cell, `--ls-av-w` portrait, `--ls-av-extra` set by `chat/use-avatar-extra.ts` from `lib/avatar-extra.ts`), "Since your last reply" bar with a count circle.
- Stage 3 `aef6932` side panel: hue per item (`shell/rail-hues.ts`), groups split, Agents link (`lib/canvas-board.ts`), Settings off the rail (a Roleplay settings button on Home is its door until the engine entry exists), Memory tab removed, `docs/ENGINE-ISSUE-shell-settings-apps.md` written (not filed). There is no command palette in this build, so the catalog's "palette entry" has nothing to attach to.
- Stage 4 `cbdcbe7` Home bento (blocks in `components/home/`, rules in `lib/home-layout.ts`, `settings.homeLayout`). Quests read the latest chat only (no all-chats endpoint); What's new uses the guide's release tips, not CHANGELOG.md; the recent-chats list left Home.
- Stage 5 `52dc08d` Characters list: header rows, always-on folders block, Move to folder (grid cards and batch bar; list rows have no menu), Lore and Sprites chips.
- Stage 6 `cf4b963` Lorebooks book page and Rules tab; the entry editor in a side panel with five folds is the next commit (see git log). Delete of an entry now asks to confirm.
- Not done from the catalog for stage 3: the closed-rail "names on hover" already existed (tooltips); the rail's open look is kept as is.

## Next stages, in order (each one: build, test, commit, push to this branch; no PR, no merge, no tag, no version bump)
1. Dashboard Sensor tab: variant C (summary + tile grid) plus the new `layoutInject` switch. Mock: `docs/ui-mocks/dash-sensor/`.
2. Chat: unchanged except four small changes (bigger name, tinted header icons, bigger side portrait without moving the text, a "Since your last reply" bar). Mock: `docs/ui-mocks/chat-small/`.
3. Side panel: current look kept, one distinct hue per item, Agents item (to the Canvas agents board), people block separated from the technical block, Settings removed from the rail, Memory tab of Roleplay settings removed. Mock: `docs/ui-mocks/rail/` and `docs/ui-mocks/example/`. Also write an issue draft (file `docs/ENGINE-ISSUE-shell-settings-apps.md`) for the engine repo: shell Settings gets an Apps > Roleplay entry that hosts the app's settings. Do not file it.
4. Home bento N1. Mock: `docs/ui-mocks/home2/n1.html`.
5. Characters list: header in rows, folders always visible with Move to folder, markers as chips with words. Mock: `docs/ui-mocks/characters-list/`.
6. Lorebooks L1: wide list with kind icons, Rules tab in four cards, entry editor in the side panel with five folds. Mock: `docs/ui-mocks/lorebooks/`.
Cards and persona editors are not touched.

## Gotchas
- Repo files are LF. Edit with the Edit tool, or write files with explicit `\n`.
- No DOM test library: tests use `renderToStaticMarkup`, clicks are not simulated.
- `bun test` has a known pre-existing set of failures, all `location is not defined` from `engine.ts` (about 30 fail / 18 errors on the base commit). A change must not add new ones.
- Ukrainian wording of new i18n keys is a draft.
- The World DM panel was only seen in a browser at 1280 px dark, top two thirds. Not checked: DM off, the 448 px sheet, 390 px light.

## How to verify
`bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run build` if it exists. A browser check needs a running engine with the app; if it is not possible here, say "not verified in a browser" in the commit body and the final report.

## Open after the run
- Nothing was seen in a browser. Check first: Sensor tab at 390 and 1280 px; the chat's bigger portrait at 1280 px and with the dashboard strip open; the rail (hues, Agents current only on the Agents board, toggle); Home in edit mode; Characters header on a phone; the lorebook entry panel (non-modal overlay, Escape handling, phone full page).
- `docs/UI-CATALOG.md` sections 9 and 9.1 are not updated for decisions the builders made (translate moved into the book's more menu, Duplicate kept in the entry menu, Add entry and New both filled).
- Shell Settings entry for Roleplay waits for the engine issue draft (`docs/ENGINE-ISSUE-shell-settings-apps.md`, not filed).
- Dead code left behind: `canListApps`, `listOtherApps`, `openShellApp` in `lib/shell-bridge.ts`, the `Achievement` type.
