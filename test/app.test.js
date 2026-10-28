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
import { ACTIONS, ICON_PAGES, ICONS, LIMITS, WIDGETS } from '../src/constants.js';
import { ICON_LABELS } from '../src/i18n.js';
import { MemoryStore } from '../src/store.js';
import { createClock } from './helpers/clock.js';

const silent = createLogger({ level: 'silent' });

/** What the real "Change a button" form sends when nothing is touched. */
const EDIT_FORM = { name: '', minutes: 0, icon: 'keep', style: 'keep', confirm: 'keep' };

async function setup({ store = new MemoryStore(), clock = createClock(), devices = [] } = {}) {
  const gladys = createFakeGladys({ devices });
  const app = new ButtonsApp({
    gladys,
    store,
    now: clock.now,
    mono: clock.mono,
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
  const idOf = (device) => device.external_id.split(':').pop();
  /** Gladys as it would be read back: the last state of each feature in last_value. */
  const withLastValues = (devices) =>
    devices.map((d) => ({
      ...d,
      features: d.features.map((f) => ({
        ...f,
        last_value: gladys.fake.lastState(f.external_id) ?? null,
      })),
    }));
  return { gladys, app, store, clock, add, discovered, create, states, idOf, withLastValues };
}

/** A publication that hangs until released (a slow host API). */
function hold(ctx, gladys) {
  const original = gladys.publishStates.bind(gladys);
  const waiting = [];
  ctx.mock.method(gladys, 'publishStates', async (states) => {
    await new Promise((resolve) => waiting.push(resolve));
    return original(states);
  });
  return () => {
    ctx.mock.restoreAll();
    for (const resolve of waiting.splice(0)) {
      resolve();
    }
  };
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
  assert.match(ack.data.message.fr, /« Ajouter à Gladys »/);
  assert.match(ack.data.message.en, /"Add to Gladys"/);
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

test('a timed switch goes back to off on time, "on" again restarts it without a new 1', async () => {
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
  const ones = t.states(feature.external_id).filter((v) => v === 1).length;
  // On again: the delay starts over, Gladys already holds 1.
  await t.gladys.fake.setValue(device, feature, 1);
  assert.equal(t.states(feature.external_id).filter((v) => v === 1).length, ones);
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
  const devices = t.withLastValues([water, fan]);
  await t.app.stop();
  await t.gladys.disconnect();

  // The container was stopped 20 minutes.
  clock.set(clock.now() + 20 * 60 * 1000);
  const again = await setup({ store: t.store, clock, devices });
  const byName = (name) => again.store.data.buttons.find((b) => b.name === name);
  assert.equal(byName('Arrosage').state, 0);
  assert.deepEqual(again.states(water.features[0].external_id), [0]);
  assert.equal(byName('Ventilation').state, 1);
  assert.deepEqual(again.states(fan.features[0].external_id), [], 'Gladys holds 1 already');
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
  t.clock.jump(31 * 60 * 1000);
  await t.clock.advance(30 * 1000);
  assert.equal(t.gladys.fake.lastState(device.features[0].external_id), 0);
});

test('S3: the wall clock stepped back 2 h: a 30 min timed switch still ends after 30 min', async () => {
  const t = await setup();
  await t.add({ name: 'Chauffage', kind: 'timed', minutes: 30 });
  const device = await t.create('Chauffage');
  await t.gladys.fake.setValue(device, device.features[0], 1);
  await t.clock.advance(60 * 1000);
  t.clock.jump(-2 * 3600 * 1000);
  await t.clock.advance(29 * 60 * 1000);
  assert.equal(t.app.buttons.get(t.idOf(device)).state, 0);
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

test('S2: an "off" is never held behind a slow publication', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Chauffage', kind: 'timed', minutes: 1 });
  await t.add({ name: 'Mode nuit', kind: 'switch' });
  const timed = await t.create('Chauffage');
  const sw = await t.create('Mode nuit');
  await t.gladys.fake.setValue(timed, timed.features[0], 1);
  await t.gladys.fake.setValue(sw, sw.features[0], 1);
  const release = hold(ctx, t.gladys);
  await t.clock.advance(60 * 1000); // the timed switch ends; its 0 hangs
  const ack = await t.gladys.fake.setValue(sw, sw.features[0], 0);
  assert.equal(ack.success, true, 'acknowledged while the publication hangs');
  assert.equal(t.app.buttons.get(t.idOf(sw)).state, 0);
  release();
  await t.clock.settle();
  assert.equal(t.gladys.fake.lastState(sw.features[0].external_id), 0);
});

test('S2b: an "on" or a press applied after 3.5 s is refused, nothing sent; an "off" is applied', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Portail', kind: 'switch' });
  await t.add({ name: 'Ciné', kind: 'push' });
  const sw = await t.create('Portail');
  const push = await t.create('Ciné');
  // /data is slow: the queue is held 20 s by an action saving the list.
  let releaseSave;
  const save = t.store.save.bind(t.store);
  const slowOnce = () => {
    t.store.save = async (data) => {
      t.store.save = save;
      await new Promise((resolve) => (releaseSave = resolve));
      return save(data);
    };
  };
  slowOnce();
  const adding = t.add({ name: 'Autre' });
  while (!releaseSave) {
    await t.clock.settle();
  }
  const on = t.gladys.fake.setValue(sw, sw.features[0], 1);
  await t.clock.advance(20 * 1000);
  releaseSave();
  await adding;
  const late = await on;
  assert.equal(late.success, false);
  assert.match(late.error, /trop tard/);
  assert.equal(t.app.buttons.get(t.idOf(sw)).state, 0);
  assert.deepEqual(t.states(sw.features[0].external_id), [0], 'only its first state');

  // A press whose 1 waits behind a hanging publication: refused, never sent later.
  const release = hold(ctx, t.gladys);
  await t.gladys.fake.setValue(sw, sw.features[0], 1); // its 1 hangs
  const press = t.gladys.fake.setValue(push, push.features[0], 1);
  await t.clock.advance(5000);
  const refused = await press;
  assert.equal(refused.success, false);
  assert.match(refused.error, /trop tard/);
  release();
  await t.clock.advance(5000);
  assert.deepEqual(t.states(push.features[0].external_id), [0], 'no late 1');

  // An "off" always applies, however late.
  assert.equal(t.app.buttons.get(t.idOf(sw)).state, 1);
  releaseSave = null;
  slowOnce();
  const adding2 = t.add({ name: 'Encore' });
  while (!releaseSave) {
    await t.clock.settle();
  }
  const off = t.gladys.fake.setValue(sw, sw.features[0], 0);
  await t.clock.advance(20 * 1000);
  releaseSave();
  await adding2;
  assert.equal((await off).success, true);
  assert.equal(t.app.buttons.get(t.idOf(sw)).state, 0);
});

test('S7: a press Gladys refused is "not sent", never "pressed", never sent again', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Ciné', kind: 'push' });
  const device = await t.create('Ciné');
  ctx.mock.method(t.gladys, 'publishStates', async () => {
    throw new Error('429');
  });
  const tap = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_1', {
    id: t.idOf(device),
    value: 1,
  });
  assert.equal(tap.success, false);
  assert.match(tap.error, /rien envoyé/);
  ctx.mock.restoreAll();
  await t.clock.advance(60 * 1000);
  assert.deepEqual(t.states(device.features[0].external_id), [0], 'only its first state');
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

test('S11: a scene "X = Off -> turn X off" does not loop, and "off" is never refused', async () => {
  const t = await setup();
  await t.add({ name: 'Mode nuit', kind: 'switch' });
  const device = await t.create('Mode nuit');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, 1);
  const count = () => t.states(feature.external_id).length;
  await t.gladys.fake.setValue(device, feature, 0);
  const after = count();
  for (let i = 0; i < 50; i += 1) {
    assert.equal((await t.gladys.fake.setValue(device, feature, 0)).success, true);
  }
  await t.clock.advance(60 * 1000);
  assert.equal(count(), after, 'an "off" of a switch already off publishes nothing');
  // Same for "on" of a plain switch already on.
  await t.gladys.fake.setValue(device, feature, 1);
  const on = count();
  await t.gladys.fake.setValue(device, feature, 1);
  assert.equal(count(), on);
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
    ['icon', 'keep'],
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

test('change a button: "Unchanged" by default, the message lists the changes, ids never change', async () => {
  const t = await setup();
  await t.add({ name: 'Cinéma', kind: 'switch', icon: 'film' });
  const before = t.discovered('Cinéma');
  const untouched = await t.gladys.fake.action(ACTIONS.EDIT, {
    ...EDIT_FORM,
    current_name: 'cinema',
  });
  assert.equal(untouched.success, false);
  assert.match(untouched.error, /Inchangé/);
  const edited = await t.gladys.fake.action(ACTIONS.EDIT, {
    ...EDIT_FORM,
    current_name: 'cinema',
    name: 'Soirée film',
    icon: 'tv',
    confirm: 'yes',
    kind: 'push',
  });
  assert.equal(edited.success, true);
  assert.match(
    edited.data.message.fr,
    /nom : Soirée film ; icône : Télévision ; couleur : inchangé/,
  );
  assert.match(edited.data.message.fr, /confirmation : oui ; durée : inchangé/);
  const after = t.gladys.fake.discoveredDevices[0];
  assert.equal(after.external_id, before.external_id);
  assert.equal(after.features[0].external_id, before.features[0].external_id);
  assert.equal(after.features[0].category, 'switch');
  const params = Object.fromEntries(after.params.map((p) => [p.name, p.value]));
  assert.equal(params.VB_ICON, 'tv');
  assert.equal(params.VB_STYLE, 'primary');
  assert.equal(params.VB_LABEL, 'Soirée film');
  assert.equal(params.VB_CONFIRM, 'true');
  assert.equal(params.VB_MINUTES, '30');
  const unknown = await t.gladys.fake.action(ACTIONS.EDIT, {
    ...EDIT_FORM,
    current_name: 'Nope',
    icon: 'sun',
  });
  assert.match(unknown.error, /Aucun bouton/);
  const missing = await t.gladys.fake.action(ACTIONS.EDIT, { ...EDIT_FORM, icon: 'sun' });
  assert.equal(missing.success, false);
});

test('S10: the values a form kept are never carried silently to another button', async () => {
  const t = await setup();
  await t.add({ name: 'A' });
  await t.add({ name: 'B' });
  const form = { ...EDIT_FORM, icon: 'flame', style: 'danger' };
  assert.equal(
    (await t.gladys.fake.action(ACTIONS.EDIT, { ...form, current_name: 'A' })).success,
    true,
  );
  // The user picks B, the form still says flame / danger.
  const kept = await t.gladys.fake.action(ACTIONS.EDIT, { ...form, current_name: 'B' });
  assert.equal(kept.success, false);
  assert.match(kept.error, /Rechargez la page/);
  const b = () => [...t.app.buttons.values()].find((x) => x.name === 'B');
  assert.equal(b().icon, 'power');
  // Asked again on purpose: applied.
  assert.equal(
    (await t.gladys.fake.action(ACTIONS.EDIT, { ...form, current_name: 'B' })).success,
    true,
  );
  assert.equal(b().icon, 'flame');
});

test('remove a button: name typed to confirm, gone from Discovery, never brought back', async () => {
  const t = await setup();
  await t.add({ name: 'Alarme', kind: 'push' });
  await t.add({ name: 'Garde', kind: 'switch' });
  const device = await t.create('Alarme');
  const noName = await t.gladys.fake.action(ACTIONS.REMOVE, { button: device.external_id });
  assert.match(noName.error, /définitive/);
  const wrong = await t.gladys.fake.action(ACTIONS.REMOVE, {
    button: device.external_id,
    current_name: 'Garde',
  });
  assert.match(wrong.error, /rien n'est supprimé/);
  assert.equal(t.app.buttons.size, 2);
  const removed = await t.gladys.fake.action(ACTIONS.REMOVE, {
    button: device.external_id,
    current_name: 'alarme',
  });
  assert.equal(removed.success, true);
  assert.match(removed.data.message.fr, /définitivement/);
  assert.deepEqual(
    t.gladys.fake.discoveredDevices.map((d) => d.name),
    ['Garde'],
  );
  const press = await t.gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(press.success, false);
  assert.match(press.error, /supprimez son appareil/);
  await t.gladys.disconnect();
  await t.gladys.connect();
  await t.clock.settle();
  assert.equal(t.app.buttons.size, 1);
  assert.deepEqual(t.store.data.removed.length, 1);
});

test('S4: removing a switch that is on publishes 0 first; refused if Gladys does not take it', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Chauffage', kind: 'timed', minutes: 30 });
  const device = await t.create('Chauffage');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, 1);
  ctx.mock.method(t.gladys, 'publishStates', async () => {
    throw new Error('503');
  });
  const refused = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Chauffage' });
  assert.equal(refused.success, false);
  assert.match(refused.error, /rien n'est supprimé/);
  assert.equal(t.app.buttons.size, 1);
  assert.equal(t.app.buttons.get(t.idOf(device)).state, 0, 'off anyway');
  ctx.mock.restoreAll();
  await t.clock.advance(30 * 1000);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 0, 'sent again by the sweep');

  await t.gladys.fake.setValue(device, feature, 1);
  const removed = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Chauffage' });
  assert.equal(removed.success, true);
  assert.match(removed.data.message.fr, /mis à l'arrêt d'abord/);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 0);
});

test('R1 (R2-S4c): a second "Remove" right after a refused 0 sends the 0 again and waits for it', async (ctx) => {
  const t = await setup();
  await t.add({ name: 'Radiateur', kind: 'switch' });
  const device = await t.create('Radiateur');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, 1);
  ctx.mock.method(t.gladys, 'publishStates', async () => {
    throw new Error('429');
  });
  const first = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Radiateur' });
  assert.equal(first.success, false);
  // Retried at once (before the sweep), Gladys still refusing: nothing removed.
  const second = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Radiateur' });
  assert.equal(second.success, false);
  assert.match(second.error, /rien n'est supprimé/);
  assert.equal(t.app.buttons.size, 1);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 1, 'Gladys still holds 1');
  // Gladys takes states again: the next try sends the 0, then removes.
  ctx.mock.restoreAll();
  const third = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Radiateur' });
  assert.equal(third.success, true);
  assert.equal(t.gladys.fake.lastState(feature.external_id), 0);
  assert.equal(t.app.buttons.size, 0);
});

