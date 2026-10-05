import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { TITLE_STOP_WORDS, checkG9, titleTokens } from '../src/checks/g9-hygiene';
import { DEFAULT_BANNED_PHRASES, defaultConfig, defaultContext } from '../src/config';
import type { RecentTitle } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { jaccard } from '../src/text';
import { findSentence, mutate } from './helpers';

const run = (change: (copy: GateInput) => void, overrides?: ContextOverrides): CheckOutput =>
  checkG9(mutate(cloneGolden(), change), defaultContext(overrides));
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);
const GOLDEN_TITLE = 'Fixture Robotics ships its FX-1 warehouse arm to a second plant';
const GOLDEN_SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';

// The golden piece is dated 2026-10-04. These recent titles are two days older, well inside the window.
const RECENT_DATE = '2026-10-02';
const recent = (title: string, publishedAt = RECENT_DATE): RecentTitle => ({ title, publishedAt });
const recents = (...titles: string[]): RecentTitle[] => titles.map((title) => recent(title));

describe('G9: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG9(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('passes when other pieces are published and recent, as long as they are different', () => {
    const ctx = defaultContext({
      publishedSlugs: ['northgate-unveils-atlas-9', `${GOLDEN_SLUG}-2025`],
      recentTitles: recents('Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', 'Standards body publishes new safety rules for warehouse robots'),
    });
    expect(checkG9(cloneGolden(), ctx)).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the ninth and last check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[8]).toBe(checkG9);
    expect(ALL_CHECKS).toHaveLength(9);
  });

  it('does not change its input or its context', () => {
    const input = cloneGolden();
    const ctx = defaultContext({ publishedSlugs: [GOLDEN_SLUG], recentTitles: recents(GOLDEN_TITLE) });
    checkG9(input, ctx);
    expect(input).toEqual(cloneGolden());
    expect([...ctx.publishedSlugs]).toEqual([GOLDEN_SLUG]);
    expect(ctx.recentTitles).toEqual(recents(GOLDEN_TITLE));
  });
});

describe('G9_SLUG_COLLISION', () => {
  it('fails a slug that is already published, and says which', () => {
    const output = checkG9(cloneGolden(), defaultContext({ publishedSlugs: ['an-older-piece', GOLDEN_SLUG] }));
    expect(output.failures).toEqual([
      {
        check: 'G9',
        code: 'G9_SLUG_COLLISION',
        message: `the slug "${GOLDEN_SLUG}" is already published`,
        where: 'slug',
      },
    ]);
  });

  it('compares the whole slug: a longer or shorter published slug is not a collision', () => {
    expect(checkG9(cloneGolden(), defaultContext({ publishedSlugs: [`${GOLDEN_SLUG}-2025`, 'fixture-robotics'] })).failures).toEqual([]);
  });

  it('is decided by the context, not by the draft', () => {
    expect(codes(run((g) => (g.draft.slug = 'something-else'), { publishedSlugs: [GOLDEN_SLUG] }))).toEqual([]);
    expect(codes(run((g) => (g.draft.slug = 'something-else'), { publishedSlugs: ['something-else'] }))).toEqual(['G9_SLUG_COLLISION']);
  });
});

