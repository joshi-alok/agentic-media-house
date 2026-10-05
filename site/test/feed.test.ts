import { getRssString } from '@astrojs/rss';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { xmlProblem } from '../scripts/audit/xml.mjs';
import { feedOptions, rssItems } from '../src/lib/feed';

const SITE = 'https://robywire.example';

const piece = (slug: string, title: string, publishedAt: string, categories: string[], description = `About ${title}.`) => ({
  slug,
  data: { title, description, publishedAt, categories },
});

const FX1 = piece('fx-1', 'Fixture Robotics ships its FX-1 warehouse arm to a second plant', '2026-10-04', ['industrial-warehouse', 'funding']);
const FX2 = piece('fx-2', 'Fixture Robotics ships its FX-2 warehouse arm to a second plant', '2026-10-03', ['humanoids']);

describe('rssItems', () => {
  it('is empty when there are no pieces', () => {
    expect(rssItems([])).toEqual([]);
  });

  it('maps a piece to an item with its title, description, article path, date and the names of its categories', () => {
    expect(rssItems([FX1])).toEqual([
      {
        title: 'Fixture Robotics ships its FX-1 warehouse arm to a second plant',
        description: 'About Fixture Robotics ships its FX-1 warehouse arm to a second plant.',
        link: '/news/fx-1/',
        pubDate: new Date('2026-10-04T00:00:00Z'),
        categories: ['Industrial & warehouse', 'Funding'],
      },
    ]);
  });

  it('keeps the order it is given, which is newest first', () => {
    expect(rssItems([FX1, FX2]).map((item) => item.link)).toEqual(['/news/fx-1/', '/news/fx-2/']);
  });

  it('stops with a clear message for a category the site does not have', () => {
    expect(() => rssItems([piece('x', 'T', '2026-10-04', ['cooking'])])).toThrow('"cooking" is not a beat or a tag');
  });

  it('does not change the pieces it is given', () => {
    const before = structuredClone([FX1, FX2]);
    rssItems([FX1, FX2]);
    expect([FX1, FX2]).toEqual(before);
  });
});

describe('the feed', () => {
  const feed = (pieces: Parameters<typeof rssItems>[0]) => getRssString(feedOptions(pieces, SITE));
  const parse = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml) as { rss: { '@_version': string; channel: Record<string, unknown> } };

  it('is well-formed RSS 2.0 with the site as its channel', async () => {
    const xml = await feed([FX1, FX2]);
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss['@_version']).toBe('2.0');
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.link).toBe('https://robywire.example/');
    expect(rss.channel.language).toBe('en');
  });

  it('lists every piece, newest first, with an absolute link, a date and its categories', async () => {
    const { rss } = parse(await feed([FX1, FX2]));
    const items = rss.channel.item as { title: string; link: string; pubDate: string; category: string[]; guid: { '#text': string } }[];
    expect(items.map((item) => item.link)).toEqual(['https://robywire.example/news/fx-1/', 'https://robywire.example/news/fx-2/']);
    expect(items[0]?.pubDate).toBe('Sun, 04 Oct 2026 00:00:00 GMT');
    expect(items[0]?.category).toEqual(['Industrial & warehouse', 'Funding']);
    expect(items[0]?.guid['#text']).toBe('https://robywire.example/news/fx-1/');
  });

  it('is valid, and has a channel but no items, when there are no pieces', async () => {
    const xml = await feed([]);
    expect(xmlProblem(xml)).toBeUndefined();
    const { rss } = parse(xml);
    expect(rss.channel.title).toBe('Robywire');
    expect(rss.channel.item).toBeUndefined();
  });

  it('escapes markup in a title, so a hostile title cannot break the feed', async () => {
    const xml = await feed([piece('x', 'A < B & "C" </title><script>', '2026-10-04', ['humanoids'])]);
    expect(xmlProblem(xml)).toBeUndefined();
    expect(xml).not.toContain('<script>');
    const { rss } = parse(xml);
    expect((rss.channel.item as { title: string }).title).toBe('A < B & "C" </title><script>');
  });
});
