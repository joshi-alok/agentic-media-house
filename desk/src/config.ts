import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { describeIssues } from './issues';

// The settings of a run of the Desk. They live here and nowhere else, and they
// are checked when they are read: a mistake in a config file stops the run before
// it starts. The model names are written only in `defaultConfig`.

const count = z.number().int().positive();
const text = z.string().min(1);

/** What one run may spend. A run that goes over any of these stops and fails. */
const Budget = z.strictObject({
  /** Model calls in one run, all four roles together. */
  maxCalls: count,
  /** Input tokens in one run, summed over its calls. */
  maxInputTokens: count,
  /** Output tokens in one run, summed over its calls. */
  maxOutputTokens: count,
});

/** The model that plays each role. The verify model is a setting because the evals may show that it has to change. */
const Models = z.strictObject({ select: text, extract: text, compose: text, verify: text });

/**
 * The models that take `output_config.effort`: the Fable, Mythos, Opus (from 4.5), Sonnet (from 4.6) and Haiku (from 5) families. A Haiku 4.5, a Sonnet 4.5 and older models answer 400 to
 * it, and so would a model this list does not know, so the client sends an effort only to a model on the list: a 400 ends a run after the stages before it were paid for.
 */
const TAKES_EFFORT = /^claude-(?:fable-|mythos-|opus-(?:4-[5-9]|5)|sonnet-(?:4-[6-9]|5)|haiku-5)/;

/** Whether the API takes an `effort` for this model. */
export function takesEffort(model: string): boolean {
  return TAKES_EFFORT.test(model);
}

/** Where the snapshots of sources are kept: `local` is a folder on this machine (`evidenceDir`), `r2` is a private bucket on Cloudflare R2. */
export const EVIDENCE_KINDS = ['local', 'r2'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * The evidence store. It has one setting, which of the two it is. The address, the name and the keys of a bucket are not settings: a file of settings is committed, so they are read
 * from the environment (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), and a file that tries to carry one of them is refused as a setting that does not exist.
 */
const Evidence = z.strictObject({ kind: z.enum(EVIDENCE_KINDS) });

/**
 * What a million tokens of the model cost, in dollars, for the tokens that go in and for the tokens that come out. The Desk does not know the prices of a provider and never guesses them: the
 * owner reads them from the price list and writes them here, and only `desk tune` uses them, to turn the tokens that a trial reported into dollars. Without the block `desk tune` shows tokens only.
 */
const Prices = z.strictObject({ inputPerMillion: z.number().positive(), outputPerMillion: z.number().positive() });

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
  recencyHours: count,
  /** Select: the most candidates that are sent to the model. */
  shortlistMax: count,
  /** Select: the most stories that one source can have on the shortlist, so that a source that publishes a great deal cannot fill it. */
  shortlistPerSource: count,
  /** Extract: fewer surviving claims than this ends the run with no story. */
  minClaims: count,
  /** Verify: how many times a draft goes back to the composer before it is held (`modelCheckRevisions` adds rounds for a rejection by the model check). */
  maxRevisionRounds: z.number().int().nonnegative(),
  /**
   * Verify: after the `maxRevisionRounds` rounds, a draft that has no blocker of the gate and that the model check rejects goes back up to this many more times; a draft
   * with a blocker of the gate, including one that a revision of these rounds brings, is held. The model check is the only layer that reads meaning, and a rejection found
   * when the rounds are spent has had no answer.
   */
  modelCheckRevisions: z.number().int().nonnegative(),
  /** Run: how many runs one day may have, the first and every one after it (a day that failed is run again, and `--force-new` runs a day again). The run after the last is refused. */
  maxAttemptsPerDay: count,
  /** Fetch: what the Desk calls itself to every site. It must link to the /method page, which says who the Desk is. */
  userAgent: text.refine((value) => /https?:\/\/\S+\/method\b/.test(value), {
    message: 'must include the address of the /method page, such as https://agenticmediahouse.example/method',
  }),
  /** Fetch: the least pause between two requests to one host. */
  requestIntervalMs: z.number().int().nonnegative(),
  /** Fetch: the most bytes read from one page. */
  maxBytes: count,
  /** Fetch: the most characters of one page that go on to be read. A longer text is cut at a paragraph or a line, or else a space, and the artifact says so. */
  maxPageChars: count,
  budget: Budget,
  models: Models,
  /** Where each run writes its artifacts. Kept out of git. */
  runDir: text,
  /** Where the snapshots of sources are kept, when the store is `local`. Kept out of git. */
  evidenceDir: text,
  evidence: Evidence,
  /** Tune: the price of a million tokens, for `desk tune` to show dollars. Not set unless the owner sets it. */
  prices: Prices.optional(),
});
export type DeskConfig = z.infer<typeof DeskConfig>;

