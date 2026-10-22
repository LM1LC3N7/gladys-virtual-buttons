// -----------------------------------------------------------------------------
// The integration against the fake Gladys of the SDK (the real client, an
// in-memory Gladys), a store in memory and a clock moved by hand.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ButtonsApp } from '../src/app.js';
import { registerHandlers } from '../src/handlers.js';
import { ACTIONS, LIMITS, WIDGETS } from '../src/constants.js';
import { MemoryStore } from '../src/store.js';
import { createClock } from './helpers/clock.js';

const silent = createLogger({ level: 'silent' });

async function setup({ store = new MemoryStore(), clock = createClock(), devices = [] } = {}) {
  const gladys = createFakeGladys({ devices });
  const app = new ButtonsApp({
    gladys,
    store,
    now: clock.now,
    timers: clock.timers,
    logger: silent,
  });
  registerHandlers(gladys, app, silent);
  await gladys.connect();
  await clock.settle();
  const add = (fields) => gladys.fake.action(ACTIONS.ADD, fields);
  const discovered = (name) => gladys.fake.discoveredDevices.find((d) => d.name === name);
  const create = async (name) => {
    const device = discovered(name);
    assert.ok(device, `${name} is in Discovery`);
    await gladys.fake.deviceCreated(device);
    await clock.settle();
    return device;
  };
  const states = (feature) =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === feature).map((s) => s.state);
  return { gladys, app, store, clock, add, discovered, create, states };
}

test('a push button: in Discovery, then one press = 1 then 0', async () => {
  const t = await setup();
  const ack = await t.add({
    name: 'Chauffage 30 min',
    kind: 'push',
    icon: 'flame',
    style: 'danger',
    confirm: 'yes',
  });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Découverte/);
  const device = t.discovered('Chauffage 30 min');
  assert.match(device.external_id, /^ext:test-integration:button:b[0-9a-f]{12}$/);
  assert.deepEqual(
    device.features.map((f) => [f.category, f.type, f.read_only, f.has_feedback, f.min, f.max]),
    [['button', 'push', false, true, 0, 1]],
  );
  assert.equal(device.features[0].external_id, `${device.external_id}:press`);
  const params = Object.fromEntries(device.params.map((p) => [p.name, p.value]));
  assert.deepEqual(params, {
    VB_KIND: 'push',
    VB_LABEL: 'Chauffage 30 min',
    VB_ICON: 'flame',
    VB_STYLE: 'danger',
    VB_CONFIRM: 'true',
    VB_MINUTES: '30',
  });

  await t.create('Chauffage 30 min');
  const feature = device.features[0];
  const before = t.states(feature.external_id).length;
  const result = await t.gladys.fake.setValue(device, feature, 1);
  assert.deepEqual(result, { success: true });
  await t.clock.settle();
  assert.deepEqual(t.states(feature.external_id).slice(before), [1]);
  await t.clock.advance(1000);
  assert.deepEqual(t.states(feature.external_id).slice(before), [1, 0]);
  // 0 on a push button: nothing happens.
  await t.gladys.fake.setValue(device, feature, 0);
  await t.clock.advance(2000);
  assert.deepEqual(t.states(feature.external_id).slice(before), [1, 0]);
});

test('a switch: state saved in /data before the ack, published, strict values', async () => {
  const t = await setup();
  await t.add({ name: 'Mode nuit', kind: 'switch', icon: 'moon' });
  const device = await t.create('Mode nuit');
  const feature = device.features[0];
  assert.deepEqual([feature.category, feature.type], ['switch', 'binary']);
  assert.equal(feature.external_id, `${device.external_id}:state`);

  assert.deepEqual(await t.gladys.fake.setValue(device, feature, 1), { success: true });
  assert.equal(t.store.data.buttons[0].state, 1);
  await t.clock.settle();
  assert.equal(t.gladys.fake.lastState(feature.external_id), 1);
  for (const bad of ['1', null, '', 2, -1, 0.5, Number.NaN]) {
    const ack = await t.gladys.fake.setValue(device, feature, bad);
    assert.equal(ack.success, false, `value ${String(bad)}`);
  }
  assert.equal(t.store.data.buttons[0].state, 1);
  await t.gladys.fake.setValue(device, feature, 0);
  assert.equal(t.store.data.buttons[0].state, 0);
  // A feature id that is not this button's.
  const ack = await t.gladys.fake.setValue(
    device,
    { ...feature, external_id: `${device.external_id}:press` },
    1,
  );
  assert.equal(ack.success, false);
});

