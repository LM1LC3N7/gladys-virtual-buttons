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
  - the radio display and the default values of the "Add a button" and
    "Change a button" forms ("Unchanged", duration 0);
  - that a scene "Simple click" starts at every press of a push button (1
    then 0), and a switch scene "On" with only the threshold toggle on starts
    only on a change;
  - the `source: "devices"` lists of the actions and widget settings (the
    created buttons only);
  - that republishing a created device updates its params without the
    "Update" button of Discovery.
- [ ] **Later (v1.1)**: a scene trigger "virtual button pressed" with a loop
      guard (never emitted for a command that came from a scene), if users
      find the "device state change" trigger too technical; per-button
      remaining time in the device box (not possible without the core); a
      core PR for an icon per action in "Quick actions".
- [x] **Forum feedback (topic 11392, Prof_Techno), next patch**: selectors
      (2 to 4 positions, `text`/`select`), 50 icons with plain names, the
      "Icons" preview widget, docs on what an integration cannot draw. To
      check on a real Gladys: the scene editor shows the position names
      (`supported_options`) for "equal", the device box shows a button group (a drop-down if the room is short),
      the status list and the tick of the current pill render as expected.
- [x] **Forum feedback 2 (topic 11392 #11, Prof_Techno, 2026-10-29)**:
      selectors of up to 6 positions (pilot wire); in the widget, a selector
      of 5 or 6 positions is one pill whose action form (`fields`, a `select`)
      lists the positions. Studied and refused, with sources in the docs:
      icons next to the choices of a form (core option = `{ value, label }`,
      `manifest.schema.json` `configField.options`, rendered as plain text by
      `front/src/components/integration/ConfigSchemaForm.jsx`); a slider or a
      rotary knob (no generic slider type in `DeviceRow.jsx`, none in the
      widget vocabulary). To check on a real Gladys: the form of the pill
      opens with the current position chosen, the device box shows the 6
      positions as a drop-down when the row is short.
- [ ] **Later, if asked**: a per-button option "show as a list in the widget"
      for selectors of 2 to 4 positions (new field and `VB_*` param; the
      existing ones keep their pills).
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
- Confirmation is a select yes/no, not a boolean. "Change a button" (review
  1, I7): the core validates every key the real form sends and refuses an
  empty select, and the form keeps its values after a run; so icon, colour
  and confirmation start on `keep` ("Unchanged"), the duration on 0 (= keep),
  the result lists what changed, and the very same changes for another button
  within 2 minutes are refused once (run again to apply them). The `button`
  list (source devices) cannot have a default: reload the page to empty it.
- "Remove a button" (review 1, I5 and M8): the name must be typed (the
  confirmation); a switch that is on is turned off first and Gladys must take
  the 0 within 5 s, otherwise nothing is removed (the 0 is sent again by the
  sweep).
- Timed switch: "on" again restarts the duration; a new duration applies at
  the next "on"; the end is saved before the ack (an "on" that cannot be
  saved is refused), bounded to 24 h when read back; a timer per switch plus
  a sweep every 30 s (clock jumps, lost timers); an end passed while stopped
  turns it off at the start. The return to off is never refused, even when
  `/data` cannot be written (saved again by the sweep).
- Never a value Gladys holds (review 1, B1): the core runs the triggers on
  every state it saves, even an equal one. At each `connected` only the
  buttons whose state differs from what Gladys took from this process, or
  from the `last_value` of the created device (when this process sent
  nothing), are published; an "off" of a switch already off and an "on" of a
  plain switch already on (Gladys holding it) publish nothing (no "Off ->
  off" loop, I3); a timed switch "on" again restarts its duration without a
  new 1. The guides say to tick "Execute only when threshold is passed" for
  switches.
- Deadlines (review 1, I2): the command queue holds only memory and `/data`
  work, never a request to Gladys; publications go through their own ordered
  chain, Discovery through another (list taken when sent, M1); the actions
  never wait for Discovery. An "on" or a press applied more than 3.5 s after
  its reception (monotonic clock) is refused, nothing sent; a press whose 1
  is still waiting its turn when 4 s have passed is cancelled; an "off" is
  always applied. A press waits for Gladys to take its 1 (M2): "pressed",
  "sent, without confirmation" (request out, no answer yet) or refused.
- Guards: 20 presses or "on" a minute per button (loop of a scene on its own
  button), refused with a message; 240 states a minute in all (host API: 300);
  "off" is never refused (beyond 20 a minute, an "off" of a switch already off
  is acknowledged without publishing). A state Gladys refused is sent again by
  the sweep, except a push "1" (it would start a scene late); a state in
  flight is never sent twice (M3).
- Timed switch and the wall clock (review 1, I4): the timer of the switch
  measures the real duration; when it fires the switch is due even if the
  wall clock went back. The sweep (wall clock) still catches a clock moved
  forward and the ends passed while stopped.
- Recovery from the params (M6): a plain switch takes back the `last_value`
  of Gladys (nothing published); a timed switch always comes back off.
- `/data` (M5, M9): a file present but unreadable (not ENOENT) is never
  overwritten (every save refused until a restart, said in the status); the
  "unreadable list" status is lifted by the first good save.
- Widget: every pill carries a widget action (`press_1` … `press_4`, keys
  unique within a content), never `device_feature` + `value`: only an action
  can ask for a confirmation. The params carry `{ id, value }`, the value
  decided on the state the card showed (I6), never a toggle. The
  core tints only `device_feature` pills, so a switch shows its state by its
  style: its colour when on (primary when "secondary" was chosen), secondary
  when off. Four `select` settings instead of one `multi_select` (the order is
  the user's, and each value stays under the 100-character bound).
- Widget cache 30 s, 15 s while a timed switch runs; `requestWidgetRefresh`
  after every change (rate-limited by the core).
- No scene triggers nor scene actions in v1 (redundant with the state change
  trigger, loop risk; the core action "control a device" already sets a
  button).
- Icons: 50 names from the Gladys icon set (`server/config/icons.json`,
  checked by a test when the core clone is at hand), labelled in English and
  French, grouped by theme; default `power`. The 20 of v0.1 stay offered
  forever (saved buttons keep them). Custom icon files are impossible: widget
  icons are Feather names the core renders as `fe fe-<name>`
  (`normalizeWidgetContent.js` keeps the name only; SDK README, "Dashboard
  widgets": "`icon` is a Feather icon name"). Select options carry no image,
  so the preview is a second widget, "Icons" (a status list of 10 icons per
  page, setting `page`).
- Selector (forum feedback, topic 11392): kind `selector`, feature
  `position` (`text`/`select`, values "1" … "4", names as
  `supported_options` labels, params `VB_POSITIONS` JSON). 4 positions at
  most because each one is a widget pill and a content holds 4 buttons (SDK
  README, content budget). Not a heating mode category (a global "set every
  radiator to eco" would reach it), not a switch. Every position is guarded
  like an "on" (no "off" exemption: the module cannot know which one is
  protective; the scene decides). Same position held by Gladys: nothing
  published. "Change a button" renames in place, adds or removes at the end,
  refuses to remove the current position (a command queued behind it is
  checked again). Recovery: the param, else the options of the feature, the
  position from `last_value_string`. In the widget, a selector gets all its
  pills or none (never half); a pill tap carries its own position (never
  "next"). 0.1.4 (Prof_Techno, t/11392 #18): no status row for selectors (a
  number-named position showed as a bare "4" at the right; a long selector's
  pill is now "name: position"); no widget slot required (slot 1 empty gave
  the core's "settings.button_1: required").
- Shapes: a round on/off button, a pull cord or a rotary knob cannot be drawn
  by an external integration (no HTML/CSS; the core renders a fixed
  vocabulary, a `button` is a pill). Answer: icon "power", colour, selector.
- Status: "N buttons, M added to Gladys", republished with Discovery at each
  `connected`.
- Words of the Gladys screens quoted exactly in the guides and messages
  (review 1, I1): « Ajouter à Gladys », « Changement d'état de l'appareil »,
  « Clic simple » for a push button, « On » / « Off » and the three toggles
  of a switch trigger (only the threshold one on), the Discovery card
  (« Fonctionnalités », « Paramètres techniques », green « Ajouter à Gladys »
  at the bottom), the tags « Bouton poussoir » / « Commutateur » (en "Push
  button" / "Switch (On/Off)"; the short category name "Prise" is never shown
  for an external integration), the action « Contrôler un appareil » (en "Set
  device value") with a toggle; tested in `test/manifest.test.js` (approval
  1, R2).
- Remove (approval 1, R1): a switch whose 0 Gladys may not hold (on, a 0
  refused or in flight, a value never sent) gets its 0 sent again and taken
  before the button goes; otherwise nothing is removed.
- `sent` is cleared at each `connected` (approval 1, M-c): the values just
  read from Gladys are the reference (a restored backup); what this process
  sends afterwards is newer.
- Known limits (approval 1, minor): one publication chain, so a request that
  hangs (up to the 15 s of the SDK) delays the next publications (an "on"
  acknowledged at once may reach Gladys later; never a command applied after
  a failure shown); the widget relays the params of the content the core has
  in cache, so right after an invalidation a tap may carry the value of the
  fresher content (a window of a few hundred ms); the "Button" list of
  Change/Remove cannot be emptied again (reload the page); a new name exactly
  "keep" is taken as "unchanged".

## Next patch (final check of the selector release)

- `defaultedPositions` is never reset (`src/app.js`, `reportStatus`): after "Change a button" gives real names
  back, the status still says the selector lost its position names until a restart.
- Degenerate resume (param and options unusable) while Gladys holds position "3": the selector is rebuilt
  with 2 positions and "1" is published over it, which can start a "= 1" scene. Very unlikely.
- [x] Docs: the core thermostat box has a circular dial (`CircularGauge.jsx`), for real thermostats only
      (done with the 6-position change).

## Next patch (review r2 of the 6-position selector, 031d45c)

Minors from `_lots/hors-lot/virtual-buttons-r2.md`, none blocking:

1. Test a long selector crowded out by 4 pills (mutant M8: the core drops the 5th pill silently).
2. Tests for another key in `values` (M1) and the 24-character cut of a long name (M16).
3. Docs: the Confirmation option does nothing on a 5–6 position selector (the core ignores `confirm` on a button with a form).
4. Docs: name the Gladys version that opens the form (5.2.0); the manifest still says >=5.1.0.
5. Optional: `display: 'radio'` for the form.
6. Docs: an emoji at the start of a position name works as an icon.
7. The "no room left" line text changed for existing selectors: say so in the CHANGELOG.
8. No action.
9. The form default can be up to 30 s stale.
