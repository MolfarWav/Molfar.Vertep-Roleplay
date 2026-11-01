# Issue draft for the engine repo (not filed): shell Settings gets an Apps section

Draft written by the Roleplay redesign branch. Do not file it from here; the owner decides. Context: `docs/UI-CATALOG.md`
sections 8.2 and 8.3 (owner decision, 2026-10-31).

## Title

Shell Settings: an "Apps" section where an app contributes its own settings page

## Problem

There are two settings in the product and they are hard to tell apart. The gear in the Roleplay rail opens Roleplay's settings
(Appearance, Chat Behavior, Streaming, Themes, ..., Data, Guide). The gear at the top right of the shell opens the shell's
settings (General, Backup, Connections and models, ...). Both are called "Settings", and the rail's gear floats in a corner far
from the other tools. The `ux-review` rule of 2026-10-11 ("app settings live in the apps, not in the shell's Settings") is the
reason the app page is in the rail.

## Proposal

1. The shell's Settings list gets a group **Apps** at the top, with one entry per installed app that offers a settings page.
   Roleplay is the first.
2. An entry opens the app's own settings view inside the Settings dialog (same layout as the other pages: a title, the page).
3. The app contributes the entry; the shell does not know the app's pages. Two ways to do it, to be decided here:
   - **A. A contributed view.** The app's manifest names a view (a route inside the app, e.g. `settings`) and a title. The shell
     hosts that view in its Settings dialog the way it hosts the app itself (same sandboxed frame and bridge, no new origin).
   - **B. A deep link.** The entry only opens the app on its settings view (`/app/<user>/<app>/#/settings`) and closes the dialog.
     Cheaper, but the settings leave the dialog, which the owner wanted to avoid.
   Roleplay prefers A; B is an acceptable first step.
4. The rule in `ux-review` is rewritten: whole-app settings are reachable from the shell's Settings; settings of one chat or one
   card stay in that chat's or card's own panel.

## What Roleplay does on its side (already in the redesign branch)

- The rail has no Settings item; the page keeps its route (`view: 'settings'`) and opens from Home's Customize and from the
  phone menu. When the engine ships the entry, Roleplay adds the manifest field and the Home link can stay.
- The rail label and page title read "Roleplay settings" so the two pages are not mixed up. The Data page already links to the
  shell's Backup; keep an "Open it" link in both directions.
- The Memory tab of Roleplay settings is gone (it held only a pointer to the Library).

## Acceptance

- Settings (shell) shows Apps > Roleplay; it opens Roleplay's settings page with its own sections and search.
- It works on a phone (full-page dialog) and keeps unsaved edits across closing the dialog the same way other pages do.
- No new origin or permission is given to the app: the existing app bridge allowlist is enough (the page already uses
  `/v1/apps/roleplay/*` and the shell's settings routes it has today).
- Apps without a settings page add no entry.

## Open questions

- Does the shell show an app's entry before the app was ever opened (needs the manifest only), or only after?
- Can an app contribute more than one page (e.g. Roleplay "Settings" and "Guide")? Roleplay needs one.
