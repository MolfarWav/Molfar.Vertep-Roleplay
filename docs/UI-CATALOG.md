# UI catalog (draft, phase 1 of issue MolfarWav/Molfar.Vertep#191)

Status: a proposal, not built. Nothing here is in the app yet. The owner picked variant C (2026-10-31) but building waits:
another branch is working on the DM and the final layout may need to be adjusted to it. Mocks: `docs/ui-mocks/world-dm/index.html`. Numbers were counted on `main` at 4.79.0 (2026-10-31), `src/**`.

The bar (ux-review): practical, native, designed, client-first. This file is the catalog the rule "reuse
before inventing" was missing: what exists, what is duplicated, and the few shared pieces to build.

## 1. Audit

### 1.1 `ui/` primitives (33 files in `src/components/ui/`)

Base-ui/shadcn pieces, fine as they are: `alert-dialog`, `avatar`, `badge`, `button`, `checkbox`, `command`,
`dialog`, `dropdown-menu`, `input`, `input-group`, `label`, `popover`, `scroll-area`, `select`, `separator`,
`sheet`, `slider`, `switch`, `tabs`, `textarea`, `tooltip`, and the app's own `confirm`, `empty`, `error-boundary`,
`field`, `image-viewer`, `info-tip`, `marquee-text`, `pager`, `scroll-strip`, `sonner`.

Layout level (setting row, section, fold, card): **missing or unused.**

- `ui/card.tsx` exists and is imported by **1** file (`<Card` appears once). Instead there are **143** hand-written
  `border … bg-card` boxes (147 `rounded-md border border-border`, 68 `rounded-lg border border-border`).
- `ui/collapsible.tsx` is a bare primitive (20 lines, no look). 16 `<Collapsible>` roots and 16 native `<details>`
  each style it themselves (41 `aria-expanded` buttons in all).
- `ui/info-tip.tsx` (the "i" popover) exists, and `world-setting-row.tsx:12` has a second one, `InfoButton`.
- `ui/field.tsx` exists; there are also local `Field` in `canvas/forge/card-form.tsx:19`,
  `dashboard/dash-common.tsx:458`, `lore/entry-editor.tsx:35`, `views/character-editor.tsx:981`.

### 1.2 Fold patterns (what a "fold" looks like today, all different)

| # | Where | Look |
|---|---|---|
| 1 | `world/world-setting-row.tsx:120` `FoldSection` (World DM, 5 per panel) | plain text button, 14 px caret `text-muted-foreground`, no hover, no summary, sessionStorage state |
| 2 | `settings/memory-summary-section.tsx:330` `Block` | **the best one**: `min-h-11` tinted title bar in a tone, icon, caret `size-4` rotating, summary when closed |
| 3 | `profile/profile-form.tsx:405-430` `SectionCard` | `min-h-14` row, `border-l-4` accent, count `2/5`, blurb, caret `size-4` muted |
| 4 | `character/card-model-panel.tsx:32` | bordered box, `min-h-10` trigger, `text-xs` |
| 5 | `chat/prompt-sources.tsx:122, 171` | `w-fit` text link, `text-xs font-semibold`, no box |
| 6 | `dashboard/dash-notebook.tsx:200`, `dash-said.tsx:117` | "show more" link, `text-xs`, caret only on hover colour |
| 7 | `dashboard/dash-settings.tsx:644` ("Advanced") | `text-[11px] uppercase tracking-wide`, caret `size-3` |
| 8 | `dashboard/dash-settings.tsx:657` (prompt parts) | border with no radius, `text-sm`, caret `size-3`, `hover:bg-muted` |
| 9 | `dashboard/dash-threads.tsx:302, 314` | `text-[11px]`, `min-h-6`, caret `size-3` |
| 10 | `chat/message-row.tsx:145, 751, 782` (reasoning) | the `ls-chip` pill from `globals.css` |
| 11 | 16 native `<details>` (`canvas/agent-forge.tsx:394`, `canvas/forge/card-form.tsx:596`, `canvas/forge/agent-form.tsx:132`, `canvas/forge/palette.tsx:90`, `canvas/forge/try-panel.tsx:169`, `chat/agent-notes.tsx:44,52`, `chat/agent-own-limits.tsx:45`, `chat/agents-panel.tsx:349,361,491`, `chat/preset-panel.tsx:72`, `chat/prompt-peek-dialog.tsx:137`, `dashboard/dash-cards.tsx:355`) | browser marker, five different box styles |

