import { describe, expect, it } from 'vitest';
import { isCovered, sameStory } from '../../src/stages/duplicates';
import { candidate } from '../support/candidates';

// A story that was published must not be written again. The test is the gate's own test of a title (G9), so
// that what Discover lets through is not what the gate would then call a repeat.

const TITLE = 'Fixture Robotics ships its FX-1 warehouse arm to a second plant';

describe('sameStory', () => {
  it('says that a title is the same story as itself', () => {
    expect(sameStory(TITLE, TITLE)).toBe(true);
  });

  it('ignores case, punctuation and the small words', () => {
    expect(sameStory(TITLE, 'FIXTURE ROBOTICS SHIPS FX-1 WAREHOUSE ARM, SECOND PLANT')).toBe(true);
  });

  it('says that two titles that share most of their words are the same story', () => {
    expect(sameStory('Fixture Robotics starts FX-1 deliveries to Brindles second plant', 'Fixture Robotics starts FX-1 deliveries to second Brindle plant')).toBe(true);
  });

  it('says that a title that shares a few words is another story', () => {
    expect(sameStory(TITLE, 'Fixture Robotics begins shipping FX-1 arms to a second Brindle Logistics plant')).toBe(false);
    expect(sameStory(TITLE, 'Northwind Handling raises $12 million for pallet-moving robots')).toBe(false);
  });

  it('says that titles of nothing but small words are not the same story', () => {
    expect(sameStory('The of a', 'The of a')).toBe(false);
    expect(sameStory('', '')).toBe(false);
  });

  it('draws the line where the gate does: a score of 0.6 is the same story, and less is not', () => {
    // Words shared over all words: 4 of 6 is 0.67, 3 of 5 is exactly 0.6, 2 of 4 is 0.5, 3 of 7 is 0.43.
    expect(sameStory('alpha beta gamma delta epsilon', 'alpha beta gamma delta zeta')).toBe(true);
    expect(sameStory('alpha beta gamma delta', 'alpha beta gamma epsilon')).toBe(true);
    expect(sameStory('alpha beta', 'alpha beta gamma delta')).toBe(false);
    expect(sameStory('alpha beta gamma delta epsilon', 'alpha beta gamma zeta eta')).toBe(false);
  });
});

describe('isCovered', () => {
  const published = {
    slugs: ['fixture-robotics-ships-fx-1-to-second-plant'],
    titles: [{ title: TITLE, publishedAt: '2026-10-04' }],
    sourceUrls: ['https://fixture-robotics.example/news/fx-1-second-plant'],
  };
  const story = (overrides = {}) => candidate({ title: 'Updated FX-1 datasheet adds an IP54 rating', url: 'https://other.example/a', ...overrides });

  it('is false when nothing is published', () => {
    expect(isCovered(story(), { slugs: [], titles: [], sourceUrls: [] }, '2026-10-05')).toBe(false);
  });

  it('is true when a published piece cites the address, whatever the title and however long ago', () => {
    expect(isCovered(story({ url: 'https://fixture-robotics.example/news/fx-1-second-plant' }), published, '2026-10-05')).toBe(true);
    expect(isCovered(story({ url: 'https://fixture-robotics.example/news/fx-1-second-plant' }), published, '2030-01-01')).toBe(true);
  });

  it('is true when the title tells the story of one published on the same day', () => {
    expect(isCovered(story({ title: TITLE }), published, '2026-10-04')).toBe(true);
  });

  it('is true when the title tells the story of one published up to 14 days before', () => {
    expect(isCovered(story({ title: TITLE }), published, '2026-10-05')).toBe(true);
    expect(isCovered(story({ title: TITLE }), published, '2026-10-18')).toBe(true);
  });

  it('is false when the title tells the story of one published more than 14 days before', () => {
    expect(isCovered(story({ title: TITLE }), published, '2026-10-19')).toBe(false);
  });

  it('is false when the only title like it is dated after the day of the run', () => {
    expect(isCovered(story({ title: TITLE }), published, '2026-10-03')).toBe(false);
  });

  it('is false when the title is another story', () => {
    expect(isCovered(story({ title: 'Northwind Handling raises $12 million for pallet-moving robots' }), published, '2026-10-05')).toBe(false);
  });

  it('compares the address as it is, which the stages have already made canonical', () => {
    expect(isCovered(story({ url: 'https://fixture-robotics.example/news/fx-1-second-plant-2' }), published, '2026-10-05')).toBe(false);
  });
});
