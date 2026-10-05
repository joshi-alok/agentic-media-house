import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runChecks } from './audit/checks.mjs';
import { formatReport } from './audit/report.mjs';
import { loadSite } from './audit/site.mjs';

// `npm run audit` checks the built site in site/dist against the rules of the
// design and of the content. `npm run audit:prod` (--prod) also requires that
// the build has no trace of the fixtures. It prints one line for each check and
// exits 1 if any check found a problem. Exit code 2 means it could not run.

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = path.join(SITE_DIR, 'dist');
const TOKENS_FILE = path.join(SITE_DIR, 'src', 'styles', 'tokens.css');
const USAGE = 'Usage: node site/scripts/audit.mjs [--prod] [--dir <folder>]';

/**
 * Run the audit. Returns the exit code.
 * @param {string[]} [argv]
 * @param {(text: string) => void} [print]
 * @returns {number}
 */
export function main(argv = process.argv.slice(2), print = console.log) {
  let prod = false;
  let dir = DEFAULT_DIR;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--prod') prod = true;
    else if (argument === '--dir') {
      const value = argv[++index];
      if (value === undefined) {
        print(`--dir needs a folder.\n${USAGE}`);
        return 2;
      }
      dir = path.resolve(value);
    } else {
      print(`Unknown option: ${argument}\n${USAGE}`);
      return 2;
    }
  }

  let site;
  try {
    site = loadSite(dir);
  } catch (error) {
    print(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const results = runChecks(site, { tokensCss: readFileSync(TOKENS_FILE, 'utf8'), prod });
  // Show the folder relative to where the command was run, unless that would climb out of it.
  const relative = path.relative(process.cwd(), dir);
  const shown = relative === '' ? '.' : relative.startsWith('..') ? dir : relative;
  print(formatReport(results, { dir: shown, pages: site.pages.length, files: site.paths.size, prod }));
  return results.every((item) => item.ok) ? 0 : 1;
}

// Run when started as a script, not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