That is **about 11 looks for one job.** Pattern 2 is the template for the shared `Fold` (section 2.1).

### 1.3 Local rows, sections, headings

- Setting row: `world-setting-row.tsx:37` `SettingRow` (good, 40 px on a phone), `dice-fields.tsx:42` `Row`
  (wraps it again), `NumControl` (`world-setting-row.tsx:53`) and `NumField` (`dice-fields.tsx:12`) are the same control
  twice; the dice card also adds `border-l-4` and `bg-muted/30` inside a fold inside a card (three levels of box).
- Section / block: `chats/chat-panel.tsx:49` `Section`, `character/memory-import-dialog.tsx:368` `Section`,
  `character/memory-block.tsx:13` `Block`, `character/memory-story-lines.tsx:148` `Block`, `home/home-ui.tsx:38` `Block`,
  `persona/persona-tabs.tsx:110` `Block`, `settings/memory-summary-section.tsx:330` `Block`, `lore/book-settings.tsx:14`
  `Group`. Eight local copies.
- `<h3>` headings: 8 different class strings (`text-sm font-medium` ×14, `text-xs font-semibold uppercase tracking-wider` ×10,
  `border-b pb-1 text-base font-semibold` ×4, …); 109 `uppercase` labels.
- Hints: `text-xs text-muted-foreground` ×455.

### 1.4 Type sizes (measured)

`text-[Npx]` literals: **800** (STATE.md said 783; the difference is counting). Named steps: `text-xs` 1193,
`text-sm` 646, `text-base` 27, `text-lg` 15, `text-xl` 7, `text-2xl` 2, `text-3xl` 2.

Note `--text-base: 0.8125rem` in `globals.css:11` and `body { font-size: 13px }`: `text-base` is **13 px, smaller than
`text-sm` (14 px)**. That alone makes the scale unreadable ("which one is the body?").

Below the 12 px floor: **697** literals (`text-[11px]` 446, `[10px]` 226, `[9px]` 14, `[10.5px]` 5, `[11.5px]` 5, `[8px]` 1).
Top files by count of ≤ 11 px: `views/marketplace-view.tsx` 36, `views/presets-view.tsx` 28, `dashboard/dash-settings.tsx` 27,
`views/lorebooks-view.tsx` 25, `chat/agents-panel.tsx` 24, `chat/chat-quick-bar.tsx` 21.

### 1.5 Spacing, radius, borders (measured; counts of `p/px/py/gap/space` steps)

`2` (8 px) 1181, `1.5` (6 px) 674, `3` (12 px) 618, `1` (4 px) 547, `4` (16 px) 227, `0.5` (2 px) 216, `2.5` (10 px) 191,
`6` 31, `5` 30, `8` 12. So **1112 of 3728 (30 %) are off the 4 px rhythm** (`0.5`, `1.5`, `2.5`, `3.5`, `5`).
Radius: `rounded-md` 355, `-full` 196, `-lg` 158, bare `rounded` 120, `-none` 75, `-xl` 25, `-sm` 13, and 19 `rounded-[Npx]`.
Side bars: `border-l-4` ×5, `border-l-2` ×6 (accent edges on cards).
Files over 850 lines (tsx/ts): 17 incl. `i18n.ts` 8065 and `store.ts` 3402; of the UI files `marketplace-view.tsx` 1737,
`chat-view.tsx` 1520, `prompt-board.tsx` 1251, `dash-settings.tsx` 1129, `message-row.tsx` 1127.

## 2. Proposal: the foundation

### 2.1 Type scale: five named steps, floor 12 px

Added as Tailwind theme tokens (`--text-caption` etc. in `globals.css`) so the classes are `text-caption`, `text-body`,
`text-heading`, `text-title`, `text-display`; a test counts `text-[Npx]` and may only go down (ratchet, start at 800).

