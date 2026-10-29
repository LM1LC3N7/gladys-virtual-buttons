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
  positionOfText,
  readFields,
  readPositions,
  sanitizeButton,
  toMinutes,
  wireOf,
} from '../src/buttons.js';
import { sanitize } from '../src/store.js';
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

test('readPositions: 2 to 6 names, cleaned, bounded, unique', () => {
  assert.deepEqual(readPositions('Confort, Éco;Hors-gel , Arrêt').positions, [
    'Confort',
    'Éco',
    'Hors-gel',
    'Arrêt',
  ]);
  assert.deepEqual(readPositions(['A', 'B']).positions, ['A', 'B']);
  assert.deepEqual(readPositions('A,\u0000,B').positions, ['A', 'B']);
  assert.equal(readPositions('x'.repeat(30) + ',y').positions[0], 'x'.repeat(20));
  // The 6 orders of a pilot wire.
  assert.deepEqual(
    readPositions('Confort, Confort -1, Confort -2, Éco, Hors-gel, Arrêt').positions,
    ['Confort', 'Confort -1', 'Confort -2', 'Éco', 'Hors-gel', 'Arrêt'],
  );
  assert.equal(readPositions(['A', 'B', 'C', 'D', 'E']).positions.length, 5);
  const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (const bad of ['A', seven.join(','), seven, '', ',,', null, 3, {}]) {
    assert.equal(readPositions(bad).error, 'positionsCount', JSON.stringify(bad));
  }
  assert.equal(readPositions('Éco, ECO').error, 'positionsTaken');
  assert.equal(readFields({ name: 'S', kind: 'selector' }).error, 'positionsCount');
  assert.equal(readFields({ name: 'S', kind: 'selector', positions: 'A' }).error, 'positionsCount');
  assert.deepEqual(readFields({ name: 'S', kind: 'selector', positions: 'A,B' }).values.positions, [
    'A',
    'B',
  ]);
  assert.equal(readFields({ name: 'P', kind: 'push', positions: 'A' }).error, undefined);
  assert.equal(
    readFields({ name: 'P', kind: 'push', positions: 'A,B' }).values.positions,
    undefined,
  );
  assert.deepEqual(readFields({ positions: 'A,B' }, { partial: true }).values, {
    positions: ['A', 'B'],
  });
  assert.deepEqual(readFields({ positions: '' }, { partial: true }).values, {});
});

test('a selector: saved state bounded, text of a position strict, a device and back', () => {
  const raw = { id: 'b0123456789ab', name: 'Mode', kind: 'selector', positions: ['A', 'B', 'C'] };
  assert.equal(sanitizeButton({ ...raw, state: 3 }).state, 3);
  for (const state of [0, 4, '2', 1.5, null, undefined]) {
    assert.equal(sanitizeButton({ ...raw, state }).state, 1, String(state));
  }
  for (const positions of [undefined, ['A'], ['A', 'a'], 'A,B', { 0: 'A', 1: 'B' }]) {
    // /data holds a list: a selector without one is dropped.
    if (typeof positions === 'string') {
      assert.deepEqual(sanitizeButton({ ...raw, positions }).positions, ['A', 'B']);
    } else {
      assert.equal(sanitizeButton({ ...raw, positions }), null, JSON.stringify(positions));
    }
  }
  assert.equal(sanitize({ buttons: [{ ...raw, positions: ['A'] }] }).buttons.length, 0);
  const button = sanitizeButton({ ...raw, state: 2 });
  assert.equal(positionOfText('3', button), 3);
  for (const text of ['4', '0', '03', ' 3', 3, 'A', '', null, '1.0']) {
    assert.equal(positionOfText(text, button), null, JSON.stringify(text));
  }
  assert.deepEqual(wireOf(button, 2), { text: '2' });
  assert.equal(wireOf({ kind: 'switch' }, 1), 1);

  const gladys = createFakeGladys();
  const device = deviceOf(gladys, button);
  const feature = { ...device.features[0], last_value_string: '3' };
  const back = buttonFromDevice(gladys, { ...device, features: [feature] });
  assert.deepEqual(back, { ...button, state: 3 });
  // A param that is not JSON: the options of the feature.
  const params = device.params.map((p) =>
    p.name === 'VB_POSITIONS' ? { ...p, value: '[oops' } : p,
  );
  assert.deepEqual(buttonFromDevice(gladys, { ...device, params }).positions, ['A', 'B', 'C']);
});