/** What a config file may hold: any setting, and any part of the budget or the models, and nothing else. */
const Overrides = DeskConfig.partial().extend({ budget: Budget.partial().optional(), models: Models.partial().optional() });

/** A fresh copy of the default settings. A new object each time, so no caller can change another's defaults. */
export function defaultConfig(): DeskConfig {
  return {
    recencyHours: 72,
    shortlistMax: 15,
    shortlistPerSource: 3,
    minClaims: 3,
    maxRevisionRounds: 2,
    modelCheckRevisions: 1,
    maxAttemptsPerDay: 3,
    userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
    requestIntervalMs: 1000,
    maxBytes: 2_000_000,
    maxPageChars: 150_000,
    budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
    models: {
      select: 'claude-haiku-4-5-20251001',
      extract: 'claude-sonnet-5-5',
      compose: 'claude-sonnet-5-5',
      verify: 'claude-sonnet-5-5',
    },
    runDir: 'runs',
    evidenceDir: 'evidence',
    evidence: { kind: 'local' },
  };
}

/**
 * The host of the address that a user agent links to, when that host is a placeholder: `example`, or a name under `.example`, which no one owns
 * and the default user agent uses (agenticmediahouse.example). `undefined` when the first address of the text is anything else, or when there is none. The
 * first address is the one that has to be the /method page (the schema of the setting requires it). A live run needs a real one: a site that
 * is asked by a user agent that points nowhere cannot find out who is asking.
 */
export function placeholderHost(userAgent: string): string | undefined {
  const address = /https?:\/\/[^\s)]+/i.exec(userAgent)?.[0];
  if (address === undefined) return undefined;
  let host: string;
  try {
    // The hostname of a URL is already in lowercase.
    host = new URL(address).hostname.replace(/\.$/, '');
  } catch {
    return undefined;
  }
  return host === 'example' || host.endsWith('.example') ? host : undefined;
}

/**
 * The settings of a run. With no path, the defaults. With the path of a YAML
 * file, the defaults with the file's settings laid over them; the budget and the
 * models are merged one setting at a time. A file that cannot be read, is not
 * YAML, holds a setting that does not exist or a value that is not allowed, is
 * refused with an error that names the file and the setting.
 */
export function loadConfig(path?: string): DeskConfig {
  const defaults = defaultConfig();
  if (path === undefined) return defaults;
  const where = `desk config ${path}`;

  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`${where}: cannot read the file (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`);
  }
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    throw new Error(`${where}: not valid YAML (${(error as Error).message.split('\n')[0]})`);
  }

  // An empty file, or one of comments only, parses to null: nothing to override.
  const parsed = Overrides.safeParse(data ?? {});
  if (!parsed.success) throw new Error(`${where}: ${describeIssues(parsed.error)}`);
  const { budget, models, ...rest } = parsed.data;
  return DeskConfig.parse({ ...defaults, ...rest, budget: { ...defaults.budget, ...budget }, models: { ...defaults.models, ...models } });
}
