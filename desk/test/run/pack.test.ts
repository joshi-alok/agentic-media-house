import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_DATE } from '../../src/demo/world';
import { FakeClient } from '../../src/model/fake';
import { MAX_PACK_BYTES, MAX_PACK_FILE_BYTES, PackError, PackedRun, PackedStage, packArtifact, packRun } from '../../src/run/pack';
import { useScratch } from '../support/context';
import { HOSTILE, MARKER, hostileFiles, writeHostileRun } from '../support/hostile-run';
import { SELECT, setupRun, unentailed } from '../support/run';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import { filesBelow } from '../support/site';
import { secretsIn } from '../support/secrets';

// The pack of a run: what is uploaded as the artifact of the daily workflow, in a repository that anyone can read. It is made by naming the fields that go in and copying nothing else,
// and these tests try to make something else go in: a run whose every field of free text is a hostile string of 10,000 characters, a field that a stage adds, a code that is not on
// the list, a shape that is wrong, and a run that is too big to pack.

const scratch = useScratch();

/** The shapes that every string of a pack has: a hash, a day or a time, a code, a model name, or a one-word name. Nothing that has a space in it, and nothing long, and so no prose. */
const SAFE = [
  /^[0-9a-f]{12}$/,
  /^[0-9a-f]{40}$/,
  /^[0-9a-f]{64}$/,
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{4}-\d{2}-\d{2}-\d{6}$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  /^[A-Z][A-Z0-9_]{1,63}$/,
  /^G(?:[1-9]|10)$/,
  /^claude-[a-z0-9.-]{1,56}$/,
  /^\d{2}-[a-z][a-z0-9-]{0,30}(?:\.json)?$/,
  /^[a-z][a-z0-9_-]{0,31}$/,
  /^[A-Za-z][A-Za-z0-9]{0,23}$/,
];

/** Every string in a value read from JSON, the names of the fields included. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([name, inner]) => [name, ...stringsOf(inner)]);
  return [];
}

/** Say of a pack that every one of its strings has one of the shapes of `SAFE`, and the pack is valid and small. */
function expectSafe(pack: Record<string, string>): void {
  expect(Object.keys(pack).length).toBeGreaterThan(0);
  let total = 0;
  for (const [file, text] of Object.entries(pack)) {
    total += Buffer.byteLength(text, 'utf8');
    expect(Buffer.byteLength(text, 'utf8'), file).toBeLessThanOrEqual(MAX_PACK_FILE_BYTES);
    const data: unknown = JSON.parse(text);
    if (file === 'run.json') PackedRun.parse(data);
    else PackedStage.parse(data);
    for (const string of stringsOf(data)) expect(SAFE.some((shape) => shape.test(string)), `${file}: ${JSON.stringify(string.slice(0, 60))}`).toBe(true);
  }
  expect(total).toBeLessThanOrEqual(MAX_PACK_BYTES);
}