test('S6: Discovery publications are serialized, the last one has the current list', async (ctx) => {
  const t = await setup();
  const original = t.gladys.publishDiscoveredDevices.bind(t.gladys);
  let releaseFirst;
  let calls = 0;
  ctx.mock.method(t.gladys, 'publishDiscoveredDevices', async (devices) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => (releaseFirst = resolve));
    }
    return original(devices);
  });
  // A slow Discovery never holds an action.
  assert.equal((await t.add({ name: 'Ciné', kind: 'push' })).success, true);
  const removed = await t.gladys.fake.action(ACTIONS.REMOVE, { current_name: 'Ciné' });
  assert.equal(removed.success, true);
  releaseFirst();
  await t.clock.settle();
  assert.equal(calls, 2);
  assert.deepEqual(t.gladys.fake.discoveredDevices, []);
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
  await first.add({ name: 'Nuit', kind: 'switch' });
  const heating = await first.create('Chauffage');
  const night = await first.create('Nuit');
  await first.gladys.fake.setValue(heating, heating.features[0], 1);
  await first.gladys.fake.setValue(night, night.features[0], 1);
  const devices = first.withLastValues([heating, night]);
  await first.app.stop();

  const again = await setup({ devices });
  const [button, plain] = again.store.data.buttons;
  assert.equal(button.name, 'Chauffage');
  assert.equal(button.kind, 'timed');
  assert.equal(button.minutes, 45);
  assert.equal(button.icon, 'flame');
  assert.equal(button.style, 'danger');
  assert.equal(button.state, 0, 'a timed switch comes back off (its end is unknown)');
  assert.deepEqual(again.states(heating.features[0].external_id), [0]);
  assert.equal(plain.state, 1, 'a plain switch takes back the value of Gladys');
  assert.deepEqual(again.states(night.features[0].external_id), []);
  assert.equal(again.gladys.fake.discoveredDevices[0].external_id, heating.external_id);
});

