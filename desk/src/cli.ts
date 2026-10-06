import path from 'node:path';
import { loadSources } from '@robywire/gate';
import type { SourcesRegistry } from '@robywire/gate';
import { HttpFetcher, LocalEvidenceStore, RunRefused, clientFromConfig, defaultConfig, readDeskState, runPath, sitePaths, DryTarget, SiteTarget } from './index';
import type { BuiltClient, ClientChoice, DeskConfig, Environment, Fetcher, GitTarget, RetryOptions, Transport } from './index';
import { demoClient } from './demo/story';
import { DEMO_DATE, demoFetcher, demoRegistry } from './demo/world';
import { runDesk } from './run/orchestrate';
import { replayRun } from './run/replay';

// The command line of the Desk: `desk run`, `desk replay <folder of a run>` and `desk status`. The arguments are read by hand, with no library, and a
// mistake in them is a usage error (exit code 2) that says what is wrong and writes nothing. Everything `main` needs from the outside, the clock, the
// environment, git, where to print, is in `deps`, so that a test calls `main` with fakes and nothing real is touched. The exit codes are 0 for a run that
// published, held or found no story and for a replay that came out equal, 1 for a run that failed, was refused or could not start, and a replay that
// differs, and 2 for a usage error.

export type ClientKind = 'fake' | 'recorded' | 'api';
export type SourcesKind = 'fixtures' | 'live';

export type Parsed =
  | { command: 'run'; date: string | undefined; dry: boolean; client: ClientKind; sources: SourcesKind; forceNew: boolean; cassettes: string | undefined }
  | { command: 'replay'; runDir: string; sources: SourcesKind; cassettes: string | undefined }
  | { command: 'status' }
  | { command: 'help' };

/** What the arguments mean, or why they do not. */
export type ParseResult = { ok: true; args: Parsed } | { ok: false; message: string };

export const USAGE = [
  'Usage:',
  '  desk run [--date YYYY-MM-DD] [--dry] [--client fake|recorded|api] [--sources fixtures|live] [--force-new] [--cassettes <folder>]',
  '  desk replay <folder of a run> [--sources fixtures|live] [--cassettes <folder>]',
  '  desk status',
  '',
  'run     write today\'s piece, or hold it, or find no story. --dry writes the artifacts and never touches the site or git.',
  '        --client says who answers the model calls (api is the default and needs ANTHROPIC_API_KEY; recorded needs --cassettes; fake is a scripted',
  '        story for dry runs). --sources says where stories come from (live is the default; fixtures is the made-up world, for dry runs).',
  '        A day that already has a run is refused unless --force-new is given.',
  'replay  run Extract, Compose and Verify again from what a run kept, with no network, and say whether the artifacts are the same.',
  'status  print the last run and the number of holds, from the desk state.',
].join('\n');

const OPTIONS: Readonly<Record<'run' | 'replay', { flags: readonly string[]; valued: readonly string[] }>> = {
  run: { flags: ['--dry', '--force-new'], valued: ['--date', '--client', '--sources', '--cassettes'] },
  replay: { flags: [], valued: ['--sources', '--cassettes'] },
};

const CLIENTS: readonly string[] = ['fake', 'recorded', 'api'];
const SOURCES: readonly string[] = ['fixtures', 'live'];

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
 * and a missing one are refused, each with a message that names it. Two combinations are refused because they would put made-up content, or an unrecorded
 * model, where it does not belong: `--client fake` and `--sources fixtures` only with `--dry`, and `--client recorded` only with `--cassettes` (which is
 * for `recorded` alone when running).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const fail = (message: string): ParseResult => ({ ok: false, message });
  const [command, ...rest] = argv;
  if (command === undefined) return fail('no command given');
  if (command === 'help' || command === '--help' || command === '-h') return { ok: true, args: { command: 'help' } };
  if (command !== 'run' && command !== 'replay' && command !== 'status') return fail(`unknown command "${command}"`);

  const given = new Map<string, string | true>();
  const positional: string[] = [];
  if (command === 'status') {
    if (rest.length > 0) return fail(`status takes no arguments, but was given "${rest[0]}"`);
    return { ok: true, args: { command: 'status' } };
  }
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
  const sources = value('--sources') ?? 'live';
  if (!SOURCES.includes(sources)) return fail(`--sources is fixtures or live, not "${sources}"`);

  if (command === 'replay') {
    if (positional.length === 0) return fail('replay needs the folder of a run');
    if (positional.length > 1) return fail(`replay takes one folder, but was given "${positional.join('" and "')}"`);
    return { ok: true, args: { command: 'replay', runDir: positional[0] as string, sources: sources as SourcesKind, cassettes: value('--cassettes') } };
  }

  if (positional.length > 0) return fail(`run takes no arguments, but was given "${positional[0]}"`);
  const client = value('--client') ?? 'api';
  if (!CLIENTS.includes(client)) return fail(`--client is fake, recorded or api, not "${client}"`);
  const date = value('--date');
  if (date !== undefined && !isDay(date)) return fail(`--date is a day written YYYY-MM-DD, not "${date}"`);
  const dry = given.has('--dry');
  if (client === 'fake' && !dry) return fail('--client fake is a scripted story for dry runs: add --dry');
  if (sources === 'fixtures' && !dry) return fail('--sources fixtures is a made-up world for dry runs: add --dry, because nothing in it may be published');
  const cassettes = value('--cassettes');
  if (client === 'recorded' && cassettes === undefined) return fail('--client recorded needs --cassettes, the folder of the recorded replies');
  if (client !== 'recorded' && cassettes !== undefined) return fail('--cassettes is for --client recorded: the other clients record their replies in the folder of the run');
  return { ok: true, args: { command: 'run', date, dry, client: client as ClientKind, sources: sources as SourcesKind, forceNew: given.has('--force-new'), cassettes } };
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
  /** The settings of the run. By default `defaultConfig()` with the folders of the runs and of the evidence below `cwd`. */
  config?: DeskConfig;
  /** How live sources are fetched; the default is the global `fetch`. */
  transport?: Transport;
  /** How the api client waits between tries. */
  retry?: RetryOptions;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/** The settings of a run: those given, or the defaults with their folders below `cwd`. */
