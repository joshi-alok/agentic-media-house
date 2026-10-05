## Milestone 3 (part A) — Gate hardening

**Goal:** close the holes in the gate that a review of Plan 1 found, before the Desk (Plan 2) starts writing pieces against it. Milestones 0 to 2 built a gate that catches 40 seeded defects, but the review showed places where a model could still get text onto the site without the code looking at it: the first word of every sentence, the section headings, numbers written out in words, the author, the description, the 14-day title window (which lived in the caller, not the gate), and the "What we couldn't verify" section, which could be short of the claims it should cover. Each task here is a test-first patch to code that already exists: a failing test, a minimal change, regenerated derived files and a commit.

| Task | What it closes |
|---|---|
| 71 | The first word of a sentence is no longer exempt from name checking: it must be a function word, a word of a claim the sentence cites, or on the allow-list (`G4_INITIAL_WORD_UNSUPPORTED`, and the same rule for analysis in G7). |
| 72 | Section headings are checked text: length, emptiness, figures, quotations and names (`G2_HEADING_TOO_LONG`, `G2_HEADING_EMPTY`, `G4_HEADING_NUMBER`, `G4_HEADING_QUOTE`, `G4_HEADING_NAME`). |
| 73 | Numbers written out in words are read and checked like digits; words that state an amount with no value to check ("half", "twice", "doubled", "tenfold") are refused (`G4_NUMBER_WORD_UNCHECKABLE`). |
| 74 | G1 rejects an empty description and any author but the Desk (`G1_DESCRIPTION_EMPTY`, `G1_AUTHOR_NOT_DESK`), the byline wording is one constant, and a test keeps G1 and the site's frontmatter schema from drifting apart. |
| 75 | The 14-day title window is part of the gate (`GateContext.recentTitles` carries dates, `GateConfig.titleWindowDays`). |
| 76 | One limitation sentence per group of claims instead of one per claim, and every claim that needs one must be covered (`G2_LIMITATION_COVERAGE`, `G8_LIMITATION_GROUP`). |

**Starting state:** Milestones 0 to 2 (Tasks 1 to 70) are finished and committed, and `npm run verify` passed from a clean install at the end of Task 70. `npm run typecheck`, `npm test`, `npm run evals:seeded` (40 of 40 cases caught), `npm run fixtures:check`, `npm run build` and `npm run build:fixtures` pass. `gate/` exports the schemas, the nine checks G1 to G9, `runGate`, `defaultContext`, `renderDraft` and the other names of Milestone 1; `gate/src/fixtures/golden.ts` is the golden piece (28 claims, a body of 665 words) that every test breaks in one place at a time; `evals/` holds the seeded defects; `site/` builds the fixture pieces that are generated from the golden piece.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/gate -- test/<name>.test.ts` (or `@robywire/evals`, `@robywire/site`). Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong. The one exception is a test that counts or locates something in the golden piece when a task says that the golden piece changes: those numbers are edited, and the task shows each edit.
- No package is installed or changed in this milestone. The toolchain is the one of Milestones 0 to 2.
- Source files contain ASCII only. Never type a character outside ASCII into a source file. Code uses `String.fromCharCode` where it needs one. A few lines that already exist in the tests contain an escape written with six ASCII characters (a backslash, `u`, and four hexadecimal digits, such as the one for a curly apostrophe); where an edit below shows one, type those six characters exactly. If your tool turns one into the character itself, undo that, because the tests would then contain a character outside ASCII.
- **Every new failure code** needs four things, all in the task that adds it: a unit test, a seeded-defect case in `evals/src/cases/`, an entry in the code list of its check (which feeds `ALL_FAILURE_CODES`), and a plain-English label in `site/src/lib/reasons.ts`. Tests fail until each exists: `gate/test/failure-codes.test.ts` for the list, `evals/test/coverage.test.ts` for the seeded case, `site/test/reasons.test.ts` for the label.
- The descriptions of the seeded defects are printed on the `/method` page of the production site, where the audit (check A13) forbids the name of the fictional company. A description must not contain it; a test checks.
- Anything that the gate's behaviour changes is regenerated, never edited by hand: `npm run evals:seeded` rewrites `evals/scoreboard/seeded.json`, and `npm run fixtures:generate --workspace @robywire/site` rewrites the fixture pieces. Both files are committed with the task that changes them.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** none are added. This milestone was verified with the versions of Milestones 0 to 2 (Node 22, TypeScript 6.0.3 in the repository root and `site` and 7.0.2 in `gate` and `evals`, Astro 7.3.5, Zod 4.6.5, Vitest 5.0.3).

---

### Task 71: Ground the first word of every sentence

**Files:**
- Create: `gate/src/grounding.ts` (the list of opening words, and the word sets the grounding rules compare)
- Modify: `gate/src/tokens.ts` (`extractTokens` reports the first word)
- Modify: `gate/src/checks/g4-values.ts` (new code `G4_INITIAL_WORD_UNSUPPORTED`)
- Modify: `gate/src/checks/g7-analysis.ts` (the first word of an analysis sentence)
- Modify: `gate/src/index.ts` (export the new module)
- Modify: `evals/src/cases/claims.ts`, `evals/src/cases/sourcing-analysis.ts` (two seeded defects), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `site/src/lib/reasons.ts` (the plain-English label of the new code)
- Test: `gate/test/grounding.test.ts` (new), `gate/test/tokens.test.ts`, `gate/test/g4-values.test.ts`, `gate/test/g7-analysis.test.ts`

Check G4 makes sure that every number, date and name in a fact sentence comes from a claim that the sentence cites. A *name* is a capitalised word, but every sentence starts with a capital letter, so `extractTokens` skips the first word of a sentence: it cannot tell "Shipments" from "Harlow". That leaves a hole. A made-up company at the start of a fact sentence ("Harlow Logistics plans a plant at Tarnmoor.") has only its second word checked, and the second word, "Logistics", is a real word of a real claim. This task closes the hole.

The rule. `extractTokens` now also reports `initialWord`: the first word of the sentence, as written, when it would have been a name if it were not first (it starts with a capital letter, is written in capitals, or mixes letters and digits). G4 accepts that word only if one of these is true:

1. It is a *sentence starter*: a function word such as `the`, `it`, `however` or `in`. The list is the exported constant `SENTENCE_STARTERS`. It holds articles, determiners, pronouns, prepositions, conjunctions and sentence adverbs, and no noun and no verb. A noun or a verb that opens a sentence has to come from a claim.
2. It is a whole word, in any case, of a claim that the sentence cites: of the claim's `text`, its `label`, its quoted passage (`span.quote`), one of its name values, or its outlet. The outlet counts because an attributed sentence has to open with it ("Mercer Wire reports that 7 investors took part in the round.").
3. It is on the allow-list of the context (`ctx.nameAllowList`: month names, weekdays and a few acronyms).

Otherwise G4 reports the new code `G4_INITIAL_WORD_UNSUPPORTED`. G7 gets the same rule for analysis sentences, which cite no claims of their own to vouch for a word: their first word must be a sentence starter, be on the allow-list, or be a whole word, in any case, of some *fact* sentence of the piece; otherwise G7 reports `G7_ANALYSIS_NEW_VALUE`.

The golden piece needed no change: every one of its sentences already opens with a function word or with a word of the claims it cites.

- [ ] **Step 1: Write the failing tests**

The new test file has three jobs. It gives every entry of `SENTENCE_STARTERS` a part of speech in a table, so that nobody can add a noun or a verb without the test table saying what it is. It tests the word sets. And it tests the decision, `openingWordAccepted`.

**Create `gate/test/grounding.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { cloneGolden } from '../src/fixtures';
import {
  SENTENCE_STARTERS,
  claimTexts,
  claimWords,
  isSentenceStarter,
  openingWordAccepted,
  wordSet,
} from '../src/grounding';
import { claimById } from './helpers';

// A curly apostrophe, written as a code so that this file stays ASCII.
const CURLY = String.fromCharCode(0x2019);

// SENTENCE_STARTERS is a list of function words. Every entry is placed in a
// part of speech below, so a reviewer can see why it is there, and the test
// requires the table and the constant to agree exactly. A noun or a verb has no
// row to sit in, so it cannot be added without this file saying what it is.
const FUNCTION_WORDS: Record<string, string[]> = {
  article: ['a', 'an', 'the'],
  determiner: ['this', 'that', 'these', 'those', 'some', 'many', 'most', 'all', 'both', 'each', 'every', 'no', 'any', 'another', 'other', 'such'],
  possessive: ['its', 'our', 'their', 'his', 'her'],
  pronoun: ['it', 'we', 'they', 'he', 'she', 'one', 'there', 'here'],
  question: ['what', 'which', 'who', 'whom', 'whose', 'why', 'how'],
  preposition: [
    'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as', 'at', 'before', 'below', 'between', 'beyond',
    'by', 'despite', 'during', 'for', 'from', 'in', 'into', 'of', 'on', 'over', 'per', 'through', 'throughout', 'to', 'toward',
    'towards', 'under', 'until', 'upon', 'via', 'with', 'within', 'without',
  ],
  conjunction: ['although', 'and', 'because', 'but', 'if', 'or', 'since', 'so', 'though', 'unless', 'when', 'whereas', 'where', 'whether', 'while', 'yet'],
  adverb: [
    'additionally', 'also', 'earlier', 'even', 'however', 'instead', 'later', 'meanwhile', 'not', 'now', 'only', 'overall',
    'recently', 'separately', 'still', 'then', 'therefore', 'thus', 'today',
  ],
};

describe('SENTENCE_STARTERS', () => {
  it('is exactly the function words in the table above, each with a part of speech', () => {
    expect([...SENTENCE_STARTERS].sort()).toEqual(Object.values(FUNCTION_WORDS).flat().sort());
  });

  it('lists each word once, in lowercase letters only', () => {
    expect(new Set(SENTENCE_STARTERS).size).toBe(SENTENCE_STARTERS.length);
    for (const word of SENTENCE_STARTERS) expect(word, word).toMatch(/^[a-z]+$/);
  });

  it('is frozen, so no caller can add a word', () => {
    expect(Object.isFrozen(SENTENCE_STARTERS)).toBe(true);
  });

  it('contains the opening words the design names', () => {
    for (const word of ['the', 'a', 'an', 'it', 'its', 'this', 'however', 'meanwhile', 'one', 'not', 'only', 'still', 'such']) {
      expect(SENTENCE_STARTERS, word).toContain(word);
    }
  });

  it('contains no noun, no verb and no name that a news sentence might open with', () => {
    const openers = [
      'shipments', 'plans', 'sales', 'company', 'companies', 'robot', 'robots', 'arm', 'arms', 'plant', 'figures', 'analysts',
      'fixture', 'brindle', 'tarnmoor', 'harlow', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'will', 'can', 'may', 'do',
      'does', 'said', 'says', 'announced', 'reported', 'half', 'twice', 'double', 'several', 'first', 'second', 'zero',
    ];
    for (const word of openers) expect(SENTENCE_STARTERS, word).not.toContain(word);
  });
});

describe('isSentenceStarter', () => {
  it.each([
    ['The', true],
    ['the', true],
    ['HOWEVER', true],
    ["It's", true],
    [`That${CURLY}s`, true],
    ['Shipments', false],
    ['Harlow', false],
    ['', false],
  ])('says %j is %s', (word, expected) => {
    expect(isSentenceStarter(word)).toBe(expected);
  });
});

describe('wordSet', () => {
  it('lists the words of the texts in lowercase, without the punctuation around them', () => {
    expect([...wordSet(['Shipments began, (Tarnmoor) on Monday.'])].sort()).toEqual(['began', 'monday', 'on', 'shipments', 'tarnmoor']);
  });

  it('reads a possessive as the word and keeps a dotted abbreviation together', () => {
    const words = wordSet(["Brindle's plant in the U.S. grew."]);
    expect(words.has('brindle')).toBe(true);
    expect(words.has('us')).toBe(true);
  });

  it('keeps a hyphenated word whole and also lists its parts', () => {
    const words = wordSet(['The FX-1 does tote-picking.']);
    for (const word of ['fx-1', 'fx', '1', 'tote-picking', 'tote', 'picking']) expect(words.has(word), word).toBe(true);
  });

  it('is the union over every text, and empty for none', () => {
    expect([...wordSet(['one two', 'three'])].sort()).toEqual(['one', 'three', 'two']);
    expect(wordSet([]).size).toBe(0);
  });

  it('matches a whole word only, never part of a longer word', () => {
    expect(wordSet(['Shipments began.']).has('ship')).toBe(false);
  });
});

describe('claimTexts and claimWords', () => {
  it('give the text, label, quoted passage, name values and outlet of a claim, and no other value', () => {
    const claim = structuredClone(claimById(cloneGolden().claims, 'c-5'));
    claim.source.outlet = 'Mercer Wire';
    expect(claimTexts(claim)).toEqual([
      claim.text,
      claim.label,
      claim.span.quote,
      'Tarnmoor',
      'Mercer Wire',
    ]);
  });

  it('leaves out the outlet when the claim has none', () => {
    const claim = claimById(cloneGolden().claims, 'c-8');
    expect(claimTexts(claim)).toEqual([claim.text, claim.label, claim.span.quote]);
  });

  it('claimWords is the word set of every text of every claim', () => {
    const { claims } = cloneGolden();
    const words = claimWords([claimById(claims, 'c-8'), claimById(claims, 'c-18')]);
    for (const word of ['payload', 'rated', 'kilograms', 'corvane', 'partners', 'lead', 'investor']) expect(words.has(word), word).toBe(true);
    expect(words.has('tarnmoor')).toBe(false);
  });
});

describe('openingWordAccepted', () => {
  const grounded = new Set(['shipments', 'tarnmoor']);
  const allowed = new Set(['august']);

  it.each([
    ['a function word', 'However', true],
    ['a word of the claims', 'Shipments', true],
    ['a word of the claims in another case', 'TARNMOOR', true],
    ['a word of the claims with a possessive', "Tarnmoor's", true],
    ['a word on the allow-list', 'August', true],
    ['a name that nothing supports', 'Harlow', false],
    ['an ordinary noun that nothing supports', 'Plans', false],
  ])('%s: %s is %s', (_why, word, expected) => {
    expect(openingWordAccepted(word, grounded, allowed)).toBe(expected);
  });
});
```

`extractTokens` has to report the first word. Three older expectations in the token tests now also see the new field; they are updated here.

**In `gate/test/tokens.test.ts`, replace:**
```ts
      dates: [{ raw: '29 September 2026', iso: '2026-09-29', precision: 'day' }],
      names: ['robotics', 'corvane', 'partners'],
    });
  });
```

**with:**
```ts
      dates: [{ raw: '29 September 2026', iso: '2026-09-29', precision: 'day' }],
      names: ['robotics', 'corvane', 'partners'],
      initialWord: 'Fixture',
    });
  });
```

**In `gate/test/tokens.test.ts`, replace:**
```ts
      dates: [],
      names: [],
    });
  });
```

**with:**
```ts
      dates: [],
      names: [],
      initialWord: 'Peak',
    });
  });
```

**In `gate/test/tokens.test.ts`, replace:**
```ts
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], names: ['ceo', 'monday'] });
  });

```

**with:**
```ts
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], names: ['ceo', 'monday'], initialWord: 'The' });
  });

```

**In `gate/test/tokens.test.ts`, replace:**
```ts
});

