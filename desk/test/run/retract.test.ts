import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchPieces } from '../../../site/src/lib/match-pieces';
import { readDeskState } from '../../src/run/desk-state';
import { MAX_REASON_LENGTH, RetractRefused, normaliseReason, retractPiece, setUpdatedAt } from '../../src/run/retract';
import type { RetractOptions } from '../../src/run/retract';
import { sitePaths } from '../../src/run/target';
import { useScratch } from '../support/context';
import { PUBLISHED_ON, PUBLISHED_SLUG, publishedPiece, publishedSite } from '../support/published';
import { readPieces } from '../support/pieces';
import { branchesIn, changesIn, git, subjectsOf } from '../support/repo';

// A piece that was published can be wrong, and the Desk never takes it away: `desk retract` records a correction or a retraction in the desk state, sets `updatedAt` in the
// piece to the day of the record, and commits both. The site refuses to build a piece whose `updatedAt` is not the day of its latest correction, so the tests hand what a
// retraction leaves to `matchPieces`, the function of the site that says so. These run in a real git repository that has the golden piece published in it.

const scratch = useScratch();
const paths = sitePaths();
const STATE = paths.stateFile;
const NEWS = paths.newsFile(PUBLISHED_SLUG);
const LEDGER = paths.ledgerFile(PUBLISHED_SLUG);
const REASON = 'The payload in the second paragraph is 38 kg, not 83 kg.';
const THE_DAY = '2026-10-06';
const at = (iso: string) => () => new Date(iso);

/** A checkout with the golden piece published in it, and `retract` that corrects it at 09:30 on the day after, with the options replaced where a test says so. */
function setup() {
  const site = publishedSite(scratch);
  const retract = (overrides: Partial<RetractOptions> = {}) =>
    retractPiece({ repoDir: site.repoDir, git: site.cli, slug: PUBLISHED_SLUG, reason: REASON, kind: 'correction', now: at(`${THE_DAY}T09:30:00.000Z`), ...overrides });
  return { ...site, retract };
}

const read = (repoDir: string, file: string): string => readFileSync(path.join(repoDir, file), 'utf8');

/** What the site says of the pieces of the checkout and the corrections in its desk state: `matchPieces` throws a message that lists what does not fit together. */
async function siteAccepts(repoDir: string) {
  const { news, ledgers } = readPieces(repoDir);
  return matchPieces(news, ledgers, (await readDeskState(path.join(repoDir, STATE))).corrections);
}

/** Everything that says nothing was changed: the files of the piece and the state, the history, what git sees. */
function snapshot(repoDir: string) {
  return { news: read(repoDir, NEWS), ledger: read(repoDir, LEDGER), state: read(repoDir, STATE), subjects: subjectsOf(repoDir), changes: changesIn(repoDir), staged: git(repoDir, 'diff', '--cached', '--name-only'), branches: branchesIn(repoDir) };
}

describe('normaliseReason', () => {
  it('trims the reason and makes every run of white space one space, so that a note is one line', () => {
    expect(normaliseReason('  The payload\nwas  38 kg,\r\n\tnot 83 kg.  ')).toEqual({ ok: true, reason: 'The payload was 38 kg, not 83 kg.' });
  });

  it('takes a reason of 500 characters and no more', () => {
    expect(normaliseReason('x'.repeat(MAX_REASON_LENGTH))).toEqual({ ok: true, reason: 'x'.repeat(MAX_REASON_LENGTH) });
    expect(MAX_REASON_LENGTH).toBe(500);
    expect(normaliseReason('x'.repeat(501))).toEqual({ ok: false, message: 'the reason is 501 characters, and at most 500 are recorded: say it shorter' });
    // The length is that of the reason as it is recorded: white space that is cut does not count.
    expect(normaliseReason(`${' '.repeat(100)}${'x'.repeat(500)}\n\n`).ok).toBe(true);
  });

  it('refuses a reason that says nothing', () => {
    for (const reason of ['', '   ', '\n\t\r\n']) expect(normaliseReason(reason)).toEqual({ ok: false, message: 'the reason is empty: say why the piece is corrected or retracted' });
  });

  it('refuses a control character, which is not white space and is not text', () => {
    for (const code of [0, 7, 27, 127, 0x85]) expect(normaliseReason(`a${String.fromCharCode(code)}b`), String(code)).toEqual({ ok: false, message: 'the reason has a control character in it' });
  });

  it('does not change what else is in the reason: quotes, hyphens, markup and mentions are text', () => {
    const text = '"} --- updatedAt: "2099-01-01" $(id) `x` </script> @everyone #1 [a](http://evil.example) \\ %s';
    expect(normaliseReason(text)).toEqual({ ok: true, reason: text });
  });
});

