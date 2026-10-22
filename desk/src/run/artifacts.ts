import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHECK_IDS, CHECK_RESULTS, Claim, Draft, PROFILE_IDS, ROUTES, RUN_OUTCOMES } from '@robywire/gate';
import { z } from 'zod';
import { DeskConfig } from '../config';
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
import { CLAIM_PROBLEM_CODES } from '../stages/claim-grounding';
import { writeFileAtomic } from './atomic';

// The record of a run. Every stage reads the artifact of the stage before it and writes its own,
// as one JSON file in the folder of the run (`runs/<date>/01-discover.json`). The files are checked
// against these schemas when they are written and when they are read, so a stage can never start
// from something that is not what the stage before it promised, and `desk replay` can start from
// the files alone.

const text = z.string().min(1);
const httpUrl = z.url({ protocol: /^https?$/ });
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const tier = z.union([z.literal(1), z.literal(2)]);

/**
 * The name of a candidate story: the first 12 hex characters of the SHA-256 of its address. The same
 * story has the same id on every run, and the model that chooses a story names it by this id.
 */
export function candidateId(url: string): string {
  return sha256Hex(url).slice(0, 12);
}

/** A story the Desk might write about, as found by the Discover stage. */
export const Candidate = z
  .strictObject({
    id: z.string().regex(/^[0-9a-f]{12}$/, 'id must be 12 lowercase hex characters'),
    title: text,
    url: httpUrl,
    /** When the source says it was published; missing for a headline link on a newsroom page. */
    publishedAt: isoDateTime.optional(),
    /** The outlet or the company that published it, as `sources.yml` names it. */
    outlet: text,
    tier,
    /** The beats of the source (or of its group of sources) in `sources.yml`. */
    beats: z.array(text),
    /** Where it was found: an item of a feed, or a headline link on a newsroom page. */
    origin: z.enum(['feed', 'newsroom']),
  })
  .refine((candidate) => candidate.id === candidateId(candidate.url), { message: 'id must be candidateId(url)', path: ['id'] });
export type Candidate = z.infer<typeof Candidate>;

/** What the Discover stage found, and the sources it could not read (each with the reason). */
export const DiscoverArtifact = z
  .strictObject({
    date: isoDate,
    candidates: z.array(Candidate),
    skipped: z.array(z.strictObject({ source: text, reason: text })),
  })
  .refine((artifact) => new Set(artifact.candidates.map((candidate) => candidate.id)).size === artifact.candidates.length, {
    message: 'two candidates have the id of the same address',
    path: ['candidates'],
  });
export type DiscoverArtifact = z.infer<typeof DiscoverArtifact>;

/** What the Select stage decided: one story or none, why, and where its tier-1 source is. */
export const SelectArtifact = z
  .strictObject({
    date: isoDate,
    chosen: Candidate.nullable(),
    reasons: z.array(text),
    /** The address of the primary source of the chosen story; null when none was found, or when no story was chosen. */
    tier1Url: httpUrl.nullable(),
    /** The ids of the candidates that were put to the model, in the order they were put. */
    shortlist: z.array(text),
  })
  .superRefine((artifact, context) => {
    if (artifact.chosen === null && artifact.tier1Url !== null) {
      context.addIssue({ code: 'custom', path: ['tier1Url'], message: 'no story was chosen, so there is no tier-1 address' });
    }
    if (artifact.chosen !== null && !artifact.shortlist.includes(artifact.chosen.id)) {
      context.addIssue({ code: 'custom', path: ['chosen'], message: 'the chosen story is not on the shortlist' });
    }
  });
export type SelectArtifact = z.infer<typeof SelectArtifact>;

