import { describe, expect, it } from 'vitest';
import { GOLDEN_CLAIMS, GOLDEN_DRAFT } from '../src/fixtures';
import { allSentences, citedClaims, describeLocation } from '../src/sentences';
import type { Draft } from '../src/schemas';

const located = allSentences(GOLDEN_DRAFT);

const bodyCount = GOLDEN_DRAFT.sections.reduce((total, section) => total + section.paragraphs.flat().length, 0);

describe('allSentences', () => {
  it('lists every sentence once', () => {
    const expected =
      2 + GOLDEN_DRAFT.opening.length + GOLDEN_DRAFT.takeaways.length + bodyCount + GOLDEN_DRAFT.limitations.length;
    expect(located).toHaveLength(expected);
  });

  it('puts them in document order: title, description, opening, takeaways, sections, limitations', () => {
    const sections = located.map((item) => item.section);
    const firstOfEach = ['title', 'description', 'opening', 'takeaways', 'body', 'limitations'].map((name) =>
      sections.indexOf(name as (typeof sections)[number]),
    );
    expect(firstOfEach).toEqual([...firstOfEach].sort((a, b) => a - b));
    expect(firstOfEach[0]).toBe(0);
    expect(located[0]?.sentence).toBe(GOLDEN_DRAFT.title);
    expect(located[1]?.sentence).toBe(GOLDEN_DRAFT.description);
    expect(located[2]?.sentence).toBe(GOLDEN_DRAFT.opening[0]);
    expect(located.at(-1)?.sentence).toBe(GOLDEN_DRAFT.limitations.at(-1));
  });

  it('numbers the sentences from 0 over the whole piece', () => {
    expect(located.map((item) => item.index)).toEqual(located.map((_item, position) => position));
  });

  it('numbers sentences from 1 within their section', () => {
    expect(located.find((item) => item.section === 'title')?.position).toBe(1);
    const opening = located.filter((item) => item.section === 'opening');
    expect(opening.map((item) => item.position)).toEqual([1, 2, 3]);
    const limitations = located.filter((item) => item.section === 'limitations');
    expect(limitations[0]?.position).toBe(1);
    expect(limitations.at(-1)?.position).toBe(GOLDEN_DRAFT.limitations.length);
  });

  it('flattens the paragraphs of a section and names the heading on each body sentence', () => {
    const first = GOLDEN_DRAFT.sections[0];
    const inFirst = located.filter((item) => item.heading === first?.heading);
    expect(inFirst.map((item) => item.sentence)).toEqual(first?.paragraphs.flat());
    expect(inFirst.map((item) => item.position)).toEqual(inFirst.map((_item, at) => at + 1));
    for (const item of located) {
      expect(item.heading !== undefined, item.sentence.text).toBe(item.section === 'body');
    }
  });

  it('numbers the paragraph of each sentence from 0 within its section or list: the opening and the limitations are one paragraph, each takeaway is its own', () => {
    const paragraphs = (section: string) => located.filter((item) => item.section === section).map((item) => item.paragraph);
    expect(paragraphs('title')).toEqual([0]);
    expect(paragraphs('description')).toEqual([0]);
    expect(located.filter((item) => item.section === 'description').map((item) => item.position)).toEqual([1]);
    expect(new Set(paragraphs('opening'))).toEqual(new Set([0]));
    expect(paragraphs('takeaways')).toEqual(GOLDEN_DRAFT.takeaways.map((_item, at) => at));
    expect(new Set(paragraphs('limitations'))).toEqual(new Set([0]));
  });

  it('numbers the paragraphs of a body section from 0 under its heading, a paragraph holding all its sentences', () => {
    for (const section of GOLDEN_DRAFT.sections) {
      const inSection = located.filter((item) => item.heading === section.heading);
      expect(inSection.map((item) => item.paragraph)).toEqual(section.paragraphs.flatMap((paragraph, at) => paragraph.map(() => at)));
    }
  });

  describe('when headings repeat or sections are empty', () => {
    const sentence = (text: string): Draft['opening'][number] => ({ kind: 'fact', text, claimIds: ['c-1'] });
    const draftWith = (sections: Draft['sections']): Draft => ({ ...GOLDEN_DRAFT, opening: [], takeaways: [], limitations: [], sections });
    const body = (draft: Draft) => allSentences(draft).filter((item) => item.section === 'body').map((item) => [item.sentence.text, item.paragraph]);

    it('goes on counting across neighbouring sections that share a heading, as the page shows them as one section', () => {
      const draft = draftWith([
        { heading: 'Same', paragraphs: [[sentence('a')], [sentence('b')]] },
        { heading: 'Same', paragraphs: [[sentence('c')]] },
        { heading: 'Other', paragraphs: [[sentence('d')]] },
      ]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
    });

    it('starts again from 0 when the same heading comes back after another one', () => {
      const draft = draftWith([
        { heading: 'Same', paragraphs: [[sentence('a')], [sentence('b')]] },
        { heading: 'Other', paragraphs: [[sentence('c')]] },
        { heading: 'Same', paragraphs: [[sentence('d')]] },
      ]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1], ['c', 0], ['d', 0]]);
    });

    it('does not count an empty paragraph', () => {
      const draft = draftWith([{ heading: 'Same', paragraphs: [[sentence('a')], [], [sentence('b')]] }]);
      expect(body(draft)).toEqual([['a', 0], ['b', 1]]);
    });

    it('lists nothing for a section with no sentence in it', () => {
      const draft = draftWith([{ heading: 'Empty', paragraphs: [[]] }, { heading: 'Full', paragraphs: [[sentence('a')]] }]);
      expect(body(draft)).toEqual([['a', 0]]);
    });
  });

  it('handles a draft with nothing but a title and a description', () => {
    const bare: Draft = {
      ...GOLDEN_DRAFT,
      opening: [],
      takeaways: [],
      sections: [],
      limitations: [],
    };
    expect(allSentences(bare).map((item) => item.section)).toEqual(['title', 'description']);
  });
});

describe('describeLocation', () => {
  it('names a singleton by its section', () => {
    expect(describeLocation(located[0]!)).toBe('title');
    expect(describeLocation(located[1]!)).toBe('description');
  });

  it('names a list sentence by section and position', () => {
    const second = located.filter((item) => item.section === 'opening')[1]!;
    expect(describeLocation(second)).toBe('opening, sentence 2');
    const takeaway = located.filter((item) => item.section === 'takeaways')[2]!;
    expect(describeLocation(takeaway)).toBe('takeaways, sentence 3');
    const limitation = located.filter((item) => item.section === 'limitations')[0]!;
    expect(describeLocation(limitation)).toBe('limitations, sentence 1');
  });

  it('names a body sentence by its heading and position', () => {
    const body = located.filter((item) => item.section === 'body')[3]!;
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
