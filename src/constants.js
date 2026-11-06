// -----------------------------------------------------------------------------
// Frozen keys, lists, limits and timings. Every key here is stored by Gladys
// (manifest actions and fields, widget key and settings, device params,
// external ids): never rename one after a release.
// -----------------------------------------------------------------------------

/** Manifest actions (Configuration screen buttons). */
export const ACTIONS = Object.freeze({
  ADD: 'add_button',
  EDIT: 'edit_button',
  REMOVE: 'remove_button',
});

/** Dashboard widgets. */
export const WIDGETS = Object.freeze({
  BUTTONS: 'buttons',
  ICONS: 'icons',
});

/** The pills a widget content holds (the core budget: 4 buttons). */
export const WIDGET_PILLS = 4;

/** The action key prefix of the widget buttons: press_1 … press_4 (unique within a content). */
export const WIDGET_ACTION = 'press';
export const WIDGET_ACTION_KEY = /^press_[1-4]$/;

/**
 * The field of the form a selector of more than WIDGET_PILLS positions opens
 * in the widget: one pill, the list of its positions behind the tap.
 */
export const WIDGET_POSITION_FIELD = 'position';

/** Widget settings: one select per slot, so the order is the user's. */
export const WIDGET_SLOTS = Object.freeze(['button_1', 'button_2', 'button_3', 'button_4']);

/** The kinds of buttons. */
export const KINDS = Object.freeze({
  PUSH: 'push',
  SWITCH: 'switch',
  TIMED: 'timed',
  SELECTOR: 'selector',
});
export const KIND_LIST = Object.freeze([KINDS.PUSH, KINDS.SWITCH, KINDS.TIMED, KINDS.SELECTOR]);

/** Widget button styles (the core enum). */
export const STYLES = Object.freeze(['primary', 'secondary', 'danger']);

/**
 * The colours of the state light of a switch or a timed switch:
 * the semantic colours of the core (WIDGET_COLORS), the only ones a widget
 * can show. A widget button (pill) has no green: only the three STYLES.
 * Green first: the default "on" colour.
 */
export const COLORS = Object.freeze(['success', 'primary', 'info', 'warning', 'danger', 'neutral']);

/**
 * The icons offered, all in the icon set of the Gladys frontend
 * (server/config/icons.json: the widgets render `fe fe-<name>`, nothing
 * else), grouped by theme for the form. The first is the default. A value
 * once offered stays offered: saved buttons keep it.
 */
export const ICONS = Object.freeze([
  // Commands
  'power',
  'toggle-right',
  'check',
  'x',
  'play',
  'pause',
  'square',
  'arrow-up',
  'arrow-down',
  // Heating and air
  'flame',
  'heater',
  'thermometer',
  'snowflake',
  'fan',
  'wind',
  'leaf',
  // Light and time of day
  'lightbulb',
  'sun',
  'moon',
  'sunrise',
  'sunset',
  'blinds',
  // Energy and water
  'plug',
  'zap',
  'droplet',
  'bath',
  'shower-head',
  'sprout',
  // Media
  'music',
  'volume-2',
  'film',
  'tv',
  'book',
  // House
  'home',
  'door-open',
  'log-in',
  'log-out',
  'lock',
  'shield',
  'bell',
  'car',
  // Daily life
  'bed',
  'sofa',
  'utensils',
  'coffee',
  'users',
  'party-popper',
  'star',
  'alarm-clock',
  'timer',
]);

/** The icon preview widget: this many icons a page (one status list holds 10). */
export const ICONS_PER_PAGE = 10;
export const ICON_PAGES = Math.ceil(ICONS.length / ICONS_PER_PAGE);

/** The marker of the current position of a selector in the widget. */
export const CURRENT_ICON = 'check-circle';

/** Feature keys (part of the feature external ids: forever). */
export const FEATURES = Object.freeze({
  PRESS: 'press',
  STATE: 'state',
  POSITION: 'position',
});

/** Device params: what the button looks like, kept by Gladys with the device. */
export const PARAMS = Object.freeze({
  KIND: 'VB_KIND',
  ICON: 'VB_ICON',
  STYLE: 'VB_STYLE',
  CONFIRM: 'VB_CONFIRM',
  MINUTES: 'VB_MINUTES',
  LABEL: 'VB_LABEL',
  /** The position names of a selector, as a JSON array (selectors only). */
  POSITIONS: 'VB_POSITIONS',
  /** The colour of the state light when on (switches). */
  ON_COLOR: 'VB_ON_COLOR',
  /** The colour of the state light when off (switches). */
  OFF_COLOR: 'VB_OFF_COLOR',
});

/** The external id type of a button: ext:<selector>:button:<id>. */
export const DEVICE_TYPE = 'button';

export const LIMITS = Object.freeze({
  buttons: 100,
  name: 40,
  minutesMin: 1,
  minutesMax: 1440,
  /** A widget button label (core bound). */
  widgetLabel: 24,
  /** A status row of the widget: label and text value (core bounds). */
  statusLabel: 40,
  statusValue: 40,
  /**
   * Positions of a selector: 6 for the 6 orders of a pilot wire. Up to
   * WIDGET_PILLS, each one is a pill of the widget; beyond, the widget shows
   * one pill that opens the list (a content holds 4 buttons at most).
   * Never above 9: a position is one digit, "1" … "9", in Gladys.
   */
  positionsMin: 2,
  positionsMax: 6,
  positionName: 20,
  /** Presses of one button in a minute (a scene that loops on its own button stops here). */
  pressesPerButton: 20,
  /** States published per minute, below the 300 of the host API. */
  statesPerMinute: 240,
});

export const TIMINGS = Object.freeze({
  /** How long a push button stays at 1 before going back to 0. */
  pulse: 1000,
  /** The sweep: expired timed switches, states not yet taken by Gladys. */
  sweep: 30 * 1000,
  /** Budget window. */
  window: 60 * 1000,
  /**
   * Widget content cache, in seconds. Every pull of a content counts in the
   * 30 pulls a minute Gladys allows the whole integration, every open card
   * included, and a card at its limit stays frozen up to a minute: a long
   * cache leaves them to the taps. A change is pushed by a nudge (refreshNudge)
   * or by Gladys itself after a widget action, so the cache never holds a
   * state for long; 60 s keeps the time left of a timed switch within a minute.
   */
  widgetTtl: 60,
  /**
   * The spacing of the refresh nudges: Gladys drops, without a word, a nudge
   * arriving within 10 s of the previous one for the same widget, so a
   * change right after another would stay hidden until the cache expires.
   * A nudge due sooner waits for this delay (one at a time, the latest state).
   */
  refreshNudge: 10_500,
  /**
   * An "on" or a press older than this (since it was received) is refused,
   * nothing sent: Gladys shows a failure after 5 s.
   */
  late: 3500,
  /** How long a press waits for Gladys to take its "1", from its reception. */
  pressAnswer: 4000,
  /** How long "Remove a button" waits for the "off" of a switch that was on. */
  removeAnswer: 5000,
  /** A second identical "Change a button" for another button confirms it. */
  editConfirm: 2 * 60 * 1000,
});

/** The "Change a button" value meaning "leave as it is". */
export const KEEP = 'keep';

export const DEFAULTS = Object.freeze({
  kind: KINDS.PUSH,
  icon: ICONS[0],
  style: 'primary',
  confirm: false,
  minutes: 30,
  on_color: 'success',
  off_color: 'neutral',
});
