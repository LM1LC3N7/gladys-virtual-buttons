// -----------------------------------------------------------------------------
// The dashboard widgets, pure. "Buttons": up to 4 pills, each with the icon,
// label and style of its button; a selector of up to 4 positions takes one
// pill per position, the current one marked (its colour and a tick), and a
// light row naming it. A selector of 5 or 6 positions takes one pill
// that opens the list of its positions (a widget action form: the core holds
// 4 buttons a content) and whose label says the current position.
// "Icons": one page of the
// icons the forms offer.
//
// Every pill carries a widget action (never device_feature + value): only an
// action can ask a confirmation. The core tints a pill green ("active") only
// for device_feature + value, and an action pill has three styles (primary,
// secondary, danger), no green. So a switch shows its state through its
// style and a tick: when on, the "on" colour of its light if it is blue or
// red, else the chosen style (primary when "secondary" was chosen), and the
// tick; when off, the "off" colour if it is blue, red or grey and not the
// "on" look, else secondary, with its own icon (styleOf).
//
// Above the pills, a status list gives each switch, timed switch and
// selector shown its state light: its icon in the colour chosen for "on" or
// "off" (the semantic colours of the core), its name, and the state in words
// ("On" / "Off", "Eco", "Position: 4"): never the colour alone. A selector's light
// takes the "on" colour (it is always on one of its positions).
// -----------------------------------------------------------------------------

import {
  CURRENT_ICON,
  ICONS,
  ICON_PAGES,
  ICONS_PER_PAGE,
  KINDS,
  LIMITS,
  TIMINGS,
  WIDGET_ACTION,
  WIDGET_PILLS,
  WIDGET_POSITION_FIELD,
} from './constants.js';
import { ICON_LABELS, T } from './i18n.js';
import { colorsOf, isSwitchKind } from './buttons.js';

