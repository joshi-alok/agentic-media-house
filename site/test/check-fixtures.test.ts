import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFixtures, main } from '../scripts/check-fixtures';
import { writeFixtures } from '../scripts/generate-fixtures';

// The checker generates the fixtures into a scratch folder and compares them,
// file by file, with the folder that is committed. It must say "up to date"
// when they match and print a unified diff when they do not.

const GOLDEN = 'ledger/fixture-robotics-ships-fx-1-to-second-plant.json';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A folder holding a copy of the generated fixtures, standing in for the committed folder. */
function committedCopy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'robywire-committed-'));
  scratch.push(dir);
  writeFixtures(dir);
  return dir;
}

describe('checkFixtures', () => {
  it('is ok, with an empty diff, when the folder matches what the generator writes', () => {
    expect(checkFixtures(committedCopy())).toEqual({ ok: true, diff: '' });
  });

  it('is ok for the fixtures that are really committed in the repository', () => {
    expect(checkFixtures()).toEqual({ ok: true, diff: '' });
  });

  it('is not ok when a file was edited, and shows the committed line and the generated line', () => {
    const dir = committedCopy();
    const file = path.join(dir, 'desk-state.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"outcome": "published"', '"outcome": "failed"'));
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- committed/desk-state.json');
    expect(result.diff).toContain('+++ generated/desk-state.json');
    expect(result.diff).toContain('-    "outcome": "failed",');
    expect(result.diff).toContain('+    "outcome": "published",');
  });

  it('is not ok when a generated file is missing from the folder', () => {
    const dir = committedCopy();
    unlinkSync(path.join(dir, GOLDEN));
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- /dev/null');
    expect(result.diff).toContain(`+++ generated/${GOLDEN}`);
    expect(result.diff).toContain('+  "schemaVersion": 1,');
  });

  it('is not ok when the folder has a file the generator does not write', () => {
    const dir = committedCopy();
    mkdirSync(path.join(dir, 'news'), { recursive: true });
    writeFileSync(path.join(dir, 'news', 'stray.mdx'), 'stray\n');
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- committed/news/stray.mdx');
    expect(result.diff).toContain('+++ /dev/null');
    expect(result.diff).toContain('-stray');
  });

  it('is not ok when the folder has an empty file the generator does not write', () => {
    const dir = committedCopy();
    writeFileSync(path.join(dir, 'news', 'empty.mdx'), '');
    const result = checkFixtures(dir);
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('+++ /dev/null');
  });

  it('removes the scratch folder it generated into', () => {
    const generatedFolders = () => readdirSync(tmpdir()).filter((name) => name.startsWith('robywire-generated-')).length;
    const before = generatedFolders();
    checkFixtures(committedCopy());
    expect(generatedFolders()).toBe(before);
  });

  it('is not ok when the folder does not exist at all', () => {
    const result = checkFixtures(path.join(tmpdir(), 'robywire-no-such-folder'));
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('--- /dev/null');
  });
});

describe('main', () => {
  it('prints that the fixtures are up to date and returns 0', () => {
    const lines: string[] = [];
    expect(main(committedCopy(), (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual(['Fixtures are up to date.']);
  });

  it('prints the diff and how to fix it, and returns 1', () => {
    const dir = committedCopy();
    unlinkSync(path.join(dir, 'desk-state.json'));
    const lines: string[] = [];
    expect(main(dir, (line) => lines.push(line))).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('+++ generated/desk-state.json');
    expect(output).toContain('Fixtures are out of date. Run "npm run fixtures:generate --workspace @robywire/site" and commit the result.');
  });
});