describe('toNameToken', () => {
  it.each([
```

**with:**
```ts
});

describe('extractTokens: the first word', () => {
  const initial = (text: string) => extractTokens(text).initialWord;

  it.each([
    ['Harlow Logistics plans a plant.', 'Harlow'],
    ['Shipments began in the spring.', 'Shipments'],
    ['The arm shipped.', 'The'],
    ['However, the arm shipped.', 'However'],
    ['CEO Jane Doe resigned.', 'CEO'],
    ['FX-1 arms shipped.', 'FX-1'],
    ['H1 results rose.', 'H1'],
    ['(Fixture) arms shipped.', 'Fixture'],
    ["Brindle's plant opened.", "Brindle's"],
    ['A plant opened.', 'A'],
  ])('reports the first word of %j, as written: %j', (text, expected) => {
    expect(initial(text)).toBe(expected);
  });

  it.each([
    ['shipments began in the spring.'],
    ['iRobot opened a plant.'],
    ['24 August 2026, Fixture shipped it.'],
    ['12 kg Acme arms.'],
    ['$450 million was raised.'],
    ['2026 will be the year.'],
    ['"Quoted words," said Jane.'],
    [''],
    ['...'],
  ])('reports no first word for %j', (text) => {
    expect(extractTokens(text)).not.toHaveProperty('initialWord');
  });

  it('keeps the first word out of the list of names, which starts at the second word', () => {
    const tokens = extractTokens('Harlow Logistics plans a plant.');
    expect(tokens.initialWord).toBe('Harlow');
    expect(tokens.names).toEqual(['logistics']);
  });

  it('reads the first word after the quoted passage is taken out', () => {
    expect(initial('"We shipped," Harlow said.')).toBe('Harlow');
  });
});

describe('toNameToken', () => {
  it.each([
```

In the G4 tests, many sentences open with a capitalised word that is not a function word ("Plans at Acme grew."). Under the new rule such a sentence needs a claim that contains the word, which these small tests do not give it, so each now opens with "The" (or "She") and keeps testing what it tested before. The helper's description, `Ok.`, becomes `It is fine.` for the same reason. The test that said the first word is exempt now says it has its own rule, and a new group of tests covers the rule.

**In `gate/test/g4-values.test.ts`, replace:**
```ts
      author: { name: 'Robywire Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'Ok.', claimIds: cited },
      opening: [],
      takeaways: [],
```

**with:**
```ts
      author: { name: 'Robywire Desk' },
      title: { kind: 'fact', text, claimIds: cited },
      description: { kind: 'fact', text: 'It is fine.', claimIds: cited },
      opening: [],
      takeaways: [],
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
    ['It moves at 2.3 m/s.', num('2.3 metres per second', '2.3', 'm/s')],
    ['It moves at 2.3 metres per second.', num('2.3 m/s', '2.3', 'm/s')],
    ['Cycle time fell 18%.', num('18 per cent', '18', '%')],
    ['Cycle time fell 18 percent.', num('18%', '18', '%')],
    ['It raised $450 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450M.', num('$450 million', '450000000', 'USD')],
```

**with:**
```ts
    ['It moves at 2.3 m/s.', num('2.3 metres per second', '2.3', 'm/s')],
    ['It moves at 2.3 metres per second.', num('2.3 m/s', '2.3', 'm/s')],
    ['The cycle time fell 18%.', num('18 per cent', '18', '%')],
    ['The cycle time fell 18 percent.', num('18%', '18', '%')],
    ['It raised $450 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450M.', num('$450 million', '450000000', 'USD')],
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
    ['It reaches 1 km.', num('1000 m', '1000', 'm')],
    ['It does 1,200 picks an hour.', num('1.3k', '1300')],
    ['Cycle time fell 19%.', num('18 per cent', '18', '%')],
    ['It raised $45 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450 million.', num('EUR 450 million', '450000000', 'EUR')],
```

**with:**
```ts
    ['It reaches 1 km.', num('1000 m', '1000', 'm')],
    ['It does 1,200 picks an hour.', num('1.3k', '1300')],
    ['The cycle time fell 19%.', num('18 per cent', '18', '%')],
    ['It raised $45 million.', num('USD 450 million', '450000000', 'USD')],
    ['It raised $450 million.', num('EUR 450 million', '450000000', 'EUR')],
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
describe('G4 names', () => {
  it('accepts a name that a cited claim lists as a name value', () => {
    expect(codes(mini('Shipments by Acme rose.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('rejects a name that no cited claim lists', () => {
    const out = run(mini('Shipments by Acme rose.', [claimOf([who('Fixture Robotics')])]));
    expect(out.failures).toEqual([
      {
```

**with:**
```ts
describe('G4 names', () => {
  it('accepts a name that a cited claim lists as a name value', () => {
    expect(codes(mini('The shipments by Acme rose.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('rejects a name that no cited claim lists', () => {
    const out = run(mini('The shipments by Acme rose.', [claimOf([who('Fixture Robotics')])]));
    expect(out.failures).toEqual([
      {
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
  it('compares each word of a multi-word name, in any case', () => {
    const claim = claimOf([who('Brindle Logistics')]);
    expect(codes(mini('Plans at Brindle Logistics grew.', [claim]))).toEqual([]);
    expect(codes(mini('Plans at the Logistics site grew.', [claim]))).toEqual([]);
    expect(codes(mini('Plans at Brindle Freight grew.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('reads a possessive as the name', () => {
    expect(codes(mini("Plans at Acme's plant grew.", [claimOf([who('Acme')])]))).toEqual([]);
    expect(codes(mini('Plans at Acme\u2019s plant grew.', [claimOf([who('Acme')])]))).toEqual([]);
  });

  it('accepts a model name and an acronym that a claim lists', () => {
    expect(codes(mini('Sales of the FX-1 and the ISO rules rose.', [claimOf([who('FX-1'), who('ISO')])]))).toEqual([]);
    expect(codes(mini('Sales of the FX-1 rose.', [claimOf([who('FX-2')])]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

```

**with:**
```ts
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

```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
    const a = claimOf([who('Acme')], { id: 'c-1' });
    const b = claimOf([who('Zenith')], { id: 'c-2' });
    expect(codes(mini('Plans at Acme and Zenith grew.', [a, b]))).toEqual([]);
    expect(codes(mini('Plans at Acme and Zenith grew.', [a, b], ['c-1']))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('does not take a name from the claim text, only from its name values', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')], { text: 'Acme lifts 12 kg.' });
    expect(codes(mini('Plans at Acme grew by 12 kg.', [claim]))).toEqual(['G4_NAME_UNSUPPORTED']);
  });

  it('accepts a word on the allow-list without a claim, and an allow-list passed in the context', () => {
    expect(codes(mini('It shipped in August, on a Monday, said the CEO of the US firm.', [claimOf([])]))).toEqual([]);
    expect(codes(mini('Plans at Acme grew.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('Plans at Acme grew.', [claimOf([])]), { nameAllowList: ['acme'] })).toEqual([]);
  });

  it('exempts the first word of the sentence, so a sentence-initial name is not caught here', () => {
    expect(codes(mini('Acme ships arms.', [claimOf([])]))).toEqual([]);
  });

  it('is deliberately strict: a capitalised ordinary word is reported, and a revision fixes it', () => {
    expect(codes(mini('Sales rose, Analysts said.', [claimOf([])]))).toEqual(['G4_NAME_UNSUPPORTED']);
    expect(codes(mini('Sales rose, analysts said.', [claimOf([])]))).toEqual([]);
  });

  it('reports each unsupported name once', () => {
    const out = run(mini('Plans at Acme and Acme and Zenith grew.', [claimOf([])]));
    expect(out.failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['acme', 'zenith']);
  });
});

describe('G4 names: the outlet of a tier-2 claim', () => {
  const fromOutlet = (id: string, outlet: string) =>
```

**with:**
```ts
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
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
  it('is a name the sentence may use, because an attribution has to say who reported it', () => {
    const claim = fromOutlet('c-1', 'The Robot Report');
    expect(codes(mini('Sales rose to 7, The Robot Report says.', [claim]))).toEqual([]);
  });

  it('is accepted word by word, in any case', () => {
    expect(codes(mini('Sales rose to 7, says MERCER wire.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([]);
  });

  it('is not accepted from a claim the sentence does not cite', () => {
    const claim = fromOutlet('c-2', 'Mercer Wire');
    expect(codes(mini('Sales rose to 7, says Mercer Wire.', [claim], ['c-2']))).toEqual([]);
    expect(codes(mini('Sales rose to 7, says Mercer Wire.', [claim, claimOf([num('7', '7')], { id: 'c-1' })], ['c-1']))).toEqual([
      'G4_NAME_UNSUPPORTED',
      'G4_NAME_UNSUPPORTED',
```

**with:**
```ts
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
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts

  it('does not make any other capitalised word acceptable', () => {
    expect(codes(mini('Sales rose to 7, says Mercer Wire in Harlow.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([
      'G4_NAME_UNSUPPORTED',
    ]);
```

**with:**
```ts

  it('does not make any other capitalised word acceptable', () => {
    expect(codes(mini('The sales rose to 7, says Mercer Wire in Harlow.', [fromOutlet('c-1', 'Mercer Wire')]))).toEqual([
      'G4_NAME_UNSUPPORTED',
    ]);
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('Jane said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
  });

```

**with:**
```ts
describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
    expect(codes(mini('She said "Acme ships 500 units on 3 May 2027" today.', [claimOf([])]))).toEqual([]);
  });

```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
  it('is case-sensitive, as the quote is a verbatim extract', () => {
    const claim = claimOf([who('Acme')], { span: { start: 0, end: 12, quote: 'made by acme' } });
    expect(codes(mini('Plans at Acme grew.', [claim]))).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

```

**with:**
```ts
  it('is case-sensitive, as the quote is a verbatim extract', () => {
    const claim = claimOf([who('Acme')], { span: { start: 0, end: 12, quote: 'made by acme' } });
    expect(codes(mini('The plans at Acme grew.', [claim]))).toEqual(['G4_VALUE_NOT_IN_SPAN']);
  });

```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
      findSentence(g.draft, (sentence) => sentence.text.startsWith('Peak tool speed')).claimIds = ['c-12', 'c-13'];
    });
    expect(codesFound).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});
```

**with:**
```ts
      findSentence(g.draft, (sentence) => sentence.text.startsWith('Peak tool speed')).claimIds = ['c-12', 'c-13'];
    });
    expect(codesFound).toEqual(['G4_INITIAL_WORD_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_UNSUPPORTED']);
  });
});
```

In the G7 tests, the old test that exempted the first word is replaced, one sentence that opened with an invented word is reworded, and a new group covers the rule.

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts

  it('reports a new date once, however often the sentence repeats it', () => {
    expect(codes(run(saying('Narrower since 5 August 2026, and again since 5 August 2026.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

```

**with:**
```ts

  it('reports a new date once, however often the sentence repeats it', () => {
    expect(codes(run(saying('The gap is narrower since 5 August 2026, and again since 5 August 2026.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
  });

  it('exempts the first word of the sentence, as the name check for facts does', () => {
    expect(run(saying('Harlow reported something similar.'))).toEqual({ failures: [], holdReasons: [] });
  });

```

**with:**
```ts
  });

  it('does not read the first word as a name: it has its own rule, below', () => {
    expect(run(saying('Ashvale reported something similar, as Harlow did.')).failures.map((failure) => failure.message)).toEqual([
      `the analysis sentence at ${ANALYSIS_AT} introduces the name "harlow", which no fact sentence contains`,
    ]);
  });

```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
        'The arm itself weighs 83 kg and draws 650 W in typical use, said Harlow.';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
```

**with:**
```ts
        'The arm itself weighs 83 kg and draws 650 W in typical use, said Harlow.';
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G7_ANALYSIS_NEW_VALUE: the opening word', () => {
  it('fails an analysis sentence that opens with a name no fact sentence contains, and says which', () => {
    expect(run(saying('Harlow reported something similar.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the opening word "Harlow", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a function word', 'However, that is normal for a figure quoted as an upper limit.'],
    ['a name that a fact sentence states', 'Ashvale reported something similar.'],
    ['a name in another case', 'ASHVALE reported something similar.'],
    ['a name with a possessive ending', "Ashvale's rate is below the maximum."],
    ['an ordinary word that a fact sentence uses', 'Picks fell below the maximum.'],
    ['a word that a fact sentence has only as its own first word', 'Peak speeds are normal for a figure quoted as an upper limit.'],
    ['a word on the allow-list', 'Monday brought a similar rate.'],
    ['a lowercase word', 'harlow reported something similar.'],
    ['a number', '940 picks is below the maximum.'],
  ])('allows an opening with %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('takes the allow-list from the context', () => {
    expect(codes(run(saying('Harlow reported something similar.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
    expect(run(saying('Harlow reported something similar.'), { nameAllowList: ['harlow'] })).toEqual({ failures: [], holdReasons: [] });
  });

  it('takes the words of the fact sentences only: not another analysis sentence, not a limitation', () => {
    const second = run((g) => {
      saying('Harlow reported something similar.')(g);
      addAnalysis(g, 1);
      findSentence(g.draft, (sentence) => sentence.text === 'That is a plain reading of the figures.').text = 'Harlow also did.';
    });
    expect(codes(second)).toEqual(['G7_ANALYSIS_NEW_VALUE', 'G7_ANALYSIS_NEW_VALUE']);

    const limitation = run(saying('Measurement was not independent.'));
    expect(codes(limitation)).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('takes a word from a fact sentence anywhere in the piece, the title and the description included', () => {
    expect(run(saying('Robotics is a field where such gaps are normal.'))).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports the opening word before the other new values of the sentence', () => {
    const output = run(saying('Harlow saw 22% less.'));
    expect(output.failures.map((failure) => failure.message.match(/introduces the (.*?),/)?.[1])).toEqual(['opening word "Harlow"', 'number "22%"']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/grounding.test.ts test/tokens.test.ts test/g4-values.test.ts test/g7-analysis.test.ts`
Expected: FAIL — `Cannot find module '../src/grounding'`, `extractTokens: the first word`, `G4 opening words` and `the opening word`; `Test Files  4 failed (4)`.

- [ ] **Step 3: Write the implementation**

The new module holds everything the three checks share. `SENTENCE_STARTERS` is frozen. `wordSet` turns texts into the set of their whole words in comparison form (lowercase, no possessive ending, and a hyphenated word both whole and by its parts). `claimTexts` and `claimWords` say which text of a claim can vouch for a word. `openingWordAccepted` is the decision.

**Create `gate/src/grounding.ts`:**
```ts
import type { Claim } from './schemas';
import { normaliseQuotes, sentenceWords } from './text';
import { toNameToken } from './tokens';

// Words that begin a sentence are exempt from name checking, because every
// sentence begins with a capital letter. That exemption is also a hole: a made-up
// company at the start of a sentence ("Harlow Logistics plans ...") would only
// have its second word checked. These helpers close it. An opening word that
// looks like a name is accepted when it is an ordinary function word, when a claim
// the sentence rests on contains it, or when the allow-list names it.

/**
 * Function words that may open a sentence without being found in a claim:
 * articles, determiners, pronouns, prepositions, conjunctions and sentence
 * adverbs. There is no noun and no verb in the list, and there must never be:
 * the first word of a news sentence is often a name, a noun or a verb, and
 * those have to come from a claim. gate/test/grounding.test.ts gives every
 * entry a part of speech.
 */
export const SENTENCE_STARTERS: readonly string[] = Object.freeze([
  // articles and determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'some', 'many', 'most', 'all', 'both', 'each', 'every', 'no', 'any', 'another', 'other', 'such',
  // possessives and pronouns
  'its', 'our', 'their', 'his', 'her', 'it', 'we', 'they', 'he', 'she', 'one', 'there', 'here',
  // question and relative words
  'what', 'which', 'who', 'whom', 'whose', 'why', 'how',
  // prepositions
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as', 'at', 'before', 'below', 'between', 'beyond',
  'by', 'despite', 'during', 'for', 'from', 'in', 'into', 'of', 'on', 'over', 'per', 'through', 'throughout', 'to', 'toward',
  'towards', 'under', 'until', 'upon', 'via', 'with', 'within', 'without',
  // conjunctions
  'although', 'and', 'because', 'but', 'if', 'or', 'since', 'so', 'though', 'unless', 'when', 'whereas', 'where', 'whether', 'while', 'yet',
  // sentence adverbs
  'additionally', 'also', 'earlier', 'even', 'however', 'instead', 'later', 'meanwhile', 'not', 'now', 'only', 'overall',
  'recently', 'separately', 'still', 'then', 'therefore', 'thus', 'today',
]);

const STARTER_SET: ReadonlySet<string> = new Set(SENTENCE_STARTERS);

/** The comparison form of one word: plain quotes, lowercase, no possessive ending. */
const comparable = (word: string): string => toNameToken(normaliseQuotes(word));

/** Is `word` one of SENTENCE_STARTERS, in any case and with or without a possessive ending ("It's")? */
export function isSentenceStarter(word: string): boolean {
  return STARTER_SET.has(comparable(word));
}

/**
 * The whole words of `texts`, each in the comparison form of `toNameToken`
 * (lowercase, no trailing possessive). A hyphenated word is listed whole and
 * also by its parts, so "tote-picking" supports "Tote" as well as "Tote-picking".
 * Only whole words are compared: "ship" is not in "shipments".
 */
export function wordSet(texts: Iterable<string>): Set<string> {
  const words = new Set<string>();
  for (const text of texts) {
    for (const word of sentenceWords(text)) {
      words.add(toNameToken(word));
      for (const part of word.split('-')) {
        if (part !== '') words.add(toNameToken(part));
      }
    }
  }
  return words;
}

/**
 * The text a claim can stand behind: what it says, what it is called, the
 * passage it quotes, the names it lists and the outlet that reported it.
 */
export function claimTexts(claim: Claim): string[] {
  const names = claim.values.filter((value) => value.kind === 'name').map((value) => value.raw);
  return [claim.text, claim.label, claim.span.quote, ...names, ...(claim.source.outlet === undefined ? [] : [claim.source.outlet])];
}

/** The word set of every text of every claim in `claims`. */
export function claimWords(claims: Iterable<Claim>): Set<string> {
  return wordSet([...claims].flatMap(claimTexts));
}

/**
 * May a sentence open with `word`, which looks like a name? Yes when it is a
 * sentence starter, when it is in `grounded` (the words of the claims, or of
 * the fact sentences, that vouch for it), or when it is on the allow-list.
 * `allowList` is the context's, in lowercase.
 */
export function openingWordAccepted(word: string, grounded: ReadonlySet<string>, allowList: ReadonlySet<string>): boolean {
  const token = comparable(word);
  return STARTER_SET.has(token) || grounded.has(token) || allowList.has(token);
}
```

`extractTokens` reports the first word. The first word is still left out of `names`.

**In `gate/src/tokens.ts`, replace:**
```ts
  numbers: NumberToken[];
  dates: DateToken[];
  /** Lowercased name tokens, each listed once, in order of first appearance. */
  names: string[];
}

```

**with:**
```ts
  numbers: NumberToken[];
  dates: DateToken[];
  /** Lowercased name tokens, each listed once, in order of first appearance. The first word of the sentence is not among them. */
  names: string[];
  /**
   * The first word of the sentence as written, without the punctuation around
   * it, when it would have been a name token had it not been first: it starts
   * with a capital letter or mixes letters and digits. Absent otherwise,
   * for example when the sentence opens with a lowercase word, a number or a date.
   */
  initialWord?: string;
}

```

**In `gate/src/tokens.ts`, replace:**
```ts
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits.
 *
 * Name detection is deliberately strict: it reports any capitalised word, so
```

**with:**
```ts
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits. The first
 *    word is every sentence's capital letter, so it is not a name token; when
 *    it looks like one it is reported as `initialWord`, and the checks ground it
 *    with `openingWordAccepted` instead.
 *
 * Name detection is deliberately strict: it reports any capitalised word, so
```

**In `gate/src/tokens.ts`, replace:**
```ts
  });

  const names = sentenceWords(withoutNumbers).slice(1).filter(isNameWord).map(toNameToken);
  return { numbers, dates, names: [...new Set(names)] };
}
```

**with:**
```ts
  });

  const [first, ...rest] = sentenceWords(withoutNumbers);
  const names = rest.filter(isNameWord).map(toNameToken);
  const tokens: SentenceTokens = { numbers, dates, names: [...new Set(names)] };
  if (first !== undefined && isNameWord(first)) tokens.initialWord = first;
  return tokens;
}
```

The new module is part of the package's public names.

**In `gate/src/index.ts`, replace:**
```ts
export * from './constants';
export * from './gate';
export * from './limitations';
export * from './normalise';
```

**with:**
```ts
export * from './constants';
export * from './gate';
export * from './grounding';
export * from './limitations';
export * from './normalise';
```

G4 gets its new code, listed in `G4_CODES`, and reports it before the other failures of the sentence (it is the first word).

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
import type { ParsedNumber } from '../normalise';
import type { Claim, ClaimValue } from '../schemas';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';
```

**with:**
```ts
import type { ParsedNumber } from '../normalise';
import type { Claim, ClaimValue } from '../schemas';
import { claimWords, openingWordAccepted } from '../grounding';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
  'G4_NAME_UNSUPPORTED',
  'G4_VALUE_NOT_IN_SPAN',
] as const;

```

**with:**
```ts
  'G4_NAME_UNSUPPORTED',
  'G4_VALUE_NOT_IN_SPAN',
  'G4_INITIAL_WORD_UNSUPPORTED',
] as const;

```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
 * revision round, a false negative would let an invented name through.
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
```

**with:**
```ts
 * revision round, a false negative would let an invented name through.
 *
 * The first word of a sentence is not a name token, because every sentence
 * starts with a capital letter. When it looks like a name it has a rule of its
 * own (G4_INITIAL_WORD_UNSUPPORTED): it must be a function word from
 * SENTENCE_STARTERS, or a word of the text, label, quoted passage, name values or
 * outlet of a claim the sentence cites, or on the allow-list. Without it, a
 * made-up company at the start of a sentence would only have its second word checked.
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });

    const seenNumbers = new Set<string>();
    for (const token of tokens.numbers) {
```

**with:**
```ts
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where });

    if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, claimWords(cited), ctx.nameAllowList)) {
      fail(
        'G4_INITIAL_WORD_UNSUPPORTED',
        `the sentence at ${where} opens with "${tokens.initialWord}", which is neither an ordinary opening word nor a word of any claim this sentence cites: start with an ordinary word, or cite the claim that mentions it`,
      );
    }

    const seenNumbers = new Set<string>();
    for (const token of tokens.numbers) {
```

G7 collects the words of the fact sentences and applies the same decision to an analysis sentence.

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
import type { DateToken, NumberToken } from '../tokens';
import { extractTokens } from '../tokens';
import { allSentences, describeLocation } from '../sentences';

```

**with:**
```ts
import type { DateToken, NumberToken } from '../tokens';
import { extractTokens } from '../tokens';
import { openingWordAccepted, wordSet } from '../grounding';
import { allSentences, describeLocation } from '../sentences';

```

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 */
export const checkG7: Check = ({ draft }, ctx) => {
```

**with:**
```ts
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 *   The first word of an analysis sentence has its own rule: when it looks like a name
 *   it must be a function word from SENTENCE_STARTERS, a word on the allow-list, or
 *   a whole word (any case, anywhere) of some fact sentence of the piece.
 */
export const checkG7: Check = ({ draft }, ctx) => {
```

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
  const dates: DateToken[] = [];
  const names = new Set<string>();
  for (const item of sentences.filter((located) => located.sentence.kind === 'fact')) {
    const tokens = extractTokens(item.sentence.text);
    numbers.push(...tokens.numbers);
```

**with:**
```ts
  const dates: DateToken[] = [];
  const names = new Set<string>();
  const facts = sentences.filter((located) => located.sentence.kind === 'fact');
  const factWords = wordSet(facts.map((item) => item.sentence.text));
  for (const item of facts) {
    const tokens = extractTokens(item.sentence.text);
    numbers.push(...tokens.numbers);
```

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
      });

    for (const token of new Map(tokens.numbers.map((number) => [number.raw, number])).values()) {
      if (!numbers.some((fact) => fact.value === token.value && (token.unit === undefined || fact.unit === token.unit))) {
```

**with:**
```ts
      });

    if (tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, factWords, ctx.nameAllowList)) {
      fail(`opening word "${tokens.initialWord}"`);
    }
    for (const token of new Map(tokens.numbers.map((number) => [number.raw, number])).values()) {
      if (!numbers.some((fact) => fact.value === token.value && (token.unit === undefined || fact.unit === token.unit))) {
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  31 passed (31)`.

- [ ] **Step 5: Show that the new code has no seeded defect and no label yet**

A new failure code needs a seeded defect that proves the gate catches it, and a plain-English label for the holds page. Two older tests insist on both. They fail now, and each names the code.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G4_INITIAL_WORD_UNSUPPORTED`.

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G4_INITIAL_WORD_UNSUPPORTED`.

- [ ] **Step 6: Add the seeded defects and the label**

Two cases. `invented-name-at-sentence-start` makes a fact sentence open with a company that its claim never mentions. `analysis-invented-initial-word` makes the analysis sentence open with a company that no fact sentence mentions.

**In `evals/src/cases/claims.ts`, replace:**
```ts
    },
  },
  {
    id: 'value-outside-span',
```

**with:**
```ts
    },
  },
  {
    id: 'invented-name-at-sentence-start',
    check: 'G4',
    code: 'G4_INITIAL_WORD_UNSUPPORTED',
    description: 'A sentence opens with a company, Harlow Logistics, that the claim it cites never mentions.',
    apply: (base) => {
      sentenceWith(base, 'Brindle Logistics plans to use').text = 'Harlow Logistics plans to use the arms at Tarnmoor for inbound trailer unloading.';
      return base;
    },
  },
  {
    id: 'value-outside-span',
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
    },
  },
  {
    id: 'analysis-new-name',
```

**with:**
```ts
    },
  },
  {
    id: 'analysis-invented-initial-word',
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence opens with a company, Harlow, that no fact sentence mentions.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
        'Harlow also found that the measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.';
      return base;
    },
  },
  {
    id: 'analysis-new-name',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G4_NAME_UNSUPPORTED: 'A name was not in the claims it cites',
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

**with:**
```ts
  G4_NAME_UNSUPPORTED: 'A name was not in the claims it cites',
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G4_INITIAL_WORD_UNSUPPORTED: 'A sentence opened with a name that no claim supports',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

The scoreboard file is generated from the cases; a test fails if it is out of date. Regenerate it.

Run: `npm run evals:seeded`
Expected: PASS — `42 of 42 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 8: Commit**

```bash
git add gate/src gate/test evals/src evals/scoreboard/seeded.json site/src/lib/reasons.ts
git commit -m "feat(gate): check the first word of a sentence against the claims it cites (G4, G7)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 72: Section headings are checked text

**Files:**
- Modify: `gate/src/config.ts` (new threshold `headingMax`)
- Modify: `gate/src/text.ts` (new function `hasQuoted`)
- Modify: `gate/src/checks/g2-structure.ts` (new codes `G2_HEADING_TOO_LONG` and `G2_HEADING_EMPTY`)
- Modify: `gate/src/checks/g4-values.ts` (new codes `G4_HEADING_NUMBER`, `G4_HEADING_QUOTE` and `G4_HEADING_NAME`)
- Modify: `evals/src/cases/frontmatter-structure.ts`, `evals/src/cases/claims.ts` (five seeded defects), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `site/src/lib/reasons.ts` (five labels)
- Test: `gate/test/config.test.ts`, `gate/test/text.test.ts`, `gate/test/g2-structure.test.ts`, `gate/test/g4-values.test.ts`, `evals/test/seeded.test.ts`

The checks read every sentence of a piece, but a section heading is not a sentence. It is free text from the composer, and checks G3 to G7 never look at it. A heading such as `Fixture Robotics ships 500 arms`, or one that names a company no claim mentions, or one that puts words in quotation marks, would pass the whole gate and be published. This task makes headings checked text.

Two rules go into G2, which checks the shape of a piece:

- `G2_HEADING_EMPTY`: the heading is blank after trimming. The renderer would write `## ` and nothing else.
- `G2_HEADING_TOO_LONG`: the heading is longer than `headingMax` characters (default 80, trimmed). The limit is a new field of the configuration, like `descriptionMax`.

Three rules go into G4, which checks values. A heading says what a section is about; it does not state facts, so it may carry no figure and no quotation, and any name in it has to be a name that the section itself rests on.

- `G4_HEADING_NUMBER`: the heading contains a number, a date or a currency amount. (Task 73 extends this to numbers written out in words.)
- `G4_HEADING_QUOTE`: the heading contains a double-quoted passage, empty or not. The new function `hasQuoted(text)` in `gate/src/text.ts` finds one, pairing the quotation marks the way `stripQuoted` does.
- `G4_HEADING_NAME`: the heading contains a capitalised word (or one that mixes letters and digits, such as `FX-1`) that is not supported. The first word counts too, under the rule of Task 71: it may be a function word from `SENTENCE_STARTERS`. A word is supported when it is a whole word, in any case, of the text, label, quoted passage, name values or outlet of a claim cited by a sentence *of that section* (the claims cited anywhere in its paragraphs, not the claims of other sections), or when it is on the allow-list. Each unsupported word is one failure.

For all of them, `where` is `section "<the heading>"`, the same form `G2_HEADING_QUESTION` already uses.

The golden piece needs no change: its headings are `What shipped`, `What the customer reports` and `What the filing shows`.

- [ ] **Step 1: Write the failing tests**

The configuration test lists every threshold, so it gains `headingMax`.

**In `gate/test/config.test.ts`, replace:**
```ts
      bodyWords: { min: 600, max: 850 },
      descriptionMax: 155,
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
```

**with:**
```ts
      bodyWords: { min: 600, max: 850 },
      descriptionMax: 155,
      headingMax: 80,
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
```

**In `gate/test/text.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { countWords, jaccard, normaliseQuotes, quotedSegments, sentenceWords, stripQuoted } from '../src/text';

describe('countWords', () => {
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { countWords, hasQuoted, jaccard, normaliseQuotes, quotedSegments, sentenceWords, stripQuoted } from '../src/text';

describe('countWords', () => {
```

**In `gate/test/text.test.ts`, replace:**
```ts
});

describe('quotedSegments', () => {
  it.each([
```

**with:**
```ts
});

describe('hasQuoted', () => {
  // Curly quote marks, written as codes so that this file stays ASCII.
  const open = String.fromCharCode(0x201c);
  const close = String.fromCharCode(0x201d);

  it.each([
    ['He said "stop" now.', true],
    [`He said ${open}stop${close} now.`, true],
    [`Mixed ${open}stop" marks.`, true],
    ['Only quotes ""', true],
    ['An empty "   " pair', true],
    ['One "a" and two "b" quotes.', true],
    ['a "b" c "d', true],
    ['He said "stop now.', false],
    [`A single ${open} mark`, false],
    ['No quotes here.', false],
    ['', false],
  ])('says %j is %s', (input, expected) => {
    expect(hasQuoted(input)).toBe(expected);
  });
});

describe('quotedSegments', () => {
  it.each([
```

The G2 tests: one older test used headings of 300 words to show that headings are not counted in the body; those headings are now too long, which is reported, so the test says that. Two new groups test the new codes.

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
      for (const section of g.draft.sections) section.heading = sentenceOf(300).replace('.', '');
    };
    expect(codesAfter(change)).toEqual([]);
  });
});
```

**with:**
```ts
      for (const section of g.draft.sections) section.heading = sentenceOf(300).replace('.', '');
    };
    // The headings are far too long, which is reported, but the body length is not affected.
    expect(codesAfter(change)).toEqual(['G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG']);
  });
});
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
});

describe('G2_LIMITATIONS_MISSING', () => {
  const noLimitations = (g: GateInput) => {
```

**with:**
```ts
});

describe('G2_HEADING_TOO_LONG', () => {
  const headingOf = (length: number) => 'a'.repeat(length);

  it('passes a heading of exactly 80 characters and fails one of 81', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = headingOf(80)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = headingOf(81)))).toEqual(['G2_HEADING_TOO_LONG']);
  });

  it('counts the characters without the spaces around the heading', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = `  ${headingOf(80)}  `))).toEqual([]);
  });

  it('says how long the heading is and where it is', () => {
    const out = resultAfter((g) => (g.draft.sections[1]!.heading = headingOf(95)));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_HEADING_TOO_LONG',
        message: `the heading "${headingOf(95)}" is 95 characters; the limit is 80`,
        where: `section "${headingOf(95)}"`,
      },
    ]);
  });

  it('reads the limit from the context', () => {
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 20 } }))).toEqual([
      'G2_HEADING_TOO_LONG',
      'G2_HEADING_TOO_LONG',
    ]);
    // The longest golden heading, "What the customer reports", has 25 characters.
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 24 } }))).toEqual(['G2_HEADING_TOO_LONG']);
    expect(codesAfter(() => {}, defaultContext({ config: { headingMax: 25 } }))).toEqual([]);
  });

  it('fails once for each long heading', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = headingOf(81);
      g.draft.sections[2]!.heading = headingOf(120);
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_TOO_LONG', 'G2_HEADING_TOO_LONG']);
  });
});

describe('G2_HEADING_EMPTY', () => {
  it.each([[''], ['   '], ['\t\n']])('fails for the heading %j', (heading) => {
    const out = resultAfter((g) => (g.draft.sections[1]!.heading = heading));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_HEADING_EMPTY',
        message: 'a section has no heading: every section needs a heading that says what it is about',
        where: `section "${heading}"`,
      },
    ]);
  });

  it('fails once for each empty heading', () => {
    const change = (g: GateInput) => {
      g.draft.sections[0]!.heading = '';
      g.draft.sections[2]!.heading = ' ';
    };
    expect(codesAfter(change)).toEqual(['G2_HEADING_EMPTY', 'G2_HEADING_EMPTY']);
  });
});

describe('G2_LIMITATIONS_MISSING', () => {
  const noLimitations = (g: GateInput) => {
```

The G4 tests are a new group, `G4 headings`. They change the golden piece's headings one at a time and also test the exact message of each code.

**In `gate/test/g4-values.test.ts`, replace:**
```ts
import type { Failure, GateInput } from '../src/gate';
import type { Claim, ClaimValue } from '../src/schemas';
import { findSentence, mutate } from './helpers';

// --- A tiny input: a title that cites the given claims, and nothing else. ----
```

**with:**
```ts
import type { Failure, GateInput } from '../src/gate';
import type { Claim, ClaimValue } from '../src/schemas';
import { claimById, findSentence, mutate } from './helpers';

// --- A tiny input: a title that cites the given claims, and nothing else. ----
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
const goldenCodes = (change: (copy: GateInput) => void) => codes(mutate(cloneGolden(), change));
const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);

// ---------------------------------------------------------------------------
```

**with:**
```ts
const goldenCodes = (change: (copy: GateInput) => void) => codes(mutate(cloneGolden(), change));
const summary = (failures: Failure[]) => failures.map((failure) => [failure.code, failure.where]);
const claimOfId = (input: GateInput, id: string): Claim => claimById(input.claims, id);

// ---------------------------------------------------------------------------
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
```

**with:**
```ts
});

describe('G4 headings', () => {
  // The headings of the golden piece are "What shipped" (section 0), "What the
  // customer reports" (1) and "What the filing shows" (2). Each section's claims
  // are the claims its own sentences cite.
  const headingFailures = (heading: string, at = 0, overrides?: ContextOverrides) =>
    checkG4(
      mutate(cloneGolden(), (g) => {
        g.draft.sections[at]!.heading = heading;
      }),
      defaultContext(overrides),
    ).failures;
  const headingCodes = (heading: string, at = 0, overrides?: ContextOverrides) => headingFailures(heading, at, overrides).map((failure) => failure.code);
  const open = String.fromCharCode(0x201c);
  const close = String.fromCharCode(0x201d);

  it('passes the headings of the golden piece', () => {
    expect(checkG4(cloneGolden(), defaultContext()).failures).toEqual([]);
  });

  it('rejects a heading with a number in it, and says which and where', () => {
    expect(headingFailures('Fixture Robotics ships 500 arms')).toEqual([
      {
        check: 'G4',
        code: 'G4_HEADING_NUMBER',
        message:
          'the heading "Fixture Robotics ships 500 arms" contains a number or a date ("500"): a heading says what a section is about and states no figure',
        where: 'section "Fixture Robotics ships 500 arms"',
      },
    ]);
  });

  it.each([
    ['a plain number', 'What the 12 means'],
    ['a number with a unit', 'What 12 kg means'],
    ['a currency amount', 'What the $450 million buys'],
    ['a percentage', 'What rose 18%'],
    ['a full date', 'What happened on 1 October 2026'],
    ['an ISO date', 'What happened on 2026-10-01'],
    ['a month and a year', 'What happened in October 2026'],
    ['a year', 'What happens in 2027'],
  ])('rejects %s in a heading', (_name, heading) => {
    expect(headingCodes(heading)).toEqual(['G4_HEADING_NUMBER']);
  });

  it('names every number and date of the heading in one failure', () => {
    const failures = headingFailures('What 12 kg and 2027 mean');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('("12 kg", "2027")');
  });

  it('does not take a model name that contains a digit for a number', () => {
    expect(headingCodes('What the FX-1 does')).toEqual([]);
    expect(headingCodes('What the H1 results show', 2)).toEqual(['G4_HEADING_NAME']);
  });

  it('rejects a heading with a quoted passage in it', () => {
    expect(headingFailures('What the customer calls "production"', 1)).toEqual([
      {
        check: 'G4',
        code: 'G4_HEADING_QUOTE',
        message:
          'the heading "What the customer calls "production"" contains a quoted passage: put quotations in the body, where they are checked word for word',
        where: 'section "What the customer calls "production""',
      },
    ]);
  });

  it('rejects curly quotation marks and an empty pair of marks too', () => {
    expect(headingCodes(`What the customer calls ${open}production${close}`, 1)).toEqual(['G4_HEADING_QUOTE']);
    expect(headingCodes('What the customer calls ""', 1)).toEqual(['G4_HEADING_QUOTE']);
  });

  it('does not read a number or a name inside the quoted passage, which is rejected anyway', () => {
    expect(headingCodes('What the customer says: "Harlow shipped 500"', 1)).toEqual(['G4_HEADING_QUOTE']);
  });

  it('accepts a single quotation mark, which does not make a passage', () => {
    expect(headingCodes('What the customer calls "production', 1)).toEqual([]);
  });

  it('rejects a name that no claim of the section supports, and says which and where', () => {
    expect(headingFailures('What Harlow Logistics reports', 1)).toEqual([
      {
        check: 'G4',
        code: 'G4_HEADING_NAME',
        message:
          'the capitalised word "harlow" in the heading "What Harlow Logistics reports" is not a word of any claim cited in this section: write it in lowercase if it is an ordinary word, or leave the name out of the heading',
        where: 'section "What Harlow Logistics reports"',
      },
    ]);
  });

  it('accepts a name in a word of the text, label, quoted passage or name values of a claim the section cites', () => {
    expect(headingCodes('What Tarnmoor received')).toEqual([]);
    expect(headingCodes('What the Tarnmoor shipment is')).toEqual([]);
    expect(headingCodes('What the Mounting needs')).toEqual([]);
    expect(headingCodes('What the Ashvale plant does', 1)).toEqual([]);
    expect(headingCodes('What Corvane Partners led', 2)).toEqual([]);
  });

  it('accepts the outlet of a claim the section cites', () => {
    const outlet = (g: GateInput) => {
      claimOfId(g, 'c-19').source.tier = 2;
      claimOfId(g, 'c-19').source.outlet = 'Mercer Wire';
      g.draft.sections[2]!.heading = 'What Mercer Wire says';
    };
    expect(goldenCodes(outlet)).toEqual([]);
  });

  it('takes the claims of the section the heading belongs to, not those of the other sections', () => {
    // Corvane Partners are named in the filing claims, which only section 2 cites.
    expect(headingCodes('What Corvane Partners led', 0)).toEqual(['G4_HEADING_NAME', 'G4_HEADING_NAME']);
    expect(headingCodes('What Corvane Partners led', 1)).toEqual(['G4_HEADING_NAME', 'G4_HEADING_NAME']);
    expect(headingCodes('What Corvane Partners led', 2)).toEqual([]);
  });

  it('counts a claim cited by any sentence of the section, in any paragraph', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[0]!.paragraphs[2]!.push({ kind: 'fact', text: 'It is due.', claimIds: ['c-18'] });
      g.draft.sections[0]!.heading = 'What Corvane Partners led';
    });
    expect(checkG4(input, defaultContext()).failures.filter((failure) => failure.code.startsWith('G4_HEADING'))).toEqual([]);
  });

  it('holds the first word to the opening-word rule', () => {
    expect(headingCodes('However the arm shipped')).toEqual([]);
    expect(headingCodes('Harlow ships arms')).toEqual(['G4_HEADING_NAME']);
    expect(headingCodes('Tarnmoor receives arms')).toEqual([]);
    expect(headingCodes('Tarnmoor receives arms', 2)).toEqual(['G4_HEADING_NAME']);
  });

  it('lets a function word stand in for a claim word in first place only', () => {
    expect(headingCodes('However the arm shipped')).toEqual([]);
    expect(headingCodes('Arms. However it shipped')).toEqual(['G4_HEADING_NAME']);
  });

  it('accepts a word on the allow-list, and an allow-list passed in the context', () => {
    expect(headingCodes('What Monday brought')).toEqual([]);
    expect(headingCodes('What Harlow brought')).toEqual(['G4_HEADING_NAME']);
    expect(headingCodes('What Harlow brought', 0, { nameAllowList: ['harlow'] })).toEqual([]);
    expect(headingCodes('August plans')).toEqual([]);
  });

  it('reports each unsupported name once, in the order of the heading', () => {
    const failures = headingFailures('What Harlow and Quillon and Harlow reported', 1);
    expect(failures.map((failure) => failure.message.match(/word "([^"]+)"/)?.[1])).toEqual(['harlow', 'quillon']);
  });

  it('does not read a lowercase heading for names', () => {
    expect(headingCodes('what harlow reports', 1)).toEqual([]);
  });

  it('reports the number, the quote and the name of one heading separately, and before the claim checks', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections[1]!.heading = 'Harlow said "yes" to 3 arms';
      claimOfId(g, 'c-13').span.quote = 'Arm mass: 39 kg.';
    });
    expect(checkG4(input, defaultContext()).failures.map((failure) => failure.code)).toEqual([
      'G4_HEADING_QUOTE',
      'G4_HEADING_NUMBER',
      'G4_HEADING_NAME',
      'G4_VALUE_NOT_IN_SPAN',
    ]);
  });

  it('checks the headings of a piece with no sentences in a section', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.sections = [{ heading: 'What Harlow reports', paragraphs: [] }];
    });
    expect(checkG4(input, defaultContext()).failures.map((failure) => failure.code)).toEqual(['G4_HEADING_NAME']);
  });
});

describe('G4: which sentences it reads', () => {
  it('does not read quoted text, which G5 checks', () => {
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/config.test.ts test/text.test.ts test/g2-structure.test.ts test/g4-values.test.ts`
Expected: FAIL — `hasQuoted`, `G2_HEADING_TOO_LONG`, `G2_HEADING_EMPTY` and `G4 headings`; `Test Files  4 failed (4)`.

- [ ] **Step 3: Write the implementation**

**In `gate/src/config.ts`, replace:**
```ts
  /** G1: characters in the description. */
  descriptionMax: number;
  /** Characters in a claim's quoted span. The schema allows 300; the extractor stage enforces this. */
  spanMax: number;
```

**with:**
```ts
  /** G1: characters in the description. */
  descriptionMax: number;
  /** G2: characters in a section heading. */
  headingMax: number;
  /** Characters in a claim's quoted span. The schema allows 300; the extractor stage enforces this. */
  spanMax: number;
```

**In `gate/src/config.ts`, replace:**
```ts
    bodyWords: { min: 600, max: 850 },
    descriptionMax: 155,
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
```

**with:**
```ts
    bodyWords: { min: 600, max: 850 },
    descriptionMax: 155,
    headingMax: 80,
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
```

**In `gate/src/text.ts`, replace:**
```ts
}

/**
 * `text` without its double-quoted segments (the quote marks go too), with the
```

**with:**
```ts
}

/** Does `text` contain a double-quoted segment, even an empty one? Marks are paired as `stripQuoted` pairs them. */
export function hasQuoted(text: string): boolean {
  return findQuoted(text).length > 0;
}

/**
 * `text` without its double-quoted segments (the quote marks go too), with the
```

G2 checks each heading for emptiness and length, then, as before, for a question mark.

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
  'G2_SECTIONS_MIN',
  'G2_HEADING_QUESTION',
  'G2_LIMITATIONS_MISSING',
] as const;
```

**with:**
```ts
  'G2_SECTIONS_MIN',
  'G2_HEADING_QUESTION',
  'G2_HEADING_TOO_LONG',
  'G2_HEADING_EMPTY',
  'G2_LIMITATIONS_MISSING',
] as const;
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; no heading asks a
 * question; and a piece that rests on a company's own claims has a "What we
 * couldn't verify" section.
 *
 * The body is the opening, the takeaways, every section paragraph and the
```

**with:**
```ts
/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; every heading is
 * there, is short enough (`headingMax`) and is not a question; and a piece that
 * rests on a company's own claims has a "What we couldn't verify" section.
 * What a heading may say is G4's question (G4_HEADING_*).
 *
 * The body is the opening, the takeaways, every section paragraph and the
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
 */
export const checkG2: Check = ({ draft, claims }, ctx) => {
  const { openingWords, takeaways, bodyWords } = ctx.config;
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G2', code, message, where });
```

**with:**
```ts
 */
export const checkG2: Check = ({ draft, claims }, ctx) => {
  const { openingWords, takeaways, bodyWords, headingMax } = ctx.config;
  const failures: Failure[] = [];
  const fail = (code: string, message: string, where: string) => failures.push({ check: 'G2', code, message, where });
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts

  for (const section of draft.sections) {
    if (section.heading.trim().endsWith('?')) {
      fail('G2_HEADING_QUESTION', `the heading "${section.heading}" is a question; headings must be statements`, `section "${section.heading}"`);
    }
  }
```

**with:**
```ts

  for (const section of draft.sections) {
    const where = `section "${section.heading}"`;
    const heading = section.heading.trim();
    if (heading === '') {
      fail('G2_HEADING_EMPTY', 'a section has no heading: every section needs a heading that says what it is about', where);
    } else if (heading.length > headingMax) {
      fail('G2_HEADING_TOO_LONG', `the heading "${section.heading}" is ${heading.length} characters; the limit is ${headingMax}`, where);
    }
    if (heading.endsWith('?')) {
      fail('G2_HEADING_QUESTION', `the heading "${section.heading}" is a question; headings must be statements`, where);
    }
  }
```

G4 checks each section's heading after the sentences and before the check of the claims' own values. For the words that can vouch for a name it asks `claimWords` (Task 71) for the claims cited in the section.

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
import { claimWords, openingWordAccepted } from '../grounding';
import { allSentences, describeLocation } from '../sentences';
import { normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf } from '../tokens';

/** Every failure code G4 can report. */
```

**with:**
```ts
import { claimWords, openingWordAccepted } from '../grounding';
import { allSentences, describeLocation } from '../sentences';
import { hasQuoted, normaliseQuotes } from '../text';
import { extractTokens, nameTokensOf, toNameToken } from '../tokens';

/** Every failure code G4 can report. */
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
  'G4_VALUE_NOT_IN_SPAN',
  'G4_INITIAL_WORD_UNSUPPORTED',
] as const;

```

**with:**
```ts
  'G4_VALUE_NOT_IN_SPAN',
  'G4_INITIAL_WORD_UNSUPPORTED',
  'G4_HEADING_NUMBER',
  'G4_HEADING_QUOTE',
  'G4_HEADING_NAME',
] as const;

```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
 * made-up company at the start of a sentence would only have its second word checked.
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
```

**with:**
```ts
 * made-up company at the start of a sentence would only have its second word checked.
 *
 * Section headings are free text that no claim vouches for, so they are held
 * to a stricter rule than sentences: a heading may contain no number and no
 * date (G4_HEADING_NUMBER), no quoted passage (G4_HEADING_QUOTE), and no
 * capitalised word, the first one included, that is not a word of a claim cited in
 * its own section or on the allow-list (G4_HEADING_NAME; the first word may also be
 * a function word from SENTENCE_STARTERS).
 *
 * Analysis and limitation sentences are not read here. Quoted text is G5's.
 */
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
  }

  // Each claim is checked once, however many sentences cite it.
  for (const claim of citedByFacts.values()) {
```

**with:**
```ts
  }

  for (const section of draft.sections) {
    const heading = section.heading;
    const fail = (code: string, message: string) => failures.push({ check: 'G4', code, message, where: `section "${heading}"` });

    if (hasQuoted(heading)) {
      fail('G4_HEADING_QUOTE', `the heading "${heading}" contains a quoted passage: put quotations in the body, where they are checked word for word`);
    }

    const tokens = extractTokens(heading);
    const figures = [...tokens.numbers, ...tokens.dates].map((token) => `"${token.raw}"`);
    if (figures.length > 0) {
      fail(
        'G4_HEADING_NUMBER',
        `the heading "${heading}" contains a number or a date (${figures.join(', ')}): a heading says what a section is about and states no figure`,
      );
    }

    const ids = new Set(section.paragraphs.flat().flatMap((item) => item.claimIds));
    const words = claimWords([...ids].flatMap((id) => byId.get(id) ?? []));
    const unsupported = [
      ...(tokens.initialWord !== undefined && !openingWordAccepted(tokens.initialWord, words, ctx.nameAllowList)
        ? [toNameToken(tokens.initialWord)]
        : []),
      ...tokens.names.filter((name) => !words.has(name) && !ctx.nameAllowList.has(name)),
    ];
    for (const name of new Set(unsupported)) {
      fail(
        'G4_HEADING_NAME',
        `the capitalised word "${name}" in the heading "${heading}" is not a word of any claim cited in this section: write it in lowercase if it is an ordinary word, or leave the name out of the heading`,
      );
    }
  }

  // Each claim is checked once, however many sentences cite it.
  for (const claim of citedByFacts.values()) {
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  31 passed (31)`.

- [ ] **Step 5: Show that the new codes have no seeded defect and no label yet**

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G2_HEADING_TOO_LONG`.

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G4_HEADING_NAME`.

- [ ] **Step 6: Add the seeded defects and the labels**

Five cases, one for each new code: `heading-too-long`, `empty-heading`, `heading-with-number`, `heading-with-quote` and `heading-with-invented-name`.

The descriptions of the seeded defects are printed on the `/method` page, in the production build too, and the production audit (check A13) forbids the name of the fictional company anywhere in a production page. So no description may use that name, and a new test in the evals says so. (The description of `heading-with-number` has to say "the company ships 500 arms", not name the company in the heading it quotes.)

**In `evals/test/seeded.test.ts`, replace:**
```ts
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
```

**with:**
```ts
  });

  it('describe the defect without the name of the fictional company: the production /method page shows the descriptions, and no production page may carry fixture content', () => {
    for (const item of SEEDED_CASES) expect(item.description, item.id).not.toMatch(/fixture (data|robotics)|fixture-robotics/i);
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    },
  },
  {
    id: 'no-limitations',
```

**with:**
```ts
    },
  },
  {
    id: 'heading-too-long',
    check: 'G2',
    code: 'G2_HEADING_TOO_LONG',
    description: 'A section heading runs to more than 80 characters.',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'What shipped, in the order that the company announced it, with every detail that its release gives';
      return base;
    },
  },
  {
    id: 'empty-heading',
    check: 'G2',
    code: 'G2_HEADING_EMPTY',
    description: 'A section heading is blank.',
    apply: (base) => {
      base.draft.sections[0]!.heading = '  ';
      return base;
    },
  },
  {
    id: 'no-limitations',
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    },
  },
  {
    id: 'value-outside-span',
```

**with:**
```ts
    },
  },
  {
    id: 'heading-with-number',
    check: 'G4',
    code: 'G4_HEADING_NUMBER',
    description: 'A section heading states a figure, as in "the company ships 500 arms".',
    apply: (base) => {
      base.draft.sections[0]!.heading = 'Fixture Robotics ships 500 arms';
      return base;
    },
  },
  {
    id: 'heading-with-quote',
    check: 'G4',
    code: 'G4_HEADING_QUOTE',
    description: 'A section heading contains a quoted passage.',
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What the customer calls "production"';
      return base;
    },
  },
  {
    id: 'heading-with-invented-name',
    check: 'G4',
    code: 'G4_HEADING_NAME',
    description: 'A section heading names a company, Harlow Logistics, that no claim of its section mentions.',
    apply: (base) => {
      base.draft.sections[1]!.heading = 'What Harlow Logistics reports';
      return base;
    },
  },
  {
    id: 'value-outside-span',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G2_SECTIONS_MIN: 'The piece had fewer than two sections',
  G2_HEADING_QUESTION: 'A heading asked a question',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
```

**with:**
```ts
  G2_SECTIONS_MIN: 'The piece had fewer than two sections',
  G2_HEADING_QUESTION: 'A heading asked a question',
  G2_HEADING_TOO_LONG: 'A heading was too long',
  G2_HEADING_EMPTY: 'A section had no heading',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G4_INITIAL_WORD_UNSUPPORTED: 'A sentence opened with a name that no claim supports',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

**with:**
```ts
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G4_INITIAL_WORD_UNSUPPORTED: 'A sentence opened with a name that no claim supports',
  G4_HEADING_NUMBER: 'A heading contained a number or a date',
  G4_HEADING_QUOTE: 'A heading contained a quotation',
  G4_HEADING_NAME: 'A heading named something no claim supports',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

Run: `npm run evals:seeded`
Expected: PASS — `47 of 47 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

- [ ] **Step 7: Check that the new test about descriptions can fail**

The new test passed as soon as it was written, because no description names the company. Put the name into the description of `heading-with-number` and run it.

Run: `sed -i.bak 's/as in "the company ships 500 arms"/as in "Fixture Robotics ships 500 arms"/' evals/src/cases/claims.ts && rm evals/src/cases/claims.ts.bak`

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: FAIL — `heading-with-number: expected`

Put the description back.

Run: `sed -i.bak 's/as in "Fixture Robotics ships 500 arms"/as in "the company ships 500 arms"/' evals/src/cases/claims.ts && rm evals/src/cases/claims.ts.bak`

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 8: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 9: Commit**

```bash
git add gate/src gate/test evals/src evals/test evals/scoreboard/seeded.json site/src/lib/reasons.ts
git commit -m "feat(gate): check section headings: length, figures, quotations and names (G2, G4)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 73: Spelled-out numbers

**Files:**
- Create: `gate/src/number-words.ts` (finds and reads numbers written in words, and the words that state an amount with no value to check)
- Modify: `gate/src/tokens.ts` (`extractTokens` reads them)
- Modify: `gate/src/checks/g4-values.ts` (new code `G4_NUMBER_WORD_UNCHECKABLE`; headings reject number words too)
- Modify: `gate/src/checks/g7-analysis.ts` (analysis may not bring in number words of its own)
- Modify: `gate/src/index.ts` (export the new module)
- Modify: `gate/src/fixtures/golden.ts` (claim c-20 lists the figure "four")
- Modify: `evals/src/cases/claims.ts` (two seeded defects), `evals/scoreboard/seeded.json` and `site/src/content-fixtures/ledger/*.json` (regenerated)
- Modify: `site/src/lib/reasons.ts` (the label of the new code)
- Test: `gate/test/number-words.test.ts` (new), `gate/test/tokens.test.ts`, `gate/test/golden-claims.test.ts`, `gate/test/g4-values.test.ts`, `gate/test/g7-analysis.test.ts`

`extractTokens` finds numbers written with digits. It cannot see a number written out in words, so a swapped figure such as "thirteen kilograms" against a claim that says 12 kg passes G4 untouched. A model that wants to slip a wrong figure past the gate only has to spell it out. This task makes `extractTokens` read numbers in words and check them exactly like digits.

What is read: two to nineteen; the tens (`twenty` to `ninety`) with an optional unit part (`twenty-five`, `twenty five`); `hundred`, `thousand`, `million`, `billion` and `dozen`, with a multiplier in front (`two hundred`, `three million`, `twenty-five thousand`, `two dozen`); `a` in front of a hundred, a thousand, a million, a billion or a dozen; an `and` after a hundred or a scale (`two hundred and fifty`); and a unit after the words (`twelve kilograms`, `eighteen per cent`). Letter case does not matter. `one` is a number only inside a longer number (`twenty-one`, `one hundred`) or when a unit follows (`one percent`): everywhere else it is the pronoun, as in "one of the plants". Each number read this way becomes an ordinary number token with its canonical value and unit, and G4 compares it with the number values of the claims the sentence cites. A claim lists such a figure as `raw: "twelve"` with `normalised: "12"` (and `unit: "kg"` if it has one).

What is refused. Some words state an amount but have no value that could be compared with a claim: `half`, `halve`, `halved`, `twice`, `thrice`, `double`, `doubled`, `triple`, `tripled`, `quadruple`, `quadrupled`, and the words that end in `fold` (`tenfold`, `ten-fold`). So does a run of number words that is not a well-formed number (`five five`). G4 rejects them with the new code `G4_NUMBER_WORD_UNCHECKABLE`, and the composer has to restate the fact as digits backed by a claim. G7 treats such a word in an analysis sentence as a new value, and a heading that contains one fails `G4_HEADING_NUMBER`, like a heading with a number.

What is not read, and so is not checked (known limits; Task 82 lists them on the `/method` page, and `number-words.ts` lists them in its first comment): ordinals (`first`, `second`), vague quantities (`couple`, `several`, `dozens`), `zero`, fractions in words (`two thirds`; a fraction written with digits is a number already), and names that start in lowercase (`iRobot`, `xAI`).

The golden piece has one sentence that now fails: "It compared the four weeks before and after the arms went live." The source says "four weeks", but claim c-20 lists only the figure `18 per cent`. The repair is the one the new rule asks of a composer: claim c-20 lists the figure as `raw: "four"`, `normalised: "4"`. The sentence stays as it is, which makes the golden piece also a test that a figure in words is supported by a claim.

- [ ] **Step 1: Write the failing tests**

The new test file tests the reader on its own: the value of every kind of phrase, the phrases that are not well formed, where the scanner finds and does not find number words, and the words that cannot be checked.

**Create `gate/test/number-words.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { UNIT_ALIASES } from '../src/normalise';
import { NUMBER_WORD_SOURCE, UNCHECKABLE_SOURCE, readNumberWords } from '../src/number-words';

const phrases = (text: string): string[] => [...text.matchAll(new RegExp(NUMBER_WORD_SOURCE, 'gu'))].map((match) => match[0]);
const uncheckable = (text: string): string[] => [...text.matchAll(new RegExp(UNCHECKABLE_SOURCE, 'gu'))].map((match) => match[0]);
const read = (phrase: string) => readNumberWords(phrase);
const valueOf = (phrase: string) => {
  const reading = read(phrase);
  return reading.kind === 'number' ? reading.value : reading.kind;
};

describe('readNumberWords: the value of a phrase', () => {
  it.each([
    ['two', '2'],
    ['nine', '9'],
    ['ten', '10'],
    ['twelve', '12'],
    ['nineteen', '19'],
    ['twenty', '20'],
    ['forty', '40'],
    ['ninety', '90'],
    ['twenty-five', '25'],
    ['twenty five', '25'],
    ['ninety-nine', '99'],
    ['twenty-one', '21'],
    ['hundred', '100'],
    ['a hundred', '100'],
    ['one hundred', '100'],
    ['two hundred', '200'],
    ['two hundred and fifty', '250'],
    ['two hundred fifty', '250'],
    ['nine hundred ninety-nine', '999'],
    ['a hundred and one', '101'],
    ['nineteen hundred', '1900'],
    ['thousand', '1000'],
    ['a thousand', '1000'],
    ['one thousand', '1000'],
    ['five thousand', '5000'],
    ['twenty-five thousand', '25000'],
    ['two hundred thousand', '200000'],
    ['two thousand five hundred', '2500'],
    ['two thousand and five', '2005'],
    ['million', '1000000'],
    ['a million', '1000000'],
    ['three million', '3000000'],
    ['three million two hundred thousand', '3200000'],
    ['a billion', '1000000000'],
    ['two billion', '2000000000'],
    ['dozen', '12'],
    ['a dozen', '12'],
    ['one dozen', '12'],
    ['two dozen', '24'],
    ['twenty dozen', '240'],
    ['Twelve', '12'],
    ['TWELVE', '12'],
    ['Twenty-Five', '25'],
  ])('reads %j as %s', (phrase, expected) => {
    expect(valueOf(phrase)).toBe(expected);
  });

  it('reads a unit after the words, in its canonical form', () => {
    expect(read('twelve kilograms')).toEqual({ kind: 'number', value: '12', unit: 'kg' });
    expect(read('twelve kg')).toEqual({ kind: 'number', value: '12', unit: 'kg' });
    expect(read('two hundred metres per second')).toEqual({ kind: 'number', value: '200', unit: 'm/s' });
    expect(read('eighteen per cent')).toEqual({ kind: 'number', value: '18', unit: '%' });
    expect(read('eighteen percent')).toEqual({ kind: 'number', value: '18', unit: '%' });
    expect(read('three million tonnes')).toEqual({ kind: 'number', value: '3000000', unit: 'tonne' });
  });

  it('reads every unit of the table after the words', () => {
    for (const [alias, unit] of Object.entries(UNIT_ALIASES)) {
      expect(read(`seven ${alias}`), alias).toEqual({ kind: 'number', value: '7', unit });
    }
  });

  it('leaves the unit key out when there is none', () => {
    expect(read('twelve')).toStrictEqual({ kind: 'number', value: '12' });
  });

  it('ignores spaces around the phrase and extra spaces inside it', () => {
    expect(read('  twenty   five  kg ')).toEqual({ kind: 'number', value: '25', unit: 'kg' });
  });

  it('reads "one" as a number only when a unit follows', () => {
    expect(read('one percent')).toEqual({ kind: 'number', value: '1', unit: '%' });
    expect(read('One per cent')).toEqual({ kind: 'number', value: '1', unit: '%' });
    expect(read('one kg')).toEqual({ kind: 'number', value: '1', unit: 'kg' });
    expect(read('one')).toEqual({ kind: 'plain' });
    expect(read('One')).toEqual({ kind: 'plain' });
  });

  it('says "plain" for text that is not a number in words at all', () => {
    expect(read('plants')).toEqual({ kind: 'plain' });
    expect(read('hundred and')).toEqual({ kind: 'plain' });
    expect(read('a twenty')).toEqual({ kind: 'plain' });
    expect(read('')).toEqual({ kind: 'plain' });
  });

  it('reads "one" inside a longer number as part of it', () => {
    expect(valueOf('twenty-one')).toBe('21');
    expect(valueOf('one hundred')).toBe('100');
    expect(valueOf('one thousand')).toBe('1000');
    expect(valueOf('a hundred and one')).toBe('101');
  });

  it.each([
    ['five five'],
    ['one two'],
    ['twenty twenty'],
    ['hundred hundred'],
    ['thousand million'],
    ['thousand thousand'],
    ['five dozen thousand'],
    ['twenty dozen six'],
    ['dozen two'],
    ['hundred dozen'],
    ['two three dozen'],
    ['ten twenty'],
  ])('does not read %j as a number, because it is not a well-formed cardinal', (phrase) => {
    expect(read(phrase)).toEqual({ kind: 'uncheckable' });
  });
});

describe('NUMBER_WORD_SOURCE: where a number in words is found', () => {
  it('finds a number in words with its unit', () => {
    expect(phrases('The arm lifts twelve kilograms at full reach.')).toEqual(['twelve kilograms']);
    expect(phrases('It raised eighteen per cent more.')).toEqual(['eighteen per cent']);
  });

  it('finds the longest phrase', () => {
    expect(phrases('It shipped two hundred and fifty arms.')).toEqual(['two hundred and fifty']);
    expect(phrases('It shipped twenty-five arms and twenty five more.')).toEqual(['twenty-five', 'twenty five']);
    expect(phrases('It shipped three million two hundred thousand parts.')).toEqual(['three million two hundred thousand']);
  });

  it('finds a number in any case', () => {
    expect(phrases('Twelve arms and TWELVE more and tWeLvE too.')).toEqual(['Twelve', 'TWELVE', 'tWeLvE']);
  });

  it('finds "a hundred", "a thousand", "a million" and "a dozen", but not another "a"', () => {
    expect(phrases('It shipped a hundred, a dozen, a thousand and a million.')).toEqual(['a hundred', 'a dozen', 'a thousand', 'a million']);
    expect(phrases('It shipped a plant and a second site.')).toEqual([]);
  });

  it('keeps "and" inside a number only after hundred, thousand, million or billion', () => {
    expect(phrases('Between five and ten arms.')).toEqual(['five', 'ten']);
    expect(phrases('Two hundred and ten arms.')).toEqual(['Two hundred and ten']);
    expect(phrases('Two and three arms.')).toEqual(['Two', 'three']);
  });

  it('keeps the words apart when they are separated by a comma or a word', () => {
    expect(phrases('Five, six and seven arms.')).toEqual(['Five', 'six', 'seven']);
    expect(phrases('Five or six arms.')).toEqual(['Five', 'six']);
  });

  it('does not find number words inside other words', () => {
    expect(phrases('Someone was alone with the tenant, a wonderful stone phone.')).toEqual([]);
    expect(phrases('Ninety-nine and ninetieth and eighteenth.')).toEqual(['Ninety-nine']);
    expect(phrases('Hundreds of arms, thousands of picks, millions of parts and dozens of plants.')).toEqual([]);
    expect(phrases('A tenfold rise.')).toEqual([]);
    expect(phrases('The pontoon, the twelfth and the fivesome.')).toEqual([]);
  });

  it('does not find a number word that is the tail of a hyphenated word', () => {
    expect(phrases('A high-five and a top-ten list.')).toEqual([]);
  });

  it('finds a number word before a hyphen, as the digits are found in "6-axis"', () => {
    expect(phrases('A six-axis arm and a two-finger gripper.')).toEqual(['six', 'two']);
  });

  it('finds "one" so that the reader of the phrase can decide, and attaches a unit to it', () => {
    expect(phrases('One of the plants ran one percent faster.')).toEqual(['One', 'one percent']);
  });

  it('attaches a unit only after a space, and only a unit the table knows', () => {
    expect(phrases('Twelve kg, twelve kilograms, twelve-kg and twelve plants.')).toEqual(['Twelve kg', 'twelve kilograms', 'twelve', 'twelve']);
    expect(phrases('Twelve KG.')).toEqual(['Twelve']);
  });

  it('does not attach the start of a longer word as a unit', () => {
    expect(phrases('Twelve minutes ago, twelve mins ago, twelve mile, twelve milestones.')).toEqual([
      'Twelve minutes',
      'twelve mins',
      'twelve mile',
      'twelve',
    ]);
  });
});

describe('UNCHECKABLE_SOURCE: words that state an amount with no number to check', () => {
  it.each([
    'half',
    'Half',
    'halve',
    'halves',
    'halved',
    'halving',
    'twice',
    'Twice',
    'thrice',
    'double',
    'doubles',
    'doubled',
    'doubling',
    'triple',
    'triples',
    'tripled',
    'tripling',
    'quadruple',
    'quadruples',
    'quadrupled',
    'quadrupling',
    'twofold',
    'tenfold',
    'ten-fold',
    'Tenfold',
    'twentyfold',
    'hundredfold',
    'thousandfold',
    'millionfold',
  ])('finds %j', (word) => {
    expect(uncheckable(`Output ${word} last year.`)).toEqual([word]);
  });

  it('finds every one in a sentence, in order', () => {
    expect(uncheckable('Output doubled, then half of it tripled twice.')).toEqual(['doubled', 'half', 'tripled', 'twice']);
  });

  it.each(['halfway', 'doubtful', 'tripod', 'doublet', 'halfhearted', 'manifold', 'onefold', 'folded', 'fold', 'triplet', 'halls', 'twiceborn'])(
    'does not find %j',
    (word) => {
      expect(uncheckable(`Output ${word} last year.`)).toEqual([]);
    },
  );

  it('finds "half" next to a hyphen, because "half-year" is still half of something', () => {
    expect(uncheckable('A half-year result.')).toEqual(['half']);
  });
});
```

The golden claims test checks that every number value agrees with the normalisers; a value written in words is read by the new reader.

**In `gate/test/golden-claims.test.ts`, replace:**
```ts
import { GOLDEN_CLAIMS } from '../src/fixtures';
import { parseDateToken, parseNumberToken } from '../src/normalise';
import { Claim } from '../src/schemas';
import { expectValid } from './schema-helpers';
```

**with:**
```ts
import { GOLDEN_CLAIMS } from '../src/fixtures';
import { parseDateToken, parseNumberToken } from '../src/normalise';
import { readNumberWords } from '../src/number-words';
import { Claim } from '../src/schemas';
import { expectValid } from './schema-helpers';
```

**In `gate/test/golden-claims.test.ts`, replace:**
```ts
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'number')) {
        const parsed = parseNumberToken(value.raw);
        expect(parsed?.value, `${claim.id}: ${value.raw}`).toBe(value.normalised);
        expect(parsed?.unit, `${claim.id}: ${value.raw}`).toBe(value.unit);
```

**with:**
```ts
    for (const claim of GOLDEN_CLAIMS) {
      for (const value of claim.values.filter((item) => item.kind === 'number')) {
        // A number written in words ("four") is read by readNumberWords instead.
        const reading = readNumberWords(value.raw);
        const parsed = parseNumberToken(value.raw) ?? (reading.kind === 'number' ? reading : null);
        expect(parsed?.value, `${claim.id}: ${value.raw}`).toBe(value.normalised);
        expect(parsed?.unit, `${claim.id}: ${value.raw}`).toBe(value.unit);
```

The token tests: the older expectations gain the new `uncheckable` list, and two new groups test the numbers in words and the amounts that cannot be checked.

**In `gate/test/tokens.test.ts`, replace:**
```ts
      numbers: [{ raw: '$450 million', value: '450000000', unit: 'USD' }],
      dates: [{ raw: '29 September 2026', iso: '2026-09-29', precision: 'day' }],
      names: ['robotics', 'corvane', 'partners'],
      initialWord: 'Fixture',
```

**with:**
```ts
      numbers: [{ raw: '$450 million', value: '450000000', unit: 'USD' }],
      dates: [{ raw: '29 September 2026', iso: '2026-09-29', precision: 'day' }],
      uncheckable: [],
      names: ['robotics', 'corvane', 'partners'],
      initialWord: 'Fixture',
```

**In `gate/test/tokens.test.ts`, replace:**
```ts
      ],
      dates: [],
      names: [],
      initialWord: 'Peak',
```

**with:**
```ts
      ],
      dates: [],
      uncheckable: [],
      names: [],
      initialWord: 'Peak',
```

**In `gate/test/tokens.test.ts`, replace:**
```ts
  });

  it('returns three empty lists for a sentence with no tokens', () => {
    expect(extractTokens('the arm moves quickly and quietly.')).toEqual({ numbers: [], dates: [], names: [] });
    expect(extractTokens('')).toEqual({ numbers: [], dates: [], names: [] });
  });
});
```

**with:**
```ts
  });

  it('returns four empty lists for a sentence with no tokens', () => {
    expect(extractTokens('the arm moves quickly and quietly.')).toEqual({ numbers: [], dates: [], uncheckable: [], names: [] });
    expect(extractTokens('')).toEqual({ numbers: [], dates: [], uncheckable: [], names: [] });
  });
});
```

**In `gate/test/tokens.test.ts`, replace:**
```ts
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], names: ['ceo', 'monday'], initialWord: 'The' });
  });

```

**with:**
```ts
  it('removes quoted segments before looking for tokens', () => {
    const text = 'The CEO said "Acme Robotics Ltd will ship 500 units on 3 May 2027" on Monday.';
    expect(extractTokens(text)).toEqual({ numbers: [], dates: [], uncheckable: [], names: ['ceo', 'monday'], initialWord: 'The' });
  });

```

**In `gate/test/tokens.test.ts`, replace:**
```ts
});

describe('extractTokens: names', () => {
  it('exempts the first word of the sentence, whatever it is', () => {
```

**with:**
```ts
});

describe('extractTokens: numbers written in words', () => {
  it.each([
    ['The arm lifts twelve kilograms at full reach.', [['12', 'kg']]],
    ['It lifts twelve kg.', [['12', 'kg']]],
    ['It has twenty-five arms.', [['25', undefined]]],
    ['It has twenty five arms.', [['25', undefined]]],
    ['It shipped two hundred arms.', [['200', undefined]]],
    ['It shipped two hundred and fifty arms.', [['250', undefined]]],
    ['It shipped three million parts.', [['3000000', undefined]]],
    ['It shipped five thousand parts.', [['5000', undefined]]],
    ['It shipped a dozen arms.', [['12', undefined]]],
    ['It shipped two dozen arms.', [['24', undefined]]],
    ['It shipped a hundred arms.', [['100', undefined]]],
    ['Output rose by one percent.', [['1', '%']]],
    ['Output rose by eighteen per cent.', [['18', '%']]],
    ['It moves at two metres per second.', [['2', 'm/s']]],
    ['It has a six-axis arm.', [['6', undefined]]],
    ['It shipped 5 arms and ten more.', [['5', undefined], ['10', undefined]]],
    ['It shipped five arms or six arms.', [['5', undefined], ['6', undefined]]],
  ])('finds the numbers in %j', (text, expected) => {
    expect(numbers(text)).toEqual(expected);
  });

  it('keeps the words as written in the raw text, and reads a unit only in the spelling the table knows', () => {
    expect(extractTokens('It lifts Twelve Kilograms.').numbers).toEqual([{ raw: 'Twelve', value: '12' }]);
    expect(extractTokens('It lifts Twelve kilograms.').numbers).toEqual([{ raw: 'Twelve kilograms', value: '12', unit: 'kg' }]);
    expect(extractTokens('It shipped two hundred and fifty arms.').numbers).toEqual([{ raw: 'two hundred and fifty', value: '250' }]);
  });

  it('reads "one" as a number only inside a longer number or in front of a unit', () => {
    expect(numbers('One of the plants shipped it, and no one knew which one.')).toEqual([]);
    expect(numbers('It shipped one hundred arms and twenty-one more.')).toEqual([['100', undefined], ['21', undefined]]);
    expect(numbers('Output rose one percent.')).toEqual([['1', '%']]);
  });

  it('does not report a number word as a name, and does not report a first word that is a number word', () => {
    const tokens = extractTokens('Twelve kilograms is the payload.');
    expect(tokens.numbers).toEqual([{ raw: 'Twelve kilograms', value: '12', unit: 'kg' }]);
    expect(tokens.names).toEqual([]);
    expect(tokens).not.toHaveProperty('initialWord');
    expect(names('Shipments of Twelve arms rose.')).toEqual([]);
  });

  it('keeps "One" at the start of a sentence as the first word, which is an ordinary opening word', () => {
    expect(extractTokens('One of the plants shipped it.').initialWord).toBe('One');
  });

  it('does not read a number word inside another word, or at the end of a hyphenated word', () => {
    expect(numbers('Someone with a high-five, a top-ten list and the tenth plant.')).toEqual([]);
  });

  it('leaves the unit key out of a number in words that has no unit', () => {
    expect(Object.keys(extractTokens('It shipped twelve arms.').numbers[0]!)).toEqual(['raw', 'value']);
    expect(Object.keys(extractTokens('It shipped twelve kilograms.').numbers[0]!)).toEqual(['raw', 'value', 'unit']);
  });

  it('reads digits first and words after them, and leaves quoted words to G5', () => {
    expect(numbers('Jane said "twelve arms" and 5 arms and ten more.')).toEqual([['5', undefined], ['10', undefined]]);
  });

  it('reads a number in words before it can be mistaken for a date', () => {
    const tokens = extractTokens('Between 2025 and twenty arms.');
    expect(tokens.dates.map((date) => date.iso)).toEqual(['2025']);
    expect(tokens.numbers.map((number) => number.value)).toEqual(['20']);
  });
});

describe('extractTokens: amounts that cannot be checked', () => {
  const uncheckable = (text: string) => extractTokens(text).uncheckable;

  it.each([
    ['Output doubled last year.', ['doubled']],
    ['Output has half the range.', ['half']],
    ['Output rose twice as fast.', ['twice']],
    ['Output rose tenfold.', ['tenfold']],
    ['Output rose ten-fold.', ['ten-fold']],
    ['Output tripled and then quadrupled.', ['tripled', 'quadrupled']],
    ['Output is halved.', ['halved']],
    ['It shipped five five arms.', ['five five']],
  ])('lists the words of %j', (text, expected) => {
    expect(uncheckable(text)).toEqual(expected);
  });

  it('does not read them as numbers or as names', () => {
    const tokens = extractTokens('Output rose tenfold, then Doubled.');
    expect(tokens.numbers).toEqual([]);
    expect(tokens.names).toEqual([]);
    expect(tokens.uncheckable).toEqual(['tenfold', 'doubled']);
  });

  it('lists each word once, in lowercase', () => {
    expect(uncheckable('Doubled and doubled, then DOUBLED, then half.')).toEqual(['doubled', 'half']);
  });

  it('lowercases a run of number words that is not a number, too', () => {
    expect(uncheckable('It shipped Five Five arms.')).toEqual(['five five']);
  });

  it('lists nothing for a sentence with no such word', () => {
    expect(uncheckable('It shipped twelve arms to a halfway house.')).toEqual([]);
  });

  it('leaves quoted words to G5', () => {
    expect(uncheckable('Jane said "it doubled" today.')).toEqual([]);
  });
});

describe('extractTokens: names', () => {
  it('exempts the first word of the sentence, whatever it is', () => {
```

The G4 tests: numbers in words are accepted and rejected like digits, every uncheckable word is rejected with its own code, and a heading with a number in words fails.

**In `gate/test/g4-values.test.ts`, replace:**
```ts
});

describe('G4 dates', () => {
  it.each([
```

**with:**
```ts
});

describe('G4 numbers written in words are checked like digits', () => {
  it.each([
    ['It lifts twelve kilograms.', num('12 kg', '12', 'kg')],
    ['It lifts twelve kg.', num('12 kilograms', '12', 'kg')],
    ['It lifts Twelve kilograms at full reach.', num('12 kg', '12', 'kg')],
    ['It lifts twelve kilograms.', num('twelve', '12', 'kg')],
    ['It lifts twelve kilograms.', num('twelve', '12', 'kilograms')],
    ['It lifts twelve.', num('twelve', '12', 'kg')],
    ['It lifts 12 kg.', num('twelve', '12', 'kg')],
    ['It has twenty-five arms.', num('25', '25')],
    ['It has twenty five arms.', num('25', '25')],
    ['It has twenty-five arms.', num('twenty-five', '25')],
    ['It shipped two hundred arms.', num('200', '200')],
    ['It shipped two hundred and fifty arms.', num('250', '250')],
    ['It shipped three million parts.', num('3 million', '3000000')],
    ['It shipped two thousand five hundred parts.', num('2,500', '2500')],
    ['It shipped a dozen arms.', num('12', '12')],
    ['It shipped a hundred arms.', num('100', '100')],
    ['It rose one percent.', num('1%', '1', '%')],
    ['It rose eighteen per cent.', num('18 per cent', '18', '%')],
    ['It moves at two metres per second.', num('2 m/s', '2', 'm/s')],
  ])('accepts %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual([]);
  });

  it.each([
    ['It lifts thirteen kilograms.', num('12 kg', '12', 'kg')],
    ['It lifts twelve pounds.', num('12 kg', '12', 'kg')],
    ['It lifts twelve kilograms.', num('12 lb', '12', 'lb')],
    ['It lifts twelve kilograms.', num('twelve', '13', 'kg')],
    ['It has twenty-six arms.', num('25', '25')],
    ['It shipped two hundred arms.', num('20', '20')],
    ['It shipped two hundred arms.', num('2', '2')],
    ['It shipped three million parts.', num('3 thousand', '3000')],
    ['It shipped a dozen arms.', num('10', '10')],
    ['It rose one percent.', num('10%', '10', '%')],
    ['It rose one percent.', num('1', '1', 'kg')],
  ])('rejects %j for the claim value %j', (text, value) => {
    expect(codes(mini(text, [claimOf([value])]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('names the number as it is written, and where it is', () => {
    const out = run(mini('It lifts thirteen kilograms.', [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NUMBER_UNSUPPORTED',
        message: 'the number "thirteen kilograms" at title is not in any claim this sentence cites',
        where: 'title',
      },
    ]);
  });

  it('checks a figure in words and the same figure in digits as two numbers', () => {
    const claim = claimOf([num('12 kg', '12', 'kg')]);
    expect(codes(mini('It lifts twelve kilograms, or 12 kg.', [claim]))).toEqual([]);
    expect(codes(mini('It lifts twelve kilograms, or 13 kg.', [claim]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
    expect(codes(mini('It lifts thirteen kilograms, or 12 kg.', [claim]))).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('does not take "one" for a number when it is the pronoun', () => {
    expect(codes(mini('It was one of the plants, and no one knew which one.', [claimOf([])]))).toEqual([]);
  });

  it('does not read a number word that is part of another word', () => {
    expect(codes(mini('It saw someone at the tenth plant and a stone phone.', [claimOf([])]))).toEqual([]);
  });

  it('does not read the quoted words, which G5 checks', () => {
    expect(codes(mini('It was said, "twelve arms and half a plant," by her.', [claimOf([])]))).toEqual([]);
  });
});

describe('G4_NUMBER_WORD_UNCHECKABLE', () => {
  it.each([
    'half',
    'halved',
    'halve',
    'twice',
    'thrice',
    'double',
    'doubled',
    'triple',
    'tripled',
    'quadruple',
    'quadrupled',
    'tenfold',
    'ten-fold',
    'hundredfold',
  ])('rejects "%s", which states an amount that no claim value can be compared with', (word) => {
    const out = run(mini(`It shipped ${word} the arms.`, [claimOf([num('12 kg', '12', 'kg')])]));
    expect(out.failures).toEqual([
      {
        check: 'G4',
        code: 'G4_NUMBER_WORD_UNCHECKABLE',
        message: `the words "${word}" at title state an amount that cannot be checked against a claim: write the figure as digits and cite the claim that gives it`,
        where: 'title',
      },
    ]);
  });

  it('rejects number words that do not make a number', () => {
    expect(codes(mini('It shipped five five arms.', [claimOf([num('5', '5')])]))).toEqual(['G4_NUMBER_WORD_UNCHECKABLE']);
  });

  it('cannot be satisfied by a claim, even one that lists the figure', () => {
    const claim = claimOf([num('twice', '2'), num('2', '2')]);
    expect(codes(mini('It shipped twice the arms.', [claim]))).toEqual(['G4_NUMBER_WORD_UNCHECKABLE']);
  });

  it('is reported once for each word, in lowercase, in the order of the sentence', () => {
    const out = run(mini('It doubled, then Doubled again, and then it halved.', [claimOf([])]));
    expect(out.failures.map((failure) => failure.message.match(/words "([^"]+)"/)?.[1])).toEqual(['doubled', 'halved']);
  });

  it('is reported after the numbers and before the dates of the sentence', () => {
    const out = run(mini('It doubled 13 kg on 30 September 2026.', [claimOf([num('12 kg', '12', 'kg'), when('2026-09-29', '2026-09-29')])]));
    expect(out.failures.map((failure) => failure.code)).toEqual(['G4_NUMBER_UNSUPPORTED', 'G4_NUMBER_WORD_UNCHECKABLE', 'G4_DATE_UNSUPPORTED']);
  });

  it('applies to fact sentences only', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.kind === 'analysis').text = 'The measured rate is half of it, and it doubled.';
      g.draft.limitations[0]!.text = 'It tripled.';
    });
    expect(failures).toEqual([]);
  });

  it('catches a swapped number in words in the golden piece', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text.startsWith('The datasheet lists a rated payload')).text =
        'The datasheet lists a rated payload of thirteen kilograms at full reach and a maximum reach of 1.4 m from the base.';
    });
    expect(failures).toEqual(['G4_NUMBER_UNSUPPORTED']);
  });

  it('catches an uncheckable word in the golden piece', () => {
    const failures = goldenCodes((g) => {
      findSentence(g.draft, (sentence) => sentence.text === 'It lists 7 investors in the round.').text =
        'It lists 7 investors in the round, twice as many as before.';
    });
    expect(failures).toEqual(['G4_NUMBER_WORD_UNCHECKABLE']);
  });

  it('lets the golden piece say "four weeks", because its claim lists the figure in words', () => {
    const sentence = cloneGolden().draft.sections[1]!.paragraphs[0]![1]!;
    expect(sentence.text).toBe('It compared the four weeks before and after the arms went live.');
    expect(checkG4(cloneGolden(), defaultContext()).failures).toEqual([]);
  });
});

describe('G4 dates', () => {
  it.each([
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
  });

  it('rejects a heading with a quoted passage in it', () => {
    expect(headingFailures('What the customer calls "production"', 1)).toEqual([
```

**with:**
```ts
  });

  it.each([
    ['a number in words', 'What twelve means', ['"twelve"']],
    ['a number in words with a unit', 'What twelve kilograms means', ['"twelve kilograms"']],
    ['an amount in words', 'What doubled', ['"doubled"']],
    ['half', 'Half of the arms', ['"half"']],
    ['a number in words and a number in digits', 'What twelve and 13 mean', ['"13"', '"twelve"']],
  ])('rejects %s in a heading', (_name, heading, listed) => {
    const failures = headingFailures(heading);
    expect(failures.map((failure) => failure.code)).toEqual(['G4_HEADING_NUMBER']);
    expect(failures[0]?.message).toBe(
      `the heading "${heading}" contains a number or a date (${listed.join(', ')}): a heading says what a section is about and states no figure`,
    );
  });

  it('does not take "one" in a heading for a number', () => {
    expect(headingCodes('What one of them means')).toEqual([]);
  });

  it('rejects a heading with a quoted passage in it', () => {
    expect(headingFailures('What the customer calls "production"', 1)).toEqual([
```

The G7 tests: analysis may repeat a figure the facts state, in words or digits, but not bring a new one.

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
});

describe('G7_ANALYSIS_NEW_VALUE: dates', () => {
  it('fails a date no fact sentence contains, and says which', () => {
```

**with:**
```ts
});

describe('G7_ANALYSIS_NEW_VALUE: numbers in words', () => {
  it('fails a number in words that no fact sentence contains, and says which', () => {
    expect(run(saying('The thirteen kilograms payload is modest.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number "thirteen kilograms", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it.each([
    ['a number the facts state in digits', 'The twelve kilograms payload is modest.'],
    ['a number whose unit the facts also use', 'The thirty-eight kg arm is modest.'],
    ['a number without a unit', 'The forty arms at Ashvale are modest.'],
    ['a count that the facts state', 'The seven investors are modest.'],
  ])('allows %s', (_name, text) => {
    expect(run(saying(text))).toEqual({ failures: [], holdReasons: [] });
  });

  it('fails the right figure with the wrong unit', () => {
    expect(codes(run(saying('The twelve pounds payload is modest.')))).toEqual(['G7_ANALYSIS_NEW_VALUE']);
  });

  it('fails a word that states an amount with no value to check, and says which', () => {
    expect(run(saying('The measured rate is half the maximum.')).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_NEW_VALUE',
        message: `the analysis sentence at ${ANALYSIS_AT} introduces the number word "half", which no fact sentence contains`,
        where: ANALYSIS_AT,
      },
    ]);
  });

  it('reports each such word once', () => {
    expect(codes(run(saying('The rate doubled, doubled again and then halved.')))).toEqual([
      'G7_ANALYSIS_NEW_VALUE',
      'G7_ANALYSIS_NEW_VALUE',
    ]);
  });

  it('does not take "one" for a number when it is the pronoun', () => {
    expect(run(saying('The gap is one that is normal for a figure quoted as an upper limit.'))).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G7_ANALYSIS_NEW_VALUE: dates', () => {
  it('fails a date no fact sentence contains, and says which', () => {
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/number-words.test.ts test/golden-claims.test.ts test/tokens.test.ts test/g4-values.test.ts test/g7-analysis.test.ts`
Expected: FAIL — `Cannot find module '../src/number-words'`.

- [ ] **Step 3: Write the implementation**

The reader works in three layers. Two regular expressions find phrases: `NUMBER_WORD_SOURCE` for a run of number words with the unit that follows, and `UNCHECKABLE_SOURCE` for the words that cannot be checked. (Each letter of a word is a character class, so that the words match in any case while the units stay case-sensitive, as they are for digits.) `readNumberWords` reads a phrase that `NUMBER_WORD_SOURCE` found. It splits the run into words and works out the value with a small reader that accepts only well-formed numbers: the scales must fall (`two million three hundred thousand`, never `three thousand two million`), nothing may be left over, and `dozen` stands alone or after a multiplier. A phrase that fails that is `uncheckable`, a lone `one` with no unit is `plain` (the pronoun), and anything else is a number.

**Create `gate/src/number-words.ts`:**
```ts
import { UNIT_SOURCE, canonicalUnit } from './normalise';

// Numbers written out in words. A sentence that says "twelve kilograms" states
// a figure just as "12 kg" does, so it has to be checked against the claims the
// same way. This module finds such a figure in a sentence and reads its value;
// `extractTokens` turns it into an ordinary number token. Every function here
// is pure.
//
// What is read: two to nineteen, the tens (twenty ... ninety) with an optional
// unit part ("twenty-five", "twenty five"), "hundred", "thousand", "million",
// "billion" and "dozen", with a multiplier in front ("two hundred", "three
// million", "twenty-five thousand", "two dozen"), "a" in front of a hundred, a
// thousand, a million, a billion or a dozen, an "and" after a hundred or a
// scale ("two hundred and fifty"), and a unit after the words ("twelve
// kilograms", "eighteen per cent"). "one" is a number only inside a longer
// number ("twenty-one", "one hundred") or when a unit follows ("one percent"):
// everywhere else it is the pronoun, as in "one of the plants".
//
// What is not read, and is therefore NOT checked (known limits, listed on the
// /method page): ordinals (first, second, third); vague quantities (a couple,
// several, a few, dozens, hundreds, millions); "zero", "no" and "none"; a
// number in words followed by "-" and a word ("six-axis" is read as the number
// 6, with no unit); fractions in words ("two thirds"; fractions written with
// digits are numbers already); and names that start with a lowercase letter
// (iRobot, xAI), which no capitalisation rule can see.
//
// What cannot be checked is refused instead: words that state an amount but
// have no value to compare ("half", "twice", "doubled", "tenfold", see
// UNCHECKABLE_SOURCE) and a run of number words that is not a well-formed
// number ("five five"). The checks reject both with G4_NUMBER_WORD_UNCHECKABLE,
// so the composer writes the figure as digits and cites a claim that gives it.

const SMALL: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Words that multiply what stands before them; "hundred" is read separately because it also takes a remainder. */
const SCALES: Readonly<Record<string, number>> = { thousand: 1000, million: 1000000, billion: 1000000000 };

// --- The regular expressions -------------------------------------------------

// Each letter of a word becomes a class, so that "Twelve" and "TWELVE" are
// read but the units after the words stay case-sensitive, as they are for digits.
const caseless = (word: string): string => [...word].map((letter) => `[${letter}${letter.toUpperCase()}]`).join('');
const alternatives = (words: readonly string[]): string => words.map(caseless).join('|');

const END = String.raw`(?![\p{L}\p{N}])`;
// A number word never starts inside a word or a hyphenated word: "someone", "high-five" and "top-ten" contain no number.
const START = String.raw`(?<![\p{L}\p{N}])(?<!\p{L}-)`;

const SCALE_WORDS = ['hundred', ...Object.keys(SCALES)];
const NUMBER_WORDS = [...Object.keys(SMALL), ...Object.keys(TENS), ...SCALE_WORDS, 'dozen'];

const WORD = `(?:${alternatives(NUMBER_WORDS)})${END}`;
// "a" is part of the number only in front of a hundred, a thousand, a million, a billion or a dozen.
const ARTICLE = `(?:[Aa]\\s+(?=(?:${alternatives([...SCALE_WORDS, 'dozen'])})${END}))?`;
// "and" is part of the number only right after a hundred, a thousand, a million or a billion.
const AND = `(?:(?<=(?:${alternatives(SCALE_WORDS)}))\\s+${caseless('and')})?`;

const RUN = `${ARTICLE}${WORD}(?:${AND}[-\\s]+${WORD})*`;
const UNIT = `(?:\\s+(?<unit>${UNIT_SOURCE})${END})?`;

/**
 * Regex source for one number in words with its unit, if it has one: "twelve",
 * "twenty-five", "two hundred and fifty", "a dozen", "twelve kilograms". Any
 * letter case. The scanner in tokens.ts compiles it with the `gu` flags. The
 * match may be a lone "one", or words that are not a well-formed number:
 * `readNumberWords` decides what a match is.
 */
export const NUMBER_WORD_SOURCE = `${START}(?<run>${RUN})${UNIT}`;

const WHOLE = new RegExp(`^${NUMBER_WORD_SOURCE}$`, 'u');

const AMOUNT_WORDS = ['half', 'halve', 'halves', 'halved', 'halving', 'twice', 'thrice'];
const MULTIPLY_WORDS = ['double', 'triple', 'quadruple'].flatMap((word) => [word, `${word}s`, `${word.slice(0, -1)}ed`, `${word.slice(0, -1)}ing`]);
const FOLD_PREFIXES = Object.keys(SMALL).filter((word) => word !== 'one').concat(Object.keys(TENS), SCALE_WORDS);

/**
 * Regex source for a word that states an amount that cannot be checked
 * against a claim: half (and halve, halved), twice, thrice, double, triple,
 * quadruple (and their endings), and the "fold" words (tenfold, ten-fold,
 * hundredfold). Any letter case, whole words only. Compile it with the `gu` flags.
 */
export const UNCHECKABLE_SOURCE = `(?<![\\p{L}\\p{N}])(?:${alternatives([...AMOUNT_WORDS, ...MULTIPLY_WORDS])}|(?:${alternatives(FOLD_PREFIXES)})-?${caseless('fold')})${END}`;

// --- Reading a phrase --------------------------------------------------------

/** What `readNumberWords` makes of a phrase that `NUMBER_WORD_SOURCE` matched. */
export type NumberWordsReading =
  | { kind: 'number'; value: string; unit?: string }
  /** A lone "one" with no unit: the pronoun, not a quantity. */
  | { kind: 'plain' }
  /** Number words that do not make a well-formed number, such as "five five". */
  | { kind: 'uncheckable' };

interface Read {
  value: number;
  /** The index of the first word that was not used. */
  next: number;
}

/** One to ninety-nine at `at`: a small number, a ten, or a ten with a unit part. */
function readUnderHundred(words: readonly string[], at: number): Read | undefined {
  const first = words[at] ?? '';
  const tens = TENS[first];
  if (tens !== undefined) {
    const unit = SMALL[words[at + 1] ?? ''];
    return unit === undefined || unit > 9 ? { value: tens, next: at + 1 } : { value: tens + unit, next: at + 2 };
  }
  const small = SMALL[first];
  return small === undefined ? undefined : { value: small, next: at + 1 };
}

/** One to nine hundred ninety-nine at `at`: "two hundred and fifty", "a hundred" (the "a" is dropped before), or under a hundred. */
function readGroup(words: readonly string[], at: number): Read | undefined {
  const lead = readUnderHundred(words, at);
  const hundredAt = lead === undefined ? at : lead.next;
  if (words[hundredAt] !== 'hundred') return lead;
  const afterAnd = words[hundredAt + 1] === 'and' ? hundredAt + 2 : hundredAt + 1;
  const rest = readUnderHundred(words, afterAnd);
  const value = (lead?.value ?? 1) * 100;
  return rest === undefined ? { value, next: hundredAt + 1 } : { value: value + rest.value, next: rest.next };
}

/** The value of the words of a run, or undefined when they are not a well-formed number. */
function evaluate(words: readonly string[]): number | undefined {
  const start = words[0] === 'a' ? 1 : 0;
  if (words.at(-1) === 'dozen') {
    const body = words.slice(start, -1);
    if (body.length === 0) return 12;
    const count = readUnderHundred(body, 0);
    return count !== undefined && count.next === body.length ? count.value * 12 : undefined;
  }

  let at = start;
  let total = 0;
  let lastScale = Infinity;
  while (at < words.length) {
    const group = readGroup(words, at);
    const scaleAt = group === undefined ? at : group.next;
    const scale = SCALES[words[scaleAt] ?? ''];
    if (scale === undefined) {
      if (group === undefined) return undefined;
      total += group.value;
      at = group.next;
      break;
    }
    // The scales must fall: "two million three hundred thousand", never "three thousand two million".
    if (scale >= lastScale) return undefined;
    total += (group?.value ?? 1) * scale;
    lastScale = scale;
    at = scaleAt + 1;
    // The regular expression lets an "and" in only before another number word, so it is never the last word.
    if (words[at] === 'and') at++;
  }
  return at === words.length ? total : undefined;
}

/**
 * Read a phrase that `NUMBER_WORD_SOURCE` matched. A well-formed number gives its
 * value as a plain decimal string and the canonical unit if a unit follows; a lone
 * "one" without a unit is `plain`; anything else made of number words is
 * `uncheckable`. Text that is not a number in words at all is `plain` too.
 */
export function readNumberWords(raw: string): NumberWordsReading {
  const groups = WHOLE.exec(raw.trim().replace(/\s+/g, ' '))?.groups as { run?: string; unit?: string } | undefined;
  if (groups?.run === undefined) return { kind: 'plain' };
  const words = groups.run.toLowerCase().split(/[-\s]+/);
  const unit = groups.unit === undefined ? undefined : canonicalUnit(groups.unit.replace(/\s+/g, ' '));
  if (words.length === 1 && words[0] === 'one' && unit === undefined) return { kind: 'plain' };
  const value = evaluate(words);
  if (value === undefined) return { kind: 'uncheckable' };
  return unit === undefined ? { kind: 'number', value: String(value) } : { kind: 'number', value: String(value), unit };
}
```

`extractTokens` takes the amounts that cannot be checked out first (so that `tenfold` is not read as `ten`), then the numbers in words, and lists them in the new field `uncheckable`.

**In `gate/src/tokens.ts`, replace:**
```ts
import { DATE_SOURCE, NUMBER_SOURCE, parseDateToken, parseNumberToken } from './normalise';
import type { ParsedDate, ParsedNumber } from './normalise';
import { normaliseQuotes, sentenceWords, stripQuoted } from './text';

```

**with:**
```ts
import { DATE_SOURCE, NUMBER_SOURCE, parseDateToken, parseNumberToken } from './normalise';
import type { ParsedDate, ParsedNumber } from './normalise';
import { NUMBER_WORD_SOURCE, UNCHECKABLE_SOURCE, readNumberWords } from './number-words';
import { normaliseQuotes, sentenceWords, stripQuoted } from './text';

```

**In `gate/src/tokens.ts`, replace:**
```ts

export interface SentenceTokens {
  numbers: NumberToken[];
  dates: DateToken[];
  /** Lowercased name tokens, each listed once, in order of first appearance. The first word of the sentence is not among them. */
  names: string[];
```

**with:**
```ts

export interface SentenceTokens {
  /** Numbers written with digits, then numbers written out in words ("twelve kilograms" is 12 kg), each in order of appearance. */
  numbers: NumberToken[];
  dates: DateToken[];
  /**
   * Words that state an amount that has no value to check ("half", "twice",
   * "doubled", "tenfold") and runs of number words that are not a number
   * ("five five"), lowercased, each listed once, in order of appearance.
   */
  uncheckable: string[];
  /** Lowercased name tokens, each listed once, in order of first appearance. The first word of the sentence is not among them. */
  names: string[];
```

**In `gate/src/tokens.ts`, replace:**
```ts
 * 3. Numbers are digit-led tokens with an optional currency, magnitude and
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits. The first
 *    word is every sentence's capital letter, so it is not a name token; when
```

**with:**
```ts
 * 3. Numbers are digit-led tokens with an optional currency, magnitude and
 *    unit. Alphanumeric mixes such as FX-1, H1 and B2B are names, not numbers.
 * 4. Numbers written in words are read next, as numbers ("twelve kilograms" is
 *    12 kg). Words that state an amount but have no value to check (half,
 *    twice, doubled, tenfold) are listed as `uncheckable`. See number-words.ts for
 *    what is read and for the known limits.
 * 5. Names are what is left: every word except the sentence's first that
 *    starts with an uppercase letter or mixes letters and digits. The first
 *    word is every sentence's capital letter, so it is not a name token; when
```

**In `gate/src/tokens.ts`, replace:**
```ts
 * Name detection is deliberately strict: it reports any capitalised word, so
 * an ordinary capitalised word costs a revision round. It cannot see a name
 * that starts in lowercase (iRobot, xAI) or a number spelled out in words;
 * the model verifier covers those. An impossible date (31 February) is not
 * consumed, so its digits come out as numbers that no real date can support.
 */
```

**with:**
```ts
 * Name detection is deliberately strict: it reports any capitalised word, so
 * an ordinary capitalised word costs a revision round. It cannot see a name
 * that starts in lowercase (iRobot, xAI), an ordinal (first, second) or a vague
 * quantity (several, a couple); the model verifier covers those. An impossible date (31 February) is not
 * consumed, so its digits come out as numbers that no real date can support.
 */
```

**In `gate/src/tokens.ts`, replace:**
```ts
  });

  const [first, ...rest] = sentenceWords(withoutNumbers);
  const names = rest.filter(isNameWord).map(toNameToken);
  const tokens: SentenceTokens = { numbers, dates, names: [...new Set(names)] };
  if (first !== undefined && isNameWord(first)) tokens.initialWord = first;
  return tokens;
```

**with:**
```ts
  });

  // Amounts that cannot be checked come out before the numbers in words, so that "tenfold" is not read as "ten".
  const uncheckable: string[] = [];
  const withoutAmounts = consume(withoutNumbers, UNCHECKABLE_SOURCE, (matched) => {
    uncheckable.push(matched.toLowerCase());
    return true;
  });
  const withoutWords = consume(withoutAmounts, NUMBER_WORD_SOURCE, (matched) => {
    const reading = readNumberWords(matched);
    if (reading.kind === 'plain') return false;
    if (reading.kind === 'uncheckable') uncheckable.push(matched.toLowerCase());
    else numbers.push({ raw: matched, value: reading.value, ...(reading.unit === undefined ? {} : { unit: reading.unit }) });
    return true;
  });

  const [first, ...rest] = sentenceWords(withoutWords);
  const names = rest.filter(isNameWord).map(toNameToken);
  const tokens: SentenceTokens = { numbers, dates, uncheckable: [...new Set(uncheckable)], names: [...new Set(names)] };
  if (first !== undefined && isNameWord(first)) tokens.initialWord = first;
  return tokens;
```

**In `gate/src/index.ts`, replace:**
```ts
export * from './limitations';
export * from './normalise';
export * from './render';
export * from './schemas';
```

**with:**
```ts
export * from './limitations';
export * from './normalise';
export * from './number-words';
export * from './render';
export * from './schemas';
```

G4 reports each uncheckable word once, between the number failures and the date failures of the sentence, and a heading that contains one fails `G4_HEADING_NUMBER`. The new code is listed in `G4_CODES`.

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
  'G4_HEADING_QUOTE',
  'G4_HEADING_NAME',
] as const;

```

**with:**
```ts
  'G4_HEADING_QUOTE',
  'G4_HEADING_NAME',
  'G4_NUMBER_WORD_UNCHECKABLE',
] as const;

```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
 *
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A date matches a claim date at the
 * precision the sentence uses. A name matches when each of its words is a word
 * of a cited claim's name value or outlet, or is on the allow-list. Name detection is
 * deliberately strict (see `extractTokens`): a false positive only costs a
 * revision round, a false negative would let an invented name through.
 *
 * The first word of a sentence is not a name token, because every sentence
```

**with:**
```ts
 *
 * A number matches a claim number with the same canonical value, and the same
 * canonical unit if the sentence gives one. A number written out in words
 * ("twelve kilograms") is read as a number and checked the same way; a claim may
 * list it as `raw: "twelve"` with `normalised: "12"`. Words that state an amount
 * with no value to compare ("half", "twice", "doubled", "tenfold") are rejected
 * with G4_NUMBER_WORD_UNCHECKABLE: write the figure as digits and cite a claim
 * for it (number-words.ts says what is read and lists the known limits).
 * A date matches a claim date at the precision the sentence uses. A name
 * matches when each of its words is a word of a cited claim's name value or
 * outlet, or is on the allow-list. Name detection is deliberately strict (see
 * `extractTokens`): a false positive only costs a revision round, a false
 * negative would let an invented name through.
 *
 * The first word of a sentence is not a name token, because every sentence
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
    }

    const seenDates = new Set<string>();
    for (const token of tokens.dates) {
```

**with:**
```ts
    }

    for (const word of tokens.uncheckable) {
      fail(
        'G4_NUMBER_WORD_UNCHECKABLE',
        `the words "${word}" at ${where} state an amount that cannot be checked against a claim: write the figure as digits and cite the claim that gives it`,
      );
    }

    const seenDates = new Set<string>();
    for (const token of tokens.dates) {
```

**In `gate/src/checks/g4-values.ts`, replace:**
```ts

    const tokens = extractTokens(heading);
    const figures = [...tokens.numbers, ...tokens.dates].map((token) => `"${token.raw}"`);
    if (figures.length > 0) {
      fail(
```

**with:**
```ts

    const tokens = extractTokens(heading);
    const figures = [...tokens.numbers.map((token) => token.raw), ...tokens.dates.map((token) => token.raw), ...tokens.uncheckable].map(
      (raw) => `"${raw}"`,
    );
    if (figures.length > 0) {
      fail(
```

G7 treats an uncheckable word in an analysis sentence as a new value.

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 *   The first word of an analysis sentence has its own rule: when it looks like a name
 *   it must be a function word from SENTENCE_STARTERS, a word on the allow-list, or
```

**with:**
```ts
 *   A name that a fact sentence has only as its first word does not count as
 *   stated: say it mid-sentence in a fact.
 *   Numbers written out in words count as numbers, and a word that states an
 *   amount with no value to compare ("half", "doubled") is always new.
 *   The first word of an analysis sentence has its own rule: when it looks like a name
 *   it must be a function word from SENTENCE_STARTERS, a word on the allow-list, or
```

**In `gate/src/checks/g7-analysis.ts`, replace:**
```ts
      }
    }
    for (const token of new Map(tokens.dates.map((date) => [date.raw, date])).values()) {
      if (!dates.some((fact) => dateMatches(token, fact.iso))) {
```

**with:**
```ts
      }
    }
    for (const word of tokens.uncheckable) {
      fail(`number word "${word}"`);
    }
    for (const token of new Map(tokens.dates.map((date) => [date.raw, date])).values()) {
      if (!dates.some((fact) => dateMatches(token, fact.iso))) {
```

- [ ] **Step 4: Run the tests and see the golden piece fail**

The new rule reads the whole golden piece, and the golden piece breaks it.

Run: `npm test --workspace @robywire/gate`
Expected: FAIL — `lets the golden piece say "four weeks", because its claim lists the figure in words`.

- [ ] **Step 5: Repair the golden piece**

Claim c-20 lists the figure that its quoted passage contains.

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
    basis: 'measured',
    status: 'deployed',
    values: [number('18 per cent', '18', '%'), name('Ashvale'), name('Brindle Logistics'), name('FX-1')],
  }),
  claim({
```

**with:**
```ts
    basis: 'measured',
    status: 'deployed',
    values: [number('18 per cent', '18', '%'), number('four', '4'), name('Ashvale'), name('Brindle Logistics'), name('FX-1')],
  }),
  claim({
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  32 passed (32)`.

- [ ] **Step 7: Show that the fixtures are out of date, and regenerate them**

The site fixtures are generated from the golden piece, and their ledgers list the claims, so the ledgers now differ.

Run: `npm run fixtures:check`
Expected: FAIL — `"raw": "four"`.

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 9 fixture files`.

Run: `npm run fixtures:check`
Expected: PASS — `Fixtures are up to date.`

- [ ] **Step 8: Show that the new code has no seeded defect and no label yet**

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G4_NUMBER_WORD_UNCHECKABLE`.

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G4_NUMBER_WORD_UNCHECKABLE`.

- [ ] **Step 9: Add the seeded defects and the label**

`swapped-number-in-words` changes the payload from 12 kg to "thirteen kilograms". `uncheckable-number-word` adds "twice as many as before" to the sentence about the investors.

**In `evals/src/cases/claims.ts`, replace:**
```ts
    },
  },
  {
    id: 'swapped-date',
```

**with:**
```ts
    },
  },
  {
    id: 'swapped-number-in-words',
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the payload as thirteen kilograms, written in words; the claim it cites says 12 kg.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a rated payload of thirteen kilograms and a 1.4 m maximum reach.';
      return base;
    },
  },
  {
    id: 'uncheckable-number-word',
    check: 'G4',
    code: 'G4_NUMBER_WORD_UNCHECKABLE',
    description: 'A sentence says the round has twice as many investors as before, an amount that no claim can support.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').text = 'It lists 7 investors in the round, twice as many as before.';
      return base;
    },
  },
  {
    id: 'swapped-date',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G4_HEADING_QUOTE: 'A heading contained a quotation',
  G4_HEADING_NAME: 'A heading named something no claim supports',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

**with:**
```ts
  G4_HEADING_QUOTE: 'A heading contained a quotation',
  G4_HEADING_NAME: 'A heading named something no claim supports',
  G4_NUMBER_WORD_UNCHECKABLE: 'An amount was written as a word that cannot be checked',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
```

Run: `npm run evals:seeded`
Expected: PASS — `49 of 49 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

- [ ] **Step 10: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 11: Commit**

```bash
git add gate/src gate/test evals/src evals/scoreboard/seeded.json site/src/lib/reasons.ts site/src/content-fixtures
git commit -m "feat(gate): read numbers written in words and refuse amounts that cannot be checked (G4, G7)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 74: G1 checks the description and the author, and agrees with the site schema

**Files:**
- Modify: `gate/src/constants.ts` (new constants `DESK_AUTHOR_NAME` and `DESK_BYLINE_LABEL`)
- Modify: `gate/src/checks/g1-frontmatter.ts` (new codes `G1_DESCRIPTION_EMPTY` and `G1_AUTHOR_NOT_DESK`)
- Modify: `gate/src/render/frontmatter.ts` (`NewsFrontmatter` says what G1 says)
- Modify: `gate/src/fixtures/golden.ts` (the golden author comes from the constant)
- Modify: `site/src/lib/jsonld.ts`, `site/src/pages/news/[slug]/index.astro` (the name and the byline come from the constants)
- Modify: `evals/src/cases/frontmatter-structure.ts` (two seeded defects), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `site/src/lib/reasons.ts` (two labels)
- Test: `gate/test/constants.test.ts`, `gate/test/g1-frontmatter.test.ts`, `gate/test/render.test.ts`, `gate/test/frontmatter-consistency.test.ts` (new), `site/test/byline.test.ts` (new), `site/test/jsonld.test.ts`

Three gaps in the frontmatter of a piece, all found by reading Plan 1 against the design.

1. **An empty description.** `NewsFrontmatter` (the schema the site builds with) requires a description, but G1 only checked that it was not too long. A draft with a blank description passed the whole gate and then failed the site build, which opens a pull request for the owner instead of sending the draft back for revision. G1 now has `G1_DESCRIPTION_EMPTY` (blank after trimming).
2. **Any author.** The design says that no piece carries a human author's name, but G1 only required that an author name existed. The name of the Desk and the short phrase after it in the byline were also written into the article page and into the structured data by hand. They become two constants in the gate package: `DESK_AUTHOR_NAME` (`Robywire Desk`) and `DESK_BYLINE_LABEL`. G1 now has `G1_AUTHOR_NOT_DESK`: the author must be exactly `DESK_AUTHOR_NAME`. A blank name is still `G1_AUTHOR_MISSING`.
   The byline used to read "automated, source-verified". "Verified" claims a check that does not exist yet: the model verifier (G10) arrives with the Desk in Plan 2. The label is now `automated, with sources linked`, which is true today. The wording is the owner's to confirm, and the comment in `constants.ts` says so.
3. **G1 and the schema could drift apart.** They are two descriptions of the same rules, kept in two places. Drafts that G1 accepts must satisfy the schema, or the build fails after the gate has passed them; and a draft that G1 rejects should not be accepted as written by the schema either. A new test runs one list of drafts through both. Making it pass needed four changes to `NewsFrontmatter`: the spaces around a title and a description are trimmed before they are checked, so blank text is rejected; the same category twice is rejected; the funding tag without a beat is rejected; and the author must be the Desk.

- [ ] **Step 1: Write the failing gate tests**

**In `gate/test/constants.test.ts`, replace:**
```ts
  CLAIM_TYPES,
  CROSS_TAGS,
  SAFE_BASES,
  STATUSES,
```

**with:**
```ts
  CLAIM_TYPES,
  CROSS_TAGS,
  DESK_AUTHOR_NAME,
  DESK_BYLINE_LABEL,
  SAFE_BASES,
  STATUSES,
```

**In `gate/test/constants.test.ts`, replace:**
```ts
  });
});
```

**with:**
```ts
  });
});

describe('the byline of the Desk', () => {
  it('names the author of every piece', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
  });

  it('says in a few plain words how a piece is made, and claims no verification that does not exist yet', () => {
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
    expect(DESK_BYLINE_LABEL).not.toMatch(/verif|check|audit/i);
    expect(DESK_BYLINE_LABEL).toMatch(/^[\x20-\x7E]+$/);
  });
});
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
import { checkG1 } from '../src/checks/g1-frontmatter';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
```

**with:**
```ts
import { checkG1 } from '../src/checks/g1-frontmatter';
import { defaultContext } from '../src/config';
import { DESK_AUTHOR_NAME } from '../src/constants';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
});

describe('G1_DESCRIPTION_TOO_LONG', () => {
  it('passes at exactly 155 characters and fails at 156', () => {
```

**with:**
```ts
});

describe('G1_DESCRIPTION_EMPTY', () => {
  it.each(['', ' ', '\n\t '])('fails for the description %j, and says where', (description) => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.description.text = description)), defaultContext());
    expect(out.failures).toEqual([
      {
        check: 'G1',
        code: 'G1_DESCRIPTION_EMPTY',
        message: 'the description is empty: the page and search results need a one-sentence description',
        where: 'description',
      },
    ]);
  });

  it('passes for a one-word description', () => {
    expect(codesAfter((g) => (g.draft.description.text = 'Funding'))).toEqual([]);
  });

  it('is not also reported as too long', () => {
    expect(codesAfter((g) => (g.draft.description.text = ''), defaultContext({ config: { descriptionMax: 0 } }))).toEqual([
      'G1_DESCRIPTION_EMPTY',
    ]);
  });
});

describe('G1_DESCRIPTION_TOO_LONG', () => {
  it('passes at exactly 155 characters and fails at 156', () => {
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
});

describe('G1: several problems at once', () => {
  it('reports every one, so a single revision round can fix them all', () => {
```

**with:**
```ts
});

describe('G1_AUTHOR_NOT_DESK', () => {
  it.each(['Jane Doe', 'Robywire', 'robywire desk', 'Robywire  Desk', 'Robywire Desk ', ' Robywire Desk', 'Robywire Desk.'])(
    'fails for the author name %j, and says what it must be',
    (name) => {
      const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.author.name = name)), defaultContext());
      expect(out.failures).toEqual([
        {
          check: 'G1',
          code: 'G1_AUTHOR_NOT_DESK',
          message: `the author is "${name}", but every piece is written by the Desk: the author must be "Robywire Desk"`,
          where: 'author',
        },
      ]);
    },
  );

  it('passes for the Desk', () => {
    expect(codesAfter((g) => (g.draft.author.name = DESK_AUTHOR_NAME))).toEqual([]);
  });

  it('is not also reported for a blank name, which is the missing author', () => {
    expect(codesAfter((g) => (g.draft.author.name = ''))).toEqual(['G1_AUTHOR_MISSING']);
    expect(codesAfter((g) => (g.draft.author.name = '  '))).toEqual(['G1_AUTHOR_MISSING']);
    expect(codesAfter((g) => ((g.draft as { author?: unknown }).author = undefined))).toEqual(['G1_AUTHOR_MISSING']);
  });
});

describe('G1: several problems at once', () => {
  it('reports every one, so a single revision round can fix them all', () => {
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
      g.draft.slug = 'Bad Slug';
      g.draft.categories = [];
      g.draft.author.name = '';
    });
    expect(codes).toEqual([
```

**with:**
```ts
      g.draft.slug = 'Bad Slug';
      g.draft.categories = [];
      g.draft.author.name = 'Jane Doe';
    });
    expect(codes).toEqual([
```

**In `gate/test/g1-frontmatter.test.ts`, replace:**
```ts
      'G1_SLUG_FORMAT',
      'G1_CATEGORY_COUNT',
      'G1_AUTHOR_MISSING',
    ]);
  });
```

**with:**
```ts
      'G1_SLUG_FORMAT',
      'G1_CATEGORY_COUNT',
      'G1_AUTHOR_NOT_DESK',
    ]);
  });
```

The schema tests gain the four new rejections and the trimming.

**In `gate/test/render.test.ts`, replace:**
```ts
  it.each([
    ['an empty title', { ...valid, title: '' }],
    ['a description over 155 characters', { ...valid, description: 'x'.repeat(156) }],
    ['a date that is not a calendar date', { ...valid, publishedAt: '2026-02-30' }],
```

**with:**
```ts
  it.each([
    ['an empty title', { ...valid, title: '' }],
    ['a title of spaces', { ...valid, title: '   ' }],
    ['an empty description', { ...valid, description: '' }],
    ['a description of spaces', { ...valid, description: '   ' }],
    ['a description over 155 characters', { ...valid, description: 'x'.repeat(156) }],
    ['a date that is not a calendar date', { ...valid, publishedAt: '2026-02-30' }],
```

**In `gate/test/render.test.ts`, replace:**
```ts
    ['four categories', { ...valid, categories: ['humanoids', 'funding', 'field-mobility', 'home-consumer'] }],
    ['a category outside the vocabulary', { ...valid, categories: ['robots'] }],
    ['another format', { ...valid, format: 'explainer' }],
    ['a key the contract does not know', { ...valid, image: 'x' }],
    ['an author without a name', { ...valid, author: { name: '' } }],
  ])('rejects %s', (_label, data) => {
    expect(NewsFrontmatter.safeParse(data).success).toBe(false);
  });
});

```

**with:**
```ts
    ['four categories', { ...valid, categories: ['humanoids', 'funding', 'field-mobility', 'home-consumer'] }],
    ['a category outside the vocabulary', { ...valid, categories: ['robots'] }],
    ['the same category twice', { ...valid, categories: ['humanoids', 'humanoids'] }],
    ['funding without a beat', { ...valid, categories: ['funding'] }],
    ['another format', { ...valid, format: 'explainer' }],
    ['a key the contract does not know', { ...valid, image: 'x' }],
    ['an author without a name', { ...valid, author: { name: '' } }],
    ['an author that is not the Desk', { ...valid, author: { name: 'Jane Doe' } }],
  ])('rejects %s', (_label, data) => {
    expect(NewsFrontmatter.safeParse(data).success).toBe(false);
  });

  it('accepts a title and a description of one character', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, title: 'A', description: 'D' }).success).toBe(true);
  });

  it('accepts funding beside a beat, and three different categories', () => {
    expect(NewsFrontmatter.safeParse({ ...valid, categories: ['funding', 'humanoids'] }).success).toBe(true);
    expect(NewsFrontmatter.safeParse({ ...valid, categories: ['humanoids', 'field-mobility', 'funding'] }).success).toBe(true);
  });

  it('trims the spaces around a title and a description, and counts the length after trimming', () => {
    const parsed = NewsFrontmatter.parse({ ...valid, title: '  A title ', description: ` ${'x'.repeat(155)} ` });
    expect(parsed.title).toBe('A title');
    expect(parsed.description).toBe('x'.repeat(155));
  });
});

```

The consistency test has two lists of drafts. G1 must accept the first (the golden piece, its three variants and benign changes: a reworded description, reordered categories, one more category from the vocabulary, a leap day and so on), and for each of them the schema must accept the frontmatter that the renderer writes. G1 must reject the second list, and for each of them the schema must reject the frontmatter, or change it by trimming, or the renderer must refuse to write it. A last test requires the second list to trigger every frontmatter code of G1.

**Create `gate/test/frontmatter-consistency.test.ts`:**
```ts
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { G1_CODES, checkG1 } from '../src/checks';
import { defaultContext } from '../src/config';
import { cloneGolden, makeVariant } from '../src/fixtures';
import type { GateInput, GateResult } from '../src/gate';
import { NewsFrontmatter, renderDraft } from '../src/render';
import { mutate } from './helpers';

// G1 checks the frontmatter of a draft; NewsFrontmatter is what the site checks
// when it builds the page. If the two disagree, a piece can pass the gate and
// then fail the build, which opens a pull request instead of going back for
// revision. This file runs one list of drafts through both and fails if they
// ever disagree:
//
//   1. whenever G1 has no complaint about the frontmatter, the frontmatter the
//      renderer writes satisfies the schema; and
//   2. whenever G1 rejects the frontmatter, the schema rejects it too, or
//      changes it (trims it), or the renderer refuses to write it.
//
// G1_SLUG_FORMAT is left out of the second rule: the slug is the name of the
// file, not a frontmatter field. A date before the year 1000 is not tested:
// G1 rejects it and the schema accepts it, which cannot make a piece fail the build.

const FRONTMATTER_CODES: readonly string[] = G1_CODES.filter((code) => code !== 'G1_SLUG_FORMAT');

const PUBLISH: GateResult = {
  route: 'publish',
  failures: [],
  holdReasons: [],
  checks: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' },
};

/** What the schema makes of the frontmatter the renderer writes for `input`; undefined if the renderer refuses the draft. */
function schemaSays(input: GateInput) {
  let mdx: string;
  try {
    mdx = renderDraft(input.draft, input.claims, { runId: 'consistency', gate: PUBLISH }).mdx;
  } catch {
    return undefined;
  }
  const block = /^---\n([\s\S]*?)\n---\n/.exec(mdx)![1]!;
  return NewsFrontmatter.safeParse(parseYaml(block));
}

/** The frontmatter fields exactly as the draft has them. */
const asWritten = (input: GateInput) => ({
  title: input.draft.title.text,
  description: input.draft.description.text,
  publishedAt: input.draft.publishedAt,
  categories: input.draft.categories,
  format: 'news',
  featured: false,
  author: { name: input.draft.author.name },
});

const variant = (n: number, categories: string[], publishedAt: string): GateInput =>
  makeVariant(cloneGolden(), {
    slug: `fixture-robotics-ships-fx-${n}-to-second-plant`,
    publishedAt,
    categories,
    replace: [
      ['FX-1', `FX-${n}`],
      ['fx-1', `fx-${n}`],
    ],
  });

type Change = (copy: GateInput) => void;

/** Drafts whose frontmatter is fine. */
const ACCEPTED: [string, GateInput][] = [
  ['the golden piece', cloneGolden()],
  ['the FX-2 variant', variant(2, ['humanoids'], '2026-10-03')],
  ['the FX-3 variant', variant(3, ['policy-standards'], '2026-10-02')],
  ['the FX-4 variant', variant(4, ['home-consumer', 'field-mobility'], '2026-10-01')],
  ...(
    [
      ['a reworded description', (g) => (g.draft.description.text = 'Fixture Robotics has begun deliveries to a second plant.')],
      ['a one-word description', (g) => (g.draft.description.text = 'Shipments')],
      ['a description of exactly 155 characters', (g) => (g.draft.description.text = 'x'.repeat(155))],
      ['a description with spaces around it, 155 characters in all', (g) => (g.draft.description.text = ` ${'x'.repeat(153)} `)],
      ['a reworded title', (g) => (g.draft.title.text = 'Fixture Robotics starts deliveries to its second plant')],
      ['a one-word title', (g) => (g.draft.title.text = 'Funding')],
      ['reordered categories', (g) => (g.draft.categories = ['funding', 'industrial-warehouse'])],
      ['another beat', (g) => (g.draft.categories = ['software-autonomy', 'funding'])],
      ['one category', (g) => (g.draft.categories = ['components-supply-chain'])],
      ['an extra category within the vocabulary', (g) => (g.draft.categories = ['industrial-warehouse', 'field-mobility', 'funding'])],
      ['a leap day', (g) => (g.draft.publishedAt = '2028-02-29')],
      ['the end of the year', (g) => (g.draft.publishedAt = '2026-12-31')],
      ['a title with quotation marks and a colon', (g) => (g.draft.title.text = 'Fixture says: "ships"')],
      ['a description with a hash and a dash', (g) => (g.draft.description.text = '# one - two: three')],
    ] as [string, Change][]
  ).map(([name, change]): [string, GateInput] => [name, mutate(cloneGolden(), change)]),
];

/** Drafts whose frontmatter G1 rejects. */
const REJECTED: [string, Change][] = [
  ['an empty title', (g) => (g.draft.title.text = '')],
  ['a title of spaces', (g) => (g.draft.title.text = '   ')],
  ['an empty description', (g) => (g.draft.description.text = '')],
  ['a description of spaces', (g) => (g.draft.description.text = '  \t ')],
  ['a description of 156 characters', (g) => (g.draft.description.text = 'x'.repeat(156))],
  ['a description of 156 characters with spaces at the end', (g) => (g.draft.description.text = `${'x'.repeat(150)}      `)],
  ['an impossible date', (g) => (g.draft.publishedAt = '2026-02-30')],
  ['a non-leap 29 February', (g) => (g.draft.publishedAt = '2026-02-29')],
  ['a month 13', (g) => (g.draft.publishedAt = '2026-13-01')],
  ['a date without zeros', (g) => (g.draft.publishedAt = '2026-8-4')],
  ['a date in words', (g) => (g.draft.publishedAt = '24 August 2026')],
  ['a year only', (g) => (g.draft.publishedAt = '2026')],
  ['a date with a time', (g) => (g.draft.publishedAt = '2026-10-04T00:00:00Z')],
  ['an empty date', (g) => (g.draft.publishedAt = '')],
  ['no category', (g) => (g.draft.categories = [])],
  ['four categories', (g) => (g.draft.categories = ['humanoids', 'home-consumer', 'field-mobility', 'funding'])],
  ['a repeated category', (g) => (g.draft.categories = ['humanoids', 'humanoids'])],
  ['an unknown category', (g) => (g.draft.categories = ['humanoids', 'quantum-robots'])],
  ['a category in capitals', (g) => (g.draft.categories = ['Humanoids'])],
  ['a category that is not a plain slug', (g) => (g.draft.categories = ['humanoids, funding'])],
  ['funding without a beat', (g) => (g.draft.categories = ['funding'])],
  ['funding beside an unknown category', (g) => (g.draft.categories = ['funding', 'robots'])],
  ['a blank author', (g) => (g.draft.author.name = '')],
  ['an author of spaces', (g) => (g.draft.author.name = '   ')],
  ['another author', (g) => (g.draft.author.name = 'Jane Doe')],
  ['the Desk with a space after it', (g) => (g.draft.author.name = 'Robywire Desk ')],
];

describe('G1 and NewsFrontmatter: a draft that G1 accepts satisfies the schema', () => {
  it.each(ACCEPTED)('%s', (_name, input) => {
    const complaints = checkG1(input, defaultContext()).failures.filter((failure) => FRONTMATTER_CODES.includes(failure.code));
    expect(complaints).toEqual([]);
    const result = schemaSays(input);
    expect(result?.success, JSON.stringify(result)).toBe(true);
  });
});

describe('G1 and NewsFrontmatter: a draft that G1 rejects is rejected or changed by the schema', () => {
  it.each(REJECTED)('%s', (_name, change) => {
    const input = mutate(cloneGolden(), change);
    const complaints = checkG1(input, defaultContext()).failures.filter((failure) => FRONTMATTER_CODES.includes(failure.code));
    expect(complaints.length).toBeGreaterThan(0);

    const result = schemaSays(input);
    if (result === undefined) return; // the renderer refuses to write the draft at all
    const unchanged = result.success && JSON.stringify(result.data) === JSON.stringify(asWritten(input));
    expect(unchanged, 'the schema accepts, as written, a frontmatter that G1 rejects').toBe(false);
  });

  it('covers every code of G1 that is about the frontmatter', () => {
    const covered = new Set(
      REJECTED.flatMap(([, change]) =>
        checkG1(mutate(cloneGolden(), change), defaultContext()).failures.map((failure) => failure.code),
      ),
    );
    expect([...covered].sort()).toEqual([...FRONTMATTER_CODES].sort());
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/constants.test.ts test/g1-frontmatter.test.ts test/render.test.ts test/frontmatter-consistency.test.ts`
Expected: FAIL — `the byline of the Desk`, `G1_DESCRIPTION_EMPTY`, `G1_AUTHOR_NOT_DESK` and `the schema accepts, as written, a frontmatter that G1 rejects`.

- [ ] **Step 3: Write the implementation**

The constants, with the comment that makes the wording the owner's.

**In `gate/src/constants.ts`, replace:**
```ts
/** The seven beats from the content contract (section 4). A closed vocabulary. */
export const BEATS = [
```

**with:**
```ts
/** The name every piece is published under. G1 rejects any other author, and the frontmatter schema accepts no other. */
export const DESK_AUTHOR_NAME = 'Robywire Desk';

/**
 * The few words after the Desk's name in the byline of an article. It says how a
 * piece is made and claims nothing that does not exist yet: it must not say the
 * piece is "verified" while the model verifier (G10) is not running. The
 * wording is the owner's to confirm; change it here and nowhere else.
 */
export const DESK_BYLINE_LABEL = 'automated, with sources linked';

/** The seven beats from the content contract (section 4). A closed vocabulary. */
export const BEATS = [
```

G1 checks the description is not blank (a blank description is not also "too long"), and the author.

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
import { BEATS, CATEGORY_VOCAB, CROSS_TAGS } from '../constants';
import type { Check, Failure } from '../gate';
import { parseDateToken } from '../normalise';
```

**with:**
```ts
import { BEATS, CATEGORY_VOCAB, CROSS_TAGS, DESK_AUTHOR_NAME } from '../constants';
import type { Check, Failure } from '../gate';
import { parseDateToken } from '../normalise';
```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
export const G1_CODES = [
  'G1_TITLE_EMPTY',
  'G1_DESCRIPTION_TOO_LONG',
  'G1_BAD_DATE',
```

**with:**
```ts
export const G1_CODES = [
  'G1_TITLE_EMPTY',
  'G1_DESCRIPTION_EMPTY',
  'G1_DESCRIPTION_TOO_LONG',
  'G1_BAD_DATE',
```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
  'G1_CATEGORY_NO_BEAT',
  'G1_AUTHOR_MISSING',
] as const;

```

**with:**
```ts
  'G1_CATEGORY_NO_BEAT',
  'G1_AUTHOR_MISSING',
  'G1_AUTHOR_NOT_DESK',
] as const;

```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
/**
 * G1, frontmatter: the fields the site builds from the draft (title,
 * description, date, slug, categories, author) are present and well formed.
 */
export const checkG1: Check = ({ draft }, ctx) => {
```

**with:**
```ts
/**
 * G1, frontmatter: the fields the site builds from the draft (title,
 * description, date, slug, categories, author) are present and well formed, and
 * the author is the Desk. `NewsFrontmatter` (render/frontmatter.ts) is what the
 * site checks at build time; gate/test/frontmatter-consistency.test.ts keeps
 * the two from drifting apart.
 */
export const checkG1: Check = ({ draft }, ctx) => {
```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts

  const length = draft.description.text.length;
  if (length > ctx.config.descriptionMax) {
    fail(
      'G1_DESCRIPTION_TOO_LONG',
```

**with:**
```ts

  const length = draft.description.text.length;
  if (draft.description.text.trim() === '') {
    fail('G1_DESCRIPTION_EMPTY', 'the description is empty: the page and search results need a one-sentence description', 'description');
  } else if (length > ctx.config.descriptionMax) {
    fail(
      'G1_DESCRIPTION_TOO_LONG',
```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
  }

  if ((draft.author?.name ?? '').trim() === '') {
    fail('G1_AUTHOR_MISSING', 'the author name is missing', 'author');
  }

```

**with:**
```ts
  }

  const author = draft.author?.name ?? '';
  if (author.trim() === '') {
    fail('G1_AUTHOR_MISSING', 'the author name is missing', 'author');
  } else if (author !== DESK_AUTHOR_NAME) {
    fail('G1_AUTHOR_NOT_DESK', `the author is "${author}", but every piece is written by the Desk: the author must be "${DESK_AUTHOR_NAME}"`, 'author');
  }

```

The schema.

**In `gate/src/render/frontmatter.ts`, replace:**
```ts
import { z } from 'zod';
import { CATEGORY_VOCAB } from '../constants';

/**
```

**with:**
```ts
import { z } from 'zod';
import { BEATS, CATEGORY_VOCAB, DESK_AUTHOR_NAME } from '../constants';

const isBeat = (category: string): boolean => (BEATS as readonly string[]).includes(category);

/**
```

**In `gate/src/render/frontmatter.ts`, replace:**
```ts
 * schema, so a piece the renderer writes is a piece the site accepts, and a
 * hand-edited key the contract does not know is a build error.
 */
export const NewsFrontmatter = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1).max(155),
  publishedAt: z.iso.date(),
  categories: z.array(z.enum(CATEGORY_VOCAB)).min(1).max(3),
  format: z.literal('news'),
  featured: z.boolean(),
  author: z.strictObject({ name: z.string().min(1) }),
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
```

**with:**
```ts
 * schema, so a piece the renderer writes is a piece the site accepts, and a
 * hand-edited key the contract does not know is a build error.
 *
 * It says the same as check G1 (gate/test/frontmatter-consistency.test.ts
 * runs both on the same drafts): the title and the description are not blank,
 * and the spaces around them are trimmed before their length is measured; the
 * categories are one to three different slugs from the vocabulary, and the
 * funding tag comes with a beat; the author is the Desk.
 */
export const NewsFrontmatter = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).max(155),
  publishedAt: z.iso.date(),
  categories: z
    .array(z.enum(CATEGORY_VOCAB))
    .min(1)
    .max(3)
    .refine((categories) => new Set(categories).size === categories.length, { message: 'a category is listed twice' })
    .refine((categories) => !categories.includes('funding') || categories.some(isBeat), {
      message: 'funding is a tag, not a beat: list the beat the story is about as well',
    }),
  format: z.literal('news'),
  featured: z.boolean(),
  author: z.strictObject({ name: z.literal(DESK_AUTHOR_NAME) }),
});
export type NewsFrontmatter = z.infer<typeof NewsFrontmatter>;
```

The golden piece takes its author from the constant, so there is one place to change.

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
import { createHash } from 'node:crypto';
import { renderLimitation } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence, LimitationSentence } from '../schemas';
```

**with:**
```ts
import { createHash } from 'node:crypto';
import { DESK_AUTHOR_NAME } from '../constants';
import { renderLimitation } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence, LimitationSentence } from '../schemas';
```

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: 'Robywire Desk' },
  title: fact('Fixture Robotics ships its FX-1 warehouse arm to a second plant', 'c-1'),
  description: fact(
```

**with:**
```ts
  publishedAt: '2026-10-04',
  categories: ['industrial-warehouse', 'funding'],
  author: { name: DESK_AUTHOR_NAME },
  title: fact('Fixture Robotics ships its FX-1 warehouse arm to a second plant', 'c-1'),
  description: fact(
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  33 passed (33)`.

- [ ] **Step 5: Write the failing site tests**

The new site test scans the code of the site (not the generated fixture pieces, which carry the author as data) and requires that nothing in it repeats the name of the Desk or the byline wording, and that the article page and the structured data use the constants.

**Create `site/test/byline.test.ts`:**
```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESK_AUTHOR_NAME, DESK_BYLINE_LABEL } from '@robywire/gate';

// The name of the Desk and the words of the byline are written once, in the
// gate package, because the byline is a claim about how a piece is made and the
// wording is the owner's to confirm. Nothing in the site's own code may repeat
// them: the article page and the structured data take them from the constants.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
// The generated fixture pieces carry the author in their frontmatter, as data.
const CODE_FOLDERS = ['components', 'layouts', 'lib', 'pages', 'styles'];

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  );
}

const sources = CODE_FOLDERS.flatMap((folder) => filesIn(path.join(SRC, folder))).map((file) => ({
  name: path.relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}));

describe('the byline constants', () => {
  it('are the ones the gate publishes', () => {
    expect(DESK_AUTHOR_NAME).toBe('Robywire Desk');
    expect(DESK_BYLINE_LABEL).toBe('automated, with sources linked');
  });

  it('are not repeated as text anywhere in the site code', () => {
    const offenders = sources
      .filter(({ text }) => text.includes(DESK_AUTHOR_NAME) || text.includes(DESK_BYLINE_LABEL) || text.includes('source-verified'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('are used by the article page and by the structured data', () => {
    const byName = new Map(sources.map(({ name, text }) => [name, text]));
    const page = byName.get(path.join('pages', 'news', '[slug]', 'index.astro'))!;
    expect(page).toContain('DESK_AUTHOR_NAME');
    expect(page).toContain('DESK_BYLINE_LABEL');
    expect(byName.get(path.join('lib', 'jsonld.ts'))).toContain('DESK_AUTHOR_NAME');
  });
});
```

**In `site/test/jsonld.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { DESK_AUTHOR_NAME } from '@robywire/gate';
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

```

**In `site/test/jsonld.test.ts`, replace:**
```ts

  it('names the Desk as the author and Robywire as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: 'Robywire Desk' });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Robywire', url: SITE });
  });
```

**with:**
```ts

  it('names the Desk as the author and Robywire as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: DESK_AUTHOR_NAME });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Robywire', url: SITE });
  });
```

Run: `npm test --workspace @robywire/site -- test/byline.test.ts`
Expected: FAIL — `are not repeated as text anywhere in the site code` and `are used by the article page and by the structured data`.

- [ ] **Step 6: Use the constants in the site**

**In `site/src/lib/jsonld.ts`, replace:**
```ts
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';
```

**with:**
```ts
import { DESK_AUTHOR_NAME } from '@robywire/gate';
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';
```

**In `site/src/lib/jsonld.ts`, replace:**
```ts
    datePublished: piece.publishedAt,
    dateModified: latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: 'Robywire Desk' },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
```

**with:**
```ts
    datePublished: piece.publishedAt,
    dateModified: latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: 'Robywire', url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
```

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
---
import { render } from 'astro:content';
import BeatChips from '../../../components/BeatChips.astro';
import CorrectionNotice from '../../../components/CorrectionNotice.astro';
```

**with:**
```astro
---
import { render } from 'astro:content';
import { DESK_AUTHOR_NAME, DESK_BYLINE_LABEL } from '@robywire/gate';
import BeatChips from '../../../components/BeatChips.astro';
import CorrectionNotice from '../../../components/CorrectionNotice.astro';
```

**In `site/src/pages/news/[slug]/index.astro`, replace:**
```astro
      <h1>{piece.data.title}</h1>
      <p class="dek">{piece.data.description}</p>
      <p class="byline"><a href="/method/">Robywire Desk &middot; automated, source-verified</a> &middot; <time datetime={piece.data.publishedAt}>{formatDate(piece.data.publishedAt)}</time></p>
    </header>
    <CorrectionNotice corrections={corrections} />
```

**with:**
```astro
      <h1>{piece.data.title}</h1>
      <p class="dek">{piece.data.description}</p>
      <p class="byline"><a href="/method/">{DESK_AUTHOR_NAME} &middot; {DESK_BYLINE_LABEL}</a> &middot; <time datetime={piece.data.publishedAt}>{formatDate(piece.data.publishedAt)}</time></p>
    </header>
    <CorrectionNotice corrections={corrections} />
```

Run: `npm test --workspace @robywire/site -- test/byline.test.ts test/jsonld.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 7: Show that the new codes have no seeded defect and no label yet**

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G1_DESCRIPTION_EMPTY`.

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G1_AUTHOR_NOT_DESK`.

- [ ] **Step 8: Add the seeded defects and the labels**

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    },
  },
  {
    id: 'long-description',
```

**with:**
```ts
    },
  },
  {
    id: 'empty-description',
    check: 'G1',
    code: 'G1_DESCRIPTION_EMPTY',
    description: 'The description is blank.',
    apply: (base) => {
      base.draft.description.text = '  ';
      return base;
    },
  },
  {
    id: 'long-description',
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    },
  },
  {
    id: 'short-opening',
```

**with:**
```ts
    },
  },
  {
    id: 'author-not-desk',
    check: 'G1',
    code: 'G1_AUTHOR_NOT_DESK',
    description: 'The author is a person, not the Desk.',
    apply: (base) => {
      base.draft.author.name = 'Jane Doe';
      return base;
    },
  },
  {
    id: 'short-opening',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
export const REASON_LABELS: Readonly<Record<string, string>> = {
  G1_TITLE_EMPTY: 'The title was empty',
  G1_DESCRIPTION_TOO_LONG: 'The description was too long',
  G1_BAD_DATE: 'The date was not a real date',
```

**with:**
```ts
export const REASON_LABELS: Readonly<Record<string, string>> = {
  G1_TITLE_EMPTY: 'The title was empty',
  G1_DESCRIPTION_EMPTY: 'The description was empty',
  G1_DESCRIPTION_TOO_LONG: 'The description was too long',
  G1_BAD_DATE: 'The date was not a real date',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G1_CATEGORY_NO_BEAT: 'Tagged funding without a beat',
  G1_AUTHOR_MISSING: 'The author name was missing',
  G2_OPENING_LENGTH: 'The opening paragraph was the wrong length',
  G2_TAKEAWAYS_COUNT: 'The piece had the wrong number of key takeaways',
```

**with:**
```ts
  G1_CATEGORY_NO_BEAT: 'Tagged funding without a beat',
  G1_AUTHOR_MISSING: 'The author name was missing',
  G1_AUTHOR_NOT_DESK: 'The author was not the Desk',
  G2_OPENING_LENGTH: 'The opening paragraph was the wrong length',
  G2_TAKEAWAYS_COUNT: 'The piece had the wrong number of key takeaways',
```

Run: `npm run evals:seeded`
Expected: PASS — `51 of 51 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

- [ ] **Step 9: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 10: Look at the byline in a built page**

The fixture pieces do not change (their author was always `Robywire Desk`), but the article page now builds its byline from the constants. Build the fixture site and look.

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Run: `grep -o 'class="byline"><a href="/method/">[^<]*' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: PASS — `Robywire Desk &middot; automated, with sources linked`

- [ ] **Step 11: Commit**

```bash
git add gate/src gate/test evals/src evals/scoreboard/seeded.json site/src site/test
git commit -m "feat(gate): G1 checks the description is not empty and the author is the Desk, and agrees with the site schema" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 75: The 14-day window lives in the gate

**Files:**
- Modify: `gate/src/normalise.ts` (new function `dayNumber`)
- Modify: `gate/src/config.ts` (new type `RecentTitle`, new threshold `titleWindowDays`, `recentTitles` carries dates)
- Modify: `gate/src/checks/g9-hygiene.ts` (the window)
- Modify: `gate/src/checks/g1-frontmatter.ts` (uses `dayNumber` for the date check)
- Modify: `evals/src/context.ts`, `evals/src/seeded.ts` (the recent title has a date)
- Test: `gate/test/normalise-dates.test.ts`, `gate/test/config.test.ts`, `gate/test/g9-hygiene.test.ts`, `evals/test/seeded.test.ts`

The design says a new title may not be a near-duplicate of a title "from the last 14 days". Until now G9 compared the title with whatever list of strings the caller gave it, `ctx.recentTitles`; the window was nowhere in the gate, so the rule was code that depended on a caller to apply the rule. Now the gate applies it.

- `GateContext.recentTitles` is a list of `{ title, publishedAt }` (the new type `RecentTitle`; `publishedAt` is `YYYY-MM-DD`). The caller may pass every title it has; the gate ignores the old ones.
- `GateConfig.titleWindowDays` is 14. A recent piece counts for `G9_TITLE_DUPLICATE` if and only if `0 <= days(draft.publishedAt - piece.publishedAt) <= titleWindowDays`, in calendar days in UTC. The same day counts, exactly 14 days earlier counts, 15 days earlier does not, and a piece dated after the draft is ignored.
- `dayNumber(date)` turns a real `YYYY-MM-DD` date into the number of days since 1970-01-01 (UTC), so the difference of two of them is the number of calendar days between them, leap days included, whatever the time zone of the machine. For anything that is not a real date it returns `undefined`. G1 already had its own test for "a real `YYYY-MM-DD` date"; it now uses `dayNumber`, so the definition is in one place.
- A date that is not a real date, on either side, cannot rule a title out. G9 then compares the title (a false alarm costs a revision round; a missed duplicate is published). G1 reports a draft date that is not real.
- The similarity threshold stays at the calibrated 0.6.

Every caller changes. The tests of G9 and of the configuration, and the evals (the seeded context gives its recent title the date `2026-10-02`, two days before the golden piece), now pass dated titles. The fixture generator calls `defaultContext()` with no recent titles, so it needs no change.

- [ ] **Step 1: Write the failing tests**

`dayNumber` has its own tests: the epoch, the difference of two dates across month ends, years and leap days, and the strings it must refuse.

**In `gate/test/normalise-dates.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, dateMatches, parseDateToken } from '../src/normalise';
import type { ParsedDate } from '../src/normalise';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, dateMatches, dayNumber, parseDateToken } from '../src/normalise';
import type { ParsedDate } from '../src/normalise';

```

**In `gate/test/normalise-dates.test.ts`, replace:**
```ts
});

describe('dateMatches', () => {
  it.each([
```

**with:**
```ts
});

describe('dayNumber', () => {
  it('counts days from 1970-01-01', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('1969-12-31')).toBe(-1);
    expect(dayNumber('2000-01-01')).toBe(10957);
  });

  it('makes the difference of two dates the number of calendar days between them', () => {
    expect(dayNumber('2026-10-04')! - dayNumber('2026-09-20')!).toBe(14);
    expect(dayNumber('2027-01-05')! - dayNumber('2026-12-22')!).toBe(14);
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-16')!).toBe(14);
    expect(dayNumber('2027-03-01')! - dayNumber('2027-02-15')!).toBe(14);
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-28')!).toBe(2);
    expect(dayNumber('2027-03-01')! - dayNumber('2027-02-28')!).toBe(1);
  });

  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-10-00', '2026-8-4', '24 August 2026', '2026', '', '2026-10-04T00:00:00Z', ' 2026-10-04', '2026-10-04 ', '0999-01-01'])(
    'is undefined for %j, which is not a real date written YYYY-MM-DD',
    (date) => {
      expect(dayNumber(date)).toBeUndefined();
    },
  );
});

describe('dateMatches', () => {
  it.each([
```

The configuration test lists the default thresholds and the shape of `recentTitles`.

**In `gate/test/config.test.ts`, replace:**
```ts
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
      bannedPhrases: DEFAULT_BANNED_PHRASES,
    });
```

**with:**
```ts
      spanMax: 300,
      titleSimilarityThreshold: 0.6,
      titleWindowDays: 14,
      bannedPhrases: DEFAULT_BANNED_PHRASES,
    });
```

**In `gate/test/config.test.ts`, replace:**
```ts
  });

  it('accepts published slugs as any iterable and recent titles as an array', () => {
    const ctx = defaultContext({
      publishedSlugs: ['fixture-robotics-ships-fx-1'],
      recentTitles: ['An earlier title'],
    });
    expect(ctx.publishedSlugs.has('fixture-robotics-ships-fx-1')).toBe(true);
    expect(ctx.recentTitles).toEqual(['An earlier title']);
  });

```

**with:**
```ts
  });

  it('accepts published slugs as any iterable and recent titles, each with its date, as an array', () => {
    const ctx = defaultContext({
      publishedSlugs: ['fixture-robotics-ships-fx-1'],
      recentTitles: [{ title: 'An earlier title', publishedAt: '2026-10-01' }],
    });
    expect(ctx.publishedSlugs.has('fixture-robotics-ships-fx-1')).toBe(true);
    expect(ctx.recentTitles).toEqual([{ title: 'An earlier title', publishedAt: '2026-10-01' }]);
  });

```

The G9 tests pass dated titles. The helper `recents` takes titles and dates each of them two days before the golden piece, well inside the window. A new group tests the window: the boundary at 14 and 15 days, the same day, a title dated after the draft, month, year and leap-day ends, a window read from the context, an old title that is skipped, and dates that are not real.

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
import { TITLE_STOP_WORDS, checkG9, titleTokens } from '../src/checks/g9-hygiene';
import { DEFAULT_BANNED_PHRASES, defaultConfig, defaultContext } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
```

**with:**
```ts
import { TITLE_STOP_WORDS, checkG9, titleTokens } from '../src/checks/g9-hygiene';
import { DEFAULT_BANNED_PHRASES, defaultConfig, defaultContext } from '../src/config';
import type { RecentTitle } from '../src/config';
import type { ContextOverrides } from '../src/config';
import { cloneGolden } from '../src/fixtures';
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
const GOLDEN_SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';

describe('G9: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
```

**with:**
```ts
const GOLDEN_SLUG = 'fixture-robotics-ships-fx-1-to-second-plant';

// The golden piece is dated 2026-10-04. These recent titles are two days older, well inside the window.
const RECENT_DATE = '2026-10-02';
const recent = (title: string, publishedAt = RECENT_DATE): RecentTitle => ({ title, publishedAt });
const recents = (...titles: string[]): RecentTitle[] => titles.map((title) => recent(title));

describe('G9: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
    const ctx = defaultContext({
      publishedSlugs: ['northgate-unveils-atlas-9', `${GOLDEN_SLUG}-2025`],
      recentTitles: ['Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', 'Standards body publishes new safety rules for warehouse robots'],
    });
    expect(checkG9(cloneGolden(), ctx)).toEqual({ failures: [], holdReasons: [] });
```

**with:**
```ts
    const ctx = defaultContext({
      publishedSlugs: ['northgate-unveils-atlas-9', `${GOLDEN_SLUG}-2025`],
      recentTitles: recents('Northgate Dynamics unveils Atlas-9 quadruped for pipeline inspection', 'Standards body publishes new safety rules for warehouse robots'),
    });
    expect(checkG9(cloneGolden(), ctx)).toEqual({ failures: [], holdReasons: [] });
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
  it('does not change its input or its context', () => {
    const input = cloneGolden();
    const ctx = defaultContext({ publishedSlugs: [GOLDEN_SLUG], recentTitles: [GOLDEN_TITLE] });
    checkG9(input, ctx);
    expect(input).toEqual(cloneGolden());
    expect([...ctx.publishedSlugs]).toEqual([GOLDEN_SLUG]);
    expect(ctx.recentTitles).toEqual([GOLDEN_TITLE]);
  });
});
```

**with:**
```ts
  it('does not change its input or its context', () => {
    const input = cloneGolden();
    const ctx = defaultContext({ publishedSlugs: [GOLDEN_SLUG], recentTitles: recents(GOLDEN_TITLE) });
    checkG9(input, ctx);
    expect(input).toEqual(cloneGolden());
    expect([...ctx.publishedSlugs]).toEqual([GOLDEN_SLUG]);
    expect(ctx.recentTitles).toEqual(recents(GOLDEN_TITLE));
  });
});
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts

const score = (pair: Pair) => jaccard(titleTokens(pair.a), titleTokens(pair.b));
const duplicateOf = (title: string, recent: string, overrides?: ContextOverrides) =>
  codes(run((g) => (g.draft.title.text = title), { recentTitles: [recent], ...overrides })).includes('G9_TITLE_DUPLICATE');

describe('G9_TITLE_DUPLICATE: calibrating the 0.6 threshold', () => {
```

**with:**
```ts

const score = (pair: Pair) => jaccard(titleTokens(pair.a), titleTokens(pair.b));
const duplicateOf = (title: string, earlier: string, overrides?: ContextOverrides) =>
  codes(run((g) => (g.draft.title.text = title), { recentTitles: recents(earlier), ...overrides })).includes('G9_TITLE_DUPLICATE');

describe('G9_TITLE_DUPLICATE: calibrating the 0.6 threshold', () => {
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
  it('fails a title that repeats a recent title, and says which and how close', () => {
    const output = run(() => undefined, {
      recentTitles: ['Fixture Robotics begins shipping FX-1 warehouse arm to second plant'],
    });
    expect(output.failures).toEqual([
```

**with:**
```ts
  it('fails a title that repeats a recent title, and says which and how close', () => {
    const output = run(() => undefined, {
      recentTitles: recents('Fixture Robotics begins shipping FX-1 warehouse arm to second plant'),
    });
    expect(output.failures).toEqual([
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
  it('reports one failure, naming the closest of several recent titles', () => {
    const output = run(() => undefined, {
      recentTitles: [
        'Fixture Robotics begins shipping FX-1 warehouse arm to second plant', // 8/11
        GOLDEN_TITLE, // identical
        'Fixture Robotics ships FX-1 warehouse arm to third plant', // 8/10
      ],
    });
    expect(output.failures).toHaveLength(1);
```

**with:**
```ts
  it('reports one failure, naming the closest of several recent titles', () => {
    const output = run(() => undefined, {
      recentTitles: recents(
        'Fixture Robotics begins shipping FX-1 warehouse arm to second plant', // 8/11
        GOLDEN_TITLE, // identical
        'Fixture Robotics ships FX-1 warehouse arm to third plant', // 8/10
      ),
    });
    expect(output.failures).toHaveLength(1);
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
  it('names the first of two recent titles that are equally close', () => {
    const output = run(() => undefined, {
      recentTitles: ['Fixture Robotics ships FX-1 warehouse arm to second plant', GOLDEN_TITLE],
    });
    expect(output.failures[0]!.message).toContain('recent title "Fixture Robotics ships FX-1 warehouse arm to second plant"');
```

**with:**
```ts
  it('names the first of two recent titles that are equally close', () => {
    const output = run(() => undefined, {
      recentTitles: recents('Fixture Robotics ships FX-1 warehouse arm to second plant', GOLDEN_TITLE),
    });
    expect(output.failures[0]!.message).toContain('recent title "Fixture Robotics ships FX-1 warehouse arm to second plant"');
```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
  it('ignores a recent title that is not close, and an empty list of recent titles', () => {
    expect(run(() => undefined, { recentTitles: [] }).failures).toEqual([]);
    expect(run(() => undefined, { recentTitles: ['Northgate Dynamics unveils Atlas-9'] }).failures).toEqual([]);
  });

```

**with:**
```ts
  it('ignores a recent title that is not close, and an empty list of recent titles', () => {
    expect(run(() => undefined, { recentTitles: [] }).failures).toEqual([]);
    expect(run(() => undefined, { recentTitles: recents('Northgate Dynamics unveils Atlas-9') }).failures).toEqual([]);
  });

```

**In `gate/test/g9-hygiene.test.ts`, replace:**
```ts
});

describe('G9_BANNED_PHRASE', () => {
  const at = (change: (g: GateInput) => void, overrides?: ContextOverrides) => run(change, overrides).failures;
```

**with:**
```ts
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/g9-hygiene.test.ts test/config.test.ts test/normalise-dates.test.ts`
Expected: FAIL — `dayNumber is not a function` and `text.replace is not a function`; `Test Files  3 failed (3)`.

- [ ] **Step 3: Write the implementation**

**In `gate/src/normalise.ts`, replace:**
```ts
}

/**
 * Does a date written in a sentence agree with a date a claim licenses? They
```

**with:**
```ts
}

/**
 * The number of days from 1970-01-01 (UTC) to `date`, which must be a real
 * calendar date written exactly YYYY-MM-DD; undefined for anything else
 * (2026-02-30, 2026-8-4, "24 August 2026", a date with a time, a year before
 * 1000). The difference of two day numbers is the number of calendar days
 * between the dates, leap days included, whatever the time zone of the machine.
 */
export function dayNumber(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parseDateToken(date)?.precision !== 'day') return undefined;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Does a date written in a sentence agree with a date a claim licenses? They
```

**In `gate/src/config.ts`, replace:**
```ts
  /** G9: a new title whose word overlap with a recent title reaches this is a near-duplicate. */
  titleSimilarityThreshold: number;
  /** G9: phrases that must not appear anywhere in the piece. Lowercase, plain apostrophes. */
  bannedPhrases: readonly string[];
```

**with:**
```ts
  /** G9: a new title whose word overlap with a recent title reaches this is a near-duplicate. */
  titleSimilarityThreshold: number;
  /** G9: a title counts as recent when it was published on the draft's day or up to this many days before it. */
  titleWindowDays: number;
  /** G9: phrases that must not appear anywhere in the piece. Lowercase, plain apostrophes. */
  bannedPhrases: readonly string[];
```

**In `gate/src/config.ts`, replace:**
```ts
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
    bannedPhrases: DEFAULT_BANNED_PHRASES,
  };
}

/** Everything a check needs besides the draft and the claims. */
export interface GateContext {
```

**with:**
```ts
    spanMax: 300,
    titleSimilarityThreshold: 0.6,
    titleWindowDays: 14,
    bannedPhrases: DEFAULT_BANNED_PHRASES,
  };
}

/** The title of a piece that has been published, and the day it was published (YYYY-MM-DD). */
export interface RecentTitle {
  title: string;
  publishedAt: string;
}

/** Everything a check needs besides the draft and the claims. */
export interface GateContext {
```

**In `gate/src/config.ts`, replace:**
```ts
  /** Slugs of pieces already published (G9 rejects a slug collision). */
  publishedSlugs: ReadonlySet<string>;
  /** Titles of recent pieces (G9 rejects a near-duplicate title). */
  recentTitles: readonly string[];
  /** Lowercase words G4 accepts as names without a claim. */
  nameAllowList: ReadonlySet<string>;
```

**with:**
```ts
  /** Slugs of pieces already published (G9 rejects a slug collision). */
  publishedSlugs: ReadonlySet<string>;
  /**
   * Titles of published pieces with their dates. G9 rejects a title that is a
   * near-duplicate of one published within `config.titleWindowDays` before the
   * draft's own date. The list may hold older titles too; they are ignored.
   */
  recentTitles: readonly RecentTitle[];
  /** Lowercase words G4 accepts as names without a claim. */
  nameAllowList: ReadonlySet<string>;
```

**In `gate/src/config.ts`, replace:**
```ts
  config?: Partial<GateConfig>;
  publishedSlugs?: Iterable<string>;
  recentTitles?: readonly string[];
  /** Replaces the default allow-list. Spread DEFAULT_NAME_ALLOW_LIST into it to extend the default. */
  nameAllowList?: Iterable<string>;
```

**with:**
```ts
  config?: Partial<GateConfig>;
  publishedSlugs?: Iterable<string>;
  recentTitles?: readonly RecentTitle[];
  /** Replaces the default allow-list. Spread DEFAULT_NAME_ALLOW_LIST into it to extend the default. */
  nameAllowList?: Iterable<string>;
```

**In `gate/src/checks/g9-hygiene.ts`, replace:**
```ts
import type { Check, Failure } from '../gate';
import { allSentences, describeLocation } from '../sentences';
import { jaccard, normaliseQuotes } from '../text';
```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { dayNumber } from '../normalise';
import { allSentences, describeLocation } from '../sentences';
import { jaccard, normaliseQuotes } from '../text';
```

**In `gate/src/checks/g9-hygiene.ts`, replace:**
```ts
 * - The title is not a near-duplicate of a recent title (G9_TITLE_DUPLICATE):
 *   the overlap of their word sets, shared words over all words, reaches
 *   `titleSimilarityThreshold`. Only the closest recent title is reported.
 *   The default 0.6 was calibrated on the pairs in `g9-hygiene.test.ts`.
 *   A rewording that changes most of the words is not caught here; choosing a
```

**with:**
```ts
 * - The title is not a near-duplicate of a recent title (G9_TITLE_DUPLICATE):
 *   the overlap of their word sets, shared words over all words, reaches
 *   `titleSimilarityThreshold`. A title is recent when it was published on
 *   the draft's day or up to `titleWindowDays` (14) calendar days before it,
 *   in UTC; a title dated after the draft is ignored. A date that is not a
 *   real date, on either side, cannot rule a title out, so that title is
 *   compared (G1 reports a draft date that is not real). Only the closest
 *   recent title is reported.
 *   The default 0.6 was calibrated on the pairs in `g9-hygiene.test.ts`.
 *   A rewording that changes most of the words is not caught here; choosing a
```

**In `gate/src/checks/g9-hygiene.ts`, replace:**
```ts

  const mine = titleTokens(draft.title.text);
  let closest: { title: string; score: number } | undefined;
  for (const recent of ctx.recentTitles) {
    const score = jaccard(mine, titleTokens(recent));
    if (score >= ctx.config.titleSimilarityThreshold && (closest === undefined || score > closest.score)) {
      closest = { title: recent, score };
    }
  }
```

**with:**
```ts

  const mine = titleTokens(draft.title.text);
  const today = dayNumber(draft.publishedAt) ?? NaN;
  let closest: { title: string; score: number } | undefined;
  for (const recent of ctx.recentTitles) {
    // How many days before the draft the title was published. It is NaN when either date is not real, and NaN is
    // neither below 0 nor above the window, so such a title is compared.
    const days = today - (dayNumber(recent.publishedAt) ?? NaN);
    if (days < 0 || days > ctx.config.titleWindowDays) continue;
    const score = jaccard(mine, titleTokens(recent.title));
    if (score >= ctx.config.titleSimilarityThreshold && (closest === undefined || score > closest.score)) {
      closest = { title: recent.title, score };
    }
  }
```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
import { BEATS, CATEGORY_VOCAB, CROSS_TAGS, DESK_AUTHOR_NAME } from '../constants';
import type { Check, Failure } from '../gate';
import { parseDateToken } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

```

**with:**
```ts
import { BEATS, CATEGORY_VOCAB, CROSS_TAGS, DESK_AUTHOR_NAME } from '../constants';
import type { Check, Failure } from '../gate';
import { dayNumber } from '../normalise';
import { SLUG_PATTERN } from '../schemas';

```

**In `gate/src/checks/g1-frontmatter.ts`, replace:**
```ts
  }

  // The regex fixes the shape (parseDateToken alone would also take "24 August 2026"); the parser checks the calendar.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.publishedAt) || parseDateToken(draft.publishedAt)?.precision !== 'day') {
    fail('G1_BAD_DATE', `publishedAt "${draft.publishedAt}" is not a real date in the form YYYY-MM-DD`, 'publishedAt');
  }
```

**with:**
```ts
  }

  if (dayNumber(draft.publishedAt) === undefined) {
    fail('G1_BAD_DATE', `publishedAt "${draft.publishedAt}" is not a real date in the form YYYY-MM-DD`, 'publishedAt');
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  33 passed (33)`.

- [ ] **Step 5: Show that the evals still pass bare titles**

The seeded-defect evals build their context with a title and no date. Under the new gate that breaks.

Run: `npm test --workspace @robywire/evals`
Expected: FAIL — `Cannot read properties of undefined (reading 'replace')`.

- [ ] **Step 6: Date the recent title of the evals**

The context exports the date as `SEEDED_RECENT_PUBLISHED_AT`, so a test can check that it lies inside the window.

**In `evals/src/context.ts`, replace:**
```ts
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({ publishedSlugs: [SEEDED_PUBLISHED_SLUG], recentTitles: [SEEDED_RECENT_TITLE] });
}
```

**with:**
```ts
export const SEEDED_PUBLISHED_SLUG = 'brindle-logistics-adds-40-fx-1-arms-at-ashvale';
export const SEEDED_RECENT_TITLE = 'Brindle Logistics adds 40 FX-1 arms at Ashvale';
/** Two days before the golden piece (2026-10-04), so the title is inside the 14-day window. */
export const SEEDED_RECENT_PUBLISHED_AT = '2026-10-02';

/** The context every case, and the baseline, runs in. A fresh one each call. */
export function seededContext(): GateContext {
  return defaultContext({
    publishedSlugs: [SEEDED_PUBLISHED_SLUG],
    recentTitles: [{ title: SEEDED_RECENT_TITLE, publishedAt: SEEDED_RECENT_PUBLISHED_AT }],
  });
}
```

**In `evals/src/seeded.ts`, replace:**
```ts
import type { CheckId, GateInput } from '@robywire/gate';

export { SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_TITLE, seededContext } from './context';
export { SEEDED_CASES } from './cases';

```

**with:**
```ts
import type { CheckId, GateInput } from '@robywire/gate';

export { SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_PUBLISHED_AT, SEEDED_RECENT_TITLE, seededContext } from './context';
export { SEEDED_CASES } from './cases';

```

**In `evals/test/seeded.test.ts`, replace:**
```ts
import { sentenceWith } from '../src/cases/support';
import { runSeeded } from '../src/run';
import { SEEDED_CASES, SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_TITLE, seededContext } from '../src/seeded';
import type { SeededCase } from '../src/seeded';

```

**with:**
```ts
import { sentenceWith } from '../src/cases/support';
import { runSeeded } from '../src/run';
import { SEEDED_CASES, SEEDED_PUBLISHED_SLUG, SEEDED_RECENT_PUBLISHED_AT, SEEDED_RECENT_TITLE, seededContext } from '../src/seeded';
import type { SeededCase } from '../src/seeded';

```

**In `evals/test/seeded.test.ts`, replace:**
```ts
    const ctx = seededContext();
    expect([...ctx.publishedSlugs]).toEqual([SEEDED_PUBLISHED_SLUG]);
    expect(ctx.recentTitles).toEqual([SEEDED_RECENT_TITLE]);
    expect(cloneGolden().draft.slug).not.toBe(SEEDED_PUBLISHED_SLUG);
    expect(cloneGolden().draft.title.text).not.toBe(SEEDED_RECENT_TITLE);
  });

  it('gives each caller a fresh context', () => {
    expect(seededContext()).not.toBe(seededContext());
```

**with:**
```ts
    const ctx = seededContext();
    expect([...ctx.publishedSlugs]).toEqual([SEEDED_PUBLISHED_SLUG]);
    expect(ctx.recentTitles).toEqual([{ title: SEEDED_RECENT_TITLE, publishedAt: SEEDED_RECENT_PUBLISHED_AT }]);
    expect(cloneGolden().draft.slug).not.toBe(SEEDED_PUBLISHED_SLUG);
    expect(cloneGolden().draft.title.text).not.toBe(SEEDED_RECENT_TITLE);
  });

  it('dates the recent title inside the window, so the duplicate-title case is not ignored as old', () => {
    const golden = cloneGolden().draft.publishedAt;
    const days = (Date.parse(golden) - Date.parse(SEEDED_RECENT_PUBLISHED_AT)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(seededContext().config.titleWindowDays);
  });

  it('gives each caller a fresh context', () => {
    expect(seededContext()).not.toBe(seededContext());
```

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

`npm run evals:seeded` leaves `evals/scoreboard/seeded.json` unchanged: no case was added or changed.

- [ ] **Step 8: Commit**

```bash
git add gate/src gate/test evals/src evals/test
git commit -m "feat(gate): G9 compares a title only with pieces from the last 14 days" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 76: One limitation sentence for each group of claims, and every claim that needs one is covered

**Files:**
- Modify: `gate/src/limitations.ts` (rewritten: group templates, `limitationGroups`, `buildLimitations` and helpers)
- Modify: `gate/src/schemas.ts` (a limitation sentence cites a non-empty list of claims)
- Modify: `gate/src/sentences.ts` (new function `citedClaims`)
- Modify: `gate/src/checks/g8-limitations.ts` (new code `G8_LIMITATION_GROUP`; `G8_LIMITATION_CLAIMS` and `G8_LIMITATION_MISMATCH` read a group)
- Modify: `gate/src/checks/g2-structure.ts` (new code `G2_LIMITATION_COVERAGE`)
- Modify: `gate/src/fixtures/golden.ts` (the golden limitations come from `buildLimitations`; three sentences more prose)
- Modify: `evals/src/cases/frontmatter-structure.ts`, `evals/src/cases/limitations-hygiene.ts` (two new and three changed seeded defects), `evals/scoreboard/seeded.json` and `site/src/content-fixtures/**` (regenerated)
- Modify: `site/src/lib/reasons.ts` (two labels, one reworded)
- Test: `gate/test/limitations.test.ts` and `gate/test/g8-limitations.test.ts` (rewritten), `gate/test/sentences.test.ts`, `gate/test/schemas.test.ts`, `gate/test/g2-structure.test.ts`, `gate/test/golden-draft.test.ts`, `gate/test/render.test.ts`, `gate/test/g4-values.test.ts`, `gate/test/g7-analysis.test.ts`

The section "What we couldn't verify" is built from templates. Until now every limitation sentence cited exactly one claim, so the golden piece, which rests on twenty-odd company claims, had fifteen of them, a long list of near-identical lines, against the content contract's "two or three sentences is enough". Nothing also made sure that every claim that needs a note has one: a piece that cited ten datasheet claims and had one limitation sentence passed the gate. This task fixes both.

**Groups.** A limitation sentence now describes a *group* of claims that share one basis (a `basis` sentence) or one status (a `status` sentence). `LimitationSentence.claimIds` becomes a non-empty list. The ids are listed once each in ascending order of claim number (c-2 before c-10); the schema checks only that the list is not empty, and G8 checks the rest.

**Templates.** `renderLimitation(claims, template)` takes the group. The items of a group are written `{figure} {label}` (the same figure rule as before: the first number value, else the first value of any kind, else nothing) and joined as "A", "A and B", "A, B and C". A group of one claim uses the singular template, whose text is **byte for byte the text it had before**. A group of two or more uses a plural template with the grammar to match. The twelve plural templates, in full:

| Key | Plural sentence |
|---|---|
| basis `datasheet` | The {items} figures come from the company's datasheet; no independent measurement was available. |
| basis `press-release` | The {items} figures come from a company press release; no independent measurement was available. |
| basis `briefing` | The {items} figures were given in a company briefing; no independent measurement was available. |
| basis `demo` | The {labels} were shown in a demonstration; the source does not describe independent testing. |
| basis `paper` | The {items} figures are reported in the authors' paper; they have not been independently reproduced. |
| basis `filing` | The {items} figures come from a regulatory filing. |
| basis `standard` | The {labels} requirements come from the published standard. |
| basis `measured` | The {items} figures were measured by the source and are reported as stated. |
| status `demonstrated` | The {labels} were demonstrated; the source does not report them in commercial deployment. |
| status `deployed` | The company states the {labels} are deployed; no independent confirmation was available. |
| status `planned` | The {labels} are planned, not delivered. |
| status `unspecified` | The source does not say whether the {labels} have been demonstrated or deployed. |

`{items}` is the list of figure-and-label items, and `{labels}` the list of labels alone, for the templates whose singular form does not mention a figure (`demo`, `standard` and the four statuses).

**Building them.** `limitationGroups(citedClaims)` takes the claims that the body of a piece cites. The ones whose basis is not a filing, a standard, a paper or a measurement are grouped by basis, in the order of the list `BASES`; the ones whose status is `demonstrated` or `planned` are grouped by status, in that order, after the basis groups. A claim that needs both is in a group of each kind. The status `deployed` or `unspecified` needs no sentence. Inside a group the claims are sorted by claim number. `buildLimitations(citedClaims)` turns the groups into limitation sentences. The new function `citedClaims(draft, claims)` finds the claims that the sentences of a draft, other than the limitation sentences, cite.

**The gate.** G8 reads a group. `G8_LIMITATION_CLAIMS` now means that the list of ids is empty, cites a claim that does not exist, cites a claim twice, or is not in ascending order. The new `G8_LIMITATION_GROUP` means that the claims of a `basis` sentence do not all have the same basis, or those of a `status` sentence do not all have the same status. `G8_LIMITATION_MISMATCH` means that the text is not what `renderLimitation(claims, template)` renders. A sentence with a problem in an earlier rule is not read by the later ones. G2 gets the new `G2_LIMITATION_COVERAGE`: every claim that the body cites and that needs a `basis` sentence must be cited by a `basis` limitation sentence, and every claim that needs a `status` sentence by a `status` one. `G2_LIMITATIONS_MISSING` stays for the case where there is no limitation section at all (and now also fires when the only reason a claim needs one is its status).

**The golden piece.** Its limitations are now what `buildLimitations` writes for the claims the rest of the piece cites: five sentences instead of fifteen (the eight datasheet claims, the twelve press-release claims, the two demo claims, and the status sentences for the two demonstrated and the five planned claims). They are 157 words instead of 207, which leaves the body at 615 words, under the 640 that the golden piece keeps so that a small edit stays inside the 600 to 850 limit. The prose gets 42 words back: a sentence about the demonstration hall (claim c-28 lists the figure "three" of "three-bay"), and two analysis sentences that make no new claim. Everything else follows from the new numbers: the analysis share, a few sentence positions and the seeded defects that pointed at the old sentences. The golden piece is therefore rebuilt in one step (Step 4), before the new checks are written against it.

- [ ] **Step 1: Write the failing tests**

The tests of the limitation module are rewritten for groups. They test every one of the twelve singular and twelve plural sentences, the list joining, `limitationGroups` and `buildLimitations`.

**Replace `gate/test/limitations.test.ts` with:**
```ts
import { describe, expect, it } from 'vitest';
import { BASES, SAFE_BASES, STATUSES } from '../src/constants';
import type { Basis, Status } from '../src/constants';
import {
  BASIS_TEMPLATES,
  BASIS_TEMPLATES_PLURAL,
  STATUS_TEMPLATES,
  STATUS_TEMPLATES_PLURAL,
  buildLimitations,
  claimNumber,
  joinList,
  limitationGroups,
  needsBasisLimitation,
  needsStatusLimitation,
  renderLimitation,
} from '../src/limitations';
import type { Claim } from '../src/schemas';

const BASE_CLAIM: Claim = {
  id: 'c-1',
  text: 'The FX-1 arm is rated for a 12 kg payload.',
  label: 'payload',
  type: 'spec',
  source: {
    url: 'https://fixture-robotics.example/products/fx-1/datasheet',
    tier: 1,
    snapshotHash: 'a'.repeat(64),
    retrievedAt: '2026-10-04T04:30:00Z',
  },
  span: { start: 0, end: 20, quote: 'Rated payload: 12 kg' },
  basis: 'datasheet',
  status: 'unspecified',
  values: [{ kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' }],
};

const claim = (overrides: Partial<Claim>): Claim => ({ ...BASE_CLAIM, ...overrides });

/** A second and a third claim, to make groups: a reach of 1.4 m and an ingress rating that is a name. */
const REACH = claim({ id: 'c-2', label: 'reach', values: [{ kind: 'number', raw: '1.4 m', normalised: '1.4', unit: 'm' }] });
const RATING = claim({ id: 'c-3', label: 'ingress protection', values: [{ kind: 'name', raw: 'IP54', normalised: 'ip54' }] });

describe('renderLimitation: one claim, basis templates', () => {
  it.each<[Basis, string]>([
    ['datasheet', "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available."],
    ['press-release', 'The 12 kg payload figure comes from a company press release; no independent measurement was available.'],
    ['briefing', 'The 12 kg payload figure was given in a company briefing; no independent measurement was available.'],
    ['demo', 'The payload was shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "The 12 kg payload figure is reported in the authors' paper; it has not been independently reproduced."],
    ['filing', 'The 12 kg payload figure comes from a regulatory filing.'],
    ['standard', 'The payload requirement comes from the published standard.'],
    ['measured', 'The 12 kg payload figure was measured by the source and is reported as stated.'],
  ])('renders the %s template', (basis, expected) => {
    expect(renderLimitation([claim({ basis })], 'basis')).toBe(expected);
  });

  it('has a template for every basis, and no others', () => {
    expect(Object.keys(BASIS_TEMPLATES).sort()).toEqual([...BASES].sort());
    expect(Object.keys(BASIS_TEMPLATES_PLURAL).sort()).toEqual([...BASES].sort());
  });

  it('matches the example in the design spec', () => {
    const speed = claim({
      label: 'speed',
      values: [{ kind: 'number', raw: '2.3 m/s', normalised: '2.3', unit: 'm/s' }],
    });
    expect(renderLimitation([speed], 'basis')).toBe(
      "The 2.3 m/s speed figure comes from the company's datasheet; no independent measurement was available.",
    );
  });
});

describe('renderLimitation: one claim, status templates', () => {
  it.each<[Status, string]>([
    ['demonstrated', 'The top speed was demonstrated; the source does not report it in commercial deployment.'],
    ['deployed', 'The company states the top speed is deployed; no independent confirmation was available.'],
    ['planned', 'The top speed is planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed has been demonstrated or deployed.'],
  ])('renders the %s template', (status, expected) => {
    expect(renderLimitation([claim({ status, label: 'top speed' })], 'status')).toBe(expected);
  });

  it('has a template for every status, and no others', () => {
    expect(Object.keys(STATUS_TEMPLATES).sort()).toEqual([...STATUSES].sort());
    expect(Object.keys(STATUS_TEMPLATES_PLURAL).sort()).toEqual([...STATUSES].sort());
  });

  it('never includes the claim value, because a status describes the capability, not a figure', () => {
    expect(renderLimitation([claim({ status: 'deployed' })], 'status')).not.toContain('12 kg');
  });
});

describe('renderLimitation: two or more claims, basis templates', () => {
  const two = (basis: Basis) => renderLimitation([claim({ basis }), { ...REACH, basis }], 'basis');

  it.each<[Basis, string]>([
    ['datasheet', "The 12 kg payload and 1.4 m reach figures come from the company's datasheet; no independent measurement was available."],
    ['press-release', 'The 12 kg payload and 1.4 m reach figures come from a company press release; no independent measurement was available.'],
    ['briefing', 'The 12 kg payload and 1.4 m reach figures were given in a company briefing; no independent measurement was available.'],
    ['demo', 'The payload and reach were shown in a demonstration; the source does not describe independent testing.'],
    ['paper', "The 12 kg payload and 1.4 m reach figures are reported in the authors' paper; they have not been independently reproduced."],
    ['filing', 'The 12 kg payload and 1.4 m reach figures come from a regulatory filing.'],
    ['standard', 'The payload and reach requirements come from the published standard.'],
    ['measured', 'The 12 kg payload and 1.4 m reach figures were measured by the source and are reported as stated.'],
  ])('renders the %s template for two claims', (basis, expected) => {
    expect(two(basis)).toBe(expected);
  });

  it('joins three claims as "A, B and C", with no comma before the "and"', () => {
    expect(renderLimitation([claim({}), REACH, RATING], 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('joins four claims with commas and one "and"', () => {
    const four = [claim({}), REACH, RATING, claim({ id: 'c-4', label: 'mass', values: [{ kind: 'number', raw: '38 kg', normalised: '38', unit: 'kg' }] })];
    expect(renderLimitation(four, 'basis')).toBe(
      "The 12 kg payload, 1.4 m reach, IP54 ingress protection and 38 kg mass figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('writes the figure of each claim by the same rule as for one claim: the first number, else the first value, else nothing', () => {
    const none = claim({ id: 'c-4', label: 'finish', values: [] });
    expect(renderLimitation([none, RATING], 'basis')).toBe(
      "The finish and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('takes the template from the first claim', () => {
    expect(renderLimitation([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'demo', label: 'reach' })], 'basis')).toBe(
      'The 12 kg payload and 12 kg reach figures come from a regulatory filing.',
    );
  });
});

describe('renderLimitation: two or more claims, status templates', () => {
  const two = (status: Status) => renderLimitation([claim({ status, label: 'top speed' }), claim({ id: 'c-2', status, label: 'repeatability' })], 'status');

  it.each<[Status, string]>([
    ['demonstrated', 'The top speed and repeatability were demonstrated; the source does not report them in commercial deployment.'],
    ['deployed', 'The company states the top speed and repeatability are deployed; no independent confirmation was available.'],
    ['planned', 'The top speed and repeatability are planned, not delivered.'],
    ['unspecified', 'The source does not say whether the top speed and repeatability have been demonstrated or deployed.'],
  ])('renders the %s template for two claims', (status, expected) => {
    expect(two(status)).toBe(expected);
  });

  it('joins three claims as "A, B and C"', () => {
    const three = [claim({ status: 'planned', label: 'a' }), claim({ id: 'c-2', status: 'planned', label: 'b' }), claim({ id: 'c-3', status: 'planned', label: 'c' })];
    expect(renderLimitation(three, 'status')).toBe('The a, b and c are planned, not delivered.');
  });
});

describe('renderLimitation: the value in the sentence', () => {
  it('uses the first number value, even when a name value comes first', () => {
    const mixed = claim({
      values: [
        { kind: 'name', raw: 'FX-1', normalised: 'fx-1' },
        { kind: 'number', raw: '12 kg', normalised: '12', unit: 'kg' },
        { kind: 'number', raw: '1.4 m', normalised: '1.4', unit: 'm' },
      ],
    });
    expect(renderLimitation([mixed], 'basis')).toBe(
      "The 12 kg payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('falls back to the first value when none is a number', () => {
    const named = claim({ label: 'lead investor', basis: 'filing', values: [{ kind: 'name', raw: 'Corvane Partners', normalised: 'corvane partners' }] });
    expect(renderLimitation([named], 'basis')).toBe('The Corvane Partners lead investor figure comes from a regulatory filing.');
  });

  it('leaves the value out, with no stray space, when the claim has none', () => {
    expect(renderLimitation([claim({ values: [] })], 'basis')).toBe(
      "The payload figure comes from the company's datasheet; no independent measurement was available.",
    );
  });

  it('keeps a dollar sign in a value as it is written', () => {
    const money = claim({
      label: 'funding round',
      basis: 'filing',
      values: [{ kind: 'number', raw: '$450 million', normalised: '450000000', unit: 'USD' }],
    });
    expect(renderLimitation([money], 'basis')).toBe('The $450 million funding round figure comes from a regulatory filing.');
  });

  it('does not fill in a placeholder that appears inside a value or a label', () => {
    const odd = claim({ label: '{v}', values: [{ kind: 'name', raw: '{label}', normalised: 'x' }] });
    expect(renderLimitation([odd], 'basis')).toBe(
      "The {label} {v} figure comes from the company's datasheet; no independent measurement was available.",
    );
    const items = claim({ label: '{items}', values: [] });
    expect(renderLimitation([items, odd], 'basis')).toBe(
      "The {items} and {label} {v} figures come from the company's datasheet; no independent measurement was available.",
    );
  });

  it('is pure: the same claims give the same sentence and the claims are not changed', () => {
    const input = [claim({}), REACH];
    const before = structuredClone(input);
    expect(renderLimitation(input, 'basis')).toBe(renderLimitation(input, 'basis'));
    expect(input).toEqual(before);
  });

  it('refuses a group with no claim', () => {
    expect(() => renderLimitation([], 'basis')).toThrow('renderLimitation: a limitation sentence needs at least one claim');
  });
});

describe('joinList', () => {
  it.each([
    [[], ''],
    [['a'], 'a'],
    [['a', 'b'], 'a and b'],
    [['a', 'b', 'c'], 'a, b and c'],
    [['a', 'b', 'c', 'd'], 'a, b, c and d'],
  ])('joins %j as %j', (items, expected) => {
    expect(joinList(items)).toBe(expected);
  });
});

describe('claimNumber', () => {
  it.each([
    ['c-1', 1],
    ['c-12', 12],
    ['c-007', 7],
  ])('reads %j as %d', (id, expected) => {
    expect(claimNumber(id)).toBe(expected);
  });

  it.each(['', 'c-', 'c-x', 'x-1', 'c-1a', '1', 'C-1', ' c-1'])('reads %j as NaN', (id) => {
    expect(claimNumber(id)).toBeNaN();
  });
});

describe('needsBasisLimitation and needsStatusLimitation', () => {
  it('a claim needs a basis sentence unless its basis is one of the safe bases', () => {
    for (const basis of BASES) {
      expect(needsBasisLimitation(claim({ basis })), basis).toBe(!(SAFE_BASES as readonly string[]).includes(basis));
    }
  });

  it('a claim needs a status sentence when it is demonstrated or planned, and not when it is deployed or unspecified', () => {
    expect(needsStatusLimitation(claim({ status: 'demonstrated' }))).toBe(true);
    expect(needsStatusLimitation(claim({ status: 'planned' }))).toBe(true);
    expect(needsStatusLimitation(claim({ status: 'deployed' }))).toBe(false);
    expect(needsStatusLimitation(claim({ status: 'unspecified' }))).toBe(false);
  });
});

describe('limitationGroups', () => {
  const c = (n: number, basis: Basis, status: Status = 'unspecified'): Claim => claim({ id: `c-${n}`, basis, status, label: `item ${n}` });

  it('groups the claims that need a basis sentence by basis, in the order of BASES, each group by claim number', () => {
    const groups = limitationGroups([c(12, 'demo'), c(3, 'press-release'), c(10, 'datasheet'), c(2, 'datasheet'), c(5, 'press-release'), c(1, 'briefing')]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-2', 'c-10']],
      ['basis', 'press-release', ['c-3', 'c-5']],
      ['basis', 'briefing', ['c-1']],
      ['basis', 'demo', ['c-12']],
    ]);
  });

  it('leaves out the claims whose basis is safe', () => {
    const groups = limitationGroups([c(1, 'filing'), c(2, 'standard'), c(3, 'paper'), c(4, 'measured')]);
    expect(groups).toEqual([]);
  });

  it('groups the claims that need a status sentence by status, demonstrated first, after the basis groups', () => {
    const groups = limitationGroups([c(4, 'filing', 'planned'), c(2, 'filing', 'demonstrated'), c(1, 'datasheet', 'planned'), c(3, 'filing', 'deployed'), c(5, 'filing', 'unspecified')]);
    expect(groups.map((group) => [group.template, group.key, group.claims.map((item) => item.id)])).toEqual([
      ['basis', 'datasheet', ['c-1']],
      ['status', 'demonstrated', ['c-2']],
      ['status', 'planned', ['c-1', 'c-4']],
    ]);
  });

  it('puts a claim in a basis group and a status group when it needs both', () => {
    const groups = limitationGroups([c(1, 'press-release', 'planned')]);
    expect(groups.map((group) => [group.template, group.key])).toEqual([
      ['basis', 'press-release'],
      ['status', 'planned'],
    ]);
  });

  it('counts a claim once, however often it is listed', () => {
    const groups = limitationGroups([c(1, 'datasheet'), c(1, 'datasheet'), c(2, 'datasheet')]);
    expect(groups[0]!.claims.map((item) => item.id)).toEqual(['c-1', 'c-2']);
  });

  it('sorts by the number in the id, not by the text: c-2 before c-10', () => {
    const groups = limitationGroups([c(10, 'datasheet'), c(9, 'datasheet'), c(100, 'datasheet'), c(2, 'datasheet')]);
    expect(groups[0]!.claims.map((item) => item.id)).toEqual(['c-2', 'c-9', 'c-10', 'c-100']);
  });

  it('gives no group for no claims, and does not change what it is given', () => {
    expect(limitationGroups([])).toEqual([]);
    const input = [c(2, 'datasheet'), c(1, 'datasheet')];
    const before = structuredClone(input);
    limitationGroups(input);
    expect(input).toEqual(before);
  });
});

describe('buildLimitations', () => {
  it('writes one limitation sentence for each group, with the claims of the group, its template and the rendered text', () => {
    const claims = [claim({ id: 'c-2', label: 'reach', values: REACH.values }), claim({ id: 'c-1' }), claim({ id: 'c-3', basis: 'filing', status: 'planned', label: 'schedule', values: [] })];
    expect(buildLimitations(claims)).toEqual([
      {
        kind: 'limitation',
        text: "The 12 kg payload and 1.4 m reach figures come from the company's datasheet; no independent measurement was available.",
        claimIds: ['c-1', 'c-2'],
        template: 'basis',
      },
      {
        kind: 'limitation',
        text: 'The schedule is planned, not delivered.',
        claimIds: ['c-3'],
        template: 'status',
      },
    ]);
  });

  it('writes a single-claim sentence exactly as the single template says', () => {
    const [sentence] = buildLimitations([claim({})]);
    expect(sentence!.text).toBe(BASIS_TEMPLATES.datasheet.replace('{v}', '12 kg ').replace('{label}', 'payload'));
  });

  it('writes nothing when no claim needs a sentence', () => {
    expect(buildLimitations([])).toEqual([]);
    expect(buildLimitations([claim({ basis: 'filing' }), claim({ id: 'c-2', basis: 'measured', status: 'deployed' })])).toEqual([]);
  });
});
```

**In `gate/test/sentences.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { GOLDEN_DRAFT } from '../src/fixtures';
import { allSentences, describeLocation } from '../src/sentences';
import type { Draft } from '../src/schemas';

```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '../src/fixtures';
import { allSentences, citedClaims, describeLocation } from '../src/sentences';
import type { Draft } from '../src/schemas';

```

**In `gate/test/sentences.test.ts`, replace:**
```ts
    expect(describeLocation(body)).toBe('section "What shipped", sentence 4');
  });
});
```

**with:**
```ts
    expect(describeLocation(body)).toBe('section "What shipped", sentence 4');
  });
});

