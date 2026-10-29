// -----------------------------------------------------------------------------
// The integration itself: the list of buttons, the commands (from the device
// boxes, the scenes, the voice and the widget), the timed switches, the
// Discovery list and the status. index.js only wires the SDK handlers to it
// (src/handlers.js).
//
// Rules held here:
// - every change of the list or of a state goes through one queue (`run`),
//   which only holds memory and /data work: never a request to Gladys;
// - publications to Gladys go through their own chain, in order; Discovery
//   through another one, the list taken when it is sent (last one wins);
// - an "on" or a press is refused when it is applied more than 3.5 s after
//   it was received (Gladys has shown a failure by then): nothing sent; an
//   "off" is always applied;
// - a switch state (and the end of a timed switch) is saved in /data before
//   the command is acknowledged; the ack of a switch never waits for the
//   publication; a press waits (bounded) to tell "taken" from "not sent";
// - a value Gladys already holds is never published again (a reconnection or
//   a restart never starts a scene); an "off" of a switch already off is
//   acknowledged without publishing (no "= Off" scene loop);
// - a timed switch is never lost: its own timer (which ends it even if the
//   wall clock went back), plus a sweep every 30 s (wall clock forward, after
//   a restart); the return to off is never refused;
// - a selector is on one of its positions; a change of position is
//   guarded like an "on" (deadline, 20 a minute, saved before the ack), and
//   the position Gladys already holds is never published again;
// - 20 presses, "on" or changes of position a minute per button, 240 states
//   a minute in all.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  ICON_PAGES,
  KINDS,
  LIMITS,
  TIMINGS,
  WIDGET_ACTION_KEY,
  WIDGET_POSITION_FIELD,
  WIDGET_SLOTS,
  WIDGETS,
} from './constants.js';
import {
  buttonFromDevice,
  deviceOf,
  featureOf,
  idOfDevice,
  isId,
  isSwitchKind,
  nameKey,
  positionsMoved,
  newId,
  positionOfText,
  readFields,
  sanitizeButton,
  toPosition,
  wireOf,
} from './buttons.js';
import { ButtonError, T } from './i18n.js';
import { FileStore, MAX_REMOVED } from './store.js';
import { buttonsWidget, iconsWidget, messageWidget } from './widget.js';

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
    mono,
    timers = defaultTimers,
    logger,
  } = {}) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    // The deadlines of the commands run on a monotonic clock (the injected
    // clock in the tests).
    this.mono = mono ?? (now === Date.now ? () => performance.now() : now);
    this.timers = timers;
    this.log = logger ?? createLogger({ name: 'virtual-buttons' });
    /** id -> button, in creation order. */
    this.buttons = new Map();
    this.removed = [];
    this.loading = null;
    this.queue = Promise.resolve();
    this.publishing = Promise.resolve();
    this.discovering = Promise.resolve();
    this.budget = new Window(LIMITS.statesPerMinute, TIMINGS.window, this.mono);
    /** id -> Window of the presses and "on" of one button. */
    this.presses = new Map();
    /** id -> Window of the "off" of one button (never refused, only not republished). */
    this.offs = new Map();
    /** id -> timer: a push going back to 0, a timed switch going back to off. */
    this.pulseTimers = new Map();
    this.endTimers = new Map();
    /** Timed switches whose own timer ran out (due whatever the wall clock says). */
    this.ended = new Set();
    /** Buttons whose current state Gladys has not taken yet. */
    this.unpublished = new Set();
    /** id -> the last state Gladys took from this process. */
    this.sent = new Map();
    /** id -> number of publications of this button in flight. */
    this.inflight = new Map();
    /** The list could not be saved: saved again by the sweep. */
    this.dirty = false;
    /** The last "Change a button": a second identical one for another button must be confirmed. */
    this.lastEdit = null;
    // A recovered selector lost its position names: the status says so.
    this.defaultedPositions = false;
    this.pendingEdit = null;
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
    // back to off now, before anything else (published when connected).
    await this.expireDue();
  }

  /**
   * Every (re)connection to Gladys: recover, then Discovery and status again,
   * and only the states Gladys does not hold already.
   */
  async connected() {
    // The SDK has just read the devices again: their last_value is now the
    // reference (a Gladys restored from a backup holds other values). What
    // this process sends from here on (an end passed while stopped) is newer.
    this.sent.clear();
    await this.init();
    await this.run(() => this.recover());
    await this.publishDiscovery();
    await this.reportStatus();
    for (const button of this.buttons.values()) {
      if (this.differsFromGladys(button)) {
        this.unpublished.add(button.id);
      }
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

  /** One change at a time (memory and /data only). */
  run(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  snapshot() {
    return { buttons: [...this.buttons.values()], removed: this.removed };
  }

  async save() {
    const corrupted = this.store.corrupted;
    await this.store.save(this.snapshot());
    this.dirty = false;
    if (corrupted && !this.store.corrupted) {
      // The "unreadable list" status is lifted by the first good save.
      this.reportStatus().catch(() => {});
    }
  }

  /**
   * Buttons rebuilt from the devices Gladys kept, when /data lost them (a new
   * volume, an unreadable file). Never a removed one, never beyond the limit.
   */
  async recover() {
    let changed = false;
    for (const device of this.createdDevices()) {
      const id = idOfDevice(this.gladys, device?.external_id);
      if (!id || this.buttons.has(id) || this.removed.includes(id)) {
        continue;
      }
      if (this.buttons.size >= LIMITS.buttons) {
        break;
      }
      const notes = {};
      const button = buttonFromDevice(this.gladys, device, notes);
      if (button && !this.nameTaken(button.name)) {
        this.buttons.set(button.id, button);
        this.defaultedPositions ||= notes.defaultPositions === true;
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

  createdDevices() {
    return Array.isArray(this.gladys.devices) ? this.gladys.devices : [];
  }

  createdIds() {
    const ids = new Set();
    for (const device of this.createdDevices()) {
      const id = idOfDevice(this.gladys, device?.external_id);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** The value Gladys holds for a button (null when unknown). */
  lastValue(button) {
    const feature = featureOf(this.gladys, button);
    for (const device of this.createdDevices()) {
      for (const f of Array.isArray(device?.features) ? device.features : []) {
        if (f?.external_id === feature) {
          if (button.kind === KINDS.SELECTOR) {
            return positionOfText(f.last_value_string, button);
          }
          return typeof f.last_value === 'number' ? f.last_value : null;
        }
      }
    }
    return null;
  }

  /** Whether Gladys may not hold the state of the button. */
  differsFromGladys(button) {
    // What Gladys took from this process is newer than the list read at the
    // connection; otherwise the value read from Gladys; unknown: publish.
    if (this.sent.has(button.id)) {
      return this.sent.get(button.id) !== button.state;
    }
    const held = this.lastValue(button);
    return held === null || held !== button.state;
  }

  /** Discovery, one publication at a time, with the list of the moment it is sent. */
  publishDiscovery() {
    const run = this.discovering.then(async () => {
      const devices = [...this.buttons.values()].map((b) => deviceOf(this.gladys, b));
      try {
        await this.gladys.publishDiscoveredDevices(devices);
      } catch (err) {
        this.log.warn(`Discovery not published: ${err.message}`);
      }
    });
    this.discovering = run;
    return run;
  }

  async reportStatus() {
    const created = this.createdIds();
    const count = [...this.buttons.keys()].filter((id) => created.has(id)).length;
    let message = T.status(this.buttons.size, count);
    if (this.defaultedPositions) {
      message = T.statusDefaultPositions;
    }
    if (this.store.unreadable) {
      message = T.statusUnreadable;
    } else if (this.store.corrupted) {
      message = T.statusCorrupted;
    }
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

  /** Publications, one after the other, in the order asked. */
  chain(task) {
    const run = this.publishing.then(task);
    this.publishing = run.catch(() => {});
    return run;
  }

  track(id, delta) {
    const n = (this.inflight.get(id) ?? 0) + delta;
    if (n > 0) {
      this.inflight.set(id, n);
    } else {
      this.inflight.delete(id);
    }
  }

  /**
   * One state of one button. Resolves 'ok', 'failed' or 'late' (not sent:
   * its deadline passed while waiting its turn). A failure is sent again by
   * the sweep when `retry`; a push "1" never is.
   */
  publish(button, state, { retry = true, deadline = null, attempt = {} } = {}) {
    this.track(button.id, 1);
    return this.chain(async () => {
      try {
        if (attempt.cancelled || (deadline !== null && this.mono() > deadline)) {
          return 'late';
        }
        attempt.started = true;
        await this.gladys.publishState(featureOf(this.gladys, button), wireOf(button, state));
        this.sent.set(button.id, state);
        if (this.buttons.get(button.id)?.state === state) {
          this.unpublished.delete(button.id);
        }
        return 'ok';
      } catch (err) {
        this.log.warn(`State not published: ${err.message}`);
        if (retry && this.buttons.get(button.id)?.state === state) {
          this.unpublished.add(button.id);
        }
        return 'failed';
      } finally {
        this.track(button.id, -1);
      }
    });
  }

  /**
   * Sends the current state of the buttons Gladys has not taken yet (created
   * devices only: Gladys drops the states of a feature that does not exist),
   * within the budget, never one already in flight. A push is sent as 0.
   */
  flushStates({ force = false } = {}) {
    return this.chain(async () => {
      const created = this.createdIds();
      const states = [];
      for (const id of this.unpublished) {
        const button = this.buttons.get(id);
        if (!button || !created.has(id)) {
          this.unpublished.delete(id);
          continue;
        }
        if (this.inflight.has(id)) {
          continue;
        }
        states.push({ id, button, state: button.state });
      }
      const batch = force ? states : states.slice(0, this.budget.free());
      if (batch.length === 0 || !this.budget.take(batch.length, { force })) {
        return;
      }
      for (let i = 0; i < batch.length; i += 100) {
        const part = batch.slice(i, i + 100);
        try {
          await this.gladys.publishStates(
            part.map(({ button, state }) => {
              const wire = wireOf(button, state);
              const feature = featureOf(this.gladys, button);
              return typeof wire === 'number'
                ? { device_feature_external_id: feature, state: wire }
                : { device_feature_external_id: feature, ...wire };
            }),
          );
          for (const { id, state } of part) {
            this.sent.set(id, state);
            if (this.buttons.get(id)?.state === state) {
              this.unpublished.delete(id);
            }
          }
        } catch (err) {
          this.log.warn(`States not published, sent again later: ${err.message}`);
        }
      }
    });
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
      if (this.endTimers.get(button.id) !== timer) {
        return;
      }
      this.endTimers.delete(button.id);
      // The timer measured the real duration: due even if the wall clock
      // went back meanwhile.
      this.ended.add(button.id);
      this.expireDue().catch((err) => this.log.warn(`Timer failed: ${err.message}`));
    }, delay);
    timer?.unref?.();
    this.endTimers.set(button.id, timer);
  }

  /** Every timed switch whose end has passed goes back to off (never refused). */
  async expireDue() {
    const count = await this.run(async () => {
      const now = this.now();
      const due = [...this.buttons.values()].filter(
        (b) =>
          b.kind === KINDS.TIMED &&
          b.state === 1 &&
          (this.ended.has(b.id) || !Number.isFinite(b.until) || b.until <= now),
      );
      for (const button of due) {
        button.state = 0;
        button.until = null;
        this.ended.delete(button.id);
        this.armEnd(button);
        this.unpublished.add(button.id);
      }
      if (due.length > 0) {
        try {
          await this.save();
        } catch (err) {
          // Off in memory anyway (the protective side); saved again by the sweep.
          this.dirty = true;
          this.log.warn(`Save failed: ${err.message}`);
        }
      }
      return due.length;
    });
    if (count > 0) {
      // Outside the queue, never awaited by a command.
      this.flushStates({ force: true }).catch(() => {});
      this.refreshWidget();
    }
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

  windowOf(map, id) {
    let window = map.get(id);
    if (!window) {
      window = new Window(LIMITS.pressesPerButton, TIMINGS.window, this.mono);
      map.set(id, window);
    }
    return window;
  }

  /** Loop and flood guard for a press or an "on". */
  admit(button, states) {
    const window = this.windowOf(this.presses, button.id);
    if (window.free() < 1) {
      throw new ButtonError('tooFast');
    }
    if (!this.budget.take(states)) {
      throw new ButtonError('budget');
    }
    window.take(1);
  }

  /**
   * A push: 1 now, 0 after the pulse. Waits (bounded) for Gladys to take the
   * 1: resolves 'ok' or 'unconfirmed', throws when it was not sent.
   */
  async press(button, received) {
    if (this.mono() - received > TIMINGS.late) {
      throw new ButtonError('late');
    }
    this.admit(button, 2);
    const previous = this.pulseTimers.get(button.id);
    if (previous) {
      this.timers.clearTimeout(previous);
      this.pulseTimers.delete(button.id);
    }
    // The 1 is never sent again later, nor after its deadline: a late 1
    // would start a scene late.
    const attempt = { started: false, cancelled: false };
    const sent = this.publish(button, 1, {
      retry: false,
      deadline: received + TIMINGS.late,
      attempt,
    });
    sent.then((outcome) => {
      if (outcome !== 'ok' || this.buttons.get(button.id) !== button) {
        return;
      }
      const timer = this.timers.setTimeout(() => {
        this.pulseTimers.delete(button.id);
        if (this.buttons.get(button.id) === button) {
          this.publish(button, 0);
        }
      }, TIMINGS.pulse);
      timer?.unref?.();
      this.pulseTimers.set(button.id, timer);
    });
    const wait = Math.max(0, received + TIMINGS.pressAnswer - this.mono());
    let timer;
    const outcome = await Promise.race([
      sent,
      new Promise((resolve) => {
        timer = this.timers.setTimeout(() => resolve('unconfirmed'), wait);
        timer?.unref?.();
      }),
    ]);
    this.timers.clearTimeout(timer);
    if (outcome === 'unconfirmed' && !attempt.started) {
      // Still waiting its turn: it will never leave (no late 1).
      attempt.cancelled = true;
      throw new ButtonError('late');
    }
    if (outcome === 'late') {
      throw new ButtonError('late');
    }
    if (outcome === 'failed') {
      throw new ButtonError('notSent');
    }
    return outcome;
  }

  /**
   * A switch on (1) or off (0). Resolves { before, value, sent } where `sent`
   * is the publication (a promise, or null when nothing had to be sent),
   * never awaited here.
   */
  async setSwitch(button, value, received) {
    const result = await this.run(async () => {
      if (this.buttons.get(button.id) !== button) {
        throw new ButtonError('unknownButton');
      }
      const before = button.state;
      // Gladys already holds this very value: nothing to publish (a scene
      // "Off -> turn it off" or "On -> turn it on" does not loop).
      const held =
        before === value &&
        !this.unpublished.has(button.id) &&
        !this.inflight.has(button.id) &&
        (this.sent.get(button.id) === value || this.lastValue(button) === value);
      if (value === 1) {
        // Checked just before applying: an "on" Gladys gave up on is refused.
        if (this.mono() - received > TIMINGS.late) {
          throw new ButtonError('late');
        }
        if (held && button.kind === KINDS.SWITCH) {
          return { before, value, publish: false };
        }
        this.admit(button, held ? 0 : 1);
      } else {
        const offs = this.windowOf(this.offs, button.id);
        const flood = offs.free() < 1;
        offs.take(1, { force: true });
        if (held || (before === 0 && flood)) {
          return { before, value, publish: false };
        }
        this.budget.take(1, { force: true });
      }
      const previous = { state: button.state, until: button.until };
      button.state = value;
      button.until =
        value === 1 && button.kind === KINDS.TIMED ? this.now() + button.minutes * 60 * 1000 : null;
      this.ended.delete(button.id);
      try {
        await this.save();
      } catch (err) {
        this.log.warn(`Save failed: ${err.message}`);
        if (value === 1) {
          // An "on" that a restart would not find is refused.
          button.state = previous.state;
          button.until = previous.until;
          throw new ButtonError('saveFailed');
        }
        this.dirty = true;
      }
      this.armEnd(button);
      // A timed switch on again restarts its duration, without a new "1".
      return { before, value, publish: !held };
    });
    let sent = null;
    if (result.publish) {
      sent = this.publish(button, value);
    }
    this.refreshWidget();
    return { before: result.before, value, sent };
  }

  /**
   * A selector on one of its positions. Resolves { before, value, sent }
   * like setSwitch. Every position is guarded like an "on": the late ones
   * are refused, 20 changes a minute at most, saved before the ack.
   */
  async setPosition(button, position, received) {
    const result = await this.run(async () => {
      if (this.buttons.get(button.id) !== button) {
        throw new ButtonError('unknownButton');
      }
      // Checked again here: "Change a button" may have shortened the list
      // while this command waited its turn.
      if (toPosition(position, button) === null) {
        throw new ButtonError('badPosition');
      }
      if (this.mono() - received > TIMINGS.late) {
        throw new ButtonError('late');
      }
      const before = button.state;
      // Gladys already holds this very position: nothing to publish (a scene
      // "= Eco -> set Eco" does not loop).
      const held =
        before === position &&
        !this.unpublished.has(button.id) &&
        !this.inflight.has(button.id) &&
        (this.sent.get(button.id) === position || this.lastValue(button) === position);
      if (held) {
        return { before, publish: false };
      }
      this.admit(button, 1);
      button.state = position;
      try {
        await this.save();
      } catch (err) {
        this.log.warn(`Save failed: ${err.message}`);
        // A position that a restart would not find is refused.
        button.state = before;
        throw new ButtonError('saveFailed');
      }
      return { before, publish: true };
    });
    let sent = null;
    if (result.publish) {
      sent = this.publish(button, position);
    }
    this.refreshWidget();
    return { before: result.before, value: position, sent };
  }

  async ready() {
    await this.init();
  }

  /** onSetValue: a command from Gladys (device box, scene, voice, MCP…). */
  async setValue(device, feature, value) {
    const received = this.mono();
    await this.ready();
    const id = idOfDevice(this.gladys, device?.external_id);
    const button = id ? this.buttons.get(id) : null;
    if (!button) {
      throw new ButtonError('unknownButton');
    }
    if (feature?.external_id !== featureOf(this.gladys, button)) {
      throw new ButtonError('unknownButton');
    }
    if (button.kind === KINDS.SELECTOR) {
      // Gladys sends the text of the option ("1" … "6"); a number, a name
      // or anything else is not a position.
      const position = positionOfText(value, button);
      if (position === null) {
        throw new ButtonError('badPosition');
      }
      await this.setPosition(button, position, received);
      return;
    }
    // null, '' and '1' are not 1.
    if (value !== 0 && value !== 1) {
      throw new ButtonError('badValue');
    }
    if (button.kind === KINDS.PUSH) {
      if (value === 1) {
        await this.press(button, received);
      }
      return;
    }
    await this.setSwitch(button, value, received);
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

  /** Discovery and status after a change: never awaited by the action (a slow host never holds it). */
  afterChange() {
    this.publishDiscovery()
      .then(() => this.reportStatus())
      .catch((err) => this.log.warn(`After change: ${err.message}`));
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
    this.afterChange();
    return T.added(button.name);
  }

  async edit(fields) {
    await this.ready();
    const done = await this.run(async () => {
      const button = this.target(fields);
      const { values, error } = readFields(
        { ...fields, button: undefined, current_name: undefined },
        { partial: true },
      );
      if (error) {
        throw new ButtonError(error);
      }
      if (button.kind !== KINDS.SELECTOR) {
        // The form sends the positions for every type: only a selector has some.
        delete values.positions;
      } else if (values.positions && values.positions.length < button.state) {
        // The current position never disappears (Gladys holds it, scenes too).
        throw new ButtonError('positionGone');
      } else if (values.positions && positionsMoved(button.positions, values.positions)) {
        // The numbers follow the rank: a move or an insertion would point the
        // scenes at other names without a word.
        throw new ButtonError('positionsMoved');
      }
      if (Object.keys(values).length === 0) {
        throw new ButtonError('nothingToChange');
      }
      if (values.name && this.nameTaken(values.name, button.id)) {
        throw new ButtonError('nameTaken');
      }
      // The form keeps its values after a run: the same changes for another
      // button right after are applied only when asked twice.
      const signature = JSON.stringify(values);
      const now = this.mono();
      const recent = (entry) => entry && now - entry.at <= TIMINGS.editConfirm;
      if (
        recent(this.lastEdit) &&
        this.lastEdit.signature === signature &&
        this.lastEdit.id !== button.id
      ) {
        const confirmed =
          recent(this.pendingEdit) &&
          this.pendingEdit.id === button.id &&
          this.pendingEdit.signature === signature;
        if (!confirmed) {
          this.pendingEdit = { id: button.id, signature, at: now };
          throw new ButtonError('sameAsPrevious');
        }
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
      this.lastEdit = { id: button.id, signature, at: now };
      this.pendingEdit = null;
      return { name: button.name, values };
    });
    this.afterChange();
    return T.edited(done.name, done.values);
  }

  async remove(fields) {
    await this.ready();
    const input = fields && typeof fields === 'object' ? fields : {};
    const typed = Object.hasOwn(input, 'current_name') ? input.current_name : undefined;
    // The typed name is the confirmation: a removal is final.
    if (typeof typed !== 'string' || nameKey(typed) === '') {
      throw new ButtonError('removeNameMissing');
    }
    const button = this.target(input);
    if (nameKey(typed) !== nameKey(button.name)) {
      throw new ButtonError('removeNameMismatch');
    }
    // A switch that is on is turned off first, and Gladys must take the 0:
    // its "Off" scenes run, and Gladys never keeps "on" forever.
    // Also a switch already off here whose 0 Gladys may not hold yet (a
    // refused 0 waiting for the sweep, one in flight, a value never sent):
    // the 0 is sent again and must be taken before the button goes.
    const wasOn = isSwitchKind(button.kind) && button.state === 1;
    const mayHoldOn =
      isSwitchKind(button.kind) &&
      this.createdIds().has(button.id) &&
      (wasOn ||
        this.unpublished.has(button.id) ||
        this.inflight.has(button.id) ||
        this.differsFromGladys(button));
    if (mayHoldOn) {
      const sent = wasOn
        ? (await this.setSwitch(button, 0, this.mono())).sent
        : this.publish(button, 0);
      let timer;
      const outcome = sent
        ? await Promise.race([
            sent,
            new Promise((resolve) => {
              timer = this.timers.setTimeout(() => resolve('timeout'), TIMINGS.removeAnswer);
              timer?.unref?.();
            }),
          ])
        : 'ok';
      this.timers.clearTimeout(timer);
      if (outcome !== 'ok') {
        throw new ButtonError('offNotConfirmed');
      }
    }
    const name = await this.run(async () => {
      if (this.buttons.get(button.id) !== button) {
        throw new ButtonError('unknownButton');
      }
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
      this.offs.delete(button.id);
      this.unpublished.delete(button.id);
      this.ended.delete(button.id);
      return button.name;
    });
    this.afterChange();
    return T.removed(name, wasOn && mayHoldOn);
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
    const button = this.buttons.get(id);
    if (button && this.differsFromGladys(button)) {
      // Its first state.
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

  /** The icon preview widget: one page of the icons offered by the forms. */
  async getIconsWidget({ settings = {} } = {}) {
    const raw = settings && Object.hasOwn(settings, 'page') ? settings.page : '1';
    const page = typeof raw === 'string' && /^[1-9][0-9]?$/.test(raw) ? Number(raw) : 1;
    return iconsWidget(Math.min(Math.max(page, 1), ICON_PAGES));
  }

  /**
   * onWidgetAction: a tap on a pill. `values` is the form of a selector of
   * more than 4 positions: the position chosen in its list.
   */
  async widgetAction(actionKey, params, values = null) {
    const received = this.mono();
    await this.ready();
    if (typeof actionKey !== 'string' || !WIDGET_ACTION_KEY.test(actionKey)) {
      throw new ButtonError('unknownButton');
    }
    const has = (key) => params && typeof params === 'object' && Object.hasOwn(params, key);
    const id = has('id') ? params.id : null;
    const button = isId(id) ? this.buttons.get(id) : null;
    if (!button) {
      throw new ButtonError('unknownButton');
    }
    // The value the card asked for (decided on the state it showed), never a toggle.
    const value = has('value') ? params.value : null;
    if (button.kind === KINDS.SELECTOR) {
      let position;
      if (has('value')) {
        position = toPosition(value, button);
      } else {
        // The pill of a long selector: the list of the form (validated by
        // the core against the options this card showed), checked again.
        const chosen =
          values && typeof values === 'object' && Object.hasOwn(values, WIDGET_POSITION_FIELD)
            ? values[WIDGET_POSITION_FIELD]
            : undefined;
        if (chosen === undefined) {
          throw new ButtonError('positionNotChosen');
        }
        position = positionOfText(chosen, button);
      }
      if (position === null) {
        throw new ButtonError('badPosition');
      }
      const { before } = await this.setPosition(button, position, received);
      const label = button.positions[position - 1] ?? String(position);
      return before === position
        ? T.alreadyPosition(button.name, label)
        : T.positionSet(button.name, label);
    }
    if (value !== 0 && value !== 1) {
      throw new ButtonError('badValue');
    }
    if (!isSwitchKind(button.kind)) {
      if (value !== 1) {
        throw new ButtonError('badValue');
      }
      const outcome = await this.press(button, received);
      return outcome === 'ok' ? T.pressed(button.name) : T.pressedUnconfirmed(button.name);
    }
    const { before } = await this.setSwitch(button, value, received);
    if (value === 0) {
      return before === 0 ? T.alreadyOff(button.name) : T.switchedOff(button.name);
    }
    if (before === 1) {
      return button.kind === KINDS.TIMED
        ? T.alreadyOnRestarted(button.name, button.minutes)
        : T.alreadyOn(button.name);
    }
    return button.kind === KINDS.TIMED
      ? T.switchedOnFor(button.name, button.minutes)
      : T.switchedOn(button.name);
  }
}
