// -----------------------------------------------------------------------------
// /data: atomic file, hostile content checked field by field, no prototype
// pollution. The files go under ./data (git-ignored), never the system temp.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore, MAX_REMOVED, sanitize } from '../src/store.js';
import { LIMITS } from '../src/constants.js';

const root = fileURLToPath(new URL('../data/', import.meta.url));

async function tempDir(t) {
  const dir = join(root, `test-${randomBytes(4).toString('hex')}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const NOW = Date.parse('2026-10-22T08:00:00Z');
const button = (i, extra = {}) => ({
  id: `b${String(i).padStart(12, '0')}`,
  name: `Bouton ${i}`,
  kind: 'switch',
  ...extra,
});

test('save then load gives the same buttons', async (t) => {
  const store = new FileStore({ dir: await tempDir(t) });
  const data = sanitize({ buttons: [button(1, { state: 1 }), button(2, { kind: 'push' })] }, NOW);
  await store.save(data);
  assert.deepEqual(await store.load(NOW), data);
  if (process.platform !== 'win32') {
    assert.equal((await stat(store.path)).mode & 0o777, 0o600);
  }
});

test('an unreadable file is set aside and reported', async (t) => {
  const dir = await tempDir(t);
  const store = new FileStore({ dir });
  await writeFile(store.path, '{ not json');
  assert.deepEqual(await store.load(NOW), { buttons: [], removed: [] });
  assert.equal(store.corrupted, true);
  assert.equal(await readFile(`${store.path}.bad`, 'utf8'), '{ not json');
});

test('hostile content: bounded, checked, no prototype pollution', () => {
  const hostile = JSON.parse(
    JSON.stringify({
      buttons: [
        ...Array.from({ length: 300 }, (_, i) => button(i)),
        button(1),
        { id: '__proto__', name: 'x', kind: 'push' },
        { id: 'b000000000999', name: '', kind: 'push' },
        { id: 'b000000000998', name: 'ok', kind: 'light' },
      ],
      removed: ['b000000000001', 'nope', ...Array.from({ length: 900 }, (_, i) => button(i).id)],
    }).replace('"buttons"', '"__proto__":{"polluted":true},"buttons"'),
  );
  const data = sanitize(hostile, NOW);
  assert.equal(data.buttons.length, LIMITS.buttons);
  assert.equal(new Set(data.buttons.map((b) => b.id)).size, LIMITS.buttons);
  assert.ok(data.removed.length <= MAX_REMOVED);
  assert.ok(data.removed.every((id) => /^b[0-9a-f]{12}$/.test(id)));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(data, 'polluted'), false);
});

test('a timed switch: an end beyond 24 h is cut, an "on" without an end is off', () => {
  const data = sanitize(
    {
      buttons: [
        button(1, { kind: 'timed', state: 1, until: NOW + 10 * 24 * 3600 * 1000, minutes: 5 }),
        button(2, { kind: 'timed', state: 1 }),
        button(3, { kind: 'push', state: 1 }),
        button(4, { kind: 'timed', minutes: 99999 }),
      ],
    },
    NOW,
  );
  assert.equal(data.buttons[0].until, NOW + 24 * 3600 * 1000);
  assert.equal(data.buttons[1].state, 0);
  assert.equal(data.buttons[2].state, 0, 'a push button is never saved at 1');
  assert.equal(data.buttons[3].minutes, 30, 'a duration out of bounds falls back to the default');
});