describe('citedClaims', () => {
  it('lists the claims the golden piece cites, each once, in the order of the claims', () => {
    const cited = citedClaims(GOLDEN_DRAFT, GOLDEN_CLAIMS);
    expect(cited.map((claim) => claim.id)).toEqual(GOLDEN_CLAIMS.map((claim) => claim.id));
    expect(cited[0]).toBe(GOLDEN_CLAIMS[0]);
  });

  it('leaves out a claim that no sentence cites', () => {
    const lonely = { ...GOLDEN_CLAIMS[0]!, id: 'c-99' };
    expect(citedClaims(GOLDEN_DRAFT, [...GOLDEN_CLAIMS, lonely]).map((claim) => claim.id)).not.toContain('c-99');
  });

  it('does not count a claim that only a limitation sentence cites', () => {
    const lonely = { ...GOLDEN_CLAIMS[7]!, id: 'c-99' };
    const draft: Draft = { ...GOLDEN_DRAFT, limitations: [{ ...GOLDEN_DRAFT.limitations[0]!, claimIds: ['c-99'] }] };
    expect(citedClaims(draft, [...GOLDEN_CLAIMS, lonely]).map((claim) => claim.id)).not.toContain('c-99');
  });

  it('counts a claim that only the title or the description cites', () => {
    const lonely = { ...GOLDEN_CLAIMS[0]!, id: 'c-99' };
    const draft: Draft = { ...GOLDEN_DRAFT, opening: [], takeaways: [], sections: [], limitations: [], title: { ...GOLDEN_DRAFT.title, claimIds: ['c-99'] } };
    expect(citedClaims(draft, [...GOLDEN_CLAIMS, lonely]).map((claim) => claim.id)).toEqual(['c-1', 'c-8', 'c-99']);
  });

  it('ignores an id that no claim has, and does not change what it is given', () => {
    const draft: Draft = { ...GOLDEN_DRAFT, title: { ...GOLDEN_DRAFT.title, claimIds: ['c-999'] }, description: { ...GOLDEN_DRAFT.description, claimIds: [] }, opening: [], takeaways: [], sections: [], limitations: [] };
    expect(citedClaims(draft, GOLDEN_CLAIMS)).toEqual([]);
  });
});
```

The schema accepts a limitation sentence with several claim ids and rejects one with none.

**In `gate/test/schemas.test.ts`, replace:**
```ts
  });

  it('accepts a limitation sentence with exactly one claim id and a template', () => {
    expectValid(Sentence, { kind: 'limitation', text: 'No testing.', claimIds: ['c-1'], template: 'status' });
    expectValid(Sentence, { kind: 'limitation', text: 'Datasheet only.', claimIds: ['c-1'], template: 'basis' });
  });

  it.each([
    ['no claim id', []],
    ['two claim ids', ['c-1', 'c-2']],
  ])('rejects a limitation sentence with %s', (_label, claimIds) => {
    expect(failedPaths(Sentence, { kind: 'limitation', text: 'x', claimIds, template: 'basis' })).toEqual([
      'claimIds',
    ]);
  });

