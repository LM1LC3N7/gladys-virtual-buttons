# gladys-virtual-buttons

[Gladys Assistant](https://gladysassistant.com) external integration for
**virtual buttons**: push buttons, switches, timed switches and selectors (2
to 6 named positions) created from the Configuration screen, with a name, an icon, a colour and a confirmation,
shown in a dashboard widget and used to start scenes. No cloud, no hardware.

Born from a forum request (topic 11392): easy, customizable buttons for a
beginner, instead of a fake MQTT device.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> **Work in progress (milestone 1).** Tested with a fake Gladys only (the SDK
> test double), never on a real installation.

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (ButtonsApp)
                                   ├─ src/buttons.js   names, fields, devices, params (pure)
                                   ├─ src/widget.js    "Buttons" and "Icons" widget contents (pure)
                                   ├─ src/store.js     /data/virtual-buttons.json
                                   └─ src/i18n.js      texts en/fr
```

- **Actions** (Configuration screen): "Add a button", "Change a button",
  "Remove a button". Up to 100 buttons; names cleaned (control characters
  removed, spaces collapsed, 40 characters) and unique (case and accents
  ignored).
- **Devices** in the Discovery tab, created by the user: `button`/`push` for a
  push button (feature `press`), `switch`/`binary` for a switch or a timed
  switch (feature `state`), `text`/`select` for a selector (feature
  `position`, values `"1"` … `"6"`, the position names as `supported_options`
  labels, so a renamed position keeps its scenes), all with
  `has_feedback: true`. External ids
  `ext:<selector>:button:b<12 hex>`, drawn once, never changed. The look of
  the button travels in the device params (`VB_*`), so a lost `/data` is
  rebuilt from the devices Gladys kept (never a removed one).
- **Commands** (`onSetValue`, the widget): a push publishes 1, then 0 one
  second later, and waits (4 s at most from its reception) to tell "taken"
  from "not sent"; a switch saves its state in `/data` before the ack, a timed
  switch its end too, and the switch ack never waits for the publication. An
  "on" or a press applied more than 3.5 s after its reception is refused,
  nothing sent; an "off" is always applied. The command queue only holds
  memory and `/data` work; publications and Discovery have their own chains.
- **Never a value Gladys holds**: at each connection only the states that
  differ from what Gladys holds (`last_value`, or what it took from this
  process) are published; an "off" of a switch already off, an "on" of a
  switch already on, publish nothing. No scene starts again on a restart.
- **Timed switches**: a timer per switch (which ends it even when the wall
  clock went back) plus a sweep every 30 s (wall clock forward, restart); an
  end that passed while the container was stopped turns it off at the start;
  the return to off is never refused.
- **Selectors**: a change of position is guarded like an "on" (refused after
  3.5 s, 20 a minute, saved before the ack); the position Gladys holds is
  never published again; "Change a button" never removes the current
  position.
- **Guards**: 20 presses, "on" or changes of position a minute per button (a scene that triggers
  itself), "off" never refused; 240 states a minute in all; states Gladys
  refused sent again by the sweep (never a late push "1").
- **Actions**: "Change a button" starts on "keep" (duration 0) and lists what
  changed; the same changes for another button right after must be asked
  twice. "Remove a button" needs the name typed, turns a switch that is on off
  first and waits for Gladys to take the 0.
- **Widget** "Buttons" (Gladys 5.1.0+): four settings `button_1` …
  `button_4`, one pill each (widget action `press_<n>`, params
  `{ id, value }`: the value the card showed, never a toggle; a confirmation
  can be asked); a switch that is on shows its colour; a selector takes one
  pill per position (the current one in colour with a tick) and a status line,
  never half of its pills; a selector of 5 or 6 positions takes one pill whose
  action opens a form with a `select` of its positions (widget action
  `fields`, params `{ id }`, the choice in `values.position` as `"1"` …
  `"6"`; no `values`, from a core without action forms: refused, nothing
  changed).
- **Widget** "Icons": one page (setting `page`) of 10 icons of the forms, as a
  status list (icon, label of the form, Feather name): the forms can only show
  text. Icons are Feather names of the Gladys set (`server/config/icons.json`);
  the core renders nothing else (no custom image, no shape but the pill).
  Config and action form options are `{ value, label }` only (core
  `manifest.schema.json`), so no icon next to a choice.
- No slider: the core renders a slider only for typed features (light, volume,
  shutter, fan, duration…), none generic, and the widget vocabulary has none;
  this module never borrows such a category.
- No scene trigger nor scene action: the state change of the device already
  starts the scenes; a dedicated trigger would be redundant and loop-prone.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
node scripts/cover.mjs cover.png                # regenerate the cover
```

The tests run against `createFakeGladys()` of the SDK, a memory store and a
clock moved by hand (`test/helpers/clock.js`).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic lists the repository in the Gladys store
(added at the first real release).

## License

Apache-2.0 (see [LICENSE](LICENSE)). No third-party code: the only runtime
dependency is the Gladys integration SDK (npm).