function configOf(deps: CliDeps): DeskConfig {
  if (deps.config !== undefined) return deps.config;
  return { ...defaultConfig(), runDir: path.join(deps.cwd, 'runs'), evidenceDir: path.join(deps.cwd, 'evidence') };
}

/** The registry and the fetcher of the sources that were asked for. */
function sourcesOf(kind: SourcesKind, deps: CliDeps, config: DeskConfig): { sources: SourcesRegistry; fetcher: Fetcher } {
  if (kind === 'fixtures') return { sources: demoRegistry(), fetcher: demoFetcher(deps.now) };
  const fetcher = new HttpFetcher({ userAgent: config.userAgent, maxBytes: config.maxBytes, requestIntervalMs: config.requestIntervalMs, ...(deps.transport === undefined ? {} : { transport: deps.transport }) });
  return { sources: loadSources(path.join(deps.cwd, 'sources.yml')), fetcher };
}

async function runCommand(args: Extract<Parsed, { command: 'run' }>, deps: CliDeps): Promise<number> {
  const config = configOf(deps);
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
      evidence: new LocalEvidenceStore(config.evidenceDir),
      target: args.dry ? new DryTarget(deps.cwd) : new SiteTarget(deps.cwd, deps.git),
      ledgerDir: path.join(deps.cwd, sitePaths().ledgerDir),
      now: deps.now,
      forceNew: args.forceNew,
      log: (line) => deps.out(line),
    });
    deps.out(`outcome: ${result.outcome}`);
    deps.out(`run: ${result.runId}`);
    deps.out(`folder: ${result.dir}`);
    if (result.slug !== null) deps.out(`piece: ${result.slug}`);
    if (result.reason !== null) deps.out(`reason: ${result.reason}`);
    if (result.outcome === 'no-story' || result.outcome === 'failed') deps.out(`stage: ${result.stage}`);
    if (result.dry) deps.out(`dry run: nothing was written to the site or to git (${result.files.length} files would have been)`);
    else if (result.commit !== null) deps.out(`commit: ${result.commit}`);
    return result.outcome === 'failed' ? 1 : 0;
  } catch (error) {
    deps.err(error instanceof RunRefused ? `the run was refused: ${error.message}` : `the run could not start: ${describeError(error)}`);
    return 1;
  }
}

async function replayCommand(args: Extract<Parsed, { command: 'replay' }>, deps: CliDeps): Promise<number> {
  const config = configOf(deps);
  try {
    const report = await replayRun(path.resolve(deps.cwd, args.runDir), {
      config,
      sources: sourcesOf(args.sources, deps, config).sources,
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

async function statusCommand(deps: CliDeps): Promise<number> {
  try {
    const state = await readDeskState(path.join(deps.cwd, sitePaths().stateFile));
    const { lastRun } = state;
    deps.out(lastRun === null ? 'last run: none yet' : `last run: ${lastRun.outcome} at ${lastRun.at} (run ${lastRun.runId}${lastRun.slug === null ? '' : `, piece ${lastRun.slug}`})`);
    deps.out(`holds: ${state.holds.length}`);
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
      return statusCommand(deps);
  }
}