```

**with:**
```ts
  });

  it('accepts a limitation sentence with one or more claim ids and a template', () => {
    expectValid(Sentence, { kind: 'limitation', text: 'No testing.', claimIds: ['c-1'], template: 'status' });
    expectValid(Sentence, { kind: 'limitation', text: 'Datasheet only.', claimIds: ['c-1'], template: 'basis' });
    expectValid(Sentence, { kind: 'limitation', text: 'Datasheet only.', claimIds: ['c-1', 'c-2', 'c-10'], template: 'basis' });
  });

  it('rejects a limitation sentence with no claim id', () => {
    expect(failedPaths(Sentence, { kind: 'limitation', text: 'x', claimIds: [], template: 'basis' })).toEqual(['claimIds']);
  });

  it('leaves the order and the uniqueness of the claim ids of a limitation sentence to the gate (G8)', () => {
    expectValid(Sentence, { kind: 'limitation', text: 'x', claimIds: ['c-2', 'c-1', 'c-1'], template: 'basis' });
  });

```

The G8 tests are rewritten for groups, over the five sentences of the new golden piece.

**Replace `gate/test/g8-limitations.test.ts` with:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG8 } from '../src/checks/g8-limitations';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { CheckOutput, GateInput } from '../src/gate';
import { renderLimitation } from '../src/limitations';
import type { LimitationSentence } from '../src/schemas';
import { claimById, mutate } from './helpers';

const run = (change: (copy: GateInput) => void): CheckOutput => checkG8(mutate(cloneGolden(), change), defaultContext());
const codes = (output: CheckOutput) => output.failures.map((failure) => failure.code);

// The golden piece has five limitation sentences, one for each group of claims:
//   1  basis    datasheet      c-8 to c-15, eight claims
//   2  basis    press-release  c-1 to c-7 and c-22 to c-26, twelve claims
//   3  basis    demo           c-27 and c-28
//   4  status   demonstrated   c-27 and c-28
//   5  status   planned        c-5, c-6, c-7, c-25 and c-26
const first = (g: GateInput): LimitationSentence => g.draft.limitations[0]!;
const FIRST_TEXT =
  "The 12 kilograms payload, 1.4 metres reach, 2.3 metres per second top speed, 0.05 mm repeatability, 1.2k pick rate, 38 kg arm mass, 650 W power draw and IP54 ingress protection figures come from the company's datasheet; no independent measurement was available.";
const FIRST_AT = 'limitations, sentence 1';
const FIRST_IDS = ['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15'];

/** Point a limitation sentence at these claim ids. */
const cites = (sentence: LimitationSentence, ids: string[]) => {
  sentence.claimIds = ids;
};

describe('G8: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG8(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('has five limitation sentences, one for each group of claims, in both templates', () => {
    const { limitations } = cloneGolden().draft;
    expect(limitations).toHaveLength(5);
    expect(limitations[0]?.text).toBe(FIRST_TEXT);
    expect(limitations[0]?.claimIds).toEqual(FIRST_IDS);
    expect(limitations.map((sentence) => [sentence.template, sentence.claimIds.length])).toEqual([
      ['basis', 8],
      ['basis', 12],
      ['basis', 2],
      ['status', 2],
      ['status', 5],
    ]);
  });

  it('is the eighth check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[7]).toBe(checkG8);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG8(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });

  it('passes a piece with no limitation sentences, which G2 reports when one is needed', () => {
    expect(run((g) => (g.draft.limitations = []))).toEqual({ failures: [], holdReasons: [] });
  });

  it('passes a sentence for one claim, written with the singular template', () => {
    const output = run((g) => {
      g.draft.limitations = [
        {
          kind: 'limitation',
          text: "The 12 kilograms payload figure comes from the company's datasheet; no independent measurement was available.",
          claimIds: ['c-8'],
          template: 'basis',
        },
      ];
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});

describe('G8_LIMITATION_PLACEMENT', () => {
  it.each([
    ['the title', (g: GateInput) => (g.draft.title = first(g)), 'title'],
    ['the description', (g: GateInput) => (g.draft.description = first(g)), 'description'],
    ['the opening', (g: GateInput) => (g.draft.opening[1] = first(g)), 'opening, sentence 2'],
    ['the takeaways', (g: GateInput) => (g.draft.takeaways[2] = first(g)), 'takeaways, sentence 3'],
    ['a section', (g: GateInput) => (g.draft.sections[1]!.paragraphs[2]![0] = first(g)), 'section "What the customer reports", sentence 9'],
  ])('fails a limitation sentence in %s, even if its text is right', (_name, change, where) => {
    const output = run((g) => void change(g));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_PLACEMENT',
        message: `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
        where,
      },
    ]);
  });

  it('reports each misplaced sentence, in document order', () => {
    const output = run((g) => {
      g.draft.title = first(g);
      g.draft.takeaways[0] = first(g);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['title', 'takeaways, sentence 1']);
  });
});

