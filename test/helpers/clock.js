// A clock and timers moved by hand: nothing waits for real time in the tests.

export function createClock(start = Date.parse('2026-10-22T08:00:00Z')) {
  let now = start;
  let seq = 0;
  const pending = new Map();

  const add = (fn, delay, every) => {
    seq += 1;
    const id = { id: seq, unref() {} };
    pending.set(id, { fn, at: now + Math.max(0, delay), every });
    return id;
  };

  const settle = async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  const clock = {
    now: () => now,
    timers: {
      setTimeout: (fn, delay) => add(fn, delay, null),
      clearTimeout: (id) => pending.delete(id),
      setInterval: (fn, delay) => add(fn, delay, delay),
      clearInterval: (id) => pending.delete(id),
    },
    pending: () => pending.size,
    settle,
    /** Moves the time forward, running every timer due on the way. */
    async advance(ms) {
      const end = now + ms;
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
        now = Math.max(now, timer.at);
        if (timer.every) {
          timer.at = now + timer.every;
        } else {
          pending.delete(id);
        }
        timer.fn();
        await settle();
      }
      now = end;
      await settle();
    },
    /** Sets the wall clock without running timers (a clock change, a restart later). */
    set(time) {
      now = time;
    },
  };
  return clock;
}
