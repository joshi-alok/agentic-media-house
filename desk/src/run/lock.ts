import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A run of the Desk writes the folders of its day, the evidence, the site and git, and two runs at once would write over each other. So a run
// takes a lock first: a file that is made in a way that fails if it is already there. The lock is removed when the run ends, however it ends. When the
// lock is there, the run does not start, and this is not a failure of a run: nothing was run, so nothing is recorded.

/** Why a run did not start: it would spend money on a made-up world, the lock is held, the lock is old, the day has been run, the day has used all its tries, or the place it writes to is not in order. */
export type RefusalKind = 'spending' | 'locked' | 'stale-lock' | 'date-done' | 'attempts' | 'target';

/** The error of a run that was refused before it began. Nothing ran, nothing was written, and no record is made of it. */
export class RunRefused extends Error {
  readonly kind: RefusalKind;

  constructor(kind: RefusalKind, message: string) {
    super(message);
    this.name = 'RunRefused';
    this.kind = kind;
  }
}

/** The name of the lock file, in the folder of the runs. */
export const LOCK_FILE = '.lock';

/** A lock older than this is reported as stale: its run may have stopped halfway. It is never removed by a run. */
export const STALE_LOCK_MS = 24 * 3_600_000;

/** The error for a lock that is there: who holds it and since when, and whether it is old enough to be a run that never finished. */
async function refusalFor(file: string, now: Date): Promise<RunRefused> {
  let held: { runId: string; startedAt: Date } | undefined;
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as { runId?: unknown; startedAt?: unknown };
    const startedAt = typeof data.startedAt === 'string' ? new Date(data.startedAt) : undefined;
    if (typeof data.runId === 'string' && startedAt !== undefined && !Number.isNaN(startedAt.getTime())) held = { runId: data.runId, startedAt };
  } catch {
    // A lock that cannot be read is treated as held: the Desk does not guess that it is old.
  }
  if (held === undefined) return new RunRefused('locked', `another run may hold the lock ${file}, which cannot be read, so the Desk does not start`);
  const age = now.getTime() - held.startedAt.getTime();
  if (age > STALE_LOCK_MS) {
    const hours = Math.floor(age / 3_600_000);
    return new RunRefused(
      'stale-lock',
      `the lock ${file} was taken ${hours} hours ago (run ${held.runId}) and was never released: that run may have stopped halfway. If no run is going, delete the file and run again; the Desk does not remove it itself`,
    );
  }
  return new RunRefused('locked', `another run holds the lock ${file} (run ${held.runId}, taken ${held.startedAt.toISOString()}): the Desk does not run twice at once`);
}

/**
 * Take the lock of the runs in `runsDir`, which is created if it is not there. The lock file is made with the exclusive flag, so of two runs that
 * start together only one gets it; it says which run holds it and since when. Resolves to the function that releases the lock (it may be called
 * twice). Throws `RunRefused` when the lock is there, and leaves it as it is.
 */
export async function takeRunLock(runsDir: string, now: Date, runId: string): Promise<() => Promise<void>> {
  const file = path.join(runsDir, LOCK_FILE);
  await mkdir(runsDir, { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify({ pid: process.pid, runId, startedAt: now.toISOString() })}\n`, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw await refusalFor(file, now);
  }
  return () => rm(file, { force: true });
}