describe('G8_LIMITATION_CLAIMS', () => {
  it('fails a limitation sentence that cites a claim which does not exist, and names it', () => {
    const output = run((g) => cites(first(g), ['c-999']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} cites c-999, which is not one of this piece's claims`,
        where: FIRST_AT,
      },
    ]);
  });

  it('names every unknown claim, even when the other claims it cites are real', () => {
    const output = run((g) => cites(first(g), ['c-8', 'c-998', 'c-999']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} cites c-998 and c-999, which are not claims of this piece`,
    ]);
  });

  it('fails a limitation sentence that cites no claim', () => {
    const output = run((g) => cites(first(g), []));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_CLAIMS',
        message: `the limitation sentence at ${FIRST_AT} cites no claim: it must cite the claims it describes`,
        where: FIRST_AT,
      },
    ]);
  });

  it('fails a limitation sentence that cites a claim twice', () => {
    const output = run((g) => cites(first(g), ['c-8', 'c-8', 'c-9']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} cites c-8 more than once: cite each claim once`,
    ]);
  });

  it('fails a limitation sentence that lists its claims out of order, by the number in the id', () => {
    const output = run((g) => cites(first(g), ['c-9', 'c-8']));
    expect(output.failures.map((failure) => failure.message)).toEqual([
      `the limitation sentence at ${FIRST_AT} lists c-8 after c-9: list the claims in ascending order of claim number`,
    ]);
  });

  it('orders by number and not as text: c-9 comes before c-10', () => {
    expect(codes(run((g) => cites(first(g), ['c-10', 'c-9'])))).toEqual(['G8_LIMITATION_CLAIMS']);
    const ordered = run((g) => {
      const sentence = first(g);
      cites(sentence, ['c-9', 'c-10']);
      sentence.text = renderLimitation([claimById(g.claims, 'c-9'), claimById(g.claims, 'c-10')], 'basis');
    });
    expect(ordered).toEqual({ failures: [], holdReasons: [] });
  });

  it('reports one failure for a sentence, for the first problem it has', () => {
    expect(codes(run((g) => cites(first(g), ['c-999', 'c-999', 'c-8'])))).toEqual(['G8_LIMITATION_CLAIMS']);
  });

  it('does not also report a group or a mismatch when there is no usable list of claims', () => {
    for (const ids of [['c-999'], [], ['c-8', 'c-8'], ['c-9', 'c-8']]) {
      expect(codes(run((g) => cites(first(g), ids))), ids.join()).toEqual(['G8_LIMITATION_CLAIMS']);
    }
  });

  it('also reads a limitation sentence in the wrong place', () => {
    const output = run((g) => {
      cites(first(g), ['c-999']);
      g.draft.opening[0] = first(g);
    });
    expect(output.failures.map((failure) => [failure.code, failure.where])).toEqual([
      ['G8_LIMITATION_PLACEMENT', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', 'opening, sentence 1'],
      ['G8_LIMITATION_CLAIMS', FIRST_AT],
    ]);
  });
});

