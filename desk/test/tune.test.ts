import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE, main, parseArgs } from '../src/cli';
import type { CliDeps, Parsed } from '../src/cli';
import { defaultConfig } from '../src/config';
import { DEMO_CLAIMS, DEMO_REPLY, clearingVerifier } from '../src/demo/story';
import { DEMO_REGISTRY_YAML, DEMO_URLS, demoFetcher, demoRegistry } from '../src/demo/world';
import { clientFromConfig } from '../src/model/factory';
import { FakeClient } from '../src/model/fake';
import { refuseApiOnFixtures } from '../src/run/spending';
import { FakeGit } from '../src/run/git';
import { TUNE_DEFAULT_CALLS, TUNE_FOLDER, TUNE_MAX_CALLS, TUNE_MAX_TRIALS, TuneRecord, TuneRefused, runTune } from '../src/run/tune';
import type { TuneOptions } from '../src/run/tune';
import { useScratch } from './support/context';
import { publicLookup } from './support/lookup';
import { COMMITTED_STATE, filesBelow, makeSite } from './support/site';
import { START, clock } from './support/run';
import { fileReply, scriptedTransport } from './support/transport';
import type { Route } from './support/transport';
import { loadWorkflow, stepNamed } from './support/workflow';

// `desk tune`, called as a function the way every command of the Desk is tested: `main(argv, deps)` with a clock, an environment, a place to print, and a transport that answers
// from the fixture pages in place of the web. The model is a scripted one, and the real one is never reached. What these tests hold the command to: the table that it prints, the
// budget of calls that stops it, a page that robots.txt forbids and a page of no known kind, the api client that is refused without a key before anything is fetched, and that
// nothing is written outside runs/tune/.

const scratch = useScratch();
const TEST_AGENT = 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.test/method)';
const RELEASE = DEMO_URLS.release;
const ARTICLE = DEMO_URLS.mercerArticle;
const ALLOW = { type: 'text/plain', body: 'User-agent: *\nAllow: /\n' };

/** The routes of the made-up world: both hosts allow every fetch, and the two pages are the fixture files. */
function world(extra: Record<string, Route> = {}): Record<string, Route> {
  return {
    'https://fixture-robotics.example/robots.txt': ALLOW,
    'https://mercer-wire.example/robots.txt': ALLOW,
    [RELEASE]: fileReply('pages/fixture-robotics-fx-1-second-plant.html'),
    [ARTICLE]: fileReply('pages/mercer-wire-fx-1-second-plant.html'),
    ...extra,
  };
}

/** What a model says when it tells the story of the release: seven claims, a piece, and a verifier that clears it. One set of replies for each trial that is asked. */
const story = (trials = 1): FakeClient =>
  new FakeClient()
    .script('extract', ...Array.from({ length: trials }, () => ({ claims: DEMO_CLAIMS })))
    .script('compose', ...Array.from({ length: trials }, () => DEMO_REPLY))
    .script('verify', ...Array.from({ length: trials }, () => clearingVerifier));

/** A repository with the registry of the made-up world and a list of addresses, and everything that `main` is given and prints. */
function tuning(addresses: string[], options: { routes?: Record<string, Route>; deps?: Partial<CliDeps>; list?: string } = {}) {
  const cwd = makeSite(scratch());
  writeFileSync(path.join(cwd, 'sources.yml'), DEMO_REGISTRY_YAML);
  writeFileSync(path.join(cwd, 'urls.txt'), options.list ?? `${addresses.join('\n')}\n`);
  const out: string[] = [];
  const err: string[] = [];
  const git = new FakeGit();
  const { transport, sent } = scriptedTransport(options.routes ?? world());
  const config = { ...defaultConfig(), runDir: path.join(cwd, 'runs'), evidenceDir: path.join(cwd, 'evidence'), userAgent: TEST_AGENT, requestIntervalMs: 0 };
  const deps: CliDeps = { out: (line) => void out.push(line), err: (line) => void err.push(line), env: {}, cwd, now: clock(), git, transport, lookup: publicLookup, config, ...options.deps };
  const call = (...argv: string[]): Promise<number> => main(['tune', '--urls', 'urls.txt', ...argv], deps);
  const dir = path.join(cwd, 'runs', TUNE_FOLDER, '20261005-043100');
  const record = (): TuneRecord => TuneRecord.parse(JSON.parse(readFileSync(path.join(dir, 'tune.json'), 'utf8')));
  return { cwd, out, err, git, sent, call, dir, record, deps };
}

