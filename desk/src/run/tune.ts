import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PROFILE_IDS, ROUTES, allSentences, countWords } from '@robywire/gate';
import type { Claim, Draft, ProfileId, SourcesRegistry } from '@robywire/gate';
import { z } from 'zod';
import { ComposeArtifact, DeskConfig, LocalEvidenceStore, candidateId, canonicalUrl, extractPage, hostKey, readArtifact, refuseApiOnFixtures, sourceKind, tier2Feeds, writeJsonFile } from '../index';
import type { BuiltClient, ClientKind, EvidenceStore, Fetcher, ModelClient, ModelRequest, ModelResponse, SelectArtifact, SourceKind, SourcesKind } from '../index';
import { runCompose } from '../stages/compose';
import { describeFailure, emptyPublished, isSourceFailure } from '../stages/context';
import type { StageContext } from '../stages/context';
import { kindOfSnapshot, runExtract } from '../stages/extract';
import type { Snapshot } from '../stages/fetch';
import { runVerify } from '../stages/verify';
import type { VerifyResult } from '../stages/verify';
import { verifyPlanOf } from '../stages/verify-model';

// `desk tune`: the first contact of the pipeline with a real model, and the tool for tuning what it is told. It takes a list of the addresses of real pages, fetches each one
// as the Desk fetches (robots.txt honoured, the pace of the settings), says what kind of source the registry says it is, and sends it through Extract, Compose and Verify with
// the client that was chosen, and reports what happened at every step: how many claims the model proposed and which rules dropped which, what the gate said of the draft, what the
// model check said of its sentences, and what it all cost in tokens (and in dollars when the settings hold the prices). Nothing is published, committed or written to the site: it
// writes only into `<runs folder>/tune/<stamp>/`, whose artifacts are checked against schemas like a run's. The pages are kept in the folder `evidence` below it and never in the
// evidence store of the settings, so that nothing that is tried here reaches the bucket. Two things bound what a tuning run can spend. Each trial is a run, so it is held to the
// budget of the settings (calls, tokens in, tokens out); and the whole invocation is held to `maxCalls` model calls, counted where a call reaches the model (each retry included),
// and stops with a message when they are spent.

/** The calls that an invocation may make unless `--max-calls` says otherwise, the most it may be told to make, and the most trials of one page. */
export const TUNE_DEFAULT_CALLS = 40;
export const TUNE_MAX_CALLS = 200;
export const TUNE_MAX_TRIALS = 10;

/** The folder below the folder of the runs where tuning runs write, which the daily workflow does not upload. */
export const TUNE_FOLDER = 'tune';

/** Why a tuning run was not started. */
export class TuneRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TuneRefused';
  }
}

/** The error of a call that would be the one after the last that the invocation may make. */
class CallLimitReached extends Error {
  constructor(readonly limit: number) {
    super(`the budget of ${limit} model calls for this invocation is spent`);
    this.name = 'CallLimitReached';
  }
}

/** What an invocation has made, and may make, of model calls. One for all the clients of all the trials. */
interface CallCount {
  used: number;
  readonly max: number;
}

/** Counts every call that reaches the model and refuses the one after the last that is allowed. */
class CallLimitClient implements ModelClient {
  constructor(
    private readonly inner: ModelClient,
    private readonly count: CallCount,
  ) {}

  async json<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    if (this.count.used >= this.count.max) throw new CallLimitReached(this.count.max);
    this.count.used += 1;
    return this.inner.json(request);
  }
}

// --- The list of addresses ---------------------------------------------------

/**
 * The addresses in the text of a file: one to a line, in order. A comment starts with `#` at the start of a line or after a space (a `#` inside an address, the start of its
 * fragment, is not a comment), and an empty line is nothing. A line that is not the address of a web page, and a file that lists none, are `problem`s that say which line.
 */
export function parseUrlList(text: string): { urls: string[] } | { problem: string } {
  const urls: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const line = (lines[at] as string).replace(/(^|\s)#.*$/, '').trim();
    if (line === '') continue;
    if (canonicalUrl(line) === null) return { problem: `line ${at + 1} is not the address of a web page (an http or https address): ${JSON.stringify(line.length > 80 ? `${line.slice(0, 80)}...` : line)}` };
    urls.push(line);
  }
  return urls.length === 0 ? { problem: 'it lists no address' } : { urls };
}

