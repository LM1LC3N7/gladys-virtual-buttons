// -----------------------------------------------------------------------------
// The buttons themselves, pure: names, the fields of the actions, the Gladys
// devices they become, and their recovery from the params of the devices
// Gladys kept (when /data was lost).
//
// External ids: ext:<selector>:button:<id>, <id> = "b" + 12 hex digits drawn
// once at creation and never changed (not the name: a renamed button keeps
// its device, its history and its scenes). Features: <device>:press for a
// push button, <device>:state for a switch or a timed switch.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  DEFAULTS,
  DEVICE_TYPE,
  FEATURES,
  ICONS,
  KEEP,
  KIND_LIST,
  KINDS,
  LIMITS,
  PARAMS,
  STYLES,
} from './constants.js';

const ID = /^b[0-9a-f]{12}$/;

export const isId = (value) => typeof value === 'string' && ID.test(value);

export const newId = () => `b${randomBytes(6).toString('hex')}`;

export const isSwitchKind = (kind) => kind === KINDS.SWITCH || kind === KINDS.TIMED;

/**
 * A name typed by the user: any type turned into text, control and format
 * characters replaced by spaces, spaces collapsed, at most LIMITS.name
 * characters (code points, never half an emoji). '' when nothing is left.
 */
export function cleanName(raw, max = LIMITS.name) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return '';
  }
  const text = String(raw)
    .slice(0, 1000)
    .normalize('NFC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, max).join('').trim();
}

/** The key two names are compared on: case and accents ignored. */
export const nameKey = (name) =>
  cleanName(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);

/** A whole number of minutes within the bounds, or null. */
export function toMinutes(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    return null;
  }
  return n >= LIMITS.minutesMin && n <= LIMITS.minutesMax ? n : null;
}

/** The "confirm before pressing" field: 'yes' / 'no' (or a boolean), else null. */
export function toConfirm(value) {
  if (value === 'yes' || value === true) {
    return true;
  }
  if (value === 'no' || value === false) {
    return false;
  }
  return null;
}

/**
 * A saved button, checked field by field (from /data or from the params of a
 * device). null when it cannot be one.
 */
export function sanitizeButton(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isId(raw.id)) {
    return null;
  }
  const name = cleanName(raw.name);
  const kind = KIND_LIST.includes(raw.kind) ? raw.kind : null;
  if (!name || !kind) {
    return null;
  }
  const button = {
    id: raw.id,
    name,
    kind,
    icon: pick(raw.icon, ICONS, DEFAULTS.icon),
    style: pick(raw.style, STYLES, DEFAULTS.style),
    confirm: raw.confirm === true,
    minutes: toMinutes(raw.minutes) ?? DEFAULTS.minutes,
    state: isSwitchKind(kind) && raw.state === 1 ? 1 : 0,
    until: null,
  };
  if (kind === KINDS.TIMED && button.state === 1) {
    // An "on" without a valid end is turned off: a timer is never lost, and
    // an end is never trusted beyond the longest duration.
    if (Number.isFinite(raw.until) && raw.until > 0) {
      button.until = Math.min(raw.until, now + LIMITS.minutesMax * 60 * 1000);
    } else {
      button.state = 0;
    }
  }
  return button;
}

/**
 * The fields of "Add a button" or "Edit a button", checked again (the core
 * validates them too). Returns { values } or { error } (an i18n key).
 */
