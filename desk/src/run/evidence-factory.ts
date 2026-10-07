import type { DeskConfig } from '../config';
import type { Environment } from '../model/factory';
import { LocalEvidenceStore } from './evidence';
import type { EvidenceStore } from './evidence';
import { R2EvidenceStore } from './r2-evidence';
import type { StoreTransport } from './r2-evidence';

// The evidence store of a run is chosen by one setting, `evidence.kind`, and built here. The folder of a local store is a setting too (`evidenceDir`). A bucket is not described by
// settings at all: its address, its name and the two halves of the key that opens it are read from the environment, because a file of settings is committed to a repository that anyone
// can read, and a key must never be in it. A store that is asked for and cannot be built is refused with a message that names the variables that are not there, never what they hold.

/** The variables of the environment that describe the bucket of a store of the kind `r2`, in the order that a message names them. */
export const R2_VARIABLES = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;

/** What a store of the kind `r2` is given besides the environment, which a test replaces: how requests are made, the clock, and how long to wait. */
export interface EvidenceDeps {
  transport?: StoreTransport;
  now?: () => Date;
  timeoutMs?: number;
}

/**
 * The evidence store that `config` asks for: `LocalEvidenceStore` in the folder `config.evidenceDir` for `local`, and `R2EvidenceStore` for `r2`, described by the four variables of
 * `R2_VARIABLES` in `env`. A value is taken with its spaces and line ends trimmed (a secret that was pasted with one at its end still works), and one that is empty is not set. The
 * variables that are not set are named in the error and nothing else is; a value that the store refuses (an address that is not https, a name that is not a bucket name, a key that
 * cannot sign) is refused with the message of the store, which does not repeat it. The `local` store does not look at the environment.
 */
export function makeEvidenceStore(config: DeskConfig, env: Environment, deps: EvidenceDeps = {}): EvidenceStore {
  if (config.evidence.kind === 'local') return new LocalEvidenceStore(config.evidenceDir);

  const value = (name: (typeof R2_VARIABLES)[number]): string => env[name]?.trim() ?? '';
  const missing = R2_VARIABLES.filter((name) => value(name) === '');
  if (missing.length > 0) {
    const [is, it] = missing.length === 1 ? ['it is', 'it'] : ['they are', 'them'];
    throw new Error(`the setting evidence.kind is r2, which needs ${missing.join(', ')} in the environment (${is} not set, and a file of settings cannot have ${it})`);
  }
  try {
    return new R2EvidenceStore({
      endpoint: value('R2_ENDPOINT'),
      bucket: value('R2_BUCKET'),
      accessKeyId: value('R2_ACCESS_KEY_ID'),
      secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
      ...(deps.transport === undefined ? {} : { transport: deps.transport }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    });
  } catch (error) {
    throw new Error(`the setting evidence.kind is r2, and what the environment has for it cannot be used: ${(error as Error).message}`);
  }
}
