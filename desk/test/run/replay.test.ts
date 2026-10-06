import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS } from '../../src/demo/story';
import { DEMO_DATE, demoRegistry } from '../../src/demo/world';
import { FetchError } from '../../src/fetch/http';
import { FakeClient } from '../../src/model/fake';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { REPLAYED, refusingFetcher, replayRun } from '../../src/run/replay';
import type { ReplayOptions } from '../../src/run/replay';
import { SELECT, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { useScratch } from '../support/context';
import { filesBelow } from '../support/site';

// A replay runs Extract, Compose and Verify again from what a run kept: the pages in the evidence store, the replies of the model in the cassettes, and
// the artifacts of the run. These tests make runs in the made-up world that record their cassettes, and replay them.

const scratch = useScratch();

/** A run that records its cassettes, run, and what a replay of it needs. */
async function recordedRun(options: RunSetup = {}) {
  const made = setupRun(scratch, { record: true, ...options });
  const result = await made.run();
  const replay: ReplayOptions = { config: made.config, sources: demoRegistry(), evidence: new LocalEvidenceStore(made.config.evidenceDir), ledgerDir: made.base.ledgerDir };
  return { ...made, result, replay };
}

const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const write = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

describe('replayRun: a run that is replayed as it was', () => {
  it('finds every artifact that it makes again equal to the one the run stored', async () => {
    const { dir, replay, result } = await recordedRun();
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(true);
    expect(report.error).toBeNull();
    expect(report.runId).toBe(result.runId);
    expect(report.artifacts).toEqual(REPLAYED.map((name) => ({ name, status: 'equal', detail: null })));
    expect(REPLAYED).toEqual(['04-extract', '05-compose', '06-verify']);
  });

  it('replays a piece that was revised and held, with the replies of the revisions that were recorded', async () => {
    const { dir, replay, result } = await recordedRun({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts.map((artifact) => artifact.status)).toEqual(['equal', 'equal', 'equal']);
    expect(report.equal).toBe(true);
  });

  it('replays a run that stopped at Extract, which has the artifact of that stage and no more', async () => {
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS.slice(0, 2) });
    const { dir, replay, result } = await recordedRun({ fake });
    expect(result.outcome).toBe('no-story');
    const report = await replayRun(dir, replay);
    expect(report.artifacts).toEqual([{ name: '04-extract', status: 'equal', detail: null }]);
    expect(report.equal).toBe(true);
  });

  it('does not list the cassettes of a run among its artifacts, though they are in its folder', async () => {
    const { dir } = await recordedRun();
    expect(filesBelow(dir).filter((name) => name.startsWith('cassettes/'))).toHaveLength(4);
    expect(recordOf(dir).artifacts).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json']);
  });

  it('logs what the stages logged, as the run did', async () => {
    const { dir, replay } = await recordedRun();
    const report = await replayRun(dir, replay);
    expect(report.log).toContain('extract: 7 claims proposed, 7 kept, 0 dropped');
    expect(report.log.some((line) => line.startsWith('verify: round 0'))).toBe(true);
  });

  it('makes no call to the fetcher, and refuses one by default: a replay does not use the network', async () => {
    const { dir, replay } = await recordedRun();
    const requests: string[] = [];
    const counting = {
      async get(url: string): Promise<never> {
        requests.push(url);
        throw new FetchError('network', url, 'no network in a replay');
      },
    };
    const report = await replayRun(dir, { ...replay, fetcher: counting });
    expect(report.equal).toBe(true);
    expect(requests).toEqual([]);
    expect((await replayRun(dir, replay)).equal).toBe(true);
  });

  it('writes nothing into the folder of the run, and leaves no folder of its own behind', async () => {
    const { dir, replay } = await recordedRun();
    const before = filesBelow(dir);
    const workDir = scratch();
    await replayRun(dir, { ...replay, workDir });
    expect(filesBelow(dir)).toEqual(before);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('makes its folder in the folder it is told to, and removes it when the replay fails, too', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    const workDir = scratch();
    const report = await replayRun(dir, { ...replay, workDir });
    expect(report.error).not.toBeNull();
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('has a fetcher of its own that refuses every request, for a replay that is not given one', async () => {
    await expect(refusingFetcher.get('https://fixture-robotics.example/news')).rejects.toThrow('https://fixture-robotics.example/news: a replay does not use the network');
  });

  it('takes the cassettes from the folder it is given, when that is not the one in the run', async () => {
    const { dir, replay } = await recordedRun();
    const elsewhere = scratch();
    for (const name of readdirSync(path.join(dir, 'cassettes'))) writeFileSync(path.join(elsewhere, name), readFileSync(path.join(dir, 'cassettes', name)));
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    expect((await replayRun(dir, { ...replay, cassetteDir: elsewhere })).equal).toBe(true);
  });
});

describe('replayRun: what it finds that is not as the run left it', () => {
  it('detects an artifact that was changed, and says where', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const stored = read(file) as { claims: { label: string }[] };
    (stored.claims[0] as { label: string }).label = 'a label that the run never wrote';
    write(file, stored);
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.name === '04-extract')).toEqual({
      name: '04-extract',
      status: 'different',
      detail: 'claims[0].label: stored "a label that the run never wrote", replayed "second plant"',
    });
    expect(report.artifacts.filter((artifact) => artifact.status === 'equal').map((artifact) => artifact.name)).toEqual(['05-compose', '06-verify']);
  });

  it('detects a verdict that was changed', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '06-verify.json');
    write(file, { ...(read(file) as object), rounds: 0, outcome: 'hold' });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.name === '06-verify')?.detail).toBe('outcome: stored "hold", replayed "publish"');
  });

  it('says that something was not stored, or not replayed, when an item or a field is missing', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as { claims: unknown[]; dropped: unknown[] };
    const detailOf = async (change: (copy: Record<string, unknown>) => void): Promise<string | null> => {
      const copy = structuredClone(original) as unknown as Record<string, unknown>;
      change(copy);
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    expect(await detailOf((copy) => (copy.claims as unknown[]).pop())).toBe('claims[6] was not stored');
    expect(await detailOf((copy) => (copy.claims as unknown[]).push((copy.claims as unknown[])[0]))).toBe('claims[7] was not replayed');
    expect(await detailOf((copy) => delete copy.dropped)).toBe('dropped was not stored');
    expect(await detailOf((copy) => (copy.extra = 1))).toBe('extra was not replayed');
  });

  it('shows each value in full up to 60 characters, and cuts a longer one to 57 and three dots', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as { claims: { label: string }[] };
    const detailOf = async (label: string): Promise<string | null> => {
      const copy = structuredClone(original);
      (copy.claims[0] as { label: string }).label = label;
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    // The text of a value is its JSON, with the quotes: 58 characters make 60, which is shown in full; 59 make 61, which is cut.
    expect(await detailOf('a'.repeat(58))).toBe(`claims[0].label: stored "${'a'.repeat(58)}", replayed "second plant"`);
    expect(await detailOf('a'.repeat(59))).toBe(`claims[0].label: stored ${JSON.stringify('a'.repeat(59)).slice(0, 57)}..., replayed "second plant"`);
  });

  it('says what differs when a value is not of the kind the replay made: a list for an object, an object for a list, an object for a text', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const original = read(file) as Record<string, unknown>;
    const detailOf = async (change: (copy: Record<string, unknown>) => void): Promise<string | null> => {
      const copy = structuredClone(original);
      change(copy);
      write(file, copy);
      return (await replayRun(dir, replay)).artifacts[0]?.detail ?? null;
    };
    expect(await detailOf((copy) => (copy.dropped = { none: true }))).toBe('dropped: stored {"none":true}, replayed []');
    expect(await detailOf((copy) => (copy.claims = {}))).toMatch(/^claims: stored \{\}, replayed \[\{"basis"/);
    expect(await detailOf((copy) => (copy.date = { day: 5 }))).toBe('date: stored {"day":5}, replayed "2026-10-05"');
    expect(await detailOf((copy) => (copy.date = ['2026-10-05']))).toBe('date: stored ["2026-10-05"], replayed "2026-10-05"');
  });

  it('reports the differences in the order of the names of the fields, which is not the order of the files', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    const copy = read(file) as Record<string, unknown>;
    delete copy.dropped;
    copy.extra = 1;
    write(file, copy);
    expect((await replayRun(dir, replay)).artifacts[0]?.detail).toBe('dropped was not stored');
  });

  it('says that the files differ when only their layout does: the same data, written another way', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '04-extract.json');
    writeFileSync(file, JSON.stringify(read(file)));
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts[0]).toEqual({ name: '04-extract', status: 'different', detail: 'the files differ' });
  });

  it('says unexpected for an artifact that the run does not have and the replay makes', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, '05-compose.json'));
    rmSync(path.join(dir, '06-verify.json'));
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'equal'], ['05-compose', 'unexpected'], ['06-verify', 'unexpected']]);
  });

  it('reports a reply that was never recorded, and the artifacts it did not get to as missing', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'cassettes'), { recursive: true });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this extract request');
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'missing'], ['05-compose', 'missing'], ['06-verify', 'missing']]);
  });

  it('reports a request that is not the one that was recorded, which is what a changed prompt or model looks like', async () => {
    const { dir, replay } = await recordedRun();
    const report = await replayRun(dir, { ...replay, config: { ...replay.config, models: { ...replay.config.models, extract: 'model-b' } } });
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this extract request');
  });

  it('reports evidence that has been changed since the run, and evidence that is gone', async () => {
    const { dir, replay, config } = await recordedRun();
    const names = readdirSync(config.evidenceDir).filter((name) => name.endsWith('.txt'));
    expect(names.length).toBe(2);
    const file = path.join(config.evidenceDir, names[0] as string);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, `${text} changed`);
    expect((await replayRun(dir, replay)).error).toContain('has been changed');
    rmSync(file);
    expect((await replayRun(dir, replay)).error).toContain('no evidence is stored for');
  });

  it('does not see a piece that was published after the run began: not a later run of the same day, and not one of a later day', async () => {
    const { dir, replay, result } = await recordedRun();
    const own = read(path.join(replay.ledgerDir, `${result.slug}.json`)) as { runId: string; publishedAt: string };
    expect(own.runId).toBe('2026-10-05-043100');
    write(path.join(replay.ledgerDir, 'later.json'), { ...own, runId: '2026-10-05-050000' });
    write(path.join(replay.ledgerDir, 'tomorrow.json'), { ...own, runId: '2026-10-06-040000', publishedAt: '2026-10-06' });
    expect((await replayRun(dir, replay)).equal).toBe(true);
  });

  it('does see a piece that was published before the run began, earlier that day or before: its title is a duplicate, so the draft goes back, and the revision was never recorded', async () => {
    const { dir, replay, result } = await recordedRun();
    const own = read(path.join(replay.ledgerDir, `${result.slug}.json`)) as { runId: string; publishedAt: string };
    rmSync(path.join(replay.ledgerDir, `${result.slug}.json`));
    write(path.join(replay.ledgerDir, 'earlier.json'), { ...own, runId: '2026-10-05-000000' });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this compose request');
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'equal'], ['05-compose', 'missing'], ['06-verify', 'missing']]);
  });
});

describe('replayRun: a folder that cannot be replayed', () => {
  it('throws for a folder that has no record of a run', async () => {
    const { dir, replay } = await recordedRun();
    rmSync(path.join(dir, 'run.json'));
    await expect(replayRun(dir, replay)).rejects.toThrow(`the run record run.json is not in ${dir}`);
  });

  it('throws for a run that stopped before Fetch, which has nothing to start from', async () => {
    const fake = new FakeClient().script('select', { chosenId: null, reasons: ['Nothing new today.'] });
    const { dir, replay } = await recordedRun({ fake });
    await expect(replayRun(dir, replay)).rejects.toThrow('the artifact 03-fetch.json is not in');
  });

  it('reports a run whose pages were never fetched as an error of the replay, because Extract needs a page', async () => {
    const { dir, replay } = await recordedRun();
    const file = path.join(dir, '03-fetch.json');
    write(file, { ...(read(file) as object), documents: [] });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('runExtract needs at least one page');
  });

  it('is for the day of the run: it reads the date from the record', async () => {
    const { dir } = await recordedRun();
    expect(recordOf(dir).date).toBe(DEMO_DATE);
  });
});
