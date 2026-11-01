# Roleplay front redesign: phase 2 hand-over

Branch `claude/rp-design-foundation`. All decisions are in `docs/UI-CATALOG.md` (sections 8 to 10); mocks in `docs/ui-mocks/`
(open `docs/ui-mocks/index.html` over a local `python -m http.server`). Build each screen to match its mock, on the real tokens.

## Done (stages 1 and 2)
- `07ed9cf` type tokens (`text-caption/body/heading/title/display`) + a ratchet test on `text-[Npx]`; `cn()` knows the font-size classes.
- `0fd1d8a` button ladder (`tonal`, `onImage`, size `lg`), `Card` with a border, `ui/tone.ts` shared tone map.
- `89b2548` `Fold`, `SettingRow` (+ `NumControl`, `Segmented`), `Section` in `src/components/ui/`.
- `3b1c4af`, `c024c84`, `778bf4f`, `a48862b` World DM panel as three task cards (variant C), CHANGELOG entry without a version bump.

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
