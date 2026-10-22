import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASES, Claim, STATUSES } from '@robywire/gate';
import { z } from 'zod';
import { clientFromConfig, defaultConfig, describeIssues, sha256Hex } from '../src/index';
import type { Environment, ModelClient, ModelUsage, RetryOptions } from '../src/index';
import { judgePlan } from '../src/stages/verify-model';
import type { HeadingItem, SentenceItem, VerifyPlan } from '../src/stages/verify-model';
import { perfectVerifier } from './scripted';

// The evals of the verifier. G10 is a model that judges whether the passages of a source entail a sentence, and a model that is lazy, or too strict,
// would either let a wrong sentence through or hold every piece. So the verifier is measured: a labelled set of ninety sentences (some are headings, some analysis)
// with the passages they cite, thirty that the passages support, thirty that say something they do not say, and thirty that change what they say in a small way. This harness runs any
// `ModelClient` over the set through the real prompt of the verifier and the real reading of its reply (the same `judgePlan` the Verify stage uses), and
// reports precision and recall. Plan 2 builds and tests the harness, with scripted clients; it does not say how well any model does, and it freezes no floor.

export const LABELS = ['supported', 'unsupported', 'distorted'] as const;
export type Label = (typeof LABELS)[number];

const text = z.string().min(1);

/** One passage of a source, as a claim would quote it: the words, and the basis and the status that go with it (an outlet when the basis is `reported`). */
export const Passage = z
  .strictObject({ quote: text.max(300), basis: z.enum(BASES), status: z.enum(STATUSES), outlet: text.optional() })
  .refine((passage) => (passage.basis === 'reported') === (passage.outlet !== undefined), { message: 'a passage has an outlet when its basis is reported, and not otherwise', path: ['outlet'] });
export type Passage = z.infer<typeof Passage>;

/** A sentence, the passages it is judged against, and whether it is supported; a sentence that is not has a `flaw`, which says what is wrong, for the reader of the set and never for the verifier. */
export const EvalItem = z
  .strictObject({
    id: z.string().regex(/^e-\d{2}$/, 'an id looks like e-07'),
    label: z.enum(LABELS),
    sentence: text.max(300),
    /** What the text is: a statement of fact (the default), an analysis sentence, or the heading of a section. The verifier judges each by its own rule. */
    kind: z.enum(['fact', 'analysis', 'heading']).optional(),
    passages: z.array(Passage).min(1).max(3),
    flaw: text.optional(),
  })
  .refine((item) => (item.label === 'supported') === (item.flaw === undefined), { message: 'a flaw is given for a sentence that is not supported, and for no other', path: ['flaw'] });
export type EvalItem = z.infer<typeof EvalItem>;

export const EvalSet = z.strictObject({
  about: text,
  items: z.array(EvalItem).superRefine((items, context) => {
    const seen = (key: (item: EvalItem) => string, what: string): void => {
      const found = new Set<string>();
      items.forEach((item, at) => {
        if (found.has(key(item))) context.addIssue({ code: 'custom', path: [at], message: `two items have the same ${what}: ${JSON.stringify(key(item))}` });
        found.add(key(item));
      });
    };
    seen((item) => item.id, 'id');
    seen((item) => item.sentence, 'sentence');
  }),
});
export type EvalSet = z.infer<typeof EvalSet>;

/** Where the committed set is. */
export const VERIFIER_SET_FILE = fileURLToPath(new URL('./verifier-set.json', import.meta.url));

/** Read the set in `file` and check it. A file that cannot be read, is not JSON or is not a valid set is an error that names the file. */
export function loadVerifierSet(file: string = VERIFIER_SET_FILE): EvalSet {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`the verifier set ${file} cannot be read: ${(error as Error).message}`);
  }
  const parsed = EvalSet.safeParse(data);
  if (!parsed.success) throw new Error(`the verifier set ${file} is not valid: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

/** The claim that a passage stands for: one that the prompt of the verifier shows as a passage, with its basis, its status and where it is from. */
function claimOf(id: string, passage: Passage): Claim {
  return Claim.parse({
    id,
    text: passage.quote,
    label: 'passage',
    type: 'event',
    source: {
      url: `https://evals.example/passages/${id}`,
      tier: passage.outlet === undefined ? 1 : 2,
      snapshotHash: sha256Hex(passage.quote),
      retrievedAt: '2026-10-05T00:00:00.000Z',
      ...(passage.outlet === undefined ? {} : { outlet: passage.outlet }),
    },
    span: { start: 0, end: passage.quote.length, quote: passage.quote },
    basis: passage.basis,
    status: passage.status,
    values: [],
  });
}

