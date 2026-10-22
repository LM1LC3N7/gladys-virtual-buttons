// -----------------------------------------------------------------------------
// The integration itself: the list of buttons, the commands (from the device
// boxes, the scenes, the voice and the widget), the timed switches, the
// Discovery list and the status. index.js only wires the SDK handlers to it
// (src/handlers.js).
//
// Rules held here:
// - every change of the list or of a state goes through one queue (`run`),
//   so two actions never interleave;
// - a switch state (and the end of a timed switch) is saved in /data before
//   the command is acknowledged; the ack never waits for the publication to
//   Gladys;
// - a timed switch is never lost: its own timer, plus a sweep every 30 s that
//   turns off every switch whose end has passed (after a restart too); the
//   return to off is never refused by a budget;
// - states published within a budget below the 300/min of the host API; a
//   state Gladys did not take is sent again by the sweep (never a push "1",
//   which would start a scene late);
// - a button pressed more than 20 times in a minute (a scene that triggers
//   itself) is refused until the minute has passed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { KINDS, LIMITS, TIMINGS, WIDGET_ACTION_KEY, WIDGET_SLOTS, WIDGETS } from './constants.js';
import {
  buttonFromDevice,
  deviceOf,
  featureOf,
  idOfDevice,
  isId,
  isSwitchKind,
  nameKey,
  newId,
  readFields,
  sanitizeButton,
} from './buttons.js';
import { ButtonError, T } from './i18n.js';
import { FileStore, MAX_REMOVED } from './store.js';
import { buttonsWidget, messageWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };
const MAX_DELAY = 2 ** 31 - 1;

/** A sliding window of events: at most `limit` in `window` ms. */
export class Window {
  constructor(limit, window, now) {
    this.limit = limit;
    this.window = window;
    this.now = now;
    this.times = [];
  }

  prune() {
    const from = this.now() - this.window;
    while (this.times.length > 0 && this.times[0] <= from) {
      this.times.shift();
    }
  }

  /** Takes `n` slots; refused (false) beyond the limit, unless forced. */
  take(n = 1, { force = false } = {}) {
    this.prune();
    if (!force && this.times.length + n > this.limit) {
      return false;
    }
    const at = this.now();
    for (let i = 0; i < n; i += 1) {
      this.times.push(at);
    }
    // Forced takes never grow the memory without bound.
    if (this.times.length > this.limit * 2) {
      this.times.splice(0, this.times.length - this.limit * 2);
    }
    return true;
  }

  free() {
    this.prune();
    return Math.max(0, this.limit - this.times.length);
  }
}

