## Milestone 3 (part D) — Closing the last holes

**Goal:** finish the hardening of Plan 1. After Parts A, B and C a second review read the work again and found what was left: a made-up name that hides at the start of a sentence in lowercase, a headline that the build never compared with the ledger, a fact card that could draw a figure with nothing to say where it came from, a few pages and a README that still said more than the code does, and a proof (the last task of Part C) that predates these fixes. Part D closes them, and ends with the proof from a clean install and the list of what Plan 2 must do first.

| Task | What it closes |
|---|---|
| 84 | Every sentence of a piece starts with a capital letter or a digit (a new rule of G2, `G2_SENTENCE_START`), so a sentence that opens in lowercase cannot hide a made-up name from the first-word rule of G4 and G7. |
| 85 | The title and the description of a piece are the title sentence and the description sentence of its ledger. One function (`renderHead`) gives them to the renderer, and the site stops the build, naming the piece and the field, when a file says something else. |
| 86 | The fact card draws only figures from a tier-1 source, says under each one where it comes from (datasheet, press release, filing and so on), and says the same in its label for assistive technology. |
| 87 | The copy says only what the code does: the list of known limits is complete, the rule G4 on the method page points at it instead of claiming to be total, the descriptions of the seeded defects describe rules and not the golden piece, the README is true about the source statuses, and the holds page, the status page, the paragraph on the two kinds of source and the list "What the Desk never does" are written by functions of the `LIVE` switchboard. |
| 88 | Milestone 3 is verified from a clean install, the "done when" of milestones 0 to 3 is restated with its proving command, and the checklist that Plan 2 starts from is written down. This task makes no commit. |

**Starting state:** Tasks 1 to 83 are finished and committed (Task 83 made no commit). `npm run typecheck`, `npm test`, `npm run evals:seeded` (53 of 53 cases caught), `npm run fixtures:check`, `npm run build`, `npm run build:fixtures`, `npm run audit` (16 checks) and `npm run audit:prod` (17 checks) pass. The gate has 43 failure codes. The fixture build has five pieces (`fx-1` to `fx-5`), the fifth a draft that the gate held and the owner released. `gate/src/render/` writes the body of a piece from its ledger (`renderBody`) and `site/src/lib/match-pieces.ts` stops the build when a body differs. `site/src/lib/copy.ts` writes every sentence whose tense depends on the `LIVE` switchboard, and all four flags are `false`.

**Rules for every task in this milestone:**
- Run every command from the repository root. Paths are relative to it.
- To run one test file, use `npm test --workspace @robywire/site -- test/<name>.test.ts` (or `@robywire/gate`, `@robywire/evals`). Everything after the `--` goes to Vitest.
- A step that says `Expected: FAIL` means the command must exit non-zero and print the quoted fragment. Do not continue until you have seen that failure. A test that has never failed has not been shown to test anything. A few tests guard a rule that already holds; the step says so.
- Do not weaken a test to make it pass. If a test fails after you implement, the implementation is wrong. The one exception is a test that pins a sentence or a number that a task says changes: those are edited, and the task shows each edit.
- No package is installed or changed in this milestone. The toolchain is the one of Milestones 0 to 2.
- Source files contain ASCII only. Never type a character outside ASCII into a source file. Code uses `String.fromCharCode` where it needs one. A few lines in the tests and in `gate/src/text.ts` contain an escape written with six ASCII characters (a backslash, `u`, and four hexadecimal digits, such as the one for a curly quotation mark); where an edit below shows one, type those six characters exactly. If your tool turns one into the character itself, undo that, because the tests would then contain a character outside ASCII.
- Every new failure code of the gate needs a unit test, a seeded defect in `evals/src/cases/`, a place in the list of codes of its check, and a plain-English label in `site/src/lib/reasons.ts`. Tests fail until each is there.
- Public copy rules still apply: nothing may be described in the present tense as working if Plan 1 does not build it. Every sentence whose tense depends on a part of the Desk being live is written by a function of `site/src/lib/copy.ts` that takes the `LIVE` switchboard, and a test shows what it says for every setting.
- The fixtures are fictional. The production build must contain none of them: `npm run audit:prod` (check A13) fails if it does.
- After **every** task the whole suite is green: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`.
- Each task but the last ends with one commit, using exactly the message and the two `-m` options shown.

**Versions:** none are added. This milestone was verified with the versions of Milestones 0 to 2 (Node 22, TypeScript 6.0.3 in the repository root and `site` and 7.0.2 in `gate` and `evals`, Astro 7.3.5, Zod 4.6.5, Vitest 5.0.3).

---

### Task 84: Every sentence starts with a capital letter or a digit

**Files:**
- Modify: `gate/src/text.ts` (`afterOpeners` and `startsWithCapitalOrDigit`)
- Modify: `gate/src/checks/g2-structure.ts` (the new rule, failure code `G2_SENTENCE_START`)
- Modify: `gate/src/checks/g4-values.ts`, `gate/src/tokens.ts` (a message and a comment that gave advice the new rule makes wrong)
- Modify: `evals/src/cases/frontmatter-structure.ts` (the seeded defect `lowercase-sentence-start`), `evals/scoreboard/seeded.json` (regenerated: 54 cases)
- Modify: `site/src/lib/reasons.ts` (the plain-English label), `site/src/lib/method.ts` (the sentence about G2 on the method page)
- Test: `gate/test/text.test.ts`, `gate/test/g2-structure.test.ts`, `gate/test/g4-values.test.ts`, `evals/test/seeded.test.ts`, `site/test/method.test.ts`

Task 71 made G4 and G7 ground the first word of every sentence: it must be an ordinary function word or a word of a claim the sentence cites. The token reader finds that word only when it starts with a capital letter or mixes letters and digits, which is how it tells a first word that might be a name from one that cannot be (`initialWord` of `extractTokens`). The review of Part B probed the reader with `extractTokens('harlow logistics plans a plant.')` and found that it returns no first word and no names. A made-up company written in lowercase at the start of a sentence therefore met no check at all, and the message of `G4_NAME_UNSUPPORTED` even told the composer to "write it in lowercase".

The reader cannot be made to read lowercase names, because it cannot tell a name from a word. What the gate can do is forbid the one place where it cannot look. This task adds a rule to G2:

1. For every sentence of the piece (the title, the description, the opening, the takeaways, every paragraph of every section and the limitations, facts, analysis and limitations alike) skip any spaces, opening quotation marks and opening brackets at its start. The first character that is left must be an uppercase letter, of any alphabet, or a digit. Otherwise the gate reports `G2_SENTENCE_START` and says where the sentence is (`title`, `opening, sentence 1`, `section "What shipped", sentence 3`) and what it starts with. A sentence with nothing left after the marks has no first character and fails with its own message.
2. A heading is not a sentence, so the rule does not read it. G4 has a rule of its own for headings (a capitalised word must be a word of a claim of the section), and its message, "write it in lowercase if it is an ordinary word", is still the right advice there.
3. The rule is blunt, and it refuses some good sentences: one that opens with a currency sign ("$38,000 is the list price.") or a dash, and one that opens with a name that starts in lowercase (iRobot, xAI). The composer rewrites them. Task 87 lists the last of these among the known limits on the method page.
4. The golden piece, and so the five fixture pieces, need no change: every sentence of it already starts with a capital letter.

- [ ] **Step 1: Write the failing tests for the two helpers**

`afterOpeners` takes off what stands in front of the first letter: spaces, quotation marks (straight and curly, single and double, low and angle) and opening brackets, and nothing else. `startsWithCapitalOrDigit` looks at the character that is left.

**In `gate/test/text.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { countWords, hasQuoted, jaccard, normaliseQuotes, quotedSegments, sentenceWords, stripQuoted } from '../src/text';

describe('countWords', () => {
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { afterOpeners, countWords, hasQuoted, jaccard, normaliseQuotes, quotedSegments, sentenceWords, startsWithCapitalOrDigit, stripQuoted } from '../src/text';

describe('countWords', () => {
```

**In `gate/test/text.test.ts`, replace:**
```ts
});

describe('jaccard', () => {
  const set = (...items: string[]) => new Set(items);
```

**with:**
```ts
});

describe('afterOpeners', () => {
  it.each([
    ['Plain text', 'Plain text'],
    ['  padded', 'padded'],
    ['"Quoted," said Jane.', 'Quoted," said Jane.'],
    ['\u201CCurly\u201D start', 'Curly\u201D start'],
    ['\u2018single\u2019 start', 'single\u2019 start'],
    ['\u201Elow\u201F start', 'low\u201F start'],
    ["'single' start", "single' start"],
    ['\u00ABguillemets\u00BB', 'guillemets\u00BB'],
    ['\u2039single guillemet', 'single guillemet'],
    ['(bracket) start', 'bracket) start'],
    ['[square] start', 'square] start'],
    ['{curly} start', 'curly} start'],
    ['  ("[mixed ones', 'mixed ones'],
    ['\u00A0\u00A0non-breaking spaces', 'non-breaking spaces'],
    ['', ''],
    ['"("  ', ''],
    // Only what stands before the first letter goes: the rest, and every kind of character after it, stays.
    ['A "b" (c)', 'A "b" (c)'],
    ['$450 million', '$450 million'],
    [') closing bracket first', ') closing bracket first'],
  ])('skips what stands in front of the first letter of %j', (input, expected) => {
    expect(afterOpeners(input)).toBe(expected);
  });
});

describe('startsWithCapitalOrDigit', () => {
  it.each([
    'The arm shipped.',
    'A',
    '7 investors took part.',
    '2026 was a busy year.',
    '3D printing helped.',
    '"The arm," said Jane.',
    '\u201CThe arm,\u201D said Jane.',
    '\u2018The arm\u2019 was new.',
    '(The arm shipped.)',
    '["The arm"] shipped.',
    '  The arm shipped.',
    '\u00C9clair Robotics grew.',
    '\u00D6zdemir Logistics grew.',
    '\u0416 started it.',
    '\u0663 investors took part.',
  ])('accepts %j', (text) => {
    expect(startsWithCapitalOrDigit(text)).toBe(true);
  });

  it.each([
    'harlow logistics plans a plant.',
    'iRobot joined.',
    'xAI joined.',
    '"the arm," said Jane.',
    '\u201Cthe arm,\u201D said Jane.',
    '(the arm shipped.)',
    '  the arm shipped.',
    '\u00E9clair Robotics grew.',
    '$450 million was raised.',
    '- The arm shipped.',
    '...The arm shipped.',
    ') The arm shipped.',
    '\u2014The arm shipped.',
    '',
    '   ',
    '""',
    '"("',
  ])('refuses %j', (text) => {
    expect(startsWithCapitalOrDigit(text)).toBe(false);
  });

  it('looks at the first character only, so a capital later in the sentence does not help', () => {
    expect(startsWithCapitalOrDigit('the Arm shipped.')).toBe(false);
    expect(startsWithCapitalOrDigit('The arm Shipped.')).toBe(true);
  });
});

describe('jaccard', () => {
  const set = (...items: string[]) => new Set(items);
```

Run: `npm test --workspace @robywire/gate -- test/text.test.ts`
Expected: FAIL — `afterOpeners is not a function` and `startsWithCapitalOrDigit is not a function`

- [ ] **Step 2: Write the helpers**

**In `gate/src/text.ts`, replace:**
```ts
}

/** Jaccard similarity of two sets: shared items over all items. Two empty sets score 0. */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
```

**with:**
```ts
}

/**
 * What may stand in front of the first letter of a sentence without being part of its first word: spaces,
 * quotation marks (straight and curly, single and double, low and angle) and opening brackets.
 */
const SENTENCE_OPENERS = /^[\s"'\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u2039([{]+/u;

/** `text` without the spaces, opening quotation marks and opening brackets that stand before its first letter. */
export function afterOpeners(text: string): string {
  return text.replace(SENTENCE_OPENERS, '');
}

/**
 * Does a sentence start with an uppercase letter (of any alphabet) or a digit, once the opening quotation marks
 * and brackets in front are skipped? The first-word rule of G4 looks for a capitalised first word, so a sentence
 * that opens in lowercase would not be read by it: G2 requires this of every sentence. A text with nothing
 * after the openers has no first character, so it does not.
 */
export function startsWithCapitalOrDigit(text: string): boolean {
  return /^[\p{Lu}\p{Nd}]/u.test(afterOpeners(text));
}

/** Jaccard similarity of two sets: shared items over all items. Two empty sets score 0. */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
```

Run: `npm test --workspace @robywire/gate -- test/text.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 3: Write the failing tests for the rule**

The length tests of G2 build their sentences from the word `word`. They now start with `Word`, because a sentence must start with a capital letter. The new block checks every part of a piece, the quotation marks and brackets that may come first, the kinds of start that must fail, the message, the order of the failures, and that a made-up name in lowercase, which G4 cannot see, is stopped here.

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
import { ALL_CHECKS } from '../src/checks';
import { checkG2 } from '../src/checks/g2-structure';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, claimById, mutate } from './helpers';

/** `count` words ending in a full stop. */
const sentenceOf = (count: number) => `${Array.from({ length: count - 1 }, () => 'word').join(' ')} word.`;

/** The body as G2 defines it: opening, takeaways, sections and limitations. Not the title, description or headings. */
```

**with:**
```ts
import { ALL_CHECKS } from '../src/checks';
import { checkG2 } from '../src/checks/g2-structure';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { countWords } from '../src/text';
import { allSentences, claimById, findSentence, mutate } from './helpers';

/** `count` words ending in a full stop, the first with a capital letter, as every sentence must start (G2_SENTENCE_START). */
const sentenceOf = (count: number) => `${['Word', ...Array.from({ length: count - 1 }, () => 'word')].join(' ')}.`;

/** The body as G2 defines it: opening, takeaways, sections and limitations. Not the title, description or headings. */
```

**In `gate/test/g2-structure.test.ts`, replace:**
```ts
    .filter((item) => item.section === 'body')
    .map((item) => item.sentence);
  for (const sentence of sections) sentence.text = 'word.';
  sections.at(-1)!.text = sentenceOf(target - (bodyWords(input) - 1));
}
```

**with:**
```ts
    .filter((item) => item.section === 'body')
    .map((item) => item.sentence);
  for (const sentence of sections) sentence.text = 'Word.';
  sections.at(-1)!.text = sentenceOf(target - (bodyWords(input) - 1));
}
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