const parsed = (...argv: string[]): Parsed => {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`not parsed: ${result.message}`);
  return result.args;
};
const refused = (...argv: string[]): string => {
  const result = parseArgs(argv);
  if (result.ok) throw new Error(`parsed: ${JSON.stringify(result.args)}`);
  return result.message;
};

describe('parseArgs: tune', () => {
  it('has the defaults: one trial, forty calls, the api, and no settings file', () => {
    expect(parsed('tune', '--urls', 'urls.txt')).toEqual({ command: 'tune', urls: 'urls.txt', trials: 1, maxCalls: TUNE_DEFAULT_CALLS, client: 'api', config: undefined });
    expect(TUNE_DEFAULT_CALLS).toBe(40);
  });

  it('reads every option, in any order', () => {
    expect(parsed('tune', '--max-calls', '12', '--config', 'desk.config.yml', '--client', 'fake', '--trials', '3', '--urls', 'a/b.txt')).toEqual({
      command: 'tune',
      urls: 'a/b.txt',
      trials: 3,
      maxCalls: 12,
      client: 'fake',
      config: 'desk.config.yml',
    });
  });

  it('needs --urls', () => {
    expect(refused('tune')).toBe('tune needs --urls <file>: the file that lists the addresses of the pages to try, one to a line');
    expect(refused('tune', '--trials', '2')).toContain('tune needs --urls');
    expect(refused('tune', '--urls')).toBe('--urls needs a value');
  });

  it('takes a whole number of trials from 1 to ten, and of calls from 1 to two hundred, and says the limits', () => {
    for (const bad of ['0', '-1', '1.5', 'many', '', '011', '11']) expect(refused('tune', '--urls', 'u', '--trials', bad), bad).toBe(`--trials is a whole number from 1 to ${TUNE_MAX_TRIALS}, not "${bad}"`);
    for (const bad of ['0', '-5', '2.5', 'lots', '201', '1000000000']) expect(refused('tune', '--urls', 'u', '--max-calls', bad), bad).toBe(`--max-calls is a whole number from 1 to ${TUNE_MAX_CALLS}, not "${bad}"`);
    expect(parsed('tune', '--urls', 'u', '--trials', '10', '--max-calls', '200')).toMatchObject({ trials: 10, maxCalls: 200 });
    expect(parsed('tune', '--urls', 'u', '--trials', '1', '--max-calls', '1')).toMatchObject({ trials: 1, maxCalls: 1 });
  });

  it('takes the api or the scripted client and no other: the recorded replies are not for tuning', () => {
    expect(refused('tune', '--urls', 'u', '--client', 'recorded')).toBe('--client is api or fake for tune, not "recorded"');
    expect(refused('tune', '--urls', 'u', '--client', 'gpt')).toBe('--client is api or fake for tune, not "gpt"');
  });

  it('has the options of tune and no others: not a flag of run, not an argument, and none twice', () => {
    expect(refused('tune', '--urls', 'u', '--sources', 'fixtures')).toBe('unknown option --sources for tune');
    expect(refused('tune', '--urls', 'u', '--dry')).toBe('unknown option --dry for tune');
    expect(refused('tune', 'urls.txt')).toBe('tune takes no arguments, but was given "urls.txt"');
    expect(refused('tune', '--urls', 'a', '--urls', 'b')).toBe('--urls is given twice');
  });

  it('is in the usage, with the settings file like every command that reads the settings, and the two words that say what --client fake is and what writes where', () => {
    expect(USAGE).toContain('desk tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--config <path>]');
    expect(USAGE).toContain('--client fake (a model');
    expect(USAGE).toContain('proposes no claims');
    expect(USAGE).toContain('it writes only below runs/tune/<stamp>/');
    expect(USAGE).toContain('--trials N runs the model steps N times on each page (1 to 10, 1 unless told otherwise)');
    expect(USAGE).toContain('--max-calls M stops the whole invocation, with exit code 1, when it has made M model calls (1 to 200, 40 unless told otherwise)');
  });
});

