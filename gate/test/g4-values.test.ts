import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Failure, GateInput } from '../src/gate';
import type { Claim, ClaimValue } from '../src/schemas';
import { findSentence, mutate } from './helpers';

// --- A tiny input: a title that cites the given claims, and nothing else. ----

const num = (raw: string, normalised: string, unit?: string): ClaimValue =>
  unit === undefined ? { kind: 'number', raw, normalised } : { kind: 'number', raw, normalised, unit };
const when = (raw: string, normalised: string): ClaimValue => ({ kind: 'date', raw, normalised });
const who = (raw: string): ClaimValue => ({ kind: 'name', raw, normalised: raw.toLowerCase() });

/** A claim whose quote is made of its values, so every value is in its span unless `quote` says otherwise. */
function claimOf(values: ClaimValue[], overrides: Partial<Claim> = {}): Claim {
  const quote = overrides.span?.quote ?? (values.map((value) => value.raw).join('; ') || 'nothing');
  return {
    id: 'c-1',
    text: 'A claim.',
    label: 'thing',
    type: 'spec',
    source: {
      url: 'https://fixture-robotics.example/a',
      tier: 1,
      snapshotHash: 'a'.repeat(64),
      retrievedAt: '2026-10-04T04:30:00Z',
    },
    span: { start: 0, end: quote.length, quote },
    basis: 'datasheet',
    status: 'unspecified',
    values,
    ...overrides,
  };
}

function mini(text: string, claims: Claim[], cited: string[] = claims.map((claim) => claim.id)): GateInput {
  return {
    draft: {
      slug: 'a-slug',
      publishedAt: '2026-10-04',
      categories: ['humanoids'],
      author: { name: 'Robywire Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'It is fine.', claimIds: cited },
      opening: [],
      takeaways: [],
      sections: [],
      limitations: [],
    },
    claims,
  };
}

const run = (input: GateInput, overrides?: ContextOverrides) => checkG4(input, defaultContext(overrides));
const codes = (input: GateInput, overrides?: ContextOverrides) => run(input, overrides).failures.map((failure) => failure.code);
const goldenCodes = (change: (copy: GateInput) => void) => codes(mutate(cloneGolden(), change));
const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);

// ---------------------------------------------------------------------------

describe('G4: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG4(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the fourth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[3]).toBe(checkG4);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG4(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });
});

describe('G4 numbers: the same figure written differently is supported', () => {
  it.each([
    ['It does 1,200 picks an hour.', num('1.2k', '1200')],
    ['It does 1.2k picks an hour.', num('1,200', '1200')],
    ['It does 1200 picks an hour.', num('1.2k', '1200')],
    ['It lifts 12 kg.', num('12 kilograms', '12', 'kg')],
    ['It lifts 12 kilograms.', num('12 kg', '12', 'kg')],
    ['It lifts 12.', num('12 kg', '12', 'kg')],
    ['It moves at 2.3 m/s.', num('2.3 metres per second', '2.3', 'm/s')],
    ['It moves at 2.3 metres per second.', num('2.3 m/s', '2.3', 'm/s')],
    ['The cycle time fell 18%.', num('18 per cent', '18', '%')],
    ['The cycle time fell 18 percent.', num('18%', '18', '%')],
    ['It raised $450 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450M.', num('$450 million', '450000000', 'USD')],
    ['It raised USD 450 million.', num('$450m', '450000000', 'USD')],
    ['It raised 450 million dollars.', num('USD 450 million', '450000000', 'USD')],
    ['It costs $38,000.', num('$38,000', '38000', 'USD')],
    ['It draws 650 W.', num('650 watts', '650', 'W')],
  ])('accepts %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual([]);
  });
});