test('S1: every connection publishes Discovery and status, never a value Gladys holds', async () => {
  const t = await setup();
  await t.add({ name: 'Lecture', kind: 'switch' });
  const device = await t.create('Lecture');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, 1);
  await t.clock.settle();
  const discoveries = t.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  const statuses = t.gladys.fake.connectionStatuses.length;
  const count = t.states(feature.external_id).length;
  for (let i = 0; i < 2; i += 1) {
    await t.gladys.disconnect();
    // What the SDK reads again at the connection: the values Gladys holds.
    t.gladys.fake.devices = t.withLastValues(t.gladys.fake.devices);
    await t.gladys.connect();
    await t.clock.settle();
  }
  assert.equal(
    t.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length,
    discoveries + 2,
  );
  assert.equal(t.gladys.fake.connectionStatuses.length, statuses + 2);
  assert.match(t.gladys.fake.connectionStatus.message.fr, /1 bouton\(s\), dont 1 ajouté/);
  assert.deepEqual(t.states(feature.external_id).slice(count), [], 'no scene started again');

  // A new process (restart): Gladys holds 1 already, nothing is sent; it
  // holds 0 while /data says 1: the 1 is sent.
  await t.app.stop();
  const same = await setup({ store: t.store, devices: t.withLastValues([device]) });
  assert.deepEqual(same.states(feature.external_id), []);
  const stale = t.withLastValues([device]);
  stale[0].features[0].last_value = 0;
  const differ = await setup({ store: t.store, devices: stale });
  assert.deepEqual(differ.states(feature.external_id), [1]);
});