// --- What a trial leaves --------------------------------------------------------

const count = z.number().int().nonnegative();
/** How many times each code came up: `{ 'quote-not-found': 2 }`. */
const codes = z.record(z.string(), count);

const KINDS = ['company-newsroom', 'arxiv', 'sec', 'standard', 'tier2', 'unknown'] as const satisfies readonly SourceKind[];

/** How a row ended: it went through the model check, it had too few claims to write from, the page could not be fetched or read, it is not a known kind of source, a step failed, or the budget ran out. */
export const TUNE_STATUSES = ['judged', 'too-few-claims', 'not-fetched', 'unknown-kind', 'failed', 'stopped'] as const;

/** One page, or one trial of a page: what each step found. A step that did not run is `null`. */
export const TuneRow = z.strictObject({
  url: z.string().min(1),
  /** Which trial of the page, from 1; `null` for a page that was never tried (not fetched, not a known kind). */
  trial: z.number().int().positive().nullable(),
  kind: z.enum(KINDS),
  status: z.enum(TUNE_STATUSES),
  /** Why, for every status but `judged`. */
  note: z.string().nullable(),
  /** Extract: what the model proposed, what survived, and which rule dropped how many (a claim with two reasons is counted under both). */
  claims: z.strictObject({ proposed: count, survivors: count, dropped: codes }).nullable(),
  /** Compose: what the gate said of the draft that the composer wrote first. */
  composed: z.strictObject({ route: z.enum(ROUTES), codes, notes: codes.optional(), words: count.optional() }).nullable(),
  /** Verify: what the model check said of the first draft that the gate cleared (a draft that the gate fails is not shown to the model). */
  modelCheck: z.strictObject({ round: count, judged: count, entailed: count, notEntailed: count, ambiguous: count, missing: count, claims: count, labelProblems: count }).nullable(),
  /** Verify: how it ended. */
  verdict: z.strictObject({ outcome: z.enum(['publish', 'hold']), rounds: count, route: z.enum(ROUTES), codes, notes: codes.optional(), words: count.optional() }).nullable(),
  usage: z.strictObject({ calls: count, inputTokens: count, outputTokens: count }),
});
export type TuneRow = z.infer<typeof TuneRow>;

/** What `tune.json` holds, the record of a whole invocation. */
export const TuneRecord = z.strictObject({
  stamp: z.string().min(1),
  date: z.iso.date(),
  client: z.enum(['api', 'fake']),
  profile: z.enum(PROFILE_IDS).optional(),
  trials: z.number().int().positive(),
  maxCalls: z.number().int().positive(),
  models: DeskConfig.shape.models,
  rows: z.array(TuneRow),
  total: z.strictObject({ pages: count, trials: count, calls: count, inputTokens: count, outputTokens: count }),
  /** What the tokens cost at the prices of the settings; `null` when there are none, or when they cannot be applied. */
  dollars: z.number().nonnegative().nullable(),
  /** Why the invocation stopped before it was done, or `null`. */
  stopped: z.string().nullable(),
});
export type TuneRecord = z.infer<typeof TuneRecord>;