describe('setUpdatedAt', () => {
  const piece = publishedPiece().mdx;

  it('makes the file that the renderer writes for a piece that was corrected on that day: updatedAt is after publishedAt, in the same form', () => {
    expect(setUpdatedAt(piece, THE_DAY)).toBe(publishedPiece(THE_DAY).mdx);
    expect(setUpdatedAt(piece, THE_DAY)).toContain(`publishedAt: "${PUBLISHED_ON}"\nupdatedAt: "${THE_DAY}"\ncategories:`);
  });

  it('changes nothing but that one line: every other line of the file is the same, and so is the body, byte for byte', () => {
    const before = piece.split('\n');
    const after = setUpdatedAt(piece, THE_DAY).split('\n');
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((line) => !before.includes(line))).toEqual([`updatedAt: "${THE_DAY}"`]);
    expect(after.filter((line) => line !== `updatedAt: "${THE_DAY}"`)).toEqual(before);
  });

  it('replaces the updatedAt that is there, in any plain form of a date, and keeps one', () => {
    for (const written of ['updatedAt: "2026-10-05"', "updatedAt: '2026-10-05'", 'updatedAt: 2026-10-05', 'updatedAt: "2026-10-05"  ']) {
      const text = piece.replace(`publishedAt: "${PUBLISHED_ON}"`, `publishedAt: "${PUBLISHED_ON}"\n${written}`);
      expect(setUpdatedAt(text, THE_DAY), written).toBe(publishedPiece(THE_DAY).mdx);
    }
  });

  it('gives the same file when it is done twice for the same day', () => {
    const once = setUpdatedAt(piece, THE_DAY);
    expect(setUpdatedAt(once, THE_DAY)).toBe(once);
  });

  it('leaves a line of the body alone that looks like a key: only the frontmatter is read', () => {
    const text = `${piece}\nupdatedAt: "1999-01-01"\n---\npublishedAt: x\n`;
    const after = setUpdatedAt(text, THE_DAY);
    expect(after.endsWith('\nupdatedAt: "1999-01-01"\n---\npublishedAt: x\n')).toBe(true);
    expect(after.split('\n').filter((line) => line === `updatedAt: "${THE_DAY}"`)).toHaveLength(1);
  });

  it('finds the key on the first line of the frontmatter, and a frontmatter that has nothing in it has no publishedAt to go after', () => {
    const first = piece.replace(`publishedAt: "${PUBLISHED_ON}"\n`, '').replace('---\n', `---\npublishedAt: "${PUBLISHED_ON}"\n`);
    expect(first.split('\n')[1]).toBe(`publishedAt: "${PUBLISHED_ON}"`);
    expect(setUpdatedAt(first, THE_DAY).split('\n').slice(1, 3)).toEqual([`publishedAt: "${PUBLISHED_ON}"`, `updatedAt: "${THE_DAY}"`]);
    expect(() => setUpdatedAt('---\n---\nThe body.\n', THE_DAY)).toThrow('does not have exactly one publishedAt');
  });

  it('shows the line that it refuses whole when it is 60 characters or less, and cut after 60 with three dots when it is longer', () => {
    const line = (length: number): string => `updatedAt: |${'x'.repeat(length - 'updatedAt: |'.length)}`;
    const with_ = (text: string): string => piece.replace('categories:', `${text}\ncategories:`);
    expect(() => setUpdatedAt(with_(line(60)), THE_DAY)).toThrow(`(${JSON.stringify(line(60))})`);
    expect(() => setUpdatedAt(with_(line(61)), THE_DAY)).toThrow(`(${JSON.stringify(`${line(61).slice(0, 60)}...`)})`);
  });

  it.each([
    ['carriage returns', (text: string) => text.replace(/\n/g, '\r\n'), 'carriage returns'],
    ['no frontmatter', (text: string) => text.replace(/^---\n/, ''), 'does not start with a block of frontmatter'],
    ['a frontmatter that is not closed', (text: string) => text.replace(/\n---\n/, '\n'), 'never closed'],
    ['updatedAt twice', (text: string) => text.replace('categories:', 'updatedAt: "2026-10-05"\nupdatedAt: "2026-10-05"\ncategories:'), 'has updatedAt twice'],
    ['an updatedAt that is not a plain date', (text: string) => text.replace('categories:', 'updatedAt: |\n  2026-10-05\ncategories:'), 'is not a plain date on one line'],
    ['an updatedAt with a comment', (text: string) => text.replace('categories:', 'updatedAt: "2026-10-05" # corrected\ncategories:'), 'is not a plain date on one line'],
    ['no publishedAt', (text: string) => text.replace(/publishedAt: .*\n/, ''), 'does not have exactly one publishedAt'],
    ['publishedAt twice', (text: string) => text.replace('categories:', `publishedAt: "${PUBLISHED_ON}"\ncategories:`), 'does not have exactly one publishedAt'],
  ])('refuses a piece with %s', (_what, change, message) => {
    expect(() => setUpdatedAt(change(piece), THE_DAY)).toThrow(RetractRefused);
    expect(() => setUpdatedAt(change(piece), THE_DAY)).toThrow(message);
  });
});

