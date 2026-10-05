import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState as DeskStateSchema, LedgerEntry, NewsFrontmatter as NewsFrontmatterSchema, renderBody } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { firstDifference, matchPieces } from '../src/lib/match-pieces';

const GOLDEN_FILE = new URL('../src/content-fixtures/ledger/fixture-robotics-ships-fx-1-to-second-plant.json', import.meta.url);
const base = LedgerEntry.parse(JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')));

/** A news entry and a ledger entry for one slug, shaped like Astro's collection entries. */
function pair(slug: string, publishedAt: string, change: Partial<LedgerEntry> = {}) {
  // The title sentence and the description sentence of the ledger say what the piece's frontmatter says.
  const sentences = base.sentences.map((item) =>
    item.section === 'title' ? { ...item, text: `Title of ${slug}` } : item.section === 'description' ? { ...item, text: 'A description.' } : item,
  );
  const ledger: LedgerEntry = { ...base, slug, publishedAt, title: `Title of ${slug}`, categories: ['humanoids'], sentences, ...change };
  const data: NewsFrontmatter = {
    title: `Title of ${slug}`,
    description: 'A description.',
    publishedAt,
    categories: ['humanoids'],
    format: 'news',
    featured: false,
    author: { name: 'Robywire Desk' },
  };
  // The body of a piece as Astro hands it over: the text under the frontmatter, without its outer blank lines.
  return { news: { id: slug, data, body: renderBody(ledger).trim() }, ledger: { id: slug, data: ledger } };
}

const matched = (...pairs: ReturnType<typeof pair>[]) => matchPieces(pairs.map((p) => p.news), pairs.map((p) => p.ledger), []);

describe('matchPieces: joining', () => {
  it('returns an empty list when there is no content', () => {
    expect(matchPieces([], [], [])).toEqual([]);
  });

  it('pairs each piece with the ledger entry of the same id', () => {
    const a = pair('a-piece', '2026-10-03');
    const [only] = matched(a);
    expect(only).toEqual({ slug: 'a-piece', news: a.news, ledger: a.ledger });
  });

  it('pairs by id, whatever order the two lists come in', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    const result = matchPieces([a.news, b.news], [b.ledger, a.ledger], []);
    expect(result.map((piece) => [piece.slug, piece.ledger.id])).toEqual([
      ['a-piece', 'a-piece'],
      ['b-piece', 'b-piece'],
    ]);
  });
});

describe('matchPieces: order', () => {
  it('puts the newest piece first', () => {
    const result = matched(pair('old', '2026-10-01'), pair('new', '2026-10-04'), pair('middle', '2026-10-02'));
    expect(result.map((piece) => piece.slug)).toEqual(['new', 'middle', 'old']);
  });

  it('orders pieces of the same day by slug', () => {
    const result = matched(pair('b-piece', '2026-10-04'), pair('a-piece', '2026-10-04'), pair('c-piece', '2026-10-04'));
    expect(result.map((piece) => piece.slug)).toEqual(['a-piece', 'b-piece', 'c-piece']);
  });

  it('does not change the lists it is given', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-04');
    const news = [a.news, b.news];
    matchPieces(news, [a.ledger, b.ledger], []);
    expect(news.map((entry) => entry.id)).toEqual(['a-piece', 'b-piece']);
  });
});

describe('matchPieces: content that does not fit together', () => {
  it('names a piece that has no ledger entry', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([a.news], [], [])).toThrow('the piece "a-piece" has no ledger file');
  });

  it('names a ledger entry that has no piece', () => {
    const a = pair('a-piece', '2026-10-03');
    expect(() => matchPieces([], [a.ledger], [])).toThrow('the ledger entry "a-piece" has no piece');
  });

  it('names a ledger whose slug is not its file name', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { slug: 'other' }))).toThrow('the ledger entry "a-piece" says its slug is "other"');
  });

  it('names a ledger whose date or categories differ from the piece', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { publishedAt: '2026-10-02' }))).toThrow('the date in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { categories: ['humanoids', 'funding'] }))).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
    const longer = pair('a-piece', '2026-10-03');
    longer.news.data.categories = ['humanoids', 'funding'];
    expect(() => matched(longer)).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
  });

  it('reports every problem at once, under one heading', () => {
    const a = pair('a-piece', '2026-10-03');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [b.ledger], [])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has no ledger file\n- the ledger entry "b-piece" has no piece',
    );
  });
});