describe('packRun: a run whose every free text is a hostile string of 10,000 characters', () => {
  it('has nothing of any of them in the pack, in any file, in a name or in a value', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const pack = await packRun(dir);
    for (const [file, text] of Object.entries(pack)) {
      expect(text, file).not.toContain(MARKER);
      expect(text, file).not.toContain('IGNORE ALL');
      expect(text, file).not.toContain('evil.example');
      expect(text, file).not.toContain('<script>');
      expect(text.length, file).toBeLessThan(MAX_PACK_FILE_BYTES);
    }
    expectSafe(pack);
    // The hashes of the pages and the commit are in the pack on purpose: they are what lets a reader tie it to the folder. Nothing else in it is shaped like a secret.
    expect(secretsIn(Object.values(pack).join('\n').replace(/\b[0-9a-f]{40,64}\b/g, 'a-hash'))).toEqual([]);
    expect(HOSTILE.length).toBeGreaterThan(10_000);
  });

  it('is still a description of the run: its outcome, its stage, how long it took, which try it was, what it spent, and what each stage found, as numbers and codes', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const pack = await packRun(dir);
    expect(Object.keys(pack).sort()).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'run.json']);
    expect(JSON.parse(pack['run.json'] as string)).toEqual({
      version: 1,
      ended: true,
      runId: '2026-10-05-043100',
      date: '2026-10-05',
      startedAt: '2026-10-05T04:31:00.000Z',
      finishedAt: '2026-10-05T04:33:10.500Z',
      durationMs: 130_500,
      outcome: 'held',
      stage: 'hold',
      dry: false,
      client: 'api',
      sources: 'live',
      attempt: 2,
      commit: 'a'.repeat(40),
      models: { select: 'claude-haiku-4-5-20251001', compose: 'claude-sonnet-5-5', verify: 'claude-sonnet-5-5' },
      budget: { limit: { maxCalls: 24, maxInputTokens: 400000, maxOutputTokens: 60000 }, spent: { calls: 9, inputTokens: 51234, outputTokens: 7777 } },
      stages: ['01-discover', '02-select', '03-fetch', '04-extract', '05-compose', '06-verify'],
      unpacked: 1,
      files: { artifacts: 7, held: 1, cassettes: 2, logLines: 30 },
    });
    const stage = (name: string): Record<string, unknown> => JSON.parse(pack[`${name}.json`] as string) as Record<string, unknown>;
    expect(stage('01-discover')).toMatchObject({ candidates: 2, tier1: 1, tier2: 1, skipped: 1 });
    expect(stage('02-select')).toMatchObject({ chosen: true, chosenId: '2'.repeat(12), hasTier1: true, shortlist: 2 });
    expect(stage('03-fetch')).toMatchObject({ documents: [{ tier: 1, hash: 'b'.repeat(64), bytes: 4321 }], failures: 1 });
    expect(stage('04-extract')).toMatchObject({ claims: 1, dropped: 2, droppedByCode: { 'quote-not-found': 2, 'value-not-in-quote': 1 }, droppedOtherCodes: 1 });
    expect(stage('05-compose')).toMatchObject({ drafts: 1 });
    expect(stage('06-verify')).toMatchObject({
      outcome: 'hold',
      rounds: 1,
      route: 'hold',
      failureCodes: ['G4_NUMBER_UNSUPPORTED'],
      holdReasons: ['TIER2_ATTRIBUTION'],
      otherCodes: 2,
      verifier: { model: 'claude-sonnet-5-5', passed: false, notes: 2 },
    });
    expect((stage('06-verify').history as { verdicts: unknown }[])[1]?.verdicts).toEqual({ not_entailed: 2, ambiguous: 1, unsupported: 1, missing: 0 });
  });

  it('says which file each stage was made from, by length and hash, and never what is in it', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const { sourceBytes, sourceSha256 } = JSON.parse((await packRun(dir))['04-extract.json'] as string) as { sourceBytes: number; sourceSha256: string };
    const text = readFileSync(path.join(dir, '04-extract.json'), 'utf8');
    expect(sourceBytes).toBe(Buffer.byteLength(text, 'utf8'));
    expect(sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('packRun: the list of fields is the only way in', () => {
  it('does not take a field that a stage adds: a key that the pack does not name is in no file, whatever it holds', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    for (const name of ['01-discover', '04-extract', '06-verify']) {
      const file = path.join(dir, `${name}.json`);
      const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      writeFileSync(file, JSON.stringify({ ...data, aNewField: 'a-short-word', counts: { evil: 1 }, notes: ['note'] }));
    }
    const pack = await packRun(dir);
    for (const text of Object.values(pack)) {
      expect(text).not.toContain('aNewField');
      expect(text).not.toContain('a-short-word');
      expect(text).not.toContain('evil');
    }
  });

  it('does not take a status that was lowered, or its reason, which a model wrote: 06-verify.json is packed as before', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const before = await packRun(dir);
    const file = path.join(dir, '06-verify.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...data, lowered: [{ round: 0, claimId: 'c-1', from: 'planned', to: 'unspecified', reason: `the status "planned" is not supported: ${HOSTILE}` }] }));
    const pack = await packRun(dir);
    for (const [name, text] of Object.entries(pack)) {
      expect(text, name).not.toContain(MARKER);
      expect(text, name).not.toContain('lowered');
    }
    // The file is another file now (its length and hash are in the pack), and what is said of it is the same.
    const strip = (text: string | undefined): unknown => {
      const { sourceBytes: _bytes, sourceSha256: _hash, ...rest } = JSON.parse(text as string) as Record<string, unknown>;
      return rest;
    };
    expect(strip(pack['06-verify.json'])).toEqual(strip(before['06-verify.json']));
  });

  it('does not pack a stage that it does not know, and counts it', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const pack = await packRun(dir);
    expect(Object.keys(pack)).not.toContain('07-later-stage.json');
    expect((JSON.parse(pack['run.json'] as string) as { unpacked: number }).unpacked).toBe(1);
  });

  it('does not pack an artifact that does not have the fields of its stage, and counts it: a stage that changed its shape is not copied by guesswork', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    writeFileSync(path.join(dir, '04-extract.json'), JSON.stringify({ claims: 'not a list', dropped: [] }));
    writeFileSync(path.join(dir, '05-compose.json'), 'not json at all {');
    const pack = await packRun(dir);
    expect(Object.keys(pack).sort()).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '06-verify.json', 'run.json']);
    expect((JSON.parse(pack['run.json'] as string) as { unpacked: number }).unpacked).toBe(3);
  });

  it('counts a code that is not on the list and does not copy it: a claim code that Extract does not give, a gate code that the site has no label for', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const pack = await packRun(dir);
    expect(pack['04-extract.json']).not.toContain(MARKER);
    expect(JSON.parse(pack['04-extract.json'] as string)).toMatchObject({ droppedOtherCodes: 1 });
    expect(JSON.parse(pack['06-verify.json'] as string)).toMatchObject({ otherCodes: 2 });
  });

  it('counts what a stage found by its own numbers: the tiers of the candidates, the story that was chosen, and the codes that are not on the list, with no number that a run of one kind of each would also give', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const change = (name: string, edit: (data: Record<string, unknown>) => void): void => {
      const file = path.join(dir, `${name}.json`);
      const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      edit(data);
      writeFileSync(file, JSON.stringify(data));
    };
    change('01-discover', (data) => {
      data.candidates = [{ tier: 1 }, { tier: 1 }, { tier: 2 }, { tier: 2 }, { tier: 2 }];
    });
    change('02-select', (data) => {
      data.chosen = { id: '0123456789ab' };
    });
    change('06-verify', (data) => {
      const gate = data.gate as { failures: { code: string }[]; holdReasons: string[] };
      gate.failures = ['G4_NUMBER_UNSUPPORTED', 'NOT_ON_THE_LIST_ONE', 'NOT_ON_THE_LIST_TWO', HOSTILE].map((code) => ({ code }));
      gate.holdReasons = ['TIER2_ATTRIBUTION', 'NOT_ON_THE_LIST_THREE'];
    });
    const pack = await packRun(dir);
    expect(JSON.parse(pack['01-discover.json'] as string)).toMatchObject({ candidates: 5, tier1: 2, tier2: 3 });
    expect(JSON.parse(pack['02-select.json'] as string)).toMatchObject({ chosen: true, chosenId: '0123456789ab' });
    expect(JSON.parse(pack['06-verify.json'] as string)).toMatchObject({ failureCodes: ['G4_NUMBER_UNSUPPORTED'], holdReasons: ['TIER2_ATTRIBUTION'], otherCodes: 4 });
    // A chosen story whose id is not an id is a chosen story with no id in the pack, and no story at all is neither.
    change('02-select', (data) => {
      data.chosen = { id: HOSTILE };
    });
    expect(JSON.parse((await packRun(dir))['02-select.json'] as string)).toMatchObject({ chosen: true, chosenId: null });
    change('02-select', (data) => {
      data.chosen = null;
      data.tier1Url = null;
    });
    expect(JSON.parse((await packRun(dir))['02-select.json'] as string)).toMatchObject({ chosen: false, chosenId: null, hasTier1: false });
  });

  it('takes the codes of the closed list that the site has a label for, each once, and every hold reason too', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const file = path.join(dir, '06-verify.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as { gate: { failures: { code: string }[]; holdReasons: string[] } };
    const codes = Object.keys(REASON_LABELS).filter((code) => code.startsWith('G'));
    data.gate.failures = [...codes, ...codes].slice(0, 80).map((code) => ({ code }));
    data.gate.holdReasons = ['TIER2_ATTRIBUTION', 'G10_NOT_ENTAILED', 'TIER2_ATTRIBUTION'];
    writeFileSync(file, JSON.stringify(data));
    const packed = JSON.parse((await packRun(dir))['06-verify.json'] as string) as { failureCodes: string[]; holdReasons: string[] };
    expect(packed.failureCodes).toEqual(codes);
    expect(packed.holdReasons).toEqual(['TIER2_ATTRIBUTION', 'G10_NOT_ENTAILED']);
  });
});

