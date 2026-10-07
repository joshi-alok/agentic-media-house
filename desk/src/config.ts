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

export const DeskConfig = z.strictObject({
  /** Select: a candidate older than this many hours is not considered. */
  recencyHours: count,
  /** Select: the most candidates that are sent to the model. */
  shortlistMax: count,
  /** Extract: fewer surviving claims than this ends the run with no story. */
  minClaims: count,
  /** Verify: how many times a draft goes back to the composer before it is held. */
  maxRevisionRounds: z.number().int().nonnegative(),
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
  budget: Budget,
  models: Models,
  /** Where each run writes its artifacts. Kept out of git. */
  runDir: text,
  /** Where the snapshots of sources are kept. Kept out of git. */
  evidenceDir: text,
});
export type DeskConfig = z.infer<typeof DeskConfig>;

/** What a config file may hold: any setting, and any part of the budget or the models, and nothing else. */
const Overrides = DeskConfig.partial().extend({ budget: Budget.partial().optional(), models: Models.partial().optional() });

/** A fresh copy of the default settings. A new object each time, so no caller can change another's defaults. */
export function defaultConfig(): DeskConfig {
  return {
    recencyHours: 72,
    shortlistMax: 15,
    minClaims: 3,
    maxRevisionRounds: 2,
    maxAttemptsPerDay: 3,
    userAgent: 'AgenticMediaHouseDesk/0.1 (+https://agenticmediahouse.example/method)',
    requestIntervalMs: 1000,
    maxBytes: 2_000_000,
    budget: { maxCalls: 24, maxInputTokens: 400_000, maxOutputTokens: 60_000 },
    models: {
      select: 'claude-haiku-4-5-20251001',
      extract: 'claude-sonnet-5-5',
      compose: 'claude-sonnet-5-5',
      verify: 'claude-sonnet-5-5',
    },
    runDir: 'runs',
    evidenceDir: 'evidence',
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