describe('G2_SENTENCE_START', () => {
  const MESSAGE_END = 'every sentence must start with a capital letter or a digit (after any opening quotation mark or bracket), so that the first-word rule can read it';

  /** Sets the text of the first key takeaway, a sentence that cites a claim and whose length does not matter to any other rule. */
  const takeawayIs = (text: string) => (g: GateInput) => {
    g.draft.takeaways[0]!.text = text;
  };

  /** Turns the first letter of the sentence at `index` (document order, as allSentences numbers them) to lowercase. */
  const lowerAt = (index: number) => (g: GateInput) => {
    const { sentence } = allSentences(g.draft)[index]!;
    sentence.text = sentence.text.replace(/^./u, (first) => first.toLowerCase());
  };

  const golden = cloneGolden();
  const firstHeading = golden.draft.sections[0]!.heading;
  const indexOfFirst = (section: string) => allSentences(golden.draft).findIndex((item) => item.section === section);

  it('passes every sentence of the golden piece, the title, the description, the opening, the takeaways, the body and the limitations', () => {
    expect(allSentences(golden.draft)).toHaveLength(42);
    expect(codesAfter(() => {})).toEqual([]);
  });

  it('fails a sentence that starts in lowercase, and says where it is and what it starts with', () => {
    const out = resultAfter(takeawayIs('harlow logistics plans a plant.'));
    expect(out.failures).toEqual([
      {
        check: 'G2',
        code: 'G2_SENTENCE_START',
        message: `the sentence at takeaways, sentence 1 starts with "harlow": ${MESSAGE_END}`,
        where: 'takeaways, sentence 1',
      },
    ]);
    expect(out.holdReasons).toEqual([]);
  });

  it.each([
    ['title', 'title'],
    ['description', 'description'],
    ['opening', 'opening, sentence 1'],
    ['takeaways', 'takeaways, sentence 1'],
    ['body', `section "${firstHeading}", sentence 1`],
    ['limitations', 'limitations, sentence 1'],
  ])('checks the sentences of the %s: the first one in lowercase fails, at %s', (section, where) => {
    const out = resultAfter(lowerAt(indexOfFirst(section)));
    expect(out.failures.map((failure) => [failure.code, failure.where])).toEqual([['G2_SENTENCE_START', where]]);
  });

  it('checks analysis sentences as it checks facts', () => {
    const out = resultAfter((g) => {
      const sentence = findSentence(g.draft, (candidate) => candidate.kind === 'analysis');
      sentence.text = sentence.text.replace(/^./u, (first) => first.toLowerCase());
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_SENTENCE_START']);
    expect(out.failures[0]!.where).toMatch(/^section "/);
  });

  it('reports each sentence that fails, once, in the order of the piece', () => {
    const last = allSentences(golden.draft).length - 1;
    const out = resultAfter((g) => {
      lowerAt(last)(g);
      lowerAt(0)(g);
      lowerAt(indexOfFirst('body'))(g);
    });
    expect(out.failures.map((failure) => failure.where)).toEqual(['title', `section "${firstHeading}", sentence 1`, 'limitations, sentence 5']);
  });

  it('reports it after the other failures of G2', () => {
    const out = resultAfter((g) => {
      lowerAt(0)(g);
      g.draft.sections = g.draft.sections.slice(0, 1);
    });
    expect(out.failures.map((failure) => failure.code)).toEqual(['G2_BODY_LENGTH', 'G2_SECTIONS_MIN', 'G2_SENTENCE_START']);
  });

  it.each([
    ['a digit', '7 investors took part in the round.'],
    ['a capital letter', 'Investors took part in the round.'],
    ['a letter and a digit', '3D printing helped the round.'],
    ['a capital letter of another alphabet', '\u00C9clair Robotics took part in the round.'],
    ['a digit of another script', '\u0663 investors took part in the round.'],
    ['spaces and then a capital letter', '  Investors took part in the round.'],
    ['a straight quotation mark and then a capital letter', '"Investors took part," said the company.'],
    ['a curly quotation mark and then a capital letter', '\u201CInvestors took part,\u201D said the company.'],
    ['a low quotation mark and then a capital letter', '\u201EInvestors took part,\u201F said the company.'],
    ['a single quotation mark and then a capital letter', '\u2018Investors took part\u2019 was the line.'],
    ['an opening bracket and then a capital letter', '(Investors took part in the round.)'],
    ['a square bracket and then a capital letter', '[Investors] took part in the round.'],
    ['a quotation mark, a bracket and then a digit', '"(7 investors) took part," said the company.'],
  ])('passes a sentence that starts with %s', (_name, text) => {
    expect(codesAfter(takeawayIs(text))).toEqual([]);
  });

  it.each([
    ['a lowercase letter', 'investors took part in the round.'],
    ['a lowercase name that starts a sentence', 'iRobot took part in the round.'],
    ['a lowercase letter after a straight quotation mark', '"investors took part," said the company.'],
    ['a lowercase letter after a curly quotation mark', '\u201Cinvestors took part,\u201D said the company.'],
    ['a lowercase letter after a bracket', '(investors took part in the round.)'],
    ['a lowercase letter after a quotation mark and a bracket', '"(investors) took part," said the company.'],
    ['spaces and then a lowercase letter', '  investors took part in the round.'],
    ['a lowercase letter of another alphabet', '\u00E9clair Robotics took part in the round.'],
    ['a currency sign', '$2 million was raised.'],
    ['a dash', '- Investors took part in the round.'],
    ['a full stop', '...Investors took part in the round.'],
    ['a closing bracket', ') Investors took part in the round.'],
  ])('fails a sentence that starts with %s', (_name, text) => {
    expect(codesAfter(takeawayIs(text))).toEqual(['G2_SENTENCE_START']);
  });

  it('names the first word after the opening quotation marks and brackets, as written, up to 40 characters', () => {
    const message = (text: string) => resultAfter(takeawayIs(text)).failures[0]!.message;
    expect(message('"(harlow) logistics plans a plant."')).toContain('starts with "harlow)"');
    expect(message(`${'x'.repeat(60)} plans a plant.`)).toContain(`starts with "${'x'.repeat(40)}"`);
  });

  it('fails a sentence that has no first character, and says so', () => {
    for (const text of ['', '   ', '""', '"("']) {
      const out = resultAfter(takeawayIs(text));
      expect(out.failures, JSON.stringify(text)).toEqual([
        {
          check: 'G2',
          code: 'G2_SENTENCE_START',
          message: 'the sentence at takeaways, sentence 1 has no first character: every sentence must start with a capital letter or a digit',
          where: 'takeaways, sentence 1',
        },
      ]);
    }
  });

  it('stops what the first-word rule of G4 cannot see: a made-up name in lowercase at the start of a sentence', () => {
    const input = mutate(cloneGolden(), takeawayIs('harlow logistics plans a second plant.'));
    // G4 finds no first word and no name in that sentence, so it reports nothing ...
    expect(checkG4(input, defaultContext()).failures).toEqual([]);
    // ... and G2 is the check that refuses it.
    expect(checkG2(input, defaultContext()).failures.map((failure) => failure.code)).toEqual(['G2_SENTENCE_START']);
  });

  it('does not read the headings, which are not sentences: G4 has its own rule for them', () => {
    expect(codesAfter((g) => (g.draft.sections[0]!.heading = 'what shipped'))).toEqual([]);
  });
});

describe('G2: several problems at once', () => {
  it('reports every one', () => {
```

Run: `npm test --workspace @robywire/gate -- test/g2-structure.test.ts`
Expected: FAIL — `fails a sentence that starts in lowercase, and says where it is and what it starts with` and `stops what the first-word rule of G4 cannot see: a made-up name in lowercase at the start of a sentence`

- [ ] **Step 4: Write the rule**

The rule is the last thing G2 reports, so that the failures that already existed keep their order. The code joins the list of the codes of G2.

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
import type { Check, Failure } from '../gate';
import { needsBasisLimitation, needsStatusLimitation } from '../limitations';
import { allSentences, citedClaims } from '../sentences';
import { countWords } from '../text';

/** Every failure code G2 can report. */
```

**with:**
```ts
import type { Check, Failure } from '../gate';
import { needsBasisLimitation, needsStatusLimitation } from '../limitations';
import { allSentences, citedClaims, describeLocation } from '../sentences';
import { afterOpeners, countWords, startsWithCapitalOrDigit } from '../text';

/** Every failure code G2 can report. */
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
  'G2_LIMITATIONS_MISSING',
  'G2_LIMITATION_COVERAGE',
] as const;

const MIN_SECTIONS = 2;

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
```

**with:**
```ts
  'G2_LIMITATIONS_MISSING',
  'G2_LIMITATION_COVERAGE',
  'G2_SENTENCE_START',
] as const;

const MIN_SECTIONS = 2;

/** The longest first word a G2_SENTENCE_START message quotes. */
const MAX_FIRST_WORD = 40;

/**
 * G2, structure: the opening paragraph, the key takeaways and the whole body
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
 * What a heading may say is G4's question (G4_HEADING_*).
 *
 * The body is the opening, the takeaways, every section paragraph and the
 * limitations. The title, the description and the headings are not counted.
```

**with:**
```ts
 * What a heading may say is G4's question (G4_HEADING_*).
 *
 * Every sentence of the piece (the title, the description, the opening, the
 * takeaways, the section paragraphs and the limitations, of every kind) starts
 * with an uppercase letter or a digit, once any opening quotation marks and
 * brackets are skipped (G2_SENTENCE_START). The first-word rule of G4 and G7
 * looks for a capitalised first word, so a sentence that opened in lowercase
 * ("harlow logistics plans a plant.") would not be read by it.
 *
 * The body is the opening, the takeaways, every section paragraph and the
 * limitations. The title, the description and the headings are not counted.
```

**In `gate/src/checks/g2-structure.ts`, replace:**
```ts
  }

  return { failures, holdReasons: [] };
};
```

**with:**
```ts
  }

  for (const located of sentences) {
    const { text } = located.sentence;
    if (startsWithCapitalOrDigit(text)) continue;
    const where = describeLocation(located);
    const first = afterOpeners(text).split(/\s/u)[0]!.slice(0, MAX_FIRST_WORD);
    fail(
      'G2_SENTENCE_START',
      first === ''
        ? `the sentence at ${where} has no first character: every sentence must start with a capital letter or a digit`
        : `the sentence at ${where} starts with "${first}": every sentence must start with a capital letter or a digit (after any opening quotation mark or bracket), so that the first-word rule can read it`,
      where,
    );
  }

  return { failures, holdReasons: [] };
};
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  34 passed (34)`.

Every failure code needs a seeded defect and a plain-English label, and the tests that say so fail now.

Run: `npm test --workspace @robywire/evals -- test/coverage.test.ts`
Expected: FAIL — `catches at least one case for every failure code any check can report` and `G2_SENTENCE_START`

Run: `npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: FAIL — `has a label for every failure code the gate can report` and `G2_SENTENCE_START`

- [ ] **Step 5: Write the failing test for the seeded defect**

The defect changes one letter of one sentence of the golden piece, and the gate must report this rule and no other for it.

**In `evals/test/seeded.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS, checkG3, checkG4, runGateWith } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { sentenceWith } from '../src/cases/support';
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, ALL_FAILURE_CODES, CHECK_IDS, allSentences, checkG3, checkG4, runGateWith } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { sentenceWith } from '../src/cases/support';
```

**In `evals/test/seeded.test.ts`, replace:**
```ts
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
```

**with:**
```ts
});

describe('the case lowercase-sentence-start', () => {
  it('changes one sentence and one letter of it: the first letter is made lowercase and nothing else is touched', () => {
    const item = SEEDED_CASES.find((candidate) => candidate.id === 'lowercase-sentence-start')!;
    const before = allSentences(cloneGolden().draft);
    const after = allSentences(item.apply(cloneGolden()).draft);
    const changed = after.filter((located, at) => located.sentence.text !== before[at]!.sentence.text);
    expect(changed).toHaveLength(1);
    const original = before[changed[0]!.index]!.sentence.text;
    expect(original).toMatch(/^[A-Z]/);
    expect(changed[0]!.sentence.text).toBe(`${original.charAt(0).toLowerCase()}${original.slice(1)}`);
  });

  it('breaks the sentence rule and nothing else: the first-word rule of G4 reads only capitalised words, so G2 has to refuse the sentence', () => {
    const only = SEEDED_CASES.filter((item) => item.id === 'lowercase-sentence-start');
    expect(runSeeded(ALL_CHECKS, only).cases).toEqual([
      { id: 'lowercase-sentence-start', check: 'G2', code: 'G2_SENTENCE_START', caught: true, gotCodes: ['G2_SENTENCE_START'] },
    ]);
  });
});

describe('runSeeded with cases of its own', () => {
  // Two numbers are wrong in one sentence, so the gate reports the same code twice.
```

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: FAIL — `the case lowercase-sentence-start`

- [ ] **Step 6: Write the seeded defect and the label, and regenerate the scoreboard**

The description of the defect says what is wrong in terms of the rule, not of the golden piece.

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    },
  },
  {
    id: 'limitation-uncovered-claim',
```

**with:**
```ts
    },
  },
  {
    id: 'lowercase-sentence-start',
    check: 'G2',
    code: 'G2_SENTENCE_START',
    description: 'A sentence starts with a lowercase letter, so the first-word rule would not read its first word.',
    apply: (base) => {
      const sentence = sentenceWith(base, 'The arm itself weighs');
      sentence.text = `${sentence.text.charAt(0).toLowerCase()}${sentence.text.slice(1)}`;
      return base;
    },
  },
  {
    id: 'limitation-uncovered-claim',
```

**In `site/src/lib/reasons.ts`, replace:**
```ts
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G2_LIMITATION_COVERAGE: 'A claim was left out of the section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
```

**with:**
```ts
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G2_LIMITATION_COVERAGE: 'A claim was left out of the section on what could not be verified',
  G2_SENTENCE_START: 'A sentence did not start with a capital letter or a digit',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
```

Run: `npm run evals:seeded`
Expected: PASS — `54 of 54 cases caught (100.0%)`, `lowercase-sentence-start` and `PASS: every seeded defect was caught.`

Run: `npm test --workspace @robywire/evals && npm test --workspace @robywire/site -- test/reasons.test.ts`
Expected: PASS — `Test Files  5 passed (5)` and `Test Files  1 passed (1)`.

- [ ] **Step 7: Write the failing tests for the wording**

Two sentences of the code gave advice or made a claim that the rule changes. The message of `G4_NAME_UNSUPPORTED` says to write an ordinary capitalised word in lowercase; that is right in the middle of a sentence and wrong at its start, so the message says so. The method page says what G2 requires, and the sentence has to name the new rule.

**In `gate/test/g4-values.test.ts`, replace:**
```ts
        code: 'G4_NAME_UNSUPPORTED',
        message:
          'the capitalised word "acme" at title is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word',
        where: 'title',
      },
```

**with:**
```ts
        code: 'G4_NAME_UNSUPPORTED',
        message:
          'the capitalised word "acme" at title is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word in the middle of the sentence (the first word of a sentence keeps its capital letter)',
        where: 'title',
      },
```

**In `site/test/method.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig, extractTokens } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';
```

**In `site/test/method.test.ts`, replace:**
```ts
  });

  it('says in G2 and G8 what a limitation sentence is and what covers a claim', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('is covered by a sentence under "What we couldn\'t verify"');
```

**with:**
```ts
  });

  it('says in G2 that every sentence starts with a capital letter or a digit, and the code agrees', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first)');
    expect(startsWithCapitalOrDigit('7 investors took part.')).toBe(true);
    expect(startsWithCapitalOrDigit('"The arm," said Jane.')).toBe(true);
    expect(startsWithCapitalOrDigit('harlow logistics plans a plant.')).toBe(false);
  });

  it('says in G2 and G8 what a limitation sentence is and what covers a claim', () => {
    expect(rules.find((rule) => rule.id === 'G2')?.text).toContain('is covered by a sentence under "What we couldn\'t verify"');
```

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts`
Expected: FAIL — `rejects a name that no cited claim lists`

Run: `npm test --workspace @robywire/site -- test/method.test.ts`
Expected: FAIL — `says in G2 that every sentence starts with a capital letter or a digit, and the code agrees`

- [ ] **Step 8: Write the wording**

**In `gate/src/checks/g4-values.ts`, replace:**
```ts
        fail(
          'G4_NAME_UNSUPPORTED',
          `the capitalised word "${name}" at ${where} is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word`,
        );
      }
```

**with:**
```ts
        fail(
          'G4_NAME_UNSUPPORTED',
          `the capitalised word "${name}" at ${where} is not a name in any claim this sentence cites: list it as a name value, or write it in lowercase if it is an ordinary word in the middle of the sentence (the first word of a sentence keeps its capital letter)`,
        );
      }
```

The comment of the token reader says when a sentence has no first word. A lowercase opening is now a failure of G2.

**In `gate/src/tokens.ts`, replace:**
```ts
   * it, when it would have been a name token had it not been first: it starts
   * with a capital letter or mixes letters and digits. Absent otherwise,
   * for example when the sentence opens with a lowercase word, a number or a date.
   */
  initialWord?: string;
```

**with:**
```ts
   * it, when it would have been a name token had it not been first: it starts
   * with a capital letter or mixes letters and digits. Absent otherwise,
   * for example when the sentence opens with a number or a date. A sentence that opens with a lowercase
   * word has none either, which is why G2 requires every sentence to start with a capital letter or a digit.
   */
  initialWord?: string;
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
```

**with:**
```ts
      id: 'G2',
      name: 'Structure',
      text: `The opening paragraph is ${openingWords.min} to ${openingWords.max} words, there are ${takeaways.min} to ${takeaways.max} key takeaways, the body (the opening, the takeaways, the sections and the limitations, not the title, the description or the headings) is ${bodyWords.min} to ${bodyWords.max} words in at least 2 sections, every section has a heading of at most ${headingMax} characters that is not a question, every sentence starts with a capital letter or a digit (an opening quotation mark or bracket may come first), and every claim the piece cites that rests on a company's own datasheet, press release, briefing or demo, or that was only demonstrated or is only planned, is covered by a sentence under "What we couldn't verify".`,
    },
    {
```

Run: `npm test --workspace @robywire/gate -- test/g4-values.test.ts && npm test --workspace @robywire/site -- test/method.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 9: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

The fixtures did not change: no sentence of the golden piece starts in lowercase.

Run: `git status --short`
Expected: PASS — lists ` M evals/scoreboard/seeded.json` among the changed files.

- [ ] **Step 10: Commit**

```bash
git add evals gate site
git commit -m "feat(gate): every sentence starts with a capital letter or a digit, so a lowercase opening cannot hide a name from the first-word rule (G2)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 85: The title and the description are the ledger's

**Files:**
- Create: `gate/src/render/head.ts` (`renderHead`, the one function that says what the title and the description of a piece are)
- Modify: `gate/src/render/index.ts` (export it), `gate/src/render/render.ts` (the frontmatter and the title of the ledger come from it)
- Modify: `site/src/lib/match-pieces.ts` (the build refuses a title or a description that is not the ledger's)
- Modify: `README.md` (what the site refuses to build)
- Test: `gate/test/render-head.test.ts` (new), `gate/test/render.test.ts`, `site/test/match-pieces.test.ts`

Task 79 made the body of an article a function of its ledger: `renderBody` writes it, and the build stops when a file says anything else. The closure review found that two other things a reader sees were left out. The frontmatter `description` is the dek under the headline of the article and of the home page, it is the text of the search result and of the feed, and nothing compared it with the ledger's description sentence, so a hand edit of `description:` passed the build. And `ledger.title` was compared with the title of the file but not with the ledger's own title sentence, so the ledger could hold a title field that disagrees with its sentence. The claim of Task 79, that the article and its ledger cannot say different things, was too strong.

This task closes both in the way Task 79 closed the body:

1. `renderHead(ledger)` gives the `title` and the `description` of the frontmatter from the ledger's title sentence and description sentence, with the spaces around each taken off (the frontmatter schema trims them when it reads the file, so this is the text the page shows). It needs only the sentences, and it throws when the ledger has no title sentence or no description sentence, or has two of either.
2. `renderDraft` writes the frontmatter, and the `title` of the ledger, with `renderHead` and with nothing else. It used to write the title and the description untrimmed, so a title with a space at its end would have made the build stop for no good reason.
3. `matchPieces` calls `renderHead` for every piece and stops the build, naming the piece and the field, when the title or the description of the file is not what the ledger gives, or when the `title` of the ledger is not its own title sentence. The older check that compared the title of the ledger with the title of the file is replaced by these: if both agree with the sentence, they agree with each other.
4. The golden piece and all five fixture pieces pass without a change.

- [ ] **Step 1: Write the failing tests for `renderHead` and for the renderer**

`renderHead` has a test file of its own. The renderer's tests say that the frontmatter and the title of the ledger are what `renderHead` gives, and that a title and a description with spaces around them are written without them.

**Create `gate/test/render-head.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import * as api from '../src';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import { runGate } from '../src/gate';
import type { GateInput } from '../src/gate';
import { renderDraft, renderHead } from '../src/render';
import type { LedgerEntry } from '../src/schemas';
import { mutate } from './helpers';

// renderHead is the one place that says what the title and the description of a
// piece's frontmatter are: the title sentence and the description sentence of
// its ledger, with the spaces around them taken off. renderDraft writes the
// frontmatter with it and the site's build compares the file with it.

const ledgerOf = (input: GateInput): LedgerEntry =>
  renderDraft(input.draft, input.claims, { runId: 'fixture-run-1', gate: runGate(input, defaultContext()) }).ledger;

describe('renderHead', () => {
  const golden = cloneGolden();
  const ledger = ledgerOf(golden);

  it('gives the title sentence and the description sentence of the ledger', () => {
    expect(renderHead(ledger)).toEqual({
      title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
      description: 'Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg, to a second Brindle Logistics plant at Tarnmoor.',
    });
    expect(renderHead(ledger)).toEqual({ title: golden.draft.title.text, description: golden.draft.description.text });
  });

  it('takes the spaces around each of them off, as the frontmatter schema does, and changes nothing else', () => {
    const spaced = structuredClone(ledger);
    for (const item of spaced.sentences) {
      if (item.section === 'title') item.text = `  ${item.text}\n`;
      if (item.section === 'description') item.text = `\t${item.text} `;
    }
    expect(renderHead(spaced)).toEqual(renderHead(ledger));
    const inner = structuredClone(ledger);
    inner.sentences[0]!.text = 'A  title   with  inner spaces';
    expect(renderHead(inner).title).toBe('A  title   with  inner spaces');
  });

  it('reads the sentences and not the title field of the ledger, which is what it is compared with', () => {
    const edited = { ...structuredClone(ledger), title: 'Another title' };
    expect(renderHead(edited)).toEqual(renderHead(ledger));
  });

  it('needs only the sentences of the ledger', () => {
    expect(renderHead({ sentences: ledger.sentences })).toEqual(renderHead(ledger));
  });

  it('finds the sentences wherever they stand in the list', () => {
    const reversed = { sentences: [...ledger.sentences].reverse() };
    expect(renderHead(reversed)).toEqual(renderHead(ledger));
  });

  it('does not change the ledger it is given', () => {
    const copy = structuredClone(ledger);
    renderHead(copy);
    expect(copy).toEqual(ledger);
  });

  it.each([
    ['title', 'no title sentence'],
    ['description', 'no description sentence'],
  ])('throws, saying so, when the ledger has no %s sentence', (section, message) => {
    const without = { sentences: ledger.sentences.filter((item) => item.section !== section) };
    expect(() => renderHead(without)).toThrow(`renderHead: the ledger has ${message}`);
  });

  it.each([
    ['title', 'title'],
    ['description', 'description'],
  ])('throws, saying so, when the ledger has two %s sentences, because it could not tell which is the field', (section, name) => {
    const twice = { sentences: [...ledger.sentences, ledger.sentences.find((item) => item.section === section)!] };
    expect(() => renderHead(twice)).toThrow(`renderHead: the ledger has 2 ${name} sentences, not 1`);
  });

  it('is part of the package index', () => {
    expect(api.renderHead).toBe(renderHead);
  });

  it('gives a draft that the schema would trim the same words as the renderer writes', () => {
    const padded = mutate(cloneGolden(), (g) => {
      g.draft.title.text = '  A title ';
      g.draft.description.text = ' A description. ';
    });
    expect(renderHead(ledgerOf(padded))).toEqual({ title: 'A title', description: 'A description.' });
  });
});
```

**In `gate/test/render.test.ts`, replace:**
```ts
import { LedgerEntry } from '../src/schemas';
import type { Draft } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderBody, renderDraft } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**with:**
```ts
import { LedgerEntry } from '../src/schemas';
import type { Draft } from '../src/schemas';
import { NewsFrontmatter, escapeMdx, renderBody, renderDraft, renderHead } from '../src/render';
import type { RenderMeta } from '../src/render';
import { allSentences } from '../src/sentences';
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('accepts an update on the day of publication, and refuses one that is not a real date or comes before it', () => {
    expect(splitMdx(render(golden, { updatedAt: '2026-10-04' }).mdx).frontmatter).toContain('updatedAt: "2026-10-04"');
```

**with:**
```ts
  });

  it('writes the title and the description that renderHead gives from the ledger, and the same title in the ledger', () => {
    const head = renderHead(ledger);
    expect(splitMdx(mdx).frontmatter.split('\n').slice(0, 2)).toEqual([`title: ${JSON.stringify(head.title)}`, `description: ${JSON.stringify(head.description)}`]);
    expect(ledger.title).toBe(head.title);
  });

  it('accepts an update on the day of publication, and refuses one that is not a real date or comes before it', () => {
    expect(splitMdx(render(golden, { updatedAt: '2026-10-04' }).mdx).frontmatter).toContain('updatedAt: "2026-10-04"');
```

**In `gate/test/render.test.ts`, replace:**
```ts
  });

  it('refuses a category that is not a plain slug', () => {
    const input = mutate(cloneGolden(), (g) => {
```

**with:**
```ts
  });

  it('writes a title and a description without the spaces around them, in the frontmatter and in the title of the ledger, and keeps the sentences of the ledger as written', () => {
    const input = mutate(cloneGolden(), (g) => {
      g.draft.title.text = '  A title ';
      g.draft.description.text = ' A description. ';
    });
    const { mdx, ledger } = render(input);
    expect(splitMdx(mdx).frontmatter.split('\n').slice(0, 2)).toEqual(['title: "A title"', 'description: "A description."']);
    expect(ledger.title).toBe('A title');
    expect(ledger.sentences.slice(0, 2).map((item) => item.text)).toEqual(['  A title ', ' A description. ']);
  });

  it('refuses a category that is not a plain slug', () => {
    const input = mutate(cloneGolden(), (g) => {
```

Run: `npm test --workspace @robywire/gate -- test/render-head.test.ts test/render.test.ts`
Expected: FAIL — `renderHead is not a function` and `writes a title and a description without the spaces around them`

- [ ] **Step 2: Write `renderHead`, and use it in the renderer**

**Create `gate/src/render/head.ts`:**
```ts
import type { LedgerEntry } from '../schemas';

/** The title and the description of a piece, as its frontmatter has them. */
export interface RenderedHead {
  title: string;
  description: string;
}

/** The text of the one sentence of `section`, or an error that names the section when there is none or more than one. */
function only(sentences: LedgerEntry['sentences'], section: 'title' | 'description'): string {
  const found = sentences.filter((item) => item.section === section);
  if (found.length === 0) throw new Error(`renderHead: the ledger has no ${section} sentence`);
  if (found.length > 1) throw new Error(`renderHead: the ledger has ${found.length} ${section} sentences, not 1`);
  return (found[0] as LedgerEntry['sentences'][number]).text;
}

/**
 * The title and the description of the frontmatter of a piece, written from its ledger alone: the text of the
 * ledger's title sentence and of its description sentence, with the spaces around each taken off, which is what
 * the frontmatter schema does to them when it reads the file. `renderDraft` writes the frontmatter (and the
 * title of the ledger) with this function and no other, and the site builds a piece only if its title and
 * description are exactly these, so that the page, the share card, the feed and the receipts cannot say a
 * different headline from the one the gate cleared. A ledger with no title sentence or no description
 * sentence, or with two of either, is an error.
 */
export function renderHead(ledger: Pick<LedgerEntry, 'sentences'>): RenderedHead {
  return {
    title: only(ledger.sentences, 'title').trim(),
    description: only(ledger.sentences, 'description').trim(),
  };
}
```

**In `gate/src/render/index.ts`, replace:**
```ts
export * from './escape';
export * from './frontmatter';
export * from './render';
```

**with:**
```ts
export * from './escape';
export * from './frontmatter';
export * from './head';
export * from './render';
```

The sentences of the ledger are now built before the frontmatter, because the frontmatter is written from them.

**In `gate/src/render/render.ts`, replace:**
```ts
import type { LocatedSentence } from '../sentences';
import { renderBody } from './body';

/** What the renderer needs besides the draft and the claims. */
```

**with:**
```ts
import type { LocatedSentence } from '../sentences';
import { renderBody } from './body';
import { renderHead } from './head';

/** What the renderer needs besides the draft and the claims. */
```

**In `gate/src/render/render.ts`, replace:**
```ts
 * the body is written from it, not from the draft. A section with no sentence
 * has nothing in the ledger, so the page has no heading for it, and neighbouring
 * sections with the same heading come out as one.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
```

**with:**
```ts
 * the body is written from it, not from the draft. A section with no sentence
 * has nothing in the ledger, so the page has no heading for it, and neighbouring
 * sections with the same heading come out as one. The title and the description
 * of the frontmatter, and the title of the ledger, are `renderHead` of the
 * ledger's sentences: the title and description sentences with the spaces around
 * them taken off.
 */
export function renderDraft(draft: Draft, claims: readonly Claim[], meta: RenderMeta): RenderedPiece {
```

**In `gate/src/render/render.ts`, replace:**
```ts
    throw new Error(`renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish`);
  }
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(draft.title.text)}`,
    `description: ${JSON.stringify(draft.description.text)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    ...(updatedAt === undefined ? [] : [`updatedAt: ${JSON.stringify(updatedAt)}`]),
```

**with:**
```ts
    throw new Error(`renderDraft: release "owner" is for a piece the gate did not clear, but the route is publish`);
  }
  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = {
      index: item.index,
      section: item.section,
      paragraph: item.paragraph,
      kind: written.kind,
      text: written.text,
      claimIds: [...written.claimIds],
    };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
    return entry;
  });

  // The title and the description of the frontmatter, and the title of the ledger, come from the sentences of the ledger.
  const head = renderHead({ sentences });
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(head.title)}`,
    `description: ${JSON.stringify(head.description)}`,
    `publishedAt: ${JSON.stringify(draft.publishedAt)}`,
    ...(updatedAt === undefined ? [] : [`updatedAt: ${JSON.stringify(updatedAt)}`]),
```

**In `gate/src/render/render.ts`, replace:**
```ts
  }

  const sentences: LedgerSentence[] = located.map((item) => {
    const { sentence: written } = item;
    const entry: LedgerSentence = {
      index: item.index,
      section: item.section,
      paragraph: item.paragraph,
      kind: written.kind,
      text: written.text,
      claimIds: [...written.claimIds],
    };
    if (item.heading !== undefined) entry.heading = item.heading;
    if (written.kind === 'fact' && written.attributed === true) entry.attributed = true;
    return entry;
  });

  const ledger: LedgerEntry = {
    schemaVersion: 1,
```

**with:**
```ts
  }

  const ledger: LedgerEntry = {
    schemaVersion: 1,
```

**In `gate/src/render/render.ts`, replace:**
```ts
    runId: meta.runId,
    publishedAt: draft.publishedAt,
    title: draft.title.text,
    categories: [...draft.categories],
    claims: structuredClone(cited),
```

**with:**
```ts
    runId: meta.runId,
    publishedAt: draft.publishedAt,
    title: head.title,
    categories: [...draft.categories],
    claims: structuredClone(cited),
```

Run: `npm test --workspace @robywire/gate`
Expected: PASS — `Test Files  35 passed (35)`.

- [ ] **Step 3: Write the failing tests for the build**

The helper that makes a piece and its ledger now gives the ledger a title sentence and a description sentence that say what the frontmatter says. The old test of the title of the ledger loses its title line, because the new tests say it better. The new block covers a description and a title edited by hand, a ledger edited and a file not, a title field that is not its sentence, sentences with spaces around them, a ledger with no or two title sentences, the order of the messages, and the five fixture pieces as they are committed.

**In `site/test/match-pieces.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry, renderBody } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { firstDifference, matchPieces } from '../src/lib/match-pieces';
```

**with:**
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DeskState as DeskStateSchema, LedgerEntry, NewsFrontmatter as NewsFrontmatterSchema, renderBody } from '@robywire/gate';
import type { DeskState, NewsFrontmatter } from '@robywire/gate';
import { firstDifference, matchPieces } from '../src/lib/match-pieces';
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
/** A news entry and a ledger entry for one slug, shaped like Astro's collection entries. */
function pair(slug: string, publishedAt: string, change: Partial<LedgerEntry> = {}) {
  const ledger: LedgerEntry = { ...base, slug, publishedAt, title: `Title of ${slug}`, categories: ['humanoids'], ...change };
  const data: NewsFrontmatter = {
    title: `Title of ${slug}`,
```

**with:**
```ts
/** A news entry and a ledger entry for one slug, shaped like Astro's collection entries. */
function pair(slug: string, publishedAt: string, change: Partial<LedgerEntry> = {}) {
  // The title sentence and the description sentence of the ledger say what the piece's frontmatter says.
  const sentences = base.sentences.map((item) =>
    item.section === 'title' ? { ...item, text: `Title of ${slug}` } : item.section === 'description' ? { ...item, text: 'A description.' } : item,
  );
  const ledger: LedgerEntry = { ...base, slug, publishedAt, title: `Title of ${slug}`, categories: ['humanoids'], sentences, ...change };
  const data: NewsFrontmatter = {
    title: `Title of ${slug}`,
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
  });

  it('names a ledger whose title, date or categories differ from the piece', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { title: 'Another title' }))).toThrow('the title in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { publishedAt: '2026-10-02' }))).toThrow('the date in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { categories: ['humanoids', 'funding'] }))).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
```

**with:**
```ts
  });

  it('names a ledger whose date or categories differ from the piece', () => {
    expect(() => matched(pair('a-piece', '2026-10-03', { publishedAt: '2026-10-02' }))).toThrow('the date in the ledger entry "a-piece" differs from the piece');
    expect(() => matched(pair('a-piece', '2026-10-03', { categories: ['humanoids', 'funding'] }))).toThrow('the categories in the ledger entry "a-piece" differ from the piece');
```

**In `site/test/match-pieces.test.ts`, replace:**
```ts
});

describe('matchPieces: the body of the piece and its ledger', () => {
  const one = (body: string | undefined) => {
```

**with:**
```ts
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
```

Run: `npm test --workspace @robywire/site -- test/match-pieces.test.ts`
Expected: FAIL — `stops the build when the description of the piece was edited by hand, naming the piece and the field` and `names the piece when its ledger has no title sentence or no description sentence, or two`

- [ ] **Step 4: Make the build refuse them**

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
import { renderBody } from '@robywire/gate';
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';
```

**with:**
```ts
import { renderBody, renderHead } from '@robywire/gate';
import type { DeskState, LedgerEntry, NewsFrontmatter } from '@robywire/gate';
import { latestCorrectionDay } from './desk-state';
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
}

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
```

**with:**
```ts
}

