import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A made-up checkout of the site for the tests that publish: the folders where the pieces and the ledgers go, and the desk state as it is
// committed (one line, nothing has happened yet). The tests of Publish and of the runs put it in a temporary folder, so the real site is never touched.

/** The desk state as `site/src/data/desk-state.json` is committed. */
export const COMMITTED_STATE = '{"lastRun":null,"holds":[],"corrections":[]}\n';

/** Make the folders of a site in the folder `repoDir`, and return it. The two content folders hold a `.gitkeep`, as the real ones do. */
export function makeSite(repoDir: string): string {
  for (const folder of ['site/src/content/news', 'site/src/content/ledger']) {
    mkdirSync(path.join(repoDir, folder), { recursive: true });
    writeFileSync(path.join(repoDir, folder, '.gitkeep'), '');
  }
  mkdirSync(path.join(repoDir, 'site/src/data'), { recursive: true });
  writeFileSync(path.join(repoDir, 'site/src/data/desk-state.json'), COMMITTED_STATE);
  return repoDir;
}

/** Every file below `dir`, as paths relative to it with forward slashes, in order. */
export function filesBelow(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => statSync(path.join(dir, entry)).isFile())
    .map((entry) => entry.split(path.sep).join('/'))
    .sort();
}
