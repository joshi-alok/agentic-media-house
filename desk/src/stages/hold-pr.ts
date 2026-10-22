import { LedgerEntry, renderDraft } from '@robywire/gate';
import type { RenderedPiece } from '@robywire/gate';
import { ForgeError, MAIN_BRANCH, holdBranchName, isPlainSlug, sitePaths } from '../index';
import type { ForgeTarget, HeldArtifact, PieceFiles, PublishTarget } from '../index';
import { REASON_LABELS } from '../../../site/src/lib/reasons';
import type { StageContext } from './context';

// A piece that is held reaches the owner as a draft pull request, and this is what goes into it. The branch of the pull request carries the piece as the
// site would show it if it were published (`renderHeldPiece`), so that merging the pull request is all that it takes to publish it, and the text of the
// pull request (`holdPrTitle` and `holdPrBody`) says what was held, why, what each check said, and what to do. The words of the reasons are those of the holds
// page of the site (`site/src/lib/reasons.ts` is where they are written, and the holds page and this text read the same table).
//
// Most of what is in a pull request was written by a model: the headline, the messages of the failures (they quote sentences), the notes and the reasons of the
// model check. GitHub turns `@name` into a notification, `#12` into a link and `[text](address)` into a link, so none of it is put in the text as it is: it goes
// in a fenced block, where none of that happens, and the fence is longer than any run of backticks in the text, so that the text cannot close it.
//
// `sendToOwner` is the flow itself: the piece is committed to a branch of its own, the branch is pushed, and the draft pull request is opened. It never changes the
// checkout, and whatever goes wrong after the branch is made, the branch is removed again (see `GitTarget.commitToNewBranch`).

/**
 * The two files of the piece that `held` is, written as the site would publish it, and the ledger that goes with it. The release is `owner`: the Desk did not
 * clear it, so the owner releases it by merging. The ledger says that the piece was held, so its gate route is `hold` whatever route the gate gave the last draft
 * (a draft that the gate cleared and the model check did not is held, and a release by the owner needs a route that is not `publish`), and its hold reasons are
 * the reasons of the hold, so that the receipts page says why the piece was held. Throws what the renderer throws for a draft that cannot be written as a
 * piece (a sentence that cites a claim that does not exist, a category that is not a slug).
 */
export function renderHeldPiece(held: HeldArtifact): RenderedPiece {
  return renderDraft(held.draft, held.claims, {
    runId: held.runId,
    gate: { ...held.gate, route: 'hold', warnings: held.gate.warnings ?? [], holdReasons: [...held.reasons] },
    verifier: held.verifier,
    release: 'owner',
  });
}

/** `renderHeldPiece`, as the files of a piece, checked the way that Publish checks them: the slug is a plain slug and the ledger is one that the site accepts. */
export function heldPieceFiles(held: HeldArtifact): PieceFiles {
  const slug = held.draft.slug;
  if (!isPlainSlug(slug)) throw new Error(`heldPieceFiles: "${slug}" is not a plain slug, and a slug is a file name`);
  const { mdx, ledger } = renderHeldPiece(held);
  const checked = LedgerEntry.safeParse(ledger);
  if (!checked.success) throw new Error(`heldPieceFiles: the ledger of the piece is not one the site accepts: ${checked.error.issues.map((issue) => issue.message).join('; ')}`);
  return { slug, mdx, ledger: `${JSON.stringify(ledger, null, 2)}\n` };
}

/** The most characters of a headline in the title of a pull request. */
const TITLE_MAX = 100;

/** The most characters in one block of the text of a pull request that a model wrote. GitHub takes 65,536 for the whole text. */
const BLOCK_MAX = 4000;

/**
 * The title of the pull request: `Held: ` and the headline of the piece, on one line and cut at 100 characters. It starts with `Held: ` always, so that no program
 * can take it for an option; a piece with no headline is named by its slug.
 */
export function holdPrTitle(held: HeldArtifact): string {
  const headline = held.draft.title.text.replace(/\s+/g, ' ').trim();
  if (headline === '') return `Held: ${held.draft.slug}`;
  const letters = Array.from(headline);
  return `Held: ${letters.length > TITLE_MAX ? `${letters.slice(0, TITLE_MAX - 3).join('')}...` : headline}`;
}