| Step | px / line | Weight | Used for | Today it replaces (counts) |
|---|---|---|---|---|
| `caption` | 12 / 16 | 400, 500 for chips | hints, status lines, chips, meta, badges | `text-xs` 1193 (same size); `[8…11.5px]` **697**; `[12px]` 24; `[12.5px]` 6 |
| `body` | 14 / 20 | 400, 500 labels, 600 titles of a row group | rows, labels, inputs, buttons, prose in panels | `text-sm` 646 (same); `text-base` 27 (13 px); `[13px]` 29; `[14px]` 4 |
| `heading` | 16 / 24 | 600 | a section's heading | `[15px]` 16; `[16px]` 1; `[17px]` 10; `[18px]` 3; `[19px]` 2; most of `text-lg` 15 |
| `title` | 20 / 28 | 400 `font-heading` (Kurale) | a page or sheet title | `text-xl` 7; `[22px]` 1; some `text-lg` |
| `display` | 28 / 32 | 600, tabular | big numerals, empty-state hero | `[25px]` 1, `[26px]` 2, `[28px]` 1, `text-2xl`/`3xl` 4 |

Not mapped, check by hand: `[32px]` 2, `[40px]` 1 (clock / numerals, probably `display` exceptions). Check: 697 + 30 + 33 + 32 + 1 + 4 + 3 = 800.

Rules: at most three levels on a screen (title, heading, row); `uppercase tracking-wide` labels stop being a heading style
(109 uses): a heading is `heading`, a small label is `caption`. Body text (`body`) is 14, so `body { font-size: 13px }` becomes
14 px in phase 2 only for screens built on the tokens; old screens keep their size until redone. Chat prose has its own scale
(`--prose-scale`, 15 px × scale) and is not part of this.

### 2.2 Spacing, radius, border, tone

- Steps (px): 4, 8, 12, 16, 24 (`1, 2, 3, 4, 6`); 32 between page blocks. `0.5`, `1.5`, `2.5` are allowed only inside a
  control (icon and label gap, chip padding), never between blocks.
- Between rows of one section: hairline (`border-t`), not a gap. Between sections: 24. Section heading to its card: 8.
  Related things closer than unrelated ones.
- Radius: controls (input, button, select, segmented tray) `rounded-lg` (8 px); containers (card, fold) `rounded-xl`
  (11 px, the `ui/card` value); inner pieces `rounded-md`; chips, switches, avatars `rounded-full`. Bare `rounded`
  and `rounded-[Npx]` go.
- Border: 1 px `border-border` on containers, `bg-card` surface, flat (no shadow except popovers). No coloured left bar:
  the tone goes into the heading mark or tinted header (`border-l-4/2` ×11 go).
- Tone (one hue per kind of content, from `dash-common.tsx` `TONE`): sky = schedule / scene, emerald = records / memory,
  violet = story / people, pink = plot, teal = place, amber = thing / warning, slate = neutral. A tone is always paired with
  an icon or a word, never colour alone. No hex in new code; the tones are Tailwind palette classes as today.
- Touch: 40 px minimum on a phone (rows 48, fold header 48, switch hit area 40 via the extended `::after`).

### 2.3 Shared pieces (specs)

All in `src/components/ui/` (new files `fold.tsx`, `setting-row.tsx`, `section.tsx`; `card.tsx` extended in place).

**`Fold`** (replaces the ~11 looks in 1.2; built on `ui/collapsible.tsx`, i.e. base-ui, so keyboard and aria are free)

- Props: `id` (state key), `title`, `summary?: string` (what is set, one line, shown only while closed, truncated),
  `tone?`, `icon?`, `count?` (number of settings changed from default), `defaultOpen?`, `flat?` (no outer box, used inside a
  card), `children`.
- Look: a full-width button, `min-h-12` (48 px), `bg-muted`, hover `bg-accent`, focus ring `ring-ring/50`, title 14/600,
  summary caption `text-muted-foreground`, caret **20 px in `text-foreground`**, rotating; open: summary hidden, hairline under
  the header. Tone: a 10 px square before the title.
- Remembered: open state per `id` in `localStorage` (`rp.fold.<id>`), wrapped in try/catch (the existing `rp.worldSections`
  is session-only). No nesting: a dev-time warning if a `Fold` is rendered inside a `Fold`.