/**
 * What the verifier is asked about a batch of items: a sentence for each item (`s0`, `s1` and so on; a heading is `h0`, `h1`, numbered by the place of the item in the batch)
 * citing the claims of its passages, and a claim for each passage, numbered from `c-1` over the whole batch. The label and the flaw of an item are not in it: the verifier never sees the answer.
 */
export function planOf(items: readonly EvalItem[]): VerifyPlan {
  const claims: Claim[] = [];
  const sentences: SentenceItem[] = [];
  const headings: HeadingItem[] = [];
  items.forEach((item, at) => {
    const claimIds = item.passages.map((passage) => {
      const claim = claimOf(`c-${claims.length + 1}`, passage);
      claims.push(claim);
      return claim.id;
    });
    if (item.kind === 'heading') {
      headings.push({ id: `h${at}`, text: item.sentence, where: `heading ${at + 1} of the batch`, claimIds });
    } else {
      sentences.push({ id: `s${at}`, kind: item.kind === 'analysis' ? 'analysis' : 'fact', section: 'body', where: `sentence ${at + 1} of the batch`, text: item.sentence, claimIds });
    }
  });
  return { sentences, headings, claims };
}

/** How many sentences go to the verifier in one call, about as many as the sentences of a piece. */
export const DEFAULT_BATCH_SIZE = 10;

/** What became of one item: whether the verifier cleared it (the real reading of its reply found no failure of the sentence and none of the labels of its passages). */
export interface ItemResult {
  id: string;
  label: Label;
  cleared: boolean;
}

export interface Rate {
  /** Null when there is nothing to divide by: a verifier that cleared nothing has no precision for what it cleared. */
  precision: number | null;
  recall: number | null;
}

export interface EvalReport {
  items: number;
  /** How many calls were made. */
  calls: number;
  usage: ModelUsage;
  /** For each label, how many items had it and how many the verifier got right: a supported sentence cleared, a sentence that is not supported not cleared. */
  perLabel: Record<Label, { items: number; correct: number; recall: number | null }>;
  /** The sentences the verifier cleared: how many of them are supported (precision) and how many of the supported ones it cleared (recall). */
  cleared: Rate;
  /** The sentences the verifier did not clear: how many of them are not supported (precision) and how many of the unsupported and distorted ones it caught (recall). */
  flagged: Rate;
  /** The share of all items that it got right. */
  accuracy: number | null;
  results: ItemResult[];
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

/** The scores of a list of results. Pure. */
export function scoreOf(results: readonly ItemResult[], calls: number, usage: ModelUsage): EvalReport {
  const count = (test: (result: ItemResult) => boolean): number => results.filter(test).length;
  const perLabel = Object.fromEntries(
    LABELS.map((label) => {
      const items = count((result) => result.label === label);
      const correct = count((result) => result.label === label && result.cleared === (label === 'supported'));
      return [label, { items, correct, recall: ratio(correct, items) }];
    }),
  ) as EvalReport['perLabel'];
  const clearedSupported = count((result) => result.cleared && result.label === 'supported');
  const clearedAll = count((result) => result.cleared);
  const supported = count((result) => result.label === 'supported');
  const flaggedBad = count((result) => !result.cleared && result.label !== 'supported');
  const flaggedAll = count((result) => !result.cleared);
  const bad = count((result) => result.label !== 'supported');
  return {
    items: results.length,
    calls,
    usage,
    perLabel,
    cleared: { precision: ratio(clearedSupported, clearedAll), recall: ratio(clearedSupported, supported) },
    flagged: { precision: ratio(flaggedBad, flaggedAll), recall: ratio(flaggedBad, bad) },
    accuracy: ratio(clearedSupported + flaggedBad, results.length),
    results: [...results],
  };
}

export interface EvalOptions {
  /** The model that the client is asked for: it is in the request, and a recorded or a real client may care. */
  model: string;
  batchSize?: number;
}

/**
 * Run `client` over the set and score it. The items go to the verifier in batches of `batchSize` (10 by default), in the order of the set, each batch in one
 * call made by `judgePlan`, the very function the Verify stage uses, so the prompt and the reading of the reply are the pipeline's. An item is cleared when the
 * reading of the reply finds no failure of its sentence and none of the labels of the passages it cites. A reply that judges what it was not asked is a
 * `schema` error, and it ends the evaluation.
 */
export async function evaluateVerifier(client: ModelClient, set: EvalSet, options: EvalOptions): Promise<EvalReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error(`the batch size must be a whole number of at least 1, not ${batchSize}`);
  const results: ItemResult[] = [];
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let calls = 0;
  for (let from = 0; from < set.items.length; from += batchSize) {
    const batch = set.items.slice(from, from + batchSize);
    const plan = planOf(batch);
    const judged = await judgePlan(client, options.model, plan);
    calls += 1;
    usage.inputTokens += judged.usage.inputTokens;
    usage.outputTokens += judged.usage.outputTokens;
    const planned = [...plan.sentences, ...plan.headings];
    batch.forEach((item, at) => {
      const entry = planned.find((candidate) => candidate.id === `${item.kind === 'heading' ? 'h' : 's'}${at}`) as SentenceItem | HeadingItem;
      const failed = judged.outcome.failures.some((failure) => failure.id === entry.id || (failure.kind === 'label' && entry.claimIds.includes(failure.id)));
      results.push({ id: item.id, label: item.label, cleared: !failed });
    });
  }
  return scoreOf(results, calls, usage);
}

