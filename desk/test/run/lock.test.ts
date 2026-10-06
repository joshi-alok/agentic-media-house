import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCK_FILE, RunRefused, STALE_LOCK_MS, takeRunLock } from '../../src/run/lock';
import { useScratch } from '../support/context';

// Two runs of the Desk at once would write the same folders and could commit over each other, so a run takes a lock first. The lock is a file made
// in a way that fails if it is already there; it is removed when the run ends, however it ends. A lock that is a day old is not removed by the next
// run: that run says so, and the owner decides, because a lock that is old may belong to a run that is still going.

const scratch = useScratch();
const NOW = new Date('2026-10-05T04:31:00.000Z');

const lockFileOf = (runsDir: string): string => path.join(runsDir, LOCK_FILE);

describe('takeRunLock', () => {
  it('makes the lock file, and creates the folder of the runs when it is not there', async () => {
    const runsDir = path.join(scratch(), 'runs');
    await takeRunLock(runsDir, NOW, '2026-10-05-043100');
    expect(existsSync(lockFileOf(runsDir))).toBe(true);
  });

  it('names the file .lock, writes who holds it and since when, and no more', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, NOW, '2026-10-05-043100');
    expect(LOCK_FILE).toBe('.lock');
    expect(JSON.parse(readFileSync(lockFileOf(runsDir), 'utf8'))).toEqual({ pid: process.pid, runId: '2026-10-05-043100', startedAt: '2026-10-05T04:31:00.000Z' });
  });

  it('gives back a function that removes the lock, and removing it twice does no harm', async () => {
    const runsDir = scratch();
    const release = await takeRunLock(runsDir, NOW, 'a');
    await release();
    expect(existsSync(lockFileOf(runsDir))).toBe(false);
    await expect(release()).resolves.toBeUndefined();
  });

  it('can be taken again once it was released', async () => {
    const runsDir = scratch();
    await (await takeRunLock(runsDir, NOW, 'a'))();
    await expect(takeRunLock(runsDir, NOW, 'b')).resolves.toBeTypeOf('function');
  });

  it('refuses while another run holds it, says who and since when, and leaves the lock as it is', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, NOW, 'first');
    const before = readFileSync(lockFileOf(runsDir), 'utf8');
    const later = new Date(NOW.getTime() + 60_000);
    const error = await takeRunLock(runsDir, later, 'second').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RunRefused);
    expect((error as RunRefused).kind).toBe('locked');
    expect((error as RunRefused).message).toContain(`another run holds the lock ${lockFileOf(runsDir)}`);
    expect((error as RunRefused).message).toContain('run first');
    expect((error as RunRefused).message).toContain('2026-10-05T04:31:00.000Z');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe(before);
  });

  it('only one of two runs that start together gets the lock', async () => {
    const runsDir = scratch();
    const results = await Promise.allSettled([takeRunLock(runsDir, NOW, 'a'), takeRunLock(runsDir, NOW, 'b')]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('reports a lock that is more than a day old as stale, with its age in hours, and does not remove it', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, new Date(NOW.getTime() - STALE_LOCK_MS - 3 * 3_600_000 - 5 * 60_000), 'crashed');
    const before = readFileSync(lockFileOf(runsDir), 'utf8');
    const error = await takeRunLock(runsDir, NOW, 'next').catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('stale-lock');
    expect((error as RunRefused).message).toContain('was taken 27 hours ago');
    expect((error as RunRefused).message).toContain('run crashed');
    expect((error as RunRefused).message).toContain('delete the file');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe(before);
  });

  it('counts a lock as stale only after a whole day: a lock of exactly 24 hours is not, and one a minute older is', async () => {
    const runsDir = scratch();
    await takeRunLock(runsDir, new Date(NOW.getTime() - STALE_LOCK_MS), 'x');
    expect(((await takeRunLock(runsDir, NOW, 'y').catch((caught: unknown) => caught)) as RunRefused).kind).toBe('locked');
    const other = scratch();
    await takeRunLock(other, new Date(NOW.getTime() - STALE_LOCK_MS - 60_000), 'x');
    expect(((await takeRunLock(other, NOW, 'y').catch((caught: unknown) => caught)) as RunRefused).kind).toBe('stale-lock');
  });

  it('treats a lock that it cannot read as held, and says it cannot read it', async () => {
    const runsDir = scratch();
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(lockFileOf(runsDir), 'not json');
    const error = await takeRunLock(runsDir, NOW, 'a').catch((caught: unknown) => caught);
    expect((error as RunRefused).kind).toBe('locked');
    expect((error as RunRefused).message).toContain('cannot be read');
    expect(readFileSync(lockFileOf(runsDir), 'utf8')).toBe('not json');
  });

  it('treats a lock that lacks the run, or the start time, or has either of the wrong kind, the same way', async () => {
    const holders = [{ pid: 1 }, { runId: 'x' }, { runId: 'x', startedAt: 'a day ago' }, { startedAt: '2026-10-05T04:31:00.000Z' }, { runId: 5, startedAt: '2026-10-05T04:31:00.000Z' }, { runId: 'x', startedAt: 20261005 }];
    for (const holder of holders) {
      const runsDir = scratch();
      writeFileSync(lockFileOf(runsDir), JSON.stringify(holder));
      const error = await takeRunLock(runsDir, NOW, 'a').catch((caught: unknown) => caught);
      expect((error as RunRefused).kind, JSON.stringify(holder)).toBe('locked');
      expect((error as RunRefused).message, JSON.stringify(holder)).toContain('cannot be read');
    }
  });
});

describe('RunRefused', () => {
  it('is an error with a kind, and a name that says what it is', () => {
    const error = new RunRefused('date-done', 'the run is done');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RunRefused');
    expect(error.kind).toBe('date-done');
    expect(error.message).toBe('the run is done');
  });
});
