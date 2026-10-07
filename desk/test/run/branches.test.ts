import { describe, expect, it } from 'vitest';
import { HOLD_BRANCH, SLUG_IN_BRANCH, holdBranchName, isHoldBranch } from '../../src/run/branches';
import { FakeForge, GhForge } from '../../src/run/forge';
import { FakeGit, GitCli } from '../../src/run/git';
import { useScratch } from '../support/context';
import { scriptedExec } from '../support/exec';
import { ISOLATED, git } from '../support/repo';

// The name of the branch of a held piece. It has to be a name that git takes, that GitHub takes, and that every part of the Desk that handles it takes, and it has to be a different
// name for each try of a day, or a retry that follows a try that was half done is rejected because the earlier branch is on the remote.

const DAY = '2026-10-05';
const after = (name: string): string => name.slice(`hold/${DAY}-`.length);

describe('holdBranchName', () => {
  it('is hold/<day>-<slug> for the first try of a day', () => {
    expect(holdBranchName(DAY, 'fixture-robotics-second-plant')).toBe('hold/2026-10-05-fixture-robotics-second-plant');
    expect(holdBranchName(DAY, 'fixture-robotics-second-plant', 1)).toBe('hold/2026-10-05-fixture-robotics-second-plant');
  });

  it('is hold/<day>-<slug>-t<n> for the n-th try of a day, so that each try has a name of its own', () => {
    expect(holdBranchName(DAY, 'fixture-robotics-second-plant', 2)).toBe('hold/2026-10-05-fixture-robotics-second-plant-t2');
    expect(holdBranchName(DAY, 'fixture-robotics-second-plant', 3)).toBe('hold/2026-10-05-fixture-robotics-second-plant-t3');
    expect(holdBranchName(DAY, 'fixture-robotics-second-plant', 999)).toBe('hold/2026-10-05-fixture-robotics-second-plant-t999');
  });

  it('cuts a slug that is too long at the last hyphen that fits, so that it never ends in a hyphen and never cuts a word', () => {
    expect(holdBranchName(DAY, `${'a'.repeat(60)}-${'b'.repeat(60)}`)).toBe(`hold/${DAY}-${'a'.repeat(60)}`);
    // The 81st character is a hyphen: the first 80 are whole words, and stay.
    expect(holdBranchName(DAY, `${'a'.repeat(40)}-${'b'.repeat(39)}-${'c'.repeat(10)}`)).toBe(`hold/${DAY}-${'a'.repeat(40)}-${'b'.repeat(39)}`);
    // The cut at 80 characters would have left a hyphen at the end, which git does not take in the name that GitCli makes: the slug that disambiguateSlug makes can be this long.
    const long = `${'a'.repeat(79)}-bbbb`;
    expect(holdBranchName(DAY, long)).toBe(`hold/${DAY}-${'a'.repeat(79)}`);
    expect(holdBranchName(DAY, long).endsWith('-')).toBe(false);
  });

  it('keeps a slug that is exactly as long as the room whole, and looks for the hyphen no further than one character past it', () => {
    const exact = `${'a'.repeat(40)}-${'b'.repeat(39)}`;
    expect(exact).toHaveLength(80);
    expect(holdBranchName(DAY, exact)).toBe(`hold/${DAY}-${exact}`);
    // The hyphen is the 82nd character: words up to it are 81 characters, which is one too many, so the cut is at the hyphen before.
    expect(holdBranchName(DAY, `${'a'.repeat(30)}-${'b'.repeat(50)}-${'c'.repeat(10)}`)).toBe(`hold/${DAY}-${'a'.repeat(30)}`);
    // A first word of one character is a word, and the cut is after it.
    expect(holdBranchName(DAY, `a-${'b'.repeat(100)}`)).toBe(`hold/${DAY}-a`);
  });

  it('cuts a first word that is longer than the room where it is, because it has no hyphen to be cut at', () => {
    expect(holdBranchName(DAY, 'a'.repeat(100))).toBe(`hold/${DAY}-${'a'.repeat(80)}`);
  });

  it('leaves room for the mark of the try: the part after the day is at most 80 characters for every try', () => {
    for (const attempt of [1, 2, 9, 10, 99, 100, 999]) {
      const name = holdBranchName(DAY, `${'word-'.repeat(40)}end`, attempt);
      expect(after(name).length, name).toBeLessThanOrEqual(SLUG_IN_BRANCH);
      expect(isHoldBranch(name), name).toBe(true);
      if (attempt > 1) expect(name.endsWith(`-t${attempt}`)).toBe(true);
    }
    expect(holdBranchName(DAY, `${'a'.repeat(79)}-bbbb`, 2)).toBe(`hold/${DAY}-${'a'.repeat(77)}-t2`);
  });

  it('is a name that the pattern takes, whatever the slug, whatever its length and whichever try', () => {
    const slugs = ['a', 'ab', 'a-b', ...Array.from({ length: 120 }, (_, at) => `${'x'.repeat(at % 17 || 1)}-${'y'.repeat(at % 11 || 1)}-${'z'.repeat(at % 7 || 1)}-${'w'.repeat(at)}`.replace(/-$/, ''))];
    for (const slug of slugs) {
      for (const attempt of [1, 2, 12]) {
        const name = holdBranchName(DAY, slug, attempt);
        expect(isHoldBranch(name), `${slug} ${attempt} ${name}`).toBe(true);
        expect(name.endsWith('-'), name).toBe(false);
      }
    }
  });

  it.each([
    ['a day that is not a day', ['2026-13-45', 'slug'], '"2026-13-45" is not a day'],
    ['a day in words', ['5 Oct 2026', 'slug'], 'is not a day'],
    ['a slug with capitals', [DAY, 'Not Plain'], '"Not Plain" is not a plain slug'],
    ['a slug that goes up', [DAY, '../main'], 'is not a plain slug'],
    ['an empty slug', [DAY, ''], 'is not a plain slug'],
    ['a try below 1', [DAY, 'slug', 0], 'is not a whole number from 1 to 999'],
    ['a try that is not whole', [DAY, 'slug', 1.5], 'is not a whole number from 1 to 999'],
    ['a try above 999', [DAY, 'slug', 1000], 'is not a whole number from 1 to 999'],
  ] as const)('refuses %s', (_what, args, message) => {
    expect(() => holdBranchName(...(args as unknown as Parameters<typeof holdBranchName>))).toThrow(message);
  });
});

