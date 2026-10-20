import { appendFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { CORRECTION_KINDS, isProfileId, loadSources } from '@robywire/gate';
import type { CorrectionKind, ProfileId, SourcesRegistry } from '@robywire/gate';
import {
  BUILD_FAILED_FOLDER,
  CLIENT_KINDS,
  ForgeError,
  HttpFetcher,
  MAIN_BRANCH,
  PackError,
  PushFailed,
  RetractRefused,
  RunRefused,
  SOURCES_KINDS,
  clientFromConfig,
  defaultConfig,
  gitRunner,
  buildFailedPullRequest,
  buildFailureOf,
  isPlainSlug,
  loadConfig,
  makeEvidenceStore,
  normaliseReason,
  nodeExec,
  packArtifact,
  placeholderHost,
  pushLines,
  pushRun,
  pushToSideBranch,
  readDeskState,
  readRunRecord,
  refuseApiOnFixtures,
  retractPiece,
  runPath,
  sideLines,
  sitePaths,
  DryTarget,
  FakeClient,
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, EvidenceStore, Fetcher, ForgeTarget, GitRunner, GitTarget, Lookup, ModelClient, PushOutcome, RetryOptions, SourcesKind, StoreTransport, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import type { RunResult, Stages } from './run/orchestrate';
import { replayRun } from './run/replay';
import { checkSources, formatSourceCheck } from './run/sources-check';
import { TUNE_DEFAULT_CALLS, TUNE_MAX_CALLS, TUNE_MAX_TRIALS, TuneRefused, parseUrlList, runTune } from './run/tune';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>`, `desk status`, `desk sources-check`, `desk retract <slug>`, `desk tune`, `desk push` and `desk pack-artifact`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story, for a replay that came out equal, for a correction that was made and for a check of sources in which every source could be read, 1 for a run that failed, was refused or could not start, a
// replay that differs, a correction that was refused or failed and a check in which a source could not be read, and 2 for a usage error.

export type { ClientKind, SourcesKind };

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; skipIfDone: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'sources-check'; items: boolean; config: string | undefined }
  | { command: 'retract'; slug: string; reason: string; kind: CorrectionKind; dry: boolean }
  | { command: 'tune'; urls: string; trials: number; maxCalls: number; client: 'api' | 'fake'; config: string | undefined; profile: ProfileId | undefined }
  | { command: 'push'; runId: string | undefined; output: string | undefined; branchOnly: boolean; auditLog: string | undefined }
  | { command: 'pack-artifact'; runDir: string; outDir: string }
  | { command: 'help' };

/** What the arguments mean, or why they do not. */
export type ParseResult = { ok: true; args: Parsed } | { ok: false; message: string };

export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--skip-if-done] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '  desk sources-check [--items] [--config <path>]',
  '  desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]',
  '  desk tune --urls <file> [--trials N] [--max-calls M] [--client api|fake] [--profile brief|digest|explainer] [--config <path>]',
  '  desk push [--branch-only] [--run-id <id>] [--output <file>] [--audit-log <file>]',
  '  desk pack-artifact <folder of a run> <folder for the pack>',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        --client api is refused with --sources fixtures, dry or not: it would spend money on made-up pages (use --client fake or --client recorded).',
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  '        --skip-if-done is for a schedule that starts the command more than once a day: a day that is done is not an error but a day to leave alone. The command says',
  '        "outcome: refused-already-done", exits 0 and runs nothing (asks no model, fetches nothing, writes nothing) when the desk state says that the last run was of this day and',
  '        did not fail, or when the folder of the runs has a record of a run of this day that did not fail. Every other refusal is still an exit code 1, and it cannot be given with --force-new.',
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
  '        The snapshots of the pages that a run reads are kept in the evidence store that the setting evidence.kind of a file of settings (--config) chooses: local, a folder',
  '        (evidenceDir), which is the default, or r2, a private bucket on Cloudflare R2, whose address, name and keys are read from the environment (R2_ENDPOINT, R2_BUCKET,',
  '        R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY) and never from a file. --sources fixtures is refused with r2, because nothing made up may be put in the bucket.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
  '        contradicts it is refused. A run made with --client recorded has no replies of its own: replay it with --cassettes. A record from before records',
  '        said how a run was made needs --sources.',
  'status  print the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions.',
  '        The desk state has all but the try, which is read from the record of the run in the folder of the runs, if it is there.',
  'sources-check  fetch every entry of sources.yml as the Desk fetches (robots.txt honoured, at the pace of the settings), read each feed, and print whether it can be read; it writes nothing and needs no key.',
  '        --items lists under each feed its newest stories that hold a keyword and link to a primary page, to choose pages from. It needs --config for the real user agent, as a live run does.',
  'retract record a correction (the default) or a retraction of a piece that is on the site: the note goes into the desk state, updatedAt of the piece is set to today',
  '        (UTC), and the two are committed in one commit. The reason is one line of at most 500 characters. Nothing is deleted: the page stays up with its notice. A piece',
  '        that was held is on its pull request until the owner merges it, and cannot be corrected before. --dry says what would be done and writes nothing.',
  'tune    try the pipeline on real pages and say what each step found. --urls is a file of addresses, one to a line (a # starts a comment). Each page is fetched as the Desk fetches',
  '        (robots.txt honoured, at the pace of the settings) and sent through Extract, Compose and Verify with --client api (the default; it needs ANTHROPIC_API_KEY) or --client fake (a model',
  '        that proposes no claims: it tries the fetching and the sorting of the pages and costs nothing). --trials N runs the model steps N times on each page (1 to 10, 1 unless told otherwise),',
  '        and --max-calls M stops the whole invocation, with exit code 1, when it has made M model calls (1 to 200, 40 unless told otherwise); each trial is also held to the budget of the settings.',
  '        --profile judges the drafts against the ranges of a kind of piece (brief, digest or explainer) instead of the defaults of the gate, and tells the writer the same ranges.',
  '        For each page and trial it prints the claims proposed, dropped (with the rule that dropped them) and kept, what the gate said of the draft, what the model check said of its sentences,',
  '        and the tokens (dollars too when the settings have prices). Nothing is published or committed: it writes only below runs/tune/<stamp>/, and keeps the pages there, never in the bucket.',
  'push    push to main of origin the commits that this checkout has and origin/main has not (what a run committed), after a fetch, and say what it did. Nothing ahead is not an error and exits 0.',
  '        A push that is rejected because somebody else pushed is made again on top of what they pushed (up to 3 more times); a push that cannot be put on top (the desk state is the',
  '        usual cause), or that main does not take, puts the commits on the branch desk-rescue/<day>-<id> instead, says where they are, and exits 1. Every error of git, a checkout on',
  '        no branch or on another branch than main, a missing remote and a remote with no main are exit code 1 too: a push never fails open. --run-id names the rescue branch (the workflow gives',
  '        the number of its run; by default it is the time) and --output <file> is where the line pushed=true is added when the commits were pushed (the file that GitHub gives a step).',
  '        --branch-only is for commits that must not reach main because the site does not build with them: they are pushed to the branch desk-build-failed/<day>-<id> and a draft pull request',
  '        is opened on it, whose text holds only fixed sentences, the ids of the checks of the audit that failed and their number of problems, read from --audit-log (the report that',
  '        npm run audit:prod printed; a file that is not there says that the build failed before the audit). It does not push to main and cannot be given with --output.',
  'pack-artifact  make, of the folder of a run, the small files that are uploaded as the artifact of a workflow of a public repository: run.json (the outcome, the stage, the try, the budget, the number of files of each kind) and one file for each',
  '        stage (counts, the codes of the checks, the counts of the verdicts of the model check, hashes, sizes), written into the second folder, which must be empty or not there. No reply of a model, reason of the verifier, sentence of a',
  '        draft, quotation, title or word of a page is ever in it: each field that goes in is named, and nothing else is copied. A pack of more than 24 KB, or a file of it of more than 8 KB, is an error. A folder of a run that is not there',
  '        (a day that was done has none) is not an error: nothing is packed, and the command exits 0.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'sources-check' | 'retract' | 'tune' | 'push' | 'pack-artifact', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new', '--skip-if-done'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
  'sources-check': { flags: ['--items'], valued: ['--config'] },
  retract: { flags: ['--dry'], valued: ['--reason', '--kind'] },
  tune: { flags: [], valued: ['--urls', '--trials', '--max-calls', '--client', '--config', '--profile'] },
  push: { flags: ['--branch-only'], valued: ['--run-id', '--output', '--audit-log'] },
  'pack-artifact': { flags: [], valued: [] },
};

const CLIENTS: readonly string[] = CLIENT_KINDS;
const SOURCES: readonly string[] = SOURCES_KINDS;

/** Is `text` a day, YYYY-MM-DD, that exists? */
function isDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * Read the arguments (without the program and the script). A command, then its options in any order. A flag is given once, a valued option has
 * a value that does not start with `--`, and every value is checked; an option of another command, an unknown option, an argument the command does not take
 * and a missing one are refused, each with a message that names it. Some combinations are refused because they would spend money on made-up pages (`--client api`
 * with `--sources fixtures`, whether or not the run is dry, see `refuseApiOnFixtures`) or put made-up content, or an unrecorded model, where it does not belong:
 * `--client fake` and `--sources fixtures` only with `--dry`, and `--client recorded` only with `--cassettes` (which is for `recorded` alone when running).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const fail = (message: string): ParseResult => ({ ok: false, message });
  const [command, ...rest] = argv;
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status' && command !== 'sources-check' && command !== 'retract' && command !== 'tune' && command !== 'push' && command !== 'pack-artifact') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
  const positional: string[] = [];
  const allowed = OPTIONS[command];
  for (let at = 0; at < rest.length; at++) {
    const word = rest[at] as string;
    if (!word.startsWith('--')) {
      positional.push(word);
      continue;
    }
    if (given.has(word)) return fail(`${word} is given twice`);
    if (allowed.flags.includes(word)) {
      given.set(word, true);
    } else if (allowed.valued.includes(word)) {
      const value = rest[at + 1];
      if (value === undefined || value.startsWith('--')) return fail(`${word} needs a value`);
      given.set(word, value);
      at++;
    } else {
      return fail(`unknown option ${word} for ${command}`);
    }
  }

  const value = (name: string): string | undefined => {
    const found = given.get(name);
    return typeof found === 'string' ? found : undefined;
  };
  if (command === 'status') {
    if (positional.length > 0) return fail(`status takes no arguments, but was given "${positional[0]}"`);
    return { ok: true, args: { command: 'status', config: value('--config') } };
  }
  if (command === 'sources-check') {
    if (positional.length > 0) return fail(`sources-check takes no arguments, but was given "${positional[0]}"`);
    return { ok: true, args: { command: 'sources-check', items: given.has('--items'), config: value('--config') } };
  }
  if (command === 'retract') {
    if (positional.length === 0) return fail('retract needs the slug of a piece');
    if (positional.length > 1) return fail(`retract takes one slug, but was given "${positional.join('" and "')}"`);
    const slug = positional[0] as string;
    if (!isPlainSlug(slug)) return fail(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
    const reason = value('--reason');
    if (reason === undefined) return fail('retract needs --reason <text>: why the piece is corrected or retracted');
    const noted = normaliseReason(reason);
    if (!noted.ok) return fail(noted.message);
    const kind = value('--kind') ?? 'correction';
    if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) return fail(`--kind is correction or retraction, not "${kind}"`);
    return { ok: true, args: { command: 'retract', slug, reason, kind: kind as CorrectionKind, dry: given.has('--dry') } };
  }
  if (command === 'pack-artifact') {
    if (positional.length !== 2) return fail(`pack-artifact needs the folder of a run and the folder for the pack, and was given ${positional.length === 0 ? 'neither' : positional.length === 1 ? 'only one' : `${positional.length} arguments`}`);
    return { ok: true, args: { command: 'pack-artifact', runDir: positional[0] as string, outDir: positional[1] as string } };
  }
  if (command === 'push') {
    if (positional.length > 0) return fail(`push takes no arguments, but was given "${positional[0]}"`);
    const runId = value('--run-id');
    if (runId !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId)) return fail(`--run-id is lowercase letters and digits joined by single hyphens, not "${runId}"`);
    const branchOnly = given.has('--branch-only');
    if (branchOnly && given.has('--output')) return fail('--output is for the push to main and cannot be given with --branch-only, which does not push to main');
    if (!branchOnly && given.has('--audit-log')) return fail('--audit-log is for --branch-only: it is the report that the pull request of the commits whose build failed is made from');
    return { ok: true, args: { command: 'push', runId, output: value('--output'), branchOnly, auditLog: value('--audit-log') } };
  }
  if (command === 'tune') {
    if (positional.length > 0) return fail(`tune takes no arguments, but was given "${positional[0]}"`);
    const urls = value('--urls');
    if (urls === undefined) return fail('tune needs --urls <file>: the file that lists the addresses of the pages to try, one to a line');
    const whole = (given: string | undefined, fallback: number, most: number): number | undefined => (given === undefined ? fallback : /^[1-9]\d{0,5}$/.test(given) && Number(given) <= most ? Number(given) : undefined);
    const trials = whole(value('--trials'), 1, TUNE_MAX_TRIALS);
    if (trials === undefined) return fail(`--trials is a whole number from 1 to ${TUNE_MAX_TRIALS}, not "${value('--trials')}"`);
    const maxCalls = whole(value('--max-calls'), TUNE_DEFAULT_CALLS, TUNE_MAX_CALLS);
    if (maxCalls === undefined) return fail(`--max-calls is a whole number from 1 to ${TUNE_MAX_CALLS}, not "${value('--max-calls')}"`);
    const client = value('--client') ?? 'api';
    if (client !== 'api' && client !== 'fake') return fail(`--client is api or fake for tune, not "${client}"`);
    const profile = value('--profile');
    if (profile !== undefined && !isProfileId(profile)) return fail(`--profile is brief, digest or explainer, not "${profile}"`);
    return { ok: true, args: { command: 'tune', urls, trials, maxCalls, client, config: value('--config'), profile: profile as ProfileId | undefined } };
  }
  const sourcesGiven = value('--sources');
  if (sourcesGiven !== undefined && !SOURCES.includes(sourcesGiven)) return fail(`--sources is fixtures or live, not "${sourcesGiven}"`);
  const clientGiven = value('--client');
  if (clientGiven !== undefined && !CLIENTS.includes(clientGiven)) return fail(`--client is fake, recorded or api, not "${clientGiven}"`);

  if (command === 'replay') {
    if (positional.length === 0) return fail('replay needs the folder of a run');
    if (positional.length > 1) return fail(`replay takes one folder, but was given "${positional.join('" and "')}"`);
    return {
      ok: true,
      args: { command: 'replay', runDir: positional[0] as string, sources: sourcesGiven as SourcesKind | undefined, client: clientGiven as ClientKind | undefined, cassettes: value('--cassettes'), config: value('--config') },
    };
  }

  if (positional.length > 0) return fail(`run takes no arguments, but was given "${positional[0]}"`);
  const sources = sourcesGiven ?? 'live';
  const client = clientGiven ?? 'api';
  const date = value('--date');
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
  const dry = given.has('--dry');
  const spending = refuseApiOnFixtures(client as ClientKind, sources as SourcesKind);
  if (spending !== undefined) return fail(spending);
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
  if (given.has('--skip-if-done') && given.has('--force-new')) {
    return fail('--skip-if-done and --force-new contradict each other: the first leaves a day that is done alone and the second runs it again');
  }
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), skipIfDone: given.has('--skip-if-done'), cassettes, config: value('--config') } };
}

/** What `main` needs from outside. */
export interface CliDeps {
  /** One line of output, and one line of error output. */
  out(line: string): void;
  err(line: string): void;
  /** The environment: where `ANTHROPIC_API_KEY` is read from, and nothing else. */
  env: Environment;
  /** The root of the repository: `sources.yml`, `site/`, `runs/` and `evidence/` are below it. */
  cwd: string;
  now: () => Date;
  /** What commits for a run that is not dry. */
  git: GitTarget;
  /** Where a held piece is sent to the owner, for a run that is not dry: a branch is pushed and a draft pull request is opened. Without one a hold is only recorded. */
  forge?: ForgeTarget;
  /** Stages that take the place of the real ones, which a test uses to give a run an ending that the scripted story does not reach. */
  stages?: Partial<Stages>;
  /** The settings of the run. By default `defaultConfig()` with the folders of the runs and of the evidence below `cwd`. */
  config?: DeskConfig;
  /** How live sources are fetched; the default is the global `fetch`. */
  transport?: Transport;
  /** How the names of live sources are looked up, to check that they are public addresses; the default asks the system. */
  lookup?: Lookup;
  /** How the requests to a bucket of the evidence store are made, when the setting evidence.kind is r2; the default is the global `fetch`. */
  evidenceTransport?: StoreTransport;
  /** How the api client waits between tries. */
  retry?: RetryOptions;
  /** Git in the folder of the checkout, as `desk push` runs it; by default the program `git` in `cwd`. */
  pushGit?: GitRunner;
  /** The scripted model that `desk tune --client fake` uses, which a test gives a story to tell. By default it is one that proposes no claims on any page. */
  tuneClient?: FakeClient;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/**
 * The settings of a run: those of the file that `--config` names (laid over the defaults by `loadConfig`, which refuses a file that cannot be read or has a
 * setting that is wrong, naming the file; the file is looked for from `cwd`, and its folders, when they are relative, are below `cwd`), or else those that `deps` gives, or else the
 * defaults with their folders below `cwd`.
 */
function configOf(deps: CliDeps, file: string | undefined): DeskConfig {
  if (file !== undefined) {
    const loaded = loadConfig(path.resolve(deps.cwd, file));
    return { ...loaded, runDir: path.resolve(deps.cwd, loaded.runDir), evidenceDir: path.resolve(deps.cwd, loaded.evidenceDir) };
  }
  if (deps.config !== undefined) return deps.config;
  return { ...defaultConfig(), runDir: path.join(deps.cwd, 'runs'), evidenceDir: path.join(deps.cwd, 'evidence') };
}

/** The settings that the arguments name, or the exit code 2 and the reason, said on the error output: a mistake in a file of settings is a mistake in the arguments. */
function settingsOf(deps: CliDeps, file: string | undefined): { config: DeskConfig } | { code: number } {
  try {
    return { config: configOf(deps, file) };
  } catch (error) {
    deps.err(describeError(error));
    return { code: 2 };
  }
}

/**
 * The evidence store that the settings ask for, built from the environment of `deps` (`makeEvidenceStore`), or the exit code 2 and the reason, said on the error output. The made-up world
 * is refused for a bucket: its pages are fiction, and nothing made up may be put where a published piece will cite its evidence.
 */
function evidenceOf(deps: CliDeps, config: DeskConfig, sources: SourcesKind): { evidence: EvidenceStore } | { code: number } {
  if (sources === 'fixtures' && config.evidence.kind === 'r2') {
    deps.err('desk: --sources fixtures is a made-up world and is refused when the setting evidence.kind is r2: nothing made up may be put in the bucket, which a published piece cites its evidence from');
    return { code: 2 };
  }
  try {
    return { evidence: makeEvidenceStore(config, deps.env, { now: deps.now, ...(deps.evidenceTransport === undefined ? {} : { transport: deps.evidenceTransport }) }) };
  } catch (error) {
    deps.err(`desk: ${describeError(error)}`);
    return { code: 2 };
  }
}

/** The registry and the fetcher of the sources that were asked for. */
function sourcesOf(kind: SourcesKind, deps: CliDeps, config: DeskConfig): { sources: SourcesRegistry; fetcher: Fetcher } {
  if (kind === 'fixtures') return { sources: demoRegistry(), fetcher: demoFetcher(deps.now) };
  const fetcher = new HttpFetcher({ userAgent: config.userAgent, maxBytes: config.maxBytes, requestIntervalMs: config.requestIntervalMs, ...(deps.transport === undefined ? {} : { transport: deps.transport }), ...(deps.lookup === undefined ? {} : { lookup: deps.lookup }) });
  return { sources: loadSources(path.join(deps.cwd, 'sources.yml')), fetcher };
}

/** What `desk run` prints when the run ended, one line each: the outcome, the run, the try, the folder, the piece, the pull request, the reason, the stage that ended a run with no piece, and the commit. */
export function resultLines(result: RunResult): string[] {
  const lines = [`outcome: ${result.outcome}`, `run: ${result.runId}`, `attempt: ${result.attempt}`, `folder: ${result.dir}`];
  if (result.slug !== null) lines.push(`piece: ${result.slug}`);
  if (result.pullRequest !== null) lines.push(`pull request: ${result.pullRequest}`);
  if (result.reason !== null) lines.push(`reason: ${result.reason}`);
  if (result.outcome === 'no-story' || result.outcome === 'failed') lines.push(`stage: ${result.stage}`);
  if (result.dry) lines.push(`dry run: nothing was written to the site or to git (${result.files.length} files would have been)`);
  else if (result.commit !== null) lines.push(`commit: ${result.commit}`);
  return lines;
}

/** Why a user agent that links to a placeholder address is refused for `what` (a live run, a tuning run): the site that is asked cannot find out who is asking. */
const placeholderRefusal = (userAgent: string, host: string, what: string): string =>
  `desk: the user agent "${userAgent}" links to ${host}, which is a placeholder address: ${what} needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`;

/** A path as it is shown to a person: relative to the folder the command was started in, with forward slashes. */
const shownPath = (cwd: string, file: string): string => path.relative(cwd, file).split(path.sep).join('/');

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
  const day = runId.slice(0, 10);
  return runId.charAt(10) === '-' && isDay(day) ? day : undefined;
}

/**
 * What a day that is done looks like in a checkout that has no folder of runs, which is every checkout of a scheduled job: the last run of the desk state, when it is a run of
 * `date` that did not fail. The state is committed, so it is the one record of a run that the next job has. A state that cannot be read is not an answer: it is left for the run to report.
 */
async function doneInState(deps: CliDeps, date: string): Promise<{ runId: string; outcome: string; at: string } | undefined> {
  try {
    const { lastRun } = await readDeskState(path.join(deps.cwd, sitePaths().stateFile));
    return lastRun !== null && lastRun.outcome !== 'failed' && dayOfRun(lastRun.runId) === date ? lastRun : undefined;
  } catch {
    return undefined;
  }
}

/** What `desk run --skip-if-done` prints when the day is done: the outcome that says so, the day, why, and that nothing was run. */
export function skippedLines(date: string, why: string): string[] {
  return ['outcome: refused-already-done', `day: ${date}`, `reason: ${why}`, 'nothing was run: no model was asked, no page was fetched and nothing was written'];
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const placeholder = args.sources === 'live' ? placeholderHost(config.userAgent) : undefined;
  if (placeholder !== undefined) {
    deps.err(placeholderRefusal(config.userAgent, placeholder, 'a live run'));
    return 2;
  }
  const date = args.date ?? (args.sources === 'fixtures' ? DEMO_DATE : deps.now().toISOString().slice(0, 10));
  if (args.skipIfDone) {
    // Before the sources, the evidence store and the client are built, so that a day that is done needs no key and no bucket.
    const done = await doneInState(deps, date);
    if (done !== undefined) {
      for (const line of skippedLines(date, `the desk state says that the run ${done.runId} ended ${done.outcome} at ${done.at}`)) deps.out(line);
      return 0;
    }
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf(args.sources, deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }

  const store = evidenceOf(deps, config, args.sources);
  if ('code' in store) return store.code;

  let choice: ClientChoice;
  if (args.client === 'fake') choice = { kind: 'fake', fake: demoClient() };
  else if (args.client === 'recorded') choice = { kind: 'recorded', cassetteDir: path.resolve(deps.cwd, args.cassettes as string) };
  else choice = { kind: 'api' };
  let model: BuiltClient;
  try {
    // A run records the replies of the model beside its artifacts, so that `desk replay` can run it again; a run that replays recorded replies has no need.
    model = clientFromConfig(config, choice, deps.env, deps.retry ?? {}, args.client === 'recorded' ? undefined : path.join(runPath(config.runDir, date), 'cassettes'));
  } catch (error) {
    deps.err(describeError(error));
    return 2;
  }

  try {
    const result = await runDesk({
      date,
      config,
      sources: world.sources,
      fetcher: world.fetcher,
      model,
      clientKind: args.client,
      sourcesKind: args.sources,
      evidence: store.evidence,
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      stateFile: path.join(deps.cwd, sitePaths().stateFile),
      ...(deps.forge === undefined ? {} : { forge: deps.forge }),
      ...(deps.stages === undefined ? {} : { stages: deps.stages }),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    for (const line of resultLines(result)) deps.out(line);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    if (args.skipIfDone && error instanceof RunRefused && error.kind === 'date-done') {
      for (const line of skippedLines(date, `the run of ${date} is already done: ${shownPath(deps.cwd, path.join(runPath(config.runDir, date), 'run.json'))} is there`)) deps.out(line);
      return 0;
    }
    deps.err(error instanceof RunRefused ? `the run was refused: ${error.message}` : `the run could not start: ${describeError(error)}`);
    return 1;
  }
}

/**
 * What a replay takes from the record of the run and from its flags: the sources to read the registry from, or why the run cannot be replayed with what it was given.
 * The record says which client and which sources the run used. A flag is only a check on it: one that says the other thing is refused, because a replay with another
 * registry, or from another run's replies, would differ for that reason alone and look like a change of code, and no flag overrides the record. A record from before
 * records said how a run was made has nothing to check against, so it needs `--sources`. A run made with the recorded client read its replies from a folder that the
 * record does not name, so a replay of it needs `--cassettes`.
 */
function howToReplay(record: StoredRunRecord, args: Extract<Parsed, { command: 'replay' }>): { sources: SourcesKind } | { message: string } {
  if (record.sources !== undefined && args.sources !== undefined && args.sources !== record.sources) {
    return {
      message: `the run ${record.runId} was made with --sources ${record.sources}, so it cannot be replayed with --sources ${args.sources}: the pages and the registry of a replay must be the ones the run had, and the record of the run says which`,
    };
  }
  if (record.client !== undefined && args.client !== undefined && args.client !== record.client) {
    return {
      message: `the run ${record.runId} was made with --client ${record.client}, so it cannot be replayed with --client ${args.client}: the replies of a replay are the ones the run recorded, and the record of the run says who gave them`,
    };
  }
  const sources = record.sources ?? args.sources;
  if (sources === undefined) {
    return {
      message: `the record of the run ${record.runId} does not say how it was made (it was written before records did), so the replay needs the flags: --sources fixtures|live, and --cassettes <folder> if the run used --client recorded`,
    };
  }
  if ((record.client ?? args.client) === 'recorded' && args.cassettes === undefined) {
    return { message: `the run ${record.runId} was made with --client recorded, so its replies are not in its own folder: replay it with --cassettes <the folder of the recorded replies>` };
  }
  return { sources };
}

async function replayCommand(args: Extract<Parsed, { command: 'replay' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const runDir = path.resolve(deps.cwd, args.runDir);
  try {
    const how = howToReplay(await readRunRecord(path.join(runDir, 'run.json')), args);
    if ('message' in how) {
      deps.err(`desk: ${how.message}`);
      return 2;
    }
    const store = evidenceOf(deps, config, how.sources);
    if ('code' in store) return store.code;
    const report = await replayRun(runDir, {
      config,
      sources: sourcesOf(how.sources, deps, config).sources,
      evidence: store.evidence,
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      stateFile: path.join(deps.cwd, sitePaths().stateFile),
      ...(args.cassettes === undefined ? {} : { cassetteDir: path.resolve(deps.cwd, args.cassettes) }),
    });
    deps.out(`run: ${report.runId}`);
    for (const artifact of report.artifacts) deps.out(`${artifact.name}: ${artifact.status}${artifact.detail === null ? '' : ` (${artifact.detail})`}`);
    if (report.error !== null) deps.out(`the replay stopped: ${report.error}`);
    deps.out(report.equal ? 'replay: equal' : 'replay: not equal');
    return report.equal ? 0 : 1;
  } catch (error) {
    deps.err(`the run cannot be replayed: ${describeError(error)}`);
    return 1;
  }
}

/**
 * `desk tune`: the table of what each step found on each real page of a list. The settings are read first, then the list, then the registry, then the client (so that the api without a
 * key is refused before anything is fetched), and only then does the first page get fetched. A mistake in any of them is exit code 2 and nothing is written (the registry that cannot be read
 * is 1, as for `run`); an invocation that is stopped by the budget of calls is 1, with the reason on the error output; every other ending is 0, the pages that could not be tried included,
 * because what happened to them is in the table.
 */
async function tuneCommand(args: Extract<Parsed, { command: 'tune' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const placeholder = placeholderHost(config.userAgent);
  if (placeholder !== undefined) {
    deps.err(placeholderRefusal(config.userAgent, placeholder, 'a tuning run, which fetches live pages,'));
    return 2;
  }
  let text: string;
  try {
    text = await readFile(path.resolve(deps.cwd, args.urls), 'utf8');
  } catch (error) {
    deps.err(`desk: cannot read the list of addresses ${args.urls} (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`);
    return 2;
  }
  const listed = parseUrlList(text);
  if ('problem' in listed) {
    deps.err(`desk: the list of addresses ${args.urls}: ${listed.problem}`);
    return 2;
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf('live', deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }
  const choice: ClientChoice =
    args.client === 'fake'
      ? { kind: 'fake', fake: deps.tuneClient ?? new FakeClient().script('extract', ...Array.from({ length: listed.urls.length * args.trials }, () => ({ claims: [] }))) }
      : { kind: 'api' };
  const buildClient = (wrap: (client: ModelClient) => ModelClient): BuiltClient => clientFromConfig(config, choice, deps.env, deps.retry ?? {}, undefined, wrap);
  try {
    buildClient((client) => client);
  } catch (error) {
    deps.err(describeError(error));
    return 2;
  }
  const now = deps.now();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  deps.out(`tune: ${listed.urls.length} ${listed.urls.length === 1 ? 'address' : 'addresses'}, ${args.trials} ${args.trials === 1 ? 'trial' : 'trials'} each, at most ${args.maxCalls} model calls, client ${args.client}`);
  if (args.profile !== undefined) deps.out(`profile: ${args.profile}`);
  deps.out(`folder: ${shownPath(deps.cwd, path.join(config.runDir, 'tune', stamp))}`);
  try {
    const { record } = await runTune({
      urls: listed.urls,
      trials: args.trials,
      maxCalls: args.maxCalls,
      clientKind: args.client,
      sourcesKind: 'live',
      config,
      sources: world.sources,
      fetcher: world.fetcher,
      buildClient,
      date: now.toISOString().slice(0, 10),
      stamp,
      ...(args.profile === undefined ? {} : { profile: args.profile }),
      out: (line) => deps.out(line),
    });
    if (record.stopped === null) return 0;
    deps.err(`desk: the tuning stopped before it was done: ${record.stopped}`);
    return 1;
  } catch (error) {
    deps.err(error instanceof TuneRefused ? `desk: ${error.message}` : `the tuning could not be done: ${describeError(error)}`);
    return error instanceof TuneRefused ? 2 : 1;
  }
}

/**
 * `desk sources-check`: every entry of `sources.yml` is fetched as the Desk fetches (`sourcesOf('live', ...)`: robots.txt honoured, the pace and the user agent of the settings) and the result of
 * each is printed. Exit code 0 when every entry that was tried could be read, 1 when some could not (the lines say which), 2 for a mistake in the arguments or a user agent that links to an
 * `.example` address (a site that is asked by a user agent that points nowhere cannot find out who is asking). Nothing is written and no model is asked.
 */
async function sourcesCheckCommand(args: Extract<Parsed, { command: 'sources-check' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const placeholder = placeholderHost(config.userAgent);
  if (placeholder !== undefined) {
    deps.err(placeholderRefusal(config.userAgent, placeholder, 'a check of live sources'));
    return 2;
  }
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf('live', deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }
  try {
    const report = await checkSources(world.sources, world.fetcher);
    for (const line of formatSourceCheck(report, { items: args.items })) deps.out(line);
    return report.readable === report.tried ? 0 : 1;
  } catch (error) {
    deps.err(`the sources could not be checked: ${describeError(error)}`);
    return 1;
  }
}

/**
 * `desk push`: the commits of the run go to main of origin (`pushRun`). Pushed or nothing to push is exit code 0, and the line `pushed=true` is added to the file of `--output` when
 * they were pushed, which is how the step that starts the deploy knows that there is something to deploy. Commits that went to the rescue branch, and every error, are exit code 1.
 */
async function pushCommand(args: Extract<Parsed, { command: 'push' }>, deps: CliDeps): Promise<number> {
  if (args.branchOnly) return branchOnlyCommand(args, deps);
  const now = deps.now();
  let outcome: PushOutcome;
  try {
    outcome = await pushRun({
      git: deps.pushGit ?? gitRunner(nodeExec(), deps.cwd),
      remote: 'origin',
      branch: MAIN_BRANCH,
      retries: 3,
      rescuePrefix: 'desk-rescue',
      runId: args.runId ?? now.toISOString().slice(11, 19).replace(/:/g, ''),
      day: now.toISOString().slice(0, 10),
    });
  } catch (error) {
    deps.err(error instanceof PushFailed ? `desk: ${error.message}` : `the push could not be done: ${describeError(error)}`);
    return 1;
  }
  for (const line of pushLines(outcome)) (outcome.kind === 'rescued' ? deps.err : deps.out)(line);
  if (outcome.kind === 'pushed' && args.output !== undefined) {
    try {
      await appendFile(path.resolve(deps.cwd, args.output), 'pushed=true\n');
    } catch (error) {
      deps.err(`desk: the commits were pushed, but ${args.output} could not be written (${describeError(error)}), so nothing will say that they were: deploy by hand`);
      return 1;
    }
  }
  return outcome.kind === 'rescued' ? 1 : 0;
}

/**
 * `desk push --branch-only`: the commits that this checkout has and origin/main has not go to the branch `desk-build-failed/<day>-<run id>`, and a draft pull request into main is opened on
 * it, with the text that `buildFailedPullRequest` makes from the report of the audit in `--audit-log` (no file: the build failed before the audit). `main` is not pushed to. Exit code 0 when
 * the commits are on the branch and the pull request is open; 1 for every error, and for a checkout that has no commit to put on a branch (then it is main itself that does not build).
 */
async function branchOnlyCommand(args: Extract<Parsed, { command: 'push' }>, deps: CliDeps): Promise<number> {
  const now = deps.now();
  const day = now.toISOString().slice(0, 10);
  const runId = args.runId ?? now.toISOString().slice(11, 19).replace(/:/g, '');
  let side: Awaited<ReturnType<typeof pushToSideBranch>>;
  try {
    side = await pushToSideBranch({ git: deps.pushGit ?? gitRunner(nodeExec(), deps.cwd), remote: 'origin', branch: MAIN_BRANCH, folder: BUILD_FAILED_FOLDER, runId, day });
  } catch (error) {
    deps.err(error instanceof PushFailed ? `desk: ${error.message}` : `the push could not be done: ${describeError(error)}`);
    return 1;
  }
  if (side.kind === 'nothing') {
    deps.err('desk: the site does not build, and this checkout has no commit that origin/main does not have: it is main itself that does not build, so there is nothing to put on a branch and no pull request to open');
    return 1;
  }
  for (const line of sideLines(side)) deps.out(line);
  let report: string | undefined;
  if (args.auditLog !== undefined) {
    try {
      report = await readFile(path.resolve(deps.cwd, args.auditLog), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        deps.err(`desk: the commits are on the branch ${side.branch}, but the report of the audit ${args.auditLog} could not be read (${describeError(error)}), so no pull request was opened: open one by hand`);
        return 1;
      }
    }
  }
  if (deps.forge === undefined) {
    deps.err(`desk: the commits are on the branch ${side.branch}, but this command has no forge to open a pull request with: open one by hand`);
    return 1;
  }
  try {
    const request = buildFailedPullRequest({ day, runId, branch: side.branch, commits: side.commits, failure: buildFailureOf(report) });
    const opened = await deps.forge.openDraftPullRequest({ branch: side.branch, base: MAIN_BRANCH, ...request });
    deps.out(`pull request: ${opened.url}`);
    return 0;
  } catch (error) {
    deps.err(`desk: the commits are on the branch ${side.branch}, but the draft pull request could not be opened (${error instanceof ForgeError ? `${error.kind}: ` : ''}${describeError(error)}): open one by hand`);
    return 1;
  }
}

/**
 * `desk pack-artifact <folder of a run> <folder for the pack>`: the small files that are uploaded in place of the folder of the run (`packArtifact`). A folder of a run that is not there is no error,
 * because a day that was done has none: nothing is packed, and the exit code is 0. A pack that cannot be made, or that is too big, or a folder for it that is not empty, is exit code 1 with a message
 * that says nothing that is in the run.
 */
async function packCommand(args: Extract<Parsed, { command: 'pack-artifact' }>, deps: CliDeps): Promise<number> {
  try {
    const packed = await packArtifact(path.resolve(deps.cwd, args.runDir), path.resolve(deps.cwd, args.outDir));
    if (packed === undefined) {
      deps.out(`pack-artifact: ${args.runDir} is not there, so there is nothing to pack`);
      return 0;
    }
    deps.out(`pack-artifact: ${packed.files.length} files, ${packed.bytes} bytes, in ${args.outDir}`);
    for (const file of packed.files) deps.out(`pack-artifact: ${file}`);
    return 0;
  } catch (error) {
    deps.err(error instanceof PackError ? `desk: ${error.message}` : `the pack could not be made: ${describeError(error)}`);
    return 1;
  }
}

async function retractCommand(args: Extract<Parsed, { command: 'retract' }>, deps: CliDeps): Promise<number> {
  try {
    const result = await retractPiece({ repoDir: deps.cwd, git: deps.git, slug: args.slug, reason: args.reason, kind: args.kind, now: deps.now, dry: args.dry });
    deps.out(`piece: ${result.slug}`);
    deps.out(`kind: ${result.kind}`);
    deps.out(`recorded: ${result.at}`);
    deps.out(`updatedAt: ${result.updatedAt}`);
    deps.out(result.commit === null ? `dry run: nothing was written or committed (${result.files.join(', ')} would have been)` : `commit: ${result.commit}`);
    return 0;
  } catch (error) {
    deps.err(error instanceof RetractRefused ? `the correction was refused: ${error.message}` : `the correction failed: ${describeError(error)}`);
    return 1;
  }
}

/**
 * Which try of its day the run `runId` was, as the words that say it: from `run.json` in the folder of its day, which is there only on the machine that made the run (the
 * desk state does not hold it). When the record is not there, is of another run (a later run of the day has taken the folder), is from before records said which try
 * a run was, or cannot be read, the words say that the try is not known, and why, and never guess.
 */
async function describeAttempt(config: DeskConfig, cwd: string, day: string, runId: string): Promise<string> {
  const file = path.join(config.runDir, day, 'run.json');
  const shown = shownPath(cwd, file);
  if (!(await stat(file).then(() => true, () => false))) return `attempt not known (${shown} is not here)`;
  let record: StoredRunRecord;
  try {
    record = await readRunRecord(file);
  } catch {
    return `attempt not known (${shown} cannot be read)`;
  }
  if (record.runId !== runId) return `attempt not known (${shown} is the record of the run ${record.runId})`;
  if (record.attempt === undefined) return 'attempt not known (its record is from before records said which try it was)';
  return `attempt ${record.attempt}`;
}

async function statusCommand(args: Extract<Parsed, { command: 'status' }>, deps: CliDeps): Promise<number> {
  // Status reads the desk state, and the folder of the runs for the try of the last run, so a file of settings that is wrong is refused here as everywhere.
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  try {
    const state = await readDeskState(path.join(deps.cwd, sitePaths().stateFile));
    const { lastRun } = state;
    deps.out(lastRun === null ? 'last run: none yet' : `last run: ${lastRun.outcome} at ${lastRun.at} (run ${lastRun.runId}${lastRun.slug === null ? '' : `, piece ${lastRun.slug}`})`);
    if (lastRun !== null) {
      const day = dayOfRun(lastRun.runId);
      deps.out(day === undefined ? 'last run day: unknown' : `last run day: ${day}, ${await describeAttempt(settings.config, deps.cwd, day, lastRun.runId)}`);
    }
    deps.out(`holds: ${state.holds.length}`);
    deps.out(`corrections: ${state.corrections.filter((entry) => entry.kind === 'correction').length}`);
    deps.out(`retractions: ${state.corrections.filter((entry) => entry.kind === 'retraction').length}`);
    return 0;
  } catch (error) {
    deps.err(describeError(error));
    return 1;
  }
}

/** Run the command in `argv` (without the program and the script) and return the exit code. Never exits the process and never throws. */
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.err(`desk: ${parsed.message}`);
    deps.err(USAGE);
    return 2;
  }
  switch (parsed.args.command) {
    case 'help':
      deps.out(USAGE);
      return 0;
    case 'run':
      return runCommand(parsed.args, deps);
    case 'replay':
      return replayCommand(parsed.args, deps);
    case 'status':
      return statusCommand(parsed.args, deps);
    case 'sources-check':
      return sourcesCheckCommand(parsed.args, deps);
    case 'retract':
      return retractCommand(parsed.args, deps);
    case 'tune':
      return tuneCommand(parsed.args, deps);
    case 'push':
      return pushCommand(parsed.args, deps);
    case 'pack-artifact':
      return packCommand(parsed.args, deps);
  }
}