describe('retractPiece: a correction', () => {
  it('records it in the desk state, sets updatedAt in the piece to the day of the record, and commits the two files in one commit', async () => {
    const { repoDir, retract, piece } = setup();
    const result = await retract();
    expect(result).toEqual({ slug: PUBLISHED_SLUG, kind: 'correction', at: `${THE_DAY}T09:30:00.000Z`, updatedAt: THE_DAY, pieceChanged: true, files: [NEWS, STATE], commit: git(repoDir, 'rev-parse', 'HEAD'), dry: false });
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, LEDGER)).toBe(piece.ledger);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toEqual([{ at: `${THE_DAY}T09:30:00.000Z`, slug: PUBLISHED_SLUG, kind: 'correction', note: REASON }]);
    expect(subjectsOf(repoDir)).toEqual([`desk: correct ${PUBLISHED_SLUG}`, 'start']);
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main').split('\n')).toEqual([NEWS, STATE]);
    expect(git(repoDir, 'log', '-1', '--format=%B')).toBe(`desk: correct ${PUBLISHED_SLUG}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
    expect(changesIn(repoDir)).toEqual([]);
  });

  it('leaves a piece that the site still builds: the piece says updatedAt, the desk state says why, and the two agree', async () => {
    const { repoDir, retract } = setup();
    await retract();
    expect((await siteAccepts(repoDir)).map((piece) => piece.slug)).toEqual([PUBLISHED_SLUG]);
  });

  it('is not enough to do one of the two: the site refuses a piece with updatedAt and no record, and a record and no updatedAt', async () => {
    const { repoDir, retract } = setup();
    await retract();
    const { news, ledgers } = readPieces(repoDir);
    expect(() => matchPieces(news, ledgers, [])).toThrow(`has updatedAt ${THE_DAY}, but no correction or retraction is recorded for it`);
    const state = await readDeskState(path.join(repoDir, STATE));
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx);
    const plain = readPieces(repoDir);
    expect(() => matchPieces(plain.news, plain.ledgers, state.corrections)).toThrow(`has a correction or retraction recorded on ${THE_DAY} but no updatedAt`);
  });

  it('makes a retraction in the same way, with the other word in the commit and the kind in the record', async () => {
    const { repoDir, retract } = setup();
    const result = await retract({ kind: 'retraction' });
    expect(result.kind).toBe('retraction');
    expect(subjectsOf(repoDir)).toEqual([`desk: retract ${PUBLISHED_SLUG}`, 'start']);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections[0]?.kind).toBe('retraction');
    await siteAccepts(repoDir);
  });

  it('records the reason as it is normalised: one line, with the white space of the ends cut', async () => {
    const { repoDir, retract } = setup();
    await retract({ reason: '  The payload\nwas 38 kg,\n\nnot 83 kg.  ' });
    expect((await readDeskState(path.join(repoDir, STATE))).corrections[0]?.note).toBe('The payload was 38 kg, not 83 kg.');
  });

  it('takes the day from the clock in UTC, whatever the offset that the clock is written in and whatever the time zone of the machine', async () => {
    const dayOf = async (moment: string): Promise<string> => {
      const { repoDir, retract } = setup();
      const result = await retract({ now: at(moment) });
      expect(readFileSync(path.join(repoDir, NEWS), 'utf8')).toContain(`\nupdatedAt: "${result.updatedAt}"\n`);
      return result.updatedAt;
    };
    expect(await dayOf('2026-10-06T23:59:59.999Z')).toBe('2026-10-06');
    expect(await dayOf('2026-10-07T00:00:00.000Z')).toBe('2026-10-07');
    expect(await dayOf('2026-10-07T01:30:00+02:00')).toBe('2026-10-06');
    expect(await dayOf(`${PUBLISHED_ON}T00:00:00.000Z`)).toBe(PUBLISHED_ON);
  });

  it('keeps every record that was there, in order, and adds this one after them', async () => {
    const { repoDir, cli, retract } = setup();
    const earlier = { lastRun: { at: '2026-10-05T04:31:00.000Z', outcome: 'held', runId: '2026-10-05-043100', slug: 'a-held-piece' }, holds: [{ at: '2026-10-05T04:31:00.000Z', categories: ['humanoids'], reasons: ['TIER2_ATTRIBUTION'], prUrl: 'https://github.example/agentic-media-house/pull/3' }], corrections: [{ at: '2026-10-05T12:00:00.000Z', slug: 'another-piece', kind: 'correction', note: 'A date.' }] };
    writeFileSync(path.join(repoDir, STATE), `${JSON.stringify(earlier, null, 2)}\n`);
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'the desk state before');
    expect(await cli.isClean([STATE])).toBe(true);
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.lastRun).toEqual(earlier.lastRun);
    expect(state.holds).toEqual(earlier.holds);
    expect(state.corrections).toEqual([...earlier.corrections, { at: '2026-10-06T09:30:00.000Z', slug: PUBLISHED_SLUG, kind: 'correction', note: REASON }]);
  });
});

describe('retractPiece: a piece that is corrected again', () => {
  it('replaces updatedAt on a later day, and keeps one of it, which is the day of the latest record', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const second = await retract({ now: at('2026-10-08T10:00:00.000Z'), kind: 'retraction', reason: 'Withdrawn: the source was retracted.' });
    expect(second.pieceChanged).toBe(true);
    const text = read(repoDir, NEWS);
    expect(text).toBe(publishedPiece('2026-10-08').mdx);
    expect(text.split('\n').filter((line) => line.startsWith('updatedAt:'))).toEqual(['updatedAt: "2026-10-08"']);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections.map((entry) => [entry.at, entry.kind])).toEqual([
      ['2026-10-06T09:30:00.000Z', 'correction'],
      ['2026-10-08T10:00:00.000Z', 'retraction'],
    ]);
    expect(subjectsOf(repoDir)).toEqual([`desk: retract ${PUBLISHED_SLUG}`, `desk: correct ${PUBLISHED_SLUG}`, 'start']);
    await siteAccepts(repoDir);
  });

  it('on the same day writes the piece once: the second record changes the desk state alone, and there is still one updatedAt', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const second = await retract({ now: at('2026-10-06T17:45:00.000Z'), reason: 'A second error, in the date.' });
    expect(second).toMatchObject({ pieceChanged: false, files: [STATE], updatedAt: THE_DAY });
    expect(git(repoDir, 'diff', '--name-only', 'main~1', 'main')).toBe(STATE);
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, NEWS).split('\n').filter((line) => line.startsWith('updatedAt:'))).toHaveLength(1);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections.map((entry) => entry.note)).toEqual([REASON, 'A second error, in the date.']);
    await siteAccepts(repoDir);
  });

  it('takes a second record at the very moment of the first: the clock is not behind', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    await expect(retract({ now: at('2026-10-06T09:30:00.000Z'), reason: 'A second note.' })).resolves.toMatchObject({ pieceChanged: false });
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toHaveLength(2);
  });

  it('keeps the day of the latest record, whichever order the clock puts them in: a record earlier than one that is there is refused', async () => {
    const { repoDir, retract } = setup();
    await retract({ now: at('2026-10-06T09:30:00.000Z') });
    const before = snapshot(repoDir);
    await expect(retract({ now: at('2026-10-06T09:29:59.999Z') })).rejects.toThrow('the desk state already has a record for');
    await expect(retract({ now: at('2026-10-05T09:30:00.000Z') })).rejects.toThrow('the clock of this machine is behind');
    expect(snapshot(repoDir)).toEqual(before);
  });
});

describe('retractPiece: a dry run', () => {
  it('goes through the checks and says what it would do, and writes and commits nothing', async () => {
    const { repoDir, retract } = setup();
    const before = snapshot(repoDir);
    const result = await retract({ dry: true });
    expect(result).toEqual({ slug: PUBLISHED_SLUG, kind: 'correction', at: `${THE_DAY}T09:30:00.000Z`, updatedAt: THE_DAY, pieceChanged: true, files: [NEWS, STATE], commit: null, dry: true });
    expect(snapshot(repoDir)).toEqual(before);
  });

  it('refuses what a real run refuses before it writes, so that a dry run is a real answer', async () => {
    const { repoDir, retract } = setup();
    await expect(retract({ dry: true, slug: 'no-such-piece' })).rejects.toThrow('there is no piece "no-such-piece"');
    await expect(retract({ dry: true, reason: '' })).rejects.toThrow('the reason is empty');
    await expect(retract({ dry: true, now: at('2026-10-03T00:00:00.000Z') })).rejects.toThrow('before the day the piece was published');
    expect(snapshot(repoDir).subjects).toEqual(['start']);
  });
});

describe('retractPiece: what it refuses, with nothing written', () => {
  it.each([
    ['a slug that is not a plain slug', { slug: '../outside' }, 'is not a plain slug'],
    ['a slug with capitals', { slug: 'Some-Piece' }, 'is not a plain slug'],
    ['a kind that is not a kind', { kind: 'deletion' as never }, 'correction or retraction'],
    ['a reason that says nothing', { reason: ' \n ' }, 'the reason is empty'],
    ['a reason of 501 characters', { reason: 'x'.repeat(501) }, 'the reason is 501 characters'],
    ['a reason with a control character', { reason: `a${String.fromCharCode(7)}b` }, 'control character'],
    ['a piece that is not on the site', { slug: 'a-held-piece' }, 'there is no piece "a-held-piece" in site/src/content/news. A piece that was held is on its pull request'],
    ['a clock that is before the day the piece was published', { now: at('2026-10-03T23:59:59.999Z') }, `the day of the record (2026-10-03) is before the day the piece was published (${PUBLISHED_ON})`],
  ] as [string, Partial<RetractOptions>, string][])('refuses %s', async (_what, options, message) => {
    const { repoDir, retract } = setup();
    const before = snapshot(repoDir);
    const error = await retract(options).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetractRefused);
    expect((error as Error).message).toContain(message);
    expect(snapshot(repoDir)).toEqual(before);
  });

  it('refuses a piece that has no ledger', async () => {
    const { repoDir, retract } = setup();
    rmSync(path.join(repoDir, LEDGER));
    await expect(retract()).rejects.toThrow(`the piece "${PUBLISHED_SLUG}" has no ledger`);
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
  });

  it('refuses when the piece or the desk state has a change that is not committed, because the commit would carry it', async () => {
    for (const file of [NEWS, STATE]) {
      const { repoDir, retract } = setup();
      writeFileSync(path.join(repoDir, file), `${read(repoDir, file)}\n`);
      const before = snapshot(repoDir);
      await expect(retract(), file).rejects.toThrow('have changes that are not committed');
      expect(snapshot(repoDir)).toEqual(before);
    }
  });

  it('refuses a desk state that cannot be read, and one that has a field it does not know, and does not touch it', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, STATE), '{"lastRun": ');
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'broken');
    await expect(retract()).rejects.toThrow('is not valid JSON');
    writeFileSync(path.join(repoDir, STATE), '{"lastRun":null,"holds":[],"corrections":[],"extra":1}\n');
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'extra');
    await expect(retract()).rejects.toThrow('has fields that the desk state does not define');
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
  });

  it('refuses a piece whose frontmatter the Desk cannot edit with care, and says why', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx.replace('categories:', 'updatedAt: |\n  2026-10-05\ncategories:'));
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'edited by hand');
    await expect(retract()).rejects.toThrow(RetractRefused);
  });

  it('refuses a piece that the site would not accept as it is, instead of making it worse', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, NEWS), publishedPiece().mdx.replace('format: news', 'format: blog'));
    git(repoDir, 'commit', '--quiet', '-a', '-m', 'edited by hand');
    await expect(retract()).rejects.toThrow('is not one that the site accepts');
  });
});

describe('retractPiece: a reason that was written to do harm', () => {
  const HOSTILE = [
    '"} ---\nupdatedAt: "2099-01-01"\n--- injected: true',
    '$(touch /tmp/pwned) `touch /tmp/pwned` ; rm -rf / && echo pwned',
    '</script><script>alert(1)</script> <img src=x onerror=alert(1)> <!-- ',
    '@everyone #1 [click](http://evil.example/login) ![x](http://evil.example/p.png)',
    '\\" \\\\ \\u0000 %s %n {{ x }} ${HOME}',
    `line one${String.fromCharCode(0x2028)}line two`,
  ];

  it.each(HOSTILE)('goes into the desk state as data and nowhere else: %j', async (hostile) => {
    const { repoDir, retract, piece } = setup();
    await retract({ reason: hostile });
    const note = normaliseReason(hostile);
    expect(note.ok).toBe(true);
    const state = await readDeskState(path.join(repoDir, STATE));
    expect(state.corrections).toEqual([{ at: `${THE_DAY}T09:30:00.000Z`, slug: PUBLISHED_SLUG, kind: 'correction', note: note.ok ? note.reason : '' }]);
    // Not in the piece: the file is what the renderer writes for a piece that was corrected that day. Not in the ledger. Not in the message of the commit.
    expect(read(repoDir, NEWS)).toBe(publishedPiece(THE_DAY).mdx);
    expect(read(repoDir, LEDGER)).toBe(piece.ledger);
    expect(git(repoDir, 'log', '-1', '--format=%B')).toBe(`desk: correct ${PUBLISHED_SLUG}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
    expect(changesIn(repoDir)).toEqual([]);
    await siteAccepts(repoDir);
  });

  it('is still one correction of one piece, with one updatedAt, whatever the reason says it is', async () => {
    const { repoDir, retract } = setup();
    await retract({ reason: HOSTILE[0] as string });
    expect(read(repoDir, NEWS).split('\n').filter((line) => line.startsWith('updatedAt:'))).toEqual([`updatedAt: "${THE_DAY}"`]);
    expect((await readDeskState(path.join(repoDir, STATE))).corrections).toHaveLength(1);
  });
});

describe('retractPiece: when git cannot commit', () => {
  it('puts both files back, and leaves nothing staged, when the commit fails', async () => {
    const { repoDir, retract } = setup();
    const hook = path.join(repoDir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const before = snapshot(repoDir);
    await expect(retract()).rejects.toThrow('git commit failed');
    expect(snapshot(repoDir)).toEqual(before);
    expect(before.changes).toEqual([]);
    rmSync(hook);
    await expect(retract()).resolves.toMatchObject({ pieceChanged: true });
  });

  it('refuses, and puts both files back, when something that is not the Desk\'s is staged', async () => {
    const { repoDir, retract } = setup();
    writeFileSync(path.join(repoDir, 'notes.txt'), 'mine\n');
    git(repoDir, 'add', 'notes.txt');
    await expect(retract()).rejects.toThrow('already has changes staged');
    expect(read(repoDir, NEWS)).toBe(publishedPiece().mdx);
    expect(read(repoDir, STATE)).toBe('{"lastRun":null,"holds":[],"corrections":[]}\n');
    expect(git(repoDir, 'diff', '--cached', '--name-only')).toBe('notes.txt');
  });
});