test('a timed switch goes back to off on time, and the end is kept in /data', async () => {
  const t = await setup();
  await t.add({ name: 'Chauffe-eau', kind: 'timed', minutes: 10, icon: 'droplet' });
  const device = await t.create('Chauffe-eau');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, 1);
  const saved = t.store.data.buttons[0];
  assert.equal(saved.state, 1);
  assert.equal(saved.until, t.clock.now() + 10 * 60 * 1000);
  await t.clock.advance(9 * 60 * 1000);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 1);
  // On again: the delay starts over.
  await t.gladys.fake.setValue(device, feature, 1);
  await t.clock.advance(9 * 60 * 1000);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 1);
  await t.clock.advance(60 * 1000);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 0);
  assert.equal(t.store.data.buttons[0].state, 0);
  assert.equal(t.store.data.buttons[0].until, null);
});

test('after a restart: an end passed turns off at once, an end to come keeps its timer', async () => {
  const clock = createClock();
  const t = await setup({ clock });
  await t.add({ name: 'Arrosage', kind: 'timed', minutes: 5 });
  await t.add({ name: 'Ventilation', kind: 'timed', minutes: 60 });
  const water = await t.create('Arrosage');
  const fan = await t.create('Ventilation');
  await t.gladys.fake.setValue(water, water.features[0], 1);
  await t.gladys.fake.setValue(fan, fan.features[0], 1);
  await t.app.stop();
  await t.gladys.disconnect();

  // The container was stopped 20 minutes.
  clock.set(clock.now() + 20 * 60 * 1000);
  const again = await setup({ store: t.store, clock, devices: [water, fan] });
  const byName = (name) => again.store.data.buttons.find((b) => b.name === name);
  assert.equal(byName('Arrosage').state, 0);
  assert.equal(again.gladys.fake.lastState(water.features[0].external_id), 0);
  assert.equal(byName('Ventilation').state, 1);
  assert.equal(again.gladys.fake.lastState(fan.features[0].external_id), 1);
  await clock.advance(39 * 60 * 1000);
  assert.equal(byName('Ventilation').state, 1);
  await clock.advance(61 * 1000);
  assert.equal(byName('Ventilation').state, 0);
  assert.equal(again.gladys.fake.lastState(fan.features[0].external_id), 0);
});

test('a timer is never lost: the sweep catches a clock moved forward', async () => {
  const t = await setup();
  await t.add({ name: 'Sieste', kind: 'timed', minutes: 30 });
  const device = await t.create('Sieste');
  await t.gladys.fake.setValue(device, device.features[0], 1);
  // The wall clock jumps (NTP, suspend): the next sweep sees the end passed.
  t.clock.set(t.clock.now() + 31 * 60 * 1000);
  await t.clock.advance(30 * 1000);
  assert.equal(t.gladys.fake.lastState(device.features[0].external_id), 0);
});

test('a switch "on" that cannot be saved is refused; "off" never is', async () => {
  const t = await setup();
  await t.add({ name: 'Portail', kind: 'switch' });
  const device = await t.create('Portail');
  const feature = device.features[0];
  t.store.fail = true;
  const on = await t.gladys.fake.setValue(device, feature, 1);
  assert.equal(on.success, false);
  assert.match(on.error, /enregistré/);
  t.store.fail = false;
  await t.gladys.fake.setValue(device, feature, 1);
  t.store.fail = true;
  const off = await t.gladys.fake.setValue(device, feature, 0);
  assert.equal(off.success, true);
  t.store.fail = false;
  await t.clock.advance(30 * 1000);
  assert.equal(t.store.data.buttons[0].state, 0, 'saved again by the sweep');
});

