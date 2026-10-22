// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data (the one writable
// volume, file mode 0600): the list of the buttons, each with its state and,
// for a timed switch that is on, the time it goes back to off; and the ids of
// the buttons removed (bounded), so a device Gladys still holds never brings a
// removed button back. Nothing secret.
//
// Writes are atomic (temporary file, sync, rename) and queued: the last save
// always lands last. An unreadable file is moved aside, never overwritten
// silently.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LIMITS } from './constants.js';
import { isId, sanitizeButton } from './buttons.js';

export const emptyData = () => ({ buttons: [], removed: [] });

/** How many removed ids are remembered (so a device left in Gladys never brings a removed button back). */
export const MAX_REMOVED = 500;

/** The saved data, checked button by button: at most LIMITS.buttons, ids unique. */
export function sanitize(data, now = Date.now()) {
  const base = emptyData();
  if (!data || typeof data !== 'object') {
    return base;
  }
  if (Array.isArray(data.removed)) {
    base.removed = [...new Set(data.removed.filter(isId))].slice(-MAX_REMOVED);
  }
  if (!Array.isArray(data.buttons)) {
    return base;
  }
  const seen = new Set();
  for (const raw of data.buttons.slice(0, LIMITS.buttons * 2)) {
    const button = sanitizeButton(raw, now);
    if (button && !seen.has(button.id) && base.buttons.length < LIMITS.buttons) {
      seen.add(button.id);
      base.buttons.push(button);
    }
  }
  return base;
}

export class FileStore {
  constructor({ dir = process.env.DATA_DIR || '/data', name = 'virtual-buttons.json' } = {}) {
    this.dir = dir;
    this.path = join(dir, name);
    this.corrupted = false;
    this.queue = Promise.resolve();
    this.writes = 0;
  }

  async load(now = Date.now()) {
    let text;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      return emptyData();
    }
    try {
      if (text.length > 1024 * 1024) {
        throw new Error('too large');
      }
      return sanitize(JSON.parse(text), now);
    } catch {
      this.corrupted = true;
      const bad = `${this.path}.bad`;
      await rename(this.path, bad).catch(() => {});
      await chmod(bad, 0o600).catch(() => {});
      return emptyData();
    }
  }

  /** Saves a snapshot of `data` (taken now), after the writes already queued. */
  save(data) {
    const text = JSON.stringify(data);
    const run = this.queue.then(() => this.write(text));
    this.queue = run.catch(() => {});
    return run;
  }

  flush() {
    return this.queue;
  }

  async write(text) {
    await mkdir(this.dir, { recursive: true });
    this.writes += 1;
    const temporary = `${this.path}.${process.pid}.${this.writes}.${randomBytes(4).toString('hex')}.tmp`;
    const handle = await open(temporary, 'w', 0o600);
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.path);
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => {});
      throw err;
    }
  }
}

/** For the tests: what a restart would read back, through JSON. */
export class MemoryStore {
  constructor(data = emptyData()) {
    this.data = JSON.parse(JSON.stringify(data));
    this.saves = 0;
    this.corrupted = false;
    this.fail = false;
  }

  async load(now = Date.now()) {
    return sanitize(JSON.parse(JSON.stringify(this.data)), now);
  }

  async save(data) {
    if (this.fail) {
      throw new Error('disk full');
    }
    this.data = JSON.parse(JSON.stringify(data));
    this.saves += 1;
  }

  flush() {
    return Promise.resolve();
  }
}
