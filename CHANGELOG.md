# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Virtual buttons created from the Configuration screen ("Add a button"): a
  name, a type (push button, switch, timed switch of 1 to 1440 minutes), an
  icon from a short list, a colour and a confirmation before pressing. Up to
  100 buttons. "Change a button" and "Remove a button" too.
- The buttons are proposed in the Discovery tab: a push button is a
  `button`/`push` device (1 then 0 one second later), a switch or a timed
  switch a `switch`/`binary` device. Never a light. Their look travels in the
  device params, so a lost `/data` is rebuilt from the devices Gladys kept.
- A timed switch goes back to off by itself; its end is kept in `/data`, and
  an end passed while the container was stopped turns it off at the start.
- The "Buttons" dashboard widget (Gladys 5.1.0 or later): up to 4 buttons per
  card, with their icon, name, colour and confirmation; a switch that is on is
  shown in its colour, off in grey; the time left of a timed switch.
- Guards: a button pressed more than 20 times in a minute (a scene that
  triggers itself) is refused for the rest of the minute; at most 240 states
  a minute in all; names cleaned and bounded.
- Step-by-step guides in English and French.

[Unreleased]: https://github.com/LM1LC3N7/gladys-virtual-buttons/commits/main