describe('matchPieces: corrections and the updated date', () => {
  const correction = (at: string, slug: string, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: 'A note.' });
  const withUpdate = (updatedAt: string | undefined) => {
    const a = pair('a-piece', '2026-10-01');
    if (updatedAt !== undefined) a.news.data.updatedAt = updatedAt;
    return a;
  };
  const run = (updatedAt: string | undefined, corrections: DeskState['corrections']) => {
    const a = withUpdate(updatedAt);
    return () => matchPieces([a.news], [a.ledger], corrections);
  };

  it('accepts a piece whose updatedAt is the day of its latest correction', () => {
    expect(run('2026-10-03', [correction('2026-10-03T09:12:00Z', 'a-piece')])()).toHaveLength(1);
  });

  it('accepts a piece with no correction and no updatedAt, and corrections of pieces the site does not have', () => {
    expect(run(undefined, [])()).toHaveLength(1);
    expect(run(undefined, [correction('2026-10-03T09:12:00Z', 'another-piece')])()).toHaveLength(1);
  });

  it('uses the latest of several corrections, a retraction included, whatever their order', () => {
    const corrections = [correction('2026-10-04T10:00:00Z', 'a-piece', 'retraction'), correction('2026-10-03T09:12:00Z', 'a-piece')];
    expect(run('2026-10-04', corrections)()).toHaveLength(1);
    expect(run('2026-10-04', [...corrections].reverse())()).toHaveLength(1);
    expect(run('2026-10-03', corrections)).toThrow('says updatedAt is 2026-10-03, but its latest correction or retraction was recorded on 2026-10-04');
  });

  it('stops the build, saying what to add, when a correction is recorded and the piece has no updatedAt', () => {
    expect(run(undefined, [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter',
    );
  });

  it('stops the build when updatedAt is not the day of the latest correction', () => {
    expect(run('2026-10-02', [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'the piece "a-piece" says updatedAt is 2026-10-02, but its latest correction or retraction was recorded on 2026-10-03',
    );
  });

  it('stops the build when a piece says it was updated and no correction or retraction is recorded for it', () => {
    expect(run('2026-10-03', [])).toThrow('the piece "a-piece" has updatedAt 2026-10-03, but no correction or retraction is recorded for it');
    expect(run('2026-10-03', [correction('2026-10-03T09:12:00Z', 'another-piece')])).toThrow('no correction or retraction is recorded for it');
  });

  it('reads the day of a correction in UTC', () => {
    expect(run('2026-10-03', [correction('2026-10-04T01:30:00+05:30', 'a-piece')])()).toHaveLength(1);
  });

  it('reports this problem together with the others, under the one heading', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news, b.news], [a.ledger], [correction('2026-10-03T09:12:00Z', 'a-piece')])).toThrow(
      'The site content does not fit together:\n- the piece "a-piece" has a correction or retraction recorded on 2026-10-03 but no updatedAt; add updatedAt: "2026-10-03" to its frontmatter\n- the piece "b-piece" has no ledger file',
    );
  });
});