/** One page that was fetched and stored: where from, what it is called in the evidence store, and when. */
export const FetchDocument = z.strictObject({
  url: httpUrl,
  /** The address after redirects. */
  finalUrl: httpUrl,
  tier,
  /** The SHA-256 of the stored text (the extracted text, cut when `truncated`), which is the name of the snapshot in the evidence store. */
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64 lowercase hex characters'),
  retrievedAt: isoDateTime,
  /** The size of the stored text in UTF-8 bytes. */
  bytes: z.number().int().nonnegative(),
  /** The title of the page; empty when the page has none. */
  title: z.string(),
  /** True only when the text was cut at `maxPageChars`: what was stored and read is the beginning of the page. */
  truncated: z.literal(true).optional(),
});
export type FetchDocument = z.infer<typeof FetchDocument>;

/** What the Fetch stage stored, and the pages it could not get. The text itself is never in the artifact, only its hash. */
export const FetchArtifact = z.strictObject({
  date: isoDate,
  documents: z.array(FetchDocument),
  failures: z.array(z.strictObject({ url: httpUrl, tier, reason: text })),
});
export type FetchArtifact = z.infer<typeof FetchArtifact>;

/**
 * A claim that a model proposed and code dropped: its place in the reply of the model (counting from 0; for pages read in parts, its place among the claims of all the replies, in the order of the calls, so that
 * each dropped claim has a place of its own), what it said, and every reason, each with the code of a check that claims go through (`CLAIM_PROBLEM_CODES`).
 */
const DroppedClaim = z.strictObject({
  index: z.number().int().nonnegative(),
  text,
  reasons: z.array(z.strictObject({ code: z.enum(CLAIM_PROBLEM_CODES), message: text })).min(1),
});

/**
 * What the Extract stage kept and what it dropped. The claims are the gate's own `Claim`, numbered `c-1`, `c-2` and so on in order,
 * each with its source, its quoted span as the page has it and what the model said about it. The quoted spans are the only
 * text of a page that an artifact holds.
 */
export const ExtractArtifact = z
  .strictObject({
    date: isoDate,
    claims: z.array(Claim),
    dropped: z.array(DroppedClaim),
  })
  .refine((artifact) => artifact.claims.every((claim, at) => claim.id === `c-${at + 1}`), {
    message: 'the claims must be numbered c-1, c-2 and so on, in order',
    path: ['claims'],
  });
export type ExtractArtifact = z.infer<typeof ExtractArtifact>;

/** One finding of the gate as the record keeps it: the check, the code, the message for the composer and where it was found. */
const GateFinding = z.strictObject({ check: z.enum(CHECK_IDS), code: text, message: text, where: z.string().optional() });

/** What the gate said of a draft, as the record keeps it: the route, every failure with its code, the notes (findings that did not block the draft), the reasons to hold, and the result of each check. */
export const GateReport = z.strictObject({
  route: z.enum(ROUTES),
  failures: z.array(GateFinding),
  /** The notes: findings that did not block the draft. Absent in a record made before notes existed. */
  warnings: z.array(GateFinding).optional(),
  holdReasons: z.array(text),
  checks: z.record(z.enum(CHECK_IDS), z.enum(CHECK_RESULTS)),
});
export type GateReport = z.infer<typeof GateReport>;

/**
 * Every draft of the piece, in order: what the composer wrote first, then what each revision made of it. The drafts are the gate's own
 * `Draft`, so each can be run through the gate again, and the last is the one that was published or held.
 */
export const ComposeArtifact = z.strictObject({
  date: isoDate,
  drafts: z.array(Draft).min(1),
});
export type ComposeArtifact = z.infer<typeof ComposeArtifact>;

/** What the model check decided, as a ledger's `verifier` field has it. */
const VerifierRecord = z.strictObject({ model: text, passed: z.boolean(), notes: z.array(text) });

/**
 * A status that the model check did not find in the passage of its claim, and that Verify lowered to `unspecified`, which says nothing about how far the thing has got, so that the piece
 * then says less and never more: the round in which it was lowered, the claim, the status it had, and the reason that the failure carried (the model's own words are in it). A status that is
 * `unspecified` is never lowered, and a basis never is.
 */
export const LoweredStatus = z.strictObject({
  round: z.number().int().nonnegative(),
  claimId: text,
  from: z.enum(['demonstrated', 'deployed', 'planned']),
  to: z.literal('unspecified'),
  reason: text,
});
export type LoweredStatus = z.infer<typeof LoweredStatus>;

