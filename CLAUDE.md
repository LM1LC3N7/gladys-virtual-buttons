# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.
It lets users create virtual buttons (push buttons, switches, timed switches)
with an icon and a colour, proposed in Discovery, shown in a dashboard widget,
and used as scene triggers through their state changes.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "timed"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: handlers registered before connect()
src/handlers.js                   the SDK handlers -> ButtonsApp (shared with the tests)
src/app.js                        ButtonsApp: actions, commands, timers, budget, Discovery, status, widget
src/buttons.js                    names, action fields, devices and params, recovery (pure)
src/widget.js                     "Buttons" widget content (pure)
src/store.js                      /data/virtual-buttons.json: buttons, states, ends, removed ids
src/constants.js                  frozen keys, icons, limits, timings
src/i18n.js                       texts shown in Gladys (en/fr)
gladys-assistant-integration.json manifest: actions, widget
docs/en.md, docs/fr.md            user documentation, re-hosted by Gladys (mandatory)
test/                             node --test: fake Gladys (SDK), memory store, hand-moved clock
scripts/cover.mjs                 cover.png generator (plain Node)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** `button:b<12 hex>` drawn once at creation,
  features `press` (push) and `state` (switches). Never derived from the name.
  The same goes for every key users store: action keys and field values,
  widget key and settings (`button_1` … `button_4`), param names (`VB_*`).
- **Never a light category**, never a new category for a nicer icon: a "turn
  off the lights" would reach it. Push = `button`/`push`, switches =
  `switch`/`binary`.
- **No scene trigger nor scene action** without a loop guard: the integration
  never emits anything in reaction to a command that came from a scene.
- **Timers are never lost**: an "on" of a timed switch is acknowledged only
  once its end is saved in `/data`; the return to off is never refused.
- **The ack never waits for the publication** to Gladys; a push "1" is never
  sent late.
- **Bounded input**: 100 buttons, 40-character names, `/data` checked field by
  field, tables never keyed by user text on a plain object.
- **The container rootfs is read-only.** Write only under `/data`.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`.
  The catalog `description` holds 10 to 100 characters per language.
  `test/manifest.test.js` ties the manifest to the code (icons, styles, kinds,
  bounds, defaults): change both sides together.
- **User-facing text** is bilingual (English and French), `docs/en.md` and
  `docs/fr.md` kept in sync. Files are UTF-8 without BOM (tested).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network nor the system temp folder.