- Tests: opens on click and Enter/Space, `aria-expanded`, summary only when closed, state survives remount, no nesting.
- Replaces: `FoldSection` (1), `Block` (2, becomes `Fold` with `tone`+`icon`), `SectionCard` fold mode (3), 4, 5, 6, 7, 8, 9
  and the `<details>` of 11; (10) the reasoning chip stays: it is a chip, not a section.

**`SettingRow`** (replaces `world-setting-row.tsx` `SettingRow`, `dice-fields.tsx` `Row`, local `Field`s in settings screens)

- Props: `label`, `info?` (long text → `InfoTip` popover on click), `status?` (one muted live line), `children` (the control),
  `off?` (dimmed, with the reason in `status`).
- Look: label `body`, (i) 32 px hit area (40 on a phone), control right, `min-h-11` (48 on a phone), wraps under 9 rem.
- Companions moved next to it: `NumControl` (one number control, was twice), `Segmented` (active option gets border and
  weight, not only a shade), the (i) is `ui/info-tip.tsx` (delete `InfoButton`).

**`Section`**

- Props: `title`, `tone?`, `icon?`, `aside?` (caption on the right), `variant: 'plain' | 'card' | 'tinted'`, `chips?`, `children`.
- `plain`: heading (16/600, tone square) above a `Card` of `SettingRow`s. `tinted`: the header bar is the tone's soft fill with icon,
  heading and value chips (variant C in the mocks). One variant per screen.
- Replaces the eight local `Section`/`Block`/`Group` (1.3) and the `<h3>` class zoo.

**`Card`** (extend `ui/card.tsx`, do not add a new one)

- Surface `bg-card`, `border border-border`, `rounded-xl`, no padding of its own for row lists (`variant="rows"`: children are
  separated by hairlines), padding 16 for free content (`variant="padded"`). Drops `ring-1` in favour of the border so
  it matches the 143 hand-made boxes and they can switch over without changing look.
- Replaces the 143 `border … bg-card` boxes over time, screen by screen (not a codemod).

### 2.4 Rule: the important button stands out (owner, 2026-10-31)

Like "Buy" in a shop: a button that commits or starts something (Save, Create, New chat, Send, Open chat, World turn) is filled
in `primary`/`cta` and is the loudest thing in its block, also over a picture (label contrast, a scrim behind it when needed).
Look at, Edit, Cancel and navigation are outline or ghost. Few filled buttons: one per decision, two side by side only when
they are different jobs. **Weight is a ladder** (owner, same day: four equal green buttons have no main one). `Button` variants, strongest first:
`default` (solid cta, `size="lg"` 44 px, one per screen), `onImage` (white, dark text, for banners), `tonal` (soft cta fill,
cta border, cta ink, semibold), `outline`, `ghost` (muted text and icon). Two buttons of one weight side by side must be of
equal importance. In the mocks: World turn = default lg; Open chat = onImage; New chat in this world = tonal; Save world =
outline; Look at the world = ghost; Edit profile and World settings = outline. Which job gets which step is the owner's call
per screen. The audit of existing screens happens when each screen is redone.

### 2.5 Colour and picture on the hub

- The "So far" tiles take the tone of what they count: Records emerald (memory), Retired slate, Fronts pink (plot), Runs sky,
  each with an icon and the word, number in the tone's ink.
- The hub header is a banner: the chat's current background (the place's picture when the story is somewhere, else the chat's
  own background, else the plain card) with a dark scrim, the title in `display` over it, the cast as avatar chips, and
  "Open chat" as the filled button. The mock draws a placeholder harbour scene; the real one reuses the existing
  background picker data (`world-bg-set.tsx`, chat background), no new storage.

## 3. UI plan for the World DM panel (ux-review section 1)

**Where it lives and the steps.** Chat header globe → World DM sheet (`chat/world-sheet.tsx`, 448 px wide `sm:max-w-md`,
full width on a phone) or World section → Overview (`world/world-view.tsx:191`, `wide`, two columns from 1024 px). Both render
`WorldControls` (`world/world-controls.tsx`). Steps to a setting: open the sheet (1), the setting is on screen or one tap
away behind a fold/tab whose label and summary say what is inside (2).

