// -----------------------------------------------------------------------------
// The dashboard widget "Buttons", pure: up to 4 pills, each with the icon,
// label and style of its button.
//
// Every pill carries a widget action (never device_feature + value): only an
// action can ask a confirmation. The core tints a pill only for
// device_feature + value, so
// a switch shows its state through its style instead: the chosen style when
// on (primary when "secondary" was chosen), secondary when off.
// -----------------------------------------------------------------------------

import { KINDS, LIMITS, TIMINGS, WIDGET_ACTION } from './constants.js';
import { T } from './i18n.js';

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
  return button.style === 'secondary' ? 'primary' : button.style;
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
  for (const [index, button] of buttons.slice(0, 4).entries()) {
    // Action keys are unique within a content: press_1 … press_4.
    // The value wanted travels in the params, decided on the state this card
    // shows (the core relays the params of the content it displays): a tap on
    // an "on" pill always means "off", even if the timer ended meanwhile.
    const value = button.kind === KINDS.PUSH || button.state !== 1 ? 1 : 0;
    const action = {
      key: `${WIDGET_ACTION}_${index + 1}`,
      params: { id: button.id, value },
    };
    if (button.confirm) {
      action.confirm = true;
    }
    components.push({
      type: 'button',
      label: cut(button.name, LIMITS.widgetLabel),
      icon: button.icon,
      style: styleOf(button),
      action,
    });
  }
  // Shorter cache while a timer runs, so the time left stays close.
  const ttl = running.length > 0 ? 15 : TIMINGS.widgetTtl;
  return { ttl_seconds: ttl, components };
}
