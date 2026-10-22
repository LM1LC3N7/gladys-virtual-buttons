# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/LM1LC3N7/gladys-virtual-buttons/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-virtual-buttons/releases/tag/v0.1.1
