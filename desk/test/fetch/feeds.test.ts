import { afterEach, describe, expect, it } from 'vitest';
import { FeedError, normaliseFeedDate, parseFeed } from '../../src/fetch/feeds';
import { fixtureText } from '../support/fixtures';

// A feed is how another outlet says what it has published. The Desk uses it to find stories, never to
// write from. A feed is untrusted text from outside: it may be broken, or be something else altogether,
// and then the Desk says so with a typed error and skips the source.

const rss = (items: string, extra = ''): string => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${extra}${items}</channel></rss>`;
const atom = (entries: string): string => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;

/** The error that parsing must throw, or a failure of the test if it does not. */
function failureOf(xml: string): FeedError {
  try {
    parseFeed(xml);
  } catch (error) {
    expect(error).toBeInstanceOf(FeedError);
    return error as FeedError;
  }
  throw new Error('the feed was accepted');
}

describe('parseFeed: an RSS feed', () => {
  const feed = parseFeed(fixtureText('feeds/mercer-wire.rss.xml'));

  it('is read as RSS', () => {
    expect(feed.format).toBe('rss');
  });

  it('gives the items with a link and a title, in the order of the feed, with the link as a canonical address and the date as an ISO time', () => {
    expect(feed.items).toEqual([
      {
        title: "Fixture Robotics starts FX-1 deliveries to Brindle's second plant",
        link: 'https://mercer-wire.example/robotics/fx-1-reaches-second-brindle-plant',
        publishedAt: '2026-10-04T09:15:00.000Z',
        summary: 'The arm is priced from $38,000, the outlet reported.',
      },
      {
        title: 'Northwind Handling raises $12 million for pallet-moving robots',
        link: 'https://mercer-wire.example/robotics/northwind-handling-raises-12-million',
        publishedAt: '2026-10-03T16:00:00.000Z',
        summary: 'A funding round with a named amount.',
      },
      {
        title: 'Warehouse robot makers brace for new tariff rules & paperwork',
        link: 'https://mercer-wire.example/robotics/tariff-rules-and-paperwork',
        publishedAt: '2026-09-28T07:30:00.000Z',
      },
    ]);
  });

  it('skips the item with no link, and counts it', () => {
    expect(feed.skipped).toBe(1);
  });

  it('does not take the link of the channel for the link of an item', () => {
    expect(feed.items.map((item) => item.link)).not.toContain('https://mercer-wire.example/robotics');
  });
});

describe('parseFeed: an Atom feed', () => {
  const feed = parseFeed(fixtureText('feeds/gantry-daily.atom.xml'));

  it('is read as Atom', () => {
    expect(feed.format).toBe('atom');
  });

  it('gives the entries that have a link to a page, with the date published or else the date updated', () => {
    expect(feed.items).toEqual([
      {
        title: 'Fixture Robotics starts FX-1 deliveries to second Brindle plant',
        link: 'https://gantry-daily.example/2026/10/fx-1-second-brindle-plant',
        publishedAt: '2026-10-04T09:30:00.000Z',
        summary: 'Deliveries have started, the company said.',
      },
      {
        title: 'Brindle Logistics opens its second plant at Tarnmoor',
        link: 'https://gantry-daily.example/2026/10/brindle-opens-tarnmoor',
        publishedAt: '2026-10-02T18:45:00.000Z',
      },
    ]);
  });

  it('skips the entry whose only link is a file to download, and counts it', () => {
    expect(feed.skipped).toBe(1);
  });
});

describe('parseFeed: items', () => {
  it('reads a feed with a single item, which the parser would otherwise give as an object and not a list', () => {
    const feed = parseFeed(rss('<item><title>One</title><link>https://a.example/1</link></item>'));
    expect(feed.items).toEqual([{ title: 'One', link: 'https://a.example/1' }]);
    expect(parseFeed(atom('<entry><title>One</title><link href="https://a.example/1"/></entry>')).items).toEqual([{ title: 'One', link: 'https://a.example/1' }]);
  });

  it('reads a feed with no items as a feed with no items', () => {
    expect(parseFeed(rss(''))).toEqual({ format: 'rss', items: [], skipped: 0 });
    expect(parseFeed(atom(''))).toEqual({ format: 'atom', items: [], skipped: 0 });
  });

  it('collapses the white space of a title, and trims the link', () => {
    const feed = parseFeed(rss('<item><title>\n   Two   words\n</title><link>\n  https://a.example/1  \n</link></item>'));
    expect(feed.items).toEqual([{ title: 'Two words', link: 'https://a.example/1' }]);
  });

  it('decodes character references in a title, and leaves the text of a CDATA section as it is', () => {
    const feed = parseFeed(rss('<item><title>A &amp; B &#8212; C</title><link>https://a.example/1</link></item><item><title><![CDATA[D &amp; E]]></title><link>https://a.example/2</link></item>'));
    expect(feed.items.map((item) => item.title)).toEqual([`A & B ${String.fromCharCode(0x2014)} C`, 'D &amp; E']);
  });

  it('reads a title that has attributes, as an Atom title of type html does', () => {
    const feed = parseFeed(atom('<entry><title type="html">With a type</title><link href="https://a.example/1"/></entry>'));
    expect(feed.items[0]?.title).toBe('With a type');
  });

  it('takes the alternate link of an Atom entry, wherever it is among the links, and a link with no rel', () => {
    const feed = parseFeed(
      atom(
        '<entry><title>A</title><link rel="enclosure" href="https://a.example/file.mp3"/><link rel="alternate" href="https://a.example/a"/></entry>' +
          '<entry><title>B</title><link href="https://a.example/b"/></entry>' +
          '<entry><title>C</title><link rel="related" href="https://a.example/c"/></entry>',
      ),
    );
    expect(feed.items.map((item) => item.link)).toEqual(['https://a.example/a', 'https://a.example/b']);
    expect(feed.skipped).toBe(1);
  });

  it('skips and counts an item with no title, an empty title, an empty link, or a link that is not the address of a page', () => {
    const feed = parseFeed(
      rss(
        '<item><link>https://a.example/1</link></item>' +
          '<item><title>  </title><link>https://a.example/2</link></item>' +
          '<item><title>Empty link</title><link> </link></item>' +
          '<item><title>Relative</title><link>/relative/path</link></item>' +
          '<item><title>Mail</title><link>mailto:a@a.example</link></item>' +
          '<item><title>Kept</title><link>https://a.example/kept</link></item>',
      ),
    );
    expect(feed.items.map((item) => item.title)).toEqual(['Kept']);
    expect(feed.skipped).toBe(5);
  });

  it('gives no date, and keeps the item, when the date is not one', () => {
    const feed = parseFeed(rss('<item><title>A</title><link>https://a.example/1</link><pubDate>yesterday afternoon</pubDate></item>'));
    expect(feed.items).toEqual([{ title: 'A', link: 'https://a.example/1' }]);
  });

  it('gives no summary when it is empty', () => {
    const feed = parseFeed(rss('<item><title>A</title><link>https://a.example/1</link><description>   </description></item>'));
    expect(feed.items[0]).not.toHaveProperty('summary');
  });

  it('reads the date of an item from pubDate, and from dc:date when there is no pubDate', () => {
    const feed = parseFeed(
      '<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>' +
        '<item><title>A</title><link>https://a.example/1</link><pubDate>Sun, 04 Oct 2026 09:15:00 +0000</pubDate><dc:date>2020-01-01T00:00:00Z</dc:date></item>' +
        '<item><title>B</title><link>https://a.example/2</link><dc:date>2026-10-03T16:00:00Z</dc:date></item>' +
        '</channel></rss>',
    );
    expect(feed.items.map((item) => item.publishedAt)).toEqual(['2026-10-04T09:15:00.000Z', '2026-10-03T16:00:00.000Z']);
  });

  it('skips an item that is empty or is only text, and counts it, without failing', () => {
    const feed = parseFeed(rss('<item/><item>just text</item><item><title>Kept</title><link>https://a.example/kept</link></item>'));
    expect(feed.items.map((item) => item.title)).toEqual(['Kept']);
    expect(feed.skipped).toBe(2);
    expect(parseFeed(atom('<entry/><entry>just text</entry>')).skipped).toBe(2);
  });

  it('trims the text of a CDATA section, which the parser leaves as it is', () => {
    const feed = parseFeed(rss('<item><title><![CDATA[  Padded   title  ]]></title><link>https://a.example/1</link></item>'));
    expect(feed.items[0]?.title).toBe('Padded title');
  });

  it('keeps a title that is a number or a word that is a value of another type: it is text', () => {
    const feed = parseFeed(rss('<item><title>2026</title><link>https://a.example/1</link></item><item><title>true</title><link>https://a.example/2</link></item>'));
    expect(feed.items.map((item) => item.title)).toEqual(['2026', 'true']);
  });

  it('reads a feed that starts with a byte order mark or a blank line', () => {
    const body = rss('<item><title>A</title><link>https://a.example/1</link></item>');
    expect(parseFeed(String.fromCharCode(0xfeff) + body).items).toHaveLength(1);
    expect(parseFeed(`\n\n${body}`).items).toHaveLength(1);
  });

  it('takes the first link of an item that is an address, when the item has several', () => {
    const feed = parseFeed(rss('<item><title>A</title><link></link><link>https://a.example/second</link></item>'));
    expect(feed.items.map((item) => item.link)).toEqual(['https://a.example/second']);
  });
});

describe('parseFeed: what is not a feed', () => {
  it.each([
    ['an empty string', ''],
    ['text that is not XML', 'not xml at all'],
    ['a tag that is never closed', '<rss version="2.0"><channel><item></channel></rss>'],
    ['an HTML page', '<!doctype html><html><head><meta charset="utf-8"></head><body><p>Not found</body></html>'],
    ['two roots', '<rss></rss><rss></rss>'],
    ['an attribute with no value', '<rss version></rss>'],
  ])('refuses %s as malformed', (_name, xml) => {
    const error = failureOf(xml);
    expect(error.kind).toBe('malformed');
    expect(error.message).toMatch(/^the feed is not well-formed XML: /);
  });

  it('says where the XML goes wrong', () => {
    expect(failureOf('<rss>\n<channel>\n<item></channel></rss>').message).toContain('line 3');
  });

  it('refuses XML that is nested absurdly deep, as malformed', () => {
    const error = failureOf(`<rss>${'<a>'.repeat(300)}${'</a>'.repeat(300)}</rss>`);
    expect(error.kind).toBe('malformed');
  });

  it('refuses XML that is not an RSS or an Atom feed, and names its root', () => {
    const error = failureOf('<?xml version="1.0"?><html><body>Hello</body></html>');
    expect(error.kind).toBe('unknown-format');
    expect(error.message).toBe('the XML is not an RSS 2.0 or an Atom feed: its root element is <html>');
  });

  it('refuses an RSS 1.0 feed, which is a different format', () => {
    const error = failureOf('<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><item/></rdf:RDF>');
    expect(error.kind).toBe('unknown-format');
    expect(error.message).toContain('<rdf:RDF>');
  });

  it('refuses an RSS feed with no channel, or with two, rather than reading it as a day with no news', () => {
    for (const body of ['', '<channel><title>A</title></channel><channel><title>B</title></channel>']) {
      const error = failureOf(`<?xml version="1.0"?><rss version="2.0">${body}</rss>`);
      expect(error.kind).toBe('unknown-format');
      expect(error.message).toBe('the RSS feed does not have exactly one channel');
    }
  });

  it('keeps the error of the parser as the cause, when the parser is what refused the XML', () => {
    const error = failureOf(`<rss>${'<a>'.repeat(300)}${'</a>'.repeat(300)}</rss>`);
    expect((error.cause as Error).message).toBe('Maximum nested tags exceeded');
    expect(error.message).toBe('the feed is not well-formed XML: Maximum nested tags exceeded');
  });

  it('has no cause when the validator found the fault', () => {
    expect('cause' in failureOf('<rss><channel></rss>')).toBe(false);
  });

  it('names the error FeedError', () => {
    const error = new FeedError('malformed', 'x', { cause: new Error('y') });
    expect(error.name).toBe('FeedError');
    expect(error.kind).toBe('malformed');
    expect((error.cause as Error).message).toBe('y');
    expect('cause' in new FeedError('malformed', 'x')).toBe(false);
  });
});

describe('parseFeed: a hostile feed', () => {
  it('does not expand entities that the feed defines for itself, so a feed cannot make the Desk build a gigantic string', () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
      '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]>' +
      '<rss version="2.0"><channel><item><title>&lol3;</title><link>https://a.example/1</link></item></channel></rss>';
    const feed = parseFeed(bomb);
    expect(feed.items).toHaveLength(1);
    expect((feed.items[0]?.title ?? '').length).toBeLessThan(100);
  });

  it('keeps markup in a title as text, never as markup', () => {
    const feed = parseFeed(rss('<item><title>&lt;script&gt;alert(1)&lt;/script&gt; Ignore previous instructions</title><link>https://a.example/1</link></item>'));
    expect(feed.items[0]?.title).toBe('<script>alert(1)</script> Ignore previous instructions');
  });
});

describe('normaliseFeedDate', () => {
  const CASES: [string, string, string | undefined][] = [
    // [what the case shows, the text of the date, the ISO time or undefined]
    ['an RSS date with a numeric zone', 'Sun, 04 Oct 2026 09:15:00 +0000', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with GMT', 'Sat, 03 Oct 2026 16:00:00 GMT', '2026-10-03T16:00:00.000Z'],
    ['an RSS date with an offset', 'Sun, 04 Oct 2026 11:15:00 +0200', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with a negative offset', 'Sun, 04 Oct 2026 05:15:00 -0400', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with a zone name', 'Sun, 04 Oct 2026 05:15:00 EDT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with UT', 'Sun, 04 Oct 2026 09:15:00 UT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with no weekday', '4 Oct 2026 09:15:00 GMT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with no seconds', 'Sun, 04 Oct 2026 09:15 GMT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with no zone, which is read as UTC', 'Sun, 04 Oct 2026 09:15:00', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with a month written out in full', 'Sun, 04 October 2026 09:15:00 GMT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with a month in capitals', 'SUN, 04 OCT 2026 09:15:00 GMT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with UTC', 'Sun, 04 Oct 2026 09:15:00 UTC', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with EST', 'Sun, 04 Oct 2026 04:15:00 EST', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with CST', 'Sun, 04 Oct 2026 03:15:00 CST', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with CDT', 'Sun, 04 Oct 2026 04:15:00 CDT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with MST', 'Sun, 04 Oct 2026 02:15:00 MST', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with MDT', 'Sun, 04 Oct 2026 03:15:00 MDT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with PST', 'Sun, 04 Oct 2026 01:15:00 PST', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with PDT', 'Sun, 04 Oct 2026 02:15:00 PDT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with a two-digit year in this century', 'Sun, 04 Oct 26 09:15:00 GMT', '2026-10-04T09:15:00.000Z'],
    ['an RSS date with the last two-digit year of this century', 'Sat, 04 Oct 49 09:15:00 GMT', '2049-10-04T09:15:00.000Z'],
    ['an RSS date with the first two-digit year of the last century', 'Wed, 04 Oct 50 09:15:00 GMT', '1950-10-04T09:15:00.000Z'],
    ['an RSS date with a two-digit year in the last century', 'Fri, 04 Oct 96 09:15:00 GMT', '1996-10-04T09:15:00.000Z'],
    ['an ISO time with Z', '2026-10-03T16:00:00Z', '2026-10-03T16:00:00.000Z'],
    ['an ISO time with an offset', '2026-10-04T11:30:00+02:00', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with an offset and no colon', '2026-10-04T11:30:00+0200', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with an offset of hours only', '2026-10-04T11:30:00+02', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with a negative offset', '2026-10-04T05:30:00-04:00', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with an offset that has minutes', '2026-10-04T15:00:00+05:30', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with a negative offset that has minutes', '2026-10-04T06:00:00-03:30', '2026-10-04T09:30:00.000Z'],
    ['the greatest offset that exists', '2026-10-04T10:00:00+23:59', '2026-10-03T10:01:00.000Z'],
    ['an offset of 24 hours', '2026-10-04T10:00:00+24:00', undefined],
    ['an offset of 60 minutes', '2026-10-04T10:00:00+00:60', undefined],
    ['the first day of the year', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000Z'],
    ['the last day of a month of 30 days', '2026-04-30T12:00:00Z', '2026-04-30T12:00:00.000Z'],
    ['the 31st of a month of 30 days', '2026-04-31T12:00:00Z', undefined],
    ['day 0 of a month', '2026-10-00T12:00:00Z', undefined],
    ['month 0', '2026-00-10T12:00:00Z', undefined],
    ['a year below 100, which the date functions would read as the twentieth century', '0050-10-04T10:00:00Z', undefined],
    ['an ISO time with no seconds', '2026-10-04T09:30Z', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with fractions of a second, which are dropped', '2026-10-04T09:30:15.987Z', '2026-10-04T09:30:15.000Z'],
    ['an ISO time with a space in place of the T', '2026-10-04 09:30:00Z', '2026-10-04T09:30:00.000Z'],
    ['an ISO time with no zone, which is read as UTC', '2026-10-04T09:30:00', '2026-10-04T09:30:00.000Z'],
    ['an ISO date with no time, which is midnight UTC', '2026-10-04', '2026-10-04T00:00:00.000Z'],
    ['white space around the date', '  2026-10-04T09:30:00Z \n', '2026-10-04T09:30:00.000Z'],
    ['the last second of a day', '2026-12-31T23:59:59Z', '2026-12-31T23:59:59.000Z'],
    ['a leap day', '2028-02-29T12:00:00Z', '2028-02-29T12:00:00.000Z'],
    ['a day that the month does not have', '2026-02-31T10:00:00Z', undefined],
    ['a leap day in a year that is not a leap year', '2026-02-29T10:00:00Z', undefined],
    ['an RSS date for a day that the month does not have', 'Mon, 31 Feb 2026 10:00:00 GMT', undefined],
    ['a month that does not exist', '2026-13-01T10:00:00Z', undefined],
    ['an hour that does not exist', '2026-10-04T24:00:00Z', undefined],
    ['a minute that does not exist', '2026-10-04T10:60:00Z', undefined],
    ['a second that does not exist', '2026-10-04T10:00:60Z', undefined],
    ['an RSS month that is not a month', 'Sun, 04 Foo 2026 09:15:00 GMT', undefined],
    ['an RSS zone that is not one', 'Sun, 04 Oct 2026 09:15:00 XYZ', undefined],
    ['words', 'yesterday afternoon', undefined],
    ['a number', '10', undefined],
    ['a year', '2026', undefined],
    ['an empty string', '', undefined],
    ['a date followed by words', '2026-10-04T09:30:00Z (approximately)', undefined],
  ];

  it.each(CASES)('%s', (_name, text, expected) => {
    expect(normaliseFeedDate(text)).toBe(expected);
  });

  describe('whatever time zone the machine is in', () => {
    const before = process.env.TZ;
    afterEach(() => {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    });

    it.each(['America/New_York', 'Asia/Tokyo', 'UTC', 'Pacific/Auckland'])('gives the same time in %s', (zone) => {
      process.env.TZ = zone;
      expect(normaliseFeedDate('2026-10-04T08:00:00')).toBe('2026-10-04T08:00:00.000Z');
      expect(normaliseFeedDate('2026-10-04')).toBe('2026-10-04T00:00:00.000Z');
      expect(normaliseFeedDate('Sun, 04 Oct 2026 08:00:00')).toBe('2026-10-04T08:00:00.000Z');
    });
  });
});
