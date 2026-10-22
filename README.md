# gladys-virtual-buttons

[Gladys Assistant](https://gladysassistant.com) external integration for
**virtual buttons**: push buttons, switches and timed switches created from
the Configuration screen, with a name, an icon, a colour and a confirmation,
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
                                   ├─ src/widget.js    "Buttons" widget content (pure)
                                   ├─ src/store.js     /data/virtual-buttons.json
                                   └─ src/i18n.js      texts en/fr
```

- **Actions** (Configuration screen): "Add a button", "Change a button",
  "Remove a button". Up to 100 buttons; names cleaned (control characters
  removed, spaces collapsed, 40 characters) and unique (case and accents
  ignored).
- **Devices** in the Discovery tab, created by the user: `button`/`push` for a
  push button (feature `press`), `switch`/`binary` for a switch or a timed
  switch (feature `state`), all with `has_feedback: true`. External ids
  `ext:<selector>:button:b<12 hex>`, drawn once, never changed. The look of
  the button travels in the device params (`VB_*`), so a lost `/data` is
  rebuilt from the devices Gladys kept (never a removed one).
- **Commands** (`onSetValue`, the widget): a push publishes 1, then 0 one
  second later; a switch saves its state in `/data` before the ack; a timed
  switch saves its end too. The ack never waits for the publication.
- **Timed switches**: a timer per switch plus a sweep every 30 s; an end that
  passed while the container was stopped turns the switch off at the start;
  the return to off is never refused.
- **Guards**: 20 commands a minute per button (a scene that triggers itself),
  240 states a minute in all, states Gladys refused sent again by the sweep
  (never a late push "1").
- **Widget** "Buttons" (Gladys 5.1.0+): four settings `button_1` …
  `button_4`, one pill each (widget action `press_<n>`, so a confirmation can
  be asked and a switch toggled); a switch that is on shows its colour.
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
