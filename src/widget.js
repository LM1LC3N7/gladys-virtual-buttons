// -----------------------------------------------------------------------------
// The dashboard widgets, pure. "Buttons": up to 4 pills, each with the icon,
// label and style of its button; a selector of up to 4 positions takes one
// pill per position, the current one marked (its colour and a tick), with no
// other row repeating it. A selector of 5 or 6 positions takes one pill
// that opens the list of its positions (a widget action form: the core holds
// 4 buttons a content) and whose label says the current position.
// "Icons": one page of the
// icons the forms offer.
//
// Every pill carries a widget action (never device_feature + value): only an
// action can ask a confirmation. The core tints a pill only for
// device_feature + value, so
// a switch shows its state through its style instead: the chosen style when
// on (primary when "secondary" was chosen), secondary when off.
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

const cut = (text, max) => {
  const chars = [...String(text ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** The style a pill shows. */
export function styleOf(button) {
  if (button.kind === KINDS.PUSH) {
    return button.style;
  }
  if (button.state !== 1) {
    return 'secondary';
  }
  return lit(button);
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

const cut2 = (text, max) => ({ en: cut(text.en, max), fr: cut(text.fr, max) });

/**
 * The content for the buttons shown (already resolved and deduplicated, at
 * most 4), `now` for the time left of the timed switches.
 */
export function buttonsWidget(buttons, now) {
  const components = [];
  const running = buttons
    .filter((b) => b.kind === KINDS.TIMED && b.state === 1 && Number.isFinite(b.until))
    .map((b) => [cut(b.name, 20), Math.max(1, Math.ceil((b.until - now) / 60000))]);
  if (running.length > 0) {
    components.push({
      type: 'text',
      text: cut2(T.widget.remaining(running), 80),
      variant: 'caption',
    });
  }
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
        style: lit(button),
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
          style: current ? lit(button) : 'secondary',
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
      icon: button.icon,
      style: styleOf(button),
      value: button.kind === KINDS.PUSH || button.state !== 1 ? 1 : 0,
    });
  }
  if (crowded.length > 0) {
    components.push({ type: 'text', text: cut2(T.widget.crowded(crowded), 300), variant: 'body' });
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
  // Shorter cache while a timer runs, so the time left stays close.
  const ttl = running.length > 0 ? 15 : TIMINGS.widgetTtl;
  return { ttl_seconds: ttl, components };
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