describe('one pattern for the name of a branch of a hold', () => {
  // Every name here is asked of every part that holds a name to the pattern: the pattern itself, GhForge (which pushes a branch and opens a pull request on it), FakeForge, GitCli (which
  // makes a branch and removes it) and FakeGit. They have to take exactly the same names. They did not: the pattern of GhForge took a name that ends in a hyphen, and GitCli did not.
  const scratch = useScratch();
  const NAMES: [string, boolean][] = [
    ['hold/2026-10-05-a', true],
    ['hold/2026-10-05-fixture-robotics-second-plant', true],
    ['hold/2026-10-05-fixture-robotics-second-plant-t2', true],
    ['hold/2026-10-05-0', true],
    [`hold/2026-10-05-${'a'.repeat(80)}`, true],
    [`hold/2026-10-05-${'a'.repeat(40)}-${'b'.repeat(39)}`, true],
    [`hold/2026-10-05-${'a'.repeat(81)}`, false],
    [`hold/2026-10-05-${'a'.repeat(79)}-`, false],
    ['hold/2026-10-05-', false],
    ['hold/2026-10-05-a-', false],
    ['hold/2026-10-05--a', false],
    ['hold/2026-10-05-a--b', false],
    ['hold/2026-10-05-UPPER', false],
    ['hold/2026-10-05-a b', false],
    ['hold/2026-10-05-a;b', false],
    ['hold/2026-10-05-a\nb', false],
    ['hold/2026-10-05-a/b', false],
    ['hold/2026-10-05-a/../b', false],
    ['hold/2026-10-05-a.lock', false],
    ['hold/2026-10-05-a_b', false],
    ['hold/26-10-05-slug', false],
    ['hold/2026-10-05', false],
    ['hold/x', false],
    ['main', false],
    ['desk-rescue/2026-10-05-4711-1', false],
    ['refs/heads/hold/2026-10-05-slug', false],
    [' hold/2026-10-05-slug', false],
    ['hold/2026-10-05-slug ', false],
    ['--hold/2026-10-05-slug', false],
    ['-hold/2026-10-05-slug', false],
    ['', false],
  ];

  /** Whether each part takes `name`: it is refused when it says that the name is not one that it makes. */
  async function verdicts(name: string): Promise<Record<string, boolean>> {
    const refused = (error: unknown): boolean => /is not a hold branch|is not a branch name that the Desk makes/.test((error as Error).message);
    const taken = async (action: () => Promise<unknown>): Promise<boolean> => action().then(() => true, (error: unknown) => !refused(error));
    const repo = scratch();
    git(repo, 'init', '--quiet', '-b', 'main');
    return {
      pattern: HOLD_BRANCH.test(name),
      ghForge: await taken(() => new GhForge(scriptedExec({ code: 0 }).exec).pushBranch(name)),
      fakeForge: await taken(() => new FakeForge().pushBranch(name)),
      gitCli: await taken(() => new GitCli(repo, { env: ISOLATED }).deleteBranch(name)),
      fakeGit: await taken(() => new FakeGit().deleteBranch(name)),
    };
  }

  it.each(NAMES)('is %j taken by every part, or by none: %s', async (name, expected) => {
    expect(await verdicts(name)).toEqual({ pattern: expected, ghForge: expected, fakeForge: expected, gitCli: expected, fakeGit: expected });
  });
});