describe('G8_LIMITATION_GROUP', () => {
  it('fails a basis sentence whose claims do not share one basis, and says which', () => {
    const output = run((g) => cites(first(g), ['c-1', 'c-8']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: `the limitation sentence at ${FIRST_AT} groups claims with different bases (c-1: press-release, c-8: datasheet): a basis sentence covers claims that share one basis`,
        where: FIRST_AT,
      },
    ]);
  });

  it('fails a status sentence whose claims do not share one status, and says which', () => {
    const output = run((g) => cites(g.draft.limitations[4]!, ['c-5', 'c-27']));
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_GROUP',
        message: 'the limitation sentence at limitations, sentence 5 groups claims with different statuses (c-5: planned, c-27: demonstrated): a status sentence covers claims that share one status',
        where: 'limitations, sentence 5',
      },
    ]);
  });

  it('checks the claims against the template of the sentence, not against each other only', () => {
    // c-8 to c-15 all have the status "unspecified", so they share a status: the group is fine under the status template, and the text is what is wrong.
    const output = run((g) => {
      first(g).template = 'status';
    });
    expect(codes(output)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('does not also report a mismatch for a mixed group', () => {
    expect(codes(run((g) => cites(first(g), ['c-1', 'c-8'])))).toEqual(['G8_LIMITATION_GROUP']);
  });

  it('fails when the metadata of one claim of a group is changed after the sentence was written', () => {
    expect(codes(run((g) => (claimById(g.claims, 'c-9').basis = 'briefing')))).toEqual(['G8_LIMITATION_GROUP']);
    expect(codes(run((g) => (claimById(g.claims, 'c-5').status = 'deployed')))).toEqual(['G8_LIMITATION_GROUP']);
  });

  it('reports each mixed group', () => {
    const output = run((g) => {
      cites(g.draft.limitations[0]!, ['c-1', 'c-8']);
      cites(g.draft.limitations[2]!, ['c-8', 'c-27']);
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['limitations, sentence 1', 'limitations, sentence 3']);
  });
});

describe('G8_LIMITATION_MISMATCH', () => {
  it('fails a limitation sentence whose text is not the template text, and says what it must read', () => {
    const output = run((g) => {
      first(g).text = 'The payload figures are exact.';
    });
    expect(output.failures).toEqual([
      {
        check: 'G8',
        code: 'G8_LIMITATION_MISMATCH',
        message: `the limitation sentence at ${FIRST_AT} does not match the basis template for c-8, c-9, c-10, c-11, c-12, c-13, c-14, c-15; it must read: "${FIRST_TEXT}"`,
        where: FIRST_AT,
      },
    ]);
  });

  it('compares the text exactly: one changed word, an extra space or a missing full stop fails', () => {
    for (const text of [
      FIRST_TEXT.replace('available', 'obtainable'),
      FIRST_TEXT.replace('payload', 'payload  '),
      FIRST_TEXT.replace(/\.$/, ''),
      `${FIRST_TEXT} `,
      FIRST_TEXT.toLowerCase(),
    ]) {
      expect(codes(run((g) => (first(g).text = text))), text).toEqual(['G8_LIMITATION_MISMATCH']);
    }
  });

  it('compares the plural: a group written with the singular words fails', () => {
    const singular = FIRST_TEXT.replace('figures come', 'figure comes');
    expect(codes(run((g) => (first(g).text = singular)))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails the right text under the wrong template', () => {
    // The text of sentence 3 (the demo basis) under the status template, over the same two claims.
    const output = run((g) => {
      g.draft.limitations[2]!.template = 'status';
    });
    expect(output.failures.map((failure) => failure.message)).toEqual([
      'the limitation sentence at limitations, sentence 3 does not match the status template for c-27, c-28; it must read: "The trailer unloading and demo day were demonstrated; the source does not report them in commercial deployment."',
    ]);
  });

  it('fails the right text under other claims of the same basis', () => {
    expect(codes(run((g) => cites(first(g), ['c-8', 'c-9'])))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('fails when the metadata of every claim of a group is changed after the sentence was written', () => {
    const output = run((g) => {
      for (const id of FIRST_IDS) claimById(g.claims, id).basis = 'briefing';
    });
    expect(output.failures.map((failure) => failure.code)).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it("fails when a claim's label or figure is changed", () => {
    expect(codes(run((g) => (claimById(g.claims, 'c-8').label = 'rated load')))).toEqual(['G8_LIMITATION_MISMATCH']);
    expect(codes(run((g) => (claimById(g.claims, 'c-8').values[0]!.raw = '14 kilograms')))).toEqual(['G8_LIMITATION_MISMATCH']);
  });

  it('reports each mismatched sentence', () => {
    const output = run((g) => {
      g.draft.limitations[0]!.text = 'Wrong.';
      g.draft.limitations[3]!.text = 'Also wrong.';
    });
    expect(output.failures.map((failure) => failure.where)).toEqual(['limitations, sentence 1', 'limitations, sentence 4']);
  });
});

describe('what G8 does not read', () => {
  it('ignores fact and analysis sentences, even ones that read like a limitation', () => {
    const output = run((g) => {
      g.draft.opening[0] = { kind: 'fact', text: FIRST_TEXT, claimIds: ['c-8'] };
      g.draft.takeaways[0] = { kind: 'analysis', text: 'The note is not a template sentence.', claimIds: [] };
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });

  it('does not ask whether the claims of a safe basis needed a sentence: a sentence about them is allowed', () => {
    const output = run((g) => {
      g.draft.limitations.push({
        kind: 'limitation',
        text: renderLimitation([claimById(g.claims, 'c-16'), claimById(g.claims, 'c-17')], 'basis'),
        claimIds: ['c-16', 'c-17'],
        template: 'basis',
      });
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
  });
});
```

The G2 tests: the cases where a claim needs no limitation now set its status to "deployed" too, a claim that is only demonstrated or planned needs one, and a new group tests the coverage rule.

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, mutate } from './helpers';

/** `count` words ending in a full stop. */
```

**with:**
```ts
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, claimById, mutate } from './helpers';

/** `count` words ending in a full stop. */
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
}

function resultAfter(change: (copy: GateInput) => void, ctx = defaultContext()) {
  return checkG2(mutate(cloneGolden(), change), ctx);
```

**with:**
```ts
}

const claimOfGolden = (input: GateInput, id: string) => claimById(input.claims, id);

function resultAfter(change: (copy: GateInput) => void, ctx = defaultContext()) {
  return checkG2(mutate(cloneGolden(), change), ctx);
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts

  it('passes for two sections', () => {
    expect(codesAfter((g) => (g.draft.sections = g.draft.sections.slice(0, 2)))).toEqual([]);
  });

```

**with:**
```ts

  it('passes for two sections', () => {
    const change = (g: GateInput) => {
      g.draft.sections = g.draft.sections.slice(0, 2);
      setBodyWords(g, 665);
    };
    expect(codesAfter(change)).toEqual([]);
  });

```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
});

describe('G2_LIMITATIONS_MISSING', () => {
  const noLimitations = (g: GateInput) => {
```

**with:**
```ts
});

/** Make every claim one that needs no limitation sentence: a filing, with a status of "deployed". */
const needNothing = (g: GateInput) => {
  for (const claim of g.claims) {
    claim.basis = 'filing';
    claim.status = 'deployed';
  }
};

describe('G2_LIMITATIONS_MISSING', () => {
  const noLimitations = (g: GateInput) => {
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  it.each(['datasheet', 'press-release', 'briefing', 'demo'] as const)('treats a %s claim as needing limitations', (basis) => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims[0]!.basis = basis;
      noLimitations(g);
```

**with:**
```ts
  it.each(['datasheet', 'press-release', 'briefing', 'demo'] as const)('treats a %s claim as needing limitations', (basis) => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims[0]!.basis = basis;
      noLimitations(g);
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  });

  it.each(['filing', 'standard', 'paper', 'measured'] as const)('lets a piece resting only on %s claims go without', (basis) => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = basis;
      noLimitations(g);
```

**with:**
```ts
  });

  it.each(['demonstrated', 'planned'] as const)('treats a claim that is only %s as needing limitations', (status) => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims[0]!.status = status;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it.each(['filing', 'standard', 'paper', 'measured'] as const)('lets a piece resting only on %s claims go without', (basis) => {
    const change = (g: GateInput) => {
      needNothing(g);
      for (const claim of g.claims) claim.basis = basis;
      noLimitations(g);
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  });

  it('ignores a claim that no sentence cites', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      noLimitations(g);
```

**with:**
```ts
  });

  it.each(['deployed', 'unspecified'] as const)('lets a piece whose claims are all %s go without', (status) => {
    const change = (g: GateInput) => {
      needNothing(g);
      for (const claim of g.claims) claim.status = status;
      noLimitations(g);
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('ignores a claim that no sentence cites', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      noLimitations(g);
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  it('counts a claim that only the title cites', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      g.draft.title.claimIds = ['c-99'];
```

**with:**
```ts
  it('counts a claim that only the title cites', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.claims.push({ ...structuredClone(g.claims[0]!), id: 'c-99', basis: 'datasheet' });
      g.draft.title.claimIds = ['c-99'];
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
  it('ignores a citation of a claim that does not exist, which G3 reports', () => {
    const change = (g: GateInput) => {
      for (const claim of g.claims) claim.basis = 'filing';
      g.draft.title.claimIds = ['c-999'];
      noLimitations(g);
```

**with:**
```ts
  it('ignores a citation of a claim that does not exist, which G3 reports', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.draft.title.claimIds = ['c-999'];
      noLimitations(g);
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
});

describe('G2: several problems at once', () => {
  it('reports every one', () => {
```

**with:**
```ts
});

describe('G2_LIMITATION_COVERAGE', () => {
  const droppingSentence = (at: number) => (g: GateInput) => {
    g.draft.limitations.splice(at, 1);
  };

  it('passes the golden piece, whose five sentences cover every claim that needs one', () => {
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails each claim that a missing basis sentence leaves out, and says which and why', () => {
    // Sentence 1 covers the eight datasheet claims, c-8 to c-15. Setting the body length keeps G2_BODY_LENGTH out of the way.
    const out = resultAfter((g) => {
      droppingSentence(0)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures).toHaveLength(8);
    expect(out.failures[0]).toEqual({
      check: 'G2',
      code: 'G2_LIMITATION_COVERAGE',
      message: 'claim c-8 (payload) has the basis "datasheet", but no limitation sentence with the basis template cites it',
      where: 'c-8',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-8', 'c-9', 'c-10', 'c-11', 'c-12', 'c-13', 'c-14', 'c-15']);
    expect(new Set(out.failures.map((failure) => failure.code))).toEqual(new Set(['G2_LIMITATION_COVERAGE']));
  });

  it('fails each claim that a missing status sentence leaves out, and says which and why', () => {
    // Sentence 5 covers the five planned claims.
    const out = resultAfter((g) => {
      droppingSentence(4)(g);
      setBodyWords(g, 665);
    });
    expect(out.failures[0]).toEqual({
      check: 'G2',
      code: 'G2_LIMITATION_COVERAGE',
      message: 'claim c-5 (Tarnmoor delivery schedule) has the status "planned", but no limitation sentence with the status template cites it',
      where: 'c-5',
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['c-5', 'c-6', 'c-7', 'c-25', 'c-26']);
  });

  it('fails a claim that is left out of a sentence which is otherwise there', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[0]!.claimIds = g.draft.limitations[0]!.claimIds.filter((id) => id !== 'c-12');
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => [failure.code, failure.where])).toEqual([['G2_LIMITATION_COVERAGE', 'c-12']]);
  });

  it('does not count a sentence of the other template as covering a claim', () => {
    // c-27 and c-28 are covered by sentence 3 (basis) and sentence 4 (status). Make both of them 'basis' sentences.
    const out = resultAfter((g) => {
      g.draft.limitations[3]!.template = 'basis';
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => [failure.code, failure.where, failure.message.includes('status template')])).toEqual([
      ['G2_LIMITATION_COVERAGE', 'c-27', true],
      ['G2_LIMITATION_COVERAGE', 'c-28', true],
    ]);
  });

  it('asks a claim that needs both kinds of sentence for both, basis first', () => {
    // c-5 is a press-release claim that is planned. Drop the sentences for the press releases and for what is planned.
    const out = resultAfter((g) => {
      g.draft.limitations = g.draft.limitations.filter((sentence) => !sentence.claimIds.includes('c-5'));
      setBodyWords(g, 665);
    });
    const c5 = out.failures.filter((failure) => failure.where === 'c-5');
    expect(c5.map((failure) => failure.message.match(/has the (\w+)/)?.[1])).toEqual(['basis', 'status']);
  });

  it('reads the claims that the body cites, not the claims that limitation sentences cite', () => {
    // c-99 is a datasheet claim that only a limitation sentence mentions: nothing in the body rests on it.
    const out = resultAfter((g) => {
      g.claims.push({ ...structuredClone(claimOfGolden(g, 'c-8')), id: 'c-99' });
      g.draft.limitations[0]!.claimIds = [...g.draft.limitations[0]!.claimIds, 'c-99'];
    });
    expect(out.failures.map((failure) => failure.code)).not.toContain('G2_LIMITATION_COVERAGE');
  });

  it('asks nothing for claims that need no sentence, and nothing of an uncited claim', () => {
    const change = (g: GateInput) => {
      needNothing(g);
      g.draft.limitations = [];
      setBodyWords(g, 665);
      g.claims.push({ ...structuredClone(claimOfGolden(g, 'c-8')), id: 'c-99', basis: 'datasheet' });
    };
    expect(codesAfter(change)).toEqual([]);
  });

  it('leaves the case where there is no section at all to G2_LIMITATIONS_MISSING', () => {
    const out = resultAfter((g) => {
      g.draft.limitations = [];
      setBodyWords(g, 665);
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_LIMITATIONS_MISSING']);
  });

  it('ignores an unknown id in a sentence, which G8 reports', () => {
    const out = resultAfter((g) => {
      g.draft.limitations[0]!.claimIds = [...g.draft.limitations[0]!.claimIds, 'c-999'];
    });
    expect(out.failures).toEqual([]);
  });
});

describe('G2: several problems at once', () => {
  it('reports every one', () => {
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts test/sentences.test.ts test/schemas.test.ts test/g8-limitations.test.ts test/g2-structure.test.ts`
Expected: FAIL — `limitationGroups is not a function`, `citedClaims is not a function`; `Test Files  5 failed (5)`.

- [ ] **Step 3: Write the limitation module, `citedClaims` and the schema**

**Replace `gate/src/limitations.ts` with:**
```ts
import { BASES, SAFE_BASES } from './constants';
import type { Basis, Status } from './constants';
import type { Claim, LimitationSentence } from './schemas';

// The "What we couldn't verify" sentences are never freely composed. They are
// filled in from the metadata of claims through these fixed templates, so the
// gate can check them by rendering the same sentence and comparing.
//
// A sentence describes a GROUP of claims that share a basis (for a 'basis'
// sentence) or a status (for a 'status' sentence). A group of one claim uses
// the singular template, whose placeholders are `{v}` (the claim's figure
// followed by a space, or nothing) and `{label}`. A group of two or more uses
// the plural template, whose placeholder is `{items}` (the figure and label of
// each claim) or `{labels}` (the label of each claim) for the templates that do
// not mention a figure. The items are joined "A", "A and B", "A, B and C".

/** What a claim's `basis` tells the reader about where the figure came from: one claim. */
export const BASIS_TEMPLATES: Readonly<Record<Basis, string>> = {
  datasheet: "The {v}{label} figure comes from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {v}{label} figure comes from a company press release; no independent measurement was available.',
  briefing: 'The {v}{label} figure was given in a company briefing; no independent measurement was available.',
  demo: 'The {label} was shown in a demonstration; the source does not describe independent testing.',
  paper: "The {v}{label} figure is reported in the authors' paper; it has not been independently reproduced.",
  filing: 'The {v}{label} figure comes from a regulatory filing.',
  standard: 'The {label} requirement comes from the published standard.',
  measured: 'The {v}{label} figure was measured by the source and is reported as stated.',
};

/** The same, for two or more claims that share the basis. */
export const BASIS_TEMPLATES_PLURAL: Readonly<Record<Basis, string>> = {
  datasheet: "The {items} figures come from the company's datasheet; no independent measurement was available.",
  'press-release': 'The {items} figures come from a company press release; no independent measurement was available.',
  briefing: 'The {items} figures were given in a company briefing; no independent measurement was available.',
  demo: 'The {labels} were shown in a demonstration; the source does not describe independent testing.',
  paper: "The {items} figures are reported in the authors' paper; they have not been independently reproduced.",
  filing: 'The {items} figures come from a regulatory filing.',
  standard: 'The {labels} requirements come from the published standard.',
  measured: 'The {items} figures were measured by the source and are reported as stated.',
};

/** What a claim's `status` tells the reader about how far the capability has got: one claim. */
export const STATUS_TEMPLATES: Readonly<Record<Status, string>> = {
  demonstrated: 'The {label} was demonstrated; the source does not report it in commercial deployment.',
  deployed: 'The company states the {label} is deployed; no independent confirmation was available.',
  planned: 'The {label} is planned, not delivered.',
  unspecified: 'The source does not say whether the {label} has been demonstrated or deployed.',
};

/** The same, for two or more claims that share the status. */
export const STATUS_TEMPLATES_PLURAL: Readonly<Record<Status, string>> = {
  demonstrated: 'The {labels} were demonstrated; the source does not report them in commercial deployment.',
  deployed: 'The company states the {labels} are deployed; no independent confirmation was available.',
  planned: 'The {labels} are planned, not delivered.',
  unspecified: 'The source does not say whether the {labels} have been demonstrated or deployed.',
};

/** The statuses that need a sentence of their own: the capability has been shown or promised, not delivered. */
const STATUSES_WITH_SENTENCE: readonly Status[] = ['demonstrated', 'planned'];

/** Does this claim need a 'basis' sentence? Yes unless its figure comes from a filing, a standard, a paper or a measurement. */
export const needsBasisLimitation = (claim: Claim): boolean => !(SAFE_BASES as readonly string[]).includes(claim.basis);

/** Does this claim need a 'status' sentence? Yes when the capability was only demonstrated or is only planned. */
export const needsStatusLimitation = (claim: Claim): boolean => STATUSES_WITH_SENTENCE.includes(claim.status);

/** The number in a claim id such as "c-12"; NaN for anything that is not a claim id. */
export function claimNumber(id: string): number {
  const match = /^c-(\d+)$/.exec(id);
  return match === null ? NaN : Number(match[1]);
}

/**
 * The claim's figure as it is written in the source, followed by a space: the
 * first number value, else the first value of any kind, else nothing.
 */
function figureOf(claim: Claim): string {
  const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
  return value === undefined ? '' : `${value.raw} `;
}

/** "A", "A and B", "A, B and C". */
export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Render the limitation sentence for a group of claims through the `basis` or
 * the `status` template. The template is chosen by the first claim's basis (or
 * status); the gate checks that the claims of a group share it. One claim gives
 * the singular sentence, two or more the plural one.
 */
export function renderLimitation(claims: readonly Claim[], template: 'basis' | 'status'): string {
  const first = claims[0];
  if (first === undefined) throw new Error('renderLimitation: a limitation sentence needs at least one claim');
  const single = claims.length === 1;
  const text =
    template === 'basis'
      ? (single ? BASIS_TEMPLATES : BASIS_TEMPLATES_PLURAL)[first.basis]
      : (single ? STATUS_TEMPLATES : STATUS_TEMPLATES_PLURAL)[first.status];
  const items = joinList(claims.map((claim) => `${figureOf(claim)}${claim.label}`));
  const labels = joinList(claims.map((claim) => claim.label));
  // One pass with a function, so a "$" in a value or label is never read as a
  // replacement pattern and a placeholder inside a value is never filled in.
  return text.replace(/\{(v|label|items|labels)\}/g, (_placeholder, name: string) => {
    if (name === 'items') return items;
    if (name === 'labels') return labels;
    return name === 'v' ? figureOf(first) : first.label;
  });
}

/** A set of claims that one limitation sentence covers: they share the basis (or the status) `key`. */
export interface LimitationGroup {
  template: 'basis' | 'status';
  key: Basis | Status;
  /** Ascending by claim number, each claim once. */
  claims: Claim[];
}

/**
 * The groups of claims that need a limitation sentence. `citedClaims` are the
 * claims the body of a piece cites. Those whose basis is not safe are grouped by
 * basis, in the order of BASES; those that are demonstrated or planned are
 * grouped by status, in that order, after the basis groups. A claim that needs
 * both is in a group of each kind. Inside a group the claims are ordered by claim number.
 */
export function limitationGroups(citedClaims: readonly Claim[]): LimitationGroup[] {
  const unique = [...new Map(citedClaims.map((claim) => [claim.id, claim])).values()].sort((a, b) => claimNumber(a.id) - claimNumber(b.id));
  const groups: LimitationGroup[] = [];
  for (const basis of BASES) {
    const claims = unique.filter((claim) => needsBasisLimitation(claim) && claim.basis === basis);
    if (claims.length > 0) groups.push({ template: 'basis', key: basis, claims });
  }
  for (const status of STATUSES_WITH_SENTENCE) {
    const claims = unique.filter((claim) => claim.status === status);
    if (claims.length > 0) groups.push({ template: 'status', key: status, claims });
  }
  return groups;
}

/** The limitation sentences for the claims a piece cites: one for each group, rendered from its template. */
export function buildLimitations(citedClaims: readonly Claim[]): LimitationSentence[] {
  return limitationGroups(citedClaims).map(({ template, claims }): LimitationSentence => ({
    kind: 'limitation',
    text: renderLimitation(claims, template),
    claimIds: claims.map((claim) => claim.id),
    template,
  }));
}
```

**In `gate/src/sentences.ts`, replace:**
```ts
import type { LedgerSection } from './constants';
import type { Draft, Sentence } from './schemas';

/** A sentence of a draft together with where it sits. */
```

**with:**
```ts
import type { LedgerSection } from './constants';
import type { Claim, Draft, Sentence } from './schemas';

/** A sentence of a draft together with where it sits. */
```

**In `gate/src/sentences.ts`, replace:**
```ts
  return `${item.section}, sentence ${item.position}`;
}
```

**with:**
```ts
  return `${item.section}, sentence ${item.position}`;
}

/**
 * The claims that the sentences of `draft` cite, other than the limitation
 * sentences, which only describe claims. Each claim is listed once, in the
 * order of `claims`; an id that no claim has is ignored.
 */
export function citedClaims(draft: Draft, claims: readonly Claim[]): Claim[] {
  const cited = new Set(
    allSentences(draft)
      .filter((item) => item.sentence.kind !== 'limitation')
      .flatMap((item) => item.sentence.claimIds),
  );
  return claims.filter((claim) => cited.has(claim.id));
}
```

**In `gate/src/schemas.ts`, replace:**
```ts
export type AnalysisSentence = z.infer<typeof AnalysisSentence>;

// A limitation describes exactly one claim's metadata, through one template.
export const LimitationSentence = z.object({
  kind: z.literal('limitation'),
  text: z.string(),
  claimIds: z.tuple([z.string()]),
  template: z.enum(['basis', 'status']),
});
```

**with:**
```ts
export type AnalysisSentence = z.infer<typeof AnalysisSentence>;

// A limitation describes the metadata of one claim or of a group of claims that
// share a basis or a status, through one template. The ids are listed once each,
// in ascending order of claim number; the gate (G8) checks that.
export const LimitationSentence = z.object({
  kind: z.literal('limitation'),
  text: z.string(),
  claimIds: z.array(z.string()).min(1),
  template: z.enum(['basis', 'status']),
});
```

- [ ] **Step 4: Rebuild the golden piece**

The golden piece hand-picked the claims of its limitation sentences. It now asks `buildLimitations` for them, from the claims the rest of the piece cites. (The piece is written without limitations first, and the limitations are added to a copy.)

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
import { createHash } from 'node:crypto';
import { DESK_AUTHOR_NAME } from '../constants';
import { renderLimitation } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence, LimitationSentence } from '../schemas';

// The golden fixture: one complete, fictional news piece that passes every
```

**with:**
```ts
import { createHash } from 'node:crypto';
import { DESK_AUTHOR_NAME } from '../constants';
import { buildLimitations } from '../limitations';
import type { AnalysisSentence, Claim, ClaimValue, Draft, FactSentence } from '../schemas';
import { citedClaims } from '../sentences';

// The golden fixture: one complete, fictional news piece that passes every
```

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);

const claimById = (id: string): Claim => {
  const found = CLAIMS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`the golden fixture has no claim ${id}`);
  return found;
};

const fact = (text: string, ...claimIds: string[]): FactSentence => ({ kind: 'fact', text, claimIds });
const analysis = (text: string, ...claimIds: string[]): AnalysisSentence => ({ kind: 'analysis', text, claimIds });
// A limitation sentence is rendered from the claim it describes, so the
// fixture and the gate's templates cannot drift apart.
const limitation = (id: string, template: 'basis' | 'status'): LimitationSentence => ({
  kind: 'limitation',
  text: renderLimitation(claimById(id), template),
  claimIds: [id],
  template,
});

const DRAFT: Draft = {
  slug: 'fixture-robotics-ships-fx-1-to-second-plant',
  publishedAt: '2026-10-04',
```

**with:**
```ts
export const GOLDEN_CLAIMS: Claim[] = deepFreeze(CLAIMS);

const fact = (text: string, ...claimIds: string[]): FactSentence => ({ kind: 'fact', text, claimIds });
const analysis = (text: string, ...claimIds: string[]): AnalysisSentence => ({ kind: 'analysis', text, claimIds });

// The draft without its limitations. They are built from the claims the rest of the piece cites.
const BODY: Draft = {
  slug: 'fixture-robotics-ships-fx-1-to-second-plant',
  publishedAt: '2026-10-04',
```

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
    },
  ],
  limitations: [
    limitation('c-8', 'basis'),
    limitation('c-9', 'basis'),
    limitation('c-10', 'basis'),
    limitation('c-11', 'basis'),
    limitation('c-12', 'basis'),
    limitation('c-13', 'basis'),
    limitation('c-14', 'basis'),
    limitation('c-4', 'basis'),
    limitation('c-27', 'basis'),
    limitation('c-27', 'status'),
    limitation('c-23', 'status'),
    limitation('c-5', 'status'),
    limitation('c-25', 'status'),
    limitation('c-26', 'status'),
    limitation('c-20', 'basis'),
  ],
};

export const GOLDEN_DRAFT: Draft = deepFreeze(DRAFT);

```

**with:**
```ts
    },
  ],
  limitations: [],
};

// The limitation sentences come from `buildLimitations`, the same function the
// pipeline will use, so the fixture and the gate's templates cannot drift apart.
const DRAFT: Draft = { ...BODY, limitations: buildLimitations(citedClaims(BODY, CLAIMS)) };

export const GOLDEN_DRAFT: Draft = deepFreeze(DRAFT);

```

That leaves the body at 615 words, and the golden piece keeps it between 640 and 720. Claim c-28 lists the figure "three" (of "three-bay"), and the golden prose gains the sentence about the hall and two analysis sentences, which bring in no number, date or name.

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
    basis: 'demo',
    status: 'demonstrated',
    values: [date('24 September 2026', '2026-09-24')],
  }),
];
```

**with:**
```ts
    basis: 'demo',
    status: 'demonstrated',
    values: [date('24 September 2026', '2026-09-24'), number('three', '3')],
  }),
];
```

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
            'c-28',
          ),
        ],
        [fact('Brindle Logistics plans to add a third site in 2027.', 'c-26')],
      ],
    },
```

**with:**
```ts
            'c-28',
          ),
          fact("The demonstration took place in the company's three-bay test hall.", 'c-28'),
        ],
        [
          fact('Brindle Logistics plans to add a third site in 2027.', 'c-26'),
          analysis(
            "The customer's results and the company's schedule together describe a rollout that is still at an early stage.",
            'c-21',
            'c-26',
          ),
        ],
      ],
    },
```

**In `gate/src/fixtures/golden.ts`, replace:**
```ts
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('It expects to build 500 FX-1 arms in 2027.', 'c-6'),
        ],
      ],
```

**with:**
```ts
          fact('Fixture Robotics said it will use the funds to expand FX-1 production.', 'c-7'),
          fact('It expects to build 500 FX-1 arms in 2027.', 'c-6'),
          analysis('The stated use of the funds matches the production plan that the company describes.', 'c-7', 'c-6'),
        ],
      ],
```

Run: `npm test --workspace @robywire/gate -- test/limitations.test.ts test/sentences.test.ts test/schemas.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 5: Write G8 and G2**

G8 reads a group: the list of ids first, then the shared basis or status, then the text. It uses `joinList`, which the limitation module exports, to name several unknown claims.

**Replace `gate/src/checks/g8-limitations.ts` with:**
```ts
import type { Check, Failure } from '../gate';
import { claimNumber, joinList, renderLimitation } from '../limitations';
import type { Claim } from '../schemas';
import { allSentences, describeLocation } from '../sentences';

/** Every failure code G8 can report. */
export const G8_CODES = ['G8_LIMITATION_PLACEMENT', 'G8_LIMITATION_CLAIMS', 'G8_LIMITATION_GROUP', 'G8_LIMITATION_MISMATCH'] as const;

/**
 * What is wrong with the list of claim ids a limitation sentence cites, or
 * undefined if it is a usable list: not empty, each id a claim of the piece,
 * each id once, in ascending order of claim number.
 */
function claimsProblem(ids: readonly string[], known: ReadonlyMap<string, Claim>): string | undefined {
  if (ids.length === 0) return 'cites no claim: it must cite the claims it describes';
  const unknown = [...new Set(ids.filter((id) => !known.has(id)))];
  if (unknown.length === 1) return `cites ${unknown[0]}, which is not one of this piece's claims`;
  if (unknown.length > 1) return `cites ${joinList(unknown)}, which are not claims of this piece`;
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated !== undefined) return `cites ${repeated} more than once: cite each claim once`;
  const at = ids.findIndex((id, index) => index > 0 && claimNumber(id) < claimNumber(ids[index - 1] as string));
  if (at > 0) return `lists ${ids[at]} after ${ids[at - 1]}: list the claims in ascending order of claim number`;
  return undefined;
}

/**
 * G8, limitations: the "What we couldn't verify" sentences are never freely
 * written. Each one describes the metadata of a group of claims through one of
 * the fixed templates in `limitations.ts`, so this check can render the
 * sentence again and compare. The comparison is exact.
 *
 * - A limitation sentence may sit only in `draft.limitations`
 *   (G8_LIMITATION_PLACEMENT), wherever else it is found.
 * - It cites at least one claim of the piece, each once, in ascending order of
 *   claim number (G8_LIMITATION_CLAIMS).
 * - The claims of a 'basis' sentence all have the same basis, and those of a
 *   'status' sentence the same status (G8_LIMITATION_GROUP).
 * - Its text is what the template renders for its claims
 *   (G8_LIMITATION_MISMATCH). A sentence whose claims have changed since it
 *   was written fails here too.
 *
 * A sentence with a problem in an earlier rule is not read by the later ones.
 * Whether a limitation is present at all, and whether every claim that needs
 * one has one, is G2's question.
 */
export const checkG8: Check = ({ draft, claims }) => {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const failures: Failure[] = [];

  for (const located of allSentences(draft)) {
    const { sentence } = located;
    if (sentence.kind !== 'limitation') continue;
    const where = describeLocation(located);
    const fail = (code: string, message: string) => failures.push({ check: 'G8', code, message, where });

    if (located.section !== 'limitations') {
      fail(
        'G8_LIMITATION_PLACEMENT',
        `the limitation sentence at ${where} is not in the "What we couldn't verify" section: limitation sentences belong in the limitations list only`,
      );
    }

    const ids = sentence.claimIds;
    const problem = claimsProblem(ids, byId);
    if (problem !== undefined) {
      fail('G8_LIMITATION_CLAIMS', `the limitation sentence at ${where} ${problem}`);
      continue;
    }

    const group = ids.map((id) => byId.get(id) as Claim);
    const keyOf = (claim: Claim) => (sentence.template === 'basis' ? claim.basis : claim.status);
    const keys = [...new Set(group.map(keyOf))];
    if (keys.length > 1) {
      const examples = keys.map((key) => `${(group.find((claim) => keyOf(claim) === key) as Claim).id}: ${key}`).join(', ');
      const [plural, singular] = sentence.template === 'basis' ? ['bases', 'basis'] : ['statuses', 'status'];
      fail(
        'G8_LIMITATION_GROUP',
        `the limitation sentence at ${where} groups claims with different ${plural} (${examples}): a ${sentence.template} sentence covers claims that share one ${singular}`,
      );
      continue;
    }

    const expected = renderLimitation(group, sentence.template);
    if (sentence.text !== expected) {
      fail(
        'G8_LIMITATION_MISMATCH',
        `the limitation sentence at ${where} does not match the ${sentence.template} template for ${ids.join(', ')}; it must read: "${expected}"`,
      );
    }
  }

  return { failures, holdReasons: [] };
};
```

G2 asks which claims the body cites need a sentence of each kind and whether some limitation sentence of that kind cites them.

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
import { SAFE_BASES } from '../constants';
import type { Check, Failure } from '../gate';
import { allSentences } from '../sentences';
import { countWords } from '../text';

```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { needsBasisLimitation, needsStatusLimitation } from '../limitations';
import { allSentences, citedClaims } from '../sentences';
import { countWords } from '../text';

```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
  'G2_HEADING_EMPTY',
  'G2_LIMITATIONS_MISSING',
] as const;

const MIN_SECTIONS = 2;

const isSafeBasis = (basis: string) => (SAFE_BASES as readonly string[]).includes(basis);

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; every heading is
 * there, is short enough (`headingMax`) and is not a question; and a piece that
 * rests on a company's own claims has a "What we couldn't verify" section.
 * What a heading may say is G4's question (G4_HEADING_*).
 *
```

**with:**
```ts
  'G2_HEADING_EMPTY',
  'G2_LIMITATIONS_MISSING',
  'G2_LIMITATION_COVERAGE',
] as const;

const MIN_SECTIONS = 2;

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
 * are the right length; there are at least two sections; every heading is
 * there, is short enough (`headingMax`) and is not a question; and a piece that
 * rests on a company's own claims has a "What we couldn't verify" section
 * that covers each claim that needs a note (G2_LIMITATION_COVERAGE).
 * What a heading may say is G4's question (G4_HEADING_*).
 *
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
  }

  const cited = new Set(sentences.flatMap((item) => item.sentence.claimIds));
  const needLimitations = claims.filter((claim) => cited.has(claim.id) && !isSafeBasis(claim.basis));
  if (needLimitations.length > 0 && draft.limitations.length === 0) {
    const ids = needLimitations.map((claim) => claim.id).join(', ');
    fail('G2_LIMITATIONS_MISSING', `claims ${ids} rest on a datasheet, press release, briefing or demo, but there is no "What we couldn't verify" section`, 'limitations');
  }

```

**with:**
```ts
  }

  // A claim cited by the body needs a 'basis' sentence unless its figure comes
  // from a filing, a standard, a paper or a measurement, and a 'status' sentence
  // when the capability was only demonstrated or is only planned.
  const needs = citedClaims(draft, claims).flatMap((claim) => [
    ...(needsBasisLimitation(claim) ? [{ claim, template: 'basis' as const, key: claim.basis }] : []),
    ...(needsStatusLimitation(claim) ? [{ claim, template: 'status' as const, key: claim.status }] : []),
  ]);
  if (needs.length > 0 && draft.limitations.length === 0) {
    const ids = [...new Set(needs.map((need) => need.claim.id))].join(', ');
    fail(
      'G2_LIMITATIONS_MISSING',
      `claims ${ids} need a note on what could not be verified (they rest on a datasheet, press release, briefing or demo, or are only demonstrated or planned), but there is no "What we couldn't verify" section`,
      'limitations',
    );
  } else {
    for (const { claim, template, key } of needs) {
      const covered = draft.limitations.some((sentence) => sentence.template === template && sentence.claimIds.includes(claim.id));
      if (!covered) {
        fail(
          'G2_LIMITATION_COVERAGE',
          `claim ${claim.id} (${claim.label}) has the ${template} "${key}", but no limitation sentence with the ${template} template cites it`,
          claim.id,
        );
      }
    }
  }

```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test --workspace @robywire/gate -- test/g8-limitations.test.ts test/g2-structure.test.ts test/limitations.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 7: Run the whole gate suite and see what else the new golden piece changes**

Run: `npm test --workspace @robywire/gate`
Expected: FAIL — `has exactly one analysis sentence, and it is in a section`, `labels the one analysis sentence and nothing else`, `G7_ANALYSIS_SHARE` and `reads a section sentence`; `Test Files  4 failed`.

The golden piece has three analysis sentences now, forty body sentences (an analysis share of 7.5%, so six more analysis sentences stay under 20% and seven do not), and one sentence more in the section "What the customer reports". Four test files read these numbers.

- [ ] **Step 8: Update the tests that read the numbers of the golden piece**

**In `gate/test/golden-draft.test.ts`, replace:**
```ts
import { CATEGORY_VOCAB } from '../src/constants';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { renderLimitation } from '../src/limitations';
import { Draft } from '../src/schemas';
import type { Sentence } from '../src/schemas';
import { countWords, normaliseQuotes, quotedSegments } from '../src/text';
import { extractTokens } from '../src/tokens';
```

**with:**
```ts
import { CATEGORY_VOCAB } from '../src/constants';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { buildLimitations, renderLimitation } from '../src/limitations';
import { Draft } from '../src/schemas';
import type { Sentence } from '../src/schemas';
import { citedClaims } from '../src/sentences';
import { countWords, normaliseQuotes, quotedSegments } from '../src/text';
import { extractTokens } from '../src/tokens';
```

**In `gate/test/golden-draft.test.ts`, replace:**
```ts
  const analyses = bodySentences.filter((sentence) => sentence.kind === 'analysis');

  it('has exactly one analysis sentence, and it is in a section', () => {
    expect(everySentence.filter((sentence) => sentence.kind === 'analysis')).toHaveLength(1);
    expect(analyses).toHaveLength(1);
  });

```

**with:**
```ts
  const analyses = bodySentences.filter((sentence) => sentence.kind === 'analysis');

  it('has three analysis sentences, all in sections, the first of them about the measured rate', () => {
    expect(everySentence.filter((sentence) => sentence.kind === 'analysis')).toHaveLength(3);
    expect(analyses).toHaveLength(3);
    expect(analyses[0]?.text).toBe(
      'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
    );
  });

```

**In `gate/test/golden-draft.test.ts`, replace:**
```ts
    const factDates = new Set(facts.flatMap((tokens) => tokens.dates.map((token) => token.iso)));
    const factNames = new Set(facts.flatMap((tokens) => tokens.names));
    const own = extractTokens(analyses[0]?.text ?? '');
    for (const token of own.numbers) expect(factNumbers.has(`${token.value} ${token.unit ?? ''}`), token.raw).toBe(true);
    for (const token of own.dates) expect(factDates.has(token.iso), token.raw).toBe(true);
    for (const token of own.names) expect(factNames.has(token), token).toBe(true);
  });
});
```

**with:**
```ts
    const factDates = new Set(facts.flatMap((tokens) => tokens.dates.map((token) => token.iso)));
    const factNames = new Set(facts.flatMap((tokens) => tokens.names));
    for (const analysis of analyses) {
      const own = extractTokens(analysis.text);
      for (const token of own.numbers) expect(factNumbers.has(`${token.value} ${token.unit ?? ''}`), token.raw).toBe(true);
      for (const token of own.dates) expect(factDates.has(token.iso), token.raw).toBe(true);
      for (const token of own.names) expect(factNames.has(token), token).toBe(true);
    }
  });
});
```

**In `gate/test/golden-draft.test.ts`, replace:**
```ts

describe('GOLDEN_DRAFT: limitations', () => {
  it('has limitation sentences rendered by renderLimitation from the claim they cite', () => {
    expect(GOLDEN_DRAFT.limitations.length).toBeGreaterThan(0);
    for (const sentence of GOLDEN_DRAFT.limitations) {
      expect(sentence.kind).toBe('limitation');
      expect(sentence.claimIds).toHaveLength(1);
      const cited = GOLDEN_CLAIMS.find((claim) => claim.id === sentence.claimIds[0]);
      expect(cited, sentence.text).toBeDefined();
      expect(sentence.text).toBe(renderLimitation(cited as (typeof GOLDEN_CLAIMS)[number], sentence.template));
    }
  });

  it('never says the same thing twice', () => {
    const texts = GOLDEN_DRAFT.limitations.map((sentence) => sentence.text);
```

**with:**
```ts

describe('GOLDEN_DRAFT: limitations', () => {
  it('has limitation sentences rendered by renderLimitation from the claims they cite', () => {
    expect(GOLDEN_DRAFT.limitations.length).toBeGreaterThan(0);
    for (const sentence of GOLDEN_DRAFT.limitations) {
      expect(sentence.kind).toBe('limitation');
      expect(sentence.claimIds.length).toBeGreaterThan(0);
      const cited = sentence.claimIds.map((id) => GOLDEN_CLAIMS.find((claim) => claim.id === id) as (typeof GOLDEN_CLAIMS)[number]);
      expect(cited.every((claim) => claim !== undefined), sentence.text).toBe(true);
      expect(sentence.text).toBe(renderLimitation(cited, sentence.template));
    }
  });

  it('has the sentences buildLimitations writes for the claims the rest of the piece cites: three to six of them', () => {
    const { limitations, ...rest } = GOLDEN_DRAFT;
    const cited = citedClaims({ ...rest, limitations: [] }, GOLDEN_CLAIMS);
    expect(GOLDEN_DRAFT.limitations).toEqual(buildLimitations(cited));
    expect(limitations.length).toBeGreaterThanOrEqual(3);
    expect(limitations.length).toBeLessThanOrEqual(6);
  });

  it('never says the same thing twice', () => {
    const texts = GOLDEN_DRAFT.limitations.map((sentence) => sentence.text);
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
import { findSentence, mutate } from './helpers';

const twoFacts: Sentence[] = [
  { kind: 'fact', text: 'Another plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'One more plain fact.', claimIds: ['c-1'] },
];

// The golden piece has exactly one analysis sentence. It contains no number,
// date or name, so it adds nothing the facts do not already say.
const ANALYSIS_AT = 'section "What the customer reports", sentence 6';
const analysisSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');
```

**with:**
```ts
import { findSentence, mutate } from './helpers';

const threeFacts: Sentence[] = [
  { kind: 'fact', text: 'Another plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'One more plain fact.', claimIds: ['c-1'] },
  { kind: 'fact', text: 'A third plain fact.', claimIds: ['c-1'] },
];

// The golden piece has three analysis sentences. The first, in the section
// "What the customer reports", is the one these tests change. None of them
// contains a number, a date or a name, so they add nothing the facts do not already say.
const ANALYSIS_AT = 'section "What the customer reports", sentence 6';
const analysisSentence = (g: GateInput) => findSentence(g.draft, (sentence) => sentence.kind === 'analysis');
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 47 sentences, one of them analysis: opening 3,
  // takeaways 4, sections 25, limitations 15. Ten more analysis sentences make
  // 11 of 57 (19.3%); eleven more make 12 of 58 (20.7%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 10))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 11)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 12 of the 58 sentences in the body (20.7%); the cap is 20.0%',
        where: 'body',
      },
```

**with:**
```ts

describe('G7_ANALYSIS_SHARE', () => {
  // The golden body has 40 sentences, three of them analysis: opening 3,
  // takeaways 4, sections 28, limitations 5. Six more analysis sentences make
  // 9 of 46 (19.6%); seven more make 10 of 47 (21.3%).
  it('passes up to the cap and fails just over it, and says the numbers', () => {
    expect(run((g) => addAnalysis(g, 6))).toEqual({ failures: [], holdReasons: [] });
    expect(run((g) => addAnalysis(g, 7)).failures).toEqual([
      {
        check: 'G7',
        code: 'G7_ANALYSIS_SHARE',
        message: 'analysis sentences are 10 of the 47 sentences in the body (21.3%); the cap is 20.0%',
        where: 'body',
      },
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts
  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.02 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.03 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 1 / 47 } })).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['the opening', (g: GateInput) => g.draft.opening.push(...twoFacts)],
    ['the takeaways', (g: GateInput) => g.draft.takeaways.push(...twoFacts)],
    ['a section', (g: GateInput) => g.draft.sections[0]!.paragraphs[0]!.push(...twoFacts)],
    ['the limitations', (g: GateInput) => g.draft.limitations.push(structuredClone(g.draft.limitations[0]!), structuredClone(g.draft.limitations[1]!))],
  ])('counts the sentences of %s among the body sentences', (_name, addTwo) => {
    // 12 analysis sentences of 58 is over the cap; two more body sentences make it exactly 12 of 60, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 11);
      addTwo(g);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
```

**with:**
```ts
  it('reads the cap from the context', () => {
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.07 } }))).toEqual(['G7_ANALYSIS_SHARE']);
    expect(codes(run(() => undefined, { config: { analysisShareCap: 0.08 } }))).toEqual([]);
  });

  it('passes a share exactly at the cap', () => {
    expect(run(() => undefined, { config: { analysisShareCap: 3 / 40 } })).toEqual({ failures: [], holdReasons: [] });
  });

  it.each([
    ['the opening', (g: GateInput) => g.draft.opening.push(...threeFacts)],
    ['the takeaways', (g: GateInput) => g.draft.takeaways.push(...threeFacts)],
    ['a section', (g: GateInput) => g.draft.sections[0]!.paragraphs[0]!.push(...threeFacts)],
    [
      'the limitations',
      (g: GateInput) => g.draft.limitations.push(structuredClone(g.draft.limitations[0]!), structuredClone(g.draft.limitations[1]!), structuredClone(g.draft.limitations[2]!)),
    ],
  ])('counts the sentences of %s among the body sentences', (_name, addThree) => {
    // 10 analysis sentences of 47 is over the cap; three more body sentences make it exactly 10 of 50, which is 20%.
    const output = run((g) => {
      addAnalysis(g, 7);
      addThree(g);
    });
    expect(output).toEqual({ failures: [], holdReasons: [] });
```

**In `gate/test/g7-analysis.test.ts`, replace:**
```ts

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 2 of 47 would be over a cap of 1 in 47; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 1 / 47 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });
```

**with:**
```ts

  it('does not count a misplaced analysis sentence in the title or description toward the share', () => {
    // 4 of 41 would be over a cap of 3 in 40; the title sentence is reported for its placement alone.
    const output = run((g) => (g.draft.title = asAnalysis(g.draft.title)), { config: { analysisShareCap: 3 / 40 } });
    expect(codes(output)).toEqual(['G7_ANALYSIS_PLACEMENT']);
  });
```

**In `gate/test/g4-values.test.ts`, replace:**
```ts
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[1]!.paragraphs[2]![0]!, 'section "What the customer reports", sentence 8'],
  ])('reads %s', (_name, pick, where) => {
    const input = mutate(cloneGolden(), (g) => {
```

**with:**
```ts
    ['an opening sentence', (g: GateInput) => g.draft.opening[1]!, 'opening, sentence 2'],
    ['a takeaway', (g: GateInput) => g.draft.takeaways[1]!, 'takeaways, sentence 2'],
    ['a section sentence', (g: GateInput) => g.draft.sections[1]!.paragraphs[2]![0]!, 'section "What the customer reports", sentence 9'],
  ])('reads %s', (_name, pick, where) => {
    const input = mutate(cloneGolden(), (g) => {
```

The test of the renderer says three analysis labels, and now also states what the limitations paragraph looks like: one paragraph, each sentence followed by the markers of every claim it describes.

**In `gate/test/render.test.ts`, replace:**
```ts
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import { NewsFrontmatter, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**with:**
```ts
import type { GateInput, GateResult } from '../src/gate';
import { LedgerEntry } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('follows each sentence with marker links to the receipts page, with no space before the first marker', () => {
    const opening = blocks(mdx)[0]!;
```

**with:**
```ts
  });

  it('writes the limitations as one paragraph, each sentence followed by the markers of every claim it describes', () => {
    const marker = (id: string) => `[${ledger.order.indexOf(id) + 1}](${RECEIPTS}#${id})`;
    const expected = golden.draft.limitations.map((sentence) => `${escapeMdx(sentence.text)}${sentence.claimIds.map(marker).join('')}`).join(' ');
    expect(blocks(mdx).at(-1)).toBe(expected);
    // One marker for each claim a sentence describes: 8 datasheet claims, 12 press-release claims, 2 demo claims, 2 demonstrated and 5 planned.
    expect(blocks(mdx).at(-1)!.match(/\]\(/g)).toHaveLength(8 + 12 + 2 + 2 + 5);
  });

  it('follows each sentence with marker links to the receipts page, with no space before the first marker', () => {
    const opening = blocks(mdx)[0]!;
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('labels the one analysis sentence and nothing else', () => {
    expect(mdx.split('**Analysis.** ')).toHaveLength(2);
    expect(mdx).toContain('**Analysis.** The measured rate sits below the datasheet maximum');
  });
```

**with:**
```ts
  });

  it('labels the three analysis sentences and nothing else', () => {
    expect(mdx.split('**Analysis.** ')).toHaveLength(4);
    expect(mdx).toContain('**Analysis.** The measured rate sits below the datasheet maximum');
  });
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  33 passed (33)`.

- [ ] **Step 9: Show that two seeded defects miss, and two codes have no case and no label**

The seeded defect `short-body` kept only the first seven of the fifteen limitation sentences. There are five now, so it removes nothing and the gate reports nothing.

Run: `npm run evals:seeded`
Expected: FAIL — `MISSED  G2     G2_BODY_LENGTH               short-body` and `FAIL: the gate missed a seeded defect`.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G2_LIMITATION_COVERAGE`.

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G2_LIMITATION_COVERAGE`.

- [ ] **Step 10: Repair the seeded defects, add the two new ones, and add the labels**

`short-body` now cuts four of the five. `limitation-uncovered-claim` leaves one datasheet claim out of the sentence that describes its group. `limitation-mixed-group` puts a press-release claim into a datasheet sentence. The text of `limitation-edited-text` is reworded for a group.

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'Half the limitations are cut, which leaves the piece under 600 words.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 7);
      return base;
    },
```

**with:**
```ts
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'Four of the five limitation sentences are cut, which leaves the piece under 600 words.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 1);
      return base;
    },
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    },
  },
  {
    id: 'no-limitations',
```

**with:**
```ts
    },
  },
  {
    id: 'limitation-uncovered-claim',
    check: 'G2',
    code: 'G2_LIMITATION_COVERAGE',
    description: "A claim that needs a limitation is left out of the sentence that describes its group: c-12, the datasheet's pick rate.",
    apply: (base) => {
      const [datasheet] = base.draft.limitations;
      datasheet!.claimIds = datasheet!.claimIds.filter((id) => id !== 'c-12');
      return base;
    },
  },
  {
    id: 'no-limitations',
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
    },
  },
  {
    id: 'limitation-edited-text',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the datasheet figure was independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The 12 kilograms payload figure has been confirmed independently.';
      return base;
    },
```

**with:**
```ts
    },
  },
  {
    id: 'limitation-mixed-group',
    check: 'G8',
    code: 'G8_LIMITATION_GROUP',
    description: 'One limitation sentence covers a press-release claim, c-1, together with datasheet claims.',
    apply: (base) => {
      base.draft.limitations[0]!.claimIds = ['c-1', 'c-8', 'c-9'];
      return base;
    },
  },
  {
    id: 'limitation-edited-text',
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the datasheet figures were independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The datasheet figures have been confirmed independently.';
      return base;
    },
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G2_HEADING_EMPTY: 'A section had no heading',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
```

**with:**
```ts
  G2_HEADING_EMPTY: 'A section had no heading',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G2_LIMITATION_COVERAGE: 'A claim was left out of the section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G7_ANALYSIS_NEW_VALUE: 'Analysis brought in a number, date or name of its own',
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation did not cite exactly one claim',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
```

**with:**
```ts
  G7_ANALYSIS_NEW_VALUE: 'Analysis brought in a number, date or name of its own',
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation cited no claim, an unknown claim or claims out of order',
  G8_LIMITATION_GROUP: 'A limitation grouped claims with different bases or statuses',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
```

Run: `npm run evals:seeded`
Expected: PASS — `53 of 53 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

- [ ] **Step 11: Regenerate the fixtures**

The fixture pieces are generated from the golden piece, so their text and their ledgers change.

Run: `npm run fixtures:check`
Expected: FAIL — `--- committed/news/fixture-robotics-ships-fx-1-to-second-plant.mdx`.

Run: `npm run fixtures:generate --workspace @robywire/site`
Expected: PASS — `wrote 9 fixture files`.

- [ ] **Step 12: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

The site still builds and passes its audit with the new sentences (the claim markers of a limitation sentence are several links in a row):

Run: `npm run build:fixtures && npm run audit`
Expected: PASS — `Passed: 14 checks.`

- [ ] **Step 13: Commit**

```bash
git add gate/src gate/test evals/src evals/scoreboard/seeded.json site/src site/test
git commit -m "feat(gate): one limitation sentence per group of claims, and G2 requires every claim that needs one to be covered" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