/**
 * What is wrong with the title or the description of a piece or of its ledger, one problem for each field, or an
 * empty list when the title and the description of the piece and the title of the ledger are the title sentence and the
 * description sentence of the ledger (`renderHead`). A ledger that has no such sentence, or has two, is a problem
 * of its own, named by the piece.
 */
function headProblems(id: string, piece: NewsFrontmatter, ledger: LedgerEntry): string[] {
  let head: ReturnType<typeof renderHead>;
  try {
    head = renderHead(ledger);
  } catch (error) {
    return [`the ledger entry "${id}" cannot give a title and a description: ${error instanceof Error ? error.message : String(error)}`];
  }
  const shown = (text: string): string => JSON.stringify(text);
  const problems: string[] = [];
  if (piece.title !== head.title) {
    problems.push(`the title of the piece "${id}" is ${shown(piece.title)}, but the title sentence of its ledger is ${shown(head.title)}`);
  }
  if (piece.description !== head.description) {
    problems.push(`the description of the piece "${id}" is ${shown(piece.description)}, but the description sentence of its ledger is ${shown(head.description)}`);
  }
  if (ledger.title !== head.title) {
    problems.push(`the ledger entry "${id}" has the title ${shown(ledger.title)}, but its title sentence is ${shown(head.title)}`);
  }
  return problems;
}

