import type { RSSFeedItem, RSSOptions } from '@astrojs/rss';
import { siteDescription } from './copy';
import { SITE_NAME, beatLabel } from './format';
import { articlePath } from './paths';

// The RSS feed: one item for every piece, newest first, with the title, the
// description, the link, the date and the names of the categories. Items carry
// no article text; the article and its receipts are on the site.

/** What the feed needs of a piece. */
interface FeedPiece {
  slug: string;
  data: { title: string; description: string; publishedAt: string; categories: readonly string[] };
}

/** One item for each piece, in the order the pieces are given. A piece is dated at the start of its day, UTC. */
export function rssItems(pieces: readonly FeedPiece[]): RSSFeedItem[] {
  return pieces.map((piece) => ({
    title: piece.data.title,
    description: piece.data.description,
    link: articlePath(piece.slug),
    pubDate: new Date(`${piece.data.publishedAt}T00:00:00Z`),
    categories: piece.data.categories.map(beatLabel),
  }));
}

/** The options for `rss()` for these pieces, on the site at `site`. */
export function feedOptions(pieces: readonly FeedPiece[], site: URL | string): RSSOptions {
  return {
    title: SITE_NAME,
    description: siteDescription(),
    site,
    items: rssItems(pieces),
    customData: '<language>en</language>',
  };
}