describe('G4 numbers: a different figure, or a different unit, is not supported', () => {
  it.each([
    ['It lifts 13 kg.', num('12 kg', '12', 'kg')],
    ['It lifts 12 lb.', num('12 kg', '12', 'kg')],
    ['It lifts 12 kg.', num('12 lb', '12', 'lb')],
    ['It lifts 12 kg.', num('12', '12')],
    ['It lifts 1.2 kg.', num('12 kg', '12', 'kg')],
    ['It reaches 1 km.', num('1000 m', '1000', 'm')],
    ['It does 1,200 picks an hour.', num('1.3k', '1300')],
    ['The cycle time fell 19%.', num('18 per cent', '18', '%')],
    ['It raised $45 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450 million.', num('EUR 450 million', '450000000', 'EUR')],
    ['It raised $450 million.', num('450 million', '450000000')],
    ['It moves at 2.3 m/s.', num('2.3 km/h', '2.3', 'km/h')],
  ])('rejects %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('names the number and where it is', () => {
    const out = run(mini('It lifts 13 kg.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NUMBER_UNSUPPORTED',
        message: 'the number "13 kg" at title is not in any claim this sentence cites',
        where: 'title',
      },
    ]);
  });

  it('does not count a name or a date value as support for a number', () => {
    expect(codes(mini('It lifts 2026 kg.', [claimOf([when('2026', '2026')])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
    expect(codes(mini('It lifts 12 kg.', [claimOf([who('12 kg')])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('accepts support from any one of the cited claims', () => {
    const first = claimOf([num('12 kg', '12', 'kg')], { id: 'c-1' });
    const second = claimOf([num('650 W', '650', 'W')], { id: 'c-2' });
    expect(codes(mini('It lifts 12 kg and draws 650 W.', [first, second]))).toEqual([]);
  });

  it('does not accept support from a claim the sentence does not cite', () => {
    const cited = claimOf([num('650 W', '650', 'W')], { id: 'c-1' });
    const uncited = claimOf([num('12 kg', '12', 'kg')], { id: 'c-2' });
    expect(codes(mini('It lifts 12 kg.', [cited, uncited], ['c-1']))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('reports each unsupported number once, even when it is written twice', () => {
    const out = run(mini('It lifts 13 kg, and 13 kg again, and 14 kg too.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['13 kg', '14 kg']);
  });
});

describe('G4 numbers: the claim value comes from its raw text', () => {
  it('trusts the raw text over a normalised value that disagrees with it', () => {
    const lying = claimOf([num('12 kg', '13', 'kg')]);
    expect(codes(mini('It lifts 12 kg.', [lying]))).toEqual([]);
    expect(codes(mini('It lifts 13 kg.', [lying]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('falls back to the normalised value and unit when the raw text is not a number token', () => {
    const spelled = claimOf([num('twelve', '12', 'kilograms')]);
    expect(codes(mini('It lifts 12 kg.', [spelled]))).toEqual([]);
    expect(codes(mini('It lifts 13 kg.', [spelled]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
    expect(codes(mini('It lifts 12 lb.', [spelled]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('reads a comma in a fallback value', () => {
    const spelled = claimOf([num('twelve hundred', '1,200')]);
    expect(codes(mini('It does 1200 picks.', [spelled]))).toEqual([]);
  });
});

describe('G4 dates', () => {
  it.each([
    ['It shipped on 29 September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 2026-09-29.', when('29 September 2026', '2026-09-29')],
    ['It shipped on Sep 29, 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in September 2026.', when('September 2026', '2026-09')],
    ['It shipped in 2027.', when('2027', '2027')],
    ['It shipped on 29 September 2026.', when('around the end of the quarter', '2026-09-29')],
  ])('accepts %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual([]);
  });

  it.each([
    ['It shipped on 30 September 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 October 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 September 2027.', when('2026-09-29', '2026-09-29')],
    ['It shipped in October 2026.', when('2026-09-29', '2026-09-29')],
    ['It shipped in 2027.', when('2026-09-29', '2026-09-29')],
    ['It shipped on 29 September 2026.', when('September 2026', '2026-09')],
    ['It shipped on 29 September 2026.', when('2026', '2026')],
    ['It shipped in 2027.', when('2026', '2026')],
    ['It shipped in 2026.', when('twenty twenty-six', '20261')],
  ])('rejects %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('names the date and where it is', () => {
    const out = run(mini('It shipped on 30 September 2026.', [claimOf([when('2026-09-29', '2026-09-29')])]));
    expect(out.failures[0]?.message).toBe('the date "30 September 2026" at title is not in any claim this sentence cites');
    expect(out.failures[0]?.where).toBe('title');
  });

  it('trusts the raw text of a date over a normalised value that disagrees with it', () => {
    const lying = claimOf([when('29 September 2026', '2026-09-30')]);
    expect(codes(mini('It shipped on 29 September 2026.', [lying]))).toEqual([]);
    expect(codes(mini('It shipped on 30 September 2026.', [lying]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('reports each unsupported date once, even when it is written twice', () => {
    const out = run(mini('It shipped on 30 September 2026 and on 30 September 2026.', [claimOf([when('2026-09-29', '2026-09-29')])]));
    expect(out.failures.map((failure) => failure.code)).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('does not count a number value as support for a date', () => {
    expect(codes(mini('It shipped in 2026.', [claimOf([num('2026', '2026')])]))).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('reports an impossible date as unsupported numbers, never as a real date', () => {
    const out = codes(mini('It shipped on 31 February 2026.', [claimOf([when('2026-02-28', '2026-02-28')])]));
    expect(out).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});

describe('G4 names', () => {
  it('accepts a name that a cited claim lists as a name value', () => {
    expect(codes(mini('The shipments by Acme rose.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('rejects a name that no cited claim lists', () => {
    const out = run(mini('The shipments by Acme rose.', [claimOf([who('Fixture Robotics')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NAME_UNSUPPORTED',
        message:
          'the capitalised word "acme" at title is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word',
        where: 'title',
      },
    ]);
  });

  it('compares each word of a multi-word name, in any case', () => {
    const claim = claimOf([who('Brindle Logistics')]);
    expect(codes(mini('The plans at Brindle Logistics grew.', [claim]))).toEqual([]);
    expect(codes(mini('The plans at the Logistics site grew.', [claim]))).toEqual([]);
    expect(codes(mini('The plans at Brindle Freight grew.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('reads a possessive as the name', () => {
    expect(codes(mini("The plans at Acme's plant grew.", [claimOf([who('Acme')])]))).toEqual([]);
    expect(codes(mini('The plans at Acme\u2019s plant grew.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('accepts a model name and an acronym that a claim lists', () => {
    expect(codes(mini('The sales of the FX-1 and the ISO rules rose.', [claimOf([who('FX-1'), who('ISO')])]))).toEqual([]);
    expect(codes(mini('The sales of the FX-1 rose.', [claimOf([who('FX-2')])]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('accepts a name listed by any one of the cited claims, but not by a claim that is not cited', () => {
    const a = claimOf([who('Acme')], { id: 'c-1' });
    const b = claimOf([who('Zenith')], { id: 'c-2' });
    expect(codes(mini('The plans at Acme and Zenith grew.', [a, b]))).toEqual([]);
    expect(codes(mini('The plans at Acme and Zenith grew.', [a, b], ['c-1']))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('does not take a name from the claim text, only from its name values', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { text: 'Acme lifts 12 kg.' });
    expect(codes(mini('The plans at Acme grew by 12 kg.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('accepts a word on the allow-list without a claim, and an allow-list passed in the context', () => {
    expect(codes(mini('It shipped in August, on a Monday, said the CEO of the US firm.', [claimOf([])]))).toEqual([]);
    expect(codes(mini('The plans at Acme grew.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('The plans at Acme grew.', [claimOf([])]), { nameAllowList: ['acme'] })).toEqual([]);
  });

  it('leaves the first word of the sentence to its own rule, which is about opening words', () => {
    const out = run(mini('Acme ships arms.', [claimOf([])]));
    expect(out.failures.map((failure) => failure.code)).toEqual(['G4_INITIAL_WORD_UNSUPPORTED']);
    expect(codes(mini('Acme ships arms.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('is deliberately strict: a capitalised ordinary word is reported, and a revision fixes it', () => {
    expect(codes(mini('The sales rose, Analysts said.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('The sales rose, analysts said.', [claimOf([])]))).toEqual([]);
  });

  it('reports each unsupported name once', () => {
    const out = run(mini('The plans at Acme and Acme and Zenith grew.', [claimOf([])]));
    expect(out.failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['acme', 'zenith']);
  });
});

describe('G4 opening words', () => {
  const failure = (text: string, claims: Claim[], cited?: string[], overrides?: ContextOverrides) =>
    run(mini(text, claims, cited), overrides).failures.filter((item) => item.code === 'G4_INITIAL_WORD_UNSUPPORTED');

  it('rejects a made-up company at the start of a sentence, and says which word and where', () => {
    const out = run(mini('Harlow Logistics plans a plant at Tarnmoor.', [claimOf([who('Brindle Logistics'), who('Tarnmoor')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_INITIAL_WORD_UNSUPPORTED',
        message:
          'the sentence at title opens with "Harlow", which is neither an ordinary opening word nor a word of any claim this sentence cites: start with an ordinary word, or cite the claim that mentions it',
        where: 'title',
      },
    ]);
  });

  it('reports the made-up company in the golden piece, at the sentence where it opens', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('Brindle Logistics plans to use')).text =
        'Harlow Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.';
    });
    expect(failures).toEqual(['G4_INITIAL_WORD_UNSUPPORTED']);
  });

  it.each([
    ['a function word', 'However, the arm shipped.'],
    ['a function word in capitals', 'THE arm shipped.'],
    ['a function word with a possessive ending', "It's an arm."],
    ['a lowercase word', 'shipments began in the spring.'],
    ['a number', '12 kg is the rated payload.'],
    ['a date', '29 September 2026 was the day.'],
  ])('does not apply to %s', (_name, text) => {
    expect(failure(text, [claimOf([])])).toEqual([]);
  });

  it('accepts an opening word that appears in the span of a cited claim', () => {
    const claim = claimOf([], { span: { start: 0, end: 30, quote: 'Shipments began in the spring' } });
    expect(failure('Shipments began at the plant.', [claim])).toEqual([]);
    expect(failure('SHIPMENTS began at the plant.', [claim])).toEqual([]);
  });

  it('accepts an opening word that appears in the text, the label, or a name value of a cited claim', () => {
    expect(failure('Rollout began.', [claimOf([], { text: 'The rollout began.' })])).toEqual([]);
    expect(failure('Rollout began.', [claimOf([], { label: 'rollout' })])).toEqual([]);
    expect(failure('Rollout began.', [claimOf([who('Rollout')])])).toEqual([]);
  });

  it('accepts the outlet of a cited claim, which an attributed sentence has to name', () => {
    const claim = claimOf([num('7', '7')], { source: { ...claimOf([]).source, tier: 2, outlet: 'Mercer Wire' } });
    expect(failure('Mercer Wire says 7 plants opened.', [claim])).toEqual([]);
  });

  it('accepts an opening word that is on the allow-list, and an allow-list passed in the context', () => {
    expect(failure('August shipments rose.', [claimOf([])])).toEqual([]);
    expect(failure('Harlow shipments rose.', [claimOf([])])).toHaveLength(1);
    expect(failure('Harlow shipments rose.', [claimOf([])], undefined, { nameAllowList: ['harlow'] })).toEqual([]);
  });

  it('matches a whole word only', () => {
    const claim = claimOf([], { span: { start: 0, end: 30, quote: 'Shipments began in the spring' } });
    expect(failure('Ship plans rose.', [claim])).toHaveLength(1);
    expect(failure('Shipment plans rose.', [claim])).toHaveLength(1);
  });

  it('does not take the word from a claim the sentence does not cite', () => {
    const cited = claimOf([], { id: 'c-1' });
    const other = claimOf([], { id: 'c-2', span: { start: 0, end: 30, quote: 'Shipments began in the spring' } });
    expect(failure('Shipments began.', [cited, other], ['c-1'])).toHaveLength(1);
    expect(failure('Shipments began.', [cited, other], ['c-2'])).toEqual([]);
  });

  it('judges the sentence on its own claims when there are none', () => {
    expect(failure('Shipments began.', [claimOf([])], [])).toHaveLength(1);
  });

  it('reads fact sentences only, each at its own place', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.opening[1]!.text = 'Harlow now runs 40 of the arms.';
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'Harlow sits below the maximum.';
      g.draft.limitations[0]!.text = 'Harlow wrote this.';
    });
    expect(summary(checkG4(input, defaultContext()).failures)).toEqual([['G4_INITIAL_WORD_UNSUPPORTED', 'opening, sentence 2']]);
  });

  it('reports the opening word before the other failures of the sentence', () => {
    const out = run(mini('Harlow lifts 13 kg.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures.map((item) => item.code)).toEqual(['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});

describe('G4 names: the outlet of a tier-2 claim', () => {
  const fromOutlet = (id: string, outlet: string) =>
    claimOf([num('7', '7')], { id, source: { ...claimOf([]).source, tier: 2, outlet } });

  it('is a name the sentence may use, because an attribution has to say who reported it', () => {
    const claim = fromOutlet('c-1', 'The Robot Report');
    expect(codes(mini('The sales rose to 7, The Robot Report says.', [claim]))).toEqual([]);
  });

  it('is accepted word by word, in any case', () => {
    expect(codes(mini('The sales rose to 7, says MERCER wire.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([]);
  });

  it('is not accepted from a claim the sentence does not cite', () => {
    const claim = fromOutlet('c-2', 'Mercer Wire');
    expect(codes(mini('The sales rose to 7, says Mercer Wire.', [claim], ['c-2']))).toEqual([]);
    expect(codes(mini('The sales rose to 7, says Mercer Wire.', [claim, claimOf([num('7', '7')], { id: 'c-1' })], ['c-1']))).toEqual([
      'G4_NAME_UNSUPPORTED',
      'G4_NAME_UNSUPPORTED',
    ]);
  });

  it('does not make any other capitalised word acceptable', () => {
    expect(codes(mini('The sales rose to 7, says Mercer Wire in Harlow.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([
      'G4_NAME_UNSUPPORTED',
    ]);
  });

  it('lets the golden piece name the outlet of an attributed tier-2 sentence', () => {
    const failures = goldenCodes((g) => {
      const claim = g.claims.find((item) => item.id === 'c-19')!;
      claim.source.tier = 2;
      claim.source.outlet = 'Mercer Wire';
      findSentence(g.draft, (sentence) => sentence.text === 'It lists 7 investors in the round.').text =
        'The Mercer Wire reports that 7 investors took part in the round.';
    });
    expect(failures).toEqual([]);
  });
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('She said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
  });

  it('skips analysis sentences', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'Acme shipped 999 units on 3 May 2027.';
    });
    expect(failures).toEqual([]);
  });

  it('skips limitation sentences', () => {
    const failures = goldenCodes((g) => {
      g.draft.limitations[0]!.text = 'Acme shipped 999 units on 3 May 2027.';
    });
    expect(failures).toEqual([]);
  });

  it.each([
    ['the title', (g: GateInput) => g.draft.title, 'title'],
    ['the description', (g: GateInput) => g.draft.description, 'description'],
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[1]!.paragraphs[2]![0]!, 'section "What the customer reports", sentence 8'],
  ])('reads %s', (_name, pick, where) => {
    const input = mutate(cloneGolden(), (g) => {
      pick(g).text = 'It weighs 999 kg.';
    });
    expect(summary(checkG4(input, defaultContext()).failures)).toEqual([['G4_NUMBER_UNSUPPORTED', where]]);
  });

  it('does not stop at a claim id that does not exist: the figures in that sentence are simply unsupported', () => {
    const out = codes(mini('It lifts 12 kg.', [claimOf([num('12 kg', '12', 'kg')])], ['c-999']));
    expect(out).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('treats a fact sentence with no claims as having nothing to support its figures', () => {
    expect(codes(mini('It lifts 12 kg.', [claimOf([num('12 kg', '12', 'kg')])], []))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });
});

describe('G4_VALUE_NOT_IN_SPAN', () => {
  it('fails when a cited claim lists a value whose raw text is not in its span quote', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { span: { start: 0, end: 20, quote: 'Rated payload: 13 kg' } });
    const out = run(mini('It lifts 12 kg.', [claim]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_VALUE_NOT_IN_SPAN',
        message: 'claim c-1 lists the value "12 kg", which does not appear in its quoted span',
        where: 'c-1',
      },
    ]);
  });

  it('reports a claim once however many sentences cite it and however many of its values are missing', () => {
    const claim = claimOf([num('12 kg', '12', 'kg'), num('650 W', '650', 'W')], { span: { start: 0, end: 5, quote: 'Other' } });
    const input = mini('It lifts 12 kg and draws 650 W.', [claim]);
    const failures = run(input).failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('12 kg');
  });

  it('checks name and date values too', () => {
    const claim = claimOf([who('Acme'), when('2026-09-29', '2026-09-29')], { span: { start: 0, end: 5, quote: 'Other' } });
    const out = run(mini('Acme shipped it on 29 September 2026.', [claim]));
    expect(out.failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN')).toHaveLength(1);
  });

  it('ignores spacing, dash and quote-mark differences between the raw text and the quote', () => {
    const claim = claimOf([num('12 kg', '12', 'kg'), who('Acme\u2019s')], {
      span: { start: 0, end: 30, quote: 'Rated payload: 12\u00A0kg for Acme\u2019s arm' },
    });
    expect(run(mini('It lifts 12 kg.', [claim])).failures.filter((failure) => failure.code === 'G4_VALUE_NOT_IN_SPAN')).toEqual([]);
  });

  it('is case-sensitive, as the quote is a verbatim extract', () => {
    const claim = claimOf([who('Acme')], { span: { start: 0, end: 12, quote: 'made by acme' } });
    expect(codes(mini('The plans at Acme grew.', [claim]))).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

  it('only looks at claims that a fact sentence cites', () => {
    const bad = claimOf([num('12 kg', '12', 'kg')], { id: 'c-2', span: { start: 0, end: 5, quote: 'Other' } });
    const good = claimOf([num('650 W', '650', 'W')], { id: 'c-1' });
    expect(codes(mini('It draws 650 W.', [good, bad], ['c-1']))).toEqual([]);
  });

  it('puts the failure after the sentence failures', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { span: { start: 0, end: 5, quote: 'Other' } });
    expect(codes(mini('It lifts 13 kg.', [claim]))).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_VALUE_NOT_IN_SPAN']);
  });
});

describe('G4 on the golden piece: one change at a time', () => {
  it('catches a swapped number', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.includes('38 kg')).text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
    });
    expect(codesFound).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('catches a swapped date', () => {
    const codesFound = goldenCodes((g) => {
      const sentence = findSentence(g.draft, (item) => item.text.includes('first sale on'));
      sentence.text = 'The filing records the first sale on 30 September 2026.';
    });
    expect(codesFound).toEqual(['G4_DATE_UNSUPPORTED']);
  });

  it('catches an invented name', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The round, led by')).text =
        'The round, led by Quillfeather Capital, totals $450 million, according to a regulatory filing.';
    });
    expect(codesFound).toEqual(['G4_NAME_UNSUPPORTED', 'G4_NAME_UNSUPPORTED']);
  });

  it('catches a claim whose value is not in its quote', () => {
    const codesFound = goldenCodes((g) => {
      g.claims.find((claim) => claim.id === 'c-13')!.span.quote = 'Arm mass: 39 kg.';
    });
    expect(codesFound).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

  it('catches a claim that is cited in place of the right one', () => {
    const codesFound = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('Peak tool speed')).claimIds = ['c-12', 'c-13'];
    });
    expect(codesFound).toEqual(['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});
