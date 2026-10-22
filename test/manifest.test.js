// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here. No version is
// pinned: only its shape and its agreement across files.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS,
  DEFAULTS,
  ICONS,
  KIND_LIST,
  LIMITS,
  STYLES,
  WIDGET_SLOTS,
  WIDGETS,
} from '../src/constants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const handlers = read('src/handlers.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, entry] of node.entries()) {
      yield* texts(entry, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

const action = (key) => manifest.actions.find((a) => a.key === key);
const fieldsOf = (key) => Object.fromEntries(action(key).fields.map((f) => [f.key, f]));
const values = (field) => field.options.map((o) => o.value);

test('the store basics, the version agreeing everywhere', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.match(manifest.gladys_version, /^>=5\.1\.0$/, 'widgets need 5.1.0');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.name, 'gladys-virtual-buttons');
  assert.equal(lock.name, pkg.name);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/lm1lc3n7/gladys-virtual-buttons:${manifest.version}`,
  );
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/LM1LC3N7\/gladys-virtual-buttons\//,
  );
  assert.deepEqual(manifest.transports, ['local']);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    const docs = read(`docs/${lang}.md`);
    assert.ok(docs.length >= 300, `docs/${lang}.md is too short for the store`);
    assert.match(docs, /tested with a fake Gladys only|testé seulement avec un faux Gladys/i);
  }
});

test('nothing is ever said to be encrypted, and there is no secret at all', () => {
  for (const file of [
    'gladys-assistant-integration.json',
    'docs/en.md',
    'docs/fr.md',
    'README.md',
    'CHANGELOG.md',
    'TODO.md',
    'CLAUDE.md',
  ]) {
    assert.doesNotMatch(read(file), /\bchiffr|\bencrypt/i, file);
  }
  const all = [
    ...manifest.config_schema,
    ...manifest.actions.flatMap((a) => a.fields ?? []),
    ...manifest.widgets.flatMap((w) => w.settings ?? []),
  ];
  assert.ok(all.every((f) => !['secret', 'oauth2', 'account_link'].includes(f.type)));
});

test('every text is in English and French', () => {
  for (const [path, text] of texts(manifest)) {
    for (const lang of ['en', 'fr']) {
      assert.ok(text[lang]?.trim(), `${path} needs ${lang}`);
    }
  }
  const [intro] = manifest.config_schema;
  assert.equal(intro.type, 'section');
  for (const lang of ['en', 'fr']) {
    assert.ok(intro.description[lang].length <= 1000, `intro.${lang}`);
  }
  assert.ok(intro.links.every((l) => l.url.startsWith('https://')));
  assert.equal(manifest.config_schema.filter((f) => f.type !== 'section').length, 0);
});

test('the actions are the ones the code handles, with the code lists', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), `ACTIONS.${name} has no handler`);
  }
  for (const a of manifest.actions) {
    assert.ok(a.timeout_seconds >= 5 && a.timeout_seconds <= 120);
  }
  const add = fieldsOf(ACTIONS.ADD);
  assert.equal(add.name.required, true);
  assert.deepEqual(values(add.kind), [...KIND_LIST]);
  assert.equal(add.kind.default, DEFAULTS.kind);
  assert.deepEqual(values(add.icon), [...ICONS]);
  assert.equal(add.icon.default, DEFAULTS.icon);
  assert.deepEqual(values(add.style), [...STYLES]);
  assert.equal(add.style.default, DEFAULTS.style);
  assert.deepEqual(values(add.confirm), ['no', 'yes']);
  assert.equal(add.confirm.default, DEFAULTS.confirm ? 'yes' : 'no');
  assert.equal(add.minutes.min, LIMITS.minutesMin);
  assert.equal(add.minutes.max, LIMITS.minutesMax);
  assert.equal(add.minutes.default, DEFAULTS.minutes);

  // "Change": nothing has a default (an empty field means "unchanged"), no type.
  const edit = fieldsOf(ACTIONS.EDIT);
  assert.equal(edit.kind, undefined);
  for (const field of Object.values(edit)) {
    assert.equal(field.default, undefined, field.key);
    assert.equal(field.required, false, field.key);
  }
  assert.deepEqual(values(edit.icon), [...ICONS]);
  assert.deepEqual(values(edit.style), [...STYLES]);
  assert.equal(edit.minutes.max, LIMITS.minutesMax);
  for (const key of [ACTIONS.EDIT, ACTIONS.REMOVE]) {
    const fields = fieldsOf(key);
    assert.equal(fields.button.source, 'devices');
    assert.equal(fields.button.options, undefined);
    assert.equal(fields.current_name.type, 'string');
  }
  // No scene trigger nor scene action in v1 (redundant, loop risk).
  assert.equal(manifest.scene_triggers, undefined);
  assert.equal(manifest.scene_actions, undefined);
});

test('the widget: key, slots, handler', () => {
  assert.equal(manifest.widgets.length, 1);
  const [widget] = manifest.widgets;
  assert.equal(widget.key, WIDGETS.BUTTONS);
  assert.ok(handlers.includes('onWidgetGet(WIDGETS.BUTTONS'));
  assert.ok(handlers.includes('onWidgetAction(WIDGETS.BUTTONS'));
  assert.deepEqual(
    widget.settings.map((s) => s.key),
    [...WIDGET_SLOTS],
  );
  assert.ok(widget.settings.every((s) => s.type === 'select' && s.source === 'devices'));
  for (const lang of ['en', 'fr']) {
    assert.ok(widget.label[lang].length >= 3 && widget.label[lang].length <= 30);
    assert.ok(widget.description[lang].length <= 100);
  }
  assert.match(widget.icon, /^[a-z0-9-]{1,40}$/);
});

test('the image ships the licence', () => {
  assert.match(read('Dockerfile'), /COPY LICENSE \.\//);
  assert.match(read('Dockerfile'), /COPY src \.\/src/);
});