describe('main: tune, the table', () => {
  it('fetches the page, sends it through Extract, Compose and Verify, and prints each step of it, then the total, and exits 0', async () => {
    const { call, out, err } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(err).toEqual([]);
    expect(out).toEqual([
      'tune: 1 address, 1 trial each, at most 40 model calls, client fake',
      'folder: runs/tune/20261005-043100',
      `page 1 of 1, trial 1 of 1: ${RELEASE}`,
      '  kind: company-newsroom (tier 1)',
      '  result: went through the model check',
      '  claims proposed: 7',
      '  claims dropped: none',
      '  claims surviving: 7',
      '  composed draft: the gate says publish',
      '  model check: round 0 judged 35 items: entailed 35, not entailed 0, ambiguous 0, missing 0; label problems 0 (7 claims)',
      '  verify: publish after 0 revision rounds; the gate says publish',
      '  tokens: 6407 in, 2891 out, 3 model calls',
      'total: 1 page, 1 trial, 3 of 40 model calls, 6407 tokens in, 2891 out',
      'dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)',
    ]);
  });

  it('shows dollars, for each trial and in all, when the settings have prices, and never otherwise', async () => {
    const config = { ...defaultConfig(), runDir: 'runs', userAgent: TEST_AGENT, requestIntervalMs: 0, prices: { inputPerMillion: 3, outputPerMillion: 15 } };
    const priced = tuning([RELEASE], { deps: { tuneClient: story(), config } });
    // The folders of the settings are relative here, and are below the folder that the command is run in.
    priced.deps.config = { ...config, runDir: path.join(priced.cwd, 'runs'), evidenceDir: path.join(priced.cwd, 'evidence') };
    expect(await priced.call('--client', 'fake')).toBe(0);
    expect(priced.out).toContain('  dollars: $0.0626');
    expect(priced.out).toContain('total dollars: $0.0626');
    expect(priced.record().dollars).toBeCloseTo(0.062586, 8);
  });

  it('does not make dollars of tokens when the three models differ, and says why', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story() } });
    made.deps.config = { ...made.deps.config!, models: { ...defaultConfig().models, verify: 'a-different-model' }, prices: { inputPerMillion: 3, outputPerMillion: 15 } };
    expect(await made.call('--client', 'fake')).toBe(0);
    expect(made.out.some((line) => line.includes('dollars:') && !line.startsWith('dollars: not shown'))).toBe(false);
    expect(made.out).toContain('dollars: not shown, because extract, compose and verify use different models, and the settings hold one price');
    expect(made.record().dollars).toBeNull();
  });

  it('takes the prices from a file of settings', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(), config: undefined } });
    writeFileSync(path.join(made.cwd, 'desk.yml'), `userAgent: "${TEST_AGENT}"\nrequestIntervalMs: 0\nprices:\n  inputPerMillion: 3\n  outputPerMillion: 15\n`);
    expect(await made.call('--client', 'fake', '--config', 'desk.yml')).toBe(0);
    expect(made.out).toContain('total dollars: $0.0626');
  });

  it('runs the model steps as many times as it is told on a page that is fetched once, a row to each trial', async () => {
    const { call, out, sent } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(out[0]).toBe('tune: 1 address, 2 trials each, at most 40 model calls, client fake');
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 1, trial 1 of 2: ${RELEASE}`, `page 1 of 1, trial 2 of 2: ${RELEASE}`]);
    expect(out).toContain('total: 1 page, 2 trials, 6 of 40 model calls, 12814 tokens in, 5782 out');
    expect(sent.filter((request) => request.url === RELEASE)).toHaveLength(1);
  });

  it('tries the pages in the order of the list, with a block of lines to each, and a tier-2 page is read as the page of another outlet', async () => {
    const reading = new FakeClient().script('extract', { claims: [] }, { claims: [] });
    const { call, out } = tuning([ARTICLE, RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 2, trial 1 of 1: ${ARTICLE}`, `page 2 of 2, trial 1 of 1: ${RELEASE}`]);
    expect(out).toContain('  kind: tier2 (tier 2)');
    expect(out).toContain('  kind: company-newsroom (tier 1)');
    expect(out).toContain('total: 2 pages, 2 trials, 2 of 40 model calls, 3143 tokens in, 8 out');
  });

  it('counts a claim that the code dropped under each rule that dropped it, and says that too few survived, with no draft after it and no more calls', async () => {
    const lost = { ...DEMO_CLAIMS[0]!, quote: 'This sentence is not in the page at all.' };
    const longLabel = { ...DEMO_CLAIMS[1]!, label: 'a label that is far too long to be a short noun phrase for a claim, and that is not in its quotation either' };
    const reading = new FakeClient().script('extract', { claims: [DEMO_CLAIMS[0]!, DEMO_CLAIMS[1]!, lost, longLabel] });
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.slice(2, 9)).toEqual([
      `page 1 of 1, trial 1 of 1: ${RELEASE}`,
      '  kind: company-newsroom (tier 1)',
      '  result: too few claims to write a piece from: 2 of the 4 claims proposed survived the checks, and at least 3 are needed to write a piece',
      '  claims proposed: 4',
      '  claims dropped: quote-not-found 1, label-not-in-quote 1, label-too-long 1',
      '  claims surviving: 2',
      '  tokens: 1609 in, 499 out, 1 model call',
    ]);
    expect(out.some((line) => line.includes('composed draft'))).toBe(false);
    expect(record().rows[0]).toMatchObject({ status: 'too-few-claims', composed: null, modelCheck: null, verdict: null, usage: { calls: 1 } });
  });
});

