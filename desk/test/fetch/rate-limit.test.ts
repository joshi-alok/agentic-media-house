import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../src/fetch/rate-limit';

// The Desk is polite: it makes at most one request in a while to any one host. The limiter is what
// keeps that promise, so these tests run it on a clock that a test moves by hand, never on real time.

/** A clock that only moves when the limiter sleeps, and a record of every sleep. */
function clock() {
  const state = {
    time: 0,
    sleeps: [] as number[],
    now: () => state.time,
    sleep: async (ms: number) => {
      state.sleeps.push(ms);
      state.time += ms;
    },
  };
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter', () => {
  it('lets the first request to a host start at once', async () => {
    const c = clock();
    await new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep }).wait('a.example');
    expect(c.sleeps).toEqual([]);
  });

  it('makes the second request to a host wait for the whole interval', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    await limiter.wait('a.example');
    expect(c.sleeps).toEqual([1000]);
    expect(c.time).toBe(1000);
  });

  it('spaces any number of requests to one host by the interval', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    const starts: number[] = [];
    for (let i = 0; i < 4; i++) {
      await limiter.wait('a.example');
      starts.push(c.time);
    }
    expect(starts).toEqual([0, 1000, 2000, 3000]);
  });

  it('waits only for what is left of the interval', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    c.time = 400;
    await limiter.wait('a.example');
    expect(c.sleeps).toEqual([600]);
  });

  it('does not wait when the interval has already passed', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    c.time = 1000;
    await limiter.wait('a.example');
    c.time = 5000;
    await limiter.wait('a.example');
    expect(c.sleeps).toEqual([]);
  });

  it('does not make one host wait for another', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    await limiter.wait('b.example');
    await limiter.wait('c.example');
    expect(c.sleeps).toEqual([]);
  });

  it('keeps a count for each host while requests to several are mixed', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    await limiter.wait('b.example');
    await limiter.wait('a.example');
    // a.example waited 1000, which also let b.example's interval pass, so b.example does not wait.
    await limiter.wait('b.example');
    await limiter.wait('a.example');
    expect(c.sleeps).toEqual([1000, 1000]);
  });

  it('treats the name of a host without regard to case', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('News.Example');
    await limiter.wait('news.example');
    expect(c.sleeps).toEqual([1000]);
  });

  it('treats a host with a port as another host', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    await limiter.wait('a.example');
    await limiter.wait('a.example:8080');
    expect(c.sleeps).toEqual([]);
  });

  it('gives requests that are made at the same moment places one interval apart', async () => {
    // A sleep that records and does not move the clock: three requests are made together.
    const sleeps: number[] = [];
    const limiter = new RateLimiter({ intervalMs: 1000, now: () => 0, sleep: async (ms) => void sleeps.push(ms) });
    await Promise.all([limiter.wait('a.example'), limiter.wait('a.example'), limiter.wait('a.example')]);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('never waits when the interval is zero', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 0, now: c.now, sleep: c.sleep });
    for (let i = 0; i < 5; i++) await limiter.wait('a.example');
    expect(c.sleeps).toEqual([]);
  });

  it('keeps its place when the clock goes backwards', async () => {
    const c = clock();
    const limiter = new RateLimiter({ intervalMs: 1000, now: c.now, sleep: c.sleep });
    c.time = 5000;
    await limiter.wait('a.example');
    c.time = 4000;
    await limiter.wait('a.example');
    expect(c.sleeps).toEqual([2000]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuses an interval of %s', (intervalMs) => {
    expect(() => new RateLimiter({ intervalMs })).toThrow('intervalMs must be a number of milliseconds, zero or more');
  });

  it('uses the real clock and a real timer when it is given none', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new RateLimiter({ intervalMs: 1000 });
    await limiter.wait('a.example');
    let released = false;
    const second = limiter.wait('a.example').then(() => {
      released = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(released).toBe(true);
  });
});
