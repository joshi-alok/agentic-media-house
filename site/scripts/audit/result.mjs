/**
 * What a check returns: its id, whether the site passed, and one sentence for
 * each problem that starts with the file it was found in.
 *
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {boolean} ok
 * @property {string[]} problems
 */

/**
 * @param {string} id
 * @param {string[]} problems
 * @returns {CheckResult}
 */
export function result(id, problems) {
  return { id, ok: problems.length === 0, problems };
}