/**
 * Join pieces with their ledger entries and sort them newest first. Pieces of
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, title, date or categories disagree with its piece, and a piece whose
 * `updatedAt` does not agree with the corrections recorded for it (a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
```

**with:**
```ts
 * the sort is stable. Throws one error that lists every problem found: a piece
 * with no ledger entry, a ledger entry with no piece, a ledger entry whose
 * slug, date or categories disagree with its piece, a piece whose title or
 * description is not the title sentence or the description sentence of its
 * ledger, a ledger whose title is not its own title sentence, a piece whose
 * `updatedAt` does not agree with the corrections recorded for it (a piece with
 * a correction or retraction needs `updatedAt` equal to the day of the latest
```

**In `site/src/lib/match-pieces.ts`, replace:**
```ts
    }
    if (ledger.data.slug !== piece.id) problems.push(`the ledger entry "${piece.id}" says its slug is "${ledger.data.slug}"`);
    if (ledger.data.title !== piece.data.title) problems.push(`the title in the ledger entry "${piece.id}" differs from the piece`);
    if (ledger.data.publishedAt !== piece.data.publishedAt) problems.push(`the date in the ledger entry "${piece.id}" differs from the piece`);
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });

    const bodyIssue = bodyProblem(piece.id, piece.body, ledger.data);
    if (bodyIssue !== undefined) problems.push(bodyIssue);
```

**with:**
```ts
    }
    if (ledger.data.slug !== piece.id) problems.push(`the ledger entry "${piece.id}" says its slug is "${ledger.data.slug}"`);
    if (ledger.data.publishedAt !== piece.data.publishedAt) problems.push(`the date in the ledger entry "${piece.id}" differs from the piece`);
    if (!sameList(ledger.data.categories, piece.data.categories)) problems.push(`the categories in the ledger entry "${piece.id}" differ from the piece`);
    matched.push({ slug: piece.id, news: piece, ledger });

    problems.push(...headProblems(piece.id, piece.data, ledger.data));

    const bodyIssue = bodyProblem(piece.id, piece.body, ledger.data);
    if (bodyIssue !== undefined) problems.push(bodyIssue);
```

Run: `npm test --workspace @robywire/site -- test/match-pieces.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

The renderer writes the same files as before for every fixture, so `fixtures:check` needed no regeneration.

- [ ] **Step 6: Edit a description by hand and watch the build refuse it**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

Change the number in the description of the first piece, in its MDX file, as someone fixing a typo might.

Run: `sed -i.bak 's/has begun shipping the FX-1 arm, rated for 12 kg,/has begun shipping the FX-1 arm, rated for 14 kg,/' site/src/content-fixtures/news/fixture-robotics-ships-fx-1-to-second-plant.mdx && rm site/src/content-fixtures/news/fixture-robotics-ships-fx-1-to-second-plant.mdx.bak`

Run: `npm run build:fixtures`
Expected: FAIL — `the description of the piece "fixture-robotics-ships-fx-1-to-second-plant" is "Fixture Robotics has begun shipping the FX-1 arm, rated for 14 kg` and `but the description sentence of its ledger is "Fixture Robotics has begun shipping the FX-1 arm, rated for 12 kg`

Write the fixtures again, from the golden piece, and build.

Run: `npm run fixtures:generate --workspace @robywire/site`

Run: `git status --short -- site/src/content-fixtures`
Expected: PASS — prints nothing.

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

- [ ] **Step 7: Update the README**

**In `README.md`, replace:**
```markdown
A piece is two files: the MDX that readers see and the ledger JSON behind its receipts. `site/src/lib/match-pieces.ts` joins them and stops the build, with a message that names the piece, when they do not belong together:

- the ledger has no piece, or the piece has no ledger, or their slug, title, date or categories differ;
- the body of the MDX is not exactly what `renderBody` (in `gate/src/render/body.ts`) writes from the ledger, so a hand edit of the article, or of the ledger, is caught on the first build;
- a correction or retraction is recorded in the desk state for the piece and its `updatedAt` is not the day of the latest one, or it has an `updatedAt` and nothing is recorded.
```

**with:**
```markdown
A piece is two files: the MDX that readers see and the ledger JSON behind its receipts. `site/src/lib/match-pieces.ts` joins them and stops the build, with a message that names the piece, when they do not belong together:

- the ledger has no piece, or the piece has no ledger, or their slug, date or categories differ;
- the `title` or the `description` of the MDX is not what `renderHead` (in `gate/src/render/head.ts`) gives from the title sentence and the description sentence of the ledger, or the `title` of the ledger is not its own title sentence;
- the body of the MDX is not exactly what `renderBody` (in `gate/src/render/body.ts`) writes from the ledger, so a hand edit of the article, or of the ledger, is caught on the first build;
- a correction or retraction is recorded in the desk state for the piece and its `updatedAt` is not the day of the latest one, or it has an `updatedAt` and nothing is recorded.
```

- [ ] **Step 8: Commit**

```bash
git add README.md gate site
git commit -m "feat: the title and the description of a piece are the title and description sentences of its ledger, from one function, and the build refuses a piece that differs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 86: The fact card says where each figure comes from

**Files:**
- Modify: `site/src/lib/card.ts` (`BASIS_WORDS`, tier-1 figures only, the basis drawn under each label and named in the label of the card)
- Test: `site/test/card.test.ts`, `site/test/card-png.test.ts`, `site/test/contrast.test.ts`

The fact card is the headline picture of an article: it is drawn into every article page and is the share image. Task 81 put it on the page, and the closure review found that its figures were chosen without regard to what they rest on. `cardFigures` took the first three claims of type `number` in the order the article cites them, whatever their tier, basis or status. The first piece already shows a list price from a press release as a headline figure with nothing to say so, and a figure that another outlet reported, which the article itself marks "Unconfirmed.", would have been drawn just as large.

The contract is now:

1. Only a claim from a tier-1 source can be drawn on the card. A figure that rests on another outlet's reporting (tier 2) is never drawn, wherever the article cites it. A piece with fewer than three such claims draws fewer figures, and a piece with none draws the card without figures: the wordmark, the title and the counts, as a well-formed picture.
2. Each figure carries the basis of its claim in plain words, in small type under its label: datasheet, press release, briefing, demonstration, filing, paper, standard, measured. One exported list, `BASIS_WORDS`, holds the words, and the card and its tests both use it.
3. The label of the card for assistive technology, which is the `aria-label` of the figure on the article page, says the same, after each figure and in brackets: `funding round USD 450 million (filing)`.
4. The colours stay the tokens (the new text is the quiet colour, like the label above it), so audit checks A12 and A17 and the contrast test, in both colour schemes, still apply. The figures move up a little to make room for the new line, so the card keeps its margins at 1200 by 630.

- [ ] **Step 1: Write the failing tests**

The tests cover the list of words (every basis has one, in the words the review asked for), the choice of figures (tier 2 is never taken, even when cited first, and the count falls with the tier-1 claims), the basis drawn under each label in the file and the inline card, a layout check that every text of the card stays inside its frame for the golden piece, for the piece that rests on another outlet, for the longest titles, labels and figures, and for a card with no figure, the label of the card, the share image (the PNG has ink in the band where the basis is drawn, and none there when every number comes from another outlet) and the contrast of the new text in both schemes.

**In `site/test/card.test.ts`, replace:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, INLINE_CARD_COLOURS, cardFigures, cardLabel, escapeXml, renderCardSvg, renderInlineCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASES, LedgerEntry } from '@robywire/gate';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { BASIS_WORDS, CARD_COLOURS, CARD_HEIGHT, CARD_WIDTH, INLINE_CARD_COLOURS, cardFigures, cardLabel, escapeXml, renderCardSvg, renderInlineCardSvg, wrapText } from '../src/lib/card';

const ELLIPSIS = String.fromCharCode(0x2026);
```

**In `site/test/card.test.ts`, replace:**
```ts
const read = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const GOLDEN = LedgerEntry.parse(JSON.parse(read('ledger/fixture-robotics-ships-fx-1-to-second-plant.json')));

const unescape = (text: string): string => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
```

**with:**
```ts
const read = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const GOLDEN = LedgerEntry.parse(JSON.parse(read('ledger/fixture-robotics-ships-fx-1-to-second-plant.json')));
// The fifth piece rests on a claim from another outlet (c-19, a tier-2 source).
const TIER2_PIECE = LedgerEntry.parse(JSON.parse(read('ledger/fixture-robotics-ships-fx-5-to-second-plant.json')));

const unescape = (text: string): string => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
```

**In `site/test/card.test.ts`, replace:**
```ts
});

describe('cardFigures', () => {
  it('takes the value and label of the first three number claims, in the order the article cites them', () => {
    expect(cardFigures(GOLDEN)).toEqual([
      { value: 'USD 450 million', label: 'funding round' },
      { value: '18 per cent', label: 'cycle-time cut' },
      { value: '$38,000', label: 'list price' },
    ]);
  });

  it('ignores claims of other types, even when they have numbers', () => {
    const figures = cardFigures(GOLDEN);
```

**with:**
```ts
});

describe('BASIS_WORDS', () => {
  it('has a plain word or two for each basis a claim can have, and no other key', () => {
    expect(Object.keys(BASIS_WORDS).sort()).toEqual([...BASES].sort());
  });

  it('says them as the card shows them: datasheet, press release, briefing, demonstration, filing, paper, standard, measured', () => {
    expect(BASIS_WORDS).toEqual({
      datasheet: 'datasheet',
      'press-release': 'press release',
      briefing: 'briefing',
      demo: 'demonstration',
      filing: 'filing',
      paper: 'paper',
      standard: 'standard',
      measured: 'measured',
    });
  });

  it('gives each basis its own words, in lowercase, without a hyphen', () => {
    const words = Object.values(BASIS_WORDS);
    expect(new Set(words).size).toBe(words.length);
    for (const word of words) expect(word).toMatch(/^[a-z]+(?: [a-z]+)?$/);
  });
});

describe('cardFigures', () => {
  it('takes the value, the label and the basis of the first three number claims, in the order the article cites them', () => {
    expect(cardFigures(GOLDEN)).toEqual([
      { value: 'USD 450 million', label: 'funding round', basis: 'filing' },
      { value: '18 per cent', label: 'cycle-time cut', basis: 'measured' },
      { value: '$38,000', label: 'list price', basis: 'press release' },
    ]);
  });

  it('says where each figure comes from in plain words: the basis of its claim, put through the one list of words', () => {
    const basisOf = new Map(GOLDEN.claims.map((claim) => [claim.label, claim.basis]));
    for (const figure of cardFigures(GOLDEN)) expect(figure.basis).toBe(BASIS_WORDS[basisOf.get(figure.label)!]);
  });

  it('never takes a figure from a claim of another outlet (tier 2), even when the article cites it first', () => {
    const entry = entryWith((copy) => {
      copy.claims.find((claim) => claim.id === 'c-17')!.source.tier = 2;
    });
    expect(entry.order[0]).toBe('c-1');
    expect(cardFigures(entry).map((figure) => figure.label)).toEqual(['cycle-time cut', 'list price', 'measured pick rate']);
    const first = structuredClone(TIER2_PIECE);
    first.order = ['c-19', ...first.order.filter((id) => id !== 'c-19')];
    expect(first.claims.find((claim) => claim.id === 'c-19')!.source.tier).toBe(2);
    expect(cardFigures(first).map((figure) => figure.label)).not.toContain('investor count');
  });

  it('draws fewer than three when fewer claims are tier 1, and none when none is', () => {
    const one = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.source.tier = 2;
    });
    expect(cardFigures(one)).toEqual([{ value: 'USD 450 million', label: 'funding round', basis: 'filing' }]);
    expect(cardFigures(entryWith((copy) => copy.claims.forEach((claim) => (claim.source.tier = 2))))).toEqual([]);
  });

  it('ignores claims of other types, even when they have numbers', () => {
    const figures = cardFigures(GOLDEN);
```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('shows fewer figures when there are fewer number claims', () => {
    const entry = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardFigures(entry)).toEqual([{ value: 'USD 450 million', label: 'funding round' }]);
  });

```

**with:**
```ts
  });

  it('skips an id of the order that no claim has, instead of failing', () => {
    const entry = entryWith((copy) => {
      copy.order = ['c-404', ...copy.order];
    });
    expect(cardFigures(entry)).toEqual(cardFigures(GOLDEN));
  });

  it('shows fewer figures when there are fewer number claims', () => {
    const entry = entryWith((copy) => {
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardFigures(entry)).toEqual([{ value: 'USD 450 million', label: 'funding round', basis: 'filing' }]);
  });

```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('sets the figures large, in weight 400 and in the link colour', () => {
    const figures = [...svg.matchAll(/<text[^>]*data-role="figure"[^>]*>/g)].map((match) => match[0]);
```

**with:**
```ts
  });

  it('writes the basis of each figure under its label, in small type and the quiet colour', () => {
    expect(textsWithRole(svg, 'figure-basis')).toEqual(['filing', 'measured', 'press release']);
    const tagsOf = (role: string) => [...svg.matchAll(new RegExp(`<text[^>]*data-role="${role}"[^>]*>`, 'g'))].map((match) => match[0]);
    const attribute = (tag: string, name: string) => /x="(\d+)" y="(\d+)" font-family="[^"]*" font-size="(\d+)"/.exec(tag)![name === 'x' ? 1 : name === 'y' ? 2 : 3]!;
    const [labels, bases] = [tagsOf('figure-label'), tagsOf('figure-basis')];
    expect(bases).toHaveLength(3);
    bases.forEach((tag, at) => {
      expect(attribute(tag, 'x')).toBe(attribute(labels[at]!, 'x'));
      expect(Number(attribute(tag, 'y'))).toBeGreaterThan(Number(attribute(labels[at]!, 'y')));
      expect(Number(attribute(tag, 'size'))).toBeLessThan(Number(attribute(labels[at]!, 'size')));
      expect(tag).toContain(`fill="${CARD_COLOURS.quiet}"`);
    });
  });

  it('draws the basis above the rule that closes the figures, so it never runs into the counts', () => {
    const rule = Number(/<line x1="\d+" y1="(\d+)"/.exec(svg)![1]);
    for (const tag of svg.match(/<text[^>]*data-role="figure-basis"[^>]*>/g)!) {
      const [, y, size] = /y="(\d+)" font-family="[^"]*" font-size="(\d+)"/.exec(tag)!;
      expect(Number(y) + Number(size) * 0.3).toBeLessThan(rule);
    }
  });

  it('sets the figures large, in weight 400 and in the link colour', () => {
    const figures = [...svg.matchAll(/<text[^>]*data-role="figure"[^>]*>/g)].map((match) => match[0]);
```

**In `site/test/card.test.ts`, replace:**
```ts
    for (const tag of figures) {
      expect(tag).toContain('font-weight="400"');
      expect(tag).toContain(`fill="${CARD_COLOURS.link}"`);
      expect(Number(/font-size="(\d+)"/.exec(tag)?.[1])).toBeGreaterThanOrEqual(44);
```

**with:**
```ts
    for (const tag of figures) {
      expect(tag).toContain('font-weight="400"');
      expect(tag).toContain('letter-spacing="-1"');
      expect(tag).toContain(`fill="${CARD_COLOURS.link}"`);
      expect(Number(/font-size="(\d+)"/.exec(tag)?.[1])).toBeGreaterThanOrEqual(44);
```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('draws a card with no figures, no claims and no sources without failing', () => {
    const bare = renderCardSvg(entryWith((copy) => Object.assign(copy, { claims: [], order: [], sources: [] })));
```

**with:**
```ts
  });

  it('draws no figure from another outlet, and keeps the card well formed with none at all', () => {
    const none = renderCardSvg(entryWith((copy) => copy.claims.forEach((claim) => (claim.source.tier = 2))));
    expect(xmlProblem(none)).toBeUndefined();
    expect(none).not.toMatch(/data-role="figure/);
    expect(textsWithRole(none, 'title').join(' ')).toBe(GOLDEN.title);
    expect(textsWithRole(none, 'counts')).toEqual(['28 claims from 5 sources']);
    expect(textsWithRole(none, 'host')).toEqual(['fixture-robotics.example']);
  });

  it('draws a card with no figures, no claims and no sources without failing', () => {
    const bare = renderCardSvg(entryWith((copy) => Object.assign(copy, { claims: [], order: [], sources: [] })));
```

**In `site/test/card.test.ts`, replace:**
```ts
});

describe('cardLabel', () => {
  it('names the card, the title and the key figures, so that a reader who cannot see the picture gets them', () => {
    expect(cardLabel(GOLDEN)).toBe(
      `Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million, cycle-time cut 18 per cent, list price $38,000)`,
    );
  });

  it('says the same figures as the card shows, in the same order', () => {
    const label = cardLabel(GOLDEN);
```

**with:**
```ts
});

/**
 * Where each text of a card ends up, as an estimate that errs on the wide side: a character is 0.6 of the type
 * size wide, plus the letter spacing. A text is outside the card when it starts or ends beyond the hairline
 * frame, which is 24 pixels in, or has its top above the frame or its baseline below it.
 */
function textsOutside(svg: string): string[] {
  const found: string[] = [];
  for (const match of svg.matchAll(/<text data-role="([^"]*)" x="(\d+)" y="(\d+)" font-family="[^"]*" font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)) {
    const [whole, role, x, y, size, content] = [match[0], match[1]!, Number(match[2]), Number(match[3]), Number(match[4]), unescape(match[5]!)];
    const spacing = Number(/letter-spacing="(-?\d+)"/.exec(whole)?.[1] ?? 0);
    const width = content.length * (size * 0.6 + spacing);
    const [from, to] = whole.includes('text-anchor="end"') ? [x - width, x] : [x, x + width];
    if (from < 24 || to > CARD_WIDTH - 24 || y - size < 24 || y > CARD_HEIGHT - 24) found.push(`${role} "${content}" runs from ${Math.round(from)} to ${Math.round(to)}, baseline ${y}`);
  }
  return found;
}

describe('the layout of the card', () => {
  const widest = entryWith((copy) => {
    copy.title = 'word '.repeat(60).trim();
    for (const claim of copy.claims) {
      if (claim.type !== 'number') continue;
      claim.values = [{ kind: 'number', raw: 'about 4,500,000,000 US dollars', normalised: '4500000000' }];
      claim.label = 'a label that goes on and on and on and on';
    }
  });
  const noFigures = entryWith((copy) => copy.claims.forEach((claim) => (claim.source.tier = 2)));
  const cases = [
    ['the golden piece', GOLDEN],
    ['the piece that rests on another outlet', TIER2_PIECE],
    ['a piece with the longest titles, labels and figures', widest],
    ['a piece with no figure to draw', noFigures],
  ] as const;

  it.each(cases)('keeps every text of %s inside the box, in the file and in the page', (_name, entry) => {
    expect(textsOutside(renderCardSvg(entry))).toEqual([]);
    expect(textsOutside(renderInlineCardSvg(entry))).toEqual([]);
  });

  it('would notice a text that runs off the card', () => {
    const wide = renderCardSvg(GOLDEN).replace('>funding round<', `>${'funding round '.repeat(20)}<`);
    expect(textsOutside(wide).length).toBeGreaterThan(0);
  });

  it('draws the card without figures with the same frame, wordmark, title and counts as the card with them', () => {
    const roles = (svg: string) => [...svg.matchAll(/data-role="([^"]*)"/g)].map((match) => match[1]!);
    expect(roles(renderCardSvg(noFigures))).toEqual(['wordmark', 'title', 'title', 'counts', 'host']);
    expect(roles(renderCardSvg(GOLDEN))).toEqual(['wordmark', 'title', 'title', ...Array(3).fill(['figure', 'figure-label', 'figure-basis']).flat(), 'counts', 'host']);
  });
});

describe('cardLabel', () => {
  it('names the card, the title and the key figures with where each comes from, so that a reader who cannot see the picture gets them', () => {
    expect(cardLabel(GOLDEN)).toBe(
      `Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million (filing), cycle-time cut 18 per cent (measured), list price $38,000 (press release))`,
    );
  });

  it('says the basis in the words the card draws', () => {
    const label = cardLabel(GOLDEN);
    for (const basis of textsWithRole(renderCardSvg(GOLDEN), 'figure-basis')) expect(label).toContain(`(${basis})`);
  });

  it('does not name a figure from another outlet', () => {
    const entry = structuredClone(TIER2_PIECE);
    entry.order = ['c-19', ...entry.order.filter((id) => id !== 'c-19')];
    expect(cardLabel(entry)).not.toContain('investor count');
  });

  it('says the same figures as the card shows, in the same order', () => {
    const label = cardLabel(GOLDEN);
```

**In `site/test/card.test.ts`, replace:**
```ts
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardLabel(entry)).toBe(`Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million)`);
  });
});
```

**with:**
```ts
      for (const claim of copy.claims) if (claim.id !== 'c-17') claim.type = 'spec';
    });
    expect(cardLabel(entry)).toBe(`Fact card: ${GOLDEN.title} (key figures: funding round USD 450 million (filing))`);
  });
});
```

**In `site/test/card.test.ts`, replace:**
```ts
  });

  it('is the same every time', () => {
    expect(renderInlineCardSvg(structuredClone(GOLDEN))).toBe(inline);
```

**with:**
```ts
  });

  it('shows the same figures, labels and bases as the file that the share image is drawn from', () => {
    for (const entry of [GOLDEN, TIER2_PIECE, entryWith((copy) => copy.claims.forEach((claim) => (claim.source.tier = 2)))]) {
      for (const role of ['figure', 'figure-label', 'figure-basis']) {
        expect(textsWithRole(renderInlineCardSvg(entry), role)).toEqual(textsWithRole(renderCardSvg(entry), role));
      }
    }
    expect(textsWithRole(inline, 'figure-basis')).toEqual(['filing', 'measured', 'press release']);
  });

  it('is the same every time', () => {
    expect(renderInlineCardSvg(structuredClone(GOLDEN))).toBe(inline);
```

**In `site/test/card-png.test.ts`, replace:**
```ts
  });

  it('gives the same picture for the same card', async () => {
    const [first, second] = await Promise.all([cardPng(SVG), cardPng(SVG)]);
```

**with:**
```ts
  });

  it('shows the basis of the figures under their labels, and nothing there for a piece whose numbers all come from another outlet', async () => {
    // The band between the labels and the rule above the counts: 480 to 508 pixels from the top, 72 to 1128 from the left.
    const inkInBasisBand = async (entry: LedgerEntry): Promise<number> => {
      const { data, info } = await sharp(await cardPng(renderCardSvg(entry))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let ink = 0;
      for (let y = 480; y < 508; y++) {
        for (let x = 72; x < 1128; x++) {
          const at = (y * info.width + x) * info.channels;
          if (data[at] !== 255 || data[at + 1] !== 255 || data[at + 2] !== 255) ink++;
        }
      }
      return ink;
    };
    expect(await inkInBasisBand(GOLDEN)).toBeGreaterThan(500);
    const other = structuredClone(GOLDEN);
    for (const claim of other.claims) claim.source.tier = 2;
    expect(await inkInBasisBand(other)).toBe(0);
  });

  it('gives the same picture for the same card', async () => {
    const [first, second] = await Promise.all([cardPng(SVG), cardPng(SVG)]);
```

**In `site/test/contrast.test.ts`, replace:**
```ts
  it('is painted on the ground of the page, and every text on it is painted with a token', () => {
    expect(ground).toBe('bg');
    expect(texts.map(([role]) => role)).toEqual(['wordmark', 'title', 'figure', 'figure-label', 'counts', 'host']);
    for (const [role, token] of texts) expect(TEXT_TOKENS, role).toContain(token);
  });
```

**with:**
```ts
  it('is painted on the ground of the page, and every text on it is painted with a token', () => {
    expect(ground).toBe('bg');
    expect(texts.map(([role]) => role)).toEqual(['wordmark', 'title', 'figure', 'figure-label', 'figure-basis', 'counts', 'host']);
    for (const [role, token] of texts) expect(TEXT_TOKENS, role).toContain(token);
  });
```

Run: `npm test --workspace @robywire/site -- test/card.test.ts test/card-png.test.ts test/contrast.test.ts`
Expected: FAIL — `BASIS_WORDS`, `never takes a figure from a claim of another outlet (tier 2), even when the article cites it first`, `writes the basis of each figure under its label, in small type and the quiet colour`, `shows the basis of the figures under their labels` and `is painted on the ground of the page, and every text on it is painted with a token`

- [ ] **Step 2: Draw the basis, and only tier-1 figures**

**In `site/src/lib/card.ts`, replace:**
```ts
import type { LedgerEntry } from '@robywire/gate';
import { plural } from './format';

```

**with:**
```ts
import type { Basis, LedgerEntry } from '@robywire/gate';
import { plural } from './format';

```

**In `site/src/lib/card.ts`, replace:**
```ts
}

export interface CardFigure {
  value: string;
  label: string;
}

/**
 * Up to three figures for the card: the first three claims of type `number`, in the order the
 * article cites them. A figure is the claim's first number value, or its first value of any kind,
 * and a claim with no value is skipped.
 */
export function cardFigures(entry: LedgerEntry): CardFigure[] {
```

**with:**
```ts
}

/**
 * Where a claim's figure comes from, in plain words, for each basis a claim can have. The card draws
 * the words under the label of each figure, and the label of the card for assistive technology says them.
 */
export const BASIS_WORDS: Readonly<Record<Basis, string>> = {
  datasheet: 'datasheet',
  'press-release': 'press release',
  briefing: 'briefing',
  demo: 'demonstration',
  filing: 'filing',
  paper: 'paper',
  standard: 'standard',
  measured: 'measured',
};

export interface CardFigure {
  value: string;
  label: string;
  /** Where the figure comes from, in plain words (`BASIS_WORDS`). */
  basis: string;
}

/**
 * Up to three figures for the card: the first three claims of type `number` from a tier-1 source, in
 * the order the article cites them. A claim from another outlet (tier 2) is never drawn: the card is
 * the headline of the piece and has no room to say that a figure is only reported. A figure is the
 * claim's first number value, or its first value of any kind, and a claim with no value is skipped.
 * Each figure carries the basis of its claim in plain words. A piece with no such claim has no figures.
 */
export function cardFigures(entry: LedgerEntry): CardFigure[] {
```

**In `site/src/lib/card.ts`, replace:**
```ts
  for (const id of entry.order) {
    const claim = byId.get(id);
    if (claim === undefined || claim.type !== 'number') continue;
    const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
    if (value === undefined) continue;
    figures.push({ value: value.raw, label: claim.label });
    if (figures.length === 3) break;
  }
```

**with:**
```ts
  for (const id of entry.order) {
    const claim = byId.get(id);
    if (claim === undefined || claim.type !== 'number' || claim.source.tier !== 1) continue;
    const value = claim.values.find((item) => item.kind === 'number') ?? claim.values[0];
    if (value === undefined) continue;
    figures.push({ value: value.raw, label: claim.label, basis: BASIS_WORDS[claim.basis] });
    if (figures.length === 3) break;
  }
```

**In `site/src/lib/card.ts`, replace:**
```ts
    value: wrapText(figure.value, FIGURE_CHARS, 1)[0] ?? '',
    label: wrapText(figure.label, 26, 1)[0] ?? '',
  }));
  const size = figureSize(Math.max(0, ...figures.map((figure) => figure.value.length)));
  figures.forEach((figure, index) => {
    parts.push(text('figure', FIGURE_COLUMNS[index]!, 448, size, 400, link, figure.value, ' letter-spacing="-1"'));
    parts.push(text('figure-label', FIGURE_COLUMNS[index]!, 488, 22, 400, quiet, figure.label));
  });

