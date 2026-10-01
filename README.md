> **Molfar Vertep fork.** This is the Roleplay app as shipped with
> [Molfar Vertep](https://github.com/MolfarWav/Molfar.Vertep), a fork of
> Chrysalis Engine. It is forked from
> [ProjectChrysalis/Roleplay-Chrysalis](https://github.com/ProjectChrysalis/Roleplay-Chrysalis)
> and licensed under the same AGPL-3.0 (see `LICENSE`). Molfar Vertep installs
> and updates Roleplay from this repository only.
>
> Changes from upstream are listed in `CHANGELOG.md`. The upstream README follows.

# Roleplay

**A roleplay studio for power users, built as a Chrysalis app.**

Chat with characters, run group scenes, shape every prompt, and keep all of it
on your own device. Roleplay runs inside [Chrysalis](https://github.com/ProjectChrysalis/Chrysalis-Engine),
so it works with any model provider Chrysalis connects to, and like every
Chrysalis app it is plain files: ask the Chrysalis agent for a feature and it
builds it into your copy while you watch.

## Features

**Chats**
- Streaming replies with swipes, continue, impersonate and stop
- Edit, hide, bookmark, move and delete any message
- Branches: fork a chat at any message and switch between branches
- Group chats with turn order by list or by who was mentioned, muting and force-speak
- Markdown with code highlighting and math, plus a translation option per message
- Text to speech, including free voices that need no key

**Characters and personas**
- Tabbed character editor: description, personality, scenario, greetings,
  example messages and a picture gallery
- Alternate greetings, tags and folders
- Personas you switch per chat
- Expression sprites that follow the mood of the reply
- A built-in marketplace browser for finding and downloading character cards

**Prompts and memory**
- Presets with a drag-and-drop prompt manager and every sampler setting
- Lorebooks (world info), global or linked to a character or persona
- Regex scripts for input, output, prompts and display
- Chat memory: a running summary with undo, plus a per-chat facts vault
- Data bank: attach documents a chat can draw on
- Macros and chat-local variables

**More**
- Tool calling: dice rolls, pictures drawn mid-reply, and your own tools
- Image generation from the scene, a character or a face
- Shortcuts (quick replies) that can run on startup, on chat change, and on each message
- Themes and chat backgrounds, plus a Ctrl+K command palette
- Works on phones, with a layout made for small screens

**Your data**
- Imports PNG and JSON character cards (V2 and V3), chat transcripts, presets,
  lorebooks, regex scripts, personas and themes in the common community formats
- Full backup and restore as one zip
- Everything is stored as files in your Chrysalis workspace, with history

## Install

1. Install [Chrysalis](https://github.com/ProjectChrysalis/Chrysalis-Engine#install).
2. On first start, pick **Roleplay** on the welcome screen. You can also find it
   later in the launcher under **Store**.
3. Add a model connection in **Settings > API connections** and start chatting.

To install a specific copy, use **Import app** in the launcher with
`https://github.com/ProjectChrysalis/Roleplay-Chrysalis`.

## Updates

Roleplay updates on its own, separately from Chrysalis. The launcher tells you
when a new version is out. Updating merges it with any changes you or the agent
made to your copy, and never touches your chats, characters or other data.

## Development

The app is a React + Tailwind frontend in `src/` and sandboxed backend plugins
in `plugins/`. Chrysalis builds it in the browser, so there is no dev server to
run.

```sh
bun install
bun run typecheck
bun test
```

To try changes, point a Chrysalis install at your fork with **Import app**, or
copy your working tree over `apps/roleplay/` in a Chrysalis workspace (leave
`data/`, `node_modules/` and `dist/` alone). `AGENTS.md` is the technical guide
to how the app is put together.

Bump `version` in `manifest.json` with every release, and the plugin's own
`manifest.json` version whenever its `plugin.js` changes.

## License

Licensed under the **GNU Affero General Public License v3.0 only** (AGPL-3.0-only).
See [LICENSE](LICENSE).