describe('packRun: a folder that is not a whole run', () => {
  it('says that the run did not end, with what the stages that left a file say, when there is no record of the run', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    rmSync(path.join(dir, 'run.json'));
    const run = JSON.parse((await packRun(dir))['run.json'] as string) as Record<string, unknown>;
    expect(run).toMatchObject({ ended: false, runId: null, outcome: null, durationMs: null, budget: null, models: {}, stages: ['01-discover', '02-select', '03-fetch', '04-extract', '05-compose', '06-verify'] });
  });

  it('says that the run did not end, and nothing else, for a record that is not JSON or not a record', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'run.json'), '{"runId": ');
    expect(JSON.parse((await packRun(dir))['run.json'] as string)).toMatchObject({ ended: false, stages: [] });
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ runId: 5 }));
    expect(JSON.parse((await packRun(dir))['run.json'] as string)).toMatchObject({ ended: false });
  });

  it('packs an empty folder, and a folder that is not there, as a run with nothing in it', async () => {
    expect(JSON.parse((await packRun(scratch()))['run.json'] as string)).toMatchObject({ ended: false, stages: [], files: { artifacts: 0, held: 0, cassettes: 0, logLines: 0 } });
    expect(JSON.parse((await packRun(path.join(scratch(), 'nowhere')))['run.json'] as string)).toMatchObject({ ended: false });
  });

  it('takes a value that is not of the shape of its field for no value: a time that is not a time, a commit that is not a hash, a run id that is a sentence, a model that is a sentence', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const file = path.join(dir, 'run.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...data, runId: 'a sentence with spaces', startedAt: 'yesterday', commit: 'not-a-hash', attempt: -3, client: 'telepathy' }));
    expect(JSON.parse((await packRun(dir))['run.json'] as string)).toMatchObject({ ended: true, runId: null, startedAt: null, durationMs: null, commit: null, attempt: null, client: null });
  });

  it('keeps a time that is written with an offset from UTC, which is a time, and works out how long the run took from the two', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const file = path.join(dir, 'run.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...data, startedAt: '2026-10-05T06:31:00+02:00', finishedAt: '2026-10-05T04:33:10Z' }));
    expect(JSON.parse((await packRun(dir))['run.json'] as string)).toMatchObject({ startedAt: '2026-10-05T06:31:00+02:00', finishedAt: '2026-10-05T04:33:10Z', durationMs: 130_000 });
  });
});