**Reused:** `ui/switch`, `ui/input`, `ui/select`, `ui/button`, `ui/popover` + `ui/info-tip`, `ui/collapsible` (inside `Fold`),
`ui/tabs` (variant B only), `ui/confirm`, `world/world-common.tsx` tones, `world/world-profile-picker.tsx`,
`world/dice-fields.tsx` (rows rebuilt on `SettingRow`, own card chrome removed), `world/dice-log.tsx` (becomes the "Recent rolls" `Fold`).
**New:** `Fold`, `Section`, `SettingRow` move to `ui/`, the type tokens. **Why existing do not fit:** `ui/collapsible` has no look,
`ui/card` is unused, the world-local `FoldSection` is the faint pattern the owner rejected.

**States to build and check:** DM off (settings dimmed, the reason in a status line, controls disabled), loading, `missing`,
default, changed (count on the fold/tab), no sensor (three trigger rows disabled with "Needs the Relationship dashboard"),
level without events (Events section hidden), dice off (dice details hidden), "DM is N messages behind" + "Read the whole chat"
(inline notice above the schedule), reading progress with Stop, last-run error (`WorldErrorCard` on top), World turn running,
folded and open, 390 px, 448 px sheet, 1280 px hub; dark and light; Ukrainian strings (about a third longer).

**Variants** (mocks in `docs/ui-mocks/world-dm/`, real tokens, dark and light, 1280 and 390):
A calm column (five headings, only Records folded), B tabs (three tabs, World turn always visible), C task cards (three
tinted cards by task, value chips, expert numbers folded with a summary). The owner picked C; hold the build until the parallel DM branch lands, then re-fit the layout to it.

**Shared on every variant (so the comparison is only about the settings):** the banner header (2.5), the DM switch and profile, "So far" as four
tinted number tiles plus chips (instead of a bullet list), the model block; phone order profile → settings → so far → model.

**Compare with this plan at done:** same place, same components, every state above, screenshots at 390/448/1280, dark and light,
squint test, `ux-review` walk-through.

## 4. Phase 2 (after the pick, no release)

1. Type tokens in `globals.css` + a ratchet test on `text-[Npx]`.
2. `ui/fold.tsx`, `ui/setting-row.tsx`, `ui/section.tsx`, `ui/card.tsx` extended; `InfoButton`, `NumField` removed.
3. World DM rebuilt on them (world-controls, dice-fields, dice-log, world-profile-picker header, status tiles); new i18n keys in
   all locales Roleplay ships; the old `FoldSection` deleted.
4. Tests: component tests for the three shared pieces, the existing `test/` world tests updated, no-nesting check.
5. `browser-check` in dark, light and 390 px (and the 448 px sheet), `ux-review` walk-through against section 3, CHANGELOG note.
6. Not in phase 2: other screens (dashboard Settings, chat, home and lists, card and persona editors follow, in that order).

## 5. Next screen: Dashboard settings, Sensor tab (owner flagged it, 2026-10-31)

Code: `dashboard/dash-settings.tsx` `SensorSection` (line 493). What the screenshot shows is real: after Mode (3 choices) and
Sensor model, **one `Box` holds 14 controls in a row** (prompt insert + tokens, sensor reply limit + warning, six quest numbers,
check every N, notes age, said per turn, remind, catch up, rate automatically), then 7 event-group switches, usage counters
as monospace text, and "Advanced" (prompts). Labels such as "Ask to close a quest after N old-quest checks (0 = never)" are
sentences; four rows carry a second hint line.

Local copies of shared pieces in this file: `SwitchRow` (452), `Fieldset` (482), `NumRow` (140), `SaveBar` (471), and five
inline `<label>… <Input>` rows; Advanced is fold look 7 and 8 from 1.2. Look: `rounded-none`, `border-cta` square nav buttons
in the heading font, `uppercase tracking-wide` 11 px labels; 27 literals at 11 px or below in the file. It reads like a different
product than the World DM panel.

Three variants (mocks `docs/ui-mocks/dash-sensor/`): A task cards (same pattern as the picked World DM variant: How it works /
What the model is reminded of / Quests; event groups become toggle chips; prompts folded), B real Folds with summaries, C a
"Current setup" summary card plus a tile grid for the numbers (short labels, so the copy changes in every locale).
Left nav: vertical list with an active bar on desktop, scrolling tabs on a phone. Save stays in a sticky bar and becomes the
primary button (2.4). The three other tabs (Event vocabulary, What the model sees, Tune with Molfar) are not designed yet.
Recommendation: A, for one pattern across both screens; C if the owner wants the densest overview.