/** One pass of the verification: what the gate said of the draft of that round, what the model check said (none when the gate failed first), and which items went back. */
const VerifyRound = z.strictObject({
  /** 0 for the draft that the composer wrote, then 1, 2 and so on for each revision. */
  round: z.number().int().nonnegative(),
  gate: GateReport,
  /** Null when the gate found failures: the model is not asked about a draft that code has already sent back. */
  verifier: VerifierRecord.nullable(),
  // `field` says, for a label that is not supported, whether it is the basis or the status; a record from before there was the field has none, and neither has a label that was given no verdict.
  verifierFailures: z.array(z.strictObject({ id: text, kind: z.enum(['sentence', 'heading', 'label']), code: z.enum(['not_entailed', 'ambiguous', 'unsupported', 'missing']), field: z.enum(['basis', 'status']).optional(), reason: text })),
  /** The ids of the sentences and headings that were sent back to the composer after this pass; none after the last. */
  sent: z.array(text),
});

/** The two facts about the passes that every record of a verification must have: one for the draft of the composer and one for each revision round, numbered in order. */
function checkHistory(record: { rounds: number; history: readonly { round: number }[] }, context: z.RefinementCtx): void {
  if (record.history.length !== record.rounds + 1) {
    context.addIssue({ code: 'custom', path: ['history'], message: 'there must be one pass for the draft of the composer and one for each revision round' });
  }
  if (record.history.some((pass, at) => pass.round !== at)) {
    context.addIssue({ code: 'custom', path: ['history'], message: 'the passes must be numbered 0, 1, 2 and so on, in order' });
  }
}

/**
 * What the Verify stage decided: `publish` only when the gate cleared the last draft and the model check passed, otherwise `hold`; how many
 * revision rounds were used; the gate and the model check of the last draft; and every pass, in order. `lowered` is there only when a status was lowered (see `LoweredStatus`); a
 * record without it is one in which none was, and every record from before there was the field is valid.
 */
export const VerifyArtifact = z
  .strictObject({
    date: isoDate,
    outcome: z.enum(['publish', 'hold']),
    rounds: z.number().int().nonnegative(),
    gate: GateReport,
    verifier: VerifierRecord,
    history: z.array(VerifyRound).min(1),
    lowered: z.array(LoweredStatus).optional(),
  })
  .superRefine((artifact, context) => {
    checkHistory(artifact, context);
    if (artifact.outcome === 'publish' && !(artifact.gate.route === 'publish' && artifact.verifier.passed)) {
      context.addIssue({ code: 'custom', path: ['outcome'], message: 'a piece is published only when the gate says publish and the model check passed' });
    }
  });
export type VerifyArtifact = z.infer<typeof VerifyArtifact>;

/**
 * A draft that was held: what the owner needs to see why, and to release it later without the Desk's help. It is the last draft, the claims
 * it cites, what the gate and the model check said of it and every pass that led there, and the reasons the hold records in the desk state (the codes
 * of the gate's failures, the gate's hold reasons and the reasons of the model check). It is written to `held/<slug>.json` in the folder of the run.
 */
export const HeldArtifact = z
  .strictObject({
    date: isoDate,
    slug: text,
    runId: text,
    reasons: z.array(text).min(1),
    draft: Draft,
    claims: z.array(Claim),
    rounds: z.number().int().nonnegative(),
    gate: GateReport,
    verifier: VerifierRecord,
    history: z.array(VerifyRound).min(1),
    /** The statuses that were lowered on the way to this draft, when any were (see `VerifyArtifact`): the `claims` above have them lowered. */
    lowered: z.array(LoweredStatus).optional(),
  })
  .superRefine(checkHistory);
export type HeldArtifact = z.infer<typeof HeldArtifact>;

const count = z.number().int().nonnegative();

