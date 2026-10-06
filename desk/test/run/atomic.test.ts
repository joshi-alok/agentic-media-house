import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../../src/run/atomic';

// A file that other code reads must never be seen half written, and a failed write must leave nothing behind.

const scratch = mkdtempSync(path.join(tmpdir(), 'desk-atomic-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** A folder that exists and is empty. */
const emptyDir = (): string => {
  const dir = path.join(scratch, `dir-${++counter}`);
  mkdirSync(dir);
  return dir;
};

describe('writeFileAtomic', () => {
  it('writes the text exactly', async () => {
    const file = path.join(emptyDir(), 'a.txt');
    await writeFileAtomic(file, 'line 1\nline 2\n');
    expect(readFileSync(file, 'utf8')).toBe('line 1\nline 2\n');
  });

  it('writes text that is not ASCII as UTF-8', async () => {
    const file = path.join(emptyDir(), 'a.txt');
    const text = `caf${String.fromCharCode(0xe9)}`;
    await writeFileAtomic(file, text);
    expect(readFileSync(file)).toEqual(Buffer.from(text, 'utf8'));
  });

  it('creates the folder, and the folders above it, when they do not exist', async () => {
    const file = path.join(emptyDir(), 'one', 'two', 'a.txt');
    await writeFileAtomic(file, 'x');
    expect(readFileSync(file, 'utf8')).toBe('x');
  });

  it('replaces a file that is already there', async () => {
    const file = path.join(emptyDir(), 'a.txt');
    await writeFileAtomic(file, 'first version, which is the longer one');
    await writeFileAtomic(file, 'second');
    expect(readFileSync(file, 'utf8')).toBe('second');
  });

  it('leaves nothing but the file in the folder', async () => {
    const dir = emptyDir();
    await writeFileAtomic(path.join(dir, 'a.txt'), 'x');
    await writeFileAtomic(path.join(dir, 'a.txt'), 'y');
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('fails, and leaves no temporary file, when the file cannot be replaced', async () => {
    const dir = emptyDir();
    // A folder in the place of the file: the final step, the rename, cannot succeed.
    mkdirSync(path.join(dir, 'a.txt'));
    writeFileSync(path.join(dir, 'a.txt', 'keep.txt'), 'untouched');
    await expect(writeFileAtomic(path.join(dir, 'a.txt'), 'x')).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['a.txt']);
    expect(readFileSync(path.join(dir, 'a.txt', 'keep.txt'), 'utf8')).toBe('untouched');
  });

  it('reports the error of the write itself, not a failure to clean up, when no temporary file was ever made', async () => {
    const dir = emptyDir();
    // Something that is not text cannot be written, and the writer fails before it has made its temporary file.
    await expect(writeFileAtomic(path.join(dir, 'a.txt'), 123 as unknown as string)).rejects.toThrow('The "data" argument must be of type string');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('uses a different temporary name for every write, so two writes at once do not meet', async () => {
    const dir = emptyDir();
    const file = path.join(dir, 'a.txt');
    await Promise.all(Array.from({ length: 20 }, (_, index) => writeFileAtomic(file, `version ${index}`)));
    expect(readFileSync(file, 'utf8')).toMatch(/^version \d+$/);
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });
});
