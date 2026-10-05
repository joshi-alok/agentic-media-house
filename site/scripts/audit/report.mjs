// The text the audit prints: one line for each check, its problems under it,
// and a last line that says whether the site passed.

/** The most problems shown under one check; the rest are counted. */
const MAX_PROBLEMS_SHOWN = 25;

/**
 * @param {(import('./result.mjs').CheckResult & { title: string })[]} results
 * @param {{ dir: string, pages: number, files: number, prod: boolean }} info
 * @returns {string}
 */
export function formatReport(results, info) {
  const width = Math.max(...results.map((item) => item.id.length));
  const lines = [`Audit of ${info.dir}: ${info.pages} pages, ${info.files} files${info.prod ? ' (production build)' : ''}`];
  for (const item of results) {
    lines.push(`  ${item.ok ? 'ok  ' : 'FAIL'}  ${item.id.padEnd(width)}  ${item.title}`);
    for (const problem of item.problems.slice(0, MAX_PROBLEMS_SHOWN)) lines.push(`${' '.repeat(10 + width)}- ${problem}`);
    if (item.problems.length > MAX_PROBLEMS_SHOWN) lines.push(`${' '.repeat(10 + width)}... and ${item.problems.length - MAX_PROBLEMS_SHOWN} more`);
  }
  const failed = results.filter((item) => !item.ok);
  const problems = results.reduce((total, item) => total + item.problems.length, 0);
  lines.push('', failed.length === 0 ? `Passed: ${results.length} checks.` : `FAILED: ${problems} ${problems === 1 ? 'problem' : 'problems'} in ${failed.length} of ${results.length} checks.`);
  return lines.join('\n');
}
