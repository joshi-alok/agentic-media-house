import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The folders where a run keeps its artifacts and its evidence are never committed, and the lines of .gitignore that say so name the folders at the root of
// the repository, so that a folder of another purpose with the same name (a `site/src/content/evidence/`) is not hidden from git by accident.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LINES = readFileSync(`${ROOT}.gitignore`, 'utf8').split('\n');

/** Does git say that this path is ignored? The settings of the machine are kept out, and the path need not exist. */
function ignored(path: string): boolean {
  const result = spawnSync('git', ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', '--', path], { cwd: ROOT });
  if (result.status !== 0 && result.status !== 1) throw new Error(`git check-ignore failed: ${result.stderr.toString()}`);
  return result.status === 0;
}

describe('.gitignore', () => {
  it('names the folder of the runs and the folder of the evidence at the root, with a slash in front', () => {
    expect(LINES).toContain('/runs/');
    expect(LINES).toContain('/evidence/');
    expect(LINES).not.toContain('runs/');
    expect(LINES).not.toContain('evidence/');
  });

  it('ignores what a run writes at the root', () => {
    expect(ignored('runs/2026-10-05/run.json')).toBe(true);
    expect(ignored('evidence/0123456789abcdef.txt')).toBe(true);
  });

  it('does not ignore a folder of the same name anywhere else', () => {
    expect(ignored('site/src/content/evidence/a-piece.json')).toBe(false);
    expect(ignored('desk/runs/a.json')).toBe(false);
    expect(ignored('docs/evidence/notes.md')).toBe(false);
  });
});
