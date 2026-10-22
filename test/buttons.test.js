// The pure helpers of src/buttons.js and src/widget.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buttonFromDevice,
  cleanName,
  deviceOf,
  idOfDevice,
  nameKey,
  readFields,
  sanitizeButton,
  toMinutes,
} from '../src/buttons.js';
import { styleOf } from '../src/widget.js';

test('cleanName: text only, collapsed, bounded by code points', () => {
  assert.equal(cleanName('  a\tb\u0000c  '), 'a b c');
  assert.equal(cleanName(42), '42');
  assert.equal(cleanName({ toString: () => 'x' }), '');
  assert.equal(cleanName(null), '');
  assert.equal(cleanName('😀'.repeat(50)), '😀'.repeat(40));
  assert.equal(nameKey(' Été  Salon '), 'ete salon');
});

test('toMinutes and readFields', () => {
  assert.equal(toMinutes(1), 1);
  assert.equal(toMinutes('1440'), 1440);
  assert.equal(toMinutes(0), null);
  assert.equal(toMinutes(1.5), null);
  assert.equal(toMinutes(''), null);
  assert.deepEqual(readFields({ name: 'A' }).values, {
    name: 'A',
    kind: 'push',
    icon: 'power',
    style: 'primary',
    confirm: false,
    minutes: 30,
  });
  assert.deepEqual(readFields({ icon: 'sun' }, { partial: true }).values, { icon: 'sun' });
  assert.equal(readFields({ name: 'A', kind: 'constructor' }).error, 'kindUnknown');
});

test('a device and back: the params rebuild the button', () => {
  const gladys = createFakeGladys();
  const button = sanitizeButton({
    id: 'b0123456789ab',
    name: 'Chauffage',
    kind: 'timed',
    icon: 'flame',
    style: 'danger',
    confirm: true,
    minutes: 45,
    state: 1,
    until: Date.now() + 1000,
  });
  const device = deviceOf(gladys, button);
  assert.equal(idOfDevice(gladys, device.external_id), button.id);
  assert.equal(idOfDevice(gladys, `${device.external_id}x`), null);
  assert.equal(idOfDevice(gladys, 'ext:other:button:b0123456789ab'), null);
  const back = buttonFromDevice(gladys, { ...device, name: 'Renamed in Gladys' });
  assert.deepEqual(back, { ...button, state: 0, until: null });
  // Without params: the feature category tells the kind.
  const bare = buttonFromDevice(gladys, { ...device, params: undefined });
  assert.equal(bare.kind, 'switch');
  assert.equal(bare.name, 'Chauffage', 'name from the device');
});

test('the style of a pill', () => {
  assert.equal(styleOf({ kind: 'push', style: 'danger', state: 0 }), 'danger');
  assert.equal(styleOf({ kind: 'switch', style: 'danger', state: 0 }), 'secondary');
  assert.equal(styleOf({ kind: 'switch', style: 'danger', state: 1 }), 'danger');
  assert.equal(styleOf({ kind: 'timed', style: 'secondary', state: 1 }), 'primary');
});
