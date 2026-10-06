import { DESK_AUTHOR_NAME, PUBLICATION_NAME } from '@robywire/gate';
import type { DeskState } from '@robywire/gate';
import { articlePath, cardPath } from './paths';

// The structured data that goes in the page of an article, as schema.org
// NewsArticle. Pure, so it is tested without building the site.

export interface NewsArticleJsonLd {
  '@context': 'https://schema.org';
  '@type': 'NewsArticle';
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: { '@type': 'Organization'; name: string };
  publisher: { '@type': 'Organization'; name: string; url: string };
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string };
  image: string;
}

export interface JsonLdPiece {
  slug: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  publishedAt: string;
  /** YYYY-MM-DD, present when a correction or a retraction has been recorded for the piece. */
  updatedAt?: string;
}

/**
 * The NewsArticle data for a piece. `dateModified` is the piece's `updatedAt`
 * when it has one; otherwise the time of the latest correction or retraction
 * recorded for it; otherwise the publication date. `siteUrl` is the site's
 * address, such as "https://agenticmediahouse.example".
 */
export function newsArticleJsonLd(piece: JsonLdPiece, corrections: DeskState['corrections'], siteUrl: string): NewsArticleJsonLd {
  const absolute = (path: string): string => new URL(path, siteUrl).href;
  const latest = corrections
    .filter((entry) => entry.slug === piece.slug)
    .map((entry) => entry.at)
    .sort()
    .at(-1);
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: piece.title,
    description: piece.description,
    datePublished: piece.publishedAt,
    dateModified: piece.updatedAt ?? latest ?? piece.publishedAt,
    author: { '@type': 'Organization', name: DESK_AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: PUBLICATION_NAME, url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(articlePath(piece.slug)) },
    image: absolute(cardPath(piece.slug)),
  };
}

/**
 * `data` as JSON that is safe inside a <script> element: every "<" is written
 * as the JSON escape for it, so no text in the data can close the element.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\' + 'u003c');
}