**Picked: C (owner, 2026-10-31).** Build waits, like the World DM panel (the DM branch is in flight; Dashboard follows it in the screen order).
What C needs when it is built:

- Shorter labels, all locales Roleplay ships (key → new English; the old sentence moves into the (i) or the hint under the tile):
  `dash.set.maxSteps` → "Steps per main quest"; `dash.set.everydayTurns` → "Everyday quests end after (turns)" + hint "0 = never";
  `dash.set.retireAfter` → "Ask to close after (old-quest checks)" + "0 = never"; `dash.set.threadCheck` → "Check old quests every (turns)" + "0 = never";
  `dash.set.noteAge` → "Notes stay in the insert (turns)" + "5 to 500"; `dash.set.said` → "Said per turn, at most" + "1 to 4" (the long sentence stays as the hint of "Remind the model what characters said");
  `dash.set.sensorTokens` → "Sensor reply limit (tokens)" + "raise only if replies get cut off" (the long warning goes to its (i)).
- New: the "Current setup" summary card (chips derived from the form: mode, model, insert on/off and tokens, enabled groups count, quest caps; usage chips replace the monospace counters), toggle chips for event groups (`aria-pressed`, check icon so it is not colour alone), a `NumTile` (label, hint, number input) next to `SettingRow` in `ui/`.
- Unchanged logic: `Form`/`patch`, clamps on blur, `SaveBar` (sticky, becomes the primary button), the Advanced prompts (a closed `Fold` with a summary), the other three tabs.

## 6. The chat: kept as it is, four small changes (owner, 2026-10-31)

The owner's decision: the chat is not redesigned. My first three mocks (X1 to X3) were drawn from the code, did not match the real
chat (Note / Lore / Record / World buttons, token count, context chip, dashboard strip with tabs) and are dropped. What stays on
the table is what the owner marked on a screenshot of the real chat; mocks `docs/ui-mocks/chat-small/index.html` show each before and after.

1. **Character name in the header** (`chat-view.tsx:729`, now `text-sm font-medium`, second line `text-[11px]`, avatar 32 px):
   heading font at 20 px (the phone header already uses `font-heading`), second line 12 px, avatar 40 px.
2. **Colour for the right-hand header buttons** (info ring, find, More): tinted tones (info sky, find teal) with the icon in the
   tone's ink; More stays an outlined labelled button. A calmer fallback: no tint, only 40 px. The owner said "maybe", so this is
   the one to confirm.
3. **Bigger side portrait, text does not move.** Today `.look-stage` (`globals.css:411`): `--ls-av-w: 68px`, `--ls-av-h: 88px`
   times `--avatar-scale`, grid `68px 1fr` with a 20 px gap. Proposed on wide screens: 168 x 216 px, right-aligned in the same
   68 px grid cell so it grows into the empty margin to its left and the text column stays at the same x. The size follows the
   free margin (a container query on the log: `clamp(0, (log width - chat max) / 2 - 16, 100px)` extra), so it falls back to 68 px
   on a narrow window or with the dashboard strip open, and a phone is unchanged. Keeps `--avatar-scale` as a multiplier and the
   click that opens the full portrait. Open point: the arch border radius and the ring scale with the width.
4. **"Since your last reply" stands out** (the dashboard strip's change list, `dashboard/dash-tabs.tsx`): the 11 px muted
   uppercase caption becomes a tinted sky bar with a 14 px semibold title and a count circle (the dashboard's change markers; red
   when a change is negative); the chips below are unchanged.

Not touched: the header tool buttons, token count, context chip, Open dashboard, the log, the composer. The weight ladder (2.4) still
applies to buttons the owner touches later. Backgrounds already show in the chat (a user setting), so nothing to add there.

**Accepted (owner, 2026-10-31): all four as proposed** (header icons in the tinted version). Build waits with the others; this one is
small and independent of the DM branch, so it can ship first when building starts.
