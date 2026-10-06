// Politeness is code, not a hope: the Desk makes at most one request in `intervalMs` to any one host.
// `wait(host)` is called just before each request and returns when the request may start.

export interface RateLimiterOptions {
  /** The least time, in milliseconds, between the starts of two requests to one host. */
  intervalMs: number;
  /** The clock, in milliseconds. A test passes its own; the default is the real one. */
  now?: () => number;
  /** How to wait. A test passes its own; the default is a timer. */
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** For each host, the earliest time at which the next request to it may start. */
  private readonly nextFree = new Map<string, number>();

  constructor(options: RateLimiterOptions) {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 0) {
      throw new Error(`intervalMs must be a number of milliseconds, zero or more: got ${options.intervalMs}`);
    }
    this.intervalMs = options.intervalMs;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Returns when a request to `host` may start (the host with its port, if it has one; the case of the name does
   * not matter). The place is taken before the wait begins, so requests made at the same moment get places one
   * interval apart instead of all waiting for the same one.
   */
  async wait(host: string): Promise<void> {
    const key = host.toLowerCase();
    const now = this.now();
    const start = Math.max(now, this.nextFree.get(key) ?? now);
    this.nextFree.set(key, start + this.intervalMs);
    if (start > now) await this.sleep(start - now);
  }
}