test('the devices of v0.1 buttons do not change (ids, features, params)', () => {
  const gladys = createFakeGladys();
  const base = { id: 'b0123456789ab', name: 'Nuit', icon: 'moon', style: 'primary', minutes: 30 };
  const expected = (kind) => [
    { name: 'VB_KIND', value: kind },
    { name: 'VB_LABEL', value: 'Nuit' },
    { name: 'VB_ICON', value: 'moon' },
    { name: 'VB_STYLE', value: 'primary' },
    { name: 'VB_CONFIRM', value: 'false' },
    { name: 'VB_MINUTES', value: '30' },
  ];
  for (const [kind, key, category, type] of [
    ['push', 'press', 'button', 'push'],
    ['switch', 'state', 'switch', 'binary'],
    ['timed', 'state', 'switch', 'binary'],
  ]) {
    const device = deviceOf(gladys, sanitizeButton({ ...base, kind }));
    assert.equal(device.external_id, 'ext:test-integration:button:b0123456789ab');
    assert.deepEqual(device.params, expected(kind));
    assert.deepEqual(device.features, [
      {
        name: 'Nuit',
        external_id: `ext:test-integration:button:b0123456789ab:${key}`,
        category,
        type,
        read_only: false,
        has_feedback: true,
        keep_history: kind !== 'push',
        min: 0,
        max: 1,
      },
    ]);
  }
  // A v0.1 /data entry loads unchanged (no new key).
  const saved = { ...base, kind: 'switch', confirm: false, state: 1, until: null };
  assert.deepEqual(sanitizeButton(saved), saved);
});

test('a selector of 6 positions: state, texts "1" … "6", a device and back', () => {
  const positions = ['Confort', 'Confort -1', 'Confort -2', 'Éco', 'Hors-gel', 'Arrêt'];
  const raw = { id: 'b0123456789ab', name: 'Fil pilote', kind: 'selector', positions };
  assert.equal(sanitizeButton({ ...raw, state: 6 }).state, 6);
  assert.equal(sanitizeButton({ ...raw, state: 7 }).state, 1);
  // /data holding 7 names (hand-edited): the selector is dropped, never cut.
  assert.equal(sanitizeButton({ ...raw, positions: [...positions, 'Boost'] }), null);
  const button = sanitizeButton({ ...raw, state: 5 });
  assert.equal(positionOfText('6', button), 6);
  for (const text of ['7', '0', '06', 6]) {
    assert.equal(positionOfText(text, button), null, JSON.stringify(text));
  }
  const gladys = createFakeGladys();
  const device = deviceOf(gladys, button);
  assert.deepEqual(
    device.features[0].supported_options.map((o) => [o.value, o.label]),
    positions.map((name, index) => [String(index + 1), name]),
  );
  const feature = { ...device.features[0], last_value_string: '6' };
  assert.deepEqual(buttonFromDevice(gladys, { ...device, features: [feature] }), {
    ...button,
    state: 6,
  });
  // Without the param: the 6 options of the feature, in their order.
  const params = device.params.filter((p) => p.name !== 'VB_POSITIONS');
  const shuffled = { ...feature, supported_options: [...feature.supported_options].reverse() };
  assert.deepEqual(
    buttonFromDevice(gladys, { ...device, params, features: [shuffled] }).positions,
    positions,
  );
});