describe('matchPieces: the title and the description of the piece and its ledger', () => {
  const edited = (change: (news: ReturnType<typeof pair>['news'], ledger: ReturnType<typeof pair>['ledger']) => void, ledgerChange: Partial<LedgerEntry> = {}) => {
    const a = pair('a-piece', '2026-10-01', ledgerChange);
    change(a.news, a.ledger);
    return () => matchPieces([a.news], [a.ledger], []);
  };
  /** Sets the text of the sentence of this section in the ledger of the piece. */
  const setSentence = (ledger: ReturnType<typeof pair>['ledger'], section: 'title' | 'description', text: string) => {
    ledger.data = { ...ledger.data, sentences: ledger.data.sentences.map((item) => (item.section === section ? { ...item, text } : item)) };
  };

  it('accepts a piece whose title and description are the title sentence and the description sentence of its ledger, and a ledger whose title is the same', () => {
    expect(edited(() => {})()).toHaveLength(1);
  });

  it('accepts sentences with spaces around them, because the frontmatter is written, and read back, without them', () => {
    const run = edited((_news, ledger) => {
      setSentence(ledger, 'title', '  Title of a-piece ');
      setSentence(ledger, 'description', ' A description.\n');
    });
    expect(run()).toHaveLength(1);
  });

  it('stops the build when the description of the piece was edited by hand, naming the piece and the field', () => {
    const run = edited((news) => {
      news.data.description = 'A better description.';
    });
    expect(run).toThrow(
      'the description of the piece "a-piece" is "A better description.", but the description sentence of its ledger is "A description."',
    );
  });

  it('stops the build when the description sentence of the ledger was edited and the description of the piece was not', () => {
    const run = edited((_news, ledger) => setSentence(ledger, 'description', 'Another description.'));
    expect(run).toThrow(
      'the description of the piece "a-piece" is "A description.", but the description sentence of its ledger is "Another description."',
    );
  });

  it('stops the build when the title of the piece was edited by hand, naming the piece and the field', () => {
    const run = edited((news) => {
      news.data.title = 'A better title';
    });
    expect(run).toThrow('the title of the piece "a-piece" is "A better title", but the title sentence of its ledger is "Title of a-piece"');
  });

  it('stops the build when the title field of the ledger is not its own title sentence, although the piece agrees with the sentence', () => {
    const run = edited(() => {}, { title: 'Another title' });
    expect(run).toThrow('the ledger entry "a-piece" has the title "Another title", but its title sentence is "Title of a-piece"');
    expect(run).not.toThrow('the title of the piece');
  });

  it('stops the build when the title sentence and the title field of the ledger were both edited and the piece was not', () => {
    const run = edited(
      (_news, ledger) => setSentence(ledger, 'title', 'Another title'),
      { title: 'Another title' },
    );
    expect(run).toThrow('the title of the piece "a-piece" is "Title of a-piece", but the title sentence of its ledger is "Another title"');
  });

  it('writes a text with quotation marks as JSON, so the message shows exactly what is there', () => {
    const run = edited((news) => {
      news.data.title = 'He said "go"';
    });
    expect(run).toThrow('the title of the piece "a-piece" is "He said \\"go\\""');
  });

  it('names the piece when its ledger has no title sentence or no description sentence, or two, instead of failing with no name', () => {
    const without = (section: string) =>
      edited((_news, ledger) => {
        ledger.data = { ...ledger.data, sentences: ledger.data.sentences.filter((item) => item.section !== section) };
      });
    expect(without('title')).toThrow('the ledger entry "a-piece" cannot give a title and a description: renderHead: the ledger has no title sentence');
    expect(without('description')).toThrow('the ledger entry "a-piece" cannot give a title and a description: renderHead: the ledger has no description sentence');
    const twice = edited((_news, ledger) => {
      ledger.data = { ...ledger.data, sentences: [...ledger.data.sentences, ledger.data.sentences[0]!] };
    });
    expect(twice).toThrow('the ledger entry "a-piece" cannot give a title and a description: renderHead: the ledger has 2 title sentences, not 1');
  });

  it('reports every problem of the title and the description at once, with the others, under the one heading', () => {
    const a = pair('a-piece', '2026-10-01');
    a.news.data.title = 'A better title';
    a.news.data.description = 'A better description.';
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([a.news], [a.ledger, b.ledger], [])).toThrow(
      'The site content does not fit together:\n' +
        '- the title of the piece "a-piece" is "A better title", but the title sentence of its ledger is "Title of a-piece"\n' +
        '- the description of the piece "a-piece" is "A better description.", but the description sentence of its ledger is "A description."\n' +
        '- the ledger entry "b-piece" has no piece',
    );
  });

  describe('the five fixture pieces, as committed', () => {
    const dir = (name: string) => new URL(`../src/content-fixtures/${name}/`, import.meta.url);
    const slugs = readdirSync(dir('news'))
      .filter((file) => file.endsWith('.mdx'))
      .map((file) => file.slice(0, -'.mdx'.length))
      .sort();
    const news = slugs.map((slug) => {
      const text = readFileSync(new URL(`${slug}.mdx`, dir('news')), 'utf8');
      const [, frontmatter = '', body = ''] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(text) ?? [];
      return { id: slug, data: NewsFrontmatterSchema.parse(parseYaml(frontmatter)), body: body.trim() };
    });
    const ledgers = slugs.map((slug) => ({ id: slug, data: LedgerEntry.parse(JSON.parse(readFileSync(new URL(`${slug}.json`, dir('ledger')), 'utf8'))) }));
    const corrections = DeskStateSchema.parse(JSON.parse(readFileSync(new URL('../src/content-fixtures/desk-state.json', import.meta.url), 'utf8'))).corrections;

    it('are five, each with a title and a description that are the sentences of its ledger', () => {
      expect(slugs).toHaveLength(5);
      expect(matchPieces(news, ledgers, corrections)).toHaveLength(5);
    });

    it.each(slugs.map((slug, at) => [slug, at] as const))('stop the build when the description of %s is edited by hand', (slug, at) => {
      const hand = news.map((piece, index) => (index === at ? { ...piece, data: { ...piece.data, description: `${piece.data.description} Edited.` } } : piece));
      expect(() => matchPieces(hand, ledgers, corrections)).toThrow(`the description of the piece "${slug}" is "`);
    });
  });
});

