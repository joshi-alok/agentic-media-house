import { stat } from 'node:fs/promises';
import path from 'node:path';
import { CORRECTION_KINDS, loadSources } from '@robywire/gate';
import type { CorrectionKind, SourcesRegistry } from '@robywire/gate';
import {
  CLIENT_KINDS,
  HttpFetcher,
  LocalEvidenceStore,
  RetractRefused,
  RunRefused,
  SOURCES_KINDS,
  clientFromConfig,
  defaultConfig,
  isPlainSlug,
  loadConfig,
  normaliseReason,
  placeholderHost,
  readDeskState,
  readRunRecord,
  refuseApiOnFixtures,
  retractPiece,
  runPath,
  sitePaths,
  DryTarget,
  SiteTarget,
} from './index';
import type { BuiltClient, ClientChoice, ClientKind, DeskConfig, Environment, Fetcher, ForgeTarget, GitTarget, Lookup, RetryOptions, SourcesKind, StoredRunRecord, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import type { RunResult, Stages } from './run/orchestrate';
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>`, `desk status` and `desk retract <slug>`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story, for a replay that came out equal and for a correction that was made, 1 for a run that failed, was refused or could not start, a
// replay that differs and a correction that was refused or failed, and 2 for a usage error.

export type { ClientKind, SourcesKind };

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined; config: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind | undefined; client: ClientKind | undefined; cassettes: string | undefined; config: string | undefined }
  | { command: 'status'; config: string | undefined }
  | { command: 'retract'; slug: string; reason: string; kind: CorrectionKind; dry: boolean }
  | { command: 'help' };

/** What the arguments mean, or why they do not. */
export type ParseResult = { ok: true; args: Parsed } | { ok: false; message: string };

export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>] [--config <path>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--client fake|recorded|api] [--cassettes <folder>] [--config <path>]',
  '  desk status [--config <path>]',
  '  desk retract <slug> --reason <text> [--kind correction|retraction] [--dry]',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        --client api is refused with --sources fixtures, dry or not: it would spend money on made-up pages (use --client fake or --client recorded).',
  '        A day that already has a run that published, was held or found no story is refused unless --force-new is given; a day whose run failed is run',
  '        again with no flag, up to maxAttemptsPerDay runs a day (3 unless the settings say otherwise), and the earlier run is kept beside the new one.',
  '        A piece that is held is sent to the owner as a draft pull request when the run is not dry (the branch hold/<day>-<slug> is pushed with git and gh, and the',
  '        address of the pull request is recorded in the desk state); if that fails the run ends failed at the stage hold and nothing is left on main but that record.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same. The record of the run says',
  '        which client and which sources it used, so no flag is needed for them; --sources and --client are only checked against the record, and one that',
  '        contradicts it is refused. A run made with --client recorded has no replies of its own: replay it with --cassettes. A record from before records',
  '        said how a run was made needs --sources.',
  'status  print the last run (its outcome, its day and which try of the day it was), the number of holds, and the number of corrections and of retractions.',
  '        The desk state has all but the try, which is read from the record of the run in the folder of the runs, if it is there.',
  'retract record a correction (the default) or a retraction of a piece that is on the site: the note goes into the desk state, updatedAt of the piece is set to today',
  '        (UTC), and the two are committed in one commit. The reason is one line of at most 500 characters. Nothing is deleted: the page stays up with its notice. A piece',
  '        that was held is on its pull request until the owner merges it, and cannot be corrected before. --dry says what would be done and writes nothing.',
  '--config says where the settings of the Desk are: a YAML file laid over the defaults (how recent a story must be, how many candidates reach the model, the folders,',
  '        the user agent and the rest, as desk/src/config.ts lists them). A live run is refused while the user agent links to an .example address.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay' | 'status' | 'retract', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes', '--config'] },
  replay: { flags: [], valued: ['--sources', '--client', '--cassettes', '--config'] },
  status: { flags: [], valued: ['--config'] },
  retract: { flags: ['--dry'], valued: ['--reason', '--kind'] },
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
  if (command !== 'run' && command !== 'replay' && command !== 'status' && command !== 'retract') return fail(`unknown command "${command}"`);

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
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), cassettes, config: value('--config') } };
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
  /** How the api client waits between tries. */
  retry?: RetryOptions;
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

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const settings = settingsOf(deps, args.config);
  if ('code' in settings) return settings.code;
  const { config } = settings;
  const placeholder = args.sources === 'live' ? placeholderHost(config.userAgent) : undefined;
  if (placeholder !== undefined) {
    deps.err(
      `desk: the user agent "${config.userAgent}" links to ${placeholder}, which is a placeholder address: a live run needs a user agent that links to the real /method page of the Desk; set userAgent in a file of settings and pass it with --config <path>`,
    );
    return 2;
  }
  const date = args.date ?? (args.sources === 'fixtures' ? DEMO_DATE : deps.now().toISOString().slice(0, 10));
  let world: ReturnType<typeof sourcesOf>;
  try {
    world = sourcesOf(args.sources, deps, config);
  } catch (error) {
    deps.err(`the sources cannot be read: ${describeError(error)}`);
    return 1;
  }

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
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      ...(deps.forge === undefined ? {} : { forge: deps.forge }),
      ...(deps.stages === undefined ? {} : { stages: deps.stages }),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    for (const line of resultLines(result)) deps.out(line);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
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
    const report = await replayRun(runDir, {
      config,
      sources: sourcesOf(how.sources, deps, config).sources,
      evidence: new LocalEvidenceStore(config.evidenceDir),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
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

/** The day that a run id starts with (`2026-10-05-043100` is `2026-10-05`), or undefined for an id that does not start with a day. */
function dayOfRun(runId: string): string | undefined {
  const day = runId.slice(0, 10);
  return runId.charAt(10) === '-' && isDay(day) ? day : undefined;
}

/**
 * Which try of its day the run `runId` was, as the words that say it: from `run.json` in the folder of its day, which is there only on the machine that made the run (the
 * desk state does not hold it). When the record is not there, is of another run (a later run of the day has taken the folder), is from before records said which try
 * a run was, or cannot be read, the words say that the try is not known, and why, and never guess.
 */
async function describeAttempt(config: DeskConfig, cwd: string, day: string, runId: string): Promise<string> {
  const file = path.join(config.runDir, day, 'run.json');
  const shown = path.relative(cwd, file).split(path.sep).join('/');
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
    case 'retract':
      return retractCommand(parsed.args, deps);
  }
}
