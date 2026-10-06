import { describe, expect, it } from 'vitest';
import { defaultConfig, DEFAULT_BANNED_PHRASES } from '../src/config';
import { CATEGORY_VOCAB } from '../src/constants';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT, cloneGolden } from '../src/fixtures';
import { buildLimitations, renderLimitation } from '../src/limitations';
import { Draft } from '../src/schemas';
import type { Sentence } from '../src/schemas';
import { citedClaims } from '../src/sentences';
import { countWords, normaliseQuotes, quotedSegments } from '../src/text';
import { extractTokens } from '../src/tokens';
import { expectValid } from './schema-helpers';

const words = (sentences: Sentence[]) => sentences.reduce((total, sentence) => total + countWords(sentence.text), 0);
const bodySentences = GOLDEN_DRAFT.sections.flatMap((section) => section.paragraphs.flat());
const everySentence: Sentence[] = [
  GOLDEN_DRAFT.title,
  GOLDEN_DRAFT.description,
  ...GOLDEN_DRAFT.opening,
  ...GOLDEN_DRAFT.takeaways,
  ...bodySentences,
  ...GOLDEN_DRAFT.limitations,
];
const claimIds = new Set(GOLDEN_CLAIMS.map((claim) => claim.id));

describe('GOLDEN_DRAFT: frontmatter', () => {
  it('is a valid Draft', () => {
    expectValid(Draft, GOLDEN_DRAFT);
  });

  it('has the slug, date, categories and author the design calls for', () => {
    expect(GOLDEN_DRAFT.slug).toBe('fixture-robotics-ships-fx-1-to-second-plant');
    expect(GOLDEN_DRAFT.publishedAt).toBe('2026-10-04');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_DRAFT.author).toEqual({ name: 'Robywire Desk' });
    for (const category of GOLDEN_DRAFT.categories) {
      expect(CATEGORY_VOCAB).toContain(category);
    }
  });

  it('has a title and a description of at most 155 characters, both fact sentences', () => {
    expect(GOLDEN_DRAFT.title.kind).toBe('fact');
    expect(GOLDEN_DRAFT.title.text.length).toBeGreaterThan(0);
    expect(GOLDEN_DRAFT.description.kind).toBe('fact');
    expect(GOLDEN_DRAFT.description.text.length).toBeLessThanOrEqual(defaultConfig().descriptionMax);
  });
});

describe('GOLDEN_DRAFT: structure', () => {
  it('opens with two or three sentences of 40 to 60 words', () => {
    expect(GOLDEN_DRAFT.opening.length).toBeGreaterThanOrEqual(2);
    expect(GOLDEN_DRAFT.opening.length).toBeLessThanOrEqual(3);
    expect(words(GOLDEN_DRAFT.opening)).toBeGreaterThanOrEqual(40);
    expect(words(GOLDEN_DRAFT.opening)).toBeLessThanOrEqual(60);
  });

  it('has four key takeaways', () => {
    expect(GOLDEN_DRAFT.takeaways).toHaveLength(4);
  });

  it('has three sections with declarative headings and two or three paragraphs each', () => {
    expect(GOLDEN_DRAFT.sections).toHaveLength(3);
    for (const section of GOLDEN_DRAFT.sections) {
      expect(section.heading.trim().length, section.heading).toBeGreaterThan(0);
      expect(section.heading, section.heading).not.toMatch(/\?/);
      expect(section.paragraphs.length, section.heading).toBeGreaterThanOrEqual(2);
      expect(section.paragraphs.length, section.heading).toBeLessThanOrEqual(3);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length, section.heading).toBeGreaterThan(0);
      }
    }
  });

  it('has a body of 640 to 720 words, so a small edit stays inside the 600 to 850 limit', () => {
    const total = words(GOLDEN_DRAFT.opening) + words(GOLDEN_DRAFT.takeaways) + words(bodySentences) + words(GOLDEN_DRAFT.limitations);
    expect(total).toBeGreaterThanOrEqual(640);
    expect(total).toBeLessThanOrEqual(720);
  });

  it('ends every sentence except the title with a full stop', () => {
    for (const sentence of everySentence.filter((item) => item !== GOLDEN_DRAFT.title)) {
      expect(sentence.text, sentence.text).toMatch(/\.$/u);
    }
    expect(GOLDEN_DRAFT.title.text).not.toMatch(/[.?!]$/u);
  });
});

describe('GOLDEN_DRAFT: citations', () => {
  it('cites only claims that exist, and gives every fact sentence at least one', () => {
    for (const sentence of everySentence) {
      for (const id of sentence.claimIds) {
        expect(claimIds.has(id), `${id} in "${sentence.text}"`).toBe(true);
      }
      if (sentence.kind === 'fact') {
        expect(sentence.claimIds.length, sentence.text).toBeGreaterThan(0);
      }
    }
  });

  it('cites every claim at least once, so no claim is left over', () => {
    const cited = new Set(everySentence.flatMap((sentence) => sentence.claimIds));
    expect([...claimIds].filter((id) => !cited.has(id))).toEqual([]);
  });
});

