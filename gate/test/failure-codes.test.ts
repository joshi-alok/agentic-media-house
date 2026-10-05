import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FAILURE_CODES, G1_CODES, G2_CODES, G3_CODES, G4_CODES, G5_CODES, G6_CODES, G7_CODES, G8_CODES, G9_CODES } from '../src/checks';

// Every failure a check can report has a code, and the codes of one check are
// listed once, in that check's own file. ALL_FAILURE_CODES is the sum of the
// lists. The seeded-defect evals read it to prove that every code is caught,
// so a code that is missing here would silently escape the proof.
const LISTS: Record<string, readonly string[]> = {
  G1: G1_CODES,
  G2: G2_CODES,
  G3: G3_CODES,
  G4: G4_CODES,
  G5: G5_CODES,
  G6: G6_CODES,
  G7: G7_CODES,
  G8: G8_CODES,
  G9: G9_CODES,
};

const CHECKS_DIR = new URL('../src/checks/', import.meta.url);
const checkFiles = readdirSync(CHECKS_DIR).filter((file) => /^g\d-.*\.ts$/.test(file));

/** The code literals ('G4_NAME_UNSUPPORTED') that a source text contains, with how often each appears. */
function literalsIn(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of source.matchAll(/'(G\d_[A-Z0-9_]+)'/g)) {
    const code = match[1]!;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

describe('ALL_FAILURE_CODES', () => {
  it('lists the codes of every registered check, in order', () => {
    expect(ALL_FAILURE_CODES).toEqual(Object.values(LISTS).flat());
  });

  it('lists no code twice', () => {
    expect(new Set(ALL_FAILURE_CODES).size).toBe(ALL_FAILURE_CODES.length);
  });

  it.each(Object.entries(LISTS))('has only codes that start with the id of %s', (id, codes) => {
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(code).toMatch(new RegExp(`^${id}_[A-Z0-9_]+$`));
    }
  });
});

describe('the check source files', () => {
  it('has one file for each check that has a list, and no other', () => {
    expect(checkFiles.map((file) => `G${file[1]}`)).toEqual(Object.keys(LISTS));
  });

  it.each(checkFiles)('%s reports exactly the codes in its list, and reports each of them', (file) => {
    const id = `G${file[1]}`;
    const found = literalsIn(readFileSync(new URL(file, CHECKS_DIR), 'utf8'));
    // A code appears once in the list and at least once more where it is reported.
    expect([...found.keys()].sort()).toEqual([...LISTS[id]!].sort());
    for (const [code, count] of found) {
      expect(count, `${code} is listed but never reported`).toBeGreaterThanOrEqual(2);
    }
  });
});