describe('main: tune, what the model check found', () => {
  /** A verifier that finds fault: the first sentence is not entailed, the second is ambiguous, the third is not judged at all, and the basis of the first claim is not supported. */
  const faultFinding = (request: Parameters<typeof clearingVerifier>[0]) => {
    const clear = clearingVerifier(request);
    return {
      verdicts: clear.verdicts.flatMap((verdict, at) => (at === 0 ? [{ ...verdict, verdict: 'not_entailed' as const }] : at === 1 ? [{ ...verdict, verdict: 'ambiguous' as const }] : at === 2 ? [] : [verdict])),
      labels: clear.labels.map((label, at) => (at === 0 ? { ...label, basisSupported: false } : label)),
    };
  };

  it('counts, for the first draft that the model was shown, the sentences that were not entailed, ambiguous and not judged, and the labels that were not supported, and says that the piece is held after the rounds of revision', async () => {
    const reading = new FakeClient()
      .script('extract', { claims: DEMO_CLAIMS })
      .script('compose', DEMO_REPLY, { replacements: [] }, { replacements: [] })
      .script('verify', faultFinding, faultFinding, faultFinding);
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out).toContain('  model check: round 0 judged 35 items: entailed 32, not entailed 1, ambiguous 1, missing 1; label problems 1 (7 claims)');
    expect(out).toContain('  verify: hold after 2 revision rounds; the gate says publish');
    expect(record().rows[0]).toMatchObject({
      status: 'judged',
      modelCheck: { round: 0, judged: 35, entailed: 32, notEntailed: 1, ambiguous: 1, missing: 1, claims: 7, labelProblems: 1 },
      verdict: { outcome: 'hold', rounds: 2, route: 'publish', codes: {} },
      usage: { calls: 7 },
    });
  });
});

