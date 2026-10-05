import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { feedOptions } from '../lib/feed';
import { getPieces } from '../lib/pieces';

// /rss.xml: the feed of every piece, newest first. A production build with no
// pieces writes a valid feed with no items.
export async function GET(context: APIContext) {
  if (context.site === undefined) throw new Error('site/astro.config.mjs must set `site`');
  return rss(feedOptions(await getPieces(), context.site));
}