const cut = (text, max) => {
  const chars = [...String(text ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/**
 * The pill background each light colour has in Gladys (t/11392 #25: the
 * pill, not only the light, should follow the state). An action pill has
 * three backgrounds (core `WidgetComponents.jsx`, `style.css`): blue fill
 * (`primary`), red tint (`danger`), neutral (`secondary`). Light blue maps
 * to the blue fill; green and orange have none (the core's green tint is
 * only for a `device_feature` pill, which cannot confirm nor toggle).
 */
const PILL_OF_COLOR = new Map([
  ['primary', 'primary'],
  ['info', 'primary'],
  ['danger', 'danger'],
  ['neutral', 'secondary'],
]);

/**
 * The style of a pill that is "on" (a switch on, the current position of a
 * selector): the "on" colour of the light when Gladys has it as a filled
 * pill (blue, red), otherwise the colour of the button (blue when grey was
 * chosen), so an "on" pill always stands out.
 */
export function onStyleOf(button) {
  const pill = PILL_OF_COLOR.get(colorsOf(button).on);
  return pill === 'primary' || pill === 'danger' ? pill : lit(button);
}

/**
 * The style a pill shows. A switch that is off takes the "off" colour of its
 * light when Gladys has it (blue, red, grey) and it differs from the "on"
 * pill; otherwise grey: on and off never look the same.
 */
export function styleOf(button) {
  if (button.kind === KINDS.PUSH) {
    return button.style;
  }
  const on = onStyleOf(button);
  if (button.state === 1) {
    return on;
  }
  const off = PILL_OF_COLOR.get(colorsOf(button).off) ?? 'secondary';
  return off === on ? 'secondary' : off;
}

const cut2 = (text, max) => ({ en: cut(text.en, max), fr: cut(text.fr, max) });
const both = (text) => ({ en: text, fr: text });

/** The icon a pill shows: a switch that is on takes the tick, like the current position of a selector. */
export function iconOf(button) {
  return button.kind !== KINDS.PUSH && button.state === 1 ? CURRENT_ICON : button.icon;
}

/**
 * The state light of a button (a status row), or null for a push button (no
 * state). Old buttons without colours have the defaults (sanitizeButton). A
 * timed switch that is on says its time left in the same value ("On · 25
 * min"), so the name is not repeated in a caption (r1 of t/11392 #20); `now`
 * is the clock reading of the content. A selector's light has the "on"
 * colour and its position ("Eco"; "Position: 4" for a number, never a bare
 * "4", t/11392 #18): the colours chosen for it showed nowhere (t/11392 #23).
 */
export function lightOf(button, now) {
  const colors = colorsOf(button);
  if (button.kind === KINDS.SELECTOR) {
    const position = button.positions[button.state - 1] ?? String(button.state);
    // A narrow card cuts a long value: the name alone, unless it is a bare
    // number, which says "Position: 4".
    const value = /^[0-9]+$/.test(position) ? T.widget.position(position) : both(position);
    return {
      label: cut(button.name, LIMITS.statusLabel),
      value: cut2(value, LIMITS.statusValue),
      icon: button.icon,
      color: colors.on,
    };
  }
  if (!isSwitchKind(button.kind)) {
    return null;
  }
  const on = button.state === 1;
  const left = on && button.kind === KINDS.TIMED ? minutesLeft(button, now) : null;
  const value = on ? (left === null ? T.widget.on : T.widget.onFor(left)) : T.widget.off;
  return {
    label: cut(button.name, LIMITS.statusLabel),
    value: cut2(value, LIMITS.statusValue),
    icon: button.icon,
    color: on ? colors.on : colors.off,
  };
}

/** Whole minutes left of a timed switch that is on (at least 1), or null without a valid end. */
function minutesLeft(button, now) {
  if (!Number.isFinite(button.until) || !Number.isFinite(now)) {
    return null;
  }
  return Math.max(1, Math.ceil((button.until - now) / 60000));
}

/** The style of a pill that is "on": the chosen one, primary when grey was chosen. */
const lit = (button) => (button.style === 'secondary' ? 'primary' : button.style);

/**
 * The label of the pill of a long selector: its name and its current position
 * ("Heating: Eco"), within the label bound. The pill is the only place that
 * says the position (a short selector marks it with its pills), so the
 * position is kept whole when it fits and the name gives way first.
 */
function listLabel(button) {
  const position = button.positions[button.state - 1] ?? '';
  const max = LIMITS.widgetLabel;
  const name = [...button.name];
  if (!position) {
    return button.name;
  }
  const room = max - 2 - [...position].length;
  if (name.length <= room) {
    return `${button.name}: ${position}`;
  }
  // Keep at least 8 characters of the name; the position takes the rest.
  const shown = cut(button.name, Math.max(8, room));
  return `${shown}: ${cut(position, max - 2 - [...shown].length)}`;
}

/** A body-only content: the empty states. */
export function messageWidget(text) {
  return {
    ttl_seconds: TIMINGS.widgetTtl,
    components: [{ type: 'text', text: cut2(text, 300), variant: 'body' }],
  };
}

/**
 * The content for the buttons shown (already resolved and deduplicated, at
 * most 4), `now` for the time left of the timed switches.
 */
export function buttonsWidget(buttons, now) {
  const components = [];
  // At most 4 pills in a content (the core budget). A selector of up to 4
  // positions needs one per position: when they do not all fit, it gets none
  // (never half a selector), and a line says to show it on a card of its own.
  // A longer selector gets one pill that opens the list of its positions.
  const pills = [];
  const crowded = [];
  for (const button of buttons) {
    if (button.kind === KINDS.SELECTOR && button.positions.length > WIDGET_PILLS) {
      if (pills.length >= WIDGET_PILLS) {
        crowded.push(cut(button.name, 24));
        continue;
      }
      pills.push({
        button,
        label: listLabel(button),
        icon: button.icon,
        style: onStyleOf(button),
        list: true,
      });
      continue;
    }
    if (button.kind === KINDS.SELECTOR) {
      if (pills.length + button.positions.length > WIDGET_PILLS) {
        crowded.push(cut(button.name, 24));
        continue;
      }
      for (const [index, position] of button.positions.entries()) {
        // The value is the position of this pill, never "the next one".
        const current = button.state === index + 1;
        pills.push({
          button,
          label: position,
          icon: current ? CURRENT_ICON : button.icon,
          style: current ? onStyleOf(button) : 'secondary',
          value: index + 1,
        });
      }
      continue;
    }
    if (pills.length >= WIDGET_PILLS) {
      crowded.push(cut(button.name, 24));
      continue;
    }
    // The value wanted travels in the params, decided on the state this card
    // shows (the core relays the params of the content it displays): a tap on
    // an "on" pill always means "off", even if the timer ended meanwhile.
    pills.push({
      button,
      label: button.name,
      icon: iconOf(button),
      style: styleOf(button),
      value: button.kind === KINDS.PUSH || button.state !== 1 ? 1 : 0,
    });
  }
  if (crowded.length > 0) {
    components.push({ type: 'text', text: cut2(T.widget.crowded(crowded), 300), variant: 'body' });
  }
  // One status list (the core budget), at most 4 rows: the switches and
  // selectors shown, crowded ones included.
  const lights = buttons.map((b) => lightOf(b, now)).filter(Boolean);
  if (lights.length > 0) {
    components.push({ type: 'status', items: lights });
  }
  for (const [index, pill] of pills.entries()) {
    // Action keys are unique within a content: press_1 … press_4.
    const action = {
      key: `${WIDGET_ACTION}_${index + 1}`,
      params: pill.list ? { id: pill.button.id } : { id: pill.button.id, value: pill.value },
    };
    if (pill.list) {
      // The position chosen comes back in the values of the form, as the
      // text of its number ("1" … "6"), like a command from Gladys.
      action.fields = [positionField(pill.button)];
    }
    if (pill.button.confirm) {
      action.confirm = true;
    }
    components.push({
      type: 'button',
      label: cut(pill.label, LIMITS.widgetLabel),
      icon: pill.icon,
      style: pill.style,
      action,
    });
  }
  // One cache length, timers running or not: every pull counts in the 30 a
  // minute of the whole integration (TIMINGS.widgetTtl).
  return { ttl_seconds: TIMINGS.widgetTtl, components };
}

/** The list of the positions of a selector, the current one chosen at first. */
function positionField(button) {
  return {
    key: WIDGET_POSITION_FIELD,
    type: 'select',
    required: true,
    label: T.widget.positionField,
    options: button.positions.map((name, index) => ({
      value: String(index + 1),
      label: { en: name },
    })),
    default: String(button.state),
  };
}

/** One page (1 … ICON_PAGES) of the icon preview: the icon, its label in the forms, its name. */
export function iconsWidget(page) {
  const from = (page - 1) * ICONS_PER_PAGE;
  const shown = ICONS.slice(from, from + ICONS_PER_PAGE);
  return {
    // The list only changes with a new version of the integration.
    ttl_seconds: 3600,
    components: [
      {
        type: 'text',
        text: cut2(
          T.widget.iconsPage(page, ICON_PAGES, from + 1, from + shown.length, ICONS.length),
          300,
        ),
        variant: 'body',
      },
      {
        type: 'status',
        items: shown.map((name) => ({
          label: ICON_LABELS[name],
          value: name,
          icon: name,
          color: 'primary',
        })),
      },
    ],
  };
}