```

**with:**
```ts
    value: wrapText(figure.value, FIGURE_CHARS, 1)[0] ?? '',
    label: wrapText(figure.label, 26, 1)[0] ?? '',
    basis: figure.basis,
  }));
  const size = figureSize(Math.max(0, ...figures.map((figure) => figure.value.length)));
  figures.forEach((figure, index) => {
    parts.push(text('figure', FIGURE_COLUMNS[index]!, 432, size, 400, link, figure.value, ' letter-spacing="-1"'));
    parts.push(text('figure-label', FIGURE_COLUMNS[index]!, 470, 22, 400, quiet, figure.label));
    parts.push(text('figure-basis', FIGURE_COLUMNS[index]!, 498, 20, 400, quiet, figure.basis));
  });

```

**In `site/src/lib/card.ts`, replace:**
```ts
}

/** What a reader who cannot see the card is told: that it is the fact card, the title, and the figures it shows. */
export function cardLabel(entry: LedgerEntry): string {
  const figures = cardFigures(entry).map((figure) => `${figure.label} ${figure.value}`);
  return figures.length === 0 ? `Fact card: ${entry.title}` : `Fact card: ${entry.title} (key figures: ${figures.join(', ')})`;
}
```

**with:**
```ts
}

/**
 * What a reader who cannot see the card is told: that it is the fact card, the title, and the figures it
 * shows, each with the label it has and where it comes from.
 */
export function cardLabel(entry: LedgerEntry): string {
  const figures = cardFigures(entry).map((figure) => `${figure.label} ${figure.value} (${figure.basis})`);
  return figures.length === 0 ? `Fact card: ${entry.title}` : `Fact card: ${entry.title} (key figures: ${figures.join(', ')})`;
}
```

Run: `npm test --workspace @robywire/site -- test/card.test.ts test/card-png.test.ts test/contrast.test.ts`
Expected: PASS — `Test Files  3 passed (3)`.

- [ ] **Step 3: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

No fixture file changed: the card is drawn at build time from the ledger, and no ledger changed.

- [ ] **Step 4: Look at the card in the fixture site, and audit it**

Run: `npm run build:fixtures`
Expected: PASS — `Complete!`

The label of the figure on the article page names the basis of each figure.

Run: `grep -o '<figure class="fact-card" data-fact-card role="img" aria-label="[^"]*"' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: PASS — `key figures: funding round USD 450 million (filing), cycle-time cut 18 per cent (measured), list price $38,000 (press release))`

So does the card itself, in the page and in the file that is the share image.

Run: `grep -c 'data-role="figure-basis"' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/card.svg`
Expected: PASS — `index.html:3` and `card.svg:3`

The text is a plain word, and it is in the quiet colour of the tokens.

Run: `grep -o '<text data-role="figure-basis"[^>]*>[^<]*</text>' site/dist/news/fixture-robotics-ships-fx-1-to-second-plant/index.html`
Expected: PASS — `fill="var(--t2)">press release</text>`

Run: `npm run audit`
Expected: PASS — `ok    A12`, `ok    A17` and `Passed: 16 checks.`

- [ ] **Step 5: Measure the fixture site**

The card is on every article page, so Lighthouse has to be run again.

Run: `npm run lighthouse`
Expected: PASS — `Lighthouse, 5 pages` and `All scores are 95 or more.`

- [ ] **Step 6: Commit**

```bash
git add site
git commit -m "feat(site): the fact card says where each figure comes from and never draws a figure from another outlet" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 87: Copy that says only what the code does

**Files:**
- Modify: `site/src/lib/method.ts` (the known limits and their kinds, the rule G4, `LIMITS_HEADING`, `LIMITS_INTRO`, `SCOREBOARD_INTRO`)
- Modify: `site/src/lib/copy.ts` (`holdsPageIntro`, `heldOutcomeText`, `statusPageIntro`, `sourcesText`, `neverDoes`)
- Modify: `site/src/pages/method/index.astro`, `site/src/pages/holds/index.astro`, `site/src/pages/status/index.astro`
- Modify: `evals/src/cases/*.ts` (the descriptions of the seeded defects), `evals/scoreboard/seeded.json` (regenerated)
- Modify: `README.md` (the source statuses, the scoreboard)
- Test: `site/test/known-limits.test.ts`, `site/test/method.test.ts`, `site/test/copy.test.ts`, `evals/test/seeded.test.ts`, `gate/test/sources.test.ts`

The closure review of Milestone 3 read the public copy against the code once more and found six places where it still says more than the code does, or something that is not true:

1. **The list of known limits is incomplete, and the rule G4 claims to be total.** The reader does not read a lone "one" ("one robot"), does not see fractions in words ("a third", "a quarter"), reads "two thirds" as the number 2 and "six-axis" as the number 6 with no unit, and, since Task 84, refuses a sentence that opens with a name that starts in lowercase (iRobot, xAI). The text of a model that no rule reads for figures or names (the page address, the text and the label of a claim, a heading that names no figure and no name) is not listed anywhere. And the sentence about G4 on the method page opens "Every number, date and name", which promises more than the reader finds.
2. **The scoreboard paragraph says the golden piece is broken "once for every failure code".** There are more cases than codes, so it is broken at least once.
3. **The descriptions of the seeded defects depend on the golden piece.** Four of its five limitation sentences, "under 600 words", a claim of it by number: they print on the method page and would go stale, without a test failing, when the golden piece is rewritten.
4. **The README says "Every `status` starts as `unverified`".** `sources.yml` keeps `blocked` (the arXiv feed) and `n/a` (the funding announcement), and a test asserts it.
5. **Present tense outside the guarded copy.** The holds page says a hold "waits for the owner", the status page speaks of "the record the Desk keeps of its own runs", the method page says in the present tense what the Desk never does and which sources it writes from. None of that runs yet. The sentence about the held outcome on the status page says the same.
6. **The table of Task 70 is stale.** Step 4 of Task 70 (in part 05 of this plan) still says "hand-written fixture pieces" and "40 of 40". It carries one added sentence that says Task 88 supersedes it. That sentence is the only change to an earlier part of the plan: this task does not touch the table or any step.

This task fixes each in the way the milestone fixes things, so that it stays fixed:

1. `KnownLimit` gets two more kinds beside `unseen` and `strict`: `misread` (the reader finds a number the sentence does not mean) and `unchecked` (text that a model writes and no rule reads). Every limit has an example, and `known-limits.test.ts` proves each one with the real token reader or, for the unchecked text, with the real gate: a made-up company and a number in a claim label, in the page address and in a heading all pass. The method page draws its heading and its introduction from `LIMITS_HEADING` and `LIMITS_INTRO`, and the rule G4 names the heading, so that it points at the list instead of claiming to be total.
2. The scoreboard paragraph is `SCOREBOARD_INTRO`, and a test shows that every failure code has a case and that some have several. The README says "at least once" too.
3. A test describes what a description of a seeded defect may not contain: a claim of the golden piece, a value it lists, a count of its sentences or parts, what a cut leaves of its length. The descriptions that did are reworded.
4. The README sentence is exact about the two statuses the file keeps, and a test compares it with `sources.yml`.
5. Five new functions of `copy.ts` write those sentences in the tense of the `LIVE` flags, each with an exact-string test for every setting, and the scan of the site's source fails if another file writes them. Where the gate already does something, the future-tense version says so ("the gate already enforces the rest of the rule").

- [ ] **Step 1: Write the failing tests for the limits, the rule G4 and the scoreboard paragraph**

The file of the known limits is written again: seven limits are unseen, two are misread, two strict and two unchecked, and each kind has its own proof. The test of the method page says that G4 does not claim to be total and points at the list of limits, and has a block for the scoreboard paragraph.

**Replace `site/test/known-limits.test.ts` with:**
```ts
import { describe, expect, it } from 'vitest';
import {
  buildLimitations,
  checkG2,
  citedClaims,
  defaultContext,
  extractTokens,
  isSentenceStarter,
  openingWordAccepted,
  runGate,
  startsWithCapitalOrDigit,
} from '@robywire/gate';
import type { GateInput } from '@robywire/gate';
import { cloneGolden } from '@robywire/gate/fixtures';
import { KNOWN_LIMITS, LIMITS_HEADING, LIMITS_INTRO } from '../src/lib/method';
import type { KnownLimit } from '../src/lib/method';

// The method page lists what the checks cannot see. A limit that stops being true
// must fail a test, so each one is shown here with the real token reader of the gate,
// or, for the text that no rule reads, with the real gate.

const ofKind = (kind: KnownLimit['kind']) => KNOWN_LIMITS.filter((limit) => limit.kind === kind);
const unseen = ofKind('unseen');
const misread = ofKind('misread');
const strict = ofKind('strict');
const unchecked = ofKind('unchecked');
const withText = (limits: readonly KnownLimit[], fragment: string): KnownLimit => {
  const found = limits.find((limit) => limit.text.includes(fragment));
  if (found === undefined) throw new Error(`no known limit says "${fragment}"`);
  return found;
};

describe('KNOWN_LIMITS', () => {
  it('lists what the reviews asked for: ordinals, vague quantities, a lone "one", fractions, lowercase names, and the false alarms of the name check', () => {
    const text = KNOWN_LIMITS.map((limit) => limit.text).join(' ');
    expect(text).toContain('Ordinals such as first, second and third');
    expect(text).toContain('"a couple", "several"');
    expect(text).toContain('The word "one" on its own');
    expect(text).toContain('"a third" and "a quarter"');
    expect(text).toContain('"two thirds" is read as the number 2');
    expect(text).toContain('"six-axis" is read as the number 6 with no unit');
    expect(text).toContain('iRobot or xAI');
    expect(text).toContain('The name check is strict on purpose');
    expect(unseen).toHaveLength(7);
    expect(misread).toHaveLength(2);
    expect(strict).toHaveLength(2);
    expect(unchecked).toHaveLength(2);
    expect(KNOWN_LIMITS).toHaveLength(13);
  });

  it.each(KNOWN_LIMITS.map((limit) => [limit.text.slice(0, 40), limit] as const))('is written as plain sentences: %s', (_name, limit) => {
    expect(limit.text).toMatch(/^[A-Z]/);
    expect(limit.text.endsWith('.')).toBe(true);
    // The example of a limit about text that no rule reads is a label or a heading, not a sentence.
    if (limit.kind !== 'unchecked') expect(limit.example.endsWith('.')).toBe(true);
  });

  // A limit that stops being true must fail a test. Each example is a sentence that the real token reader looks at.
  it.each(unseen.map((limit) => [limit.example, limit] as const))('is true: the gate reads no number, date, name or amount in "%s"', (example) => {
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([]);
    expect(tokens.dates).toEqual([]);
    expect(tokens.uncheckable).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it.each([...unseen, ...misread].map((limit) => [limit.example, limit] as const))(
    'has an example that the opening-word rule lets through, so the sentence is not stopped for another reason: "%s"',
    (example) => {
      const { initialWord } = extractTokens(example);
      expect(initialWord === undefined || isSentenceStarter(initialWord), example).toBe(true);
    },
  );

  it('shows with the same reader that a number, a date and a name that the gate can see are seen, so the examples above are not empty by accident', () => {
    expect(extractTokens('The plant shipped 12 arms on 3 October 2026, and Mercer Wire reported it.')).toMatchObject({
      numbers: [{ value: '12' }],
      dates: [{ iso: '2026-10-03' }],
      names: ['mercer', 'wire'],
    });
  });

  it('shows that a lone "one" is not read although "one" with a unit is, and that "half" is refused although other fractions are unseen', () => {
    expect(withText(unseen, 'The word "one" on its own').text).toContain('"one kilogram" is read as 1 kg');
    expect(extractTokens('The plant shipped one robot.').numbers).toEqual([]);
    expect(extractTokens('The plant shipped one kilogram of grease.').numbers).toEqual([{ raw: 'one kilogram', value: '1', unit: 'kg' }]);
    expect(extractTokens('The plant shipped a half of the arms.').uncheckable).toEqual(['half']);
    expect(extractTokens('A third of the arms shipped.').uncheckable).toEqual([]);
  });

  // What the reader takes the example for. Each misread limit has a row, so a new one fails until it is shown.
  const READ_AS: Record<string, { raw: string; value: string }> = {
    'The plant shipped two thirds of the arms.': { raw: 'two', value: '2' },
    'The six-axis arm shipped.': { raw: 'six', value: '6' },
  };

  it.each(misread.map((limit) => [limit.example, limit] as const))('is true: the reader takes "%s" for a number, and for no unit', (example) => {
    const reading = READ_AS[example];
    expect(reading, `a row for "${example}"`).toBeDefined();
    const tokens = extractTokens(example);
    expect(tokens.numbers).toEqual([reading]);
    expect(tokens.numbers[0]).not.toHaveProperty('unit');
    expect(tokens.dates).toEqual([]);
    expect(tokens.names).toEqual([]);
  });

  it('shows that "six-axis" is read like "6-axis", and that the digits need no unit either', () => {
    expect(extractTokens('The 6-axis arm shipped.').numbers).toEqual([{ raw: '6', value: '6' }]);
  });

  it('is true of the strict limit about the name check: an ordinary capitalised noun at the start of a sentence is refused unless a claim contains it', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    const { initialWord } = extractTokens(limit.example);
    expect(initialWord).toBe('Output');
    expect(openingWordAccepted('Output', new Set(), new Set())).toBe(false);
    expect(openingWordAccepted('Output', new Set(['output']), new Set())).toBe(true);
  });

  it('says what the strictness costs and what it buys', () => {
    const limit = withText(strict, 'The name check is strict on purpose');
    expect(limit.text).toContain('A false alarm costs a revision round; a name that slipped through would cost a wrong claim.');
  });

  it('is true of the strict limit about a sentence that opens with a lowercase name: the sentence rule of G2 refuses it, and the reader sees no name in it', () => {
    const limit = withText(strict, 'A sentence cannot open with a name that starts with a lowercase letter');
    expect(limit.text).toContain('iRobot or xAI');
    expect(limit.text).toContain('every sentence must start with a capital letter or a digit');
    expect(startsWithCapitalOrDigit(limit.example)).toBe(false);
    expect(extractTokens(limit.example)).not.toHaveProperty('initialWord');
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = limit.example;
    const refused = checkG2(input, defaultContext()).failures.map((failure) => failure.code);
    expect(refused).toEqual(['G2_SENTENCE_START']);
  });
});

describe('KNOWN_LIMITS: the text that no rule reads, shown with the real gate', () => {
  const route = (input: GateInput) => {
    const result = runGate(input, defaultContext());
    return { route: result.route, failures: result.failures.map((failure) => failure.code) };
  };
  /** The golden piece with the limitation sentences written again, as the gate requires after a claim's label changes. */
  const withLimitationsRewritten = (input: GateInput): GateInput => {
    input.draft.limitations = buildLimitations(citedClaims(input.draft, input.claims));
    return input;
  };

  it('starts from a golden piece that the gate publishes', () => {
    expect(route(cloneGolden())).toEqual({ route: 'publish', failures: [] });
  });

  it('is true of the page address, the text and the label of a claim: a made-up company and a number in them pass', () => {
    const limit = withText(unchecked, 'The page address of a piece and the text and the label of each claim');
    const input = cloneGolden();
    input.draft.slug = limit.example.toLowerCase().replaceAll(' ', '-');
    expect(input.draft.slug).toBe('harlow-logistics-12-plants');
    const claim = input.claims.find((item) => item.id === 'c-12')!;
    claim.label = limit.example;
    claim.text = `${limit.example} was announced.`;
    expect(route(withLimitationsRewritten(input))).toEqual({ route: 'publish', failures: [] });
    expect(extractTokens(limit.example)).toMatchObject({ numbers: [{ value: '12' }], names: ['logistics'], initialWord: 'Harlow' });
  });

  it('is true of a heading: one that asserts something in words and names no figure and no capitalised word passes', () => {
    const limit = withText(unchecked, 'A section heading that names no figure');
    const input = cloneGolden();
    input.draft.sections[0]!.heading = limit.example;
    expect(route(input)).toEqual({ route: 'publish', failures: [] });
  });

  it('is not an accident of the gate being switched off: the same label in a sentence is refused', () => {
    const input = cloneGolden();
    input.draft.takeaways[0]!.text = 'Harlow Logistics 12 plants were announced.';
    expect(route(input).failures).toContain('G4_NUMBER_UNSUPPORTED');
  });
});

