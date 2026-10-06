import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Claim } from '@robywire/gate';
import { z } from 'zod';
import { describeIssues } from '../issues';
import { canonicalJson, sha256Hex } from '../model/types';
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
  /** The SHA-256 of the extracted text, which is the name of the snapshot in the evidence store. */
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64 lowercase hex characters'),
  retrievedAt: isoDateTime,
  /** The size of the extracted text in UTF-8 bytes. */
  bytes: z.number().int().nonnegative(),
  /** The title of the page; empty when the page has none. */
  title: z.string(),
});
export type FetchDocument = z.infer<typeof FetchDocument>;

/** What the Fetch stage stored, and the pages it could not get. The text itself is never in the artifact, only its hash. */
export const FetchArtifact = z.strictObject({
  date: isoDate,
  documents: z.array(FetchDocument),
  failures: z.array(z.strictObject({ url: httpUrl, tier, reason: text })),
});
export type FetchArtifact = z.infer<typeof FetchArtifact>;

/** A claim that a model proposed and code dropped: its place in the reply of the model (counting from 0), what it said, and every reason. */
const DroppedClaim = z.strictObject({
  index: z.number().int().nonnegative(),
  text,
  reasons: z.array(z.strictObject({ code: text, message: text })).min(1),
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
 * Check `value` against `schema` and write it to `<dir>/<name>.json`: JSON with two-space indents, the keys of every
 * object in sorted order (so the same artifact is the same bytes on every run) and a final newline. The write is
 * atomic, and an artifact that does not match its schema is not written at all. Returns the path of the file.
 */
export async function writeArtifact<T>(dir: string, name: string, value: unknown, schema: z.ZodType<T>): Promise<string> {
  const file = fileOf(dir, name);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`the artifact ${name}.json does not match its schema: ${describeIssues(parsed.error)}`);
  // canonicalJson sorts the keys; reading it back and writing it again with indents keeps that order.
  const body = JSON.stringify(JSON.parse(canonicalJson(parsed.data)), null, 2);
  await writeFileAtomic(file, `${body}\n`);
  return file;
}

/** Read `<dir>/<name>.json` and check it against `schema`. A file that is missing, is not JSON or does not match is an error that says which. */
export async function readArtifact<T>(dir: string, name: string, schema: z.ZodType<T>): Promise<T> {
  const file = fileOf(dir, name);
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`the artifact ${name}.json is not in ${dir}`);
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`the artifact ${name}.json is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`the artifact ${name}.json does not match its schema: ${describeIssues(parsed.error)}`);
  return parsed.data;
}