describe('matchPieces: the body of the piece and its ledger', () => {
  const one = (body: string | undefined) => {
    const a = pair('a-piece', '2026-10-01');
    const news = body === undefined ? { id: a.news.id, data: a.news.data } : { ...a.news, body };
    return () => matchPieces([news], [a.ledger], []);
  };
  const body = pair('a-piece', '2026-10-01').news.body;
  const lines = body.split('\n');

  it('accepts a body that is what the ledger renders, with or without the blank lines around it', () => {
    expect(one(body)()).toHaveLength(1);
    expect(one(`\n\n${body}\n\n`)()).toHaveLength(1);
  });

  it('stops the build when a sentence of the body was edited by hand, naming the piece, the line, the column and both texts', () => {
    const edited = body.replace('now runs 40 of the arms', 'now runs 400 of the arms');
    const column = body.indexOf('now runs 40') + 'now runs 40'.length + 1;
    expect(one(edited)).toThrow(`the body of the piece "a-piece" differs from its ledger at line 1, column ${column}: the file has "...`);
    expect(one(edited)).toThrow('now runs 400 of the arms');
    expect(one(edited)).toThrow('but the ledger gives "...');
    expect(one(edited)).toThrow('now runs 40 of the arms');
  });

  it('names the first line that differs, counting from the first line of the body', () => {
    const changed = [...lines];
    changed[2] = 'A line that nobody generated.';
    expect(one(changed.join('\n'))).toThrow('differs from its ledger at line 3, column 1: the file has "A line that nobody generated." but the ledger gives "');
  });

  it('stops the build when the body ends early, or goes on after the end of the ledger', () => {
    expect(one(lines.slice(0, 5).join('\n'))).toThrow('at line 6: the file ends before this line, where the ledger gives "- The datasheet lists');
    expect(one(`${body}\nAn extra paragraph.`)).toThrow(`at line ${lines.length + 1}: the file has "An extra paragraph." where the ledger has nothing`);
  });

  it('stops the build when the ledger was edited and the body was not', () => {
    const a = pair('a-piece', '2026-10-01');
    a.ledger.data.sentences = a.ledger.data.sentences.map((sentence) => (sentence.text === 'It lists 7 investors in the round.' ? { ...sentence, text: 'It lists 8 investors in the round.' } : sentence));
    expect(() => matchPieces([a.news], [a.ledger], [])).toThrow('differs from its ledger');
  });

  it('names the piece when its ledger cannot be written as a body at all, instead of failing with no name', () => {
    const a = pair('a-piece', '2026-10-01');
    a.ledger.data = { ...a.ledger.data, order: a.ledger.data.order.filter((id) => id !== 'c-19') };
    expect(() => matchPieces([a.news], [a.ledger], [])).toThrow(
      'the ledger entry "a-piece" cannot be written as a body: renderBody: a sentence cites c-19, but the order of the ledger does not list it',
    );
    const b = pair('b-piece', '2026-10-02');
    const copy = structuredClone(b.ledger.data);
    delete copy.sentences.find((sentence) => sentence.section === 'body')!.heading;
    b.ledger.data = copy;
    expect(() => matchPieces([b.news], [b.ledger], [])).toThrow('the ledger entry "b-piece" cannot be written as a body: renderBody: the body sentence');
  });

  it('treats a piece with no body text as a body that ends before its first line', () => {
    expect(one(undefined)).toThrow('differs from its ledger at line 1, column 1: the file has "" but the ledger gives "Fixture Robotics has begun');
  });

  it('reports this problem together with the others, under the one heading', () => {
    const a = pair('a-piece', '2026-10-01');
    const b = pair('b-piece', '2026-10-02');
    expect(() => matchPieces([{ ...a.news, body: 'Changed.' }, b.news], [a.ledger], [])).toThrow(
      /^The site content does not fit together:\n- the body of the piece "a-piece" differs from its ledger at line 1, column 1: [^\n]*\n- the piece "b-piece" has no ledger file$/,
    );
  });
});

