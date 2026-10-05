import { describe, expect, it } from 'vitest';
import { GOLDEN_DRAFT } from '../src/fixtures';
import { allSentences, describeLocation } from '../src/sentences';
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
