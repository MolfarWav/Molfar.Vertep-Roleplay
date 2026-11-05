# Couplings and traps (Roleplay app)

Purpose: this map names what is tied to what in the Roleplay app, which invariant must stay true, where it is enforced, and which test fails when it breaks. It is for a person or a session that changes one area and must not forget a link.
One entry per area. Each entry points to the area's docs (`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ENTITY-REGISTRY.md`, `docs/DATA-FORMATS.md`) and writes down only what falls between them or is easy to forget.
A test that checks the pointers (paths and symbols named here must exist) is planned in MolfarWav/Molfar.Vertep#247; until it lands, check them by hand when you touch an entry.
Update the entry in the same change that touches the area.
Date: 2026-11-05.

### Shared code copied into plugins
- **Touches:** `src/lib/entity-registry.js` (source) and the copies in `plugins/relations`, `plugins/world`, `plugins/litopys`; `plugins/agents/plugin.js` (generated agent-check and agent-run block); `src/lib/forge-recipes.ts` (generated from `.skills/agent-craft/references/`).
- **Must stay true:** each generated block is byte-equal to its source (line endings aside). A plugin cannot import another plugin, so the copy is the only way to share code. Never edit a generated block by hand; edit the source and run the script.
- **Enforced in:** `scripts/sync-registry.ts` `PLUGINS` `BEGIN` `outOfDate` `withBlock`; `scripts/sync-agents-plugin.ts` `BEGIN`; `scripts/sync-agent-recipes.ts` `generated`.
- **Fails in:** `test/rp-entity-registry.test.ts` (case "each plugin carries exactly the source"); `test/rp-agents-plugin.test.ts`; `test/rp-forge.test.ts`.
- **Why / history:** `docs/ENTITY-REGISTRY.md` ("Finding the entity a word means") gives the reason: one function, copied because plugins cannot import each other.
- **Trap:** the sync check reads only the plugins listed in `PLUGINS`. A new plugin that needs `resolveName` must be added to that list, or no test sees its copy. A fix made by hand in one copy is overwritten at the next sync.

### Entity ids and name fields
- **Touches:** `resolveName`, `regAdd`, `regGet`, `regAlias` (`src/lib/entity-registry.js`); `makeCanon` and `litCanon` (`plugins/litopys`); the registry file `data/registry/<chatId>.json`; Litopys fact fields `subject` and `knownBy`; the chapter field `cast`.
- **Must stay true:** one person, thing or place has one id (`p#`, `o#`, `l#`; the user is `user`). A merged entity still resolves, to its target. Litopys facts keep names in `subject` and `knownBy` (as `docs/DATA-FORMATS.md` says), and names pass through the registry when a chapter is written. A new format stores the id, not the name.
- **Enforced in:** `src/lib/entity-registry.js` `resolveName` `regGet`; `plugins/litopys/plugin.js` `makeCanon` `litCanon`.
- **Fails in:** `test/rp-entity-registry.test.ts`; `test/rp-registry-bridges.test.ts` (names `litCanon`).
- **Why / history:** #240 (registry), with #212, #236, #185 and #123 as related (`docs/ENTITY-REGISTRY.md`, "Related").
- **Trap:** the design doc's status line says "phase A in work", while its later sections describe more progress. Read the newest section before you assume what exists. A new feature that stores a display name where an id belongs brings back the duplicate-person problem the registry was built to fix.

### World DM and Dashboard shared ids
- **Touches:** the World DM records (`n#` ids, `ref` on a record); the scene tracker's `state.regIds` in `plugins/relations` and `plugins/world`; `src/lib/entity-registry.js`.
- **Must stay true:** when the DM ties its record to a thing or place the tracker knows, the record carries the registry id in `ref`, whatever language the story uses. `regIds` maps each tracker id to a registry id. Holder and location fields are still names today (`docs/ENTITY-REGISTRY.md`, "Why"); a new field stores the id.
- **Enforced in:** `plugins/world/plugin.js` `regIds` (state key) and the `ref` handling; `plugins/relations/plugin.js` `regIds`.
- **Fails in:** `test/rp-registry-bridges.test.ts`.
- **Why / history:** #240 (registry phase B: things and places).
- **Trap:** renaming a place or thing by a string match in one plugin splits the two lists again. Go through `regIds`.