export class ButtonsApp {
  constructor({
    gladys,
    store = new FileStore(),
    now = Date.now,
    timers = defaultTimers,
    logger,
  } = {}) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.timers = timers;
    this.log = logger ?? createLogger({ name: 'virtual-buttons' });
    /** id -> button, in creation order. */
    this.buttons = new Map();
    this.removed = [];
    this.loading = null;
    this.queue = Promise.resolve();
    this.budget = new Window(LIMITS.statesPerMinute, TIMINGS.window, now);
    /** id -> Window of the commands of one button. */
    this.presses = new Map();
    /** id -> timer: a push going back to 0, a timed switch going back to off. */
    this.pulseTimers = new Map();
    this.endTimers = new Map();
    /** Buttons whose current state Gladys has not taken yet. */
    this.unpublished = new Set();
    /** The list could not be saved: saved again by the sweep. */
    this.dirty = false;
    this.sweepTimer = null;
    this.stopped = false;
  }

  // --- Lifecycle ---------------------------------------------------------------------

  /** Loads /data once. */
  init() {
    this.loading ??= this.load();
    return this.loading;
  }

  async load() {
    const data = await this.store.load(this.now());
    for (const button of data.buttons) {
      this.buttons.set(button.id, button);
    }
    this.removed = data.removed;
    for (const button of this.buttons.values()) {
      this.armEnd(button);
    }
    this.sweepTimer = this.timers.setInterval(() => {
      this.sweep().catch((err) => this.log.warn(`Sweep failed: ${err.message}`));
    }, TIMINGS.sweep);
    this.sweepTimer?.unref?.();
    // A timed switch whose end passed while the container was stopped goes
    // back to off now, before anything else.
    await this.expireDue();
  }

  /** Every (re)connection to Gladys: recover, then Discovery, status and states again. */
  async connected() {
    await this.init();
    await this.run(() => this.recover());
    await this.publishDiscovery();
    await this.reportStatus();
    // Gladys may have lost what it had: every state of a created button again.
    for (const button of this.buttons.values()) {
      this.unpublished.add(button.id);
    }
    await this.flushStates();
  }

  async stop() {
    this.stopped = true;
    if (this.sweepTimer) {
      this.timers.clearInterval(this.sweepTimer);
    }
    for (const timer of [...this.pulseTimers.values(), ...this.endTimers.values()]) {
      this.timers.clearTimeout(timer);
    }
    this.pulseTimers.clear();
    this.endTimers.clear();
    await this.queue.catch(() => {});
    await this.store.flush();
  }

  /** One change at a time. */
  run(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  snapshot() {
    return { buttons: [...this.buttons.values()], removed: this.removed };
  }

  async save() {
    await this.store.save(this.snapshot());
    this.dirty = false;
  }

  /**
   * Buttons rebuilt from the devices Gladys kept, when /data lost them (a new
   * volume, an unreadable file). Never a removed one, never beyond the limit.
   */
  async recover() {
    let changed = false;
    for (const device of Array.isArray(this.gladys.devices) ? this.gladys.devices : []) {
      const id = idOfDevice(this.gladys, device?.external_id);
      if (!id || this.buttons.has(id) || this.removed.includes(id)) {
        continue;
      }
      if (this.buttons.size >= LIMITS.buttons) {
        break;
      }
      const button = buttonFromDevice(this.gladys, device);
      if (button && !this.nameTaken(button.name)) {
        this.buttons.set(button.id, button);
        changed = true;
      }
    }
    if (changed) {
      this.log.info('Buttons rebuilt from the devices kept by Gladys');
      await this.save().catch((err) => {
        this.dirty = true;
        this.log.warn(`Save failed: ${err.message}`);
      });
    }
  }

  // --- Gladys side -------------------------------------------------------------------

  createdIds() {
    const ids = new Set();
    for (const device of Array.isArray(this.gladys.devices) ? this.gladys.devices : []) {
      const id = idOfDevice(this.gladys, device?.external_id);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  async publishDiscovery() {
    const devices = [...this.buttons.values()].map((b) => deviceOf(this.gladys, b));
    try {
      await this.gladys.publishDiscoveredDevices(devices);
    } catch (err) {
      this.log.warn(`Discovery not published: ${err.message}`);
    }
  }

  async reportStatus() {
    const created = this.createdIds();
    const count = [...this.buttons.keys()].filter((id) => created.has(id)).length;
    const message = this.store.corrupted ? T.statusCorrupted : T.status(this.buttons.size, count);
    try {
      await this.gladys.setConnectionStatus(true, message);
    } catch (err) {
      this.log.warn(`Status not published: ${err.message}`);
    }
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(WIDGETS.BUTTONS);
    } catch {
      // A nudge only: the content cache expires anyway.
    }
  }

  /**
   * Sends the current state of the buttons Gladys has not taken yet (created
   * devices only: Gladys drops the states of a feature that does not exist),
   * within the budget. A push button is sent as 0, never as a late 1.
   */
  async flushStates({ force = false } = {}) {
    const created = this.createdIds();
    const states = [];
    for (const id of this.unpublished) {
      const button = this.buttons.get(id);
      if (!button || !created.has(id)) {
        this.unpublished.delete(id);
        continue;
      }
      states.push({
        id,
        device_feature_external_id: featureOf(this.gladys, button),
        state: button.state,
      });
    }
    if (states.length === 0) {
      return;
    }
    const batch = force ? states : states.slice(0, this.budget.free());
    if (batch.length === 0 || !this.budget.take(batch.length, { force })) {
      return;
    }
    for (let i = 0; i < batch.length; i += 100) {
      const part = batch.slice(i, i + 100);
      try {
        await this.gladys.publishStates(
          part.map(({ device_feature_external_id, state }) => ({
            device_feature_external_id,
            state,
          })),
        );
        for (const { id, state } of part) {
          // Taken, unless the state changed meanwhile.
          if (this.buttons.get(id)?.state === state) {
            this.unpublished.delete(id);
          }
        }
      } catch (err) {
        this.log.warn(`States not published, sent again later: ${err.message}`);
      }
    }
  }

  /** One state, now, without delaying the ack; a failure is sent again by the sweep. */
  publishLater(button, state, { retry = true } = {}) {
    const feature = featureOf(this.gladys, button);
    Promise.resolve()
      .then(() => this.gladys.publishState(feature, state))
      .then(
        () => {
          if (this.buttons.get(button.id)?.state === state) {
            this.unpublished.delete(button.id);
          }
        },
        (err) => {
          this.log.warn(`State not published: ${err.message}`);
          if (retry) {
            this.unpublished.add(button.id);
          }
        },
      );
  }

  // --- Timers ------------------------------------------------------------------------

  armEnd(button) {
    const previous = this.endTimers.get(button.id);
    if (previous) {
      this.timers.clearTimeout(previous);
      this.endTimers.delete(button.id);
    }
    if (
      this.stopped ||
      button.kind !== KINDS.TIMED ||
      button.state !== 1 ||
      !Number.isFinite(button.until)
    ) {
      return;
    }
    const delay = Math.min(MAX_DELAY, Math.max(0, button.until - this.now()));
    const timer = this.timers.setTimeout(() => {
      this.endTimers.delete(button.id);
      this.expireDue().catch((err) => this.log.warn(`Timer failed: ${err.message}`));
    }, delay);
    timer?.unref?.();
    this.endTimers.set(button.id, timer);
  }

  /** Every timed switch whose end has passed goes back to off (never refused). */
  expireDue() {
    return this.run(async () => {
      const now = this.now();
      const due = [...this.buttons.values()].filter(
        (b) =>
          b.kind === KINDS.TIMED && b.state === 1 && (!Number.isFinite(b.until) || b.until <= now),
      );
      if (due.length === 0) {
        return;
      }
      for (const button of due) {
        button.state = 0;
        button.until = null;
        this.armEnd(button);
        this.unpublished.add(button.id);
      }
      try {
        await this.save();
      } catch (err) {
        // Off in memory anyway (the protective side); saved again by the sweep.
        this.dirty = true;
        this.log.warn(`Save failed: ${err.message}`);
      }
      await this.flushStates({ force: true });
      this.refreshWidget();
    });
  }

  async sweep() {
    if (this.stopped) {
      return;
    }
    await this.expireDue();
    if (this.dirty) {
      await this.run(() => this.save()).catch((err) =>
        this.log.warn(`Save failed: ${err.message}`),
      );
    }
    await this.flushStates();
  }

  // --- Commands ----------------------------------------------------------------------

  /** Loop and flood guard for one command of one button. */
  admit(button, states) {
    let window = this.presses.get(button.id);
    if (!window) {
      window = new Window(LIMITS.pressesPerButton, TIMINGS.window, this.now);
      this.presses.set(button.id, window);
    }
    if (window.free() < 1) {
      throw new ButtonError('tooFast');
    }
    if (!this.budget.take(states)) {
      throw new ButtonError('budget');
    }
    window.take(1);
  }

  /** A push: 1 now, 0 after the pulse (a new press restarts the pulse). */
  press(button) {
    this.admit(button, 2);
    const previous = this.pulseTimers.get(button.id);
    if (previous) {
      this.timers.clearTimeout(previous);
    }
    // The 1 is never sent again later: a late 1 would start a scene late.
    this.publishLater(button, 1, { retry: false });
    const timer = this.timers.setTimeout(() => {
      this.pulseTimers.delete(button.id);
      if (this.buttons.get(button.id) === button) {
        this.publishLater(button, 0);
      }
    }, TIMINGS.pulse);
    timer?.unref?.();
    this.pulseTimers.set(button.id, timer);
  }

  /**
   * A switch on (1) or off (0), or 'toggle' (decided in the queue, on the
   * current state); a timed switch turned on (again) restarts its delay.
   * Resolves the value applied.
   */
  setSwitch(button, wanted) {
    return this.run(async () => {
      if (this.buttons.get(button.id) !== button) {
        throw new ButtonError('unknownButton');
      }
      const value = wanted === 'toggle' ? (button.state === 1 ? 0 : 1) : wanted;
      // Off is protective: never refused by the guards.
      if (value === 1) {
        this.admit(button, 1);
      } else {
        this.budget.take(1, { force: true });
      }
      const before = { state: button.state, until: button.until };
      button.state = value;
      button.until =
        value === 1 && button.kind === KINDS.TIMED ? this.now() + button.minutes * 60 * 1000 : null;
      try {
        await this.save();
      } catch (err) {
        this.log.warn(`Save failed: ${err.message}`);
        if (value === 1) {
          // An "on" that a restart would not find is refused.
          button.state = before.state;
          button.until = before.until;
          throw new ButtonError('saveFailed');
        }
        this.dirty = true;
      }
      this.armEnd(button);
      this.unpublished.add(button.id);
      this.publishLater(button, value);
      this.refreshWidget();
      return value;
    });
  }

  async ready() {
    await this.init();
  }

  /** onSetValue: a command from Gladys (device box, scene, voice, MCP…). */
  async setValue(device, feature, value) {
    await this.ready();
    const id = idOfDevice(this.gladys, device?.external_id);
    const button = id ? this.buttons.get(id) : null;
    if (!button) {
      throw new ButtonError('unknownButton');
    }
    if (feature?.external_id !== featureOf(this.gladys, button)) {
      throw new ButtonError('unknownButton');
    }
    // null, '' and '1' are not 1.
    if (value !== 0 && value !== 1) {
      throw new ButtonError('badValue');
    }
    if (button.kind === KINDS.PUSH) {
      if (value === 1) {
        this.press(button);
      }
      return;
    }
    await this.setSwitch(button, value);
  }

  // --- Manifest actions --------------------------------------------------------------

  nameTaken(name, exceptId = null) {
    const key = nameKey(name);
    return [...this.buttons.values()].some((b) => b.id !== exceptId && nameKey(b.name) === key);
  }

  /** The button an action names: the device chosen in the list, or the name typed. */
  target(fields) {
    const input = fields && typeof fields === 'object' ? fields : {};
    const chosen = Object.hasOwn(input, 'button') ? input.button : undefined;
    const typed = Object.hasOwn(input, 'current_name') ? input.current_name : undefined;
    if (typeof chosen === 'string' && chosen !== '') {
      const id = idOfDevice(this.gladys, chosen);
      const button = id ? this.buttons.get(id) : null;
      if (!button) {
        throw new ButtonError('unknownButton');
      }
      return button;
    }
    if (typeof typed === 'string' && nameKey(typed) !== '') {
      const key = nameKey(typed);
      const button = [...this.buttons.values()].find((b) => nameKey(b.name) === key);
      if (!button) {
        throw new ButtonError('targetUnknown');
      }
      return button;
    }
    throw new ButtonError('targetMissing');
  }

  async afterChange() {
    await this.publishDiscovery();
    await this.reportStatus();
    this.refreshWidget();
  }

  async add(fields) {
    await this.ready();
    const button = await this.run(async () => {
      const { values, error } = readFields(fields);
      if (error) {
        throw new ButtonError(error);
      }
      if (this.buttons.size >= LIMITS.buttons) {
        throw new ButtonError('tooMany');
      }
      if (this.nameTaken(values.name)) {
        throw new ButtonError('nameTaken');
      }
      let id = newId();
      while (this.buttons.has(id) || this.removed.includes(id)) {
        id = newId();
      }
      const created = sanitizeButton({ id, ...values, state: 0 });
      this.buttons.set(id, created);
      try {
        await this.save();
      } catch (err) {
        this.buttons.delete(id);
        this.log.warn(`Save failed: ${err.message}`);
        throw new ButtonError('saveFailed');
      }
      return created;
    });
    await this.afterChange();
    return T.added(button.name);
  }

  async edit(fields) {
    await this.ready();
    const name = await this.run(async () => {
      const button = this.target(fields);
      const { values, error } = readFields(
        { ...fields, button: undefined, current_name: undefined },
        { partial: true },
      );
      if (error) {
        throw new ButtonError(error);
      }
      if (Object.keys(values).length === 0) {
        throw new ButtonError('nothingToChange');
      }
      if (values.name && this.nameTaken(values.name, button.id)) {
        throw new ButtonError('nameTaken');
      }
      const before = { ...button };
      // The kind never changes (the feature of a created device is fixed); a
      // new duration applies at the next "on".
      Object.assign(button, values);
      try {
        await this.save();
      } catch (err) {
        Object.assign(button, before);
        this.log.warn(`Save failed: ${err.message}`);
        throw new ButtonError('saveFailed');
      }
      return button.name;
    });
    await this.afterChange();
    return T.edited(name);
  }

  async remove(fields) {
    await this.ready();
    const name = await this.run(async () => {
      const button = this.target(fields);
      const removedBefore = this.removed;
      this.buttons.delete(button.id);
      this.removed = [...this.removed.filter((id) => id !== button.id), button.id].slice(
        -MAX_REMOVED,
      );
      try {
        await this.save();
      } catch (err) {
        this.buttons.set(button.id, button);
        this.removed = removedBefore;
        this.log.warn(`Save failed: ${err.message}`);
        throw new ButtonError('saveFailed');
      }
      for (const timers of [this.pulseTimers, this.endTimers]) {
        const timer = timers.get(button.id);
        if (timer) {
          this.timers.clearTimeout(timer);
          timers.delete(button.id);
        }
      }
      this.presses.delete(button.id);
      this.unpublished.delete(button.id);
      return button.name;
    });
    await this.afterChange();
    return T.removed(name);
  }

  // --- Device events -----------------------------------------------------------------

  async deviceCreated(device) {
    await this.ready();
    const id = idOfDevice(this.gladys, device?.external_id);
    if (!id) {
      return;
    }
    if (!this.buttons.has(id)) {
      await this.run(() => this.recover());
    }
    if (this.buttons.has(id)) {
      this.unpublished.add(id);
      await this.flushStates();
    }
    await this.reportStatus();
  }

  async deviceDeleted() {
    await this.ready();
    // The button stays in the integration (proposed again in Discovery):
    // "Remove a button" removes it for good.
    await this.reportStatus();
  }

  // --- Widget ------------------------------------------------------------------------

  async getWidget({ settings = {} } = {}) {
    await this.ready();
    const shown = [];
    let chosen = 0;
    for (const slot of WIDGET_SLOTS) {
      const value = settings && Object.hasOwn(settings, slot) ? settings[slot] : undefined;
      if (typeof value !== 'string' || value === '') {
        continue;
      }
      chosen += 1;
      const id = idOfDevice(this.gladys, value);
      const button = id ? this.buttons.get(id) : null;
      if (button && !shown.includes(button)) {
        shown.push(button);
      }
    }
    if (shown.length === 0) {
      return messageWidget(chosen > 0 ? T.widget.gone : T.widget.empty);
    }
    return buttonsWidget(shown, this.now());
  }

  async widgetAction(actionKey, params) {
    await this.ready();
    if (typeof actionKey !== 'string' || !WIDGET_ACTION_KEY.test(actionKey)) {
      throw new ButtonError('unknownButton');
    }
    const id =
      params && typeof params === 'object' && Object.hasOwn(params, 'id') ? params.id : null;
    const button = isId(id) ? this.buttons.get(id) : null;
    if (!button) {
      throw new ButtonError('unknownButton');
    }
    if (!isSwitchKind(button.kind)) {
      this.press(button);
      return T.pressed(button.name);
    }
    const value = await this.setSwitch(button, 'toggle');
    if (value === 0) {
      return T.switchedOff(button.name);
    }
    return button.kind === KINDS.TIMED
      ? T.switchedOnFor(button.name, button.minutes)
      : T.switchedOn(button.name);
  }
}