test('a scene that presses its own button in a loop is stopped', async () => {
  const t = await setup();
  await t.add({ name: 'Boucle' });
  const device = await t.create('Boucle');
  const feature = device.features[0];
  for (let i = 0; i < LIMITS.pressesPerButton; i += 1) {
    assert.equal((await t.gladys.fake.setValue(device, feature, 1)).success, true);
  }
  const refused = await t.gladys.fake.setValue(device, feature, 1);
  assert.equal(refused.success, false);
  assert.match(refused.error, /une minute/);
  await t.clock.advance(61 * 1000);
  assert.equal((await t.gladys.fake.setValue(device, feature, 1)).success, true);
});

test('names are cleaned and bounded, unique, and at most 100 buttons', async () => {
  const t = await setup();
  const ack = await t.add({ name: `  Salon\u0000\n‮  ${'x'.repeat(80)}  ` });
  assert.equal(ack.success, true);
  const [device] = t.gladys.fake.discoveredDevices;
  assert.equal(device.name, `Salon ${'x'.repeat(34)}`);
  assert.equal(device.name.length, LIMITS.name);
  assert.equal((await t.add({ name: ' \u0007 ' })).success, false);
  assert.equal((await t.add({ name: 'Été' })).success, true);
  const duplicate = await t.add({ name: 'ete' });
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /déjà/);
  for (const [field, value] of [
    ['kind', 'light'],
    ['icon', 'skull'],
    ['style', 'pink'],
    ['confirm', 'maybe'],
    ['minutes', 0],
    ['minutes', 1441],
    ['minutes', 2.5],
  ]) {
    assert.equal(
      (await t.add({ name: `Test ${field} ${value}`, [field]: value })).success,
      false,
      field,
    );
  }
  assert.equal((await t.add({ name: '__proto__' })).success, true);
  assert.equal({}.kind, undefined, 'no prototype pollution');
  for (let i = t.app.buttons.size; i < LIMITS.buttons; i += 1) {
    assert.equal((await t.add({ name: `Bouton ${i}` })).success, true);
  }
  const tooMany = await t.add({ name: 'Un de trop' });
  assert.equal(tooMany.success, false);
  assert.match(tooMany.error, /100/);
  assert.equal(t.gladys.fake.discoveredDevices.length, LIMITS.buttons);
  // Every category is a button or a switch, never a light.
  for (const d of t.gladys.fake.discoveredDevices) {
    assert.ok(['button', 'switch'].includes(d.features[0].category));
  }
});

test('change a button by its device or by its name; the type and the ids never change', async () => {
  const t = await setup();
  await t.add({ name: 'Cinéma', kind: 'switch', icon: 'film' });
  const before = t.discovered('Cinéma');
  const edited = await t.gladys.fake.action(ACTIONS.EDIT, {
    current_name: 'cinema',
    name: 'Soirée film',
    icon: 'tv',
    style: 'danger',
    confirm: 'yes',
    kind: 'push',
  });
  assert.equal(edited.success, true);
  const after = t.gladys.fake.discoveredDevices[0];
  assert.equal(after.external_id, before.external_id);
  assert.equal(after.features[0].external_id, before.features[0].external_id);
  assert.equal(after.features[0].category, 'switch');
  const params = Object.fromEntries(after.params.map((p) => [p.name, p.value]));
  assert.equal(params.VB_ICON, 'tv');
  assert.equal(params.VB_LABEL, 'Soirée film');
  assert.equal(params.VB_CONFIRM, 'true');
  const empty = await t.gladys.fake.action(ACTIONS.EDIT, { button: before.external_id });
  assert.equal(empty.success, false);
  const unknown = await t.gladys.fake.action(ACTIONS.EDIT, { current_name: 'Nope', icon: 'sun' });
  assert.match(unknown.error, /Aucun bouton/);
  const missing = await t.gladys.fake.action(ACTIONS.EDIT, { icon: 'sun' });
  assert.equal(missing.success, false);
});

