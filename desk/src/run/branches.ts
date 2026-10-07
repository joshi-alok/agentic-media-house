// The names of the branches that the Desk makes for a held piece, in one place. Two parts of the Desk hold a branch name to a pattern before they run anything with it: `GitCli`, which makes
// the branch and removes it, and `GhForge`, which pushes it and opens a pull request on it (and `FakeGit` and `FakeForge`, which stand for them in tests). They used to have a pattern each, and
// the two did not accept the same names: a name that ends in a hyphen was a good branch for `GhForge` and a refusal, with a plain error, for `GitCli`. Now there is one pattern, and each of
// them asks it.

/** The most characters that the part of the name after the day has: the slug, cut where it is long, and the mark of the try, if it has one. */
export const SLUG_IN_BRANCH = 80;

/**
 * A branch that the Desk pushes: `hold/<day>-<slug>`, and `hold/<day>-<slug>-t<n>` for the n-th try of a day after the first. After the day it is lowercase letters and digits joined by
 * single hyphens, no hyphen at either end, and at most 80 characters. Nothing else is ever made, pushed or named in a pull request for a held piece.
 */
export const HOLD_BRANCH = /^hold\/\d{4}-\d{2}-\d{2}-(?=[a-z0-9-]{1,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `name` is the name of a hold branch. */
export const isHoldBranch = (name: string): boolean => HOLD_BRANCH.test(name);

/** The most that a slug is cut to, so that with the mark of a try the part after the day is at most 80 characters: the whole slug when it is not longer, else everything before the last hyphen that fits. */
function cutSlug(slug: string, room: number): string {
  if (slug.length <= room) return slug;
  // Take one character more than fits: when it is a hyphen, the first `room` characters are whole words and are kept.
  const head = slug.slice(0, room + 1);
  const hyphen = head.lastIndexOf('-');
  // A first word that is longer than the room has no hyphen to cut at, and is cut where it is.
  return hyphen > 0 ? head.slice(0, hyphen) : slug.slice(0, room);
}

/**
 * The name of the branch for the piece `slug` that was held on `date` (YYYY-MM-DD), on the `attempt`-th try of that day: `hold/<day>-<slug>` for the first, and `hold/<day>-<slug>-t<n>` for
 * a later one, so that a try that follows one that was half done (the branch was pushed and the pull request could not be opened) has a name of its own and cannot be rejected because the
 * earlier branch is on the remote with other commits. A slug that is too long to fit is cut at the last hyphen that fits, and never ends in a hyphen.
 */
export function holdBranchName(date: string, slug: string, attempt = 1): string {
  const moment = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(moment.getTime()) || moment.toISOString().slice(0, 10) !== date) {
    throw new Error(`holdBranchName: "${date}" is not a day written YYYY-MM-DD`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`holdBranchName: "${slug}" is not a plain slug (lowercase letters and digits joined by single hyphens)`);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 999) throw new Error(`holdBranchName: the try ${attempt} is not a whole number from 1 to 999`);
  const mark = attempt === 1 ? '' : `-t${attempt}`;
  return `hold/${date}-${cutSlug(slug, SLUG_IN_BRANCH - mark.length)}${mark}`;
}
