import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CORRECTION_KINDS, NewsFrontmatter } from '@robywire/gate';
import type { CorrectionKind } from '@robywire/gate';
import { parse } from 'yaml';
import { writeFileAtomic } from './atomic';
import { addCorrection, assertNothingLost, readDeskState, writeDeskState } from './desk-state';
import type { GitTarget } from './git';
import { isPlainSlug, sitePaths } from './target';

// A piece that has been published can be wrong, and the Desk never takes a piece away: the page stays up with a notice, and the receipts stay. `desk retract` is how the
// notice is made. It records a correction or a retraction in the desk state (the site reads the notice from there) and sets `updatedAt` in the frontmatter of the piece to the
// day of the record (the site refuses to build a piece whose `updatedAt` is not the day of its latest correction), and it commits the two files together. It deletes
// nothing and it changes nothing else: the rest of the file is the same, byte for byte.
//
// The reason that a person types is data. It goes into the desk state as the text of the note, and nowhere else: not into the piece, not into the message of the commit.

/** The most characters of a reason. */
export const MAX_REASON_LENGTH = 500;

/** A correction that the Desk will not make, and why. Nothing was written. */
export class RetractRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetractRefused';
  }
}

/**
 * The reason as it is recorded, or why it is refused: white space of any kind (a new line, a tab, runs of spaces) becomes one space and the ends are trimmed, because a note is one
 * line of the corrections page; any other control character is refused; and what is left must not be empty or longer than 500 characters.
 */
export function normaliseReason(reason: string): { ok: true; reason: string } | { ok: false; message: string } {
  const text = reason.replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false, message: 'the reason is empty: say why the piece is corrected or retracted' };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) return { ok: false, message: 'the reason has a control character in it' };
  if (text.length > MAX_REASON_LENGTH) return { ok: false, message: `the reason is ${text.length} characters, and at most ${MAX_REASON_LENGTH} are recorded: say it shorter` };
  return { ok: true, reason: text };
}

const refuse = (message: string): never => {
  throw new RetractRefused(message);
};

/** A line of a file, as it is shown in a message: cut at 60 characters and quoted. */
const shown = (line: string): string => JSON.stringify(line.length > 60 ? `${line.slice(0, 60)}...` : line);

/** The lines of the frontmatter of a piece and the number of the line that closes it, or a refusal. */
function frontmatterOf(lines: string[]): { end: number } {
  if (lines[0] !== '---') return refuse('the piece does not start with a block of frontmatter (a line of three hyphens)');
  const end = lines.indexOf('---', 1);
  if (end === -1) return refuse('the frontmatter of the piece is never closed (a second line of three hyphens)');
  return { end };
}

/**
 * The text of a piece with `updatedAt` set to `day` (YYYY-MM-DD), and nothing else changed: the line of `updatedAt` is replaced when the frontmatter has one, and made after the
 * line of `publishedAt` (where the renderer puts it) when it has none. Every other line, and everything below the frontmatter, is the same, byte for byte. Refuses a piece that
 * the Desk did not write in this shape: carriage returns, a frontmatter that is not closed, an `updatedAt` that is there twice or is not a plain date on one line, and a
 * frontmatter that does not have exactly one `publishedAt` to go after.
 */
export function setUpdatedAt(mdx: string, day: string): string {
  if (mdx.includes('\r')) refuse('the piece has carriage returns in it, which the Desk does not write, so it is not edited');
  const lines = mdx.split('\n');
  const { end } = frontmatterOf(lines);
  const linesOf = (key: string): number[] => lines.flatMap((line, at) => (at > 0 && at < end && line.startsWith(`${key}:`) ? [at] : []));
  const updated = `updatedAt: ${JSON.stringify(day)}`;
  const there = linesOf('updatedAt');
  if (there.length > 1) refuse('the frontmatter of the piece has updatedAt twice, so the Desk does not know which to change');
  if (there.length === 1) {
    const at = there[0] as number;
    if (!/^updatedAt: (?:"\d{4}-\d{2}-\d{2}"|'\d{4}-\d{2}-\d{2}'|\d{4}-\d{2}-\d{2})\s*$/.test(lines[at] as string)) {
      refuse(`the updatedAt of the piece is not a plain date on one line (${shown(lines[at] as string)}), so the Desk does not change it`);
    }
    lines[at] = updated;
  } else {
    const published = linesOf('publishedAt');
    if (published.length !== 1) refuse('the frontmatter of the piece does not have exactly one publishedAt, so the Desk does not know where updatedAt goes');
    lines.splice((published[0] as number) + 1, 0, updated);
  }
  return lines.join('\n');
}