test('remove a button: gone from Discovery, its device refused, never brought back', async () => {
  const t = await setup();
  await t.add({ name: 'Alarme', kind: 'push' });
  await t.add({ name: 'Garde', kind: 'switch' });
  const device = await t.create('Alarme');
  const removed = await t.gladys.fake.action(ACTIONS.REMOVE, { button: device.external_id });
  assert.equal(removed.success, true);
  assert.deepEqual(
    t.gladys.fake.discoveredDevices.map((d) => d.name),
    ['Garde'],
  );
  const press = await t.gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(press.success, false);
  assert.match(press.error, /supprimez son appareil/);
  // A reconnection with the device still in Gladys does not bring it back.
  await t.gladys.disconnect();
  await t.gladys.connect();
  await t.clock.settle();
  assert.equal(t.app.buttons.size, 1);
  assert.deepEqual(t.store.data.removed.length, 1);
});

test('/data lost: the buttons come back from the devices Gladys kept', async () => {
  const first = await setup();
  await first.add({
    name: 'Chauffage',
    kind: 'timed',
    minutes: 45,
    icon: 'flame',
    style: 'danger',
  });
  const device = await first.create('Chauffage');
  await first.app.stop();

  const again = await setup({ devices: [device] });
  const [button] = again.store.data.buttons;
  assert.equal(button.name, 'Chauffage');
  assert.equal(button.kind, 'timed');
  assert.equal(button.minutes, 45);
  assert.equal(button.icon, 'flame');
  assert.equal(button.style, 'danger');
  assert.equal(button.state, 0);
  assert.equal(again.gladys.fake.discoveredDevices[0].external_id, device.external_id);
});

test('every connection publishes Discovery, the status and the states again', async () => {
  const t = await setup();
  await t.add({ name: 'Lecture', kind: 'switch' });
  const device = await t.create('Lecture');
  await t.gladys.fake.setValue(device, device.features[0], 1);
  await t.clock.settle();
  const discoveries = t.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  const statuses = t.gladys.fake.connectionStatuses.length;
  const count = t.states(device.features[0].external_id).length;
  await t.gladys.disconnect();
  await t.gladys.connect();
  await t.clock.settle();
  assert.equal(
    t.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length,
    discoveries + 1,
  );
  assert.equal(t.gladys.fake.connectionStatuses.length, statuses + 1);
  assert.match(t.gladys.fake.connectionStatus.message.fr, /1 bouton\(s\), dont 1 créé/);
  assert.deepEqual(t.states(device.features[0].external_id).slice(count), [1]);
});

test('a state Gladys refused is sent again, a push "1" never late', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Volet', kind: 'switch', icon: 'blinds' });
  await t.add({ name: 'Sonnette', kind: 'push', icon: 'bell' });
  const blinds = await t.create('Volet');
  const bell = await t.create('Sonnette');
  const original = t.gladys.publishState.bind(t.gladys);
  const mock = ctx.mock.method(t.gladys, 'publishState', async () => {
    throw new Error('429');
  });
  await t.gladys.fake.setValue(blinds, blinds.features[0], 1);
  await t.gladys.fake.setValue(bell, bell.features[0], 1);
  await t.clock.advance(2000);
  mock.mock.restore();
  assert.equal(typeof original, 'function');
  const before = t.states(bell.features[0].external_id).length;
  await t.clock.advance(30 * 1000);
  assert.equal(t.gladys.fake.lastState(blinds.features[0].external_id), 1);
  assert.deepEqual(t.states(bell.features[0].external_id).slice(before), [0]);
});