test('S5: the widget sends the value the card showed, never a toggle', async () => {
  const t = await setup();
  await t.add({ name: 'Chauffage', kind: 'timed', minutes: 1 });
  const device = await t.create('Chauffage');
  await t.gladys.fake.setValue(device, device.features[0], 1);
  const shown = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, {
    settings: { button_1: device.external_id },
  });
  const pill = shown.data.content.components.find((c) => c.type === 'button');
  assert.equal(pill.style, 'primary', 'the card shows "on"');
  assert.deepEqual(pill.action.params, { id: t.idOf(device), value: 0 });
  await t.clock.advance(61 * 1000); // the timer ends; the card is still cached
  const tap = await t.gladys.fake.widgetAction(
    WIDGETS.BUTTONS,
    pill.action.key,
    pill.action.params,
  );
  assert.match(tap.data.message.fr, /déjà à l'arrêt/);
  assert.equal(t.app.buttons.get(t.idOf(device)).state, 0);
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
  const tap = (pill) =>
    t.gladys.fake.widgetAction(WIDGETS.BUTTONS, pill.action.key, pill.action.params, { settings });

  const on = await tap(pills[0]);
  assert.equal(on.success, true);
  assert.match(on.data.message.fr, /retour à l'arrêt dans 20 min/);
  const pressed = await tap(pills[1]);
  assert.match(pressed.data.message.fr, /appui pris par Gladys/);
  assert.equal(t.gladys.fake.lastState(gate.features[0].external_id), 1);
  assert.ok(t.gladys.fake.widgetRefreshes.includes(WIDGETS.BUTTONS));
  // The same stale pill tapped again: already on, duration started again.
  const again = await tap(pills[0]);
  assert.match(again.data.message.fr, /déjà en marche, durée relancée/);

  ack = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, { settings });
  content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  pills = content.components.filter((c) => c.type === 'button');
  assert.equal(pills[0].style, 'primary', 'a switch that is on is tinted');
  const caption = content.components.find((c) => c.type === 'text');
  assert.match(caption.text.fr, /encore 20 min/);
  assert.equal(content.ttl_seconds, 15);

  const off = await tap(pills[0]);
  assert.match(off.data.message.en, /off/);
  assert.equal(t.store.data.buttons[0].state, 0);

  // Forged or stale taps.
  for (const [key, params] of [
    ['press_9', pills[0].action.params],
    ['press_1', { id: 'b000000000000', value: 1 }],
    ['press_1', { id: { toString: () => 'x' }, value: 1 }],
    ['press_1', { id: t.idOf(heating) }],
    ['press_1', { id: t.idOf(heating), value: '1' }],
    ['press_2', { id: t.idOf(gate), value: 0 }],
    ['press_1', null],
  ]) {
    const refused = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, key, params ?? {}, {
      settings,
    });
    assert.equal(refused.success, false, JSON.stringify(params));
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

test('M9: the "unreadable list" status is lifted by the first good save', async () => {
  const store = new MemoryStore();
  store.corrupted = true;
  const t = await setup({ store });
  assert.match(t.gladys.fake.connectionStatus.message.fr, /illisible/);
  await t.add({ name: 'A' });
  await t.clock.settle();
  assert.match(t.gladys.fake.connectionStatus.message.fr, /1 bouton\(s\)/);
});

test('M5: a list that cannot be read is never overwritten', async () => {
  const store = new MemoryStore();
  store.unreadable = true;
  const t = await setup({ store });
  assert.match(t.gladys.fake.connectionStatus.message.fr, /ne peut pas être lue/);
  const ack = await t.add({ name: 'A' });
  assert.equal(ack.success, false);
  assert.equal(store.saves, 0);
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

// --- Selectors -------------------------------------------------------------------------

/** Gladys as read back for a selector: the last text in last_value_string. */
const withLastTexts = (t, devices) =>
  devices.map((d) => ({
    ...d,
    features: d.features.map((f) => ({
      ...f,
      last_value_string: t.gladys.fake.lastState(f.external_id) ?? null,
    })),
  }));

const HEATING = { name: 'Chauffage', kind: 'selector', positions: 'Confort, Éco ; Hors-gel,Arrêt' };

test('a selector: a text/select feature, its positions as options, "1" at creation', async () => {
  const t = await setup();
  const ack = await t.add({ ...HEATING, icon: 'flame' });
  assert.equal(ack.success, true);
  const device = await t.create('Chauffage');
  const [feature] = device.features;
  assert.equal(feature.external_id, `${device.external_id}:position`);
  assert.deepEqual([feature.category, feature.type, feature.read_only], ['text', 'select', false]);
  assert.deepEqual(feature.supported_options, [
    { value: '1', label: 'Confort', sort_order: 0 },
    { value: '2', label: 'Éco', sort_order: 1 },
    { value: '3', label: 'Hors-gel', sort_order: 2 },
    { value: '4', label: 'Arrêt', sort_order: 3 },
  ]);
  assert.deepEqual(
    device.params.find((p) => p.name === 'VB_POSITIONS'),
    { name: 'VB_POSITIONS', value: '["Confort","Éco","Hors-gel","Arrêt"]' },
  );
  assert.deepEqual(t.states(feature.external_id), [undefined]);
  assert.equal(t.gladys.fake.lastState(feature.external_id), '1');
  assert.equal(t.store.data.buttons[0].state, 1);

  // A position from Gladys (device box, scene, voice): the text of an option.
  assert.deepEqual(await t.gladys.fake.setValue(device, feature, '3'), { success: true });
  assert.equal(t.store.data.buttons[0].state, 3, 'saved before the ack');
  await t.clock.settle();
  assert.equal(t.gladys.fake.lastState(feature.external_id), '3');
  for (const bad of [3, '0', '5', '03', ' 3', 'Éco', '', null, 1, true]) {
    const refused = await t.gladys.fake.setValue(device, feature, bad);
    assert.equal(refused.success, false, `value ${String(bad)}`);
    assert.match(refused.error, /position/);
  }
  assert.equal(t.store.data.buttons[0].state, 3);
  // The position Gladys holds: nothing published (no "= Hors-gel" loop).
  const count = t.gladys.fake.states.length;
  assert.deepEqual(await t.gladys.fake.setValue(device, feature, '3'), { success: true });
  await t.clock.settle();
  assert.equal(t.gladys.fake.states.length, count);
});

test('a selector: types and positions are checked, a push ignores them', async () => {
  const t = await setup();
  for (const [positions, error] of [
    [undefined, /2 à 4 positions/],
    ['', /2 à 4 positions/],
    ['Seul', /2 à 4 positions/],
    ['A, B, C, D, E', /2 à 4 positions/],
    [' , ;  ', /2 à 4 positions/],
    ['Éco, eco', /même nom/],
  ]) {
    const ack = await t.add({ name: `S ${String(positions)}`, kind: 'selector', positions });
    assert.equal(ack.success, false, String(positions));
    assert.match(ack.error, error);
  }
  assert.equal(t.app.buttons.size, 0);
  // Names cleaned and cut to 20 characters; empty items dropped.
  await t.add({
    name: 'Volets',
    kind: 'selector',
    positions: 'Ouverts,, Mi-hauteur pour la sieste du chat ,Fermés',
  });
  assert.deepEqual(t.store.data.buttons[0].positions, [
    'Ouverts',
    'Mi-hauteur pour la s',
    'Fermés',
  ]);
  // The form sends the field for every type: a push ignores it.
  await t.add({ name: 'Ciné', kind: 'push', positions: 'A, B' });
  assert.equal(t.store.data.buttons[1].positions, undefined);
  assert.equal(
    t.gladys.fake.discoveredDevices[1].params.some((p) => p.name === 'VB_POSITIONS'),
    false,
  );
});

test('a selector: late, flooded or unsaved changes are refused, nothing sent', async () => {
  const t = await setup();
  await t.add(HEATING);
  const device = await t.create('Chauffage');
  const [feature] = device.features;
  const id = t.idOf(device);
  // Unsaved: refused, the position stays.
  t.store.fail = true;
  const unsaved = await t.gladys.fake.setValue(device, feature, '2');
  assert.equal(unsaved.success, false);
  assert.match(unsaved.error, /enregistré/);
  assert.equal(t.app.buttons.get(id).state, 1);
  t.store.fail = false;
  await t.clock.settle();
  assert.deepEqual(t.states(feature.external_id), [undefined], 'only its first state');

  // Late: the queue is held 20 s by an action saving the list.
  let releaseSave;
  const save = t.store.save.bind(t.store);
  t.store.save = async (data) => {
    t.store.save = save;
    await new Promise((resolve) => (releaseSave = resolve));
    return save(data);
  };
  const adding = t.add({ name: 'Autre' });
  while (!releaseSave) {
    await t.clock.settle();
  }
  const change = t.gladys.fake.setValue(device, feature, '2');
  await t.clock.advance(20 * 1000);
  releaseSave();
  await adding;
  const late = await change;
  assert.equal(late.success, false);
  assert.match(late.error, /trop tard/);
  assert.equal(t.app.buttons.get(id).state, 1);
  assert.equal(t.gladys.fake.lastState(feature.external_id), '1');

  // A scene that switches its own selector in a loop: 20 a minute.
  await t.clock.advance(60 * 1000);
  let refused = null;
  for (let i = 0; i < 25 && !refused; i += 1) {
    const ack = await t.gladys.fake.setValue(device, feature, i % 2 === 0 ? '2' : '1');
    if (!ack.success) {
      refused = { i, ack };
    }
  }
  assert.equal(refused.i, LIMITS.pressesPerButton);
  assert.match(refused.ack.error, /changements de position/);
  await t.clock.advance(61 * 1000);
  assert.equal((await t.gladys.fake.setValue(device, feature, '4')).success, true);
});

test('a selector: a shorter list never removes the current position; renamed in Gladys', async () => {
  const t = await setup();
  await t.add(HEATING);
  await t.add({ name: 'Nuit', kind: 'switch' });
  const device = await t.create('Chauffage');
  await t.gladys.fake.setValue(device, device.features[0], '3');
  const edit = (fields) => t.gladys.fake.action(ACTIONS.EDIT, { ...EDIT_FORM, ...fields });
  let ack = await edit({ button: device.external_id, positions: 'Confort, Éco' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /supprime/);
  assert.deepEqual(t.app.buttons.get(t.idOf(device)).positions.length, 4);
  ack = await edit({ button: device.external_id, positions: 'Confort+, Éco, Hors-gel' });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /positions : Confort\+, Éco, Hors-gel/);
  await t.clock.settle();
  const republished = t.gladys.fake.discoveredDevices.find((d) => d.name === 'Chauffage');
  assert.deepEqual(
    republished.features[0].supported_options.map((o) => [o.value, o.label]),
    [
      ['1', 'Confort+'],
      ['2', 'Éco'],
      ['3', 'Hors-gel'],
    ],
  );
  assert.equal(t.app.buttons.get(t.idOf(device)).state, 3, 'the position keeps its number');
  // A switch has no positions: the field alone changes nothing.
  ack = await edit({ current_name: 'Nuit', positions: 'A, B' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Rien à modifier/);
  assert.equal(t.store.data.buttons[1].positions, undefined);
});

test('a selector: moving or inserting a position is refused, a rename or an addition at the end is not', async () => {
  const t = await setup();
  await t.add(HEATING);
  const device = await t.create('Chauffage');
  const edit = (positions) =>
    t.gladys.fake.action(ACTIONS.EDIT, { ...EDIT_FORM, button: device.external_id, positions });
  const names = () => t.app.buttons.get(t.idOf(device)).positions;
  for (const positions of [
    'Confort, Boost, Éco, Hors-gel',
    'Éco, Confort, Hors-gel, Arrêt',
    'Confort, Hors-gel, Arrêt',
  ]) {
    const ack = await edit(positions);
    assert.equal(ack.success, false, positions);
    assert.match(ack.error, /ni déplacée ni insérée/, positions);
    assert.deepEqual(names(), ['Confort', 'Éco', 'Hors-gel', 'Arrêt'], positions);
  }
  // A rename in place (with a case change) and a position added at the end.
  let ack = await edit('confort, Boost, Hors-gel, Arrêt');
  assert.equal(ack.success, true, ack.error);
  await t.gladys.fake.action(ACTIONS.ADD, {
    name: 'Court',
    kind: 'selector',
    positions: 'A, B, C',
  });
  const short = await t.create('Court');
  ack = await t.gladys.fake.action(ACTIONS.EDIT, {
    ...EDIT_FORM,
    button: short.external_id,
    positions: 'A, B, C, D',
  });
  assert.equal(ack.success, true, ack.error);
});

test('a selector: rebuilt from Gladys with the position it holds, nothing republished', async () => {
  const first = await setup();
  await first.add({ ...HEATING, icon: 'heater', style: 'danger', confirm: 'yes' });
  const device = await first.create('Chauffage');
  await first.gladys.fake.setValue(device, device.features[0], '2');
  await first.clock.settle();
  const devices = withLastTexts(first, [device]);
  await first.app.stop();

  // Same /data, Gladys holds "2": nothing sent at the connection.
  const same = await setup({ store: first.store, devices });
  assert.deepEqual(same.states(device.features[0].external_id), []);

  // /data lost: rebuilt from the params, at the position Gladys holds.
  const again = await setup({ devices });
  const [button] = again.store.data.buttons;
  assert.deepEqual(
    [button.kind, button.positions, button.state, button.icon, button.style, button.confirm],
    ['selector', ['Confort', 'Éco', 'Hors-gel', 'Arrêt'], 2, 'heater', 'danger', true],
  );
  assert.deepEqual(again.states(device.features[0].external_id), []);

  // Without the param: the options of the feature; an unknown text: the first.
  const bare = withLastTexts(first, [device]);
  bare[0].params = bare[0].params.filter((p) => p.name !== 'VB_POSITIONS' && p.name !== 'VB_KIND');
  bare[0].features[0].last_value_string = 'Éco';
  const third = await setup({ devices: bare });
  assert.deepEqual(third.store.data.buttons[0].positions, ['Confort', 'Éco', 'Hors-gel', 'Arrêt']);
  assert.equal(third.store.data.buttons[0].state, 1);
  assert.deepEqual(third.states(device.features[0].external_id), [undefined]);
  assert.equal(third.gladys.fake.lastState(device.features[0].external_id), '1');
});

test('a selector in the widget: one pill per position, the current one marked', async () => {
  const t = await setup();
  await t.add({ ...HEATING, icon: 'flame', style: 'secondary', confirm: 'yes' });
  await t.add({ name: 'Ciné', kind: 'push', icon: 'film' });
  await t.add({ name: 'Volets', kind: 'selector', positions: 'Ouverts, Fermés', icon: 'blinds' });
  const heating = await t.create('Chauffage');
  const cine = await t.create('Ciné');
  const blinds = await t.create('Volets');
  await t.gladys.fake.setValue(heating, heating.features[0], '2');
  const get = async (settings) => {
    const ack = await t.gladys.fake.widgetGet(WIDGETS.BUTTONS, { settings });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    return ack.data.content.components;
  };
  let components = await get({ button_1: heating.external_id });
  const pills = components.filter((c) => c.type === 'button');
  assert.deepEqual(
    pills.map((p) => [p.label, p.icon, p.style, p.action.params.value, p.action.confirm]),
    [
      ['Confort', 'flame', 'secondary', 1, true],
      ['Éco', 'check-circle', 'primary', 2, true],
      ['Hors-gel', 'flame', 'secondary', 3, true],
      ['Arrêt', 'flame', 'secondary', 4, true],
    ],
  );
  assert.deepEqual(
    pills.map((p) => p.action.key),
    ['press_1', 'press_2', 'press_3', 'press_4'],
  );
  const [status] = components.filter((c) => c.type === 'status');
  assert.deepEqual(status.items, [
    { label: 'Chauffage', value: 'Éco', icon: 'flame', color: 'neutral' },
  ]);
  // A tap sets the position of its pill; the current one says "already".
  let tap = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_4', pills[3].action.params);
  assert.match(tap.data.message.fr, /« Chauffage » : Arrêt\./);
  assert.equal(t.app.buttons.get(t.idOf(heating)).state, 4);
  tap = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_4', pills[3].action.params);
  assert.match(tap.data.message.fr, /déjà sur Arrêt/);
  for (const value of [0, 5, '2', null, 1.5]) {
    tap = await t.gladys.fake.widgetAction(WIDGETS.BUTTONS, 'press_1', {
      id: t.idOf(heating),
      value,
    });
    assert.equal(tap.success, false, String(value));
  }
  assert.equal(t.app.buttons.get(t.idOf(heating)).state, 4);

  // Never half a selector: no room left, no pill, and a line says why.
  components = await get({
    button_1: cine.external_id,
    button_2: heating.external_id,
    button_3: blinds.external_id,
  });
  assert.deepEqual(
    components.filter((c) => c.type === 'button').map((p) => p.label),
    ['Ciné', 'Ouverts', 'Fermés'],
  );
  const note = components.find((c) => c.type === 'text' && c.variant === 'body');
  assert.match(note.text.fr, /Plus de place sur cette carte pour : Chauffage\./);
  assert.deepEqual(
    components.find((c) => c.type === 'status').items.map((i) => [i.label, i.value]),
    [
      ['Chauffage', 'Arrêt'],
      ['Volets', 'Ouverts'],
    ],
  );
});

test('the "Icons" widget: every icon of the forms, 10 a page, with its label', async () => {
  const t = await setup();
  const seen = [];
  for (let page = 1; page <= ICON_PAGES; page += 1) {
    const ack = await t.gladys.fake.widgetGet(WIDGETS.ICONS, { settings: { page: String(page) } });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    const status = ack.data.content.components.find((c) => c.type === 'status');
    for (const item of status.items) {
      assert.equal(item.icon, item.value);
      assert.deepEqual(item.label, ICON_LABELS[item.value]);
      seen.push(item.value);
    }
  }
  assert.deepEqual(seen, [...ICONS]);
  // A page out of range or unreadable shows a page, never an error.
  for (const page of ['0', '99', 'x', undefined]) {
    const ack = await t.gladys.fake.widgetGet(WIDGETS.ICONS, { settings: { page } });
    assert.equal(ack.success, true, String(page));
  }
});

test('the "Icons" widget: a page out of range is brought back to the last page, 0 to the first', async () => {
  const t = await setup();
  const first = (page) =>
    t.gladys.fake
      .widgetGet(WIDGETS.ICONS, { settings: { page } })
      .then((ack) => ack.data.content.components.find((c) => c.type === 'status').items);
  const lastPage = await first(String(ICON_PAGES));
  assert.ok(lastPage.length > 0);
  assert.deepEqual(await first(String(ICON_PAGES + 1)), lastPage);
  for (const page of ['0', '99', '10', 'x', undefined]) {
    const items = await first(page);
    assert.ok(items.length > 0, `page ${String(page)} shows icons`);
  }
  assert.deepEqual(
    (await first('0')).map((i) => i.value),
    ICONS.slice(0, 10),
  );
  assert.deepEqual(
    (await first('99')).map((i) => i.value),
    lastPage.map((i) => i.value),
  );
});

test('a selector: a value Gladys holds elsewhere is set, the one it holds is not sent again', async () => {
  const t = await setup();
  await t.add(HEATING);
  const device = await t.create('Chauffage');
  const feature = device.features[0];
  await t.gladys.fake.setValue(device, feature, '2');
  await t.clock.settle();
  const count = () => t.states(feature.external_id).length;
  // The very position Gladys holds: nothing sent.
  const before = count();
  assert.equal((await t.gladys.fake.setValue(device, feature, '2')).success, true);
  await t.clock.settle();
  assert.equal(count(), before);
  // The app forgot what it sent (a reconnection) while Gladys holds another
  // text: the same position must be published again.
  t.app.sent.clear();
  const [held] = t.gladys.devices;
  held.features[0].last_value_string = '4';
  assert.equal((await t.gladys.fake.setValue(device, feature, '2')).success, true);
  await t.clock.settle();
  assert.equal(count(), before + 1);
});

test('a selector: a position that a "Change" removed while the command waited is refused', async () => {
  const t = await setup();
  await t.add(HEATING);
  const device = await t.create('Chauffage');
  let releaseSave;
  const save = t.store.save.bind(t.store);
  t.store.save = async (data) => {
    t.store.save = save;
    await new Promise((resolve) => (releaseSave = resolve));
    return save(data);
  };
  const adding = t.add({ name: 'Autre' });
  while (!releaseSave) {
    await t.clock.settle();
  }
  // Queued in this order: the shorter list, then "position 4".
  const editing = t.gladys.fake.action(ACTIONS.EDIT, {
    ...EDIT_FORM,
    button: device.external_id,
    positions: 'Confort, Éco, Hors-gel',
  });
  await t.clock.settle();
  const change = t.gladys.fake.setValue(device, device.features[0], '4');
  await t.clock.settle();
  releaseSave();
  await adding;
  assert.equal((await editing).success, true);
  const refused = await change;
  assert.equal(refused.success, false);
  assert.match(refused.error, /position/);
  assert.equal(t.app.buttons.get(t.idOf(device)).state, 1);
  assert.equal(t.gladys.fake.lastState(device.features[0].external_id), '1');
});

test('a selector rebuilt from a device whose positions are unusable: kept, defaults, status', async () => {
  const first = await setup();
  await first.add(HEATING);
  const device = await first.create('Chauffage');
  const rebuild = async (mutate) => {
    const [copy] = withLastTexts(first, [device]);
    mutate(copy);
    return setup({ devices: [copy] });
  };
  // Five names in the param: the options of the feature are used.
  let t = await rebuild((d) => {
    d.params.find((p) => p.name === 'VB_POSITIONS').value = JSON.stringify([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });
  assert.deepEqual(t.store.data.buttons[0].positions, ['Confort', 'Éco', 'Hors-gel', 'Arrêt']);
  assert.doesNotMatch(t.gladys.fake.connectionStatus.message.fr, /perdu/);
  // Neither the param nor the options are usable: defaults, said in the status.
  t = await rebuild((d) => {
    d.params.find((p) => p.name === 'VB_POSITIONS').value = JSON.stringify([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    d.features[0].supported_options = [];
  });
  assert.equal(t.store.data.buttons.length, 1);
  assert.deepEqual(t.store.data.buttons[0].positions, ['Position 1', 'Position 2']);
  assert.match(t.gladys.fake.connectionStatus.message.fr, /perdu les noms/);
});
