import { describe, expect, it } from 'vitest';
import { formatReport } from '../scripts/audit/report.mjs';

const INFO = { dir: 'site/dist', pages: 22, files: 31, prod: false };
const pass = (id: string, title: string) => ({ id, title, ok: true, problems: [] as string[] });
const fail = (id: string, title: string, ...problems: string[]) => ({ id, title, ok: false, problems });

describe('formatReport', () => {
  it('lists each check with ok or FAIL, and says that the audit passed', () => {
    expect(formatReport([pass('A1', 'Pages parse'), pass('A2', 'One h1')], INFO)).toBe(
      ['Audit of site/dist: 22 pages, 31 files', '  ok    A1  Pages parse', '  ok    A2  One h1', '', 'Passed: 2 checks.'].join('\n'),
    );
  });

  it('groups the problems under the check they belong to', () => {
    const results = [pass('A1', 'Pages parse'), fail('A4', 'No images', 'index.html: has an <img> element', 'a/index.html: has an <img> element'), pass('A10', 'Skip link')];
    expect(formatReport(results, INFO)).toBe(
      [
        'Audit of site/dist: 22 pages, 31 files',
        '  ok    A1   Pages parse',
        '  FAIL  A4   No images',
        '             - index.html: has an <img> element',
        '             - a/index.html: has an <img> element',
        '  ok    A10  Skip link',
        '',
        'FAILED: 2 problems in 1 of 3 checks.',
      ].join('\n'),
    );
  });

  it('says "1 problem" for one problem', () => {
    expect(formatReport([fail('A2', 'One h1', 'index.html: has 0 <h1> elements')], INFO)).toContain('FAILED: 1 problem in 1 of 1 checks.');
  });

  it('says when it is a production build', () => {
    expect(formatReport([pass('A1', 'Pages parse')], { ...INFO, prod: true }).split('\n')[0]).toBe('Audit of site/dist: 22 pages, 31 files (production build)');
  });

  it('shows the first 25 problems of a check and counts the rest', () => {
    const problems = Array.from({ length: 30 }, (_, index) => `file-${index}.html: bad`);
    const lines = formatReport([fail('A8', 'Links', ...problems)], INFO).split('\n');
    expect(lines.filter((line) => line.includes('- file-'))).toHaveLength(25);
    expect(lines).toContain('            ... and 5 more');
    expect(lines.at(-1)).toBe('FAILED: 30 problems in 1 of 1 checks.');
  });

  it('shows all 25 when there are exactly 25', () => {
    const problems = Array.from({ length: 25 }, (_, index) => `file-${index}.html: bad`);
    expect(formatReport([fail('A8', 'Links', ...problems)], INFO)).not.toContain('more');
  });
});