/** The frontmatter of a piece, read as the site reads it, or a refusal that says what is wrong with it. */
function readFrontmatter(mdx: string, what: string): NewsFrontmatter {
  const lines = mdx.split('\n');
  const { end } = frontmatterOf(lines);
  let data: unknown;
  try {
    data = parse(lines.slice(1, end).join('\n'));
  } catch {
    return refuse(`the frontmatter of ${what} is not valid YAML`);
  }
  const checked = NewsFrontmatter.safeParse(data);
  if (!checked.success) return refuse(`the frontmatter of ${what} is not one that the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  return checked.data;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export interface RetractOptions {
  /** The root of the repository. */
  repoDir: string;
  git: GitTarget;
  /** The slug of the piece, which must be a piece that is on the site. */
  slug: string;
  /** Why, as a person wrote it; see `normaliseReason`. */
  reason: string;
  kind: CorrectionKind;
  /** The clock. It is read once, for the moment of the record. */
  now: () => Date;
  /** Go through every check and say what would be done, and write and commit nothing. */
  dry?: boolean;
}

export interface RetractResult {
  slug: string;
  kind: CorrectionKind;
  /** The moment that the correction is recorded at, as an ISO time in UTC. */
  at: string;
  /** The UTC day of `at`, which `updatedAt` of the piece is now. */
  updatedAt: string;
  /** False when the piece already had this `updatedAt` (a second correction on the same day) and so was not written again. */
  pieceChanged: boolean;
  /** The files that the commit has (or would have had), as paths below the repository. */
  files: string[];
  /** The id of the commit; null for a dry run. */
  commit: string | null;
  dry: boolean;
}

/**
 * Record a correction or a retraction of the published piece `slug`: add `{ at, slug, kind, note }` to the corrections of the desk state, set `updatedAt` in the frontmatter of the
 * piece to the UTC day of `at`, and commit the two files in one commit (`desk: correct <slug>` or `desk: retract <slug>`). The piece, its ledger and every other entry of the desk
 * state stay as they are, and nothing is deleted.
 *
 * Refuses, with a `RetractRefused` and before anything is written: a slug that is not a plain slug; a reason that `normaliseReason` refuses; a piece that is not in
 * `site/src/content/news` or has no ledger (a piece that was held is on its pull request, not on the site, until the owner merges it, so it cannot be corrected before); a
 * file that the correction changes that has a change that is not committed; a clock that is before the day the piece was published or before an earlier correction of the same
 * piece (the site requires `updatedAt` to be the day of the latest correction, so the order of the records must be the order of the clock); and a piece whose frontmatter the
 * Desk cannot edit with care (see `setUpdatedAt`). The new frontmatter is read again, as the site reads it, and refused unless it is the old one with `updatedAt` set and nothing else.
 * When the commit fails both files are put back as they were.
 */
export async function retractPiece(options: RetractOptions): Promise<RetractResult> {
  const { repoDir, git, slug, kind } = options;
  if (!isPlainSlug(slug)) refuse(`"${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
  if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) refuse(`the kind of a correction is correction or retraction, not "${kind}"`);
  const note = normaliseReason(options.reason);
  if (!note.ok) return refuse(note.message);

  const paths = sitePaths();
  const newsFile = paths.newsFile(slug);
  const ledgerFile = paths.ledgerFile(slug);
  if (!(await exists(path.join(repoDir, newsFile)))) {
    refuse(`there is no piece "${slug}" in ${paths.newsDir}. A piece that was held is on its pull request until the owner merges it, and cannot be corrected before it is published`);
  }
  if (!(await exists(path.join(repoDir, ledgerFile)))) refuse(`the piece "${slug}" has no ledger (${ledgerFile}), so it is not a piece that the Desk published`);

  const at = options.now().toISOString();
  const day = at.slice(0, 10);
  const stateFile = path.join(repoDir, paths.stateFile);
  const before = await readDeskState(stateFile);
  const later = before.corrections.find((entry) => entry.slug === slug && Date.parse(entry.at) > Date.parse(at));
  if (later !== undefined) refuse(`the desk state already has a record for "${slug}" made at ${later.at}, which is after now (${at}): the clock of this machine is behind`);

  const old = await readFile(path.join(repoDir, newsFile), 'utf8');
  const oldData = readFrontmatter(old, `the piece "${slug}"`);
  if (day < oldData.publishedAt) refuse(`the day of the record (${day}) is before the day the piece was published (${oldData.publishedAt}): the clock of this machine is behind`);
  const edited = setUpdatedAt(old, day);
  const newData = readFrontmatter(edited, `the piece "${slug}" with its new updatedAt`);
  if (!isDeepStrictEqual(newData, { ...oldData, updatedAt: day })) refuse('the frontmatter would change in more than updatedAt, so the Desk does not write it');

  const pieceChanged = edited !== old;
  const files = pieceChanged ? [newsFile, paths.stateFile] : [paths.stateFile];
  const after = addCorrection(structuredClone(before), { at, slug, kind, note: note.reason });
  assertNothingLost(before, after, paths.stateFile);
  const result: RetractResult = { slug, kind, at, updatedAt: day, pieceChanged, files, commit: null, dry: options.dry === true };
  if (options.dry === true) return result;

  if (!(await git.isClean(files))) refuse(`the files that this changes have changes that are not committed (${files.join(', ')}), so the Desk does not write there: commit or discard them first`);
  const original = await readFile(stateFile, 'utf8');
  try {
    await writeDeskState(stateFile, after);
    if (pieceChanged) await writeFileAtomic(path.join(repoDir, newsFile), edited);
    result.commit = await git.commit(files, `desk: ${kind === 'retraction' ? 'retract' : 'correct'} ${slug}`);
  } catch (error) {
    // A commit that fails leaves the checkout as it was found: both files are put back.
    await writeFileAtomic(stateFile, original);
    if (pieceChanged) await writeFileAtomic(path.join(repoDir, newsFile), old);
    throw error;
  }
  return result;
}