/** The lowest scores that are accepted. A floor of 0, or none, accepts everything: no floor is frozen in Plan 2. */
export interface Floors {
  precision?: number;
  recall?: number;
}

const show = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(2));

/**
 * What is below a floor, as sentences; none when nothing is. The recall floor applies to the recall of each label, so that a verifier cannot make up for
 * missing distortions by clearing every supported sentence, and the precision floor to the precision of what it cleared and of what it flagged. A score that does not exist
 * (a verifier that cleared nothing has no precision for what it cleared) is below any floor above 0.
 */
export function floorFailures(report: EvalReport, floors: Floors): string[] {
  const failures: string[] = [];
  const check = (what: string, value: number | null, floor: number | undefined): void => {
    if (floor === undefined || floor <= 0) return;
    if (value === null || value < floor) failures.push(`${what} is ${show(value)}, below the floor of ${floor.toFixed(2)}`);
  };
  for (const label of LABELS) check(`the recall for ${label} sentences`, report.perLabel[label].recall, floors.recall);
  check('the precision of the sentences it cleared', report.cleared.precision, floors.precision);
  check('the precision of the sentences it flagged', report.flagged.precision, floors.precision);
  return failures;
}

/** The report as lines to print. */
export function formatReport(report: EvalReport, model: string): string[] {
  const row = (label: string, items: number, correct: number, recall: number | null): string => `${label.padEnd(12)} ${String(items).padStart(5)} ${String(correct).padStart(7)} ${show(recall).padStart(7)}`;
  return [
    `verifier evaluation: ${report.items} sentences in ${report.calls} calls, model ${model}`,
    `${'label'.padEnd(12)} ${'items'.padStart(5)} ${'correct'.padStart(7)} ${'recall'.padStart(7)}`,
    ...LABELS.map((label) => row(label, report.perLabel[label].items, report.perLabel[label].correct, report.perLabel[label].recall)),
    `cleared (supported):          precision ${show(report.cleared.precision)}, recall ${show(report.cleared.recall)}`,
    `flagged (not supported):      precision ${show(report.flagged.precision)}, recall ${show(report.flagged.recall)}`,
    `accuracy ${show(report.accuracy)}`,
    `tokens: ${report.usage.inputTokens} in, ${report.usage.outputTokens} out`,
  ];
}

/** What `main` needs from outside. */
export interface EvalDeps {
  out(line: string): void;
  err(line: string): void;
  env: Environment;
  /** The client to measure, instead of the one that the arguments choose. A test hands in a scripted one. */
  client?: ModelClient;
  /** The labelled set to use, instead of the committed one. A test hands in a file that is wrong. */
  setFile?: string;
  /** What the client has spent so far, to say after a failure what the calls before it cost. The api client's own is used; a test hands in one for a client it supplies. */
  spent?: () => { calls: number; inputTokens: number; outputTokens: number };
  /** How the api client waits between tries of a call that failed. A test hands in a wait that does not wait. */
  retry?: RetryOptions;
}

const USAGE = 'Usage: evals:verifier [--client fake|api] [--model <name>] [--batch <number>] [--min-precision <0 to 1>] [--min-recall <0 to 1>]';