/** Who answers the model calls of a run: a script (`fake`), recorded replies (`recorded`) or the Anthropic API (`api`). */
export const CLIENT_KINDS = ['fake', 'recorded', 'api'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Where the stories of a run come from: the made-up world (`fixtures`) or the sources of `sources.yml` on the web (`live`). */
export const SOURCES_KINDS = ['fixtures', 'live'] as const;
export type SourcesKind = (typeof SOURCES_KINDS)[number];

/** The fields that every record has, whatever version of the Desk wrote it. */
const RECORD_FIELDS = {
  runId: text,
  date: isoDate,
  startedAt: isoDateTime,
  finishedAt: isoDateTime,
  outcome: z.enum(RUN_OUTCOMES),
  /** The stage that ended the run: the last that ran (`publish` or `hold` for a run that got to the end, the one that found no story or failed otherwise). */
  stage: text,
  reason: text.nullable(),
  slug: text.nullable(),
  /** The id of the commit that the run made (one commit for each run that is not dry), or null when it made none. */
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/, 'commit must be 40 lowercase hex characters')
    .nullable(),
  dry: z.boolean(),
  models: DeskConfig.shape.models,
  /** The profile the run was written with; absent for a run that had none, and for a record from before there was one. A replay takes it from here. */
  profile: z.enum(PROFILE_IDS).optional(),
  /** The size of the parts the pages were read in (`extractChunkWords`); absent for a run that read each page whole, and for a record from before there was the setting. A replay takes it from here. */
  extractChunkWords: DeskConfig.shape.extractChunkWords,
  budget: z.strictObject({
    limit: DeskConfig.shape.budget,
    spent: z.strictObject({ calls: count, inputTokens: count, outputTokens: count }),
  }),
  /** The files the run left in its folder, as paths below it, in order: the artifacts of the stages and the held drafts, not the record itself. */
  artifacts: z.array(text),
  log: z.array(z.string()),
};

/** The rules of how a run can end, which hold for every record. */
function checkRunRecord(record: { outcome: string; startedAt: string; finishedAt: string; slug: string | null; reason: string | null; dry: boolean; commit: string | null }, context: z.RefinementCtx): void {
  const problem = (path: string, message: string): void => context.addIssue({ code: 'custom', path: [path], message });
  if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) problem('finishedAt', 'a run cannot end before it starts');
  if (record.outcome === 'published' && (record.slug === null || record.reason !== null)) problem('outcome', 'a published run has a slug and no reason');
  if (record.outcome === 'held' && (record.slug === null || record.reason === null)) problem('outcome', 'a held run has a slug and a reason');
  if ((record.outcome === 'no-story' || record.outcome === 'failed') && (record.slug !== null || record.reason === null)) {
    problem('outcome', `a run that ended in ${record.outcome} has a reason and no slug`);
  }
  if (record.dry && record.commit !== null) problem('commit', 'a dry run makes no commit');
  if (record.outcome === 'published' && !record.dry && record.commit === null) problem('commit', 'a run that published for real made a commit');
}

/**
 * The record of one run, written when it ends (`run.json` in the folder of the run; a folder that has none is a run that did not end). It says how
 * the run ended and why, which stage ended it, when, whether it was a dry run, how it was made (which client answered the model calls, where the stories
 * came from, and which try of its day it was: 1 for the first, 2 for the second, and so on), which piece and which commit it made, which models it used, what it
 * spent against its budget, which artifacts it left, and what the stages logged. The rules of how a run can end are in the schema, so that a record
 * that says otherwise cannot be written: a published piece has a slug and no reason; a hold has a slug and a reason; a run with no story or a failure
 * has a reason and no slug; a dry run has no commit, and a run that published for real has one. Every record that is written has the three fields that say
 * how the run was made; `readRunRecord` also reads a record from before they existed.
 */
export const RunRecord = z
  .strictObject({
    ...RECORD_FIELDS,
    client: z.enum(CLIENT_KINDS),
    sources: z.enum(SOURCES_KINDS),
    attempt: z.number().int().positive(),
  })
  .superRefine(checkRunRecord);
export type RunRecord = z.infer<typeof RunRecord>;

