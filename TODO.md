# TODO — Virtual buttons v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`
  (Node 22 and 24), `npm audit --omit=dev`,
  `npx github:GladysAssistant/integration-store .`, then update README,
  `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only.

## Status

- [x] **Milestone 1 — buttons, timed switches, widget** (2026-10-22): the
      "Add / Change / Remove a button" actions, push buttons, switches and
      timed switches in Discovery, ends kept in `/data`, the "Buttons" widget,
      guards, docs en/fr. Tested with the fake Gladys of the SDK only. The
      store validator was not run by the dev agent (it cannot): to run in the
      real terminal before publishing.
- [ ] **Milestone 2 — a real Gladys** (testers), to check first:
  - that the widget renders the chosen icons (names taken from
    `server/config/icons.json` of Gladys 5.2: `flame`, `blinds`, `door-open`,
    `lightbulb`, `fan`, `timer` are not in the original Feather set; an
    unknown name shows no icon but breaks nothing);
  - the radio display and the default values of the "Add a button" form, and
    that "Change a button" really leaves empty fields empty (no default);
  - that a scene "device state = 1" without threshold starts at every press
    of a push button (1 then 0);
  - the `source: "devices"` lists of the actions and widget settings (the
    created buttons only);
  - that republishing a created device updates its params without the
    "Update" button of Discovery.
- [ ] **Later (v1.1)**: a scene trigger "virtual button pressed" with a loop
      guard (never emitted for a command that came from a scene), if users
      find the "device state change" trigger too technical; per-button
      remaining time in the device box (not possible without the core); a
      core PR for an icon per action in "Quick actions".
- [ ] **Milestone 3 — first release**: Docker image build check, Release
      workflow, topic, then the store validator once the image is published.

## Decisions

- Forum: no dedicated topic, no post from this module's work; the main session
  answers topic 11392 (the core alternative "scene + Quick actions" first).
- Reuse: no reference library (nothing to port); only the SDK from npm. No
  `THIRD_PARTY_NOTICES.md`.
- Version 0.1.0 set by hand in `package.json`, `package-lock.json`, the
  manifest and the `docker_image` tag; the first patch release gives 0.1.1.
- Kinds: push = `button`/`push` (feature `press`, 1 then 0 after 1 s), switch
  and timed switch = `switch`/`binary` (feature `state`); all
  `has_feedback: true`, the integration publishes the states. Never `light`.
- External ids `button:b<12 hex>`, random, drawn once; the name is not part of
  them, so a rename keeps the device, its history and its scenes.
- The type of a button cannot be changed ("Change a button" has no type
  field): a created device's features are fixed; remove and add again.
- A name changed by "Change a button" changes the widget label and the
  Discovery name, not the name of a created Gladys device (the core keeps the
  user's name on republication).
- The list lives in `/data/virtual-buttons.json`; the look of each button is
  copied in the device params (`VB_KIND`, `VB_LABEL`, `VB_ICON`, `VB_STYLE`,
  `VB_CONFIRM`, `VB_MINUTES`), so a lost `/data` is rebuilt from the created
  devices at the next connection. Removed ids are remembered (500 at most),
  so a device left in Gladys never brings a removed button back.
- A device deleted in Gladys keeps its button in the integration (proposed
  again in Discovery); "Remove a button" removes it for good.
- "Edit"/"Remove" name the button by a `source: "devices"` select (created
  buttons) or by its current name (not created yet; case and accents ignored,
  names are unique on the same key).
- Confirmation is a select yes/no, not a boolean: an empty field of "Change a
  button" then means "unchanged".
- Timed switch: "on" again restarts the duration; a new duration applies at
  the next "on"; the end is saved before the ack (an "on" that cannot be
  saved is refused), bounded to 24 h when read back; a timer per switch plus
  a sweep every 30 s (clock jumps, lost timers); an end passed while stopped
  turns it off at the start. The return to off is never refused, even when
  `/data` cannot be written (saved again by the sweep).
- Guards: 20 commands a minute per button (loop of a scene on its own
  button), refused with a message; 240 states a minute in all (host API: 300);
  "off" is never refused by them. A state Gladys refused is sent again by the
  sweep, except a push "1" (it would start a scene late: only the 0 is sent
  again).
- Widget: every pill carries a widget action (`press_1` … `press_4`, keys
  unique within a content), never `device_feature` + `value`: only an action
  can ask for a confirmation, and a fixed value cannot toggle a switch. The
  core tints only `device_feature` pills, so a switch shows its state by its
  style: its colour when on (primary when "secondary" was chosen), secondary
  when off. Four `select` settings instead of one `multi_select` (the order is
  the user's, and each value stays under the 100-character bound).
- Widget cache 30 s, 15 s while a timed switch runs; `requestWidgetRefresh`
  after every change (rate-limited by the core).
- No scene triggers nor scene actions in v1 (redundant with the state change
  trigger, loop risk; the core action "control a device" already sets a
  button).
- Icons: 20 names from the Gladys icon set (`server/config/icons.json`),
  labelled in English and French; default `power`.
- Status: "N buttons, M created in Gladys", republished with Discovery and
  every state at each `connected`.