describe('titleTokens and TITLE_STOP_WORDS', () => {
  it('lowercases, splits at everything that is not a letter or digit, and drops stop words', () => {
    expect([...titleTokens('Fixture Robotics ships the FX-1 to a second plant')]).toEqual([
      'fixture',
      'robotics',
      'ships',
      'fx',
      '1',
      'second',
      'plant',
    ]);
  });

  it('returns each word once and ignores quote shapes, dashes and spacing', () => {
    expect([...titleTokens("Robot's  robot \u2019s ROBOT \u2014 robot")]).toEqual(['robot', 's']);
  });

  it('keeps figures, which tell two stories apart', () => {
    expect([...titleTokens('Brindle adds 40 arms, 18% faster, $450 million')]).toEqual(['brindle', 'adds', '40', 'arms', '18', 'faster', '450', 'million']);
  });

  it('has nothing left when a title is all stop words or empty', () => {
    expect(titleTokens('The a an of to').size).toBe(0);
    expect(titleTokens('').size).toBe(0);
  });

  it('is a small list of lowercase function words', () => {
    expect(TITLE_STOP_WORDS.size).toBeGreaterThan(5);
    expect(TITLE_STOP_WORDS.size).toBeLessThan(30);
    for (const word of TITLE_STOP_WORDS) expect(word).toMatch(/^[a-z]+$/);
    for (const word of ['a', 'an', 'the', 'to', 'of', 'in']) expect(TITLE_STOP_WORDS.has(word)).toBe(true);
    // Words that carry the story must never be stop words.
    for (const word of ['new', 'raises', 'ships', 'robot', 'first', 'second']) expect(TITLE_STOP_WORDS.has(word)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Calibration of titleSimilarityThreshold (default 0.6).
//
// Each row is a pair of titles and the overlap score G9 gives it: shared words
// over all words, after the stop words are dropped. The default threshold has
// to sit between the highest score of a pair that is a different story and the
// lowest score of a pair that is a duplicate. It does, so it stays at 0.6.
// ---------------------------------------------------------------------------

type Pair = { a: string; b: string; shared: number; all: number };

const DUPLICATES: Pair[] = [
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships the FX-1 to a second plant', shared: 7, all: 7 },
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 to a second plant in Tarnmoor', shared: 7, all: 8 },
  { a: 'Brindle Logistics adds 40 FX-1 arms at Ashvale', b: 'Brindle Logistics adds 40 FX-1 arms to Ashvale plant', shared: 8, all: 9 },
  {
    a: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
    b: 'Fixture Robotics begins shipping FX-1 warehouse arm to second plant',
    shared: 8,
    all: 11,
  },
  {
    a: 'Corvane Partners leads $450 million round in Fixture Robotics',
    b: 'Fixture Robotics raises $450 million in round led by Corvane Partners',
    shared: 7,
    all: 10,
  },
  // Same shape, one word changed. Different story, but two titles this close are confusing in a feed, so it goes back.
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 to third plant', shared: 6, all: 8 },
];

const DIFFERENT: Pair[] = [
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-2 to third plant', shared: 5, all: 9 },
  { a: 'Fixture Robotics ships FX-1 to second plant', b: 'Fixture Robotics ships FX-1 spare parts to Brindle Logistics', shared: 5, all: 11 },
  { a: GOLDEN_TITLE, b: 'Fixture Robotics raises $450 million for FX-1 production', shared: 4, all: 13 },
  {
    a: 'Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection',
    b: 'Northgate Dynamics raises $120 million for Atlas-9 production',
    shared: 4,
    all: 12,
  },
  { a: 'Standards body publishes new safety rules for warehouse robots', b: GOLDEN_TITLE, shared: 1, all: 16 },
  { a: 'Brindle Logistics adds 40 FX-1 arms at Ashvale', b: 'Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', shared: 0, all: 16 },
];

const score = (pair: Pair) => jaccard(titleTokens(pair.a), titleTokens(pair.b));
const duplicateOf = (title: string, earlier: string, overrides?: ContextOverrides) =>
  codes(run((g) => (g.draft.title.text = title), { recentTitles: recents(earlier), ...overrides })).includes('G9_TITLE_DUPLICATE');

describe('G9_TITLE_DUPLICATE: calibrating the 0.6 threshold', () => {
  it('starts at 0.6', () => {
    expect(defaultConfig().titleSimilarityThreshold).toBe(0.6);
  });

  it.each(DUPLICATES.map((pair) => [`${pair.shared}/${pair.all}`, pair] as const))('scores the duplicate pair at %s as caught', (_ratio, pair) => {
    expect(score(pair)).toBeCloseTo(pair.shared / pair.all, 10);
    expect(duplicateOf(pair.a, pair.b)).toBe(true);
    expect(duplicateOf(pair.b, pair.a)).toBe(true);
  });

  it.each(DIFFERENT.map((pair) => [`${pair.shared}/${pair.all}`, pair] as const))('scores the different pair at %s as not caught', (_ratio, pair) => {
    expect(score(pair)).toBeCloseTo(pair.shared / pair.all, 10);
    expect(duplicateOf(pair.a, pair.b)).toBe(false);
    expect(duplicateOf(pair.b, pair.a)).toBe(false);
  });

  it('puts the default in the gap between the two groups, with room on both sides', () => {
    const lowestDuplicate = Math.min(...DUPLICATES.map(score));
    const highestDifferent = Math.max(...DIFFERENT.map(score));
    expect(highestDifferent).toBeLessThan(0.6);
    expect(lowestDuplicate).toBeGreaterThanOrEqual(0.6);
    expect(0.6 - highestDifferent).toBeGreaterThan(0.04);
    expect(lowestDuplicate - 0.6).toBeGreaterThan(0.09);
  });

  it('does not catch a duplicate that is reworded in most of its words: Select, not the gate, handles those', () => {
    const reworded = {
      a: 'Fixture Robotics delivers FX-1 arms to Brindle Logistics second plant',
      b: GOLDEN_TITLE,
    };
    expect(jaccard(titleTokens(reworded.a), titleTokens(reworded.b))).toBeCloseTo(6 / 13, 10);
    expect(duplicateOf(reworded.a, reworded.b)).toBe(false);
  });

  it('reads the threshold from the context', () => {
    const [a, b] = [DUPLICATES[3]!.a, DUPLICATES[3]!.b]; // scores 8/11, about 0.73
    expect(duplicateOf(a, b, { config: { titleSimilarityThreshold: 0.7 } })).toBe(true);
    expect(duplicateOf(a, b, { config: { titleSimilarityThreshold: 0.8 } })).toBe(false);
    const different = DIFFERENT[0]!; // scores 5/9, about 0.56
    expect(duplicateOf(different.a, different.b, { config: { titleSimilarityThreshold: 0.5 } })).toBe(true);
  });

  it('catches a score exactly at the threshold', () => {
    expect(duplicateOf(DUPLICATES[0]!.a, DUPLICATES[0]!.b, { config: { titleSimilarityThreshold: 1 } })).toBe(true);
  });
});

describe('G9_TITLE_DUPLICATE', () => {
  it('fails a title that repeats a recent title, and says which and how close', () => {
    const output = run(() => undefined, {
      recentTitles: recents('Fixture Robotics begins shipping FX-1 warehouse arm to second plant'),
    });
    expect(output.failures).toEqual([
      {
        check: 'G9',
        code: 'G9_TITLE_DUPLICATE',
        message:
          'the title is too close to the recent title "Fixture Robotics begins shipping FX-1 warehouse arm to second plant": 0.73 word overlap, and 0.60 is the limit',
        where: 'title',
      },
    ]);
  });

  it('reports one failure, naming the closest of several recent titles', () => {
    const output = run(() => undefined, {
      recentTitles: recents(
        'Fixture Robotics begins shipping FX-1 warehouse arm to second plant', // 8/11
        GOLDEN_TITLE, // identical
        'Fixture Robotics ships FX-1 warehouse arm to third plant', // 8/10
      ),
    });
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]!.message).toContain(`recent title "${GOLDEN_TITLE}": 1.00 word overlap`);
  });

  it('names the first of two recent titles that are equally close', () => {
    const output = run(() => undefined, {
      recentTitles: recents('Fixture Robotics ships FX-1 warehouse arm to second plant', GOLDEN_TITLE),
    });
    expect(output.failures[0]!.message).toContain('recent title "Fixture Robotics ships FX-1 warehouse arm to second plant"');
  });

  it('ignores a recent title that is not close, and an empty list of recent titles', () => {
    expect(run(() => undefined, { recentTitles: [] }).failures).toEqual([]);
    expect(run(() => undefined, { recentTitles: recents('Northgate Dynamics unveils Atlas-9') }).failures).toEqual([]);
  });

  it('ignores case, punctuation and stop words in both titles', () => {
    expect(duplicateOf('FIXTURE ROBOTICS: SHIPS ITS FX-1 WAREHOUSE ARM TO A SECOND PLANT!', GOLDEN_TITLE)).toBe(true);
    expect(duplicateOf(GOLDEN_TITLE, "the fixture robotics' ships, its fx-1 warehouse arm, to the second plant")).toBe(true);
  });

  it('does not call a title with no words a duplicate of anything', () => {
    expect(duplicateOf('The of', 'The of')).toBe(false);
  });
});

describe('G9_TITLE_DUPLICATE: only recent titles count', () => {
  // The same title as the golden piece's, published on another day.
  const on = (publishedAt: string, draftDate = '2026-10-04', overrides?: ContextOverrides) =>
    codes(
      run((g) => (g.draft.publishedAt = draftDate), { recentTitles: [recent(GOLDEN_TITLE, publishedAt)], ...overrides }),
    ).includes('G9_TITLE_DUPLICATE');

  it('starts with a window of 14 days', () => {
    expect(defaultConfig().titleWindowDays).toBe(14);
  });

  it('counts a title from the same day, from yesterday and from exactly 14 days earlier', () => {
    expect(on('2026-10-04')).toBe(true);
    expect(on('2026-10-03')).toBe(true);
    expect(on('2026-09-20')).toBe(true);
  });

  it('ignores a title from 15 days earlier, and from long ago', () => {
    expect(on('2026-09-19')).toBe(false);
    expect(on('2025-10-04')).toBe(false);
  });

  it('ignores a title dated after the draft', () => {
    expect(on('2026-10-05')).toBe(false);
    expect(on('2027-10-04')).toBe(false);
  });

  it('counts days across the end of a month, a year and a leap day', () => {
    expect(on('2026-12-22', '2027-01-05')).toBe(true);
    expect(on('2026-12-21', '2027-01-05')).toBe(false);
    expect(on('2028-02-16', '2028-03-01')).toBe(true);
    expect(on('2028-02-15', '2028-03-01')).toBe(false);
    expect(on('2027-02-15', '2027-03-01')).toBe(true);
    expect(on('2027-02-14', '2027-03-01')).toBe(false);
  });

  it('reads the window from the context', () => {
    const window = (titleWindowDays: number) => ({ config: { titleWindowDays } });
    expect(on('2026-10-01', '2026-10-04', window(3))).toBe(true);
    expect(on('2026-09-30', '2026-10-04', window(3))).toBe(false);
    expect(on('2026-10-04', '2026-10-04', window(0))).toBe(true);
    expect(on('2026-10-03', '2026-10-04', window(0))).toBe(false);
    expect(on('2026-08-05', '2026-10-04', window(60))).toBe(true);
    expect(on('2026-08-04', '2026-10-04', window(60))).toBe(false);
  });

  it('skips an old title and names the recent one', () => {
    const output = run(() => undefined, {
      recentTitles: [recent(GOLDEN_TITLE, '2026-08-01'), recent('Fixture Robotics begins shipping FX-1 warehouse arm to second plant', '2026-10-01')],
    });
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]!.message).toContain('"Fixture Robotics begins shipping FX-1 warehouse arm to second plant"');
  });

  it('compares a recent title whose date is not a real date, because a duplicate is worse than a false alarm', () => {
    expect(on('yesterday')).toBe(true);
    expect(on('2026-02-30')).toBe(true);
    expect(on('')).toBe(true);
  });

  it('compares every recent title when the draft date is not a real date; G1 reports that date', () => {
    expect(on('2020-01-01', 'soon')).toBe(true);
    expect(on('2020-01-01', '')).toBe(true);
  });
});

describe('G9_BANNED_PHRASE', () => {
  const at = (change: (g: GateInput) => void, overrides?: ContextOverrides) => run(change, overrides).failures;

  it('fails a banned phrase, naming the phrase in `where` and the place in the message', () => {
    const failures = at((g) => {
      g.draft.takeaways[1]!.text = 'The datasheet lists a 12 kg rated payload, a game-changer for the site.';
    });
    expect(failures).toEqual([
      {
        check: 'G9',
        code: 'G9_BANNED_PHRASE',
        message: 'the banned phrase "game-changer" appears at takeaways, sentence 2',
        where: 'game-changer',
      },
    ]);
  });

  it.each(DEFAULT_BANNED_PHRASES.map((phrase) => [phrase] as const))('catches the default phrase "%s"', (phrase) => {
    const failures = at((g) => {
      g.draft.opening[0]!.text = `Fixture Robotics has begun shipping its arm, and ${phrase} follows.`;
    });
    expect(failures.map((failure) => [failure.code, failure.where])).toEqual([['G9_BANNED_PHRASE', phrase]]);
  });

  it.each([
    ['the title', (g: GateInput) => (g.draft.title.text = 'A game-changer ships'), 'title'],
    ['the description', (g: GateInput) => (g.draft.description.text = 'A game-changer ships'), 'description'],
    ['an opening sentence', (g: GateInput) => (g.draft.opening[2]!.text = 'A game-changer ships'), 'opening, sentence 3'],
    ['a takeaway', (g: GateInput) => (g.draft.takeaways[3]!.text = 'A game-changer ships'), 'takeaways, sentence 4'],
    ['a section sentence', (g: GateInput) => (g.draft.sections[2]!.paragraphs[1]![1]!.text = 'A game-changer ships'), 'section "What the filing shows", sentence 5'],
    ['an analysis sentence', (g: GateInput) => (findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'A game-changer ships'), 'section "What the customer reports", sentence 6'],
    ['a limitation sentence', (g: GateInput) => (g.draft.limitations[4]!.text = 'A game-changer ships'), 'limitations, sentence 5'],
  ])('reads %s', (_name, change, where) => {
    expect(at(change).map((failure) => failure.message)).toEqual([`the banned phrase "game-changer" appears at ${where}`]);
  });

  it('reads a section heading', () => {
    const failures = at((g) => (g.draft.sections[1]!.heading = 'A revolutionary customer'));
    expect(failures).toEqual([
      {
        check: 'G9',
        code: 'G9_BANNED_PHRASE',
        message: 'the banned phrase "revolutionary" appears at heading "A revolutionary customer"',
        where: 'revolutionary',
      },
    ]);
  });

  it('ignores case, the shape of quote marks and dashes, and spacing', () => {
    for (const text of [
      'A GAME-CHANGER ships',
      'A game\u2013changer ships',
      'A game\u2014changer ships',
      'A  game-changer ships',
      'It\u2019s worth noting that the arm ships',
      "IT'S WORTH NOTING that the arm ships",
      'In Today\u2019s Fast-Moving World Of Robotics, an arm ships',
    ]) {
      expect(at((g) => (g.draft.opening[0]!.text = text)), text).toHaveLength(1);
    }
  });

  it('matches inside a longer word, so that "delves" and "unprecedentedly" are caught too', () => {
    expect(at((g) => (g.draft.opening[0]!.text = 'The report delves into the arm.'))).toHaveLength(1);
    expect(at((g) => (g.draft.opening[0]!.text = 'The arm is unprecedentedly light.'))).toHaveLength(1);
  });

  it('does not match a phrase that is only similar', () => {
    expect(at((g) => (g.draft.opening[0]!.text = 'The game changed hands, and the arm ships.'))).toEqual([]);
    expect(at((g) => (g.draft.opening[0]!.text = 'The arm is evolving and cutting edges.'))).toEqual([]);
  });

  it('reads quoted passages too: a source\'s own hype is still not the Desk\'s voice', () => {
    const failures = at((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('"We went from pilot')).text =
        '"This is a game-changer," said Dana Whitcombe, chief operating officer of Brindle Logistics.';
    });
    expect(failures.map((failure) => failure.code)).toEqual(['G9_BANNED_PHRASE']);
  });

  it('reports a phrase at every place it appears, and each phrase separately', () => {
    const failures = at((g) => {
      g.draft.opening[0]!.text = 'A game-changer and a revolutionary arm ships.';
      g.draft.takeaways[0]!.text = 'Another game-changer.';
    });
    expect(failures.map((failure) => [failure.where, failure.message.split(' appears at ')[1]])).toEqual([
      ['game-changer', 'opening, sentence 1'],
      ['revolutionary', 'opening, sentence 1'],
      ['game-changer', 'takeaways, sentence 1'],
    ]);
  });

  it('uses the phrases in the context, not only the defaults', () => {
    const text = 'The arm is best-in-class.';
    expect(at((g) => (g.draft.opening[0]!.text = text))).toEqual([]);
    const failures = at((g) => (g.draft.opening[0]!.text = text), { config: { bannedPhrases: ['best-in-class'] } });
    expect(failures.map((failure) => failure.where)).toEqual(['best-in-class']);
    expect(at((g) => (g.draft.opening[0]!.text = 'A game-changer ships.'), { config: { bannedPhrases: ['best-in-class'] } })).toEqual([]);
  });

  it('folds a phrase in the context the way it folds the text, so capitals and curly apostrophes there do not matter', () => {
    const config = { bannedPhrases: ['Best-In-Class', 'It\u2019s Worth Noting'] };
    const failures = at((g) => (g.draft.opening[0]!.text = "A best-in-class arm. It's worth noting this."), { config });
    expect(failures.map((failure) => failure.where)).toEqual(['Best-In-Class', 'It\u2019s Worth Noting']);
  });

  it('ignores an empty phrase, which would otherwise match every sentence', () => {
    expect(at(() => undefined, { config: { bannedPhrases: ['', '  '] } })).toEqual([]);
  });
});