/** `text` as a code span: on one line, with a delimiter longer than any run of backticks in it. */
function inlineCode(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim() || '(empty)';
  const longest = Math.max(0, ...[...line.matchAll(/`+/g)].map((run) => run[0].length));
  const ticks = '`'.repeat(longest + 1);
  const pad = line.startsWith('`') || line.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${line}${pad}${ticks}`;
}

/** `text` cut to `BLOCK_MAX` characters (and not in the middle of a pair), with a line that says how much was left out. */
function clip(text: string): string {
  if (text.length <= BLOCK_MAX) return text;
  const cut = /[\ud800-\udbff]$/.test(text.slice(0, BLOCK_MAX)) ? BLOCK_MAX - 1 : BLOCK_MAX;
  return `${text.slice(0, cut)}\n[cut: ${text.length - cut} more characters]`;
}

/** `text` in a fenced block. The fence is made of more backticks than the longest run in the text (and at least three), so that nothing in the text can close it. */
function fenced(text: string): string {
  const body = clip(text.replace(/\r\n?/g, '\n').replace(/\n+$/, ''));
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${body}\n${fence}`;
}

/** The words for a code: what the holds page of the site says for it, or a line that says there are none, and never the words of anyone else. */
const wordsFor = (code: string): string => (Object.hasOwn(REASON_LABELS, code) ? (REASON_LABELS[code] as string) : 'no plain words are written for this code');

/**
 * The text of the pull request, as markdown: what was held and why (each reason with its words), the piece, what the gate said, what the model check said, and how
 * to publish the piece and how to discard it. A pure function of `held`. Everything that a model wrote (the headline, the messages of the gate's failures, the notes
 * and the reasons of the model check) is in a fenced block. What is not in one is the Desk's own: the slug, the day, the categories, the id of the run, the name of the
 * model, the codes, the counts and the words of the holds page.
 */
export function holdPrBody(held: HeldArtifact): string {
  const slug = held.draft.slug;
  const files = sitePaths();
  const checks = Object.entries(held.gate.checks);
  const failedChecks = checks.filter(([, result]) => result === 'fail').map(([id]) => id);
  const last = held.history.at(-1);
  const modelCheckAsked = last?.verifier !== null;

  const gateLines = held.gate.failures.map((failure) => `${failure.code}: ${failure.message}${failure.where === undefined ? '' : ` (${failure.where})`}`);
  const modelLines = (last?.verifierFailures ?? []).map((failure) => `${failure.id} (${failure.kind}, ${failure.code}): ${failure.reason}`);

  const lines = [
    `# Held by the Desk: ${inlineCode(slug)}`,
    '',
    'The Desk did not publish this piece by itself, so it is here for you to decide. It is a draft pull request: nothing on the site changes until you merge it.',
    '',
    '## Why it was held',
    '',
    ...held.reasons.map((code) => `- ${inlineCode(code)}: ${wordsFor(code)}`),
    '',
    '## The piece',
    '',
    '| | |',
    '|---|---|',
    `| Slug | ${inlineCode(slug)} |`,
    `| Day | ${inlineCode(held.date)} |`,
    `| Categories | ${held.draft.categories.length === 0 ? '(none)' : held.draft.categories.map(inlineCode).join(', ')} |`,
    `| Run | ${inlineCode(held.runId)} |`,
    `| Rounds of revision | ${held.rounds} |`,
    `| The article | ${inlineCode(files.newsFile(slug))} |`,
    `| Its ledger | ${inlineCode(files.ledgerFile(slug))} |`,
    '',
    'The headline, as the model wrote it. Everything below in a grey box was written by a model and is shown as it is, as data, and nobody has checked it.',
    '',
    fenced(held.draft.title.text),
    '',
    '## What the gate said',
    '',
    `${checks.length - failedChecks.length} of ${checks.length} checks passed.${failedChecks.length === 0 ? '' : ` Failed: ${failedChecks.map(inlineCode).join(', ')}.`} It ${held.gate.failures.length === 0 ? 'found no failure' : `found ${held.gate.failures.length} ${held.gate.failures.length === 1 ? 'failure' : 'failures'}`} in the last draft.`,
    ...(gateLines.length === 0 ? [] : ['', fenced(gateLines.join('\n'))]),
    '',
    '## What the model check said',
    '',
    `The model check (${inlineCode(held.verifier.model)}) ${modelCheckAsked ? (held.verifier.passed ? 'passed the last draft.' : 'did not pass the last draft.') : 'was not asked about the last draft: the gate had sent it back, and a draft that the gate has sent back is not shown to the model.'}`,
    ...(held.verifier.notes.length === 0 ? [] : ['', 'Its notes:', '', fenced(held.verifier.notes.join('\n'))]),
    ...(modelLines.length === 0 ? [] : ['', 'What it did not clear:', '', fenced(modelLines.join('\n'))]),
    '',
    '## To publish it',
    '',
    '1. Open **Files changed** and read the article and its ledger.',
    '2. If you agree with every sentence, click **Ready for review** and merge the pull request. The site is built again and shows the piece, and its receipts page says that the owner released it.',
    '',
    '## To discard it',
    '',
    'Close the pull request without merging it. Nothing is published, and the hold stays on record in the desk state.',
    '',
  ];
  return lines.join('\n');
}

/** How many names of tries are looked at for a branch that is not on the remote already, before the Desk gives up: the day has at most `maxAttemptsPerDay` tries, and a few more are left by tries on other machines. */
const MOST_BRANCH_TRIES = 10;

/**
 * The name for the branch of the held piece on the `attempt`-th try of its day: `hold/<day>-<slug>` for the first and `hold/<day>-<slug>-t<n>` for a later one, and the first of these,
 * from that try on, that is not on the remote already. The number of the try comes from the record of the run, which is only on the machine that made the earlier tries: a scheduled job
 * starts from a fresh checkout every time, with no record, and is the first try as far as it knows. The remote is what remembers, so the branch that an earlier try left there, when it
 * pushed the branch and could not open the pull request, is found there, and the name of the next try is used. A branch that is on the remote is never pushed to again, so that
 * the push cannot be rejected as one that is not a fast-forward.
 */
async function freeBranchName(forge: ForgeTarget, date: string, slug: string, attempt: number): Promise<string> {
  const first = Math.max(1, attempt);
  const taken: string[] = [];
  for (let n = first; n < first + MOST_BRANCH_TRIES; n++) {
    const name = holdBranchName(date, slug, n);
    if (!(await forge.branchExists(name))) return name;
    taken.push(name);
  }
  throw new ForgeError('branch-exists', `${MOST_BRANCH_TRIES} names of branches for the held piece ${slug}, from ${taken[0]} to ${taken.at(-1)}, are all on the remote already: delete the branches that earlier tries left, or open the pull request from one of them by hand`);
}

/** A pull request that was opened for a held piece: where it is, which branch it is from, and the commit that the branch has. */
export interface HoldPullRequest {
  url: string;
  number: number;
  branch: string;
  commit: string;
}

/** What `sendToOwner` did: the pull request that it opened, or why it opened none (the draft cannot be written as a piece, so there is nothing for the owner to merge). */
export type SentToOwner = { sent: HoldPullRequest } | { notSent: string };

const describeError = (error: unknown): string => (error instanceof Error ? error.message || error.name : String(error));

/**
 * Send the held piece `held` to the owner as a draft pull request, in this order, and stop at the first step that fails:
 *
 * 1. Write the draft as a piece (`heldPieceFiles`). A draft that cannot be written (a sentence cites a claim that does not exist) is not an error of the forge: there
 *    is nothing to merge, so nothing is sent, and the answer says why.
 * 2. Check that the places that the Desk writes to are in order (`target.preflight`): the desk state can be read and nothing there has a change that is not committed.
 * 3. Check that the repository has a remote (`forge.hasRemote`).
 * 4. Choose the name of the branch: `hold/<day>-<slug>`, or `hold/<day>-<slug>-t<n>` on the n-th try of the day, and the first of the names, from the try that this is, that the remote
 *    does not have (`freeBranchName`). Commit the two files to it, made from `main` beside the checkout (`target.commitPieceToBranch`).
 * 5. Push the branch, and open the draft pull request into `main`. When either fails the branch is removed again, and when the branch had been pushed the error says so, because
 *    it is then on the remote and the owner can open the pull request from it by hand.
 *
 * Nothing in the checkout changes at any step: the branch is made beside it. Throws what the step threw (a `ForgeError` for a step of the forge).
 */
export async function sendToOwner(ctx: Pick<StageContext, 'log'>, target: PublishTarget, forge: ForgeTarget, held: HeldArtifact, attempt = 1): Promise<SentToOwner> {
  let piece: PieceFiles;
  try {
    piece = heldPieceFiles(held);
  } catch (error) {
    return { notSent: `the draft cannot be written as a piece, so there is nothing for the owner to merge (${describeError(error)})` };
  }
  await target.preflight();
  if (!(await forge.hasRemote())) throw new ForgeError('no-remote', 'the repository has no remote called origin, so the held piece cannot be sent to the owner as a pull request');

  const branch = await freeBranchName(forge, held.date, piece.slug, attempt);
  const { commit } = await target.commitPieceToBranch({ branch, piece, message: `desk: held piece ${piece.slug}, for the owner to release` });
  let pushed = false;
  try {
    await forge.pushBranch(branch);
    pushed = true;
    const opened = await forge.openDraftPullRequest({ branch, title: holdPrTitle(held), body: holdPrBody(held), base: MAIN_BRANCH });
    ctx.log(`hold: ${piece.slug} is sent to the owner as the draft pull request ${opened.url} (branch ${branch})`);
    return { sent: { ...opened, branch, commit } };
  } catch (error) {
    await target.dropBranch(branch).catch(() => undefined);
    const kind = error instanceof ForgeError ? error.kind : 'failed';
    throw new ForgeError(kind, `${describeError(error)}${pushed ? ` (the branch ${branch} was pushed and no pull request was opened, so it is left on the remote: open a pull request from it by hand, or delete it with git push origin --delete ${branch}; the next try of the day uses another name)` : ''}`);
  }
}