/** A count of each code in a list, in the order that each first comes up. */
function countBy(items: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

/** The words of a draft as the gate counts the body: the opening, the takeaways, the sections and the limitations, not the title or the description. */
const bodyWordsOf = (draft: Draft): number =>
  allSentences(draft)
    .filter((item) => item.section !== 'title' && item.section !== 'description')
    .reduce((total, item) => total + countWords(item.sentence.text), 0);

/** The notes and the words of a draft, as the fields of a row: the notes only when there are some. */
const extrasOf = (draft: Draft, warnings: readonly { code: string }[]): { notes?: Record<string, number>; words: number } => ({
  ...(warnings.length === 0 ? {} : { notes: countBy(warnings.map((finding) => finding.code)) }),
  words: bodyWordsOf(draft),
});

// --- Prices ---------------------------------------------------------------------

/** Dollars for a million tokens in and for a million tokens out. */
export interface Price {
  input: number;
  output: number;
}

/**
 * The price that the settings give, when it can be applied: `undefined` when they give none, `{ why }` when they do and it cannot be, because the models of Extract, Compose and
 * Verify are not one model and a price is for one, otherwise `{ price }`. The Desk never makes up a price.
 */
export function priceOf(config: Pick<DeskConfig, 'prices' | 'models'>): { price: Price } | { why: string } | undefined {
  if (config.prices === undefined) return undefined;
  const { extract, compose, verify } = config.models;
  if (new Set([extract, compose, verify]).size !== 1) return { why: 'extract, compose and verify use different models, and the settings hold one price' };
  return { price: { input: config.prices.inputPerMillion, output: config.prices.outputPerMillion } };
}

/** What `usage` cost at `price`, in dollars. */
export const dollarsOf = (usage: { inputTokens: number; outputTokens: number }, price: Price): number => (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;

const formatDollars = (value: number): string => `$${value.toFixed(4)}`;

// --- The table ---------------------------------------------------------------------

const TIERS: Record<SourceKind, string> = { 'company-newsroom': 'tier 1', arxiv: 'tier 1', sec: 'tier 1', standard: 'tier 1', tier2: 'tier 2', unknown: 'no tier' };

/** `quote-not-found 2, value-not-in-quote 1`, or `none`. */
const listOf = (found: Record<string, number>): string => (Object.keys(found).length === 0 ? 'none' : Object.entries(found).map(([code, times]) => `${code} ${times}`).join(', '));

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The lines of the table for one row: what each step found, then the tokens, and the dollars when there is a price. */
export function rowLines(row: TuneRow, position: { page: number; pages: number; trials: number }, price: Price | undefined): string[] {
  const head = row.trial === null ? `page ${position.page} of ${position.pages}: ${row.url}` : `page ${position.page} of ${position.pages}, trial ${row.trial} of ${position.trials}: ${row.url}`;
  const lines = [head, `  kind: ${row.kind} (${TIERS[row.kind]})`];
  const results: Record<TuneRow['status'], string> = {
    judged: 'went through the model check',
    'too-few-claims': 'too few claims to write a piece from',
    'not-fetched': 'not fetched',
    'unknown-kind': 'not a known kind of source, so not read',
    failed: 'failed',
    stopped: 'stopped by the budget of model calls',
  };
  lines.push(`  result: ${results[row.status]}${row.note === null ? '' : `: ${row.note}`}`);
  const extras = (found: { notes?: Record<string, number>; words?: number }): string =>
    `${found.words === undefined ? '' : `; ${plural(found.words, 'word')}`}${found.notes === undefined ? '' : `; notes: ${listOf(found.notes)}`}`;
  if (row.claims !== null) {
    lines.push(`  claims proposed: ${row.claims.proposed}`, `  claims dropped: ${listOf(row.claims.dropped)}`, `  claims surviving: ${row.claims.survivors}`);
  }
  if (row.composed !== null) lines.push(`  composed draft: the gate says ${row.composed.route}${row.composed.route === 'publish' ? '' : ` (${listOf(row.composed.codes)})`}${extras(row.composed)}`);
  if (row.modelCheck !== null) {
    const check = row.modelCheck;
    lines.push(
      `  model check: round ${check.round} judged ${plural(check.judged, 'item')}: entailed ${check.entailed}, not entailed ${check.notEntailed}, ambiguous ${check.ambiguous}, missing ${check.missing}; label problems ${check.labelProblems} (${plural(check.claims, 'claim')})`,
    );
  } else if (row.verdict !== null) {
    lines.push('  model check: not asked (the gate found failures in every round)');
  }
  if (row.verdict !== null) {
    lines.push(`  verify: ${row.verdict.outcome} after ${plural(row.verdict.rounds, 'revision round')}; the gate says ${row.verdict.route}${row.verdict.route === 'publish' ? '' : ` (${listOf(row.verdict.codes)})`}${extras(row.verdict)}`);
  }
  if (row.usage.calls > 0) {
    lines.push(`  tokens: ${row.usage.inputTokens} in, ${row.usage.outputTokens} out, ${plural(row.usage.calls, 'model call')}`);
    if (price !== undefined) lines.push(`  dollars: ${formatDollars(dollarsOf(row.usage, price))}`);
  }
  return lines;
}

/** The lines that end the table: the totals, the dollars or why there are none, and why the invocation stopped when it did. */
export function totalLines(record: TuneRecord, priced: ReturnType<typeof priceOf>): string[] {
  const { total } = record;
  const lines = [`total: ${plural(total.pages, 'page')}, ${plural(total.trials, 'trial')}, ${total.calls} of ${record.maxCalls} model calls, ${total.inputTokens} tokens in, ${total.outputTokens} out`];
  if (priced === undefined) lines.push('dollars: not shown, because the settings have no prices (see prices in desk/src/config.ts)');
  else if ('why' in priced) lines.push(`dollars: not shown, because ${priced.why}`);
  else lines.push(`total dollars: ${formatDollars(dollarsOf(total, priced.price))}`);
  if (record.stopped !== null) lines.push(`stopped: ${record.stopped}`);
  return lines;
}

// --- The run -------------------------------------------------------------------------

export interface TuneOptions {
  /** The addresses to try, in order (see `parseUrlList`). */
  urls: readonly string[];
  /** How many times the model stages are run on each page; the page is fetched once. */
  trials: number;
  /** The most model calls the whole invocation may make. */
  maxCalls: number;
  clientKind: ClientKind;
  /** The kind of piece the drafts are judged against; none means the defaults of the gate. */
  profile?: ProfileId;
  /** Where the pages come from. The command line says `live`; `refuseApiOnFixtures` refuses the api on the made-up world as it does for a run. */
  sourcesKind: SourcesKind;
  config: DeskConfig;
  sources: SourcesRegistry;
  fetcher: Fetcher;
  /** A new client for one trial, with `wrap` put around the model itself: what `clientFromConfig` makes. */
  buildClient: (wrap: (client: ModelClient) => ModelClient) => BuiltClient;
  /** The day, for the stages (the date of the piece that would be written), YYYY-MM-DD. */
  date: string;
  /** The name of the folder of this invocation below `<runs folder>/tune/`. */
  stamp: string;
  /** A line of the table, as soon as a trial has ended. */
  out: (line: string) => void;
}

export interface TuneResult {
  record: TuneRecord;
  /** The folder of the invocation. */
  dir: string;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/** The name of the outlet of a page, for a claim that is attributed to it: the name that the registry gives the feed of the host of the page, else the host. Only a page of another outlet has claims that name one. */
function outletOf(url: string, registry: SourcesRegistry): string {
  const host = hostKey(url);
  return tier2Feeds(registry).find((entry) => hostKey(entry.feed) === host)?.name ?? host ?? url;
}

/** A row with nothing in it yet: judged, no note, no step run, nothing spent. */
const blank = (url: string, kind: SourceKind, trial: number | null): TuneRow => ({
  url,
  trial,
  kind,
  status: 'judged',
  note: null,
  claims: null,
  composed: null,
  modelCheck: null,
  verdict: null,
  usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
});

/** A row for a page that no trial was made of. */
const untried = (url: string, kind: SourceKind, status: 'not-fetched' | 'unknown-kind', note: string): TuneRow => ({ ...blank(url, kind, null), status, note });

/** What the model check said of the first draft that it was shown, from the artifacts that Verify wrote. */
async function modelCheckOf(dir: string, claims: Claim[], verified: VerifyResult): Promise<TuneRow['modelCheck']> {
  const asked = verified.history.find((pass) => pass.verifier !== null);
  if (asked === undefined) return null;
  const drafts = (await readArtifact(dir, '05-compose', ComposeArtifact)).drafts;
  const plan = verifyPlanOf(drafts[asked.round] as Draft, claims);
  const items = asked.verifierFailures.filter((failure) => failure.kind !== 'label');
  const judged = plan.sentences.length + plan.headings.length;
  const some = (code: string): number => items.filter((failure) => failure.code === code).length;
  return {
    round: asked.round,
    judged,
    entailed: judged - items.length,
    notEntailed: some('not_entailed'),
    ambiguous: some('ambiguous'),
    missing: some('missing'),
    claims: plan.claims.length,
    labelProblems: asked.verifierFailures.length - items.length,
  };
}

/** One page that is ready to be tried: its snapshot, what kind of source it is, and the story that Select would have chosen for it. */
interface Page {
  snapshot: Snapshot;
  kind: SourceKind;
  selected: SelectArtifact;
}

/** One trial of a page: Extract, Compose and Verify, each only if the one before gave it something to work with, with a client of its own and the budget of a run. */
async function runTrial(options: TuneOptions, calls: CallCount, evidence: EvidenceStore, page: Page, trial: number, dir: string): Promise<TuneRow> {
  const built = options.buildClient((client) => new CallLimitClient(client, calls));
  const callsBefore = calls.used;
  const ctx: StageContext = {
    date: options.date,
    config: options.config,
    sources: options.sources,
    fetcher: options.fetcher,
    client: built.client,
    evidence,
    runDir: dir,
    published: emptyPublished(),
    log: () => undefined,
    ...(options.profile === undefined ? {} : { profile: options.profile }),
  };
  const row = blank(page.snapshot.url, page.kind, trial);
  try {
    const extracted = await runExtract(ctx, [page.snapshot], page.selected);
    const dropped = countBy(extracted.artifact.dropped.flatMap((claim) => claim.reasons.map((reason) => reason.code)));
    const survivors = extracted.artifact.claims.length;
    row.claims = { proposed: survivors + extracted.artifact.dropped.length, survivors, dropped };
    if (!extracted.ok) {
      row.status = 'too-few-claims';
      row.note = extracted.reason;
    } else {
      const claims = extracted.artifact.claims;
      const composed = await runCompose(ctx, claims);
      row.composed = { route: composed.gate.route, codes: countBy(composed.gate.failures.map((failure) => failure.code)), ...extrasOf(composed.draft, composed.gate.warnings) };
      const verified = await runVerify(ctx, claims, composed);
      row.verdict = { outcome: verified.outcome, rounds: verified.rounds, route: verified.gate.route, codes: countBy(verified.gate.failures.map((failure) => failure.code)), ...extrasOf(verified.draft, verified.gate.warnings) };
      row.modelCheck = await modelCheckOf(dir, claims, verified);
    }
  } catch (error) {
    row.status = error instanceof CallLimitReached ? 'stopped' : 'failed';
    row.note = describeError(error);
  }
  // The calls are those that reached the model, as the invocation counts them: a call that the budget of the invocation refused is not one. The tokens are what the model reported.
  const spent = built.spent();
  row.usage = { calls: calls.used - callsBefore, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens };
  return row;
}

/**
 * Fetch one page and make it ready to try, or say why it cannot be: an address that is on no host of the registry is not fetched at all, a page that cannot be fetched or read, or has no
 * text, is `not-fetched`, and a page that redirected to another kind of site than it was asked for is not a known kind of source. The text is kept in `evidence`.
 */
async function prepare(options: TuneOptions, evidence: EvidenceStore, url: string): Promise<{ page: Page } | { row: TuneRow }> {
  const asked = sourceKind(url, options.sources);
  if (asked === 'unknown') return { row: untried(url, 'unknown', 'unknown-kind', 'the address is on no host that sources.yml lists, so it was not fetched') };
  const tier: 1 | 2 = asked === 'tier2' ? 2 : 1;
  try {
    const fetched = await options.fetcher.get(url);
    const { title, text } = extractPage(fetched.body, fetched.finalUrl);
    if (text === '') return { row: untried(url, asked, 'not-fetched', 'the page has no text to read') };
    const kind = kindOfSnapshot({ tier, url, finalUrl: fetched.finalUrl }, options.sources);
    if (kind === 'unknown') return { row: untried(url, 'unknown', 'unknown-kind', `the page was served from ${fetched.finalUrl}, which is not the kind of source that ${url} is, so it was not read`) };
    const { hash } = await evidence.put(text, { url, finalUrl: fetched.finalUrl, tier, retrievedAt: fetched.retrievedAt });
    const snapshot: Snapshot = { url, finalUrl: fetched.finalUrl, tier, hash, retrievedAt: fetched.retrievedAt, bytes: Buffer.byteLength(text, 'utf8'), title, text };
    const chosen = { id: candidateId(url), title: title === '' ? url : title, url, outlet: outletOf(url, options.sources), tier, beats: [], origin: tier === 1 ? ('newsroom' as const) : ('feed' as const) };
    return { page: { snapshot, kind, selected: { date: options.date, chosen, reasons: [], tier1Url: tier === 1 ? url : null, shortlist: [chosen.id] } } };
  } catch (error) {
    return { row: untried(url, asked, 'not-fetched', isSourceFailure(error) ? describeFailure(error) : describeError(error)) };
  }
}

/**
 * Try every address, in order, and write what happened to `<runs folder>/tune/<stamp>/`: `tune.json` (the record, rewritten after each trial, so that what was done is kept
 * if the program stops), the artifacts of each trial in `<nn>/trial-<k>/`, and the pages in `evidence/`. The table is given to `out` a row at a time. When the budget of calls is spent
 * the invocation stops where it is, and the record says where; the rows so far are kept. Throws `TuneRefused` for the api client on the made-up world, before anything is written.
 */
export async function runTune(options: TuneOptions): Promise<TuneResult> {
  const spending = refuseApiOnFixtures(options.clientKind, options.sourcesKind);
  if (spending !== undefined) throw new TuneRefused(spending);
  if (options.clientKind !== 'api' && options.clientKind !== 'fake') throw new TuneRefused(`tune takes the api client or the scripted one, not ${options.clientKind}`);
  const dir = path.join(options.config.runDir, TUNE_FOLDER, options.stamp);
  await mkdir(path.dirname(dir), { recursive: true });
  await mkdir(dir);
  const evidence = new LocalEvidenceStore(path.join(dir, 'evidence'));
  const calls: CallCount = { used: 0, max: options.maxCalls };
  const priced = priceOf(options.config);
  const price = priced !== undefined && 'price' in priced ? priced.price : undefined;
  const rows: TuneRow[] = [];
  let stopped: string | null = null;

  const record = (): TuneRecord => {
    const tried = rows.filter((row) => row.trial !== null);
    const total = {
      pages: options.urls.length,
      trials: tried.length,
      calls: rows.reduce((sum, row) => sum + row.usage.calls, 0),
      inputTokens: rows.reduce((sum, row) => sum + row.usage.inputTokens, 0),
      outputTokens: rows.reduce((sum, row) => sum + row.usage.outputTokens, 0),
    };
    return {
      stamp: options.stamp,
      date: options.date,
      client: options.clientKind as 'api' | 'fake',
      ...(options.profile === undefined ? {} : { profile: options.profile }),
      trials: options.trials,
      maxCalls: options.maxCalls,
      models: { ...options.config.models },
      rows,
      total,
      dollars: price === undefined ? null : dollarsOf(total, price),
      stopped,
    };
  };
  const keep = async (row: TuneRow, page: number): Promise<void> => {
    rows.push(row);
    for (const line of rowLines(row, { page, pages: options.urls.length, trials: options.trials }, price)) options.out(line);
    await writeJsonFile(path.join(dir, 'tune.json'), 'the record tune.json', record(), TuneRecord);
  };

  const spent = (where: string, how: string): string => `the budget of ${options.maxCalls} model calls (--max-calls) ${how}, so the run stopped ${where}, and what comes after it was not tried`;
  pages: for (const [at, url] of options.urls.entries()) {
    if (calls.used >= options.maxCalls) {
      stopped = spent(`before page ${at + 1} (${url})`, 'is spent');
      break;
    }
    const prepared = await prepare(options, evidence, url);
    if ('row' in prepared) {
      await keep(prepared.row, at + 1);
      continue;
    }
    for (let trial = 1; trial <= options.trials; trial++) {
      const where = `trial ${trial} of page ${at + 1} (${url})`;
      if (calls.used >= options.maxCalls) {
        stopped = spent(`before ${where}`, 'is spent');
        break pages;
      }
      const row = await runTrial(options, calls, evidence, prepared.page, trial, path.join(dir, String(at + 1).padStart(2, '0'), `trial-${trial}`));
      await keep(row, at + 1);
      if (row.status === 'stopped') {
        stopped = spent(`during ${where}`, 'ran out');
        break pages;
      }
    }
  }

  const final = record();
  await writeJsonFile(path.join(dir, 'tune.json'), 'the record tune.json', final, TuneRecord);
  for (const line of totalLines(final, priced)) options.out(line);
  return { record: final, dir };
}
