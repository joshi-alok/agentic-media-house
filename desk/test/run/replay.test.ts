import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CLAIMS, DEMO_REPLY, clearingVerifier } from '../../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoRegistry } from '../../src/demo/world';
import { FetchError } from '../../src/fetch/http';
import { FakeClient } from '../../src/model/fake';
import type { ModelRequest } from '../../src/model/types';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { REPLAYED, refusingFetcher, replayRun } from '../../src/run/replay';
import type { ReplayOptions } from '../../src/run/replay';
import { extractSystem } from '../../src/prompts/extract';
import { splitIntoParts } from '../../src/stages/page-parts';
import { SELECT, recordOf, setupRun, unentailed } from '../support/run';
import type { RunSetup } from '../support/run';
import { useScratch } from '../support/context';
import { blocksOf } from '../support/prompts';
import { filesBelow } from '../support/site';

// A replay runs Extract, Compose and Verify again from what a run kept: the pages in the evidence store, the replies of the model in the cassettes, and
// the artifacts of the run. These tests make runs in the made-up world that record their cassettes, and replay them.

const scratch = useScratch();

/** A run that records its cassettes, run, and what a replay of it needs. */
async function recordedRun(options: RunSetup = {}) {
  const made = setupRun(scratch, { record: true, ...options });
  const result = await made.run();
  const replay: ReplayOptions = { config: made.config, sources: demoRegistry(), evidence: new LocalEvidenceStore(made.config.evidenceDir), ledgerDir: made.base.ledgerDir, stateFile: made.base.stateFile };
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

  it('takes the profile from the record of the run and not from the settings it is given', async () => {
    const { dir, replay } = await recordedRun({ config: { profile: 'brief' } });
    expect(recordOf(dir).profile).toBe('brief');
    const { profile: _profile, ...settings } = replay.config;
    const report = await replayRun(dir, { ...replay, config: settings });
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
  });

  it('replays a piece that was revised and held, with the replies of the revisions that were recorded', async () => {
    const { dir, replay, result } = await recordedRun({ fake: unentailed() });
    expect(result.outcome).toBe('held');
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts.map((artifact) => artifact.status)).toEqual(['equal', 'equal', 'equal']);
    expect(report.equal).toBe(true);
  });

  it('replays a run whose last ordinary rewrite brought a blocker of the gate and whose extra round mended it, with 3 rounds of revision recorded, finding the artifacts equal', async () => {
    const rejecting = (request: ModelRequest<unknown>) => {
      const reply = clearingVerifier(request);
      return { ...reply, verdicts: reply.verdicts.map((verdict, at) => (at === 0 ? { ...verdict, reason: 'The passages do not say it.', missing: ['what the passages do not say'], verdict: 'not_entailed' as const } : verdict)) };
    };
    const retitled = (text: string) => ({ replacements: [{ id: 's0', sentence: { kind: 'fact' as const, text, claimIds: ['c-1'] } }] });
    const fake = new FakeClient()
      .script('select', SELECT)
      .script('extract', { claims: DEMO_CLAIMS })
      .script(
        'compose',
        DEMO_REPLY,
        retitled('Fixture Robotics begins FX-1 deliveries to a second plant'),
        // the last of the two ordinary rewrites brings a number that no claim has
        retitled('Fixture Robotics begins FX-1 deliveries to 9 more plants'),
        // a title of its own: a draft that is the same as an earlier one is the same request, and so the same cassette
        retitled('Fixture Robotics starts FX-1 deliveries to a second Brindle Logistics plant'),
      )
      .script('verify', rejecting, rejecting, clearingVerifier);
    const { dir, replay, result } = await recordedRun({ fake });
    expect(result.outcome).toBe('published');
    const stored = read(path.join(dir, '06-verify.json')) as { rounds: number; history: { gate: { route: string }; sent: string[] }[] };
    expect(stored.rounds).toBe(3);
    expect(stored.history.map((pass) => [pass.gate.route, pass.sent])).toEqual([['publish', ['s0']], ['publish', ['s0']], ['revise', ['s0']], ['publish', []]]);
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts).toEqual(REPLAYED.map((name) => ({ name, status: 'equal', detail: null })));
    expect(report.equal).toBe(true);
  });

  it('replays a run that lowered a status that the model check did not find, finding the artifacts equal: the lowering follows from the reply that was recorded', async () => {
    const lowering = (request: ModelRequest<unknown>) => {
      const reply = clearingVerifier(request);
      return { ...reply, labels: reply.labels.map((label) => (label.id === 'c-5' ? { ...label, statusSupported: false, reason: 'The passage does not say it is planned.' } : label)) };
    };
    const fake = new FakeClient().script('select', SELECT).script('extract', { claims: DEMO_CLAIMS }).script('compose', DEMO_REPLY).script('verify', lowering);
    const { dir, replay, result } = await recordedRun({ fake });
    expect(result.outcome).toBe('published');
    expect((read(path.join(dir, '06-verify.json')) as { lowered: unknown[] }).lowered).toHaveLength(1);
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts).toEqual(REPLAYED.map((name) => ({ name, status: 'equal', detail: null })));
    expect(report.equal).toBe(true);
    expect(report.log).toContain('verify: the status of c-5 is lowered from planned to unspecified (the model check did not find it in the passage)');
  });

  it('replays a record that has no list of lowerings as it did before, and finds it different when the list is added to it by hand', async () => {
    const { dir, replay } = await recordedRun();
    const stored = read(path.join(dir, '06-verify.json')) as Record<string, unknown>;
    expect('lowered' in stored).toBe(false);
    expect((await replayRun(dir, replay)).equal).toBe(true);
    write(path.join(dir, '06-verify.json'), { ...stored, lowered: [{ round: 0, claimId: 'c-5', from: 'planned', to: 'unspecified', reason: 'x' }] });
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.name === '06-verify')).toMatchObject({ status: 'different', detail: 'lowered was not replayed' });
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

  it('replays a run whose record is from before records said how a run was made, which has no client, sources or attempt', async () => {
    const { dir, replay } = await recordedRun();
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = read(path.join(dir, 'run.json')) as Record<string, unknown>;
    write(path.join(dir, 'run.json'), before);
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
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

describe('replayRun: a run that read its page in parts (extractChunkWords)', () => {
  // The made-up release has 119 words in nine lines and the article of the outlet that cites it fewer; with parts of about 40 words the release is read in three calls and the article in two
  // (the pages of a story are read one after the other, the release first). The replies are matched to the calls by the key of the request (`requestKey`: the
  // role, the model, the system prompt, the user message and the schema of the reply), and the user message of each part says which part it is, so each call has a key of its own and a
  // cassette of its own. The record of the run says the size of the parts, so a replay reads the page in the parts the run did, whatever the settings it is given.
  const SIZE = 40;
  /** The model of the made-up story, answering each part with the claims whose quotations the part holds. */
  const partListing = (request: ModelRequest<unknown>) => {
    const shown = blocksOf(request.user)[0]?.text ?? '';
    return { claims: DEMO_CLAIMS.filter((claim) => shown.includes(claim.quote)) };
  };
  const parted = (): FakeClient =>
    new FakeClient().script('select', SELECT).script('extract', partListing, partListing, partListing, partListing, partListing).script('compose', DEMO_REPLY).script('verify', clearingVerifier);

  const cassettesOf = (dir: string) =>
    readdirSync(path.join(dir, 'cassettes')).map((name) => read(path.join(dir, 'cassettes', name)) as { key: string; request: { role: string; userHash: string } });

  it('records one reply for each part, in a cassette of its own, and replays them to the same artifacts', async () => {
    const { dir, replay, result, fake } = await recordedRun({ config: { extractChunkWords: SIZE }, fake: parted() });
    expect(result.outcome).toBe('published');
    expect(fake.calls.filter((call) => call.role === 'extract')).toHaveLength(5);
    const fetched = read(path.join(dir, '03-fetch.json')) as { documents: { hash: string }[] };
    const evidence = new LocalEvidenceStore(replay.config.evidenceDir);
    expect(fetched.documents).toHaveLength(2);
    expect(splitIntoParts((await evidence.get(fetched.documents[0]?.hash as string)).text, SIZE)).toHaveLength(3);
    expect(splitIntoParts((await evidence.get(fetched.documents[1]?.hash as string)).text, SIZE)).toHaveLength(2);
    // select, three parts of the release, two parts of the article, compose, verify
    const cassettes = cassettesOf(dir);
    expect(cassettes.map((cassette) => cassette.request.role).sort()).toEqual(['compose', 'extract', 'extract', 'extract', 'extract', 'extract', 'select', 'verify']);
    expect(new Set(cassettes.map((cassette) => cassette.key)).size).toBe(8);
    expect(new Set(cassettes.filter((cassette) => cassette.request.role === 'extract').map((cassette) => cassette.request.userHash)).size).toBe(5);
    expect(recordOf(dir).budget.spent.calls).toBe(8);
    expect(recordOf(dir).artifacts).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json']);

    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.artifacts).toEqual(REPLAYED.map((name) => ({ name, status: 'equal', detail: null })));
    expect(report.equal).toBe(true);
    expect(report.log).toContain(`extract: ${DEMO_URLS.release} is read in 3 parts`);
    expect(report.log).toContain(`extract: ${DEMO_URLS.mercerArticle} is read in 2 parts`);
    expect(report.log).toContain('extract: 7 claims proposed, 7 kept, 0 dropped');
  });

  it('reads the pages whole, in the one call that it always made for all of them, when no page is more than one part: a size of 400 on the made-up world is the run without a size, the same cassettes included', async () => {
    const plain = await recordedRun();
    const sized = await recordedRun({ config: { extractChunkWords: 400 } });
    expect(sized.result.outcome).toBe('published');
    expect(sized.fake.calls.filter((call) => call.role === 'extract')).toHaveLength(1);
    expect(recordOf(sized.dir).extractChunkWords).toBe(400);
    expect(sized.logs.some((line) => line.includes('is read in'))).toBe(false);
    // the same requests, so the same keys of the cassettes, and the same artifacts
    expect(cassettesOf(sized.dir).map((cassette) => cassette.key).sort()).toEqual(cassettesOf(plain.dir).map((cassette) => cassette.key).sort());
    for (const name of REPLAYED) expect(readFileSync(path.join(sized.dir, `${name}.json`), 'utf8'), name).toBe(readFileSync(path.join(plain.dir, `${name}.json`), 'utf8'));
    // it replays equal, with the size of the record or without any
    expect((await replayRun(sized.dir, sized.replay)).equal).toBe(true);
    const { extractChunkWords: _none, ...without } = sized.replay.config;
    expect((await replayRun(sized.dir, { ...sized.replay, config: without })).equal).toBe(true);
    // a record with no size replays whole, whatever the settings now say
    expect((await replayRun(plain.dir, { ...plain.replay, config: { ...plain.replay.config, extractChunkWords: 400 } })).equal).toBe(true);
  });

  it('reads a page that is one part in a call of its own when another page of the story is several: the release in two parts and the article, one part, are three calls, and the replay is equal', async () => {
    // 50 words: the release (119 words) is two parts, the article (68 words) is one
    const fake = new FakeClient().script('select', SELECT).script('extract', partListing, partListing, partListing).script('compose', DEMO_REPLY).script('verify', clearingVerifier);
    const { dir, replay, result } = await recordedRun({ config: { extractChunkWords: 50 }, fake });
    expect(result.outcome).toBe('published');
    const extracts = fake.calls.filter((call) => call.role === 'extract');
    expect(extracts).toHaveLength(3);
    expect(extracts.map((call) => blocksOf(call.user).map((block) => block.id))).toEqual([['1'], ['1'], ['1']]);
    expect(extracts.map((call) => /The text is part (\d) of (\d)|The page has about (\d+) words/.exec(call.user)?.[0])).toEqual(['The text is part 1 of 2', 'The text is part 2 of 2', 'The page has about 70 words']);
    expect(extracts.map((call) => call.system === extractSystem({ inParts: true }))).toEqual([true, true, false]);
    expect(recordOf(dir).budget.spent.calls).toBe(6);
    const report = await replayRun(dir, replay);
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
    expect(report.log).toContain(`extract: ${DEMO_URLS.release} is read in 2 parts`);
    expect(report.log.some((line) => line.includes(`${DEMO_URLS.mercerArticle} is read in`))).toBe(false);
  });

  it('keeps the numbers of the claims of the story, which are the order of the page, so that the piece cites what it cited', async () => {
    const { dir } = await recordedRun({ config: { extractChunkWords: SIZE }, fake: parted() });
    const stored = read(path.join(dir, '04-extract.json')) as { claims: { id: string; text: string }[]; dropped: unknown[] };
    expect(stored.claims.map((claim) => claim.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7']);
    expect(stored.claims.map((claim) => claim.text)).toEqual(DEMO_CLAIMS.map((claim) => claim.text));
    expect(stored.dropped).toEqual([]);
  });

  it('takes the size of the parts from the record of the run and not from the settings it is given: with none, or another, the replay reads the page as the run did', async () => {
    const { dir, replay } = await recordedRun({ config: { extractChunkWords: SIZE }, fake: parted() });
    expect(recordOf(dir).extractChunkWords).toBe(SIZE);
    const { extractChunkWords: _none, ...without } = replay.config;
    expect((await replayRun(dir, { ...replay, config: without })).equal).toBe(true);
    expect((await replayRun(dir, { ...replay, config: { ...replay.config, extractChunkWords: 400 } })).equal).toBe(true);
  });

  it('replays a run that read its page whole, with settings that now name a size of parts: the record has none, so the page is read whole', async () => {
    const { dir, replay } = await recordedRun();
    expect(recordOf(dir)).not.toHaveProperty('extractChunkWords');
    const report = await replayRun(dir, { ...replay, config: { ...replay.config, extractChunkWords: SIZE } });
    expect(report.error).toBeNull();
    expect(report.equal).toBe(true);
    expect(report.log.some((line) => line.includes('is read in'))).toBe(false);
  });

  it('replays a record from before records said how a run was made, and a record that has no size of parts, as it always did', async () => {
    const { dir, replay } = await recordedRun({ config: { extractChunkWords: SIZE }, fake: parted() });
    const { client: _client, sources: _sources, attempt: _attempt, ...before } = read(path.join(dir, 'run.json')) as Record<string, unknown>;
    write(path.join(dir, 'run.json'), before);
    expect((await replayRun(dir, replay)).equal).toBe(true);
  });

  it('reports the part whose reply was never recorded, as the reply of a request that is not on file', async () => {
    const { dir, replay } = await recordedRun({ config: { extractChunkWords: SIZE }, fake: parted() });
    const second = cassettesOf(dir).filter((cassette) => cassette.request.role === 'extract')[1];
    rmSync(path.join(dir, 'cassettes', `${second?.key}.json`));
    const report = await replayRun(dir, replay);
    expect(report.equal).toBe(false);
    expect(report.error).toContain('no recorded response for this extract request');
    expect(report.artifacts.map((artifact) => [artifact.name, artifact.status])).toEqual([['04-extract', 'missing'], ['05-compose', 'missing'], ['06-verify', 'missing']]);
  });
});
