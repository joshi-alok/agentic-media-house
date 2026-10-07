import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Claim, RunOutcome, SourcesRegistry } from '@robywire/gate';
import { RunRecord, RunRefused, recordRun, runPath, takeRunLock, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, DeskConfig, EvidenceStore, Fetcher, PublishTarget, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { loadPublishedIndex } from '../stages/context';
import type { StageContext } from '../stages/context';
import { runDiscover } from '../stages/discover';
import { runExtract } from '../stages/extract';
import { runFetch } from '../stages/fetch';
import { runHold } from '../stages/hold';
import { runPublish } from '../stages/publish';
import { runSelect } from '../stages/select';
import { runVerify } from '../stages/verify';

// The orchestrator: one run of the Desk, from the stories of the day to a piece on the site, a hold, no story, or a failure. It gives every stage the same
// context, passes each stage what the one before it made, and ends in one of four outcomes. It never lets anything half done stand: a stage that throws
// ends the run as `failed` with the reason and the name of the stage, and nothing is published on the strength of it. Every run that is not dry ends with
// one commit and a record, `run.json`, in the folder of its day.

/** The stages, as functions, so that a test can put one of its own in the place of a stage. The defaults are the stages of the Desk. */
export interface Stages {
  discover: typeof runDiscover;
  select: typeof runSelect;
  fetch: typeof runFetch;
  extract: typeof runExtract;
  compose: typeof runCompose;
  verify: typeof runVerify;
  publish: typeof runPublish;
  hold: typeof runHold;
}

export const DEFAULT_STAGES: Stages = {
  discover: runDiscover,
  select: runSelect,
  fetch: runFetch,
  extract: runExtract,
  compose: runCompose,
  verify: runVerify,
  publish: runPublish,
  hold: runHold,
};

export interface RunDeskOptions {
  /** The day of the run, YYYY-MM-DD. */
  date: string;
  config: DeskConfig;
  sources: SourcesRegistry;
  fetcher: Fetcher;
  /** The model client of the run, inside its budget, and what it has spent: what `clientFromConfig` makes. */
  model: BuiltClient;
  /** Which client `model` is, and where the stories of the run come from. The record of the run says both, so that `desk replay` needs no flag for them. */
  clientKind: ClientKind;
  sourcesKind: SourcesKind;
  evidence: EvidenceStore;
  /** Where a piece, a hold and the record of the run are put: the site, or a target that writes nothing. */
  target: PublishTarget;
  /** The folder of the ledgers of the published pieces, which says what has been published. */
  ledgerDir: string;
  /** The clock. It is read for the time of the run and nowhere else; the stages never read it. */
  now: () => Date;
  /** Run again for a day that already has a run: the folder of the old run is moved aside, not removed. */
  forceNew?: boolean;
  /** A line for the log of the run, as it happens. Every line is also kept in the record. */
  log?: (line: string) => void;
  stages?: Partial<Stages>;
}

export interface RunResult {
  outcome: RunOutcome;
  runId: string;
  /** The stage that ended the run (see `RunRecord`). */
  stage: string;
  /** Why, for a hold, no story or a failure; null for a piece that was published. */
  reason: string | null;
  slug: string | null;
  /** The commit that the run made; null for a dry run, and for a run whose desk state could not be recorded. */
  commit: string | null;
  dry: boolean;
  /** The folder of the run. */
  dir: string;
  /** The files that the commit of the run covers (or would have covered, in a dry run). */
  files: string[];
}

/** The id of a run: its day and the time it started, to the second, in UTC (`2026-10-05-043100`). */
function runIdOf(date: string, start: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${date}-${two(start.getUTCHours())}${two(start.getUTCMinutes())}${two(start.getUTCSeconds())}`;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Every file in the folder of a run, below it, in order: the artifacts and the held drafts, but not the cassettes (the record is written after this is read). */
async function artifactsIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((name) => !name.startsWith('cassettes/'))
    .sort();
}

/**
 * Make the folder of the run ready. A folder that holds a record of a run that ended is refused, unless `forceNew` says to run again. A folder that is
 * there for any other reason (a run that never ended, or `forceNew`) is moved aside to `<folder>.old-1`, or the first number that is free, so that the
 * folder of a run never holds the artifacts of two runs, and nothing is removed.
 */
async function prepareFolder(dir: string, date: string, forceNew: boolean): Promise<void> {
  if (!(await exists(dir))) return;
  if (!forceNew && (await exists(path.join(dir, 'run.json')))) {
    throw new RunRefused('date-done', `the run of ${date} is already done (${path.join(dir, 'run.json')} is there): run it again with --force-new, which keeps the old run beside the new one`);
  }
  for (let number = 1; ; number++) {
    const aside = `${dir}.old-${number}`;
    if (await exists(aside)) continue;
    await rename(dir, aside);
    return;
  }
}

/** How the pipeline ended, before the run is recorded. */
type Ending =
  | { outcome: 'no-story'; stage: string; reason: string }
  | { outcome: 'published'; stage: 'publish'; slug: string; commit: string | null; files: string[] }
  | { outcome: 'held'; stage: 'hold'; slug: string; reason: string; commit: string | null; files: string[] }
  | { outcome: 'failed'; stage: string; reason: string };

/**
 * Run the Desk for one day.
 *
 * Before anything else the run takes the lock (`<runs folder>/.lock`, made so that it fails if it is there, and removed when the run ends however it ends),
 * and is refused when the lock is held, when the day already has a run (unless `forceNew`), or when the site has changes that are not committed where
 * the Desk writes. A refusal is a `RunRefused` error: nothing ran, so nothing is recorded.
 *
 * Then Discover, Select, Fetch, Extract, Compose and Verify in turn, each given what the one before it made. A story that is not there (Select chooses none,
 * Fetch gets no page, Extract keeps too few claims) ends the run as `no-story`. Verify's verdict ends it as `published` (the Publish stage) or `held` (the
 * Hold stage). Anything a stage throws, a model error and a spent budget included, ends it as `failed`, with the message and the name of the stage. The
 * desk state is updated for every outcome: by Publish and by Hold for those two, here for the other two. The record of the run, `run.json`, is written last.
 */
export async function runDesk(options: RunDeskOptions): Promise<RunResult> {
  const { date, config, target } = options;
  const dir = runPath(config.runDir, date);
  const startedAt = options.now();
  const runId = runIdOf(date, startedAt);
  const stages: Stages = { ...DEFAULT_STAGES, ...options.stages };

  const release = await takeRunLock(config.runDir, startedAt, runId);
  try {
    await prepareFolder(dir, date, options.forceNew === true);
    try {
      await target.preflight();
    } catch (error) {
      throw new RunRefused('target', describeError(error));
    }
    await mkdir(dir, { recursive: true });

    const lines: string[] = [];
    const log = (line: string): void => {
      lines.push(line);
      options.log?.(line);
    };
    const run = { runId, at: startedAt.toISOString() };
    let stage = 'start';

    const pipeline = async (): Promise<Ending> => {
      const ctx: StageContext = {
        date,
        config,
        sources: options.sources,
        fetcher: options.fetcher,
        client: options.model.client,
        evidence: options.evidence,
        runDir: dir,
        published: await loadPublishedIndex(options.ledgerDir),
        log,
      };
      stage = 'discover';
      const discovered = await stages.discover(ctx);
      stage = 'select';
      const selected = await stages.select(ctx, discovered);
      if (selected.chosen === null) return { outcome: 'no-story', stage, reason: selected.reasons.join(' ') };
      stage = 'fetch';
      const fetched = await stages.fetch(ctx, selected);
      if (!fetched.ok) return { outcome: 'no-story', stage, reason: fetched.reason };
      stage = 'extract';
      const extracted = await stages.extract(ctx, fetched.snapshots, selected);
      if (!extracted.ok) return { outcome: 'no-story', stage, reason: extracted.reason };
      const claims: Claim[] = extracted.artifact.claims;
      stage = 'compose';
      const composed = await stages.compose(ctx, claims);
      stage = 'verify';
      const verified = await stages.verify(ctx, claims, composed);
      if (verified.outcome === 'publish') {
        stage = 'publish';
        const published = await stages.publish(ctx, target, claims, verified, run);
        return { outcome: 'published', stage: 'publish', slug: published.slug, commit: published.commit, files: published.files };
      }
      stage = 'hold';
      const held = await stages.hold(ctx, target, claims, verified, run);
      return { outcome: 'held', stage: 'hold', slug: held.slug, reason: `held for ${held.reasons.join(', ')}`, commit: held.commit, files: held.files };
    };

    let ending: Ending;
    try {
      ending = await pipeline();
    } catch (error) {
      ending = { outcome: 'failed', stage, reason: describeError(error) };
    }

    // A run that published or held has recorded itself in the desk state; the other two outcomes are recorded here. A record that cannot be made is said in
    // the reason, and does not change how the run ended.
    let commit: string | null = ending.outcome === 'published' || ending.outcome === 'held' ? ending.commit : null;
    let files: string[] = ending.outcome === 'published' || ending.outcome === 'held' ? ending.files : [];
    if (ending.outcome === 'no-story' || ending.outcome === 'failed') {
      const { outcome } = ending;
      try {
        const result = await target.apply({
          state: (state) => recordRun(state, { at: run.at, outcome, runId, slug: null }),
          message: outcome === 'failed' ? `desk: the run of ${date} failed` : `desk: no story on ${date}`,
        });
        commit = result.commit;
        files = result.files;
      } catch (error) {
        ending = { ...ending, reason: `${ending.reason} (the desk state could not be updated: ${describeError(error)})` };
      }
    }

    const slug = ending.outcome === 'published' || ending.outcome === 'held' ? ending.slug : null;
    const reason = ending.outcome === 'published' ? null : ending.reason;
    const record: RunRecord = {
      runId,
      date,
      startedAt: startedAt.toISOString(),
      finishedAt: options.now().toISOString(),
      outcome: ending.outcome,
      stage: ending.stage,
      reason,
      slug,
      commit,
      dry: target.dry,
      client: options.clientKind,
      sources: options.sourcesKind,
      attempt: 1,
      models: { ...config.models },
      budget: { limit: { ...config.budget }, spent: options.model.spent() },
      artifacts: await artifactsIn(dir),
      log: lines,
    };
    await writeJsonFile(path.join(dir, 'run.json'), 'the run record run.json', record, RunRecord);
    return { outcome: ending.outcome, runId, stage: ending.stage, reason, slug, commit, dry: target.dry, dir, files };
  } finally {
    await release();
  }
}
