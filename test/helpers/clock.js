// A clock and timers moved by hand: nothing waits for real time in the tests.
// Timers run on a monotonic time (`mono`); the wall clock (`now`) can jump
// either way without moving them, as an NTP step does.

export function createClock(start = Date.parse('2026-10-22T08:00:00Z')) {
  let mono = 0;
  let offset = start;
  let seq = 0;
  const pending = new Map();

  const add = (fn, delay, every) => {
    seq += 1;
    const id = { id: seq, unref() {} };
    pending.set(id, { fn, at: mono + Math.max(0, delay), every });
    return id;
  };

  const settle = async () => {
    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  return {
    now: () => mono + offset,
    mono: () => mono,
    timers: {
      setTimeout: (fn, delay) => add(fn, delay, null),
      clearTimeout: (id) => pending.delete(id),
      setInterval: (fn, delay) => add(fn, delay, delay),
      clearInterval: (id) => pending.delete(id),
    },
    pending: () => pending.size,
    settle,
    /** Real time passes, running every timer due on the way. */
    async advance(ms) {
      const end = mono + ms;
      for (;;) {
        let next = null;
        for (const [id, timer] of pending) {
          if (timer.at <= end && (!next || timer.at < next[1].at)) {
            next = [id, timer];
          }
        }
        if (!next) {
          break;
        }
        const [id, timer] = next;
        mono = Math.max(mono, timer.at);
        if (timer.every) {
          timer.at = mono + timer.every;
        } else {
          pending.delete(id);
        }
        timer.fn();
        await settle();
      }
      mono = end;
      await settle();
    },
    /** Sets the wall clock (a restart later, a clock change); timers keep their delay. */
    set(time) {
      offset = time - mono;
    },
    /** The wall clock steps by `ms` (negative: back). */
    jump(ms) {
      offset += ms;
    },
  };
}