describe('main: tune, a draft that the gate sends back every time', () => {
  it('says that the model was not asked, because the gate found failures in every round, with the codes of the gate for the first draft and for the last, and that the piece is held', async () => {
    const uncited = { ...DEMO_REPLY, title: { ...DEMO_REPLY.title, claimIds: [] } };
    const reading = new FakeClient().script('extract', { claims: DEMO_CLAIMS }).script('compose', uncited, { replacements: [] }, { replacements: [] });
    const { call, out, record } = tuning([RELEASE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    const row = record().rows[0]!;
    expect(row).toMatchObject({ status: 'judged', modelCheck: null, composed: { route: 'revise' }, verdict: { outcome: 'hold', rounds: 2, route: 'revise' }, usage: { calls: 4 } });
    expect(Object.keys(row.composed!.codes).length).toBeGreaterThan(0);
    expect(row.verdict!.codes).toEqual(row.composed!.codes);
    expect(out).toContain('  model check: not asked (the gate found failures in every round)');
    expect(out.some((line) => line.startsWith('  composed draft: the gate says revise ('))).toBe(true);
    expect(out.some((line) => line.startsWith('  verify: hold after 2 revision rounds; the gate says revise ('))).toBe(true);
  });
});

describe('main: tune, the outlet of a page of another outlet', () => {
  it('is the name that the registry gives the outlet, so that the claims of its page are attributed to it', async () => {
    const claim = {
      text: 'The arm is priced from $38,000.',
      label: 'priced from $38,000',
      type: 'number',
      quote: 'The arm is priced from $38,000, the outlet reported.',
      values: [{ kind: 'number', raw: '$38,000', normalised: '38000', unit: 'USD' }],
      basis: 'reported',
      status: 'unspecified',
      source: 1,
    };
    const { call, dir } = tuning([ARTICLE], { deps: { tuneClient: new FakeClient().script('extract', { claims: [claim] }) } });
    expect(await call('--client', 'fake')).toBe(0);
    const extracted = JSON.parse(readFileSync(path.join(dir, '01/trial-1/04-extract.json'), 'utf8')) as { claims: { source: { tier: number; outlet: string; url: string } }[] };
    expect(extracted.claims).toHaveLength(1);
    expect(extracted.claims[0]!.source).toMatchObject({ tier: 2, outlet: 'Mercer Wire', url: ARTICLE });
  });

  it('is the name of the company for a page of its newsroom, which is a primary source and carries no outlet in its claims', async () => {
    const { call, dir } = tuning([RELEASE], { deps: { tuneClient: new FakeClient().script('extract', { claims: [DEMO_CLAIMS[0]!] }) } });
    expect(await call('--client', 'fake')).toBe(0);
    const extracted = JSON.parse(readFileSync(path.join(dir, '01/trial-1/04-extract.json'), 'utf8')) as { claims: { source: Record<string, unknown> }[] };
    expect(extracted.claims[0]!.source).toMatchObject({ tier: 1 });
    expect(extracted.claims[0]!.source).not.toHaveProperty('outlet');
  });
});

describe('main: tune, the scripted client that proposes nothing', () => {
  it('is what --client fake is when no story is given: every page is fetched and sorted, Extract is told that there are no claims, and nothing costs anything', async () => {
    const { call, out, err } = tuning([RELEASE, ARTICLE]);
    expect(await call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(err).toEqual([]);
    expect(out.filter((line) => line.startsWith('  result:'))).toHaveLength(4);
    for (const line of out.filter((candidate) => candidate.startsWith('  result:'))) expect(line).toContain('too few claims to write a piece from');
    expect(out.filter((line) => line.startsWith('page '))).toHaveLength(4);
    expect(out.find((line) => line.startsWith('total:'))).toMatch(/^total: 2 pages, 4 trials, 4 of 40 model calls, \d+ tokens in, \d+ out$/);
  });
});

describe('main: tune, the budget of model calls', () => {
  it('stops the whole invocation when the calls are spent, and says so in the table and on the error output, with exit code 1, and keeps what was done', async () => {
    const { call, out, err, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '2')).toBe(1);
    const stopped = `the budget of 2 model calls (--max-calls) ran out, so the run stopped during trial 1 of page 1 (${RELEASE}), and what comes after it was not tried`;
    expect(err).toEqual([`desk: the tuning stopped before it was done: ${stopped}`]);
    expect(out).toContain(`  result: stopped by the budget of model calls: the budget of 2 model calls for this invocation is spent`);
    expect(out.at(-1)).toBe(`stopped: ${stopped}`);
    expect(out.find((line) => line.startsWith('total:'))).toMatch(/^total: 2 pages, 1 trial, 2 of 2 model calls, \d+ tokens in, \d+ out$/);
    expect(record().stopped).toBe(stopped);
    expect(record().rows).toHaveLength(1);
    expect(record().rows[0]).toMatchObject({ status: 'stopped', usage: { calls: 2 } });
  });

  it('does not stop for a budget that is exactly enough: three calls make a trial, and three are allowed', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '3')).toBe(0);
    expect(err).toEqual([]);
    expect(record().stopped).toBeNull();
    expect(record().total.calls).toBe(3);
  });

  it('stops before the next page when the calls were spent at the end of the one before, and does not fetch it', async () => {
    const { call, err, sent, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake', '--max-calls', '3')).toBe(1);
    expect(err).toEqual([`desk: the tuning stopped before it was done: the budget of 3 model calls (--max-calls) is spent, so the run stopped before page 2 (${ARTICLE}), and what comes after it was not tried`]);
    expect(sent.map((request) => request.url)).not.toContain(ARTICLE);
    expect(sent.some((request) => request.url.startsWith('https://mercer-wire.example'))).toBe(false);
    expect(record().rows).toHaveLength(1);
    expect(record().total).toMatchObject({ pages: 2, trials: 1, calls: 3 });
  });

  it('counts the calls of all the trials together and stops the second trial where the budget runs out', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2', '--max-calls', '4')).toBe(1);
    expect(err[0]).toContain('during trial 2 of page 1');
    expect(record().rows.map((row) => [row.trial, row.status, row.usage.calls])).toEqual([
      [1, 'judged', 3],
      [2, 'stopped', 1],
    ]);
  });

  it('stops before a trial that it has no call for, when the calls were spent by the trial before it', async () => {
    const { call, err, record } = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    expect(await call('--client', 'fake', '--trials', '2', '--max-calls', '3')).toBe(1);
    expect(err[0]).toContain(`so the run stopped before trial 2 of page 1 (${RELEASE})`);
    expect(record().rows).toHaveLength(1);
  });

  it('holds each trial to the budget of the settings as well: a trial that spends more than a run may fails, and the next trial has the whole budget again', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(2) } });
    made.deps.config = { ...made.deps.config!, budget: { ...defaultConfig().budget, maxCalls: 2 } };
    expect(await made.call('--client', 'fake', '--trials', '2')).toBe(0);
    expect(made.record().rows.map((row) => [row.trial, row.status, row.usage.calls])).toEqual([
      [1, 'failed', 2],
      [2, 'failed', 2],
    ]);
    expect(made.record().rows[0]!.note).toBe('budget spent: 2 of 2 model calls');
    expect(made.record().total.calls).toBe(4);
  });
});