export function readFields(fields, { partial = false } = {}) {
  const input = fields && typeof fields === 'object' ? fields : {};
  // In "Change a button", "keep" (the default of the selects) and a duration
  // of 0 (the default of the number) mean "leave as it is": the real form
  // sends every field, and the core refuses an empty select.
  const has = (key) =>
    Object.hasOwn(input, key) &&
    input[key] !== undefined &&
    input[key] !== null &&
    input[key] !== '' &&
    !(partial && (input[key] === KEEP || (key === 'minutes' && input[key] === 0)));
  const values = {};
  if (has('name') || !partial) {
    values.name = cleanName(input.name);
    if (!values.name) {
      return { error: 'nameMissing' };
    }
  }
  if (!partial) {
    values.kind = has('kind') ? input.kind : DEFAULTS.kind;
    if (!KIND_LIST.includes(values.kind)) {
      return { error: 'kindUnknown' };
    }
  }
  for (const [key, list] of [
    ['icon', ICONS],
    ['style', STYLES],
  ]) {
    if (has(key)) {
      if (!list.includes(input[key])) {
        return { error: key === 'icon' ? 'iconUnknown' : 'styleUnknown' };
      }
      values[key] = input[key];
    } else if (!partial) {
      values[key] = DEFAULTS[key];
    }
  }
  if (has('confirm')) {
    values.confirm = toConfirm(input.confirm);
    if (values.confirm === null) {
      return { error: 'confirmUnknown' };
    }
  } else if (!partial) {
    values.confirm = DEFAULTS.confirm;
  }
  if (has('minutes')) {
    values.minutes = toMinutes(input.minutes);
    if (values.minutes === null) {
      return { error: 'minutesOut' };
    }
  } else if (!partial) {
    values.minutes = DEFAULTS.minutes;
  }
  return { values };
}

/** The external ids of a button. */
export function idsOf(gladys, id) {
  const ids = gladys.externalIds(DEVICE_TYPE, id);
  return {
    device: ids.device,
    feature: ids.feature(FEATURES.PRESS),
    state: ids.feature(FEATURES.STATE),
  };
}

/** The feature external id that carries the state of a button. */
export const featureOf = (gladys, button) =>
  button.kind === KINDS.PUSH ? idsOf(gladys, button.id).feature : idsOf(gladys, button.id).state;

/** The device id → button id, or null for a device that is not ours. */
export function idOfDevice(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length).split(':')[0];
  return isId(rest) ? rest : null;
}

/**
 * The Gladys device of a button. Never a light category (a "turn off the
 * lights" would reach it); the push button is a button/push, the switches a
 * switch/binary. Its appearance travels in the params, so a lost /data is
 * rebuilt from the devices Gladys kept.
 */
export function deviceOf(gladys, button) {
  const ids = idsOf(gladys, button.id);
  const push = button.kind === KINDS.PUSH;
  return {
    name: button.name,
    external_id: ids.device,
    features: [
      {
        name: button.name,
        external_id: push ? ids.feature : ids.state,
        category: push ? DEVICE_FEATURE_CATEGORIES.BUTTON : DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: push ? DEVICE_FEATURE_TYPES.BUTTON.PUSH : DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        read_only: false,
        has_feedback: true,
        keep_history: !push,
        min: 0,
        max: 1,
      },
    ],
    params: [
      { name: PARAMS.KIND, value: button.kind },
      { name: PARAMS.LABEL, value: button.name },
      { name: PARAMS.ICON, value: button.icon },
      { name: PARAMS.STYLE, value: button.style },
      { name: PARAMS.CONFIRM, value: button.confirm ? 'true' : 'false' },
      { name: PARAMS.MINUTES, value: String(button.minutes) },
    ],
  };
}

/** A button rebuilt from a device Gladys kept, or null. */
export function buttonFromDevice(gladys, device) {
  const id = idOfDevice(gladys, device?.external_id);
  if (!id) {
    return null;
  }
  const params = new Map();
  for (const param of Array.isArray(device.params) ? device.params.slice(0, 50) : []) {
    if (param && typeof param.name === 'string' && typeof param.value === 'string') {
      params.set(param.name, param.value);
    }
  }
  const feature = Array.isArray(device.features) ? device.features[0] : null;
  let kind = params.get(PARAMS.KIND);
  if (!KIND_LIST.includes(kind)) {
    // No param: the feature tells a push button from a switch.
    kind = feature?.category === DEVICE_FEATURE_CATEGORIES.SWITCH ? KINDS.SWITCH : KINDS.PUSH;
  }
  // A plain switch takes back the value Gladys holds (nothing published, no
  // scene started); a timed switch always starts off (its end is unknown).
  const state = kind === KINDS.SWITCH && feature?.last_value === 1 ? 1 : 0;
  return sanitizeButton({
    id,
    name: params.get(PARAMS.LABEL) || device.name,
    kind,
    icon: params.get(PARAMS.ICON),
    style: params.get(PARAMS.STYLE),
    confirm: params.get(PARAMS.CONFIRM) === 'true',
    minutes: params.get(PARAMS.MINUTES),
    state,
  });
}