/** A record as it was written before records said how the run was made: the same fields without `client`, `sources` and `attempt`. It is never written, only read. */
export const LegacyRunRecord = z.strictObject(RECORD_FIELDS).superRefine(checkRunRecord);
export type LegacyRunRecord = z.infer<typeof LegacyRunRecord>;

/** A record as `readRunRecord` gives it: the fields of every record, and the three that say how the run was made when the record has them. */
export type StoredRunRecord = LegacyRunRecord & Partial<Pick<RunRecord, 'client' | 'sources' | 'attempt'>>;

/** The folder of the run of a day: `<runsDir>/<date>`. The date must be a real day, so that a date can never name a path elsewhere. */
export function runPath(runsDir: string, date: string): string {
  if (!isoDate.safeParse(date).success) throw new Error(`${JSON.stringify(date)} is not a date: a run is named for a day, written YYYY-MM-DD`);
  return path.join(runsDir, date);
}

/** An artifact is named for its place in the pipeline and its stage: `01-discover`, `02-select`, `03-fetch`. */
const ARTIFACT_NAME = /^\d{2}-[a-z][a-z0-9-]*$/;

function fileOf(dir: string, name: string): string {
  if (!ARTIFACT_NAME.test(name)) throw new Error(`${JSON.stringify(name)} is not an artifact name: two digits, a hyphen and the lowercase name of the stage, such as 01-discover`);
  return path.join(dir, `${name}.json`);
}

/**
 * Check `value` against `schema` and write it to `file`: JSON with two-space indents, the keys of every object in sorted order (so the same
 * record is the same bytes on every run) and a final newline. The write is atomic, and a value that does not match its schema is not written at all.
 * `label` names the file in the error.
 */
export async function writeJsonFile<T>(file: string, label: string, value: unknown, schema: z.ZodType<T>): Promise<void> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${label} does not match its schema: ${describeIssues(parsed.error)}`);
  // canonicalJson sorts the keys; reading it back and writing it again with indents keeps that order.
  const body = JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2);
  await writeFileAtomic(file, `${body}\n`);
}

/**
 * Write an artifact to `<dir>/<name>.json` (see `writeJsonFile`) and return the path of the file. An artifact that does not match its
 * schema is not written at all, and neither is its folder.
 */
export async function writeArtifact<T>(dir: string, name: string, value: unknown, schema: z.ZodType<T>): Promise<string> {
  const file = fileOf(dir, name);
  await writeJsonFile(file, `the artifact ${name}.json`, value, schema);
  return file;
}

/**
 * Read `file` and check it against `schema`. A file that is missing, is not JSON or does not match is an error that says which, naming it by `label`
 * (`the artifact 02-select.json`) and, for a file that is missing, the folder it is not in.
 */
export async function readJsonFile<T>(file: string, label: string, schema: z.ZodType<T>): Promise<T> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${label} is not in ${path.dirname(file)}`);
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`${label} does not match its schema: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

/** Read `<dir>/<name>.json` and check it against `schema` (see `readJsonFile`). */
export async function readArtifact<T>(dir: string, name: string, schema: z.ZodType<T>): Promise<T> {
  return readJsonFile(fileOf(dir, name), `the artifact ${name}.json`, schema);
}

/**
 * Read the record of a run, `run.json` at `file`. A record that says how the run was made is read as `RunRecord`; one from before that (none of the three fields) is
 * read as `LegacyRunRecord`, and has no `client`, `sources` or `attempt`. A record that fits neither is an error that names the fields of the new kind of record, as
 * every file of a run is checked, and so is a file that is missing or is not JSON.
 */
export async function readRunRecord(file: string): Promise<StoredRunRecord> {
  const label = 'the run record run.json';
  const data = await readJsonFile(file, label, z.unknown());
  const current = RunRecord.safeParse(data);
  if (current.success) return current.data;
  const legacy = LegacyRunRecord.safeParse(data);
  if (legacy.success) return legacy.data;
  throw new Error(`${label} does not match its schema: ${describeIssues(current.error)}`);
}