describe('packRun: the size', () => {
  it('is an error, and says how big, when one file is bigger than the cap for a file: a verification with a long history and every code in each round', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const file = path.join(dir, '06-verify.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as { gate: { route: string; failures: unknown[]; holdReasons: string[]; checks: object }; history: unknown[] };
    const codes = Object.keys(REASON_LABELS).filter((code) => code.startsWith('G')).slice(0, 60);
    const round = (at: number) => ({ round: at, gate: { ...data.gate, failures: codes.map((code) => ({ code })) }, verifier: null, verifierFailures: [], sent: [] });
    data.history = Array.from({ length: 12 }, (_, at) => round(at));
    writeFileSync(file, JSON.stringify(data));
    await expect(packRun(dir)).rejects.toThrow(PackError);
    await expect(packRun(dir)).rejects.toThrow(/the packed 06-verify\.json is \d+ bytes, and a file of a pack has at most 8192/);
  });

  it('is an error, and says how big, when the pack as a whole is bigger than its cap, which it can only be by a run that has every stage at its largest', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    await expect(packRun(dir, { file: MAX_PACK_FILE_BYTES, total: 1000 })).rejects.toThrow(/the pack is \d+ bytes, and a pack has at most 1000/);
    await expect(packRun(dir, { file: 100, total: MAX_PACK_BYTES })).rejects.toThrow(/a file of a pack has at most 100/);
  });

  it('is far below the caps for a run: the pack of the hostile run is a few kilobytes', async () => {
    const dir = scratch();
    writeHostileRun(dir);
    const total = Object.values(await packRun(dir)).reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0);
    expect(total).toBeLessThan(MAX_PACK_BYTES / 2);
    expect(MAX_PACK_BYTES).toBe(24 * 1024);
    expect(MAX_PACK_FILE_BYTES).toBe(8 * 1024);
  });
});

