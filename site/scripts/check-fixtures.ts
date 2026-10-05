import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTwoFilesPatch } from 'diff';
import { FIXTURES_DIR, writeFixtures } from './generate-fixtures';

// `npm run fixtures:check` regenerates the fixtures into a scratch folder and
// compares them with the committed folder. If they differ, it prints a unified
// diff and exits 1, so a change to the gate, the renderer or the generator
// cannot leave the committed fixtures behind.

export interface CheckResult {
  ok: boolean;
  /** A unified diff from the committed files to the generated ones. Empty when ok. */
  diff: string;
}

/** The files under `dir`, as paths relative to it, in sorted order. A missing folder has none. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => statSync(path.join(dir, name)).isFile())
    .map((name) => name.split(path.sep).join('/'))
    .sort();
}

const read = (dir: string, name: string): string => readFileSync(path.join(dir, ...name.split('/')), 'utf8');

/** Compare the generated fixtures with the files in `committedDir` (by default the committed folder). */
export function checkFixtures(committedDir: string = FIXTURES_DIR): CheckResult {
  const generatedDir = mkdtempSync(path.join(tmpdir(), 'robywire-generated-'));
  try {
    writeFixtures(generatedDir);
    const committed = new Set(filesUnder(committedDir));
    const generated = new Set(filesUnder(generatedDir));
    const patches: string[] = [];
    for (const name of [...new Set([...committed, ...generated])].sort()) {
      const before = committed.has(name) ? read(committedDir, name) : '';
      const after = generated.has(name) ? read(generatedDir, name) : '';
      if (before === after && committed.has(name) === generated.has(name)) continue;
      const from = committed.has(name) ? `committed/${name}` : '/dev/null';
      const to = generated.has(name) ? `generated/${name}` : '/dev/null';
      patches.push(createTwoFilesPatch(from, to, before, after));
    }
    return { ok: patches.length === 0, diff: patches.join('\n') };
  } finally {
    rmSync(generatedDir, { recursive: true, force: true });
  }
}

/** Run the check and print the outcome. Returns the process exit code. */
export function main(committedDir: string = FIXTURES_DIR, print: (text: string) => void = console.log): number {
  const result = checkFixtures(committedDir);
  if (result.ok) {
    print('Fixtures are up to date.');
    return 0;
  }
  print(result.diff);
  print('Fixtures are out of date. Run "npm run fixtures:generate --workspace @robywire/site" and commit the result.');
  return 1;
}

// Run when started as a script (tsx scripts/check-fixtures.ts), not when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