describe('the introduction and the heading of the list of limits', () => {
  it('has a heading that the page and the rule G4 both use, so the pointer cannot name a section that is not there', () => {
    expect(LIMITS_HEADING).toBe('What the checks cannot see');
  });

  it('says which kinds of limit the list holds, one phrase for each kind', () => {
    expect(LIMITS_INTRO).toContain('that no rule compares with a claim');
    expect(LIMITS_INTRO).toContain('takes a word for a number');
    expect(LIMITS_INTRO).toContain('refuses more than it should');
    expect(LIMITS_INTRO).toContain('that a model writes and no rule reads');
  });
});
```

**In `site/test/method.test.ts`, replace:**
```ts
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
```

**with:**
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import board from '@robywire/evals/scoreboard';
import { ALL_FAILURE_CODES, CHECK_IDS, defaultConfig, extractTokens, startsWithCapitalOrDigit } from '@robywire/gate';
import { LIVE } from '../src/lib/live';
import { LIMITS_HEADING, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../src/lib/method';

// The method page is where a distrustful reader checks what the Desk claims
```

**In `site/test/method.test.ts`, replace:**
```ts
    });

    it('names the rules for the first word of a sentence and for headings, which Part A of this milestone added', () => {
      expect(g4).toContain('a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites');
```

**with:**
```ts
    });

    it('does not claim to be total: it says what the reader finds and points at the list of its limits, which the page has under the same heading', () => {
      expect(g4).not.toMatch(/^Every number, date and name/);
      expect(g4).toMatch(/^The reader of the gate finds the numbers, dates and capitalised names in each factual sentence/);
      expect(g4).toContain(`(what it cannot find is listed under "${LIMITS_HEADING}")`);
      expect(g4).toContain('each one it finds must appear among the values of a claim that sentence cites');
    });

    it('names the rules for the first word of a sentence and for headings, which Part A of this milestone added', () => {
      expect(g4).toContain('a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites');
```

**In `site/test/method.test.ts`, replace:**
```ts
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

**with:**
```ts
});

describe('SCOREBOARD_INTRO', () => {
  it('says the golden piece is broken at least once for every failure code, because some codes have several cases', () => {
    expect(SCOREBOARD_INTRO).toContain('broken on purpose, at least once for every failure code of the nine checks');
    expect(SCOREBOARD_INTRO).not.toContain('on purpose, once for every');
  });

  it('is true: every failure code has at least one case, and some have more', () => {
    const counts = new Map<string, number>();
    for (const item of board.cases) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...ALL_FAILURE_CODES].sort());
    expect(Math.max(...counts.values())).toBeGreaterThan(1);
  });

  it('is what the README says too', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('breaks it in a known way at least once for every failure code of the nine checks');
    expect(readme).not.toContain('in a known way once for every failure code');
  });
});