describe('packArtifact', () => {
  it('writes the files of the pack, and only them, into the folder that it is given, and changes nothing in the folder of the run', async () => {
    const run = scratch();
    writeHostileRun(run);
    const before = filesBelow(run);
    const out = path.join(scratch(), 'pack');
    const result = await packArtifact(run, out);
    expect(result?.files).toEqual(['01-discover.json', '02-select.json', '03-fetch.json', '04-extract.json', '05-compose.json', '06-verify.json', 'run.json']);
    expect(readdirSync(out).sort()).toEqual(result?.files);
    expect(result?.bytes).toBe(result?.files.reduce((sum, name) => sum + readFileSync(path.join(out, name)).length, 0));
    expect(filesBelow(run)).toEqual(before);
    for (const name of result?.files ?? []) expect(readFileSync(path.join(out, name), 'utf8')).not.toContain(MARKER);
  });

  it('says that there is nothing to pack when the folder of the run is not there, as on a day that was done, and makes no folder', async () => {
    const out = path.join(scratch(), 'pack');
    expect(await packArtifact(path.join(scratch(), 'nowhere'), out)).toBeUndefined();
    expect(() => readdirSync(out)).toThrow();
  });

  it('refuses a folder for the pack that has something in it, so that what is uploaded from it is the pack and nothing else', async () => {
    const run = scratch();
    writeHostileRun(run);
    const out = scratch();
    writeFileSync(path.join(out, 'left-over.txt'), 'x');
    await expect(packArtifact(run, out)).rejects.toThrow('is not empty');
    expect(readdirSync(out)).toEqual(['left-over.txt']);
  });

  it('refuses the folder of the run for the pack, a folder inside it, and a folder that holds it', async () => {
    const run = scratch();
    writeHostileRun(run);
    await expect(packArtifact(run, run)).rejects.toThrow('must not be the folder of the run');
    await expect(packArtifact(run, path.join(run, 'pack'))).rejects.toThrow('must not be the folder of the run');
    await expect(packArtifact(path.join(run, 'held'), run)).rejects.toThrow('must not be the folder of the run');
  });

  it('writes nothing when the pack is too big', async () => {
    const run = scratch();
    writeHostileRun(run);
    const out = path.join(scratch(), 'pack');
    const file = path.join(run, '06-verify.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as { gate: { failures: unknown[] }; history: unknown[] };
    const codes = Object.keys(REASON_LABELS).filter((code) => code.startsWith('G')).slice(0, 60);
    data.history = Array.from({ length: 12 }, (_, at) => ({ round: at, gate: { ...data.gate, failures: codes.map((code) => ({ code })) }, verifier: null, verifierFailures: [], sent: [] }));
    writeFileSync(file, JSON.stringify(data));
    await expect(packArtifact(run, out)).rejects.toThrow(PackError);
    expect(() => readdirSync(out)).toThrow();
  });
});

describe('packRun: the runs that a real pipeline makes', () => {
  async function aRun(how: 'published' | 'held' | 'no-story' | 'failed') {
    const made = setupRun(scratch, {
      record: true,
      ...(how === 'held' ? { fake: unentailed() } : {}),
      ...(how === 'no-story' ? { fake: new FakeClient().script('select', SELECT).script('extract', { claims: [] }) } : {}),
      ...(how === 'failed' ? { stages: { compose: async () => { throw new Error('the composer fell over'); } } } : {}),
    });
    const result = await made.run();
    expect(result.outcome).toBe(how);
    return path.join(made.config.runDir, DEMO_DATE);
  }

  it.each([
    ['published', ['01-discover', '02-select', '03-fetch', '04-extract', '05-compose', '06-verify']],
    ['held', ['01-discover', '02-select', '03-fetch', '04-extract', '05-compose', '06-verify']],
    ['no-story', ['01-discover', '02-select', '03-fetch', '04-extract']],
    ['failed', ['01-discover', '02-select', '03-fetch', '04-extract']],
  ] as const)('has the stages that a run that %s has, every string of the pack of a shape that is no prose, and every number the same as the artifact says', async (how, stages) => {
    const dir = await aRun(how);
    const pack = await packRun(dir);
    expectSafe(pack);
    const run = JSON.parse(pack['run.json'] as string) as PackedRun;
    expect(run.stages).toEqual(stages);
    const record = JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8')) as { outcome: string; stage: string; attempt: number; runId: string };
    expect(run).toMatchObject({ ended: true, outcome: record.outcome, stage: record.stage, attempt: record.attempt, runId: record.runId, client: 'fake', sources: 'fixtures', dry: false });
    const extract = JSON.parse(readFileSync(path.join(dir, '04-extract.json'), 'utf8')) as { claims: unknown[]; dropped: unknown[] };
    expect(JSON.parse(pack['04-extract.json'] as string)).toMatchObject({ claims: extract.claims.length, dropped: extract.dropped.length });
    expect(run.files.cassettes).toBeGreaterThan(0);
    expect(run.files.held).toBe(how === 'held' ? 1 : 0);
  });

  it('says the same of a published piece as the verification does: the gate cleared it, the model check passed it, and the checks are the nine that the gate has', async () => {
    const pack = await packRun(await aRun('published'));
    const verify = JSON.parse(pack['06-verify.json'] as string) as { outcome: string; route: string; checks: Record<string, string>; verifier: { passed: boolean }; failureCodes: string[] };
    expect(verify).toMatchObject({ outcome: 'publish', route: 'publish', verifier: { passed: true }, failureCodes: [] });
    expect(Object.keys(verify.checks)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });

  it('says the verdicts of the model check of a held piece as counts, and what the gate and the model check held it for as codes', async () => {
    const pack = await packRun(await aRun('held'));
    const verify = JSON.parse(pack['06-verify.json'] as string) as { outcome: string; history: { verdicts: Record<string, number> }[] };
    expect(verify.outcome).toBe('hold');
    expect(verify.history.reduce((sum, round) => sum + round.verdicts.not_entailed, 0)).toBeGreaterThan(0);
  });
});
