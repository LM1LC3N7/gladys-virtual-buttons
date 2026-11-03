# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.5] - 2026-11-03

### Added

- Widget: each switch and timed switch now has a state light above the
  pills. It shows the icon of the switch in colour, its name, and "On" or
  "Off" in words. By default the light is green when on and grey when off.
- "Add a button" and "Change a button": two new choices, "State light when
  on" and "State light when off". Six colours: green, blue, light blue,
  orange, red, grey (the colours Gladys gives to widgets). Light blue and
  orange are pale on the light theme: the docs suggest green, blue, red or
  grey. Asked on the forum (topic 11392).

### Changed

- Widget: the pill of a switch that is on now shows a tick in place of its
  icon, like the current position of a selector. On is never told by colour
  alone.
- The field "Colour in the widget" is now "Colour of the button (widget)". It
  is still the colour of the pill: blue, grey or red. A pill cannot be green
  (Gladys keeps green for buttons tied directly to a device).
- Widget: the time left of a timed switch that is on is now in its state
  light ("On · 25 min"), in place of the separate line above the pills. The
  name no longer shows three times, and with 3 or 4 timers none is cut off.
- "Change a button" ignores the state light colours for a push button or a
  selector (they have no light).
- Buttons made before this version keep their pill and their device, and now
  get a state light row with the default colours (green when on, grey when
  off) above the pills.
- SDK `@gladysassistant/integration-sdk` 0.15 → 0.16.

## [0.1.4] - 2026-10-29

### Fixed

- Widget: a selector no longer adds a status row (its position showed as a
  bare number at the right, e.g. "4"). Up to 4 positions, the pills already
  show the current one; a selector of 5 or 6 positions now says its position in
  its pill ("Heating: Eco").
- Widget: no button slot is required any more. Filling Button 2 and leaving
  Button 1 empty gave the core's error "settings.button_1: required"; the
  filled slots now show in order, and a widget with none chosen says "Pick at
  least one button in the settings of this widget". Existing widgets are
  unchanged.

## [0.1.3] - 2026-10-29

### Changed

- A selector now holds up to 6 positions (was 4), for the 6 orders of a pilot
  wire (Comfort, Comfort -1, Comfort -2, Eco, Frost protection, Off). The
  selectors already created do not change. In the widget, a selector of 5 or 6
  positions takes one pill that opens the list of its positions (needs a
  Gladys whose widget buttons can open a form); up to 4 positions, one pill
  each as before.
- Docs: why a choice in a form cannot show its icon, and why there is no
  slider nor rotary knob, with what exists instead (the list).

## [0.1.2] - 2026-10-28

### Added

- Selector, a fourth type of button: 2 to 4 named positions ("Comfort, Eco,
  Frost protection, Off"), one at a time, remembered. In Gladys it is a
  "Selection" device whose positions a scene picks by name ("equal"); a
  renamed position keeps its scenes. In the widget, one pill per position, the
  current one in colour with a tick, and a line with its current position.
  Late, flooded or unsaved changes are refused, nothing sent; the position
  Gladys holds is never sent again.
- 30 more icons (50 in all, grouped by theme, with plain names: play, pause,
  stop, radiator, frost protection, bed, meal, party…), and an "Icons" widget
  that shows them with their names, to choose before creating a button.
- Docs: what cannot be done from an integration (own icon files, round or
  other button shapes, pull cord, rotary knob) and what to use instead.

### Fixed

- "Change a button" refuses to move or insert a position of a selector in the
  middle of the list (it silently renumbered the positions the scenes use):
  rename in place, or add at the end.
- A selector whose saved positions are unusable no longer drops out when the
  buttons are rebuilt from Gladys: it takes the options of its device, else
  "Position 1", "Position 2", and the status says so.
- Docs: the "Devices" box shows a button group (a drop-down only when the room
  is short); the own-icon and slider limits are worded precisely.

## [0.1.1] - 2026-10-22

### Added

- Virtual buttons created from the Configuration screen ("Add a button"): a
  name, a type (push button, switch, timed switch of 1 to 1440 minutes), an
  icon from a short list, a colour and a confirmation before pressing. Up to
  100 buttons. "Change a button" (fields on "Unchanged", the result lists what
  changed) and "Remove a button" (name typed to confirm, a switch that is on
  turned off first) too.
- The buttons are proposed in the Discovery tab ("Add to Gladys"): a push
  button is a `button`/`push` device (1 then 0 one second later), a switch or
  a timed switch a `switch`/`binary` device. Never a light. Their look travels
  in the device params, so a lost `/data` is rebuilt from the devices Gladys
  kept.
- A timed switch goes back to off by itself after its real duration, even if
  the clock is changed; its end is kept in `/data`, and an end passed while
  the container was stopped turns it off at the start.
- A restart or a reconnection never sends Gladys a value it already holds,
  so no scene starts again; an "off" of a switch already off sends nothing.
- An "on" or a press that arrives after Gladys gave up (3.5 s) is refused,
  nothing sent; an "off" is always applied. A press says whether Gladys took
  it.
- The "Buttons" dashboard widget (Gladys 5.1.0 or later): up to 4 buttons per
  card, with their icon, name, colour and confirmation; a switch that is on is
  shown in its colour, off in grey; a tap does what the card shows (never a
  toggle); the time left of a timed switch.
- Guards: more than 20 presses or "on" in a minute on a button (a scene that
  triggers itself) are refused for the rest of the minute, "off" never; at
  most 240 states a minute in all; names cleaned and bounded; a `/data` file
  that cannot be read is never overwritten.
- Step-by-step guides in English and French, with the exact words of the
  Gladys screens.

[Unreleased]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/LM1LC3N7/gladys-virtual-buttons/releases/tag/v0.1.1