describe('GOLDEN_DRAFT: analysis', () => {
  const analyses = bodySentences.filter((sentence) => sentence.kind === 'analysis');

  it('has three analysis sentences, all in sections, the first of them about the measured rate', () => {
    expect(everySentence.filter((sentence) => sentence.kind === 'analysis')).toHaveLength(3);
    expect(analyses).toHaveLength(3);
    expect(analyses[0]?.text).toBe(
      'The measured rate sits below the datasheet maximum, which is normal for a figure quoted as an upper limit.',
    );
  });

  it('introduces no number, date or name that a fact sentence does not already contain', () => {
    const facts = everySentence.filter((sentence) => sentence.kind === 'fact').map((sentence) => extractTokens(sentence.text));
    const factNumbers = new Set(facts.flatMap((tokens) => tokens.numbers.map((token) => `${token.value} ${token.unit ?? ''}`)));
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

describe('GOLDEN_DRAFT: quotes', () => {
  const textSentences = everySentence.filter((sentence) => sentence.kind !== 'limitation');

  it('contains exactly one double-quoted passage', () => {
    expect(textSentences.flatMap((sentence) => quotedSegments(sentence.text))).toHaveLength(1);
  });

  it('quotes it word for word from a claim the sentence cites', () => {
    for (const sentence of textSentences) {
      const cited = sentence.claimIds.map((id) => GOLDEN_CLAIMS.find((claim) => claim.id === id));
      for (const segment of quotedSegments(sentence.text)) {
        const found = cited.some((claim) => normaliseQuotes(claim?.span.quote ?? '').includes(segment));
        expect(found, segment).toBe(true);
      }
    }
  });
});

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

  it('has the sentences buildLimitations writes for the claims the rest of the piece cites: three to ten of them', () => {
    const { limitations, ...rest } = GOLDEN_DRAFT;
    const cited = citedClaims({ ...rest, limitations: [] }, GOLDEN_CLAIMS);
    expect(GOLDEN_DRAFT.limitations).toEqual(buildLimitations(cited));
    expect(limitations.length).toBeGreaterThanOrEqual(3);
    expect(limitations.length).toBeLessThanOrEqual(10);
  });

  it('never says the same thing twice', () => {
    const texts = GOLDEN_DRAFT.limitations.map((sentence) => sentence.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('describes both the basis and the status of claims', () => {
    expect(GOLDEN_DRAFT.limitations.some((sentence) => sentence.template === 'basis')).toBe(true);
    expect(GOLDEN_DRAFT.limitations.some((sentence) => sentence.template === 'status')).toBe(true);
  });

  it('exists because the piece rests on datasheet, press-release and demo claims', () => {
    const cited = new Set(everySentence.flatMap((sentence) => sentence.claimIds));
    const unsafe = GOLDEN_CLAIMS.filter((claim) => cited.has(claim.id) && !['filing', 'standard', 'paper', 'measured'].includes(claim.basis));
    expect(unsafe.length).toBeGreaterThan(0);
  });
});

describe('GOLDEN_DRAFT: wording', () => {
  it('uses none of the banned phrases', () => {
    const text = [...everySentence.map((sentence) => sentence.text), ...GOLDEN_DRAFT.sections.map((section) => section.heading)]
      .join(' ')
      .toLowerCase();
    for (const phrase of DEFAULT_BANNED_PHRASES) {
      expect(text, phrase).not.toContain(phrase);
    }
  });

  it('writes figures in the forms the normalisers must reconcile with the claims', () => {
    const text = everySentence.map((sentence) => sentence.text).join(' ');
    for (const written of ['1,200 picks', '$450 million', '18%', '12 kg', '2.3 m/s', '1.4 m', '29 September 2026', '1 October 2026', '2027']) {
      expect(text, written).toContain(written);
    }
    const raws = GOLDEN_CLAIMS.flatMap((claim) => claim.values.map((value) => value.raw));
    for (const raw of ['1.2k', 'USD 450 million', '18 per cent', '12 kilograms', '2.3 metres per second', '2026-09-29']) {
      expect(raws, raw).toContain(raw);
    }
  });
});

describe('cloneGolden', () => {
  it('returns the draft and claims, equal to the originals', () => {
    const copy = cloneGolden();
    expect(copy.draft).toEqual(GOLDEN_DRAFT);
    expect(copy.claims).toEqual(GOLDEN_CLAIMS);
  });

  it('returns a deep copy that shares nothing with the originals', () => {
    const copy = cloneGolden();
    expect(copy.draft).not.toBe(GOLDEN_DRAFT);
    expect(copy.draft.sections[0]).not.toBe(GOLDEN_DRAFT.sections[0]);
    expect(copy.draft.sections[0]?.paragraphs[0]?.[0]).not.toBe(GOLDEN_DRAFT.sections[0]?.paragraphs[0]?.[0]);
    expect(copy.claims).not.toBe(GOLDEN_CLAIMS);
    expect(copy.claims[0]).not.toBe(GOLDEN_CLAIMS[0]);
    expect(copy.claims[0]?.values).not.toBe(GOLDEN_CLAIMS[0]?.values);
  });

  it('returns a copy that tests can change without touching the originals', () => {
    const copy = cloneGolden();
    copy.draft.title.text = 'changed';
    copy.draft.categories.push('humanoids');
    copy.claims[0]!.label = 'changed';
    copy.claims.pop();
    expect(GOLDEN_DRAFT.title.text).toBe('Fixture Robotics ships its FX-1 warehouse arm to a second plant');
    expect(GOLDEN_DRAFT.categories).toEqual(['industrial-warehouse', 'funding']);
    expect(GOLDEN_CLAIMS[0]?.label).toBe('Tarnmoor shipment');
    expect(cloneGolden().claims).toHaveLength(GOLDEN_CLAIMS.length);
  });

  it('leaves the originals frozen, so a test that forgets to copy fails loudly', () => {
    expect(Object.isFrozen(GOLDEN_DRAFT)).toBe(true);
    expect(Object.isFrozen(GOLDEN_DRAFT.sections[0]?.paragraphs[0]?.[0])).toBe(true);
    expect(() => {
      GOLDEN_DRAFT.title.text = 'changed';
    }).toThrow(TypeError);
  });

  it('is reachable by package name through the fixtures export', async () => {
    const linked = await import('@robywire/gate/fixtures');
    expect(linked.cloneGolden().draft.slug).toBe(GOLDEN_DRAFT.slug);
  });
});
