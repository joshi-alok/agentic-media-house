import { BUILD_FAILED_BRANCH } from './forge';

// What a draft pull request says when what a run committed does not reach `main` because the site does not build with it. The workflow builds the site and audits the
// build before it pushes (`desk.yml`); when either fails, the commits go to a branch of their own (`desk push --branch-only`) and this is the pull request that opens
// on it, so that the owner finds out from GitHub and has the commits in front of them. The text is made of fixed sentences and of two kinds of fact that cannot carry
// anything else: the ids of the checks of the audit that failed (A5, A7: letters and digits, checked) and how many problems each found (a number). Nothing that the audit
// printed about a problem is used, because a problem names the page that it found it in, and a page is made of what the models and the sources wrote: the report of an
// audit is data that the pull request does not repeat.

/** The folder of the branches that hold the commits of a run whose build failed: `desk-build-failed/<day>-<run id>`. */
export const BUILD_FAILED_FOLDER = 'desk-build-failed';

/** A check of the audit that failed, with how many problems it found. */
export interface AuditFailure {
  id: string;
  problems: number;
}

/** What went wrong: the production build did not finish, or the audit of it failed (with the checks that it named, which may be none when the audit could not run at all). */
export interface BuildFailure {
  stage: 'build' | 'audit';
  failures: AuditFailure[];
}

/** The id of a check of the audit, as the audit prints it. Anything else on a line is not an id. */
const CHECK_ID = /^[A-Z][0-9]{1,3}$/;

/** The most checks that are named. The audit has 18. */
const MOST_CHECKS = 30;

/** The largest count that is believed: a report can be made to say anything, and a number in a title should be a number of problems and not an attack. */
const MOST_PROBLEMS = 99999;

/**
 * The checks that failed, from the text that `npm run audit:prod` printed: a line `  FAIL  <id>  <title>` starts a check, and each line under it that starts with spaces and `- `
 * is one of its problems (a line `... and N more` stands for N). Only the id (if it is the shape of one) and the number of problems are kept: the title and the problems are
 * never read for their words. A check is named once, and the first 30 are kept.
 */
export function auditFailures(report: string): AuditFailure[] {
  const found: AuditFailure[] = [];
  let current: AuditFailure | undefined;
  for (const line of report.split('\n')) {
    const failed = /^ {2}FAIL {2}(\S+)(?: |$)/.exec(line);
    if (failed !== null) {
      const id = failed[1] as string;
      current = CHECK_ID.test(id) && !found.some((item) => item.id === id) ? { id, problems: 0 } : undefined;
      if (current !== undefined) found.push(current);
      continue;
    }
    if (current === undefined) continue;
    const more = /^ {10,}\.\.\. and (\d{1,6}) more$/.exec(line);
    if (more !== null) current.problems = Math.min(MOST_PROBLEMS, current.problems + Number(more[1]));
    else if (/^ {10,}- /.test(line)) current.problems = Math.min(MOST_PROBLEMS, current.problems + 1);
  }
  return found.slice(0, MOST_CHECKS);
}

/**
 * Which step failed, from the report of the audit if there is one. No report means that the audit never ran, because the production build before it failed. A report means that the build
 * finished and the audit did not pass, and names the checks that failed (none, when the report is not one that the audit makes: it could not run).
 */
export function buildFailureOf(auditReport: string | undefined): BuildFailure {
  return auditReport === undefined ? { stage: 'build', failures: [] } : { stage: 'audit', failures: auditFailures(auditReport) };
}

export interface BuildFailedInput {
  day: string;
  runId: string;
  /** The branch that the commits are on. */
  branch: string;
  commits: number;
  failure: BuildFailure;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * The draft pull request for commits that did not reach `main`: its title and its body. Every value that is put in the text is checked first (the day, the id of the run, the branch,
 * the ids of the checks and the counts), so that nothing but what is expected can be in it, and a value that is not what it should be is an error and not a pull request.
 */
export function buildFailedPullRequest(input: BuildFailedInput): { title: string; body: string } {
  const { day, runId, branch, commits, failure } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`${JSON.stringify(day)} is not a day written YYYY-MM-DD`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId)) throw new Error(`${JSON.stringify(runId)} is not an id of a run`);
  if (!BUILD_FAILED_BRANCH.test(branch)) throw new Error(`${JSON.stringify(branch)} is not a branch for commits whose build failed`);
  if (!Number.isInteger(commits) || commits < 1 || commits > 99999) throw new Error(`${commits} is not a number of commits`);
  for (const item of failure.failures) {
    if (!CHECK_ID.test(item.id) || !Number.isInteger(item.problems) || item.problems < 0 || item.problems > MOST_PROBLEMS) throw new Error('a failed check is not an id of the audit and a number of problems');
  }
  const stopped = failure.stage === 'build' ? 'the production build (`npm run build`) did not finish' : 'the audit of the production build (`npm run audit:prod`) did not pass';
  const named =
    failure.stage === 'build'
      ? 'none: the audit did not run, because the build before it failed'
      : failure.failures.length === 0
        ? 'none named: the audit stopped before it could say which check failed'
        : failure.failures.map((item) => `${item.id} (${plural(item.problems, 'problem', 'problems')})`).join(', ');
  const body = [
    `The Desk run ${runId} of ${day} made ${plural(commits, 'commit', 'commits')}, and they were **not** pushed to \`main\`: ${stopped}, with the commits on top of \`main\`. The live site is as it was, and so is \`main\`.`,
    '',
    '| | |',
    '|---|---|',
    `| Stopped at | ${failure.stage === 'build' ? 'the production build' : 'the audit of the production build'} |`,
    `| Checks that failed | ${named} |`,
    `| Commits | ${commits} |`,
    `| Branch | \`${branch}\` |`,
    '',
    `The log of the workflow run (Actions, Desk; run and attempt \`${runId}\`) has the whole report. This text holds only the ids of the checks and the numbers of problems, because the report names the pages, and the pages are not repeated here.`,
    '',
    '**What to do.** Find out why the site does not build with these commits, and fix it on this branch. Merge the pull request when the site builds and passes its audit, and the Deploy workflow puts it on the web; close it to discard the commits. Until then none of this run is on `main`, so the next start of the day does not know of it and runs again, which can end in another pull request like this one (the workflow starts three times a day).',
  ].join('\n');
  return { title: `Does not build: the commits of the Desk run ${runId} (${day})`, body };
}