describe('main: tune, pages that cannot be tried', () => {
  it('says that a page that robots.txt forbids was not fetched, and asks no model about it', async () => {
    const routes = world({ 'https://fixture-robotics.example/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /news/\n' } });
    const fake = story();
    const { call, out, sent, record } = tuning([RELEASE], { routes, deps: { tuneClient: fake } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.find((line) => line.startsWith('  result:'))).toMatch(/^ {2}result: not fetched: .*robots\.txt/);
    expect(out).toContain('  kind: company-newsroom (tier 1)');
    expect(sent.map((request) => request.url)).toEqual(['https://fixture-robotics.example/robots.txt']);
    expect(fake.calls).toEqual([]);
    expect(record().rows[0]).toMatchObject({ trial: null, status: 'not-fetched', usage: { calls: 0, inputTokens: 0, outputTokens: 0 } });
    expect(record().total).toEqual({ pages: 1, trials: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('says that a page on a host that sources.yml does not list is not a known kind of source, and does not fetch it, not even its robots.txt', async () => {
    const { call, out, sent, record } = tuning(['https://elsewhere.example/story']);
    expect(await call('--client', 'fake')).toBe(0);
    expect(out).toContain('page 1 of 1: https://elsewhere.example/story');
    expect(out).toContain('  kind: unknown (no tier)');
    expect(out).toContain('  result: not a known kind of source, so not read: the address is on no host that sources.yml lists, so it was not fetched');
    expect(sent).toEqual([]);
    expect(record().rows[0]).toMatchObject({ kind: 'unknown', status: 'unknown-kind', trial: null });
  });

  it('says that a page that redirected to another kind of source is not read, and keeps nothing of it', async () => {
    const routes = world({ [RELEASE]: { status: 302, headers: { location: ARTICLE }, body: '' } });
    const { call, out, record, dir } = tuning([RELEASE], { routes });
    expect(await call('--client', 'fake')).toBe(0);
    expect(out.find((line) => line.startsWith('  result:'))).toBe(`  result: not a known kind of source, so not read: the page was served from ${ARTICLE}, which is not the kind of source that ${RELEASE} is, so it was not read`);
    expect(record().rows[0]).toMatchObject({ status: 'unknown-kind' });
    expect(existsSync(path.join(dir, 'evidence'))).toBe(false);
  });

  it('says that a page that is not found, or that has no text, was not fetched, and goes on to the next page', async () => {
    const routes = world({ [RELEASE]: { status: 404, body: 'gone' }, [ARTICLE]: { body: '<html><body><script>var x = 1;</script></body></html>' } });
    const reading = new FakeClient().script('extract', { claims: [] });
    const { call, out, record } = tuning([RELEASE, ARTICLE, RELEASE], { routes, deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(record().rows.map((row) => row.status)).toEqual(['not-fetched', 'not-fetched', 'not-fetched']);
    expect(record().rows[0]!.note).toContain('404');
    expect(record().rows[1]!.note).toMatch(/no text|cannot be read/);
    expect(out.filter((line) => line.startsWith('page '))).toHaveLength(3);
  });

  it('says that a trial failed, with why, and goes on to the next page, and the invocation ends 0: what happened is in the table', async () => {
    const reading = new FakeClient().script('extract', { claims: 'not a list' }).script('extract', { claims: [] });
    const { call, out, record } = tuning([RELEASE, ARTICLE], { deps: { tuneClient: reading } });
    expect(await call('--client', 'fake')).toBe(0);
    expect(record().rows.map((row) => row.status)).toEqual(['failed', 'too-few-claims']);
    expect(out).toContain('  result: failed: the reply for the extract role does not match its schema: claims: Invalid input: expected array, received string');
    expect(out.filter((line) => line.startsWith('page '))).toEqual([`page 1 of 2, trial 1 of 1: ${RELEASE}`, `page 2 of 2, trial 1 of 1: ${ARTICLE}`]);
  });
});

describe('main: tune, what it refuses', () => {
  it('refuses the api client when there is no key in the environment, with exit code 2, before it fetches anything, and writes nothing', async () => {
    const { call, err, out, sent, cwd } = tuning([RELEASE]);
    expect(await call()).toBe(2);
    expect(err).toEqual(['ANTHROPIC_API_KEY is not set: the api client needs it in the environment']);
    expect(out).toEqual([]);
    expect(sent).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('uses the api client when it has a key, never prints the key, and never reaches a network: with none to reach, the trial fails and says so', async () => {
    const key = 'a-key-for-the-test-only';
    const { call, out, err, record } = tuning([RELEASE], { deps: { env: { ANTHROPIC_API_KEY: key }, retry: { retries: 0 } } });
    expect(await call()).toBe(0);
    expect(record().client).toBe('api');
    expect(record().rows[0]).toMatchObject({ status: 'failed', usage: { calls: 1, inputTokens: 0, outputTokens: 0 } });
    expect([...out, ...err].join('\n')).not.toContain(key);
    expect(out[0]).toBe('tune: 1 address, 1 trial each, at most 40 model calls, client api');
  });

  it('refuses a user agent that links to a placeholder address, as a live run does, because it asks sites who it is', async () => {
    const { call, err, sent, cwd } = tuning([RELEASE], { deps: { config: undefined, env: { ANTHROPIC_API_KEY: 'k' } } });
    expect(await call()).toBe(2);
    expect(err[0]).toContain('is a placeholder address: a tuning run, which fetches live pages, needs a user agent that links to the real /method page of the Desk');
    expect(sent).toEqual([]);
    expect(existsSync(path.join(cwd, 'runs'))).toBe(false);
  });

  it('says what is wrong with the list of addresses and with the file of settings, with exit code 2 and nothing written', async () => {
    const missing = tuning([RELEASE]);
    expect(await main(['tune', '--urls', 'nope.txt'], missing.deps)).toBe(2);
    expect(missing.err).toEqual(['desk: cannot read the list of addresses nope.txt (ENOENT)']);
    const bad = tuning([], { list: '# pages\nhttps://a.example/one\nnot an address\n' });
    expect(await bad.call()).toBe(2);
    expect(bad.err).toEqual(['desk: the list of addresses urls.txt: line 3 is not the address of a web page (an http or https address): "not an address"']);
    const empty = tuning([], { list: '# nothing\n' });
    expect(await empty.call()).toBe(2);
    expect(empty.err).toEqual(['desk: the list of addresses urls.txt: it lists no address']);
    const settings = tuning([RELEASE]);
    expect(await settings.call('--config', 'nope.yml')).toBe(2);
    expect(settings.err.join('\n')).toContain('cannot read the file');
    for (const made of [missing, bad, empty, settings]) {
      expect(made.out).toEqual([]);
      expect(existsSync(path.join(made.cwd, 'runs'))).toBe(false);
    }
  });

  it('says that the registry cannot be read when it cannot, with exit code 1', async () => {
    const made = tuning([RELEASE]);
    writeFileSync(path.join(made.cwd, 'sources.yml'), 'not: [a registry');
    expect(await made.call('--client', 'fake')).toBe(1);
    expect(made.err[0]).toContain('the sources cannot be read');
  });

  it('does not write over an invocation that is there: two with the same name are one too many, and the first is as it was', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story(2), now: () => START } });
    expect(await made.call('--client', 'fake')).toBe(0);
    const before = filesBelow(made.cwd);
    const text = readFileSync(path.join(made.dir, 'tune.json'), 'utf8');
    expect(await made.call('--client', 'fake')).toBe(1);
    expect(made.err.at(-1)).toContain('the tuning could not be done');
    expect(made.err.at(-1)).toContain('EEXIST');
    expect(filesBelow(made.cwd)).toEqual(before);
    expect(readFileSync(path.join(made.dir, 'tune.json'), 'utf8')).toBe(text);
  });
});

describe('main: tune, what it writes', () => {
  it('writes only below runs/tune/<stamp>/: not the site, not the desk state, not the folder of the evidence of the settings, and asks git for nothing', async () => {
    const { call, cwd, git, dir } = tuning([RELEASE], { deps: { tuneClient: story() } });
    const before = filesBelow(cwd);
    expect(await call('--client', 'fake')).toBe(0);
    const added = filesBelow(cwd).filter((file) => !before.includes(file));
    expect(added.length).toBeGreaterThan(5);
    for (const file of added) expect(file, file).toMatch(/^runs\/tune\/20261005-043100\//);
    expect(filesBelow(cwd).filter((file) => before.includes(file))).toEqual(before);
    expect(readFileSync(path.join(cwd, 'site/src/data/desk-state.json'), 'utf8')).toBe(COMMITTED_STATE);
    expect(git.commits).toEqual([]);
    expect(existsSync(path.join(cwd, 'evidence'))).toBe(false);
    expect(path.relative(cwd, dir)).toBe('runs/tune/20261005-043100');
  });

  it('leaves the record of the invocation, the artifacts of each trial, and the page, which is kept here and in no other store', async () => {
    const { call, cwd, dir, record } = tuning([RELEASE], { deps: { tuneClient: story() } });
    expect(await call('--client', 'fake')).toBe(0);
    const files = filesBelow(dir);
    expect(files.filter((file) => !file.startsWith('evidence/'))).toEqual(['01/trial-1/04-extract.json', '01/trial-1/05-compose.json', '01/trial-1/06-verify.json', 'tune.json']);
    expect(files.filter((file) => file.startsWith('evidence/')).map((file) => file.slice(-4)).sort()).toEqual(['.txt', 'json']);
    const page = readFileSync(path.join(dir, files.find((file) => file.endsWith('.txt'))!), 'utf8');
    expect(page).toContain('Fixture Robotics has begun shipping FX-1 warehouse arms');
    expect(record()).toMatchObject({ stamp: '20261005-043100', date: '2026-10-05', client: 'fake', trials: 1, maxCalls: 40, stopped: null, dollars: null });
    expect(record().models).toEqual(defaultConfig().models);
    expect(record().total).toEqual({ pages: 1, trials: 1, calls: 3, inputTokens: 6407, outputTokens: 2891 });
    expect(existsSync(path.join(cwd, 'runs', '2026-10-05'))).toBe(false);
  });

  it('never uses the evidence store of the settings, even when they say that it is the bucket and the environment has no bucket', async () => {
    const made = tuning([RELEASE], { deps: { tuneClient: story() } });
    made.deps.config = { ...made.deps.config!, evidence: { kind: 'r2' } };
    expect(await made.call('--client', 'fake')).toBe(0);
    expect(made.err).toEqual([]);
    expect(filesBelow(made.dir).some((file) => file.startsWith('evidence/'))).toBe(true);
  });

  it('is in the folder that the daily workflow does not pack, whatever it holds: the pack is of the folder of a day, runs/<date>, and the trials are in runs/tune', () => {
    const pack = stepNamed(loadWorkflow('desk.yml'), 'Pack the run, with nothing in it that a model or a page wrote').run as string;
    expect(pack).toContain('pack-artifact "runs/$(date -u +%F)"');
    expect(TUNE_FOLDER).toBe('tune');
    expect(TUNE_FOLDER).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('runTune: the same rule about money as a run', () => {
  /** What `runTune` is given for the made-up world, which has no network: its pages are the fixture files. */
  function options(overrides: Partial<TuneOptions> = {}): { given: TuneOptions; lines: string[]; root: string } {
    const root = scratch();
    const config = { ...defaultConfig(), runDir: path.join(root, 'runs') };
    const lines: string[] = [];
    const given: TuneOptions = {
      urls: [RELEASE],
      trials: 1,
      maxCalls: 10,
      clientKind: 'fake',
      sourcesKind: 'fixtures',
      config,
      sources: demoRegistry(),
      fetcher: demoFetcher(() => START),
      buildClient: (wrap) => clientFromConfig(config, { kind: 'fake', fake: story() }, {}, {}, undefined, wrap),
      date: '2026-10-05',
      stamp: 'made-up',
      out: (line) => void lines.push(line),
      ...overrides,
    };
    return { given, lines, root };
  }

  it('refuses the api client on the made-up world, with the reason that a run gives, before anything is fetched, asked or written', async () => {
    const { given, lines, root } = options({ clientKind: 'api' });
    await expect(runTune(given)).rejects.toThrow(TuneRefused);
    await expect(runTune(given)).rejects.toThrow(refuseApiOnFixtures('api', 'fixtures')!);
    expect(lines).toEqual([]);
    expect(existsSync(path.join(root, 'runs'))).toBe(false);
  });

  it('refuses a client that is neither the api nor the scripted one, because the recorded replies are not for tuning', async () => {
    const { given, root } = options({ clientKind: 'recorded' });
    await expect(runTune(given)).rejects.toThrow('tune takes the api client or the scripted one, not recorded');
    expect(existsSync(path.join(root, 'runs'))).toBe(false);
  });

  it('runs the scripted client on the made-up world, which costs nothing: the same table, from fixture pages', async () => {
    const { given, lines, root } = options();
    const { record, dir } = await runTune(given);
    expect(record.rows.map((row) => row.status)).toEqual(['judged']);
    expect(lines).toContain('  claims proposed: 7');
    expect(path.relative(root, dir)).toBe('runs/tune/made-up');
  });
});
