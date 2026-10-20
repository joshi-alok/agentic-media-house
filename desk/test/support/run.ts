import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_CLAIMS, DEMO_REPLY, DEMO_SELECT_REASON, clearingVerifier, demoClient } from '../../src/demo/story';
import { DEMO_DATE, DEMO_URLS, demoFetcher, demoRegistry } from '../../src/demo/world';
import { defaultConfig } from '../../src/config';
import type { DeskConfig } from '../../src/config';
import { FakeClient } from '../../src/model/fake';
import { clientFromConfig } from '../../src/model/factory';
import { RunRecord, candidateId } from '../../src/run/artifacts';
import { LocalEvidenceStore } from '../../src/run/evidence';
import { FakeGit } from '../../src/run/git';
import { runDesk } from '../../src/run/orchestrate';
import type { RunDeskOptions, Stages } from '../../src/run/orchestrate';
import { DryTarget, SiteTarget, sitePaths } from '../../src/run/target';
import { FETCHED_AT } from './context';
import { filesBelow, makeSite } from './site';

// What the tests of whole runs share: a made-up checkout of the site, a run in the made-up world with a scripted model, and the few ways of reading
// what a run left. Every run is in new folders under the temporary directory with a fake git, so nothing of the real repository is touched.

/** When the runs of the tests start. */
export const START = new Date('2026-10-05T04:31:00.000Z');

/** The desk state, below the checkout of the site. */
export const STATE = sitePaths().stateFile;

/** A clock that gives the start of the run first and a second later each time after, so the record has a start and an end. */
export const clock = (): (() => Date) => {
  let ticks = 0;
  return () => new Date(START.getTime() + 1000 * ticks++);
};

/** The reply of the select model that chooses the report of Mercer Wire on the second plant. */
export const SELECT = { chosenId: candidateId(DEMO_URLS.mercerArticle), reasons: [DEMO_SELECT_REASON] };

export interface RunSetup {
  /** The scripted model; the model that tells the made-up story when none is given. */
  fake?: FakeClient;
  config?: Partial<DeskConfig>;
  /** A dry run: the target writes nothing. */
  dry?: boolean;
  stages?: Partial<Stages>;
  fetcher?: RunDeskOptions['fetcher'];
  forceNew?: boolean;
  /** Keep a cassette of every model call in `cassettes`, in the folder of the run, so that the run can be replayed. */
  record?: boolean;
}

/**
 * A run of the Desk in the made-up world: `run()` runs it, and `run({ ... })` runs it with some of its options replaced. The checkout, the folder of the
 * runs and the folder of the evidence are new, and `git` is the fake that the site target commits with.
 */
export function setupRun(scratch: () => string, options: RunSetup = {}) {
  const root = scratch();
  const repoDir = makeSite(path.join(root, 'repo'));
  const config: DeskConfig = { ...defaultConfig(), runDir: path.join(root, 'runs'), evidenceDir: path.join(root, 'evidence'), ...options.config };
  const git = new FakeGit();
  const fake = options.fake ?? demoClient();
  const logs: string[] = [];
  const dir = path.join(config.runDir, DEMO_DATE);
  const base: RunDeskOptions = {
    date: DEMO_DATE,
    config,
    sources: demoRegistry(),
    fetcher: options.fetcher ?? demoFetcher(() => FETCHED_AT),
    clientKind: 'fake',
    sourcesKind: 'fixtures',
    model: clientFromConfig(config, { kind: 'fake', fake }, {}, {}, options.record === true ? path.join(dir, 'cassettes') : undefined),
    evidence: new LocalEvidenceStore(config.evidenceDir),
    target: options.dry === true ? new DryTarget(repoDir) : new SiteTarget(repoDir, git),
    ledgerDir: path.join(repoDir, sitePaths().ledgerDir),
    stateFile: path.join(repoDir, sitePaths().stateFile),
    now: clock(),
    log: (line) => void logs.push(line),
    ...(options.stages === undefined ? {} : { stages: options.stages }),
    ...(options.forceNew === undefined ? {} : { forceNew: options.forceNew }),
  };
  return { base, repoDir, config, git, fake, logs, dir, run: (overrides: Partial<RunDeskOptions> = {}) => runDesk({ ...base, ...overrides }) };
}

/** The record of the run in the folder `dir`. */
export const recordOf = (dir: string): RunRecord => RunRecord.parse(JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8')));

/** What is in the content folders of the site: the pieces and the ledgers. */
export const contentOf = (repoDir: string): string[] => filesBelow(path.join(repoDir, 'site/src/content'));

/** The content folders of a site that has no piece. */
export const EMPTY_CONTENT = ['ledger/.gitkeep', 'news/.gitkeep'];

/** A model that says the story but whose verifier finds the title not entailed in every pass, so that the piece is revised twice and held. */
export function unentailed(): FakeClient {
  const rejecting = (request: Parameters<typeof clearingVerifier>[0]) => {
    const reply = clearingVerifier(request);
    return { ...reply, verdicts: reply.verdicts.map((verdict, at) => (at === 0 ? { ...verdict, reason: 'The passages do not say it.', missing: ['what the passages do not say'], verdict: 'not_entailed' as const } : verdict)) };
  };
  return new FakeClient()
    .script('select', SELECT)
    .script('extract', { claims: DEMO_CLAIMS })
    .script('compose', DEMO_REPLY, { replacements: [] }, { replacements: [] })
    .script('verify', rejecting, rejecting, rejecting);
}