describe('firstDifference', () => {
  it('is undefined for equal texts', () => {
    expect(firstDifference('a\nb', 'a\nb')).toBeUndefined();
  });

  it('names the first line and column that differ, from 1, with both lines', () => {
    expect(firstDifference('a\nx\nc', 'a\nb\nc')).toBe('line 2, column 1: the file has "x" but the ledger gives "b"');
    expect(firstDifference('ax', 'ab')).toBe('line 1, column 2: the file has "ax" but the ledger gives "ab"');
  });

  it('says so when the file ends first or goes on', () => {
    expect(firstDifference('a', 'a\nb')).toBe('line 2: the file ends before this line, where the ledger gives "b"');
    expect(firstDifference('a\nb', 'a')).toBe('line 2: the file has "b" where the ledger has nothing');
  });

  it('treats a line that is the start of the other as differing where the shorter one ends', () => {
    expect(firstDifference('abc', 'abcd')).toBe('line 1, column 4: the file has "abc" but the ledger gives "abcd"');
  });

  it('shows the stretch around the difference when the line is long: 30 characters before it and up to 70 in all, with ... where it is cut', () => {
    const before = 'a'.repeat(100);
    const after = 'b'.repeat(100);
    const message = firstDifference(`${before}X${after}`, `${before}Y${after}`)!;
    const shown = (mark: string) => `...${'a'.repeat(30)}${mark}${'b'.repeat(39)}...`;
    expect(message).toBe(`line 1, column 101: the file has "${shown('X')}" but the ledger gives "${shown('Y')}"`);
  });

  it('puts ... before the stretch only when the line is cut at its start: the 31st character still shows the whole line, the 32nd does not', () => {
    const thirty = 'a'.repeat(30);
    expect(firstDifference(`${thirty}X`, `${thirty}Y`)).toBe(`line 1, column 31: the file has "${thirty}X" but the ledger gives "${thirty}Y"`);
    expect(firstDifference(`a${thirty}X`, `a${thirty}Y`)).toBe(`line 1, column 32: the file has "...${thirty}X" but the ledger gives "...${thirty}Y"`);
  });

  it('starts at the beginning of the line when the difference is near it, and ends without ... when the line ends in the window', () => {
    expect(firstDifference(`${'a'.repeat(20)}X${'b'.repeat(10)}`, `${'a'.repeat(20)}Y${'b'.repeat(10)}`)).toBe(
      `line 1, column 21: the file has "${'a'.repeat(20)}X${'b'.repeat(10)}" but the ledger gives "${'a'.repeat(20)}Y${'b'.repeat(10)}"`,
    );
    expect(firstDifference('x'.repeat(70), 'y'.repeat(70))).toBe(`line 1, column 1: the file has "${'x'.repeat(70)}" but the ledger gives "${'y'.repeat(70)}"`);
    expect(firstDifference('x'.repeat(71), 'y')).toBe(`line 1, column 1: the file has "${'x'.repeat(70)}..." but the ledger gives "y"`);
  });
});