describe('scoreboardHeadline', () => {
  it('says how many seeded defects were caught', () => {
```

Run: `npm test --workspace @robywire/site -- test/known-limits.test.ts test/method.test.ts`
Expected: FAIL — `lists what the reviews asked for`, `is true of the page address, the text and the label of a claim`, `has a heading that the page and the rule G4 both use`, `does not claim to be total` and `SCOREBOARD_INTRO`

- [ ] **Step 2: Write the limits, the rule G4 and the paragraph**

**In `site/src/lib/method.ts`, replace:**
```ts
// sentences whose tense depends on a part of the Desk being live are in copy.ts.

export interface GateRule {
  id: CheckId;
```

**with:**
```ts
// sentences whose tense depends on a part of the Desk being live are in copy.ts.

/** The heading of the list of known limits on the method page. The rule G4 points at it, so the two cannot drift apart. */
export const LIMITS_HEADING = 'What the checks cannot see';

export interface GateRule {
  id: CheckId;
```

**In `site/src/lib/method.ts`, replace:**
```ts
      id: 'G4',
      name: 'Values',
      text: 'Every number, date and name in a factual sentence appears among the values of a claim that sentence cites; numbers written in words are read like digits ("twelve kilograms" is 12 kg) and words that state an amount with no figure to check ("half", "twice", "doubled", "tenfold") are refused; a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites; a section heading has no number, date or quotation and no capitalised word that no claim cited in that section contains; and every value a claim lists is really in its quoted passage.',
    },
    {
```

**with:**
```ts
      id: 'G4',
      name: 'Values',
      text: `The reader of the gate finds the numbers, dates and capitalised names in each factual sentence (what it cannot find is listed under "${LIMITS_HEADING}"), and each one it finds must appear among the values of a claim that sentence cites; numbers written in words are read like digits ("twelve kilograms" is 12 kg) and words that state an amount with no figure to check ("half", "twice", "doubled", "tenfold") are refused; a sentence may open with a capitalised word only if it is an ordinary function word or a word of a claim the sentence cites; a section heading has no number, date or quotation and no capitalised word that no claim cited in that section contains; and every value a claim lists is really in its quoted passage.`,
    },
    {
```

**In `site/src/lib/method.ts`, replace:**
```ts
}

/** One thing the checks cannot do, with a sentence that shows it with the real token reader. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `strict`: the reader refuses the example's first word although the sentence may be fine.
   */
  kind: 'unseen' | 'strict';
  text: string;
  example: string;
}

/**
 * What the code cannot see, and where it refuses more than it should. The limit that meaning is not checked is
```

**with:**
```ts
}

/** One thing the checks cannot do, with an example that known-limits.test.ts shows with the real reader or the real gate. */
export interface KnownLimit {
  /**
   * `unseen`: the reader finds no number, date, name or amount in the example, so no claim is compared with it.
   * `misread`: the reader finds a number in the example that is not the amount the sentence means.
   * `strict`: the gate refuses the example although the sentence may be fine.
   * `unchecked`: the example is text that a model writes and no rule reads: it passes whatever it says.
   */
  kind: 'unseen' | 'misread' | 'strict' | 'unchecked';
  text: string;
  example: string;
}

/** The sentence that opens the list of known limits, one phrase for each kind of limit. */
export const LIMITS_INTRO =
  'The rules above do what they say, and no more. These are the known limits: the places where a sentence can say something that no rule compares with a claim, where the reader takes a word for a number it does not mean, where the gate refuses more than it should, and the text that a model writes and no rule reads.';

/**
 * What the code cannot see, and where it refuses more than it should. The limit that meaning is not checked is
```

**In `site/src/lib/method.ts`, replace:**
```ts
    example: 'The plants shipped zero arms, and none were left.',
  },
  {
    kind: 'unseen',
```

**with:**
```ts
    example: 'The plants shipped zero arms, and none were left.',
  },
  {
    kind: 'unseen',
    text: 'The word "one" on its own is not read as a number, so "one robot" is compared with no claim, although "one kilogram" is read as 1 kg.',
    example: 'The plant shipped one robot.',
  },
  {
    kind: 'unseen',
    text: 'Fractions written in words, such as "a third" and "a quarter", are not read.',
    example: 'A third of the arms shipped, and a quarter were returned.',
  },
  {
    kind: 'unseen',
```

**In `site/src/lib/method.ts`, replace:**
```ts
    example: 'iRobot and xAI joined the round.',
  },
  {
    kind: 'strict',
```

**with:**
```ts
    example: 'iRobot and xAI joined the round.',
  },
  {
    kind: 'misread',
    text: 'A fraction that starts with a number word is read as that number: "two thirds" is read as the number 2, so the gate looks for a claim that lists a 2.',
    example: 'The plant shipped two thirds of the arms.',
  },
  {
    kind: 'misread',
    text: 'A compound such as "six-axis" is read as the number 6 with no unit, so a claim that lists a 6 in any unit supports it.',
    example: 'The six-axis arm shipped.',
  },
  {
    kind: 'strict',
```

**In `site/src/lib/method.ts`, replace:**
```ts
    example: 'Output rose 5 percent.',
  },
];

```

**with:**
```ts
    example: 'Output rose 5 percent.',
  },
  {
    kind: 'strict',
    text: 'A sentence cannot open with a name that starts with a lowercase letter, such as iRobot or xAI: every sentence must start with a capital letter or a digit, so the sentence has to be reworded.',
    example: 'iRobot shipped the arm.',
  },
  {
    kind: 'unchecked',
    text: 'The page address of a piece and the text and the label of each claim are written by a model, and no rule reads them for figures or names: a label such as "Harlow Logistics 12 plants" passes.',
    example: 'Harlow Logistics 12 plants',
  },
  {
    kind: 'unchecked',
    text: 'A section heading that names no figure and no capitalised word is not checked at all, whatever it asserts: "the arms keep failing" passes.',
    example: 'the arms keep failing',
  },
];

```

**In `site/src/lib/method.ts`, replace:**
```ts
];

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
```

**with:**
```ts
];

/** The paragraph that explains the scoreboard on the method page. There are more cases than codes, so it says at least once. */
export const SCOREBOARD_INTRO =
  'A gate is worth what it catches. To test this one, the golden example piece is broken on purpose, at least once for every failure code of the nine checks, and the gate has to catch every break. A missed defect fails the tests. The result is kept with the code, and this table is read from it.';

/** The headline of the scoreboard: how many of the seeded defects the gate caught. */
export function scoreboardHeadline(board: { total: number; caught: number }): string {
```

The method page draws the heading, the introduction and the scoreboard paragraph from them.

**In `site/src/pages/method/index.astro`, replace:**
```astro
} from '../../lib/copy';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { KNOWN_LIMITS, PIPELINE_STAGES, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

```

**with:**
```astro
} from '../../lib/copy';
import { CORRECTIONS_TEXT } from '../../lib/desk-pages';
import { KNOWN_LIMITS, LIMITS_HEADING, LIMITS_INTRO, PIPELINE_STAGES, SCOREBOARD_INTRO, gateRules, scoreboardHeadline } from '../../lib/method';
import '../../styles/pages.css';

```

**In `site/src/pages/method/index.astro`, replace:**
```astro

    <div class="prose">
      <h2 id="limits">What the checks cannot see</h2>
      <p>
        The rules above do what they say, and no more. These are the known limits: the places where a sentence can say something that no rule compares with a claim, and one place where the gate
        refuses more than it should.
      </p>
      <ul>
        {
```

**with:**
```astro

    <div class="prose">
      <h2 id="limits">{LIMITS_HEADING}</h2>
      <p>{LIMITS_INTRO}</p>
      <ul>
        {
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

      <h2 id="scoreboard">The scoreboard</h2>
      <p>
        A gate is worth what it catches. To test this one, the golden example piece is broken on purpose, once for every failure code of the nine checks, and the gate has to catch every break. A
        missed defect fails the tests. The result is kept with the code, and this table is read from it.
      </p>
      <p class="figure">{scoreboardHeadline(board)}</p>
      <p>The unbroken golden piece {board.baselinePasses ? 'publishes' : 'does not publish'}.</p>
```

**with:**
```astro

      <h2 id="scoreboard">The scoreboard</h2>
      <p>{SCOREBOARD_INTRO}</p>
      <p class="figure">{scoreboardHeadline(board)}</p>
      <p>The unbroken golden piece {board.baselinePasses ? 'publishes' : 'does not publish'}.</p>
```

The README says "at least once" as well.

**In `README.md`, replace:**
```markdown
## Reading the scoreboard

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

The site shows the same file on its `/method/` page, under the headline `N of N seeded defects caught`. Each row is one defect:
```

**with:**
```markdown
## Reading the scoreboard

`npm run evals:seeded` is the proof that the gate works. It takes one golden piece, breaks it in a known way at least once for every failure code of the nine checks, and fails if the gate misses any. It writes the result to `evals/scoreboard/seeded.json`, which is committed; a test fails if the committed file is out of date, so run the command and commit the file after any change to the gate.

The site shows the same file on its `/method/` page, under the headline `N of N seeded defects caught`. Each row is one defect:
```

Run: `npm test --workspace @robywire/site -- test/known-limits.test.ts test/method.test.ts`
Expected: PASS — `Test Files  2 passed (2)`.

- [ ] **Step 3: Write the failing test for the descriptions of the seeded defects**

The test looks at what each description says. It may not name a claim of the golden piece (`c-99`, which no claim has, is the one id a case makes up), a value that a golden claim lists, a count of the golden piece's parts or sentences ("four of the five", "eleven analysis sentences"), or what a cut leaves of its length ("under 600 words"). The cases themselves still fail loudly when the golden piece changes: a helper throws when the sentence it looks for is gone, and a case that stops breaking the piece is not caught.

**In `evals/test/seeded.test.ts`, replace:**
```ts
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
```

**with:**
```ts
  });

  // The descriptions are printed on the production /method page. A description that counts the sentences of the golden
  // piece, or names a claim of it, or says what a cut leaves of its length, would go stale without a test failing when
  // the golden piece is rewritten. The cases themselves fail loudly then: a helper throws when the sentence it looks for
  // is gone, and a case that stops breaking the piece is not caught.
  describe('describe the rule that is broken, not the shape of the golden piece', () => {
    const golden = cloneGolden();
    // Plain digits and number words ("four") are not the golden piece's alone: the rules use numbers too.
    const goldenValues = [...new Set(golden.claims.flatMap((claim) => claim.values.map((value) => value.raw)))].filter((raw) => !/^\d+$/.test(raw) && !/^[a-z]+$/.test(raw));
    const COUNT = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)';
    const SHAPES: [string, RegExp][] = [
      ['a claim of the golden piece (c-99, which no claim has, is the only id a case may make up)', /\bc-(?!99\b)\d+\b/],
      ['a count of its parts, as in "four of the five"', new RegExp(`\\b${COUNT} of the ${COUNT}\\b`, 'i')],
      ['a count of its sentences, as in "eleven analysis sentences"', new RegExp(`\\b${COUNT} (?:analysis|limitation|fact) sentences\\b`, 'i')],
      ['what a cut leaves of its length, as in "under 600 words"', /\bunder \d+ words\b/i],
    ];

    it('has the values the golden claims list, so that the check below looks for something', () => {
      expect(goldenValues).toContain('Corvane Partners');
      expect(goldenValues).toContain('38 kg');
      expect(goldenValues.length).toBeGreaterThan(20);
    });

    it.each(SEEDED_CASES.map((item) => [item.id, item.description] as const))('%s', (id, description) => {
      for (const [what, pattern] of SHAPES) expect(description, `${id} mentions ${what}`).not.toMatch(pattern);
      for (const value of goldenValues) expect(description, `${id} mentions the value "${value}", which only the golden piece has`).not.toContain(value);
    });
  });

  it('are listed in the order of the checks, G1 to G9, so the scoreboard reads in order', () => {
    const positions = SEEDED_CASES.map((item) => CHECK_IDS.indexOf(item.check));
```

Run: `npm test --workspace @robywire/evals -- test/seeded.test.ts`
Expected: FAIL — `short-body mentions a count of its parts`, `limitation-uncovered-claim mentions a claim of the golden piece` and `invented-name mentions the value "Corvane Partners"`

- [ ] **Step 4: Reword the descriptions, and write the scoreboard again**

Each description now says which rule is broken and how, in words that would be true of any golden piece. Sixteen of them change.

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the payload as 12 lb; the claim it cites says 12 kg.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 lb rated payload and a 1.4 m maximum reach.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the number of the claim it cites with a different unit.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a 12 lb rated payload and a 1.4 m maximum reach.';
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives the payload as thirteen kilograms, written in words; the claim it cites says 12 kg.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a rated payload of thirteen kilograms and a 1.4 m maximum reach.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence gives a number written in words, with its unit, that is not the number of the claim it cites.',
    apply: (base) => {
      sentenceWith(base, 'The datasheet lists a 12 kg').text = 'The datasheet lists a rated payload of thirteen kilograms and a 1.4 m maximum reach.';
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_WORD_UNCHECKABLE',
    description: 'A sentence says the round has twice as many investors as before, an amount that no claim can support.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').text = 'It lists 7 investors in the round, twice as many as before.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_WORD_UNCHECKABLE',
    description: 'A sentence states an amount in a word, such as "twice", that no claim can support.',
    apply: (base) => {
      sentenceWith(base, 'It lists 7 investors').text = 'It lists 7 investors in the round, twice as many as before.';
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_DATE_UNSUPPORTED',
    description: 'A sentence gives the first sale as 29 October 2026; the filing says 29 September 2026.',
    apply: (base) => {
      sentenceWith(base, 'The filing dates the first sale').text =
```

**with:**
```ts
    check: 'G4',
    code: 'G4_DATE_UNSUPPORTED',
    description: 'A sentence gives a date that is not the date of the claim it cites.',
    apply: (base) => {
      sentenceWith(base, 'The filing dates the first sale').text =
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_NAME_UNSUPPORTED',
    description: 'A sentence names Harlow Capital as lead investor; the filing names Corvane Partners.',
    apply: (base) => {
      sentenceWith(base, 'The round, led by').text = 'The round, led by Harlow Capital, totals $450 million, according to a regulatory filing.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_NAME_UNSUPPORTED',
    description: 'A sentence names a company that no claim it cites mentions.',
    apply: (base) => {
      sentenceWith(base, 'The round, led by').text = 'The round, led by Harlow Capital, totals $450 million, according to a regulatory filing.';
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description: 'A claim lists a value, 38 kg, that is not in the quotation it says it was taken from.',
    apply: (base) => {
      claimOf(base, 'c-13').span.quote = 'Arm mass: 39 kg.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_VALUE_NOT_IN_SPAN',
    description: 'A claim lists a value that is not in the quotation it says it was taken from.',
    apply: (base) => {
      claimOf(base, 'c-13').span.quote = 'Arm mass: 39 kg.';
```

**In `evals/src/cases/claims.ts`, replace:**
```ts
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: "A quotation changes one word of the source's: ten weeks, not nine.",
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
```

**with:**
```ts
    check: 'G5',
    code: 'G5_QUOTE_NOT_VERBATIM',
    description: 'A quotation changes one word of the passage it quotes.',
    apply: (base) => {
      sentenceWith(base, 'We went from pilot').text =
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    check: 'G2',
    code: 'G2_OPENING_LENGTH',
    description: 'The opening paragraph is one sentence, far under 40 words.',
    apply: (base) => {
      base.draft.opening = base.draft.opening.slice(0, 1);
```

**with:**
```ts
    check: 'G2',
    code: 'G2_OPENING_LENGTH',
    description: 'The opening paragraph is shorter than the length the rule requires.',
    apply: (base) => {
      base.draft.opening = base.draft.opening.slice(0, 1);
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'Four of the five limitation sentences are cut, which leaves the piece under 600 words.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 1);
```

**with:**
```ts
    check: 'G2',
    code: 'G2_BODY_LENGTH',
    description: 'The body is shorter than the length the rule requires.',
    apply: (base) => {
      base.draft.limitations = base.draft.limitations.slice(0, 1);
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    check: 'G2',
    code: 'G2_LIMITATION_COVERAGE',
    description: "A claim that needs a limitation is left out of the sentence that describes its group: c-12, the datasheet's pick rate.",
    apply: (base) => {
      const [datasheet] = base.draft.limitations;
```

**with:**
```ts
    check: 'G2',
    code: 'G2_LIMITATION_COVERAGE',
    description: 'A claim that needs a limitation is left out of the limitation sentence that describes its group.',
    apply: (base) => {
      const [datasheet] = base.draft.limitations;
```

**In `evals/src/cases/frontmatter-structure.ts`, replace:**
```ts
    check: 'G2',
    code: 'G2_LIMITATIONS_MISSING',
    description: "The piece rests on datasheet and press-release claims but has no 'What we couldn't verify' section.",
    apply: (base) => {
      base.draft.limitations = [];
```

**with:**
```ts
    check: 'G2',
    code: 'G2_LIMITATIONS_MISSING',
    description: "The 'What we couldn't verify' section is missing from a piece that rests on a company's own claims.",
    apply: (base) => {
      base.draft.limitations = [];
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
    check: 'G8',
    code: 'G8_LIMITATION_GROUP',
    description: 'One limitation sentence covers a press-release claim, c-1, together with datasheet claims.',
    apply: (base) => {
      base.draft.limitations[0]!.claimIds = ['c-1', 'c-8', 'c-9'];
```

**with:**
```ts
    check: 'G8',
    code: 'G8_LIMITATION_GROUP',
    description: 'One limitation sentence covers claims that have different bases.',
    apply: (base) => {
      base.draft.limitations[0]!.claimIds = ['c-1', 'c-8', 'c-9'];
```

**In `evals/src/cases/limitations-hygiene.ts`, replace:**
```ts
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the datasheet figures were independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The datasheet figures have been confirmed independently.';
```

**with:**
```ts
    check: 'G8',
    code: 'G8_LIMITATION_MISMATCH',
    description: 'A limitation sentence is reworded to say the figures were independently confirmed.',
    apply: (base) => {
      base.draft.limitations[0]!.text = 'The datasheet figures have been confirmed independently.';
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
    check: 'G7',
    code: 'G7_ANALYSIS_SHARE',
    description: 'Eleven analysis sentences are added, which takes analysis over 20% of the body.',
    apply: (base) => {
      const last = base.draft.sections.at(-1)!.paragraphs.at(-1)!;
```

**with:**
```ts
    check: 'G7',
    code: 'G7_ANALYSIS_SHARE',
    description: 'Analysis sentences are added until they make up more of the body than the rule allows.',
    apply: (base) => {
      const last = base.draft.sections.at(-1)!.paragraphs.at(-1)!;
```

**In `evals/src/cases/sourcing-analysis.ts`, replace:**
```ts
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence works out a percentage, 22%, that no fact sentence states.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
```

**with:**
```ts
    check: 'G7',
    code: 'G7_ANALYSIS_NEW_VALUE',
    description: 'An analysis sentence works out a percentage that no fact sentence states.',
    apply: (base) => {
      sentenceWith(base, 'The measured rate sits below').text =
```

**In `evals/src/cases/spec.ts`, replace:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence says the arm weighs 83 kg; the claim it cites says 38 kg.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
```

**with:**
```ts
    check: 'G4',
    code: 'G4_NUMBER_UNSUPPORTED',
    description: 'A sentence states a number whose digits are swapped from the number of the claim it cites.',
    apply: (base) => {
      sentenceWith(base, 'The arm itself weighs').text = 'The arm itself weighs 83 kg and draws 650 W in typical use.';
```

The method page prints these descriptions, so the scoreboard that it reads is written again.

Run: `npm run evals:seeded`
Expected: PASS — `54 of 54 cases caught (100.0%)` and `PASS: every seeded defect was caught.`

Run: `npm test --workspace @robywire/evals`
Expected: PASS — `Test Files  5 passed (5)`.

- [ ] **Step 5: Make the README true about the statuses**

The test reads the README and the registry. It finds the sentence about the statuses, requires that it no longer says every status starts as `unverified`, and requires that it name each other status the file holds.

**In `gate/test/sources.test.ts`, replace:**
```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
```

**with:**
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
```

**In `gate/test/sources.test.ts`, replace:**
```ts
  });

  it('lists at least five humanoid companies', () => {
    expect((load().primary.companies.humanoids ?? []).length).toBeGreaterThanOrEqual(5);
```

**with:**
```ts
  });

  it('is described truthfully by the README: it does not say that every status starts as unverified, and it names each other status the file keeps', () => {
    const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');
    const line = readme.split('\n').find((text) => text.startsWith('Every `status`'));
    expect(line, 'the README sentence about the statuses').toBeDefined();
    expect(line).not.toMatch(/^Every `status` starts as `unverified`;/);
    const kept = [...new Set(everyStatus(load()))].filter((status) => status !== 'unverified');
    expect(kept.sort()).toEqual(['blocked', 'n/a']);
    for (const status of kept) expect(line, status).toContain(`\`${status}\``);
  });

  it('lists at least five humanoid companies', () => {
    expect((load().primary.companies.humanoids ?? []).length).toBeGreaterThanOrEqual(5);
```

Run: `npm test --workspace @robywire/gate -- test/sources.test.ts`
Expected: FAIL — `is described truthfully by the README`

**In `README.md`, replace:**
```markdown
If a story has no reachable tier-1 source, that fact goes in the piece. It is never quietly laundered through a competitor's reporting.

Every `status` starts as `unverified`; the Desk changes it as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Which parts are live
```

**with:**
```markdown
If a story has no reachable tier-1 source, that fact goes in the piece. It is never quietly laundered through a competitor's reporting.

Every `status` starts as `unverified`, except the two that the original list already had: `blocked` for the arXiv feed, which the fetcher cannot reach, and `n/a` for the funding announcement, which has no fixed address. The Desk changes the others as it fetches. `gate/src/sources.ts` validates the file (`loadSources`) and `gate/test/sources.test.ts` checks it on every test run.

## Which parts are live
```

Run: `npm test --workspace @robywire/gate -- test/sources.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 6: Write the failing tests for the five sentences**

Each function is tried in all sixteen settings of the flags and must give one of two exact strings, the present tense when the Desk publishes and the future tense when it does not. The scan of the site's source gains four families, so that these sentences cannot come back in a page in the present tense while the flags are off, and the number of functions that a page must use goes up to nineteen.

**In `site/test/copy.test.ts`, replace:**
```ts
  disclosure,
  gateIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  notRunningNote,
  notRunningYet,
```

**with:**
```ts
  disclosure,
  gateIntro,
  heldOutcomeText,
  holdsPageIntro,
  holdsText,
  meaningLimit,
  methodDisclosure,
  modelCheckText,
  neverDoes,
  notRunningNote,
  notRunningYet,
```

**In `site/test/copy.test.ts`, replace:**
```ts
  scoreboardCaveat,
  siteDescription,
  trialText,
} from '../src/lib/copy';
```

**with:**
```ts
  scoreboardCaveat,
  siteDescription,
  sourcesText,
  statusPageIntro,
  trialText,
} from '../src/lib/copy';
```

**In `site/test/copy.test.ts`, replace:**
```ts
});

// --- Where the copy may be written ---------------------------------------------------

```

**with:**
```ts
});

describe('holdsPageIntro', () => {
  const START = 'A hold is a draft the gate did not clear.';
  const END =
    'This page lists when each hold happened, which beats the draft was filed under, and the reasons the gate gave. It never shows the held text, because a draft that was stopped is text this site does not vouch for.';
  const OFF = `${START} It is not published, and once the pipeline runs it will wait for the owner. ${END}`;
  const ON = `${START} It is not published: it waits for the owner. ${END}`;

  it.each(CASES)('says a hold waits for the owner only when the Desk publishes (%s)', (_name, live) => {
    expect(holdsPageIntro(live)).toBe(live.publishing ? ON : OFF);
  });

  it('says in both tenses that the held text is never shown', () => {
    for (const live of [NONE, ALL]) expect(holdsPageIntro(live)).toContain('It never shows the held text');
  });
});

describe('heldOutcomeText', () => {
  const OFF = 'A draft did not clear the gate, and once the pipeline runs it will wait for the owner. Nothing was published.';
  const ON = 'A draft did not clear the gate and waits for the owner. Nothing was published.';

  it.each(CASES)('says a held draft waits for the owner only when the Desk publishes (%s)', (_name, live) => {
    expect(heldOutcomeText(live)).toBe(live.publishing ? ON : OFF);
  });

  it('says in both tenses that nothing was published', () => {
    for (const live of [NONE, ALL]) expect(heldOutcomeText(live).endsWith('Nothing was published.')).toBe(true);
  });
});

describe('statusPageIntro', () => {
  const OFF =
    'This page will show the record the Desk will keep of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record, so it stays empty until the Desk runs.';
  const ON =
    'This page shows the record the Desk keeps of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record.';

  it.each(CASES)('speaks of the record of the Desk in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(statusPageIntro(live)).toBe(live.publishing ? ON : OFF);
  });
});

describe('sourcesText', () => {
  const TIERS =
    "A tier 1 source is a primary one: a company's own announcement or datasheet, a paper, a regulatory filing, a standard, a results sheet.";
  const OFF = `${TIERS} The Desk will write from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it will never state a fact on that authority. The gate already enforces the rest of the rule: a claim that has only a tier 2 source can appear only as an attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk will not rewrite a competitor's reporting; the story will be held.`;
  const ON = `${TIERS} The Desk writes from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it never states a fact on that authority. A claim that has only a tier 2 source can appear only as an attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk does not rewrite a competitor's reporting; the story is held.`;

  it.each(CASES)('says what the Desk does in the present tense only when it publishes (%s)', (_name, live) => {
    expect(sourcesText(live)).toBe(live.publishing ? ON : OFF);
  });

  it('keeps the definition of the two tiers and the rule of the gate in both tenses', () => {
    for (const live of [NONE, ALL]) {
      expect(sourcesText(live)).toContain(TIERS);
      expect(sourcesText(live)).toContain('can appear only as an attribution that names the outlet');
    }
  });
});

describe('neverDoes', () => {
  const OFF = [
    'It will contact no one. It will send no email to a company and ask nobody for comment, so no piece will say "we asked and did not hear back".',
    'It will not republish its sources. A piece will quote short passages, each attributed and at most 300 characters, and will not copy articles.',
    'It will use no photographs. Each piece already gets a fact card drawn from its own claims.',
    "It will not rewrite another outlet's reporting as its own. A story with no reachable primary source will be held.",
    'It will not publish a sentence the gate cannot trace to a source, and the gate already refuses one.',
  ];
  const ON = [
    'It contacts no one. It sends no email to a company and asks nobody for comment, so no piece says "we asked and did not hear back".',
    'It does not republish its sources. A piece quotes short passages, each attributed and at most 300 characters, and does not copy articles.',
    'It uses no photographs. Each piece gets a fact card drawn from its own claims.',
    "It does not rewrite another outlet's reporting as its own. A story with no reachable primary source is held.",
    'It does not publish a sentence the gate cannot trace to a source.',
  ];

  it.each(CASES)('lists five things, in the present tense only when the Desk publishes (%s)', (_name, live) => {
    expect(neverDoes(live)).toEqual(live.publishing ? ON : OFF);
  });

  it('says in the future tense that the card is already drawn and the gate already refuses, which the code does today', () => {
    expect(neverDoes(NONE)[2]).toContain('already gets a fact card');
    expect(neverDoes(NONE)[4]).toContain('the gate already refuses one');
  });
});

// --- Where the copy may be written ---------------------------------------------------

```

**In `site/test/copy.test.ts`, replace:**
```ts
  it('uses every function of copy.ts: a page, a component or the feed calls each one, so no old sentence is left beside a new one', () => {
    const exported = [...readFileSync(path.join(SRC, 'lib', 'copy.ts'), 'utf8').matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);
    expect(exported.length).toBeGreaterThanOrEqual(14);
    const everything = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const name of exported) expect(everything, name).toContain(`${name}(`);
```

**with:**
```ts
  it('uses every function of copy.ts: a page, a component or the feed calls each one, so no old sentence is left beside a new one', () => {
    const exported = [...readFileSync(path.join(SRC, 'lib', 'copy.ts'), 'utf8').matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);
    expect(exported.length).toBeGreaterThanOrEqual(19);
    const everything = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const name of exported) expect(everything, name).toContain(`${name}(`);
```

**In `site/test/copy.test.ts`, replace:**
```ts
    ['a daily site or schedule', /\bdaily\b/i],
    ['what each number links to', /Each number in the article/i],
  ])('has no file that writes a sentence about %s outside copy.ts and live.ts', (_what, pattern) => {
    const found = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(SRC, file));
```

**with:**
```ts
    ['a daily site or schedule', /\bdaily\b/i],
    ['what each number links to', /Each number in the article/i],
    ['a hold that waits for the owner', /waits for the owner/i],
    ['the record the Desk keeps of its own runs', /record the Desk keeps/i],
    ['what the Desk never does', /\bIt (?:contacts no one|does not republish its sources|uses no photographs|does not rewrite another outlet|does not publish a sentence)/],
    ['the sources the Desk writes from', /The Desk writes from tier 1 sources|never states a fact on that authority|the Desk does not rewrite a competitor/i],
  ])('has no file that writes a sentence about %s outside copy.ts and live.ts', (_what, pattern) => {
    const found = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(SRC, file));
```

Run: `npm test --workspace @robywire/site -- test/copy.test.ts`
Expected: FAIL — `holdsPageIntro is not a function`, `heldOutcomeText is not a function`, `statusPageIntro is not a function`, `sourcesText is not a function` and `neverDoes is not a function`

- [ ] **Step 7: Write the five sentences, and see the scan find the pages**

**In `site/src/lib/copy.ts`, replace:**
```ts
  return live.verifier ? `${start} That is the job of the independent model check.` : `${start} That will be the job of the independent model check, which is not running yet.`;
}
```

**with:**
```ts
  return live.verifier ? `${start} That is the job of the independent model check.` : `${start} That will be the job of the independent model check, which is not running yet.`;
}

/** The first paragraph of the holds page. A hold waits for the owner only once the pipeline that sends it runs. */
export function holdsPageIntro(live: Live = LIVE): string {
  const start = 'A hold is a draft the gate did not clear.';
  const end =
    'This page lists when each hold happened, which beats the draft was filed under, and the reasons the gate gave. It never shows the held text, because a draft that was stopped is text this site does not vouch for.';
  return live.publishing
    ? `${start} It is not published: it waits for the owner. ${end}`
    : `${start} It is not published, and once the pipeline runs it will wait for the owner. ${end}`;
}

/** The first paragraph of the status page: the record the Desk keeps of its own runs, which exists once the Desk runs. */
export function statusPageIntro(live: Live = LIVE): string {
  return live.publishing
    ? 'This page shows the record the Desk keeps of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record.'
    : 'This page will show the record the Desk will keep of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is built from that record, so it stays empty until the Desk runs.';
}

/** The paragraph on the method page about the two kinds of source. What the Desk does is in the tense of its flag; what the gate enforces is already true. */
export function sourcesText(live: Live = LIVE): string {
  const tiers = "A tier 1 source is a primary one: a company's own announcement or datasheet, a paper, a regulatory filing, a standard, a results sheet.";
  return live.publishing
    ? `${tiers} The Desk writes from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it never states a fact on that authority. A claim that has only a tier 2 source can appear only as an attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk does not rewrite a competitor's reporting; the story is held.`
    : `${tiers} The Desk will write from tier 1 sources. A tier 2 source is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it will never state a fact on that authority. The gate already enforces the rest of the rule: a claim that has only a tier 2 source can appear only as an attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk will not rewrite a competitor's reporting; the story will be held.`;
}

/** The list "What the Desk never does" on the method page, one item for each promise. */
export function neverDoes(live: Live = LIVE): string[] {
  return live.publishing
    ? [
        'It contacts no one. It sends no email to a company and asks nobody for comment, so no piece says "we asked and did not hear back".',
        'It does not republish its sources. A piece quotes short passages, each attributed and at most 300 characters, and does not copy articles.',
        'It uses no photographs. Each piece gets a fact card drawn from its own claims.',
        "It does not rewrite another outlet's reporting as its own. A story with no reachable primary source is held.",
        'It does not publish a sentence the gate cannot trace to a source.',
      ]
    : [
        'It will contact no one. It will send no email to a company and ask nobody for comment, so no piece will say "we asked and did not hear back".',
        'It will not republish its sources. A piece will quote short passages, each attributed and at most 300 characters, and will not copy articles.',
        'It will use no photographs. Each piece already gets a fact card drawn from its own claims.',
        "It will not rewrite another outlet's reporting as its own. A story with no reachable primary source will be held.",
        'It will not publish a sentence the gate cannot trace to a source, and the gate already refuses one.',
      ];
}

/** What the outcome "held" means, in the list on the status page. A held draft waits for the owner only once the pipeline that sends it runs. */
export function heldOutcomeText(live: Live = LIVE): string {
  return live.publishing
    ? 'A draft did not clear the gate and waits for the owner. Nothing was published.'
    : 'A draft did not clear the gate, and once the pipeline runs it will wait for the owner. Nothing was published.';
}
```

The functions say the right thing in every setting. The pages do not use them yet, so the scan finds the old sentences where they stand.

Run: `npm test --workspace @robywire/site -- test/copy.test.ts`
Expected: FAIL — `has no file that writes a sentence about a hold that waits for the owner outside copy.ts and live.ts`, `has no file that writes a sentence about the record the Desk keeps of its own runs outside copy.ts and live.ts`, `has no file that writes a sentence about what the Desk never does outside copy.ts and live.ts`, `has no file that writes a sentence about the sources the Desk writes from outside copy.ts and live.ts` and `uses every function of copy.ts`

- [ ] **Step 8: Use them in the pages**

The holds page, and the status page with its list of what the outcomes mean:

**In `site/src/pages/holds/index.astro`, replace:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { holdRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
```

**with:**
```astro
import TableWrap from '../../components/TableWrap.astro';
import Base from '../../layouts/Base.astro';
import { holdsPageIntro } from '../../lib/copy';
import { holdRows } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
```

**In `site/src/pages/holds/index.astro`, replace:**
```astro
    </header>
    <div class="page-text">
      <p>
        A hold is a draft the gate did not clear. It is not published: it waits for the owner. This page lists when each hold happened, which beats the draft was filed under, and the reasons the gate
        gave. It never shows the held text, because a draft that was stopped is text this site does not vouch for.
      </p>
      <p>Each reason is a code from the gate with a plain-English label. What the gate checks is on the <a href="/method/">method page</a>.</p>
    </div>
```

**with:**
```astro
    </header>
    <div class="page-text">
      <p>{holdsPageIntro()}</p>
      <p>Each reason is a code from the gate with a plain-English label. What the gate checks is on the <a href="/method/">method page</a>.</p>
    </div>
```

**In `site/src/pages/status/index.astro`, replace:**
```astro
---
import Base from '../../layouts/Base.astro';
import { statusView } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
```

**with:**
```astro
---
import Base from '../../layouts/Base.astro';
import { heldOutcomeText, statusPageIntro } from '../../lib/copy';
import { statusView } from '../../lib/desk-pages';
import { getDeskState } from '../../lib/desk-state';
```

**In `site/src/pages/status/index.astro`, replace:**
```astro
    </header>
    <div class="page-text">
      <p>
        This page shows the record the Desk keeps of its own runs: when it last ran, how that run ended, how many drafts the gate has held, and how many corrections have been published. The page is
        built from that record.
      </p>
      {lastRun === null && <p class="empty">The Desk has not run yet.</p>}
    </div>
```

**with:**
```astro
    </header>
    <div class="page-text">
      <p>{statusPageIntro()}</p>
      {lastRun === null && <p class="empty">The Desk has not run yet.</p>}
    </div>
```

**In `site/src/pages/status/index.astro`, replace:**
```astro
      <dd>Nothing met the bar that day, so nothing was written. This is a normal outcome.</dd>
      <dt>Held</dt>
      <dd>A draft did not clear the gate and waits for the owner. Nothing was published.</dd>
      <dt>Failed</dt>
      <dd>The run itself broke. Nothing was published.</dd>
```

**with:**
```astro
      <dd>Nothing met the bar that day, so nothing was written. This is a normal outcome.</dd>
      <dt>Held</dt>
      <dd>{heldOutcomeText()}</dd>
      <dt>Failed</dt>
      <dd>The run itself broke. Nothing was published.</dd>
```

The method page asks for the paragraph on the two kinds of source and for the list of what the Desk never does.

**In `site/src/pages/method/index.astro`, replace:**
```astro
  methodDisclosure,
  modelCheckText,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  scoreboardCaveat,
  trialText,
} from '../../lib/copy';
```

**with:**
```astro
  methodDisclosure,
  modelCheckText,
  neverDoes,
  notRunningNote,
  notRunningYet,
  ownerReleaseText,
  scoreboardCaveat,
  sourcesText,
  trialText,
} from '../../lib/copy';
```

**In `site/src/pages/method/index.astro`, replace:**
```astro

      <h2 id="sources">Two kinds of source</h2>
      <p>
        A tier 1 source is a primary one: a company's own announcement or datasheet, a paper, a regulatory filing, a standard, a results sheet. The Desk writes from tier 1 sources. A tier 2 source
        is another outlet's reporting. The Desk may notice a story in a tier 2 feed, but it never states a fact on that authority. A claim that has only a tier 2 source can appear only as an
        attribution that names the outlet, and a piece that contains one is held for the owner instead of being published. If a story has no reachable primary source, the Desk does not rewrite a
        competitor's reporting; the story is held.
      </p>

      <h2 id="pipeline">How a piece is made</h2>
```

**with:**
```astro

      <h2 id="sources">Two kinds of source</h2>
      <p>{sourcesText()}</p>

      <h2 id="pipeline">How a piece is made</h2>
```

**In `site/src/pages/method/index.astro`, replace:**
```astro
      <h2 id="never">What the Desk never does</h2>
      <ul>
        <li>It contacts no one. It sends no email to a company and asks nobody for comment, so no piece says "we asked and did not hear back".</li>
        <li>It does not republish its sources. A piece quotes short passages, each attributed and at most 300 characters, and does not copy articles.</li>
        <li>It uses no photographs. Each piece gets a fact card drawn from its own claims.</li>
        <li>It does not rewrite another outlet's reporting as its own. A story with no reachable primary source is held.</li>
        <li>It does not publish a sentence the gate cannot trace to a source.</li>
      </ul>

```

**with:**
```astro
      <h2 id="never">What the Desk never does</h2>
      <ul>
        {
          neverDoes().map((item) => (
            <li>{item}</li>
          ))
        }
      </ul>

```

Run: `npm test --workspace @robywire/site -- test/copy.test.ts`
Expected: PASS — `Test Files  1 passed (1)`.

- [ ] **Step 9: Run everything**

Run: `npm run typecheck && npm test && npm run evals:seeded && npm run fixtures:check`
Expected: PASS — `0 errors`, `PASS: every seeded defect was caught.` and `Fixtures are up to date.`

- [ ] **Step 10: Read the copy in the built site**

The production build says what the Desk will do, not what it does.

Run: `npm run build`
Expected: PASS — `Complete!`

Run: `grep -o 'It will contact no one.' site/dist/method/index.html`
Expected: PASS — `It will contact no one.`

Run: `grep -c 'It contacts no one' site/dist/method/index.html`
Expected: FAIL — `0`

Run: `grep -o 'The Desk will write from tier 1 sources.' site/dist/method/index.html`
Expected: PASS — `The Desk will write from tier 1 sources.`

Run: `grep -o 'once the pipeline runs it will wait for the owner' site/dist/holds/index.html site/dist/status/index.html`
Expected: PASS — `holds/index.html:once the pipeline runs it will wait for the owner` and `status/index.html:once the pipeline runs it will wait for the owner`

Run: `grep -o 'This page will show the record the Desk will keep of its own runs' site/dist/status/index.html`
Expected: PASS — `This page will show the record the Desk will keep of its own runs`

The limits, the rule G4 and the scoreboard paragraph say what the code does.

Run: `grep -o 'The reader of the gate finds the numbers, dates and capitalised names in each factual sentence (what it cannot find is listed under &quot;What the checks cannot see&quot;)' site/dist/method/index.html`
Expected: PASS — `what it cannot find is listed under &quot;What the checks cannot see&quot;`

Run: `grep -o 'A sentence cannot open with a name that starts with a lowercase letter' site/dist/method/index.html`
Expected: PASS — `A sentence cannot open with a name that starts with a lowercase letter`

Run: `grep -o 'at least once for every failure code of the nine checks' site/dist/method/index.html`
Expected: PASS — `at least once for every failure code of the nine checks`

The audit passes on the production build, which still carries no trace of the fixtures, and on the fixture build.

Run: `npm run audit:prod`
Expected: PASS — `ok    A13` and `Passed: 17 checks.`

Run: `npm run build:fixtures && npm run audit`
Expected: PASS — `Complete!` and `Passed: 16 checks.`

- [ ] **Step 11: Commit**

```bash
git add README.md evals gate site
git commit -m "feat: copy that says only what the code does: more known limits, a G4 rule that points at them, rule-level seeded descriptions, a true README, and the holds, status, sources and never-does text written by the LIVE switchboard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 88: Verify Milestone 3 from a clean install, and hand over to Plan 2

This task changes nothing and makes no commit. It is the proof that the four milestones of Plan 1 (the three of the first version and the hardening that Milestone 3 added, in four parts) hold together: everything installed from the lock file alone, and every check passing, in the order CI runs them. **It supersedes Task 83**: Task 83 ran the same proof before Part D, so its totals (the counts of tests, 53 seeded cases, 43 failure codes) are out of date, and the numbers below are the ones to use. It then restates what each milestone was to prove and with which command, and writes the checklist with which Plan 2 starts.

- [ ] **Step 1: Start from nothing**

Delete every installed package, as a fresh clone would have none.

Run: `rm -rf node_modules gate/node_modules evals/node_modules site/node_modules`
Expected: PASS

Run: `npm ci --no-audit --no-fund`
Expected: PASS — `added`, followed by the number of packages.

`npm ci` fails if `package-lock.json` and the `package.json` files disagree, so this also proves the lock file is complete. Milestone 3 installed nothing.

- [ ] **Step 2: Run every check**

Run: `npm run verify`
Expected: PASS — `0 errors`, `54 of 54 cases caught (100.0%)`, `PASS: every seeded defect was caught.`, `Fixtures are up to date.`, `Passed: 17 checks.`, `Passed: 16 checks.`, `Lighthouse, 5 pages` and `All scores are 95 or more.`

It takes a minute or two. In order, you will see: `Result` from `astro check` with `0 errors`; the test summaries of `gate`, `evals` and `site`, none of them failed; the table of the seeded defects, ending with `54 of 54 cases caught (100.0%)` and `PASS: every seeded defect was caught.`; `Fixtures are up to date.`; the production build, which prints an Astro warning for each page that the collections `news` and `ledger` are empty (that is right: a production build has no pieces yet); `Passed: 17 checks.` from `audit:prod` (the audit has 17 checks, and the production run adds the fixture check, A13); the fixture build; `Passed: 16 checks.` from `audit`; and last the Lighthouse table, which measures the home page and the first article and its receipts page, and the fifth article (the one that rests on another outlet) and its receipts page.

The lines of the output that matter, in the order they appear, as they were when this plan was verified (on another machine a score can be a point or two lower; all must be 95 or more). The counts of test files and tests are those of the finished Milestone 3 and change when a test is added; the rest of the output is build and test noise:

```text
Result (99 files):
- 0 errors

Test Files  35 passed (35)
Tests  2065 passed (2065)
Test Files  5 passed (5)
Tests  213 passed (213)
Test Files  36 passed (36)
Tests  1212 passed (1212)

54 of 54 cases caught (100.0%)
PASS: every seeded defect was caught.
Fixtures are up to date.

Passed: 17 checks.   (audit:prod)
Passed: 16 checks.   (audit)

Lighthouse, 5 pages (phone screen, simulated slow network)
Page                                                         Performance  Accessibility  Best practices  SEO
/                                                                    100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-1-to-second-plant/receipts/          100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/                   100            100             100  100
/news/fixture-robotics-ships-fx-5-to-second-plant/receipts/          100            100             100  100
All scores are 95 or more.
```

What changed since Task 83: the gate has 35 test files and 2065 tests (was 34 and 1958), `evals` has 213 tests (was 154), `site` has 1212 (was 1057), the seeded defects are 54 (were 53) and the failure codes of the gate are 44 (were 43). The audit and the Lighthouse table are as before: 17 and 16 checks, five pages, every score 100.

- [ ] **Step 3: Check that everything is committed**

Run: `git status --porcelain`
Expected: PASS — prints nothing.

The checks wrote no file that is not already committed: `evals/scoreboard/seeded.json` is rewritten with the same content, and `site/dist` and `.astro` are ignored by git.

- [ ] **Step 4: Match the milestones to their proof**

Section 14 of the design spec gives each milestone of Plan 1 a "done when" line. Milestone 3 of this plan (the hardening, in four parts) was added after reviews of Plan 1, and its "done when" is written here; it is a different thing from the spec's own milestone 3, which is the pipeline of Plan 2. Each line has a command that shows it.

| Milestone | Done when | The command that shows it |
|---|---|---|
| 0. Foundations: repo, workspaces, schemas, CI skeleton, `sources.yml` | Typecheck and CI pass | `npm run typecheck` prints `0 errors` for `astro check` and exits 0 for `tsc` in `gate` and `evals`. CI runs the steps of `npm run verify`, and `site/test/verify.test.ts` keeps the two identical. `sources.yml` is validated by `gate/test/sources.test.ts`, which runs in `npm test`. **The CI half is deferred: it is the first item of the checklist below.** |
| 1. Gate, built test-first against the seeded-defect fixtures | 100% of deterministic defects caught | `npm run evals:seeded` prints `54 of 54 cases caught (100.0%)` and `PASS: every seeded defect was caught.` Every failure code of G1 to G9 (44 of them) is covered, and a test fails if one is not. |
| 2. Site shell and design system, rendered from fixture pieces | Build, schema, link and Lighthouse checks pass | Build: `npm run build` and `npm run build:fixtures` finish with `[build] Complete!`. Schema: the content collections validate every piece and ledger against the gate's own schemas, and a bad file stops the build. Link: check A8 of `npm run audit` resolves every internal link, file and `#fragment`, and A9 and A11 check the receipts pages and claim markers. Lighthouse: `npm run lighthouse` prints 95 or more in every category for five pages. The five fixture pieces are generated from the golden piece, run through the real gate and renderer, and `npm run fixtures:check` fails when a committed file differs. **The CI half is deferred, as for milestone 0.** |
| 3a. Gate hardening (Tasks 71 to 76) | Every hole the first review found in the gate is closed, and each closure has a seeded defect | `npm run evals:seeded` (54 cases) and `gate/test/failure-codes.test.ts`, `evals/test/coverage.test.ts` and `site/test/reasons.test.ts`, which fail for a failure code without a unit test, a seeded case or a plain-English label. |
| 3b. Publishing integrity (Tasks 77 to 80) | What a reader sees is what the gate cleared, and the page says so when it is not the whole story | `npm test` (the tests of `match-pieces`, `render`, `desk-state` and `receipts`), `npm run fixtures:check`, and A16 of `npm run audit`, which fails an article that rests on another outlet and has no `Unconfirmed.` label. The build stops when an article, its ledger and the record of corrections disagree. |
| 3c. The fact card, honest copy and the first proof (Tasks 81 to 83) | The card is on the page, the public copy claims only what is running | A17 and A12 of `npm run audit`; `site/test/copy.test.ts`, which says what the copy is for every setting of the `LIVE` flags; Lighthouse. |
| 3d. Closing the last holes (Tasks 84 to 88) | What the second review found is closed: no sentence can hide a name in lowercase, the headline is the ledger's, the card says where a figure comes from, the copy claims no more than the code does, and the proof is repeated | `gate/test/g2-structure.test.ts` (`G2_SENTENCE_START`), `site/test/match-pieces.test.ts` (title and description), `site/test/card.test.ts` and `card-png.test.ts` (tier-1 figures with their basis), `site/test/known-limits.test.ts` and `copy.test.ts`, `evals/test/seeded.test.ts` (descriptions that describe rules), and this task. |

- [ ] **Step 5: Write the entry checklist for Plan 2**

Plan 1 is finished. These are the things Plan 2 must do or decide before, or as, it builds the Desk. None of them is a reason to doubt the work of Plan 1, and each is something that the code, the tests or the pages say they are not yet doing. Plan 2 starts from this list.

1. **The first push to GitHub must show every step of `verify` green**, including Lighthouse on `ubuntu-latest`. CI has never run: `site/test/verify.test.ts` proves that `.github/workflows/ci.yml` runs the steps of `npm run verify` in the same order, and this task proves that they pass on a clean local install, but the repository is not on GitHub yet. Do not start the pipeline before the first run is green.
2. **The prompt of the composer follows the rules the gate enforces.** Open every sentence with a word from the claims it cites or a plain function word (the list is `SENTENCE_STARTERS` in `gate/src/grounding.ts`); start every sentence with a capital letter or a digit; keep headings in lowercase except for words that the claims of the section contain; never emit an empty section or two neighbouring sections with the same heading (the ledger cannot tell them apart, so the page merges the first and drops the second); write digits and never "half", "twice" or "double".
3. **The extract stage validates the text it writes.** `G4_VALUE_NOT_IN_SPAN` checks that each claim `value` is in its quoted passage, but the claim `text` and `label`, the draft's slug and the labels that appear in limitation sentences are written by a model and no rule reads them for figures or names (the method page says so). The extract stage must check `text`, `label` and `values` against the span, and the slug and the labels, so that none holds a figure or a name that no span contains. The first-word rule trusts the words of a claim's text and label, so until it does, that rule is as strong as the extractor.
4. **The extractor decides the basis of a tier-2 claim.** The vocabulary of bases has no honest value for "reported by another outlet", and adding one would need a new limitation sentence. The fifth fixture piece gives its claim from Mercer Wire the basis `filing`, so its receipts page says "regulatory filing" next to the outlet, which misdescribes it. Decide the value, and change the fixture, before a real piece rests on a tier-2 claim.
5. **The pipeline passes `release` and `updatedAt` to `renderDraft`.** `release` is `auto` for a piece that the gate cleared and `owner` for a held piece that the owner released; `updatedAt` is the UTC day of the latest correction. `renderDraft` refuses a release that the gate's route contradicts, and the site build refuses a piece whose body, title or description is not what its ledger gives, whose `updatedAt` does not match the corrections in the desk state, or whose ledger cannot be written. It also needs real `YYYY-MM-DD` dates for the recent titles that G9 compares.
6. **Flipping a flag of `LIVE` means reading its present-tense copy again, and writing the seven stages of the pipeline in the present tense.** `site/src/lib/copy.ts` has a sentence for each flag turned on, written ahead of time and read against nothing that runs; `site/test/copy.test.ts` names every one, and a test fails until the seven stages of `PIPELINE_STAGES` in `site/src/lib/method.ts` lose their "will". A few present-tense sentences are still outside `copy.ts`: the last two sentences of the holds paragraph of the method page ("A hold is the normal result when the Desk is unsure ..."), the `<meta>` description and the dek ("What the Desk did last.") of the status page, and the `<meta>` description of the corrections page ("Every correction and retraction the Desk has published ..."). Move them into `copy.ts`, or read them again, when the pipeline goes live.
7. **G10 reads headings as well as fact sentences.** A heading that names no figure and no capitalised word passes every rule, whatever it says ("the arms keep failing"), and the design lets the model check read only fact sentences. Either extend the check to headings or say on the method page that they are not verified; the method page already lists them among the text no rule reads.
8. **The owner confirms three things that are placeholders.** The byline wording, `DESK_BYLINE_LABEL` in `gate/src/constants.ts` ("automated, with sources linked"), says nothing that is not true but is not confirmed; the publication name and the domain (`https://robywire.example`, set by `SITE_URL`) are placeholders.
9. **Grouped limitation sentences read awkwardly when a claim has no number value.** The figure of a claim is its first number value, or else its first value of any kind, so the press-release sentence of the golden piece begins "The Fixture Robotics Tarnmoor shipment, 1 October 2026 announcement date, ...", and one group can list a dozen items, because the size of a group is not capped. G8 pins the exact text. Decide whether to cap the size of a group or to phrase a group by its labels only, and change the templates in `gate/src/limitations.ts`, the figure rule and the golden piece together.

Four limits stay as they are and need no decision: Lighthouse was measured on one machine, with simulated throttling, so another machine can score a point or two lower; the scoreboard is a floor and not a proof, since it measures the checks against 54 defects that were thought of and not the Desk on live stories (that starts with the shadow week of Plan 3); G9 compares calendar days in UTC, and a date before the year 1000 is rejected by G1 but accepted by the frontmatter schema; and the fact card is drawn at 1200 by 630 and scaled to the column, so its small type is about seven pixels on a phone, which is why the figure carries the whole card in its label.

Plan 1 is finished. Plan 2 builds the Desk on top of it: the pipeline stages, the model check G10, the daily run, and the deploy.