/** A number from 0 to 1, or undefined for anything else. */
function fraction(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 1 ? number : undefined;
}

/**
 * Run the evals from the command line and return the exit code: 0 when every floor is met (and there is none by default), 1 when a score is below a floor or the
 * evaluation fails, 2 for a mistake in the arguments (a `--batch` so small that the set needs more calls than a run may make is one). `--client fake` (the default) is a scripted verifier that knows the answers: it proves the wiring and measures
 * no model. `--client api` asks the model that `--model` names (by default the verify model of the configuration), inside the budget of a run, and needs
 * `ANTHROPIC_API_KEY` in the environment.
 */
export async function main(argv: readonly string[], deps: EvalDeps): Promise<number> {
  const usage = (message: string): number => {
    deps.err(`evals:verifier: ${message}`);
    deps.err(USAGE);
    return 2;
  };
  const values = new Map<string, string>();
  for (let at = 0; at < argv.length; at += 2) {
    const name = argv[at] as string;
    if (!['--client', '--model', '--batch', '--min-precision', '--min-recall'].includes(name)) return usage(`unknown option ${name}`);
    if (values.has(name)) return usage(`${name} is given twice`);
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('--')) return usage(`${name} needs a value`);
    values.set(name, value);
  }
  const clientKind = values.get('--client') ?? 'fake';
  if (clientKind !== 'fake' && clientKind !== 'api') return usage(`--client is fake or api, not "${clientKind}"`);
  const batch = values.has('--batch') ? Number(values.get('--batch')) : undefined;
  if (batch !== undefined && (!Number.isInteger(batch) || batch < 1)) return usage(`--batch is a whole number of at least 1, not "${values.get('--batch')}"`);
  const floors: Floors = {};
  for (const [name, key] of [['--min-precision', 'precision'], ['--min-recall', 'recall']] as const) {
    const given = values.get(name);
    if (given === undefined) continue;
    const parsed = fraction(given);
    if (parsed === undefined) return usage(`${name} is a number from 0 to 1, not "${given}"`);
    floors[key] = parsed;
  }

  const config = defaultConfig();
  const model = values.get('--model') ?? config.models.verify;
  let set: EvalSet;
  try {
    set = loadVerifierSet(deps.setFile);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  // The client of a run stops at `budget.maxCalls` calls, after paying for them, and nothing of the report is kept. So a batch so small that the set needs more calls than that is refused
  // here, before a client is built or a call is made. (`evaluateVerifier` has no such limit: a scripted client costs nothing.)
  const batchSize = batch ?? DEFAULT_BATCH_SIZE;
  const needed = Math.ceil(set.items.length / batchSize);
  if (needed > config.budget.maxCalls) {
    const what = batch === undefined ? `a batch of ${batchSize}` : `--batch ${batchSize}`;
    return usage(`${what} needs ${needed} calls for the ${set.items.length} sentences, and a run may make ${config.budget.maxCalls}: use --batch ${Math.ceil(set.items.length / config.budget.maxCalls)} or more`);
  }
  let client: ModelClient;
  let spent = deps.spent;
  if (deps.client !== undefined) {
    client = deps.client;
  } else if (clientKind === 'fake') {
    client = perfectVerifier(set);
  } else {
    try {
      const built = clientFromConfig(config, { kind: 'api' }, deps.env, deps.retry ?? {});
      built.onRetry?.((line) => deps.out(line));
      client = built.client;
      spent = built.spent;
    } catch (error) {
      deps.err(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  try {
    const report = await evaluateVerifier(client, set, { model, ...(batch === undefined ? {} : { batchSize: batch }) });
    for (const line of formatReport(report, model)) deps.out(line);
    const failures = floorFailures(report, floors);
    for (const failure of failures) deps.out(`below the floor: ${failure}`);
    return failures.length === 0 ? 0 : 1;
  } catch (error) {
    deps.err(`the evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    const spentSoFar = spent?.();
    if (spentSoFar !== undefined) deps.err(`spent before the failure: ${spentSoFar.calls} model calls, ${spentSoFar.inputTokens} input tokens, ${spentSoFar.outputTokens} output tokens`);
    return 1;
  }
}

// Run as a program, `tsx desk/evals/run-verifier.ts`: but not when this file is imported, as the tests do.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), { out: (line) => console.log(line), err: (line) => console.error(line), env: process.env });
}