test('the widget: up to 4 pills, icon, label, style, confirmation, switch state', async () => {
  const t = await setup();
  await t.add({
    name: 'Chauffage salon et cuisine',
    kind: 'timed',
    minutes: 20,
    icon: 'flame',
    style: 'secondary',
  });
  await t.add({
    name: 'Portail',
    kind: 'push',
    icon: 'door-open',
    style: 'danger',
    confirm: 'yes',
  });
  await t.add({ name: 'Nuit', kind: 'switch', icon: 'moon' });
  const heating = await t.create('Chauffage salon et cuisine');
  const gate = await t.create('Portail');
  const night = await t.create('Nuit');
  const settings = {
    button_1: heating.external_id,
    button_2: gate.external_id,
    button_3: night.external_id,
    button_4: night.external_id,
  };
  let ack = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, { settings });
  assert.equal(ack.success, true);
  let content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  let pills = content.components.filter((c) => c.type === 'button');
  assert.equal(pills.length, 3, 'a button chosen twice is shown once');
  assert.deepEqual(
    pills.map((p) => [p.label, p.icon, p.style, p.action.key, p.action.confirm ?? false]),
    [
      ['Chauffage salon et cuis…', 'flame', 'secondary', 'press_1', false],
      ['Portail', 'door-open', 'danger', 'press_2', true],
      ['Nuit', 'moon', 'secondary', 'press_3', false],
    ],
  );

  // Taps: the timed switch turns on, the push button pulses.
  const tap = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_1', pills[0].action.params, {
    settings,
  });
  assert.equal(tap.success, true);
  assert.match(tap.data.message.fr, /retour à l'arrêt dans 20 min/);
  await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_2', pills[1].action.params, {
    settings,
  });
  await t.clock.settle();
  assert.equal(t.gladys.fake.lastState(gate.features[0].external_id), 1);
  assert.ok(t.gladys.fake.widgetRefreshes.includes(WIDGETS.BUTTONS));

  ack = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, { settings });
  content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  pills = content.components.filter((c) => c.type === 'button');
  assert.equal(pills[0].style, 'primary', 'a switch that is on is tinted');
  const caption = content.components.find((c) => c.type === 'text');
  assert.match(caption.text.fr, /encore 20 min/);
  assert.equal(content.ttl_seconds, 15);

  // Tap again: off.
  const off = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_1', pills[0].action.params, {
    settings,
  });
  assert.match(off.data.message.en, /off/);
  assert.equal(t.store.data.buttons[0].state, 0);

  // Forged or stale taps.
  for (const [key, params] of [
    ['press_9', pills[0].action.params],
    ['press_1', { id: 'b000000000000' }],
    ['press_1', { id: { toString: () => 'x' } }],
    ['press_1', null],
  ]) {
    const refused = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, key, params ?? {}, {
      settings,
    });
    assert.equal(refused.success, false);
  }
});

test('the widget empty states are valid contents', async () => {
  const t = await setup();
  const empty = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, { settings: {} });
  assert.deepEqual(validateWidgetContent(empty.data.content), []);
  assert.match(empty.data.content.components[0].text.fr, /Aucun bouton choisi/);
  const gone = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, {
    settings: { button_1: 'ext:test-integration:button:b0123456789ab' },
  });
  assert.match(gone.data.content.components[0].text.fr, /supprimés/);
});

test('the states stay within the budget of the host API', async () => {
  const t = await setup();
  for (let i = 0; i < 30; i += 1) {
    await t.add({ name: `B${i}` });
    await t.create(`B${i}`);
  }
  const start = t.gladys.fake.states.length;
  let refused = 0;
  for (const device of t.gladys.fake.devices) {
    for (let i = 0; i < 6; i += 1) {
      const ack = await t.gladys.fake.setValue(device, device.features[0], 1);
      if (!ack.success) {
        refused += 1;
      }
    }
  }
  await t.clock.advance(2000);
  const sent = t.gladys.fake.states.length - start;
  assert.ok(sent <= LIMITS.statesPerMinute, `${sent} states in a minute`);
  assert.ok(refused > 0);
});