### Hook insert reserve (history budget)
- **Touches:** every sibling plugin that adds text after assembly: `plugins/relations` (Dashboard block, "said" block, journal), `plugins/litopys` (story insert, backstory, card, persona and world memory, habits, recollections, who-knows-what, hidden plan), `plugins/world` (here note, event, dice), `plugins/agents` (inserts file). The history budget in the engine's reply path.
- **Must stay true:** each block a sibling can add has one row in `hookInsertBreakdown` with the most it can take in this chat. A block the chat has switched off, or the chat cannot have, counts 0. The history budget takes away the sum (`hookInsertReserve`).
- **Enforced in:** `plugins/engine/plugin.js` `hookInsertBreakdown` `hookInsertReserve`.
- **Fails in:** `test/rp-hook-reserve.test.ts`. It checks the numbers of the rows it knows. No test compares a real insert with its row, so a new sibling block with no row passes.
- **Why / history:** #184 (the breakdown comment cites MEMORY-INJECTION 13.1).
- **Trap:** a new insert in a sibling with no row here is not reserved, so the window overflows silently, and no test compares a real insert with its row (#248, item 5; the structural fix is the `insertCeiling` hook, #220). The row "dashboard said" follows the switch `plugin:said` since #248.

### Prompt board switch keys
- **Touches:** `meta.promptBoard.off` in the chat file; `PROMPT_BOARD_OFF_KEYS` and `PROMPT_BOARD_OFF_RE` and `cleanPromptBoard` (engine plugin); readers in `plugins/litopys`, `plugins/relations`, `plugins/world`; `src/lib/carries.ts` (`CarrySwitch`, `switchKey`); `src/components/canvas/prompt-board.tsx`; `src/lib/prompt-order.ts` (order keys for "said", "journal", "persona memory").
- **Must stay true:** every key the board writes is in `PROMPT_BOARD_OFF_KEYS`, or matches `PROMPT_BOARD_OFF_RE` (`section:` or `book:` with a name). `cleanPromptBoard` drops any other key when the chat is saved. The same key turns the same part off in the assembly, in the carries strip and in the reserve.
- **Enforced in:** `plugins/engine/plugin.js` `PROMPT_BOARD_OFF_KEYS` `PROMPT_BOARD_OFF_RE` `cleanPromptBoard`; `src/lib/carries.ts` `CarrySwitch`; `plugins/litopys/plugin.js` `offForChat`.
- **Fails in:** `test/rp-prompt-board.test.ts` (pins the key list literally, and the `cleanPromptBoard` cases); `test/rp-hook-reserve.test.ts`.
- **Why / history:** the habits key was `plugin:cardskills` until 4.67.0 and is now `plugin:cardhabits` (comment in `cleanPromptBoard`).
- **Trap:** a new key added to the board and not to `PROMPT_BOARD_OFF_KEYS` is erased on save, with no error. Old chats still hold `plugin:cardskills`; the alias is read in `cleanPromptBoard`, in the reserve and in `plugins/litopys`. Do not remove it. The keys `plugin:cardmemory`, `plugin:personamemory` and `plugin:worldmemory` are switch keys, not plugins. For persona and world memory the switch also flips the chat's opt-in (`src/lib/carries.ts`, `optIn`): a board toggle is not the same as the opt-in.

### Litopys insert file and the memory traces
- **Touches:** `litopys/insert/<chatId>.json` (writer: the Litopys reply hook; readers: the engine reserve, the Litopys reply hook for causes, `traceRoute`, `carriesRoute`); `markUsed`, `causeRecord`; route `/litopys/trace`; route `/databank/trace` and its file `databank-trace/<chatId>.json` (written by `assemble` in the engine plugin).
- **Must stay true:** the Litopys reply hook writes the insert file; it never writes the chat file (the code comment says why: the worker may save a chapter at the same time). A preview writes neither the insert file nor `databank-trace/`. The `trace` field exists only when the reply had an insert. `used` keeps the fact ids already in the story, so the next insert does not repeat them.
- **Enforced in:** `plugins/litopys/plugin.js` `INSERT_DIR` `markUsed` `causeRecord` `traceRoute` `carriesRoute`; `plugins/engine/plugin.js` `assemble` (the `databank-trace/` write, behind `!opts.dryRun`).
- **Fails in:** `test/rp-litopys-causes.test.ts` (`causeRecord`); `test/rp-litopys-recency.test.ts` (`markUsed`); `test/rp-memory-trace.test.ts` and `test/rp-studio.test.ts` (both name a trace route; which assertion covers which route is UNVERIFIED).
- **Why / history:** #184 (the Data Bank trace is "#184 P6" in the code comment).
- **Trap:** the engine reads this file, in another plugin, for the recollections row of the reserve (`ins.recollections`). Renaming that field in Litopys alone silently drops the row, and no test here fails for it.

### Who knows what (witnesses and Data Bank scope)
- **Touches:** `witnessed`, `castKnowledgeFor`, `buildInsert`, `buildBackstory`, `soleVoice` (`plugins/litopys`); `carriesRoute` (same plugin, the preview route); `databankInScope` (engine plugin, Data Bank file `scope` and `scopeTargetId`); the card's `characterIds` of the scene.
- **Must stay true:** a chapter that the speaking character did not witness stays out of that character's reply. The same rule holds in the story insert, in the backstory block and in the carries route, which uses the same `soleVoice` call. A Data Bank file with a character or chat scope is not injected outside that scope.
- **Enforced in:** `plugins/litopys/plugin.js` `witnessed` `castKnowledgeFor` `buildInsert` `buildBackstory` `soleVoice`; `plugins/engine/plugin.js` `databankInScope`.
- **Fails in:** `test/rp-omniscience.test.ts` (`castKnowledgeFor`, `witnessed`); `test/rp-memory-trace-report.test.ts` (`witnessed`). No test names `soleVoice`, `buildBackstory` or `databankInScope`; whether behavior tests cover them is UNVERIFIED.
- **Why / history:** #184 (P2: "who witnessed the scene"; code comment at `plugins/litopys`).
- **Trap:** fixing `buildInsert` alone leaves `buildBackstory` telling a non-witness about an old chapter. Every caller must pass the same `soleVoice` result. Check all four call sites when you touch one.

### Leak check (who learned what in a reply)
- **Touches:** `leakCandidates`, `leakCandidatesOf`, `holdLeakNotes`, `leakRoute`, `state.leaks` (Dashboard state, `plugins/relations`); route `POST /dashboard/leak`; `src/components/chat/leak-note.tsx` (the badge); Litopys op `know` (sets `knownBy` on a fact, in the Litopys edit route).
- **Must stay true:** each leak item is keyed by message and swipe (`<messageId>#<swipe>`) and has status `open`, `found` or `ignored`. Only the user's answer sets `found` or `ignored`, through `/dashboard/leak`. A renamed or removed character rewrites the `who` of its leak items. Op `know` adds a name to `knownBy` and does not rewrite the chapter text.
- **Enforced in:** `plugins/relations/plugin.js` `leakCandidates` `leakRoute` `state.leaks`; `plugins/litopys/plugin.js` op `know` (in the list of accepted ops).
- **Fails in:** `test/rp-leak-check.test.ts` (route and detector); `test/rp-omniscience.test.ts` (op `know`).
- **Why / history:** #184 (P3, per `docs/DATA-FORMATS.md`, the `leaks` field).
- **Trap:** `leakCandidates` is a word match. The eval script `scripts/leak-scenarios/eval-p3.ts` checks it against scenario rows; it is not a test, so run it when you change the detector.

### Hidden tags cut before save
- **Touches:** `<vertep_state>` (Dashboard fast mode, `FAST_TAG`); `<vertep_plan>` (Litopys hidden plan, `PLAN_TAG`, and `HIDDEN_PLAN_TAG` in `plugins/litopys`); the save paths in the engine plugin (reply text, reasoning, parts, cancel); `src/lib/state-tag.ts` (client `hideStateTag`, hides a partial tag while streaming); the FAST reminder in `plugins/relations`.
- **Must stay true:** `<vertep_state>` and `<vertep_plan>` never reach a saved message, its reasoning or its parts, in any mode. A cancelled reply is cut too (`cutPlanTag` runs with `stopped` true).
- **Enforced in:** `plugins/engine/plugin.js` `cutStateTag` `cutPlanTag` `FAST_TAG` `PLAN_TAG`; `src/lib/state-tag.ts` `hideStateTag`.
- **Fails in:** `test/rp-fast-tag.test.ts` (`cutStateTag`, `cutPlanTag`); `test/rp-state-tag.test.ts` (client).
- **Why / history:** no issue number in the code; the comment in `src/lib/state-tag.ts` names the Litopys hidden plan as #184.
- **Trap:** a new save path that calls `onSave` without `cutStateTag` writes the tag into history. Search for `onSave(` before adding a branch: the engine has five sites that cut, and a sixth without the cut passes every test that does not send a tag.

### Per-reply cost and the 10 s plugin clock (#245)
- **Touches:** every hook that runs per reply (engine `assemble`, Litopys, Dashboard update in `plugins/relations`, World, Agents); the sandbox clock in the engine repo (`src/plugins/sandbox.ts`); the benches.
- **Must stay true:** work done per reply stays cheap. The Dashboard state update finishes inside the sandbox clock (the comments in the engine say 10 s). A second pass of an update does not rescan old replies.
- **Enforced in:** `src/plugins/sandbox.ts` `CALL_TIMEOUT_MS` `CALL_OVERHEAD_MS` (engine repo); the Dashboard update path in `plugins/relations` (the update pass; the symbol is UNVERIFIED).
- **Fails in:** `test/rp-dash-registry.test.ts` (describe "the second pass of an update does not scan the replies again (#245)"); benches `test/rp-longchat-bench.test.ts`, `test/rp-recall-bench.test.ts`, `test/rp-recall-mrr-bench.test.ts` (whether they assert a budget is UNVERIFIED).
- **Why / history:** #245: after Roleplay 4.88.0 the Dashboard of a long chat stopped updating ("exceeded the maximum allowed time limit"). `CHANGELOG.md` has the entry.
- **Trap:** the exact clock of a plugin route is UNVERIFIED: no route-level constant was found; `CALL_TIMEOUT_MS` is 20 s including worker start and the comment says the sandbox caps at 10 s. Measure on a long chat with old-format state. A short test chat did not show #245.

### Card and lorebook formats
- **Touches:** `docs/DATA-FORMATS.md` (sections "Characters", "Lorebooks", "Presets"); `.skills/edit-large-card/SKILL.md` (Roleplay); its engine copy `.fork/app-skills/roleplay/edit-large-card/SKILL.md`; the workspace task for the built-in agent (in the engine repo, `.fork/handoff/`); `src/lib/types.ts`; `src/lib/engine.ts` (`characterToCard`, `lorebookToEngine`).
- **Must stay true:** every field the app writes to `data/characters/<id>/card.json` or `data/lorebooks/<id>.json` is named in `docs/DATA-FORMATS.md`. The card skill describes the same format as the code.
- **Enforced in:** `src/lib/engine.ts` `characterToCard` `lorebookToEngine`; `docs/DATA-FORMATS.md` (section headers).
- **Fails in:** `test/rp-data-formats.test.ts` (fails when the app writes a field the doc does not name). No test compares the two copies of the card skill.
- **Why / history:** a rule in `AGENTS.md` and `CLAUDE.md` (no issue number).
- **Trap:** the card skill has two copies (this repo and the engine's `.fork/app-skills/roleplay/edit-large-card/SKILL.md`) and no test compares them; they were made identical in #248, so change both in the same change.

### Strings: shell dictionaries and guide pages
- **Touches:** `src/lib/i18n.ts` (`en` and `uk` dictionaries, `MsgKey`, `DICTIONARIES`); guide pages `.skills/guide/pages/*.md` and translations `.skills/guide/l10n/<lang>/`; in-app guide `src/lib/guide-tips.ts` (`TIPS`, `TOURS`, `APP_VERSION`) and `manifest.json`.
- **Must stay true:** `uk` has every `en` key with the same `{placeholders}`. A screen change updates its guide page in the same change. A tip or tour names a `data-guide` target that exists. `APP_VERSION` equals the manifest version.
- **Enforced in:** `src/lib/i18n.ts` `uk` (typed `Record<MsgKey, string>`) `DICTIONARIES`; `src/lib/guide-tips.ts` `TIPS` `TOURS` `APP_VERSION`.
- **Fails in:** `test/rp-i18n.test.ts` (every English key has a Ukrainian string; placeholders match); `test/rp-guide.test.ts` (tip ids, targets, `APP_VERSION` matches the manifest). No test reads `.skills/guide/` or its `l10n`.
- **Why / history:** a rule in `AGENTS.md`; the guide page format is in the engine repo (`.fork/handoff/guide/FORMAT.md`).
- **Trap:** a new guide page with no translation shows English, and nothing fails. A new screen with no guide page is not caught by any test; Molfar then answers from the code, which costs many calls.

### Line endings
- **Touches:** CRLF files: `plugins/engine/plugin.js`, `plugins/relations/plugin.js`, `src/lib/i18n.ts`, `docs/DATA-FORMATS.md`, `AGENTS.md`. LF files: `plugins/litopys/plugin.js`, `plugins/world/plugin.js`, `src/lib/entity-registry.js`. The generated-block script (`scripts/sync-registry.ts`).
- **Must stay true:** a file keeps the line endings it has. The sync script writes CRLF back when the file had CRLF (`withBlock` plus the `\r\n` check in its main block) and compares with LF.
- **Enforced in:** `scripts/sync-registry.ts` `withBlock` `outOfDate`.
- **Fails in:** no test checks line endings. `test/rp-entity-registry.test.ts` checks content only, so a CRLF file rewritten as LF still passes.
- **Why / history:** no issue number.
- **Trap:** a script or an editor that reads and writes a CRLF file as LF turns the diff into a whole-file rewrite. Run `file <path>` before a bulk edit of one of these files.

### Previews (dryRun) write nothing
- **Touches:** engine `assemble` (option `dryRun`, `gen: "preview"`); the lorebook scan (`dryRun` option); the preview and status calls in the engine plugin (`dryRun: true`); the files a real reply writes: `databank-trace/`, `litopys/prompt-cut/`, the World-info timed state.
- **Must stay true:** a preview does not write the timed state, does not roll the probability of a lorebook entry, and does not write `databank-trace/` or `litopys/prompt-cut/`. 
- **Enforced in:** `plugins/engine/plugin.js` `assemble` (the `dryRun` guard before `databank-trace/` and `litopys/prompt-cut/`); the lorebook scan (the `dryRun` guard before the probability roll and the timed-state update).
- **Fails in:** `test/rp-agent-dry.test.ts` and `test/rp-agents-dry.test.ts` cover agent dry runs. No test names the engine's guards: UNVERIFIED.
- **Why / history:** no issue number in the code.
- **Trap:** a new side effect in `assemble` (a counter, a file, a trace) must sit behind `dryRun`. Any write that is not behind the guard runs on every preview too (UNVERIFIED which preview surfaces call `assemble` today beyond the three `dryRun: true` sites).
