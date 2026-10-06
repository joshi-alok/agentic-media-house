import { describe, expect, it } from 'vitest';
import { DESK_AUTHOR_NAME } from '@robywire/gate';
import { jsonLdScript, newsArticleJsonLd } from '../src/lib/jsonld';

const SITE = 'https://agenticmediahouse.example';
const piece = {
  slug: 'fixture-robotics-ships-fx-2-to-second-plant',
  title: 'Fixture Robotics ships its FX-2 warehouse arm to a second plant',
  description: 'Fixture Robotics has begun shipping the FX-2 arm.',
  publishedAt: '2026-10-03',
};
const correction = (at: string, slug = piece.slug, kind: 'correction' | 'retraction' = 'correction') => ({ at, slug, kind, note: 'n' });

describe('newsArticleJsonLd', () => {
  const data = newsArticleJsonLd(piece, [], SITE);

  it('is a schema.org NewsArticle', () => {
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('NewsArticle');
  });

  it('carries the headline, description and publication date', () => {
    expect(data.headline).toBe(piece.title);
    expect(data.description).toBe(piece.description);
    expect(data.datePublished).toBe('2026-10-03');
  });

  it('names the Desk as the author and Robywire as the publisher', () => {
    expect(data.author).toEqual({ '@type': 'Organization', name: DESK_AUTHOR_NAME });
    expect(data.publisher).toEqual({ '@type': 'Organization', name: 'Robywire', url: SITE });
  });

  it('points at the article page and at the card image, with full URLs', () => {
    expect(data.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': `${SITE}/news/${piece.slug}/` });
    expect(data.image).toBe(`${SITE}/news/${piece.slug}/card.png`);
  });

  it('builds the same URLs when the site URL ends in a slash', () => {
    expect(newsArticleJsonLd(piece, [], `${SITE}/`).image).toBe(`${SITE}/news/${piece.slug}/card.png`);
  });
});

describe('newsArticleJsonLd: dateModified', () => {
  it('is the publication date when nothing was corrected', () => {
    expect(newsArticleJsonLd(piece, [], SITE).dateModified).toBe('2026-10-03');
  });

  it('is the time of the latest correction or retraction of this piece', () => {
    const corrections = [correction('2026-10-04T10:00:00Z', piece.slug, 'retraction'), correction('2026-10-03T09:12:00Z')];
    expect(newsArticleJsonLd(piece, corrections, SITE).dateModified).toBe('2026-10-04T10:00:00Z');
    expect(newsArticleJsonLd(piece, [...corrections].reverse(), SITE).dateModified).toBe('2026-10-04T10:00:00Z');
  });

  it('is updatedAt when the piece has one, even when a correction was recorded at another moment', () => {
    const updated = { ...piece, updatedAt: '2026-10-05' };
    expect(newsArticleJsonLd(updated, [], SITE).dateModified).toBe('2026-10-05');
    expect(newsArticleJsonLd(updated, [correction('2026-10-04T10:00:00Z')], SITE).dateModified).toBe('2026-10-05');
  });

  it('still names the publication date as datePublished when the piece was updated', () => {
    expect(newsArticleJsonLd({ ...piece, updatedAt: '2026-10-05' }, [], SITE).datePublished).toBe('2026-10-03');
  });

  it('ignores corrections of other pieces', () => {
    expect(newsArticleJsonLd(piece, [correction('2026-10-05T00:00:00Z', 'another-piece')], SITE).dateModified).toBe('2026-10-03');
  });
});

describe('jsonLdScript', () => {
  it('writes JSON that parses back to the same data', () => {
    const data = newsArticleJsonLd(piece, [], SITE);
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it('never lets the data close the script element', () => {
    const hostile = { headline: '</script><script>alert(1)</script> <!-- x' };
    const text = jsonLdScript(hostile);
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(hostile);
  });
});
