import { sha256Hex } from '../../src/model/types';
import type { EvidenceMeta, EvidenceStore } from '../../src/run/evidence';

// A way to watch an evidence store, and to make it fail or lie: the tests of the runs that use a store say what the Desk asked of it, in what order, and what the run does when it answers
// badly. `watched` wraps any store (the folder, or a store of the made-up bucket) and keeps every call; a fault makes the next calls of a method throw, and `lie` makes `get` give back
// another text, as a store that does not check what it holds would.

/** One call of a store, and the hash that it was about (for a put, the hash of the text). */
export interface StoreCall {
  method: 'put' | 'get' | 'has' | 'keep';
  hash: string;
}

export interface WatchedStore extends EvidenceStore {
  calls: StoreCall[];
  /** The calls as lines, such as `get 271a7078`, with the hash cut to its first eight characters. */
  lines(): string[];
  /** Make the next `times` calls of `method` throw `error` (before the store is asked). */
  fail(method: StoreCall['method'], error: Error, times?: number): void;
  /** Make every `get` give back `text` as the text of the snapshot, whatever the store holds. */
  lie(text: string): void;
  /** Called at the start of every call, so that a test can look at the world at that moment. */
  onCall?: (call: StoreCall) => void;
}

/** A store that does what `inner` does, and keeps what it was asked. */
export function watched(inner: EvidenceStore): WatchedStore {
  const faults: { method: StoreCall['method']; error: Error; times: number }[] = [];
  let lying: string | undefined;
  const begin = (call: StoreCall): void => {
    watching.calls.push(call);
    watching.onCall?.(call);
    const fault = faults.find((entry) => entry.method === call.method && entry.times > 0);
    if (fault !== undefined) {
      fault.times -= 1;
      throw fault.error;
    }
  };
  const watching: WatchedStore = {
    calls: [],
    lines: () => watching.calls.map((call) => `${call.method} ${call.hash.slice(0, 8)}`),
    fail: (method, error, times = 1) => void faults.push({ method, error, times }),
    lie: (text) => {
      lying = text;
    },
    async put(text: string, meta: EvidenceMeta) {
      begin({ method: 'put', hash: sha256Hex(text) });
      return inner.put(text, meta);
    },
    async get(hash: string) {
      begin({ method: 'get', hash });
      const found = await inner.get(hash);
      return lying === undefined ? found : { ...found, text: lying };
    },
    async has(hash: string) {
      begin({ method: 'has', hash });
      return inner.has(hash);
    },
    async keep(hash: string) {
      begin({ method: 'keep', hash });
      return inner.keep(hash);
    },
  };
  return watching;
}

/** A store that keeps nothing and accepts everything: `keep` of any hash works, and what it was asked to keep is in `kept`. For the tests of a stage that cites snapshots that no store holds. */
export function acceptingStore(): EvidenceStore & { kept: string[] } {
  const kept: string[] = [];
  return {
    kept,
    put: async () => Promise.reject(new Error('this store puts nothing')),
    get: async () => Promise.reject(new Error('this store holds nothing')),
    has: async () => false,
    keep: async (hash) => void kept.push(hash),
  };
}
